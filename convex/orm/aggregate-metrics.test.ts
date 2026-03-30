import {
  aggregateIndex,
  convexTable,
  createOrm,
  defineRelations,
  defineSchema,
  integer,
  text,
} from 'kitcn/orm';
import { describe, expect, it, vi } from 'vitest';
import * as aggregateRuntime from '../../packages/kitcn/src/orm/aggregate-index/runtime';
import type { OrmRuntimeDefaults } from '../../packages/kitcn/src/orm/symbols';
import { convexTest } from '../setup.testing';

const schedulerStub = {
  runAfter: vi.fn(async () => undefined),
};

const passthroughInternalMutation = ((definition: unknown) =>
  definition) as never;
const METRIC_STATE_KIND = 'metric' as const;

const buildMetricFixtures = (options?: { defaults?: OrmRuntimeDefaults }) => {
  const metricUsers = convexTable(
    'metricUsers',
    {
      orgId: text().notNull(),
      status: text(),
      amount: integer(),
      score: integer(),
    },
    (t) => [
      aggregateIndex('all_metrics')
        .all()
        .count(t.status, t.amount)
        .sum(t.amount)
        .avg(t.amount)
        .min(t.score)
        .max(t.score),
      aggregateIndex('by_org_status')
        .on(t.orgId, t.status)
        .count(t.status, t.amount)
        .sum(t.amount)
        .avg(t.amount)
        .min(t.score)
        .max(t.score),
      aggregateIndex('by_org_score')
        .on(t.orgId, t.score)
        .count(t.status, t.amount)
        .sum(t.amount)
        .avg(t.amount)
        .min(t.score)
        .max(t.score),
    ]
  );

  const tables = {
    metricUsers,
  };
  const schema = defineSchema(
    tables,
    options?.defaults ? { defaults: options.defaults } : undefined
  );
  const relations = defineRelations(tables);

  return {
    schema,
    relations,
  };
};

const buildMissingCountMetricFixtures = () => {
  const metricUsers = convexTable(
    'metricUsersNoCountMetric',
    {
      orgId: text().notNull(),
      status: text(),
      amount: integer(),
    },
    (t) => [
      aggregateIndex('all_metrics').all().sum(t.amount).avg(t.amount),
      aggregateIndex('by_org_status').on(t.orgId, t.status).sum(t.amount),
    ]
  );

  const schema = defineSchema({
    metricUsers,
  });
  const relations = defineRelations({
    metricUsers,
  });

  return {
    schema,
    relations,
  };
};

const runBackfillToReady = async (api: any, ctx: { db: any }) => {
  await (api as any).aggregateBackfill.handler(
    { db: ctx.db, scheduler: schedulerStub },
    {}
  );

  for (let i = 0; i < 20; i += 1) {
    const status = await (api as any).aggregateBackfillStatus.handler(
      { db: ctx.db, scheduler: schedulerStub },
      {}
    );
    if (status.every((entry: any) => entry.status === 'READY')) {
      return;
    }
    await (api as any).aggregateBackfillChunk.handler(
      { db: ctx.db, scheduler: schedulerStub },
      {}
    );
  }

  throw new Error('aggregateBackfill did not reach READY state in time.');
};

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const withTrackedConcurrency = async <T>(
  tracker: { inFlight: number; maxInFlight: number },
  fn: () => Promise<T>
): Promise<T> => {
  tracker.inFlight += 1;
  tracker.maxInFlight = Math.max(tracker.maxInFlight, tracker.inFlight);
  try {
    return await fn();
  } finally {
    tracker.inFlight -= 1;
  }
};

