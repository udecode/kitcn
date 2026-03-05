import type {
  VectorFilterBuilder as ConvexVectorFilterBuilder,
  FilterExpression as ConvexVectorFilterExpression,
  GenericIndexFields,
  IndexRange,
  IndexRangeBuilder,
} from 'convex/server';
import type { GenericId, Value } from 'convex/values';
import type {
  Assume,
  KnownKeysOnly,
  ReturnTypeOrValue,
  Simplify,
} from '../internal/types';
import type {
  ColumnBuilder,
  ColumnBuilderBase,
} from './builders/column-builder';
import type {
  SystemFieldAliases,
  SystemFields,
} from './builders/system-fields';
import type { Column, FilterExpression } from './filter-expression';
import type {
  One,
  Relation,
  RelationsFilter,
  RelationsRecord,
  TableFilter,
  TableRelationalConfig,
  TablesRelationalConfig,
} from './relations';
import type { ConvexTable } from './table';
import type { UnsetToken } from './unset-token';

export type {
  TableRelationalConfig,
  TablesRelationalConfig,
} from './relations';

/**
 * Value or array helper (Drizzle pattern).
 */
export type ValueOrArray<T> = T | T[];

/**
 * Type equality check - returns true if X and Y are exactly the same type
 * Pattern from Drizzle: drizzle-orm/src/utils.ts:172
 */
export type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false;

/**
 * Merge two object types without using intersection
 * Intersection can cause TypeScript to lose phantom type brands
 * This manually combines keys from both types
 */
export type Merge<A, B> = {
  [K in keyof A | keyof B]: K extends keyof B
    ? B[K]
    : K extends keyof A
      ? A[K]
      : never;
};

export type IndexKey = (Value | undefined)[];

export type FindManyUnionSource<
  TTableConfig extends TableRelationalConfig = TableRelationalConfig,
> = {
  where?: RelationsFilter<TTableConfig, any> | WhereCallback<TTableConfig>;
};

type PipelineRelationName<TTableConfig extends TableRelationalConfig> = Extract<
  keyof TTableConfig['relations'],
  string
>;

export type FindManyPipelineFlatMapConfig<
  TTableConfig extends TableRelationalConfig = TableRelationalConfig,
  TRelationName extends
    PipelineRelationName<TTableConfig> = PipelineRelationName<TTableConfig>,
> = {
  relation: TRelationName;
  where?: unknown;
  orderBy?: unknown;
  limit?: number;
  includeParent?: boolean;
};

export type FindManyPipelineFlatMapStage<
  TTableConfig extends TableRelationalConfig = TableRelationalConfig,
> = {
  flatMap: FindManyPipelineFlatMapConfig<TTableConfig>;
};

export type FindManyPipelineFilterWithStage<TRow = unknown> = {
  filterWith: (row: TRow) => boolean | Promise<boolean>;
};

export type FindManyPipelineMapStage<TRow = unknown, TOutput = unknown> = {
  map: (row: TRow) => TOutput | null | Promise<TOutput | null>;
};

export type FindManyPipelineDistinctStage = {
  distinct: { fields: string[] };
};

export type FindManyPipelineStageForInput<
  TSchema extends TablesRelationalConfig = TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig = TableRelationalConfig,
  TRow = BuildQueryResult<TSchema, TTableConfig, true>,
> =
  | FindManyPipelineFilterWithStage<TRow>
  | FindManyPipelineMapStage<TRow>
  | FindManyPipelineDistinctStage
  | FindManyPipelineFlatMapStage<TTableConfig>;

export type FindManyPipelineStage<
  TSchema extends TablesRelationalConfig = TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig = TableRelationalConfig,
  TRow = BuildQueryResult<TSchema, TTableConfig, true>,
> = FindManyPipelineStageForInput<TSchema, TTableConfig, TRow>;

export type ValidatedFindManyPipelineStages<
  TSchema extends TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig,
  TCurrentRow,
  TStages extends readonly unknown[],
> = number extends TStages['length']
  ? readonly FindManyPipelineStageForInput<TSchema, TTableConfig, TCurrentRow>[]
  : TStages extends readonly []
    ? readonly []
    : TStages extends readonly [infer TStage, ...infer TRest]
      ? TStage extends FindManyPipelineStageForInput<
          TSchema,
          TTableConfig,
          TCurrentRow
        >
        ? readonly [
            TStage,
            ...ValidatedFindManyPipelineStages<
              TSchema,
              TTableConfig,
              ApplyPipelineStage<TCurrentRow, TStage, TSchema, TTableConfig>,
              Extract<TRest, readonly unknown[]>
            >,
          ]
        : never
      : never;

export type FindManyPipelineConfig<
  TSchema extends TablesRelationalConfig = TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig = TableRelationalConfig,
  TStages extends readonly unknown[] = readonly FindManyPipelineStageForInput<
    TSchema,
    TTableConfig,
    BuildQueryResult<TSchema, TTableConfig, true>
  >[],
> = {
  union?: FindManyUnionSource<TTableConfig>[];
  interleaveBy?: string[];
  stages?: TStages;
};

export type FindManyPageByKeyConfig = {
  index?: string;
  order?: 'asc' | 'desc';
  startKey?: IndexKey;
  startInclusive?: boolean;
  endKey?: IndexKey;
  endInclusive?: boolean;
  targetMaxRows?: number;
  absoluteMaxRows?: number;
};

export type KeyPageResult<T> = {
  page: T[];
  indexKeys: IndexKey[];
  hasMore: boolean;
};

/**
 * Extract full document type from a ConvexTable (includes system fields)
 * Uses GetColumnData in 'query' mode to respect notNull brands
 *
 * @example
 * const users = convexTable('users', { name: text().notNull() });
 * type User = InferSelectModel<typeof users>;
 * // → { id: string, createdAt: number, name: string }
 *
 * const posts = convexTable('posts', { title: text() }); // nullable
 * type Post = InferSelectModel<typeof posts>;
 * // → { id: string, createdAt: number, title: string | null }
 */
export type InferSelectModel<TTable extends ConvexTable<any>> = Simplify<
  Merge<
    {
      id: string;
      createdAt: number;
    },
    {
      [K in keyof TTable['_']['columns']]: GetColumnData<
        TTable['_']['columns'][K],
        'query'
      >;
    }
  >
>;

export type RequiredKeyOnly<
  TKey extends string,
  TColumn extends ColumnBuilderBase,
> = TColumn['_']['notNull'] extends true
  ? TColumn['_']['hasDefault'] extends true
    ? never
    : TKey
  : never;

export type OptionalKeyOnly<
  TKey extends string,
  TColumn extends ColumnBuilderBase,
> = TColumn['_']['notNull'] extends true
  ? TColumn['_']['hasDefault'] extends true
    ? TKey
    : never
  : TKey;

type InferInsertModelFromColumns<
  TColumns extends Record<string, ColumnBuilderBase>,
  TExcludeKeys extends string = never,
> = Simplify<
  {
    [K in keyof TColumns & string as K extends TExcludeKeys
      ? never
      : RequiredKeyOnly<K, TColumns[K]>]: GetColumnData<TColumns[K], 'query'>;
  } & {
    [K in keyof TColumns & string as K extends TExcludeKeys
      ? never
      : OptionalKeyOnly<K, TColumns[K]>]?:
      | GetColumnData<TColumns[K], 'query'>
      | undefined;
  }
>;

type TablePolymorphicInsertMetadata<TTable extends ConvexTable<any>> = {
  [K in keyof TTable['_']['columns'] &
    string]: TTable['_']['columns'][K] extends {
    __polymorphic: infer TMeta;
  }
    ? TMeta extends {
        variants: infer TVariants extends Record<
          string,
          Record<string, ColumnBuilderBase>
        >;
      }
      ? {
          discriminator: K;
          variants: TVariants;
        }
      : never
    : never;
}[keyof TTable['_']['columns'] & string];

type PolymorphicVariantFieldNames<
  TVariants extends Record<string, Record<string, ColumnBuilderBase>>,
> = Extract<
  TVariants[keyof TVariants & string] extends infer TVariantColumns
    ? TVariantColumns extends Record<string, ColumnBuilderBase>
      ? keyof TVariantColumns
      : never
    : never,
  string
