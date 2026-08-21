import type { GenericDatabaseWriter } from 'convex/server';
import type { ColumnBuilder } from './builders/column-builder';
import { convexAnd } from './convex-filter-compiler';
import type { FilterExpression } from './filter-expression';
import { findIndexForColumns, getIndexes } from './index-utils';
import {
  applyDefaults,
  enforceCheckConstraints,
  enforceForeignKeys,
  enforcePolymorphicWrite,
  enforceUniqueIndexes,
  evaluateFilter,
  getColumnName,
  getOrmContext,
  getTableColumns,
  getTableName,
  getUniqueIndexes,
  hydrateDateFieldsForRead,
  normalizeDateFieldsForWrite,
  returningSelectionReadsCreationTime,
  selectReturningRowWithHydration,
  splitReturningSelection,
  stripUnsetFields,
  unsetFieldsOf,
} from './mutation-utils';
import { QueryPromise } from './query-promise';
import {
  countedEdgesReadCreationTime,
  createReturningCountLoader,
  type ReturningCountLoader,
} from './returning-count';
import {
  canInsertRow,
  createRlsPolicyResolutionCache,
  evaluateUpdateDecision,
  isRlsEnabled,
  type RlsPolicyResolutionCache,
} from './rls/evaluator';
import type { ConvexTable } from './table';
import type {
  InsertValue,
  MutationResult,
  MutationReturning,
  ReturningSelection,
  UpdateSet,
} from './types';
import { isUnsetToken } from './unset-token';
import { hasLifecycleHooks } from './write-fanout';

export type InsertOnConflictDoNothingConfig<_TTable extends ConvexTable<any>> =
  {
    target?: ColumnBuilder<any, any, any> | ColumnBuilder<any, any, any>[];
    where?: FilterExpression<boolean>;
  };

export type InsertOnConflictDoUpdateConfig<TTable extends ConvexTable<any>> = {
  target: ColumnBuilder<any, any, any> | ColumnBuilder<any, any, any>[];
  set: UpdateSet<TTable>;
  targetWhere?: FilterExpression<boolean>;
  setWhere?: FilterExpression<boolean>;
};

type InsertConflictConfig<TTable extends ConvexTable<any>> =
  | {
      action: 'nothing';
      config: InsertOnConflictDoNothingConfig<TTable>;
    }
  | {
      action: 'update';
      config: InsertOnConflictDoUpdateConfig<TTable>;
    };

export type ConvexInsertWithout<
  T extends ConvexInsertBuilder<any, any>,
  K extends string,
> = Omit<T, K>;

export class ConvexInsertBuilder<
  TTable extends ConvexTable<any>,
  TReturning extends MutationReturning = undefined,
