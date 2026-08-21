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
  patchReferencingRows,
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

/** Column stamped by `softDeleteRow`; see mutation-utils.ts. */
const DELETION_TIME_FIELD = 'deletionTime';

const isPending = (row: Record<string, unknown>) =>
  row[DELETION_TIME_FIELD] === undefined || row[DELETION_TIME_FIELD] === null;

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
    const action = args.foreignAction ?? 'no action';
    // Every other cascade action stops a processed row from matching this
    // index: hard delete removes it, `set null` / `set default` / cascade
    // update rewrite the foreign key columns. Soft cascade only stamps
    // `deletionTime`, so a processed row keeps matching, and a batch that
    // re-queries the whole range re-reads every row the campaign already
    // handled — reads grow with the square of the row count.
    const isSoftCascade =
      workType === 'cascade-delete' &&
      action === 'cascade' &&
      (args.cascadeMode ?? 'hard') === 'soft';
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
    // Continuation is a forwarded pagination cursor only for soft cascade.
    // Every other action rewrites the indexed foreign key columns or removes the
    // row outright, which moves rows relative to a cursor taken before those
    // mutations — and drops them out of the range, so re-querying from null is
    // already linear there. Soft cascade moves nothing: `deletionTime` is not an
    // indexed column, so the page resumes exactly where the last batch stopped.
    //
    // Rows this campaign already stamped must not be filtered out of the query.
    // Convex reads them either way — a `.filter()` only hides them from the page
    // while still paying for the scan — and excluding the cursor's own row from
    // the result strands the cursor. They are skipped in JS below instead.
    //
    // Resuming means a row inserted behind the cursor mid-campaign is not picked
    // up. That is inherent to not re-reading the range, and the race was never
    // settled anyway: the campaign could have passed that key before the insert.
    const paged = await queryWithIndex().paginate({
      cursor: isSoftCascade ? args.cursor : null,
      numItems: args.batchSize,
    });
    const resolvedMaxBytesPerBatch = args.maxBytesPerBatch ?? maxBytesPerBatch;
    const bounded = takeRowsWithinByteBudget(
      paged.page as Record<string, unknown>[],
      resolvedMaxBytesPerBatch
    );
    // What the scan consumed and what still has cascade work diverge under soft
    // cascade: a page can hold rows this campaign, or another writer, already
    // soft-deleted. They still move the cursor.
    const consumedRows = bounded.rows;
    const rows = isSoftCascade ? consumedRows.filter(isPending) : consumedRows;
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
        const nullPatch: Record<string, unknown> = {};
        for (const columnName of sourceColumns) {
          nullPatch[columnName] = null;
        }
        await patchReferencingRows(ctx.db, args.table, rows, nullPatch);
      } else if (action === 'set default') {
        const defaults = ensureDefaultColumns(
          table,
          sourceColumns,
          `Foreign key set default on '${args.table}'`
        );
        await patchReferencingRows(ctx.db, args.table, rows, defaults);
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
        const nullPatch: Record<string, unknown> = {};
        for (const columnName of sourceColumns) {
          nullPatch[columnName] = null;
        }
        await patchReferencingRows(ctx.db, args.table, rows, nullPatch);
      } else if (action === 'set default') {
        const defaults = ensureDefaultColumns(
          table,
          sourceColumns,
          `Foreign key set default on '${args.table}'`
        );
        await patchReferencingRows(ctx.db, args.table, rows, defaults);
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
        await patchReferencingRows(ctx.db, args.table, rows, patchValues);
      }
    }

    if (isSoftCascade) {
      if (hitByteLimit) {
        // The byte budget stopped this batch short of the page Convex returned,
        // so `paged.continueCursor` covers rows it never processed. Convex
        // allows one paginated query per function execution, so this batch
        // cannot ask for a second cursor that ends where it actually stopped.
        // Replay the same starting point with the page size that did fit: that
        // page ends exactly here, so its cursor is exact. `takeRowsWithinByteBudget`
        // always keeps one row, and a truncated page is strictly shorter than
        // the one requested, so the size strictly decreases and settles — after
        // which the rest of the campaign pages at a size that never truncates.
        await ctx.scheduler.runAfter(args.delayMs, scheduledMutationBatch, {
          ...args,
          workType,
          cursor: args.cursor,
          batchSize: consumedRows.length,
          maxBytesPerBatch: resolvedMaxBytesPerBatch,
        });
        return;
      }
      if (!paged.isDone && paged.continueCursor !== null) {
        await ctx.scheduler.runAfter(args.delayMs, scheduledMutationBatch, {
          ...args,
          workType,
          cursor: paged.continueCursor,
          maxBytesPerBatch: resolvedMaxBytesPerBatch,
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