>;

type PolymorphicVariantInsertCase<
  TBase extends Record<string, unknown>,
  TDiscriminator extends string,
  TCase extends string,
  TVariantColumns extends Record<string, ColumnBuilderBase>,
  TAllGeneratedFields extends string,
> = Simplify<
  TBase & {
    [K in TDiscriminator]: TCase;
  } & {
    [K in keyof TVariantColumns & string as RequiredKeyOnly<
      K,
      TVariantColumns[K]
    >]: GetColumnData<TVariantColumns[K], 'query'>;
  } & {
    [K in keyof TVariantColumns & string as OptionalKeyOnly<
      K,
      TVariantColumns[K]
    >]?: GetColumnData<TVariantColumns[K], 'query'> | undefined;
  } & {
    [K in Exclude<TAllGeneratedFields, keyof TVariantColumns & string>]?: never;
  }
>;

type PolymorphicVariantInsertUnion<
  TBase extends Record<string, unknown>,
  TMetadata extends {
    discriminator: string;
    variants: Record<string, Record<string, ColumnBuilderBase>>;
  },
> = {
  [TCase in keyof TMetadata['variants'] & string]: PolymorphicVariantInsertCase<
    TBase,
    TMetadata['discriminator'],
    TCase,
    TMetadata['variants'][TCase],
    PolymorphicVariantFieldNames<TMetadata['variants']>
  >;
}[keyof TMetadata['variants'] & string];

type InferPolymorphicInsertModel<
  TTable extends ConvexTable<any>,
  TMetadata extends {
    discriminator: string;
    variants: Record<string, Record<string, ColumnBuilderBase>>;
  },
> = PolymorphicVariantInsertUnion<
  InferInsertModelFromColumns<
    TTable['_']['columns'],
    | TMetadata['discriminator']
    | PolymorphicVariantFieldNames<TMetadata['variants']>
  >,
  TMetadata
>;

/**
 * Extract insert type from a ConvexTable (excludes system fields).
 * Mirrors Drizzle behavior: required if notNull && no default, otherwise optional.
 *
 * @example
 * const users = convexTable('users', { name: text().notNull() });
 * type NewUser = InferInsertModel<typeof users>;
 * // → { name: string }
 */
export type InferInsertModel<TTable extends ConvexTable<any>> = Simplify<
  [TablePolymorphicInsertMetadata<TTable>] extends [never]
    ? InferInsertModelFromColumns<TTable['_']['columns']>
    : InferPolymorphicInsertModel<
        TTable,
        Extract<TablePolymorphicInsertMetadata<TTable>, object>
      >
>;

/**
 * Extract column data type with mode-based handling (Drizzle pattern)
 *
 * Following Drizzle's GetColumnData pattern for consistent type extraction:
 * - 'raw' mode: Returns base data type without null (for inserts, operator comparisons)
 * - 'query' mode: Respects notNull brand, adds | null for nullable fields (for selects)
 *
 * @template TColumn - Column builder type
 * @template TInferMode - 'query' (default, adds | null) or 'raw' (base type only)
 *
 * @example
 * const name = text().notNull();
 * type NameQuery = GetColumnData<typeof name, 'query'>; // string
 * type NameRaw = GetColumnData<typeof name, 'raw'>; // string
 *
 * const age = integer(); // nullable
 * type AgeQuery = GetColumnData<typeof age, 'query'>; // number | null
 * type AgeRaw = GetColumnData<typeof age, 'raw'>; // number
 */
export type GetColumnData<
  TColumn extends ColumnBuilderBase,
  TInferMode extends 'query' | 'raw' = 'query',
> = TInferMode extends 'raw'
  ? ColumnDataWithOverride<TColumn>
  : TColumn['_']['notNull'] extends true
    ? ColumnDataWithOverride<TColumn> // Query mode, notNull: no null union
    : ColumnDataWithOverride<TColumn> | null; // Query mode, nullable: add null

type ColumnDataWithOverride<TColumn extends ColumnBuilderBase> =
  TColumn['_'] extends { $type: infer TType }
    ? unknown extends TType
      ? TColumn['_']['data']
      : TType
    : TColumn['_']['data'];

type AggregateIndexMap<
  TTableConfig extends TableRelationalConfig = TableRelationalConfig,
> =
  TTableConfig['table'] extends ConvexTable<
    any,
    any,
    any,
    any,
    infer TAggregateIndexes extends Record<string, string>
  >
    ? TAggregateIndexes
    : Record<string, string>;

type AggregateIndexedFieldName<
  TTableConfig extends TableRelationalConfig = TableRelationalConfig,
> = Extract<
  {
    [K in keyof AggregateIndexMap<TTableConfig>]: AggregateIndexMap<TTableConfig>[K];
  }[keyof AggregateIndexMap<TTableConfig>],
  string
>;

type AggregateScalarFieldName<TTableConfig extends TableRelationalConfig> =
  Extract<keyof TTableConfig['table']['_']['columns'], string>;

type AggregateWhereFieldName<
  TTableConfig extends TableRelationalConfig = TableRelationalConfig,
> = AggregateIndexedFieldName<TTableConfig>;

type AggregateWhereFieldValue<
  TTableConfig extends TableRelationalConfig,
  TFieldName extends string,
> = TFieldName extends keyof TTableConfig['table']['_']['columns']
  ? TTableConfig['table']['_']['columns'][TFieldName] extends ColumnBuilderBase
    ? GetColumnData<TTableConfig['table']['_']['columns'][TFieldName], 'query'>
    : unknown
  : unknown;

type AggregateWhereFieldFilter<TValue> =
  | TValue
  | {
      eq?: TValue | undefined;
      in?: readonly TValue[] | undefined;
      isNull?: true | undefined;
      gt?: TValue | undefined;
      gte?: TValue | undefined;
      lt?: TValue | undefined;
      lte?: TValue | undefined;
    };

type AggregateNoScanWhereBase<
  TTableConfig extends TableRelationalConfig = TableRelationalConfig,
> = {
  [K in AggregateWhereFieldName<TTableConfig>]?: AggregateWhereFieldFilter<
    AggregateWhereFieldValue<TTableConfig, K>
  >;
};

export type AggregateNoScanWhere<
  TTableConfig extends TableRelationalConfig = TableRelationalConfig,
> = Simplify<
  AggregateNoScanWhereBase<TTableConfig> & {
    AND?: AggregateNoScanWhereBase<TTableConfig>[] | undefined;
    OR?: AggregateNoScanWhereBase<TTableConfig>[] | undefined;
  }
>;

type AggregateNoScanWhereArg<
  TTableConfig extends TableRelationalConfig = TableRelationalConfig,
> = [AggregateWhereFieldName<TTableConfig>] extends [never]
  ? never
  : AggregateNoScanWhere<TTableConfig>;

// ============================================================================
// M3 Query Builder Types
// ============================================================================

/**
 * Query configuration for findMany/findFirst
 *
 * @template TRelationType - 'one' or 'many' determines available options
 * @template TSchema - Full schema configuration
 * @template TTableConfig - Configuration for the queried table
 */
export type DBQueryConfig<
  TRelationType extends 'one' | 'many' = 'one' | 'many',
  _TIsRoot extends boolean = boolean,
  TSchema extends TablesRelationalConfig = TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig = TableRelationalConfig,
