import type {
  GenericDatabaseWriter,
  SchedulableFunctionReference,
  Scheduler,
} from 'convex/server';
import { createDatabase } from './database';
import type { EdgeMetadata } from './extractRelationsConfig';
import {
  applyIncomingForeignKeyActionsOnDelete,
  type CascadeMode,
  type DeleteMode,
  decodeUndefinedDeep,
  deserializeFilterExpression,
  ensureDefaultColumns,
  ensureNonNullValues,
  ensureNullableColumns,
  getMutationCollectionLimits,
  getOrmContext,
  hardDeleteRow,
  type SerializedFilterExpression,
  softDeleteRow,
  takeRowsWithinByteBudget,
} from './mutation-utils';
import type { TablesRelationalConfig } from './relations';
import type { ConvexTableWithColumns } from './table';

export type ScheduledMutationWorkType =
  | 'root-update'
  | 'root-delete'
  | 'cascade-delete'
  | 'cascade-update';

export type ScheduledMutationBatchArgs = {
  workType?: ScheduledMutationWorkType;
  mode?: 'sync' | 'async';
  operation: 'update' | 'delete';
  table: string;
  where?: SerializedFilterExpression;
  allowFullScan?: boolean;
  update?: Record<string, unknown>;
  deleteMode?: DeleteMode;
  cascadeMode?: CascadeMode;
  foreignIndexName?: string;
  foreignSourceColumns?: string[];
  targetValues?: unknown;
  newValues?: unknown;
  foreignAction?:
    | 'cascade'
    | 'set null'
    | 'set default'
    | 'restrict'
    | 'no action';
  cursor: string | null;
  batchSize: number;
  maxBytesPerBatch?: number;
  delayMs: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

export function scheduledMutationBatchFactory<
  TSchema extends TablesRelationalConfig,
>(
  schema: TSchema,
  edgeMetadata: EdgeMetadata[],
  scheduledMutationBatch: SchedulableFunctionReference
) {
  const tableByName = new Map<string, ConvexTableWithColumns<any>>();
  for (const tableConfig of Object.values(schema)) {
    if (tableConfig?.name && tableConfig.table) {
      tableByName.set(
        tableConfig.name,
        tableConfig.table as ConvexTableWithColumns<any>
      );
    }
  }

  return async function scheduledMutationBatchHandler(
    ctx: { db: GenericDatabaseWriter<any>; scheduler: Scheduler },
    args: ScheduledMutationBatchArgs
  ) {
    const workType: ScheduledMutationWorkType =
      args.workType ??
      (args.operation === 'update' ? 'root-update' : 'root-delete');
    const table = tableByName.get(args.table);
    if (!table) {
      throw new Error(`scheduledMutationBatch: unknown table '${args.table}'.`);
    }
    if (!Number.isInteger(args.batchSize) || args.batchSize < 1) {
      throw new Error(
        'scheduledMutationBatch: batchSize must be a positive integer.'
      );
    }
    if (!Number.isFinite(args.delayMs) || args.delayMs < 0) {
      throw new Error(
        'scheduledMutationBatch: delayMs must be a non-negative number.'
      );
    }
    if (
      args.maxBytesPerBatch !== undefined &&
      (!Number.isInteger(args.maxBytesPerBatch) || args.maxBytesPerBatch < 1)
    ) {
      throw new Error(
        'scheduledMutationBatch: maxBytesPerBatch must be a positive integer.'
      );
    }

    const db = createDatabase(ctx.db, schema, edgeMetadata, {
      scheduler: ctx.scheduler,
      scheduledMutationBatch,
    });
    const ormContext = getOrmContext(db as any);
    const foreignKeyGraph = ormContext?.foreignKeyGraph;
    const strict = ormContext?.strict ?? true;
    const { leafBatchSize, maxRows, maxBytesPerBatch, scheduleCallCap } =
      getMutationCollectionLimits(ormContext);
    const where = deserializeFilterExpression(args.where);

    if (workType === 'root-update') {
      if (!isRecord(args.update)) {
        throw new Error(
          'scheduledMutationBatch: update operation requires update values.'
        );
      }
      let builder: any = db
        .update(table)
        .set(decodeUndefinedDeep(args.update) as Record<string, unknown>);
      if (args.mode === 'async') {
        builder.executionModeOverride = 'async';
      }
      if (where) {
        builder = builder.where(where);
      }
      if (args.allowFullScan) {
        builder = builder.allowFullScan();
      }
      const page = await builder.paginate({
        cursor: args.cursor,
        limit: args.batchSize,
      });
      if (!page.isDone && page.continueCursor !== null) {
        await ctx.scheduler.runAfter(args.delayMs, scheduledMutationBatch, {
          ...args,
          workType,
          cursor: page.continueCursor,
          maxBytesPerBatch: args.maxBytesPerBatch ?? maxBytesPerBatch,
        });
      }
      return;
    }

    if (workType === 'root-delete') {
      if (args.deleteMode === 'scheduled') {
        throw new Error(
          'scheduledMutationBatch: deleteMode "scheduled" is not supported.'
        );
      }
      let builder: any = db.delete(table);
      if (args.mode === 'async') {
        builder.executionModeOverride = 'async';
      }
      if (args.deleteMode === 'soft') {
        builder = builder.soft();
      }
      if (args.cascadeMode) {
        builder = builder.cascade({ mode: args.cascadeMode });
      }
      if (where) {
        builder = builder.where(where);
      }
      if (args.allowFullScan) {
        builder = builder.allowFullScan();
      }
      const page = await builder.paginate({
        cursor: args.cursor,
        limit: args.batchSize,
      });
      if (!page.isDone && page.continueCursor !== null) {
        await ctx.scheduler.runAfter(args.delayMs, scheduledMutationBatch, {
          ...args,
          workType,
          cursor: page.continueCursor,
          maxBytesPerBatch: args.maxBytesPerBatch ?? maxBytesPerBatch,
        });
      }
      return;
    }

    const sourceColumns = args.foreignSourceColumns ?? [];
    if (sourceColumns.length === 0) {
      throw new Error(
        'scheduledMutationBatch: foreignSourceColumns are required for cascade work.'
      );
    }
    const targetValues = decodeUndefinedDeep(args.targetValues) as
      | unknown[]
      | undefined;
    if (!targetValues || !Array.isArray(targetValues)) {
      throw new Error(
        'scheduledMutationBatch: targetValues are required for cascade work.'
      );
    }
    if (!args.foreignIndexName) {
      throw new Error(
        'scheduledMutationBatch: foreignIndexName is required for cascade work.'
      );
    }
    const queryWithIndex = () =>
      (ctx.db.query(args.table) as any).withIndex(
        args.foreignIndexName,
        (q: any) => {
          let builder = q.eq(sourceColumns[0], targetValues[0]);
          for (let i = 1; i < sourceColumns.length; i += 1) {
            builder = builder.eq(sourceColumns[i], targetValues[i]);
          }
          return builder;
        }
      );
    const action = args.foreignAction ?? 'no action';
    // Cascade workers patch/delete rows that are selected by the same indexed
    // foreign key columns. Forwarding cursors can skip remaining rows after
    // those mutations, so cascade continuation always re-queries from null.
    const usesCursorContinuation = false;
    const paged = await queryWithIndex().paginate({
      cursor: usesCursorContinuation ? args.cursor : null,
      numItems: args.batchSize,
    });
    const resolvedMaxBytesPerBatch = args.maxBytesPerBatch ?? maxBytesPerBatch;
    const bounded = takeRowsWithinByteBudget(
      paged.page as Record<string, unknown>[],
      resolvedMaxBytesPerBatch
    );
    const rows = bounded.rows;
    const hitByteLimit = bounded.hitLimit;
    const scheduleState = {
      remainingCalls: scheduleCallCap,
      callCap: scheduleCallCap,
    };

    if (workType === 'cascade-delete') {
      if (action === 'set null') {
        ensureNullableColumns(
          table,
          sourceColumns,
          `Foreign key set null on '${args.table}'`
        );
        for (const row of rows) {
          const patch: Record<string, unknown> = {};
          for (const columnName of sourceColumns) {
            patch[columnName] = null;
          }
          await ctx.db.patch(args.table, row._id as any, patch);
        }
      } else if (action === 'set default') {
        const defaults = ensureDefaultColumns(
          table,
          sourceColumns,
          `Foreign key set default on '${args.table}'`
        );
        for (const row of rows) {
          await ctx.db.patch(args.table, row._id as any, defaults);
        }
      } else if (action === 'cascade') {
        if (!foreignKeyGraph) {
          throw new Error(
            'scheduledMutationBatch: foreign key graph is missing from ORM context.'
          );
        }
        for (const row of rows) {
          const visited = new Set<string>([
            `${args.table}:${(row as any)._id}`,
          ]);
          await applyIncomingForeignKeyActionsOnDelete(db as any, table, row, {
            graph: foreignKeyGraph,
            deleteMode: args.deleteMode ?? 'hard',
            cascadeMode: args.cascadeMode ?? 'hard',
            visited,
            batchSize: args.batchSize,
            leafBatchSize,
            maxRows,
            maxBytesPerBatch: resolvedMaxBytesPerBatch,
            allowFullScan: args.allowFullScan,
            strict,
            executionMode: 'async',
            scheduler: ctx.scheduler,
            scheduledMutationBatch,
            scheduleState,
            delayMs: args.delayMs,
          });
          if ((args.cascadeMode ?? 'hard') === 'soft') {
            await softDeleteRow(ctx.db, table, row);
          } else {
            await hardDeleteRow(ctx.db, args.table, row);
          }
        }
      }
    } else if (workType === 'cascade-update') {
      if (action === 'set null') {
        ensureNullableColumns(
          table,
          sourceColumns,
          `Foreign key set null on '${args.table}'`
        );
        for (const row of rows) {
          const patch: Record<string, unknown> = {};
          for (const columnName of sourceColumns) {
            patch[columnName] = null;
          }
          await ctx.db.patch(args.table, row._id as any, patch);
        }
      } else if (action === 'set default') {
        const defaults = ensureDefaultColumns(
          table,
          sourceColumns,
          `Foreign key set default on '${args.table}'`
        );
        for (const row of rows) {
          await ctx.db.patch(args.table, row._id as any, defaults);
        }
      } else if (action === 'cascade') {
        const newValues = decodeUndefinedDeep(args.newValues) as
          | unknown[]
          | undefined;
        if (!newValues || !Array.isArray(newValues)) {
          throw new Error(
            'scheduledMutationBatch: newValues are required for cascade update.'
          );
        }
        const patchValues: Record<string, unknown> = {};
        for (let i = 0; i < sourceColumns.length; i += 1) {
          patchValues[sourceColumns[i]] = newValues[i];
        }
        ensureNonNullValues(
          table,
          patchValues,
          `Foreign key cascade update on '${args.table}'`
        );
        for (const row of rows) {
          await ctx.db.patch(args.table, row._id as any, patchValues);
        }
      }
    }

    if (usesCursorContinuation) {
      if (!paged.isDone && paged.continueCursor !== null) {
        await ctx.scheduler.runAfter(args.delayMs, scheduledMutationBatch, {
          ...args,
          workType,
          cursor: paged.continueCursor,
        });
      }
      return;
    }

    const hasRemaining = (await queryWithIndex().first()) !== null;
    if (hasRemaining || hitByteLimit) {
      await ctx.scheduler.runAfter(args.delayMs, scheduledMutationBatch, {
        ...args,
        workType,
        cursor: null,
        maxBytesPerBatch: resolvedMaxBytesPerBatch,
      });
    }
  };
}
