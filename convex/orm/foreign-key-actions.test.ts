import type {
  GenericDatabaseWriter,
  SchedulableFunctionReference,
} from 'convex/server';
import {
  type CreateOrmOptions,
  convexTable,
  type DatabaseWithMutations,
  defineRelations,
  defineSchema,
  eq,
  extractRelationsConfig,
  foreignKey,
  id,
  index,
  integer,
  rlsPolicy,
  scheduledDeleteFactory,
  scheduledMutationBatchFactory,
  text,
} from 'kitcn/orm';
import { describe, expect, it, vi } from 'vitest';
import { withOrmCtx } from '../setup.testing';

const users = convexTable(
  'fk_action_users',
  {
    slug: text().notNull(),
    deletionTime: integer(),
  },
  (t) => [index('by_slug').on(t.slug)]
);

const membershipsCascade = convexTable(
  'fk_action_memberships_cascade',
  {
    userId: id('fk_action_users').notNull(),
  },
  (t) => [
    index('by_user').on(t.userId),
    foreignKey({ columns: [t.userId], foreignColumns: [users.id] }).onDelete(
      'cascade'
    ),
  ]
);

const membershipsRestrict = convexTable(
  'fk_action_memberships_restrict',
  {
    userId: id('fk_action_users').notNull(),
  },
  (t) => [
    index('by_user').on(t.userId),
    foreignKey({ columns: [t.userId], foreignColumns: [users.id] }).onDelete(
      'restrict'
    ),
  ]
);

const membershipsSetNull = convexTable(
  'fk_action_memberships_null',
  {
    userId: id('fk_action_users'),
  },
  (t) => [
    index('by_user').on(t.userId),
    foreignKey({ columns: [t.userId], foreignColumns: [users.id] }).onDelete(
      'set null'
    ),
  ]
);

const membershipsSetNullLarge = convexTable(
  'fk_action_memberships_null_large',
  {
    userId: id('fk_action_users'),
    payload: text().notNull(),
  },
  (t) => [
    index('by_user').on(t.userId),
    foreignKey({ columns: [t.userId], foreignColumns: [users.id] }).onDelete(
      'set null'
    ),
  ]
);

const membershipsSetDefault = convexTable(
  'fk_action_memberships_default',
  {
    userSlug: text().default('unknown'),
  },
  (t) => [
    index('by_user_slug').on(t.userSlug),
    foreignKey({
      columns: [t.userSlug],
      foreignColumns: [users.slug],
    }).onDelete('set default'),
  ]
);

const membershipsUpdateCascade = convexTable(
  'fk_action_memberships_update_cascade',
  {
    userSlug: text().notNull(),
  },
  (t) => [
    index('by_user_slug').on(t.userSlug),
    foreignKey({
      columns: [t.userSlug],
      foreignColumns: [users.slug],
    }).onUpdate('cascade'),
  ]
);

const membershipsUpdateRestrict = convexTable(
  'fk_action_memberships_update_restrict',
  {
    userSlug: text().notNull(),
  },
  (t) => [
    index('by_user_slug').on(t.userSlug),
    foreignKey({
      columns: [t.userSlug],
      foreignColumns: [users.slug],
    }).onUpdate('restrict'),
  ]
);

const membershipsNoIndex = convexTable(
  'fk_action_memberships_no_index',
  {
    userId: id('fk_action_users').notNull(),
  },
  (t) => [
    foreignKey({ columns: [t.userId], foreignColumns: [users.id] }).onDelete(
      'cascade'
    ),
  ]
);

const rlsParents = convexTable(
  'fk_action_rls_parents',
  {
    slug: text().notNull(),
    owner: text().notNull(),
  },
  (t) => [
    index('by_slug').on(t.slug),
    rlsPolicy('parent_delete', {
      for: 'delete',
      using: (ctx) => eq(t.owner, (ctx as any).viewer),
    }),
    rlsPolicy('parent_update', {
      for: 'update',
      using: (ctx) => eq(t.owner, (ctx as any).viewer),
      withCheck: (ctx) => eq(t.owner, (ctx as any).viewer),
    }),
  ]
);

const rlsDeleteChildren = convexTable(
  'fk_action_rls_children_delete',
  {
    parentSlug: text().notNull(),
    visibility: text().notNull(),
  },
  (t) => [
    index('by_parent').on(t.parentSlug),
    foreignKey({
      columns: [t.parentSlug],
      foreignColumns: [rlsParents.slug],
    }).onDelete('cascade'),
    // Contract test: child delete policy denies this row.
    rlsPolicy('child_delete_policy', {
      for: 'delete',
      using: () => eq(t.visibility, 'allow'),
    }),
  ]
);