> = {
  /**
   * Column selection - pick specific columns to return
   * If omitted, all columns are selected
   */
  columns?:
    | {
        [K in keyof TableColumns<TTableConfig>]?: boolean;
      }
    | undefined;
  /**
   * Relation loading - specify which relations to include
   * Can be `true` for default config or nested config object
   */
  with?:
    | KnownKeysOnly<
        {
          [K in keyof TTableConfig['relations']]?:
            | true
            | DBQueryConfig<
                TTableConfig['relations'][K] extends One<any, any>
                  ? 'one'
                  : 'many',
                false,
                TSchema,
                FindTableByDBName<
                  TSchema,
                  TTableConfig['relations'][K]['targetTableName']
                >
              >
            | undefined;
        } & {
          _count?:
            | {
                [K in keyof TTableConfig['relations']]?:
                  | true
                  | {
                      where?:
                        | AggregateNoScanWhereArg<
                            FindTableByDBName<
                              TSchema,
                              Extract<
                                TTableConfig['relations'][K]['targetTableName'],
                                string
                              >
                            >
                          >
                        | undefined;
                    };
              }
            | undefined;
        },
        TTableConfig['relations'] & { _count?: unknown }
      >
    | undefined;
  /**
   * Auto-include one() relations for discriminator-backed tables.
   */
  withVariants?: true | undefined;
  /**
   * Extra computed fields (post-fetch, computed in JS at runtime)
   */
  extras?:
    | Record<
        string,
        | Value
        | ((row: InferModelFromColumns<TableColumns<TTableConfig>>) => Value)
      >
    | ((
        fields: Simplify<
          [TableColumns<TTableConfig>] extends [never]
            ? {}
            : TableColumns<TTableConfig>
        >
      ) => Record<
        string,
        | Value
        | ((row: InferModelFromColumns<TableColumns<TTableConfig>>) => Value)
      >)
    | undefined;
  /**
   * Order results - callback or object syntax
   */
  orderBy?: DBQueryConfigOrderBy<TTableConfig> | undefined;
  /** Skip first N results */
  offset?: number | undefined;
  /**
   * Cursor pagination (Convex native). When `cursor` is provided, `limit` is
   * required and the result type changes to a paginated shape.
   *
   * - First page: cursor: null
   * - Next page: cursor: previous.continueCursor
   */
  cursor?: _TIsRoot extends true ? string | null : never;
  /**
   * Pin the end boundary to a previously returned cursor.
   * Only valid with cursor pagination.
   */
  endCursor?: _TIsRoot extends true ? string | null : never;
  /**
   * Maximum documents to scan during predicate `where(fn)` pagination.
   * Only valid when `cursor` is provided.
   */
  maxScan?: _TIsRoot extends true ? number : never;
  /**
   * Full-text search query configuration.
   * Only available on tables that declare search indexes.
   */
  search?: SearchQueryConfig<TTableConfig> | undefined;
  /**
   * Vector search query configuration.
   * Only available on tables that declare vector indexes.
   */
  vectorSearch?: VectorQueryConfig<TTableConfig> | undefined;
  /**
   * Stream-backed advanced query pipeline.
   */
  pipeline?: _TIsRoot extends true
    ? FindManyPipelineConfig<TSchema, TTableConfig>
    : never;
  /**
   * Key-based page boundaries.
   */
  pageByKey?: _TIsRoot extends true ? FindManyPageByKeyConfig : never;
} & (TRelationType extends 'many'
  ? {
      /** Limit number of results */
      limit?: number | undefined;
    }
  : {}) & {
    /**
     * Relation-aware filter object (v1) or callback expression.
     */
    where?:
      | RelationsFilter<TTableConfig, TSchema>
      | WhereCallback<TTableConfig>
      | undefined;
    /**
     * Allow full scans when no index can be used.
     */
    allowFullScan?: boolean | undefined;
  };

export type CountConfig<
  _TSchema extends TablesRelationalConfig = TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig = TableRelationalConfig,
> = {
  where?: AggregateNoScanWhereArg<TTableConfig> | undefined;
  orderBy?: DBQueryConfigOrderBy<TTableConfig> | undefined;
  skip?: number | undefined;
  take?: number | undefined;
  cursor?:
    | {
        [K in Extract<keyof TTableConfig['table']['_']['columns'], string>]?:
          | GetColumnData<TableColumns<TTableConfig>[K], 'query'>
          | undefined;
      }
    | undefined;
  select?:
    | ({
        _all?: true | undefined;
      } & {
        [K in Extract<keyof TTableConfig['table']['_']['columns'], string>]?:
          | true
          | undefined;
      })
    | undefined;
};

type AggregateNumericFieldName<TTableConfig extends TableRelationalConfig> = {
  [K in AggregateScalarFieldName<TTableConfig>]: NonNullable<
    GetColumnData<TableColumns<TTableConfig>[K], 'query'>
  > extends number
    ? K
    : never;
}[AggregateScalarFieldName<TTableConfig>];

export type AggregateFieldValue<
  TTableConfig extends TableRelationalConfig,
  TField extends AggregateScalarFieldName<TTableConfig>,
> = GetColumnData<TableColumns<TTableConfig>[TField], 'query'>;

export type AggregateConfig<
  _TSchema extends TablesRelationalConfig = TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig = TableRelationalConfig,
> = {
  where?: AggregateNoScanWhereArg<TTableConfig> | undefined;
  orderBy?: DBQueryConfigOrderBy<TTableConfig> | undefined;
  skip?: number | undefined;
  take?: number | undefined;
  cursor?:
    | {
        [K in Extract<keyof TTableConfig['table']['_']['columns'], string>]?:
          | GetColumnData<TableColumns<TTableConfig>[K], 'query'>
          | undefined;
      }
    | undefined;
  _count?:
    | true
    | ({
        _all?: true | undefined;
      } & {
        [K in AggregateScalarFieldName<TTableConfig>]?: true | undefined;
      })
    | undefined;
  _sum?:
    | {
        [K in AggregateNumericFieldName<TTableConfig>]?: true | undefined;
      }
    | undefined;
  _avg?:
    | {
        [K in AggregateNumericFieldName<TTableConfig>]?: true | undefined;
      }
    | undefined;
  _min?:
    | {
        [K in AggregateScalarFieldName<TTableConfig>]?: true | undefined;
      }
    | undefined;
  _max?:
    | {
        [K in AggregateScalarFieldName<TTableConfig>]?: true | undefined;
      }
    | undefined;
};

export type GroupByByInput<
  TTableConfig extends TableRelationalConfig = TableRelationalConfig,
> =
  | AggregateWhereFieldName<TTableConfig>
  | readonly AggregateWhereFieldName<TTableConfig>[];

type GroupBySelectedFields<TBy> = TBy extends readonly (infer TField)[]
  ? Extract<TField, string>
  : Extract<TBy, string>;

type GroupByByResult<
  TTableConfig extends TableRelationalConfig,
  TBy,
> = Simplify<{
  [K in GroupBySelectedFields<TBy> &
    AggregateScalarFieldName<TTableConfig>]: AggregateFieldValue<
    TTableConfig,
    K
  >;
}>;

type GroupByOrderDirection = 'asc' | 'desc';

type GroupByByOrderBy<TBy> = Partial<
  Record<GroupBySelectedFields<TBy>, GroupByOrderDirection>
>;

type GroupByMetricOrderBy<TTableConfig extends TableRelationalConfig> = {
  _count?:
    | GroupByOrderDirection
    | ({
        _all?: GroupByOrderDirection | undefined;
      } & {
        [K in AggregateScalarFieldName<TTableConfig>]?:
          | GroupByOrderDirection
          | undefined;
      })
    | undefined;
  _sum?:
    | {
        [K in AggregateNumericFieldName<TTableConfig>]?:
          | GroupByOrderDirection
          | undefined;
      }
    | undefined;
  _avg?:
    | {
        [K in AggregateNumericFieldName<TTableConfig>]?:
          | GroupByOrderDirection
          | undefined;
      }
    | undefined;
  _min?:
    | {
        [K in AggregateScalarFieldName<TTableConfig>]?:
          | GroupByOrderDirection
          | undefined;
      }
    | undefined;
  _max?:
    | {
        [K in AggregateScalarFieldName<TTableConfig>]?:
          | GroupByOrderDirection
          | undefined;
      }
    | undefined;
};

type GroupByOrderBy<
  TTableConfig extends TableRelationalConfig,
  TBy,
> = ValueOrArray<GroupByByOrderBy<TBy> | GroupByMetricOrderBy<TTableConfig>>;

type GroupByHavingValue<TValue> =
  | TValue
  | {
      eq?: TValue | undefined;
      in?: readonly TValue[] | undefined;
      isNull?: true | undefined;
      gt?: TValue | undefined;
      gte?: TValue | undefined;
      lt?: TValue | undefined;
      lte?: TValue | undefined;
    };