describe('ORM aggregate()', () => {
  it('supports _count/_sum/_avg/_min/_max after backfill', async () => {
    const { schema, relations } = buildMetricFixtures();
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

      await ctx.db.insert('metricUsers', {
        orgId: 'org-1',
        status: 'active',
        amount: 5,
        score: 10,
      });
      await ctx.db.insert('metricUsers', {
        orgId: 'org-1',
        status: 'active',
        amount: null,
        score: null,
      });
      await ctx.db.insert('metricUsers', {
        orgId: 'org-1',
        status: 'inactive',
        amount: 2,
        score: 3,
      });
      await ctx.db.insert('metricUsers', {
        orgId: 'org-2',
        status: 'active',
        amount: 8,
        score: 20,
      });
      await ctx.db.insert('metricUsers', {
        orgId: 'org-3',
        status: 'active',
        amount: null,
        score: null,
      });

      await runBackfillToReady(api as any, baseCtx as any);

      const countOnly = await ctx.orm.query.metricUsers.aggregate({
        _count: true,
      });
      expect(countOnly._count).toBe(await ctx.orm.query.metricUsers.count());

      const activeOrg1 = await ctx.orm.query.metricUsers.aggregate({
        where: {
          orgId: 'org-1',
          status: 'active',
        },
        _count: {
          _all: true,
          status: true,
          amount: true,
        },
        _sum: {
          amount: true,
        },
        _avg: {
          amount: true,
        },
        _min: {
          score: true,
        },
        _max: {
          score: true,
        },
      });

      expect(activeOrg1).toEqual({
        _count: {
          _all: 2,
          amount: 1,
          status: 2,
        },
        _sum: {
          amount: 5,
        },
        _avg: {
          amount: 5,
        },
        _min: {
          score: 10,
        },
        _max: {
          score: 10,
        },
      });

      const rangedOrg1 = await ctx.orm.query.metricUsers.aggregate({
        where: {
          orgId: 'org-1',
          score: { gte: 3, lt: 20 },
        },
        _count: {
          _all: true,
          amount: true,
        },
        _sum: {
          amount: true,
        },
        _avg: {
          amount: true,
        },
        _min: {
          score: true,
        },
        _max: {
          score: true,
        },
      });

      expect(rangedOrg1).toEqual({
        _count: {
          _all: 2,
          amount: 2,
        },
        _sum: {
          amount: 7,
        },
        _avg: {
          amount: 3.5,
        },
        _min: {
          score: 3,
        },
        _max: {
          score: 10,
        },
      });
    });
  });

  it('supports index-safe aggregate window args for _count and rejects skip/take on non-count metrics', async () => {
    const { schema, relations } = buildMetricFixtures();
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

      await ctx.db.insert('metricUsers', {
        orgId: 'org-1',
        status: 'active',
        amount: 1,
        score: 1,
      });
      await ctx.db.insert('metricUsers', {
        orgId: 'org-1',
        status: 'inactive',
        amount: 2,
        score: 2,
      });
      await ctx.db.insert('metricUsers', {
        orgId: 'org-1',
        status: 'active',
        amount: 3,
        score: 3,
      });
      await ctx.db.insert('metricUsers', {
        orgId: 'org-1',
        status: 'inactive',
        amount: 4,
        score: 4,
      });

      await runBackfillToReady(api as any, baseCtx as any);

      const bounded = await ctx.orm.query.metricUsers.aggregate({
        where: {
          orgId: 'org-1',
          score: { gte: 1 },
        },
        _count: true,
        orderBy: { score: 'asc' },
        skip: 1,
        take: 2,
      });
      expect(bounded).toEqual({
        _count: 2,
      });

      const afterCursor = await ctx.orm.query.metricUsers.aggregate({
        where: {
          orgId: 'org-1',
        },
        _count: {
          _all: true,
        },
        orderBy: { score: 'asc' },
        cursor: { score: 2 },
      });
      expect(afterCursor).toEqual({
        _count: {
          _all: 2,
        },
      });

      await expect(
        ctx.orm.query.metricUsers.aggregate({
          where: {
            orgId: 'org-1',
          },
          _sum: {
            amount: true,
          },
          orderBy: { score: 'asc' },
          skip: 1,
        } as any)
      ).rejects.toThrow(/AGGREGATE_ARGS_UNSUPPORTED/);
    });
  });

  it('supports safe OR rewrite for finite index-plannable branches', async () => {
    const { schema, relations } = buildMetricFixtures();
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

      await ctx.db.insert('metricUsers', {
        orgId: 'org-1',
        status: 'active',
        amount: 5,
        score: 1,
      });
      await ctx.db.insert('metricUsers', {
        orgId: 'org-1',
        status: 'inactive',
        amount: 7,
        score: 2,
      });
      await ctx.db.insert('metricUsers', {
        orgId: 'org-1',
        status: 'paused',
        amount: 11,
        score: 3,
      });
      await ctx.db.insert('metricUsers', {
        orgId: 'org-2',
        status: 'inactive',
        amount: 13,
        score: 4,
      });

      await runBackfillToReady(api as any, baseCtx as any);

      const result = await ctx.orm.query.metricUsers.aggregate({
        where: {
          orgId: 'org-1',
          OR: [{ status: 'active' }, { status: 'inactive' }],
        } as any,
        _count: true,
        _sum: { amount: true },
      });
      expect(result).toEqual({
        _count: 2,
        _sum: { amount: 12 },
      });

      const dnfUnion = await ctx.orm.query.metricUsers.aggregate({
        where: {
          OR: [
            { orgId: 'org-1', status: 'active' },
            { orgId: 'org-2', status: 'inactive' },
          ],
        } as any,
        _count: true,
        _sum: { amount: true },
      });
      expect(dnfUnion).toEqual({
        _count: 2,
        _sum: { amount: 18 },
      });

      await expect(
        ctx.orm.query.metricUsers.aggregate({
          where: {
            OR: [
              { orgId: 'org-1', status: 'active' },
              { orgId: 'org-1', score: { gte: 2 } },
            ],
          } as any,
          _count: true,
        })
      ).rejects.toThrow(/AGGREGATE_FILTER_UNSUPPORTED/);
    });
  });

  it('supports groupBy() for finite indexed groups with no-scan constraints', async () => {
    const { schema, relations } = buildMetricFixtures();
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

      await ctx.db.insert('metricUsers', {
        orgId: 'org-1',
        status: 'active',
        amount: 5,
        score: 10,
      });
      await ctx.db.insert('metricUsers', {
        orgId: 'org-1',
        status: 'active',
        amount: null,
        score: null,
      });
      await ctx.db.insert('metricUsers', {
        orgId: 'org-2',
        status: 'active',
        amount: 8,
        score: 20,
      });
      await ctx.db.insert('metricUsers', {
        orgId: 'org-3',
        status: 'active',
        amount: null,
        score: null,
      });
      await ctx.db.insert('metricUsers', {
        orgId: 'org-3',
        status: 'inactive',
        amount: 2,
        score: 1,
      });

      await runBackfillToReady(api as any, baseCtx as any);

      const grouped = await ctx.orm.query.metricUsers.groupBy({
        by: ['orgId'],
        where: {
          orgId: { in: ['org-2', 'org-1', 'org-3'] },
          status: 'active',
        },
        _count: true,
        _sum: { amount: true },
        _avg: { amount: true },
        _min: { score: true },
        _max: { score: true },
      });

      expect(grouped).toEqual([
        {
          orgId: 'org-2',
          _count: 1,
          _sum: { amount: 8 },
          _avg: { amount: 8 },
          _min: { score: 20 },
          _max: { score: 20 },
        },
        {
          orgId: 'org-1',
          _count: 2,
          _sum: { amount: 5 },
          _avg: { amount: 5 },
          _min: { score: 10 },
          _max: { score: 10 },
        },
        {
          orgId: 'org-3',
          _count: 1,
          _sum: { amount: null },
          _avg: { amount: null },
          _min: { score: null },
          _max: { score: null },
        },
      ]);
    });
  });

  it('throws AGGREGATE_ARGS_UNSUPPORTED when groupBy by-fields are unconstrained', async () => {
    const { schema, relations } = buildMetricFixtures();
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

      await runBackfillToReady(api as any, baseCtx as any);

      await expect(
        ctx.orm.query.metricUsers.groupBy({
          by: ['orgId'],
          where: {
            status: 'active',
          },
          _count: true,
        })
      ).rejects.toThrow(/AGGREGATE_ARGS_UNSUPPORTED/);
    });
  });

  it('throws AGGREGATE_FILTER_UNSUPPORTED for groupBy OR filters', async () => {
    const { schema, relations } = buildMetricFixtures();
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

      await runBackfillToReady(api as any, baseCtx as any);

      await expect(
        ctx.orm.query.metricUsers.groupBy({
          by: ['orgId'],
          where: {
            OR: [{ orgId: 'org-1' }, { orgId: 'org-2' }],
          } as any,
          _count: true,
        })
      ).rejects.toThrow(/AGGREGATE_FILTER_UNSUPPORTED/);
    });
  });

  it('supports groupBy orderBy/skip/take/cursor/having with no-scan bounded groups', async () => {
    const { schema, relations } = buildMetricFixtures();
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

      await ctx.db.insert('metricUsers', {
        orgId: 'org-1',
        status: 'active',
        amount: 5,
        score: 10,
      });
      await ctx.db.insert('metricUsers', {
        orgId: 'org-1',
        status: 'active',
        amount: null,
        score: null,
      });
      await ctx.db.insert('metricUsers', {
        orgId: 'org-2',
        status: 'active',
        amount: 8,
        score: 20,
      });
      await ctx.db.insert('metricUsers', {
        orgId: 'org-3',
        status: 'active',
        amount: null,
        score: null,
      });

      await runBackfillToReady(api as any, baseCtx as any);

      const ordered = await ctx.orm.query.metricUsers.groupBy({
        by: ['orgId'],
        where: {
          orgId: { in: ['org-1', 'org-2', 'org-3'] },
          status: 'active',
        },
        _count: true,
        _sum: { amount: true },
        orderBy: [{ _count: 'desc' }, { _sum: { amount: 'desc' } }],
      } as any);
      expect(ordered.map((row) => row.orgId)).toEqual([
        'org-1',
        'org-2',
        'org-3',
      ]);

      const sliced = await ctx.orm.query.metricUsers.groupBy({
        by: ['orgId'],
        where: {
          orgId: { in: ['org-1', 'org-2', 'org-3'] },
          status: 'active',
        },
        _count: true,
        _sum: { amount: true },
        orderBy: [{ _count: 'desc' }, { _sum: { amount: 'desc' } }],
        skip: 1,
        take: 1,
      } as any);
      expect(sliced.map((row) => row.orgId)).toEqual(['org-2']);

      const cursored = await ctx.orm.query.metricUsers.groupBy({
        by: ['orgId'],
        where: {
          orgId: { in: ['org-1', 'org-2', 'org-3'] },
          status: 'active',
        },
        _count: true,
        _sum: { amount: true },
        orderBy: [{ _count: 'desc' }, { _sum: { amount: 'desc' } }],
        cursor: {
          _count: 2,
          _sum: { amount: 5 },
          orgId: 'org-1',
        },
        take: 1,
      } as any);
      expect(cursored.map((row) => row.orgId)).toEqual(['org-2']);

      const having = await ctx.orm.query.metricUsers.groupBy({
        by: ['orgId'],
        where: {
          orgId: { in: ['org-1', 'org-2', 'org-3'] },
          status: 'active',
        },
        _count: true,
        _sum: { amount: true },
        having: {
          _count: { gte: 1 },
          _sum: { amount: { gte: 8 } },
        },
        orderBy: [{ _sum: { amount: 'desc' } }],
      } as any);
      expect(having.map((row) => row.orgId)).toEqual(['org-2']);
    });
  });

  it('throws AGGREGATE_ARGS_UNSUPPORTED for groupBy skip/cursor without orderBy', async () => {
    const { schema, relations } = buildMetricFixtures();
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

      await runBackfillToReady(api as any, baseCtx as any);

      await expect(
        ctx.orm.query.metricUsers.groupBy({
          by: ['orgId'],
          where: {
            orgId: { in: ['org-1'] },
            status: 'active',
          },
          _count: true,
          skip: 1,
        } as any)
      ).rejects.toThrow(/AGGREGATE_ARGS_UNSUPPORTED/);

      await expect(
        ctx.orm.query.metricUsers.groupBy({
          by: ['orgId'],
          where: {
            orgId: { in: ['org-1'] },
            status: 'active',
          },
          _count: true,
          cursor: { orgId: 'org-1' },
        } as any)
      ).rejects.toThrow(/AGGREGATE_ARGS_UNSUPPORTED/);
    });
  });

  it('throws AGGREGATE_FILTER_UNSUPPORTED for groupBy having OR filters', async () => {
    const { schema, relations } = buildMetricFixtures();
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

      await runBackfillToReady(api as any, baseCtx as any);

      await expect(
        ctx.orm.query.metricUsers.groupBy({
          by: ['orgId'],
          where: {
            orgId: { in: ['org-1'] },
            status: 'active',
          },
          _count: true,
          having: {
            OR: [{ _count: { gt: 1 } }],
          },
          orderBy: [{ _count: 'desc' }],
        } as any)
      ).rejects.toThrow(/AGGREGATE_FILTER_UNSUPPORTED/);
    });
  });

  it('throws AGGREGATE_ARGS_UNSUPPORTED when groupBy orderBy metric is not selected', async () => {
    const { schema, relations } = buildMetricFixtures();
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

      await runBackfillToReady(api as any, baseCtx as any);

      await expect(
        ctx.orm.query.metricUsers.groupBy({
          by: ['orgId'],
          where: {
            orgId: { in: ['org-1'] },
            status: 'active',
          },
          _count: true,
          orderBy: [{ _sum: { amount: 'desc' } }],
        } as any)
      ).rejects.toThrow(/AGGREGATE_ARGS_UNSUPPORTED/);
    });
  });

  it('keeps aggregates updated after READY on update and delete', async () => {
    const { schema, relations } = buildMetricFixtures();
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

      await runBackfillToReady(api as any, baseCtx as any);

      const firstId = await ctx.db.insert('metricUsers', {
        orgId: 'org-1',
        status: 'active',
        amount: 4,
        score: 9,
      });
      const secondId = await ctx.db.insert('metricUsers', {
        orgId: 'org-1',
        status: 'active',
        amount: 2,
        score: 5,
      });

      expect(
        await ctx.orm.query.metricUsers.aggregate({
          where: {
            orgId: 'org-1',
            status: 'active',
          },
          _sum: { amount: true },
          _avg: { amount: true },
          _min: { score: true },
          _max: { score: true },
        })
      ).toEqual({
        _sum: { amount: 6 },
        _avg: { amount: 3 },
        _min: { score: 5 },
        _max: { score: 9 },
      });

      await ctx.db.patch(firstId as any, {
        amount: 10,
        score: 1,
      });
      await ctx.db.delete('metricUsers', secondId as any);

      expect(
        await ctx.orm.query.metricUsers.aggregate({
          where: {
            orgId: 'org-1',
            status: 'active',
          },
          _sum: { amount: true },
          _avg: { amount: true },
          _min: { score: true },
          _max: { score: true },
        })
      ).toEqual({
        _sum: { amount: 10 },
        _avg: { amount: 10 },
        _min: { score: 1 },
        _max: { score: 1 },
      });
    });
  });

  it('returns null _avg for empty/all-null sets', async () => {
    const { schema, relations } = buildMetricFixtures();
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

      await ctx.db.insert('metricUsers', {
        orgId: 'org-3',
        status: 'active',
        amount: null,
      });

      await runBackfillToReady(api as any, baseCtx as any);

      await expect(
        ctx.orm.query.metricUsers.aggregate({
          where: {
            orgId: 'missing-org',
            status: 'active',
          },
          _avg: { amount: true },
        })
      ).resolves.toEqual({
        _avg: { amount: null },
      });

      await expect(
        ctx.orm.query.metricUsers.aggregate({
          where: {
            orgId: 'org-3',
            status: 'active',
          },
          _avg: { amount: true },
        })
      ).resolves.toEqual({
        _avg: { amount: null },
      });
    });
  });

  it('returns null _sum for empty/all-null sets', async () => {
    const { schema, relations } = buildMetricFixtures();
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

      await ctx.db.insert('metricUsers', {
        orgId: 'org-3',
        status: 'active',
        amount: null,
      });

      await runBackfillToReady(api as any, baseCtx as any);

      await expect(
        ctx.orm.query.metricUsers.aggregate({
          where: {
            orgId: 'missing-org',
            status: 'active',
          },
          _sum: { amount: true },
        })
      ).resolves.toEqual({
        _sum: { amount: null },
      });

      await expect(
        ctx.orm.query.metricUsers.aggregate({
          where: {
            orgId: 'org-3',
            status: 'active',
          },
          _sum: { amount: true },
        })
      ).resolves.toEqual({
        _sum: { amount: null },
      });
    });
  });

  it('throws deterministic errors for unsupported args/filters/index coverage', async () => {
    const { schema, relations } = buildMetricFixtures();
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

      await ctx.db.insert('metricUsers', {
        orgId: 'org-1',
        status: 'active',
        amount: 5,
        score: 10,
      });

      await runBackfillToReady(api as any, baseCtx as any);

      await expect(
        (ctx.orm.query.metricUsers.aggregate as any)({
          _sum: {
            amount: true,
          },
          distinct: ['amount'],
        })
      ).rejects.toThrow(/AGGREGATE_ARGS_UNSUPPORTED/);

      await expect(
        ctx.orm.query.metricUsers.aggregate({
          where: {
            status: 'active',
          },
          _sum: {
            amount: true,
          },
        })
      ).rejects.toThrow(/AGGREGATE_NOT_INDEXED/);

      await expect(
        ctx.orm.query.metricUsers.aggregate({
          where: {
            orgId: 'org-1',
            status: {
              contains: 'act',
            },
          } as any,
          _sum: {
            amount: true,
          },
        })
      ).rejects.toThrow(/AGGREGATE_FILTER_UNSUPPORTED/);
    });
  });

  it('throws AGGREGATE_FILTER_UNSUPPORTED when estimated IN expansion work exceeds budget', async () => {
    const { schema, relations } = buildMetricFixtures({
      defaults: {
        aggregateCartesianMaxKeys: 10_000,
        aggregateWorkBudget: 50,
      },
    });
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

      await runBackfillToReady(api as any, baseCtx as any);

      const orgIds = Array.from({ length: 30 }, (_, index) => `org-${index}`);

      await expect(
        ctx.orm.query.metricUsers.aggregate({
          where: {
            orgId: { in: orgIds },
            score: { gte: 1 },
          },
          _sum: {
            amount: true,
          },
        })
      ).rejects.toThrow(/AGGREGATE_FILTER_UNSUPPORTED/);

      await expect(
        ctx.orm.query.metricUsers.aggregate({
          where: {
            orgId: { in: orgIds },
            score: { gte: 1 },
          },
          _sum: {
            amount: true,
          },
        })
      ).rejects.toThrow(/aggregateWorkBudget/);
    });
  });

  it('executes aggregate metric blocks concurrently', async () => {
    const { schema, relations } = buildMetricFixtures();
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

      await ctx.db.insert('metricUsers', {
        orgId: 'org-1',
        status: 'active',
        amount: 5,
        score: 10,
      });
      await runBackfillToReady(api as any, baseCtx as any);

      const tracker = { inFlight: 0, maxInFlight: 0 };
      const delayMs = 20;
      const originalCountField = aggregateRuntime.readCountFieldFromBuckets;
      const originalSum = aggregateRuntime.readSumFromBuckets;
      const originalAvg = aggregateRuntime.readAverageFromBuckets;
      const originalExtrema = aggregateRuntime.readExtremaFromBuckets;

      const countFieldSpy = vi
        .spyOn(aggregateRuntime, 'readCountFieldFromBuckets')
        .mockImplementation(async (...args: any[]) =>
          withTrackedConcurrency(tracker, async () => {
            await wait(delayMs);
            return await (originalCountField as any)(...args);
          })
        );
      const sumSpy = vi
        .spyOn(aggregateRuntime, 'readSumFromBuckets')
        .mockImplementation(async (...args: any[]) =>
          withTrackedConcurrency(tracker, async () => {
            await wait(delayMs);
            return await (originalSum as any)(...args);
          })
        );
      const avgSpy = vi
        .spyOn(aggregateRuntime, 'readAverageFromBuckets')
        .mockImplementation(async (...args: any[]) =>
          withTrackedConcurrency(tracker, async () => {
            await wait(delayMs);
            return await (originalAvg as any)(...args);
          })
        );
      const extremaSpy = vi
        .spyOn(aggregateRuntime, 'readExtremaFromBuckets')
        .mockImplementation(async (...args: any[]) =>
          withTrackedConcurrency(tracker, async () => {
            await wait(delayMs);
            return await (originalExtrema as any)(...args);
          })
        );

      try {
        await ctx.orm.query.metricUsers.aggregate({
          where: {
            orgId: 'org-1',
            status: 'active',
          },
          _count: {
            amount: true,
          },
          _sum: {
            amount: true,
          },
          _avg: {
            amount: true,
          },
          _min: {
            score: true,
          },
          _max: {
            score: true,
          },
        });
      } finally {
        countFieldSpy.mockRestore();
        sumSpy.mockRestore();
        avgSpy.mockRestore();
        extremaSpy.mockRestore();
      }

      expect(tracker.maxInFlight).toBeGreaterThan(1);
    });
  });

  it('reuses bucket plan reads across aggregate metric blocks', async () => {
    const { schema, relations } = buildMetricFixtures();
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

      await ctx.db.insert('metricUsers', {
        orgId: 'org-1',
        status: 'active',
        amount: 5,
        score: 10,
      });
      await runBackfillToReady(api as any, baseCtx as any);

      const caches: unknown[] = [];
      const countSpy = vi
        .spyOn(aggregateRuntime, 'readCountFromBuckets')
        .mockImplementation(async (...args: any[]) => {
          caches.push(args[2]);
          return 1;
        });
      const countFieldSpy = vi
        .spyOn(aggregateRuntime, 'readCountFieldFromBuckets')
        .mockImplementation(async (...args: any[]) => {
          caches.push(args[2]);
          return 1;
        });
      const sumSpy = vi
        .spyOn(aggregateRuntime, 'readSumFromBuckets')
        .mockImplementation(async (...args: any[]) => {
          caches.push(args[2]);
          return 1;
        });
      const avgSpy = vi
        .spyOn(aggregateRuntime, 'readAverageFromBuckets')
        .mockImplementation(async (...args: any[]) => {
          caches.push(args[2]);
          return 1;
        });
      const extremaSpy = vi
        .spyOn(aggregateRuntime, 'readExtremaFromBuckets')
        .mockImplementation(async (...args: any[]) => {
          caches.push(args[2]);
          return 1;
        });

      try {
        await ctx.orm.query.metricUsers.aggregate({
          where: {
            orgId: 'org-1',
            status: 'active',
          },
          _count: {
            _all: true,
            amount: true,
          },
          _sum: {
            amount: true,
          },
          _avg: {
            amount: true,
          },
          _min: {
            score: true,
          },
          _max: {
            score: true,
          },
        });
      } finally {
        countSpy.mockRestore();
        countFieldSpy.mockRestore();
        sumSpy.mockRestore();
        avgSpy.mockRestore();
        extremaSpy.mockRestore();
      }

      expect(caches.length).toBeGreaterThan(1);
      expect(caches.every((entry) => entry instanceof Map)).toBe(true);
      expect(new Set(caches).size).toBe(1);
    });
  });
});

