import { describe, expect, test, vi } from 'vitest';
import { convexTest } from '../../../../../convex/setup.testing';
import {
  aggregateIndex,
  convexTable,
  createOrm,
  defineSchema,
  integer,
  text,
} from '..';
import { aggregateCapability } from './capability';
import { COUNT_STATUS_CLEARING, setCountState } from './runtime';
import { AGGREGATE_STATE_TABLE } from './schema';

const barrierUsers = convexTable(
  'wb_users',
  {
    orgId: text().notNull(),
    score: integer().notNull(),
  },
  (t) => [aggregateIndex('by_org').on(t.orgId)]
);

const schema = defineSchema({ wb_users: barrierUsers });

const CLEARING_RE = /CLEARING/;

const schedulerStub = { runAfter: vi.fn(async () => undefined) };
const passthroughInternalMutation = ((definition: unknown) =>
  definition) as never;

const createOrmClient = () =>
  createOrm({
    capabilities: [aggregateCapability()],
    schema,
    ormFunctions: {
      scheduledDelete: {} as any,
      scheduledMutationBatch: {} as any,
    },
    internalMutation: passthroughInternalMutation,
  });

/**
 * Counts `by_table_status` ranges opened on `aggregate_state`. That index is
 * the write barrier's alone; aggregate maintenance reads state rows through
 * `by_kind_table_index`, so this isolates the barrier from index upkeep.
 *
 * Must wrap the writer before the ORM is built: the lifecycle wrapper binds
 * `innerDb.query` at wrap time, so a counter installed later sees nothing.
 */
const countBarrierProbes = (db: any, counts: { probes: number }) =>
  new Proxy(db, {
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
        if (table !== AGGREGATE_STATE_TABLE) {
          return query;
        }
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
              if (indexName === 'by_table_status') {
                counts.probes += 1;
              }
              return queryValue.call(queryTarget, indexName, ...rest);
            };
          },
        });
      };
    },
  });

const rows = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    orgId: 'org-1',
    score: index,
  }));

describe('aggregate write barrier read amplification', () => {
  test('the CLEARING probe does not scale with written rows', async () => {
    const t = convexTest(schema);

    await t.run(async (baseCtx) => {
      const counts = { probes: 0 };
      const ctx = createOrmClient().with({
        db: countBarrierProbes(baseCtx.db, counts) as any,
        scheduler: schedulerStub as any,
      });

      await ctx.orm.insert(barrierUsers).values(rows(12)).execute();

      expect(counts.probes).toBe(1);
      expect(await baseCtx.db.query('wb_users').collect()).toHaveLength(12);
    });
  });

  test('the memo is per transaction, not per isolate', async () => {
    const ormClient = createOrmClient();

    const cleanRun = convexTest(schema);
    await cleanRun.run(async (baseCtx) => {
      const ctx = ormClient.with({
        db: baseCtx.db,
        scheduler: schedulerStub as any,
      });
      await ctx.orm.insert(barrierUsers).values(rows(2)).execute();
    });

    // A fresh transaction whose state row is CLEARING must still be rejected,
    // which a closure-scoped flag on the barrier would have made impossible.
    const clearingRun = convexTest(schema);
    await clearingRun.run(async (baseCtx) => {
      await baseCtx.db.insert(AGGREGATE_STATE_TABLE, {
        kind: 'metric',
        tableKey: 'wb_users',
        indexName: 'by_org',
        keyDefinitionHash: '',
        metricDefinitionHash: '',
        status: 'CLEARING',
        cursor: null,
        processed: 0,
        startedAt: 0,
        updatedAt: 0,
        completedAt: null,
        lastError: null,
      } as any);

      const ctx = ormClient.with({
        db: baseCtx.db,
        scheduler: schedulerStub as any,
      });

      await expect(
        ctx.orm.insert(barrierUsers).values(rows(1)).execute()
      ).rejects.toThrow(CLEARING_RE);
    });
  });

  /**
   * `setCountState` is the only writer that can move a state row into CLEARING,
   * so a clean probe taken before it must not survive it — including when a
   * mutation reaches the backfill through `ctx.runMutation`, whose nested
   * invocation no transaction-scoped invalidation could reach.
   */
  test('a state row that turns CLEARING mid-transaction still blocks', async () => {
    const t = convexTest(schema);

    await t.run(async (baseCtx) => {
      const ctx = createOrmClient().with({
        db: baseCtx.db,
        scheduler: schedulerStub as any,
      });

      await ctx.orm.insert(barrierUsers).values(rows(2)).execute();

      await setCountState(
        baseCtx.db as any,
        {
          tableName: 'wb_users',
          indexName: 'by_org',
          keyDefinitionHash: '',
          metricDefinitionHash: '',
          status: COUNT_STATUS_CLEARING,
          cursor: null,
          processed: 0,
          startedAt: 0,
          updatedAt: 0,
          completedAt: null,
          lastError: null,
        } as any
      );

      await expect(
        ctx.orm.insert(barrierUsers).values(rows(1)).execute()
      ).rejects.toThrow(CLEARING_RE);
    });
  });
});
