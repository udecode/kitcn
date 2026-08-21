import type {
  GenericDatabaseWriter,
  SchedulableFunctionReference,
} from 'convex/server';
import { describe, expect, test } from 'vitest';
import {
  convexTest,
  countDocumentReads,
  withOrm,
} from '../../../../convex/setup.testing';
import {
  convexTable,
  defineRelations,
  defineSchema,
  eq,
  extractRelationsConfig,
  foreignKey,
  id,
  index,
  integer,
  scheduledMutationBatchFactory,
  text,
} from '.';

/**
 * Soft cascade delete only stamps `deletionTime`, so a processed child stays
 * inside the foreign key index range. A worker that replays that range from the
 * start on every batch re-reads every row it already handled, and the reads it
 * wastes are consumed by `.filter()` — invisible to the returned page. These
 * tests assert the scan bound, not the page size.
 */

const BATCH_SIZE = 10;

/**
 * Convex rejects a second paginated query in one function execution with
 * `MultiplePaginatedDatabaseQueries`. convex-test does not model that limit, so
 * a worker that derives a resume cursor from an extra `.paginate()` looks fine
 * here and dies in production. Count the calls instead.
 */
const countPaginateCalls = (ctx: { db: GenericDatabaseWriter<any> }) => {
  const counts = { calls: 0 };
  const baseQuery = ctx.db.query.bind(ctx.db);
  const wrap = (query: object): any =>
    new Proxy(query, {
      get(target: any, property) {
        const value = target[property];
        if (typeof value !== 'function') {
          return value;
        }
        return (...args: unknown[]) => {
          if (property === 'paginate') {
            counts.calls += 1;
          }
          const result = value.apply(target, args);
          if (result && typeof (result as any).then === 'function') {
            return result;
          }
          if (result && typeof result === 'object') {
            return wrap(result);
          }
          return result;
        };
      },
    });
  (ctx.db as any).query = (table: unknown) => wrap(baseQuery(table as never));
  return counts;
};

const makeTables = (prefix: string, childIndexFields: 'exact' | 'wider') => {
  const parents = convexTable(
    `${prefix}_parents`,
    {
      slug: text().notNull(),
      deletionTime: integer(),
    },
    (t) => [index('by_slug').on(t.slug)]
  );
  const children = convexTable(
    `${prefix}_children`,
    {
      parentId: id(`${prefix}_parents`).notNull(),
      rank: integer().notNull(),
      payload: text().notNull(),
      deletionTime: integer(),
    },
    (t) => [
      childIndexFields === 'exact'
        ? index('by_parent').on(t.parentId)
        : index('by_parent_rank').on(t.parentId, t.rank),
      foreignKey({
        columns: [t.parentId],
        foreignColumns: [parents.id],
      }).onDelete('cascade'),
    ]
  );
  return { parents, children };
};