const rlsUpdateChildren = convexTable(
  'fk_action_rls_children_update',
  {
    parentSlug: text().notNull(),
    visibility: text().notNull(),
  },
  (t) => [
    index('by_parent').on(t.parentSlug),
    foreignKey({
      columns: [t.parentSlug],
      foreignColumns: [rlsParents.slug],
    }).onUpdate('cascade'),
    // Contract test: child update policy denies this row.
    rlsPolicy('child_update_policy', {
      for: 'update',
      using: () => eq(t.visibility, 'allow'),
      withCheck: () => eq(t.visibility, 'allow'),
    }),
  ]
);

const baseSchemaTables = {
  fk_action_users: users,
  fk_action_memberships_cascade: membershipsCascade,
  fk_action_memberships_restrict: membershipsRestrict,
  fk_action_memberships_null: membershipsSetNull,
  fk_action_memberships_null_large: membershipsSetNullLarge,
  fk_action_memberships_default: membershipsSetDefault,
  fk_action_memberships_update_cascade: membershipsUpdateCascade,
  fk_action_memberships_update_restrict: membershipsUpdateRestrict,
};

const createSchemaArtifacts = (
  options?: Parameters<typeof defineSchema>[1]
) => {
  const tables = { ...baseSchemaTables };
  const schema = defineSchema(tables, options);
  const relations = defineRelations(tables);
  const edges = extractRelationsConfig(relations);
  return { schema, relations, edges };
};

const { schema, relations, edges } = createSchemaArtifacts();
const {
  schema: cappedSchema,
  relations: cappedRelations,
  edges: cappedEdges,
} = createSchemaArtifacts({
  defaults: { mutationBatchSize: 1, mutationMaxRows: 2 },
});
const {
  schema: relaxedCapSchema,
  relations: relaxedCapRelations,
  edges: relaxedCapEdges,
} = createSchemaArtifacts({
  defaults: { mutationBatchSize: 1, mutationMaxRows: 5 },
});
const {
  schema: asyncCappedSchema,
  relations: asyncCappedRelations,
  edges: asyncCappedEdges,
} = createSchemaArtifacts({
  defaults: {
    mutationBatchSize: 1,
    mutationMaxRows: 2,
    mutationExecutionMode: 'async',
  },
});
const {
  schema: routedBatchSchema,
  relations: routedBatchRelations,
  edges: routedBatchEdges,
} = createSchemaArtifacts({
  defaults: {
    mutationBatchSize: 1,
    mutationLeafBatchSize: 3,
    mutationMaxRows: 2,
    mutationExecutionMode: 'async',
  } as any,
});
const {
  schema: byteBudgetSchema,
  relations: byteBudgetRelations,
  edges: byteBudgetEdges,
} = createSchemaArtifacts({
  defaults: {
    mutationBatchSize: 10,
    mutationLeafBatchSize: 10,
    mutationMaxRows: 100,
    mutationExecutionMode: 'async',
    mutationMaxBytesPerBatch: 2500,
  } as any,
});
const {
  schema: scheduleCapSchema,
  relations: scheduleCapRelations,
  edges: scheduleCapEdges,
} = createSchemaArtifacts({
  defaults: {
    mutationBatchSize: 1,
    mutationLeafBatchSize: 1,
    mutationMaxRows: 100,
    mutationExecutionMode: 'async',
    mutationScheduleCallCap: 1,
  } as any,
});

const withCtx = async <T>(
  fn: (ctx: {
    orm: DatabaseWithMutations<typeof relations>;
    db: GenericDatabaseWriter<any>;
  }) => Promise<T>,
  options?: CreateOrmOptions
) =>
  withOrmCtx(
    schema,
    relations,
    async ({ orm, db }) => fn({ orm, db }),
    options
  );

const withCappedCtx = async <T>(
  fn: (ctx: {
    orm: DatabaseWithMutations<typeof cappedRelations>;
    db: GenericDatabaseWriter<any>;
  }) => Promise<T>,
  options?: CreateOrmOptions
) =>
  withOrmCtx(
    cappedSchema,
    cappedRelations,
    async ({ orm, db }) => fn({ orm, db }),
    options
  );