describe('aggregateBackfill resume compatibility', () => {
  it('schedules metric backfill without requiring rebuild when key shape is unchanged', async () => {
    const { schema, relations } = buildMetricFixtures();
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

      await ctx.db.insert('metricUsers', {
        orgId: 'org-1',
        status: 'active',
        amount: 5,
        score: 10,
      });
      await runBackfillToReady(api as any, baseCtx as any);

      const states = await baseCtx.db
        .query('aggregate_state')
        .withIndex('by_kind_table_index', (q: any) =>
          q
            .eq('kind', METRIC_STATE_KIND)
            .eq('tableKey', 'metricUsers')
            .eq('indexName', 'by_org_status')
        )
        .collect();
      expect(states[0]).toBeDefined();

      const bucketsBefore = await baseCtx.db
        .query('aggregate_bucket')
        .withIndex('by_table_index', (q: any) =>
          q.eq('tableKey', 'metricUsers').eq('indexName', 'by_org_status')
        )
        .collect();
      expect(bucketsBefore.length).toBeGreaterThan(0);

      await baseCtx.db.patch('aggregate_state', states[0]._id as any, {
        metricDefinitionHash: JSON.stringify({
          countFields: [],
          sumFields: [],
          avgFields: [],
          minFields: [],
          maxFields: [],
        }),
      });

      const result = await (api as any).aggregateBackfill.handler(
        { db: baseCtx.db, scheduler: schedulerStub },
        {
          tableName: 'metricUsers',
          indexName: 'by_org_status',
          mode: 'resume',
        }
      );

      expect(result).toMatchObject({
        mode: 'resume',
        needsRebuild: 0,
        scheduled: 1,
      });

      const bucketsAfter = await baseCtx.db
        .query('aggregate_bucket')
        .withIndex('by_table_index', (q: any) =>
          q.eq('tableKey', 'metricUsers').eq('indexName', 'by_org_status')
        )
        .collect();
      expect(bucketsAfter.length).toBeGreaterThan(0);
    });
  });

  it('treats metric-only removals as READY metadata updates in resume mode', async () => {
    const { schema, relations } = buildMetricFixtures();
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

      await ctx.db.insert('metricUsers', {
        orgId: 'org-1',
        status: 'active',
        amount: 5,
        score: 10,
      });
      await runBackfillToReady(api as any, baseCtx as any);

      const states = await baseCtx.db
        .query('aggregate_state')
        .withIndex('by_kind_table_index', (q: any) =>
          q
            .eq('kind', METRIC_STATE_KIND)
            .eq('tableKey', 'metricUsers')
            .eq('indexName', 'by_org_status')
        )
        .collect();
      expect(states[0]).toBeDefined();

      await baseCtx.db.patch('aggregate_state', states[0]._id as any, {
        metricDefinitionHash: JSON.stringify({
          countFields: ['status', 'amount'],
          sumFields: ['amount'],
          avgFields: ['amount'],
          minFields: ['score', 'legacy_min_only'],
          maxFields: ['score'],
        }),
      });

      const result = await (api as any).aggregateBackfill.handler(
        { db: baseCtx.db, scheduler: schedulerStub },
        {
          tableName: 'metricUsers',
          indexName: 'by_org_status',
          mode: 'resume',
        }
      );

      expect(result).toMatchObject({
        mode: 'resume',
        needsRebuild: 0,
        scheduled: 0,
        skippedReady: 1,
      });
    });
  });
});