const makeCampaign = (options: {
  prefix: string;
  childIndexFields: 'exact' | 'wider';
  payloadBytes?: number;
  maxBytesPerBatch?: number;
}) => {
  const { parents, children } = makeTables(
    options.prefix,
    options.childIndexFields
  );
  const tables = {
    [`${options.prefix}_parents`]: parents,
    [`${options.prefix}_children`]: children,
  };
  const schema = defineSchema(tables, {
    defaults: {
      mutationExecutionMode: 'async',
      mutationBatchSize: BATCH_SIZE,
      mutationLeafBatchSize: BATCH_SIZE,
      mutationMaxRows: 50_000,
      ...(options.maxBytesPerBatch === undefined
        ? {}
        : { mutationMaxBytesPerBatch: options.maxBytesPerBatch }),
    },
  });
  const relations = defineRelations(tables);
  const edges = extractRelationsConfig(relations);
  const scheduledMutationBatch = {} as SchedulableFunctionReference;
  const worker = scheduledMutationBatchFactory(
    relations,
    edges,
    scheduledMutationBatch
  );
  const payload = 'x'.repeat(options.payloadBytes ?? 8);

  /**
   * Runs a whole soft cascade campaign and reports the rows its scans walked.
   * The parent delete and every scheduled batch run against the same counted
   * writer; seeding does not.
   */
  return async (childCount: number) => {
    const t = convexTest(schema);
    const queue: any[] = [];
    const scheduler = {
      runAfter: async (_delay: number, _ref: unknown, args: unknown) => {
        queue.push(args);
        return 'scheduled';
      },
      runAt: async () => 'scheduled',
      cancel: async () => undefined,
    };

    let parentId: any;
    await t.run(async (baseCtx) => {
      const ctx = withOrm(baseCtx, relations);
      const [parent] = await ctx.orm
        .insert(parents)
        .values({ slug: 'root' })
        .returning();
      parentId = parent.id;
      await ctx.orm.insert(children).values(
        Array.from({ length: childCount }, (_, i) => ({
          parentId,
          rank: i,
          payload,
        }))
      );
    });

    let scanned = 0;
    let batches = 0;
    await t.run(async (baseCtx) => {
      const paginates = countPaginateCalls(baseCtx);
      const reads = countDocumentReads(baseCtx, { scanned: true });
      const ctx = withOrm(baseCtx, relations, {
        scheduler: scheduler as any,
        scheduledMutationBatch,
      });

      await ctx.orm
        .delete(parents)
        .soft()
        .where(eq(parents.id, parentId))
        .execute();

      while (queue.length > 0) {
        batches += 1;
        if (batches > childCount + 50) {
          throw new Error(
            `soft cascade did not converge: ${batches} batches for ${childCount} rows`
          );
        }
        paginates.calls = 0;
        await worker(
          {
            db: ctx.db as GenericDatabaseWriter<any>,
            scheduler: scheduler as any,
          },
          queue.shift()
        );
        if (paginates.calls > 1) {
          throw new Error(
            `batch ${batches} ran ${paginates.calls} paginated queries; Convex allows one per function execution`
          );
        }
      }
      scanned = reads.scanned;
    });

    const remaining = await t.run(async (baseCtx) =>
      (
        await (baseCtx.db as GenericDatabaseWriter<any>)
          .query(`${options.prefix}_children`)
          .collect()
      ).filter((row: any) => typeof row.deletionTime !== 'number')
    );

    return { scanned, batches, pending: remaining.length };
  };
};

describe('ORM soft cascade delete read amplification', () => {
  test('a full campaign scans a linear number of rows at two table sizes', async () => {
    const run = makeCampaign({
      prefix: 'csd_linear',
      childIndexFields: 'exact',
    });

    const small = await run(100);
    const large = await run(200);

    expect(small.pending).toBe(0);
    expect(large.pending).toBe(0);

    // Replaying the range costs ~N^2/(2*batchSize): 100 rows would scan ~600 and
    // 200 rows ~2200. A scan that steps over processed rows stays near N.
    expect(small.scanned).toBeLessThanOrEqual(200);
    expect(large.scanned).toBeLessThanOrEqual(400);
    // Doubling the rows must roughly double the reads, not quadruple them.
    expect(large.scanned / small.scanned).toBeLessThan(2.5);
  }, 60_000);

  test('a byte-truncated batch still advances instead of replaying its page', async () => {
    // The first page of ten does not fit the byte budget. The batch may not skip
    // the tail it never processed, and it may not replay the same page forever:
    // it re-pages at the size that did fit, and that size carries forward, so
    // the rest of the campaign never truncates again.
    const run = makeCampaign({
      prefix: 'csd_bytes',
      childIndexFields: 'exact',
      payloadBytes: 256,
      maxBytesPerBatch: 1200,
    });

    const result = await run(60);

    expect(result.pending).toBe(0);
    expect(result.scanned).toBeLessThanOrEqual(60 * 3);
  }, 60_000);

  test('a foreign key index with trailing fields is bounded the same way', async () => {
    // The foreign key columns are only a prefix of this index, so the scan is
    // ordered by `rank` before Convex's trailing keys. Resuming must not depend
    // on the shape of the index.
    const run = makeCampaign({
      prefix: 'csd_wider',
      childIndexFields: 'wider',
    });

    const result = await run(100);

    expect(result.pending).toBe(0);
    expect(result.scanned).toBeLessThanOrEqual(200);
  }, 60_000);
});