type GroupByHaving<TTableConfig extends TableRelationalConfig, TBy> = Simplify<
  {
    [K in GroupBySelectedFields<TBy>]?: GroupByHavingValue<
      AggregateFieldValue<
        TTableConfig,
        Extract<K, AggregateScalarFieldName<TTableConfig>>
      >
    >;
  } & {
    _count?:
      | GroupByHavingValue<number>
      | ({
          _all?: GroupByHavingValue<number> | undefined;
        } & {
          [K in AggregateScalarFieldName<TTableConfig>]?:
            | GroupByHavingValue<number>
            | undefined;
        })
      | undefined;
    _sum?:
      | {
          [K in AggregateNumericFieldName<TTableConfig>]?:
            | GroupByHavingValue<number | null>
            | undefined;
        }
      | undefined;
    _avg?:
      | {
          [K in AggregateNumericFieldName<TTableConfig>]?:
            | GroupByHavingValue<number | null>
            | undefined;
        }
      | undefined;
    _min?:
      | {
          [K in AggregateScalarFieldName<TTableConfig>]?:
            | GroupByHavingValue<AggregateFieldValue<TTableConfig, K> | null>
            | undefined;
        }
      | undefined;
    _max?:
      | {
          [K in AggregateScalarFieldName<TTableConfig>]?:
            | GroupByHavingValue<AggregateFieldValue<TTableConfig, K> | null>
            | undefined;
        }
      | undefined;
    AND?: GroupByHaving<TTableConfig, TBy>[] | undefined;
  }
>;

export type GroupByConfig<
  _TSchema extends TablesRelationalConfig = TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig = TableRelationalConfig,
> = {
  by: GroupByByInput<TTableConfig>;
  where?: AggregateNoScanWhereArg<TTableConfig> | undefined;
  orderBy?:
    | GroupByOrderBy<TTableConfig, GroupByByInput<TTableConfig>>
    | undefined;
  skip?: number | undefined;
  take?: number | undefined;
  cursor?: Record<string, unknown> | undefined;
  having?:
    | GroupByHaving<TTableConfig, GroupByByInput<TTableConfig>>
    | undefined;
  _count?:
    | true
    | ({
        _all?: true | undefined;
      } & {
        [K in AggregateScalarFieldName<TTableConfig>]?: true | undefined;
      })
    | undefined;
  _sum?:
    | {
        [K in AggregateNumericFieldName<TTableConfig>]?: true | undefined;
      }
    | undefined;
  _avg?:
    | {
        [K in AggregateNumericFieldName<TTableConfig>]?: true | undefined;
      }
    | undefined;
  _min?:
    | {
        [K in AggregateScalarFieldName<TTableConfig>]?: true | undefined;
      }
    | undefined;
  _max?:
    | {
        [K in AggregateScalarFieldName<TTableConfig>]?: true | undefined;
      }
    | undefined;
};

type SelectedTrueKeys<TSelection> = Extract<
  {
    [K in keyof TSelection]-?: TSelection[K] extends true ? K : never;
  }[keyof TSelection],
  string
>;

type CountSelectResult<
  TTableConfig extends TableRelationalConfig,
  TSelect extends Record<string, unknown>,
> = Simplify<
  (TSelect extends { _all: true } ? { _all: number } : {}) & {
    [K in SelectedTrueKeys<TSelect> &
      AggregateScalarFieldName<TTableConfig>]: number;
  }
>;

type AggregateCountResult<
  TTableConfig extends TableRelationalConfig,
  TCount,
> = TCount extends true
  ? number
  : TCount extends Record<string, unknown>
    ? CountSelectResult<TTableConfig, TCount>
    : never;

type AggregateNumericNullableResult<TSelect> = Simplify<{
  [K in SelectedTrueKeys<NonNullable<TSelect>>]: number | null;
}>;

type AggregateComparableResult<
  TTableConfig extends TableRelationalConfig,
  TSelect,
> = Simplify<{
  [K in SelectedTrueKeys<NonNullable<TSelect>> &
    AggregateScalarFieldName<TTableConfig>]: AggregateFieldValue<
    TTableConfig,
    K
  > | null;
}>;

export type CountResult<
  TTableConfig extends TableRelationalConfig,
  TConfig extends CountConfig<any, TTableConfig> | undefined,
> = TConfig extends {
  select: infer TSelect extends Record<string, unknown>;
}
  ? CountSelectResult<TTableConfig, TSelect>
  : number;

export type AggregateResult<
  TTableConfig extends TableRelationalConfig,
  TConfig extends AggregateConfig<any, TTableConfig>,
> = Simplify<
  (TConfig extends { _count: infer TCount }
    ? {
        _count: AggregateCountResult<TTableConfig, TCount>;
      }
    : {}) &
    (TConfig extends { _sum: infer TSum extends Record<string, unknown> }
      ? {
          _sum: AggregateNumericNullableResult<TSum>;
        }
      : {}) &
    (TConfig extends { _avg: infer TAvg extends Record<string, unknown> }
      ? {
          _avg: AggregateNumericNullableResult<TAvg>;
        }
      : {}) &
    (TConfig extends { _min: infer TMin extends Record<string, unknown> }
      ? {
          _min: AggregateComparableResult<TTableConfig, TMin>;
        }
      : {}) &
    (TConfig extends { _max: infer TMax extends Record<string, unknown> }
      ? {
          _max: AggregateComparableResult<TTableConfig, TMax>;
        }
      : {})
>;

type GroupByRowResult<
  TTableConfig extends TableRelationalConfig,
  TConfig extends GroupByConfig<any, TTableConfig>,
> = Simplify<
  GroupByByResult<TTableConfig, TConfig['by']> &
    (TConfig extends { _count: infer TCount }
      ? {
          _count: AggregateCountResult<TTableConfig, TCount>;
        }
      : {}) &
    (TConfig extends { _sum: infer TSum extends Record<string, unknown> }
      ? {
          _sum: AggregateNumericNullableResult<TSum>;
        }
      : {}) &
    (TConfig extends { _avg: infer TAvg extends Record<string, unknown> }
      ? {
          _avg: AggregateNumericNullableResult<TAvg>;
        }
      : {}) &
    (TConfig extends { _min: infer TMin extends Record<string, unknown> }
      ? {
          _min: AggregateComparableResult<TTableConfig, TMin>;
        }
      : {}) &
    (TConfig extends { _max: infer TMax extends Record<string, unknown> }
      ? {
          _max: AggregateComparableResult<TTableConfig, TMax>;
        }
      : {})
>;

export type GroupByResult<
  TTableConfig extends TableRelationalConfig,
  TConfig extends GroupByConfig<any, TTableConfig>,
> = GroupByRowResult<TTableConfig, TConfig>[];

export type PredicateWhereClause<TTableConfig extends TableRelationalConfig> = {
  readonly __kind: 'predicate';
  readonly predicate: (
    row: InferModelFromColumns<TableColumns<TTableConfig>>
  ) => boolean | Promise<boolean>;
};

export type WhereCallback<TTableConfig extends TableRelationalConfig> = (
  table: TTableConfig['table'],
  operators: FilterOperators<TTableConfig>
) => FilterExpression<boolean> | PredicateWhereClause<TTableConfig> | undefined;

type PredicateWhereIndexMap<TTableConfig extends TableRelationalConfig> =
  TTableConfig['table'] extends ConvexTable<any, infer TIndexes, any, any>
    ? TIndexes
    : Record<string, GenericIndexFields>;

type PredicateWhereIndexName<TTableConfig extends TableRelationalConfig> =
  Extract<keyof PredicateWhereIndexMap<TTableConfig>, string>;

type PredicateWhereNamedIndex<
  TTableConfig extends TableRelationalConfig,
  TIndexName extends string,
> =
  TIndexName extends PredicateWhereIndexName<TTableConfig>
    ? PredicateWhereIndexMap<TTableConfig>[TIndexName] extends GenericIndexFields
      ? PredicateWhereIndexMap<TTableConfig>[TIndexName]
      : GenericIndexFields
    : GenericIndexFields;

export type PredicateWhereIndexConfig<
  TTableConfig extends TableRelationalConfig = TableRelationalConfig,
