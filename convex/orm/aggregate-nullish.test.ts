import {
  aggregateIndex,
  convexTable,
  createOrm,
  defineRelations,
  defineSchema,
  integer,
  text,
} from 'kitcn/orm';
import { aggregateCapability } from 'kitcn/orm/aggregate-index';
import { describe, expect, it, vi } from 'vitest';
import type { OrmRuntimeDefaults } from '../../packages/kitcn/src/orm/symbols';
import { convexTest } from '../setup.testing';

const schedulerStub = {
  runAfter: vi.fn(async () => undefined),
};

const passthroughInternalMutation = ((definition: unknown) =>
  definition) as never;
const passthroughInternalQuery = ((definition: unknown) => definition) as never;

/**
 * A nullable column compiles to `v.optional(v.union(v.null(), ...))`, so a row
 * that never had the column written stores it absent, not null. `isNull` means
 * null-or-absent on the row path, so every aggregate surface has to agree.
 */
const buildNullishFixtures = (options?: { defaults?: OrmRuntimeDefaults }) => {
  const nullishUsers = convexTable(
    'nullishUsers',
    {
      orgId: text().notNull(),
      tier: text(),
      score: integer(),
    },
    (t) => [
      aggregateIndex('by_org_tier')
        .on(t.orgId, t.tier)
        .count(t.tier, t.score)
        .sum(t.score)
        .avg(t.score)
        .min(t.score)
        .max(t.score),
    ]
  );

  const nullishPosts = convexTable(
    'nullishPosts',
    {
      authorId: text().notNull(),
      deletionTime: integer(),
    },
    (t) => [aggregateIndex('by_author_deletion').on(t.authorId, t.deletionTime)]
  );

  const schema = defineSchema(
    { nullishUsers, nullishPosts },
    options?.defaults ? { defaults: options.defaults } : undefined
  );
  const relations = defineRelations(schema, (r) => ({
    nullishUsers: {
      posts: r.many.nullishPosts({
        from: r.nullishUsers.id,
        to: r.nullishPosts.authorId,
      }),
    },
    nullishPosts: {
      author: r.one.nullishUsers({
        from: r.nullishPosts.authorId,
        to: r.nullishUsers.id,
      }),
    },
  }));

  return { schema, relations };
};

const runBackfillToReady = async (api: any, ctx: { db: any }) => {
  await api.aggregateBackfill.handler(
    { db: ctx.db, scheduler: schedulerStub },
    {}
  );

  for (let i = 0; i < 20; i += 1) {
    const status = await api.aggregateBackfillStatus.handler(
      { db: ctx.db, scheduler: schedulerStub },
      {}
    );
    if (status.every((entry: any) => entry.status === 'READY')) {
      return;
    }
    await api.aggregateBackfillChunk.handler(
      { db: ctx.db, scheduler: schedulerStub },
      {}
    );
  }

  throw new Error('aggregateBackfill did not reach READY state in time.');
};

const withNullishOrm = async (
  run: (context: { ctx: any; api: any; baseCtx: any }) => Promise<void>,
  options?: { defaults?: OrmRuntimeDefaults }
): Promise<void> => {
  const { schema, relations } = buildNullishFixtures(options);
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
      internalQuery: passthroughInternalQuery,
    });
    const ctx = ormClient.with({
      db: baseCtx.db,
      scheduler: schedulerStub as any,
    });

    await run({ ctx, api: ormClient.api(), baseCtx });
  });
};

/**
 * `tier` absent twice, explicitly null once, set once. `isNull` has to see 3,
 * `eq: null` has to see 1.
 */
const seedUsers = async (ctx: any) => {
  await ctx.db.insert('nullishUsers', { orgId: 'org-1', score: 1 });
  await ctx.db.insert('nullishUsers', { orgId: 'org-1', score: 3 });
  await ctx.db.insert('nullishUsers', {
    orgId: 'org-1',
    tier: null,
    score: 10,
  });
  await ctx.db.insert('nullishUsers', {
    orgId: 'org-1',
    tier: 'gold',
    score: 100,
  });
};

