import type {
  GenericTableIndexes,
  GenericTableSearchIndexes,
  GenericTableVectorIndexes,
  TableDefinition,
} from 'convex/server';
import type { Validator } from 'convex/values';
import { v } from 'convex/values';
import type {
  ColumnBuilder,
  ColumnBuilderBase,
  ColumnBuilderWithTableName,
  ForeignKeyAction,
} from './builders/column-builder';
import { entityKind } from './builders/column-builder';
import {
  createSystemFields,
  type SystemFieldAliases,
  type SystemFields,
  type SystemFieldsWithAliases,
} from './builders/system-fields';
import type {
  ConvexCheckBuilder,
  ConvexForeignKeyBuilder,
  ConvexUniqueConstraintBuilder,
  ConvexUniqueConstraintBuilderOn,
} from './constraints';
import type { FilterExpression } from './filter-expression';
import type {
  ConvexIndexBuilder,
  ConvexIndexBuilderOn,
  ConvexIndexColumn,
  ConvexSearchIndexBuilder,
  ConvexSearchIndexBuilderOn,
  ConvexVectorIndexBuilder,
  ConvexVectorIndexBuilderOn,
} from './indexes';
import type { RlsPolicy } from './rls/policies';
import { isRlsPolicy } from './rls/policies';
import {
  Brand,
  Columns,
  EnableRLS,
  type OrmDeleteMode,
  type OrmTableDeleteConfig,
  RlsPolicies,
  TableDeleteConfig,
  TableLifecycleHooks,
  TableName,
} from './symbols';

/**
 * Reserved Convex system table names that cannot be used
 */
const RESERVED_TABLES = new Set(['_storage', '_scheduled_functions']);
const RESERVED_COLUMN_NAMES = new Set(['id', '_id', '_creationTime']);

/**
 * Valid table name pattern: starts with letter, contains only alphanumeric and underscore
 */
const TABLE_NAME_REGEX = /^[a-zA-Z][a-zA-Z0-9_]*$/;

/**
 * Validate table name against Convex constraints
 */
function validateTableName(name: string): void {
  if (RESERVED_TABLES.has(name)) {
    throw new Error(
      `Table name '${name}' is reserved. System tables cannot be redefined.`
    );
  }
  if (!TABLE_NAME_REGEX.test(name)) {
    throw new Error(
      `Invalid table name '${name}'. Must start with letter, contain only alphanumeric and underscore.`
    );
  }
}

/**
 * Create a Convex object validator from column builders
 *
 * Extracts .convexValidator from each column and creates v.object({...})
 * This is the core factory that bridges ORM columns to Convex validators.
 *
 * @param columns - Record of column name to column builder
 * @returns Convex object validator
 */
function createValidatorFromColumns(
  columns: Record<string, ColumnBuilder<any, any, any>>
): Validator<any, any, any> {
  const validatorFields = Object.fromEntries(
    Object.entries(columns).map(([key, builder]) => [
      key,
      (builder as any).convexValidator,
    ])
  );
  return v.object(validatorFields);
}

/**
 * Configuration for a Convex table
 * Only supports column builders (text(), integer(), etc.)
 *
 * CRITICAL: No extends constraint on TColumns to avoid type widening (convex-ents pattern)
 */
export interface TableConfig<TName extends string = string, TColumns = any> {
  name: TName;
  columns: TColumns;
}

type ColumnsWithTableName<TColumns, TName extends string> = {
  [K in keyof TColumns]: TColumns[K] extends ColumnBuilderBase
    ? ColumnBuilderWithTableName<TColumns[K], TName> & {
        _: {
          fieldName: K extends string ? K : never;
        };
      }
    : TColumns[K];
};

type ColumnsWithSystemFields<
  TColumns,
  TName extends string,
> = ColumnsWithTableName<TColumns, TName> &
  (TColumns extends Record<string, unknown>
    ? SystemFieldsWithAliases<TName, TColumns>
    : SystemFieldsWithAliases<TName>);

export type ConvexTableExtraConfigValue =
  | ConvexIndexBuilder
  | ConvexSearchIndexBuilder
  | ConvexVectorIndexBuilder
  | ConvexForeignKeyBuilder
  | ConvexCheckBuilder
  | ConvexUniqueConstraintBuilder
  | ConvexDeletionBuilder
  | ConvexLifecycleBuilder
  | OrmTriggerLike
  | RlsPolicy;
export type ConvexTableExtraConfig = Record<
  string,
  ConvexTableExtraConfigValue
>;

type UnionToIntersection<T> = (
  T extends unknown
    ? (arg: T) => void
    : never
) extends (arg: infer U) => void
  ? U
  : never;

type SimplifyObject<T> = { [K in keyof T]: T[K] };

type ExtraConfigValues<TExtraConfig> =
  TExtraConfig extends readonly (infer TValue)[]
    ? TValue
    : TExtraConfig extends Record<string, infer TValue>
      ? TValue
      : never;

type ColumnNameFromBuilder<TColumn extends ColumnBuilderBase> =
  TColumn extends {
    _: {
      fieldName: infer TFieldName extends string;
    };
  }
    ? TFieldName
    : never;

type IndexFieldTupleFromColumns<
  TColumns extends readonly [ConvexIndexColumn, ...ConvexIndexColumn[]],
> = [
  ...{
    [K in keyof TColumns]: TColumns[K] extends ConvexIndexColumn
      ? ColumnNameFromBuilder<TColumns[K]>
      : never;
  },
  '_creationTime',
];

type InferDbIndexRecordFromExtraValue<TValue> =
  TValue extends ConvexIndexBuilder<
    infer TName extends string,
    infer TColumns extends readonly [ConvexIndexColumn, ...ConvexIndexColumn[]],
    boolean
  >
    ? Record<TName, IndexFieldTupleFromColumns<TColumns>>
    : {};

