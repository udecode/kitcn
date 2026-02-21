import type { GenericDatabaseWriter } from 'convex/server';
import type { FilterExpression } from './filter-expression';
import { isFieldReference } from './filter-expression';
import { getIndexes } from './index-utils';
import {
  applyIncomingForeignKeyActionsOnDelete,
  type CascadeMode,
  collectMutationRowsBounded,
  type DeleteMode,
  evaluateFilter,
  getMutationAsyncDelayMs,
  getMutationCollectionLimits,
  getMutationExecutionMode,
  getOrmContext,
  getTableDeleteConfig,
  getTableName,
  hardDeleteRow,
  hydrateDateFieldsForRead,
  selectReturningRowWithHydration,
  serializeFilterExpression,
  softDeleteRow,
  toConvexFilter,
} from './mutation-utils';
import { QueryPromise } from './query-promise';
import { canDeleteRow } from './rls/evaluator';
import type { ConvexTable } from './table';
import type {
  MutationAsyncConfig,
  MutationExecuteConfig,
  MutationExecuteResult,
  MutationExecutionMode,
  MutationPaginateConfig,
  MutationResult,
  MutationReturning,
  ReturningSelection,
} from './types';
import { WhereClauseCompiler } from './where-clause-compiler';

const applyIndexFilter = (query: any, filter: FilterExpression<boolean>) => {
  if (filter.type !== 'binary') {
    return query;
  }
  const [field, value] = filter.operands;
  if (!isFieldReference(field)) {
    return query;
  }
  switch (filter.operator) {
    case 'eq':
      return query.eq(field.fieldName, value);
    case 'gt':
      return query.gt(field.fieldName, value);
    case 'gte':
      return query.gte(field.fieldName, value);
    case 'lt':
      return query.lt(field.fieldName, value);
    case 'lte':
      return query.lte(field.fieldName, value);
    default:
      return query;
  }
};

export type ConvexDeleteWithout<
  T extends ConvexDeleteBuilder<any, any, any>,
  K extends string,
> = Omit<T, K>;

export class ConvexDeleteBuilder<
  TTable extends ConvexTable<any>,
  TReturning extends MutationReturning = undefined,
  TMode extends MutationExecutionMode = 'single',
