import type {
  GenericTableIndexes,
  GenericTableSearchIndexes,
  GenericTableVectorIndexes,
  TableDefinition,
} from 'convex/server';
import type { Validator } from 'convex/values';
import { v } from 'convex/values';
import type {
  $Type,
  ColumnBuilder,
  ColumnBuilderBase,
  ColumnBuilderRuntimeConfig,
  ColumnBuilderWithTableName,
  ForeignKeyAction,
  NotNull,
} from './builders/column-builder';
import { entityKind } from './builders/column-builder';
import {
  createSystemFields,
  type SystemFieldAliases,
  type SystemFields,
  type SystemFieldsWithAliases,
} from './builders/system-fields';
import { type ConvexTextBuilderInitial, text } from './builders/text';
import type {
  ConvexCheckBuilder,
  ConvexForeignKeyBuilder,
  ConvexUniqueConstraintBuilder,
  ConvexUniqueConstraintBuilderOn,
} from './constraints';
import type { FilterExpression } from './filter-expression';
import type {
  ConvexAggregateIndexBuilder,
  ConvexAggregateIndexBuilderOn,
  ConvexIndexBuilder,
  ConvexIndexBuilderOn,
  ConvexIndexColumn,
  ConvexRankIndexBuilder,
  ConvexRankIndexBuilderOn,
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
  LinkRlsPolicy,
  type OrmDeleteMode,
  type OrmTableDeleteConfig,
  RlsPolicies,
  TableDeleteConfig,
  TableName,
  TablePolymorphic,
  type TablePolymorphicConfigRuntime,
} from './symbols';

/**
 * Reserved Convex system table names that cannot be used
 */
const RESERVED_TABLES = new Set(['_storage', '_scheduled_functions']);
const RESERVED_COLUMN_NAMES = new Set(['id', '_id', '_creationTime']);
const DEFAULT_POLYMORPHIC_ALIAS = 'details' as const;
const CONVEX_TABLE_FIELD_LIMIT = 1024;

/**
 * Valid table name pattern: starts with letter/underscore, contains only alphanumeric and underscore
 */
const TABLE_NAME_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

type AnyColumnBuilder = ColumnBuilder<any, any, any>;
type PolymorphicVariantDefinitions = Record<
  string,
  Record<string, ColumnBuilderBase>
>;
type PolymorphicDiscriminatorValue<
  TVariants extends PolymorphicVariantDefinitions,
> = Extract<keyof TVariants, string>;

type PolymorphicTypeMetadata<
  TVariants extends
    PolymorphicVariantDefinitions = PolymorphicVariantDefinitions,
  TAlias extends string = string,
> = {
  as: TAlias;
  variants: TVariants;
};

type OverrideColumnMeta<
  TColumn extends ColumnBuilderBase,
  TOverrides extends object,
> = TColumn extends {
  _: infer TMeta extends object;
}
  ? Omit<TColumn, '_'> & {
      _: Omit<TMeta, keyof TOverrides> & TOverrides;
    }
  : TColumn;

type PolymorphicGeneratedColumn<TColumn extends ColumnBuilderBase> =
  OverrideColumnMeta<
    TColumn,
    {
      hasDefault: false;
      notNull: false;
    }
  >;

type PolymorphicDiscriminatorColumn<
  TVariants extends
    PolymorphicVariantDefinitions = PolymorphicVariantDefinitions,
  TAlias extends string = typeof DEFAULT_POLYMORPHIC_ALIAS,
> = $Type<
  NotNull<ConvexTextBuilderInitial<''>>,
  PolymorphicDiscriminatorValue<TVariants>
> & {
  __polymorphic: PolymorphicTypeMetadata<TVariants, TAlias>;
};

type ExtractPolymorphicVariants<TColumn> = TColumn extends {
  __polymorphic: infer TMeta;
}
  ? TMeta extends PolymorphicTypeMetadata<
      infer TVariants extends PolymorphicVariantDefinitions,
      string
    >
    ? TVariants
    : never
  : never;

type ExtractPolymorphicGeneratedColumns<TColumns> = SimplifyObject<
  UnionToIntersection<
    {
      [K in keyof TColumns]: ExtractPolymorphicVariants<
        TColumns[K]
      > extends infer TVariants
        ? [TVariants] extends [never]
          ? {}
          : {
              [V in keyof TVariants & string]: {
                [F in keyof TVariants[V] &
                  string]: TVariants[V][F] extends ColumnBuilderBase
                  ? PolymorphicGeneratedColumn<TVariants[V][F]>
                  : never;
              };
            }[keyof TVariants & string]
        : {};
    }[keyof TColumns]
  >
>;

type MergeColumnObjects<TLeft, TRight> = {
  [K in keyof TLeft | keyof TRight]: K extends keyof TRight
    ? TRight[K]
    : K extends keyof TLeft
      ? TLeft[K]
      : never;
};

type ExpandTableColumns<TColumns> = SimplifyObject<
  MergeColumnObjects<TColumns, ExtractPolymorphicGeneratedColumns<TColumns>>
>;

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
  columns: TColumns;
  name: TName;
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

