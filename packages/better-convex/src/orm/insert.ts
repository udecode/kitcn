import type { GenericDatabaseWriter } from 'convex/server';
import type { ColumnBuilder } from './builders/column-builder';
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
  selectReturningRowWithHydration,
  splitReturningSelection,
} from './mutation-utils';
import { GelRelationalQuery } from './query';
import { QueryPromise } from './query-promise';
import { canInsertRow, evaluateUpdateDecision } from './rls/evaluator';
import type { ConvexTable } from './table';
import type {
  InsertValue,
  MutationResult,
  MutationReturning,
  ReturningSelection,
  UpdateSet,
} from './types';
import { isUnsetToken } from './unset-token';

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

  private async _loadReturningCount(
    row: Record<string, unknown>,
    countSelection: Record<string, unknown>,
    ormContext: ReturnType<typeof getOrmContext>
  ): Promise<Record<string, number>> {
    const schema = ormContext?.schema;
    const edgeMetadata = ormContext?.edgeMetadata;
    if (!schema || !edgeMetadata) {
      throw new Error(
        'returning({ _count }) requires orm.db(ctx) configured from createOrm({ schema, ... }).'
      );
    }

    const tableName = getTableName(this.table);
    const tableConfig = Object.values(schema).find(
      (config) => config.name === tableName
    );
    if (!tableConfig) {
      throw new Error(`Table config for '${tableName}' is not registered.`);
    }
    const tableEdges = edgeMetadata.filter(
      (edge) => edge.sourceTable === tableName
    );

    const counted = await new GelRelationalQuery(
      schema as any,
      tableConfig as any,
      tableEdges as any,
      this.db as any,
      {
        where: {
          id: row._id,
        },
        columns: {},
        with: {
          _count: countSelection,
        },
      } as any,
      'first',
      edgeMetadata as any,
      ormContext?.rls,
      ormContext?.relationLoading
    ).execute();

    return ((counted as any)?._count ?? {}) as Record<string, number>;
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
    const returningSelection =
      this.returningFields && this.returningFields !== true
        ? splitReturningSelection(
            this.returningFields as Record<string, unknown>
          )
        : undefined;
    const results: Record<string, unknown>[] = [];
    for (const value of this.valuesList) {
      const preparedValue = normalizeDateFieldsForWrite(
        this.table,
        applyDefaults(this.table, value as any)
      );
      enforcePolymorphicWrite(this.table, preparedValue as any);
      const rls = ormContext?.rls;
      const tableName = getTableName(this.table);

      if (
        !(await canInsertRow({
          table: this.table,
          row: preparedValue as any,
          rls,
        }))
      ) {
        throw new Error(
          `RLS policy violation for insert on table "${tableName}"`
        );
      }

      const conflictResult = await this.handleConflict(preparedValue);

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

      const inserted = await this.db.get(id as any);
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

  private async handleConflict(value: InsertValue<TTable>): Promise<
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
    const updated = this.returningFields
      ? await this.db.get((existing as any)._id)
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
      query = query.filter((q: any) => {
        let expr = q.eq(
          q.field(filterValuePairs[0][0]),
          filterValuePairs[0][1]
        );
        for (let i = 1; i < filterValuePairs.length; i++) {
          const [field, fieldValue] = filterValuePairs[i];
          expr = q.and(expr, q.eq(q.field(field), fieldValue));
        }
        return expr;
      });
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
