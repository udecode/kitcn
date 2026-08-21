import { defineSchema as defineConvexSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { describe, expect, test, vi } from 'vitest';
import {
  convexTest,
  countDocumentReads,
} from '../../../../convex/setup.testing';
import {
  aggregateIndex,
  convexTable,
  createOrm,
  defineSchema,
  index,
  text,
} from '../orm';
import { aggregateCapability } from '../orm/aggregate-index';
import { dbAdapter } from './adapter';

const betterAuthSchema = {
  user: {
    fields: { email: {}, name: {} },
    modelName: 'user',
  },
} as any;

/**
 * Counts calls to Convex's native table count.
 *
 * A read count alone cannot prove the native path ran: convex-test emulates
 * the count syscall as an internal full scan that never touches `ctx.db`, so
 * `documents === 0` also holds for a query that never ran at all. Pairing the
 * two is what makes either assertion mean something.
 */
const recordNativeCounts = (ctx: any) => {
  const calls = { count: 0 };
  const baseQuery = ctx.db.query.bind(ctx.db);
  const wrap = (query: object): any =>
    new Proxy(query, {
      get(target: any, property) {
        const value = target[property];
        if (typeof value !== 'function') {
          return value;
        }
        return (...args: unknown[]) => {
          if (property === 'count') {
            calls.count += 1;
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

  ctx.db.query = (table: unknown) => wrap(baseQuery(table as never));
  return calls;
};

const buildAdapter = (ctx: unknown, schema: unknown) =>
  dbAdapter(ctx as any, {
    authFunctions: {} as any,
    getBetterAuthSchema: () => betterAuthSchema,
    schema: schema as any,
  })({} as any);

describe('dbAdapter count on a plain auth schema', () => {
  const schema = defineConvexSchema({
    user: defineTable({
      email: v.string(),
      name: v.string(),
    }).index('email', ['email']),
  });

  test('an unfiltered count reads no documents', async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) => {
      for (let index_ = 0; index_ < 250; index_++) {
        await ctx.db.insert('user', {
          email: `u${index_}@b.com`,
          name: `u${index_}`,
        });
      }

      const reads = countDocumentReads(ctx as any);
      const native = recordNativeCounts(ctx);

      await expect(
        buildAdapter(ctx, schema).count({ model: 'user' })
      ).resolves.toBe(250);
      expect(native.count).toBe(1);
      expect(reads.documents).toBe(0);
    });
  });

  test('a filtered count still walks rows and stays exact', async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) => {
      for (let index_ = 0; index_ < 40; index_++) {
        await ctx.db.insert('user', {
          email: index_ < 12 ? 'dup@b.com' : `u${index_}@b.com`,
          name: `u${index_}`,
        });
      }

      const reads = countDocumentReads(ctx as any);
      const native = recordNativeCounts(ctx);

      await expect(
        buildAdapter(ctx, schema).count({
          model: 'user',
          where: [{ field: 'email', operator: 'eq', value: 'dup@b.com' }],
        })
      ).resolves.toBe(12);
      // A plain schema declares no aggregate index, so walking the matching
      // rows is the only correct answer.
      expect(native.count).toBe(0);
      expect(reads.documents).toBeGreaterThanOrEqual(12);
    });
  });
});

describe('dbAdapter count on an ORM auth schema', () => {
  const schema = defineSchema({
    user: convexTable(
      'user',
      {
        email: text().notNull(),
        name: text().notNull(),
      },
      (t) => [
        index('email').on(t.email),
        index('name').on(t.name),
        aggregateIndex('by_email').on(t.email),
      ]
    ),
  });

  const schedulerStub = { runAfter: vi.fn(async () => undefined) };
  const passthroughInternalMutation = ((definition: unknown) =>
    definition) as never;

  const withReadyOrm = async (
    baseCtx: any,
    seed: (ctx: any) => Promise<void>
  ) => {
    const ormClient = createOrm({
      capabilities: [aggregateCapability()],
      internalMutation: passthroughInternalMutation,
      ormFunctions: {
        scheduledDelete: {} as any,
        scheduledMutationBatch: {} as any,
      },
      schema,
    });
    const ctx = ormClient.with({
      db: baseCtx.db,
      scheduler: schedulerStub as any,
    });

    await seed(ctx);

    const api = ormClient.api() as any;
    const backfillCtx = { db: baseCtx.db, scheduler: schedulerStub };
    await api.aggregateBackfill.handler(backfillCtx, {});
    for (let attempt = 0; attempt < 20; attempt++) {
      const status = await api.aggregateBackfillStatus.handler(backfillCtx, {});
      if (status.every((entry: any) => entry.status === 'READY')) {
        break;
      }
      await api.aggregateBackfillChunk.handler(backfillCtx, {});
    }

    return ctx;
  };

  // 200 rows share both an aggregate-indexed field and a natively-indexed one,
  // so the two tests below count the same 200 users through different paths.
  const seedUsers = async (ctx: any) => {
    for (let index_ = 0; index_ < 250; index_++) {
      const shared = index_ < 200;
      await ctx.db.insert('user', {
        email: shared ? 'dup@b.com' : `u${index_}@b.com`,
        name: shared ? 'dup' : `u${index_}`,
      });
    }
  };

  test('a count whose field set matches an aggregate index reads buckets, not rows', async () => {
    const t = convexTest(schema);
    await t.run(async (baseCtx) => {
      const ctx = await withReadyOrm(baseCtx, seedUsers);

      const reads = countDocumentReads(ctx as any);

      await expect(
        buildAdapter(ctx, schema).count({
          model: 'user',
          where: [{ field: 'email', operator: 'eq', value: 'dup@b.com' }],
        })
      ).resolves.toBe(200);
      // Readiness row plus bucket row, flat in the number of matching users.
      expect(reads.documents).toBeLessThanOrEqual(4);
    });
  });

  test('a count with no matching aggregate index falls back and stays exact', async () => {
    const t = convexTest(schema);
    await t.run(async (baseCtx) => {
      const ctx = await withReadyOrm(baseCtx, seedUsers);

      const reads = countDocumentReads(ctx as any);
      const native = recordNativeCounts(ctx);

      // `name` carries a native index but no aggregateIndex, so the bounded
      // path must decline rather than answer from the wrong bucket.
      await expect(
        buildAdapter(ctx, schema).count({
          model: 'user',
          where: [{ field: 'name', operator: 'eq', value: 'dup' }],
        })
      ).resolves.toBe(200);
      expect(native.count).toBe(0);
      expect(reads.documents).toBeGreaterThanOrEqual(200);
    });
  });
});
