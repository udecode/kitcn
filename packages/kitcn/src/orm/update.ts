import type { GenericDatabaseWriter } from 'convex/server';
import type { FilterExpression } from './filter-expression';
import { isFieldReference } from './filter-expression';
import { getIndexes } from './index-utils';
import {
  applyIncomingForeignKeyActionsOnUpdate,
  canUsePrimaryIdLookupCursor,
  collectMutationRowsBounded,
  collectPrimaryIdLookupRows,
  encodeUndefinedDeep,
  enforceCheckConstraints,
  enforceForeignKeys,
  enforcePolymorphicWrite,
  enforceUniqueIndexes,
  evaluateFilter,
  extractPrimaryIdLookup,
  getForeignKeys,
  getMutationAsyncDelayMs,
  getMutationCollectionLimits,
  getMutationExecutionMode,
  getOrmContext,
  getTableColumns,
  getTableName,
  hydrateDateFieldsForRead,
  normalizeDateFieldsForWrite,
  selectReturningRowWithHydration,
  serializeFilterExpression,
  splitReturningSelection,
  stripUnsetFields,
  toConvexFilter,
  unsetFieldsOf,
} from './mutation-utils';
import { QueryPromise } from './query-promise';
import {
  createReturningCountLoader,
  type ReturningCountLoader,
} from './returning-count';
import {
  assertRlsRolesResolvable,
  createRlsPolicyResolutionCache,
  evaluateUpdateDecision,
} from './rls/evaluator';
import type { ConvexTable } from './table';
import type {
  MutationExecuteConfig,
  MutationExecuteResult,
  MutationExecutionMode,
  MutationPaginateConfig,
  MutationResult,
  MutationReturning,
  ReturningSelection,
  UpdateSet,
} from './types';
import { isUnsetToken } from './unset-token';
import { WhereClauseCompiler } from './where-clause-compiler';
import { hasLifecycleHooks } from './write-fanout';

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

export type ConvexUpdateWithout<
  T extends ConvexUpdateBuilder<any, any, any, any>,
  K extends string,
> = Omit<T, K>;

type ConvexUpdateExecutableThis<
  TTable extends ConvexTable<any>,
  TReturning extends MutationReturning,
  TMode extends MutationExecutionMode,
> = {
  _: {
    table: TTable;
    returning: TReturning;
    mode: TMode;
    result: MutationExecuteResult<TTable, TReturning, TMode>;
    hasWhereOrAllowFullScan: true;
  };
};

export class ConvexUpdateBuilder<
  TTable extends ConvexTable<any>,
  TReturning extends MutationReturning = undefined,
  TMode extends MutationExecutionMode = 'single',
  THasWhereOrAllowFullScan extends boolean = false,
