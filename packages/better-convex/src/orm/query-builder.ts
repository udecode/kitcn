/**
 * RelationalQueryBuilder - Entry point for query builder API
 *
 * Provides standard query APIs:
 * - ctx.db.query.users.findMany({ with: { posts: true } })
 * - ctx.db.query.users.findFirst({ where: ... })
 *
 * And fluent pipeline composition via select():
 * - ctx.db.query.users.select().map(...).filter(...).paginate(...)
 */

import type { GenericDatabaseReader } from 'convex/server';
import type { KnownKeysOnly } from '../internal/types';
import type { EdgeMetadata } from './extractRelationsConfig';
import { GelRankQuery, GelRelationalQuery } from './query';
import { QueryPromise } from './query-promise';
import type { RlsContext } from './rls/types';
import type {
  AggregateConfig,
  AggregateResult,
  ApplyPipelineStage,
  BuildQueryResult,
  CountConfig,
  CountResult,
  DBQueryConfig,
  EnforceCursorMaxScan,
  EnforceNoAllowFullScanWhenIndexed,
  EnforceSearchConstraints,
  EnforceVectorSearchConstraints,
  EnforceWithIndexForWhere,
  FindManyPageByKeyConfig,
  FindManyPipelineConfig,
  FindManyPipelineFlatMapConfig,
  FindManyUnionSource,
  GroupByConfig,
  GroupByResult,
  KeyPageResult,
  PaginatedResult,
  PredicateWhereIndexConfig,
  SearchQueryConfig,
  SearchWhereFilter,
  TableRelationalConfig,
  TablesRelationalConfig,
  VectorQueryConfig,
  VectorSearchProvider,
} from './types';

type EnforcedConfig<
  TConfig,
  TTableConfig extends TableRelationalConfig,
  THasIndex extends boolean = false,
> = EnforceVectorSearchConstraints<
  EnforceSearchConstraints<
    EnforceCursorMaxScan<
      EnforceNoAllowFullScanWhenIndexed<
        EnforceWithIndexForWhere<TConfig, TTableConfig, THasIndex>,
        THasIndex
      >
    >,
    TTableConfig
  >,
  TTableConfig
>;

type DisallowWithIndexSearchOrVector<THasIndex extends boolean> =
  THasIndex extends true
    ? {
        search?: never;
        vectorSearch?: never;
      }
    : unknown;

type KnownKeysOnlyStrict<T, K> = 0 extends 1 & T ? never : KnownKeysOnly<T, K>;

type PredicateIndexName<TTableConfig extends TableRelationalConfig> =
  PredicateWhereIndexConfig<TTableConfig> extends {
    name: infer TIndexName extends string;
  }
    ? TIndexName
    : string;

type PredicateIndexConfigByName<
  TTableConfig extends TableRelationalConfig,
  TIndexName extends PredicateIndexName<TTableConfig>,
> = Extract<PredicateWhereIndexConfig<TTableConfig>, { name: TIndexName }>;

type SearchPaginatedConfig<
  TSchema extends TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig,
> = Omit<
  CursorPaginatedConfig<TSchema, TTableConfig>,
  'search' | 'vectorSearch' | 'where' | 'orderBy'
> & {
  search: SearchQueryConfig<TTableConfig>;
  vectorSearch?: never;
  where?: SearchWhereFilter<TTableConfig> | undefined;
  orderBy?: never;
  pipeline?: never;
  pageByKey?: never;
  endCursor?: never;
};

type SearchNonPaginatedConfig<
  TSchema extends TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig,
> = Omit<
  NonCursorConfig<TSchema, TTableConfig>,
  'search' | 'vectorSearch' | 'where' | 'orderBy'
> & {
  search: SearchQueryConfig<TTableConfig>;
  vectorSearch?: never;
  where?: SearchWhereFilter<TTableConfig> | undefined;
  orderBy?: never;
  pipeline?: never;
  pageByKey?: never;
  endCursor?: never;
};

