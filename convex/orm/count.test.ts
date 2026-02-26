import {
  aggregateStorageTables,
  TableAggregate,
} from 'better-convex/aggregate';
import {
  aggregateIndex,
  convexTable,
  createOrm,
  defineRelations,
  defineSchema,
  index,
  integer,
  text,
} from 'better-convex/orm';
import { it as baseIt, describe, expect, test, vi } from 'vitest';
import baseSchema, { relations as baseRelations } from '../schema';
import { convexTest, runCtx, type TestCtx } from '../setup.testing';

const it = baseIt.extend<{ ctx: TestCtx }>({
  ctx: async ({}, use) => {
    const t = convexTest(baseSchema);
    await t.run(async (baseCtx) => {
      const ctx = await runCtx(baseCtx);
      await use(ctx);
    });
  },
});

const schedulerStub = {
  runAfter: vi.fn(async () => undefined),
};

const passthroughInternalMutation = ((definition: unknown) =>
  definition) as never;

const buildCountIndexedFixtures = (options?: {
  includeOrgStatusIndex?: boolean;
  defaults?: {
    aggregateCartesianMaxKeys?: number;
    aggregateWorkBudget?: number;
  };
}) => {
  const includeOrgStatusIndex = options?.includeOrgStatusIndex ?? true;

  const countUsers = convexTable(
    'countUsers',
    {
      orgId: text().notNull(),
      status: text(),
      tier: text(),
      score: integer(),
    },
    (t) => [
      index('by_org').on(t.orgId),
      ...(includeOrgStatusIndex
        ? [aggregateIndex('by_org_status').on(t.orgId, t.status)]
        : []),
      aggregateIndex('by_org_tier').on(t.orgId, t.tier),
      aggregateIndex('by_org_score').on(t.orgId, t.score),
    ]
  );

  const countPosts = convexTable(
    'countPosts',
    {
      orgId: text().notNull(),
      title: text().notNull(),
    },
    (t) => [aggregateIndex('by_org').on(t.orgId)]
  );

  const schema = defineSchema(
    { countUsers, countPosts },
    options?.defaults ? { defaults: options.defaults } : undefined
  );
  const relations = defineRelations({ countUsers, countPosts }, (r) => ({
    countUsers: {
      posts: r.many.countPosts({
        from: r.countUsers.orgId,
        to: r.countPosts.orgId,
      }),
    },
    countPosts: {
      user: r.one.countUsers({
        from: r.countPosts.orgId,
        to: r.countUsers.orgId,
      }),
    },
  }));

  return {
    countUsers,
    countPosts,
    schema,
    relations,
  };
};

describe('ORM count()', () => {
  it('returns a lazy QueryPromise-like object', ({ ctx }) => {
    const query = ctx.orm.query.users.count();

    expect(typeof query.then).toBe('function');
    expect(typeof query.catch).toBe('function');
    expect(typeof query.finally).toBe('function');
  });

  it('counts empty and populated tables', async ({ ctx }) => {
    expect(await ctx.orm.query.users.count()).toBe(0);

    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
    });
    await ctx.db.insert('users', {
      name: 'Bob',
      email: 'bob@example.com',
    });

    expect(await ctx.orm.query.users.count()).toBe(2);
  });

  it('throws COUNT_NOT_INDEXED for filtered count without declared aggregateIndex', async ({
    ctx,
  }) => {
    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
      status: 'active',
    });

    await expect(
      (ctx.orm.query.users as any).count({
        where: {
          status: 'active',
        },
      })
    ).rejects.toThrow(/COUNT_NOT_INDEXED/);
  });

  it('uses native unfiltered count path (no collect/take materialization)', async () => {
    const t = convexTest(baseSchema);

    await t.run(async (baseCtx) => {
      await baseCtx.db.insert('users', {
        name: 'Alice',
        email: 'alice@example.com',
      });
      await baseCtx.db.insert('users', {
        name: 'Bob',
        email: 'bob@example.com',
      });

      const callStats = {
        count: 0,
        collect: 0,
        take: 0,
      };

      const originalQuery = baseCtx.db.query.bind(baseCtx.db);
      (baseCtx.db as any).query = ((table: string) => {
        const query = originalQuery(table) as any;
        return new Proxy(query, {
          get(target, property, receiver) {
            const value = Reflect.get(target, property, receiver);
            if (
              typeof value === 'function' &&
              (property === 'count' ||
                property === 'collect' ||
                property === 'take')
            ) {
              return (...args: unknown[]) => {
                callStats[property as keyof typeof callStats] += 1;
                return value.apply(target, args);
              };
            }
            return value;
          },
        });
      }) as any;

      const orm = createOrm({
        schema: baseRelations,
      });
      const db = orm.db(baseCtx);

      const result = await db.query.users.count();

      expect(result).toBe(2);
      expect(callStats.count).toBeGreaterThan(0);
      expect(callStats.collect).toBe(0);
      expect(callStats.take).toBe(0);
    });
  });

  test('aggregate-core parity: unfiltered count matches TableAggregate count', async () => {
    const aggUsers = convexTable(
      'countParityUsers',
      {
        name: text().notNull(),
      },
      (t) => [index('by_name').on(t.name)]
    );

    const localTables = {
      countParityUsers: aggUsers,
      ...aggregateStorageTables,
    };
    const localSchema = defineSchema(localTables, {
      defaults: {
        defaultLimit: 1000,
      },
    });
    const localRelations = defineRelations(localTables);

    const aggregate = new TableAggregate({
      name: 'countParityUsersByName',
      table: 'countParityUsers',
      sortKey: (doc: { name: string }) => doc.name,
    });

    const t = convexTest(localSchema);

    await t.run(async (baseCtx) => {
      const orm = createOrm({ schema: localRelations });
      const ctx = orm.with({ db: baseCtx.db });

      const ids = [] as string[];
      ids.push(
        (await ctx.db.insert('countParityUsers', {
          name: 'Alice',
        })) as unknown as string
      );
      ids.push(
        (await ctx.db.insert('countParityUsers', {
          name: 'Bob',
        })) as unknown as string
      );
      ids.push(
        (await ctx.db.insert('countParityUsers', {
          name: 'Charlie',
        })) as unknown as string
      );

      for (const id of ids) {
        const doc = await ctx.db.get(id as any);
        if (!doc) {
          throw new Error('Inserted doc missing');
        }
        await aggregate.insert(ctx as any, doc as any);
      }

      const ormCount = await ctx.orm.query.countParityUsers.count();
      const aggregateCount = await aggregate.count(ctx as any);

      expect(ormCount).toBe(aggregateCount);
    });
  });
});