type SearchFilterFieldsUnionFromColumns<
  TColumns extends readonly ConvexIndexColumn[],
> = TColumns[number] extends infer TColumn extends ConvexIndexColumn
  ? ColumnNameFromBuilder<TColumn>
  : never;

type InferSearchIndexRecordFromExtraValue<TValue> =
  TValue extends ConvexSearchIndexBuilder<
    infer TName extends string,
    infer TSearchField extends ConvexIndexColumn,
    infer TFilterFields extends readonly ConvexIndexColumn[]
  >
    ? Record<
        TName,
        {
          searchField: ColumnNameFromBuilder<TSearchField>;
          filterFields: SearchFilterFieldsUnionFromColumns<TFilterFields>;
        }
      >
    : {};

type InferVectorIndexRecordFromExtraValue<TValue> =
  TValue extends ConvexVectorIndexBuilder<
    infer TName extends string,
    infer TVectorField extends ConvexIndexColumn,
    infer TFilterFields extends readonly ConvexIndexColumn[]
  >
    ? Record<
        TName,
        {
          vectorField: ColumnNameFromBuilder<TVectorField>;
          dimensions: number;
          filterFields: SearchFilterFieldsUnionFromColumns<TFilterFields>;
        }
      >
    : {};

type InferredDbIndexesFromExtraConfig<TExtraConfig> = UnionToIntersection<
  InferDbIndexRecordFromExtraValue<
    ExtraConfigValues<Exclude<TExtraConfig, undefined>>
  >
>;

type InferredSearchIndexesFromExtraConfig<TExtraConfig> = UnionToIntersection<
  InferSearchIndexRecordFromExtraValue<
    ExtraConfigValues<Exclude<TExtraConfig, undefined>>
  >
>;

type InferredVectorIndexesFromExtraConfig<TExtraConfig> = UnionToIntersection<
  InferVectorIndexRecordFromExtraValue<
    ExtraConfigValues<Exclude<TExtraConfig, undefined>>
  >
>;

type NormalizeDbIndexMap<TIndexMap> = {
  [K in keyof TIndexMap as K extends string
    ? K
    : never]: TIndexMap[K] extends string[] ? TIndexMap[K] : never;
};

type NormalizeSearchIndexMap<TIndexMap> = {
  [K in keyof TIndexMap as K extends string ? K : never]: TIndexMap[K] extends {
    searchField: infer TSearchField extends string;
    filterFields: infer TFilterFields extends string;
  }
    ? {
        searchField: TSearchField;
        filterFields: TFilterFields;
      }
    : never;
};

type NormalizeVectorIndexMap<TIndexMap> = {
  [K in keyof TIndexMap as K extends string ? K : never]: TIndexMap[K] extends {
    vectorField: infer TVectorField extends string;
    dimensions: infer TDimensions extends number;
    filterFields: infer TFilterFields extends string;
  }
    ? {
        vectorField: TVectorField;
        dimensions: TDimensions;
        filterFields: TFilterFields;
      }
    : never;
};

type InferDbIndexesFromExtraConfig<TExtraConfig> = SimplifyObject<
  {
    by_creation_time: ['_creationTime'];
  } & NormalizeDbIndexMap<InferredDbIndexesFromExtraConfig<TExtraConfig>>
>;

type InferSearchIndexesFromExtraConfig<TExtraConfig> = SimplifyObject<
  NormalizeSearchIndexMap<InferredSearchIndexesFromExtraConfig<TExtraConfig>>
>;

type InferVectorIndexesFromExtraConfig<TExtraConfig> = SimplifyObject<
  NormalizeVectorIndexMap<InferredVectorIndexesFromExtraConfig<TExtraConfig>>
>;

type ForeignKeyDefinition = {
  name?: string;
  columns: string[];
  foreignTableName: string;
  foreignTable?: unknown;
  foreignColumns: string[];
  onUpdate?: ForeignKeyAction;
  onDelete?: ForeignKeyAction;
};

type DeferredForeignKeyDefinition = {
  localColumnName: string;
  ref: () => ColumnBuilderBase;
  config: {
    name?: string;
    onUpdate?: ForeignKeyAction;
    onDelete?: ForeignKeyAction;
  };
};

export type ConvexDeletionConfig = {
  mode: OrmDeleteMode;
  delayMs?: number;
};

export type OrmLifecycleOperation = 'insert' | 'update' | 'delete';

export type OrmLifecycleChange<TDoc = Record<string, unknown>> = {
  id: unknown;
} & (
  | {
      operation: 'insert';
      oldDoc: null;
      newDoc: TDoc;
    }
  | {
      operation: 'update';
      oldDoc: TDoc;
      newDoc: TDoc;
    }
  | {
      operation: 'delete';
      oldDoc: TDoc;
      newDoc: null;
    }
);

type OrmLifecycleChangeFor<
  TOperation extends OrmLifecycleOperation | 'change',
  TDoc = Record<string, unknown>,
> = TOperation extends 'insert'
  ? Extract<OrmLifecycleChange<TDoc>, { operation: 'insert' }>
  : TOperation extends 'update'
    ? Extract<OrmLifecycleChange<TDoc>, { operation: 'update' }>
    : TOperation extends 'delete'
      ? Extract<OrmLifecycleChange<TDoc>, { operation: 'delete' }>
      : OrmLifecycleChange<TDoc>;

export type OrmLifecycleHandler<
  TOperation extends OrmLifecycleOperation | 'change' = 'change',
  TDoc = Record<string, unknown>,
> = (
  ctx: {
    db: unknown;
    innerDb: unknown;
  } & Record<string, unknown>,
  change: OrmLifecycleChangeFor<TOperation, TDoc>
) => Promise<void> | void;