> = [PredicateWhereIndexName<TTableConfig>] extends [never]
  ? {
      name: string;
      range?: (
        q: IndexRangeBuilder<
          InferModelFromColumns<TableColumns<TTableConfig>>,
          GenericIndexFields
        >
      ) => IndexRange;
    }
  : {
      [TIndexName in PredicateWhereIndexName<TTableConfig>]: {
        name: TIndexName;
        range?: (
          q: IndexRangeBuilder<
            InferModelFromColumns<TableColumns<TTableConfig>>,
            PredicateWhereNamedIndex<TTableConfig, TIndexName>
          >
        ) => IndexRange;
      };
    }[PredicateWhereIndexName<TTableConfig>];

type SearchIndexMap<TTableConfig extends TableRelationalConfig> =
  TTableConfig['table'] extends ConvexTable<any, any, infer TSearchIndexes, any>
    ? TSearchIndexes
    : Record<string, { searchField: string; filterFields: string }>;

type SearchIndexName<TTableConfig extends TableRelationalConfig> = Extract<
  keyof SearchIndexMap<TTableConfig>,
  string
>;

type SearchIndexConfigByName<
  TTableConfig extends TableRelationalConfig,
  TIndexName extends SearchIndexName<TTableConfig>,
> = SearchIndexMap<TTableConfig>[TIndexName];

type SearchFilterFieldNames<
  TTableConfig extends TableRelationalConfig,
  TIndexName extends SearchIndexName<TTableConfig>,
> =
  SearchIndexConfigByName<TTableConfig, TIndexName> extends {
    filterFields: infer TFilterFields extends string;
  }
    ? TFilterFields
    : never;

type SearchFilterValueForField<
  TTableConfig extends TableRelationalConfig,
  TFieldName extends string,
> = TFieldName extends keyof TableColumns<TTableConfig>
  ? TableColumns<TTableConfig>[TFieldName] extends ColumnBuilder<any, any, any>
    ? GetColumnData<TableColumns<TTableConfig>[TFieldName], 'raw'>
    : never
  : never;

type SearchFiltersForIndex<
  TTableConfig extends TableRelationalConfig,
  TIndexName extends SearchIndexName<TTableConfig>,
> = Partial<{
  [K in SearchFilterFieldNames<
    TTableConfig,
    TIndexName
  >]: SearchFilterValueForField<TTableConfig, K>;
}>;

export type SearchQueryConfig<
  TTableConfig extends TableRelationalConfig = TableRelationalConfig,
> = [SearchIndexName<TTableConfig>] extends [never]
  ? never
  : {
      [TIndexName in SearchIndexName<TTableConfig>]: {
        index: TIndexName;
        query: string;
        filters?: SearchFiltersForIndex<TTableConfig, TIndexName> | undefined;
      };
    }[SearchIndexName<TTableConfig>];

export type SearchWhereFilter<TTableConfig extends TableRelationalConfig> =
  TableFilter<TTableConfig['table']>;

type VectorIndexMap<TTableConfig extends TableRelationalConfig> =
  TTableConfig['table'] extends ConvexTable<any, any, any, infer TVectorIndexes>
    ? TVectorIndexes
    : Record<
        string,
        { vectorField: string; dimensions: number; filterFields: string }
      >;

type VectorIndexName<TTableConfig extends TableRelationalConfig> = Extract<
  keyof VectorIndexMap<TTableConfig>,
  string
>;

type VectorIndexConfigByName<
  TTableConfig extends TableRelationalConfig,
  TIndexName extends VectorIndexName<TTableConfig>,
> = VectorIndexMap<TTableConfig>[TIndexName];

type VectorFilterFieldNames<
  TTableConfig extends TableRelationalConfig,
  TIndexName extends VectorIndexName<TTableConfig>,
> =
  VectorIndexConfigByName<TTableConfig, TIndexName> extends {
    filterFields: infer TFilterFields extends string;
  }
    ? TFilterFields
    : never;

type VectorFilterForIndex<
  TTableConfig extends TableRelationalConfig,
  TIndexName extends VectorIndexName<TTableConfig>,
> = (
  q: ConvexVectorFilterBuilder<
    InferModelFromColumns<TableColumns<TTableConfig>>,
    VectorIndexConfigByName<TTableConfig, TIndexName>
  >
) => ConvexVectorFilterExpression<boolean>;

export type VectorQueryConfig<
  TTableConfig extends TableRelationalConfig = TableRelationalConfig,
> = [VectorIndexName<TTableConfig>] extends [never]
  ? never
  : {
      [TIndexName in VectorIndexName<TTableConfig>]: {
        index: TIndexName;
        vector: number[];
        limit: number;
        includeScore?: boolean | undefined;
        filter?:
          | (VectorFilterFieldNames<TTableConfig, TIndexName> extends never
              ? never
              : VectorFilterForIndex<TTableConfig, TIndexName>)
          | undefined;
      };
    }[VectorIndexName<TTableConfig>];

export type VectorSearchProvider = (
  tableName: string,
  indexName: string,
  query: {
    vector: number[];
    limit: number;
    filter?: ((q: any) => unknown) | undefined;
  }
) => Promise<Array<{ _id: GenericId<string> | string; _score: number }>>;

type FullScanOperatorKey =
  | 'arrayContains'
  | 'arrayContained'
  | 'arrayOverlaps'
  | 'ilike'
  | 'notLike'
  | 'notIlike'
  | 'endsWith'
  | 'contains'
  | 'RAW';

type HasFullScanOperatorKey<T> =
  Extract<keyof T, FullScanOperatorKey> extends never ? false : true;

type DepthPrev = [0, 0, 1, 2, 3, 4, 5, 6, 7, 8];

type HasStaticFullScanWhere<TWhere, TDepth extends number = 6> = [
  TDepth,
] extends [0]
  ? false
  : TWhere extends (...args: any[]) => any
    ? false
    : TWhere extends string | number | boolean | bigint | null | undefined
      ? false
      : TWhere extends readonly (infer TItem)[]
        ? HasStaticFullScanWhere<TItem, DepthPrev[TDepth]>
        : TWhere extends object
          ? HasFullScanOperatorKey<TWhere> extends true
            ? true
            : 'NOT' extends keyof TWhere
              ? true
              : true extends {
                    [K in keyof TWhere]-?: HasStaticFullScanWhere<
                      TWhere[K],
                      DepthPrev[TDepth]
                    >;
                  }[keyof TWhere]
                ? true
                : false
          : false;

export type EnforceAllowFullScan<
  TConfig,
  _TTableConfig extends TableRelationalConfig,
> = TConfig extends { cursor: string | null }
  ? TConfig
  : 'search' extends keyof TConfig
    ? TConfig extends { search: infer TSearch }
      ? [TSearch] extends [undefined]
        ? TConfig extends { where: infer TWhere }
          ? HasStaticFullScanWhere<TWhere> extends true
            ? TConfig & { allowFullScan: true }
            : TConfig
          : TConfig
        : TConfig
      : TConfig
    : TConfig extends { where: infer TWhere }
      ? HasStaticFullScanWhere<TWhere> extends true
        ? TConfig & { allowFullScan: true }
        : TConfig
      : TConfig;

type ReturnsPredicateClause<TWhere> = TWhere extends (
  ...args: any[]
) => infer TResult
  ? Extract<NonNullable<TResult>, PredicateWhereClause<any>> extends never
    ? false
    : true
  : false;

export type EnforceWithIndexForPredicateWhere<
  TConfig,
  THasIndex extends boolean,
> = THasIndex extends true
  ? TConfig
  : TConfig extends { where: infer TWhere }
    ? ReturnsPredicateClause<TWhere> extends true
      ? never
      : TConfig
    : TConfig;

export type EnforceWithIndexForWhere<
  TConfig,
  _TTableConfig extends TableRelationalConfig,
  THasIndex extends boolean,
> = THasIndex extends true
  ? TConfig
  : TConfig extends { where: infer TWhere }
    ? ReturnsPredicateClause<TWhere> extends true
      ? never
      : HasStaticFullScanWhere<TWhere> extends true
        ? never
        : TConfig
    : TConfig;

export type EnforceNoAllowFullScanWhenIndexed<
  TConfig,
  THasIndex extends boolean,
> = THasIndex extends true
  ? Omit<TConfig, 'allowFullScan'> & { allowFullScan?: never }
  : TConfig;