type SearchFindFirstConfig<
  TSchema extends TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig,
> = Omit<
  DBQueryConfig<'many', true, TSchema, TTableConfig>,
  | 'limit'
  | 'search'
  | 'vectorSearch'
  | 'where'
  | 'orderBy'
  | 'cursor'
  | 'maxScan'
  | 'pipeline'
> & {
  search: SearchQueryConfig<TTableConfig>;
  vectorSearch?: never;
  where?: SearchWhereFilter<TTableConfig> | undefined;
  orderBy?: never;
  pipeline?: never;
};

type VectorNonPaginatedConfig<
  TSchema extends TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig,
> = Omit<
  DBQueryConfig<'many', true, TSchema, TTableConfig>,
  | 'vectorSearch'
  | 'search'
  | 'where'
  | 'orderBy'
  | 'offset'
  | 'limit'
  | 'cursor'
  | 'maxScan'
  | 'allowFullScan'
  | 'pipeline'
> & {
  vectorSearch: VectorQueryConfig<TTableConfig>;
  search?: never;
  where?: never;
  orderBy?: never;
  offset?: never;
  limit?: never;
  cursor?: never;
  maxScan?: never;
  allowFullScan?: never;
  pipeline?: never;
  pageByKey?: never;
  endCursor?: never;
};

type FindManyResult<
  TSchema extends TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig,
  TConfig,
> = TConfig extends { pageByKey: FindManyPageByKeyConfig }
  ? KeyPageResult<BuildQueryResult<TSchema, TTableConfig, TConfig>>
  : TConfig extends { cursor: string | null }
    ? PaginatedResult<BuildQueryResult<TSchema, TTableConfig, TConfig>>
    : BuildQueryResult<TSchema, TTableConfig, TConfig>[];

type RelationCountWithConfig<
  TSchema extends TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig,
> = Omit<DBQueryConfig<'many', true, TSchema, TTableConfig>, 'with'> & {
  with: NonNullable<
    DBQueryConfig<'many', true, TSchema, TTableConfig>['with']
  > & {
    _count: NonNullable<
      NonNullable<
        DBQueryConfig<'many', true, TSchema, TTableConfig>['with']
      >['_count']
    >;
  };
};

type NonCursorConfigNoRelationCount<
  TSchema extends TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig,
> = Omit<NonCursorConfigNoSearch<TSchema, TTableConfig>, 'with'> & {
  with?: Exclude<
    NonCursorConfigNoSearch<TSchema, TTableConfig>['with'],
    undefined
  > extends infer TWith extends Record<string, unknown>
    ? Omit<TWith, '_count'> & { _count?: never }
    : never;
};

type CursorPaginatedConfig<
  TSchema extends TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig,
> = Omit<
  DBQueryConfig<'many', true, TSchema, TTableConfig>,
  'cursor' | 'limit' | 'pageByKey' | 'allowFullScan' | 'pipeline'
> & {
  cursor: string | null;
  limit: number;
  offset?: never;
  pageByKey?: never;
  allowFullScan?: never;
  pipeline?: never;
};

type NonCursorConfig<
  TSchema extends TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig,
> = Omit<
  DBQueryConfig<'many', true, TSchema, TTableConfig>,
  'maxScan' | 'endCursor' | 'pipeline'
> & {
  cursor?: never;
  maxScan?: never;
  endCursor?: never;
  pipeline?: never;
};

type KeyPageConfig<
  TSchema extends TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig,
> = Omit<
  NonCursorConfigNoSearch<TSchema, TTableConfig>,
  'pageByKey' | 'cursor' | 'maxScan' | 'endCursor' | 'offset' | 'pipeline'
> & {
  pageByKey: FindManyPageByKeyConfig;
  cursor?: never;
  maxScan?: never;
  endCursor?: never;
  offset?: never;
  pipeline?: never;
};

type CursorPaginatedConfigNoSearch<
  TSchema extends TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig,