> extends QueryPromise<MutationResult<TTable, TReturning>> {
  declare readonly _: {
    readonly table: TTable;
    readonly returning: TReturning;
    readonly result: MutationResult<TTable, TReturning>;
  };

  private valuesList: InsertValue<TTable>[] = [];
  private returningFields?: TReturning;
  private conflictConfig?: InsertConflictConfig<TTable>;
  private allowFullScanFlag = false;

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

  values(values: InsertValue<TTable> | InsertValue<TTable>[]): this {
    const list = Array.isArray(values) ? values : [values];
    if (list.length === 0) {
      throw new Error('values() must be called with at least one value');
    }
    this.valuesList = list;
    return this;
  }

  returning(): ConvexInsertWithout<
    ConvexInsertBuilder<TTable, true>,
    'returning'
  >;
  returning<TSelection extends ReturningSelection<TTable>>(
    fields: TSelection
  ): ConvexInsertWithout<ConvexInsertBuilder<TTable, TSelection>, 'returning'>;
  returning(
    fields?: ReturningSelection<TTable>
  ): ConvexInsertWithout<
    ConvexInsertBuilder<TTable, MutationReturning>,
    'returning'
  > {
    this.returningFields = (fields ?? true) as TReturning;
    return this as any;
  }

  allowFullScan(): this {
    this.allowFullScanFlag = true;
    return this;
  }

  onConflictDoNothing(
    config: InsertOnConflictDoNothingConfig<TTable> = {}
  ): ConvexInsertWithout<this, 'onConflictDoNothing' | 'onConflictDoUpdate'> {
    this.conflictConfig = {
      action: 'nothing',
      config,
    };
    return this as any;
  }

  onConflictDoUpdate(
    config: InsertOnConflictDoUpdateConfig<TTable>
  ): ConvexInsertWithout<this, 'onConflictDoNothing' | 'onConflictDoUpdate'> {
    this.conflictConfig = {
      action: 'update',
      config,
    };
    return this as any;
  }

  async execute(): Promise<MutationResult<TTable, TReturning>> {
    if (this.valuesList.length === 0) {
      throw new Error('values() must be called before execute()');
    }

    const ormContext = getOrmContext(this.db);
    const tableName = getTableName(this.table);
    const returningSelection =
      this.returningFields && this.returningFields !== true
        ? splitReturningSelection(
            this.returningFields as Record<string, unknown>
          )
        : undefined;
    // The document `db.insert` stores is the payload we hand it plus an `_id`
    // it hands back, so re-reading it buys nothing. Nothing in this loop can
    // touch a row it already wrote either: the four `enforce*` helpers only
    // read, and insert runs no cascades.
    //
    // What the derived row cannot have is `_creationTime` — Convex's insert
    // syscall returns the id and nothing else. So it may only be handed to
    // consumers that provably never read it:
    //
    // - the projection, which names its columns up front. Argument-less
    //   `returning()` names all of them, `_creationTime` included.
    // - the `_count` loader, which reads each counted edge's source fields off
    //   the row, and — on an RLS table — evaluates a user-authored select
    //   policy against it. Edge sources are inspectable; a policy expression is
    //   not, so RLS plus `_count` keeps the read.
    //
    // Lifecycle hooks are the separate case: `create.before` rewrites the
    // payload, and `create.after`/`change` run with a writer before
    // `db.insert` resolves, so the stored row is not the payload at all.
    const countSelection = returningSelection?.countSelection;
    const derivedRowSatisfiesCount =
      countSelection === undefined ||
      (!countedEdgesReadCreationTime(ormContext?.edgeMetadata, tableName) &&
        !isRlsEnabled(this.table));
    const canDerivePostImage =
      returningSelection !== undefined &&
      !hasLifecycleHooks(this.db, tableName) &&
      !returningSelectionReadsCreationTime(
        returningSelection.columnSelection
      ) &&
      derivedRowSatisfiesCount;
    const results: Record<string, unknown>[] = [];
    for (const value of this.valuesList) {
      const preparedValue = normalizeDateFieldsForWrite(
        this.table,
        applyDefaults(this.table, value as any)
      );
      enforcePolymorphicWrite(this.table, preparedValue as any);
      const rls = ormContext?.rls;
      // Each iteration can write before the next policy check. Keep one cache
      // across this row's insert/conflict decision, never across rows.
      const rlsResolution = createRlsPolicyResolutionCache();

      if (
        !(await canInsertRow({
          cache: rlsResolution,
          table: this.table,
          row: preparedValue as any,
          rls,
        }))
      ) {
        throw new Error(
          `RLS policy violation for insert on table "${tableName}"`
        );
      }

      const conflictResult = await this.handleConflict(
        preparedValue,
        rlsResolution
      );

      if (conflictResult?.status === 'skip') {
        continue;
      }

      if (conflictResult?.status === 'updated') {
        if (conflictResult.row && this.returningFields) {
          results.push(
            await this.resolveReturningRow(
              conflictResult.row,
              returningSelection,
              ormContext
            )
          );
        }
        continue;
      }

      enforceCheckConstraints(this.table, preparedValue as any);
      await enforceForeignKeys(this.db, this.table, preparedValue as any, {
        changedFields: new Set(Object.keys(preparedValue as any)),
      });
      await enforceUniqueIndexes(this.db, this.table, preparedValue as any, {
        changedFields: new Set(Object.keys(preparedValue as any)),
      });
      const id = await this.db.insert(tableName, preparedValue as any);

      if (!this.returningFields) {
        continue;
      }

      const inserted = canDerivePostImage
        ? ({ ...(preparedValue as any), _id: id } as Record<string, unknown>)
        : ((await this.db.get(id as any)) as Record<string, unknown> | null);
      if (inserted) {
        results.push(
          await this.resolveReturningRow(
            inserted as any,
            returningSelection,
            ormContext
          )
        );
      }
    }

    if (!this.returningFields) {
      return undefined as MutationResult<TTable, TReturning>;
    }

    return results as MutationResult<TTable, TReturning>;
  }

  private async resolveReturningRow(
    row: Record<string, unknown>,
    returningSelection: ReturnType<typeof splitReturningSelection> | undefined,
    ormContext: ReturnType<typeof getOrmContext>
  ) {
    if (this.returningFields === true) {
      return hydrateDateFieldsForRead(this.table, row);
    }
    const selected = returningSelection?.columnSelection
      ? selectReturningRowWithHydration(
          this.table,
          row,
          returningSelection.columnSelection
        )
      : {};
    if (returningSelection?.countSelection) {
      selected._count = await this._loadReturningCount(
        row,
        returningSelection.countSelection,
        ormContext
      );
    }
    return selected;
  }

  private async handleConflict(
    value: InsertValue<TTable>,
    rlsResolution: RlsPolicyResolutionCache
  ): Promise<
    | {
        status: 'skip';
      }
    | {
        status: 'updated';
        row?: Record<string, unknown> | null;
      }
    | undefined
  > {
    if (!this.conflictConfig) {
      return;
    }

    const { action, config } = this.conflictConfig;
    const targetColumns = Array.isArray(config.target)
      ? config.target
      : config.target
        ? [config.target]
        : [];

    const existing =
      targetColumns.length > 0
        ? await this.findConflictRow(value, targetColumns)
        : action === 'nothing'
          ? await this.findAnyUniqueConflictRow(value)
          : null;
    if (!existing) {
      return;
    }

    if (action === 'nothing') {
      if (config.where && !evaluateFilter(existing, config.where)) {
        return;
      }
      return { status: 'skip' };
    }

    const updateConfig = config as InsertOnConflictDoUpdateConfig<TTable>;

    if (
      updateConfig.targetWhere &&
      !evaluateFilter(existing, updateConfig.targetWhere)
    ) {
      return;
    }

    if (
      updateConfig.setWhere &&
      !evaluateFilter(existing, updateConfig.setWhere)
    ) {
      return { status: 'updated', row: null };
    }

    const tableName = getTableName(this.table);
    const ormContext = getOrmContext(this.db);
    const rls = ormContext?.rls;

    // Normalize set(): ignore `undefined` (noop), translate unsetToken -> `undefined` (unset).
    const normalizedSet: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updateConfig.set as any)) {
      if (value === undefined) {
        continue;
      }
      if (isUnsetToken(value)) {
        if (key === '_id' || key === '_creationTime') {
          throw new Error(`Cannot unset system field '${key}'.`);
        }
        const config = (getTableColumns(this.table)[key] as any)?.config;
        if (config?.notNull) {
          throw new Error(
            `Cannot unset NOT NULL column '${key}' on '${tableName}'. Use null (if nullable) or provide a value.`
          );
        }
        normalizedSet[key] = undefined;
        continue;
      }
      normalizedSet[key] = value;
    }

    // No-op: empty updates should not run $onUpdateFn hooks or trigger writes.
    if (Object.keys(normalizedSet).length === 0) {
      return { status: 'updated', row: null };
    }

    const onUpdateSet: Record<string, unknown> = {};
    for (const [columnName, builder] of Object.entries(
      getTableColumns(this.table)
    )) {
      if (columnName in normalizedSet) {
        continue;
      }
      const onUpdateFn = (builder as any).config?.onUpdateFn;
      if (typeof onUpdateFn === 'function') {
        onUpdateSet[columnName] = onUpdateFn();
      }
    }

    const effectiveSet = {
      ...onUpdateSet,
      ...normalizedSet,
    };
    const writeSet = normalizeDateFieldsForWrite(this.table, effectiveSet);

    const updateDecision = await evaluateUpdateDecision({
      cache: rlsResolution,
      table: this.table,
      existingRow: existing as any,
      updatedRow: { ...(existing as any), ...(writeSet as any) },
      rls,
    });

    if (!updateDecision.allowed) {
      if (updateDecision.usingAllowed && !updateDecision.withCheckAllowed) {
        throw new Error(
          `RLS policy violation for update on table "${tableName}"`
        );
      }
      return { status: 'updated', row: null };
    }

    await enforceForeignKeys(
      this.db,
      this.table,
      (() => {
        const candidate = { ...(existing as any), ...(writeSet as any) };
        enforceCheckConstraints(this.table, candidate);
        return candidate;
      })(),
      {
        changedFields: new Set(Object.keys(writeSet as any)),
      }
    );
    await enforceUniqueIndexes(
      this.db,
      this.table,
      { ...(existing as any), ...(writeSet as any) },
      {
        currentId: (existing as any)._id,
        changedFields: new Set(Object.keys(writeSet as any)),
      }
    );
    await this.db.patch(tableName, (existing as any)._id, writeSet as any);
    // Same reasoning as `update()`: the patch wrote exactly `writeSet` over a
    // document already in hand, so the post-image is derivable. `existing` is a
    // stored document, so `_creationTime` is present and argument-less
    // `returning()` works here too. Only lifecycle hooks can invalidate it —
    // `update.before` rewrites the payload and `update.after`/`change` run
    // before `db.patch` resolves. `insert()` runs no cascades, so `update()`'s
    // self-referencing-cascade term has no counterpart here.
    const updated = this.returningFields
      ? hasLifecycleHooks(this.db, tableName)
        ? await this.db.get((existing as any)._id)
        : stripUnsetFields(
            { ...(existing as any), ...(writeSet as any) },
            unsetFieldsOf(writeSet as any)
          )
      : null;

    return { status: 'updated', row: updated };
  }

  private async findConflictRow(
    value: InsertValue<TTable>,
    targetColumns: ColumnBuilder<any, any, any>[]
  ): Promise<Record<string, unknown> | null> {
    if (targetColumns.length === 0) {
      return null;
    }

    const tableName = getTableName(this.table);
    const filterValuePairs: [string, unknown][] = [];

    for (const column of targetColumns) {
      const columnName = getColumnName(column);
      const columnValue = (value as any)[columnName];
      if (columnValue === undefined) {
        return null;
      }
      filterValuePairs.push([columnName, columnValue]);
    }

    const allowFullScan = this.allowFullScanFlag;
    const ormContext = getOrmContext(this.db);
    const strict = ormContext?.strict ?? true;
    const indexName = findIndexForColumns(
      getIndexes(this.table),
      filterValuePairs.map(([field]) => field)
    );

    let query: any = this.db.query(tableName);

    if (indexName) {
      query = query.withIndex(indexName, (q: any) => {
        let builder = q.eq(filterValuePairs[0][0], filterValuePairs[0][1]);
        for (let i = 1; i < filterValuePairs.length; i++) {
          const [field, fieldValue] = filterValuePairs[i];
          builder = builder.eq(field, fieldValue);
        }
        return builder;
      });
    } else {
      if (!allowFullScan) {
        throw new Error(
          'onConflict requires allowFullScan: true when no index is available.'
        );
      }
      if (strict) {
        console.warn('onConflict running without index (allowFullScan: true).');
      }
      query = query.filter((q: any) =>
        convexAnd(
          q,
          filterValuePairs.map(([field, fieldValue]) =>
            q.eq(q.field(field), fieldValue)
          )
        )
      );
    }

    const row = await query.first();
    return row ? (row as any) : null;
  }

  private async findAnyUniqueConflictRow(
    value: InsertValue<TTable>
  ): Promise<Record<string, unknown> | null> {
    const uniqueIndexes = getUniqueIndexes(this.table);
    if (uniqueIndexes.length === 0) {
      return null;
    }

    const tableName = getTableName(this.table);

    for (const index of uniqueIndexes) {
      const entries = index.fields.map(
        (field) => [field, (value as any)[field]] as [string, unknown]
      );
      const hasNullish = entries.some(
        ([, entryValue]) => entryValue === undefined || entryValue === null
      );
      if (hasNullish && !index.nullsNotDistinct) {
        continue;
      }

      const existing = await this.db
        .query(tableName)
        .withIndex(index.name, (q: any) => {
          let builder = q.eq(entries[0][0], entries[0][1]);
          for (let i = 1; i < entries.length; i++) {
            builder = builder.eq(entries[i][0], entries[i][1]);
          }
          return builder;
        })
        .unique();

      if (existing !== null) {
        return existing as any;
      }
    }

    return null;
  }
}