export type EnforceCursorMaxScan<TConfig> = TConfig extends {
  cursor: string | null;
}
  ? TConfig extends { where: infer TWhere }
    ? HasStaticFullScanWhere<TWhere> extends true
      ? Omit<TConfig, 'allowFullScan'> & {
          maxScan: number;
          allowFullScan?: never;
        }
      : TConfig
    : TConfig
  : TConfig;

export type EnforceSearchConstraints<
  TConfig,
  TTableConfig extends TableRelationalConfig,
> = 'search' extends keyof TConfig
  ? TConfig extends { search: infer TSearch }
    ? [TSearch] extends [undefined]
      ? TConfig
      : Omit<TConfig, 'where' | 'orderBy' | 'vectorSearch'> & {
          search: TSearch;
          where?: SearchWhereFilter<TTableConfig> | undefined;
          orderBy?: never;
          vectorSearch?: never;
        }
    : TConfig
  : TConfig;

export type EnforceVectorSearchConstraints<
  TConfig,
  _TTableConfig extends TableRelationalConfig,
> = 'vectorSearch' extends keyof TConfig
  ? TConfig extends { vectorSearch: infer TVectorSearch }
    ? [TVectorSearch] extends [undefined]
      ? TConfig
      : Omit<
          TConfig,
          | 'search'
          | 'where'
          | 'orderBy'
          | 'cursor'
          | 'maxScan'
          | 'offset'
          | 'limit'
          | 'allowFullScan'
        > & {
          vectorSearch: TVectorSearch;
          search?: never;
          where?: never;
          orderBy?: never;
          cursor?: never;
          maxScan?: never;
          offset?: never;
          limit?: never;
          allowFullScan?: never;
        }
    : TConfig
  : TConfig;

/**
 * Filter operators available in where clause
 * Following Drizzle pattern: accept column builders directly, extract types with GetColumnData
 *
 * Operators use 'raw' mode for comparisons (no null union in comparison values)
 * Runtime wraps builders with column() helper for FilterExpression construction
 */
export interface FilterOperators<
  TTableConfig extends TableRelationalConfig = TableRelationalConfig,
> {
  and(
    ...expressions: (FilterExpression<boolean> | undefined)[]
  ): FilterExpression<boolean> | undefined;

  arrayContained<TBuilder extends ColumnBuilder<any, any, any>>(
    field: TBuilder,
    values: readonly GetColumnData<TBuilder, 'raw'>[]
  ): FilterExpression<boolean>;

  arrayContains<TBuilder extends ColumnBuilder<any, any, any>>(
    field: TBuilder,
    values: readonly GetColumnData<TBuilder, 'raw'>[]
  ): FilterExpression<boolean>;

  arrayOverlaps<TBuilder extends ColumnBuilder<any, any, any>>(
    field: TBuilder,
    values: readonly GetColumnData<TBuilder, 'raw'>[]
  ): FilterExpression<boolean>;

  between<TBuilder extends ColumnBuilder<any, any, any>>(
    field: TBuilder,
    min: GetColumnData<TBuilder, 'raw'>,
    max: GetColumnData<TBuilder, 'raw'>
  ): FilterExpression<boolean>;

  contains<TBuilder extends ColumnBuilder<any, any, any>>(
    field: TBuilder,
    substring: string
  ): FilterExpression<boolean>;

  endsWith<TBuilder extends ColumnBuilder<any, any, any>>(
    field: TBuilder,
    suffix: string
  ): FilterExpression<boolean>;

  eq<TBuilder extends ColumnBuilder<any, any, any>>(
    field: TBuilder,
    value: GetColumnData<TBuilder, 'raw'>
  ): FilterExpression<boolean>;

  gt<TBuilder extends ColumnBuilder<any, any, any>>(
    field: TBuilder,
    value: GetColumnData<TBuilder, 'raw'>
  ): FilterExpression<boolean>;

  gte<TBuilder extends ColumnBuilder<any, any, any>>(
    field: TBuilder,
    value: GetColumnData<TBuilder, 'raw'>
  ): FilterExpression<boolean>;

  ilike<TBuilder extends ColumnBuilder<any, any, any>>(
    field: TBuilder,
    pattern: string
  ): FilterExpression<boolean>;

  inArray<TBuilder extends ColumnBuilder<any, any, any>>(
    field: TBuilder,
    values: readonly GetColumnData<TBuilder, 'raw'>[]
  ): FilterExpression<boolean>;

  isNotNull<TBuilder extends ColumnBuilder<any, any, any>>(
    field: TBuilder
  ): FilterExpression<boolean>;

  isNull<TBuilder extends ColumnBuilder<any, any, any>>(
    field: TBuilder extends { _: { notNull: true } } ? never : TBuilder
  ): FilterExpression<boolean>;

  // M5 String Operators (Post-Fetch)
  like<TBuilder extends ColumnBuilder<any, any, any>>(
    field: TBuilder,
    pattern: string
  ): FilterExpression<boolean>;

  lt<TBuilder extends ColumnBuilder<any, any, any>>(
    field: TBuilder,
    value: GetColumnData<TBuilder, 'raw'>
  ): FilterExpression<boolean>;

  lte<TBuilder extends ColumnBuilder<any, any, any>>(
    field: TBuilder,
    value: GetColumnData<TBuilder, 'raw'>
  ): FilterExpression<boolean>;

  ne<TBuilder extends ColumnBuilder<any, any, any>>(
    field: TBuilder,
    value: GetColumnData<TBuilder, 'raw'>
  ): FilterExpression<boolean>;

  not(expression: FilterExpression<boolean>): FilterExpression<boolean>;

  notBetween<TBuilder extends ColumnBuilder<any, any, any>>(
    field: TBuilder,
    min: GetColumnData<TBuilder, 'raw'>,
    max: GetColumnData<TBuilder, 'raw'>
  ): FilterExpression<boolean>;

  notIlike<TBuilder extends ColumnBuilder<any, any, any>>(
    field: TBuilder,
    pattern: string
  ): FilterExpression<boolean>;

  notInArray<TBuilder extends ColumnBuilder<any, any, any>>(
    field: TBuilder,
    values: readonly GetColumnData<TBuilder, 'raw'>[]
  ): FilterExpression<boolean>;

  notLike<TBuilder extends ColumnBuilder<any, any, any>>(
    field: TBuilder,
    pattern: string
  ): FilterExpression<boolean>;

  or(
    ...expressions: (FilterExpression<boolean> | undefined)[]
  ): FilterExpression<boolean> | undefined;

  predicate(
    predicate: (
      row: InferModelFromColumns<TableColumns<TTableConfig>>
    ) => boolean | Promise<boolean>
  ): PredicateWhereClause<TTableConfig>;

  startsWith<TBuilder extends ColumnBuilder<any, any, any>>(
    field: TBuilder,
    prefix: string
  ): FilterExpression<boolean>;
}

/**
 * Order by clause - represents a single field ordering
 * Following Drizzle pattern for type-safe ordering
 *
 * @template TColumn - Column builder type
 */
export interface OrderByClause<TColumn extends ColumnBuilder<any, any, any>> {
  readonly column: Column<TColumn, string>;
  readonly direction: 'asc' | 'desc';
}

/**
 * Order by input - either a column builder (default ASC)
 * or an explicit order by clause from asc()/desc().
 */
export type OrderByValue<
  TColumn extends ColumnBuilder<any, any, any> = ColumnBuilder<any, any, any>,
> = OrderByClause<TColumn> | TColumn;

/**
 * Order direction helpers
 */
export interface OrderDirection {
  asc: <TBuilder extends ColumnBuilder<any, any, any>>(
    field: TBuilder
  ) => OrderByClause<TBuilder>;
  desc: <TBuilder extends ColumnBuilder<any, any, any>>(
    field: TBuilder
  ) => OrderByClause<TBuilder>;
}

export type DBQueryConfigOrderByCallback<TTable extends ConvexTable<any>> = (
  table: TTable,
  operators: OrderDirection
) => ValueOrArray<OrderByValue> | undefined;

export type DBQueryConfigOrderByObject<
  TColumns extends Record<string, unknown>,
> = {
  [K in keyof TColumns]?: 'asc' | 'desc' | undefined;
};

