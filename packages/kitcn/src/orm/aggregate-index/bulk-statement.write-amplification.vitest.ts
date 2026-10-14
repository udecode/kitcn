import { makeFunctionReference, mutationGeneric } from 'convex/server';
import { convexTest as convexTestWithModules } from 'convex-test';
import { describe, expect, test, vi } from 'vitest';
import { convexTest } from '../../../../../convex/setup.testing';
import {
  aggregateIndex,
  convexTable,
  createOrm,
  defineSchema,
  eq,
  integer,
  rlsPolicy,
  text,
} from '..';
import { aggregateCapability } from './capability';
import {
  AGGREGATE_BUCKET_TABLE,
  AGGREGATE_EXTREMA_TABLE,
  AGGREGATE_MEMBER_TABLE,
} from './schema';

const bulkPosts = convexTable(
  'bs_posts',
  {
    orgId: text().notNull(),
    score: integer().notNull(),
    // Deliberately outside the index, so a statement can write the table
    // without reconciling anything.
    title: text(),
  },
  (t) => [aggregateIndex('by_org').on(t.orgId).sum(t.score).max(t.score)]
);

const schema = defineSchema({ bs_posts: bulkPosts });

const schedulerStub = { runAfter: vi.fn(async () => undefined) };
const passthroughInternalMutation = ((definition: unknown) =>
  definition) as never;
const passthroughInternalQuery = ((definition: unknown) => definition) as never;

const createOrmClient = (ormSchema: unknown = schema) =>
  createOrm({
    capabilities: [aggregateCapability()],
    schema: ormSchema as typeof schema,
    ormFunctions: {
      scheduledDelete: {} as any,
      scheduledMutationBatch: {} as any,
    },
    internalMutation: passthroughInternalMutation,
    internalQuery: passthroughInternalQuery,
  });

/** Drives the backfill handlers so aggregate reads are allowed to answer. */
const backfillToReady = async (api: any, db: any) => {
  await api.aggregateBackfill.handler({ db, scheduler: schedulerStub }, {});
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const states = await api.aggregateBackfillStatus.handler(
      { db, scheduler: schedulerStub },
      {}
    );
    if (states.every((entry: any) => entry.status === 'READY')) {
      return;
    }
    await api.aggregateBackfillChunk.handler(
      { db, scheduler: schedulerStub },
      {}
    );
  }
  throw new Error('backfill did not reach READY');
};

type Counts = {
  bucketReads: number;
  bucketWrites: number;
  extremaReads: number;
  extremaWrites: number;
  memberWrites: number;
};

const emptyCounts = (): Counts => ({
  bucketReads: 0,
  bucketWrites: 0,
  extremaReads: 0,
  extremaWrites: 0,
  memberWrites: 0,
});

const READ_BY_TABLE: Record<string, keyof Counts> = {
  [AGGREGATE_BUCKET_TABLE]: 'bucketReads',
  [AGGREGATE_EXTREMA_TABLE]: 'extremaReads',
};

const WRITE_BY_TABLE: Record<string, keyof Counts> = {
  [AGGREGATE_BUCKET_TABLE]: 'bucketWrites',
  [AGGREGATE_EXTREMA_TABLE]: 'extremaWrites',
  [AGGREGATE_MEMBER_TABLE]: 'memberWrites',
};

/**
 * Counts index ranges opened on, and documents written to, the aggregate
 * storage tables.
 *
 * Must wrap the writer before the ORM is built: the lifecycle wrapper binds
 * `innerDb.query` at wrap time, so a counter installed later sees nothing.
 * Aggregate maintenance always names the table explicitly, so keying off the
 * first argument never mistakes a document id for a table.
 */
const countAggregateStorageIo = (db: any, counts: Counts) =>
  new Proxy(db, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target);
      if (typeof value !== 'function') {
        return value;
      }
      if (
        prop !== 'query' &&
        prop !== 'insert' &&
        prop !== 'patch' &&
        prop !== 'replace' &&
        prop !== 'delete'
      ) {
        return value.bind(target);
      }
      return (...args: unknown[]) => {
        const table = typeof args[0] === 'string' ? args[0] : undefined;
        const counter =
          table === undefined
            ? undefined
            : prop === 'query'
              ? READ_BY_TABLE[table]
              : WRITE_BY_TABLE[table];
        if (counter) {
          counts[counter] += 1;
        }
        return value.apply(target, args);
      };
    },
  });