export type OrmLifecycleConfig =
  | {
      operation: 'insert';
      handler: OrmLifecycleHandler<'insert'>;
    }
  | {
      operation: 'update';
      handler: OrmLifecycleHandler<'update'>;
    }
  | {
      operation: 'delete';
      handler: OrmLifecycleHandler<'delete'>;
    }
  | {
      operation: 'change';
      handler: OrmLifecycleHandler<'change'>;
    };

export type OrmTriggerLike<
  TDoc = Record<string, unknown>,
  TCtx = Record<string, unknown>,
> = {
  bivarianceHack: (
    ctx: TCtx,
    change: OrmLifecycleChange<TDoc>
  ) => Promise<void> | void;
}['bivarianceHack'];

export class ConvexDeletionBuilder {
  static readonly [entityKind] = 'ConvexDeletionBuilder';
  readonly [entityKind] = 'ConvexDeletionBuilder';

  constructor(readonly config: ConvexDeletionConfig) {}
}

export function deletion(
  mode: OrmDeleteMode,
  options?: { delayMs?: number }
): ConvexDeletionBuilder {
  if (options?.delayMs !== undefined) {
    if (mode !== 'scheduled') {
      throw new Error("deletion() delayMs is only supported for 'scheduled'.");
    }
    if (!Number.isInteger(options.delayMs) || options.delayMs < 0) {
      throw new Error(
        "deletion() delayMs must be a non-negative integer when mode is 'scheduled'."
      );
    }
  }
  return new ConvexDeletionBuilder({
    mode,
    delayMs: options?.delayMs,
  });
}

export class ConvexLifecycleBuilder {
  static readonly [entityKind] = 'ConvexLifecycleBuilder';
  readonly [entityKind] = 'ConvexLifecycleBuilder';

  constructor(readonly config: OrmLifecycleConfig) {}
}

export function onInsert<TDoc = Record<string, unknown>>(
  handler: OrmLifecycleHandler<'insert', TDoc>
): ConvexLifecycleBuilder {
  return new ConvexLifecycleBuilder({
    operation: 'insert',
    handler: handler as OrmLifecycleHandler<'insert'>,
  });
}

export function onUpdate<TDoc = Record<string, unknown>>(
  handler: OrmLifecycleHandler<'update', TDoc>
): ConvexLifecycleBuilder {
  return new ConvexLifecycleBuilder({
    operation: 'update',
    handler: handler as OrmLifecycleHandler<'update'>,
  });
}

export function onDelete<TDoc = Record<string, unknown>>(
  handler: OrmLifecycleHandler<'delete', TDoc>
): ConvexLifecycleBuilder {
  return new ConvexLifecycleBuilder({
    operation: 'delete',
    handler: handler as OrmLifecycleHandler<'delete'>,
  });
}

export function onChange<TDoc = Record<string, unknown>>(
  handler: OrmLifecycleHandler<'change', TDoc>
): ConvexLifecycleBuilder {
  return new ConvexLifecycleBuilder({
    operation: 'change',
    handler: handler as OrmLifecycleHandler<'change'>,
  });
}

function isConvexIndexBuilder(value: unknown): value is ConvexIndexBuilder {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { [entityKind]?: string })[entityKind] === 'ConvexIndexBuilder'
  );
}

function isConvexIndexBuilderOn(value: unknown): value is ConvexIndexBuilderOn {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { [entityKind]?: string })[entityKind] === 'ConvexIndexBuilderOn'
  );
}

function isConvexUniqueConstraintBuilderOn(
  value: unknown
): value is ConvexUniqueConstraintBuilderOn {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { [entityKind]?: string })[entityKind] ===
      'ConvexUniqueConstraintBuilderOn'
  );
}

function isConvexForeignKeyBuilder(
  value: unknown
): value is ConvexForeignKeyBuilder {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { [entityKind]?: string })[entityKind] ===
      'ConvexForeignKeyBuilder'
  );
}

function isConvexCheckBuilder(value: unknown): value is ConvexCheckBuilder {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { [entityKind]?: string })[entityKind] === 'ConvexCheckBuilder'
  );
}

function isConvexSearchIndexBuilderOn(
  value: unknown
): value is ConvexSearchIndexBuilderOn {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { [entityKind]?: string })[entityKind] ===
      'ConvexSearchIndexBuilderOn'
  );
}

function isConvexUniqueConstraintBuilder(
  value: unknown
): value is ConvexUniqueConstraintBuilder {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { [entityKind]?: string })[entityKind] ===
      'ConvexUniqueConstraintBuilder'
  );
}

function isConvexSearchIndexBuilder(
  value: unknown
): value is ConvexSearchIndexBuilder {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { [entityKind]?: string })[entityKind] ===
      'ConvexSearchIndexBuilder'
  );
}

function isConvexVectorIndexBuilderOn(
  value: unknown
): value is ConvexVectorIndexBuilderOn {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { [entityKind]?: string })[entityKind] ===
      'ConvexVectorIndexBuilderOn'
  );
}

function isConvexVectorIndexBuilder(
  value: unknown
): value is ConvexVectorIndexBuilder {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { [entityKind]?: string })[entityKind] ===
      'ConvexVectorIndexBuilder'
  );
}

function isConvexDeletionBuilder(
  value: unknown
): value is ConvexDeletionBuilder {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { [entityKind]?: string })[entityKind] === 'ConvexDeletionBuilder'
  );
}

function isConvexLifecycleBuilder(
  value: unknown
): value is ConvexLifecycleBuilder {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { [entityKind]?: string })[entityKind] ===
      'ConvexLifecycleBuilder'
  );
}

function isOrmTriggerLike(value: unknown): value is OrmTriggerLike {
  return typeof value === 'function';
}

function getColumnName(column: ColumnBuilderBase): string {
  const config = (column as { config?: { name?: string } }).config;
  if (!config?.name) {
    throw new Error(
      'Invalid index column: expected a convexTable column builder.'
    );
  }
  return config.name;
}

