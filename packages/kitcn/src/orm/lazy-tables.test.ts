import { describe, expect, test } from 'bun:test';
import { aggregateCapability } from './aggregate-index';
import type { AnyColumn } from './builders';
import { id, integer, text } from './builders';
import { resolveOrmCapabilities } from './capabilities';
import { foreignKey } from './constraints';
import { createOrm } from './create-orm';
import { aggregateIndex, index } from './indexes';
import { getTableConfig } from './introspection';
import { createOrmDbLifecycle } from './lifecycle';
import { rlsPolicy } from './rls/policies';
import { defineSchema, requireSchemaRelations } from './schema';
import { convexTable, discriminator } from './table';

const FK_REFERENCE_ERROR =
  /Failed to resolve foreign key reference for '[a-z_]+\.brokenId'/;

const createReader = () =>
  ({
    query: () => ({}),
    system: {},
  }) as any;

const createQueryReader = () => {
  const query: any = {
    withIndex: () => query,
    filter: () => query,
    order: () => query,
    take: async () => [],
    first: async () => null,
    unique: async () => null,
    collect: async () => [],
    paginate: async () => ({ page: [], isDone: true, continueCursor: '' }),
    async *[Symbol.asyncIterator]() {},
  };
  return {
    query: () => query,
    get: async () => null,
    normalizeId: () => null,
    system: {},
  } as any;
};

const createWriter = (inserted: string[]) =>
  ({
    insert: async (table: string) => {
      inserted.push(table);
      return `${table}:1`;
    },
    patch: async () => {},
    replace: async () => {},
    delete: async () => {},
    get: async () => null,
    query: () => ({}),
    normalizeId: () => null,
    system: {},
  }) as any;

const countValidatorReads = <TBuilder extends object>(
  builder: TBuilder,
  reads: string[],
  label: string
): TBuilder => {
  const prototype = Object.getPrototypeOf(builder);
  const descriptor = Object.getOwnPropertyDescriptor(
    prototype,
    'convexValidator'
  ) as PropertyDescriptor;
  Object.defineProperty(builder, 'convexValidator', {
    configurable: true,
    get() {
      reads.push(label);
      return descriptor.get?.call(this);
    },
  });
  return builder;
};

const createTrackedSchema = (prefix: string, fillerCount: number) => {
  const built: string[] = [];
  const validatorReads: string[] = [];
  const tracked = <TColumns extends Record<string, unknown>>(
    name: string,
    columns: TColumns
  ) =>
    convexTable(
      name,
      {
        ...columns,
        name: countValidatorReads(text().notNull(), validatorReads, name),
      },
      (t: any) => {
        built.push(name);
        return [index(`${name}_by_name`).on(t.name)];
      }
    );

  const users = tracked(`${prefix}_users`, {});
  const posts = tracked(`${prefix}_posts`, {
    authorId: id(`${prefix}_users`).notNull(),
  });
  const tables: Record<string, unknown> = {
    [`${prefix}_users`]: users,
    [`${prefix}_posts`]: posts,
  };
  for (let i = 0; i < fillerCount; i++) {
    const name = `${prefix}_filler_${i}`;
    tables[name] = tracked(name, {});
  }

  let helper: any;
  const schema = defineSchema(tables as any).relations((r: any) => {
    helper = r;
    return {
      [`${prefix}_posts`]: {
        author: r.one[`${prefix}_users`]({
          from: r[`${prefix}_posts`].authorId,
          to: r[`${prefix}_users`].id,
        }),
      },
    };
  });

  return { built, validatorReads, helper, schema, users, posts };
};