describe('ORM count() with aggregateIndex', () => {
  it('throws COUNT_INDEX_BUILDING before backfill is completed', async () => {
    const { schema, relations } = buildCountIndexedFixtures();
    const t = convexTest(schema);

    await t.run(async (baseCtx) => {
      const orm = createOrm({ schema: relations });
      const ctx = orm.with({ db: baseCtx.db });

      await ctx.db.insert('countUsers', {
        orgId: 'org-1',
        status: 'active',
        tier: 'pro',
      });

      await expect(
        ctx.orm.query.countUsers.count({
          where: {
            orgId: 'org-1',
            status: 'active',
          },
        })
      ).rejects.toThrow(/COUNT_INDEX_BUILDING/);
    });
  });

  it('supports count({ where }) after backfill', async () => {
    const { schema, relations } = buildCountIndexedFixtures();
    const t = convexTest(schema);

    await t.run(async (baseCtx) => {
      const ormClient = createOrm({
        schema: relations,
        ormFunctions: {
          scheduledDelete: {} as any,
          scheduledMutationBatch: {} as any,
        },
        internalMutation: passthroughInternalMutation,
      });
      const ctx = ormClient.with({
        db: baseCtx.db,
        scheduler: schedulerStub as any,
      });
      const api = ormClient.api();

      await ctx.db.insert('countUsers', {
        orgId: 'org-1',
        status: 'active',
        tier: 'pro',
        score: 5,
      });
      await ctx.db.insert('countUsers', {
        orgId: 'org-1',
        status: 'active',
        tier: null,
        score: 2,
      });
      await ctx.db.insert('countUsers', {
        orgId: 'org-1',
        status: 'inactive',
        tier: null,
        score: null,
      });

      await (api as any).aggregateBackfill.handler(
        { db: baseCtx.db, scheduler: schedulerStub },
        {}
      );
      for (let i = 0; i < 10; i += 1) {
        const status = await (api as any).aggregateBackfillStatus.handler(
          { db: baseCtx.db, scheduler: schedulerStub },
          {}
        );
        if (status.every((entry: any) => entry.status === 'READY')) {
          break;
        }
        await (api as any).aggregateBackfillChunk.handler(
          { db: baseCtx.db, scheduler: schedulerStub },
          {}
        );
      }

      const wrappedWhere = await ctx.orm.query.countUsers.count({
        where: {
          orgId: 'org-1',
          status: 'active',
        },
      });

      expect(wrappedWhere).toBe(2);

      const inCount = await ctx.orm.query.countUsers.count({
        where: {
          orgId: 'org-1',
          status: { in: ['active', 'inactive'] },
        },
      });

      expect(inCount).toBe(3);

      const nullCount = await ctx.orm.query.countUsers.count({
        where: {
          orgId: 'org-1',
          tier: { isNull: true },
        },
      });

      expect(nullCount).toBe(2);

      const rangeCount = await ctx.orm.query.countUsers.count({
        where: {
          orgId: 'org-1',
          score: { gte: 2, lt: 5 },
        },
      });
      expect(rangeCount).toBe(1);

      const rangeCountInclusive = await ctx.orm.query.countUsers.count({
        where: {
          orgId: 'org-1',
          score: { gt: 1, lte: 5 },
        },
      });
      expect(rangeCountInclusive).toBe(2);
    });
  });

  it('supports index-safe windowed count args (orderBy/take/skip/cursor)', async () => {
    const { schema, relations } = buildCountIndexedFixtures();
    const t = convexTest(schema);

    await t.run(async (baseCtx) => {
      const ormClient = createOrm({
        schema: relations,
        ormFunctions: {
          scheduledDelete: {} as any,
          scheduledMutationBatch: {} as any,
        },
        internalMutation: passthroughInternalMutation,
      });
      const ctx = ormClient.with({
        db: baseCtx.db,
        scheduler: schedulerStub as any,
      });
      const api = ormClient.api();

      await ctx.db.insert('countUsers', {
        orgId: 'org-1',
        status: 'active',
        tier: 'pro',
        score: 5,
      });
      await ctx.db.insert('countUsers', {
        orgId: 'org-1',
        status: 'active',
        tier: null,
        score: 2,
      });
      await ctx.db.insert('countUsers', {
        orgId: 'org-1',
        status: 'inactive',
        tier: null,
        score: null,
      });
      await ctx.db.insert('countUsers', {
        orgId: 'org-1',
        status: 'inactive',
        tier: 'basic',
        score: 7,
      });

      await (api as any).aggregateBackfill.handler(
        { db: baseCtx.db, scheduler: schedulerStub },
        {}
      );
      for (let i = 0; i < 10; i += 1) {
        const status = await (api as any).aggregateBackfillStatus.handler(
          { db: baseCtx.db, scheduler: schedulerStub },
          {}
        );
        if (status.every((entry: any) => entry.status === 'READY')) {
          break;
        }
        await (api as any).aggregateBackfillChunk.handler(
          { db: baseCtx.db, scheduler: schedulerStub },
          {}
        );
      }

      const skippedAndTaken = await ctx.orm.query.countUsers.count({
        where: {
          orgId: 'org-1',
          score: { gte: 0 },
        },
        skip: 1,
        take: 2,
      });
      expect(skippedAndTaken).toBe(2);

      const afterCursorAsc = await ctx.orm.query.countUsers.count({
        where: {
          orgId: 'org-1',
          score: { gte: 0 },
        },
        orderBy: {
          score: 'asc',
        },
        cursor: {
          score: 2,
        },
      });
      expect(afterCursorAsc).toBe(2);

      const afterCursorDescTaken = await ctx.orm.query.countUsers.count({
        where: {
          orgId: 'org-1',
          score: { gte: 0 },
        },
        orderBy: {
          score: 'desc',
        },
        cursor: {
          score: 7,
        },
        take: 1,
      });
      expect(afterCursorDescTaken).toBe(1);

      const allOnlyWindowed = await ctx.orm.query.countUsers.count({
        where: {
          orgId: 'org-1',
          score: { gte: 0 },
        },
        skip: 1,
        take: 1,
        select: {
          _all: true,
        },
      });
      expect(allOnlyWindowed).toEqual({
        _all: 1,
      });
    });
  });

  it('supports safe OR rewrite for finite index-plannable branches', async () => {
    const { schema, relations } = buildCountIndexedFixtures();
    const t = convexTest(schema);

    await t.run(async (baseCtx) => {
      const ormClient = createOrm({
        schema: relations,
        ormFunctions: {
          scheduledDelete: {} as any,
          scheduledMutationBatch: {} as any,
        },
        internalMutation: passthroughInternalMutation,
      });
      const ctx = ormClient.with({
        db: baseCtx.db,
        scheduler: schedulerStub as any,
      });
      const api = ormClient.api();

      await ctx.db.insert('countUsers', {
        orgId: 'org-1',
        status: 'active',
        tier: 'pro',
      });
      await ctx.db.insert('countUsers', {
        orgId: 'org-1',
        status: 'inactive',
        tier: 'pro',
      });
      await ctx.db.insert('countUsers', {
        orgId: 'org-1',
        status: 'paused',
        tier: 'pro',
      });
      await ctx.db.insert('countUsers', {
        orgId: 'org-2',
        status: 'inactive',
        tier: 'basic',
      });

      await (api as any).aggregateBackfill.handler(
        { db: baseCtx.db, scheduler: schedulerStub },
        {}
      );
      for (let i = 0; i < 10; i += 1) {
        const status = await (api as any).aggregateBackfillStatus.handler(
          { db: baseCtx.db, scheduler: schedulerStub },
          {}
        );
        if (status.every((entry: any) => entry.status === 'READY')) {
          break;
        }
        await (api as any).aggregateBackfillChunk.handler(
          { db: baseCtx.db, scheduler: schedulerStub },
          {}
        );
      }

      const rewritten = await ctx.orm.query.countUsers.count({
        where: {
          orgId: 'org-1',
          OR: [{ status: 'active' }, { status: 'inactive' }],
        } as any,
      });
      expect(rewritten).toBe(2);

      const dnfUnion = await ctx.orm.query.countUsers.count({
        where: {
          OR: [
            { orgId: 'org-1', status: 'active' },
            { orgId: 'org-2', status: 'inactive' },
          ],
        } as any,
      });
      expect(dnfUnion).toBe(2);

      await expect(
        ctx.orm.query.countUsers.count({
          where: {
            OR: [
              { orgId: 'org-1', status: 'active' },
              { orgId: 'org-1', score: { gte: 0 } },
            ],
          } as any,
        })
      ).rejects.toThrow(/COUNT_FILTER_UNSUPPORTED/);
    });
  });

  it('throws COUNT_FILTER_UNSUPPORTED for invalid/unsupported windowed count args', async () => {
    const { schema, relations } = buildCountIndexedFixtures();
    const t = convexTest(schema);

    await t.run(async (baseCtx) => {
      const ormClient = createOrm({
        schema: relations,
        ormFunctions: {
          scheduledDelete: {} as any,
          scheduledMutationBatch: {} as any,
        },
        internalMutation: passthroughInternalMutation,
      });
      const ctx = ormClient.with({
        db: baseCtx.db,
        scheduler: schedulerStub as any,
      });
      const api = ormClient.api();

      await (api as any).aggregateBackfill.handler(
        { db: baseCtx.db, scheduler: schedulerStub },
        {}
      );
      for (let i = 0; i < 10; i += 1) {
        const status = await (api as any).aggregateBackfillStatus.handler(
          { db: baseCtx.db, scheduler: schedulerStub },
          {}
        );
        if (status.every((entry: any) => entry.status === 'READY')) {
          break;
        }
        await (api as any).aggregateBackfillChunk.handler(
          { db: baseCtx.db, scheduler: schedulerStub },
          {}
        );
      }

      await expect(
        ctx.orm.query.countUsers.count({
          where: {
            orgId: 'org-1',
            score: { gte: 0 },
          },
          cursor: {
            score: 1,
          } as any,
        })
      ).rejects.toThrow(/COUNT_FILTER_UNSUPPORTED/);

      await expect(
        ctx.orm.query.countUsers.count({
          where: {
            orgId: 'org-1',
            score: { gte: 0 },
          },
          take: 1,
          select: {
            _all: true,
            status: true,
          },
        })
      ).rejects.toThrow(/COUNT_FILTER_UNSUPPORTED/);
    });
  });

  it('throws COUNT_FILTER_UNSUPPORTED for non-indexable operators and relation filters', async () => {
    const { schema, relations } = buildCountIndexedFixtures();
    const t = convexTest(schema);

    await t.run(async (baseCtx) => {
      const orm = createOrm({ schema: relations });
      const ctx = orm.with({ db: baseCtx.db });

      await expect(
        ctx.orm.query.countUsers.count({
          where: {
            orgId: 'org-1',
            status: {
              contains: 'act',
            },
          } as any,
        })
      ).rejects.toThrow(/COUNT_FILTER_UNSUPPORTED/);

      await expect(
        ctx.orm.query.countUsers.count({
          where: {
            posts: {
              orgId: 'org-1',
            },
          } as any,
        })
      ).rejects.toThrow(/COUNT_FILTER_UNSUPPORTED/);

      await expect(
        (ctx.orm.query.countUsers.count as any)({
          where: (_table: any, _ops: any) => undefined,
        })
      ).rejects.toThrow(/COUNT_FILTER_UNSUPPORTED/);
    });
  });

  it('throws COUNT_FILTER_UNSUPPORTED when IN cartesian expansion exceeds cap', async () => {
    const { schema, relations } = buildCountIndexedFixtures();
    const t = convexTest(schema);

    await t.run(async (baseCtx) => {
      const ormClient = createOrm({
        schema: relations,
        ormFunctions: {
          scheduledDelete: {} as any,
          scheduledMutationBatch: {} as any,
        },
        internalMutation: passthroughInternalMutation,
      });
      const ctx = ormClient.with({
        db: baseCtx.db,
        scheduler: schedulerStub as any,
      });
      const api = ormClient.api();

      await (api as any).aggregateBackfill.handler(
        { db: baseCtx.db, scheduler: schedulerStub },
        {}
      );
      for (let i = 0; i < 10; i += 1) {
        const status = await (api as any).aggregateBackfillStatus.handler(
          { db: baseCtx.db, scheduler: schedulerStub },
          {}
        );
        if (status.every((entry: any) => entry.status === 'READY')) {
          break;
        }
        await (api as any).aggregateBackfillChunk.handler(
          { db: baseCtx.db, scheduler: schedulerStub },
          {}
        );
      }

      const orgIds = Array.from({ length: 80 }, (_, index) => `org-${index}`);
      const statuses = Array.from(
        { length: 80 },
        (_, index) => `status-${index}`
      );

      await expect(
        ctx.orm.query.countUsers.count({
          where: {
            orgId: { in: orgIds },
            status: { in: statuses },
          },
        })
      ).rejects.toThrow(/COUNT_FILTER_UNSUPPORTED/);

      await expect(
        ctx.orm.query.countUsers.count({
          where: {
            orgId: { in: orgIds },
            status: { in: statuses },
          },
        })
      ).rejects.toThrow(/aggregateCartesianMaxKeys/);
    });
  });

  it('throws COUNT_FILTER_UNSUPPORTED when OR rewrite expansion exceeds branch/key/work budgets', async () => {
    const { schema, relations } = buildCountIndexedFixtures();
    const t = convexTest(schema);

    await t.run(async (baseCtx) => {
      const ormClient = createOrm({
        schema: relations,
        ormFunctions: {
          scheduledDelete: {} as any,
          scheduledMutationBatch: {} as any,
        },
        internalMutation: passthroughInternalMutation,
      });
      const ctx = ormClient.with({
        db: baseCtx.db,
        scheduler: schedulerStub as any,
      });
      const api = ormClient.api();

      await (api as any).aggregateBackfill.handler(
        { db: baseCtx.db, scheduler: schedulerStub },
        {}
      );
      for (let i = 0; i < 10; i += 1) {
        const status = await (api as any).aggregateBackfillStatus.handler(
          { db: baseCtx.db, scheduler: schedulerStub },
          {}
        );
        if (status.every((entry: any) => entry.status === 'READY')) {
          break;
        }
        await (api as any).aggregateBackfillChunk.handler(
          { db: baseCtx.db, scheduler: schedulerStub },
          {}
        );
      }

      const branches = Array.from({ length: 5000 }, (_, index) => ({
        orgId: `org-${index}`,
        status: 'active',
      }));

      await expect(
        ctx.orm.query.countUsers.count({
          where: {
            OR: branches,
          } as any,
        })
      ).rejects.toThrow(/COUNT_FILTER_UNSUPPORTED/);

      await expect(
        ctx.orm.query.countUsers.count({
          where: {
            OR: branches,
          } as any,
        })
      ).rejects.toThrow(/aggregateCartesianMaxKeys|aggregateWorkBudget/);
    });
  });

  it('keeps buckets updated across insert/update/delete after READY', async () => {
    const { schema, relations } = buildCountIndexedFixtures();
    const t = convexTest(schema);

    await t.run(async (baseCtx) => {
      const ormClient = createOrm({
        schema: relations,
        ormFunctions: {
          scheduledDelete: {} as any,
          scheduledMutationBatch: {} as any,
        },
        internalMutation: passthroughInternalMutation,
      });
      const ctx = ormClient.with({
        db: baseCtx.db,
        scheduler: schedulerStub as any,
      });
      const api = ormClient.api();

      await (api as any).aggregateBackfill.handler(
        { db: baseCtx.db, scheduler: schedulerStub },
        {}
      );
      await (api as any).aggregateBackfillChunk.handler(
        { db: baseCtx.db, scheduler: schedulerStub },
        {}
      );

      const id = await ctx.db.insert('countUsers', {
        orgId: 'org-1',
        status: 'active',
        tier: 'pro',
      });

      expect(
        await ctx.orm.query.countUsers.count({
          where: {
            orgId: 'org-1',
            status: 'active',
          },
        })
      ).toBe(1);

      await ctx.db.patch(id as any, {
        status: 'inactive',
      });

      expect(
        await ctx.orm.query.countUsers.count({
          where: {
            orgId: 'org-1',
            status: 'active',
          },
        })
      ).toBe(0);

      expect(
        await ctx.orm.query.countUsers.count({
          where: {
            orgId: 'org-1',
            status: 'inactive',
          },
        })
      ).toBe(1);

      await ctx.db.delete('countUsers', id as any);

      expect(
        await ctx.orm.query.countUsers.count({
          where: {
            orgId: 'org-1',
            status: 'inactive',
          },
        })
      ).toBe(0);
    });
  });

  it('schedules backfill chunks using orm function references', async () => {
    const { schema, relations } = buildCountIndexedFixtures();
    const t = convexTest(schema);

    await t.run(async (baseCtx) => {
      const aggregateBackfillChunkRef = {
        _reference: 'aggregateBackfillChunk',
      } as any;
      const runAfter = vi.fn(async () => undefined);
      const ormClient = createOrm({
        schema: relations,
        ormFunctions: {
          scheduledDelete: {} as any,
          scheduledMutationBatch: {} as any,
          aggregateBackfillChunk: aggregateBackfillChunkRef,
        },
        internalMutation: passthroughInternalMutation,
      });
      const api = ormClient.api();

      await (api as any).aggregateBackfill.handler(
        {
          db: baseCtx.db,
          scheduler: {
            runAfter,
          },
        },
        {}
      );

      expect(runAfter).toHaveBeenCalled();
      expect((runAfter as any).mock.calls[0]?.[1]).toBe(
        aggregateBackfillChunkRef
      );
    });
  });

  it('resume kickoff is noop for READY indexes', async () => {
    const { schema, relations } = buildCountIndexedFixtures();
    const t = convexTest(schema);

    await t.run(async (baseCtx) => {
      const runAfter = vi.fn(async () => undefined);
      const ormClient = createOrm({
        schema: relations,
        ormFunctions: {
          scheduledDelete: {} as any,
          scheduledMutationBatch: {} as any,
        },
        internalMutation: passthroughInternalMutation,
      });
      const api = ormClient.api();

      await baseCtx.db.insert('countUsers', {
        orgId: 'org-1',
        status: 'active',
      });

      await (api as any).aggregateBackfill.handler(
        { db: baseCtx.db, scheduler: { runAfter } },
        {
          tableName: 'countUsers',
          indexName: 'by_org_status',
        }
      );

      for (let i = 0; i < 10; i += 1) {
        const status = await (api as any).aggregateBackfillStatus.handler(
          { db: baseCtx.db, scheduler: { runAfter } },
          {
            tableName: 'countUsers',
            indexName: 'by_org_status',
          }
        );
        if (status.every((entry: any) => entry.status === 'READY')) {
          break;
        }
        await (api as any).aggregateBackfillChunk.handler(
          { db: baseCtx.db, scheduler: { runAfter } },
          {
            tableName: 'countUsers',
            indexName: 'by_org_status',
          }
        );
      }

      runAfter.mockClear();
      const result = await (api as any).aggregateBackfill.handler(
        { db: baseCtx.db, scheduler: { runAfter } },
        {
          tableName: 'countUsers',
          indexName: 'by_org_status',
        }
      );

      expect(result).toMatchObject({
        mode: 'resume',
        skippedReady: 1,
        scheduled: 0,
      });
      expect(runAfter).not.toHaveBeenCalled();
    });
  });

  it('rebuild kickoff resets READY index to BUILDING', async () => {
    const { schema, relations } = buildCountIndexedFixtures();
    const t = convexTest(schema);

    await t.run(async (baseCtx) => {
      const ormClient = createOrm({
        schema: relations,
        ormFunctions: {
          scheduledDelete: {} as any,
          scheduledMutationBatch: {} as any,
        },
        internalMutation: passthroughInternalMutation,
      });
      const api = ormClient.api();
      const ctx = ormClient.with({
        db: baseCtx.db,
        scheduler: schedulerStub as any,
      });

      await baseCtx.db.insert('countUsers', {
        orgId: 'org-1',
        status: 'active',
      });

      await (api as any).aggregateBackfill.handler(
        { db: baseCtx.db, scheduler: schedulerStub },
        {
          tableName: 'countUsers',
          indexName: 'by_org_status',
        }
      );
      for (let i = 0; i < 10; i += 1) {
        const status = await (api as any).aggregateBackfillStatus.handler(
          { db: baseCtx.db, scheduler: schedulerStub },
          {
            tableName: 'countUsers',
            indexName: 'by_org_status',
          }
        );
        if (status.every((entry: any) => entry.status === 'READY')) {
          break;
        }
        await (api as any).aggregateBackfillChunk.handler(
          { db: baseCtx.db, scheduler: schedulerStub },
          {
            tableName: 'countUsers',
            indexName: 'by_org_status',
          }
        );
      }

      await expect(
        (api as any).aggregateBackfill.handler(
          { db: baseCtx.db, scheduler: schedulerStub },
          {
            mode: 'rebuild',
            tableName: 'countUsers',
            indexName: 'by_org_status',
          }
        )
      ).resolves.toMatchObject({
        mode: 'rebuild',
        scheduled: 1,
      });

      await expect(
        ctx.orm.query.countUsers.count({
          where: {
            orgId: 'org-1',
            status: 'active',
          },
        })
      ).rejects.toThrow(/COUNT_INDEX_BUILDING/);
    });
  });

  it('resume kickoff reports needsRebuild when key definition hash differs', async () => {
    const { schema, relations } = buildCountIndexedFixtures();
    const t = convexTest(schema);

    await t.run(async (baseCtx) => {
      const ormClient = createOrm({
        schema: relations,
        ormFunctions: {
          scheduledDelete: {} as any,
          scheduledMutationBatch: {} as any,
        },
        internalMutation: passthroughInternalMutation,
      });
      const api = ormClient.api();

      await baseCtx.db.insert('countUsers', {
        orgId: 'org-1',
        status: 'active',
      });

      await (api as any).aggregateBackfill.handler(
        { db: baseCtx.db, scheduler: schedulerStub },
        {
          tableName: 'countUsers',
          indexName: 'by_org_status',
        }
      );

      const states = await baseCtx.db
        .query('aggregate_state')
        .withIndex('by_table_index', (q: any) =>
          q.eq('tableKey', 'countUsers').eq('indexName', 'by_org_status')
        )
        .collect();

      expect(states[0]).toBeDefined();
      await baseCtx.db.patch('aggregate_state', states[0]._id as any, {
        keyDefinitionHash: 'mismatch',
      });

      const result = await (api as any).aggregateBackfill.handler(
        { db: baseCtx.db, scheduler: schedulerStub },
        {
          tableName: 'countUsers',
          indexName: 'by_org_status',
        }
      );

      expect(result).toMatchObject({
        mode: 'resume',
        needsRebuild: 1,
        scheduled: 0,
      });
    });
  });

  it('resume kickoff prunes removed aggregate index data and state', async () => {
    const { schema, relations } = buildCountIndexedFixtures({
      includeOrgStatusIndex: true,
    });
    const { relations: relationsWithoutOrgStatus } = buildCountIndexedFixtures({
      includeOrgStatusIndex: false,
    });
    const t = convexTest(schema);

    await t.run(async (baseCtx) => {
      const initialOrmClient = createOrm({
        schema: relations,
        ormFunctions: {
          scheduledDelete: {} as any,
          scheduledMutationBatch: {} as any,
        },
        internalMutation: passthroughInternalMutation,
      });
      const initialApi = initialOrmClient.api();

      await baseCtx.db.insert('countUsers', {
        orgId: 'org-1',
        status: 'active',
      });

      await (initialApi as any).aggregateBackfill.handler(
        { db: baseCtx.db, scheduler: schedulerStub },
        {
          tableName: 'countUsers',
          indexName: 'by_org_status',
        }
      );
      await (initialApi as any).aggregateBackfillChunk.handler(
        { db: baseCtx.db, scheduler: schedulerStub },
        {
          tableName: 'countUsers',
          indexName: 'by_org_status',
        }
      );

      const existingState = await baseCtx.db
        .query('aggregate_state')
        .withIndex('by_table_index', (q: any) =>
          q.eq('tableKey', 'countUsers').eq('indexName', 'by_org_status')
        )
        .collect();
      expect(existingState).toHaveLength(1);

      const existingBuckets = await baseCtx.db
        .query('aggregate_bucket')
        .withIndex('by_table_index', (q: any) =>
          q.eq('tableKey', 'countUsers').eq('indexName', 'by_org_status')
        )
        .collect();
      expect(existingBuckets.length).toBeGreaterThan(0);

      const prunedOrmClient = createOrm({
        schema: relationsWithoutOrgStatus,
        ormFunctions: {
          scheduledDelete: {} as any,
          scheduledMutationBatch: {} as any,
        },
        internalMutation: passthroughInternalMutation,
      });
      const prunedApi = prunedOrmClient.api();

      const result = await (prunedApi as any).aggregateBackfill.handler(
        { db: baseCtx.db, scheduler: schedulerStub },
        {}
      );
      expect(result).toMatchObject({
        mode: 'resume',
        pruned: 1,
      });

      const remainingState = await baseCtx.db
        .query('aggregate_state')
        .withIndex('by_table_index', (q: any) =>
          q.eq('tableKey', 'countUsers').eq('indexName', 'by_org_status')
        )
        .collect();
      expect(remainingState).toHaveLength(0);

      const remainingBuckets = await baseCtx.db
        .query('aggregate_bucket')
        .withIndex('by_table_index', (q: any) =>
          q.eq('tableKey', 'countUsers').eq('indexName', 'by_org_status')
        )
        .collect();
      expect(remainingBuckets).toHaveLength(0);

      const remainingMembers = await baseCtx.db
        .query('aggregate_member')
        .withIndex('by_table_index', (q: any) =>
          q.eq('tableKey', 'countUsers').eq('indexName', 'by_org_status')
        )
        .collect();
      expect(remainingMembers).toHaveLength(0);
    });
  });

  it('resume kickoff prunes removed aggregate index rows even without state', async () => {
    const { schema } = buildCountIndexedFixtures({
      includeOrgStatusIndex: true,
    });
    const { relations: relationsWithoutOrgStatus } = buildCountIndexedFixtures({
      includeOrgStatusIndex: false,
    });
    const t = convexTest(schema);

    await t.run(async (baseCtx) => {
      await baseCtx.db.insert('aggregate_bucket', {
        tableKey: 'countUsers',
        indexName: 'by_org_status',
        keyHash: '["org-1","active"]',
        keyParts: ['org-1', 'active'],
        count: 1,
        sumValues: {},
        nonNullCountValues: {},
        updatedAt: 0,
      });
      await baseCtx.db.insert('aggregate_member', {
        tableKey: 'countUsers',
        indexName: 'by_org_status',
        docId: 'doc_without_state',
        keyHash: '["org-1","active"]',
        keyParts: ['org-1', 'active'],
        sumValues: {},
        nonNullCountValues: {},
        extremaValues: {},
        updatedAt: 0,
      });
      await baseCtx.db.insert('aggregate_extrema', {
        tableKey: 'countUsers',
        indexName: 'by_org_status',
        keyHash: '["org-1","active"]',
        fieldName: 'score',
        valueHash: 'value_hash',
        value: 1,
        sortKey: 'n:1',
        count: 1,
        updatedAt: 0,
      });

      const prunedOrmClient = createOrm({
        schema: relationsWithoutOrgStatus,
        ormFunctions: {
          scheduledDelete: {} as any,
          scheduledMutationBatch: {} as any,
        },
        internalMutation: passthroughInternalMutation,
      });
      const prunedApi = prunedOrmClient.api();

      const result = await (prunedApi as any).aggregateBackfill.handler(
        { db: baseCtx.db, scheduler: schedulerStub },
        {}
      );
      expect(result).toMatchObject({
        mode: 'resume',
        pruned: 1,
      });

      const remainingBuckets = await baseCtx.db
        .query('aggregate_bucket')
        .withIndex('by_table_index', (q: any) =>
          q.eq('tableKey', 'countUsers').eq('indexName', 'by_org_status')
        )
        .collect();
      expect(remainingBuckets).toHaveLength(0);

      const remainingMembers = await baseCtx.db
        .query('aggregate_member')
        .withIndex('by_table_index', (q: any) =>
          q.eq('tableKey', 'countUsers').eq('indexName', 'by_org_status')
        )
        .collect();
      expect(remainingMembers).toHaveLength(0);

      const remainingExtrema = await baseCtx.db
        .query('aggregate_extrema')
        .withIndex('by_table_index', (q: any) =>
          q.eq('tableKey', 'countUsers').eq('indexName', 'by_org_status')
        )
        .collect();
      expect(remainingExtrema).toHaveLength(0);
    });
  });

  it('processes at most one paginated target per chunk invocation', async () => {
    const { schema, relations } = buildCountIndexedFixtures();
    const t = convexTest(schema);

    await t.run(async (baseCtx) => {
      const ormClient = createOrm({
        schema: relations,
        ormFunctions: {
          scheduledDelete: {} as any,
          scheduledMutationBatch: {} as any,
        },
        internalMutation: passthroughInternalMutation,
      });
      const api = ormClient.api();
      await baseCtx.db.insert('countUsers', {
        orgId: 'org-1',
        status: 'active',
        tier: 'pro',
      });

      await (api as any).aggregateBackfill.handler(
        { db: baseCtx.db, scheduler: schedulerStub },
        {}
      );

      let paginateCalls = 0;
      const originalQuery = baseCtx.db.query.bind(baseCtx.db);
      const wrapQuery = (query: any): any =>
        new Proxy(query, {
          get(target, property, receiver) {
            const value = Reflect.get(target, property, receiver);
            if (typeof value !== 'function') {
              return value;
            }
            if (property === 'withIndex') {
              return (...args: unknown[]) =>
                wrapQuery(value.apply(target, args) as any);
            }
            if (property === 'paginate') {
              return (...args: unknown[]) => {
                paginateCalls += 1;
                if (paginateCalls > 1) {
                  throw new Error(
                    'chunk() attempted multiple paginated queries in one invocation'
                  );
                }
                return value.apply(target, args);
              };
            }
            return value.bind(target);
          },
        });
      (baseCtx.db as any).query = ((table: string) =>
        wrapQuery(originalQuery(table))) as any;

      await expect(
        (api as any).aggregateBackfillChunk.handler(
          { db: baseCtx.db, scheduler: schedulerStub },
          {}
        )
      ).resolves.toEqual({ status: 'ok' });
      expect(paginateCalls).toBe(1);
    });
  });

  it('backfill normalizes missing index fields instead of writing undefined', async () => {
    const { schema, relations } = buildCountIndexedFixtures();
    const t = convexTest(schema);

    await t.run(async (baseCtx) => {
      const ormClient = createOrm({
        schema: relations,
        ormFunctions: {
          scheduledDelete: {} as any,
          scheduledMutationBatch: {} as any,
        },
        internalMutation: passthroughInternalMutation,
      });
      const api = ormClient.api();

      await baseCtx.db.insert('countUsers', {
        orgId: 'org-1',
        tier: 'pro',
      });

      await (api as any).aggregateBackfill.handler(
        { db: baseCtx.db, scheduler: schedulerStub },
        {
          tableName: 'countUsers',
          indexName: 'by_org_status',
        }
      );
      await expect(
        (api as any).aggregateBackfillChunk.handler(
          { db: baseCtx.db, scheduler: schedulerStub },
          {
            tableName: 'countUsers',
            indexName: 'by_org_status',
          }
        )
      ).resolves.toEqual({ status: 'ok' });

      const buckets = await baseCtx.db
        .query('aggregate_bucket')
        .withIndex('by_table_index', (q: any) =>
          q.eq('tableKey', 'countUsers').eq('indexName', 'by_org_status')
        )
        .collect();

      expect(buckets[0]?.keyParts[1]).toEqual({
        __betterConvexUndefined: true,
      });
    });
  });
});