function getColumnType(column: ColumnBuilderBase): string | undefined {
  return (column as { config?: { columnType?: string } }).config?.columnType;
}

function getColumnDimensions(column: ColumnBuilderBase): number | undefined {
  return (column as { config?: { dimensions?: number } }).config?.dimensions;
}

function getColumnTableName(column: ColumnBuilderBase): string | undefined {
  const config = (
    column as { config?: { tableName?: string; referenceTable?: string } }
  ).config;
  return config?.tableName ?? config?.referenceTable;
}

function getColumnTable(column: ColumnBuilderBase): unknown | undefined {
  return (column as { config?: { table?: unknown } }).config?.table;
}

function getUniqueIndexName(
  tableName: string,
  fields: string[],
  explicitName?: string
): string {
  if (explicitName) {
    return explicitName;
  }
  return `${tableName}_${fields.join('_')}_unique`;
}

function assertColumnInTable(
  column: ColumnBuilderBase,
  expectedTable: string,
  context: string
): string {
  const tableName = getColumnTableName(column);
  if (tableName && tableName !== expectedTable) {
    throw new Error(
      `${context} references column from '${tableName}', but belongs to '${expectedTable}'.`
    );
  }
  return getColumnName(column);
}

function assertNoReservedCreatedAtIndexFields(
  fields: readonly string[],
  context: string
): void {
  if (fields.includes('createdAt')) {
    throw new Error(
      `${context} cannot use 'createdAt'. 'createdAt' is reserved and maps to internal '_creationTime'.`
    );
  }
}

function assertSearchFieldType(
  column: ColumnBuilderBase,
  indexName: string
): void {
  const columnType = getColumnType(column) ?? 'unknown';
  if (columnType !== 'ConvexText') {
    throw new Error(
      `Search index '${indexName}' only supports text() columns. Field '${getColumnName(
        column
      )}' is type '${columnType}'.`
    );
  }
}

function assertVectorFieldType(
  column: ColumnBuilderBase,
  indexName: string
): void {
  const columnType = getColumnType(column) ?? 'unknown';
  if (columnType !== 'ConvexVector') {
    throw new Error(
      `Vector index '${indexName}' requires a vector() column. Field '${getColumnName(
        column
      )}' is type '${columnType}'.`
    );
  }
}

