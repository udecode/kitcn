import { describe, expect, test } from 'vitest';
import schema from '../../../../../convex/schema';
import {
  convexTest,
  countDocumentReads,
} from '../../../../../convex/setup.testing';
import { createOrm } from '../create-orm';
import { requireSchemaRelations } from '../schema';
import { defineMigration, defineMigrationSet } from './definitions';
import { createMigrationHandlers, MAX_STATUS_RUN_LIMIT } from './runtime';
import { MIGRATION_RUN_TABLE, MIGRATION_STATE_TABLE } from './schema';

const testSchema = schema as any;
const testRelations = requireSchemaRelations(schema) as any;

describe('orm/migrations runtime', () => {
  test('run up applies pending migration once and then no-ops', async () => {
    const migrationSet = defineMigrationSet([
      defineMigration({
        id: '20260227_users_status_default',
        up: {
          table: 'users',
          migrateOne: async (_ctx, doc) => {
            if (doc.status === undefined) {
              return { status: 'active' };
            }
          },
        },
      }),
    ]);
    const ormClient = createOrm({ schema: testRelations });
    const handlers = createMigrationHandlers({
      schema: testRelations,
      migrations: migrationSet,
      getOrm: (ctx) => ormClient.db(ctx as any) as any,
      getChunkRef: () => undefined,
    });
    const t = convexTest(testSchema);

    await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', {
        name: 'A',
        email: 'a@example.com',
      } as any);

      const firstRun = await handlers.run(
        { db: ctx.db as any, scheduler: (ctx as any).scheduler },
        { direction: 'up' }
      );
      expect(firstRun.status).toBe('running');

      const user = await ctx.db.get(userId as any);
      expect((user as any)?.status).toBe('active');

      const stateRows = await ctx.db
        .query(MIGRATION_STATE_TABLE as any)
        .collect();
      expect(stateRows).toHaveLength(1);
      expect((stateRows[0] as any).applied).toBe(true);
      expect((stateRows[0] as any).status).toBe('completed');

      const secondRun = await handlers.run(
        { db: ctx.db as any, scheduler: (ctx as any).scheduler },
        { direction: 'up' }
      );
      expect(secondRun.status).toBe('noop');
    });
  });

  test('run is resumable across chunks and can be canceled', async () => {
    const migrationSet = defineMigrationSet([
      defineMigration({
        id: '20260227_users_status_backfill',
        up: {
          table: 'users',
          migrateOne: async (_ctx, doc) => {
            if (doc.status === undefined) {
              return { status: 'pending' };
            }
          },
        },
      }),
    ]);
    const ormClient = createOrm({ schema: testRelations });
    const handlers = createMigrationHandlers({
      schema: testRelations,
      migrations: migrationSet,
      getOrm: (ctx) => ormClient.db(ctx as any) as any,
      getChunkRef: () => undefined,
    });
    const t = convexTest(testSchema);

    await t.run(async (ctx) => {
      await ctx.db.insert('users', {
        name: 'A',
        email: 'a@example.com',
      } as any);
      await ctx.db.insert('users', {
        name: 'B',
        email: 'b@example.com',
      } as any);

      const kickoff = await handlers.run(
        { db: ctx.db as any, scheduler: (ctx as any).scheduler },
        { direction: 'up', batchSize: 1 }
      );
      expect(kickoff.status).toBe('running');

      const runRows = await ctx.db.query(MIGRATION_RUN_TABLE as any).collect();
      expect(runRows).toHaveLength(1);
      expect((runRows[0] as any).status).toBe('running');

      const cancel = await handlers.cancel(
        { db: ctx.db as any, scheduler: (ctx as any).scheduler },
        {}
      );
      expect(cancel.status).toBe('canceled');

      const status = await handlers.status(
        { db: ctx.db as any, scheduler: (ctx as any).scheduler },
        {}
      );
      expect(status.status).toBe('idle');
      expect((status.runs as any[])[0]?.status).toBe('canceled');
    });
  });

  test('run blocks on checksum drift by default', async () => {
    const oldSet = defineMigrationSet([
      defineMigration({
        id: '20260227_users_checksum',
        up: {
          table: 'users',
          migrateOne: async () => {},
        },
      }),
    ]);
    const newSet = defineMigrationSet([
      defineMigration({
        id: '20260227_users_checksum',
        up: {
          table: 'users',
          migrateOne: async (_ctx, doc) => {
            if (doc.status === undefined) {
              return { status: 'changed' };
            }
          },
        },
      }),
    ]);

    const ormClient = createOrm({ schema: testRelations });
    const oldHandlers = createMigrationHandlers({
      schema: testRelations,
      migrations: oldSet,
      getOrm: (ctx) => ormClient.db(ctx as any) as any,
      getChunkRef: () => undefined,
    });
    const newHandlers = createMigrationHandlers({
      schema: testRelations,
      migrations: newSet,
      getOrm: (ctx) => ormClient.db(ctx as any) as any,
      getChunkRef: () => undefined,
    });
    const t = convexTest(testSchema);

    await t.run(async (ctx) => {
      await oldHandlers.run(
        { db: ctx.db as any, scheduler: (ctx as any).scheduler },
        { direction: 'up' }
      );

      const blocked = await newHandlers.run(
        { db: ctx.db as any, scheduler: (ctx as any).scheduler },
        { direction: 'up' }
      );
      expect(blocked.status).toBe('drift_blocked');
      expect(Array.isArray(blocked.drift)).toBe(true);
    });
  });

  test('cancel is noop for non-running run ids', async () => {
    const migrationSet = defineMigrationSet([
      defineMigration({
        id: '20260227_users_cancel_noop',
        up: {
          table: 'users',
          migrateOne: async () => {},
        },
      }),
    ]);
    const ormClient = createOrm({ schema: testRelations });
    const handlers = createMigrationHandlers({
      schema: testRelations,
      migrations: migrationSet,
      getOrm: (ctx) => ormClient.db(ctx as any) as any,
      getChunkRef: () => undefined,
    });
    const t = convexTest(testSchema);

    await t.run(async (ctx) => {
      const run = (await handlers.run(
        { db: ctx.db as any, scheduler: (ctx as any).scheduler },
        { direction: 'up' }
      )) as { runId?: string };
      const runId = run.runId;
      expect(typeof runId).toBe('string');

      const cancel = await handlers.cancel(
        { db: ctx.db as any, scheduler: (ctx as any).scheduler },
        { runId }
      );
      expect(cancel).toMatchObject({
        status: 'noop',
        reason: 'run_not_running',
        runId,
        runStatus: 'completed',
      });
    });
  });
});