> extends QueryPromise<MutationExecuteResult<TTable, TReturning, TMode>> {
  declare readonly _: {
    readonly table: TTable;
    readonly returning: TReturning;
    readonly mode: TMode;
    readonly result: MutationExecuteResult<TTable, TReturning, TMode>;
  };

  private whereExpression?: FilterExpression<boolean>;
  private returningFields?: TReturning;
  private allowFullScanFlag = false;
  private deleteModeOverride?: DeleteMode;
  private cascadeMode?: CascadeMode;
  private scheduledDelayMs?: number;
  private executionModeOverride?: 'sync' | 'async';
  private paginateConfig?: MutationPaginateConfig;

  constructor(
    private db: GenericDatabaseWriter<any>,
    private table: TTable
  ) {
    super();
  }

  where(expression: FilterExpression<boolean>): this {
    this.whereExpression = expression;
    return this;
  }

  returning(): ConvexDeleteWithout<
    ConvexDeleteBuilder<TTable, true, TMode>,
    'returning'
  >;
  returning<TSelection extends ReturningSelection<TTable>>(
    fields: TSelection
  ): ConvexDeleteWithout<
    ConvexDeleteBuilder<TTable, TSelection, TMode>,
    'returning'
  >;
  returning(
    fields?: ReturningSelection<TTable>
  ): ConvexDeleteWithout<
    ConvexDeleteBuilder<TTable, MutationReturning, TMode>,
    'returning'
  > {
    this.returningFields = (fields ?? true) as TReturning;
    return this as any;
  }

  paginate(
    config: MutationPaginateConfig
  ): ConvexDeleteWithout<
    ConvexDeleteBuilder<TTable, TReturning, 'paged'>,
    'paginate'
  > {
    if (!Number.isInteger(config.limit) || config.limit < 1) {
      throw new Error('paginate() limit must be a positive integer.');
    }
    this.paginateConfig = config;
    return this as any;
  }

  allowFullScan(): this {
    this.allowFullScanFlag = true;
    return this;
  }

  private getIdEquality():
    | { matched: true; value: unknown }
    | { matched: false } {
    const expression = this.whereExpression;
    if (!expression || expression.type !== 'binary') {
      return { matched: false };
    }
    if (expression.operator !== 'eq') {
      return { matched: false };
    }
    const [left, right] = expression.operands;
    if (isFieldReference(left) && left.fieldName === '_id') {
      if (isFieldReference(right)) {
        return { matched: false };
      }
      return { matched: true, value: right };
    }
    if (isFieldReference(right) && right.fieldName === '_id') {
      if (isFieldReference(left)) {
        return { matched: false };
      }
      return { matched: true, value: left };
    }
    return { matched: false };
  }

  soft(): this {
    this.deleteModeOverride = 'soft';
    this.scheduledDelayMs = undefined;
    return this;
  }

  hard(): this {
    this.deleteModeOverride = 'hard';
    this.scheduledDelayMs = undefined;
    return this;
  }

  scheduled(config: { delayMs: number }): this {
    if (!Number.isFinite(config.delayMs) || config.delayMs < 0) {
      throw new Error('scheduled() delayMs must be a non-negative number.');
    }
    this.deleteModeOverride = 'scheduled';
    this.scheduledDelayMs = config.delayMs;
    return this;
  }

  private resolveDeleteModeAndDelay(): {
    deleteMode: DeleteMode;
    scheduledDelayMs: number;
  } {
    const tableDeleteConfig = getTableDeleteConfig(this.table);
    const deleteMode =
      this.deleteModeOverride ?? tableDeleteConfig?.mode ?? 'hard';
    const scheduledDelayMs =
      this.scheduledDelayMs ??
      (deleteMode === 'scheduled' ? (tableDeleteConfig?.delayMs ?? 0) : 0);
    return {
      deleteMode,
      scheduledDelayMs,
    };
  }

  cascade(config: { mode: CascadeMode }): this {
    this.cascadeMode = config.mode;
    return this;
  }

  async executeAsync(
    ...args: TMode extends 'single'
      ? [config?: MutationAsyncConfig]
      : [config: never]
  ): Promise<
    TMode extends 'single'
      ? MutationExecuteResult<TTable, TReturning, 'single'>
      : never
  > {
    const config = args[0] as MutationAsyncConfig | undefined;
    return this.execute({
      ...config,
      mode: 'async',
    } as never) as any;
  }

  async execute(
    ...args: TMode extends 'single'
      ? [config?: MutationExecuteConfig]
      : [config?: never]
  ): Promise<MutationExecuteResult<TTable, TReturning, TMode>> {
    const config = args[0] as MutationExecuteConfig | undefined;
    const tableName = getTableName(this.table);
    const ormContext = getOrmContext(this.db);
    const strict = ormContext?.strict ?? true;
    const allowFullScan = this.allowFullScanFlag;
    const pagination = this.paginateConfig;
    const isPaginated = pagination !== undefined;
    if (isPaginated && config) {
      throw new Error('execute() config cannot be combined with paginate().');
    }
    const {
      batchSize,
      leafBatchSize,
      maxRows,
      maxBytesPerBatch,
      scheduleCallCap,
    } = getMutationCollectionLimits(ormContext);
    const resolvedMode = getMutationExecutionMode(
      ormContext,
      config?.mode ?? this.executionModeOverride
    );
    const delayMs = getMutationAsyncDelayMs(ormContext, config?.delayMs);
    const { deleteMode, scheduledDelayMs } = this.resolveDeleteModeAndDelay();

    if (!isPaginated && resolvedMode === 'async') {
      if (deleteMode === 'scheduled') {
        throw new Error(
          'executeAsync() cannot be combined with scheduled() delete mode.'
        );
      }
      if (!ormContext?.scheduler || !ormContext.scheduledMutationBatch) {
        throw new Error(
          'executeAsync() requires orm.db(ctx) configured with scheduling (missing scheduler, scheduledMutationBatch).'
        );
      }
      const asyncBatchSize = config?.batchSize ?? batchSize;
      if (!Number.isInteger(asyncBatchSize) || asyncBatchSize < 1) {
        throw new Error('executeAsync() batchSize must be a positive integer.');
      }
      if (!Number.isFinite(delayMs) || delayMs < 0) {
        throw new Error(
          'executeAsync() delayMs must be a non-negative number.'
        );
      }

      const previousPaginate = this.paginateConfig;
      const previousMode = this.executionModeOverride;
      this.paginateConfig = { cursor: null, limit: asyncBatchSize };
      this.executionModeOverride = 'async';

      try {
        const firstBatch = (await this.execute()) as unknown as {
          continueCursor: string | null;
          isDone: boolean;
          numAffected: number;
          page?: MutationResult<TTable, TReturning>;
        };

        if (!firstBatch.isDone && firstBatch.continueCursor !== null) {
          await ormContext.scheduler.runAfter(
            delayMs,
            ormContext.scheduledMutationBatch,
            {
              workType: 'root-delete',
              mode: 'async',
              operation: 'delete',
              table: getTableName(this.table),
              where: serializeFilterExpression(this.whereExpression),
              allowFullScan: this.allowFullScanFlag,
              deleteMode,
              cascadeMode: this.cascadeMode,
              cursor: firstBatch.continueCursor,
              batchSize: asyncBatchSize,
              maxBytesPerBatch,
              delayMs,
            }
          );
        }

        if (!this.returningFields) {
          return undefined as any;
        }
        return (firstBatch.page ?? []) as any;
      } finally {
        this.paginateConfig = previousPaginate;
        this.executionModeOverride = previousMode;
      }
    }

    if (!this.whereExpression) {
      if (!allowFullScan) {
        throw new Error(
          'update/delete without where() requires allowFullScan: true.'
        );
      }
      if (strict) {
        console.warn(
          'update/delete without where() is running with allowFullScan: true.'
        );
      }
    }

    let rows: Record<string, unknown>[];
    let continueCursor: string | null = null;
    let isDone = true;
    const idEquality = this.getIdEquality();
    if (idEquality.matched) {
      const idValue = idEquality.value;
      if (isPaginated && pagination.cursor !== null) {
        rows = [];
      } else if (idValue === null || idValue === undefined) {
        rows = [];
      } else {
        const row = await this.db.get(idValue as any);
        rows = row ? [row as Record<string, unknown>] : [];
      }
    } else if (this.whereExpression) {
      const compiler = new WhereClauseCompiler(
        tableName,
        getIndexes(this.table).map((index) => ({
          indexName: index.name,
          indexFields: index.fields,
        }))
      );
      const compiled = compiler.compile(this.whereExpression);
      const hasIndex =
        !!compiled.selectedIndex &&
        (compiled.indexFilters.length > 0 || compiled.probeFilters.length > 0);

      if (!hasIndex && !allowFullScan) {
        throw new Error(
          'update/delete requires allowFullScan: true when no index is available.'
        );
      }

      if (!hasIndex && strict) {
        console.warn(
          'update/delete with filter is running with allowFullScan: true.'
        );
      }

      const filterFn = toConvexFilter(this.whereExpression);

      if (isPaginated) {
        if (hasIndex && compiled.probeFilters.length > 0) {
          throw new Error(
            'update/delete pagination does not support multi-probe filters yet. Rewrite where() to a single index range.'
          );
        }
        const page: {
          page: Record<string, unknown>[];
          continueCursor: string | null;
          isDone: boolean;
        } = await (() => {
          let currentQuery: any = this.db.query(tableName);
          if (hasIndex) {
            const indexName = compiled.selectedIndex!.indexName;
            currentQuery = currentQuery.withIndex(indexName, (q: any) => {
              let builder = q;
              for (const filter of compiled.indexFilters) {
                builder = applyIndexFilter(builder, filter);
              }
              return builder;
            });
          }
          return currentQuery
            .filter((q: any) => filterFn(q))
            .paginate({
              cursor: pagination.cursor,
              numItems: pagination.limit,
            });
        })();
        rows = page.page as Record<string, unknown>[];
        continueCursor = page.continueCursor;
        isDone = page.isDone;
      } else if (hasIndex && compiled.probeFilters.length > 0) {
        const indexName = compiled.selectedIndex!.indexName;
        const dedupedRows = new Map<string, Record<string, unknown>>();
        for (const probeFilters of compiled.probeFilters) {
          const probeRows = await collectMutationRowsBounded(
            () => {
              let probeQuery: any = this.db
                .query(tableName)
                .withIndex(indexName, (q: any) => {
                  let builder = q;
                  for (const filter of probeFilters) {
                    builder = applyIndexFilter(builder, filter);
                  }
                  return builder;
                });
              probeQuery = probeQuery.filter((q: any) => filterFn(q));
              return probeQuery;
            },
            {
              operation: 'delete',
              tableName,
              batchSize,
              maxRows,
            }
          );
          for (const row of probeRows) {
            dedupedRows.set(String((row as any)._id), row as any);
            if (dedupedRows.size > maxRows) {
              throw new Error(
                `delete exceeded mutationMaxRows (${maxRows}) on "${tableName}". ` +
                  'Narrow the filter or increase defineSchema(..., { defaults: { mutationMaxRows } }).'
              );
            }
          }
        }
        rows = Array.from(dedupedRows.values());
      } else {
        rows = await collectMutationRowsBounded(
          () => {
            let currentQuery: any = this.db.query(tableName);
            if (hasIndex) {
              const indexName = compiled.selectedIndex!.indexName;
              currentQuery = currentQuery.withIndex(indexName, (q: any) => {
                let builder = q;
                for (const filter of compiled.indexFilters) {
                  builder = applyIndexFilter(builder, filter);
                }
                return builder;
              });
            }
            return currentQuery.filter((q: any) => filterFn(q));
          },
          {
            operation: 'delete',
            tableName,
            batchSize,
            maxRows,
          }
        );
      }
    } else if (isPaginated) {
      const page: {
        page: Record<string, unknown>[];
        continueCursor: string | null;
        isDone: boolean;
      } = await this.db.query(tableName).paginate({
        cursor: pagination.cursor,
        numItems: pagination.limit,
      });
      rows = page.page as Record<string, unknown>[];
      continueCursor = page.continueCursor;
      isDone = page.isDone;
    } else {
      rows = await collectMutationRowsBounded(() => this.db.query(tableName), {
        operation: 'delete',
        tableName,
        batchSize,
        maxRows,
      });
    }

    if (this.whereExpression) {
      rows = rows.filter((row) =>
        evaluateFilter(row as any, this.whereExpression as any)
      );
    }

    const results: Record<string, unknown>[] = [];
    let numAffected = 0;

    const rls = ormContext?.rls;
    const foreignKeyGraph = ormContext?.foreignKeyGraph;
    if (!foreignKeyGraph) {
      throw new Error(
        'Foreign key actions require orm.db(ctx) configured from createOrm({ schema, ... }).'
      );
    }

    const cascadeMode: CascadeMode =
      this.cascadeMode ??
      (deleteMode === 'soft' || deleteMode === 'scheduled' ? 'soft' : 'hard');

    const visited = new Set<string>();
    const scheduleState = {
      remainingCalls: scheduleCallCap,
      callCap: scheduleCallCap,
    };
    const fkBatchSize = isPaginated ? pagination.limit : batchSize;

    for (const row of rows) {
      if (
        !(await canDeleteRow({
          table: this.table,
          row: row as Record<string, unknown>,
          rls,
        }))
      ) {
        continue;
      }

      visited.add(`${tableName}:${(row as any)._id}`);
      if (this.returningFields) {
        if (this.returningFields === true) {
          results.push(hydrateDateFieldsForRead(this.table, row as any));
        } else {
          results.push(
            selectReturningRowWithHydration(
              this.table,
              row as any,
              this.returningFields as any
            )
          );
        }
      }

      await applyIncomingForeignKeyActionsOnDelete(
        this.db,
        this.table,
        row as Record<string, unknown>,
        {
          graph: foreignKeyGraph,
          deleteMode,
          cascadeMode,
          visited,
          batchSize: fkBatchSize,
          leafBatchSize,
          maxRows,
          maxBytesPerBatch,
          allowFullScan,
          strict,
          executionMode: resolvedMode,
          scheduler: ormContext?.scheduler,
          scheduledMutationBatch: ormContext?.scheduledMutationBatch,
          scheduleState,
          delayMs,
        }
      );

      if (deleteMode === 'soft') {
        await softDeleteRow(
          this.db,
          this.table,
          row as Record<string, unknown>
        );
        numAffected++;
        continue;
      }

      if (deleteMode === 'scheduled') {
        const deletionTime = await softDeleteRow(
          this.db,
          this.table,
          row as Record<string, unknown>
        );
        if (!ormContext?.scheduler || !ormContext.scheduledDelete) {
          throw new Error(
            'scheduled() requires orm.db(ctx) configured with scheduling (ormFunctions.scheduledDelete).'
          );
        }
        await ormContext.scheduler.runAfter(
          scheduledDelayMs,
          ormContext.scheduledDelete,
          {
            table: tableName,
            id: (row as any)._id,
            cascadeMode: 'hard',
            deletionTime,
          }
        );
        numAffected++;
        continue;
      }

      await hardDeleteRow(this.db, tableName, row as Record<string, unknown>);
      numAffected++;
    }

    if (isPaginated) {
      const pagedBase = {
        continueCursor,
        isDone,
        numAffected,
      };
      if (!this.returningFields) {
        return pagedBase as MutationExecuteResult<TTable, TReturning, TMode>;
      }
      return {
        ...pagedBase,
        page: results as MutationResult<TTable, TReturning>,
      } as MutationExecuteResult<TTable, TReturning, TMode>;
    }

    if (!this.returningFields) {
      return undefined as MutationExecuteResult<TTable, TReturning, TMode>;
    }

    return results as MutationExecuteResult<TTable, TReturning, TMode>;
  }
}