function applyExtraConfig<T extends TableConfig>(
  table: ConvexTableImpl<T>,
  config: ConvexTableExtraConfigValue[] | ConvexTableExtraConfig | undefined
) {
  if (!config) return;

  const entries = Array.isArray(config) ? config : Object.values(config);

  for (const entry of entries) {
    if (isConvexIndexBuilderOn(entry)) {
      throw new Error(
        `Invalid index definition on '${table.tableName}'. Did you forget to call .on(...)?`
      );
    }

    if (isConvexUniqueConstraintBuilderOn(entry)) {
      throw new Error(
        `Invalid unique constraint definition on '${table.tableName}'. Did you forget to call .on(...)?`
      );
    }

    if (isConvexSearchIndexBuilderOn(entry)) {
      throw new Error(
        `Invalid search index definition on '${table.tableName}'. Did you forget to call .on(...)?`
      );
    }

    if (isConvexVectorIndexBuilderOn(entry)) {
      throw new Error(
        `Invalid vector index definition on '${table.tableName}'. Did you forget to call .on(...)?`
      );
    }

    if (isRlsPolicy(entry)) {
      const target = (entry as any)._linkedTable ?? table;
      if (typeof (target as any).addRlsPolicy === 'function') {
        (target as any).addRlsPolicy(entry);
      } else {
        const policies = ((target as any)[RlsPolicies] as RlsPolicy[]) ?? [];
        policies.push(entry);
        (target as any)[RlsPolicies] = policies;
        (target as any)[EnableRLS] = true;
      }
      continue;
    }

    if (isConvexDeletionBuilder(entry)) {
      if ((table as any)[TableDeleteConfig]) {
        throw new Error(
          `Only one deletion(...) config can be defined for '${table.tableName}'.`
        );
      }
      (table as any)[TableDeleteConfig] = {
        mode: entry.config.mode,
        delayMs: entry.config.delayMs,
      } satisfies OrmTableDeleteConfig;
      continue;
    }

    if (isConvexLifecycleBuilder(entry)) {
      table.addLifecycleHook(entry.config);
      continue;
    }

    if (isOrmTriggerLike(entry)) {
      table.addLifecycleHook({
        operation: 'change',
        handler: entry as OrmLifecycleHandler<'change'>,
      });
      continue;
    }

    if (isConvexIndexBuilder(entry)) {
      const { name, columns, unique, where } = entry.config;

      if (where) {
        throw new Error(
          `Convex does not support partial indexes. Remove .where(...) from index '${name}'.`
        );
      }

      if (unique) {
        // Convex does not enforce unique indexes, but we accept the syntax for Drizzle parity.
      }

      const fields = columns.map((column) =>
        assertColumnInTable(column, table.tableName, `Index '${name}'`)
      );
      assertNoReservedCreatedAtIndexFields(fields, `Index '${name}'`);

      table.addIndex(name, fields);
      if (unique) {
        table.addUniqueIndex(name, fields, false);
      }
      continue;
    }

    if (isConvexUniqueConstraintBuilder(entry)) {
      const { name, columns, nullsNotDistinct } = entry.config;
      const fields = columns.map((column) =>
        assertColumnInTable(column, table.tableName, 'Unique constraint')
      );
      assertNoReservedCreatedAtIndexFields(fields, 'Unique constraint');
      const indexName = getUniqueIndexName(table.tableName, fields, name);
      table.addIndex(indexName, fields);
      table.addUniqueIndex(indexName, fields, nullsNotDistinct);
      continue;
    }

    if (isConvexForeignKeyBuilder(entry)) {
      const { name, columns, foreignColumns, onDelete, onUpdate } =
        entry.config;
      if (columns.length === 0 || foreignColumns.length === 0) {
        throw new Error(
          `Foreign key on '${table.tableName}' requires at least one column.`
        );
      }
      if (columns.length !== foreignColumns.length) {
        throw new Error(
          `Foreign key on '${table.tableName}' must specify matching columns and foreignColumns.`
        );
      }

      const localFields = columns.map((column) =>
        assertColumnInTable(column, table.tableName, 'Foreign key')
      );

      const foreignTableName = getColumnTableName(foreignColumns[0]);
      if (!foreignTableName) {
        throw new Error(
          `Foreign key on '${table.tableName}' references a column without a table.`
        );
      }

      const foreignTable = getColumnTable(foreignColumns[0]);
      const foreignFields = foreignColumns.map((column) => {
        const tableName = getColumnTableName(column);
        if (tableName && tableName !== foreignTableName) {
          throw new Error(
            `Foreign key on '${table.tableName}' mixes foreign columns from '${foreignTableName}' and '${tableName}'.`
          );
        }
        return getColumnName(column);
      });

      table.addForeignKey({
        name,
        columns: localFields,
        foreignTableName,
        foreignTable: foreignTable as any,
        foreignColumns: foreignFields,
        onDelete,
        onUpdate,
      });
      continue;
    }

    if (isConvexCheckBuilder(entry)) {
      const { name, expression } = entry.config;
      table.addCheck(name, expression);
      continue;
    }

    if (isConvexSearchIndexBuilder(entry)) {
      const { name, searchField, filterFields, staged } = entry.config;

      const searchFieldName = assertColumnInTable(
        searchField,
        table.tableName,
        `Search index '${name}'`
      );
      assertNoReservedCreatedAtIndexFields(
        [searchFieldName],
        `Search index '${name}'`
      );
      assertSearchFieldType(searchField, name);

      const filterFieldNames = filterFields.map((field) =>
        assertColumnInTable(field, table.tableName, `Search index '${name}'`)
      );
      assertNoReservedCreatedAtIndexFields(
        filterFieldNames,
        `Search index '${name}'`
      );

      table.addSearchIndex(name, {
        searchField: searchFieldName,
        filterFields: filterFieldNames,
        staged,
      });
      continue;
    }

    if (isConvexVectorIndexBuilder(entry)) {
      const { name, vectorField, dimensions, filterFields, staged } =
        entry.config;

      if (dimensions === undefined) {
        throw new Error(
          `Vector index '${name}' is missing dimensions. Call .dimensions(n) before using.`
        );
      }

      const vectorFieldName = assertColumnInTable(
        vectorField,
        table.tableName,
        `Vector index '${name}'`
      );
      assertNoReservedCreatedAtIndexFields(
        [vectorFieldName],
        `Vector index '${name}'`
      );
      assertVectorFieldType(vectorField, name);

      const columnDimensions = getColumnDimensions(vectorField);
      if (columnDimensions !== undefined && columnDimensions !== dimensions) {
        throw new Error(
          `Vector index '${name}' dimensions (${dimensions}) do not match vector column '${vectorFieldName}' dimensions (${columnDimensions}).`
        );
      }

      const filterFieldNames = filterFields.map((field) =>
        assertColumnInTable(field, table.tableName, `Vector index '${name}'`)
      );
      assertNoReservedCreatedAtIndexFields(
        filterFieldNames,
        `Vector index '${name}'`
      );

      table.addVectorIndex(name, {
        vectorField: vectorFieldName,
        dimensions,
        filterFields: filterFieldNames,
        staged,
      });
      continue;
    }

    throw new Error(
      `Unsupported extra config value in convexTable('${table.tableName}').`
    );
  }
}

/**
 * ConvexTable implementation class
 * Provides all properties required by Convex's TableDefinition
 *
 * Following convex-ents pattern:
 * - Private fields for indexes (matches TableDefinition structure)
 * - Duck typing (defineSchema only checks object shape)
 * - Direct validator storage (no re-wrapping)
 */
class ConvexTableImpl<T extends TableConfig> {
  /**
   * Required by TableDefinition
   * Public validator property containing v.object({...}) with all column validators
   */
  validator: Validator<Record<string, any>, 'required', any>;

  /**
   * TableDefinition private fields
   * These satisfy structural typing requirements for defineSchema()
   */
  private indexes: any[] = [];
  private uniqueIndexes: {
    name: string;
    fields: string[];
    nullsNotDistinct: boolean;
  }[] = [];
  private foreignKeys: ForeignKeyDefinition[] = [];
  private deferredForeignKeys: DeferredForeignKeyDefinition[] = [];
  private deferredForeignKeysResolved = false;
  private stagedDbIndexes: any[] = [];
  private searchIndexes: any[] = [];
  private stagedSearchIndexes: any[] = [];
  private vectorIndexes: any[] = [];
  private stagedVectorIndexes: any[] = [];
  private checks: { name: string; expression: FilterExpression<boolean> }[] =
    [];

  /**
   * Symbol-based metadata storage
   */
  [TableName]: T['name'];
  [Columns]: T['columns'];
  [Brand] = 'ConvexTable' as const;
  [EnableRLS] = false;
  [RlsPolicies]: RlsPolicy[] = [];
  [TableDeleteConfig]?: OrmTableDeleteConfig;
  [TableLifecycleHooks]: OrmLifecycleConfig[] = [];

  /**
   * Public tableName for convenience
   */
  tableName: T['name'];