export type DBQueryConfigOrderBy<TTableConfig extends TableRelationalConfig> =
  | DBQueryConfigOrderByCallback<TTableConfig['table']>
  | DBQueryConfigOrderByObject<TableColumns<TTableConfig>>;

/**
 * Build query result type from configuration
 * Handles column selection and relation loading
 *
 * @template TSchema - Full schema configuration
 * @template TTableConfig - Configuration for queried table
 * @template TConfig - Query configuration (true | config object)
 */

/**
 * Infer selected columns from a raw selection using Drizzle v1 semantics.
 * - Any `true` => include-only
 * - All `false` => exclude-only
 * - Empty / all undefined => no columns
 */
type InferRelationalQueryTableResult<
  TRawSelection extends Record<string, unknown>,
  TSelectedFields extends Record<string, unknown> | 'Full' = 'Full',
> = TSelectedFields extends 'Full'
  ? TRawSelection
  : {
      [K in Equal<
        Exclude<
          TSelectedFields[keyof TSelectedFields & keyof TRawSelection],
          undefined
        >,
        false
      > extends true
        ? Exclude<keyof TRawSelection, NonUndefinedKeysOnly<TSelectedFields>>
        : {
            [K in keyof TSelectedFields]: Equal<
              TSelectedFields[K],
              true
            > extends true
              ? K
              : never;
          }[keyof TSelectedFields] &
            keyof TRawSelection]: TRawSelection[K];
    };

type TableColumns<TTableConfig extends TableRelationalConfig> =
  TTableConfig['table']['_']['columns'] &
    SystemFields<TTableConfig['table']['_']['name']> &
    SystemFieldAliases<
      TTableConfig['table']['_']['name'],
      TTableConfig['table']['_']['columns']
    >;

type TablePolymorphicMetadataFromColumn<
  TColumn,
  TDiscriminator extends string,
> = TColumn extends { __polymorphic: infer TMeta }
  ? TMeta extends {
      as: infer TAlias extends string;
      variants: infer TVariants extends Record<
        string,
        Record<string, ColumnBuilderBase>
      >;
    }
    ? {
        as: TAlias;
        discriminator: TDiscriminator;
        variants: TVariants;
      }
    : never
  : never;

type TablePolymorphicMetadata<TTableConfig extends TableRelationalConfig> = {
  [K in Extract<
    keyof TTableConfig['table']['_']['columns'],
    string
  >]: TablePolymorphicMetadataFromColumn<
    TTableConfig['table']['_']['columns'][K],
    K
  >;
}[Extract<keyof TTableConfig['table']['_']['columns'], string>];

type PolymorphicResultFromMetadata<TMetadata> = TMetadata extends {
  as: infer TAlias extends string;
  discriminator: infer TDiscriminator extends string;
  variants: infer TVariants extends Record<
    string,
    Record<string, ColumnBuilderBase>
  >;
}
  ? {
      [TCase in keyof TVariants & string]: {
        [K in TDiscriminator]: TCase;
      } & {
        [K in TAlias]: InferModelFromColumns<TVariants[TCase]>;
      };
    }[keyof TVariants & string]
  : {};

type TablePolymorphicResult<TTableConfig extends TableRelationalConfig> = [
  TablePolymorphicMetadata<TTableConfig>,
] extends [never]
  ? {}
  : PolymorphicResultFromMetadata<TablePolymorphicMetadata<TTableConfig>>;

type RelationNames<TTableConfig extends TableRelationalConfig> = Extract<
  keyof TTableConfig['relations'],
  string
>;

type OneRelationNames<TTableConfig extends TableRelationalConfig> = {
  [K in RelationNames<TTableConfig>]: TTableConfig['relations'][K] extends One<
    any,
    any
  >
    ? K
    : never;
}[RelationNames<TTableConfig>];

type WithVariantsAutoWithConfig<
  TTableConfig extends TableRelationalConfig,
  _TSelection,
> = {
  [K in OneRelationNames<TTableConfig>]: true;
};

type SelectedTableResult<
  TTableConfig extends TableRelationalConfig,
  TFullSelection extends Record<string, unknown>,
> = InferRelationalQueryTableResult<
  InferModelFromColumns<TableColumns<TTableConfig>>,
  TFullSelection['columns'] extends Record<string, unknown>
    ? TFullSelection['columns']
    : 'Full'
>;

type TablePolymorphicResultForSelection<
  TTableConfig extends TableRelationalConfig,
  TFullSelection extends Record<string, unknown>,
> = [TablePolymorphicMetadata<TTableConfig>] extends [never]
  ? {}
  : TablePolymorphicMetadata<TTableConfig> extends {
        discriminator: infer TDiscriminator extends string;
      }
    ? TDiscriminator extends keyof SelectedTableResult<
        TTableConfig,
        TFullSelection
      >
      ? PolymorphicResultFromMetadata<TablePolymorphicMetadata<TTableConfig>>
      : {}
    : {};

export type PaginatedResult<T> = {
  page: T[];
  continueCursor: string | null;
  isDone: boolean;
  pageStatus?: 'SplitRecommended' | 'SplitRequired';
  splitCursor?: string;
};

export type BuildQueryResult<
  TSchema extends TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig,
  TFullSelection,
> =
  Equal<TFullSelection, true> extends true
    ? Simplify<
        InferModelFromColumns<TableColumns<TTableConfig>> &
          TablePolymorphicResult<TTableConfig>
      >
    : TFullSelection extends Record<string, unknown>
      ? Simplify<
          SelectedTableResult<TTableConfig, TFullSelection> &
            (Exclude<TFullSelection['extras'], undefined> extends
              | Record<string, unknown>
              | ((...args: any[]) => Record<string, unknown>)
              ? ReturnTypeOrValue<
                  Exclude<TFullSelection['extras'], undefined>
                > extends infer TExtras extends Record<string, unknown>
                ? {
                    [K in NonUndefinedKeysOnly<TExtras>]: ReturnTypeOrValue<
                      TExtras[K]
                    >;
                  }
                : {}
              : {}) &
            (Exclude<TFullSelection['with'], undefined> extends Record<
              string,
              unknown
            >
              ? BuildRelationResult<
                  TSchema,
                  Exclude<TFullSelection['with'], undefined>,
                  TTableConfig['relations']
                >
              : {}) &
            (TFullSelection['withVariants'] extends true
              ? BuildRelationResult<
                  TSchema,
                  WithVariantsAutoWithConfig<TTableConfig, TFullSelection>,
                  TTableConfig['relations']
                >
              : {}) &
            TablePolymorphicResultForSelection<TTableConfig, TFullSelection> &
            (TFullSelection extends { vectorSearch: infer TVectorSearch }
              ? [TVectorSearch] extends [undefined]
                ? {}
                : { _score?: number }
              : {})
        >
      : never;

/**
 * Build relation result types from `with` configuration
 * Maps each included relation to its result type (T | null for one, T[] for many)
 *
 * Following Drizzle's exact pattern for type inference
 *
 * @template TSchema - Full schema configuration
 * @template TInclude - Relations to include from `with` config
 * @template TRelations - Available relations on the table
 */
export type BuildRelationResult<
  TSchema extends TablesRelationalConfig,
  TInclude extends Record<string, unknown>,
  TRelations extends RelationsRecord,
> = {
  [K in NonUndefinedKeysOnly<TInclude> &
    keyof TRelations]: TRelations[K] extends infer TRel extends Relation<any>
    ? BuildQueryResult<
        TSchema,
        FindTableByDBName<TSchema, TRel['targetTableName']>,
        Assume<TInclude[K], true | Record<string, unknown>>
      > extends infer TResult
      ? TRel extends One<any, any>
        ?
            | TResult
            | (Equal<TRel['optional'], true> extends true
                ? null
                : TInclude[K] extends Record<string, unknown>
                  ? TInclude[K]['where'] extends Record<string, any>
                    ? null
                    : never
                  : never)
        : TResult[]
      : never
    : never;
} & (TInclude extends {
  _count: infer TCountConfig;
}
  ? TCountConfig extends Record<string, unknown>
    ? {
        _count: {
          [K in NonUndefinedKeysOnly<TCountConfig> & keyof TRelations]: number;
        };
      }
    : {}
  : {});

