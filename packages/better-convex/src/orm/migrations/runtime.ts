import type {
  GenericDatabaseWriter,
  SchedulableFunctionReference,
  Scheduler,
} from 'convex/server';
import type { OrmWriter } from '../database';
import type { TablesRelationalConfig } from '../relations';
import {
  buildMigrationPlan,
  detectMigrationDrift,
  type MigrationAppliedState,
  type MigrationDirection,
  type MigrationDoc,
  type MigrationDocContext,
  type MigrationManifestEntry,
  type MigrationSet,
  type MigrationStateMap,
  type MigrationWriteMode,
} from './definitions';
import { MIGRATION_RUN_TABLE, MIGRATION_STATE_TABLE } from './schema';

const DEFAULT_BATCH_SIZE = 128;

export type MigrationRunArgs = {
  direction?: MigrationDirection;
  steps?: number;
  to?: string;
  dryRun?: boolean;
  allowDrift?: boolean;
  batchSize?: number;
  restart?: boolean;
};

export type MigrationRunChunkArgs = {
  runId: string;
  batchSize?: number;
};

export type MigrationStatusArgs = {
  runId?: string;
  limit?: number;
};

export type MigrationCancelArgs = {
  runId?: string;
};

type RuntimeCtx = {
  db: GenericDatabaseWriter<any>;
  scheduler?: Scheduler;
};

type MigrationStateDoc = {
  _id: any;
  migrationId: string;
  checksum: string;
  applied: boolean;
  status: string;
  direction?: string | null;
  runId?: string | null;
  cursor?: string | null;
  processed: number;
  startedAt?: number | null;
  updatedAt: number;
  completedAt?: number | null;
  lastError?: string | null;
  writeMode: string;
};

type MigrationRunDoc = {
  _id: any;
  runId: string;
  direction: string;
  status: string;
  dryRun: boolean;
  allowDrift: boolean;
  migrationIds: string[];
  currentIndex: number;
  startedAt: number;
  updatedAt: number;
  completedAt?: number | null;
  cancelRequested: boolean;
  lastError?: string | null;
};

type CreateMigrationHandlersParams<TSchema extends TablesRelationalConfig> = {
  schema: TSchema;
  migrations?: MigrationSet<TSchema>;
  getOrm: (ctx: RuntimeCtx) => OrmWriter<TSchema>;
  getChunkRef: () => SchedulableFunctionReference | undefined;
};