  constructor(name: T['name'], columns: T['columns']) {
    validateTableName(name);

    for (const columnName of Object.keys(columns as Record<string, unknown>)) {
      if (RESERVED_COLUMN_NAMES.has(columnName)) {
        throw new Error(
          `Column name '${columnName}' is reserved. System fields are managed by Convex ORM.`
        );
      }
    }

    this[TableName] = name;

    // Assign column names to builders
    const namedColumns = Object.fromEntries(
      Object.entries(columns).map(([columnName, builder]) => {
        // Set the column name in the builder's config
        (builder as any).config.name = columnName;
        // Track table name for relation typing and runtime introspection
        (builder as any).config.tableName = name;
        // Track table instance for constraint enforcement
        (builder as any).config.table = this;
        return [columnName, builder];
      })
    ) as T['columns'];

    this[Columns] = namedColumns;
    this.tableName = name;

    // Use factory to create validator from columns
    // This extracts .convexValidator from each builder and creates v.object({...})
    this.validator = createValidatorFromColumns(namedColumns as any);

    for (const [columnName, builder] of Object.entries(namedColumns)) {
      const config = (builder as any).config as
        | {
            isUnique?: boolean;
            uniqueName?: string;
            uniqueNulls?: string;
            foreignKeyConfigs?: {
              ref: () => ColumnBuilderBase;
              config: {
                name?: string;
                onUpdate?: ForeignKeyAction;
                onDelete?: ForeignKeyAction;
              };
            }[];
            referenceTable?: string;
          }
        | undefined;

      if (config?.isUnique) {
        const indexName = getUniqueIndexName(
          name,
          [columnName],
          config.uniqueName
        );
        const nullsNotDistinct = config.uniqueNulls === 'not distinct';
        this.addIndex(indexName, [columnName]);
        this.addUniqueIndex(indexName, [columnName], nullsNotDistinct);
      }

      if (
        config?.referenceTable &&
        (!config.foreignKeyConfigs || config.foreignKeyConfigs.length === 0)
      ) {
        this.addForeignKey({
          name: undefined,
          columns: [columnName],
          foreignTableName: config.referenceTable,
          foreignColumns: ['_id'],
        });
      }

      if (config?.foreignKeyConfigs?.length) {
        for (const foreignConfig of config.foreignKeyConfigs) {
          this.deferredForeignKeys.push({
            localColumnName: columnName,
            ref: foreignConfig.ref,
            config: foreignConfig.config,
          });
        }
      }
    }
  }

  /**
   * Internal: add index to table from builder extraConfig
   *
   */
  addIndex<IndexName extends string>(name: IndexName, fields: string[]): void {
    this.indexes.push({ indexDescriptor: name, fields });
  }

  /**
   * Internal: add unique index metadata for runtime enforcement
   */
  addUniqueIndex<IndexName extends string>(
    name: IndexName,
    fields: string[],
    nullsNotDistinct: boolean
  ): void {
    this.uniqueIndexes.push({ name, fields, nullsNotDistinct });
  }

  /**
   * Internal: expose unique index metadata for mutation enforcement
   */
  getUniqueIndexes(): {
    name: string;
    fields: string[];
    nullsNotDistinct: boolean;
  }[] {
    return this.uniqueIndexes;
  }

  /**
   * Internal: expose index metadata for runtime enforcement
   */
  getIndexes(): { name: string; fields: string[] }[] {
    return this.indexes.map(
      (entry: { indexDescriptor: string; fields: string[] }) => ({
        name: entry.indexDescriptor,
        fields: entry.fields,
      })
    );
  }

  /**
   * Internal: expose search index metadata for runtime query execution
   */
  getSearchIndexes(): {
    name: string;
    searchField: string;
    filterFields: string[];
  }[] {
    return this.searchIndexes.map(
      (entry: {
        indexDescriptor: string;
        searchField: string;
        filterFields: string[];
      }) => ({
        name: entry.indexDescriptor,
        searchField: entry.searchField,
        filterFields: entry.filterFields,
      })
    );
  }

  /**
   * Internal: expose vector index metadata for runtime query execution
   */
  getVectorIndexes(): {
    name: string;
    vectorField: string;
    dimensions: number;
    filterFields: string[];
  }[] {
    return this.vectorIndexes.map(
      (entry: {
        indexDescriptor: string;
        vectorField: string;
        dimensions: number;
        filterFields: string[];
      }) => ({
        name: entry.indexDescriptor,
        vectorField: entry.vectorField,
        dimensions: entry.dimensions,
        filterFields: entry.filterFields,
      })
    );
  }

  /**
   * Internal: attach an RLS policy to this table
   */
  addRlsPolicy(policy: RlsPolicy): void {
    this[RlsPolicies].push(policy);
    this[EnableRLS] = true;
  }

  /**
   * Internal: return attached RLS policies
   */
  getRlsPolicies(): RlsPolicy[] {
    return this[RlsPolicies];
  }

  /**
   * Internal: check if RLS is enabled on this table
   */
  isRlsEnabled(): boolean {
    return this[EnableRLS];
  }

  addLifecycleHook(config: OrmLifecycleConfig): void {
    this[TableLifecycleHooks].push(config);
  }

  getLifecycleHooks(): OrmLifecycleConfig[] {
    return this[TableLifecycleHooks];
  }

  /**
   * Internal: add foreign key metadata for runtime enforcement
   */
  addForeignKey(definition: ForeignKeyDefinition): void {
    const matches = (existing: ForeignKeyDefinition) => {
      if (existing.foreignTableName !== definition.foreignTableName) {
        return false;
      }
      if (existing.columns.length !== definition.columns.length) {
        return false;
      }
      if (existing.foreignColumns.length !== definition.foreignColumns.length) {
        return false;
      }
      for (let i = 0; i < existing.columns.length; i++) {
        if (existing.columns[i] !== definition.columns[i]) {
          return false;
        }
      }
      for (let i = 0; i < existing.foreignColumns.length; i++) {
        if (existing.foreignColumns[i] !== definition.foreignColumns[i]) {
          return false;
        }
      }
      return true;
    };

    this.foreignKeys = this.foreignKeys.filter(
      (existing) => !matches(existing)
    );
    this.foreignKeys.push(definition);
  }