const withRelaxedCapCtx = async <T>(
  fn: (ctx: {
    orm: DatabaseWithMutations<typeof relaxedCapRelations>;
    db: GenericDatabaseWriter<any>;
  }) => Promise<T>,
  options?: CreateOrmOptions
) =>
  withOrmCtx(
    relaxedCapSchema,
    relaxedCapRelations,
    async ({ orm, db }) => fn({ orm, db }),
    options
  );

const withAsyncCappedCtx = async <T>(
  fn: (ctx: {
    orm: DatabaseWithMutations<typeof asyncCappedRelations>;
    db: GenericDatabaseWriter<any>;
  }) => Promise<T>,
  options?: CreateOrmOptions
) =>
  withOrmCtx(
    asyncCappedSchema,
    asyncCappedRelations,
    async ({ orm, db }) => fn({ orm, db }),
    options
  );

const withRoutedBatchCtx = async <T>(
  fn: (ctx: {
    orm: DatabaseWithMutations<typeof routedBatchRelations>;
    db: GenericDatabaseWriter<any>;
  }) => Promise<T>,
  options?: CreateOrmOptions
) =>
  withOrmCtx(
    routedBatchSchema,
    routedBatchRelations,
    async ({ orm, db }) => fn({ orm, db }),
    options
  );

const withByteBudgetCtx = async <T>(
  fn: (ctx: {
    orm: DatabaseWithMutations<typeof byteBudgetRelations>;
    db: GenericDatabaseWriter<any>;
  }) => Promise<T>,
  options?: CreateOrmOptions
) =>
  withOrmCtx(
    byteBudgetSchema,
    byteBudgetRelations,
    async ({ orm, db }) => fn({ orm, db }),
    options
  );

const withScheduleCapCtx = async <T>(
  fn: (ctx: {
    orm: DatabaseWithMutations<typeof scheduleCapRelations>;
    db: GenericDatabaseWriter<any>;
  }) => Promise<T>,
  options?: CreateOrmOptions
) =>
  withOrmCtx(
    scheduleCapSchema,
    scheduleCapRelations,
    async ({ orm, db }) => fn({ orm, db }),
    options
  );

const rlsSchemaTables = {
  ...baseSchemaTables,
  fk_action_rls_parents: rlsParents,
  fk_action_rls_children_delete: rlsDeleteChildren,
  fk_action_rls_children_update: rlsUpdateChildren,
};
const rlsSchema = defineSchema(rlsSchemaTables);
const rlsRelations = defineRelations(rlsSchemaTables);

const withRlsCtx = async <T>(
  fn: (ctx: {
    orm: DatabaseWithMutations<typeof rlsRelations>;
    db: GenericDatabaseWriter<any>;
  }) => Promise<T>,
  options?: CreateOrmOptions
) =>
  withOrmCtx(
    rlsSchema,
    rlsRelations,
    async ({ orm, db }) => fn({ orm, db }),
    options
  );

const asAnyId = (id: unknown) => id as any;