export function createMigrationHandlers<TSchema extends TablesRelationalConfig>(
  params: CreateMigrationHandlersParams<TSchema>
): {
  run: (
    ctx: RuntimeCtx,
    args?: MigrationRunArgs
  ) => Promise<Record<string, unknown>>;
  chunk: (
    ctx: RuntimeCtx,
    args: MigrationRunChunkArgs
  ) => Promise<Record<string, unknown>>;
  status: (
    ctx: RuntimeCtx,
    args?: MigrationStatusArgs
  ) => Promise<Record<string, unknown>>;
  cancel: (
    ctx: RuntimeCtx,
    args?: MigrationCancelArgs
  ) => Promise<Record<string, unknown>>;
} {
  const { schema, migrations, getOrm, getChunkRef } = params;
  const knownTables = new Set(
    Object.values(schema).map((tableConfig) => tableConfig.name)
  );

  const run = async (ctx: RuntimeCtx, args: MigrationRunArgs = {}) => {
    if (!migrations || migrations.migrations.length === 0) {
      return {
        status: 'noop',
        reason: 'no_migrations_registered',
      };
    }

    const direction = parseDirection(args.direction);
    const dryRun = args.dryRun === true;
    const allowDrift = args.allowDrift === true;
    const restart = args.restart === true;
    const batchSize = parseOptionalPositiveInteger(args.batchSize, 'batchSize');
    const steps = parseOptionalPositiveInteger(args.steps, 'steps');
    const to = parseOptionalString(args.to, 'to');

    const stateRows = await getAllStateRows(ctx.db);
    const appliedState = toAppliedStateMap(stateRows);
    const drift = detectMigrationDrift({
      migrationSet: migrations,
      appliedState,
    });
    if (drift.length > 0 && !allowDrift) {
      return {
        status: 'drift_blocked',
        direction,
        drift,
      };
    }

    const plan = buildMigrationPlan({
      direction,
      migrationSet: migrations,
      appliedState,
      steps,
      to,
    });
    if (plan.migrations.length === 0) {
      return {
        status: 'noop',
        direction,
        drift,
        plan: [],
      };
    }

    for (const migration of plan.migrations) {
      const step = getStepForDirection(migration, direction);
      if (!knownTables.has(step.table)) {
        throw new Error(
          `Migration '${migration.id}' references unknown table '${step.table}'.`
        );
      }
    }

    if (dryRun) {
      return {
        status: 'dry_run',
        direction,
        drift,
        plan: plan.migrations.map((migration) => migration.id),
      };
    }

    const activeRun = await getActiveRun(ctx.db);
    if (activeRun) {
      return {
        status: 'running',
        runId: activeRun.runId,
      };
    }

    const now = Date.now();
    const runId = createRunId(now);
    await ctx.db.insert(MIGRATION_RUN_TABLE as any, {
      runId,
      direction,
      status: 'running',
      dryRun: false,
      allowDrift,
      migrationIds: plan.migrations.map((migration) => migration.id),
      currentIndex: 0,
      startedAt: now,
      updatedAt: now,
      cancelRequested: false,
    });

    const stateById = new Map(stateRows.map((row) => [row.migrationId, row]));
    for (const migration of plan.migrations) {
      const step = getStepForDirection(migration, direction);
      const writeMode = step.writeMode ?? 'safe_bypass';
      const existing = stateById.get(migration.id);
      const resetProgress = restart || existing?.direction !== direction;
      if (existing) {
        await ctx.db.patch(
          existing._id,
          cleanUndefined({
            checksum: migration.checksum,
            status: 'pending',
            direction,
            runId,
            cursor: resetProgress ? null : (existing.cursor ?? null),
            processed: resetProgress ? 0 : (existing.processed ?? 0),
            startedAt: now,
            updatedAt: now,
            completedAt: null,
            lastError: null,
            writeMode,
          })
        );
      } else {
        await ctx.db.insert(MIGRATION_STATE_TABLE as any, {
          migrationId: migration.id,
          checksum: migration.checksum,
          applied: direction === 'down',
          status: 'pending',
          direction,
          runId,
          cursor: null,
          processed: 0,
          startedAt: now,
          updatedAt: now,
          completedAt: null,
          lastError: null,
          writeMode,
        });
      }
    }

    if (ctx.scheduler) {
      const chunkRef = getChunkRef();
      if (chunkRef) {
        const chunkArgs: MigrationRunChunkArgs = { runId };
        if (batchSize !== undefined) {
          chunkArgs.batchSize = batchSize;
        }
        await ctx.scheduler.runAfter(0, chunkRef, chunkArgs as any);
        return {
          status: 'running',
          direction,
          runId,
          plan: plan.migrations.map((migration) => migration.id),
        };
      }
    }

    const inlineResult = await chunk(ctx, {
      runId,
      batchSize,
    });
    return {
      status: 'running',
      direction,
      runId,
      plan: plan.migrations.map((migration) => migration.id),
      inlineResult,
    };
  };

  const chunk = async (ctx: RuntimeCtx, args: MigrationRunChunkArgs) => {
    const runId = parseRequiredString(args.runId, 'runId');
    const batchSize = parseOptionalPositiveInteger(args.batchSize, 'batchSize');

    const runRow = await getRunById(ctx.db, runId);
    if (!runRow) {
      return {
        status: 'missing',
        runId,
      };
    }
    if (runRow.status !== 'running') {
      return {
        status: runRow.status,
        runId,
      };
    }
    if (runRow.cancelRequested) {
      await markRunCanceled(ctx.db, runRow);
      return {
        status: 'canceled',
        runId,
      };
    }

    const migrationId = runRow.migrationIds[runRow.currentIndex];
    if (!migrationId) {
      await markRunCompleted(ctx.db, runRow);
      return {
        status: 'completed',
        runId,
      };
    }

    const migration = migrations?.byId[migrationId];
    if (!migration) {
      await markRunFailed(
        ctx.db,
        runRow,
        `Migration '${migrationId}' is missing from registry.`
      );
      return {
        status: 'failed',
        runId,
      };
    }

    const direction = parseDirection(runRow.direction as MigrationDirection);
    const step = getStepForDirection(migration, direction);
    const resolvedBatchSize = batchSize ?? step.batchSize ?? DEFAULT_BATCH_SIZE;
    const stateRow = await getOrCreateStateRow(
      ctx.db,
      migration,
      direction,
      step
    );
    const cursor = stateRow.cursor ?? null;

    try {
      const page = await (ctx.db.query(step.table as any) as any).paginate({
        cursor,
        numItems: resolvedBatchSize,
      });

      const docs = Array.isArray(page?.page)
        ? (page.page as Record<string, unknown>[])
        : [];
      const orm = getOrm(ctx);
      const writeMode = step.writeMode ?? 'safe_bypass';
      let processedInBatch = 0;

      for (const doc of docs) {
        const migrationCtxBase: Omit<MigrationDocContext<TSchema>, 'orm'> = {
          db: ctx.db,
          migrationId,
          runId,
          direction,
          dryRun: false,
          writeMode,
        };
        const result = await runWithWriteMode(orm, writeMode, (resolvedOrm) =>
          step.migrateOne(
            {
              ...migrationCtxBase,
              orm: resolvedOrm,
            },
            doc as MigrationDoc<TSchema, typeof step.table>
          )
        );
        if (isPatchPayload(result) && hasDocId(doc)) {
          await ctx.db.patch((doc as any)._id, result as any);
        }
        processedInBatch += 1;
      }

      const now = Date.now();
      const isDone = Boolean(page?.isDone);
      const nextCursor: string | null = isDone
        ? null
        : ((page?.continueCursor ?? null) as string | null);
      const nextProcessed = (stateRow.processed ?? 0) + processedInBatch;

      if (isDone) {
        await ctx.db.patch(
          stateRow._id,
          cleanUndefined({
            status: 'completed',
            applied: direction === 'up',
            cursor: null,
            processed: nextProcessed,
            completedAt: now,
            updatedAt: now,
            lastError: null,
            runId,
            direction,
            writeMode,
          })
        );

        const nextIndex = runRow.currentIndex + 1;
        const done = nextIndex >= runRow.migrationIds.length;
        await ctx.db.patch(
          runRow._id,
          cleanUndefined({
            currentIndex: nextIndex,
            status: done ? 'completed' : 'running',
            updatedAt: now,
            completedAt: done ? now : null,
            lastError: null,
          })
        );

        if (!done && ctx.scheduler) {
          const chunkRef = getChunkRef();
          if (chunkRef) {
            await ctx.scheduler.runAfter(0, chunkRef, {
              runId,
              batchSize: resolvedBatchSize,
            } as any);
          }
        }

        return {
          status: done ? 'completed' : 'running',
          runId,
          migrationId,
          processedInBatch,
          processed: nextProcessed,
          currentIndex: nextIndex,
          total: runRow.migrationIds.length,
        };
      }

      await ctx.db.patch(
        stateRow._id,
        cleanUndefined({
          status: 'running',
          cursor: nextCursor,
          processed: nextProcessed,
          updatedAt: now,
          runId,
          direction,
          writeMode,
        })
      );
      await ctx.db.patch(
        runRow._id,
        cleanUndefined({
          status: 'running',
          updatedAt: now,
        })
      );

      if (ctx.scheduler) {
        const chunkRef = getChunkRef();
        if (chunkRef) {
          await ctx.scheduler.runAfter(0, chunkRef, {
            runId,
            batchSize: resolvedBatchSize,
          } as any);
        }
      }

      return {
        status: 'running',
        runId,
        migrationId,
        processedInBatch,
        processed: nextProcessed,
        cursor: nextCursor,
      };
    } catch (error) {
      const message = (error as Error).message || String(error);
      await ctx.db.patch(
        stateRow._id,
        cleanUndefined({
          status: 'failed',
          lastError: message,
          updatedAt: Date.now(),
        })
      );
      await markRunFailed(ctx.db, runRow, message);
      return {
        status: 'failed',
        runId,
        migrationId,
        error: message,
      };
    }
  };

  const status = async (ctx: RuntimeCtx, args: MigrationStatusArgs = {}) => {
    if (!migrations) {
      return {
        status: 'noop',
        reason: 'no_migrations_registered',
      };
    }

    const limit = parseOptionalPositiveInteger(args.limit, 'limit') ?? 25;
    const runId = parseOptionalString(args.runId, 'runId');
    const stateRows = await getAllStateRows(ctx.db);
    const runRows = await getAllRunRows(ctx.db);
    const sortedRuns = [...runRows].sort(
      (left, right) => right.startedAt - left.startedAt
    );
    const selectedRuns = runId
      ? sortedRuns.filter((entry) => entry.runId === runId).slice(0, 1)
      : sortedRuns.slice(0, limit);
    const activeRun =
      sortedRuns.find((entry) => entry.status === 'running') ?? null;
    const appliedState = toAppliedStateMap(stateRows);
    const drift = detectMigrationDrift({
      migrationSet: migrations,
      appliedState,
    });
    const pendingUp = buildMigrationPlan({
      direction: 'up',
      migrationSet: migrations,
      appliedState,
    });

    return {
      status: activeRun ? 'running' : 'idle',
      activeRun,
      runs: selectedRuns,
      migrations: stateRows.map((row) => ({
        migrationId: row.migrationId,
        checksum: row.checksum,
        applied: row.applied,
        status: row.status,
        direction: row.direction ?? null,
        runId: row.runId ?? null,
        cursor: row.cursor ?? null,
        processed: row.processed,
        updatedAt: row.updatedAt,
        startedAt: row.startedAt ?? null,
        completedAt: row.completedAt ?? null,
        lastError: row.lastError ?? null,
        writeMode: row.writeMode,
      })),
      pending: pendingUp.migrations.map((migration) => migration.id),
      drift,
    };
  };

  const cancel = async (ctx: RuntimeCtx, args: MigrationCancelArgs = {}) => {
    if (!migrations) {
      return {
        status: 'noop',
        reason: 'no_migrations_registered',
      };
    }
    const runId = parseOptionalString(args.runId, 'runId');
    const runRow = runId
      ? await getRunById(ctx.db, runId)
      : await getActiveRun(ctx.db);
    if (!runRow) {
      return {
        status: 'noop',
        reason: 'no_active_run',
      };
    }
    if (runRow.status !== 'running') {
      return {
        status: 'noop',
        reason: 'run_not_running',
        runId: runRow.runId,
        runStatus: runRow.status,
      };
    }

    const now = Date.now();
    await ctx.db.patch(
      runRow._id,
      cleanUndefined({
        cancelRequested: true,
        updatedAt: now,
      })
    );

    const chunkRef = ctx.scheduler ? getChunkRef() : undefined;
    // In environments without a schedulable chunk ref (tests/local inline), finalize cancel immediately.
    if (!chunkRef) {
      await markRunCanceled(ctx.db, runRow);
      return {
        status: 'canceled',
        runId: runRow.runId,
      };
    }

    return {
      status: 'cancel_requested',
      runId: runRow.runId,
    };
  };

  return {
    run,
    chunk,
    status,
    cancel,
  };
}