  private resolveDeferredForeignKeys(): void {
    if (this.deferredForeignKeysResolved) {
      return;
    }
    this.deferredForeignKeysResolved = true;

    for (const deferred of this.deferredForeignKeys) {
      let foreignColumn: ColumnBuilderBase;
      try {
        foreignColumn = deferred.ref();
      } catch (error) {
        const reason = error instanceof Error ? ` ${error.message}` : '';
        throw new Error(
          `Failed to resolve foreign key reference for '${this.tableName}.${deferred.localColumnName}'. Use references(() => targetTable.column) after both tables are declared.${reason}`
        );
      }

      const foreignTableName = getColumnTableName(foreignColumn);
      if (!foreignTableName) {
        throw new Error(
          `Foreign key on '${this.tableName}.${deferred.localColumnName}' references a column without a table. Use references(() => targetTable.column).`
        );
      }

      const foreignTable = getColumnTable(foreignColumn);
      if (!foreignTable) {
        throw new Error(
          `Foreign key on '${this.tableName}.${deferred.localColumnName}' references a column without table metadata. Replace references(() => id('tableName')) with references(() => table.id).`
        );
      }
      const foreignColumnName = getColumnName(foreignColumn);
      this.addForeignKey({
        name: deferred.config.name,
        columns: [deferred.localColumnName],
        foreignTableName,
        foreignTable: foreignTable as any,
        foreignColumns: [foreignColumnName],
        onDelete: deferred.config.onDelete,
        onUpdate: deferred.config.onUpdate,
      });
    }

    this.deferredForeignKeys = [];
  }

  /**
   * Internal: expose foreign key metadata for mutation enforcement
   */
  getForeignKeys(): ForeignKeyDefinition[] {
    this.resolveDeferredForeignKeys();
    return this.foreignKeys;
  }

  addCheck(name: string, expression: FilterExpression<boolean>): void {
    this.checks.push({ name, expression });
  }

  getChecks(): { name: string; expression: FilterExpression<boolean> }[] {
    return this.checks;
  }

  /**
   * Internal: add search index to table from builder extraConfig
   */
  addSearchIndex<
    IndexName extends string,
    SearchField extends string,
    FilterField extends string = never,
  >(
    name: IndexName,
    config: {
      searchField: SearchField;
      filterFields?: FilterField[];
      staged?: boolean;
    }
  ): void {
    const entry = {
      indexDescriptor: name,
      searchField: config.searchField,
      filterFields: config.filterFields ?? [],
    };
    if (config.staged) {
      this.stagedSearchIndexes.push(entry);
    } else {
      this.searchIndexes.push(entry);
    }
  }

  /**
   * Internal: add vector index to table from builder extraConfig
   */
  addVectorIndex<
    IndexName extends string,
    VectorField extends string,
    FilterField extends string = never,
  >(
    name: IndexName,
    config: {
      vectorField: VectorField;
      dimensions: number;
      filterFields?: FilterField[];
      staged?: boolean;
    }
  ): void {
    const entry = {
      indexDescriptor: name,
      vectorField: config.vectorField,
      dimensions: config.dimensions,
      filterFields: config.filterFields ?? [],
    };
    if (config.staged) {
      this.stagedVectorIndexes.push(entry);
    } else {
      this.vectorIndexes.push(entry);
    }
  }

  /**
   * Legacy chainable index API is not supported.
   * Use index('name').on(...) in convexTable extraConfig instead.
   */
  index(_name: string, _fields: string[]): never {
    throw new Error(
      'table.index() is not supported. Use index(name).on(...) in convexTable extraConfig.'
    );
  }

  /**
   * Legacy chainable searchIndex API is not supported.
   * Use searchIndex('name').on(...) in convexTable extraConfig instead.
   */
  searchIndex(): never {
    throw new Error(
      'table.searchIndex() is not supported. Use searchIndex(name).on(...) in convexTable extraConfig.'
    );
  }

  /**
   * Legacy chainable vectorIndex API is not supported.
   * Use vectorIndex('name').on(...).dimensions(n) in convexTable extraConfig instead.
   */
  vectorIndex(): never {
    throw new Error(
      'table.vectorIndex() is not supported. Use vectorIndex(name).on(...).dimensions(n) in convexTable extraConfig.'
    );
  }

  /**
   * Export the contents of this definition for Convex schema tooling.
   * Mirrors convex/server TableDefinition.export().
   */
  export() {
    const documentType = (this.validator as unknown as { json: unknown }).json;
    if (typeof documentType !== 'object') {
      throw new Error(
        'Invalid validator: please make sure that the parameter of `defineTable` is valid (see https://docs.convex.dev/database/schemas)'
      );
    }

    return {
      indexes: this.indexes,
      stagedDbIndexes: this.stagedDbIndexes,
      searchIndexes: this.searchIndexes,
      stagedSearchIndexes: this.stagedSearchIndexes,
      vectorIndexes: this.vectorIndexes,
      stagedVectorIndexes: this.stagedVectorIndexes,
      documentType,
    };
  }
}

/**
 * ConvexTable interface with type branding
 * Extends TableDefinition for schema compatibility
 * Adds phantom types for type inference
 *
 * Following Drizzle pattern: columns are exposed as table properties
 * via mapped type for type safety + Object.assign for runtime access
 */
export interface ConvexTable<
  T extends TableConfig,
  Indexes extends GenericTableIndexes = {},
  SearchIndexes extends GenericTableSearchIndexes = {},
  VectorIndexes extends GenericTableVectorIndexes = {},