describe('lazy tables', () => {
  test('convexTable defers extra config until the table is read', () => {
    let calls = 0;
    const users = convexTable(
      'lazy_users',
      { email: text().notNull() },
      (t) => {
        calls++;
        return [index('by_email').on(t.email)];
      }
    );

    expect(calls).toBe(0);
    expect((users.email as any).config.table).toBe(users);
    expect(getTableConfig(users).indexes).toEqual([
      { name: 'by_email', fields: ['email'] },
    ]);
    expect(users.export().indexes).toEqual([
      { indexDescriptor: 'by_email', fields: ['email'] },
    ]);
    expect(calls).toBe(1);
  });

  test('a definition error throws at schema export, the same error every time', () => {
    const broken = convexTable('lazy_broken', { name: text() }, () => [
      index('missing_on') as any,
    ]);
    const schema = defineSchema({ lazy_broken: broken });

    let first: unknown;
    try {
      schema.export();
    } catch (error) {
      first = error;
    }
    expect((first as Error).message).toMatch(/Did you forget to call \.on/);
    expect(() => getTableConfig(broken)).toThrow(first as Error);
  });

  test('eagerTables builds every table when the schema is defined', () => {
    let calls = 0;
    const valid = convexTable('lazy_eager_valid', { name: text() }, (t) => {
      calls++;
      return [index('by_name').on(t.name)];
    });
    defineSchema({ lazy_eager_valid: valid }, { eagerTables: true });
    expect(calls).toBe(1);

    const broken = convexTable('lazy_eager_broken', { name: text() }, () => [
      index('missing_on') as any,
    ]);
    expect(() =>
      defineSchema({ lazy_eager_broken: broken }, { eagerTables: true })
    ).toThrow(/Did you forget to call \.on/);
  });

  test('schema export resolves foreign key references', () => {
    const parent = convexTable('lazy_fk_parent', { name: text() });
    const child = convexTable('lazy_fk_child', {
      parentId: text().references(() => {
        throw new Error('not declared');
      }),
    });

    expect(() =>
      defineSchema({ lazy_fk_parent: parent, lazy_fk_child: child }).export()
    ).toThrow(
      /Failed to resolve foreign key reference for 'lazy_fk_child\.parentId'/
    );
  });

  test('a linked RLS policy applies before the declaring table is built', () => {
    const docs = convexTable('lazy_rls_docs', { value: text().notNull() });
    const policy = rlsPolicy('docs_read', { for: 'select' }).link(docs);
    let ownerBuilt = false;
    const owner = convexTable(
      'lazy_rls_owner',
      { value: text().notNull() },
      () => {
        ownerBuilt = true;
        return [policy];
      }
    );

    expect(getTableConfig(docs).rls).toEqual({
      enabled: true,
      policies: [policy],
    });
    expect(ownerBuilt).toBe(false);

    getTableConfig(owner);
    expect(getTableConfig(docs).rls.policies).toEqual([policy]);
    expect(getTableConfig(owner).rls).toEqual({ enabled: false, policies: [] });
  });

  test('linking an RLS policy inside another table extra config throws', () => {
    const target = convexTable('lazy_rls_target', { value: text() });
    const source = convexTable('lazy_rls_source', { value: text() }, () => [
      rlsPolicy('late', { for: 'select' }).link(target),
    ]);

    expect(() =>
      defineSchema({
        lazy_rls_target: target,
        lazy_rls_source: source,
      }).export()
    ).toThrow(/must be called at module scope/);
  });

  test('relations, createOrm and query builders build no table', () => {
    const { built, validatorReads, helper, schema } = createTrackedSchema(
      'lazy_orm',
      20
    );
    const orm = createOrm({
      schema,
      capabilities: [aggregateCapability()],
    });
    const db = orm.db(createReader()) as any;

    expect(built).toEqual([]);
    expect(validatorReads).toEqual([]);
    expect(
      Object.getOwnPropertyDescriptor(helper, 'lazy_orm_filler_0')?.get
    ).toBeFunction();
    expect(helper.lazy_orm_filler_0).toBe(helper.lazy_orm_filler_0);
    expect(
      Object.getOwnPropertyDescriptor(db.query, 'lazy_orm_filler_0')?.get
    ).toBeFunction();
    expect(db.query.lazy_orm_posts).toBe(db.query.lazy_orm_posts);
    expect(built).toEqual([]);
  });

  test('the validator builds once, on first read', () => {
    const { validatorReads, users } = createTrackedSchema('lazy_validator', 0);

    expect(validatorReads).toEqual([]);
    expect(users.validator).toBe(users.validator);
    expect(validatorReads).toEqual(['lazy_validator_users']);
  });

  test('a first query builds only the table it reads', async () => {
    const { built, validatorReads, schema } = createTrackedSchema(
      'lazy_read',
      20
    );
    const orm = createOrm({
      schema,
      capabilities: [aggregateCapability()],
    });
    const db = orm.db(createQueryReader()) as any;

    await db.query.lazy_read_posts.findFirst({ where: { name: 'x' } });

    expect(built).toEqual(['lazy_read_posts']);
    expect(validatorReads).toEqual([]);
  });

  test('a write builds only the table it writes', async () => {
    const { built, schema } = createTrackedSchema('lazy_write', 20);
    const lifecycle = createOrmDbLifecycle(
      requireSchemaRelations(schema),
      undefined,
      resolveOrmCapabilities([aggregateCapability()])
    );
    expect(built).toEqual([]);

    const inserted: string[] = [];
    const ctx = lifecycle.wrapDB({ db: createWriter(inserted) });
    await ctx.db.insert('lazy_write_posts' as any, {} as any);

    expect(inserted).toEqual(['lazy_write_posts']);
    expect(built).toEqual(['lazy_write_posts']);
  });

  test('createOrm without the aggregate capability still fails closed', () => {
    const metrics = convexTable(
      'lazy_metrics',
      { name: text().notNull(), score: integer() },
      (t) => [aggregateIndex('by_name').on(t.name)]
    );
    const schema = defineSchema({ lazy_metrics: metrics }).relations(
      () => ({})
    );

    expect(() => createOrm({ schema })).toThrow(
      /requires the aggregate capability/
    );
  });
  test.each([
    'patch',
    'replace',
    'delete',
  ] as const)('an id-only %s builds only the table it writes', async (method) => {
    const prefix = `lazy_id_${method}`;
    const { built, schema } = createTrackedSchema(prefix, 5);
    const lifecycle = createOrmDbLifecycle(
      requireSchemaRelations(schema),
      undefined,
      resolveOrmCapabilities([aggregateCapability()])
    );
    const writes: unknown[][] = [];
    const record =
      () =>
      async (...args: unknown[]) => {
        writes.push(args);
      };
    const writer = {
      ...createWriter([]),
      patch: record(),
      replace: record(),
      delete: record(),
      normalizeId: (table: string, id: string) =>
        id.startsWith(`${table}:`) ? id : null,
    };
    const ctx = lifecycle.wrapDB({ db: writer }) as any;
    const id = `${prefix}_posts:1`;

    if (method === 'delete') {
      await ctx.db.delete(id);
    } else {
      await ctx.db[method](id, { name: 'x' });
    }

    expect(built).toEqual([`${prefix}_posts`]);
    expect(writes[0]?.[0]).toBe(`${prefix}_posts`);
  });

  test('stacked ORMs each run their write hooks once', async () => {
    const calls: string[] = [];
    const aggregate = {
      assertAggregateIndexesWritable: async () => {
        calls.push('barrier');
      },
      applyAggregateIndexesForChange: async () => {
        calls.push('aggregate');
      },
      applyRankIndexesForChange: async () => {
        calls.push('rank');
      },
    };
    const capabilities = [{ kind: 'aggregate', value: aggregate }] as any;
    const plain = convexTable('lazy_stack_plain', { name: text().notNull() });
    const metrics = convexTable(
      'lazy_stack_metrics',
      { name: text().notNull() },
      (t) => [aggregateIndex('by_name').on(t.name)]
    );
    const ormA = createOrm({
      schema: defineSchema({ lazy_stack_plain: plain }).relations(() => ({})),
      capabilities,
    });
    const ormB = createOrm({
      schema: defineSchema({ lazy_stack_metrics: metrics }).relations(
        () => ({})
      ),
      capabilities,
    });
    const writer = {
      ...createWriter([]),
      get: async () => ({
        _id: 'lazy_stack_metrics:1',
        _creationTime: 1,
        name: 'a',
      }),
    };

    const stacked = ormB.with(ormA.with({ db: writer } as any)) as any;
    await stacked.db.insert('lazy_stack_metrics', { name: 'a' });
    expect(calls).toEqual(['barrier', 'aggregate']);

    calls.length = 0;
    const rewrapped = ormB.with(ormB.with({ db: writer } as any)) as any;
    await rewrapped.db.insert('lazy_stack_metrics', { name: 'a' });
    expect(calls).toEqual(['barrier', 'aggregate']);
  });

  test('schema export supports self references through table introspection', () => {
    const nodes = convexTable('lazy_fk_nodes', {
      parentId: text().references(
        (): AnyColumn => getTableConfig(nodes).columns.id
      ),
    });
    const schema = defineSchema({ lazy_fk_nodes: nodes });

    expect(() => schema.export()).not.toThrow();
    expect(() => schema.export()).not.toThrow();
    expect(getTableConfig(nodes).foreignKeys).toHaveLength(1);
    const foreignKey = getTableConfig(nodes).foreignKeys[0];
    expect(foreignKey.columns).toEqual(['parentId']);
    expect(foreignKey.foreignTableName).toBe('lazy_fk_nodes');
    expect(foreignKey.foreignColumns).toEqual(['_id']);
  });

  test('a failed foreign key reference keeps failing', () => {
    const parent = convexTable('lazy_fk_retry_parent', { name: text() });
    const child = convexTable('lazy_fk_retry_child', {
      brokenId: text().references(() => {
        throw new Error('not declared');
      }),
      parentId: text().references(() => parent.id, { onDelete: 'cascade' }),
    });
    const schema = defineSchema({
      lazy_fk_retry_parent: parent,
      lazy_fk_retry_child: child,
    });

    expect(() => schema.export()).toThrow(FK_REFERENCE_ERROR);
    expect(() => schema.export()).toThrow(FK_REFERENCE_ERROR);
    expect(() => getTableConfig(child)).toThrow(FK_REFERENCE_ERROR);

    const other = convexTable('lazy_fk_retry_other', {
      brokenId: text().references(() => {
        throw new Error('not declared');
      }),
    });
    expect(() => getTableConfig(other)).toThrow(FK_REFERENCE_ERROR);
    expect(() => other.export()).toThrow(FK_REFERENCE_ERROR);
  });

  test('a column builder shared across tables binds to each table it defines', () => {
    const shared = { tenantId: text().notNull() };
    const a = convexTable('lazy_shared_a', { ...shared }, (t) => [
      index('a_by_tenant').on(t.tenantId),
    ]);
    const b = convexTable('lazy_shared_b', { ...shared }, (t) => [
      index('b_by_tenant').on(t.tenantId),
    ]);

    defineSchema({ lazy_shared_a: a, lazy_shared_b: b }).export();

    expect(getTableConfig(a).indexes).toEqual([
      { name: 'a_by_tenant', fields: ['tenantId'] },
    ]);
    expect(getTableConfig(b).indexes).toEqual([
      { name: 'b_by_tenant', fields: ['tenantId'] },
    ]);
  });

  test('foreign keys retain the referenced table when a column builder is reused', () => {
    const shared = text().notNull().unique();
    const parents = convexTable('lazy_shared_parents', { key: shared });
    const children = convexTable(
      'lazy_shared_children',
      {
        parentKey: text(),
        parentRef: text().references(() => parents.key, {
          onDelete: 'cascade',
        }),
      },
      (t) => [
        foreignKey({
          columns: [t.parentKey],
          foreignColumns: [parents.key],
        }).onDelete('cascade'),
      ]
    );
    const others = convexTable('lazy_shared_others', { otherKey: shared });
    defineSchema({
      lazy_shared_parents: parents,
      lazy_shared_children: children,
      lazy_shared_others: others,
    }).export();

    const foreignKeys = getTableConfig(children).foreignKeys;
    expect(foreignKeys).toHaveLength(2);
    for (const foreignKey of foreignKeys) {
      expect(foreignKey.foreignTableName).toBe('lazy_shared_parents');
      expect(foreignKey.foreignTable).toBe(parents);
      expect(foreignKey.foreignColumns).toEqual(['key']);
      expect(foreignKey.onDelete).toBe('cascade');
    }
  });

  test('reused discriminator fields retain their table ownership', () => {
    const shared = text();
    const a = convexTable(
      'lazy_variant_a',
      { kind: discriminator({ variants: { one: { value: shared } } }) },
      (t) => [index('a_value').on(t.value)]
    );
    const b = convexTable(
      'lazy_variant_b',
      { kind: discriminator({ variants: { one: { value: shared } } }) },
      (t) => [index('b_value').on(t.value)]
    );

    expect(() =>
      defineSchema({ lazy_variant_a: a, lazy_variant_b: b }).export()
    ).not.toThrow();
    expect(getTableConfig(a).indexes).toEqual([
      { name: 'a_value', fields: ['value'] },
    ]);
    expect(getTableConfig(b).indexes).toEqual([
      { name: 'b_value', fields: ['value'] },
    ]);
  });
});