describe('aggregate nullish semantics', () => {
  it('counts absent-field rows for isNull, matching findMany', async () => {
    await withNullishOrm(async ({ ctx, api, baseCtx }) => {
      await seedUsers(ctx);
      await runBackfillToReady(api, baseCtx);

      const where = { orgId: 'org-1', tier: { isNull: true } };

      const rows = await ctx.orm.query.nullishUsers.findMany({
        where,
        limit: 100,
      });
      expect(rows).toHaveLength(3);

      expect(await ctx.orm.query.nullishUsers.count({ where })).toBe(3);
      expect(
        await ctx.orm.query.nullishUsers.aggregate({ where, _count: true })
      ).toEqual({ _count: 3 });
    });
  });

  it('keeps eq: null scoped to explicitly null rows on every surface', async () => {
    await withNullishOrm(async ({ ctx, api, baseCtx }) => {
      await seedUsers(ctx);
      await runBackfillToReady(api, baseCtx);

      const where = { orgId: 'org-1', tier: null };

      const rows = await ctx.orm.query.nullishUsers.findMany({
        where,
        limit: 100,
      });
      expect(rows).toHaveLength(1);
      expect(await ctx.orm.query.nullishUsers.count({ where })).toBe(1);
    });
  });

  it('emits one merged group for an isNull-constrained groupBy field', async () => {
    await withNullishOrm(async ({ ctx, api, baseCtx }) => {
      await seedUsers(ctx);
      await runBackfillToReady(api, baseCtx);

      const grouped = await ctx.orm.query.nullishUsers.groupBy({
        by: ['tier'],
        where: { orgId: 'org-1', tier: { isNull: true } },
        _count: true,
        _sum: { score: true },
        _min: { score: true },
        _max: { score: true },
      });

      expect(grouped).toEqual([
        {
          tier: null,
          _count: 3,
          _sum: { score: 14 },
          _min: { score: 1 },
          _max: { score: 10 },
        },
      ]);
    });
  });

  it('counts absent-field rows in filtered relation _count', async () => {
    await withNullishOrm(async ({ ctx, api, baseCtx }) => {
      const authorId = await ctx.db.insert('nullishUsers', {
        orgId: 'org-1',
        tier: 'gold',
        score: 1,
      });

      await ctx.db.insert('nullishPosts', { authorId });
      await ctx.db.insert('nullishPosts', { authorId });
      await ctx.db.insert('nullishPosts', { authorId, deletionTime: null });
      await ctx.db.insert('nullishPosts', { authorId, deletionTime: 1234 });

      await runBackfillToReady(api, baseCtx);

      const live = await ctx.orm.query.nullishPosts.findMany({
        where: { authorId, deletionTime: { isNull: true } },
        limit: 100,
      });
      expect(live).toHaveLength(3);

      const users = await ctx.orm.query.nullishUsers.findMany({
        with: {
          _count: {
            posts: { where: { deletionTime: { isNull: true } } },
          },
        },
        limit: 10,
      });

      expect(users.map((user: any) => user._count?.posts)).toEqual([3]);
    });
  });

  it('counts merged nullish bucket probes against the Cartesian limit', async () => {
    await withNullishOrm(
      async ({ ctx }) => {
        await expect(
          ctx.orm.query.nullishUsers.groupBy({
            by: ['tier'],
            where: {
              orgId: 'org-1',
              tier: { in: [null, undefined, 'gold'] },
            },
            _count: true,
          })
        ).rejects.toThrow(/aggregateCartesianMaxKeys/);
      },
      {
        defaults: {
          aggregateCartesianMaxKeys: 2,
          aggregateWorkBudget: 100,
        },
      }
    );
  });

  it('counts merged nullish bucket probes against the work budget', async () => {
    await withNullishOrm(
      async ({ ctx }) => {
        await expect(
          ctx.orm.query.nullishUsers.groupBy({
            by: ['tier'],
            where: {
              orgId: 'org-1',
              tier: { in: [null, undefined, 'gold'] },
            },
            _count: true,
          })
        ).rejects.toThrow(/aggregateWorkBudget/);
      },
      {
        defaults: {
          aggregateCartesianMaxKeys: 100,
          aggregateWorkBudget: 2,
        },
      }
    );
  });
});