> = Omit<CursorPaginatedConfig<TSchema, TTableConfig>, 'search'> & {
  search?: undefined;
  vectorSearch?: undefined;
};

type NonCursorConfigNoSearch<
  TSchema extends TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig,
> = Omit<NonCursorConfig<TSchema, TTableConfig>, 'search'> & {
  search?: undefined;
  vectorSearch?: undefined;
};

type FindFirstConfigNoSearch<
  TSchema extends TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig,
> = Omit<
  DBQueryConfig<'many', true, TSchema, TTableConfig>,
  | 'limit'
  | 'search'
  | 'vectorSearch'
  | 'cursor'
  | 'maxScan'
  | 'endCursor'
  | 'pipeline'
  | 'pageByKey'
> & {
  search?: undefined;
  vectorSearch?: undefined;
  endCursor?: never;
  pipeline?: never;
  pageByKey?: never;
};

type SelectPipelineBaseConfig<
  TSchema extends TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig,
> = Omit<
  DBQueryConfig<'many', true, TSchema, TTableConfig>,
  | 'cursor'
  | 'maxScan'
  | 'endCursor'
  | 'pageByKey'
  | 'pipeline'
  | 'with'
  | 'extras'
  | 'columns'
  | 'search'
  | 'vectorSearch'
  | 'offset'
> & {
  cursor?: never;
  maxScan?: never;
  endCursor?: never;
  pageByKey?: never;
  pipeline?: never;
  with?: never;
  extras?: never;
  columns?: never;
  search?: never;
  vectorSearch?: never;
  offset?: never;
};

type ComposeFlatMapOutput<
  TCurrentRow,
  TSchema extends TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig,
  TRelationName extends Extract<keyof TTableConfig['relations'], string>,
  TIncludeParent extends boolean | undefined,
> = ApplyPipelineStage<
  TCurrentRow,
  {
    flatMap: {
      relation: TRelationName;
      includeParent: TIncludeParent;
    };
  },
  TSchema,
  TTableConfig
>;

type PaginateConfig = {
  cursor: string | null;
  limit: number;
  endCursor?: string | null;
  maxScan?: number;
};

type QueryFactory<
  TSchema extends TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig,
> = <TResult>(
  config: DBQueryConfig<'many', true, TSchema, TTableConfig>,
  mode: 'many' | 'first' | 'firstOrThrow' | 'count' | 'aggregate',
  configuredIndex?: PredicateWhereIndexConfig<TTableConfig>
) => GelRelationalQuery<TSchema, TTableConfig, TResult>;

export class RelationalSelectChain<
  TSchema extends TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig,
  TRow,
  THasIndex extends boolean = false,