describe('foreign key actions', () => {
  it('cascades deletes', async () =>
    withCtx(async ({ orm, db }) => {
      const [user] = await orm
        .insert(users)
        .values({ slug: 'ada' })
        .returning();

      const [member] = await orm
        .insert(membershipsCascade)
        .values({ userId: asAnyId(user.id) })
        .returning();

      await orm
        .delete(users)
        .where(eq(users.id, asAnyId(user.id)))
        .execute();

      expect(await db.get(asAnyId(member.id))).toBeNull();
    }));

  it('restricts deletes', async () =>
    withCtx(async ({ orm }) => {
      const [user] = await orm
        .insert(users)
        .values({ slug: 'ada' })
        .returning();

      await orm
        .insert(membershipsRestrict)
        .values({ userId: asAnyId(user.id) })
        .returning();

      await expect(
        orm
          .delete(users)
          .where(eq(users.id, asAnyId(user.id)))
          .execute()
      ).rejects.toThrow(/restrict/i);
    }));

  it('sets null on delete', async () =>
    withCtx(async ({ orm, db }) => {
      const [user] = await orm
        .insert(users)
        .values({ slug: 'ada' })
        .returning();

      const [member] = await orm
        .insert(membershipsSetNull)
        .values({ userId: asAnyId(user.id) })
        .returning();

      await orm
        .delete(users)
        .where(eq(users.id, asAnyId(user.id)))
        .execute();

      const updated = await db.get(asAnyId(member.id));
      expect(updated?.userId ?? null).toBeNull();
    }));

  it('sets default on delete', async () =>
    withCtx(async ({ orm, db }) => {
      const [user] = await orm
        .insert(users)
        .values({ slug: 'ada' })
        .returning();

      const [member] = await orm
        .insert(membershipsSetDefault)
        .values({ userSlug: 'ada' })
        .returning();

      await orm
        .delete(users)
        .where(eq(users.id, asAnyId(user.id)))
        .execute();

      const updated = await db.get(asAnyId(member.id));
      expect(updated?.userSlug).toBe('unknown');
    }));

  it('cascades updates', async () =>
    withCtx(async ({ orm, db }) => {
      const [user] = await orm
        .insert(users)
        .values({ slug: 'ada' })
        .returning();

      const [member] = await orm
        .insert(membershipsUpdateCascade)
        .values({ userSlug: 'ada' })
        .returning();

      await orm
        .update(users)
        .set({ slug: 'ada-lovelace' })
        .where(eq(users.id, asAnyId(user.id)))
        .execute();

      const updated = await db.get(asAnyId(member.id));
      expect(updated?.userSlug).toBe('ada-lovelace');
    }));

  it('enforces RLS on root delete before applying cascade fan-out', async () =>
    withRlsCtx(
      async ({ orm, db }) => {
        const parentId = await db.insert('fk_action_rls_parents', {
          slug: 'root-a',
          owner: 'owner-a',
        });
        const childId = await db.insert('fk_action_rls_children_delete', {
          parentSlug: 'root-a',
          visibility: 'deny',
        });

        await orm
          .delete(rlsParents)
          .where(eq(rlsParents.id, parentId))
          .execute();

        const parent = await db.get(parentId);
        const child = await db.get(childId);
        expect(parent).not.toBeNull();
        expect(child).not.toBeNull();
      },
      { rls: { ctx: { viewer: 'owner-b' } } as any }
    ));

  it('applies cascade delete fan-out even when child delete RLS policy denies', async () =>
    withRlsCtx(
      async ({ orm, db }) => {
        const parentId = await db.insert('fk_action_rls_parents', {
          slug: 'root-a',
          owner: 'owner-a',
        });
        const childId = await db.insert('fk_action_rls_children_delete', {
          parentSlug: 'root-a',
          visibility: 'deny',
        });

        await orm
          .delete(rlsParents)
          .where(eq(rlsParents.id, parentId))
          .execute();

        const child = await db.get(childId);
        expect(child).toBeNull();
      },
      { rls: { ctx: { viewer: 'owner-a' } } as any }
    ));

  it('applies cascade update fan-out even when child update RLS policy denies', async () =>
    withRlsCtx(
      async ({ orm, db }) => {
        const parentId = await db.insert('fk_action_rls_parents', {
          slug: 'root-a',
          owner: 'owner-a',
        });
        const childId = await db.insert('fk_action_rls_children_update', {
          parentSlug: 'root-a',
          visibility: 'deny',
        });

        await orm
          .update(rlsParents)
          .set({ slug: 'root-b' })
          .where(eq(rlsParents.id, parentId))
          .execute();

        const child = await db.get(childId);
        expect(child?.parentSlug).toBe('root-b');
      },
      { rls: { ctx: { viewer: 'owner-a' } } as any }
    ));

  it('restricts updates', async () =>
    withCtx(async ({ orm }) => {
      const [user] = await orm
        .insert(users)
        .values({ slug: 'ada' })
        .returning();

      await orm
        .insert(membershipsUpdateRestrict)
        .values({ userSlug: 'ada' })
        .returning();

      await expect(
        orm
          .update(users)
          .set({ slug: 'ada-lovelace' })
          .where(eq(users.id, asAnyId(user.id)))
          .execute()
      ).rejects.toThrow(/restrict/i);
    }));

  it('requires indexes for cascading actions', async () => {
    const schemaWithNoIndex = defineSchema({
      ...baseSchemaTables,
      fk_action_memberships_no_index: membershipsNoIndex,
    });
    const relationsWithNoIndex = defineRelations({
      ...baseSchemaTables,
      fk_action_memberships_no_index: membershipsNoIndex,
    });
    const edgesWithNoIndex = extractRelationsConfig(relationsWithNoIndex);

    await withOrmCtx(
      schemaWithNoIndex,
      relationsWithNoIndex,
      async ({ orm }) => {
        const [user] = await orm
          .insert(users)
          .values({ slug: 'ada' })
          .returning();

        await orm
          .insert(membershipsNoIndex)
          .values({ userId: asAnyId(user.id) })
          .returning();

        await expect(
          orm
            .delete(users)
            .where(eq(users.id, asAnyId(user.id)))
            .execute()
        ).rejects.toThrow(/index/i);
      }
    );
  });

  it('fails fast when cascade delete exceeds mutationMaxRows', async () =>
    withCappedCtx(async ({ orm }) => {
      const [user] = await orm
        .insert(users)
        .values({ slug: 'ada' })
        .returning();

      await orm
        .insert(membershipsCascade)
        .values([
          { userId: asAnyId(user.id) },
          { userId: asAnyId(user.id) },
          { userId: asAnyId(user.id) },
        ]);

      await expect(
        orm
          .delete(users)
          .where(eq(users.id, asAnyId(user.id)))
          .execute()
      ).rejects.toThrow(/mutationMaxRows|matched more than|exceed/i);
    }));

  it('fails fast when cascade update exceeds mutationMaxRows', async () =>
    withCappedCtx(async ({ orm }) => {
      const [user] = await orm
        .insert(users)
        .values({ slug: 'ada' })
        .returning();

      await orm
        .insert(membershipsUpdateCascade)
        .values([
          { userSlug: 'ada' },
          { userSlug: 'ada' },
          { userSlug: 'ada' },
        ]);

      await expect(
        orm
          .update(users)
          .set({ slug: 'ada-lovelace' })
          .where(eq(users.id, asAnyId(user.id)))
          .execute()
      ).rejects.toThrow(/mutationMaxRows|matched more than|exceed/i);
    }));

  it('allows larger cascade fan-out when mutationMaxRows is increased', async () =>
    withRelaxedCapCtx(async ({ orm, db }) => {
      const [user] = await orm
        .insert(users)
        .values({ slug: 'ada' })
        .returning();

      await orm
        .insert(membershipsCascade)
        .values([
          { userId: asAnyId(user.id) },
          { userId: asAnyId(user.id) },
          { userId: asAnyId(user.id) },
        ]);

      await orm
        .delete(users)
        .where(eq(users.id, asAnyId(user.id)))
        .execute();

      const remaining = await db
        .query('fk_action_memberships_cascade')
        .withIndex('by_user', (q) => q.eq('userId', asAnyId(user.id)))
        .collect();
      expect(remaining).toHaveLength(0);
    }));

  it('async mode batches cascade delete fan-out beyond mutationMaxRows', async () => {
    const queue: any[] = [];
    const scheduler = {
      runAfter: vi.fn(async (_delay: number, _ref: any, args: any) => {
        queue.push(args);
        return 'scheduled';
      }),
      runAt: vi.fn(async () => 'scheduled'),
      cancel: vi.fn(async () => undefined),
    };
    const scheduledMutationBatch = {} as SchedulableFunctionReference;
    const worker = scheduledMutationBatchFactory(
      routedBatchRelations,
      routedBatchEdges,
      scheduledMutationBatch
    );

    await withRoutedBatchCtx(
      async ({ orm, db }) => {
        const [user] = await orm
          .insert(users)
          .values({ slug: 'ada' })
          .returning();

        await orm
          .insert(membershipsCascade)
          .values([
            { userId: asAnyId(user.id) },
            { userId: asAnyId(user.id) },
            { userId: asAnyId(user.id) },
          ]);

        await orm
          .delete(users)
          .where(eq(users.id, asAnyId(user.id)))
          .execute();

        while (queue.length > 0) {
          const args = queue.shift();
          await worker({ db, scheduler: scheduler as any }, args);
        }

        expect(await db.get(asAnyId(user.id))).toBeNull();
        const remaining = await db
          .query('fk_action_memberships_cascade')
          .withIndex('by_user', (q) => q.eq('userId', asAnyId(user.id)))
          .collect();
        expect(remaining).toHaveLength(0);
      },
      { scheduler: scheduler as any, scheduledMutationBatch }
    );
  });

  it('async mode batches cascade update fan-out beyond mutationMaxRows', async () => {
    const queue: any[] = [];
    const scheduler = {
      runAfter: vi.fn(async (_delay: number, _ref: any, args: any) => {
        queue.push(args);
        return 'scheduled';
      }),
      runAt: vi.fn(async () => 'scheduled'),
      cancel: vi.fn(async () => undefined),
    };
    const scheduledMutationBatch = {} as SchedulableFunctionReference;
    const worker = scheduledMutationBatchFactory(
      routedBatchRelations,
      routedBatchEdges,
      scheduledMutationBatch
    );

    await withRoutedBatchCtx(
      async ({ orm, db }) => {
        const [user] = await orm
          .insert(users)
          .values({ slug: 'ada' })
          .returning();

        await orm
          .insert(membershipsUpdateCascade)
          .values([
            { userSlug: 'ada' },
            { userSlug: 'ada' },
            { userSlug: 'ada' },
          ]);

        await orm
          .update(users)
          .set({ slug: 'ada-lovelace' })
          .where(eq(users.id, asAnyId(user.id)))
          .execute();

        while (queue.length > 0) {
          const args = queue.shift();
          await worker({ db, scheduler: scheduler as any }, args);
        }

        const updated = await db
          .query('fk_action_memberships_update_cascade')
          .withIndex('by_user_slug', (q) => q.eq('userSlug', 'ada-lovelace'))
          .collect();
        expect(updated).toHaveLength(3);
      },
      { scheduler: scheduler as any, scheduledMutationBatch }
    );
  });

  it('keeps re-query continuation for set null actions', async () => {
    const queue: any[] = [];
    const scheduler = {
      runAfter: vi.fn(async (_delay: number, _ref: any, args: any) => {
        queue.push(args);
        return 'scheduled';
      }),
      runAt: vi.fn(async () => 'scheduled'),
      cancel: vi.fn(async () => undefined),
    };
    const scheduledMutationBatch = {} as SchedulableFunctionReference;
    const worker = scheduledMutationBatchFactory(
      routedBatchRelations,
      routedBatchEdges,
      scheduledMutationBatch
    );

    await withRoutedBatchCtx(
      async ({ orm, db }) => {
        const [user] = await orm
          .insert(users)
          .values({ slug: 'ada' })
          .returning();

        await orm
          .insert(membershipsSetNull)
          .values([
            { userId: asAnyId(user.id) },
            { userId: asAnyId(user.id) },
            { userId: asAnyId(user.id) },
            { userId: asAnyId(user.id) },
            { userId: asAnyId(user.id) },
          ]);

        await orm
          .delete(users)
          .where(eq(users.id, asAnyId(user.id)))
          .execute();

        const firstContinuation = queue.shift();
        expect(firstContinuation).toBeDefined();
        expect(firstContinuation.workType).toBe('cascade-delete');
        expect(firstContinuation.foreignAction).toBe('set null');
        expect(firstContinuation.cursor).toBeNull();
        await worker({ db, scheduler: scheduler as any }, firstContinuation);
        expect(queue).toHaveLength(0);
      },
      { scheduler: scheduler as any, scheduledMutationBatch }
    );
  });

  it('keeps re-query continuation for recursive hard cascade deletes', async () => {
    const queue: any[] = [];
    const scheduler = {
      runAfter: vi.fn(async (_delay: number, _ref: any, args: any) => {
        queue.push(args);
        return 'scheduled';
      }),
      runAt: vi.fn(async () => 'scheduled'),
      cancel: vi.fn(async () => undefined),
    };
    const scheduledMutationBatch = {} as SchedulableFunctionReference;
    const worker = scheduledMutationBatchFactory(
      asyncCappedRelations,
      asyncCappedEdges,
      scheduledMutationBatch
    );

    await withAsyncCappedCtx(
      async ({ orm, db }) => {
        const [user] = await orm
          .insert(users)
          .values({ slug: 'ada' })
          .returning();

        await orm
          .insert(membershipsCascade)
          .values([
            { userId: asAnyId(user.id) },
            { userId: asAnyId(user.id) },
            { userId: asAnyId(user.id) },
            { userId: asAnyId(user.id) },
          ]);

        await orm
          .delete(users)
          .where(eq(users.id, asAnyId(user.id)))
          .execute();

        const firstContinuation = queue.shift();
        expect(firstContinuation).toBeDefined();
        await worker({ db, scheduler: scheduler as any }, firstContinuation);

        const secondContinuation = queue.shift();
        expect(secondContinuation).toBeDefined();
        expect(secondContinuation.workType).toBe('cascade-delete');
        expect(secondContinuation.foreignAction).toBe('cascade');
        expect(secondContinuation.cursor).toBeNull();
      },
      { scheduler: scheduler as any, scheduledMutationBatch }
    );
  });

  it('uses wider async batch for non-recursive set null fan-out', async () => {
    const queue: any[] = [];
    const scheduler = {
      runAfter: vi.fn(async (_delay: number, _ref: any, args: any) => {
        queue.push(args);
        return 'scheduled';
      }),
      runAt: vi.fn(async () => 'scheduled'),
      cancel: vi.fn(async () => undefined),
    };
    const scheduledMutationBatch = {} as SchedulableFunctionReference;

    await withRoutedBatchCtx(
      async ({ orm, db }) => {
        const [user] = await orm
          .insert(users)
          .values({ slug: 'ada' })
          .returning();

        await orm
          .insert(membershipsSetNull)
          .values([
            { userId: asAnyId(user.id) },
            { userId: asAnyId(user.id) },
            { userId: asAnyId(user.id) },
            { userId: asAnyId(user.id) },
          ]);

        await orm
          .delete(users)
          .where(eq(users.id, asAnyId(user.id)))
          .execute();

        const remainingWithUserId = await db
          .query('fk_action_memberships_null')
          .withIndex('by_user', (q) => q.eq('userId', asAnyId(user.id)))
          .collect();
        expect(remainingWithUserId).toHaveLength(1);
        expect(queue.length).toBeGreaterThan(0);
      },
      { scheduler: scheduler as any, scheduledMutationBatch }
    );
  });

  it('applies byte budget before row-count budget for async non-recursive fan-out', async () => {
    const queue: any[] = [];
    const scheduler = {
      runAfter: vi.fn(async (_delay: number, _ref: any, args: any) => {
        queue.push(args);
        return 'scheduled';
      }),
      runAt: vi.fn(async () => 'scheduled'),
      cancel: vi.fn(async () => undefined),
    };
    const scheduledMutationBatch = {} as SchedulableFunctionReference;

    await withByteBudgetCtx(
      async ({ orm, db }) => {
        const [user] = await orm
          .insert(users)
          .values({ slug: 'byte-budget-user' })
          .returning();

        const payload = 'x'.repeat(3000);
        await orm.insert(membershipsSetNullLarge).values([
          { userId: asAnyId(user.id), payload },
          { userId: asAnyId(user.id), payload },
          { userId: asAnyId(user.id), payload },
        ]);

        await orm
          .delete(users)
          .where(eq(users.id, asAnyId(user.id)))
          .execute();

        const remainingWithUserId = await db
          .query('fk_action_memberships_null_large')
          .withIndex('by_user', (q) => q.eq('userId', asAnyId(user.id)))
          .collect();

        expect(remainingWithUserId).toHaveLength(2);
        expect(queue.length).toBeGreaterThan(0);
      },
      { scheduler: scheduler as any, scheduledMutationBatch }
    );
  });

  it('enforces mutationScheduleCallCap for async cascade scheduling', async () => {
    const scheduler = {
      runAfter: vi.fn(async () => 'scheduled'),
      runAt: vi.fn(async () => 'scheduled'),
      cancel: vi.fn(async () => undefined),
    };
    const scheduledMutationBatch = {} as SchedulableFunctionReference;

    await expect(
      withScheduleCapCtx(
        async ({ orm }) => {
          const [user] = await orm
            .insert(users)
            .values({ slug: 'cap-user' })
            .returning();

          await orm
            .insert(membershipsSetNull)
            .values([
              { userId: asAnyId(user.id) },
              { userId: asAnyId(user.id) },
            ]);
          await orm.insert(membershipsSetNullLarge).values([
            { userId: asAnyId(user.id), payload: 'a' },
            { userId: asAnyId(user.id), payload: 'b' },
          ]);

          await orm
            .delete(users)
            .where(eq(users.id, asAnyId(user.id)))
            .execute();
        },
        { scheduler: scheduler as any, scheduledMutationBatch }
      )
    ).rejects.toThrow(/mutationScheduleCallCap/i);
  });
});

