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
import { clearCountIndexChunk } from './runtime';
import { AGGREGATE_BUCKET_TABLE, AGGREGATE_MEMBER_TABLE } from './schema';

const reconcileUsers = convexTable(
  'ra_users',
  {
    orgId: text().notNull(),
    score: integer().notNull(),
  },
  (t) => [aggregateIndex('by_org').on(t.orgId).sum(t.score)]
);

const schema = defineSchema({ ra_users: reconcileUsers });

const schedulerStub = { runAfter: vi.fn(async () => undefined) };
const passthroughInternalMutation = ((definition: unknown) =>
  definition) as never;
const passthroughInternalQuery = ((definition: unknown) => definition) as never;

const createOrmClient = (triggers?: any) =>
  createOrm({
    capabilities: [aggregateCapability()],
    schema: triggers
      ? defineSchema({ ra_users: reconcileUsers }).triggers(triggers)
      : schema,
    ormFunctions: {
      scheduledDelete: {} as any,
      scheduledMutationBatch: {} as any,
    },
    internalMutation: passthroughInternalMutation,
    internalQuery: passthroughInternalQuery,
  });

type Probes = { buckets: number; members: number };

/**
 * Counts the two point lookups aggregate reconciliation makes per written row:
 * `getBucketByKey`'s `by_table_index_hash` probe and `getMemberByDoc`'s
 * `by_kind_table_index_doc` probe. Each is the only user of its index on the
 * write path, so counting the index open isolates them from the rest of
 * aggregate upkeep.
 *
 * Must wrap the writer before the ORM is built: the lifecycle wrapper binds
 * `innerDb.query` at wrap time, so a counter installed later sees nothing.
 */
const countReconcileProbes = (db: any, counts: Probes) => {
  const tracked: Record<string, keyof Probes> = {
    [`${AGGREGATE_BUCKET_TABLE} by_table_index_hash`]: 'buckets',
    [`${AGGREGATE_MEMBER_TABLE} by_kind_table_index_doc`]: 'members',
  };

  return new Proxy(db, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target);
      if (typeof value !== 'function') {
        return value;
      }
      if (prop !== 'query') {
        return value.bind(target);
      }
      return (table: string) => {
        const query = value.call(target, table);
        return new Proxy(query, {
          get(queryTarget: any, queryProp) {
            const queryValue = Reflect.get(queryTarget, queryProp, queryTarget);
            if (typeof queryValue !== 'function') {
              return queryValue;
            }
            if (queryProp !== 'withIndex') {
              return queryValue.bind(queryTarget);
            }
            return (indexName: string, ...rest: unknown[]) => {
              const counter = tracked[`${table} ${indexName}`];
              if (counter) {
                counts[counter] += 1;
              }
              return queryValue.call(queryTarget, indexName, ...rest);
            };
          },
        });
      };
    },
  });
};

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

const rows = (count: number, orgId = 'org-1') =>
  Array.from({ length: count }, (_, index) => ({ orgId, score: index }));

const ROW_COUNT = 12;
/** 0 + 1 + ... + 11 */
const SCORE_SUM = 66;

const probeCtx = (baseDb: any) => {
  const counts: Probes = { buckets: 0, members: 0 };
  const db = countReconcileProbes(baseDb, counts);
  const ctx = createOrmClient().with({
    db: db as any,
    scheduler: schedulerStub as any,
  });
  return { counts, ctx, db };
};

/**
 * Seeds through the raw writer and backfills in their own transaction, so the
 * measured transaction starts with an empty memo. Seeding through the ORM would
 * leave the buckets and member rows it wrote already memoized, and the numbers
 * below would then measure the seed rather than the statement.
 */
const withSeededRows = async (
  run: (args: {
    ctx: any;
    counts: Probes;
    baseDb: any;
    db: any;
  }) => Promise<void>
) => {
  const t = convexTest(schema);
  const ormClient = createOrmClient();

  await t.run(async (baseCtx) => {
    for (const row of rows(ROW_COUNT)) {
      await baseCtx.db.insert('ra_users', row);
    }
    await backfillToReady(ormClient.api(), baseCtx.db);
  });

  await t.run(async (baseCtx) => {
    const { counts, ctx, db } = probeCtx(baseCtx.db);
    await run({ ctx, counts, baseDb: baseCtx.db, db });
  });
};

const bucketsIn = async (db: any) =>
  (await db.query(AGGREGATE_BUCKET_TABLE).collect()) as any[];