export type DiscriminatorBuilderConfig<
  TVariants extends
    PolymorphicVariantDefinitions = PolymorphicVariantDefinitions,
  TAlias extends string = typeof DEFAULT_POLYMORPHIC_ALIAS,
> = {
  as?: TAlias;
  variants: TVariants;
};

export function discriminator<
  const TVariants extends PolymorphicVariantDefinitions,
  const TAlias extends string,
>(
  config: DiscriminatorBuilderConfig<TVariants, TAlias> & {
    as: TAlias;
  }
): PolymorphicDiscriminatorColumn<TVariants, TAlias>;
export function discriminator<
  const TVariants extends PolymorphicVariantDefinitions,
>(
  config: DiscriminatorBuilderConfig<TVariants>
): PolymorphicDiscriminatorColumn<TVariants, typeof DEFAULT_POLYMORPHIC_ALIAS>;
export function discriminator(
  config: DiscriminatorBuilderConfig
): PolymorphicDiscriminatorColumn {
  if (!config || typeof config !== 'object') {
    throw new Error('discriminator(...) requires a config object.');
  }
  if (
    !config.variants ||
    typeof config.variants !== 'object' ||
    Object.keys(config.variants).length === 0
  ) {
    throw new Error(
      'discriminator(...).variants must contain at least one case.'
    );
  }
  if (
    config.as !== undefined &&
    (typeof config.as !== 'string' || config.as.length === 0)
  ) {
    throw new Error(
      'discriminator(...).as must be a non-empty string when set.'
    );
  }

  const builder = text().notNull() as unknown as AnyColumnBuilder & {
    __polymorphic?: PolymorphicTypeMetadata;
    config: ColumnBuilderRuntimeConfig<unknown> & {
      discriminator?: DiscriminatorBuilderConfig;
    };
  };
  builder.__polymorphic = {
    as: (config.as ?? DEFAULT_POLYMORPHIC_ALIAS) as string,
    variants: config.variants,
  };
  builder.config.discriminator = {
    as: config.as,
    variants: config.variants,
  };
  return builder as unknown as PolymorphicDiscriminatorColumn;
}

export type ConvexTableExtraConfigValue =
  | ConvexIndexBuilder
  | ConvexAggregateIndexBuilder
  | ConvexRankIndexBuilder
  | ConvexSearchIndexBuilder
  | ConvexVectorIndexBuilder
  | ConvexForeignKeyBuilder
  | ConvexCheckBuilder
  | ConvexUniqueConstraintBuilder
  | ConvexDeletionBuilder
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

type AggregateFieldUnionFromColumns<
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

type InferAggregateIndexRecordFromExtraValue<TValue> =
  TValue extends ConvexAggregateIndexBuilder<
    infer TName extends string,
    infer TColumns extends readonly ConvexIndexColumn[]
  >
    ? Record<TName, AggregateFieldUnionFromColumns<TColumns>>
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

type InferredAggregateIndexesFromExtraConfig<TExtraConfig> =
  UnionToIntersection<
    InferAggregateIndexRecordFromExtraValue<
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

type NormalizeAggregateIndexMap<TIndexMap> = {
  [K in keyof TIndexMap as K extends string
    ? K
    : never]: TIndexMap[K] extends string ? TIndexMap[K] : never;
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

type OrmLifecycleChangeId<TDoc> = TDoc extends { _id: infer TId }
  ? TId
  : TDoc extends { id: infer TId }
    ? TId
    : unknown;

export type OrmLifecycleChange<
  TDoc = Record<string, unknown>,
  TId = OrmLifecycleChangeId<TDoc>,
> = {
  id: TId;
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

function isConvexAggregateIndexBuilder(
  value: unknown
): value is ConvexAggregateIndexBuilder {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { [entityKind]?: string })[entityKind] ===
      'ConvexAggregateIndexBuilder'
  );
}

function isConvexAggregateIndexBuilderOn(
  value: unknown
): value is ConvexAggregateIndexBuilderOn {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { [entityKind]?: string })[entityKind] ===
      'ConvexAggregateIndexBuilderOn'
  );
}

function isConvexRankIndexBuilderOn(
  value: unknown
): value is ConvexRankIndexBuilderOn {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { [entityKind]?: string })[entityKind] ===
      'ConvexRankIndexBuilderOn'
  );
}

function isConvexRankIndexBuilder(
  value: unknown
): value is ConvexRankIndexBuilder {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { [entityKind]?: string })[entityKind] ===
      'ConvexRankIndexBuilder'
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

function isConvexLifecycleBuilder(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { [entityKind]?: string })[entityKind] ===
      'ConvexLifecycleBuilder'
  );
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

function assertAggregateSumFieldType(
  column: ColumnBuilderBase,
  indexName: string
): void {
  const columnType = getColumnType(column) ?? 'unknown';
  if (!['ConvexNumber', 'ConvexTimestamp'].includes(columnType)) {
    throw new Error(
      `aggregateIndex '${indexName}' sum() supports integer()/timestamp() columns only. Field '${getColumnName(
        column
      )}' is type '${columnType}'.`
    );
  }
}