describe('soft and scheduled deletes', () => {
  it('soft deletes set deletionTime', async () =>
    withCtx(async ({ orm, db }) => {
      const [user] = await orm
        .insert(users)
        .values({ slug: 'ada' })
        .returning();

      await orm
        .delete(users)
        .where(eq(users.id, asAnyId(user.id)))
        .soft()
        .execute();

      const updated = await db.get(asAnyId(user.id));
      expect(updated?.deletionTime).toBeTypeOf('number');
    }));

  it('scheduled deletes enqueue a job with deletionTime token', async () => {
    const scheduler = {
      runAfter: vi.fn(async () => 'scheduled' as any),
      runAt: vi.fn(async () => 'scheduled' as any),
      cancel: vi.fn(async () => undefined),
    };
    const scheduledDelete = {} as SchedulableFunctionReference;

    await withCtx(
      async ({ orm, db }) => {
        const [user] = await orm
          .insert(users)
          .values({ slug: 'ada' })
          .returning();

        await orm
          .delete(users)
          .where(eq(users.id, asAnyId(user.id)))
          .scheduled({ delayMs: 500 })
          .execute();

        const updated = await db.get(asAnyId(user.id));
        expect(updated?.deletionTime).toBeTypeOf('number');
        expect(scheduler.runAfter).toHaveBeenCalledWith(500, scheduledDelete, {
          table: 'fk_action_users',
          id: asAnyId(user.id),
          cascadeMode: 'hard',
          deletionTime: updated?.deletionTime,
        });
      },
      { scheduler, scheduledDelete }
    );
  });

  it('scheduledDelete worker should no-op when deletionTime token mismatches', async () => {
    const scheduler = {
      runAfter: vi.fn(async () => 'scheduled' as any),
      runAt: vi.fn(async () => 'scheduled' as any),
      cancel: vi.fn(async () => undefined),
    };
    const scheduledDelete = {} as SchedulableFunctionReference;
    const scheduledMutationBatch = {} as SchedulableFunctionReference;
    const scheduledDeleteWorker = scheduledDeleteFactory(
      relations,
      edges,
      scheduledMutationBatch
    );

    await withCtx(
      async ({ orm, db }) => {
        const [user] = await orm
          .insert(users)
          .values({ slug: 'ada' })
          .returning();

        await orm
          .delete(users)
          .where(eq(users.id, asAnyId(user.id)))
          .scheduled({ delayMs: 500 })
          .execute();

        const scheduledArgs = (scheduler.runAfter as any).mock.calls[0]?.[2];
        expect(scheduledArgs).toBeDefined();
        expect(scheduledArgs.deletionTime).toBeTypeOf('number');

        await db.patch('fk_action_users', asAnyId(user.id), {
          deletionTime: undefined,
        });
        await scheduledDeleteWorker(
          { db, scheduler: scheduler as any } as any,
          scheduledArgs
        );

        expect(await db.get(asAnyId(user.id))).not.toBeNull();
      },
      { scheduler, scheduledDelete, scheduledMutationBatch }
    );
  });

  it('scheduledDelete worker should run hard delete through async batching', async () => {
    const queue: any[] = [];
    const scheduler = {
      runAfter: vi.fn(async (_delay: number, _ref: any, args: any) => {
        queue.push(args);
        return 'scheduled';
      }),
      runAt: vi.fn(async () => 'scheduled'),
      cancel: vi.fn(async () => undefined),
    };
    const scheduledMutationBatch = {} as SchedulableFunctionReference;
    const scheduledWorker = scheduledMutationBatchFactory(
      asyncCappedRelations,
      asyncCappedEdges,
      scheduledMutationBatch
    );
    const scheduledDeleteWorker = scheduledDeleteFactory(
      asyncCappedRelations,
      asyncCappedEdges,
      scheduledMutationBatch
    );

    await withAsyncCappedCtx(
      async ({ orm, db }) => {
        const [user] = await orm
          .insert(users)
          .values({ slug: 'ada' })
          .returning();

        await orm
          .insert(membershipsCascade)
          .values([
            { userId: asAnyId(user.id) },
            { userId: asAnyId(user.id) },
            { userId: asAnyId(user.id) },
          ]);

        await scheduledDeleteWorker(
          { db, scheduler: scheduler as any } as any,
          {
            table: 'fk_action_users',
            id: asAnyId(user.id),
            cascadeMode: 'hard',
          }
        );

        while (queue.length > 0) {
          const args = queue.shift();
          await scheduledWorker({ db, scheduler: scheduler as any }, args);
        }

        expect(await db.get(asAnyId(user.id))).toBeNull();
        const remaining = await db
          .query('fk_action_memberships_cascade')
          .withIndex('by_user', (q) => q.eq('userId', asAnyId(user.id)))
          .collect();
        expect(remaining).toHaveLength(0);
      },
      {
        scheduler: scheduler as any,
        scheduledMutationBatch,
      }
    );
  });
});