describe('aggregate reconciliation read amplification', () => {
  test('nested writes from an insert policy expire earlier row snapshots', async () => {
    let calls = 0;
    let invokeNested: () => Promise<unknown>;
    const policyUsers = convexTable(
      'ra_users',
      { orgId: text().notNull(), score: integer().notNull() },
      (table) => [
        aggregateIndex('by_org').on(table.orgId).sum(table.score),
        rlsPolicy('insert_org', {
          for: 'insert',
          withCheck: async () => {
            calls += 1;
            if (calls === 2) await invokeNested();
            return eq(table.orgId, 'org-1');
          },
        }),
      ]
    );
    const insertRow = mutationGeneric({
      args: {},
      handler: async (innerCtx) => {
        await createOrmClient()
          .with({ db: innerCtx.db })
          .orm.insert(reconcileUsers)
          .values(rows(1))
          .execute();
      },
    });
    const t = convexTestWithModules(schema, {
      './_generated/server.ts': async () => ({ mutation: mutationGeneric }),
      './nested.ts': async () => ({ insertRow }),
    });
    await t.run(async (baseCtx) => {
      invokeNested = () =>
        baseCtx.runMutation(
          makeFunctionReference<'mutation'>('nested:insertRow'),
          {}
        );
      await backfillToReady(createOrmClient().api(), baseCtx.db);
      const ctx = createOrm({
        schema: defineSchema({ ra_users: policyUsers }),
        capabilities: [aggregateCapability()],
      }).with({ db: baseCtx.db });
      await ctx.orm.insert(policyUsers).values(rows(2)).execute();
      expect(calls).toBe(2);
      expect(
        await createOrmClient()
          .with({ db: baseCtx.db })
          .orm.query.ra_users.count({ where: { orgId: 'org-1' } })
      ).toBe(3);
    });
  });

  test('a nested mutation in a change hook stays visible within a bulk statement', async () => {
    const insertRow = mutationGeneric({
      args: {},
      handler: async (innerCtx) => {
        const ctx = createOrmClient().with({
          db: innerCtx.db,
          scheduler: schedulerStub as never,
        });
        await ctx.orm.insert(reconcileUsers).values(rows(1)).execute();
      },
    });
    const t = convexTestWithModules(schema, {
      './_generated/server.ts': async () => ({ mutation: mutationGeneric }),
      './nested.ts': async () => ({ insertRow }),
    });
    await t.run(async (baseCtx) => {
      await backfillToReady(createOrmClient().api(), baseCtx.db);
      let called = false;
      const ctx = createOrmClient({
        ra_users: {
          change: async () => {
            if (called) return;
            called = true;
            await baseCtx.runMutation(
              makeFunctionReference<'mutation'>('nested:insertRow'),
              {}
            );
          },
        },
      }).with({ db: baseCtx.db, scheduler: schedulerStub as never });
      await ctx.orm.insert(reconcileUsers).values(rows(2)).execute();
      expect(called).toBe(true);
      expect(
        await ctx.orm.query.ra_users.count({ where: { orgId: 'org-1' } })
      ).toBe(3);
    });
  });

  test('nested mutation writes remain visible to later outer writes', async () => {
    const insertRow = mutationGeneric({
      args: {},
      handler: async (innerCtx) => {
        const ctx = createOrmClient().with({
          db: innerCtx.db,
          scheduler: schedulerStub as never,
        });
        await ctx.orm.insert(reconcileUsers).values(rows(1)).execute();
      },
    });
    const t = convexTestWithModules(schema, {
      './_generated/server.ts': async () => ({ mutation: mutationGeneric }),
      './nested.ts': async () => ({ insertRow }),
    });

    await t.run(async (baseCtx) => {
      await backfillToReady(createOrmClient().api(), baseCtx.db);
      const { ctx } = probeCtx(baseCtx.db);
      await ctx.orm.insert(reconcileUsers).values(rows(1)).execute();
      await baseCtx.runMutation(
        makeFunctionReference<'mutation'>('nested:insertRow'),
        {}
      );
      await ctx.orm.insert(reconcileUsers).values(rows(1)).execute();

      expect(
        await ctx.orm.query.ra_users.count({ where: { orgId: 'org-1' } })
      ).toBe(3);
    });
  });

  test('a bulk insert probes one bucket per distinct key tuple', async () => {
    const t = convexTest(schema);

    await t.run(async (baseCtx) => {
      const { counts, ctx } = probeCtx(baseCtx.db);

      await ctx.orm.insert(reconcileUsers).values(rows(ROW_COUNT)).execute();

      // One key tuple, so one bucket probe however many rows land in it.
      expect(counts.buckets).toBe(1);
      // A brand new document has no member row to find, and nothing memoized
      // one for it: this is the read the memo cannot buy back.
      expect(counts.members).toBe(ROW_COUNT);

      const buckets = await bucketsIn(baseCtx.db);
      expect(buckets).toHaveLength(1);
      expect(buckets[0].count).toBe(ROW_COUNT);
      expect(buckets[0].sumValues.score).toBe(SCORE_SUM);
    });
  });

  test('a bulk update probes each key tuple once, not twice per row', async () => {
    await withSeededRows(async ({ ctx, counts, baseDb }) => {
      await ctx.orm
        .update(reconcileUsers)
        .set({ orgId: 'org-2' })
        .allowFullScan();

      // Every row carries a remove-bucket and an add-bucket delta, and the whole
      // statement shares both tuples.
      expect(counts.buckets).toBe(2);
      expect(counts.members).toBe(ROW_COUNT);

      const buckets = await bucketsIn(baseDb);
      expect(buckets).toHaveLength(1);
      expect(buckets[0].keyParts).toEqual(['org-2']);
      expect(buckets[0].count).toBe(ROW_COUNT);
      expect(buckets[0].sumValues.score).toBe(SCORE_SUM);
    });
  });

  test('a bulk delete probes one bucket per distinct key tuple', async () => {
    await withSeededRows(async ({ ctx, counts, baseDb }) => {
      await ctx.orm.delete(reconcileUsers).allowFullScan();

      expect(counts.buckets).toBe(1);
      expect(counts.members).toBe(ROW_COUNT);
      expect(await bucketsIn(baseDb)).toHaveLength(0);
      expect(await baseDb.query(AGGREGATE_MEMBER_TABLE).collect()).toHaveLength(
        0
      );
    });
  });

  test('a later statement reloads members and probes each bucket once', async () => {
    await withSeededRows(async ({ ctx, counts, baseDb }) => {
      await ctx.orm
        .update(reconcileUsers)
        .set({ orgId: 'org-2' })
        .allowFullScan();

      counts.buckets = 0;
      counts.members = 0;
      await ctx.orm
        .update(reconcileUsers)
        .set({ orgId: 'org-3' })
        .allowFullScan();

      // User code between statements may write through a nested UDF.
      expect(counts.buckets).toBe(2);
      expect(counts.members).toBe(ROW_COUNT);

      const buckets = await bucketsIn(baseDb);
      expect(buckets).toHaveLength(1);
      expect(buckets[0].keyParts).toEqual(['org-3']);
      expect(buckets[0].count).toBe(ROW_COUNT);
      expect(buckets[0].sumValues.score).toBe(SCORE_SUM);
    });
  });

  test('reconciliation still serves the transaction its own writes', async () => {
    await withSeededRows(async ({ ctx }) => {
      expect(
        await ctx.orm.query.ra_users.count({ where: { orgId: 'org-1' } })
      ).toBe(ROW_COUNT);

      await ctx.orm.insert(reconcileUsers).values(rows(3, 'org-1')).execute();
      expect(
        await ctx.orm.query.ra_users.count({ where: { orgId: 'org-1' } })
      ).toBe(ROW_COUNT + 3);

      await ctx.orm
        .update(reconcileUsers)
        .set({ orgId: 'org-2' })
        .allowFullScan();
      expect(
        await ctx.orm.query.ra_users.count({ where: { orgId: 'org-1' } })
      ).toBe(0);
      expect(
        await ctx.orm.query.ra_users.count({ where: { orgId: 'org-2' } })
      ).toBe(ROW_COUNT + 3);

      await ctx.orm.delete(reconcileUsers).allowFullScan();
      expect(
        await ctx.orm.query.ra_users.count({ where: { orgId: 'org-2' } })
      ).toBe(0);
    });
  });

  /**
   * `clearCountIndexChunk` deletes bucket and member rows outright instead of
   * routing them through the delta machinery, so it is the one writer that has
   * to retire memo entries by hand.
   */
  test('a cleared index does not leave memoized rows behind', async () => {
    await withSeededRows(async ({ ctx, baseDb, db }) => {
      expect(
        await ctx.orm.query.ra_users.count({ where: { orgId: 'org-1' } })
      ).toBe(ROW_COUNT);

      // Warm the memo through the write path, then drop the stored state under
      // it in the same transaction. The clear runs on the db the ORM was built
      // over, which is what puts both on one memo.
      await ctx.orm.insert(reconcileUsers).values(rows(1, 'org-1')).execute();

      for (let attempt = 0; attempt < 20; attempt += 1) {
        const step = await clearCountIndexChunk(db, 'ra_users', 'by_org', 100);
        if (step.done) {
          break;
        }
      }
      expect(await bucketsIn(baseDb)).toHaveLength(0);

      // A stale bucket entry would resurrect the cleared count here.
      await ctx.orm.insert(reconcileUsers).values(rows(1, 'org-1')).execute();
      const buckets = await bucketsIn(baseDb);
      expect(buckets).toHaveLength(1);
      expect(buckets[0].count).toBe(1);
    });
  });
});