> extends QueryPromise<TRow[]> {
  private readonly config: SelectPipelineBaseConfig<TSchema, TTableConfig>;
  private readonly pipeline: FindManyPipelineConfig<TSchema, TTableConfig>;

  constructor(
    private readonly createQuery: QueryFactory<TSchema, TTableConfig>,
    config: SelectPipelineBaseConfig<TSchema, TTableConfig>,
    pipeline?: FindManyPipelineConfig<TSchema, TTableConfig>,
    private readonly configuredIndex?: PredicateWhereIndexConfig<TTableConfig>
  ) {
    super();
    this.config = { ...config };
    this.pipeline = { ...(pipeline ?? {}) };
  }

  private withConfig(
    patch: Partial<SelectPipelineBaseConfig<TSchema, TTableConfig>>
  ): RelationalSelectChain<TSchema, TTableConfig, TRow, THasIndex> {
    return new RelationalSelectChain<TSchema, TTableConfig, TRow, THasIndex>(
      this.createQuery,
      { ...this.config, ...patch },
      this.pipeline,
      this.configuredIndex
    );
  }

  private withPipeline<TNextRow>(
    patch: Partial<FindManyPipelineConfig<TSchema, TTableConfig>>
  ): RelationalSelectChain<TSchema, TTableConfig, TNextRow, THasIndex> {
    return new RelationalSelectChain<
      TSchema,
      TTableConfig,
      TNextRow,
      THasIndex
    >(
      this.createQuery,
      this.config,
      {
        ...this.pipeline,
        ...patch,
      },
      this.configuredIndex
    );
  }

  private appendStage(
    stage: NonNullable<
      FindManyPipelineConfig<TSchema, TTableConfig>['stages']
    >[number]
  ): NonNullable<FindManyPipelineConfig<TSchema, TTableConfig>['stages']> {
    return [...(this.pipeline.stages ?? []), stage];
  }

  private asManyConfig(): DBQueryConfig<'many', true, TSchema, TTableConfig> {
    const hasPipeline = Boolean(
      this.pipeline.stages || this.pipeline.union || this.pipeline.interleaveBy
    );

    return {
      ...(this.config as DBQueryConfig<'many', true, TSchema, TTableConfig>),
      ...(hasPipeline
        ? {
            pipeline: this.pipeline,
            __allowPipelineFromSelect: true,
          }
        : {}),
    } as DBQueryConfig<'many', true, TSchema, TTableConfig>;
  }

  execute(): Promise<TRow[]> {
    return this.createQuery<TRow[]>(
      this.asManyConfig(),
      'many',
      this.configuredIndex
    ).execute();
  }

  where(
    where: SelectPipelineBaseConfig<TSchema, TTableConfig>['where']
  ): RelationalSelectChain<TSchema, TTableConfig, TRow> {
    return this.withConfig({ where });
  }

  withIndex<TIndexName extends PredicateIndexName<TTableConfig>>(
    indexName: TIndexName,
    range?: PredicateIndexConfigByName<TTableConfig, TIndexName>['range']
  ): RelationalSelectChain<TSchema, TTableConfig, TRow, true> {
    return new RelationalSelectChain<TSchema, TTableConfig, TRow, true>(
      this.createQuery,
      this.config,
      this.pipeline,
      {
        name: indexName,
        ...(range ? { range } : {}),
      } as unknown as PredicateWhereIndexConfig<TTableConfig>
    );
  }

  orderBy(
    orderBy: SelectPipelineBaseConfig<TSchema, TTableConfig>['orderBy']
  ): RelationalSelectChain<TSchema, TTableConfig, TRow> {
    return this.withConfig({ orderBy });
  }

  limit(limit: number): RelationalSelectChain<TSchema, TTableConfig, TRow> {
    return this.withConfig({ limit });
  }

  allowFullScan(
    this: RelationalSelectChain<TSchema, TTableConfig, TRow, false>,
    allowFullScan: boolean
  ): RelationalSelectChain<TSchema, TTableConfig, TRow> {
    return this.withConfig({ allowFullScan });
  }

  map<TOutput>(
    map: (row: TRow) => TOutput | null | Promise<TOutput | null>
  ): RelationalSelectChain<
    TSchema,
    TTableConfig,
    NonNullable<Awaited<TOutput>>
  > {
    return this.withPipeline<NonNullable<Awaited<TOutput>>>({
      stages: this.appendStage({ map }),
    });
  }

  filter(
    filter: (row: TRow) => boolean | Promise<boolean>
  ): RelationalSelectChain<TSchema, TTableConfig, TRow> {
    return this.withPipeline<TRow>({
      stages: this.appendStage({ filterWith: filter }),
    });
  }

  distinct(distinct: {
    fields: string[];
  }): RelationalSelectChain<TSchema, TTableConfig, TRow> {
    return this.withPipeline<TRow>({
      stages: this.appendStage({ distinct }),
    });
  }

  flatMap<
    TRelationName extends Extract<keyof TTableConfig['relations'], string>,
    TIncludeParent extends boolean | undefined = undefined,
  >(
    relation: TRelationName,
    options?: Omit<
      FindManyPipelineFlatMapConfig<TTableConfig, TRelationName>,
      'relation'
    > & {
      includeParent?: TIncludeParent;
    }
  ): RelationalSelectChain<
    TSchema,
    TTableConfig,
    ComposeFlatMapOutput<
      TRow,
      TSchema,
      TTableConfig,
      TRelationName,
      TIncludeParent
    >
  > {
    return this.withPipeline<
      ComposeFlatMapOutput<
        TRow,
        TSchema,
        TTableConfig,
        TRelationName,
        TIncludeParent
      >
    >({
      stages: this.appendStage({
        flatMap: {
          relation,
          ...(options ?? {}),
        },
      }),
    });
  }

  union(
    union: FindManyUnionSource<TTableConfig>[]
  ): RelationalSelectChain<TSchema, TTableConfig, TRow> {
    return this.withPipeline<TRow>({ union });
  }

  interleaveBy(
    interleaveBy: string[]
  ): RelationalSelectChain<TSchema, TTableConfig, TRow> {
    return this.withPipeline<TRow>({ interleaveBy });
  }

  paginate(
    config: PaginateConfig
  ): GelRelationalQuery<TSchema, TTableConfig, PaginatedResult<TRow>> {
    return this.createQuery<PaginatedResult<TRow>>(
      {
        ...this.asManyConfig(),
        ...config,
      },
      'many',
      this.configuredIndex
    );
  }

  pageByKey(
    pageByKey: FindManyPageByKeyConfig
  ): GelRelationalQuery<TSchema, TTableConfig, KeyPageResult<TRow>> {
    return this.createQuery<KeyPageResult<TRow>>(
      {
        ...this.asManyConfig(),
        pageByKey,
      },
      'many',
      this.configuredIndex
    );
  }

  first(): GelRelationalQuery<TSchema, TTableConfig, TRow | null> {
    return this.createQuery<TRow | null>(
      {
        ...this.asManyConfig(),
        limit: 1,
      },
      'first',
      this.configuredIndex
    );
  }

  firstOrThrow(): GelRelationalQuery<TSchema, TTableConfig, TRow> {
    return this.createQuery<TRow>(
      {
        ...this.asManyConfig(),
        limit: 1,
      },
      'firstOrThrow',
      this.configuredIndex
    );
  }
}