function assertAggregateAvgFieldType(
  column: ColumnBuilderBase,
  indexName: string
): void {
  const columnType = getColumnType(column) ?? 'unknown';
  if (!['ConvexNumber', 'ConvexTimestamp'].includes(columnType)) {
    throw new Error(
      `aggregateIndex '${indexName}' avg() supports integer()/timestamp() columns only. Field '${getColumnName(
        column
      )}' is type '${columnType}'.`
    );
  }
}

function assertAggregateComparableFieldType(
  column: ColumnBuilderBase,
  indexName: string,
  method: 'min' | 'max'
): void {
  const columnType = getColumnType(column) ?? 'unknown';
  const supported = [
    'ConvexNumber',
    'ConvexTimestamp',
    'ConvexDate',
    'ConvexText',
    'ConvexBoolean',
    'ConvexId',
  ];
  if (!supported.includes(columnType)) {
    throw new Error(
      `aggregateIndex '${indexName}' ${method}() does not support column type '${columnType}' on '${getColumnName(
        column
      )}'.`
    );
  }
}

function assertRankOrderFieldType(
  column: ColumnBuilderBase,
  indexName: string
): void {
  const columnType = getColumnType(column) ?? 'unknown';
  if (!['ConvexNumber', 'ConvexTimestamp', 'ConvexDate'].includes(columnType)) {
    throw new Error(
      `rankIndex '${indexName}' orderBy() supports integer()/timestamp()/date() columns only. Field '${getColumnName(
        column
      )}' is type '${columnType}'.`
    );
  }
}

const dedupeFieldNames = (fields: string[]): string[] => [...new Set(fields)];

type DiscriminatorBuilderRuntimeConfig = DiscriminatorBuilderConfig & {
  as?: string;
};