> extends QueryPromise<MutationExecuteResult<TTable, TReturning, TMode>> {
  declare readonly _: {
    readonly table: TTable;
    readonly returning: TReturning;
    readonly mode: TMode;
    readonly result: MutationExecuteResult<TTable, TReturning, TMode>;
    readonly hasWhereOrAllowFullScan: THasWhereOrAllowFullScan;
  };

  private setValues?: UpdateSet<TTable>;
  private whereExpression?: FilterExpression<boolean>;
  private returningFields?: TReturning;
  private allowFullScanFlag = false;
  private paginateConfig?: MutationPaginateConfig;
  private executionModeOverride?: 'sync' | 'async';

  private _returningCountLoader?: ReturningCountLoader;

  /**
   * One loader per statement: the table config, edge filter and aggregate-index
   * readiness memo are invariant across the affected rows.
   */
  private async _loadReturningCount(
    row: Record<string, unknown>,
    countSelection: Record<string, unknown>,
    ormContext: ReturnType<typeof getOrmContext>
  ): Promise<Record<string, number>> {
    this._returningCountLoader ??= createReturningCountLoader(
      this.db,
      this.table,
      ormContext
    );
    return await this._returningCountLoader.load(row, countSelection);
  }

  constructor(
    private db: GenericDatabaseWriter<any>,
    private table: TTable
  ) {
    super();
  }

  set(values: UpdateSet<TTable>): this {
    // Convex doesn't support `undefined` values. In Drizzle/Prisma-style builders,
    // treat `undefined` as "not provided" so callers can pass partial form payloads.
    // Use `unsetToken` to explicitly remove a field.
    const filtered: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(values as any)) {
      if (value !== undefined) {
        if (isUnsetToken(value)) {
          if (key === '_id' || key === '_creationTime') {
            throw new Error(`Cannot unset system field '${key}'.`);
          }
          const config = (getTableColumns(this.table)[key] as any)?.config;
          if (config?.notNull) {
            throw new Error(
              `Cannot unset NOT NULL column '${key}' on '${getTableName(
                this.table
              )}'. Use null (if nullable) or provide a value.`
            );
          }
          // Convex patch unsets top-level fields when the value is `undefined`.
          filtered[key] = undefined;
        } else {
          filtered[key] = value;
        }
      }
    }
    this.setValues = filtered as any;
    return this;
  }

  where(
    expression: FilterExpression<boolean>
  ): ConvexUpdateBuilder<TTable, TReturning, TMode, true> {
    this.whereExpression = expression;
    return this as any;
  }

  returning(): ConvexUpdateWithout<
    ConvexUpdateBuilder<TTable, true, TMode, THasWhereOrAllowFullScan>,
    'returning'
  >;
  returning<TSelection extends ReturningSelection<TTable>>(
    fields: TSelection
  ): ConvexUpdateWithout<
    ConvexUpdateBuilder<TTable, TSelection, TMode, THasWhereOrAllowFullScan>,
    'returning'
  >;
  returning(
    fields?: ReturningSelection<TTable>
  ): ConvexUpdateWithout<
    ConvexUpdateBuilder<
      TTable,
      MutationReturning,
      TMode,
      THasWhereOrAllowFullScan
    >,
    'returning'
  > {
    this.returningFields = (fields ?? true) as TReturning;
    return this as any;
  }

  paginate(
    config: MutationPaginateConfig
  ): ConvexUpdateWithout<
    ConvexUpdateBuilder<TTable, TReturning, 'paged', THasWhereOrAllowFullScan>,
    'paginate'
  > {
    if (!Number.isInteger(config.limit) || config.limit < 1) {
      throw new Error('paginate() limit must be a positive integer.');
    }
    this.paginateConfig = config;
    return this as any;
  }

  allowFullScan(): ConvexUpdateBuilder<TTable, TReturning, TMode, true> {
    this.allowFullScanFlag = true;
    return this as any;
  }

  executeAsync(
    this: ConvexUpdateExecutableThis<TTable, TReturning, TMode>,
    ...args: TMode extends 'single'
      ? [config?: Omit<MutationExecuteConfig, 'mode'>]
      : [config: never]
  ): Promise<
    TMode extends 'single'
      ? MutationExecuteResult<TTable, TReturning, 'single'>
      : never
  >;
  async executeAsync(
    ...args: TMode extends 'single'
      ? [config?: Omit<MutationExecuteConfig, 'mode'>]
      : [config: never]
  ): Promise<
    TMode extends 'single'
      ? MutationExecuteResult<TTable, TReturning, 'single'>
      : never
  > {
    const config = args[0] as Omit<MutationExecuteConfig, 'mode'> | undefined;
    const executable = this as unknown as ConvexUpdateBuilder<
      TTable,
      TReturning,
      TMode,
      true
    >;
    return executable.execute({
      ...config,
      mode: 'async',
    } as never) as any;
  }

  execute(
    this: ConvexUpdateExecutableThis<TTable, TReturning, TMode>,
    ...args: TMode extends 'single'
      ? [config?: MutationExecuteConfig]
      : [config?: never]
  ): Promise<MutationExecuteResult<TTable, TReturning, TMode>>;
  async execute(
    ...args: TMode extends 'single'
      ? [config?: MutationExecuteConfig]
      : [config?: never]
  ): Promise<MutationExecuteResult<TTable, TReturning, TMode>> {
    if (!this.setValues) {
      throw new Error('set() must be called before execute()');
    }

    // No-op: empty updates should not run $onUpdateFn hooks, trigger writes,
    // or require allowFullScan/scheduling wiring.
    if (Object.keys(this.setValues as any).length === 0) {
      const pagination = this.paginateConfig;
      if (pagination !== undefined) {
        const pagedBase = {
          continueCursor: null,
          isDone: true,
          numAffected: 0,
        };
        if (!this.returningFields) {
          return pagedBase as MutationExecuteResult<TTable, TReturning, TMode>;
        }
        return {
          ...pagedBase,
          page: [] as unknown as MutationResult<TTable, TReturning>,
        } as unknown as MutationExecuteResult<TTable, TReturning, TMode>;
      }

      if (!this.returningFields) {
        return undefined as MutationExecuteResult<TTable, TReturning, TMode>;
      }
      return [] as unknown as MutationExecuteResult<TTable, TReturning, TMode>;
    }

    const config = args[0] as MutationExecuteConfig | undefined;
    const ormContext = getOrmContext(this.db);
    const returningSelection =
      this.returningFields && this.returningFields !== true
        ? splitReturningSelection(
            this.returningFields as Record<string, unknown>
          )
        : undefined;
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
    const normalizedSetValues = normalizeDateFieldsForWrite(
      this.table,
      this.setValues as any
    ) as UpdateSet<TTable>;

    if (!isPaginated && resolvedMode === 'async') {
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
        const executable = this as unknown as ConvexUpdateBuilder<
          TTable,
          TReturning,
          TMode,
          true
        >;
        const firstBatch = (await executable.execute()) as unknown as {
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
              workType: 'root-update',
              mode: 'async',
              operation: 'update',
              table: getTableName(this.table),
              where: serializeFilterExpression(this.whereExpression),
              allowFullScan: this.allowFullScanFlag,
              update: encodeUndefinedDeep(normalizedSetValues ?? {}),
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

    const rls = ormContext?.rls;
    // Policy configuration must fail before any candidate-row reads so the
    // error is independent of table size and mutation collection limits.
    assertRlsRolesResolvable({ table: this.table, operation: 'update', rls });
    // Every policy decision completes before the first write, so this cache is
    // scoped to one immutable decision phase.
    const rlsResolution = createRlsPolicyResolutionCache();

    const onUpdateSet: Record<string, unknown> = {};
    for (const [columnName, builder] of Object.entries(
      getTableColumns(this.table)
    )) {
      if (columnName in (normalizedSetValues as any)) {
        continue;
      }
      const onUpdateFn = (builder as any).config?.onUpdateFn;
      if (typeof onUpdateFn === 'function') {
        onUpdateSet[columnName] = onUpdateFn();
      }
    }

    const effectiveSet = {
      ...onUpdateSet,
      ...(normalizedSetValues as any),
    } as UpdateSet<TTable>;
    const writeSet = normalizeDateFieldsForWrite(
      this.table,
      effectiveSet as any
    ) as UpdateSet<TTable>;

    const tableName = getTableName(this.table);

    let rows: Record<string, unknown>[];
    let continueCursor: string | null = null;
    let isDone = true;
    const primaryIdLookup = canUsePrimaryIdLookupCursor(pagination?.cursor)
      ? extractPrimaryIdLookup(this.whereExpression)
      : null;
    if (primaryIdLookup) {
      const primaryIdRows = await collectPrimaryIdLookupRows(
        this.db,
        tableName,
        primaryIdLookup,
        {
          operation: 'update',
          pagination,
          batchSize,
          maxRows,
        }
      );
      continueCursor = primaryIdRows.continueCursor;
      isDone = primaryIdRows.isDone;
      rows = primaryIdRows.rows;
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
              operation: 'update',
              tableName,
              batchSize,
              maxRows,
            }
          );
          for (const row of probeRows) {
            dedupedRows.set(String((row as any)._id), row as any);
            if (dedupedRows.size > maxRows) {
              throw new Error(
                `update exceeded mutationMaxRows (${maxRows}) on "${tableName}". ` +
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
            operation: 'update',
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
        operation: 'update',
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

    const foreignKeyGraph = ormContext?.foreignKeyGraph;
    if (!foreignKeyGraph) {
      throw new Error(
        'Foreign key actions require orm.db(ctx) configured from createOrm({ schema, ... }).'
      );
    }

    const updates = await Promise.all(
      rows.map(async (row) => {
        const updatedRow = { ...(row as any), ...(writeSet as any) };
        const decision = await evaluateUpdateDecision({
          cache: rlsResolution,
          table: this.table,
          existingRow: row as Record<string, unknown>,
          updatedRow,
          rls,
        });
        return { row, updatedRow, decision };
      })
    );

    const blocked = updates.find(
      ({ decision }) => decision.usingAllowed && !decision.withCheckAllowed
    );
    if (blocked) {
      throw new Error(
        `RLS policy violation for update on table "${tableName}"`
      );
    }

    const results: Record<string, unknown>[] = [];
    let numAffected = 0;
    const scheduleState = {
      remainingCalls: scheduleCallCap,
      callCap: scheduleCallCap,
    };
    const fkBatchSize = isPaginated ? pagination.limit : batchSize;

    // One statement writes one `set()`, so the changed-field set is invariant
    // across the affected rows.
    const changedFields = new Set(Object.keys(writeSet as any));

    const incomingForeignKeys =
      foreignKeyGraph.incomingByTable.get(tableName) ?? [];
    // Every document this loop can write to. A hook on any of them runs
    // arbitrary user code against the whole database mid-loop, which is exactly
    // what the two memos below assume cannot happen.
    const hooksCanWriteMidLoop =
      hasLifecycleHooks(this.db, tableName) ||
      incomingForeignKeys.some((foreignKey) =>
        hasLifecycleHooks(this.db, foreignKey.sourceTableName)
      );
    // A self-referencing cascade patches rows of this same table, so the stored
    // document is not necessarily `{ ...row, ...writeSet }` by the time we read.
    const cascadeTargetsThisTable = incomingForeignKeys.some(
      (foreignKey) => foreignKey.sourceTableName === tableName
    );
    const canDerivePostImage = !(
      hooksCanWriteMidLoop || cascadeTargetsThisTable
    );
    // One statement writes one `set()`, so the removed keys are invariant.
    const unsetFields = unsetFieldsOf(writeSet as any);

    /**
     * A single-column `references()` FK to `_id` whose column is supplied by
     * `set()` probes a byte-identical id on every row, and nothing in this loop
     * can delete that document. Probe it once, then hide those columns from
     * `enforceForeignKeys` so the remaining keys still get their per-row check.
     * Composite FKs read columns off `row`, so they genuinely vary.
     */
    const memoizedFkColumns = new Set<string>();
    const perRowFkColumns = new Set<string>();
    for (const foreignKey of getForeignKeys(this.table)) {
      const isInvariantIdProbe =
        !hooksCanWriteMidLoop &&
        foreignKey.columns.length === 1 &&
        foreignKey.foreignColumns.length === 1 &&
        foreignKey.foreignColumns[0] === '_id' &&
        changedFields.has(foreignKey.columns[0]);
      if (isInvariantIdProbe) {
        memoizedFkColumns.add(foreignKey.columns[0]);
        continue;
      }
      for (const column of foreignKey.columns) {
        perRowFkColumns.add(column);
      }
    }
    // A column shared with a per-row FK must stay visible or that FK is skipped.
    for (const column of perRowFkColumns) {
      memoizedFkColumns.delete(column);
    }
    const residualChangedFields =
      memoizedFkColumns.size === 0
        ? changedFields
        : new Set(
            [...changedFields].filter((field) => !memoizedFkColumns.has(field))
          );
    let foreignKeysProbed = false;

    for (const { row, updatedRow, decision } of updates) {
      if (!decision.allowed) {
        continue;
      }
      enforcePolymorphicWrite(this.table, updatedRow, { changedFields });
      enforceCheckConstraints(this.table, updatedRow);
      await enforceForeignKeys(this.db, this.table, updatedRow, {
        changedFields: foreignKeysProbed
          ? residualChangedFields
          : changedFields,
      });
      foreignKeysProbed = true;

      await applyIncomingForeignKeyActionsOnUpdate(
        this.db,
        this.table,
        row as Record<string, unknown>,
        updatedRow,
        {
          graph: foreignKeyGraph,
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
      // Not hoistable: this queries the table being patched, and Convex
      // mutations read their own writes, so row N must see rows 1..N-1.
      await enforceUniqueIndexes(this.db, this.table, updatedRow, {
        currentId: (row as any)._id,
        changedFields,
      });
      await this.db.patch(tableName, (row as any)._id, writeSet as any);
      numAffected++;

      if (!this.returningFields) {
        continue;
      }

      // The patch wrote exactly `writeSet` and nothing else can touch this
      // document, so the post-image is already in hand.
      const updated = canDerivePostImage
        ? stripUnsetFields(updatedRow, unsetFields)
        : ((await this.db.get((row as any)._id)) as Record<
            string,
            unknown
          > | null);
      if (!updated) {
        continue;
      }

      if (this.returningFields === true) {
        results.push(hydrateDateFieldsForRead(this.table, updated as any));
      } else {
        const nextRow = returningSelection?.columnSelection
          ? selectReturningRowWithHydration(
              this.table,
              updated as any,
              returningSelection.columnSelection
            )
          : {};
        if (returningSelection?.countSelection) {
          nextRow._count = await this._loadReturningCount(
            updated as any,
            returningSelection.countSelection,
            ormContext
          );
        }
        results.push(nextRow);
      }
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