const ROW_COUNT = 40;

const rowsOf = (orgId: string, score: number) =>
  Array.from({ length: ROW_COUNT }, () => ({ orgId, score }));

/**
 * A counting ORM context over a READY index. The backfill runs against the raw
 * writer so its own writes never land in the counters.
 */
const readyCountingCtx = async (baseCtx: any, counts: Counts) => {
  const ormClient = createOrmClient();
  await backfillToReady(ormClient.api(), baseCtx.db);
  return ormClient.with({
    db: countAggregateStorageIo(baseCtx.db, counts) as any,
    scheduler: schedulerStub as any,
  });
};

const nestedReadCount = mutationGeneric({
  args: {},
  handler: async (innerCtx) =>
    await createOrmClient()
      .with({ db: innerCtx.db })
      .orm.query.bs_posts.count({ where: { orgId: 'org-1' } }),
});

const nestedCountTest = () =>
  convexTestWithModules(schema, {
    './_generated/server.ts': async () => ({ mutation: mutationGeneric }),
    './nested.ts': async () => ({ readCount: nestedReadCount }),
  });

describe('bulk statement aggregate write amplification', () => {
  test('a nested mutation called by an insert policy sees prior rows', async () => {
    const t = nestedCountTest();
    await t.run(async (baseCtx) => {
      const observed: number[] = [];
      const policyPosts = convexTable(
        'bs_posts',
        { orgId: text().notNull(), score: integer().notNull(), title: text() },
        (table) => [
          aggregateIndex('by_org')
            .on(table.orgId)
            .sum(table.score)
            .max(table.score),
          rlsPolicy('insert_org', {
            for: 'insert',
            withCheck: async () => {
              observed.push(
                await baseCtx.runMutation(
                  makeFunctionReference<'mutation'>('nested:readCount'),
                  {}
                )
              );
              return eq(table.orgId, 'org-1');
            },
          }),
        ]
      );
      await backfillToReady(createOrmClient().api(), baseCtx.db);
      await createOrmClient(defineSchema({ bs_posts: policyPosts }))
        .with({ db: baseCtx.db })
        .orm.insert(policyPosts)
        .values(Array.from({ length: 4 }, () => ({ orgId: 'org-1', score: 1 })))
        .execute();

      expect(observed).toEqual([0, 1, 2, 3]);
    });
  });

  test('a nested mutation called by a change hook sees the rows already written', async () => {
    const t = nestedCountTest();
    await t.run(async (baseCtx) => {
      const observed: number[] = [];
      const client = createOrmClient(
        defineSchema({ bs_posts: bulkPosts }).triggers({
          bs_posts: {
            change: async () => {
              observed.push(
                await baseCtx.runMutation(
                  makeFunctionReference<'mutation'>('nested:readCount'),
                  {}
                )
              );
            },
          },
        })
      );
      await backfillToReady(client.api(), baseCtx.db);
      await client
        .with({ db: baseCtx.db })
        .orm.insert(bulkPosts)
        .values(Array.from({ length: 4 }, () => ({ orgId: 'org-1', score: 1 })))
        .execute();

      expect(observed).toEqual([1, 2, 3, 4]);
    });
  });

  test('a bulk update writes one bucket per distinct key tuple, not one per row', async () => {
    const t = convexTest(schema);

    await t.run(async (baseCtx) => {
      const counts = emptyCounts();
      const ctx = await readyCountingCtx(baseCtx, counts);

      await ctx.orm.insert(bulkPosts).values(rowsOf('org-1', 1)).execute();

      const seeded = { ...counts };

      await ctx.orm
        .update(bulkPosts)
        .set({ score: 2 })
        .where(eq(bulkPosts.orgId, 'org-1'))
        .allowFullScan()
        .execute();

      // One key tuple, so one bucket document: reading and rewriting it once
      // per row is what makes a 10k-row statement blow the mutation budget.
      expect(counts.bucketReads - seeded.bucketReads).toBe(1);
      expect(counts.bucketWrites - seeded.bucketWrites).toBe(1);
      // Member rows are inherently one per document and stay eager.
      expect(counts.memberWrites - seeded.memberWrites).toBe(ROW_COUNT);

      expect(
        await ctx.orm.query.bs_posts.aggregate({
          where: { orgId: 'org-1' },
          _sum: { score: true },
        })
      ).toEqual({ _sum: { score: ROW_COUNT * 2 } });
      expect(
        await ctx.orm.query.bs_posts.count({ where: { orgId: 'org-1' } })
      ).toBe(ROW_COUNT);
    });
  });

  test('a bulk update that moves every row between key tuples writes two buckets', async () => {
    const t = convexTest(schema);

    await t.run(async (baseCtx) => {
      const counts = emptyCounts();
      const ctx = await readyCountingCtx(baseCtx, counts);

      await ctx.orm.insert(bulkPosts).values(rowsOf('org-1', 7)).execute();

      const seeded = { ...counts };

      await ctx.orm
        .update(bulkPosts)
        .set({ orgId: 'org-2' })
        .where(eq(bulkPosts.orgId, 'org-1'))
        .allowFullScan()
        .execute();

      // The rows leave `org-1` and join `org-2`: two bucket documents for the
      // whole statement, one read and one write each.
      expect(counts.bucketReads - seeded.bucketReads).toBe(2);
      expect(counts.bucketWrites - seeded.bucketWrites).toBe(2);
      // Every row shares one score, so the extrema rows fold the same way.
      expect(counts.extremaWrites - seeded.extremaWrites).toBe(2);

      expect(
        await ctx.orm.query.bs_posts.count({ where: { orgId: 'org-1' } })
      ).toBe(0);
      expect(
        await ctx.orm.query.bs_posts.count({ where: { orgId: 'org-2' } })
      ).toBe(ROW_COUNT);
      expect(
        await ctx.orm.query.bs_posts.aggregate({
          where: { orgId: 'org-2' },
          _max: { score: true },
        })
      ).toEqual({ _max: { score: 7 } });
      expect(
        await ctx.orm.query.bs_posts.aggregate({
          where: { orgId: 'org-1' },
          _max: { score: true },
        })
      ).toEqual({ _max: { score: null } });
    });
  });

  test('a bulk delete drains the bucket in one write', async () => {
    const t = convexTest(schema);

    await t.run(async (baseCtx) => {
      const counts = emptyCounts();
      const ctx = await readyCountingCtx(baseCtx, counts);

      await ctx.orm.insert(bulkPosts).values(rowsOf('org-1', 3)).execute();

      const seeded = { ...counts };

      await ctx.orm
        .delete(bulkPosts)
        .where(eq(bulkPosts.orgId, 'org-1'))
        .allowFullScan()
        .execute();

      expect(counts.bucketReads - seeded.bucketReads).toBe(1);
      expect(counts.bucketWrites - seeded.bucketWrites).toBe(1);

      expect(
        await ctx.orm.query.bs_posts.count({ where: { orgId: 'org-1' } })
      ).toBe(0);
    });
  });

  test('a bulk insert writes one bucket for the whole statement', async () => {
    const t = convexTest(schema);

    await t.run(async (baseCtx) => {
      const counts = emptyCounts();
      const ctx = await readyCountingCtx(baseCtx, counts);

      await ctx.orm.insert(bulkPosts).values(rowsOf('org-1', 5)).execute();

      expect(counts.bucketReads).toBe(1);
      expect(counts.bucketWrites).toBe(1);
      expect(counts.memberWrites).toBe(ROW_COUNT);

      expect(
        await ctx.orm.query.bs_posts.count({ where: { orgId: 'org-1' } })
      ).toBe(ROW_COUNT);
      expect(
        await ctx.orm.query.bs_posts.aggregate({
          where: { orgId: 'org-1' },
          _sum: { score: true },
        })
      ).toEqual({ _sum: { score: ROW_COUNT * 5 } });
    });
  });

  test('a trigger reading an aggregate mid-statement still sees its own writes', async () => {
    const t = convexTest(schema);

    await t.run(async (baseCtx) => {
      const observed: number[] = [];
      const ormClient = createOrmClient(
        defineSchema({ bs_posts: bulkPosts }).triggers({
          bs_posts: {
            change: async (_change: unknown, hookCtx: any) => {
              observed.push(
                await hookCtx.orm.query.bs_posts.count({
                  where: { orgId: 'org-1' },
                })
              );
            },
          },
        } as any)
      );
      await backfillToReady(ormClient.api(), baseCtx.db);
      const ctx = ormClient.with({
        db: baseCtx.db,
        scheduler: schedulerStub as any,
      });

      await ctx.orm
        .insert(bulkPosts)
        .values(Array.from({ length: 4 }, () => ({ orgId: 'org-1', score: 1 })))
        .execute();

      // Each trigger observes its own row plus every row written before it.
      expect(observed).toEqual([1, 2, 3, 4]);
    });
  });

  test('repeated multi-metric reads observe each intervening statement row', async () => {
    const t = convexTest(schema);

    await t.run(async (baseCtx) => {
      const observed: unknown[] = [];
      const ormClient = createOrmClient(
        defineSchema({ bs_posts: bulkPosts }).triggers({
          bs_posts: {
            change: async () => {
              observed.push(
                await ctx.orm.query.bs_posts.aggregate({
                  where: { orgId: 'org-1' },
                  _sum: { score: true },
                  _max: { score: true },
                })
              );
            },
          },
        } as any)
      );
      await backfillToReady(ormClient.api(), baseCtx.db);
      const ctx = ormClient.with({
        db: baseCtx.db,
        scheduler: schedulerStub as any,
      });

      await ctx.orm
        .insert(bulkPosts)
        .values([1, 2, 3, 4].map((score) => ({ orgId: 'org-1', score })))
        .execute();

      expect(observed).toEqual([
        { _sum: { score: 1 }, _max: { score: 1 } },
        { _sum: { score: 3 }, _max: { score: 2 } },
        { _sum: { score: 6 }, _max: { score: 3 } },
        { _sum: { score: 10 }, _max: { score: 4 } },
      ]);
    });
  });

  /**
   * The queue is anchored on the transaction, and three first-party ways of
   * reaching an ORM resolve that anchor through different object graphs: the
   * hook's own `ctx.orm`, an ORM rebuilt on the hook ctx (what an in-process
   * cRPC caller does), and `withoutTriggers`, which re-roots on the raw writer.
   * Each has to reach the same queue or it serves pre-statement buckets.
   *
   * One probe per run on purpose: the first read drains, so two probes in one
   * trigger would leave the second asserting nothing.
   */
  describe.each([
    [
      'the hook ctx orm',
      (hookCtx: any, _client: any, where: any) =>
        hookCtx.orm.query.bs_posts.count(where),
    ],
    [
      'an orm rebuilt on the hook ctx',
      (hookCtx: any, client: any, where: any) =>
        client.with(hookCtx).orm.query.bs_posts.count(where),
    ],
    [
      'withoutTriggers',
      (hookCtx: any, _client: any, where: any) =>
        hookCtx.orm.withoutTriggers((orm: any) =>
          orm.query.bs_posts.count(where)
        ),
    ],
  ])('reading mid-statement through %s', (_label, read) => {
    test('sees the rows the statement has already written', async () => {
      const t = convexTest(schema);

      await t.run(async (baseCtx) => {
        const observed: number[] = [];
        let client: any;

        const ormClient = createOrmClient(
          defineSchema({ bs_posts: bulkPosts }).triggers({
            bs_posts: {
              change: async (_change: unknown, hookCtx: any) => {
                observed.push(
                  await read(hookCtx, client, { where: { orgId: 'org-1' } })
                );
              },
            },
          } as any)
        );
        client = ormClient;
        await backfillToReady(ormClient.api(), baseCtx.db);
        const ctx = ormClient.with({
          db: baseCtx.db,
          scheduler: schedulerStub as any,
        });

        await ctx.orm
          .insert(bulkPosts)
          .values(
            Array.from({ length: 4 }, () => ({ orgId: 'org-1', score: 1 }))
          )
          .execute();

        expect(observed).toEqual([1, 2, 3, 4]);
      });
    });
  });

  /**
   * `applyBucketDelta` patches an absolute count derived from the row it just
   * read, so a queued write and a raw write landing on the same bucket would be
   * a lost update, not a reorder. The serialization that rules that out is
   * pinned directly in `write-batch.test.ts`; this is the end-to-end shape it
   * exists for — a statement and a raw writer moving rows into the same bucket
   * in one mutation.
   */
  test('a raw write interleaved with the statement does not lose a bucket update', async () => {
    const t = convexTest(schema);

    await t.run(async (baseCtx) => {
      const ctx = await readyCountingCtx(baseCtx, emptyCounts());

      // The statement's row loop is short and the raw loop long on purpose:
      // the race window opens once the statement has left its loop and is
      // draining while the raw writer is still reconciling row by row.
      const statementRows = 3;
      await ctx.orm
        .insert(bulkPosts)
        .values(
          Array.from({ length: statementRows }, () => ({
            orgId: 'org-1',
            score: 1,
          }))
        )
        .execute();
      const rawIds: string[] = [];
      for (let index = 0; index < ROW_COUNT; index += 1) {
        rawIds.push(
          (await ctx.db.insert('bs_posts', {
            orgId: 'org-3',
            score: 1,
          })) as unknown as string
        );
      }

      await Promise.all([
        ctx.orm
          .update(bulkPosts)
          .set({ orgId: 'org-2' })
          .where(eq(bulkPosts.orgId, 'org-1'))
          .allowFullScan()
          .execute(),
        (async () => {
          for (const id of rawIds) {
            await ctx.db.patch(id as any, { orgId: 'org-2' });
          }
        })(),
      ]);

      const moved = statementRows + rawIds.length;
      expect(
        await ctx.orm.query.bs_posts.count({ where: { orgId: 'org-2' } })
      ).toBe(moved);
      expect(
        await ctx.orm.query.bs_posts.count({ where: { orgId: 'org-1' } })
      ).toBe(0);
      expect(
        await ctx.orm.query.bs_posts.count({ where: { orgId: 'org-3' } })
      ).toBe(0);
      expect(
        await ctx.orm.query.bs_posts.aggregate({
          where: { orgId: 'org-2' },
          _sum: { score: true },
        })
      ).toEqual({ _sum: { score: moved } });
      // A lost update also duplicates: two writers can both miss the bucket and
      // both insert one, after which every later delta pins to whichever row
      // `getBucketByKey` returns first.
      expect(
        await baseCtx.db
          .query(AGGREGATE_BUCKET_TABLE)
          .withIndex('by_table_index', (q: any) =>
            q.eq('tableKey', 'bs_posts').eq('indexName', 'by_org')
          )
          .collect()
      ).toHaveLength(1);
    });
  });

  test('a statement that touches no aggregated field queues nothing', async () => {
    const t = convexTest(schema);

    await t.run(async (baseCtx) => {
      const counts = emptyCounts();
      const ctx = await readyCountingCtx(baseCtx, counts);

      await ctx.orm.insert(bulkPosts).values(rowsOf('org-1', 1)).execute();

      const seeded = { ...counts };

      await ctx.orm
        .update(bulkPosts)
        .set({ title: 'renamed' })
        .where(eq(bulkPosts.orgId, 'org-1'))
        .allowFullScan()
        .execute();

      expect(counts.bucketReads - seeded.bucketReads).toBe(0);
      expect(counts.bucketWrites - seeded.bucketWrites).toBe(0);
      expect(counts.extremaWrites - seeded.extremaWrites).toBe(0);
      expect(counts.memberWrites - seeded.memberWrites).toBe(0);
    });
  });
});
