import { describe, expect, test } from 'vitest';
import schema, { relations } from '../../../../../convex/schema';
import { convexTest } from '../../../../../convex/setup.testing';
import { createOrm } from '../create-orm';
import { defineMigration, defineMigrationSet } from './definitions';
import { createMigrationHandlers } from './runtime';
import { MIGRATION_RUN_TABLE, MIGRATION_STATE_TABLE } from './schema';

const testSchema = schema as any;
const testRelations = relations as any;

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