type PolymorphicColumnRuntime = AnyColumnBuilder & {
  config: ColumnBuilderRuntimeConfig<unknown> & {
    discriminator?: DiscriminatorBuilderRuntimeConfig;
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isColumnBuilder = (value: unknown): value is AnyColumnBuilder =>
  isRecord(value) && typeof (value as { build?: unknown }).build === 'function';

const getDiscriminatorConfig = (
  value: unknown
): DiscriminatorBuilderRuntimeConfig | undefined => {
  if (!isColumnBuilder(value)) {
    return;
  }
  const discriminator = (value as PolymorphicColumnRuntime).config
    ?.discriminator;
  if (!discriminator) {
    return;
  }
  return discriminator;
};

const getPolymorphicFieldSignature = (column: AnyColumnBuilder): string => {
  const validator = (column as any).convexValidator ?? column.build();
  return JSON.stringify({
    columnType: (column as any).config?.columnType,
    validator: (validator as any)?.json,
  });
};

function resolveTableColumns(
  tableName: string,
  columns: Record<string, unknown>
): {
  columns: Record<string, AnyColumnBuilder>;
  polymorphicConfigs: TablePolymorphicConfigRuntime[];
} {
  const resolvedColumns: Record<string, AnyColumnBuilder> = {};
  const pendingPolymorphic: Array<{
    discriminator: string;
    alias: string;
    variants: PolymorphicVariantDefinitions;
  }> = [];

  for (const [columnName, rawBuilder] of Object.entries(columns)) {
    if (!isColumnBuilder(rawBuilder)) {
      throw new Error(
        `Column '${columnName}' on '${tableName}' must be a column builder.`
      );
    }
    resolvedColumns[columnName] = rawBuilder;

    const discriminatorConfig = getDiscriminatorConfig(rawBuilder);
    if (!discriminatorConfig) {
      continue;
    }

    if (
      !isRecord(discriminatorConfig.variants) ||
      Object.keys(discriminatorConfig.variants).length === 0
    ) {
      throw new Error(
        `discriminator('${tableName}.${columnName}') requires at least one variant.`
      );
    }

    const alias =
      discriminatorConfig.as === undefined
        ? DEFAULT_POLYMORPHIC_ALIAS
        : discriminatorConfig.as;
    if (typeof alias !== 'string' || alias.length === 0) {
      throw new Error(
        `discriminator('${tableName}.${columnName}').as must be a non-empty string.`
      );
    }

    pendingPolymorphic.push({
      discriminator: columnName,
      alias,
      variants: discriminatorConfig.variants as PolymorphicVariantDefinitions,
    });
  }

  if (pendingPolymorphic.length > 1) {
    throw new Error(
      `Only one discriminator(...) column is currently supported on '${tableName}'.`
    );
  }

  const polymorphicConfigs: TablePolymorphicConfigRuntime[] = [];
  for (const pending of pendingPolymorphic) {
    if (pending.alias in resolvedColumns) {
      throw new Error(
        `discriminator('${tableName}.${pending.discriminator}') alias '${pending.alias}' collides with an existing column.`
      );
    }

    const generatedFieldMap = new Map<
      string,
      {
        builder: AnyColumnBuilder;
        signature: string;
      }
    >();
    const variantRuntime: Record<
      string,
      {
        fieldNames: readonly string[];
        requiredFieldNames: readonly string[];
      }
    > = {};

    for (const [variantKey, rawVariantColumns] of Object.entries(
      pending.variants
    )) {
      if (!isRecord(rawVariantColumns)) {
        throw new Error(
          `discriminator('${tableName}.${pending.discriminator}') variant '${variantKey}' must be an object.`
        );
      }

      const fieldNames: string[] = [];
      const requiredFieldNames: string[] = [];

      for (const [fieldName, rawFieldBuilder] of Object.entries(
        rawVariantColumns
      )) {
        if (!isColumnBuilder(rawFieldBuilder)) {
          throw new Error(
            `discriminator('${tableName}.${pending.discriminator}').variants.${variantKey}.${fieldName} must be a column builder.`
          );
        }
        if (fieldName in resolvedColumns) {
          throw new Error(
            `discriminator('${tableName}.${pending.discriminator}').variants.${variantKey}.${fieldName} collides with an existing table column.`
          );
        }

        const fieldBuilder = rawFieldBuilder as AnyColumnBuilder;
        const fieldConfig = (fieldBuilder as any).config as
          | ColumnBuilderRuntimeConfig<unknown>
          | undefined;
        const isRequiredForVariant =
          fieldConfig?.notNull === true &&
          fieldConfig.hasDefault !== true &&
          typeof fieldConfig.defaultFn !== 'function';
        const signature = getPolymorphicFieldSignature(fieldBuilder);
        const existing = generatedFieldMap.get(fieldName);

        if (existing && existing.signature !== signature) {
          throw new Error(
            `discriminator('${tableName}.${pending.discriminator}') field '${fieldName}' has conflicting builder signatures across variants.`
          );
        }

        if (!existing) {
          if (fieldConfig) {
            fieldConfig.notNull = false;
          }
          generatedFieldMap.set(fieldName, {
            builder: fieldBuilder,
            signature,
          });
        }

        fieldNames.push(fieldName);
        if (isRequiredForVariant) {
          requiredFieldNames.push(fieldName);
        }
      }

      variantRuntime[variantKey] = {
        fieldNames,
        requiredFieldNames,
      };
    }

    for (const [fieldName, { builder }] of generatedFieldMap.entries()) {
      resolvedColumns[fieldName] = builder;
    }

    polymorphicConfigs.push({
      discriminator: pending.discriminator,
      alias: pending.alias,
      generatedFieldNames: Object.freeze([...generatedFieldMap.keys()]),
      variants: Object.freeze(variantRuntime),
    });
  }

  if (Object.keys(resolvedColumns).length > CONVEX_TABLE_FIELD_LIMIT) {
    throw new Error(
      `Table '${tableName}' exceeds Convex field count limit (${CONVEX_TABLE_FIELD_LIMIT}) after discriminator expansion.`
    );
  }

  return {
    columns: resolvedColumns,
    polymorphicConfigs,
  };
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

    if (isConvexAggregateIndexBuilderOn(entry)) {
      throw new Error(
        `Invalid aggregate index definition on '${table.tableName}'. Did you forget to call .on(...) or .all()?`
      );
    }

    if (isConvexRankIndexBuilderOn(entry)) {
      throw new Error(
        `Invalid rank index definition on '${table.tableName}'. Did you forget to call .partitionBy(...) or .all()?`
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
      if (target === table) {
        table.addRlsPolicy(entry);
      } else if (!(LinkRlsPolicy in target)) {
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
      throw new Error(
        `Lifecycle hooks are no longer supported inside convexTable('${table.tableName}', ..., extraConfig). Export schema triggers with defineTriggers(relations, { ... }) from schema.ts.`
      );
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

    if (isConvexAggregateIndexBuilder(entry)) {
      const {
        name,
        columns,
        countFields,
        sumFields,
        avgFields,
        minFields,
        maxFields,
      } = entry.config;
      const fields = columns.map((column) =>
        assertColumnInTable(
          column,
          table.tableName,
          `Aggregate index '${name}'`
        )
      );
      assertNoReservedCreatedAtIndexFields(fields, `Aggregate index '${name}'`);

      const resolvedCountFields = dedupeFieldNames(
        countFields.map((column) =>
          assertColumnInTable(
            column,
            table.tableName,
            `Aggregate index '${name}' count`
          )
        )
      );
      assertNoReservedCreatedAtIndexFields(
        resolvedCountFields,
        `Aggregate index '${name}' count`
      );
      const resolvedSumFields = dedupeFieldNames(
        sumFields.map((column) => {
          const field = assertColumnInTable(
            column,
            table.tableName,
            `Aggregate index '${name}' sum`
          );
          assertAggregateSumFieldType(column, name);
          return field;
        })
      );
      assertNoReservedCreatedAtIndexFields(
        resolvedSumFields,
        `Aggregate index '${name}' sum`
      );
      const resolvedAvgFields = dedupeFieldNames(
        avgFields.map((column) => {
          const field = assertColumnInTable(
            column,
            table.tableName,
            `Aggregate index '${name}' avg`
          );
          assertAggregateAvgFieldType(column, name);
          return field;
        })
      );
      assertNoReservedCreatedAtIndexFields(
        resolvedAvgFields,
        `Aggregate index '${name}' avg`
      );
      const resolvedMinFields = dedupeFieldNames(
        minFields.map((column) => {
          const field = assertColumnInTable(
            column,
            table.tableName,
            `Aggregate index '${name}' min`
          );
          assertAggregateComparableFieldType(column, name, 'min');
          return field;
        })
      );
      assertNoReservedCreatedAtIndexFields(
        resolvedMinFields,
        `Aggregate index '${name}' min`
      );
      const resolvedMaxFields = dedupeFieldNames(
        maxFields.map((column) => {
          const field = assertColumnInTable(
            column,
            table.tableName,
            `Aggregate index '${name}' max`
          );
          assertAggregateComparableFieldType(column, name, 'max');
          return field;
        })
      );
      assertNoReservedCreatedAtIndexFields(
        resolvedMaxFields,
        `Aggregate index '${name}' max`
      );

      table.addAggregateIndex(name, {
        fields,
        countFields: resolvedCountFields,
        sumFields: resolvedSumFields,
        avgFields: resolvedAvgFields,
        minFields: resolvedMinFields,
        maxFields: resolvedMaxFields,
      });
      continue;
    }

    if (isConvexRankIndexBuilder(entry)) {
      const { name, partitionColumns, orderColumns, sumField } = entry.config;

      if (!orderColumns.length) {
        throw new Error(
          `rankIndex '${name}' on '${table.tableName}' must declare at least one orderBy(...) column.`
        );
      }

      const resolvedPartitionFields = dedupeFieldNames(
        partitionColumns.map((column) =>
          assertColumnInTable(column, table.tableName, `rankIndex '${name}'`)
        )
      );
      assertNoReservedCreatedAtIndexFields(
        resolvedPartitionFields,
        `rankIndex '${name}' partitionBy`
      );

      const resolvedOrderFields = orderColumns.map((entry) => {
        const field = assertColumnInTable(
          entry.column,
          table.tableName,
          `rankIndex '${name}' orderBy`
        );
        assertNoReservedCreatedAtIndexFields([field], `rankIndex '${name}'`);
        assertRankOrderFieldType(entry.column, name);
        return {
          field,
          direction: entry.direction,
        } as const;
      });

      const resolvedSumField = sumField
        ? (() => {
            const field = assertColumnInTable(
              sumField,
              table.tableName,
              `rankIndex '${name}' sum`
            );
            assertNoReservedCreatedAtIndexFields(
              [field],
              `rankIndex '${name}'`
            );
            assertAggregateSumFieldType(sumField, name);
            return field;
          })()
        : undefined;

      table.addRankIndex(name, {
        partitionFields: resolvedPartitionFields,
        orderFields: resolvedOrderFields,
        sumField: resolvedSumField,
      });
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

type TableIndexEntry = { indexDescriptor: string; fields: string[] };

type UniqueIndexEntry = {
  name: string;
  fields: string[];
  nullsNotDistinct: boolean;
};

type AggregateIndexEntry = {
  name: string;
  fields: string[];
  countFields: string[];
  sumFields: string[];
  avgFields: string[];
  minFields: string[];
  maxFields: string[];
};

type RankIndexEntry = {
  name: string;
  partitionFields: string[];
  orderFields: Array<{
    field: string;
    direction: 'asc' | 'desc';
  }>;
  sumField?: string;
};

type SearchIndexEntry = {
  indexDescriptor: string;
  searchField: string;
  filterFields: string[];
};

type VectorIndexEntry = {
  indexDescriptor: string;
  vectorField: string;
  dimensions: number;
  filterFields: string[];
};

type TableDefinitionState = {
  indexes: TableIndexEntry[];
  uniqueIndexes: UniqueIndexEntry[];
  aggregateIndexes: AggregateIndexEntry[];
  rankIndexes: RankIndexEntry[];
  foreignKeys: ForeignKeyDefinition[];
  deferredForeignKeys: DeferredForeignKeyDefinition[];
  stagedDbIndexes: any[];
  searchIndexes: SearchIndexEntry[];
  stagedSearchIndexes: SearchIndexEntry[];
  vectorIndexes: VectorIndexEntry[];
  stagedVectorIndexes: VectorIndexEntry[];
  checks: { name: string; expression: FilterExpression<boolean> }[];
  rlsPolicies: RlsPolicy[];
  deleteConfig?: OrmTableDeleteConfig;
};

type TableExtraConfigFn = (
  table: any
) => ConvexTableExtraConfigValue[] | ConvexTableExtraConfig | undefined;

type LazyTableState = {
  extraConfig?: TableExtraConfigFn;
  definition?: TableDefinitionState;
  failure?: { error: unknown };
  validator?: Validator<Record<string, any>, 'required', any>;
  rlsEnabled: boolean;
  linkedRlsPolicies: RlsPolicy[];
};

const LazyTable = Symbol('kitcn:LazyTable');

const definingTables: ConvexTableImpl<any>[] = [];

function getTableDefinition(table: ConvexTableImpl<any>): TableDefinitionState {
  const state = table[LazyTable];
  if (state.definition) {
    return state.definition;
  }
  if (state.failure) {
    throw state.failure.error;
  }

  const definition: TableDefinitionState = {
    indexes: [],
    uniqueIndexes: [],
    aggregateIndexes: [],
    rankIndexes: [],
    foreignKeys: [],
    deferredForeignKeys: [],
    stagedDbIndexes: [],
    searchIndexes: [],
    stagedSearchIndexes: [],
    vectorIndexes: [],
    stagedVectorIndexes: [],
    checks: [],
    rlsPolicies: [...state.linkedRlsPolicies],
  };
  const extraConfig = state.extraConfig;
  state.definition = definition;
  state.extraConfig = undefined;
  definingTables.push(table);
  try {
    applyColumnConstraints(table);
    applyExtraConfig(table, extraConfig?.(table));
  } catch (error) {
    state.definition = undefined;
    state.failure = { error };
    throw error;
  } finally {
    definingTables.pop();
  }
  return definition;
}

function applyColumnConstraints<T extends TableConfig>(
  table: ConvexTableImpl<T>
): void {
  for (const [columnName, builder] of Object.entries(
    table[Columns] as Record<string, unknown>
  )) {
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
        table.tableName,
        [columnName],
        config.uniqueName
      );
      const nullsNotDistinct = config.uniqueNulls === 'not distinct';
      table.addIndex(indexName, [columnName]);
      table.addUniqueIndex(indexName, [columnName], nullsNotDistinct);
    }

    if (
      config?.referenceTable &&
      (!config.foreignKeyConfigs || config.foreignKeyConfigs.length === 0)
    ) {
      table.addForeignKey({
        name: undefined,
        columns: [columnName],
        foreignTableName: config.referenceTable,
        foreignColumns: ['_id'],
      });
    }

    if (config?.foreignKeyConfigs?.length) {
      const { deferredForeignKeys } = getTableDefinition(table);
      for (const foreignConfig of config.foreignKeyConfigs) {
        deferredForeignKeys.push({
          localColumnName: columnName,
          ref: foreignConfig.ref,
          config: foreignConfig.config,
        });
      }
    }
  }
}

/**
 * ConvexTable implementation class
 * Provides all properties required by Convex's TableDefinition
 *
 * Column builders are attached when the table is declared. The document
 * validator, indexes, constraints, RLS policies and the extra-config callback
 * are built on first read, once per table.
 */
class ConvexTableImpl<T extends TableConfig> {
  declare [TableName]: T['name'];
  declare [Columns]: T['columns'];
  [Brand] = 'ConvexTable' as const;
  declare [TablePolymorphic]?: readonly TablePolymorphicConfigRuntime[];
  declare [LazyTable]: LazyTableState;
  declare tableName: T['name'];

  constructor(
    name: T['name'],
    columns: T['columns'],
    polymorphicConfigs?: readonly TablePolymorphicConfigRuntime[],
    extraConfig?: TableExtraConfigFn
  ) {
    validateTableName(name);

    for (const columnName of Object.keys(columns as Record<string, unknown>)) {
      if (RESERVED_COLUMN_NAMES.has(columnName)) {
        throw new Error(
          `Column name '${columnName}' is reserved. System fields are managed by Convex ORM.`
        );
      }
    }

    this[TableName] = name;
    this[LazyTable] = {
      extraConfig,
      rlsEnabled: false,
      linkedRlsPolicies: [],
    };

    for (const [columnName, builder] of Object.entries(
      columns as Record<string, unknown>
    )) {
      (builder as any).config.name = columnName;
      (builder as any).config.tableName = name;
      (builder as any).config.table = this;
    }

    this[Columns] = columns;
    this.tableName = name;
    if (polymorphicConfigs && polymorphicConfigs.length > 0) {
      this[TablePolymorphic] = polymorphicConfigs;
    }
  }

  get validator(): Validator<Record<string, any>, 'required', any> {
    const state = this[LazyTable];
    state.validator ??= createValidatorFromColumns(this[Columns] as any);
    return state.validator;
  }

  set validator(validator: Validator<Record<string, any>, 'required', any>) {
    this[LazyTable].validator = validator;
  }

  get indexes(): TableIndexEntry[] {
    return getTableDefinition(this).indexes;
  }

  get stagedDbIndexes(): any[] {
    return getTableDefinition(this).stagedDbIndexes;
  }

  get searchIndexes(): SearchIndexEntry[] {
    return getTableDefinition(this).searchIndexes;
  }

  get stagedSearchIndexes(): SearchIndexEntry[] {
    return getTableDefinition(this).stagedSearchIndexes;
  }

  get vectorIndexes(): VectorIndexEntry[] {
    return getTableDefinition(this).vectorIndexes;
  }

  get stagedVectorIndexes(): VectorIndexEntry[] {
    return getTableDefinition(this).stagedVectorIndexes;
  }

  get [EnableRLS](): boolean {
    getTableDefinition(this);
    return this[LazyTable].rlsEnabled;
  }

  set [EnableRLS](enabled: boolean) {
    this[LazyTable].rlsEnabled = enabled;
  }

  get [RlsPolicies](): RlsPolicy[] {
    return getTableDefinition(this).rlsPolicies;
  }

  get [TableDeleteConfig](): OrmTableDeleteConfig | undefined {
    return getTableDefinition(this).deleteConfig;
  }

  set [TableDeleteConfig](config: OrmTableDeleteConfig | undefined) {
    getTableDefinition(this).deleteConfig = config;
  }

  [LinkRlsPolicy](policy: RlsPolicy): void {
    const defining = definingTables.at(-1);
    if (defining && defining !== this) {
      throw new Error(
        `rlsPolicy('${policy.name}').link(${this.tableName}) must be called at module scope, not inside convexTable('${defining.tableName}', ..., extraConfig).`
      );
    }
    const state = this[LazyTable];
    if (!state.linkedRlsPolicies.includes(policy)) {
      state.linkedRlsPolicies.push(policy);
    }
    state.rlsEnabled = true;
    if (state.definition && !state.definition.rlsPolicies.includes(policy)) {
      state.definition.rlsPolicies.push(policy);
    }
  }

  getPolymorphicConfigs():
    | readonly TablePolymorphicConfigRuntime[]
    | undefined {
    return this[TablePolymorphic];
  }

  /**
   * Internal: add index to table from builder extraConfig
   *
   */
  addIndex<IndexName extends string>(name: IndexName, fields: string[]): void {
    getTableDefinition(this).indexes.push({ indexDescriptor: name, fields });
  }

  /**
   * Internal: add unique index metadata for runtime enforcement
   */
  addUniqueIndex<IndexName extends string>(
    name: IndexName,
    fields: string[],
    nullsNotDistinct: boolean
  ): void {
    getTableDefinition(this).uniqueIndexes.push({
      name,
      fields,
      nullsNotDistinct,
    });
  }

  addAggregateIndex<IndexName extends string>(
    name: IndexName,
    config: {
      fields: string[];
      countFields: string[];
      sumFields: string[];
      avgFields: string[];
      minFields: string[];
      maxFields: string[];
    }
  ): void {
    const definition = getTableDefinition(this);
    if (
      definition.aggregateIndexes.some((index) => index.name === name) ||
      definition.rankIndexes.some((index) => index.name === name)
    ) {
      throw new Error(
        `Duplicate aggregate index '${name}' on '${this.tableName}'.`
      );
    }
    definition.aggregateIndexes.push({
      name,
      fields: config.fields,
      countFields: config.countFields,
      sumFields: config.sumFields,
      avgFields: config.avgFields,
      minFields: config.minFields,
      maxFields: config.maxFields,
    });
  }

  addRankIndex<IndexName extends string>(
    name: IndexName,
    config: {
      partitionFields: string[];
      orderFields: Array<{
        field: string;
        direction: 'asc' | 'desc';
      }>;
      sumField?: string;
    }
  ): void {
    const definition = getTableDefinition(this);
    if (
      definition.rankIndexes.some((index) => index.name === name) ||
      definition.aggregateIndexes.some((index) => index.name === name)
    ) {
      throw new Error(
        `Duplicate aggregate index '${name}' on '${this.tableName}'.`
      );
    }
    definition.rankIndexes.push({
      name,
      partitionFields: config.partitionFields,
      orderFields: config.orderFields,
      sumField: config.sumField,
    });
  }

  getAggregateIndexes(): AggregateIndexEntry[] {
    return [...getTableDefinition(this).aggregateIndexes];
  }

  getRankIndexes(): RankIndexEntry[] {
    return [...getTableDefinition(this).rankIndexes];
  }

  /**
   * Internal: expose unique index metadata for mutation enforcement
   */
  getUniqueIndexes(): UniqueIndexEntry[] {
    return getTableDefinition(this).uniqueIndexes;
  }

  /**
   * Internal: expose index metadata for runtime enforcement
   */
  getIndexes(): { name: string; fields: string[] }[] {
    return getTableDefinition(this).indexes.map((entry) => ({
      name: entry.indexDescriptor,
      fields: entry.fields,
    }));
  }

  /**
   * Internal: expose search index metadata for runtime query execution
   */
  getSearchIndexes(): {
    name: string;
    searchField: string;
    filterFields: string[];
  }[] {
    return getTableDefinition(this).searchIndexes.map((entry) => ({
      name: entry.indexDescriptor,
      searchField: entry.searchField,
      filterFields: entry.filterFields,
    }));
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
    return getTableDefinition(this).vectorIndexes.map((entry) => ({
      name: entry.indexDescriptor,
      vectorField: entry.vectorField,
      dimensions: entry.dimensions,
      filterFields: entry.filterFields,
    }));
  }

  /**
   * Internal: attach an RLS policy to this table
   */
  addRlsPolicy(policy: RlsPolicy): void {
    const { rlsPolicies } = getTableDefinition(this);
    if (!rlsPolicies.includes(policy)) {
      rlsPolicies.push(policy);
    }
    this[LazyTable].rlsEnabled = true;
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

    const tableDefinition = getTableDefinition(this);
    tableDefinition.foreignKeys = tableDefinition.foreignKeys.filter(
      (existing) => !matches(existing)
    );
    tableDefinition.foreignKeys.push(definition);
  }

  private resolveDeferredForeignKeys(): void {
    const tableDefinition = getTableDefinition(this);
    const deferredForeignKeys = tableDefinition.deferredForeignKeys;
    tableDefinition.deferredForeignKeys = [];

    for (const deferred of deferredForeignKeys) {
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
  }

  /**
   * Internal: expose foreign key metadata for mutation enforcement
   */
  getForeignKeys(): ForeignKeyDefinition[] {
    this.resolveDeferredForeignKeys();
    return getTableDefinition(this).foreignKeys;
  }

  addCheck(name: string, expression: FilterExpression<boolean>): void {
    getTableDefinition(this).checks.push({ name, expression });
  }

  getChecks(): { name: string; expression: FilterExpression<boolean> }[] {
    return getTableDefinition(this).checks;
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
    const definition = getTableDefinition(this);
    const entry = {
      indexDescriptor: name,
      searchField: config.searchField,
      filterFields: config.filterFields ?? [],
    };
    if (config.staged) {
      definition.stagedSearchIndexes.push(entry);
    } else {
      definition.searchIndexes.push(entry);
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
    const definition = getTableDefinition(this);
    const entry = {
      indexDescriptor: name,
      vectorField: config.vectorField,
      dimensions: config.dimensions,
      filterFields: config.filterFields ?? [],
    };
    if (config.staged) {
      definition.stagedVectorIndexes.push(entry);
    } else {
      definition.vectorIndexes.push(entry);
    }
  }

  /**
   * Export the contents of this definition for Convex schema tooling.
   * Mirrors convex/server TableDefinition.export().
   */
  export() {
    const definition = getTableDefinition(this);
    this.resolveDeferredForeignKeys();
    const documentType = (this.validator as unknown as { json: unknown }).json;
    if (typeof documentType !== 'object') {
      throw new Error(
        'Invalid validator: please make sure that the parameter of `defineTable` is valid (see https://docs.convex.dev/database/schemas)'
      );
    }

    return {
      indexes: definition.indexes,
      stagedDbIndexes: definition.stagedDbIndexes,
      searchIndexes: definition.searchIndexes,
      stagedSearchIndexes: definition.stagedSearchIndexes,
      vectorIndexes: definition.vectorIndexes,
      stagedVectorIndexes: definition.stagedVectorIndexes,
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
  AggregateIndexes extends Record<string, string> = {},
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
    readonly aggregateIndexes: AggregateIndexes;
    readonly inferSelect: import('./types').InferSelectModel<ConvexTable<T>>;
    readonly inferInsert: import('./types').InferInsertModel<ConvexTable<T>>;
  };
  readonly $inferInsert: import('./types').InferInsertModel<ConvexTable<T>>;

  /**
   * Inferred types for select and insert operations
   * Following Drizzle's pattern: $inferSelect and $inferInsert properties
   */
  readonly $inferSelect: import('./types').InferSelectModel<ConvexTable<T>>;
  tableName: T['name'];

  /**
   * Convex schema validator
   */
  validator: Validator<any, any, any>;

  /**
   * Symbol-based metadata storage
   */
  [TableName]: T['name'];
  [Columns]: T['columns'];
  [Brand]: 'ConvexTable';
  [RlsPolicies]: RlsPolicy[];
  [EnableRLS]: boolean;
  [TableDeleteConfig]?: OrmTableDeleteConfig;
  [TablePolymorphic]?: readonly TablePolymorphicConfigRuntime[];
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
  AggregateIndexes extends Record<string, string> = {},
> = ConvexTable<T, Indexes, SearchIndexes, VectorIndexes, AggregateIndexes> & {
  [Key in keyof T['columns']]: T['columns'][Key];
} & SystemFields<T['name']> &
  SystemFieldAliases<T['name'], T['columns']>;

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
 * import { convexTable, text, integer } from 'kitcn/orm';
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
  extraConfig?: (
    self: ColumnsWithSystemFields<ExpandTableColumns<TColumns>, TName>
  ) => TExtraConfig
) => ConvexTableWithColumns<
  {
    name: TName;
    columns: ColumnsWithTableName<ExpandTableColumns<TColumns>, TName>;
  },
  InferDbIndexesFromExtraConfig<TExtraConfig>,
  InferSearchIndexesFromExtraConfig<TExtraConfig>,
  InferVectorIndexesFromExtraConfig<TExtraConfig>,
  NormalizeAggregateIndexMap<
    InferredAggregateIndexesFromExtraConfig<TExtraConfig>
  >
>;

export interface ConvexTableFn extends ConvexTableFnInternal {
  withRLS: ConvexTableFnInternal;
}

const convexTableInternal: ConvexTableFnInternal = (
  name,
  columns,
  extraConfig
): ConvexTableWithColumns<
  {
    name: typeof name;
    columns: ColumnsWithTableName<
      ExpandTableColumns<typeof columns>,
      typeof name
    >;
  },
  any,
  any,
  any,
  any
> => {
  const expanded = resolveTableColumns(
    name,
    columns as Record<string, unknown>
  );

  const rawTable = new ConvexTableImpl(
    name,
    expanded.columns as any,
    expanded.polymorphicConfigs,
    extraConfig as TableExtraConfigFn | undefined
  );

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