/**
 * Query builder for a specific table
 *
 * Uses HKT (Higher-Kinded Type) pattern to prevent type widening.
 * The readonly `_` interface anchors the result type, preventing TypeScript
 * from re-evaluating TSchema[K] as a union of all tables.
 *
 * Pattern from Drizzle ORM:
 * drizzle-orm/src/pg-core/query-builders/select.ts:167-179
 *
 * @template TSchema - Full schema configuration
 * @template TTableConfig - Configuration for this specific table
 */
export class RelationalQueryBuilder<
  TSchema extends TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig,
  THasIndex extends boolean = false,
> {
  /**
   * Type anchor for HKT pattern
   * Stores base result type in immutable property to prevent TypeScript from
   * widening types during mapped type evaluation. Methods construct their
   * return types (array, single, paginated) from this base type.
   */
  declare readonly _: {
    readonly schema: TSchema;
    readonly tableConfig: TTableConfig;
    readonly baseResult: BuildQueryResult<TSchema, TTableConfig, true>;
  };

  constructor(
    private schema: TSchema,
    private tableConfig: TTableConfig,
    private edgeMetadata: EdgeMetadata[],
    private db: GenericDatabaseReader<any>,
    private allEdges?: EdgeMetadata[], // M6.5 Phase 2: All edges for nested loading
    private rls?: RlsContext,
    private relationLoading?: { concurrency?: number },
    private vectorSearch?: VectorSearchProvider,
    private queryIndex?: PredicateWhereIndexConfig<TTableConfig>
  ) {}

  private createQuery<TResult>(
    config: DBQueryConfig<'many', true, TSchema, TTableConfig>,
    mode: 'many' | 'first' | 'firstOrThrow' | 'count' | 'aggregate' | 'groupBy',
    configuredIndex?: PredicateWhereIndexConfig<TTableConfig>
  ): GelRelationalQuery<TSchema, TTableConfig, TResult> {
    const effectiveIndex = configuredIndex ?? this.queryIndex;

    return new GelRelationalQuery<TSchema, TTableConfig, TResult>(
      this.schema,
      this.tableConfig,
      this.edgeMetadata,
      this.db,
      config,
      mode,
      this.allEdges,
      this.rls,
      this.relationLoading,
      this.vectorSearch,
      effectiveIndex
    );
  }

  select(): RelationalSelectChain<
    TSchema,
    TTableConfig,
    BuildQueryResult<TSchema, TTableConfig, true>,
    THasIndex
  > {
    return new RelationalSelectChain<
      TSchema,
      TTableConfig,
      BuildQueryResult<TSchema, TTableConfig, true>,
      THasIndex
    >(
      (config, mode) => this.createQuery(config, mode),
      {},
      undefined,
      this.queryIndex
    );
  }

  withIndex<TIndexName extends PredicateIndexName<TTableConfig>>(
    indexName: TIndexName,
    range?: PredicateIndexConfigByName<TTableConfig, TIndexName>['range']
  ): RelationalQueryBuilder<TSchema, TTableConfig, true> {
    return new RelationalQueryBuilder<TSchema, TTableConfig, true>(
      this.schema,
      this.tableConfig,
      this.edgeMetadata,
      this.db,
      this.allEdges,
      this.rls,
      this.relationLoading,
      this.vectorSearch,
      {
        name: indexName,
        ...(range ? { range } : {}),
      } as unknown as PredicateWhereIndexConfig<TTableConfig>
    );
  }

  count(): GelRelationalQuery<TSchema, TTableConfig, number>;
  count<TConfig extends CountConfig<TSchema, TTableConfig>>(
    config: KnownKeysOnly<TConfig, CountConfig<TSchema, TTableConfig>>
  ): GelRelationalQuery<
    TSchema,
    TTableConfig,
    CountResult<TTableConfig, TConfig>
  >;
  count(
    config?: CountConfig<TSchema, TTableConfig>
  ): GelRelationalQuery<TSchema, TTableConfig, any> {
    return this.createQuery<any>(
      (config ?? {}) as DBQueryConfig<'many', true, TSchema, TTableConfig>,
      'count'
    );
  }

  aggregate<TConfig extends AggregateConfig<TSchema, TTableConfig>>(
    config: KnownKeysOnly<TConfig, AggregateConfig<TSchema, TTableConfig>>
  ): GelRelationalQuery<
    TSchema,
    TTableConfig,
    AggregateResult<TTableConfig, TConfig>
  > {
    return this.createQuery<AggregateResult<TTableConfig, TConfig>>(
      config as DBQueryConfig<'many', true, TSchema, TTableConfig>,
      'aggregate'
    );
  }

  groupBy<TConfig extends GroupByConfig<TSchema, TTableConfig>>(
    config: KnownKeysOnly<TConfig, GroupByConfig<TSchema, TTableConfig>>
  ): GelRelationalQuery<
    TSchema,
    TTableConfig,
    GroupByResult<TTableConfig, TConfig>
  > {
    return this.createQuery<GroupByResult<TTableConfig, TConfig>>(
      config as DBQueryConfig<'many', true, TSchema, TTableConfig>,
      'groupBy'
    );
  }

  rank(
    indexName: string,
    config?: {
      where?: Record<string, unknown>;
    }
  ): GelRankQuery<TTableConfig> {
    return new GelRankQuery<TTableConfig>(
      this.db,
      this.tableConfig,
      indexName,
      config,
      this.rls
    );
  }

  /**
   * Find many rows matching the query configuration
   *
   * @template TConfig - Query configuration type
   * @param config - Optional query configuration (columns, with, where, orderBy, limit, offset)
   * @returns Query promise that resolves to array of results
   *
   * @example
   * const users = await ctx.db.query.users.findMany({
   *   columns: { id: true, name: true },
   *   with: { posts: { limit: 5 } },
   *   where: { name: 'Alice' },
   *   limit: 10
   * });
   */
  findMany(
    config: RelationCountWithConfig<TSchema, TTableConfig> &
      EnforcedConfig<
        RelationCountWithConfig<TSchema, TTableConfig>,
        TTableConfig,
        THasIndex
      > &
      DisallowWithIndexSearchOrVector<THasIndex>
  ): GelRelationalQuery<
    TSchema,
    TTableConfig,
    FindManyResult<
      TSchema,
      TTableConfig,
      RelationCountWithConfig<TSchema, TTableConfig>
    >
  >;
  findMany<TConfig extends SearchPaginatedConfig<TSchema, TTableConfig>>(
    config: KnownKeysOnlyStrict<
      TConfig,
      SearchPaginatedConfig<TSchema, TTableConfig>
    > &
      DisallowWithIndexSearchOrVector<THasIndex>
  ): GelRelationalQuery<
    TSchema,
    TTableConfig,
    PaginatedResult<BuildQueryResult<TSchema, TTableConfig, TConfig>>
  >;
  findMany<TConfig extends SearchNonPaginatedConfig<TSchema, TTableConfig>>(
    config: KnownKeysOnlyStrict<
      TConfig,
      SearchNonPaginatedConfig<TSchema, TTableConfig>
    > &
      DisallowWithIndexSearchOrVector<THasIndex>
  ): GelRelationalQuery<
    TSchema,
    TTableConfig,
    BuildQueryResult<TSchema, TTableConfig, TConfig>[]
  >;
  findMany<TConfig extends VectorNonPaginatedConfig<TSchema, TTableConfig>>(
    config: KnownKeysOnlyStrict<
      TConfig,
      VectorNonPaginatedConfig<TSchema, TTableConfig>
    > &
      DisallowWithIndexSearchOrVector<THasIndex>
  ): GelRelationalQuery<
    TSchema,
    TTableConfig,
    BuildQueryResult<TSchema, TTableConfig, TConfig>[]
  >;
  findMany<
    TConfig extends CursorPaginatedConfigNoSearch<TSchema, TTableConfig>,
  >(
    config: KnownKeysOnlyStrict<
      TConfig,
      CursorPaginatedConfigNoSearch<TSchema, TTableConfig>
    > &
      EnforcedConfig<TConfig, TTableConfig, THasIndex>
  ): GelRelationalQuery<
    TSchema,
    TTableConfig,
    PaginatedResult<BuildQueryResult<TSchema, TTableConfig, TConfig>>
  >;
  findMany<
    TConfig extends NonCursorConfigNoRelationCount<TSchema, TTableConfig>,
  >(
    config?: KnownKeysOnly<
      TConfig,
      NonCursorConfigNoSearch<TSchema, TTableConfig>
    > &
      EnforcedConfig<TConfig, TTableConfig, THasIndex>
  ): GelRelationalQuery<
    TSchema,
    TTableConfig,
    FindManyResult<TSchema, TTableConfig, TConfig>
  >;
  findMany<TConfig extends KeyPageConfig<TSchema, TTableConfig>>(
    config: KnownKeysOnlyStrict<TConfig, KeyPageConfig<TSchema, TTableConfig>> &
      EnforcedConfig<TConfig, TTableConfig, THasIndex>
  ): GelRelationalQuery<
    TSchema,
    TTableConfig,
    KeyPageResult<BuildQueryResult<TSchema, TTableConfig, TConfig>>
  >;
  findMany(config?: any): GelRelationalQuery<TSchema, TTableConfig, any> {
    if (config && (config as { pipeline?: unknown }).pipeline !== undefined) {
      throw new Error(
        'findMany({ pipeline }) is removed; use db.query.<table>.select() chain instead'
      );
    }

    return this.createQuery<any>(
      config
        ? (config as DBQueryConfig<'many', true, TSchema, TTableConfig>)
        : ({} as DBQueryConfig<'many', true, TSchema, TTableConfig>),
      'many'
    );
  }

  /**
   * Find first row matching the query configuration
   * Automatically applies limit: 1
   *
   * @template TConfig - Query configuration type (without limit)
   * @param config - Optional query configuration (columns, with, where, orderBy, offset)
   * @returns Query promise that resolves to single result or null
   *
   * @example
   * const user = await ctx.db.query.users.findFirst({
   *   where: { email: 'alice@example.com' },
   *   with: { profile: true }
   * });
   */
  findFirst<TConfig extends SearchFindFirstConfig<TSchema, TTableConfig>>(
    config: KnownKeysOnlyStrict<
      TConfig,
      SearchFindFirstConfig<TSchema, TTableConfig>
    > &
      DisallowWithIndexSearchOrVector<THasIndex>
  ): GelRelationalQuery<
    TSchema,
    TTableConfig,
    BuildQueryResult<TSchema, TTableConfig, TConfig> | null
  >;
  findFirst<TConfig extends FindFirstConfigNoSearch<TSchema, TTableConfig>>(
    config?: KnownKeysOnlyStrict<
      TConfig,
      FindFirstConfigNoSearch<TSchema, TTableConfig>
    > &
      EnforcedConfig<TConfig, TTableConfig, THasIndex>
  ): GelRelationalQuery<
    TSchema,
    TTableConfig,
    BuildQueryResult<TSchema, TTableConfig, TConfig> | null
  >;
  findFirst(config?: any): GelRelationalQuery<TSchema, TTableConfig, any> {
    if (config && (config as { pipeline?: unknown }).pipeline !== undefined) {
      throw new Error(
        'findMany({ pipeline }) is removed; use db.query.<table>.select() chain instead'
      );
    }

    return this.createQuery<any>(
      {
        ...(config
          ? (config as DBQueryConfig<'many', true, TSchema, TTableConfig>)
          : ({} as DBQueryConfig<'many', true, TSchema, TTableConfig>)),
        limit: 1,
      },
      'first'
    );
  }

  /**
   * Find first row matching the query configuration, or throw if none exists.
   *
   * This is the ergonomic companion to `findFirst()` (Prisma-style),
   * useful when callers expect a row to exist.
   */
  findFirstOrThrow<
    TConfig extends SearchFindFirstConfig<TSchema, TTableConfig>,
  >(
    config: KnownKeysOnlyStrict<
      TConfig,
      SearchFindFirstConfig<TSchema, TTableConfig>
    > &
      DisallowWithIndexSearchOrVector<THasIndex>
  ): GelRelationalQuery<
    TSchema,
    TTableConfig,
    BuildQueryResult<TSchema, TTableConfig, TConfig>
  >;
  findFirstOrThrow<
    TConfig extends FindFirstConfigNoSearch<TSchema, TTableConfig>,
  >(
    config?: KnownKeysOnlyStrict<
      TConfig,
      FindFirstConfigNoSearch<TSchema, TTableConfig>
    > &
      EnforcedConfig<TConfig, TTableConfig, THasIndex>
  ): GelRelationalQuery<
    TSchema,
    TTableConfig,
    BuildQueryResult<TSchema, TTableConfig, TConfig>
  >;
  findFirstOrThrow(
    config?: any
  ): GelRelationalQuery<TSchema, TTableConfig, any> {
    if (config && (config as { pipeline?: unknown }).pipeline !== undefined) {
      throw new Error(
        'findMany({ pipeline }) is removed; use db.query.<table>.select() chain instead'
      );
    }

    return this.createQuery<any>(
      {
        ...(config
          ? (config as DBQueryConfig<'many', true, TSchema, TTableConfig>)
          : ({} as DBQueryConfig<'many', true, TSchema, TTableConfig>)),
        limit: 1,
      },
      'firstOrThrow'
    );
  }
}
