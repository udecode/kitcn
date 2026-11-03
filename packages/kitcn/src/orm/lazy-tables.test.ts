import { describe, expect, test } from 'bun:test';
import { aggregateCapability } from './aggregate-index';
import { id, integer, text } from './builders';
import { resolveOrmCapabilities } from './capabilities';
import { createOrm } from './create-orm';
import { aggregateIndex, index } from './indexes';
import { getTableConfig } from './introspection';
import { createOrmDbLifecycle } from './lifecycle';
import { rlsPolicy } from './rls/policies';
import { defineSchema, requireSchemaRelations } from './schema';
import { convexTable } from './table';

const createReader = () =>
  ({
    query: () => ({}),
    system: {},
  }) as any;

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

const createTrackedSchema = (prefix: string, fillerCount: number) => {
  const built: string[] = [];
  const tracked = <TColumns extends Record<string, unknown>>(
    name: string,
    columns: TColumns
  ) =>
    convexTable(name, columns, (t: any) => {
      built.push(name);
      return [index(`${name}_by_name`).on(t.name)];
    });

  const users = tracked(`${prefix}_users`, { name: text().notNull() });
  const posts = tracked(`${prefix}_posts`, {
    name: text().notNull(),
    authorId: id(`${prefix}_users`).notNull(),
  });
  const tables: Record<string, unknown> = {
    [`${prefix}_users`]: users,
    [`${prefix}_posts`]: posts,
  };
  for (let i = 0; i < fillerCount; i++) {
    const name = `${prefix}_filler_${i}`;
    tables[name] = tracked(name, { name: text().notNull() });
  }

  const schema = defineSchema(tables as any).relations((r: any) => ({
    [`${prefix}_posts`]: {
      author: r.one[`${prefix}_users`]({
        from: r[`${prefix}_posts`].authorId,
        to: r[`${prefix}_users`].id,
      }),
    },
  }));

  return { built, schema, users, posts };
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
    const { built, schema } = createTrackedSchema('lazy_orm', 20);
    const orm = createOrm({
      schema,
      capabilities: [aggregateCapability()],
    });
    const db = orm.db(createReader()) as any;

    expect(db.query.lazy_orm_posts).toBe(db.query.lazy_orm_posts);
    expect(built).toEqual([]);
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
});