function getStepForDirection<TSchema extends TablesRelationalConfig>(
  migration: MigrationManifestEntry<TSchema>,
  direction: MigrationDirection
) {
  if (direction === 'up') {
    return migration.up;
  }
  if (!migration.down) {
    throw new Error(`Migration '${migration.id}' is missing down migration.`);
  }
  return migration.down;
}

function createRunId(now: number): string {
  return `mr_${now}_${Math.random().toString(36).slice(2, 10)}`;
}

function parseDirection(value: unknown): MigrationDirection {
  if (value === undefined || value === null) {
    return 'up';
  }
  if (value === 'up' || value === 'down') {
    return value;
  }
  throw new Error("Migration direction must be either 'up' or 'down'.");
}

function parseOptionalPositiveInteger(
  value: unknown,
  fieldName: string
): number | undefined {
  if (value === undefined || value === null) {
    return;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error(`Migration ${fieldName} must be a positive integer.`);
  }
  return value;
}

function parseOptionalString(
  value: unknown,
  fieldName: string
): string | undefined {
  if (value === undefined || value === null) {
    return;
  }
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Migration ${fieldName} must be a non-empty string.`);
  }
  return value;
}

function parseRequiredString(value: unknown, fieldName: string): string {
  const parsed = parseOptionalString(value, fieldName);
  if (!parsed) {
    throw new Error(`Migration ${fieldName} is required.`);
  }
  return parsed;
}

function toAppliedStateMap(stateRows: MigrationStateDoc[]): MigrationStateMap {
  const entries: Record<string, MigrationAppliedState> = {};
  for (const row of stateRows) {
    entries[row.migrationId] = {
      applied: row.applied,
      checksum: row.checksum,
      cursor: row.cursor ?? null,
      processed: row.processed,
    };
  }
  return entries;
}

async function getAllStateRows(db: GenericDatabaseWriter<any>) {
  return (await (db.query(MIGRATION_STATE_TABLE as any) as any).collect()) as
    | MigrationStateDoc[]
    | [];
}

async function getAllRunRows(db: GenericDatabaseWriter<any>) {
  return (await (db.query(MIGRATION_RUN_TABLE as any) as any).collect()) as
    | MigrationRunDoc[]
    | [];
}

async function getRunById(
  db: GenericDatabaseWriter<any>,
  runId: string
): Promise<MigrationRunDoc | null> {
  const row = await (db.query(MIGRATION_RUN_TABLE as any) as any)
    .withIndex('by_run_id', (query: any) => query.eq('runId', runId))
    .first();
  return (row as MigrationRunDoc | null) ?? null;
}

async function getActiveRun(
  db: GenericDatabaseWriter<any>
): Promise<MigrationRunDoc | null> {
  const row = await (db.query(MIGRATION_RUN_TABLE as any) as any)
    .withIndex('by_status', (query: any) => query.eq('status', 'running'))
    .first();
  return (row as MigrationRunDoc | null) ?? null;
}

async function getOrCreateStateRow<TSchema extends TablesRelationalConfig>(
  db: GenericDatabaseWriter<any>,
  migration: MigrationManifestEntry<TSchema>,
  direction: MigrationDirection,
  step: { writeMode?: MigrationWriteMode }
): Promise<MigrationStateDoc> {
  const existing = await (db.query(MIGRATION_STATE_TABLE as any) as any)
    .withIndex('by_migration_id', (query: any) =>
      query.eq('migrationId', migration.id)
    )
    .first();
  if (existing) {
    return existing as MigrationStateDoc;
  }
  const now = Date.now();
  const stateId = await db.insert(MIGRATION_STATE_TABLE as any, {
    migrationId: migration.id,
    checksum: migration.checksum,
    applied: direction === 'down',
    status: 'pending',
    direction,
    runId: null,
    cursor: null,
    processed: 0,
    startedAt: now,
    updatedAt: now,
    completedAt: null,
    lastError: null,
    writeMode: step.writeMode ?? 'safe_bypass',
  });
  const created = await db.get(stateId as any);
  if (!created) {
    throw new Error(
      `Failed to create migration state row for '${migration.id}'.`
    );
  }
  return created as MigrationStateDoc;
}

async function markRunCompleted(
  db: GenericDatabaseWriter<any>,
  runRow: MigrationRunDoc
) {
  const now = Date.now();
  await db.patch(
    runRow._id,
    cleanUndefined({
      status: 'completed',
      updatedAt: now,
      completedAt: now,
      cancelRequested: false,
      lastError: null,
    })
  );
}

async function markRunCanceled(
  db: GenericDatabaseWriter<any>,
  runRow: MigrationRunDoc
) {
  const now = Date.now();
  await db.patch(
    runRow._id,
    cleanUndefined({
      status: 'canceled',
      updatedAt: now,
      completedAt: now,
      cancelRequested: true,
    })
  );
  for (const stateRow of await getAllStateRows(db)) {
    if (
      stateRow.runId === runRow.runId &&
      (stateRow.status === 'running' || stateRow.status === 'pending')
    ) {
      await db.patch(
        stateRow._id,
        cleanUndefined({
          status: 'canceled',
          updatedAt: now,
        })
      );
    }
  }
}

async function markRunFailed(
  db: GenericDatabaseWriter<any>,
  runRow: MigrationRunDoc,
  message: string
) {
  const now = Date.now();
  await db.patch(
    runRow._id,
    cleanUndefined({
      status: 'failed',
      updatedAt: now,
      completedAt: now,
      lastError: message,
    })
  );
}

async function runWithWriteMode<
  TSchema extends TablesRelationalConfig,
  TResult,
>(
  orm: OrmWriter<TSchema>,
  writeMode: MigrationWriteMode,
  callback: (orm: OrmWriter<TSchema>) => Promise<TResult> | TResult
): Promise<TResult> {
  if (writeMode === 'normal') {
    return await callback(orm);
  }
  return await orm.skipRules.withoutTriggers(async (noTriggersOrm) => {
    return await callback(noTriggersOrm as OrmWriter<TSchema>);
  });
}

function isPatchPayload(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function hasDocId(doc: Record<string, unknown>): boolean {
  return '_id' in doc && doc._id !== undefined && doc._id !== null;
}

function cleanUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, candidate]) => candidate !== undefined)
  ) as T;
}