describe('orm/migrations status run listing', () => {
  const buildStatusHandlers = () => {
    const migrationSet = defineMigrationSet([
      defineMigration({
        id: '20260227_users_status_listing',
        up: {
          table: 'users',
          migrateOne: async () => {},
        },
      }),
    ]);
    const ormClient = createOrm({ schema: testRelations });
    return createMigrationHandlers({
      schema: testRelations,
      migrations: migrationSet,
      getOrm: (ctx) => ormClient.db(ctx as any) as any,
      getChunkRef: () => undefined,
    });
  };

  // startedAt is deliberately not monotonic with insertion order, so a listing
  // that leans on the implicit by_creation_time index passes only by accident.
  const seedRuns = async (
    ctx: { db: any },
    startedAtByIndex: number[],
    options?: { runningIndex?: number }
  ) => {
    const runIds: string[] = [];
    for (const [index, startedAt] of startedAtByIndex.entries()) {
      const runId = `mr_seed_${index}`;
      runIds.push(runId);
      await ctx.db.insert(MIGRATION_RUN_TABLE as any, {
        runId,
        direction: 'up',
        status: options?.runningIndex === index ? 'running' : 'completed',
        dryRun: false,
        allowDrift: false,
        migrationIds: ['20260227_users_status_listing'],
        currentIndex: 0,
        startedAt,
        updatedAt: startedAt,
        completedAt: options?.runningIndex === index ? null : startedAt,
        cancelRequested: false,
      } as any);
    }
    return runIds;
  };

  test('lists runs newest-first by startedAt and honors limit', async () => {
    const handlers = buildStatusHandlers();
    const t = convexTest(testSchema);

    await t.run(async (ctx) => {
      await seedRuns(ctx, [300, 100, 500, 200, 400]);

      const status = await handlers.status({ db: ctx.db as any }, { limit: 3 });
      const runs = status.runs as Array<{ runId: string; startedAt: number }>;

      expect(runs.map((run) => run.startedAt)).toEqual([500, 400, 300]);
      expect(runs.map((run) => run.runId)).toEqual([
        'mr_seed_2',
        'mr_seed_4',
        'mr_seed_0',
      ]);
    });
  });

  test('breaks startedAt ties newest-created first', async () => {
    const handlers = buildStatusHandlers();
    const t = convexTest(testSchema);

    await t.run(async (ctx) => {
      // run() stamps startedAt from Date.now(), and a whole run can complete
      // inline in one transaction, so two runs sharing a millisecond is
      // reachable rather than hypothetical.
      const runIds = await seedRuns(ctx, [100, 100, 99]);

      const status = await handlers.status({ db: ctx.db as any }, {});
      const runs = status.runs as Array<{ runId: string }>;

      expect(runs.map((run) => run.runId)).toEqual([
        runIds[1],
        runIds[0],
        runIds[2],
      ]);
    });
  });

  test('reads at most limit run rows regardless of run history size', async () => {
    const handlers = buildStatusHandlers();
    const t = convexTest(testSchema);

    await t.run(async (ctx) => {
      await seedRuns(
        ctx,
        Array.from({ length: 40 }, (_, index) => index + 1)
      );

      // Must wrap ctx.db before the handler receives it.
      const reads = countDocumentReads(ctx as any);
      await handlers.status({ db: ctx.db as any }, { limit: 3 });

      // 3 listed runs + at most one indexed active-run probe.
      expect(reads.documents).toBeLessThanOrEqual(4);
    });
  });

  test('clamps limit so callers cannot request an unbounded read', async () => {
    const handlers = buildStatusHandlers();
    const t = convexTest(testSchema);

    await t.run(async (ctx) => {
      await seedRuns(
        ctx,
        Array.from({ length: MAX_STATUS_RUN_LIMIT + 5 }, (_, i) => i + 1)
      );

      const reads = countDocumentReads(ctx as any);
      const status = await handlers.status(
        { db: ctx.db as any },
        { limit: 1_000_000 }
      );

      expect((status.runs as unknown[]).length).toBe(MAX_STATUS_RUN_LIMIT);
      expect(reads.documents).toBeLessThanOrEqual(MAX_STATUS_RUN_LIMIT + 1);
    });
  });

  test('runId selects that run through the by_run_id index only', async () => {
    const handlers = buildStatusHandlers();
    const t = convexTest(testSchema);

    await t.run(async (ctx) => {
      const runIds = await seedRuns(
        ctx,
        Array.from({ length: 30 }, (_, index) => index + 1)
      );
      const target = runIds[7];

      const reads = countDocumentReads(ctx as any);
      const status = await handlers.status({ db: ctx.db as any }, {
        runId: target,
      } as any);
      const runs = status.runs as Array<{ runId: string }>;

      expect(runs).toHaveLength(1);
      expect(runs[0]?.runId).toBe(target);
      // 1 indexed run row + at most one indexed active-run probe.
      expect(reads.documents).toBeLessThanOrEqual(2);
    });
  });

  test('unknown runId returns no runs', async () => {
    const handlers = buildStatusHandlers();
    const t = convexTest(testSchema);

    await t.run(async (ctx) => {
      await seedRuns(ctx, [100, 200, 300]);

      const status = await handlers.status({ db: ctx.db as any }, {
        runId: 'mr_missing',
      } as any);

      expect(status.runs).toEqual([]);
    });
  });

  test('activeRun stays global and is not narrowed by the runId filter', async () => {
    const handlers = buildStatusHandlers();
    const t = convexTest(testSchema);

    await t.run(async (ctx) => {
      const runIds = await seedRuns(ctx, [100, 200, 300], {
        runningIndex: 1,
      });

      const status = await handlers.status({ db: ctx.db as any }, {
        runId: runIds[2],
      } as any);

      expect(status.status).toBe('running');
      expect((status.activeRun as { runId?: string } | null)?.runId).toBe(
        runIds[1]
      );
      expect((status.runs as Array<{ runId: string }>)[0]?.runId).toBe(
        runIds[2]
      );
    });
  });
});