/**
 * Extract TypeScript types from column validators
 * Includes system fields for query results
 * Following Drizzle pattern: query results always include system fields
 * Uses GetColumnData in 'query' mode to respect notNull brands
 *
 * CRITICAL: No extends constraint to avoid type widening (convex-ents pattern)
 * CRITICAL: Uses Merge instead of & to preserve NotNull phantom type brands
 */
export type InferModelFromColumns<TColumns> =
  TColumns extends Record<string, ColumnBuilderBase>
    ? Simplify<{
        [K in keyof TColumns]: GetColumnData<TColumns[K], 'query'>;
      }>
    : never;

/**
 * Pick specific columns from column builders
 * Used when `columns` config is provided
 * Uses GetColumnData in 'query' mode to respect notNull brands
 *
 * CRITICAL: No extends constraint on TColumns to avoid type widening
 */
export type PickColumns<TColumns, TSelection extends Record<string, unknown>> =
  TColumns extends Record<string, ColumnBuilderBase>
    ? Simplify<{
        [K in keyof TSelection as K extends keyof TColumns
          ? TSelection[K] extends true
            ? K
            : never
          : never]: K extends keyof TColumns
          ? GetColumnData<TColumns[K], 'query'>
          : never;
      }>
    : never;

/**
 * Extract union of all values from an object type
 * Pattern from Drizzle: drizzle-orm/src/relations.ts:145
 */
type ExtractObjectValues<T> = T[keyof T];

/**
 * Find table configuration by database name
 * Pattern from Drizzle: drizzle-orm/src/relations.ts:198-208
 *
 * Uses mapped type with key remapping to avoid `infer` widening.
 * The `as` clause filters to only matching keys, then ExtractObjectValues
 * extracts the single table value without creating unions.
 */
export type FindTableByDBName<
  TSchema extends TablesRelationalConfig,
  TDBName extends string,
> = ExtractObjectValues<{
  [K in keyof TSchema as TSchema[K]['name'] extends TDBName
    ? K
    : never]: TSchema[K];
}>;

type PipelineFlatMapTargetRow<
  TSchema extends TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig,
  TRelationName extends PipelineRelationName<TTableConfig>,
> = TTableConfig['relations'][TRelationName] extends infer TRelation extends
  Relation<any>
  ? BuildQueryResult<
      TSchema,
      FindTableByDBName<TSchema, TRelation['targetTableName']>,
      true
    >
  : never;

type PipelineFlatMapOutput<
  TCurrentRow,
  TFlatMapConfig,
  TSchema extends TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig,
> = TFlatMapConfig extends {
  relation: infer TRelationName extends PipelineRelationName<TTableConfig>;
}
  ? TFlatMapConfig extends { includeParent: false }
    ? PipelineFlatMapTargetRow<TSchema, TTableConfig, TRelationName>
    : {
        parent: TCurrentRow;
        child: PipelineFlatMapTargetRow<TSchema, TTableConfig, TRelationName>;
      }
  : never;

export type ApplyPipelineStage<
  TCurrentRow,
  TStage,
  TSchema extends TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig,
> =
  TStage extends FindManyPipelineFilterWithStage<any>
    ? TCurrentRow
    : TStage extends { map: (...args: any[]) => infer TMapOutput }
      ? NonNullable<Awaited<TMapOutput>>
      : TStage extends FindManyPipelineDistinctStage
        ? TCurrentRow
        : TStage extends { flatMap: infer TFlatMapConfig }
          ? PipelineFlatMapOutput<
              TCurrentRow,
              TFlatMapConfig,
              TSchema,
              TTableConfig
            >
          : TCurrentRow;

export type ApplyPipelineStages<
  TInitialRow,
  TStages extends readonly unknown[],
  TSchema extends TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig,
> = number extends TStages['length']
  ? TInitialRow
  : TStages extends readonly [infer TStage, ...infer TRest]
    ? ApplyPipelineStages<
        ApplyPipelineStage<TInitialRow, TStage, TSchema, TTableConfig>,
        Extract<TRest, readonly unknown[]>,
        TSchema,
        TTableConfig
      >
    : TInitialRow;

export type PipelineOutputRow<
  TConfig,
  TSchema extends TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig,
> = TConfig extends {
  pipeline: infer TPipeline extends FindManyPipelineConfig<
    TSchema,
    TTableConfig
  >;
}
  ? ApplyPipelineStages<
      BuildQueryResult<TSchema, TTableConfig, true>,
      TPipeline extends FindManyPipelineConfig<any, any, infer TStages>
        ? TStages
        : readonly [],
      TSchema,
      TTableConfig
    >
  : BuildQueryResult<TSchema, TTableConfig, true>;

/**
 * Filter object keys to only non-undefined values
 * Used to filter `with` config to only included relations
 */
export type NonUndefinedKeysOnly<T> = ExtractObjectValues<{
  [K in keyof T as T[K] extends undefined ? never : K]: K;
}> &
  keyof T;

// ============================================================================
// M7 Mutations - Insert/Update/Delete Types
// ============================================================================

type TableColumnsForTable<TTable extends ConvexTable<any>> =
  TTable['_']['columns'] &
    SystemFields<TTable['_']['name']> &
    SystemFieldAliases<TTable['_']['name'], TTable['_']['columns']>;

type MutationReturningCountSelection = Record<
  string,
  | true
  | {
      where?: Record<string, unknown> | undefined;
    }
  | undefined
>;

export type ReturningSelection<TTable extends ConvexTable<any>> = Record<
  string,
  | TableColumnsForTable<TTable>[keyof TableColumnsForTable<TTable>]
  | MutationReturningCountSelection
>;

export type ReturningResult<TSelection extends Record<string, unknown>> =
  Simplify<
    {
      [K in keyof TSelection as K extends '_count'
        ? never
        : K]: TSelection[K] extends ColumnBuilderBase
        ? GetColumnData<TSelection[K], 'query'>
        : never;
    } & (TSelection extends { _count: infer TCount }
      ? TCount extends Record<string, unknown>
        ? {
            _count: {
              [K in NonUndefinedKeysOnly<TCount> & string]: number;
            };
          }
        : {}
      : {})
  >;

export type ReturningAll<TTable extends ConvexTable<any>> =
  InferSelectModel<TTable>;

export type MutationReturning = true | Record<string, unknown> | undefined;

export type MutationResult<
  TTable extends ConvexTable<any>,
  TReturning extends MutationReturning,
> = TReturning extends true
  ? ReturningAll<TTable>[]
  : TReturning extends Record<string, ColumnBuilderBase>
    ? ReturningResult<TReturning>[]
    : undefined;

export type MutationPaginateConfig = {
  cursor: string | null;
  limit: number;
};

export type MutationRunMode = 'sync' | 'async';

export type MutationExecuteConfig = {
  mode?: MutationRunMode;
  batchSize?: number;
  delayMs?: number;
};

export type MutationExecutionMode = 'single' | 'paged';

export type MutationPaginatedResult<
  TTable extends ConvexTable<any>,
  TReturning extends MutationReturning,
> = Simplify<
  {
    continueCursor: string | null;
    isDone: boolean;
    numAffected: number;
  } & (MutationResult<TTable, TReturning> extends undefined
    ? {}
    : { page: MutationResult<TTable, TReturning> })
>;

export type MutationExecuteResult<
  TTable extends ConvexTable<any>,
  TReturning extends MutationReturning,
  TMode extends MutationExecutionMode,
> = TMode extends 'paged'
  ? MutationPaginatedResult<TTable, TReturning>
  : MutationResult<TTable, TReturning>;

export type InsertValue<TTable extends ConvexTable<any>> =
  InferInsertModel<TTable>;

type UpdateSetValue<TColumn extends ColumnBuilderBase> =
  | GetColumnData<TColumn, 'query'>
  | (TColumn['_']['notNull'] extends true ? never : UnsetToken)
  | undefined;

export type UpdateSet<TTable extends ConvexTable<any>> = Simplify<{
  [K in keyof TTable['_']['columns'] & string]?: UpdateSetValue<
    TTable['_']['columns'][K]
  >;
}>;