describe('ORM count({ select })', () => {
  it('returns _all and non-null field counts', async () => {
    const { schema, relations } = buildMetricFixtures();
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

      await ctx.db.insert('metricUsers', {
        orgId: 'org-1',
        status: 'active',
        amount: 5,
      });
      await ctx.db.insert('metricUsers', {
        orgId: 'org-1',
        status: 'active',
        amount: null,
      });

      await runBackfillToReady(api as any, baseCtx as any);

      await expect(
        ctx.orm.query.metricUsers.count({
          where: {
            orgId: 'org-1',
            status: 'active',
          },
          select: {
            _all: true,
            amount: true,
            status: true,
          },
        })
      ).resolves.toEqual({
        _all: 2,
        amount: 1,
        status: 2,
      });
    });
  });

  it('throws COUNT_NOT_INDEXED when field count metric is undeclared', async () => {
    const { schema, relations } = buildMissingCountMetricFixtures();
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

      await ctx.db.insert('metricUsersNoCountMetric', {
        orgId: 'org-1',
        status: 'active',
        amount: 5,
      });
      await runBackfillToReady(api as any, baseCtx as any);

      await expect(
        ctx.orm.query.metricUsers.count({
          where: {
            orgId: 'org-1',
            status: 'active',
          },
          select: {
            status: true,
          },
        })
      ).rejects.toThrow(/COUNT_NOT_INDEXED/);
    });
  });

  it('executes count({ select }) field reads concurrently', async () => {
    const { schema, relations } = buildMetricFixtures();
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

      await ctx.db.insert('metricUsers', {
        orgId: 'org-1',
        status: 'active',
        amount: 5,
      });
      await ctx.db.insert('metricUsers', {
        orgId: 'org-1',
        status: 'active',
        amount: null,
      });

      await runBackfillToReady(api as any, baseCtx as any);

      const tracker = { inFlight: 0, maxInFlight: 0 };
      const delayMs = 20;
      const original = aggregateRuntime.readCountFieldFromBuckets;
      const spy = vi
        .spyOn(aggregateRuntime, 'readCountFieldFromBuckets')
        .mockImplementation(async (...args: any[]) =>
          withTrackedConcurrency(tracker, async () => {
            await wait(delayMs);
            return await (original as any)(...args);
          })
        );

      try {
        await ctx.orm.query.metricUsers.count({
          where: {
            orgId: 'org-1',
            status: 'active',
          },
          select: {
            status: true,
            amount: true,
          },
        });
      } finally {
        spy.mockRestore();
      }

      expect(tracker.maxInFlight).toBeGreaterThan(1);
    });
  });
});
