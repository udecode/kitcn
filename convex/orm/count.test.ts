import { TableAggregate } from 'kitcn/aggregate';
import {
  aggregateIndex,
  convexTable,
  createOrm,
  defineRelations,
  defineSchema,
  index,
  integer,
  rankIndex,
  requireSchemaRelations,
  text,
} from 'kitcn/orm';
import { aggregateCapability } from 'kitcn/orm/aggregate-index';
import { it as baseIt, describe, expect, test, vi } from 'vitest';
import baseSchema from '../schema';
import { convexTest, runCtx, type TestCtx } from '../setup.testing';

const baseRelations = requireSchemaRelations(baseSchema);

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
const METRIC_STATE_KIND = 'metric' as const;
const RANK_STATE_KIND = 'rank' as const;

const createReadCountingDb = (db: unknown) => {
  const reads = new Map<string, number>();
  const recordReads = (table: string, count: number) => {
    reads.set(table, (reads.get(table) ?? 0) + count);
  };
  const wrapQuery = (query: object, table: string): object =>
    new Proxy(query, {
      get(target, prop) {
        const value = Reflect.get(target, prop);
        if (typeof value !== 'function') {
          return value;
        }
        if (prop === Symbol.asyncIterator) {
          return () => {
            const iterator = value.call(target) as AsyncIterator<unknown>;
            return {
              next: async () => {
                const step = await iterator.next();
                if (!step.done) {
                  recordReads(table, 1);
                }
                return step;
              },
              return: iterator.return?.bind(iterator),
              throw: iterator.throw?.bind(iterator),
            };
          };
        }
        return (...args: unknown[]) => {
          const result = value.apply(target, args);
          if (prop === 'collect' || prop === 'take') {
            return (result as Promise<unknown[]>).then((rows) => {
              recordReads(table, rows.length);
              return rows;
            });
          }
          if (prop === 'first' || prop === 'unique') {
            return (result as Promise<unknown>).then((row) => {
              recordReads(table, row === null ? 0 : 1);
              return row;
            });
          }
          if (prop === 'paginate') {
            return (result as Promise<{ page: unknown[] }>).then((page) => {
              recordReads(table, page.page.length);
              return page;
            });
          }
          return typeof result === 'object' && result !== null
            ? wrapQuery(result, table)
            : result;
        };
      },
    });
  const dbProxy = new Proxy(db as object, {
    get(target, prop) {
      const value = Reflect.get(target, prop);
      if (prop === 'query') {
        return (table: string) =>
          wrapQuery((value as Function).call(target, table) as object, table);
      }
      if (prop === 'get') {
        return async (...args: unknown[]) => {
          const doc = await (value as Function).apply(target, args);
          recordReads('#db.get', doc === null ? 0 : 1);
          return doc;
        };
      }
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return { db: dbProxy, reads };
};

/**
 * Count writes per table on top of `createReadCountingDb`.
 *
 * Read counts cannot see the cost this guards: rewriting a btree node or an
 * aggregate bucket that the very next branch deletes is invisible in every row
 * a query returns. `convex-test` ids are `<n>;<table>`, so the id-first
 * `patch`/`delete` overloads the btree uses attribute to a table too.
 */
const createWriteCountingDb = (db: unknown) => {
  const { db: readCountingDb, reads } = createReadCountingDb(db);
  const writes = new Map<string, number>();
  const tableOf = (id: unknown) =>
    typeof id === 'string' ? (id.split(';')[1] ?? '#unknown') : '#unknown';
  const recordWrite = (table: string) => {
    writes.set(table, (writes.get(table) ?? 0) + 1);
  };
  const dbProxy = new Proxy(readCountingDb as object, {
    get(target, prop) {
      const value = Reflect.get(target, prop);
      if (prop === 'insert') {
        return (...args: unknown[]) => {
          recordWrite(args[0] as string);
          return (value as Function).apply(target, args);
        };
      }
      if (prop === 'patch' || prop === 'replace') {
        return (...args: unknown[]) => {
          recordWrite(
            args.length >= 3 ? (args[0] as string) : tableOf(args[0])
          );
          return (value as Function).apply(target, args);
        };
      }
      if (prop === 'delete') {
        return (...args: unknown[]) => {
          recordWrite(
            args.length >= 2 ? (args[0] as string) : tableOf(args[0])
          );
          return (value as Function).apply(target, args);
        };
      }
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return { db: dbProxy, reads, writes };
};

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
  // Build relations from `schema`, not the bare tables object: schema-level
  // `defaults` ride on the defineSchema result, and dropping them here means
  // every table config reports the built-in budget instead of the configured
  // one.
  const relations = defineRelations(schema, (r) => ({
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
        capabilities: [aggregateCapability()],
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
      const orm = createOrm({
        schema: localRelations,
        capabilities: [aggregateCapability()],
      });
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
      const orm = createOrm({
        schema: relations,
        capabilities: [aggregateCapability()],
      });
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
        capabilities: [aggregateCapability()],
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
        capabilities: [aggregateCapability()],
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
        capabilities: [aggregateCapability()],
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
        capabilities: [aggregateCapability()],
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
      const orm = createOrm({
        schema: relations,
        capabilities: [aggregateCapability()],
      });
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
        capabilities: [aggregateCapability()],
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
        capabilities: [aggregateCapability()],
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
        capabilities: [aggregateCapability()],
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
        capabilities: [aggregateCapability()],
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
        capabilities: [aggregateCapability()],
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
        capabilities: [aggregateCapability()],
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
        capabilities: [aggregateCapability()],
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
        .withIndex('by_kind_table_index', (q: any) =>
          q
            .eq('kind', METRIC_STATE_KIND)
            .eq('tableKey', 'countUsers')
            .eq('indexName', 'by_org_status')
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
        capabilities: [aggregateCapability()],
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
        .withIndex('by_kind_table_index', (q: any) =>
          q
            .eq('kind', METRIC_STATE_KIND)
            .eq('tableKey', 'countUsers')
            .eq('indexName', 'by_org_status')
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
        capabilities: [aggregateCapability()],
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
        .withIndex('by_kind_table_index', (q: any) =>
          q
            .eq('kind', METRIC_STATE_KIND)
            .eq('tableKey', 'countUsers')
            .eq('indexName', 'by_org_status')
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
        .withIndex('by_kind_table_index', (q: any) =>
          q
            .eq('kind', METRIC_STATE_KIND)
            .eq('tableKey', 'countUsers')
            .eq('indexName', 'by_org_status')
        )
        .collect();
      expect(remainingMembers).toHaveLength(0);
    });
  });

  it('exact prune recovers removed aggregate index rows without state', async () => {
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
        kind: METRIC_STATE_KIND,
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
        capabilities: [aggregateCapability()],
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
        {
          mode: 'prune',
          tableName: 'countUsers',
          indexName: 'by_org_status',
        }
      );
      expect(result).toMatchObject({
        mode: 'prune',
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
        .withIndex('by_kind_table_index', (q: any) =>
          q
            .eq('kind', METRIC_STATE_KIND)
            .eq('tableKey', 'countUsers')
            .eq('indexName', 'by_org_status')
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

  it('resume kickoff prunes orphans across kinds, tables, and indexes while keeping active data', async () => {
    const { schema } = buildCountIndexedFixtures({
      includeOrgStatusIndex: true,
    });
    const { relations: relationsWithoutOrgStatus } = buildCountIndexedFixtures({
      includeOrgStatusIndex: false,
    });
    const t = convexTest(schema);

    await t.run(async (baseCtx) => {
      const insertMember = async (
        kind: string,
        tableKey: string,
        indexName: string,
        docId: string
      ) => {
        await baseCtx.db.insert('aggregate_member', {
          kind,
          tableKey,
          indexName,
          docId,
          keyHash: '["org-1"]',
          keyParts: ['org-1'],
          sumValues: {},
          nonNullCountValues: {},
          extremaValues: {},
          updatedAt: 0,
        });
      };

      await insertMember(
        METRIC_STATE_KIND,
        'countUsers',
        'by_org_status',
        'doc_orphan_1'
      );
      await insertMember(
        METRIC_STATE_KIND,
        'countUsers',
        'by_org_status',
        'doc_orphan_2'
      );
      await insertMember(
        METRIC_STATE_KIND,
        'countUsers',
        'by_org_tier',
        'doc_active_1'
      );
      await insertMember(
        METRIC_STATE_KIND,
        'countPosts',
        'by_org',
        'doc_active_2'
      );
      await insertMember(
        RANK_STATE_KIND,
        'countUsers',
        'by_rank_removed_a',
        'doc_rank_orphan_a'
      );
      await insertMember(
        RANK_STATE_KIND,
        'countUsers',
        'by_rank_removed_b',
        'doc_rank_orphan_b'
      );

      await baseCtx.db.insert('aggregate_bucket', {
        tableKey: 'countUsers',
        indexName: 'by_org_status',
        keyHash: '["org-1"]',
        keyParts: ['org-1'],
        count: 2,
        sumValues: {},
        nonNullCountValues: {},
        updatedAt: 0,
      });
      for (const orphanBucketIndex of ['by_removed_x', 'by_removed_y']) {
        await baseCtx.db.insert('aggregate_bucket', {
          tableKey: 'countPosts',
          indexName: orphanBucketIndex,
          keyHash: '["org-1"]',
          keyParts: ['org-1'],
          count: 1,
          sumValues: {},
          nonNullCountValues: {},
          updatedAt: 0,
        });
      }
      await baseCtx.db.insert('aggregate_bucket', {
        tableKey: 'countUsers',
        indexName: 'by_org_tier',
        keyHash: '["org-1"]',
        keyParts: ['org-1'],
        count: 1,
        sumValues: {},
        nonNullCountValues: {},
        updatedAt: 0,
      });
      await baseCtx.db.insert('aggregate_extrema', {
        tableKey: 'countUsers',
        indexName: 'by_org_status',
        keyHash: '["org-1"]',
        fieldName: 'score',
        valueHash: 'value_hash',
        value: 1,
        sortKey: 'n:1',
        count: 1,
        updatedAt: 0,
      });
      for (const [kind, tableKey, indexName] of [
        [METRIC_STATE_KIND, 'countUsers', 'by_org_status'],
        [METRIC_STATE_KIND, 'countPosts', 'by_removed_x'],
        [METRIC_STATE_KIND, 'countPosts', 'by_removed_y'],
        [RANK_STATE_KIND, 'countUsers', 'by_rank_removed_a'],
        [RANK_STATE_KIND, 'countUsers', 'by_rank_removed_b'],
      ]) {
        await baseCtx.db.insert('aggregate_state', {
          kind,
          tableKey,
          indexName,
          keyDefinitionHash: '',
          metricDefinitionHash: '',
          status: 'READY',
          cursor: null,
          processed: 0,
          startedAt: 0,
          updatedAt: 0,
          completedAt: 0,
          lastError: null,
        });
      }

      const prunedOrmClient = createOrm({
        capabilities: [aggregateCapability()],
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
        pruned: 5,
      });

      const membersByIndex = async (
        kind: string,
        tableKey: string,
        indexName: string
      ) =>
        baseCtx.db
          .query('aggregate_member')
          .withIndex('by_kind_table_index', (q: any) =>
            q
              .eq('kind', kind)
              .eq('tableKey', tableKey)
              .eq('indexName', indexName)
          )
          .collect();

      await expect(
        membersByIndex(METRIC_STATE_KIND, 'countUsers', 'by_org_status')
      ).resolves.toHaveLength(0);
      await expect(
        membersByIndex(RANK_STATE_KIND, 'countUsers', 'by_rank_removed_a')
      ).resolves.toHaveLength(0);
      await expect(
        membersByIndex(RANK_STATE_KIND, 'countUsers', 'by_rank_removed_b')
      ).resolves.toHaveLength(0);
      await expect(
        membersByIndex(METRIC_STATE_KIND, 'countUsers', 'by_org_tier')
      ).resolves.toHaveLength(1);
      await expect(
        membersByIndex(METRIC_STATE_KIND, 'countPosts', 'by_org')
      ).resolves.toHaveLength(1);

      const orphanBuckets = await baseCtx.db
        .query('aggregate_bucket')
        .withIndex('by_table_index', (q: any) =>
          q.eq('tableKey', 'countUsers').eq('indexName', 'by_org_status')
        )
        .collect();
      expect(orphanBuckets).toHaveLength(0);

      const activeBuckets = await baseCtx.db
        .query('aggregate_bucket')
        .withIndex('by_table_index', (q: any) =>
          q.eq('tableKey', 'countUsers').eq('indexName', 'by_org_tier')
        )
        .collect();
      expect(activeBuckets).toHaveLength(1);

      for (const orphanBucketIndex of ['by_removed_x', 'by_removed_y']) {
        const orphanOnlyBuckets = await baseCtx.db
          .query('aggregate_bucket')
          .withIndex('by_table_index', (q: any) =>
            q.eq('tableKey', 'countPosts').eq('indexName', orphanBucketIndex)
          )
          .collect();
        expect(orphanOnlyBuckets).toHaveLength(0);
      }

      const orphanExtrema = await baseCtx.db
        .query('aggregate_extrema')
        .withIndex('by_table_index', (q: any) =>
          q.eq('tableKey', 'countUsers').eq('indexName', 'by_org_status')
        )
        .collect();
      expect(orphanExtrema).toHaveLength(0);
    });
  });

  it('resume kickoff does not scan aggregate backing rows', async () => {
    const { schema, relations } = buildCountIndexedFixtures();
    const t = convexTest(schema);

    await t.run(async (baseCtx) => {
      const ormClient = createOrm({
        capabilities: [aggregateCapability()],
        schema: relations,
        ormFunctions: {
          scheduledDelete: {} as any,
          scheduledMutationBatch: {} as any,
        },
        internalMutation: passthroughInternalMutation,
      });
      const api = ormClient.api();

      const memberTuples = [
        {
          kind: METRIC_STATE_KIND,
          tableKey: 'countUsers',
          indexName: 'by_org_status',
        },
        {
          kind: METRIC_STATE_KIND,
          tableKey: 'countUsers',
          indexName: 'by_org_tier',
        },
        {
          kind: METRIC_STATE_KIND,
          tableKey: 'countPosts',
          indexName: 'by_org',
        },
      ];
      for (const [tupleIndex, tuple] of memberTuples.entries()) {
        for (let i = 0; i < 100; i += 1) {
          await baseCtx.db.insert('aggregate_member', {
            ...tuple,
            docId: `doc_${tupleIndex}_${i}`,
            keyHash: '["org-1","active"]',
            keyParts: ['org-1', 'active'],
            sumValues: {},
            nonNullCountValues: {},
            extremaValues: {},
            updatedAt: 0,
          });
        }
      }
      const bucketTuples = [
        { tableKey: 'countUsers', indexName: 'by_org_status' },
        { tableKey: 'countUsers', indexName: 'by_org_tier' },
      ];
      for (const tuple of bucketTuples) {
        for (let i = 0; i < 30; i += 1) {
          await baseCtx.db.insert('aggregate_bucket', {
            ...tuple,
            keyHash: `["org-${i}","active"]`,
            keyParts: [`org-${i}`, 'active'],
            count: 1,
            sumValues: {},
            nonNullCountValues: {},
            updatedAt: 0,
          });
          await baseCtx.db.insert('aggregate_extrema', {
            ...tuple,
            keyHash: `["org-${i}","active"]`,
            fieldName: 'score',
            valueHash: `value_hash_${i}`,
            value: i,
            sortKey: `n:${i}`,
            count: 1,
            updatedAt: 0,
          });
        }
      }

      const { db: countingDb, reads } = createReadCountingDb(baseCtx.db);

      const result = await (api as any).aggregateBackfill.handler(
        { db: countingDb, scheduler: schedulerStub },
        {}
      );

      expect(result).toMatchObject({ mode: 'resume', status: 'ok' });
      expect(reads.get('aggregate_member') ?? 0).toBe(0);
      expect(reads.get('aggregate_bucket') ?? 0).toBe(0);
      expect(reads.get('aggregate_extrema') ?? 0).toBe(0);
      expect(reads.get('#db.get') ?? 0).toBeLessThan(20);
    });
  });

  it('processes at most one paginated target per chunk invocation', async () => {
    const { schema, relations } = buildCountIndexedFixtures();
    const t = convexTest(schema);

    await t.run(async (baseCtx) => {
      const ormClient = createOrm({
        capabilities: [aggregateCapability()],
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
        capabilities: [aggregateCapability()],
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
        __kitcnUndefined: true,
      });
    });
  });
});

const trackWrites = (db: any) => {
  const inserted: string[] = [];
  const touched: string[] = [];
  const originalInsert = db.insert.bind(db);
  const originalPatch = db.patch.bind(db);
  const originalReplace = db.replace.bind(db);
  const originalDelete = db.delete.bind(db);
  let recording = false;

  db.insert = (...args: any[]) => {
    if (recording) {
      inserted.push(String(args[0]));
    }
    return originalInsert(...args);
  };
  const recordTouched = (args: any[]) => {
    if (!recording) {
      return;
    }
    for (const arg of args) {
      if (typeof arg === 'string') {
        touched.push(arg);
      }
    }
  };
  db.patch = (...args: any[]) => {
    recordTouched(args);
    return originalPatch(...args);
  };
  db.replace = (...args: any[]) => {
    recordTouched(args);
    return originalReplace(...args);
  };
  db.delete = (...args: any[]) => {
    recordTouched(args);
    return originalDelete(...args);
  };

  return {
    start: () => {
      recording = true;
      inserted.length = 0;
      touched.length = 0;
    },
    stop: () => {
      recording = false;
    },
    insertsInto: (table: string) =>
      inserted.filter((entry) => entry === table).length,
    // `patch`/`delete` are called with either (table, id, ...) or (id, ...), so
    // count every string argument that matches a known document id or table.
    writesTouching: (ids: Set<string>) =>
      touched.filter((entry) => ids.has(entry)).length,
  };
};

const idsIn = async (db: any, table: string): Promise<Set<string>> =>
  new Set((await db.query(table).collect()).map((row: any) => String(row._id)));

const backfillToReady = async (api: any, db: any) => {
  await (api as any).aggregateBackfill.handler(
    { db, scheduler: schedulerStub },
    {}
  );
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const states = await (api as any).aggregateBackfillStatus.handler(
      { db, scheduler: schedulerStub },
      {}
    );
    if (states.every((entry: any) => entry.status === 'READY')) {
      return;
    }
    await (api as any).aggregateBackfillChunk.handler(
      { db, scheduler: schedulerStub },
      {}
    );
  }
  throw new Error('backfill did not reach READY');
};

describe('aggregateIndex write amplification', () => {
  it('writes nothing when an update touches no aggregated field', async () => {
    const { schema, relations } = buildCountIndexedFixtures();
    const t = convexTest(schema);

    await t.run(async (baseCtx) => {
      const ormClient = createOrm({
        capabilities: [aggregateCapability()],
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

      await backfillToReady(api, baseCtx.db);

      const id = await ctx.db.insert('countPosts', {
        orgId: 'org-1',
        title: 'first',
      });

      const aggregateIds = new Set([
        ...(await idsIn(baseCtx.db, 'aggregate_member')),
        ...(await idsIn(baseCtx.db, 'aggregate_bucket')),
        ...(await idsIn(baseCtx.db, 'aggregate_extrema')),
      ]);

      const writes = trackWrites(baseCtx.db);

      // `title` is not part of any aggregateIndex.
      writes.start();
      await ctx.db.patch(id as any, { title: 'second' });
      writes.stop();

      expect(writes.writesTouching(aggregateIds)).toBe(0);
      expect(writes.insertsInto('aggregate_member')).toBe(0);
      expect(writes.insertsInto('aggregate_bucket')).toBe(0);

      // Control: changing the indexed field still reconciles.
      writes.start();
      await ctx.db.patch(id as any, { orgId: 'org-2' });
      writes.stop();

      expect(writes.writesTouching(aggregateIds)).toBeGreaterThan(0);

      expect(
        await ctx.orm.query.countPosts.count({ where: { orgId: 'org-2' } })
      ).toBe(1);
      expect(
        await ctx.orm.query.countPosts.count({ where: { orgId: 'org-1' } })
      ).toBe(0);
    });
  });

  it('writes one bucket per distinct key tuple per backfill chunk', async () => {
    const { schema, relations } = buildCountIndexedFixtures();
    const t = convexTest(schema);

    await t.run(async (baseCtx) => {
      const ormClient = createOrm({
        capabilities: [aggregateCapability()],
        schema: relations,
        ormFunctions: {
          scheduledDelete: {} as any,
          scheduledMutationBatch: {} as any,
        },
        internalMutation: passthroughInternalMutation,
      });
      const api = ormClient.api();

      // Seed through the raw db so no lifecycle hook pre-populates buckets.
      const distinctOrgs = 3;
      const rowCount = 30;
      for (let i = 0; i < rowCount; i += 1) {
        await baseCtx.db.insert('countPosts', {
          orgId: `org-${i % distinctOrgs}`,
          title: `post-${i}`,
        });
      }

      const writes = trackWrites(baseCtx.db);
      writes.start();
      await backfillToReady(api, baseCtx.db);
      writes.stop();

      // One insert per distinct key tuple, and no per-document re-patching.
      expect(writes.insertsInto('aggregate_bucket')).toBe(distinctOrgs);
      const bucketIds = await idsIn(baseCtx.db, 'aggregate_bucket');
      expect(writes.writesTouching(bucketIds)).toBe(0);
      expect(writes.insertsInto('aggregate_member')).toBe(rowCount);

      const ctx = ormClient.with({
        db: baseCtx.db,
        scheduler: schedulerStub as any,
      });
      expect(
        await ctx.orm.query.countPosts.count({ where: { orgId: 'org-0' } })
      ).toBe(10);
    });
  });
});

describe('aggregateIndex range scan budget', () => {
  const seedScoredOrg = async (db: any, rowCount: number, orgId = 'org-1') => {
    for (let i = 0; i < rowCount; i += 1) {
      await db.insert('countUsers', {
        orgId,
        status: 'active',
        tier: 'pro',
        score: i,
      });
    }
  };

  it('throws a named error instead of collecting an unbounded bucket prefix', async () => {
    const { schema, relations } = buildCountIndexedFixtures({
      defaults: { aggregateWorkBudget: 5 },
    });
    const t = convexTest(schema);

    await t.run(async (baseCtx) => {
      const ormClient = createOrm({
        capabilities: [aggregateCapability()],
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

      await seedScoredOrg(baseCtx.db, 10);
      await backfillToReady(api, baseCtx.db);

      // 10 distinct `score` buckets sit under the `orgId` prefix, over budget.
      await expect(
        ctx.orm.query.countUsers.count({
          where: { orgId: 'org-1', score: { gte: 0 } },
        })
      ).rejects.toThrow(/COUNT_FILTER_UNSUPPORTED/);
      await expect(
        ctx.orm.query.countUsers.count({
          where: { orgId: 'org-1', score: { gte: 0 } },
        })
      ).rejects.toThrow(/aggregateWorkBudget/);
    });
  });

  it('returns ranged counts when the prefix fits the budget', async () => {
    const { schema, relations } = buildCountIndexedFixtures();
    const t = convexTest(schema);

    await t.run(async (baseCtx) => {
      const ormClient = createOrm({
        capabilities: [aggregateCapability()],
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

      await seedScoredOrg(baseCtx.db, 10);
      await backfillToReady(api, baseCtx.db);

      expect(
        await ctx.orm.query.countUsers.count({
          where: { orgId: 'org-1', score: { gte: 5 } },
        })
      ).toBe(5);
      expect(
        await ctx.orm.query.countUsers.count({
          where: { orgId: 'org-1', score: { gte: 0 } },
        })
      ).toBe(10);
    });
  });

  it('shares one budget across every IN prefix scan', async () => {
    const { schema, relations } = buildCountIndexedFixtures({
      defaults: { aggregateWorkBudget: 20 },
    });
    const t = convexTest(schema);

    await t.run(async (baseCtx) => {
      const ormClient = createOrm({
        capabilities: [aggregateCapability()],
        schema: relations,
        ormFunctions: {
          scheduledDelete: {} as any,
          scheduledMutationBatch: {} as any,
        },
        internalMutation: passthroughInternalMutation,
      });
      const api = ormClient.api();

      // Ten prefixes the plan-time guard accepts (10 x 2 work units == budget)
      // with eight `score` buckets each: every prefix fits the budget on its
      // own, but the query as a whole covers 80 buckets.
      const orgIds = Array.from({ length: 10 }, (_, org) => `org-${org}`);
      for (const orgId of orgIds) {
        await seedScoredOrg(baseCtx.db, 8, orgId);
      }
      await backfillToReady(api, baseCtx.db);

      const { db: countingDb, reads } = createReadCountingDb(baseCtx.db);
      const ctx = ormClient.with({
        db: countingDb as any,
        scheduler: schedulerStub as any,
      });

      await expect(
        ctx.orm.query.countUsers.count({
          where: { orgId: { in: orgIds }, score: { gte: 0 } },
        })
      ).rejects.toThrow(/COUNT_FILTER_UNSUPPORTED/);
      // One budget covers the whole fan-out plus one global probe row. In-flight
      // prefixes cannot each overshoot the reservation.
      expect(reads.get('aggregate_bucket') ?? 0).toBeLessThanOrEqual(21);
    });
  });

  it('returns ranged counts when the combined prefixes fit the budget', async () => {
    const { schema, relations } = buildCountIndexedFixtures({
      defaults: { aggregateWorkBudget: 5 },
    });
    const t = convexTest(schema);

    await t.run(async (baseCtx) => {
      const ormClient = createOrm({
        capabilities: [aggregateCapability()],
        schema: relations,
        ormFunctions: {
          scheduledDelete: {} as any,
          scheduledMutationBatch: {} as any,
        },
        internalMutation: passthroughInternalMutation,
      });
      const api = ormClient.api();

      // Five buckets under one of two prefixes: exactly the budget, and more
      // than the three buckets the first round gives that prefix. Scores 3 and
      // 4 only reach the result if the prefix resumes after its full page.
      await seedScoredOrg(baseCtx.db, 5, 'org-1');
      await backfillToReady(api, baseCtx.db);

      const { db: countingDb, reads } = createReadCountingDb(baseCtx.db);
      const ctx = ormClient.with({
        db: countingDb as any,
        scheduler: schedulerStub as any,
      });

      expect(
        await ctx.orm.query.countUsers.count({
          where: { orgId: { in: ['org-1', 'org-2'] }, score: { gte: 0 } },
        })
      ).toBe(5);
      expect(
        await ctx.orm.query.countUsers.count({
          where: { orgId: { in: ['org-1', 'org-2'] }, score: { gte: 3 } },
        })
      ).toBe(2);
      expect(reads.get('aggregate_bucket') ?? 0).toBeLessThanOrEqual(12);
    });
  });
});

describe('aggregateIndex clearing is resumable', () => {
  const membersFor = (db: any, kind: string, table: string, index: string) =>
    db
      .query('aggregate_member')
      .withIndex('by_kind_table_index', (q: any) =>
        q.eq('kind', kind).eq('tableKey', table).eq('indexName', index)
      )
      .collect();

  const bucketsFor = (db: any, table: string, index: string) =>
    db
      .query('aggregate_bucket')
      .withIndex('by_table_index', (q: any) =>
        q.eq('tableKey', table).eq('indexName', index)
      )
      .collect();

  const stateFor = (db: any, kind: string, table: string, index: string) =>
    db
      .query('aggregate_state')
      .withIndex('by_kind_table_index', (q: any) =>
        q.eq('kind', kind).eq('tableKey', table).eq('indexName', index)
      )
      .collect();

  const treesFor = (db: any, table: string, index: string) =>
    db
      .query('aggregate_rank_tree')
      .withIndex('by_aggregate_name', (q: any) =>
        q.eq('aggregateName', `${table}.${index}`)
      )
      .collect();

  const extremaFor = (db: any, table: string, index: string) =>
    db
      .query('aggregate_extrema')
      .withIndex('by_table_index', (q: any) =>
        q.eq('tableKey', table).eq('indexName', index)
      )
      .collect();

  // Nodes carry no table/index columns; a single-index fixture owns them all.
  const allNodes = (db: any) => db.query('aggregate_rank_node').collect();

  it('blocks metric and rank writes before a declared index is cleared', async () => {
    const barrierUsers = convexTable(
      'barrierUsers',
      {
        orgId: text().notNull(),
        score: integer().notNull(),
      },
      (t) => [
        aggregateIndex('by_org').on(t.orgId),
        rankIndex('by_score').partitionBy(t.orgId).orderBy(t.score),
      ]
    );
    const schema = defineSchema({ barrierUsers });
    const relations = defineRelations(schema);
    const t = convexTest(schema);

    await t.run(async (baseCtx) => {
      const ormClient = createOrm({
        capabilities: [aggregateCapability()],
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
      const insertClearingState = (kind: string, indexName: string) =>
        baseCtx.db.insert('aggregate_state', {
          kind,
          tableKey: 'barrierUsers',
          indexName,
          keyDefinitionHash: '',
          metricDefinitionHash: '',
          status: 'CLEARING',
          cursor: null,
          processed: 0,
          startedAt: 0,
          updatedAt: 0,
          completedAt: null,
          lastError: null,
        });

      const metricState = await insertClearingState(
        METRIC_STATE_KIND,
        'by_org'
      );
      await expect(
        ctx.db.insert('barrierUsers', { orgId: 'org-1', score: 1 })
      ).rejects.toThrow(/CLEARING/);
      expect(await baseCtx.db.query('barrierUsers').collect()).toHaveLength(0);

      await baseCtx.db.delete('aggregate_state', metricState as any);
      await insertClearingState(RANK_STATE_KIND, 'by_score');
      await expect(
        ctx.db.insert('barrierUsers', { orgId: 'org-1', score: 2 })
      ).rejects.toThrow(/CLEARING/);
      expect(await baseCtx.db.query('barrierUsers').collect()).toHaveLength(0);
    });
  });

  it('rebuild drains stored state across chunks instead of one mutation', async () => {
    const { schema, relations } = buildCountIndexedFixtures();
    const t = convexTest(schema);

    await t.run(async (baseCtx) => {
      const ormClient = createOrm({
        capabilities: [aggregateCapability()],
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

      for (let i = 0; i < 12; i += 1) {
        await baseCtx.db.insert('countPosts', {
          orgId: `org-${i % 3}`,
          title: `post-${i}`,
        });
      }
      await backfillToReady(api, baseCtx.db);
      expect(
        await ctx.orm.query.countPosts.count({ where: { orgId: 'org-0' } })
      ).toBe(4);

      // batchSize 2 cannot clear 12 members in a single mutation.
      await (api as any).aggregateBackfill.handler(
        { db: baseCtx.db, scheduler: schedulerStub },
        {
          mode: 'rebuild',
          batchSize: 2,
          tableName: 'countPosts',
          indexName: 'by_org',
        }
      );

      const parked = await stateFor(
        baseCtx.db,
        METRIC_STATE_KIND,
        'countPosts',
        'by_org'
      );
      expect(parked[0]?.status).toBe('CLEARING');
      expect(
        (
          await membersFor(
            baseCtx.db,
            METRIC_STATE_KIND,
            'countPosts',
            'by_org'
          )
        ).length
      ).toBeGreaterThan(0);

      let reachedReady = false;
      for (let attempt = 0; attempt < 60; attempt += 1) {
        const states = await (api as any).aggregateBackfillStatus.handler(
          { db: baseCtx.db, scheduler: schedulerStub },
          { tableName: 'countPosts', indexName: 'by_org' }
        );
        if (states.every((entry: any) => entry.status === 'READY')) {
          reachedReady = true;
          break;
        }
        await (api as any).aggregateBackfillChunk.handler(
          { db: baseCtx.db, scheduler: schedulerStub },
          { tableName: 'countPosts', indexName: 'by_org', batchSize: 2 }
        );
      }

      expect(reachedReady).toBe(true);
      expect(
        await ctx.orm.query.countPosts.count({ where: { orgId: 'org-0' } })
      ).toBe(4);
      expect(
        await ctx.orm.query.countPosts.count({ where: { orgId: 'org-1' } })
      ).toBe(4);
      expect(
        await ctx.orm.query.countPosts.count({ where: { orgId: 'org-2' } })
      ).toBe(4);
    });
  });

  it('prune parks an oversized orphan in CLEARING and finishes it in chunks', async () => {
    const { schema } = buildCountIndexedFixtures({
      includeOrgStatusIndex: true,
    });
    const { relations: relationsWithoutOrgStatus } = buildCountIndexedFixtures({
      includeOrgStatusIndex: false,
    });
    const t = convexTest(schema);

    await t.run(async (baseCtx) => {
      for (let i = 0; i < 10; i += 1) {
        await baseCtx.db.insert('aggregate_member', {
          kind: METRIC_STATE_KIND,
          tableKey: 'countUsers',
          indexName: 'by_org_status',
          docId: `doc-${i}`,
          keyHash: '["org-1"]',
          keyParts: ['org-1'],
          sumValues: {},
          nonNullCountValues: {},
          extremaValues: {},
          updatedAt: 0,
        });
      }
      await baseCtx.db.insert('aggregate_bucket', {
        tableKey: 'countUsers',
        indexName: 'by_org_status',
        keyHash: '["org-1"]',
        keyParts: ['org-1'],
        count: 10,
        sumValues: {},
        nonNullCountValues: {},
        updatedAt: 0,
      });
      await baseCtx.db.insert('aggregate_state', {
        kind: METRIC_STATE_KIND,
        tableKey: 'countUsers',
        indexName: 'by_org_status',
        keyDefinitionHash: '',
        metricDefinitionHash: '',
        status: 'READY',
        cursor: null,
        processed: 0,
        startedAt: 0,
        updatedAt: 0,
        completedAt: 0,
        lastError: null,
      });

      const prunedOrmClient = createOrm({
        capabilities: [aggregateCapability()],
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
        { mode: 'prune', batchSize: 2 }
      );
      expect(result).toMatchObject({ mode: 'prune', pruned: 0, pruning: 1 });
      expect(
        (
          await stateFor(
            baseCtx.db,
            METRIC_STATE_KIND,
            'countUsers',
            'by_org_status'
          )
        )[0]?.status
      ).toBe('CLEARING');

      for (let attempt = 0; attempt < 40; attempt += 1) {
        const remainingState = await stateFor(
          baseCtx.db,
          METRIC_STATE_KIND,
          'countUsers',
          'by_org_status'
        );
        if (remainingState.length === 0) {
          break;
        }
        await (prunedApi as any).aggregateBackfillChunk.handler(
          { db: baseCtx.db, scheduler: schedulerStub },
          {
            tableName: 'countUsers',
            indexName: 'by_org_status',
            batchSize: 2,
          }
        );
      }

      expect(
        await membersFor(
          baseCtx.db,
          METRIC_STATE_KIND,
          'countUsers',
          'by_org_status'
        )
      ).toHaveLength(0);
      expect(
        await bucketsFor(baseCtx.db, 'countUsers', 'by_org_status')
      ).toHaveLength(0);
      expect(
        await stateFor(
          baseCtx.db,
          METRIC_STATE_KIND,
          'countUsers',
          'by_org_status'
        )
      ).toHaveLength(0);
    });
  });

  const buildRankClearFixtures = (options?: {
    dropRankIndex?: boolean;
    sumWeight?: boolean;
  }) => {
    const rankUsers = convexTable(
      'rankUsers',
      {
        orgId: text().notNull(),
        score: integer().notNull(),
        weight: integer().notNull(),
      },
      (t) => {
        if (options?.dropRankIndex) {
          return [index('by_org').on(t.orgId)];
        }
        const byScore = rankIndex('by_score')
          .partitionBy(t.orgId)
          .orderBy(t.score);
        // `sum()` only moves metricDefinitionHash; keyDefinitionHash covers the
        // partition and order fields, which are identical in both variants.
        return [options?.sumWeight ? byScore.sum(t.weight) : byScore];
      }
    );
    const schema = defineSchema({ rankUsers });
    return { relations: defineRelations(schema), schema };
  };

  const buildMetricClearFixtures = (options?: {
    dropIndex?: boolean;
    extrema?: boolean;
    sumScore?: boolean;
  }) => {
    const metricUsers = convexTable(
      'metricUsers',
      {
        orgId: text().notNull(),
        score: integer().notNull(),
      },
      (t) => {
        if (options?.dropIndex) {
          return [index('by_org_id').on(t.orgId)];
        }
        const byOrg = aggregateIndex('by_org').on(t.orgId);
        if (options?.extrema) {
          return [byOrg.sum(t.score).min(t.score).max(t.score)];
        }
        return [options?.sumScore ? byOrg.sum(t.score) : byOrg];
      }
    );
    const schema = defineSchema({ metricUsers });
    return { relations: defineRelations(schema), schema };
  };

  const ormFor = <
    TRelations extends
      | ReturnType<typeof buildRankClearFixtures>['relations']
      | ReturnType<typeof buildMetricClearFixtures>['relations'],
  >(
    relations: TRelations
  ) =>
    createOrm({
      capabilities: [aggregateCapability()],
      schema: relations,
      ormFunctions: {
        scheduledDelete: {} as any,
        scheduledMutationBatch: {} as any,
      },
      internalMutation: passthroughInternalMutation,
    });

  it('keeps a rank index CLEARING when a metric change lands mid-drain', async () => {
    const { schema, relations } = buildRankClearFixtures();
    const { relations: summedRelations } = buildRankClearFixtures({
      sumWeight: true,
    });
    const t = convexTest(schema);

    await t.run(async (baseCtx) => {
      const api = ormFor(relations).api();
      for (let i = 0; i < 12; i += 1) {
        await baseCtx.db.insert('rankUsers', {
          orgId: 'org-1',
          score: i,
          weight: 2,
        });
      }
      await backfillToReady(api, baseCtx.db);

      // batchSize 2 cannot drain 12 rank members in a single mutation.
      await (api as any).aggregateBackfill.handler(
        { db: baseCtx.db, scheduler: schedulerStub },
        {
          mode: 'rebuild',
          batchSize: 2,
          tableName: 'rankUsers',
          indexName: 'by_score',
        }
      );
      expect(
        (
          await stateFor(baseCtx.db, RANK_STATE_KIND, 'rankUsers', 'by_score')
        )[0]?.status
      ).toBe('CLEARING');

      // The index gains a sum field while the clear is still draining. A rank
      // index always reports a metric change as needing a backfill, so this is
      // the branch that used to jump straight to BUILDING.
      const summedClient = ormFor(summedRelations);
      const summedApi = summedClient.api();
      const resumed = await (summedApi as any).aggregateBackfill.handler(
        { db: baseCtx.db, scheduler: schedulerStub },
        { batchSize: 2, tableName: 'rankUsers', indexName: 'by_score' }
      );

      // Staying CLEARING is only correct if the drain is still scheduled.
      // Parking the index without a follow-up chunk would stall it forever.
      expect(resumed).toMatchObject({
        mode: 'resume',
        scheduled: 1,
        skippedReady: 0,
        needsRebuild: 0,
      });

      expect(
        (
          await stateFor(baseCtx.db, RANK_STATE_KIND, 'rankUsers', 'by_score')
        )[0]?.status
      ).toBe('CLEARING');
      expect(
        await membersFor(baseCtx.db, RANK_STATE_KIND, 'rankUsers', 'by_score')
      ).not.toHaveLength(0);

      let checkedFirstBuilding = false;
      let reachedReady = false;
      for (let attempt = 0; attempt < 60; attempt += 1) {
        const state = (
          await stateFor(baseCtx.db, RANK_STATE_KIND, 'rankUsers', 'by_score')
        )[0];
        if (state?.status === 'READY') {
          reachedReady = true;
          break;
        }
        if (state?.status === 'BUILDING' && !checkedFirstBuilding) {
          // The mutation that leaves CLEARING only advances the status; it never
          // builds. Nothing may survive that hand-off, or the rebuild would
          // insert on top of stale members and trees.
          checkedFirstBuilding = true;
          expect(
            await membersFor(
              baseCtx.db,
              RANK_STATE_KIND,
              'rankUsers',
              'by_score'
            )
          ).toHaveLength(0);
          expect(
            await treesFor(baseCtx.db, 'rankUsers', 'by_score')
          ).toHaveLength(0);
        }
        await (summedApi as any).aggregateBackfillChunk.handler(
          { db: baseCtx.db, scheduler: schedulerStub },
          { tableName: 'rankUsers', indexName: 'by_score', batchSize: 2 }
        );
      }

      expect(checkedFirstBuilding).toBe(true);
      expect(reachedReady).toBe(true);

      const ctx = summedClient.with({
        db: baseCtx.db,
        scheduler: schedulerStub as any,
      });
      const leaderboard = ctx.orm.query.rankUsers.rank('by_score', {
        where: { orgId: 'org-1' },
      });
      expect(await leaderboard.count()).toBe(12);
      expect(await leaderboard.sum()).toBe(24);
    });
  });

  it('keeps a metric index CLEARING when a metric change lands mid-drain', async () => {
    const { schema, relations } = buildMetricClearFixtures();
    const { relations: summedRelations } = buildMetricClearFixtures({
      sumScore: true,
    });
    const t = convexTest(schema);

    await t.run(async (baseCtx) => {
      const api = ormFor(relations).api();
      for (let i = 0; i < 12; i += 1) {
        await baseCtx.db.insert('metricUsers', { orgId: 'org-1', score: 2 });
      }
      await backfillToReady(api, baseCtx.db);

      await (api as any).aggregateBackfill.handler(
        { db: baseCtx.db, scheduler: schedulerStub },
        {
          mode: 'rebuild',
          batchSize: 2,
          tableName: 'metricUsers',
          indexName: 'by_org',
        }
      );
      expect(
        (
          await stateFor(baseCtx.db, METRIC_STATE_KIND, 'metricUsers', 'by_org')
        )[0]?.status
      ).toBe('CLEARING');

      const summedClient = ormFor(summedRelations);
      const summedApi = summedClient.api();
      const resumed = await (summedApi as any).aggregateBackfill.handler(
        { db: baseCtx.db, scheduler: schedulerStub },
        { batchSize: 2, tableName: 'metricUsers', indexName: 'by_org' }
      );

      expect(resumed).toMatchObject({
        mode: 'resume',
        scheduled: 1,
        skippedReady: 0,
        needsRebuild: 0,
      });

      expect(
        (
          await stateFor(baseCtx.db, METRIC_STATE_KIND, 'metricUsers', 'by_org')
        )[0]?.status
      ).toBe('CLEARING');
      expect(
        await membersFor(baseCtx.db, METRIC_STATE_KIND, 'metricUsers', 'by_org')
      ).not.toHaveLength(0);

      let checkedFirstBuilding = false;
      let reachedReady = false;
      for (let attempt = 0; attempt < 60; attempt += 1) {
        const state = (
          await stateFor(baseCtx.db, METRIC_STATE_KIND, 'metricUsers', 'by_org')
        )[0];
        if (state?.status === 'READY') {
          reachedReady = true;
          break;
        }
        if (state?.status === 'BUILDING' && !checkedFirstBuilding) {
          checkedFirstBuilding = true;
          expect(
            await membersFor(
              baseCtx.db,
              METRIC_STATE_KIND,
              'metricUsers',
              'by_org'
            )
          ).toHaveLength(0);
          expect(
            await bucketsFor(baseCtx.db, 'metricUsers', 'by_org')
          ).toHaveLength(0);
        }
        await (summedApi as any).aggregateBackfillChunk.handler(
          { db: baseCtx.db, scheduler: schedulerStub },
          { tableName: 'metricUsers', indexName: 'by_org', batchSize: 2 }
        );
      }

      expect(checkedFirstBuilding).toBe(true);
      expect(reachedReady).toBe(true);

      const ctx = summedClient.with({
        db: baseCtx.db,
        scheduler: schedulerStub as any,
      });
      expect(
        await ctx.orm.query.metricUsers.count({ where: { orgId: 'org-1' } })
      ).toBe(12);
      expect(
        await ctx.orm.query.metricUsers.aggregate({
          where: { orgId: 'org-1' },
          _sum: { score: true },
        })
      ).toEqual({ _sum: { score: 24 } });
    });
  });

  // A clear ends with every stored document deleted, so any write it makes to a
  // document before deleting it is thrown away. Pinning "at most one write per
  // stored document" is what stops the clear from paying per-member btree
  // descents and bucket decrements it is about to discard.
  it('drops a multi-namespace rank btree without rewriting the nodes it deletes', async () => {
    const { schema, relations } = buildRankClearFixtures();
    const { relations: withoutRank } = buildRankClearFixtures({
      dropRankIndex: true,
    });
    const t = convexTest(schema);

    await t.run(async (baseCtx) => {
      const api = ormFor(relations).api();
      // 3 namespaces x 40 rows: past maxNodeSize 16, so every namespace owns a
      // multi-level tree and a member delete has real internal nodes to patch.
      for (let org = 0; org < 3; org += 1) {
        for (let i = 0; i < 40; i += 1) {
          await baseCtx.db.insert('rankUsers', {
            orgId: `org-${org}`,
            score: i,
            weight: 1,
          });
        }
      }
      await backfillToReady(api, baseCtx.db);

      const nodesBefore = (await allNodes(baseCtx.db)).length;
      expect(nodesBefore).toBeGreaterThan(3);
      expect(await treesFor(baseCtx.db, 'rankUsers', 'by_score')).toHaveLength(
        3
      );

      const { db: countingDb, writes } = createWriteCountingDb(baseCtx.db);
      const prunedApi = ormFor(withoutRank).api();

      // Prune clears without rebuilding, so every write below belongs to the
      // clear campaign alone.
      await (prunedApi as any).aggregateBackfill.handler(
        { db: countingDb, scheduler: schedulerStub },
        { mode: 'prune', batchSize: 8 }
      );
      let cleared = false;
      for (let attempt = 0; attempt < 200; attempt += 1) {
        if (
          (await stateFor(baseCtx.db, RANK_STATE_KIND, 'rankUsers', 'by_score'))
            .length === 0
        ) {
          cleared = true;
          break;
        }
        await (prunedApi as any).aggregateBackfillChunk.handler(
          { db: countingDb, scheduler: schedulerStub },
          { tableName: 'rankUsers', indexName: 'by_score', batchSize: 8 }
        );
      }

      expect(cleared).toBe(true);
      expect(
        await membersFor(baseCtx.db, RANK_STATE_KIND, 'rankUsers', 'by_score')
      ).toHaveLength(0);
      expect(await treesFor(baseCtx.db, 'rankUsers', 'by_score')).toHaveLength(
        0
      );
      expect(await allNodes(baseCtx.db)).toHaveLength(0);

      // Every node is deleted exactly once and never patched on the way out.
      expect(writes.get('aggregate_rank_node') ?? 0).toBe(nodesBefore);
      // Every member row is deleted exactly once.
      expect(writes.get('aggregate_member') ?? 0).toBe(120);
    });
  });

  it('drops metric buckets and extrema without decrementing them first', async () => {
    const { schema, relations } = buildMetricClearFixtures({ extrema: true });
    const { relations: withoutIndex } = buildMetricClearFixtures({
      dropIndex: true,
    });
    const t = convexTest(schema);

    await t.run(async (baseCtx) => {
      const api = ormFor(relations).api();
      for (let org = 0; org < 3; org += 1) {
        for (let i = 0; i < 40; i += 1) {
          await baseCtx.db.insert('metricUsers', {
            orgId: `org-${org}`,
            score: i,
          });
        }
      }
      await backfillToReady(api, baseCtx.db);

      const bucketsBefore = (
        await bucketsFor(baseCtx.db, 'metricUsers', 'by_org')
      ).length;
      const extremaBefore = (
        await extremaFor(baseCtx.db, 'metricUsers', 'by_org')
      ).length;
      expect(bucketsBefore).toBe(3);
      expect(extremaBefore).toBeGreaterThan(0);

      const { db: countingDb, writes } = createWriteCountingDb(baseCtx.db);
      const prunedApi = ormFor(withoutIndex).api();

      await (prunedApi as any).aggregateBackfill.handler(
        { db: countingDb, scheduler: schedulerStub },
        { mode: 'prune', batchSize: 8 }
      );
      let cleared = false;
      for (let attempt = 0; attempt < 200; attempt += 1) {
        if (
          (
            await stateFor(
              baseCtx.db,
              METRIC_STATE_KIND,
              'metricUsers',
              'by_org'
            )
          ).length === 0
        ) {
          cleared = true;
          break;
        }
        await (prunedApi as any).aggregateBackfillChunk.handler(
          { db: countingDb, scheduler: schedulerStub },
          { tableName: 'metricUsers', indexName: 'by_org', batchSize: 8 }
        );
      }

      expect(cleared).toBe(true);
      expect(
        await membersFor(baseCtx.db, METRIC_STATE_KIND, 'metricUsers', 'by_org')
      ).toHaveLength(0);
      expect(
        await bucketsFor(baseCtx.db, 'metricUsers', 'by_org')
      ).toHaveLength(0);
      expect(
        await extremaFor(baseCtx.db, 'metricUsers', 'by_org')
      ).toHaveLength(0);

      expect(writes.get('aggregate_bucket') ?? 0).toBe(bucketsBefore);
      expect(writes.get('aggregate_extrema') ?? 0).toBe(extremaBefore);
      expect(writes.get('aggregate_member') ?? 0).toBe(120);
    });
  });
});