> extends TableDefinition<
    Validator<any, any, any>,
    Indexes,
    SearchIndexes,
    VectorIndexes
  > {
  /**
   * Type brand for generic type extraction
   * Uses `declare readonly` to avoid runtime overhead
   */
  readonly _: {
    readonly brand: 'ConvexTable';
    readonly name: T['name'];
    readonly columns: T['columns'];
    readonly inferSelect: import('./types').InferSelectModel<ConvexTable<T>>;
    readonly inferInsert: import('./types').InferInsertModel<ConvexTable<T>>;
  };

  /**
   * Inferred types for select and insert operations
   * Following Drizzle's pattern: $inferSelect and $inferInsert properties
   */
  readonly $inferSelect: import('./types').InferSelectModel<ConvexTable<T>>;
  readonly $inferInsert: import('./types').InferInsertModel<ConvexTable<T>>;

  /**
   * Symbol-based metadata storage
   */
  [TableName]: T['name'];
  [Columns]: T['columns'];
  [Brand]: 'ConvexTable';
  [RlsPolicies]: RlsPolicy[];
  [EnableRLS]: boolean;
  [TableDeleteConfig]?: OrmTableDeleteConfig;
  [TableLifecycleHooks]: OrmLifecycleConfig[];

  /**
   * Convex schema validator
   */
  validator: Validator<any, any, any>;
  tableName: T['name'];

  // Note: chainable index methods are intentionally unsupported; use builders in extraConfig.
}

/**
 * ConvexTable with columns as properties
 * Following Drizzle's PgTableWithColumns pattern
 * Mapped type makes columns accessible: table.columnName
 * Includes public system fields (id, createdAt) available on all Convex documents
 */
export type ConvexTableWithColumns<
  T extends TableConfig,
  Indexes extends GenericTableIndexes = {},
  SearchIndexes extends GenericTableSearchIndexes = {},
  VectorIndexes extends GenericTableVectorIndexes = {},
> = ConvexTable<T, Indexes, SearchIndexes, VectorIndexes> & {
  [Key in keyof T['columns']]: T['columns'][Key];
} & SystemFields<T['name']> &
  SystemFieldAliases<T['name'], T['columns']>;

export function getTableLifecycleHooks(
  table: ConvexTable<any>
): OrmLifecycleConfig[] {
  const fromMethod = (table as any).getLifecycleHooks?.();
  if (Array.isArray(fromMethod)) {
    return fromMethod;
  }
  return ((table as any)[TableLifecycleHooks] ?? []) as OrmLifecycleConfig[];
}

/**
 * Create a type-safe Convex table definition
 *
 * Uses Drizzle-style column builders:
 * - text().notNull(), integer(), boolean(), etc.
 *
 * @param name - Table name (must be valid Convex table name)
 * @param columns - Column builders
 * @returns ConvexTable instance compatible with defineSchema()
 *
 * @example
 * import { convexTable, text, integer } from 'better-convex/orm';
 *
 * const users = convexTable('users', {
 *   name: text().notNull(),
 *   email: text().notNull(),
 *   age: integer(),
 * });
 *
 * // Use in schema - works with defineSchema()
 * export default defineSchema({ users });
 *
 * // Extract types
 * type User = InferSelectModel<typeof users>;
 * type NewUser = InferInsertModel<typeof users>;
 *
 * // Indexes
 * const usersWithIndex = convexTable('users', { email: text() }, (t) => [
 *   index('by_email').on(t.email),
 * ]);
 */
type ConvexTableFnInternal = <
  TName extends string,
  TColumns,
  TExtraConfig extends
    | ConvexTableExtraConfigValue[]
    | ConvexTableExtraConfig
    | undefined = undefined,
>(
  name: TName,
  columns: TColumns,
  extraConfig?: (self: ColumnsWithSystemFields<TColumns, TName>) => TExtraConfig
) => ConvexTableWithColumns<
  {
    name: TName;
    columns: ColumnsWithTableName<TColumns, TName>;
  },
  InferDbIndexesFromExtraConfig<TExtraConfig>,
  InferSearchIndexesFromExtraConfig<TExtraConfig>,
  InferVectorIndexesFromExtraConfig<TExtraConfig>
>;

export interface ConvexTableFn extends ConvexTableFnInternal {
  withRLS: ConvexTableFnInternal;
}

const convexTableInternal: ConvexTableFnInternal = (
  name,
  columns,
  extraConfig
): ConvexTableWithColumns<{
  name: typeof name;
  columns: ColumnsWithTableName<typeof columns, typeof name>;
}> => {
  // Create raw table instance
  const rawTable = new ConvexTableImpl(name, columns as any);

  // Create system fields (public id/createdAt + internal _creationTime)
  const systemFields = createSystemFields(name);
  for (const builder of Object.values(systemFields)) {
    (builder as any).config.table = rawTable;
  }

  // Attach system fields first, then user columns so user `createdAt` wins.
  const table = Object.assign(rawTable, systemFields, rawTable[Columns]) as any;

  // Internal alias for runtime internals; intentionally not in public types.
  const internalCreationTime = systemFields._creationTime;
  if (Object.hasOwn(table, '_creationTime')) {
    table._creationTime = undefined;
  }
  Object.defineProperty(table, '_creationTime', {
    value: internalCreationTime,
    enumerable: false,
    configurable: true,
    writable: false,
  });

  // Internal alias for runtime internals; intentionally not in public types.
  Object.defineProperty(table, '_id', {
    value: systemFields.id,
    enumerable: false,
    configurable: true,
    writable: false,
  });

  applyExtraConfig(rawTable, extraConfig?.(table));

  return table as any;
};

const convexTableWithRLS: ConvexTableFnInternal = (
  name,
  columns,
  extraConfig
) => {
  const table = convexTableInternal(name, columns, extraConfig);
  (table as any)[EnableRLS] = true;
  return table;
};

export const convexTable: ConvexTableFn = Object.assign(convexTableInternal, {
  withRLS: convexTableWithRLS,
});
