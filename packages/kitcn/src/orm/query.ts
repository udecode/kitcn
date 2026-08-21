/**
 * GelRelationalQuery - Promise-based query builder
 *
 * Implements Drizzle's query pattern for Convex:
 * - Extends QueryPromise for lazy execution
 * - Stores query configuration
 * - Executes Convex queries on await
 */

import type { GenericDatabaseReader } from 'convex/server';
import { compareValues } from 'convex/values';
import { mapWithConcurrency } from '../internal/concurrency';
import {
  AGGREGATE_ERROR,
  COUNT_ERROR,
  createAggregateError,
  createCountError,
  ensureAggregateAllowedForRls,
  ensureCountAllowedForRls,
} from './aggregate-index/errors';
// Value-level imports of the aggregate-index runtime would put ~7k lines of
// btree/backfill code in every Convex function bundle. The runtime arrives
// through the aggregate capability instead; these stay type-only so the module
// graph edge is erased. See ./capabilities.
import type { PlanBucketReadCache } from './aggregate-index/runtime';
import { type ColumnBuilder, entityKind } from './builders/column-builder';
import type { OrmAggregateCapability } from './capabilities';
import { requireAggregateCapability } from './capabilities';
import {
  compileConvexFilter,
  convexAnd,
  isConvexEnforceableFilter,
} from './convex-filter-compiler';
import { OrmNotFoundError } from './errors';
import type { EdgeMetadata } from './extractRelationsConfig';
import type { FilterExpression } from './filter-expression';
import {
  and,
  arrayContained,
  arrayContains,
  arrayOverlaps,
  between,
  column,
  contains,
  endsWith,
  eq,
  filterValueInList,
  filterValuesEqual,
  gt,
  gte,
  ilike,
  inArray,
  isFieldReference,
  isNotNull,
  isNull,
  like,
  lt,
  lte,
  matchLikePattern,
  ne,
  not,
  notBetween,
  notIlike,
  notInArray,
  notLike,
  or,
  startsWith,
} from './filter-expression';
import {
  findRelationIndex,
  findSearchIndexByName,
  findVectorIndexByName,
  getIndexes,
  resolveIndexOrderPushdown,
} from './index-utils';
import {
  getOrmContext,
  hydrateDateFieldsForRead,
  normalizeTemporalComparableValue,
} from './mutation-utils';
import { asc, desc } from './order-by';
import { getPage } from './pagination';
import { QueryPromise } from './query-promise';
import type { RelationsFieldFilter, RelationsFilter } from './relations';
import {
  assertRlsRolesResolvable,
  createRlsPolicyResolutionCache,
  filterSelectRows,
  isRlsEnabled,
} from './rls/evaluator';
import type { RlsContext } from './rls/types';
import {
  EmptyStream,
  getIndexFields,
  type IndexBounds,
  indexKeyWithinBounds,
  mergedStream,
  QueryStream,
  stream,
} from './stream';
import {
  Columns,
  OrmSchemaDefinition,
  type TablePolymorphicConfigRuntime,
} from './symbols';
import {
  CREATED_AT_MIGRATION_MESSAGE,
  INTERNAL_CREATION_TIME_FIELD,
  PUBLIC_CREATED_AT_FIELD,
  usesSystemCreatedAtAlias,
} from './timestamp-mode';
import type {
  DBQueryConfig,
  FilterOperators,
  FindManyPipelineConfig,
  FindManyPipelineFlatMapStage,
  FindManyUnionSource,
  IndexKey,
  OrderByClause,
  OrderByValue,
  PredicateWhereClause,
  PredicateWhereIndexConfig,
  TableRelationalConfig,
  TablesRelationalConfig,
  ValueOrArray,
  VectorSearchProvider,
  WhereCallback,
} from './types';
import {
  type IndexStrategy,
  MAX_INDEX_UNION_PROBES,
  WhereClauseCompiler,
} from './where-clause-compiler';

const DEFAULT_RELATION_FAN_OUT_MAX_KEYS = 1000;
/**
 * How many child rows the bounded relation stream filters at a time. Batching
 * lets the sub-relation loader de-duplicate foreign keys and run its reads
 * concurrently; the cost is reading at most `chunk - 1` rows past the one that
 * satisfies the limit.
 */
const RELATION_FILTER_STREAM_CHUNK = 32;
const DEFAULT_AGGREGATE_CARTESIAN_MAX_KEYS = 4096;
const DEFAULT_AGGREGATE_WORK_BUDGET = 16_384;
const PUBLIC_ID_FIELD = 'id';
const INTERNAL_ID_FIELD = '_id';
const ID_MIGRATION_MESSAGE = '`_id` is no longer public. Use `id` instead.';
const RELATION_COUNT_ERROR = {
  NOT_INDEXED: 'RELATION_COUNT_NOT_INDEXED',
  FILTER_UNSUPPORTED: 'RELATION_COUNT_FILTER_UNSUPPORTED',
} as const;
const RELATION_DEPTH_ERROR = 'RELATION_DEPTH_EXCEEDED';
/**
 * How many levels of `with` the relation loader will follow. A `with` config is
 * a finite object the caller wrote, so its own nesting is the real bound; this
 * ceiling only stops a self-referential config from recursing forever. Reaching
 * it throws rather than returning a shallower tree than was asked for, because
 * a page that quietly drops its deepest level is indistinguishable from a page
 * whose deepest level is genuinely empty.
 */
const MAX_RELATION_DEPTH = 10;

/**
 * Physical-table-name lookup, keyed on schema identity. The schema is a
 * module-level immutable, so the index outlives any single request.
 */
const tableConfigByDbNameCache = new WeakMap<
  object,
  Map<string, TableRelationalConfig>
>();

/**
 * Read memos shared by every row of one `with._count` relation. Both are keyed
 * on data that is constant for that relation, so a hit is always the answer the
 * row would have computed for itself.
 */
type RelationCountCaches = {
  /** Aggregate bucket documents, deduped across rows resolving to one bucket. */
  buckets: PlanBucketReadCache;
  /** Target key -> does that target satisfy the count's `where`. */
  throughTargetMatches: Map<string, Promise<boolean>>;
};

/** A `where` that filters on nothing but the primary key. */
type IdOnlyWhere = { kind: 'eq'; id: unknown } | { kind: 'in'; ids: unknown[] };

type GroupByOrderSpec = {
  direction: 'asc' | 'desc';
  label: string;
  path: string[];
};

/** One value of one `by` field: what the group reports, and what reads it. */
type GroupBySlot = {
  key: unknown;
  filter: unknown;
  probeCount: number;
};

type GroupByCandidate = {
  key: Record<string, unknown>;
  probeCount: number;
  where: Record<string, unknown>;
};

/**
 * Replays an already-read run of `[doc | null, indexKey]` entries.
 *
 * `narrow()` filters the buffer instead of re-issuing the read, so a stream
 * that had to be consumed to be sized is not consumed twice.
 */
class BufferedQueryStream<
  T extends NonNullable<unknown>,
> extends QueryStream<T> {
  constructor(
    private readonly entries: readonly [T | null, IndexKey][],
    private readonly order: 'asc' | 'desc',
    private readonly indexFields: string[],
    private readonly equalityIndexFilter: any[]
  ) {
    super();
  }

  iterWithKeys(): AsyncIterable<[T | null, IndexKey]> {
    const entries = this.entries;
    return {
      [Symbol.asyncIterator]() {
        let index = 0;
        return {
          next() {
            if (index >= entries.length) {
              return Promise.resolve({
                done: true as const,
                value: undefined,
              });
            }
            const value = entries[index] as [T | null, IndexKey];
            index += 1;
            return Promise.resolve({ done: false as const, value });
          },
        };
      },
    };
  }

  narrow(indexBounds: IndexBounds): QueryStream<T> {
    return new BufferedQueryStream(
      this.entries.filter(([, indexKey]) =>
        indexKeyWithinBounds(indexKey, indexBounds)
      ),
      this.order,
      this.indexFields,
      this.equalityIndexFilter
    );
  }

  getOrder(): 'asc' | 'desc' {
    return this.order;
  }

  getIndexFields(): string[] {
    return this.indexFields;
  }

  getEqualityIndexFilter(): any[] {
    return this.equalityIndexFilter;
  }
}

const ID_LIST_POSITION_FIELD = '__kitcn_id_list_position';

/**
 * Reads an `id` / `id in [...]` where one document at a time, in the order the
 * ids were given.
 *
 * The index key is the position in the de-duplicated id list, so a cursor names
 * a position and `narrow` drops entries without reading them. A page reads only
 * the listed positions it visits, not every id in the list on every page.
 */
class LazyIdListQueryStream<
  T extends NonNullable<unknown>,
> extends QueryStream<T> {
  constructor(
    private readonly readId: (id: unknown) => Promise<T | null>,
    /** `[position in the id list, id]`, in emission order. */
    private readonly entries: readonly (readonly [number, unknown])[],
    private readonly order: 'asc' | 'desc'
  ) {
    super();
  }

  iterWithKeys(): AsyncIterable<[T | null, IndexKey]> {
    const entries = this.entries;
    const readId = this.readId;
    return {
      async *[Symbol.asyncIterator]() {
        for (const [position, id] of entries) {
          // An id that resolves to nothing still yields, so it counts towards
          // maxScan and advances the cursor like any other skipped row.
          yield [await readId(id), [position]] as [T | null, IndexKey];
        }
      },
    };
  }

  narrow(indexBounds: IndexBounds): QueryStream<T> {
    return new LazyIdListQueryStream<T>(
      this.readId,
      this.entries.filter(([position]) =>
        indexKeyWithinBounds([position], indexBounds)
      ),
      this.order
    );
  }

  getOrder(): 'asc' | 'desc' {
    return this.order;
  }

  getIndexFields(): string[] {
    return [ID_LIST_POSITION_FIELD];
  }

  getEqualityIndexFilter(): any[] {
    return [];
  }
}

const PIPELINE_LIMIT_ORDINAL_FIELD = '__kitcn_limit_ordinal';

/** Cap a stream at its first `limit` matching documents without eager reads. */
class LimitedMatchesQueryStream<
  T extends NonNullable<unknown>,
> extends QueryStream<T> {
  constructor(
    private readonly inner: QueryStream<T>,
    private readonly limit: number,
    private readonly priorMatches = 0
  ) {
    super();
  }

  iterWithKeys(): AsyncIterable<[T | null, IndexKey]> {
    const inner = this.inner;
    const limit = this.limit;
    const priorMatches = this.priorMatches;
    return {
      async *[Symbol.asyncIterator]() {
        let matched = priorMatches;
        if (matched >= limit) return;

        for await (const [doc, indexKey] of inner.iterWithKeys()) {
          if (doc !== null) matched += 1;
          yield [doc, [...indexKey, matched]] as [T | null, IndexKey];
          if (matched >= limit) return;
        }
      },
    };
  }

  narrow(indexBounds: IndexBounds): QueryStream<T> {
    const innerFieldCount = this.inner.getIndexFields().length;
    const startBound =
      this.getOrder() === 'asc'
        ? indexBounds.lowerBound
        : indexBounds.upperBound;
    const ordinal = startBound[innerFieldCount];
    const priorMatches =
      typeof ordinal === 'number' && Number.isInteger(ordinal) && ordinal >= 0
        ? Math.max(this.priorMatches, ordinal)
        : this.priorMatches;

    return new LimitedMatchesQueryStream(
      this.inner.narrow({
        lowerBound: indexBounds.lowerBound.slice(0, innerFieldCount),
        lowerBoundInclusive: indexBounds.lowerBoundInclusive,
        upperBound: indexBounds.upperBound.slice(0, innerFieldCount),
        upperBoundInclusive: indexBounds.upperBoundInclusive,
      }),
      this.limit,
      priorMatches
    );
  }

  getOrder(): 'asc' | 'desc' {
    return this.inner.getOrder();
  }

  getIndexFields(): string[] {
    return [...this.inner.getIndexFields(), PIPELINE_LIMIT_ORDINAL_FIELD];
  }

  getEqualityIndexFilter(): any[] {
    return this.inner.getEqualityIndexFilter();
  }
}

export class GelRankQuery<
  TTableConfig extends TableRelationalConfig = TableRelationalConfig,
> {
  constructor(
    private readonly db: GenericDatabaseReader<any>,
    private readonly tableConfig: TTableConfig,
    private readonly indexName: string,
    private readonly config: {
      where?: Record<string, unknown>;
    } = {},
    private readonly rls?: RlsContext
  ) {}

  private async _plan() {
    const aggregate = requireAggregateCapability(
      getOrmContext(this.db as any)?.capabilities,
      'rank()'
    );
    aggregate.ensureRankAllowedForRls(this.tableConfig, this.rls?.mode);
    const plan = aggregate.compileRankPlan(
      this.tableConfig,
      this.indexName,
      this.config.where
    );
    await aggregate.ensureRankIndexReady(
      this.db,
      this.tableConfig.name,
      this.indexName
    );
    return { aggregate, plan };
  }

  async count(): Promise<number> {
    const { aggregate, plan } = await this._plan();
    return await aggregate.readRankCount(this.db, plan);
  }

  async sum(): Promise<number> {
    const { aggregate, plan } = await this._plan();
    return await aggregate.readRankSum(this.db, plan);
  }

  async at(
    offset: number
  ): Promise<{ id: string; key: unknown; sumValue: number } | null> {
    const { aggregate, plan } = await this._plan();
    return await aggregate.readRankAt(this.db, plan, offset);
  }

  async indexOf(args: { id: string }): Promise<number> {
    const { aggregate, plan } = await this._plan();
    return await aggregate.readRankIndexOf(this.db, plan, args);
  }

  async paginate(args: { cursor?: string | null; limit: number }): Promise<{
    continueCursor: string;
    isDone: boolean;
    page: Array<{ id: string; key: unknown; sumValue: number }>;
  }> {
    if (!Number.isInteger(args.limit) || args.limit < 1) {
      throw new Error('rank().paginate() requires a positive integer limit.');
    }
    const { aggregate, plan } = await this._plan();
    return await aggregate.readRankPaginate(
      this.db,
      plan,
      args.cursor ?? null,
      args.limit
    );
  }

  async min(): Promise<{ id: string; key: unknown; sumValue: number } | null> {
    const { aggregate, plan } = await this._plan();
    return await aggregate.readRankMin(this.db, plan);
  }

  async max(): Promise<{ id: string; key: unknown; sumValue: number } | null> {
    const { aggregate, plan } = await this._plan();
    return await aggregate.readRankMax(this.db, plan);
  }

  async random(): Promise<{
    id: string;
    key: unknown;
    sumValue: number;
  } | null> {
    const { aggregate, plan } = await this._plan();
    return await aggregate.readRankRandom(this.db, plan);
  }
}

type ConfiguredIndexRangeOperation = {
  field: string;
  operator: 'eq' | 'gt' | 'gte' | 'lt' | 'lte';
};

const CONFIGURED_INDEX_RANGE_OPERATORS = new Set<
  ConfiguredIndexRangeOperation['operator']
>(['eq', 'gt', 'gte', 'lt', 'lte']);

const observeConfiguredIndexRange = (
  builder: any,
  operations: ConfiguredIndexRangeOperation[]
): any =>
  new Proxy(builder, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (
        typeof property === 'string' &&
        CONFIGURED_INDEX_RANGE_OPERATORS.has(
          property as ConfiguredIndexRangeOperation['operator']
        ) &&
        typeof value === 'function'
      ) {
        return (field: string, ...args: unknown[]) => {
          operations.push({
            field,
            operator: property as ConfiguredIndexRangeOperation['operator'],
          });
          return observeConfiguredIndexRange(
            Reflect.apply(value, target, [field, ...args]),
            operations
          );
        };
      }
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });

const countConfiguredIndexEqPrefix = (
  indexFields: readonly string[] | null | undefined,
  operations: readonly ConfiguredIndexRangeOperation[]
) => {
  if (!indexFields) {
    return 0;
  }
  let count = 0;
  for (const operation of operations) {
    if (operation.operator !== 'eq' || operation.field !== indexFields[count]) {
      break;
    }
    count += 1;
  }
  return count;
};

/**
 * The read `_toConvexQuery` compiled, in full.
 *
 * Every site that turns a plan into a read takes this whole shape rather than a
 * narrowed view of it. A narrowed parameter type is how `probeFilters` came to
 * be silently dropped at each stream site: the plan carried an index union and
 * the builder's signature could not even name it, so `if (queryConfig.index)`
 * walked the index with no range at all.
 */
type CompiledQueryPlan = {
  table: string;
  strategy: IndexStrategy;
  index?: {
    name: string;
    fields: string[];
    filters: FilterExpression<boolean>[];
  };
  /** One index range per probe for `in`/`ne`/`notIn`/same-field `OR` plans. */
  probeFilters: FilterExpression<boolean>[][];
  postFilters: FilterExpression<boolean>[];
  order?: { direction: 'asc' | 'desc'; field: string }[];
};

/**
 * Relational query builder with promise-based execution
 *
 * @template TResult - The final result type after execution
 *
 * Pattern from Drizzle: gel-core/query-builders/query.ts:32-62
 */
export class GelRelationalQuery<
  TSchema extends TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig,
  TResult,
> extends QueryPromise<TResult> {
  /**
   * Type brand for result type extraction
   * Critical for Expect<Equal<>> type tests to work correctly
   * Following Drizzle pattern: allows TypeScript to infer result type before await
   */
  declare readonly _: {
    readonly result: TResult;
  };
  private allowFullScan: boolean;
  /**
   * Set synchronously by the first `execute()`. Later executions run on a fresh
   * instance instead, which is what keeps execution-scoped state from leaking
   * between two awaits of the same query object.
   */
  private _executionClaimed = false;
  /**
   * Scoped to one execution, because `_executionClaimed` diverts every later
   * execution to its own instance. Within a run, every `_applyRlsSelectFilter`
   * call shares it, including the streaming sites that pass a single row at a
   * time — those would otherwise re-resolve the whole policy set per row.
   *
   * SECURITY: a resolved policy expression can embed database state that a
   * later write invalidates, so it must never outlive the execution that
   * resolved it.
   */
  private readonly _rlsPolicyResolution = createRlsPolicyResolutionCache();
  /**
   * Assigned in the constructor so callers that run many short-lived query
   * instances against the same tables (mutation `returning({ _count })`) can
   * share one readiness memo instead of re-probing per instance.
   */
  private readonly _countIndexReadinessByKey: Map<string, Promise<void>>;
  /**
   * Index readiness is a probe memo, not execution state, so `_forExecution`
   * hands it to the next run rather than re-probing.
   */
  private _aggregateIndexReadinessByKey = new Map<string, Promise<void>>();

  constructor(
    private schema: TSchema,
    private tableConfig: TTableConfig,
    private edgeMetadata: EdgeMetadata[],
    private db: GenericDatabaseReader<any>,
    private config: DBQueryConfig<
      'one' | 'many',
      boolean,
      TSchema,
      TTableConfig
    >,
    private mode:
      | 'many'
      | 'first'
      | 'firstOrThrow'
      | 'count'
      | 'aggregate'
      | 'groupBy',
    private _allEdges?: EdgeMetadata[], // M6.5 Phase 2: All edges for nested loading
    private rls?: RlsContext,
    private relationLoading?: { concurrency?: number },
    private vectorSearchProvider?: VectorSearchProvider,
    private configuredIndex?: PredicateWhereIndexConfig<TTableConfig>,
    countIndexReadiness?: Map<string, Promise<void>>
  ) {
    super();
    this.allowFullScan = (config as any).allowFullScan === true;
    this._countIndexReadinessByKey = countIndexReadiness ?? new Map();
  }

  /**
   * The aggregate-index runtime, registered at `createOrm()`.
   *
   * Only `count()`, `aggregate()` and relation counts reach this; plain reads
   * never touch the aggregate runtime, which is why it is injected rather than
   * statically imported.
   */
  private _aggregate(usage: string): OrmAggregateCapability {
    return requireAggregateCapability(
      getOrmContext(this.db as any)?.capabilities,
      usage
    );
  }

  private _usesSystemCreatedAtAlias(
    tableConfig: TableRelationalConfig = this.tableConfig
  ): boolean {
    return usesSystemCreatedAtAlias(tableConfig.table);
  }

  private _assertNoLegacyPublicFieldName(fieldName: string): void {
    if (fieldName === INTERNAL_ID_FIELD) {
      throw new Error(ID_MIGRATION_MESSAGE);
    }
    if (fieldName === INTERNAL_CREATION_TIME_FIELD) {
      throw new Error(CREATED_AT_MIGRATION_MESSAGE);
    }
  }

  private _normalizePublicFieldName(
    fieldName: string,
    _tableConfig: TableRelationalConfig = this.tableConfig
  ): string {
    this._assertNoLegacyPublicFieldName(fieldName);
    if (fieldName === PUBLIC_ID_FIELD) {
      return INTERNAL_ID_FIELD;
    }
    if (fieldName === PUBLIC_CREATED_AT_FIELD) {
      return INTERNAL_CREATION_TIME_FIELD;
    }
    return fieldName;
  }

  private _normalizeRelationFieldName(fieldName: string): string {
    if (fieldName === PUBLIC_ID_FIELD) {
      return INTERNAL_ID_FIELD;
    }
    if (fieldName === PUBLIC_CREATED_AT_FIELD) {
      return INTERNAL_CREATION_TIME_FIELD;
    }
    return fieldName;
  }

  private _toPublicFilterFieldName(fieldName: string): string {
    if (fieldName === INTERNAL_ID_FIELD) {
      return PUBLIC_ID_FIELD;
    }
    if (fieldName === INTERNAL_CREATION_TIME_FIELD) {
      return PUBLIC_CREATED_AT_FIELD;
    }
    return fieldName;
  }

  private _normalizeComparableValue(
    fieldName: string,
    value: unknown,
    tableConfig: TableRelationalConfig = this.tableConfig
  ): unknown {
    if (fieldName === INTERNAL_CREATION_TIME_FIELD) {
      if (value instanceof Date) {
        return value.getTime();
      }
      if (Array.isArray(value)) {
        return value.map((item) =>
          item instanceof Date ? item.getTime() : item
        );
      }
      return value;
    }

    return normalizeTemporalComparableValue(
      tableConfig.table as any,
      fieldName,
      value
    );
  }

  private _toPublicRow<T>(
    row: T,
    tableConfig: TableRelationalConfig = this.tableConfig
  ): T {
    return hydrateDateFieldsForRead(tableConfig.table as any, row);
  }

  private _extractIdOnlyWhere(where: unknown): IdOnlyWhere | null {
    if (!where || typeof where !== 'object' || Array.isArray(where)) {
      return null;
    }
    const keys = Object.keys(where as Record<string, unknown>);
    for (const key of keys) {
      this._assertNoLegacyPublicFieldName(key);
    }
    if (keys.length !== 1 || keys[0] !== PUBLIC_ID_FIELD) {
      return null;
    }

    const value = (where as any).id as unknown;
    if (value === null || value === undefined) {
      return { kind: 'eq', id: value };
    }

    // Support operator-style filters: { id: { eq: id } } and { id: { in: ids } }.
    if (typeof value === 'object' && !Array.isArray(value)) {
      const opKeys = Object.keys(value as Record<string, unknown>);
      if (opKeys.length !== 1) {
        return null;
      }
      const op = opKeys[0];
      if (op === 'eq') {
        return { kind: 'eq', id: (value as any).eq };
      }
      if (op === 'in') {
        const ids = (value as any).in;
        if (!Array.isArray(ids)) {
          return null;
        }
        return { kind: 'in', ids };
      }
      return null;
    }

    // Direct equality: { id }.
    if (Array.isArray(value)) {
      return null;
    }
    return { kind: 'eq', id: value };
  }

  private _returnSelectedRows(selectedRows: any[]): TResult {
    if (this.mode === 'many') {
      return selectedRows as TResult;
    }

    const first = selectedRows[0];
    if (this.mode === 'firstOrThrow' && first === undefined) {
      throw new OrmNotFoundError(
        `Could not find ${this.tableConfig.name}.`,
        this.tableConfig.name
      );
    }
    return (first ?? null) as TResult;
  }

  private async _applyRlsSelectFilter(
    rows: any[],
    tableConfig?: TableRelationalConfig
  ): Promise<any[]> {
    if (!tableConfig) return rows;
    // Empty result sets still reach `filterSelectRows` so policy configuration
    // is validated independently of what the table currently stores.
    return await filterSelectRows({
      cache: this._rlsPolicyResolution,
      table: tableConfig.table as any,
      rows,
      rls: this.rls,
    });
  }

  private _isColumnBuilder(
    value: unknown
  ): value is ColumnBuilder<any, any, any> {
    return (
      !!value &&
      typeof value === 'object' &&
      (value as any)[entityKind] === 'ColumnBuilder'
    );
  }

  private _isOrderByClause(value: unknown): value is OrderByClause<any> {
    return (
      !!value &&
      typeof value === 'object' &&
      'direction' in (value as any) &&
      !!(value as any).column?.columnName
    );
  }

  private _normalizeOrderByValue(value: OrderByValue): OrderByClause<any> {
    if (this._isOrderByClause(value)) {
      return value;
    }
    if (this._isColumnBuilder(value)) {
      return asc(value);
    }
    throw new Error('Invalid orderBy value. Use a column or asc()/desc().');
  }

  private _normalizeOrderBy(
    orderBy: ValueOrArray<OrderByValue> | undefined
  ): OrderByClause<any>[] {
    if (!orderBy) return [];
    const items = Array.isArray(orderBy) ? orderBy : [orderBy];
    return items
      .filter((item): item is OrderByValue => item !== undefined)
      .map((item) => this._normalizeOrderByValue(item));
  }

  private _orderBySpecs(
    orderBy:
      | ValueOrArray<OrderByValue>
      | Record<string, 'asc' | 'desc' | undefined>
      | undefined,
    tableConfig: TableRelationalConfig = this.tableConfig
  ): { field: string; direction: 'asc' | 'desc' }[] {
    if (
      orderBy &&
      typeof orderBy === 'object' &&
      !Array.isArray(orderBy) &&
      !this._isOrderByClause(orderBy) &&
      !this._isColumnBuilder(orderBy)
    ) {
      return Object.entries(orderBy)
        .map(([field, direction]) => ({
          field: this._normalizePublicFieldName(field, tableConfig),
          direction,
        }))
        .filter(
          (
            entry
          ): entry is {
            field: string;
            direction: 'asc' | 'desc';
          } => entry.direction === 'asc' || entry.direction === 'desc'
        )
        .map((entry) => ({
          field: entry.field,
          direction: entry.direction,
        }));
    }

    return this._normalizeOrderBy(
      orderBy as ValueOrArray<OrderByValue> | undefined
    ).map((clause) => ({
      field: clause.column.columnName,
      direction: clause.direction,
    }));
  }

  private _resolveNonPaginatedLimit(config: any): number | undefined {
    const explicitLimit = config.limit;
    const contextDefaultLimit = getOrmContext(this.db as any)?.resolvedDefaults
      ?.defaultLimit;
    const defaultLimit =
      contextDefaultLimit ?? this.tableConfig.defaults?.defaultLimit;
    const resolvedLimit = explicitLimit ?? defaultLimit;

    if (resolvedLimit === undefined) {
      if (this.allowFullScan) {
        return;
      }
      throw new Error(
        'findMany() requires explicit sizing. Provide limit, provide cursor + limit for cursor pagination, allowFullScan: true, or defineSchema(..., { defaults: { defaultLimit } }).'
      );
    }

    if (!Number.isInteger(resolvedLimit) || resolvedLimit < 1) {
      throw new Error('Only positive integer limit is supported in kitcn ORM.');
    }

    return resolvedLimit;
  }

  private _compareByOrderSpecs(
    a: any,
    b: any,
    orders: { field: string; direction: 'asc' | 'desc' }[]
  ): number {
    for (const order of orders) {
      const aVal = a[order.field];
      const bVal = b[order.field];

      if (aVal === null || aVal === undefined) {
        if (bVal === null || bVal === undefined) continue;
        return 1;
      }
      if (bVal === null || bVal === undefined) {
        return -1;
      }

      if (aVal < bVal) {
        return order.direction === 'asc' ? -1 : 1;
      }
      if (aVal > bVal) {
        return order.direction === 'asc' ? 1 : -1;
      }
    }
    return 0;
  }

  /**
   * Physical table name to relational config. Called once per row on the
   * relation-count path, so the linear schema scan is indexed once per schema
   * object rather than repeated. The schema is fixed for the process lifetime.
   */
  private _getTableConfigByDbName(
    dbName: string
  ): TableRelationalConfig | undefined {
    let byDbName = tableConfigByDbNameCache.get(this.schema as object);
    if (!byDbName) {
      byDbName = new Map<string, TableRelationalConfig>();
      for (const table of Object.values(
        this.schema
      ) as TableRelationalConfig[]) {
        if (table?.name && !byDbName.has(table.name)) {
          byDbName.set(table.name, table);
        }
      }
      tableConfigByDbNameCache.set(this.schema as object, byDbName);
    }
    return byDbName.get(dbName);
  }

  private _matchLike(
    value: string,
    pattern: string,
    caseInsensitive: boolean
  ): boolean {
    return matchLikePattern(value, pattern, caseInsensitive);
  }

  /**
   * True when the expression can be fully enforced by Convex's own `.filter()`.
   *
   * `_toConvexExpression` compiles the string/array operators to `() => true`
   * because Convex filters cannot run JavaScript string methods; those are
   * evaluated later by `_evaluatePostFetchFilter`. Pushing such an expression
   * into `.filter()` is not merely useless, it is wrong in two ways: a `take()`
   * downstream spends its budget on rows that have not been filtered yet, and a
   * surrounding `NOT` turns the `true` placeholder into `q.not(true)`, which
   * matches nothing. So the caller must know whether Convex can carry the whole
   * expression before relying on it.
   */
  private _isConvexEnforceableFilter(
    filter: FilterExpression<boolean>
  ): boolean {
    return isConvexEnforceableFilter(filter);
  }

  /**
   * Evaluate a filter expression against a fetched row
   * Used for post-fetch filtering (string operators, etc.)
   */
  private _evaluatePostFetchFilter(
    row: any,
    filter: FilterExpression<boolean>
  ): boolean {
    if (filter.type === 'binary') {
      const [field, value] = filter.operands;
      if (!isFieldReference(field)) {
        throw new Error(
          'Binary expression must have FieldReference as first operand'
        );
      }

      const fieldName = field.fieldName;
      const fieldValue = row[fieldName];
      const normalizedValue = this._normalizeComparableValue(fieldName, value);
      const comparableValue = normalizedValue as any;

      switch (filter.operator) {
        case 'like': {
          const pattern = normalizedValue as string;
          if (typeof fieldValue !== 'string') return false;
          return this._matchLike(fieldValue, pattern, false);
        }
        case 'ilike': {
          const pattern = normalizedValue as string;
          if (typeof fieldValue !== 'string') return false;
          return this._matchLike(fieldValue, pattern, true);
        }
        case 'notLike': {
          const pattern = normalizedValue as string;
          if (typeof fieldValue !== 'string') return false;
          return !this._matchLike(fieldValue, pattern, false);
        }
        case 'notIlike': {
          const pattern = normalizedValue as string;
          if (typeof fieldValue !== 'string') return false;
          return !this._matchLike(fieldValue, pattern, true);
        }
        case 'startsWith': {
          if (typeof fieldValue !== 'string') return false;
          return fieldValue.startsWith(normalizedValue as string);
        }
        case 'endsWith': {
          if (typeof fieldValue !== 'string') return false;
          return fieldValue.endsWith(normalizedValue as string);
        }
        case 'contains': {
          if (typeof fieldValue !== 'string') return false;
          return fieldValue.includes(normalizedValue as string);
        }
        // Basic operators fallback (shouldn't reach here normally)
        case 'eq':
          return filterValuesEqual(fieldValue, normalizedValue);
        case 'ne':
          return !filterValuesEqual(fieldValue, normalizedValue);
        case 'gt':
          return fieldValue > comparableValue;
        case 'gte':
          return fieldValue >= comparableValue;
        case 'lt':
          return fieldValue < comparableValue;
        case 'lte':
          return fieldValue <= comparableValue;
        case 'inArray':
          return filterValueInList(fieldValue, normalizedValue as any[]);
        case 'notInArray':
          return !filterValueInList(fieldValue, normalizedValue as any[]);
        case 'arrayContains': {
          if (!Array.isArray(fieldValue)) return false;
          const arr = normalizedValue as any[];
          return arr.every((item) => fieldValue.includes(item));
        }
        case 'arrayContained': {
          if (!Array.isArray(fieldValue)) return false;
          const arr = normalizedValue as any[];
          return fieldValue.every((item) => arr.includes(item));
        }
        case 'arrayOverlaps': {
          if (!Array.isArray(fieldValue)) return false;
          const arr = normalizedValue as any[];
          return arr.some((item) => fieldValue.includes(item));
        }
        default:
          throw new Error(
            `Unsupported post-fetch operator: ${filter.operator}`
          );
      }
    }

    if (filter.type === 'unary') {
      const [operand] = filter.operands;

      // Handle null checks on field references
      if (isFieldReference(operand)) {
        const fieldName = operand.fieldName;
        const fieldValue = row[fieldName];

        switch (filter.operator) {
          case 'isNull':
            return fieldValue === null || fieldValue === undefined;
          case 'isNotNull':
            return fieldValue !== null && fieldValue !== undefined;
          default:
            throw new Error(`Unsupported unary operator: ${filter.operator}`);
        }
      }

      // Handle NOT operator on nested expressions
      if (filter.operator === 'not') {
        return !this._evaluatePostFetchFilter(
          row,
          operand as FilterExpression<boolean>
        );
      }

      throw new Error(
        'Unary expression must have FieldReference or FilterExpression as operand'
      );
    }

    if (filter.type === 'logical') {
      if (filter.operator === 'and') {
        return filter.operands.every((f) =>
          this._evaluatePostFetchFilter(row, f)
        );
      }
      if (filter.operator === 'or') {
        return filter.operands.some((f) =>
          this._evaluatePostFetchFilter(row, f)
        );
      }
    }

    throw new Error(`Unsupported filter type for post-fetch: ${filter.type}`);
  }

  private _isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  private _isPlaceholder(value: unknown): boolean {
    return this._isRecord(value) && '__placeholder' in value;
  }

  private _isSQLWrapper(value: unknown): boolean {
    return this._isRecord(value) && '__sqlWrapper' in value;
  }

  private _evaluateFieldFilter(
    fieldValue: any,
    filter: RelationsFieldFilter,
    fieldName?: string
  ): boolean {
    if (filter === undefined) return true;

    if (this._isPlaceholder(filter) || this._isSQLWrapper(filter)) {
      throw new Error('SQL placeholders are not supported in Convex filters.');
    }

    if (filter instanceof Date) {
      return fieldValue === filter.getTime();
    }

    if (
      filter === null ||
      typeof filter !== 'object' ||
      Array.isArray(filter)
    ) {
      if (fieldName) {
        return filterValuesEqual(
          fieldValue,
          this._normalizeComparableValue(fieldName, filter)
        );
      }
      return filterValuesEqual(fieldValue, filter);
    }

    const entries = Object.entries(filter as Record<string, any>);
    if (!entries.length) return true;

    const results: boolean[] = [];

    for (const [op, value] of entries) {
      if (value === undefined) continue;

      switch (op) {
        case 'NOT': {
          results.push(
            !this._evaluateFieldFilter(fieldValue, value, fieldName)
          );
          continue;
        }
        case 'OR': {
          if (!Array.isArray(value) || value.length === 0) continue;
          results.push(
            value.some((sub) =>
              this._evaluateFieldFilter(fieldValue, sub, fieldName)
            )
          );
          continue;
        }
        case 'AND': {
          if (!Array.isArray(value) || value.length === 0) continue;
          results.push(
            value.every((sub) =>
              this._evaluateFieldFilter(fieldValue, sub, fieldName)
            )
          );
          continue;
        }
        case 'isNull': {
          if (!value) continue;
          results.push(fieldValue === null || fieldValue === undefined);
          continue;
        }
        case 'isNotNull': {
          if (!value) continue;
          results.push(fieldValue !== null && fieldValue !== undefined);
          continue;
        }
        case 'in': {
          if (!Array.isArray(value)) {
            results.push(false);
            continue;
          }
          const normalized = fieldName
            ? this._normalizeComparableValue(fieldName, value)
            : value;
          results.push(filterValueInList(fieldValue, normalized as any[]));
          continue;
        }
        case 'notIn': {
          if (!Array.isArray(value)) {
            results.push(false);
            continue;
          }
          const normalized = fieldName
            ? this._normalizeComparableValue(fieldName, value)
            : value;
          results.push(!filterValueInList(fieldValue, normalized as any[]));
          continue;
        }
        case 'arrayContains': {
          if (!Array.isArray(fieldValue) || !Array.isArray(value)) {
            results.push(false);
            continue;
          }
          results.push(value.every((item) => fieldValue.includes(item)));
          continue;
        }
        case 'arrayContained': {
          if (!Array.isArray(fieldValue) || !Array.isArray(value)) {
            results.push(false);
            continue;
          }
          results.push(fieldValue.every((item) => value.includes(item)));
          continue;
        }
        case 'arrayOverlaps': {
          if (!Array.isArray(fieldValue) || !Array.isArray(value)) {
            results.push(false);
            continue;
          }
          results.push(value.some((item) => fieldValue.includes(item)));
          continue;
        }
        case 'like': {
          if (typeof fieldValue !== 'string' || typeof value !== 'string') {
            results.push(false);
            continue;
          }
          results.push(this._matchLike(fieldValue, value, false));
          continue;
        }
        case 'ilike': {
          if (typeof fieldValue !== 'string' || typeof value !== 'string') {
            results.push(false);
            continue;
          }
          results.push(this._matchLike(fieldValue, value, true));
          continue;
        }
        case 'notLike': {
          if (typeof fieldValue !== 'string' || typeof value !== 'string') {
            results.push(false);
            continue;
          }
          results.push(!this._matchLike(fieldValue, value, false));
          continue;
        }
        case 'notIlike': {
          if (typeof fieldValue !== 'string' || typeof value !== 'string') {
            results.push(false);
            continue;
          }
          results.push(!this._matchLike(fieldValue, value, true));
          continue;
        }
        case 'startsWith': {
          if (typeof fieldValue !== 'string' || typeof value !== 'string') {
            results.push(false);
            continue;
          }
          results.push(fieldValue.startsWith(value));
          continue;
        }
        case 'endsWith': {
          if (typeof fieldValue !== 'string' || typeof value !== 'string') {
            results.push(false);
            continue;
          }
          results.push(fieldValue.endsWith(value));
          continue;
        }
        case 'contains': {
          if (typeof fieldValue !== 'string' || typeof value !== 'string') {
            results.push(false);
            continue;
          }
          results.push(fieldValue.includes(value));
          continue;
        }
        case 'eq':
          results.push(
            filterValuesEqual(
              fieldValue,
              fieldName
                ? this._normalizeComparableValue(fieldName, value)
                : value
            )
          );
          continue;
        case 'ne':
          results.push(
            !filterValuesEqual(
              fieldValue,
              fieldName
                ? this._normalizeComparableValue(fieldName, value)
                : value
            )
          );
          continue;
        case 'gt':
          results.push(
            fieldValue >
              (fieldName
                ? this._normalizeComparableValue(fieldName, value)
                : value)
          );
          continue;
        case 'gte':
          results.push(
            fieldValue >=
              (fieldName
                ? this._normalizeComparableValue(fieldName, value)
                : value)
          );
          continue;
        case 'lt':
          results.push(
            fieldValue <
              (fieldName
                ? this._normalizeComparableValue(fieldName, value)
                : value)
          );
          continue;
        case 'lte':
          results.push(
            fieldValue <=
              (fieldName
                ? this._normalizeComparableValue(fieldName, value)
                : value)
          );
          continue;
        case 'between': {
          if (!Array.isArray(value) || value.length !== 2) {
            results.push(false);
            continue;
          }
          const [min, max] = (
            fieldName ? this._normalizeComparableValue(fieldName, value) : value
          ) as [any, any];
          results.push(fieldValue >= min && fieldValue <= max);
          continue;
        }
        case 'notBetween': {
          if (!Array.isArray(value) || value.length !== 2) {
            results.push(false);
            continue;
          }
          const [min, max] = (
            fieldName ? this._normalizeComparableValue(fieldName, value) : value
          ) as [any, any];
          results.push(fieldValue < min || fieldValue > max);
          continue;
        }
        default:
          throw new Error(`Unsupported field operator: ${op}`);
      }
    }

    return results.every(Boolean);
  }

  private _evaluateTableFilter(
    row: any,
    tableConfig: TableRelationalConfig,
    filter: Record<string, unknown>
  ): boolean {
    if (!this._isRecord(filter)) return true;

    const entries = Object.entries(filter);
    if (!entries.length) return true;

    const columns = this._getColumns(tableConfig);
    const results: boolean[] = [];

    for (const [key, value] of entries) {
      if (value === undefined) continue;

      switch (key) {
        case 'RAW':
          throw new Error('RAW filters are not supported in Convex.');
        case 'OR':
          if (!Array.isArray(value) || value.length === 0) continue;
          {
            const subFilters = value.filter((sub) => this._isRecord(sub));
            if (!subFilters.length) continue;
            results.push(
              subFilters.some((sub) =>
                this._evaluateTableFilter(row, tableConfig, sub)
              )
            );
          }
          continue;
        case 'AND':
          if (!Array.isArray(value) || value.length === 0) continue;
          {
            const subFilters = value.filter((sub) => this._isRecord(sub));
            if (!subFilters.length) continue;
            results.push(
              subFilters.every((sub) =>
                this._evaluateTableFilter(row, tableConfig, sub)
              )
            );
          }
          continue;
        case 'NOT':
          results.push(
            !this._evaluateTableFilter(row, tableConfig, value as any)
          );
          continue;
        default: {
          this._assertNoLegacyPublicFieldName(key);
          if (!(key in columns)) {
            throw new Error(`Unknown filter column: "${key}"`);
          }
          const normalizedFieldName = this._normalizePublicFieldName(
            key,
            tableConfig
          );
          results.push(
            this._evaluateFieldFilter(
              row[normalizedFieldName],
              value as any,
              normalizedFieldName
            )
          );
        }
      }
    }

    return results.every(Boolean);
  }

  private _evaluateRelationsFilter(
    row: any,
    tableConfig: TableRelationalConfig,
    filter: RelationsFilter<any, any>
  ): boolean {
    if (!this._isRecord(filter)) return true;

    const entries = Object.entries(filter);
    if (!entries.length) return true;

    const columns = this._getColumns(tableConfig);
    const results: boolean[] = [];

    for (const [key, value] of entries) {
      if (value === undefined) continue;

      switch (key) {
        case 'RAW':
          throw new Error('RAW filters are not supported in Convex.');
        case 'OR':
          if (!Array.isArray(value) || value.length === 0) continue;
          {
            const subFilters = value.filter((sub) => this._isRecord(sub));
            if (!subFilters.length) continue;
            results.push(
              subFilters.some((sub) =>
                this._evaluateRelationsFilter(row, tableConfig, sub)
              )
            );
          }
          continue;
        case 'AND':
          if (!Array.isArray(value) || value.length === 0) continue;
          {
            const subFilters = value.filter((sub) => this._isRecord(sub));
            if (!subFilters.length) continue;
            results.push(
              subFilters.every((sub) =>
                this._evaluateRelationsFilter(row, tableConfig, sub)
              )
            );
          }
          continue;
        case 'NOT':
          results.push(
            !this._evaluateRelationsFilter(row, tableConfig, value as any)
          );
          continue;
        default: {
          this._assertNoLegacyPublicFieldName(key);
          if (key in columns) {
            const normalizedFieldName = this._normalizePublicFieldName(
              key,
              tableConfig
            );
            results.push(
              this._evaluateFieldFilter(
                row[normalizedFieldName],
                value as any,
                normalizedFieldName
              )
            );
            continue;
          }

          const relation = tableConfig.relations[key];
          if (!relation) {
            throw new Error(`Unknown relational filter field: "${key}"`);
          }

          const targetTableConfig = this._getTableConfigByDbName(
            relation.targetTableName
          );
          if (!targetTableConfig) {
            throw new Error(
              `Missing table config for relation "${key}" -> "${relation.targetTableName}"`
            );
          }

          const relatedValue = row[key];
          if (typeof value === 'boolean') {
            if (relation.relationType === 'one') {
              results.push(value ? !!relatedValue : !relatedValue);
            } else {
              results.push(
                value
                  ? Array.isArray(relatedValue) && relatedValue.length > 0
                  : !Array.isArray(relatedValue) || relatedValue.length === 0
              );
            }
            continue;
          }

          if (relation.relationType === 'one') {
            if (!relatedValue) {
              results.push(false);
              continue;
            }
            results.push(
              this._evaluateRelationsFilter(
                relatedValue,
                targetTableConfig,
                value as any
              )
            );
            continue;
          }

          if (!Array.isArray(relatedValue) || relatedValue.length === 0) {
            results.push(false);
            continue;
          }

          results.push(
            relatedValue.some((target) =>
              this._evaluateRelationsFilter(
                target,
                targetTableConfig,
                value as any
              )
            )
          );
        }
      }
    }

    return results.every(Boolean);
  }

  private _buildFieldFilterExpression(
    fieldName: string,
    tableConfig: TableRelationalConfig,
    filter: RelationsFieldFilter
  ): FilterExpression<boolean> | undefined {
    if (filter === undefined) return;

    if (this._isPlaceholder(filter) || this._isSQLWrapper(filter)) {
      throw new Error('SQL placeholders are not supported in Convex filters.');
    }
    this._assertNoLegacyPublicFieldName(fieldName);

    const columns = this._getColumns(tableConfig);
    const columnBuilder = columns[fieldName];
    if (!columnBuilder) {
      throw new Error(`Unknown filter column: "${fieldName}"`);
    }

    const normalizedFieldName = this._normalizePublicFieldName(
      fieldName,
      tableConfig
    );
    const normalizeValue = (value: unknown): unknown =>
      this._normalizeComparableValue(normalizedFieldName, value, tableConfig);

    const columnRef = column(columnBuilder, normalizedFieldName);

    if (
      filter instanceof Date ||
      filter === null ||
      typeof filter !== 'object' ||
      Array.isArray(filter)
    ) {
      return eq(columnRef, normalizeValue(filter));
    }

    const entries = Object.entries(filter as Record<string, any>);
    if (!entries.length) return;

    const parts: FilterExpression<boolean>[] = [];

    for (const [op, value] of entries) {
      if (value === undefined) continue;

      switch (op) {
        case 'NOT': {
          const expr = this._buildFieldFilterExpression(
            fieldName,
            tableConfig,
            value
          );
          if (expr) parts.push(not(expr));
          continue;
        }
        case 'OR': {
          if (!Array.isArray(value) || value.length === 0) continue;
          const subs = value
            .map((sub) =>
              this._buildFieldFilterExpression(fieldName, tableConfig, sub)
            )
            .filter(Boolean) as FilterExpression<boolean>[];
          if (subs.length) {
            parts.push(or(...subs)!);
          }
          continue;
        }
        case 'AND': {
          if (!Array.isArray(value) || value.length === 0) continue;
          const subs = value
            .map((sub) =>
              this._buildFieldFilterExpression(fieldName, tableConfig, sub)
            )
            .filter(Boolean) as FilterExpression<boolean>[];
          if (subs.length) {
            parts.push(and(...subs)!);
          }
          continue;
        }
        case 'isNull':
          if (value) parts.push(isNull(columnRef));
          continue;
        case 'isNotNull':
          if (value) parts.push(isNotNull(columnRef));
          continue;
        case 'in':
          if (Array.isArray(value)) {
            parts.push(inArray(columnRef, normalizeValue(value) as any));
          }
          continue;
        case 'notIn':
          if (Array.isArray(value)) {
            parts.push(notInArray(columnRef, normalizeValue(value) as any));
          }
          continue;
        case 'arrayContains':
          parts.push(arrayContains(columnRef, value));
          continue;
        case 'arrayContained':
          parts.push(arrayContained(columnRef, value));
          continue;
        case 'arrayOverlaps':
          parts.push(arrayOverlaps(columnRef, value));
          continue;
        case 'like':
          parts.push(like(columnRef, value));
          continue;
        case 'ilike':
          parts.push(ilike(columnRef, value));
          continue;
        case 'notLike':
          parts.push(notLike(columnRef, value));
          continue;
        case 'notIlike':
          parts.push(notIlike(columnRef, value));
          continue;
        case 'startsWith':
          parts.push(startsWith(columnRef, value));
          continue;
        case 'endsWith':
          parts.push(endsWith(columnRef, value));
          continue;
        case 'contains':
          parts.push(contains(columnRef, value));
          continue;
        case 'eq':
          parts.push(eq(columnRef, normalizeValue(value)));
          continue;
        case 'ne':
          parts.push(ne(columnRef, normalizeValue(value)));
          continue;
        case 'gt':
          parts.push(gt(columnRef, normalizeValue(value)));
          continue;
        case 'gte':
          parts.push(gte(columnRef, normalizeValue(value)));
          continue;
        case 'lt':
          parts.push(lt(columnRef, normalizeValue(value)));
          continue;
        case 'lte':
          parts.push(lte(columnRef, normalizeValue(value)));
          continue;
        case 'between':
          if (Array.isArray(value) && value.length === 2) {
            const normalized = normalizeValue(value) as [unknown, unknown];
            parts.push(between(columnRef, normalized[0], normalized[1]));
          }
          continue;
        case 'notBetween':
          if (Array.isArray(value) && value.length === 2) {
            const normalized = normalizeValue(value) as [unknown, unknown];
            parts.push(notBetween(columnRef, normalized[0], normalized[1]));
          }
          continue;
        default:
          throw new Error(`Unsupported field operator: ${op}`);
      }
    }

    if (!parts.length) return;
    if (parts.length === 1) return parts[0];
    return and(...parts);
  }

  private _buildFilterExpression(
    filter: RelationsFilter<any, any>,
    tableConfig: TableRelationalConfig
  ): FilterExpression<boolean> | undefined {
    if (!this._isRecord(filter)) return;

    const entries = Object.entries(filter);
    if (!entries.length) return;

    const columns = this._getColumns(tableConfig);
    const parts: FilterExpression<boolean>[] = [];

    for (const [key, value] of entries) {
      if (value === undefined) continue;

      switch (key) {
        case 'RAW':
          throw new Error('RAW filters are not supported in Convex.');
        case 'OR': {
          if (!Array.isArray(value) || value.length === 0) continue;
          const subs = value
            .map((sub) => this._buildFilterExpression(sub, tableConfig))
            .filter(Boolean) as FilterExpression<boolean>[];
          if (subs.length) parts.push(or(...subs)!);
          continue;
        }
        case 'AND': {
          if (!Array.isArray(value) || value.length === 0) continue;
          const subs = value
            .map((sub) => this._buildFilterExpression(sub, tableConfig))
            .filter(Boolean) as FilterExpression<boolean>[];
          if (subs.length) parts.push(and(...subs)!);
          continue;
        }
        case 'NOT': {
          const sub = this._buildFilterExpression(
            value as RelationsFilter<any, any>,
            tableConfig
          );
          if (sub) parts.push(not(sub));
          continue;
        }
        default: {
          this._assertNoLegacyPublicFieldName(key);
          if (!(key in columns)) {
            // Relation filter - skip in expression compilation
            continue;
          }
          const expr = this._buildFieldFilterExpression(
            key,
            tableConfig,
            value as RelationsFieldFilter
          );
          if (expr) parts.push(expr);
        }
      }
    }

    if (!parts.length) return;
    if (parts.length === 1) return parts[0];
    return and(...parts);
  }

  private _mergeWithConfig(
    target: Record<string, unknown>,
    source: Record<string, unknown>
  ): void {
    for (const [key, value] of Object.entries(source)) {
      if (!(key in target)) {
        target[key] = value;
        continue;
      }

      const existing = target[key];
      if (existing === true) {
        target[key] = value;
        continue;
      }
      if (value === true) {
        continue;
      }
      if (this._isRecord(existing) && this._isRecord(value)) {
        const existingWith = (existing as any).with;
        const valueWith = (value as any).with;
        if (this._isRecord(existingWith) && this._isRecord(valueWith)) {
          this._mergeWithConfig(existingWith, valueWith);
        } else if (this._isRecord(valueWith)) {
          (existing as any).with = valueWith;
        }
      }
    }
  }

  private _buildFilterWithConfig(
    filter: RelationsFilter<any, any>,
    tableConfig: TableRelationalConfig
  ): Record<string, unknown> {
    if (!this._isRecord(filter)) return {};

    const result: Record<string, unknown> = {};
    const entries = Object.entries(filter);
    if (!entries.length) return result;

    for (const [key, value] of entries) {
      if (value === undefined) continue;

      if (key === 'OR' || key === 'AND') {
        if (!Array.isArray(value) || value.length === 0) continue;
        for (const sub of value) {
          const nested = this._buildFilterWithConfig(
            sub as RelationsFilter<any, any>,
            tableConfig
          );
          this._mergeWithConfig(result, nested);
        }
        continue;
      }

      if (key === 'NOT') {
        const nested = this._buildFilterWithConfig(
          value as RelationsFilter<any, any>,
          tableConfig
        );
        this._mergeWithConfig(result, nested);
        continue;
      }
      this._assertNoLegacyPublicFieldName(key);

      const relation = tableConfig.relations[key];
      if (!relation) continue;

      if (typeof value === 'boolean') {
        result[key] = true;
        continue;
      }

      const targetTableConfig = this._getTableConfigByDbName(
        relation.targetTableName
      );
      if (!targetTableConfig) {
        continue;
      }

      const nested = this._buildFilterWithConfig(
        value as RelationsFilter<any, any>,
        targetTableConfig
      );
      result[key] = Object.keys(nested).length > 0 ? { with: nested } : true;
    }

    return result;
  }

  private _stripFilterRelations(
    rows: any[],
    filterWith: Record<string, unknown>,
    requestedWith?: Record<string, unknown>
  ): void {
    if (!rows.length) return;

    const filterKeys = Object.keys(filterWith);
    if (filterKeys.length === 0) return;

    for (const row of rows) {
      for (const key of filterKeys) {
        if (requestedWith && key in requestedWith) {
          continue;
        }
        delete row[key];
      }
    }
  }

  private _hasSearchDisallowedRelationFilter(
    filter: RelationsFilter<any, any> | undefined,
    tableConfig: TableRelationalConfig
  ): boolean {
    if (!this._isRecord(filter)) {
      return false;
    }

    const columns = this._getColumns(tableConfig);
    for (const [key, value] of Object.entries(filter)) {
      if (value === undefined) {
        continue;
      }

      if (key === 'OR' || key === 'AND') {
        if (!Array.isArray(value)) {
          continue;
        }
        if (
          value.some((sub) =>
            this._hasSearchDisallowedRelationFilter(
              sub as RelationsFilter<any, any>,
              tableConfig
            )
          )
        ) {
          return true;
        }
        continue;
      }

      if (key === 'NOT') {
        if (
          this._hasSearchDisallowedRelationFilter(
            value as RelationsFilter<any, any>,
            tableConfig
          )
        ) {
          return true;
        }
        continue;
      }

      if (key === 'RAW') {
        continue;
      }
      this._assertNoLegacyPublicFieldName(key);

      if (key in columns) {
        continue;
      }

      if (key in tableConfig.relations) {
        return true;
      }

      return true;
    }

    return false;
  }

  private _searchFilterValuesEqual(a: unknown, b: unknown): boolean {
    if (Object.is(a, b)) {
      return true;
    }
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }

  private _extractSearchEqFromWhereField(value: unknown): unknown {
    if (value === undefined) {
      return;
    }

    if (value instanceof Date) {
      return value;
    }

    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return value;
    }

    const record = value as Record<string, unknown>;
    if (!('eq' in record)) {
      return;
    }

    for (const [key, fieldValue] of Object.entries(record)) {
      if (key === 'eq') {
        continue;
      }
      if (fieldValue !== undefined) {
        return;
      }
    }

    return record.eq;
  }

  private _mergeSearchFiltersWithWhereEq(
    searchFilters: Record<string, unknown> | undefined,
    whereFilter: RelationsFilter<any, any> | undefined,
    tableConfig: TableRelationalConfig,
    allowedFilterFields: Set<string>
  ): Record<string, unknown> {
    const merged: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(searchFilters ?? {})) {
      const normalizedKey = this._normalizePublicFieldName(key, tableConfig);
      const normalizedValue = this._normalizeComparableValue(
        normalizedKey,
        value,
        tableConfig
      );
      if (
        normalizedKey in merged &&
        !this._searchFilterValuesEqual(merged[normalizedKey], normalizedValue)
      ) {
        throw new Error(
          `Conflict between search.filters.${normalizedKey} entries.`
        );
      }
      merged[normalizedKey] = normalizedValue;
    }

    if (!this._isRecord(whereFilter)) {
      return merged;
    }

    const columns = this._getColumns(tableConfig);
    for (const [key, value] of Object.entries(whereFilter)) {
      if (value === undefined) {
        continue;
      }
      if (key === 'OR' || key === 'AND' || key === 'NOT' || key === 'RAW') {
        continue;
      }
      const normalizedKey = this._normalizePublicFieldName(key, tableConfig);
      if (!(key in columns)) {
        continue;
      }
      if (!allowedFilterFields.has(normalizedKey)) {
        continue;
      }

      const eqValue = this._extractSearchEqFromWhereField(value);
      if (eqValue === undefined) {
        continue;
      }

      if (
        normalizedKey in merged &&
        !this._searchFilterValuesEqual(merged[normalizedKey], eqValue)
      ) {
        throw new Error(
          `Conflict between search.filters.${normalizedKey} and where.${key}.`
        );
      }

      merged[normalizedKey] = this._normalizeComparableValue(
        normalizedKey,
        eqValue,
        tableConfig
      );
    }

    return merged;
  }

  private async _applyRelationsFilterToRows(
    rows: any[],
    tableConfig: TableRelationalConfig,
    filter: RelationsFilter<any, any>,
    targetTableEdges: EdgeMetadata[],
    depth: number,
    maxDepth: number,
    requestedWith?: Record<string, unknown>
  ): Promise<any[]> {
    if (!rows.length) return rows;
    if (!this._isRecord(filter)) return rows;

    const filterWith = this._buildFilterWithConfig(filter, tableConfig);
    const hasFilterWith = Object.keys(filterWith).length > 0;

    if (hasFilterWith) {
      await this._loadRelations(
        rows,
        filterWith,
        depth,
        maxDepth,
        targetTableEdges,
        tableConfig
      );
    }

    const filtered = rows.filter((row) =>
      this._evaluateRelationsFilter(row, tableConfig, filter)
    );

    if (hasFilterWith) {
      this._stripFilterRelations(filtered, filterWith, requestedWith);
    }

    return filtered;
  }

  private _resolvePolymorphicFinalizeState(): {
    configs: readonly TablePolymorphicConfigRuntime[];
  } | null {
    const configs = this.tableConfig.polymorphic;
    if (!configs || configs.length === 0) {
      return null;
    }
    return { configs };
  }

  private _resolveWithVariantsState(
    requestedWith: Record<string, unknown> | undefined,
    polymorphicState: {
      configs: readonly TablePolymorphicConfigRuntime[];
    } | null
  ): {
    effectiveWith: Record<string, unknown> | undefined;
  } {
    const withVariants = (this.config as { withVariants?: unknown })
      .withVariants;
    if (withVariants === undefined || withVariants === false) {
      return { effectiveWith: requestedWith };
    }
    if (withVariants !== true) {
      throw new Error('withVariants currently supports only `true`.');
    }
    if (!polymorphicState) {
      throw new Error(
        `withVariants is only available on tables with discriminator(...) columns ('${this.tableConfig.name}').`
      );
    }

    const oneRelations = Object.entries(this.tableConfig.relations).filter(
      ([, relation]) => relation.relationType === 'one'
    );
    if (oneRelations.length === 0) {
      return { effectiveWith: requestedWith };
    }

    const autoWith = Object.fromEntries(
      oneRelations.map(([relationName]) => [relationName, true])
    );

    return {
      effectiveWith: requestedWith
        ? {
            ...autoWith,
            ...requestedWith,
          }
        : autoWith,
    };
  }

  private _assertPolymorphicAliasCollisions(
    configs: readonly TablePolymorphicConfigRuntime[],
    requestedWith: Record<string, unknown> | undefined,
    resolvedExtras: unknown
  ): void {
    const tableColumns = this._getColumns(this.tableConfig);
    const extras = this._isRecord(resolvedExtras) ? resolvedExtras : undefined;
    for (const config of configs) {
      if (config.alias in tableColumns) {
        throw new Error(
          `discriminator alias '${config.alias}' on '${this.tableConfig.name}' conflicts with an existing column.`
        );
      }
      if (config.alias in this.tableConfig.relations) {
        throw new Error(
          `discriminator alias '${config.alias}' on '${this.tableConfig.name}' conflicts with a relation.`
        );
      }
      if (requestedWith && config.alias in requestedWith) {
        throw new Error(
          `discriminator alias '${config.alias}' on '${this.tableConfig.name}' conflicts with with.${config.alias}.`
        );
      }
      if (extras && config.alias in extras) {
        throw new Error(
          `discriminator alias '${config.alias}' on '${this.tableConfig.name}' conflicts with extras.${config.alias}.`
        );
      }
    }
  }

  private _synthesizePolymorphicRows(
    rows: any[],
    configs: readonly TablePolymorphicConfigRuntime[]
  ): void {
    for (const row of rows) {
      for (const config of configs) {
        const discriminatorValue = row[config.discriminator];
        const caseKey = String(discriminatorValue);
        const variant = config.variants[caseKey];
        if (!variant) {
          throw new Error(
            `discriminator '${config.discriminator}' value '${caseKey}' has no matching variant on '${this.tableConfig.name}'.`
          );
        }

        const nested: Record<string, unknown> = {};
        for (const fieldName of variant.fieldNames) {
          nested[fieldName] = row[fieldName];
        }
        row[config.alias] = nested;
      }
    }
  }

  /**
   * Validate role-scoped policies for every table this read plan touches before
   * relations are loaded. Relation loaders skip work when a parent page is
   * empty, so per-row evaluation alone would make a misconfigured table fail
   * only once it holds rows. Mirrors the `_loadRelations` depth budget so the
   * plan walked here matches the plan that would be executed.
   */
  private _assertRlsSelectPlan(
    withConfig: Record<string, unknown> | undefined,
    tableConfig: TableRelationalConfig,
    edges: EdgeMetadata[],
    depth: number,
    maxDepth: number
  ): void {
    assertRlsRolesResolvable({
      table: tableConfig.table as any,
      operation: 'select',
      rls: this.rls,
    });

    if (!withConfig) return;

    const relationNames = Object.keys(withConfig).filter(
      (relationName) => relationName !== '_count'
    );
    if (relationNames.length > 0 && depth >= maxDepth) {
      throw this._createRelationDepthError(
        tableConfig,
        relationNames[0],
        maxDepth
      );
    }

    for (const [relationName, relationConfig] of Object.entries(withConfig)) {
      if (relationName === '_count') {
        this._assertRelationCountRlsPlan(relationConfig, edges);
        continue;
      }

      const edge = edges.find((entry) => entry.edgeName === relationName);
      // Unknown relations raise their own error while loading.
      if (!edge) continue;

      if (edge.through) {
        const throughTableConfig = this._getTableConfigByDbName(
          edge.through.table
        );
        if (throughTableConfig) {
          assertRlsRolesResolvable({
            table: throughTableConfig.table as any,
            operation: 'select',
            rls: this.rls,
          });
        }
      }

      const targetTableConfig = this._getTableConfigByDbName(edge.targetTable);
      if (!targetTableConfig) continue;

      let nestedWith: Record<string, unknown> | undefined;
      if (relationConfig && typeof relationConfig === 'object') {
        const configuredWith = (relationConfig as any).with;
        if (this._isRecord(configuredWith)) {
          nestedWith = { ...configuredWith };
        }

        const relationWhere = (relationConfig as any).where;
        if (relationWhere && typeof relationWhere !== 'function') {
          const filterWith = this._buildFilterWithConfig(
            relationWhere,
            targetTableConfig
          );
          if (Object.keys(filterWith).length > 0) {
            if (nestedWith) {
              this._mergeWithConfig(nestedWith, filterWith);
            } else {
              nestedWith = filterWith;
            }
          }
        }
      }

      this._assertRlsSelectPlan(
        nestedWith,
        targetTableConfig,
        this._getTargetTableEdges(edge.targetTable),
        depth + 1,
        maxDepth
      );
    }
  }

  private _assertRelationCountRlsPlan(
    relationCountConfig: unknown,
    edges: EdgeMetadata[]
  ): void {
    if (!this._isRecord(relationCountConfig)) return;

    for (const [relationName, relationSelection] of Object.entries(
      relationCountConfig
    )) {
      if (relationSelection === undefined || relationSelection === false) {
        continue;
      }

      const edge = edges.find((entry) => entry.edgeName === relationName);
      if (!edge) continue;

      const where = this._coerceRelationCountWhere(
        relationName,
        relationSelection
      );
      if (edge.through) {
        const throughTableConfig = this._getTableConfigByDbName(
          edge.through.table
        );
        if (throughTableConfig) {
          ensureCountAllowedForRls(throughTableConfig, this.rls?.mode as any);
        }
        if (this._isEmptyWhere(where) || where === undefined) continue;
      }

      const targetTableConfig = this._getTableConfigByDbName(edge.targetTable);
      if (targetTableConfig) {
        ensureCountAllowedForRls(targetTableConfig, this.rls?.mode as any);
      }
    }
  }

  private async _finalizeRows(rows: any[]): Promise<any[]> {
    const polymorphicState = this._resolvePolymorphicFinalizeState();
    const requestedWith = this.config.with as
      | Record<string, unknown>
      | undefined;
    const withVariantsState = this._resolveWithVariantsState(
      requestedWith,
      polymorphicState
    );
    const effectiveWith = withVariantsState.effectiveWith;
    const tableColumns = this._getColumns(this.tableConfig);
    const extrasConfig = (this.config as any).extras;
    const resolvedExtras =
      typeof extrasConfig === 'function'
        ? extrasConfig(tableColumns)
        : extrasConfig;

    if (polymorphicState) {
      this._assertPolymorphicAliasCollisions(
        polymorphicState.configs,
        requestedWith,
        resolvedExtras
      );
    }

    this._assertRlsSelectPlan(
      effectiveWith,
      this.tableConfig,
      this.edgeMetadata,
      0,
      MAX_RELATION_DEPTH
    );

    let rowsWithRelations = rows;
    if (effectiveWith) {
      rowsWithRelations = await this._loadRelations(
        rowsWithRelations,
        effectiveWith,
        0,
        MAX_RELATION_DEPTH,
        this.edgeMetadata,
        this.tableConfig
      );
    }

    if (polymorphicState) {
      this._synthesizePolymorphicRows(
        rowsWithRelations,
        polymorphicState.configs
      );
    }

    if (resolvedExtras) {
      rowsWithRelations = this._applyExtras(
        rowsWithRelations,
        resolvedExtras,
        tableColumns,
        effectiveWith,
        this.tableConfig.name,
        this.tableConfig
      );
    }

    return this._selectColumns(
      rowsWithRelations,
      (this.config as any).columns,
      tableColumns,
      this.tableConfig
    );
  }

  private _getSchemaDefinitionOrThrow() {
    const schemaDefinition = (this.schema as any)[OrmSchemaDefinition];
    if (!schemaDefinition) {
      throw new Error(
        'Advanced pagination requires defineSchema(). Ensure defineSchema(tables) was used with the same tables object passed to defineRelations.'
      );
    }
    return schemaDefinition;
  }

  private _applyEqBounds<TQueryBuilder>(
    q: TQueryBuilder,
    fields: string[],
    values: any[]
  ) {
    let builder: any = q;
    for (let i = 0; i < fields.length; i += 1) {
      builder = builder.eq(fields[i], values[i]);
    }
    return builder;
  }

  private _buildTableFilterPredicate(
    where: unknown,
    tableConfig: TableRelationalConfig
  ): ((row: any) => Promise<boolean>) | null {
    if (!where) {
      return null;
    }
    if (typeof where === 'function') {
      const whereResult = this._resolveWhereCallbackExpression(
        where as (...args: any[]) => unknown,
        tableConfig,
        { context: 'pipeline' }
      );
      if (!whereResult) {
        return null;
      }
      if (this._isPredicateWhereClause(whereResult)) {
        return async (row: any) => await whereResult.predicate(row);
      }
      return async (row: any) =>
        this._evaluatePostFetchFilter(row, whereResult);
    }
    return async (row: any) => {
      const expression = this._buildFilterExpression(
        where as RelationsFilter<any, any>,
        tableConfig
      );
      if (!expression) {
        return true;
      }
      return this._evaluatePostFetchFilter(row, expression);
    };
  }

  private _assertWhereIndexRequirement(options: {
    where: unknown;
    tableConfig: TableRelationalConfig;
    hasConfiguredIndex: boolean;
    context: string;
  }): void {
    const { where, tableConfig, hasConfiguredIndex, context } = options;
    if (!where) {
      return;
    }

    let whereExpression: FilterExpression<boolean> | undefined;

    if (typeof where === 'function') {
      const result = this._resolveWhereCallbackExpression(
        where as (...args: any[]) => unknown,
        tableConfig,
        { context: 'pipeline' }
      );
      if (!result) {
        return;
      }
      if (this._isPredicateWhereClause(result)) {
        if (!hasConfiguredIndex) {
          throw new Error(
            `${context} where uses predicate(...) and requires .withIndex(...).`
          );
        }
        return;
      }
      whereExpression = result;
    } else {
      whereExpression = this._buildFilterExpression(
        where as RelationsFilter<any, any>,
        tableConfig
      );
    }

    if (!whereExpression) {
      return;
    }

    return;
  }

  private _isFilterExpressionNode(
    value: unknown
  ): value is FilterExpression<boolean> {
    return (
      typeof value === 'object' &&
      value !== null &&
      'accept' in value &&
      typeof (value as { accept?: unknown }).accept === 'function'
    );
  }

  private _isPredicateWhereClause(
    value: unknown
  ): value is PredicateWhereClause<any> {
    return (
      typeof value === 'object' &&
      value !== null &&
      '__kind' in value &&
      (value as { __kind?: unknown }).__kind === 'predicate' &&
      'predicate' in value &&
      typeof (value as { predicate?: unknown }).predicate === 'function'
    );
  }

  private _createFilterOperators<TTableConfig extends TableRelationalConfig>(
    _tableConfig: TTableConfig
  ): FilterOperators<TTableConfig> {
    return {
      and,
      or,
      not,
      eq,
      ne,
      gt,
      gte,
      lt,
      lte,
      between,
      notBetween,
      inArray,
      notInArray,
      arrayContains,
      arrayContained,
      arrayOverlaps,
      isNull,
      isNotNull,
      like,
      ilike,
      notLike,
      notIlike,
      startsWith,
      endsWith,
      contains,
      predicate: (predicate) => ({
        __kind: 'predicate',
        predicate,
      }),
    };
  }

  private _resolveWhereCallbackExpression(
    whereFn: (...args: any[]) => unknown,
    tableConfig: TableRelationalConfig,
    { context }: { context: 'root' | 'relation' | 'pipeline' }
  ): FilterExpression<boolean> | PredicateWhereClause<any> | undefined {
    const maybeExpression = whereFn(
      tableConfig.table,
      this._createFilterOperators(tableConfig)
    );

    if (maybeExpression === undefined) {
      return;
    }

    if (this._isFilterExpressionNode(maybeExpression)) {
      return maybeExpression;
    }

    if (this._isPredicateWhereClause(maybeExpression)) {
      if (context === 'relation') {
        throw new Error(
          `${context} where callback does not support predicate(...). Return a filter expression.`
        );
      }
      return maybeExpression;
    }

    throw new Error(
      `${context} where callback must return a filter expression or predicate(...).`
    );
  }

  /**
   * Read an id-only `where` through the primary key instead of scanning for it.
   *
   * The where-clause compiler is built from declared indexes only, and `_id` is
   * never one of them, so an `id` filter can never be index-selected: it lands
   * in the post-filters and the stream walks the creation-time index until it
   * happens on the row. `db.get()` reads exactly the rows asked for.
   *
   * Rows come back in the order the ids were given, one read at a time. Missing
   * or policy-filtered ids still cost a read, but a page does not reread the
   * complete list. An `orderBy` on creation time is the exception: an id carries
   * no creation time, so every id must be read before the first row is placed.
   *
   * Returns null when something else already owns the read: a pinned index, an
   * index the compiler did select, a `where(predicate)`, or an `orderBy` that
   * walks a different index.
   */
  private async _buildIdLookupStream(params: {
    configuredIndex: PredicateWhereIndexConfig<TTableConfig> | undefined;
    idLookup: IdOnlyWhere | null;
    order: 'asc' | 'desc';
    queryConfig: {
      index?: { name: string; filters: FilterExpression<boolean>[] };
      order?: { direction: 'asc' | 'desc'; field: string }[];
    };
    wherePredicate: ((row: any) => boolean | Promise<boolean>) | undefined;
  }): Promise<QueryStream<any> | null> {
    const { configuredIndex, idLookup, order, queryConfig, wherePredicate } =
      params;

    if (
      !idLookup ||
      wherePredicate ||
      configuredIndex?.name ||
      queryConfig.index
    ) {
      return null;
    }

    const primaryOrder = queryConfig.order?.[0];
    if (primaryOrder && primaryOrder.field !== INTERNAL_CREATION_TIME_FIELD) {
      return null;
    }

    // De-duplicate ids for `in` semantics, matching the non-pipeline path.
    const ids =
      idLookup.kind === 'in'
        ? Array.from(
            new Map(
              idLookup.ids.map((id) => [String(id), id] as const)
            ).values()
          )
        : [idLookup.id];

    const readId = (id: unknown) => this._getById(this.tableConfig.name, id);

    if (!primaryOrder) {
      const entries = ids.map(
        (id, position) => [position, id] as readonly [number, unknown]
      );
      if (order === 'desc') {
        entries.reverse();
      }
      return new LazyIdListQueryStream<any>(readId, entries, order);
    }

    // Creation order is not derivable from an id, so an explicit orderBy has to
    // read the whole list before it can place the first row.
    const fetched = await this._mapWithConcurrency(ids, readId);
    const rows = fetched.filter((row): row is any => !!row);

    rows.sort(
      (a, b) =>
        compareValues(
          a[INTERNAL_CREATION_TIME_FIELD],
          b[INTERNAL_CREATION_TIME_FIELD]
        ) || compareValues(a[INTERNAL_ID_FIELD], b[INTERNAL_ID_FIELD])
    );
    if (order === 'desc') {
      rows.reverse();
    }

    return new BufferedQueryStream<any>(
      rows.map(
        (row) =>
          [
            row,
            [row[INTERNAL_CREATION_TIME_FIELD], row[INTERNAL_ID_FIELD]],
          ] as [any, IndexKey]
      ),
      order,
      [INTERNAL_CREATION_TIME_FIELD, INTERNAL_ID_FIELD],
      []
    );
  }

  /**
   * The declared index a stream read can walk to emit `field` in order.
   *
   * A stream orders by the index it scans, so only an index that leads with
   * the field produces that order.
   */
  private _findStreamOrderIndex(field: string) {
    return getIndexes(this.tableConfig.table).find(
      (index) => index.fields[0] === field
    );
  }

  /**
   * The compiled index union, as one ordered stream.
   *
   * Each probe is its own index range, so the union is only usable where the
   * merged order is the order the read has to produce. `mergedStream` orders by
   * a *suffix* of the index key, and a suffix may only drop key components the
   * probes all pin to a single value — so the requested field has to sit inside
   * the pinned run or immediately after it. Returns null when it does not, and
   * the caller falls back to the plan's plain index range or a bounded scan.
   */
  private _buildProbeUnionStream(params: {
    schemaDefinition: unknown;
    indexName: string;
    probeFilters: FilterExpression<boolean>[][];
    order: 'asc' | 'desc';
    /**
     * Field the merged stream must be ordered by. Callers pass the requested
     * `orderBy` field, or the index's own leading field when the read has no
     * `orderBy` and therefore inherits the scanned index's order.
     */
    orderField: string;
  }): QueryStream<any> | null {
    const { probeFilters } = params;
    // A merged stream registers every probe query up front and holds them open
    // for the life of the read, so a wide fan-out is worse here than the single
    // scan it would replace.
    if (
      probeFilters.length === 0 ||
      probeFilters.length > MAX_INDEX_UNION_PROBES
    ) {
      return null;
    }

    const streamIndexFields = getIndexFields(
      this.tableConfig.name as any,
      params.indexName as any,
      params.schemaDefinition as any
    );
    const pinned = this._indexEqPrefixCount({ probeFilters });
    let mergeOffset = -1;
    for (let i = 0; i <= pinned && i < streamIndexFields.length; i += 1) {
      if (streamIndexFields[i] === params.orderField) {
        mergeOffset = i;
        break;
      }
    }
    if (mergeOffset === -1) {
      return null;
    }

    const probeStreams = probeFilters.map((filters) =>
      stream(
        this.db as GenericDatabaseReader<any>,
        params.schemaDefinition as any
      )
        .query(this.tableConfig.name as any)
        .withIndex(params.indexName as any, (q: any) => {
          let indexQuery = q;
          for (const filter of filters) {
            indexQuery = this._applyFilterToQuery(indexQuery, filter);
          }
          return indexQuery;
        })
        .order(params.order)
    );

    return mergedStream(
      probeStreams as QueryStream<any>[],
      streamIndexFields.slice(mergeOffset)
    );
  }

  /**
   * The read the compiled plan describes, as a stream, with nothing filtered
   * yet.
   *
   * Precedence: the compiled index union, then the compiled index range, then
   * the caller's pinned `.withIndex(...)`, then an index that supplies the
   * requested order, then a full scan. The first two rungs can only ever refine
   * what the caller pinned — `_toConvexQuery` discards a compiled plan that
   * would displace a caller's index or its bounds before it gets here.
   *
   * `probeUnion` tells the caller the read is bounded by index ranges rather
   * than by scan length, which is what makes a scan budget unnecessary.
   */
  private _buildPlanStream(params: {
    queryConfig: CompiledQueryPlan;
    configuredIndex?: PredicateWhereIndexConfig<TTableConfig>;
    order: 'asc' | 'desc';
    primaryOrder?: { direction: 'asc' | 'desc'; field: string };
    /** Index to walk for the requested order when the plan pins none. */
    orderIndexName?: string | null;
    schemaDefinition: unknown;
  }): { stream: QueryStream<any>; probeUnion: boolean } {
    const { queryConfig, configuredIndex, order, primaryOrder } = params;

    if (queryConfig.index && queryConfig.probeFilters.length > 0) {
      const probeUnion = this._buildProbeUnionStream({
        schemaDefinition: params.schemaDefinition,
        indexName: queryConfig.index.name,
        probeFilters: queryConfig.probeFilters,
        order,
        // Without an `orderBy` the read inherits the order of whatever index it
        // walks, which for this plan is the union's own index.
        orderField: primaryOrder?.field ?? queryConfig.index.fields[0],
      });
      if (probeUnion) {
        return { stream: probeUnion, probeUnion: true };
      }
    }

    let streamQuery: any = stream(
      this.db as GenericDatabaseReader<any>,
      params.schemaDefinition as any
    ).query(this.tableConfig.name as any);

    if (queryConfig.index) {
      streamQuery = streamQuery.withIndex(
        queryConfig.index.name as any,
        (q: any) => {
          let indexQuery = q;
          for (const filter of queryConfig.index!.filters) {
            indexQuery = this._applyFilterToQuery(indexQuery, filter);
          }
          return indexQuery;
        }
      );
    } else if (configuredIndex?.name) {
      streamQuery = streamQuery.withIndex(
        configuredIndex.name as any,
        configuredIndex.range ? (configuredIndex.range as any) : (q: any) => q
      );
    } else if (params.orderIndexName) {
      streamQuery = streamQuery.withIndex(
        params.orderIndexName as any,
        (q: any) => q
      );
    }

    return { stream: streamQuery.order(order), probeUnion: false };
  }

  private _buildBasePipelineStream(
    queryConfig: CompiledQueryPlan,
    wherePredicate: ((row: any) => boolean | Promise<boolean>) | undefined,
    configuredIndex?: PredicateWhereIndexConfig<TTableConfig>
  ): QueryStream<any> {
    const schemaDefinition = this._getSchemaDefinitionOrThrow();
    const primaryOrder = queryConfig.order?.[0];

    let streamQuery: any = this._buildPlanStream({
      queryConfig,
      configuredIndex,
      order: primaryOrder?.direction ?? 'asc',
      primaryOrder,
      orderIndexName:
        primaryOrder && primaryOrder.field !== INTERNAL_CREATION_TIME_FIELD
          ? (this._findStreamOrderIndex(primaryOrder.field)?.name ?? null)
          : null,
      schemaDefinition,
    }).stream;

    if (queryConfig.postFilters.length > 0 || wherePredicate) {
      streamQuery = streamQuery.filterWith(async (row: any) => {
        for (const filter of queryConfig.postFilters) {
          if (!this._evaluatePostFetchFilter(row, filter)) {
            return false;
          }
        }
        if (wherePredicate) {
          return await wherePredicate(row);
        }
        return true;
      });
    }

    return streamQuery;
  }

  /**
   * Stream equivalent of the `db.query(...)` chain, used when a post-fetch
   * filter has to run in JavaScript before `limit` or a page boundary can be
   * applied. `filterWith` evaluates the predicate as rows are pulled, so
   * `take`/`paginate` size by matches instead of by scanned rows.
   *
   * It deliberately mirrors the index and order decisions the caller already
   * made for the plain query rather than re-deriving them, so switching to the
   * stream cannot change which index is scanned or in what direction.
   *
   * Returns null when the schema definition needed by `stream()` is missing;
   * the caller then falls back to its plain-query path.
   */
  private _buildResidualFilterStream(params: {
    queryConfig: CompiledQueryPlan;
    configuredIndex?: PredicateWhereIndexConfig<TTableConfig>;
    membershipFilter?: (row: any) => boolean | Promise<boolean>;
    orderIndexName: string | null;
    primaryOrder?: { direction: 'asc' | 'desc'; field: string };
    /** Direction to use when the query has no orderBy at all. */
    fallbackOrder: 'asc' | 'desc';
  }): QueryStream<any> | null {
    const schemaDefinition = (this.schema as any)[OrmSchemaDefinition];
    if (!schemaDefinition) {
      return null;
    }

    const {
      queryConfig,
      configuredIndex,
      membershipFilter,
      orderIndexName,
      primaryOrder,
      fallbackOrder,
    } = params;

    // Streams always need an explicit direction. The plain query leaves the
    // Convex default (ascending) when there is no orderBy in the non-paginated
    // path, and explicitly orders 'desc' in the cursor path, so the caller
    // supplies which of the two applies.
    let streamQuery: any = this._buildPlanStream({
      queryConfig,
      configuredIndex,
      order: primaryOrder ? primaryOrder.direction : fallbackOrder,
      primaryOrder,
      orderIndexName,
      schemaDefinition,
    }).stream;

    streamQuery = streamQuery.filterWith(async (row: any) => {
      for (const filter of queryConfig.postFilters) {
        if (!this._evaluatePostFetchFilter(row, filter)) {
          return false;
        }
      }
      return membershipFilter ? await membershipFilter(row) : true;
    });

    return streamQuery as QueryStream<any>;
  }

  private _buildUnionSourceStream(
    source: FindManyUnionSource<TTableConfig>,
    fallbackOrder: 'asc' | 'desc'
  ): QueryStream<any> {
    // A source that pins its own index owns its range; the chain-level
    // `.withIndex(...)` is only the default for sources that do not.
    const sourceIndex = source.index ?? this.configuredIndex;
    this._assertWhereIndexRequirement({
      where: source.where,
      tableConfig: this.tableConfig,
      hasConfiguredIndex: Boolean(sourceIndex?.name),
      context: 'pipeline.union source',
    });

    const schemaDefinition = this._getSchemaDefinitionOrThrow();
    let sourceStream: any = stream(
      this.db as GenericDatabaseReader<any>,
      schemaDefinition
    ).query(this.tableConfig.name as any);

    if (sourceIndex?.name) {
      sourceStream = sourceStream.withIndex(
        sourceIndex.name as any,
        sourceIndex.range ? (sourceIndex.range as any) : (q: any) => q
      );
    }

    sourceStream = sourceStream.order(fallbackOrder);

    const sourcePredicate = this._buildTableFilterPredicate(
      source.where,
      this.tableConfig
    );
    if (sourcePredicate) {
      sourceStream = sourceStream.filterWith(sourcePredicate);
    }

    return sourceStream;
  }

  private async _applyFlatMapStage(
    sourceStream: QueryStream<any>,
    stage: FindManyPipelineFlatMapStage<TTableConfig>['flatMap']
  ): Promise<QueryStream<any>> {
    const relationName = stage.relation as string;
    const edge = this.edgeMetadata.find((e) => e.edgeName === relationName);
    if (!edge) {
      throw new Error(
        `Pipeline flatMap relation '${relationName}' not found on table '${this.tableConfig.name}'.`
      );
    }
    if (edge.through) {
      throw new Error(
        `Pipeline flatMap does not yet support through() relations for '${relationName}'.`
      );
    }

    const sourceFields =
      edge.cardinality === 'one'
        ? edge.sourceFields.length > 0
          ? edge.sourceFields
          : [edge.fieldName]
        : edge.sourceFields.length > 0
          ? edge.sourceFields
          : ['_id'];
    const targetFields =
      edge.cardinality === 'one'
        ? edge.targetFields.length > 0
          ? edge.targetFields
          : ['_id']
        : edge.targetFields.length > 0
          ? edge.targetFields
          : [edge.fieldName];

    const targetTableConfig = this._getTableConfigByDbName(edge.targetTable);
    if (!targetTableConfig) {
      throw new Error(
        `Pipeline flatMap target table '${edge.targetTable}' not found.`
      );
    }
    assertRlsRolesResolvable({
      table: targetTableConfig.table as any,
      operation: 'select',
      rls: this.rls,
    });

    const strict = this.tableConfig.strict !== false;
    const useGetById = targetFields.length === 1 && targetFields[0] === '_id';
    const indexName = useGetById
      ? ('by_id' as string)
      : (findRelationIndex(
          targetTableConfig.table as any,
          targetFields,
          `${this.tableConfig.name}.${relationName}`,
          edge.targetTable,
          strict,
          this.allowFullScan
        ) as string | null);
    const outerOrder = sourceStream.getOrder();
    const schemaDefinition = this._getSchemaDefinitionOrThrow();
    const innerIndexFields = getIndexFields(
      edge.targetTable as any,
      ((indexName ?? 'by_creation_time') as any) ?? 'by_creation_time',
      schemaDefinition as any
    );
    if (
      stage.limit !== undefined &&
      (!Number.isInteger(stage.limit) || stage.limit < 1)
    ) {
      throw new Error('pipeline.flatMap.limit must be a positive integer');
    }
    const mappedIndexFields =
      stage.limit === undefined
        ? innerIndexFields
        : [...innerIndexFields, PIPELINE_LIMIT_ORDINAL_FIELD];
    const stageWherePredicate = this._buildTableFilterPredicate(
      stage.where,
      targetTableConfig
    );
    this._assertWhereIndexRequirement({
      where: stage.where,
      tableConfig: targetTableConfig,
      hasConfiguredIndex: Boolean(indexName),
      context: `pipeline.flatMap(${relationName})`,
    });

    return sourceStream.flatMap(async (parent: any) => {
      const values = sourceFields.map((field) => parent[field]);
      if (values.some((value) => value === null || value === undefined)) {
        return new EmptyStream<any>(outerOrder, mappedIndexFields);
      }

      let inner: any = stream(
        this.db as GenericDatabaseReader<any>,
        schemaDefinition
      ).query(edge.targetTable as any);

      if (indexName) {
        inner = inner.withIndex(indexName as any, (q: any) =>
          this._applyEqBounds(q, targetFields, values)
        );
      }
      inner = inner.order(outerOrder);

      if (stageWherePredicate) {
        inner = inner.filterWith(stageWherePredicate);
      }

      if (isRlsEnabled(targetTableConfig.table as any)) {
        inner = inner.filterWith(async (row: any) => {
          const visible = await this._applyRlsSelectFilter(
            [row],
            targetTableConfig
          );
          return visible.length === 1;
        });
      }

      if (stage.limit !== undefined) {
        inner = new LimitedMatchesQueryStream(inner, stage.limit);
      }

      if (stage.includeParent ?? true) {
        inner = inner.map(async (child: any) => ({ parent, child }));
      }

      return inner;
    }, mappedIndexFields);
  }

  private async _applyPipelineStages(
    baseStream: QueryStream<any>,
    pipeline: FindManyPipelineConfig<TSchema, TTableConfig>
  ): Promise<QueryStream<any>> {
    let streamQuery = baseStream;
    for (const stage of pipeline.stages ?? []) {
      if ('filterWith' in stage && typeof stage.filterWith === 'function') {
        streamQuery = streamQuery.filterWith(
          async (row: any) => await stage.filterWith(row)
        );
        continue;
      }
      if ('map' in stage && typeof stage.map === 'function') {
        streamQuery = streamQuery.map(
          async (row: any) => (await stage.map(row)) as any
        );
        continue;
      }
      if ('distinct' in stage) {
        streamQuery = streamQuery.distinct(stage.distinct.fields);
        continue;
      }
      if ('flatMap' in stage) {
        streamQuery = await this._applyFlatMapStage(streamQuery, stage.flatMap);
        continue;
      }
      throw new Error('Unknown pipeline stage in findMany().');
    }
    return streamQuery;
  }

  private async _tryNativeUnfilteredCount(): Promise<number | null> {
    const query = this.db.query(this.tableConfig.name as any) as any;
    if (typeof query?.count !== 'function') {
      return null;
    }
    try {
      return (await query.count()) as number;
    } catch {
      return null;
    }
  }

  private _executeCountRequiresObjectWhere(where: unknown): void {
    if (typeof where === 'function') {
      throw createCountError(
        COUNT_ERROR.FILTER_UNSUPPORTED,
        'count() callback where is not supported in v1. Use object filters only.'
      );
    }
  }

  private _normalizeAggregateFieldName(
    rawField: unknown,
    methodName = 'aggregate()'
  ): string {
    if (typeof rawField !== 'string' || rawField.length === 0) {
      throw createAggregateError(
        AGGREGATE_ERROR.FILTER_UNSUPPORTED,
        `${methodName} requires scalar field names.`
      );
    }
    const field = this._normalizePublicFieldName(rawField);
    const columnNames = new Set(
      Object.keys((this.tableConfig.table as any)[Columns] ?? {})
    );
    if (!columnNames.has(field)) {
      throw createAggregateError(
        AGGREGATE_ERROR.FILTER_UNSUPPORTED,
        `${methodName} field '${rawField}' is not a scalar column on '${this.tableConfig.name}'.`
      );
    }
    return field;
  }

  private _isEmptyWhere(where: unknown): boolean {
    return (
      where === undefined ||
      where === null ||
      (typeof where === 'object' &&
        !Array.isArray(where) &&
        Object.keys(where as Record<string, unknown>).length === 0)
    );
  }

  private _coerceAggregateReturnValue(
    fieldName: string,
    value: unknown
  ): unknown | null {
    if (value === null || value === undefined) {
      return null;
    }
    const hydrated = this._toPublicRow(
      {
        [fieldName]: value,
      },
      this.tableConfig
    ) as Record<string, unknown>;
    return hydrated[fieldName] ?? null;
  }

  private _coerceCountSelect(
    select: unknown
  ): { all: boolean; fields: string[] } | null {
    if (select === undefined) {
      return null;
    }
    if (!select || typeof select !== 'object' || Array.isArray(select)) {
      throw createCountError(
        COUNT_ERROR.FILTER_UNSUPPORTED,
        'count({ select }) requires an object.'
      );
    }

    let all = false;
    const fields: string[] = [];
    const scalarFields = new Set(
      Object.keys((this.tableConfig.table as any)[Columns] ?? {})
    );

    for (const [key, value] of Object.entries(
      select as Record<string, unknown>
    )) {
      if (value === undefined || value === false) {
        continue;
      }
      if (value !== true) {
        throw createCountError(
          COUNT_ERROR.FILTER_UNSUPPORTED,
          `count({ select }) key '${key}' must be true.`
        );
      }
      if (key === '_all') {
        all = true;
        continue;
      }
      const normalizedKey = this._normalizePublicFieldName(key);
      if (!scalarFields.has(normalizedKey)) {
        throw createCountError(
          COUNT_ERROR.FILTER_UNSUPPORTED,
          `count({ select }) key '${key}' is not a scalar field on '${this.tableConfig.name}'.`
        );
      }
      fields.push(normalizedKey);
    }

    return {
      all,
      fields: [...new Set(fields)],
    };
  }

  private _coerceCountWindowConfig(config: any): {
    where: unknown;
    skip: number;
    take: number | null;
    hasWindowBounds: boolean;
  } {
    this._executeCountRequiresObjectWhere(config.where);

    let where = this._isEmptyWhere(config.where) ? {} : config.where;

    const skipRaw = config.skip;
    const skip =
      skipRaw === undefined || skipRaw === null ? 0 : Number(skipRaw);
    if (!Number.isInteger(skip) || skip < 0) {
      throw createCountError(
        COUNT_ERROR.FILTER_UNSUPPORTED,
        'count({ skip }) must be a non-negative integer.'
      );
    }

    const takeRaw = config.take;
    let take: number | null = null;
    if (takeRaw !== undefined && takeRaw !== null) {
      const parsedTake = Number(takeRaw);
      if (!Number.isInteger(parsedTake) || parsedTake < 0) {
        throw createCountError(
          COUNT_ERROR.FILTER_UNSUPPORTED,
          'count({ take }) must be a non-negative integer.'
        );
      }
      take = parsedTake;
    }

    let resolvedOrderBy = config.orderBy;
    if (typeof resolvedOrderBy === 'function') {
      resolvedOrderBy = resolvedOrderBy(this.tableConfig.table as any, {
        asc,
        desc,
      });
    }
    const orderSpecs =
      resolvedOrderBy === undefined
        ? []
        : this._orderBySpecs(resolvedOrderBy, this.tableConfig);

    if (config.cursor !== undefined) {
      const cursor = config.cursor;
      if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) {
        throw createCountError(
          COUNT_ERROR.FILTER_UNSUPPORTED,
          'count({ cursor }) must be an object with one scalar field value.'
        );
      }
      if (orderSpecs.length === 0) {
        throw createCountError(
          COUNT_ERROR.FILTER_UNSUPPORTED,
          'count({ cursor }) requires count({ orderBy }).'
        );
      }
      if (orderSpecs.length > 1) {
        throw createCountError(
          COUNT_ERROR.FILTER_UNSUPPORTED,
          'count({ cursor }) supports exactly one orderBy field in v1.'
        );
      }

      const entries = Object.entries(cursor as Record<string, unknown>).filter(
        ([, value]) => value !== undefined
      );
      if (entries.length !== 1) {
        throw createCountError(
          COUNT_ERROR.FILTER_UNSUPPORTED,
          'count({ cursor }) must specify exactly one field.'
        );
      }

      const [rawCursorField, cursorValue] = entries[0]!;
      if (
        cursorValue === null ||
        Array.isArray(cursorValue) ||
        (typeof cursorValue === 'object' && cursorValue !== null)
      ) {
        throw createCountError(
          COUNT_ERROR.FILTER_UNSUPPORTED,
          'count({ cursor }) value must be a scalar (non-null) value.'
        );
      }

      const cursorField = this._normalizePublicFieldName(rawCursorField);
      const [{ field: orderField, direction }] = orderSpecs;
      if (cursorField !== orderField) {
        throw createCountError(
          COUNT_ERROR.FILTER_UNSUPPORTED,
          `count({ cursor }) field '${rawCursorField}' must match orderBy field '${orderField}'.`
        );
      }

      const operator = direction === 'desc' ? 'lt' : 'gt';
      const cursorWhere = {
        [this._toPublicFilterFieldName(orderField)]: {
          [operator]: cursorValue,
        },
      };
      where = this._isEmptyWhere(where)
        ? cursorWhere
        : {
            AND: [where, cursorWhere],
          };
    }

    return {
      where,
      skip,
      take,
      hasWindowBounds: skip > 0 || take !== null || config.cursor !== undefined,
    };
  }

  private _coerceAggregateWindowConfig(config: any): {
    where: unknown;
    skip: number;
    take: number | null;
    hasWindowBounds: boolean;
    hasSkipTakeBounds: boolean;
    hasCursor: boolean;
  } {
    if (typeof config.where === 'function') {
      throw createAggregateError(
        AGGREGATE_ERROR.FILTER_UNSUPPORTED,
        'aggregate() callback where is not supported in v1. Use object filters only.'
      );
    }

    let where = this._isEmptyWhere(config.where) ? {} : config.where;

    const skipRaw = config.skip;
    const skip =
      skipRaw === undefined || skipRaw === null ? 0 : Number(skipRaw);
    if (!Number.isInteger(skip) || skip < 0) {
      throw createAggregateError(
        AGGREGATE_ERROR.ARGS_UNSUPPORTED,
        'aggregate({ skip }) must be a non-negative integer.'
      );
    }

    const takeRaw = config.take;
    let take: number | null = null;
    if (takeRaw !== undefined && takeRaw !== null) {
      const parsedTake = Number(takeRaw);
      if (!Number.isInteger(parsedTake) || parsedTake < 0) {
        throw createAggregateError(
          AGGREGATE_ERROR.ARGS_UNSUPPORTED,
          'aggregate({ take }) must be a non-negative integer.'
        );
      }
      take = parsedTake;
    }

    let resolvedOrderBy = config.orderBy;
    if (typeof resolvedOrderBy === 'function') {
      resolvedOrderBy = resolvedOrderBy(this.tableConfig.table as any, {
        asc,
        desc,
      });
    }
    const orderSpecs =
      resolvedOrderBy === undefined
        ? []
        : this._orderBySpecs(resolvedOrderBy, this.tableConfig);

    const hasCursor = config.cursor !== undefined;
    if (hasCursor) {
      const cursor = config.cursor;
      if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) {
        throw createAggregateError(
          AGGREGATE_ERROR.ARGS_UNSUPPORTED,
          'aggregate({ cursor }) must be an object with one scalar field value.'
        );
      }
      if (orderSpecs.length === 0) {
        throw createAggregateError(
          AGGREGATE_ERROR.ARGS_UNSUPPORTED,
          'aggregate({ cursor }) requires aggregate({ orderBy }).'
        );
      }
      if (orderSpecs.length > 1) {
        throw createAggregateError(
          AGGREGATE_ERROR.ARGS_UNSUPPORTED,
          'aggregate({ cursor }) supports exactly one orderBy field in v1.'
        );
      }

      const entries = Object.entries(cursor as Record<string, unknown>).filter(
        ([, value]) => value !== undefined
      );
      if (entries.length !== 1) {
        throw createAggregateError(
          AGGREGATE_ERROR.ARGS_UNSUPPORTED,
          'aggregate({ cursor }) must specify exactly one field.'
        );
      }

      const [rawCursorField, cursorValue] = entries[0]!;
      if (
        cursorValue === null ||
        Array.isArray(cursorValue) ||
        (typeof cursorValue === 'object' && cursorValue !== null)
      ) {
        throw createAggregateError(
          AGGREGATE_ERROR.ARGS_UNSUPPORTED,
          'aggregate({ cursor }) value must be a scalar (non-null) value.'
        );
      }

      const cursorField = this._normalizePublicFieldName(rawCursorField);
      const [{ field: orderField, direction }] = orderSpecs;
      if (cursorField !== orderField) {
        throw createAggregateError(
          AGGREGATE_ERROR.ARGS_UNSUPPORTED,
          `aggregate({ cursor }) field '${rawCursorField}' must match orderBy field '${orderField}'.`
        );
      }

      const operator = direction === 'desc' ? 'lt' : 'gt';
      const cursorWhere = {
        [this._toPublicFilterFieldName(orderField)]: {
          [operator]: cursorValue,
        },
      };
      where = this._isEmptyWhere(where)
        ? cursorWhere
        : {
            AND: [where, cursorWhere],
          };
    }

    const hasSkipTakeBounds = skip > 0 || take !== null;

    return {
      where,
      skip,
      take,
      hasWindowBounds: hasSkipTakeBounds || hasCursor,
      hasSkipTakeBounds,
      hasCursor,
    };
  }

  private _applyCountWindowBounds(
    value: number,
    window: {
      skip: number;
      take: number | null;
    }
  ): number {
    let bounded = value;
    if (window.skip > 0) {
      bounded = Math.max(0, bounded - window.skip);
    }
    if (window.take !== null) {
      bounded = Math.min(bounded, window.take);
    }
    return bounded;
  }

  private async _ensureCountIndexReadyOnce(
    tableName: string,
    indexName: string
  ): Promise<void> {
    const key = `${tableName}:${indexName}`;
    const existing = this._countIndexReadinessByKey.get(key);
    if (existing) {
      await existing;
      return;
    }

    const pending = this._aggregate('count()')
      .ensureCountIndexReady(this.db as any, tableName, indexName)
      .catch((error) => {
        this._countIndexReadinessByKey.delete(key);
        throw error;
      });

    this._countIndexReadinessByKey.set(key, pending);
    await pending;
  }

  private async _ensureAggregateIndexReadyOnce(
    tableName: string,
    indexName: string
  ): Promise<void> {
    const key = `${tableName}:${indexName}`;
    const existing = this._aggregateIndexReadinessByKey.get(key);
    if (existing) {
      await existing;
      return;
    }

    const pending = this._aggregate('aggregate()')
      .ensureAggregateIndexReady(this.db as any, tableName, indexName)
      .catch((error) => {
        this._aggregateIndexReadinessByKey.delete(key);
        throw error;
      });

    this._aggregateIndexReadinessByKey.set(key, pending);
    await pending;
  }

  private _rethrowAggregateCountError(error: unknown): never {
    const message = error instanceof Error ? error.message : String(error);
    const remap = (
      from: string,
      to:
        | (typeof AGGREGATE_ERROR)['FILTER_UNSUPPORTED']
        | (typeof AGGREGATE_ERROR)['NOT_INDEXED']
        | (typeof AGGREGATE_ERROR)['INDEX_BUILDING']
        | (typeof AGGREGATE_ERROR)['RLS_UNSUPPORTED']
    ) => {
      if (message.startsWith(`${from}:`)) {
        throw createAggregateError(
          to,
          message.slice(`${from}: `.length) || message
        );
      }
    };

    remap(COUNT_ERROR.FILTER_UNSUPPORTED, AGGREGATE_ERROR.FILTER_UNSUPPORTED);
    remap(COUNT_ERROR.NOT_INDEXED, AGGREGATE_ERROR.NOT_INDEXED);
    remap(COUNT_ERROR.INDEX_BUILDING, AGGREGATE_ERROR.INDEX_BUILDING);
    remap(COUNT_ERROR.RLS_UNSUPPORTED, AGGREGATE_ERROR.RLS_UNSUPPORTED);

    if (error instanceof Error) {
      throw error;
    }
    throw new Error(message);
  }

  private async _executeCountScalar(
    where: unknown,
    bucketCache?: PlanBucketReadCache
  ): Promise<number> {
    ensureCountAllowedForRls(this.tableConfig, this.rls?.mode as any);

    // An unfiltered count is served by the native Convex syscall and needs no
    // aggregate index, so it must not require the aggregate capability.
    if (this._isEmptyWhere(where)) {
      const nativeCount = await this._tryNativeUnfilteredCount();
      if (nativeCount !== null) {
        return nativeCount;
      }
      throw createCountError(
        COUNT_ERROR.FILTER_UNSUPPORTED,
        `Native count() syscall unavailable for '${this.tableConfig.name}'.`
      );
    }

    const aggregate = this._aggregate('A filtered count()');
    const plan = aggregate.compileCountQueryPlan(this.tableConfig, where);
    if (aggregate.isIndexCountZero(plan)) {
      return 0;
    }
    await this._ensureCountIndexReadyOnce(plan.tableName, plan.indexName);
    return await aggregate.readCountFromBuckets(
      this.db as any,
      plan,
      bucketCache
    );
  }

  private async _executeCount(
    config: any
  ): Promise<number | Record<string, number>> {
    const windowConfig = this._coerceCountWindowConfig(config);
    const normalizedWhere = this._isEmptyWhere(windowConfig.where)
      ? {}
      : windowConfig.where;
    const select = this._coerceCountSelect(config.select);
    if (!select) {
      const total = await this._executeCountScalar(normalizedWhere);
      return this._applyCountWindowBounds(total, windowConfig);
    }

    const result: Record<string, number> = {};
    if (select.all) {
      const total = await this._executeCountScalar(normalizedWhere);
      result._all = this._applyCountWindowBounds(total, windowConfig);
    }

    if (windowConfig.hasWindowBounds && select.fields.length > 0) {
      throw createCountError(
        COUNT_ERROR.FILTER_UNSUPPORTED,
        'count({ select: { field: true } }) does not support skip/take/cursor in v1. Use count() or count({ select: { _all: true } }).'
      );
    }

    if (select.fields.length === 0) {
      return result;
    }

    const aggregate = this._aggregate('count({ select: { field: true } })');
    const fieldEntries = await Promise.all(
      select.fields.map(async (field) => {
        const plan = aggregate.compileCountFieldQueryPlan(
          this.tableConfig,
          normalizedWhere,
          field
        );
        if (aggregate.isAggregatePlanZero(plan)) {
          return [field, 0] as const;
        }
        await this._ensureCountIndexReadyOnce(plan.tableName, plan.indexName);
        const value = await aggregate.readCountFieldFromBuckets(
          this.db as any,
          plan
        );
        return [field, value] as const;
      })
    );

    for (const [field, value] of fieldEntries) {
      result[field] = value;
    }

    return result;
  }

  private _coerceAggregateFieldSelection(
    selection: unknown,
    blockName: '_sum' | '_avg' | '_min' | '_max'
  ): string[] {
    if (
      !selection ||
      typeof selection !== 'object' ||
      Array.isArray(selection)
    ) {
      throw createAggregateError(
        AGGREGATE_ERROR.ARGS_UNSUPPORTED,
        `aggregate(${blockName}) requires an object selection.`
      );
    }

    const fields: string[] = [];
    for (const [key, value] of Object.entries(
      selection as Record<string, unknown>
    )) {
      if (value === undefined || value === false) {
        continue;
      }
      if (value !== true) {
        throw createAggregateError(
          AGGREGATE_ERROR.ARGS_UNSUPPORTED,
          `aggregate(${blockName}) key '${key}' must be true.`
        );
      }
      fields.push(this._normalizeAggregateFieldName(key));
    }
    return [...new Set(fields)];
  }

  private _coerceAggregateCountSelection(
    selection: unknown
  ): true | { all: boolean; fields: string[] } | null {
    if (selection === undefined) {
      return null;
    }
    if (selection === true) {
      return true;
    }
    if (
      !selection ||
      typeof selection !== 'object' ||
      Array.isArray(selection)
    ) {
      throw createAggregateError(
        AGGREGATE_ERROR.ARGS_UNSUPPORTED,
        'aggregate({ _count }) must be true or an object.'
      );
    }

    let all = false;
    const fields: string[] = [];
    const scalarFields = new Set(
      Object.keys((this.tableConfig.table as any)[Columns] ?? {})
    );
    for (const [key, value] of Object.entries(
      selection as Record<string, unknown>
    )) {
      if (value === undefined || value === false) {
        continue;
      }
      if (value !== true) {
        throw createAggregateError(
          AGGREGATE_ERROR.ARGS_UNSUPPORTED,
          `aggregate(_count.${key}) must be true.`
        );
      }
      if (key === '_all') {
        all = true;
        continue;
      }
      const normalizedKey = this._normalizePublicFieldName(key);
      if (!scalarFields.has(normalizedKey)) {
        throw createAggregateError(
          AGGREGATE_ERROR.FILTER_UNSUPPORTED,
          `aggregate(_count) field '${key}' is not a scalar column on '${this.tableConfig.name}'.`
        );
      }
      fields.push(normalizedKey);
    }

    return {
      all,
      fields: [...new Set(fields)],
    };
  }

  private _coerceAggregateConfig(config: any): {
    where: unknown;
    window: {
      skip: number;
      take: number | null;
      hasWindowBounds: boolean;
      hasSkipTakeBounds: boolean;
      hasCursor: boolean;
    };
    count: true | { all: boolean; fields: string[] } | null;
    sumFields: string[];
    avgFields: string[];
    minFields: string[];
    maxFields: string[];
  } {
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      throw createAggregateError(
        AGGREGATE_ERROR.ARGS_UNSUPPORTED,
        'aggregate(...) requires an object config.'
      );
    }

    const allowedKeys = new Set([
      'where',
      'orderBy',
      'skip',
      'take',
      'cursor',
      '_count',
      '_sum',
      '_avg',
      '_min',
      '_max',
    ]);
    for (const [key, value] of Object.entries(
      config as Record<string, unknown>
    )) {
      if (!allowedKeys.has(key) && value !== undefined) {
        throw createAggregateError(
          AGGREGATE_ERROR.ARGS_UNSUPPORTED,
          `aggregate(...) does not support '${key}' in v1.`
        );
      }
    }

    const window = this._coerceAggregateWindowConfig(config);

    const normalized = {
      where: this._isEmptyWhere(window.where) ? {} : window.where,
      window,
      count: this._coerceAggregateCountSelection(config._count),
      sumFields:
        config._sum === undefined
          ? []
          : this._coerceAggregateFieldSelection(config._sum, '_sum'),
      avgFields:
        config._avg === undefined
          ? []
          : this._coerceAggregateFieldSelection(config._avg, '_avg'),
      minFields:
        config._min === undefined
          ? []
          : this._coerceAggregateFieldSelection(config._min, '_min'),
      maxFields:
        config._max === undefined
          ? []
          : this._coerceAggregateFieldSelection(config._max, '_max'),
    };

    if (
      !normalized.count &&
      normalized.sumFields.length === 0 &&
      normalized.avgFields.length === 0 &&
      normalized.minFields.length === 0 &&
      normalized.maxFields.length === 0
    ) {
      throw createAggregateError(
        AGGREGATE_ERROR.ARGS_UNSUPPORTED,
        'aggregate(...) requires at least one of _count/_sum/_avg/_min/_max.'
      );
    }

    const hasNonCountMetrics =
      normalized.sumFields.length > 0 ||
      normalized.avgFields.length > 0 ||
      normalized.minFields.length > 0 ||
      normalized.maxFields.length > 0;
    if (normalized.window.hasSkipTakeBounds && hasNonCountMetrics) {
      throw createAggregateError(
        AGGREGATE_ERROR.ARGS_UNSUPPORTED,
        'aggregate({ skip/take }) is only supported for _count in v1.'
      );
    }

    if (
      normalized.window.hasWindowBounds &&
      normalized.count &&
      normalized.count !== true &&
      normalized.count.fields.length > 0
    ) {
      throw createAggregateError(
        AGGREGATE_ERROR.ARGS_UNSUPPORTED,
        'aggregate({ _count: { field: true }, skip/take/cursor }) is not supported in v1. Use aggregate({ _count: true }) or aggregate({ _count: { _all: true } }).'
      );
    }

    return normalized;
  }

  private async _executeAggregate(
    config: any
  ): Promise<Record<string, unknown>> {
    const normalized = this._coerceAggregateConfig(config);
    // Resolved per metric, not up front: `_count: true` and `_count: { _all }`
    // route to the native Convex count syscall, so an aggregate that only asks
    // for those must not require the aggregate capability.
    const aggregate = () => this._aggregate('aggregate()');
    ensureAggregateAllowedForRls(
      this.tableConfig,
      this.rls?.mode as any,
      'aggregate()'
    );

    const result: Record<string, unknown> = {};
    const tasks: Promise<void>[] = [];
    const bucketReadCache: PlanBucketReadCache = new Map();

    if (normalized.count) {
      if (normalized.count === true) {
        tasks.push(
          (async () => {
            try {
              const total = await this._executeCountScalar(
                normalized.where,
                bucketReadCache
              );
              result._count = this._applyCountWindowBounds(
                total,
                normalized.window
              );
            } catch (error) {
              this._rethrowAggregateCountError(error);
            }
          })()
        );
      } else {
        const countSelection = normalized.count;
        tasks.push(
          (async () => {
            const countResult: Record<string, number> = {};
            const countTasks: Promise<void>[] = [];

            if (countSelection.all) {
              countTasks.push(
                (async () => {
                  try {
                    const total = await this._executeCountScalar(
                      normalized.where,
                      bucketReadCache
                    );
                    countResult._all = this._applyCountWindowBounds(
                      total,
                      normalized.window
                    );
                  } catch (error) {
                    this._rethrowAggregateCountError(error);
                  }
                })()
              );
            }

            countTasks.push(
              ...countSelection.fields.map(async (field) => {
                const plan = aggregate().compileAggregateQueryPlan(
                  this.tableConfig,
                  normalized.where,
                  { kind: 'countField', field }
                );
                if (aggregate().isAggregatePlanZero(plan)) {
                  countResult[field] = 0;
                  return;
                }
                await this._ensureAggregateIndexReadyOnce(
                  plan.tableName,
                  plan.indexName
                );
                countResult[field] =
                  await aggregate().readCountFieldFromBuckets(
                    this.db as any,
                    plan,
                    bucketReadCache
                  );
              })
            );

            await Promise.all(countTasks);
            result._count = countResult;
          })()
        );
      }
    }

    if (normalized.sumFields.length > 0) {
      tasks.push(
        (async () => {
          const sumEntries = await Promise.all(
            normalized.sumFields.map(async (field) => {
              const plan = aggregate().compileAggregateQueryPlan(
                this.tableConfig,
                normalized.where,
                { kind: 'sum', field }
              );
              if (aggregate().isAggregatePlanZero(plan)) {
                return [field, null] as const;
              }
              await this._ensureAggregateIndexReadyOnce(
                plan.tableName,
                plan.indexName
              );
              const value = await aggregate().readSumFromBuckets(
                this.db as any,
                plan,
                bucketReadCache
              );
              return [field, value] as const;
            })
          );
          result._sum = Object.fromEntries(sumEntries);
        })()
      );
    }

    if (normalized.avgFields.length > 0) {
      tasks.push(
        (async () => {
          const avgEntries = await Promise.all(
            normalized.avgFields.map(async (field) => {
              const plan = aggregate().compileAggregateQueryPlan(
                this.tableConfig,
                normalized.where,
                { kind: 'avg', field }
              );
              if (aggregate().isAggregatePlanZero(plan)) {
                return [field, null] as const;
              }
              await this._ensureAggregateIndexReadyOnce(
                plan.tableName,
                plan.indexName
              );
              const value = await aggregate().readAverageFromBuckets(
                this.db as any,
                plan,
                bucketReadCache
              );
              return [field, value] as const;
            })
          );
          result._avg = Object.fromEntries(avgEntries);
        })()
      );
    }

    if (normalized.minFields.length > 0) {
      tasks.push(
        (async () => {
          const minEntries = await Promise.all(
            normalized.minFields.map(async (field) => {
              const plan = aggregate().compileAggregateQueryPlan(
                this.tableConfig,
                normalized.where,
                { kind: 'min', field }
              );
              if (aggregate().isAggregatePlanZero(plan)) {
                return [field, null] as const;
              }
              await this._ensureAggregateIndexReadyOnce(
                plan.tableName,
                plan.indexName
              );
              const value = await aggregate().readExtremaFromBuckets(
                this.db as any,
                plan,
                bucketReadCache
              );
              return [
                field,
                this._coerceAggregateReturnValue(field, value),
              ] as const;
            })
          );
          result._min = Object.fromEntries(minEntries);
        })()
      );
    }

    if (normalized.maxFields.length > 0) {
      tasks.push(
        (async () => {
          const maxEntries = await Promise.all(
            normalized.maxFields.map(async (field) => {
              const plan = aggregate().compileAggregateQueryPlan(
                this.tableConfig,
                normalized.where,
                { kind: 'max', field }
              );
              if (aggregate().isAggregatePlanZero(plan)) {
                return [field, null] as const;
              }
              await this._ensureAggregateIndexReadyOnce(
                plan.tableName,
                plan.indexName
              );
              const value = await aggregate().readExtremaFromBuckets(
                this.db as any,
                plan,
                bucketReadCache
              );
              return [
                field,
                this._coerceAggregateReturnValue(field, value),
              ] as const;
            })
          );
          result._max = Object.fromEntries(maxEntries);
        })()
      );
    }

    await Promise.all(tasks);

    return result;
  }

  private _getAggregateCartesianMaxKeys(): number {
    const value = this.tableConfig.defaults?.aggregateCartesianMaxKeys;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return DEFAULT_AGGREGATE_CARTESIAN_MAX_KEYS;
    }
    if (value <= 0) {
      return 1;
    }
    return Math.floor(value);
  }

  private _getAggregateWorkBudget(): number {
    const value = this.tableConfig.defaults?.aggregateWorkBudget;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return DEFAULT_AGGREGATE_WORK_BUDGET;
    }
    if (value <= 0) {
      return 1;
    }
    return Math.floor(value);
  }

  private _serializeGroupByValue(value: unknown): string {
    if (value === undefined) {
      return '__kitcnUndefined';
    }
    return JSON.stringify(value);
  }

  private _pushGroupByConstraint(
    constraints: Map<string, Map<string, unknown>>,
    fieldName: string,
    values: unknown[]
  ): void {
    const incoming = new Map<string, unknown>();
    for (const value of values) {
      incoming.set(this._serializeGroupByValue(value), value);
    }

    const existing = constraints.get(fieldName);
    if (!existing) {
      constraints.set(fieldName, incoming);
      return;
    }

    const intersected = new Map<string, unknown>();
    for (const [stableKey, value] of existing.entries()) {
      if (incoming.has(stableKey)) {
        intersected.set(stableKey, value);
      }
    }
    constraints.set(fieldName, intersected);
  }

  private _parseGroupByFieldConstraint(
    fieldName: string,
    value: unknown,
    constraints: Map<string, Map<string, unknown>>
  ): void {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      this._pushGroupByConstraint(constraints, fieldName, [value]);
      return;
    }

    const filter = value as Record<string, unknown>;
    if (
      Object.hasOwn(filter, 'OR') ||
      Object.hasOwn(filter, 'NOT') ||
      Object.hasOwn(filter, 'RAW')
    ) {
      throw createAggregateError(
        AGGREGATE_ERROR.FILTER_UNSUPPORTED,
        `groupBy() only supports eq/in/isNull constraints for 'by' field '${fieldName}'.`
      );
    }

    if (Object.hasOwn(filter, 'AND')) {
      const andEntries = filter.AND;
      if (!Array.isArray(andEntries)) {
        throw createAggregateError(
          AGGREGATE_ERROR.FILTER_UNSUPPORTED,
          `groupBy() field '${fieldName}' AND must be an array.`
        );
      }
      for (const entry of andEntries) {
        this._parseGroupByFieldConstraint(fieldName, entry, constraints);
      }
    }

    let hasRecognized = false;
    if (Object.hasOwn(filter, 'eq')) {
      hasRecognized = true;
      this._pushGroupByConstraint(constraints, fieldName, [filter.eq]);
    }

    if (Object.hasOwn(filter, 'in')) {
      hasRecognized = true;
      const inValues = filter.in;
      if (!Array.isArray(inValues)) {
        throw createAggregateError(
          AGGREGATE_ERROR.FILTER_UNSUPPORTED,
          `groupBy() field '${fieldName}'.in must be an array.`
        );
      }
      this._pushGroupByConstraint(constraints, fieldName, inValues);
    }

    if (Object.hasOwn(filter, 'isNull')) {
      hasRecognized = true;
      if (filter.isNull !== true) {
        throw createAggregateError(
          AGGREGATE_ERROR.FILTER_UNSUPPORTED,
          `groupBy() field '${fieldName}'.isNull only supports true.`
        );
      }
      // Explicit `null` and an absent field are separate aggregate buckets;
      // `isNull` covers both. Keeping them as two constraint values (rather
      // than one opaque "nullish" token) is what lets `AND` intersect
      // `isNull` against `eq: null` down to the explicit-null bucket alone.
      this._pushGroupByConstraint(constraints, fieldName, [null, undefined]);
    }

    if (
      Object.hasOwn(filter, 'gt') ||
      Object.hasOwn(filter, 'gte') ||
      Object.hasOwn(filter, 'lt') ||
      Object.hasOwn(filter, 'lte')
    ) {
      throw createAggregateError(
        AGGREGATE_ERROR.FILTER_UNSUPPORTED,
        `groupBy() requires finite eq/in/isNull constraints for 'by' field '${fieldName}'. Range operators are unsupported for group keys.`
      );
    }

    const unsupportedKeys = Object.keys(filter).filter(
      (key) =>
        !['AND', 'eq', 'in', 'isNull'].includes(key) &&
        filter[key] !== undefined
    );
    if (unsupportedKeys.length > 0) {
      throw createAggregateError(
        AGGREGATE_ERROR.FILTER_UNSUPPORTED,
        `groupBy() does not support operators [${unsupportedKeys.join(', ')}] for 'by' field '${fieldName}'.`
      );
    }

    if (!hasRecognized && !Object.hasOwn(filter, 'AND')) {
      throw createAggregateError(
        AGGREGATE_ERROR.FILTER_UNSUPPORTED,
        `groupBy() field '${fieldName}' filter is unsupported.`
      );
    }
  }

  private _collectGroupByFieldValues(
    where: unknown,
    byFields: string[]
  ): Record<string, unknown[]> {
    if (this._isEmptyWhere(where)) {
      throw createAggregateError(
        AGGREGATE_ERROR.ARGS_UNSUPPORTED,
        'groupBy() requires finite eq/in/isNull constraints for every by field in where.'
      );
    }
    if (!where || typeof where !== 'object' || Array.isArray(where)) {
      throw createAggregateError(
        AGGREGATE_ERROR.FILTER_UNSUPPORTED,
        'groupBy() where must be an object filter.'
      );
    }

    const scalarFields = new Set(
      Object.keys((this.tableConfig.table as any)[Columns] ?? {})
    );
    const relationFields = new Set(
      Object.keys(this.tableConfig.relations ?? {})
    );
    const byFieldSet = new Set(byFields);
    const constraints = new Map<string, Map<string, unknown>>();

    const visit = (node: Record<string, unknown>) => {
      if (
        Object.hasOwn(node, 'OR') ||
        Object.hasOwn(node, 'NOT') ||
        Object.hasOwn(node, 'RAW')
      ) {
        throw createAggregateError(
          AGGREGATE_ERROR.FILTER_UNSUPPORTED,
          'groupBy() only supports conjunction filters (object fields + AND) in v1.'
        );
      }

      if (Object.hasOwn(node, 'AND')) {
        const andEntries = node.AND;
        if (!Array.isArray(andEntries)) {
          throw createAggregateError(
            AGGREGATE_ERROR.FILTER_UNSUPPORTED,
            'groupBy() AND must be an array.'
          );
        }
        for (const entry of andEntries) {
          if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            throw createAggregateError(
              AGGREGATE_ERROR.FILTER_UNSUPPORTED,
              'groupBy() AND entries must be objects.'
            );
          }
          visit(entry as Record<string, unknown>);
        }
      }

      for (const [rawField, value] of Object.entries(node)) {
        if (rawField === 'AND') {
          continue;
        }

        const fieldName = this._normalizePublicFieldName(rawField);
        if (!scalarFields.has(fieldName)) {
          if (relationFields.has(rawField)) {
            throw createAggregateError(
              AGGREGATE_ERROR.FILTER_UNSUPPORTED,
              `groupBy() does not support relation filters ('${rawField}') in v1.`
            );
          }
          throw createAggregateError(
            AGGREGATE_ERROR.FILTER_UNSUPPORTED,
            `groupBy() filter field '${rawField}' is not recognized.`
          );
        }

        if (!byFieldSet.has(fieldName)) {
          continue;
        }

        this._parseGroupByFieldConstraint(fieldName, value, constraints);
      }
    };

    visit(where as Record<string, unknown>);

    const output: Record<string, unknown[]> = {};
    for (const field of byFields) {
      const values = constraints.get(field);
      if (!values) {
        throw createAggregateError(
          AGGREGATE_ERROR.ARGS_UNSUPPORTED,
          `groupBy() requires finite constraints for by field '${field}'. Add where.${field} with eq/in/isNull.`
        );
      }
      output[field] = [...values.values()];
    }

    return output;
  }

  /**
   * One group per distinct value, where `null` and absent count as the same
   * value. They occupy different aggregate buckets, so the emitted group key
   * and the filter that reads it diverge: the key reports `null` while the
   * filter keeps `isNull` so the aggregate compiler reads both buckets and
   * combines their metrics into a single row.
   */
  private _buildGroupBySlots(values: unknown[]): GroupBySlot[] {
    const nullishValues = values.filter(
      (value) => value === null || value === undefined
    );

    const slots: GroupBySlot[] = [];
    let mergedNullish = false;
    for (const value of values) {
      if (value !== null && value !== undefined) {
        slots.push({ key: value, filter: value, probeCount: 1 });
        continue;
      }
      if (mergedNullish) {
        continue;
      }
      mergedNullish = true;
      slots.push({
        key: null,
        filter: nullishValues.length > 1 ? { isNull: true } : value,
        probeCount: nullishValues.length,
      });
    }
    return slots;
  }

  private _buildGroupByCandidates(
    byFields: string[],
    byFieldValues: Record<string, unknown[]>
  ): GroupByCandidate[] {
    if (byFields.length === 0) {
      return [];
    }

    const output: GroupByCandidate[] = [];
    const key: Record<string, unknown> = {};
    const where: Record<string, unknown> = {};
    const build = (index: number, probeCount: number) => {
      if (index >= byFields.length) {
        output.push({ key: { ...key }, probeCount, where: { ...where } });
        return;
      }
      const field = byFields[index]!;
      for (const slot of this._buildGroupBySlots(byFieldValues[field] ?? [])) {
        key[field] = slot.key;
        where[field] = slot.filter;
        build(index + 1, probeCount * slot.probeCount);
      }
      delete key[field];
      delete where[field];
    };
    build(0, 1);
    return output;
  }

  private _coerceGroupByByFields(
    by: unknown
  ): Array<{ raw: string; field: string }> {
    const rawEntries = Array.isArray(by) ? by : [by];
    if (rawEntries.length === 0) {
      throw createAggregateError(
        AGGREGATE_ERROR.ARGS_UNSUPPORTED,
        'groupBy({ by }) requires at least one field.'
      );
    }

    const deduped = new Map<string, { raw: string; field: string }>();
    for (const rawEntry of rawEntries) {
      if (typeof rawEntry !== 'string') {
        throw createAggregateError(
          AGGREGATE_ERROR.ARGS_UNSUPPORTED,
          'groupBy({ by }) must be a string or string[] of scalar fields.'
        );
      }
      const field = this._normalizeAggregateFieldName(rawEntry);
      if (!deduped.has(field)) {
        deduped.set(field, { raw: rawEntry, field });
      }
    }

    return [...deduped.values()];
  }

  private _isGroupByOrderDirection(value: unknown): value is 'asc' | 'desc' {
    return value === 'asc' || value === 'desc';
  }

  private _groupByOrderPathLabel(path: string[]): string {
    return path.join('.');
  }

  private _readGroupByPathValue(
    source: unknown,
    path: string[]
  ): { hasValue: boolean; value: unknown } {
    let current = source as unknown;
    for (const segment of path) {
      if (!current || typeof current !== 'object' || Array.isArray(current)) {
        return { hasValue: false, value: undefined };
      }
      if (!Object.hasOwn(current as Record<string, unknown>, segment)) {
        return { hasValue: false, value: undefined };
      }
      current = (current as Record<string, unknown>)[segment];
    }
    return {
      hasValue: current !== undefined,
      value: current,
    };
  }

  private _compareGroupByValues(
    left: unknown,
    right: unknown,
    direction: 'asc' | 'desc'
  ): number {
    if (left === null || left === undefined) {
      if (right === null || right === undefined) return 0;
      return 1;
    }
    if (right === null || right === undefined) {
      return -1;
    }

    if (left < right) {
      return direction === 'asc' ? -1 : 1;
    }
    if (left > right) {
      return direction === 'asc' ? 1 : -1;
    }
    return 0;
  }

  private _compareGroupByRows(
    left: Record<string, unknown>,
    right: Record<string, unknown>,
    specs: GroupByOrderSpec[]
  ): number {
    for (const spec of specs) {
      const leftValue = this._readGroupByPathValue(left, spec.path).value;
      const rightValue = this._readGroupByPathValue(right, spec.path).value;
      const compared = this._compareGroupByValues(
        leftValue,
        rightValue,
        spec.direction
      );
      if (compared !== 0) {
        return compared;
      }
    }
    return 0;
  }

  private _coerceGroupByOrderSpecs(
    rawOrderBy: unknown,
    by: Array<{ raw: string; field: string }>,
    aggregate: {
      count: true | { all: boolean; fields: string[] } | null;
      sumFields: string[];
      avgFields: string[];
      minFields: string[];
      maxFields: string[];
    }
  ): GroupByOrderSpec[] {
    if (rawOrderBy === undefined || rawOrderBy === null) {
      return [];
    }
    if (typeof rawOrderBy === 'function') {
      throw createAggregateError(
        AGGREGATE_ERROR.ARGS_UNSUPPORTED,
        'groupBy({ orderBy }) callback syntax is not supported in v1. Use object syntax.'
      );
    }

    const byFieldToOutputKey = new Map<string, string>(
      by.map((entry) => [entry.field, entry.raw])
    );
    const byFields = new Set(by.map((entry) => entry.field));
    const explicitSpecs: GroupByOrderSpec[] = [];
    const seenLabels = new Set<string>();
    const pushSpec = (spec: GroupByOrderSpec) => {
      const label = this._groupByOrderPathLabel(spec.path);
      if (seenLabels.has(label)) {
        return;
      }
      seenLabels.add(label);
      explicitSpecs.push(spec);
    };

    const parseDirection = (value: unknown, label: string): 'asc' | 'desc' => {
      if (!this._isGroupByOrderDirection(value)) {
        throw createAggregateError(
          AGGREGATE_ERROR.ARGS_UNSUPPORTED,
          `groupBy({ orderBy }) '${label}' must be 'asc' or 'desc'.`
        );
      }
      return value;
    };

    const orderEntries = Array.isArray(rawOrderBy) ? rawOrderBy : [rawOrderBy];
    for (const entry of orderEntries) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        throw createAggregateError(
          AGGREGATE_ERROR.ARGS_UNSUPPORTED,
          'groupBy({ orderBy }) entries must be objects.'
        );
      }

      for (const [rawKey, rawValue] of Object.entries(
        entry as Record<string, unknown>
      )) {
        if (rawValue === undefined) {
          continue;
        }

        if (rawKey === '_count') {
          if (this._isGroupByOrderDirection(rawValue)) {
            if (aggregate.count === true) {
              pushSpec({
                direction: rawValue,
                label: '_count',
                path: ['_count'],
              });
              continue;
            }
            if (aggregate.count?.all) {
              pushSpec({
                direction: rawValue,
                label: '_count._all',
                path: ['_count', '_all'],
              });
              continue;
            }
            throw createAggregateError(
              AGGREGATE_ERROR.ARGS_UNSUPPORTED,
              "groupBy({ orderBy: { _count: '...' } }) requires _count: true or _count: { _all: true }."
            );
          }

          if (
            !rawValue ||
            typeof rawValue !== 'object' ||
            Array.isArray(rawValue)
          ) {
            throw createAggregateError(
              AGGREGATE_ERROR.ARGS_UNSUPPORTED,
              'groupBy({ orderBy: { _count } }) must be a direction or object.'
            );
          }

          for (const [rawCountField, rawCountDirection] of Object.entries(
            rawValue as Record<string, unknown>
          )) {
            if (rawCountDirection === undefined) {
              continue;
            }
            const direction = parseDirection(
              rawCountDirection,
              `_count.${rawCountField}`
            );
            if (rawCountField === '_all') {
              if (aggregate.count !== true && !aggregate.count?.all) {
                throw createAggregateError(
                  AGGREGATE_ERROR.ARGS_UNSUPPORTED,
                  'groupBy({ orderBy: { _count: { _all: ... } } }) requires selecting _count._all.'
                );
              }
              pushSpec({
                direction,
                label: '_count._all',
                path:
                  aggregate.count === true ? ['_count'] : ['_count', '_all'],
              });
              continue;
            }

            const normalizedCountField = this._normalizeAggregateFieldName(
              rawCountField,
              'groupBy(orderBy._count)'
            );
            if (
              aggregate.count === true ||
              !aggregate.count?.fields.includes(normalizedCountField)
            ) {
              throw createAggregateError(
                AGGREGATE_ERROR.ARGS_UNSUPPORTED,
                `groupBy({ orderBy: { _count: { ${rawCountField}: ... } } }) requires selecting _count.${normalizedCountField}.`
              );
            }
            pushSpec({
              direction,
              label: `_count.${normalizedCountField}`,
              path: ['_count', normalizedCountField],
            });
          }
          continue;
        }

        if (
          rawKey === '_sum' ||
          rawKey === '_avg' ||
          rawKey === '_min' ||
          rawKey === '_max'
        ) {
          if (
            !rawValue ||
            typeof rawValue !== 'object' ||
            Array.isArray(rawValue)
          ) {
            throw createAggregateError(
              AGGREGATE_ERROR.ARGS_UNSUPPORTED,
              `groupBy({ orderBy.${rawKey} }) must be an object.`
            );
          }

          const selectedFields =
            rawKey === '_sum'
              ? aggregate.sumFields
              : rawKey === '_avg'
                ? aggregate.avgFields
                : rawKey === '_min'
                  ? aggregate.minFields
                  : aggregate.maxFields;

          for (const [rawMetricField, rawDirection] of Object.entries(
            rawValue as Record<string, unknown>
          )) {
            if (rawDirection === undefined) {
              continue;
            }
            const direction = parseDirection(
              rawDirection,
              `${rawKey}.${rawMetricField}`
            );
            const normalizedMetricField = this._normalizeAggregateFieldName(
              rawMetricField,
              `groupBy(orderBy.${rawKey})`
            );
            if (!selectedFields.includes(normalizedMetricField)) {
              throw createAggregateError(
                AGGREGATE_ERROR.ARGS_UNSUPPORTED,
                `groupBy({ orderBy: { ${rawKey}: { ${rawMetricField}: ... } } }) requires selecting ${rawKey}.${normalizedMetricField}.`
              );
            }
            pushSpec({
              direction,
              label: `${rawKey}.${normalizedMetricField}`,
              path: [rawKey, normalizedMetricField],
            });
          }
          continue;
        }

        const normalizedByField = this._normalizePublicFieldName(rawKey);
        if (!byFields.has(normalizedByField)) {
          throw createAggregateError(
            AGGREGATE_ERROR.ARGS_UNSUPPORTED,
            `groupBy({ orderBy }) field '${rawKey}' must be present in by.`
          );
        }
        pushSpec({
          direction: parseDirection(rawValue, rawKey),
          label: rawKey,
          path: [byFieldToOutputKey.get(normalizedByField)!],
        });
      }
    }

    const output = [...explicitSpecs];
    const outputPathSet = new Set(output.map((spec) => spec.path.join('.')));
    for (const entry of by) {
      const tiePath = [entry.raw];
      const tieKey = tiePath.join('.');
      if (outputPathSet.has(tieKey)) {
        continue;
      }
      output.push({
        direction: 'asc',
        label: entry.raw,
        path: tiePath,
      });
      outputPathSet.add(tieKey);
    }
    return output;
  }

  private _coerceGroupByWindowConfig(
    config: Record<string, unknown>,
    orderSpecs: GroupByOrderSpec[]
  ): {
    skip: number;
    take: number | null;
    hasWindowBounds: boolean;
    hasCursor: boolean;
    cursorValues: unknown[] | null;
  } {
    const skipRaw = config.skip;
    const skip =
      skipRaw === undefined || skipRaw === null ? 0 : Number(skipRaw);
    if (!Number.isInteger(skip) || skip < 0) {
      throw createAggregateError(
        AGGREGATE_ERROR.ARGS_UNSUPPORTED,
        'groupBy({ skip }) must be a non-negative integer.'
      );
    }

    const takeRaw = config.take;
    let take: number | null = null;
    if (takeRaw !== undefined && takeRaw !== null) {
      const parsedTake = Number(takeRaw);
      if (!Number.isInteger(parsedTake) || parsedTake < 0) {
        throw createAggregateError(
          AGGREGATE_ERROR.ARGS_UNSUPPORTED,
          'groupBy({ take }) must be a non-negative integer.'
        );
      }
      take = parsedTake;
    }

    const hasCursor = config.cursor !== undefined;
    const hasWindowBounds = hasCursor || skip > 0 || take !== null;
    if (hasWindowBounds && config.orderBy === undefined) {
      throw createAggregateError(
        AGGREGATE_ERROR.ARGS_UNSUPPORTED,
        'groupBy({ skip/take/cursor }) requires groupBy({ orderBy }).'
      );
    }

    let cursorValues: unknown[] | null = null;
    if (hasCursor) {
      if (orderSpecs.length === 0) {
        throw createAggregateError(
          AGGREGATE_ERROR.ARGS_UNSUPPORTED,
          'groupBy({ cursor }) requires at least one orderBy key.'
        );
      }
      const cursor = config.cursor;
      if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) {
        throw createAggregateError(
          AGGREGATE_ERROR.ARGS_UNSUPPORTED,
          'groupBy({ cursor }) must be an object.'
        );
      }
      cursorValues = orderSpecs.map((spec) => {
        const resolved = this._readGroupByPathValue(cursor, spec.path);
        if (!resolved.hasValue) {
          throw createAggregateError(
            AGGREGATE_ERROR.ARGS_UNSUPPORTED,
            `groupBy({ cursor }) must include '${this._groupByOrderPathLabel(spec.path)}'.`
          );
        }
        return resolved.value;
      });
    }

    return {
      skip,
      take,
      hasWindowBounds,
      hasCursor,
      cursorValues,
    };
  }

  private _isGroupByHavingValueOperatorObject(
    value: Record<string, unknown>
  ): boolean {
    return (
      Object.hasOwn(value, 'eq') ||
      Object.hasOwn(value, 'in') ||
      Object.hasOwn(value, 'isNull') ||
      Object.hasOwn(value, 'gt') ||
      Object.hasOwn(value, 'gte') ||
      Object.hasOwn(value, 'lt') ||
      Object.hasOwn(value, 'lte') ||
      Object.hasOwn(value, 'AND')
    );
  }

  private _matchesGroupByHavingValuePredicate(
    actual: unknown,
    predicate: unknown,
    label: string
  ): boolean {
    if (
      predicate === null ||
      typeof predicate !== 'object' ||
      Array.isArray(predicate)
    ) {
      return actual === predicate;
    }

    const filter = predicate as Record<string, unknown>;
    if (
      Object.hasOwn(filter, 'OR') ||
      Object.hasOwn(filter, 'NOT') ||
      Object.hasOwn(filter, 'RAW')
    ) {
      throw createAggregateError(
        AGGREGATE_ERROR.FILTER_UNSUPPORTED,
        `groupBy({ having }) does not support OR/NOT/RAW for '${label}'.`
      );
    }

    if (Object.hasOwn(filter, 'AND')) {
      const andEntries = filter.AND;
      if (!Array.isArray(andEntries)) {
        throw createAggregateError(
          AGGREGATE_ERROR.FILTER_UNSUPPORTED,
          `groupBy({ having }) AND for '${label}' must be an array.`
        );
      }
      for (const entry of andEntries) {
        if (!this._matchesGroupByHavingValuePredicate(actual, entry, label)) {
          return false;
        }
      }
    }

    let hasRecognized = false;
    if (Object.hasOwn(filter, 'eq')) {
      hasRecognized = true;
      if (actual !== filter.eq) {
        return false;
      }
    }

    if (Object.hasOwn(filter, 'in')) {
      hasRecognized = true;
      const inValues = filter.in;
      if (!Array.isArray(inValues)) {
        throw createAggregateError(
          AGGREGATE_ERROR.FILTER_UNSUPPORTED,
          `groupBy({ having }) '${label}.in' must be an array.`
        );
      }
      if (!inValues.some((value) => value === actual)) {
        return false;
      }
    }

    if (Object.hasOwn(filter, 'isNull')) {
      hasRecognized = true;
      if (filter.isNull !== true) {
        throw createAggregateError(
          AGGREGATE_ERROR.FILTER_UNSUPPORTED,
          `groupBy({ having }) '${label}.isNull' only supports true.`
        );
      }
      if (actual !== null && actual !== undefined) {
        return false;
      }
    }

    if (Object.hasOwn(filter, 'gt')) {
      hasRecognized = true;
      const gtValue = filter.gt as any;
      if (actual === null || actual === undefined || !(actual > gtValue)) {
        return false;
      }
    }

    if (Object.hasOwn(filter, 'gte')) {
      hasRecognized = true;
      const gteValue = filter.gte as any;
      if (actual === null || actual === undefined || !(actual >= gteValue)) {
        return false;
      }
    }

    if (Object.hasOwn(filter, 'lt')) {
      hasRecognized = true;
      const ltValue = filter.lt as any;
      if (actual === null || actual === undefined || !(actual < ltValue)) {
        return false;
      }
    }

    if (Object.hasOwn(filter, 'lte')) {
      hasRecognized = true;
      const lteValue = filter.lte as any;
      if (actual === null || actual === undefined || !(actual <= lteValue)) {
        return false;
      }
    }

    const unsupportedKeys = Object.keys(filter).filter(
      (key) =>
        !['AND', 'eq', 'in', 'isNull', 'gt', 'gte', 'lt', 'lte'].includes(
          key
        ) && filter[key] !== undefined
    );
    if (unsupportedKeys.length > 0) {
      throw createAggregateError(
        AGGREGATE_ERROR.FILTER_UNSUPPORTED,
        `groupBy({ having }) does not support operators [${unsupportedKeys.join(', ')}] for '${label}'.`
      );
    }

    if (!hasRecognized && !Object.hasOwn(filter, 'AND')) {
      throw createAggregateError(
        AGGREGATE_ERROR.FILTER_UNSUPPORTED,
        `groupBy({ having }) '${label}' filter is unsupported.`
      );
    }

    return true;
  }

  private _evaluateGroupByHaving(
    having: unknown,
    row: Record<string, unknown>,
    byOutputKeys: Set<string>
  ): boolean {
    if (having === undefined) {
      return true;
    }
    if (!having || typeof having !== 'object' || Array.isArray(having)) {
      throw createAggregateError(
        AGGREGATE_ERROR.FILTER_UNSUPPORTED,
        'groupBy({ having }) must be an object.'
      );
    }

    const node = having as Record<string, unknown>;
    if (
      Object.hasOwn(node, 'OR') ||
      Object.hasOwn(node, 'NOT') ||
      Object.hasOwn(node, 'RAW')
    ) {
      throw createAggregateError(
        AGGREGATE_ERROR.FILTER_UNSUPPORTED,
        'groupBy({ having }) only supports conjunction filters (object fields + AND) in v1.'
      );
    }

    if (Object.hasOwn(node, 'AND')) {
      const andEntries = node.AND;
      if (!Array.isArray(andEntries)) {
        throw createAggregateError(
          AGGREGATE_ERROR.FILTER_UNSUPPORTED,
          'groupBy({ having }).AND must be an array.'
        );
      }
      for (const entry of andEntries) {
        if (!this._evaluateGroupByHaving(entry, row, byOutputKeys)) {
          return false;
        }
      }
    }

    for (const [rawKey, predicate] of Object.entries(node)) {
      if (rawKey === 'AND') {
        continue;
      }

      if (byOutputKeys.has(rawKey)) {
        if (
          !this._matchesGroupByHavingValuePredicate(
            row[rawKey],
            predicate,
            rawKey
          )
        ) {
          return false;
        }
        continue;
      }

      if (rawKey === '_count') {
        const countValue = row._count;
        if (countValue === undefined) {
          throw createAggregateError(
            AGGREGATE_ERROR.ARGS_UNSUPPORTED,
            "groupBy({ having: { _count: ... } }) requires selecting '_count'."
          );
        }

        if (
          predicate &&
          typeof predicate === 'object' &&
          !Array.isArray(predicate) &&
          !this._isGroupByHavingValueOperatorObject(
            predicate as Record<string, unknown>
          )
        ) {
          const countObject = countValue as Record<string, unknown>;
          for (const [rawCountKey, rawCountPredicate] of Object.entries(
            predicate as Record<string, unknown>
          )) {
            if (rawCountPredicate === undefined) {
              continue;
            }
            const countKey =
              rawCountKey === '_all'
                ? '_all'
                : this._normalizePublicFieldName(rawCountKey);
            const countPath =
              typeof countValue === 'number'
                ? rawCountKey === '_all'
                  ? '_count'
                  : null
                : `_count.${countKey}`;
            if (!countPath) {
              throw createAggregateError(
                AGGREGATE_ERROR.ARGS_UNSUPPORTED,
                `groupBy({ having: { _count: { ${rawCountKey}: ... } } }) requires selecting _count.${countKey}.`
              );
            }

            const actualCountValue =
              typeof countValue === 'number'
                ? countValue
                : countObject[countKey];
            if (actualCountValue === undefined) {
              throw createAggregateError(
                AGGREGATE_ERROR.ARGS_UNSUPPORTED,
                `groupBy({ having: { _count: { ${rawCountKey}: ... } } }) requires selecting _count.${countKey}.`
              );
            }
            if (
              !this._matchesGroupByHavingValuePredicate(
                actualCountValue,
                rawCountPredicate,
                countPath
              )
            ) {
              return false;
            }
          }
          continue;
        }

        const totalCount =
          typeof countValue === 'number'
            ? countValue
            : (countValue as Record<string, unknown>)._all;
        if (totalCount === undefined) {
          throw createAggregateError(
            AGGREGATE_ERROR.ARGS_UNSUPPORTED,
            'groupBy({ having: { _count: ... } }) requires _count: true or _count: { _all: true }.'
          );
        }
        if (
          !this._matchesGroupByHavingValuePredicate(
            totalCount,
            predicate,
            '_count'
          )
        ) {
          return false;
        }
        continue;
      }

      if (
        rawKey === '_sum' ||
        rawKey === '_avg' ||
        rawKey === '_min' ||
        rawKey === '_max'
      ) {
        const block = row[rawKey];
        if (!block || typeof block !== 'object' || Array.isArray(block)) {
          throw createAggregateError(
            AGGREGATE_ERROR.ARGS_UNSUPPORTED,
            `groupBy({ having: { ${rawKey}: ... } }) requires selecting '${rawKey}'.`
          );
        }
        if (
          !predicate ||
          typeof predicate !== 'object' ||
          Array.isArray(predicate)
        ) {
          throw createAggregateError(
            AGGREGATE_ERROR.FILTER_UNSUPPORTED,
            `groupBy({ having: { ${rawKey}: ... } }) must be an object.`
          );
        }
        for (const [rawMetricField, metricPredicate] of Object.entries(
          predicate as Record<string, unknown>
        )) {
          if (metricPredicate === undefined) {
            continue;
          }
          const normalizedMetricField = this._normalizeAggregateFieldName(
            rawMetricField,
            `groupBy(having.${rawKey})`
          );
          const metricValue = (block as Record<string, unknown>)[
            normalizedMetricField
          ];
          if (metricValue === undefined) {
            throw createAggregateError(
              AGGREGATE_ERROR.ARGS_UNSUPPORTED,
              `groupBy({ having: { ${rawKey}: { ${rawMetricField}: ... } } }) requires selecting ${rawKey}.${normalizedMetricField}.`
            );
          }
          if (
            !this._matchesGroupByHavingValuePredicate(
              metricValue,
              metricPredicate,
              `${rawKey}.${normalizedMetricField}`
            )
          ) {
            return false;
          }
        }
        continue;
      }

      throw createAggregateError(
        AGGREGATE_ERROR.FILTER_UNSUPPORTED,
        `groupBy({ having }) key '${rawKey}' is unsupported.`
      );
    }

    return true;
  }

  private _coerceGroupByConfig(config: any): {
    by: Array<{ raw: string; field: string }>;
    candidates: GroupByCandidate[];
    orderSpecs: GroupByOrderSpec[];
    having: unknown;
    window: {
      skip: number;
      take: number | null;
      hasWindowBounds: boolean;
      hasCursor: boolean;
      cursorValues: unknown[] | null;
    };
    aggregate: {
      where: unknown;
      window: {
        skip: number;
        take: number | null;
        hasWindowBounds: boolean;
        hasSkipTakeBounds: boolean;
        hasCursor: boolean;
      };
      count: true | { all: boolean; fields: string[] } | null;
      sumFields: string[];
      avgFields: string[];
      minFields: string[];
      maxFields: string[];
    };
  } {
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      throw createAggregateError(
        AGGREGATE_ERROR.ARGS_UNSUPPORTED,
        'groupBy(...) requires an object config.'
      );
    }

    const allowedKeys = new Set([
      'by',
      'where',
      '_count',
      '_sum',
      '_avg',
      '_min',
      '_max',
      'orderBy',
      'skip',
      'take',
      'cursor',
      'having',
    ]);
    for (const [key, value] of Object.entries(
      config as Record<string, unknown>
    )) {
      if (!allowedKeys.has(key) && value !== undefined) {
        throw createAggregateError(
          AGGREGATE_ERROR.ARGS_UNSUPPORTED,
          `groupBy(...) does not support '${key}' in v1.`
        );
      }
    }

    if (!Object.hasOwn(config, 'by') || config.by === undefined) {
      throw createAggregateError(
        AGGREGATE_ERROR.ARGS_UNSUPPORTED,
        'groupBy({ by }) is required.'
      );
    }

    const by = this._coerceGroupByByFields(config.by);
    const aggregate = this._coerceAggregateConfig({
      where: config.where,
      _count: config._count,
      _sum: config._sum,
      _avg: config._avg,
      _min: config._min,
      _max: config._max,
    });

    const byFields = by.map((entry) => entry.field);
    const byFieldValues = this._collectGroupByFieldValues(
      aggregate.where,
      byFields
    );
    const candidates = this._buildGroupByCandidates(byFields, byFieldValues);
    const orderSpecs = this._coerceGroupByOrderSpecs(
      config.orderBy,
      by,
      aggregate
    );
    const window = this._coerceGroupByWindowConfig(config, orderSpecs);

    const maxKeys = this._getAggregateCartesianMaxKeys();
    let candidateProbeCount = 0;
    for (const candidate of candidates) {
      candidateProbeCount += candidate.probeCount;
    }
    if (candidateProbeCount > maxKeys) {
      throw createAggregateError(
        AGGREGATE_ERROR.ARGS_UNSUPPORTED,
        `groupBy() expands to ${candidateProbeCount} aggregate key probes, exceeding aggregateCartesianMaxKeys (${maxKeys}). Reduce IN/isNull fan-out or increase defineSchema(..., { defaults: { aggregateCartesianMaxKeys } }).`
      );
    }

    const metricReads =
      (aggregate.count === true
        ? 1
        : aggregate.count
          ? (aggregate.count.all ? 1 : 0) + aggregate.count.fields.length
          : 0) +
      aggregate.sumFields.length +
      aggregate.avgFields.length +
      aggregate.minFields.length +
      aggregate.maxFields.length;
    const estimatedWork = candidateProbeCount * Math.max(1, metricReads);
    const workBudget = this._getAggregateWorkBudget();
    if (estimatedWork > workBudget) {
      throw createAggregateError(
        AGGREGATE_ERROR.ARGS_UNSUPPORTED,
        `groupBy() estimated work is ${estimatedWork} units, exceeding aggregateWorkBudget (${workBudget}). Reduce group fan-out or increase defineSchema(..., { defaults: { aggregateWorkBudget } }).`
      );
    }

    return {
      by,
      candidates,
      orderSpecs,
      having: config.having,
      window,
      aggregate,
    };
  }

  private _buildAggregateMetricConfig(aggregate: {
    count: true | { all: boolean; fields: string[] } | null;
    sumFields: string[];
    avgFields: string[];
    minFields: string[];
    maxFields: string[];
  }): Record<string, unknown> {
    const config: Record<string, unknown> = {};

    if (aggregate.count) {
      if (aggregate.count === true) {
        config._count = true;
      } else {
        const selection: Record<string, true> = {};
        if (aggregate.count.all) {
          selection._all = true;
        }
        for (const field of aggregate.count.fields) {
          selection[field] = true;
        }
        config._count = selection;
      }
    }

    if (aggregate.sumFields.length > 0) {
      config._sum = Object.fromEntries(
        aggregate.sumFields.map((field) => [field, true])
      );
    }

    if (aggregate.avgFields.length > 0) {
      config._avg = Object.fromEntries(
        aggregate.avgFields.map((field) => [field, true])
      );
    }

    if (aggregate.minFields.length > 0) {
      config._min = Object.fromEntries(
        aggregate.minFields.map((field) => [field, true])
      );
    }

    if (aggregate.maxFields.length > 0) {
      config._max = Object.fromEntries(
        aggregate.maxFields.map((field) => [field, true])
      );
    }

    return config;
  }

  private async _executeGroupBy(
    config: any
  ): Promise<Record<string, unknown>[]> {
    const normalized = this._coerceGroupByConfig(config);
    ensureAggregateAllowedForRls(
      this.tableConfig,
      this.rls?.mode as any,
      'groupBy()'
    );

    if (normalized.candidates.length === 0) {
      return [];
    }

    const metricConfig = this._buildAggregateMetricConfig(normalized.aggregate);
    const byOutputKeys = new Set(normalized.by.map((entry) => entry.raw));
    let rows = await this._mapWithConcurrency(
      normalized.candidates,
      async (candidate) => {
        const groupWhere = this._isEmptyWhere(normalized.aggregate.where)
          ? candidate.where
          : {
              AND: [normalized.aggregate.where, candidate.where],
            };

        const aggregateRow = await this._executeAggregate({
          ...metricConfig,
          where: groupWhere,
        });

        const groupFields = Object.fromEntries(
          normalized.by.map((entry) => [
            entry.raw,
            this._coerceAggregateReturnValue(
              entry.field,
              candidate.key[entry.field]
            ),
          ])
        );

        return {
          ...groupFields,
          ...aggregateRow,
        };
      }
    );

    if (normalized.having !== undefined) {
      rows = rows.filter((row) =>
        this._evaluateGroupByHaving(normalized.having, row, byOutputKeys)
      );
    }

    if (normalized.orderSpecs.length > 0) {
      rows = [...rows].sort((left, right) =>
        this._compareGroupByRows(left, right, normalized.orderSpecs)
      );
    }

    const groupByCursorValues = normalized.window.cursorValues;
    if (normalized.window.hasCursor && groupByCursorValues) {
      rows = rows.filter((row) => {
        for (let index = 0; index < normalized.orderSpecs.length; index += 1) {
          const spec = normalized.orderSpecs[index]!;
          const rowValue = this._readGroupByPathValue(row, spec.path).value;
          const cursorValue = groupByCursorValues[index];
          const compared = this._compareGroupByValues(
            rowValue,
            cursorValue,
            spec.direction
          );
          if (compared !== 0) {
            return compared > 0;
          }
        }
        return false;
      });
    }

    if (normalized.window.skip > 0) {
      rows = rows.slice(normalized.window.skip);
    }
    if (normalized.window.take !== null) {
      rows = rows.slice(0, normalized.window.take);
    }

    return rows;
  }

  /**
   * A second instance of the same query: identical configuration, its own
   * execution-scoped state, the same index-readiness memos.
   */
  private _forExecution(): GelRelationalQuery<TSchema, TTableConfig, TResult> {
    const next = new GelRelationalQuery<TSchema, TTableConfig, TResult>(
      this.schema,
      this.tableConfig,
      this.edgeMetadata,
      this.db,
      this.config,
      this.mode,
      this._allEdges,
      this.rls,
      this.relationLoading,
      this.vectorSearchProvider,
      this.configuredIndex,
      this._countIndexReadinessByKey
    );
    next._aggregateIndexReadinessByKey = this._aggregateIndexReadinessByKey;
    return next;
  }

  /**
   * Execute the query and return results
   * Phase 4 implementation with WhereClauseCompiler integration
   */
  async execute(): Promise<TResult> {
    // `QueryPromise.then()` calls this on every await, so one query object can
    // run many times. Each run needs its own RLS policy resolution: a policy
    // resolved before an intervening write must not decide visibility after it.
    // Claiming the instance synchronously also isolates concurrent awaits.
    if (this._executionClaimed) {
      return this._forExecution().execute();
    }
    this._executionClaimed = true;

    const config = this.config as any;
    if (this.mode === 'count') {
      return (await this._executeCount(config)) as TResult;
    }
    if (this.mode === 'aggregate') {
      return (await this._executeAggregate(config)) as TResult;
    }
    if (this.mode === 'groupBy') {
      return (await this._executeGroupBy(config)) as TResult;
    }
    if (config.distinct !== undefined) {
      throw new Error(
        'DISTINCT_UNSUPPORTED: findMany({ distinct }) is not available under strict no-scan semantics. Use select().distinct({ fields }) when deduplication is required.'
      );
    }

    const cursor = config.cursor as string | null | undefined;
    const isCursorPaginated = cursor !== undefined;
    const endCursor = config.endCursor as string | null | undefined;
    const maxScan = config.maxScan as number | undefined;
    const pipeline = config.pipeline as
      | FindManyPipelineConfig<TSchema, TTableConfig>
      | undefined;
    const allowPipelineFromSelect = config.__allowPipelineFromSelect === true;
    const pageByKey = config.pageByKey as
      | {
          index?: string;
          order?: 'asc' | 'desc';
          startKey?: IndexKey;
          startInclusive?: boolean;
          endKey?: IndexKey;
          endInclusive?: boolean;
          targetMaxRows?: number;
          absoluteMaxRows?: number;
        }
      | undefined;
    const searchConfig = config.search as
      | {
          index: string;
          query: string;
          filters?: Record<string, unknown>;
        }
      | undefined;
    const vectorSearchConfig = config.vectorSearch as
      | {
          index: string;
          vector: number[];
          limit: number;
          includeScore?: boolean;
          filter?: ((q: any) => unknown) | undefined;
        }
      | undefined;
    const hasFunctionWhere = typeof config.where === 'function';
    let wherePredicate: ((row: any) => boolean | Promise<boolean>) | undefined;
    let whereFilter: RelationsFilter<any, any> | undefined;
    let whereExpressionFromCallback: FilterExpression<boolean> | undefined;
    const configuredIndex = this.configuredIndex;

    if (hasFunctionWhere) {
      const whereFn = config.where as WhereCallback<TTableConfig>;
      const callbackExpression = this._resolveWhereCallbackExpression(
        whereFn as (...args: any[]) => unknown,
        this.tableConfig,
        { context: 'root' }
      );
      if (this._isPredicateWhereClause(callbackExpression)) {
        wherePredicate = callbackExpression.predicate as (
          row: any
        ) => boolean | Promise<boolean>;
      } else {
        whereExpressionFromCallback = callbackExpression;
      }
    } else {
      whereFilter = config.where as RelationsFilter<any, any> | undefined;
    }
    const strict = this.tableConfig.strict !== false;
    const allowFullScan = this.allowFullScan === true;

    if (allowFullScan && configuredIndex?.name) {
      throw new Error(
        'allowFullScan cannot be combined with withIndex(). Remove allowFullScan or remove withIndex().'
      );
    }

    if (isCursorPaginated && this.mode !== 'many') {
      throw new Error('cursor pagination is only supported on findMany().');
    }

    if (endCursor !== undefined && !isCursorPaginated) {
      throw new Error(
        'endCursor requires cursor pagination (cursor + limit) on findMany().'
      );
    }

    if (maxScan !== undefined && !isCursorPaginated) {
      throw new Error(
        'maxScan can only be used with cursor pagination (cursor + limit).'
      );
    }

    if (isCursorPaginated && allowFullScan) {
      throw new Error(
        'allowFullScan is not supported with cursor pagination; use maxScan.'
      );
    }

    if (pipeline && !allowPipelineFromSelect) {
      throw new Error(
        'findMany({ pipeline }) is removed; use db.query.<table>.select() chain instead'
      );
    }

    if (pipeline) {
      if (searchConfig) {
        throw new Error(
          'pipeline cannot be combined with search in findMany().'
        );
      }
      if (vectorSearchConfig) {
        throw new Error(
          'pipeline cannot be combined with vectorSearch in findMany().'
        );
      }
      if (config.offset !== undefined) {
        throw new Error(
          'pipeline cannot be combined with offset in findMany().'
        );
      }
      if (config.with !== undefined) {
        throw new Error('pipeline cannot be combined with with in findMany().');
      }
      if (config.extras !== undefined) {
        throw new Error(
          'pipeline cannot be combined with extras in findMany().'
        );
      }
      if (config.columns !== undefined) {
        throw new Error(
          'pipeline cannot be combined with columns in findMany().'
        );
      }
    }

    if (pageByKey) {
      if (this.mode !== 'many') {
        throw new Error('pageByKey is only supported on findMany().');
      }
      if (isCursorPaginated) {
        throw new Error('pageByKey cannot be combined with cursor pagination.');
      }
      if (config.offset !== undefined) {
        throw new Error('pageByKey cannot be combined with offset.');
      }
      if (maxScan !== undefined) {
        throw new Error('pageByKey cannot be combined with maxScan.');
      }
      if (searchConfig) {
        throw new Error('pageByKey cannot be combined with search.');
      }
      if (vectorSearchConfig) {
        throw new Error('pageByKey cannot be combined with vectorSearch.');
      }
      if (pipeline) {
        throw new Error('pageByKey cannot be combined with pipeline.');
      }
    }

    // Validate the root and effective relation plan before the first database
    // read. `_finalizeRows` repeats this before relation rows are loaded.
    const preflightWith = this._resolveWithVariantsState(
      config.with as Record<string, unknown> | undefined,
      this._resolvePolymorphicFinalizeState()
    ).effectiveWith;
    this._assertRlsSelectPlan(
      preflightWith,
      this.tableConfig,
      this.edgeMetadata,
      0,
      MAX_RELATION_DEPTH
    );
    if (whereFilter) {
      this._assertRlsSelectPlan(
        this._buildFilterWithConfig(whereFilter, this.tableConfig),
        this.tableConfig,
        this.edgeMetadata,
        0,
        MAX_RELATION_DEPTH
      );
    }

    // Fast path: `id` lookups use `db.get()` (primary key) instead of an index plan.
    // This keeps `where: { id: ... }` and `where: { id: { in: [...] } }` ergonomic
    // without requiring allowFullScan, and avoids full collection scans.
    //
    // It returns raw documents and returns early, so it must not swallow a
    // request whose result shape is produced later: pipeline stages
    // (map/filter/flatMap/distinct/union) and pageByKey both live past this
    // point and would silently be dropped.
    const idLookup = this._extractIdOnlyWhere(whereFilter);
    if (
      idLookup &&
      !vectorSearchConfig &&
      !searchConfig &&
      !wherePredicate &&
      !isCursorPaginated &&
      !pipeline &&
      !pageByKey &&
      endCursor === undefined &&
      configuredIndex === undefined
    ) {
      const orderSpecs = this._orderBySpecs(config.orderBy);
      const offset = config.offset ?? 0;
      if (offset !== undefined && typeof offset !== 'number') {
        throw new Error('Only numeric offset is supported in kitcn ORM.');
      }

      // De-duplicate ids for `in` semantics (matches SQL/Convex query behavior).
      const ids =
        idLookup.kind === 'in'
          ? Array.from(
              new Map(
                idLookup.ids.map((id) => [String(id), id] as const)
              ).values()
            )
          : [idLookup.id];

      const fetched = await this._mapWithConcurrency(ids, async (id) => {
        return this._getById(this.tableConfig.name, id);
      });

      let rows = fetched.filter((row): row is any => !!row);
      rows = await this._applyRlsSelectFilter(rows, this.tableConfig);

      if (orderSpecs.length > 0 && rows.length > 1) {
        rows.sort((a, b) => this._compareByOrderSpecs(a, b, orderSpecs));
      }

      if (offset > 0) {
        rows = rows.slice(offset);
      }

      if (typeof config.limit === 'number') {
        rows = rows.slice(0, config.limit);
      }

      const selectedRows = await this._finalizeRows(rows);
      return this._returnSelectedRows(selectedRows);
    }

    const queryConfig = this._toConvexQuery(
      whereExpressionFromCallback,
      configuredIndex
    );
    const whereRequiresExplicitIndex =
      !searchConfig && !vectorSearchConfig && wherePredicate !== undefined;
    if (whereRequiresExplicitIndex && !configuredIndex?.name) {
      throw new Error(
        'This where() with predicate(...) requires .withIndex(name, range?). Add .withIndex(...) before findMany/findFirst.'
      );
    }

    if (pageByKey) {
      const schemaDefinition = this._getSchemaDefinitionOrThrow();
      const page = await getPage(
        { db: this.db as GenericDatabaseReader<any> },
        {
          table: this.tableConfig.name as any,
          index: (pageByKey.index as any) ?? ('by_creation_time' as any),
          schema: schemaDefinition as any,
          startIndexKey: pageByKey.startKey,
          startInclusive: pageByKey.startInclusive,
          endIndexKey: pageByKey.endKey,
          endInclusive: pageByKey.endInclusive,
          targetMaxRows: pageByKey.targetMaxRows,
          absoluteMaxRows: pageByKey.absoluteMaxRows,
          order: pageByKey.order,
        } as any
      );

      let rows = await this._applyRlsSelectFilter(page.page, this.tableConfig);

      if (whereFilter) {
        rows = await this._applyRelationsFilterToRows(
          rows,
          this.tableConfig,
          whereFilter,
          this.edgeMetadata,
          0,
          MAX_RELATION_DEPTH,
          this.config.with as Record<string, unknown> | undefined
        );
      }

      const selectedRows = await this._finalizeRows(rows);
      return {
        page: selectedRows,
        indexKeys: page.indexKeys,
        hasMore: page.hasMore,
      } as TResult;
    }

    const useAdvancedStreamPath = Boolean(pipeline) || endCursor !== undefined;

    if (endCursor !== undefined && searchConfig) {
      throw new Error('endCursor is not supported with search in findMany().');
    }

    if (endCursor !== undefined && vectorSearchConfig) {
      throw new Error(
        'endCursor is not supported with vectorSearch in findMany().'
      );
    }

    if (useAdvancedStreamPath) {
      const primaryOrder = queryConfig.order?.[0];
      const fallbackOrder = primaryOrder?.direction ?? 'asc';
      let streamQuery: QueryStream<any>;

      const unionSources = pipeline?.union ?? [];
      if (unionSources.length > 0) {
        const streams = unionSources.map((source) =>
          this._buildUnionSourceStream(source, fallbackOrder)
        );
        if (streams.length === 1) {
          streamQuery = streams[0]!;
        } else {
          if (!pipeline?.interleaveBy || pipeline.interleaveBy.length === 0) {
            throw new Error(
              'pipeline.interleaveBy is required when pipeline.union has multiple sources.'
            );
          }
          streamQuery = mergedStream(
            streams,
            pipeline.interleaveBy.map((field) =>
              this._normalizePublicFieldName(field)
            )
          );
        }
      } else {
        const orderedIdList =
          isCursorPaginated && maxScan !== undefined && idLookup?.kind === 'in'
            ? queryConfig.order?.[0]
            : undefined;
        if (orderedIdList) {
          // `maxScan` bounds a scan, so it only holds for an order a scan can
          // deliver. Creation order is not one: an id carries no creation
          // time, so `_buildIdLookupStream` reads the whole list up front.
          if (orderedIdList.field === INTERNAL_CREATION_TIME_FIELD) {
            throw new Error(
              'An id IN pipeline cannot combine orderBy on createdAt with maxScan, because ordering an id list by creation time requires reading every id in the list. Drop maxScan, or drop orderBy to page in id-list order at one read per row.'
            );
          }
          // Any other order is served by walking an index, which `maxScan`
          // does bound — but only the index the scan actually walks orders
          // the rows, so the order has to be a single field that an index
          // leads with and no other index may be pinned.
          if (
            queryConfig.order?.length !== 1 ||
            configuredIndex?.name ||
            queryConfig.index ||
            !this._findStreamOrderIndex(orderedIdList.field)
          ) {
            throw new Error(
              `An id IN pipeline cannot combine orderBy on ${this._toPublicFilterFieldName(orderedIdList.field)} with maxScan, because the scan cannot produce that order. It needs a single orderBy field that an index leads with, and no index pinned by withIndex().`
            );
          }
        }
        streamQuery =
          (await this._buildIdLookupStream({
            configuredIndex,
            idLookup,
            order: fallbackOrder,
            queryConfig,
            wherePredicate,
          })) ??
          this._buildBasePipelineStream(
            queryConfig,
            wherePredicate,
            configuredIndex
          );
      }

      const rootRlsEnabled = isRlsEnabled(this.tableConfig.table as any);
      if (rootRlsEnabled) {
        await this._applyRlsSelectFilter([], this.tableConfig);
        streamQuery = streamQuery.filterWith(async (row: any) => {
          const visible = await this._applyRlsSelectFilter(
            [row],
            this.tableConfig
          );
          return visible.length === 1;
        });
      }

      if (pipeline) {
        streamQuery = await this._applyPipelineStages(streamQuery, pipeline);
      }

      if (isCursorPaginated) {
        const paginationResult = await streamQuery.paginate({
          cursor: cursor ?? null,
          endCursor: endCursor ?? undefined,
          limit: config.limit,
          maxScan,
        });

        const selectedPage = await this._finalizeRows(
          rootRlsEnabled
            ? paginationResult.page
            : await this._applyRlsSelectFilter(
                paginationResult.page,
                this.tableConfig
              )
        );
        return {
          page: selectedPage,
          continueCursor: paginationResult.continueCursor,
          isDone: paginationResult.isDone,
          pageStatus: (paginationResult as any).pageStatus,
          splitCursor: (paginationResult as any).splitCursor,
        } as TResult;
      }

      const offset = config.offset ?? 0;
      if (typeof offset !== 'number') {
        throw new Error('Only numeric offset is supported in kitcn ORM.');
      }
      const limit = this._resolveNonPaginatedLimit(config);
      let rows =
        limit === undefined
          ? await streamQuery.collect()
          : await streamQuery.take(offset > 0 ? offset + limit : limit);
      if (offset > 0) {
        rows = rows.slice(offset);
      }

      if (!rootRlsEnabled) {
        rows = await this._applyRlsSelectFilter(rows, this.tableConfig);
      }
      const selectedRows = await this._finalizeRows(rows);
      return this._returnSelectedRows(selectedRows);
    }

    // Start Convex query
    let query: any = this.db.query(queryConfig.table);

    if (vectorSearchConfig) {
      if (searchConfig) {
        throw new Error('vectorSearch cannot be combined with search.');
      }
      if (config.orderBy !== undefined) {
        throw new Error(
          'vectorSearch cannot be combined with orderBy. Vector results stay in similarity order.'
        );
      }
      if (isCursorPaginated) {
        throw new Error(
          'vectorSearch cannot be combined with cursor pagination.'
        );
      }
      if (maxScan !== undefined) {
        throw new Error('vectorSearch cannot be combined with maxScan.');
      }
      if (config.where !== undefined) {
        throw new Error('vectorSearch cannot be combined with where.');
      }
      if (configuredIndex !== undefined) {
        throw new Error('vectorSearch cannot be combined with withIndex().');
      }
      if (config.offset !== undefined) {
        throw new Error('vectorSearch cannot be combined with offset.');
      }
      if (config.limit !== undefined) {
        throw new Error(
          'vectorSearch uses vectorSearch.limit. Top-level limit is not supported.'
        );
      }
      if (!Array.isArray(vectorSearchConfig.vector)) {
        throw new Error('vectorSearch.vector must be an array of numbers.');
      }
      if (
        !Number.isInteger(vectorSearchConfig.limit) ||
        vectorSearchConfig.limit < 1 ||
        vectorSearchConfig.limit > 256
      ) {
        throw new Error(
          'vectorSearch.limit must be an integer between 1 and 256.'
        );
      }
      if (!this.vectorSearchProvider) {
        throw new Error(
          'vectorSearch is not configured. Pass { vectorSearch: ctx.vectorSearch } to orm.db(ctx, ...).'
        );
      }

      const vectorIndex = findVectorIndexByName(
        this.tableConfig.table as any,
        vectorSearchConfig.index
      );
      if (!vectorIndex) {
        throw new Error(
          `Vector index '${vectorSearchConfig.index}' was not found on table '${this.tableConfig.name}'.`
        );
      }

      const hits = await this.vectorSearchProvider(
        this.tableConfig.name as string,
        vectorSearchConfig.index,
        {
          vector: vectorSearchConfig.vector,
          limit: vectorSearchConfig.limit,
          filter: vectorSearchConfig.filter,
        }
      );

      const fetched = await this._mapWithConcurrency(hits, async (hit) =>
        this.db.get((hit as any)._id)
      );
      const includeScore = vectorSearchConfig.includeScore === true;
      const scoreById = includeScore
        ? new Map(hits.map((hit) => [String((hit as any)._id), hit._score]))
        : undefined;

      let rows = fetched.filter((row): row is any => !!row);
      if (scoreById) {
        rows = rows.map((row) => {
          const score = scoreById.get(String(row._id));
          return score === undefined ? row : { ...row, _score: score };
        });
      }
      rows = await this._applyRlsSelectFilter(rows, this.tableConfig);

      const selectedRows = await this._finalizeRows(rows);
      return this._returnSelectedRows(selectedRows);
    }

    if (isCursorPaginated) {
      const limit = config.limit;
      if (config.offset !== undefined) {
        throw new Error('cursor pagination cannot be combined with offset.');
      }
      if (cursor !== null && typeof cursor !== 'string') {
        throw new Error('cursor must be a string or null.');
      }
      if (!Number.isInteger(limit) || limit < 1) {
        throw new Error(
          'cursor pagination requires limit to be a positive integer.'
        );
      }
    }

    if (searchConfig) {
      if (config.orderBy !== undefined) {
        throw new Error(
          'search cannot be combined with orderBy. Search results are ordered by relevance.'
        );
      }
      if (hasFunctionWhere) {
        throw new Error(
          'search cannot be combined with where(fn). Use search.filters or object where.'
        );
      }
      if (configuredIndex !== undefined) {
        throw new Error('search cannot be combined with withIndex().');
      }
      if (
        this._hasSearchDisallowedRelationFilter(whereFilter, this.tableConfig)
      ) {
        throw new Error(
          'search does not support relation-based where filters. Use base table fields only.'
        );
      }

      const searchIndex = findSearchIndexByName(
        this.tableConfig.table as any,
        searchConfig.index
      );
      if (!searchIndex) {
        throw new Error(
          `Search index '${searchConfig.index}' was not found on table '${this.tableConfig.name}'.`
        );
      }

      const mergedSearchFilters = this._mergeSearchFiltersWithWhereEq(
        searchConfig.filters as Record<string, unknown> | undefined,
        whereFilter,
        this.tableConfig,
        new Set(searchIndex.filterFields)
      );

      const searchQuery: any = query.withSearchIndex(
        searchConfig.index as any,
        (q: any) => {
          let builder = q.search(
            searchIndex.searchField as any,
            searchConfig.query
          );
          for (const [field, value] of Object.entries(mergedSearchFilters)) {
            builder = builder.eq(field as any, value);
          }
          return builder;
        }
      );

      if (isCursorPaginated) {
        const paginationResult = await searchQuery.paginate({
          cursor: cursor ?? null,
          numItems: config.limit,
        } as any);

        let pageRows = paginationResult.page;
        pageRows = await this._applyRlsSelectFilter(pageRows, this.tableConfig);

        if (whereFilter) {
          pageRows = await this._applyRelationsFilterToRows(
            pageRows,
            this.tableConfig,
            whereFilter,
            this.edgeMetadata,
            0,
            MAX_RELATION_DEPTH,
            this.config.with as Record<string, unknown> | undefined
          );
        }

        const selectedPage = await this._finalizeRows(pageRows);

        return {
          page: selectedPage,
          continueCursor: paginationResult.continueCursor,
          isDone: paginationResult.isDone,
        } as TResult;
      }

      const offset = config.offset ?? 0;
      if (typeof offset !== 'number') {
        throw new Error('Only numeric offset is supported in kitcn ORM.');
      }
      const limit = this._resolveNonPaginatedLimit(config);
      let rows =
        limit === undefined
          ? await searchQuery.collect()
          : await searchQuery.take(offset > 0 ? offset + limit : limit);

      if (offset > 0) {
        rows = rows.slice(offset);
      }

      rows = await this._applyRlsSelectFilter(rows, this.tableConfig);

      if (whereFilter) {
        rows = await this._applyRelationsFilterToRows(
          rows,
          this.tableConfig,
          whereFilter,
          this.edgeMetadata,
          0,
          MAX_RELATION_DEPTH,
          this.config.with as Record<string, unknown> | undefined
        );
      }

      const selectedRows = await this._finalizeRows(rows);
      return this._returnSelectedRows(selectedRows);
    }

    // M5: Index-aware ordering strategy
    // 1. If WHERE uses an index AND orderBy field matches → use .order() on that index
    // 2. If orderBy field has index AND no WHERE index → use orderBy index with .order()
    // 3. Otherwise → post-fetch sort (no index available)
    let usePostFetchSort = false;
    let needsPostFetchSortForPrimary = false;
    const postFetchOrders = queryConfig.order ?? [];
    const primaryOrder = postFetchOrders[0];
    const hasSecondaryOrders = postFetchOrders.length > 1;
    let orderIndexName: string | null = null;

    // Apply index if selected for WHERE filtering
    if (queryConfig.index) {
      const indexConfig = queryConfig.index;
      query = query.withIndex(indexConfig.name, (q: any) => {
        // Apply index filters (eq operations on indexed fields)
        let indexQuery = q;
        for (const filter of indexConfig.filters) {
          indexQuery = this._applyFilterToQuery(indexQuery, filter);
        }
        return indexQuery;
      });

      // Check if orderBy field matches WHERE index
      if (primaryOrder) {
        const pushdownDirection = resolveIndexOrderPushdown({
          indexFields: indexConfig.fields,
          pinnedEqCount: this._indexEqPrefixCount(queryConfig),
          orderSpecs: [primaryOrder],
        });
        if (pushdownDirection) {
          query = query.order(pushdownDirection);
        } else {
          // Different field - need post-fetch sort
          needsPostFetchSortForPrimary = true;
        }
      }
    } else if (configuredIndex?.name) {
      const configuredIndexFields = getIndexes(this.tableConfig.table).find(
        (idx) => idx.name === configuredIndex.name
      )?.fields;
      const rangeOperations: ConfiguredIndexRangeOperation[] = [];
      const configuredRange = configuredIndex.range;
      query = query.withIndex(
        configuredIndex.name as any,
        configuredRange
          ? (q: any) =>
              configuredRange(observeConfiguredIndexRange(q, rangeOperations))
          : (q: any) => q
      );

      if (primaryOrder) {
        const pushdownDirection = resolveIndexOrderPushdown({
          indexFields: configuredIndexFields,
          pinnedEqCount: countConfiguredIndexEqPrefix(
            configuredIndexFields,
            rangeOperations
          ),
          orderSpecs: [primaryOrder],
        });
        if (pushdownDirection) {
          query = query.order(pushdownDirection);
        } else {
          needsPostFetchSortForPrimary = true;
        }
      }
    } else if (queryConfig.order && primaryOrder) {
      // No WHERE index - check if orderBy field has an index
      const orderField = primaryOrder.field;

      // Special case: _creationTime uses Convex's default index
      if (orderField === '_creationTime') {
        // Default index on _creationTime - no withIndex() needed
        query = query.order(primaryOrder.direction);
      } else {
        // Convex walks an index in full index-key order, so only an index
        // whose *leading* field is the sort field yields the requested order.
        // Matching on any position sorts by a different column entirely.
        const orderIndex =
          getIndexes(this.tableConfig.table).find(
            (idx) => idx.fields[0] === orderField
          ) ??
          this.edgeMetadata.find((idx) => idx.indexFields[0] === orderField);

        if (orderIndex) {
          orderIndexName =
            'indexName' in orderIndex ? orderIndex.indexName : orderIndex.name;
          // Use orderBy field's index
          query = query.withIndex(orderIndexName, (q: any) => q);
          query = query.order(primaryOrder.direction);
        } else {
          // No index for orderBy field - post-fetch sort
          needsPostFetchSortForPrimary = true;
        }
      }
    }

    usePostFetchSort = needsPostFetchSortForPrimary || hasSecondaryOrders;

    if (wherePredicate) {
      const predicateIndex = configuredIndex;
      if (!predicateIndex?.name) {
        throw new Error(
          'predicate(...) requires .withIndex(name, range?) on the query.'
        );
      }
      const schemaDefinition = (this.schema as any)[OrmSchemaDefinition];
      if (!schemaDefinition) {
        throw new Error(
          'where (function) requires defineSchema(). Ensure defineSchema(tables) was used with the same tables object passed to defineRelations.'
        );
      }

      let streamQuery: any = stream(
        this.db as GenericDatabaseReader<any>,
        schemaDefinition
      )
        .query(this.tableConfig.name as any)
        .withIndex(
          predicateIndex.name as any,
          predicateIndex.range ? (predicateIndex.range as any) : (q: any) => q
        );

      if (isCursorPaginated) {
        if (needsPostFetchSortForPrimary) {
          if (strict) {
            throw new Error(
              `Pagination: Field '${primaryOrder?.field}' has no index. Add an index or disable strict.`
            );
          }
          console.warn(
            `Pagination: Field '${primaryOrder?.field}' has no index. ` +
              'Falling back to _creationTime ordering.'
          );
        }
        if (hasSecondaryOrders) {
          console.warn(
            'Pagination: Only the first orderBy field is used for cursor ordering. ' +
              'Secondary orderBy fields are applied per page and may be unstable across pages.'
          );
        }
      }

      if (primaryOrder && !needsPostFetchSortForPrimary) {
        streamQuery = streamQuery.order(primaryOrder.direction);
      } else if (isCursorPaginated) {
        streamQuery = streamQuery.order('desc');
      }

      streamQuery = streamQuery.filterWith(async (row: any) => {
        for (const filter of queryConfig.postFilters) {
          if (!this._evaluatePostFetchFilter(row, filter)) {
            return false;
          }
        }
        return await wherePredicate(row);
      });

      if (isCursorPaginated) {
        const paginationResult = await streamQuery.paginate({
          cursor: cursor ?? null,
          limit: config.limit,
          maxScan,
        });

        let pageRows = paginationResult.page;

        pageRows = await this._applyRlsSelectFilter(pageRows, this.tableConfig);

        if (whereFilter) {
          pageRows = await this._applyRelationsFilterToRows(
            pageRows,
            this.tableConfig,
            whereFilter,
            this.edgeMetadata,
            0,
            MAX_RELATION_DEPTH,
            this.config.with as Record<string, unknown> | undefined
          );
        }

        const selectedPage = await this._finalizeRows(pageRows);

        return {
          page: selectedPage,
          continueCursor: paginationResult.continueCursor,
          isDone: paginationResult.isDone,
          pageStatus: (paginationResult as any).pageStatus,
          splitCursor: (paginationResult as any).splitCursor,
        } as TResult;
      }

      const offset = config.offset ?? 0;
      if (typeof offset !== 'number') {
        throw new Error('Only numeric offset is supported in kitcn ORM.');
      }
      const limit = this._resolveNonPaginatedLimit(config);
      const paginateAfterPostFetchSort =
        usePostFetchSort && postFetchOrders.length > 0;
      let rows =
        limit === undefined || paginateAfterPostFetchSort
          ? await streamQuery.collect()
          : await streamQuery.take(offset > 0 ? offset + limit : limit);

      if (!paginateAfterPostFetchSort && offset > 0) {
        rows = rows.slice(offset);
      }

      rows = await this._applyRlsSelectFilter(rows, this.tableConfig);

      if (whereFilter) {
        rows = await this._applyRelationsFilterToRows(
          rows,
          this.tableConfig,
          whereFilter,
          this.edgeMetadata,
          0,
          MAX_RELATION_DEPTH,
          this.config.with as Record<string, unknown> | undefined
        );
      }

      if (usePostFetchSort && postFetchOrders.length > 0) {
        rows = rows.sort((a: any, b: any) =>
          this._compareByOrderSpecs(a, b, postFetchOrders)
        );
      }

      if (paginateAfterPostFetchSort) {
        if (offset > 0) {
          rows = rows.slice(offset);
        }
        if (limit !== undefined) {
          rows = rows.slice(0, limit);
        }
      }

      const selectedRows = await this._finalizeRows(rows);
      return this._returnSelectedRows(selectedRows);
    }

    if (
      queryConfig.strategy === 'multiProbe' &&
      queryConfig.index &&
      !isCursorPaginated
    ) {
      const probeOffset = config.offset ?? 0;
      if (typeof probeOffset !== 'number') {
        throw new Error('Only numeric offset is supported in kitcn ORM.');
      }
      const probeLimit = this._resolveNonPaginatedLimit(config);
      // Convex counts `.filter()` matches towards `take`, but only for the
      // filters it can actually carry; a residual one runs in JavaScript later
      // and would make the bound size unfiltered rows. A residual expression
      // also compiles to a `true` placeholder, which a surrounding `NOT` would
      // turn into a predicate matching nothing, so it must not reach Convex at
      // all — the JavaScript pass below applies the real thing.
      const convexProbeFilters = queryConfig.postFilters.filter((filter) =>
        this._isConvexEnforceableFilter(filter)
      );
      const probeHasResidualFilter =
        convexProbeFilters.length !== queryConfig.postFilters.length;
      // RLS and relation `where` run after the union is assembled and can drop
      // rows, so a per-probe bound would under-fill the page. `mode: 'skip'`
      // drops nothing and must not cost the bound.
      //
      // Only RELATION keys cost the bound. The plain-column part of `where` is
      // already compiled into the probes and `postFilters`, and `postFilters`
      // reaching Convex as `.filter()` is what `probeHasResidualFilter` above
      // guarantees — so `take()` counts matching rows, not scanned ones.
      // Testing `Boolean(whereFilter)` here would disable the bound for every
      // `in`/`ne`/`notIn` query, since those only exist inside a `where`.
      const probeHasPostFetchMembership =
        this._hasSearchDisallowedRelationFilter(
          whereFilter,
          this.tableConfig
        ) ||
        (this.rls?.mode !== 'skip' &&
          isRlsEnabled(this.tableConfig.table as any));
      // Each probe is read in its own index order. Truncating one is only sound
      // when that order is the requested order, so the global top-k is
      // guaranteed to live inside the union of the per-probe top-k.
      const probeOrderDirection = primaryOrder
        ? resolveIndexOrderPushdown({
            indexFields: queryConfig.index.fields,
            pinnedEqCount: this._indexEqPrefixCount(queryConfig),
            orderSpecs: [primaryOrder],
          })
        : null;
      const probeBound =
        probeLimit !== undefined &&
        !probeHasResidualFilter &&
        !probeHasPostFetchMembership &&
        (postFetchOrders.length === 0 ||
          (probeOrderDirection !== null && !hasSecondaryOrders))
          ? probeOffset + probeLimit
          : undefined;

      const probeRows = await Promise.all(
        queryConfig.probeFilters.map(async (probeFilters) => {
          let probeQuery: any = this.db
            .query(queryConfig.table)
            .withIndex(queryConfig.index!.name, (q: any) => {
              let indexQuery = q;
              for (const filter of probeFilters) {
                indexQuery = this._applyFilterToQuery(indexQuery, filter);
              }
              return indexQuery;
            });

          if (probeBound !== undefined && probeOrderDirection) {
            probeQuery = probeQuery.order(probeOrderDirection);
          }

          if (convexProbeFilters.length > 0) {
            probeQuery = probeQuery.filter((q: any) =>
              convexAnd(
                q,
                convexProbeFilters.map((filter) =>
                  this._toConvexExpression(filter)(q)
                )
              )
            );
          }

          return probeBound === undefined
            ? await probeQuery.collect()
            : await probeQuery.take(probeBound);
        })
      );

      let rows = Array.from(
        new Map(
          probeRows.flat().map((row: any) => [String(row._id), row] as const)
        ).values()
      );

      if (queryConfig.postFilters.length > 0) {
        rows = rows.filter((row: any) =>
          queryConfig.postFilters.every((filter) =>
            this._evaluatePostFetchFilter(row, filter)
          )
        );
      }

      rows = await this._applyRlsSelectFilter(rows, this.tableConfig);

      if (whereFilter) {
        rows = await this._applyRelationsFilterToRows(
          rows,
          this.tableConfig,
          whereFilter,
          this.edgeMetadata,
          0,
          MAX_RELATION_DEPTH,
          this.config.with as Record<string, unknown> | undefined
        );
      }

      // Each probe is read in its own index order and the results are then
      // concatenated, so the union has no meaningful global order. Always sort
      // here, or `limit` slices an arbitrary window out of probe #1.
      if (postFetchOrders.length > 0) {
        rows = rows.sort((a: any, b: any) =>
          this._compareByOrderSpecs(a, b, postFetchOrders)
        );
      }

      if (probeOffset > 0) {
        rows = rows.slice(probeOffset);
      }
      if (probeLimit !== undefined) {
        rows = rows.slice(0, probeLimit);
      }

      const selectedRows = await this._finalizeRows(rows);
      return this._returnSelectedRows(selectedRows);
    }

    const matchesPostFetchMembership = async (row: any) => {
      const visibleRows = await this._applyRlsSelectFilter(
        [row],
        this.tableConfig
      );
      if (visibleRows.length === 0) {
        return false;
      }
      if (!whereFilter) {
        return true;
      }
      const matchingRows = await this._applyRelationsFilterToRows(
        visibleRows,
        this.tableConfig,
        whereFilter,
        this.edgeMetadata,
        0,
        MAX_RELATION_DEPTH,
        this.config.with as Record<string, unknown> | undefined
      );
      return matchingRows.length > 0;
    };

    // M6.5 Phase 4: Handle cursor pagination separately
    if (isCursorPaginated) {
      const isMultiProbePlan =
        queryConfig.strategy === 'multiProbe' && !!queryConfig.index;
      const isScanFallbackPlan =
        !queryConfig.index && queryConfig.postFilters.length > 0;

      if (isMultiProbePlan || isScanFallbackPlan) {
        const schemaDefinition = (this.schema as any)[OrmSchemaDefinition];

        // A compiled index union is bounded by its probe ranges, not by scan
        // length, so it needs no scan budget. `maxScan` is still honoured when
        // the caller asked for one.
        const probeUnion =
          isMultiProbePlan && schemaDefinition
            ? this._buildProbeUnionStream({
                schemaDefinition,
                indexName: queryConfig.index!.name,
                probeFilters: queryConfig.probeFilters,
                order: primaryOrder?.direction ?? 'desc',
                orderField: primaryOrder?.field ?? queryConfig.index!.fields[0],
              })
            : null;

        if (!probeUnion && maxScan === undefined) {
          if (strict) {
            throw new Error(
              isMultiProbePlan
                ? 'Pagination with multi-probe index-union filters requires maxScan when strict=true. Add maxScan, order by a field the union can serve, or make the query indexable.'
                : 'Cursor pagination with scan fallback requires maxScan when strict=true. Add maxScan or make the query indexable.'
            );
          }
          if (isMultiProbePlan) {
            console.warn(
              'Pagination with multi-probe index-union filters is running without maxScan because strict: false.'
            );
          }
        }

        if (probeUnion || maxScan !== undefined) {
          if (!schemaDefinition) {
            throw new Error(
              'Pagination with maxScan requires defineSchema(). Ensure defineSchema(tables) was used with the same tables object passed to defineRelations.'
            );
          }

          let streamQuery: any = probeUnion;
          if (!streamQuery) {
            streamQuery = stream(
              this.db as GenericDatabaseReader<any>,
              schemaDefinition
            ).query(this.tableConfig.name as any);

            // An explicit `.withIndex(name, range)` anchors this read too. A
            // where clause that is not index-compilable leaves
            // `queryConfig.index` unset and lands here, so without this the
            // caller's index and its bounds — a tenant scope, say — would never
            // reach the scan.
            //
            // A declined union deliberately does not anchor to the plan's
            // index: its probes carry the ranges, and walking that index with
            // no range would sort the page by the probed field while the
            // warning below promises creation-time order.
            if (isScanFallbackPlan && configuredIndex?.name) {
              streamQuery = streamQuery.withIndex(
                configuredIndex.name as any,
                configuredIndex.range
                  ? (configuredIndex.range as any)
                  : (q: any) => q
              );
            }
          }

          if (queryConfig.order && primaryOrder) {
            if (needsPostFetchSortForPrimary) {
              if (strict) {
                throw new Error(
                  `Pagination: Field '${primaryOrder.field}' has no index. Add an index or disable strict.`
                );
              }
              console.warn(
                `Pagination: Field '${primaryOrder.field}' has no index. ` +
                  'Falling back to _creationTime ordering.'
              );
            }
            if (hasSecondaryOrders) {
              console.warn(
                'Pagination: Only the first orderBy field is used for cursor ordering. ' +
                  'Secondary orderBy fields are applied per page and may be unstable across pages.'
              );
            }
          }
          // The union already carries its direction: every probe was opened
          // with it so the merge could compare index keys.
          if (!probeUnion) {
            streamQuery = streamQuery.order(
              queryConfig.order && primaryOrder
                ? primaryOrder.direction
                : 'desc'
            );
          }

          if (queryConfig.postFilters.length > 0) {
            streamQuery = streamQuery.filterWith(async (row: any) =>
              queryConfig.postFilters.every((filter) =>
                this._evaluatePostFetchFilter(row, filter)
              )
            );
          }

          // `endCursor` routes through the advanced stream path above, so it
          // never reaches this branch.
          const paginationResult = await streamQuery.paginate({
            cursor: cursor ?? null,
            limit: config.limit,
            maxScan,
          });

          let pageRows = paginationResult.page;

          pageRows = await this._applyRlsSelectFilter(
            pageRows,
            this.tableConfig
          );

          if (whereFilter) {
            pageRows = await this._applyRelationsFilterToRows(
              pageRows,
              this.tableConfig,
              whereFilter,
              this.edgeMetadata,
              0,
              MAX_RELATION_DEPTH,
              this.config.with as Record<string, unknown> | undefined
            );
          }

          const selectedPage = await this._finalizeRows(pageRows);

          return {
            page: selectedPage,
            continueCursor: paginationResult.continueCursor,
            isDone: paginationResult.isDone,
            pageStatus: (paginationResult as any).pageStatus,
            splitCursor: (paginationResult as any).splitCursor,
          } as TResult;
        }
      }

      // Apply post-filters. Only the Convex-enforceable ones: the rest are
      // placeholders that would make a surrounding NOT match nothing.
      const convexPostFilters = queryConfig.postFilters.filter((filter) =>
        this._isConvexEnforceableFilter(filter)
      );
      const hasResidualPostFilter =
        convexPostFilters.length !== queryConfig.postFilters.length;

      // A residual predicate runs in JavaScript, and Convex's native paginate
      // has no place to run it: the page is built entirely inside Convex. The
      // two stream branches above only cover unindexed and multi-probe plans,
      // so an indexed plan would otherwise emit a page containing rows that
      // violate the predicate. Route it through the same stream the
      // non-paginated path uses, where `filterWith` runs while the page is
      // assembled — that keeps pages full instead of filtering them down after
      // the fact.
      const residualPageStream = hasResidualPostFilter
        ? this._buildResidualFilterStream({
            queryConfig,
            configuredIndex,
            membershipFilter: matchesPostFetchMembership,
            orderIndexName,
            primaryOrder,
            fallbackOrder: 'desc',
          })
        : null;

      if (hasResidualPostFilter && !residualPageStream) {
        this._getSchemaDefinitionOrThrow();
      }

      if (residualPageStream) {
        if (queryConfig.order && primaryOrder) {
          if (needsPostFetchSortForPrimary && strict) {
            throw new Error(
              `Pagination: Field '${primaryOrder.field}' has no index. Add an index or disable strict.`
            );
          }
          if (needsPostFetchSortForPrimary) {
            console.warn(
              `Pagination: Field '${primaryOrder.field}' has no index. ` +
                'Falling back to _creationTime ordering.'
            );
          }
          if (hasSecondaryOrders) {
            console.warn(
              'Pagination: Only the first orderBy field is used for cursor ordering. ' +
                'Secondary orderBy fields are applied per page and may be unstable across pages.'
            );
          }
        }

        const paginationResult = await residualPageStream.paginate({
          cursor: cursor ?? null,
          endCursor: endCursor ?? undefined,
          limit: config.limit,
          maxScan,
        });

        const selectedPage = await this._finalizeRows(paginationResult.page);

        return {
          page: selectedPage,
          continueCursor: paginationResult.continueCursor,
          isDone: paginationResult.isDone,
          pageStatus: (paginationResult as any).pageStatus,
          splitCursor: (paginationResult as any).splitCursor,
        } as TResult;
      }

      if (convexPostFilters.length > 0) {
        query = query.filter((q: any) =>
          convexAnd(
            q,
            convexPostFilters.map((filter) =>
              this._toConvexExpression(filter)(q)
            )
          )
        );
      }

      // Apply ORDER BY for pagination (required for stable cursors)
      if (queryConfig.order && primaryOrder) {
        // Check if ordering was already applied via index (needsPostFetchSortForPrimary would be false)
        if (needsPostFetchSortForPrimary) {
          // Field has no index - pagination can't use custom orderBy
          // Fall back to _creationTime ordering for cursor stability
          if (strict) {
            throw new Error(
              `Pagination: Field '${primaryOrder.field}' has no index. Add an index or disable strict.`
            );
          }
          console.warn(
            `Pagination: Field '${primaryOrder.field}' has no index. ` +
              'Falling back to _creationTime ordering.'
          );
          query = query.order(
            primaryOrder.direction === 'asc' ? 'asc' : 'desc'
          );
        } else {
          // Ordering already applied via index - query is ready for pagination
          // No additional action needed
        }
        if (hasSecondaryOrders) {
          console.warn(
            'Pagination: Only the first orderBy field is used for cursor ordering. ' +
              'Secondary orderBy fields are applied per page and may be unstable across pages.'
          );
        }
      } else {
        // Default to _creationTime desc if no orderBy specified
        query = query.order('desc');
      }

      // Use Convex native pagination (O(1) performance)
      const paginationResult = await query.paginate({
        cursor: cursor ?? null,
        numItems: config.limit,
      });

      let pageRows = paginationResult.page;

      pageRows = await this._applyRlsSelectFilter(pageRows, this.tableConfig);

      if (whereFilter) {
        pageRows = await this._applyRelationsFilterToRows(
          pageRows,
          this.tableConfig,
          whereFilter,
          this.edgeMetadata,
          0,
          MAX_RELATION_DEPTH,
          this.config.with as Record<string, unknown> | undefined
        );
      }

      const selectedPage = await this._finalizeRows(pageRows);

      return {
        page: selectedPage,
        continueCursor: paginationResult.continueCursor,
        isDone: paginationResult.isDone,
      } as TResult;
    }

    // Apply post-filters. Only the Convex-enforceable ones: the rest are
    // placeholders that would make a surrounding NOT match nothing.
    const convexPostFilters = queryConfig.postFilters.filter((filter) =>
      this._isConvexEnforceableFilter(filter)
    );
    const hasResidualPostFilter =
      convexPostFilters.length !== queryConfig.postFilters.length;
    // RLS and relation `where` run in JavaScript after the read and can drop
    // rows, so a `take()` sized on scanned rows under-fills the page: three
    // hidden rows first and `limit: 3` returns nothing. Same reasoning as the
    // multi-probe bound above, and the same test for it — a plain-column
    // `where` is already in the index scan and `.filter()`, and `mode: 'skip'`
    // drops nothing.
    const hasPostFetchMembership =
      this._hasSearchDisallowedRelationFilter(whereFilter, this.tableConfig) ||
      (this.rls?.mode !== 'skip' &&
        isRlsEnabled(this.tableConfig.table as any));
    if (convexPostFilters.length > 0) {
      // Combine all post-filters with AND logic
      query = query.filter((q: any) =>
        convexAnd(
          q,
          convexPostFilters.map((filter) => this._toConvexExpression(filter)(q))
        )
      );
    }

    // Execute query with limit - .take() returns Promise<Doc[]>
    // M4.5: Offset pagination via post-fetch slicing
    // Convex doesn't have skip() - fetch offset + limit rows, then slice
    const offset = config.offset ?? 0;
    if (typeof offset !== 'number') {
      throw new Error('Only numeric offset is supported in kitcn ORM.');
    }
    const limit = this._resolveNonPaginatedLimit(config);
    const paginateAfterPostFetchSort =
      usePostFetchSort && postFetchOrders.length > 0;

    // A residual filter runs in JavaScript, so `query.take(limit)` would spend
    // the whole budget on unfiltered rows and return mostly (often entirely)
    // non-matching ones. RLS and relation `where` are the same shape of
    // problem. Offset too: it must skip matches, not scanned rows. So whenever
    // anything survives into JavaScript, sizing moves after that pass.
    const sizeAfterPostFilter =
      (hasResidualPostFilter || hasPostFetchMembership) &&
      !paginateAfterPostFetchSort;

    // Read through a stream when we can: `filterWith` runs the predicate as rows
    // are pulled, so `take` still stops early but counts matches rather than
    // scanned rows, preserving the read bound the plain `take` gave us.
    const residualLimitStream =
      sizeAfterPostFilter && limit !== undefined
        ? this._buildResidualFilterStream({
            queryConfig,
            configuredIndex,
            membershipFilter: matchesPostFetchMembership,
            orderIndexName,
            primaryOrder,
            fallbackOrder: 'asc',
          })
        : null;

    let rows: any[];
    if (residualLimitStream) {
      rows = await residualLimitStream.take(
        offset > 0 ? offset + (limit as number) : (limit as number)
      );
    } else if (
      limit === undefined ||
      paginateAfterPostFetchSort ||
      hasResidualPostFilter ||
      hasPostFetchMembership
    ) {
      // No stream available (no defineSchema()) or no limit to push down.
      // Correctness wins over the read bound: scan, then size below.
      rows = await query.collect();
    } else {
      rows = await query.take(offset > 0 ? offset + limit : limit);
    }

    // Apply offset slicing if needed
    if (!(paginateAfterPostFetchSort || sizeAfterPostFilter) && offset > 0) {
      rows = rows.slice(offset);
    }

    // M5: Apply post-fetch string operator filters
    // String operators can't work in Convex filter context, apply after fetch
    if (queryConfig.postFilters.length > 0) {
      rows = rows.filter((row: any) =>
        queryConfig.postFilters.every((filter) =>
          this._evaluatePostFetchFilter(row, filter)
        )
      );
    }

    if (!residualLimitStream) {
      rows = await this._applyRlsSelectFilter(rows, this.tableConfig);

      if (whereFilter) {
        rows = await this._applyRelationsFilterToRows(
          rows,
          this.tableConfig,
          whereFilter,
          this.edgeMetadata,
          0,
          MAX_RELATION_DEPTH,
          this.config.with as Record<string, unknown> | undefined
        );
      }
    }

    // All post-fetch membership is now applied, so offset/limit mean final
    // visible matches even when no stream is available.
    if (sizeAfterPostFilter) {
      if (offset > 0) {
        rows = rows.slice(offset);
      }
      if (limit !== undefined) {
        rows = rows.slice(0, limit);
      }
    }

    // Apply post-fetch sort if needed
    if (usePostFetchSort && postFetchOrders.length > 0) {
      rows = rows.sort((a: any, b: any) =>
        this._compareByOrderSpecs(a, b, postFetchOrders)
      );
    }

    if (paginateAfterPostFetchSort) {
      if (offset > 0) {
        rows = rows.slice(offset);
      }
      if (limit !== undefined) {
        rows = rows.slice(0, limit);
      }
    }

    const selectedRows = await this._finalizeRows(rows);

    return this._returnSelectedRows(selectedRows);
  }

  /**
   * Convert query config to Convex query parameters
   * Phase 4 implementation with WhereClauseCompiler
   */
  private _toConvexQuery(
    whereExpressionOverride?: FilterExpression<boolean>,
    /**
     * The `.withIndex(name, range?)` the caller pinned, if any. Only one index
     * can be scanned, so a compiled plan that would replace it is discarded.
     */
    configuredIndex?: PredicateWhereIndexConfig<TTableConfig>
  ): CompiledQueryPlan {
    const config = this.config as any;

    // Initialize compiler for this table using declared indexes
    const tableIndexes = getIndexes(this.tableConfig.table).map((index) => ({
      indexName: index.name,
      indexFields: index.fields,
    }));

    const compiler = new WhereClauseCompiler(
      this.tableConfig.table.tableName,
      tableIndexes
    );

    // Resolved before index selection: which index is cheapest depends on
    // whether it can also supply the requested order.
    let orderSpecs: { direction: 'asc' | 'desc'; field: string }[] = [];
    if (config.orderBy) {
      const orderByValue =
        typeof config.orderBy === 'function'
          ? config.orderBy(this.tableConfig.table as any, { asc, desc })
          : config.orderBy;

      orderSpecs = this._orderBySpecs(orderByValue);
    }

    // Compile where clause to FilterExpression (if present)
    let whereExpression: FilterExpression<boolean> | undefined =
      whereExpressionOverride;
    if (
      !whereExpression &&
      config.where &&
      typeof config.where !== 'function'
    ) {
      whereExpression = this._buildFilterExpression(
        config.where as RelationsFilter<any, any>,
        this.tableConfig
      );
    }

    // Use compiler to split filters and select index
    const planned = compiler.compile(whereExpression, {
      orderFields: orderSpecs.map((spec) => spec.field),
    });
    const plannedUsesIndex =
      !!planned.selectedIndex &&
      (planned.indexFilters.length > 0 || planned.probeFilters.length > 0);

    // A query can only scan one index. When the caller pinned one explicitly,
    // a compiled plan may only refine that same index and only when the caller
    // left the range open — otherwise applying it would silently drop the
    // caller's index and its bounds (e.g. a tenant scope) from the read.
    const keepPlannedIndex =
      !configuredIndex?.name ||
      !plannedUsesIndex ||
      (planned.selectedIndex?.indexName === configuredIndex.name &&
        !configuredIndex.range);

    const compiled = keepPlannedIndex
      ? planned
      : {
          strategy: 'none' as IndexStrategy,
          selectedIndex: null,
          indexFilters: [] as FilterExpression<boolean>[],
          probeFilters: [] as FilterExpression<boolean>[][],
          postFilters: whereExpression ? [whereExpression] : [],
        };

    // Build query config
    const result: CompiledQueryPlan = {
      table: this.tableConfig.table.tableName,
      strategy: compiled.strategy,
      probeFilters: [...compiled.probeFilters],
      postFilters: [...compiled.postFilters],
    };

    // Add index if selected
    if (
      compiled.selectedIndex &&
      (compiled.indexFilters.length > 0 || compiled.probeFilters.length > 0)
    ) {
      result.index = {
        name: compiled.selectedIndex.indexName,
        // The index *shape* decides whether the scan is already in the
        // requested order. Deriving it from the filters instead only ever sees
        // the pinned prefix, which hides the suffix field Convex sorts by for
        // free.
        fields: compiled.selectedIndex.indexFields,
        filters: compiled.indexFilters,
      };
    }

    if (orderSpecs.length > 0) {
      result.order = orderSpecs;
    }

    return result;
  }

  private _buildRelationKey(row: any, fields: string[]): string | null {
    if (!fields.length) return null;
    const values = fields.map((field) => row[field]);
    if (values.some((value) => value === null || value === undefined)) {
      return null;
    }
    return JSON.stringify(values);
  }

  /**
   * How many leading fields of the scanned index are pinned to a single value.
   *
   * `splitFilters` emits index filters in index-key order — a run of `eq`, then
   * at most one range on the first unpinned field — so the leading `eq` run is
   * the prefix Convex holds constant. A multi-probe plan carries no index
   * filters; each probe supplies its own bound instead, and the union is only
   * as pinned as its least pinned probe.
   */
  private _indexEqPrefixCount(queryConfig: {
    index?: { filters: FilterExpression<boolean>[] };
    probeFilters: FilterExpression<boolean>[][];
  }): number {
    const countEqPrefix = (filters: FilterExpression<boolean>[]): number => {
      let count = 0;
      for (const filter of filters) {
        if (filter.type !== 'binary' || filter.operator !== 'eq') {
          break;
        }
        count += 1;
      }
      return count;
    };

    if (queryConfig.index && queryConfig.index.filters.length > 0) {
      return countEqPrefix(queryConfig.index.filters);
    }
    if (queryConfig.probeFilters.length === 0) {
      return 0;
    }
    let pinned = Number.POSITIVE_INFINITY;
    for (const probe of queryConfig.probeFilters) {
      pinned = Math.min(pinned, countEqPrefix(probe));
    }
    return Number.isFinite(pinned) ? pinned : 0;
  }

  private _buildIndexPredicate(
    q: any,
    fields: string[],
    values: unknown[]
  ): any {
    let builder = q.eq(fields[0], values[0]);
    for (let i = 1; i < fields.length; i += 1) {
      builder = builder.eq(fields[i], values[i]);
    }
    return builder;
  }

  private _buildFilterPredicate(
    q: any,
    fields: string[],
    values: unknown[]
  ): any {
    return convexAnd(
      q,
      fields.map((field, index) => q.eq(q.field(field), values[index]))
    );
  }

  private _queryByFields(
    query: any,
    fields: string[],
    values: unknown[],
    indexName: string | null
  ): any {
    if (indexName) {
      return query.withIndex(indexName, (q: any) =>
        this._buildIndexPredicate(q, fields, values)
      );
    }
    return query.filter((q: any) =>
      this._buildFilterPredicate(q, fields, values)
    );
  }

  private _getColumns(
    tableConfig: TableRelationalConfig = this.tableConfig
  ): Record<string, ColumnBuilder<any, any, any>> {
    const columns = tableConfig.table[Columns] as Record<
      string,
      ColumnBuilder<any, any, any>
    >;
    const system: Record<string, ColumnBuilder<any, any, any>> = {};

    if ((tableConfig.table as any).id) {
      system.id = (tableConfig.table as any).id as ColumnBuilder<any, any, any>;
    }
    if (this._usesSystemCreatedAtAlias(tableConfig)) {
      const createdAtBuilder =
        ((tableConfig.table as any)._creationTime as ColumnBuilder<
          any,
          any,
          any
        >) ??
        ((tableConfig.table as any).createdAt as ColumnBuilder<any, any, any>);
      if (createdAtBuilder) {
        system[PUBLIC_CREATED_AT_FIELD] = createdAtBuilder;
      }
    }

    return { ...columns, ...system };
  }

  /**
   * Apply a single filter expression to a Convex query builder
   * Used for index filters (eq operations)
   */
  private _applyFilterToQuery(
    query: any,
    filter: FilterExpression<boolean>
  ): any {
    if (filter.type === 'binary') {
      const [field, value] = filter.operands;
      if (!isFieldReference(field)) {
        return query;
      }
      const normalizedValue = this._normalizeComparableValue(
        field.fieldName,
        value
      );
      switch (filter.operator) {
        case 'eq':
          return query.eq(field.fieldName, normalizedValue);
        case 'gt':
          return query.gt(field.fieldName, normalizedValue);
        case 'gte':
          return query.gte(field.fieldName, normalizedValue);
        case 'lt':
          return query.lt(field.fieldName, normalizedValue);
        case 'lte':
          return query.lte(field.fieldName, normalizedValue);
        default:
          return query;
      }
    }
    return query;
  }

  /**
   * Convert FilterExpression to Convex filter function
   * Uses visitor pattern to traverse expression tree
   */
  private _toConvexExpression(
    expression: FilterExpression<boolean>
  ): (q: any) => any {
    return compileConvexFilter(expression, {
      normalizeValue: (fieldName, value) =>
        this._normalizeComparableValue(fieldName, value),
      // Convex represents missing fields as `undefined` in filter contexts, and
      // the read path treats "never written" as SQL `NULL`.
      nullMatchesUndefined: true,
    });
  }

  /**
   * Get edge metadata for a target table
   * Helper for recursive relation loading
   */
  private _getTargetTableEdges(tableName: string): EdgeMetadata[] {
    if (!this._allEdges) {
      return [];
    }

    // Filter all edges to find those originating from the target table
    return this._allEdges.filter((edge) => edge.sourceTable === tableName);
  }

  private async _getById(tableName: string, id: unknown): Promise<any | null> {
    if (id === null || id === undefined) {
      return null;
    }
    const normalizedId = this.db.normalizeId(tableName as any, id as any);
    return normalizedId === null
      ? null
      : await this.db.get(normalizedId as any);
  }

  private _getRelationConcurrency(): number {
    const value = this.relationLoading?.concurrency;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return 25;
    }
    if (value <= 0) {
      return 1;
    }
    return Math.floor(value);
  }

  private _getRelationFanOutKeyCap(tableConfig: TableRelationalConfig): number {
    const contextCap = getOrmContext(this.db as any)?.resolvedDefaults
      ?.relationFanOutMaxKeys;
    const value = contextCap ?? tableConfig.defaults?.relationFanOutMaxKeys;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return DEFAULT_RELATION_FAN_OUT_MAX_KEYS;
    }
    if (value <= 0) {
      return 1;
    }
    return Math.floor(value);
  }

  private _enforceRelationFanOutKeyCap(options: {
    tableConfig: TableRelationalConfig;
    relationName: string;
    keyCount: number;
    scope: 'source' | 'through-target';
  }) {
    const cap = this._getRelationFanOutKeyCap(options.tableConfig);
    if (options.keyCount <= cap) {
      return;
    }

    const baseMessage =
      `Relation "${options.tableConfig.name}.${options.relationName}" ` +
      `${options.scope} lookup keys (${options.keyCount}) exceed relationFanOutMaxKeys (${cap}).`;

    if (!this.allowFullScan) {
      throw new Error(
        `${baseMessage} Set allowFullScan: true, reduce fan-out, or increase defineSchema(..., { defaults: { relationFanOutMaxKeys } }).`
      );
    }

    if (options.tableConfig.strict !== false) {
      console.warn(`${baseMessage} Continuing because allowFullScan: true.`);
    }
  }

  private _mapWithConcurrency<T, R>(
    items: T[],
    worker: (item: T, index: number) => Promise<R>
  ): Promise<R[]> {
    return mapWithConcurrency(items, this._getRelationConcurrency(), worker);
  }

  /**
   * Load relations for query results
   * M6.5 Phase 2 implementation: Recursive relation loading with depth limiting
   *
   * @param rows - Array of parent records to load relations for
   * @param withConfig - Relation configuration object
   * @param depth - Current recursion depth (default 0)
   * @param maxDepth - Runaway ceiling for self-referential configs (default `MAX_RELATION_DEPTH`)
   * @param targetTableEdges - Edge metadata for nested relations (optional, defaults to this.edgeMetadata)
   */
  private async _loadRelations(
    rows: any[],
    withConfig: Record<string, unknown>,
    depth = 0,
    maxDepth = MAX_RELATION_DEPTH,
    targetTableEdges: EdgeMetadata[] = this.edgeMetadata,
    tableConfig: TableRelationalConfig = this.tableConfig
  ): Promise<any[]> {
    if (!withConfig || rows.length === 0) {
      return rows;
    }

    const relationCountConfig = (withConfig as any)._count;
    const relationEntries = Object.entries(withConfig).filter(
      ([relationName]) => relationName !== '_count'
    );

    // Only expanding the row tree spends recursion budget. `_count` reads an
    // aggregate index and returns a number, so it stays legal at the boundary --
    // which is what lets the deepest level of a tree report how much it omitted.
    if (relationEntries.length > 0 && depth >= maxDepth) {
      throw this._createRelationDepthError(
        tableConfig,
        relationEntries[0][0],
        maxDepth
      );
    }

    // Load all relations in parallel to avoid sequential N+1 queries
    await Promise.all(
      relationEntries.map(([relationName, relationConfig]) =>
        this._loadSingleRelation(
          rows,
          relationName,
          relationConfig,
          depth,
          maxDepth,
          targetTableEdges,
          tableConfig
        )
      )
    );

    if (relationCountConfig !== undefined) {
      await this._loadRelationCounts(
        rows,
        relationCountConfig,
        targetTableEdges,
        tableConfig
      );
    }

    return rows;
  }

  /**
   * Load a single relation for all rows
   * Handles both one() and many() cardinality
   * M6.5 Phase 2: Added support for nested relations
   */
  private async _loadSingleRelation(
    rows: any[],
    relationName: string,
    relationConfig: unknown,
    depth: number,
    maxDepth: number,
    targetTableEdges: EdgeMetadata[],
    tableConfig: TableRelationalConfig
  ): Promise<void> {
    // Find edge metadata for this relation
    const edge = targetTableEdges.find((e) => e.edgeName === relationName);

    if (!edge) {
      throw new Error(
        `Relation '${relationName}' not found in table '${tableConfig.name}'. ` +
          `Available relations: ${targetTableEdges.map((e) => e.edgeName).join(', ')}`
      );
    }

    // Load based on cardinality
    if (edge.cardinality === 'one') {
      await this._loadOneRelation(
        rows,
        relationName,
        edge,
        relationConfig,
        depth,
        maxDepth,
        tableConfig
      );
    } else {
      await this._loadManyRelation(
        rows,
        relationName,
        edge,
        relationConfig,
        depth,
        maxDepth,
        tableConfig
      );
    }
  }

  private _createRelationCountError(
    code: (typeof RELATION_COUNT_ERROR)[keyof typeof RELATION_COUNT_ERROR],
    message: string
  ): Error {
    return new Error(`${code}: ${message}`);
  }

  private _createRelationDepthError(
    tableConfig: TableRelationalConfig,
    relationName: string,
    maxDepth: number
  ): Error {
    return new Error(
      `${RELATION_DEPTH_ERROR}: '${tableConfig.name}.${relationName}' nests \`with\` more than ${maxDepth} levels deep. ` +
        'Trim the nesting, or check whether the config object references itself.'
    );
  }

  private _remapRelationCountError(
    error: unknown,
    relationPath: string
  ): Error {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith(`${COUNT_ERROR.NOT_INDEXED}:`)) {
      return this._createRelationCountError(
        RELATION_COUNT_ERROR.NOT_INDEXED,
        `${relationPath} ${message.slice(`${COUNT_ERROR.NOT_INDEXED}: `.length)}`
      );
    }
    if (message.startsWith(`${COUNT_ERROR.FILTER_UNSUPPORTED}:`)) {
      return this._createRelationCountError(
        RELATION_COUNT_ERROR.FILTER_UNSUPPORTED,
        `${relationPath} ${message.slice(`${COUNT_ERROR.FILTER_UNSUPPORTED}: `.length)}`
      );
    }
    return error instanceof Error ? error : new Error(message);
  }

  private _coerceRelationCountWhere(
    relationName: string,
    config: unknown
  ): unknown {
    if (config === true || config === undefined) {
      return;
    }
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      throw this._createRelationCountError(
        RELATION_COUNT_ERROR.FILTER_UNSUPPORTED,
        `with._count.${relationName} must be true or { where }`
      );
    }

    const record = config as Record<string, unknown>;
    for (const [key, value] of Object.entries(record)) {
      if (key !== 'where' && value !== undefined) {
        throw this._createRelationCountError(
          RELATION_COUNT_ERROR.FILTER_UNSUPPORTED,
          `with._count.${relationName} does not support '${key}'`
        );
      }
    }
    if (typeof record.where === 'function') {
      throw this._createRelationCountError(
        RELATION_COUNT_ERROR.FILTER_UNSUPPORTED,
        `with._count.${relationName}.where callback is unsupported in v1`
      );
    }
    return record.where;
  }

  private _getRelationCountParentKey(
    row: any,
    edge: EdgeMetadata
  ): string | null {
    const sourceFields =
      edge.sourceFields.length > 0 ? edge.sourceFields : [edge.fieldName];
    const values: unknown[] = [];
    for (const sourceFieldName of sourceFields) {
      const sourceField = this._normalizeRelationFieldName(sourceFieldName);
      const value = row[sourceField];
      if (value === null || value === undefined) {
        return null;
      }
      values.push(value);
    }
    return JSON.stringify(values);
  }

  private async _readIndexedRelationCount(
    tableConfig: TableRelationalConfig,
    where: Record<string, unknown>,
    relationPath: string,
    bucketCache?: PlanBucketReadCache
  ): Promise<number> {
    const aggregate = this._aggregate('_count on a relation');
    ensureCountAllowedForRls(tableConfig, this.rls?.mode as any);
    try {
      const plan = aggregate.compileCountQueryPlan(tableConfig, where);
      if (aggregate.isIndexCountZero(plan)) {
        return 0;
      }
      await this._ensureCountIndexReadyOnce(plan.tableName, plan.indexName);
      return await aggregate.readCountFromBuckets(
        this.db as any,
        plan,
        bucketCache
      );
    } catch (error) {
      throw this._remapRelationCountError(error, relationPath);
    }
  }

  private async _countRelationForRow(
    row: any,
    relationName: string,
    edge: EdgeMetadata,
    where: unknown,
    tableConfig: TableRelationalConfig,
    caches?: RelationCountCaches
  ): Promise<number> {
    const relationPath = `${tableConfig.name}.${relationName}`;
    // Resolved where a plan is actually compiled: a null parent key short
    // circuits to 0 without reading any aggregate index.
    const aggregate = () => this._aggregate('_count on a relation');
    const bucketCache = caches?.buckets;

    if (edge.through) {
      const throughTableConfig = this._getTableConfigByDbName(
        edge.through.table
      );
      if (!throughTableConfig) {
        throw this._createRelationCountError(
          RELATION_COUNT_ERROR.FILTER_UNSUPPORTED,
          `${relationPath} through table '${edge.through.table}' is not registered`
        );
      }
      ensureCountAllowedForRls(throughTableConfig, this.rls?.mode as any);

      const sourceValues: unknown[] = [];
      const throughWhere: Record<string, unknown> = {};
      for (let i = 0; i < edge.through.sourceFields.length; i += 1) {
        const sourceField = this._normalizeRelationFieldName(
          edge.sourceFields[i]
        );
        const throughField = this._normalizeRelationFieldName(
          edge.through.sourceFields[i]
        );
        const value = row[sourceField];
        if (value === null || value === undefined) {
          return 0;
        }
        throughWhere[throughField] = value;
        sourceValues.push(value);
      }

      if (this._isEmptyWhere(where) || where === undefined) {
        return await this._readIndexedRelationCount(
          throughTableConfig,
          throughWhere,
          relationPath,
          bucketCache
        );
      }

      const targetTableConfig = this._getTableConfigByDbName(edge.targetTable);
      if (!targetTableConfig) {
        throw this._createRelationCountError(
          RELATION_COUNT_ERROR.FILTER_UNSUPPORTED,
          `${relationPath} target table '${edge.targetTable}' is not registered`
        );
      }
      ensureCountAllowedForRls(targetTableConfig, this.rls?.mode as any);

      const whereRecord = where as Record<string, unknown>;
      try {
        const filterPlan = aggregate().compileCountQueryPlan(
          targetTableConfig,
          whereRecord
        );
        if (aggregate().isIndexCountZero(filterPlan)) {
          return 0;
        }
        await this._ensureCountIndexReadyOnce(
          filterPlan.tableName,
          filterPlan.indexName
        );
      } catch (error) {
        throw this._remapRelationCountError(error, relationPath);
      }

      const strict = tableConfig.strict !== false;
      const throughIndexName = findRelationIndex(
        throughTableConfig.table as any,
        edge.through.sourceFields,
        relationPath,
        edge.through.table,
        strict,
        this.allowFullScan
      );

      const throughRows = await this._queryByFields(
        this.db.query(edge.through.table),
        edge.through.sourceFields,
        sourceValues,
        throughIndexName
      ).collect();
      if (throughRows.length === 0) {
        return 0;
      }

      const targetFields =
        edge.targetFields.length > 0 ? edge.targetFields : ['_id'];
      const targetKeyCounts = new Map<
        string,
        { values: unknown[]; occurrences: number }
      >();
      for (const throughRow of throughRows) {
        const values = edge.through.targetFields.map(
          (field) => throughRow[field]
        );
        if (values.some((value) => value === null || value === undefined)) {
          continue;
        }
        const key = JSON.stringify(values);
        const existing = targetKeyCounts.get(key);
        if (existing) {
          existing.occurrences += 1;
          continue;
        }
        targetKeyCounts.set(key, { values, occurrences: 1 });
      }
      if (targetKeyCounts.size === 0) {
        return 0;
      }

      const useGetById = targetFields.length === 1 && targetFields[0] === '_id';
      const targetIndexName = useGetById
        ? null
        : findRelationIndex(
            targetTableConfig.table as any,
            targetFields,
            relationPath,
            edge.targetTable,
            strict,
            this.allowFullScan
          );

      const resolveTargetMatch = async (
        values: unknown[]
      ): Promise<boolean> => {
        let target: any | null = null;
        if (useGetById) {
          target = await this._getById(edge.targetTable, values[0]);
        } else {
          const query = this._queryByFields(
            this.db.query(edge.targetTable),
            targetFields,
            values,
            targetIndexName
          );
          target = await query.first();
        }
        if (!target) {
          return false;
        }
        return this._evaluateTableFilter(
          target,
          targetTableConfig,
          whereRecord
        );
      };

      // Parents routinely share targets — every member of a team resolves the
      // same team document. The predicate is a pure function of the target and
      // the relation's `where`, both fixed for this cache's lifetime, so each
      // distinct target is read and evaluated once for the whole page.
      const targetMatchCache = caches?.throughTargetMatches;
      const targetEntries = Array.from(targetKeyCounts.entries());
      const matchedCounts = await this._mapWithConcurrency(
        targetEntries,
        async ([targetKey, { values, occurrences }]) => {
          if (!targetMatchCache) {
            return (await resolveTargetMatch(values)) ? occurrences : 0;
          }
          let pending = targetMatchCache.get(targetKey);
          if (!pending) {
            pending = resolveTargetMatch(values);
            targetMatchCache.set(targetKey, pending);
          }
          try {
            return (await pending) ? occurrences : 0;
          } catch (error) {
            targetMatchCache.delete(targetKey);
            throw error;
          }
        }
      );

      return matchedCounts.reduce((sum, value) => sum + value, 0);
    }

    const targetTableConfig = this._getTableConfigByDbName(edge.targetTable);
    if (!targetTableConfig) {
      throw this._createRelationCountError(
        RELATION_COUNT_ERROR.FILTER_UNSUPPORTED,
        `${relationPath} target table '${edge.targetTable}' is not registered`
      );
    }

    const relationWhere: Record<string, unknown> = {};
    const sourceFields =
      edge.sourceFields.length > 0 ? edge.sourceFields : [edge.fieldName];
    const targetFields =
      edge.targetFields.length > 0 ? edge.targetFields : ['_id'];

    for (let i = 0; i < sourceFields.length; i += 1) {
      const sourceField = this._normalizeRelationFieldName(sourceFields[i]);
      const targetField = this._normalizeRelationFieldName(targetFields[i]);
      const value = row[sourceField];
      if (value === null || value === undefined) {
        return 0;
      }
      relationWhere[targetField] = value;
    }

    const mergedWhere =
      this._isEmptyWhere(where) || where === undefined
        ? relationWhere
        : {
            AND: [relationWhere, where],
          };

    return await this._readIndexedRelationCount(
      targetTableConfig,
      mergedWhere,
      relationPath,
      bucketCache
    );
  }

  private async _loadRelationCounts(
    rows: any[],
    relationCountConfig: unknown,
    targetTableEdges: EdgeMetadata[],
    tableConfig: TableRelationalConfig
  ): Promise<void> {
    if (
      !relationCountConfig ||
      typeof relationCountConfig !== 'object' ||
      Array.isArray(relationCountConfig)
    ) {
      throw this._createRelationCountError(
        RELATION_COUNT_ERROR.FILTER_UNSUPPORTED,
        `with._count on '${tableConfig.name}' requires an object of relation names`
      );
    }

    if ('select' in (relationCountConfig as Record<string, unknown>)) {
      throw this._createRelationCountError(
        RELATION_COUNT_ERROR.FILTER_UNSUPPORTED,
        'with._count.select is removed. Use with._count.<relation> instead'
      );
    }

    for (const row of rows) {
      row._count ??= {};
    }

    const relationEntries = Object.entries(
      relationCountConfig as Record<string, unknown>
    ).filter(
      ([, relationSelection]) =>
        relationSelection !== undefined && relationSelection !== false
    );

    await this._mapWithConcurrency(
      relationEntries,
      async ([relationName, relationSelection]) => {
        const edge = targetTableEdges.find(
          (entry) => entry.edgeName === relationName
        );
        if (!edge) {
          throw this._createRelationCountError(
            RELATION_COUNT_ERROR.FILTER_UNSUPPORTED,
            `with._count.${relationName} is not a relation on '${tableConfig.name}'`
          );
        }

        const where = this._coerceRelationCountWhere(
          relationName,
          relationSelection
        );
        // `relationName` and `where` are fixed for this map's whole lifetime,
        // so the parent key alone identifies an entry.
        const relationCountExecutionCache = new Map<string, Promise<number>>();
        // Scoped to one relation of one read, where the relation's `where` and
        // target table are constant, which is what makes both entries sound.
        const caches: RelationCountCaches = {
          buckets: new Map(),
          throughTargetMatches: new Map(),
        };

        const counts = await this._mapWithConcurrency(rows, async (row) => {
          const parentKey = this._getRelationCountParentKey(row, edge);
          if (parentKey === null) {
            return 0;
          }

          const existing = relationCountExecutionCache.get(parentKey);
          if (existing) {
            return await existing;
          }

          const pending = this._countRelationForRow(
            row,
            relationName,
            edge,
            where,
            tableConfig,
            caches
          );
          relationCountExecutionCache.set(parentKey, pending);
          try {
            return await pending;
          } catch (error) {
            relationCountExecutionCache.delete(parentKey);
            throw error;
          }
        });

        for (let i = 0; i < rows.length; i += 1) {
          rows[i]._count[relationName] = counts[i];
        }
      }
    );
  }

  /**
   * Load one() relation (many-to-one or one-to-one)
   * Example: posts.author where posts.authorId → users.id
   * M6.5 Phase 2: Added support for nested relations
   */
  private async _loadOneRelation(
    rows: any[],
    relationName: string,
    edge: EdgeMetadata,
    relationConfig: unknown,
    depth: number,
    maxDepth: number,
    tableConfig: TableRelationalConfig
  ): Promise<void> {
    const sourceFields =
      edge.sourceFields.length > 0 ? edge.sourceFields : [edge.fieldName];
    const targetFields =
      edge.targetFields.length > 0 ? edge.targetFields : ['_id'];

    const sourceKeyMap = new Map<string, unknown[]>();
    for (const row of rows) {
      const values = sourceFields.map((field) => row[field]);
      if (values.some((value) => value === null || value === undefined)) {
        continue;
      }
      const key = JSON.stringify(values);
      if (!sourceKeyMap.has(key)) {
        sourceKeyMap.set(key, values);
      }
    }

    if (sourceKeyMap.size === 0) {
      for (const row of rows) {
        row[relationName] = null;
      }
      return;
    }
    this._enforceRelationFanOutKeyCap({
      tableConfig,
      relationName,
      keyCount: sourceKeyMap.size,
      scope: 'source',
    });

    const targetTableConfig = this._getTableConfigByDbName(edge.targetTable);
    if (!targetTableConfig) {
      throw new Error(
        `Relation '${relationName}' target table '${edge.targetTable}' not found.`
      );
    }
    const relationDefinition = tableConfig.relations[relationName];
    const strict = tableConfig.strict !== false;
    const useGetById = targetFields.length === 1 && targetFields[0] === '_id';
    const indexName = useGetById
      ? null
      : findRelationIndex(
          targetTableConfig.table as any,
          targetFields,
          `${tableConfig.name}.${relationName}`,
          edge.targetTable,
          strict,
          this.allowFullScan
        );

    const entries = Array.from(sourceKeyMap.entries());
    const fetched = await this._mapWithConcurrency(
      entries,
      async ([key, values]) => {
        let target: any | null = null;
        if (useGetById) {
          target = await this._getById(edge.targetTable, values[0]);
        } else {
          const query = this._queryByFields(
            this.db.query(edge.targetTable),
            targetFields,
            values,
            indexName
          );
          target = await query.first();
        }
        return { key, target };
      }
    );

    const targetsByKey = new Map<string, any | null>();
    for (const entry of fetched) {
      targetsByKey.set(entry.key, entry.target ?? null);
    }

    let targets = Array.from(targetsByKey.values()).filter(
      (value): value is any => !!value
    );

    targets = await this._applyRlsSelectFilter(targets, targetTableConfig);

    if (relationDefinition?.where) {
      targets = targets.filter((target) =>
        this._evaluateTableFilter(
          target,
          targetTableConfig,
          relationDefinition.where as any
        )
      );
    }

    if (
      relationConfig &&
      typeof relationConfig === 'object' &&
      'where' in relationConfig
    ) {
      const whereFilter = (relationConfig as any).where;
      if (typeof whereFilter === 'function') {
        const whereExpression = this._resolveWhereCallbackExpression(
          whereFilter as (...args: any[]) => unknown,
          targetTableConfig,
          { context: 'relation' }
        );
        if (whereExpression && !this._isPredicateWhereClause(whereExpression)) {
          targets = targets.filter((target) =>
            this._evaluatePostFetchFilter(target, whereExpression)
          );
        }
      } else if (whereFilter) {
        const targetEdges = this._getTargetTableEdges(edge.targetTable);
        targets = await this._applyRelationsFilterToRows(
          targets,
          targetTableConfig,
          whereFilter,
          targetEdges,
          depth + 1,
          maxDepth,
          (relationConfig as any).with
        );
      }
    }

    if (
      relationConfig &&
      typeof relationConfig === 'object' &&
      'with' in relationConfig
    ) {
      const targetTableEdges = this._getTargetTableEdges(edge.targetTable);
      await this._loadRelations(
        targets,
        (relationConfig as any).with,
        depth + 1,
        maxDepth,
        targetTableEdges,
        targetTableConfig
      );
    }

    if (
      relationConfig &&
      typeof relationConfig === 'object' &&
      'extras' in relationConfig
    ) {
      targets = this._applyExtras(
        targets,
        (relationConfig as any).extras,
        this._getColumns(targetTableConfig),
        (relationConfig as any).with,
        targetTableConfig.name,
        targetTableConfig
      );
    }

    const selectedTargets = this._selectColumns(
      targets,
      relationConfig &&
        typeof relationConfig === 'object' &&
        'columns' in relationConfig
        ? (relationConfig as any).columns
        : undefined,
      this._getColumns(targetTableConfig),
      targetTableConfig
    );

    const selectedTargetsByKey = new Map<string, any>();
    for (let i = 0; i < targets.length; i += 1) {
      const key = this._buildRelationKey(targets[i], targetFields);
      if (key) {
        selectedTargetsByKey.set(key, selectedTargets[i]);
      }
    }

    for (const row of rows) {
      const rowKey = this._buildRelationKey(row, sourceFields);
      row[relationName] = rowKey
        ? (selectedTargetsByKey.get(rowKey) ?? null)
        : null;
    }
  }

  /**
   * Junction links per parent, stopped once each parent holds `fetchLimit`
   * links whose target actually reaches the page.
   *
   * A link only contributes if its target exists and survives target RLS and
   * the relation `where` — all of which run after the junction read. Sizing the
   * read on links alone therefore under-fills: three dangling or filtered links
   * first and `{ limit: 3 }` returns nothing. So the read is refilled in rounds,
   * each round resolving only the targets it newly needs and asking again for
   * whatever the survivors did not cover.
   *
   * Rounds are the unit rather than single links because both the target fetch
   * and the relation `where` de-duplicate and batch their own reads across the
   * parents in the round.
   */
  private async _readBoundedThroughLinks(params: {
    /** `[sourceKey, sourceFieldValues]` for every distinct parent. */
    entries: [string, unknown[]][];
    edge: EdgeMetadata;
    throughTableConfig: TableRelationalConfig;
    throughIndexName: string | null;
    /** Fields the target is keyed by, matching `edge.through.targetFields`. */
    targetFields: string[];
    fetchTargets: (
      keyEntries: [string, unknown[]][]
    ) => Promise<{ key: string; target: any }[]>;
    applyTargetFilters: (targets: any[]) => Promise<any[]>;
    /** Per-parent `offset + limit`, in surviving links. */
    fetchLimit: number;
    enforceTargetKeyCap: (keyCount: number) => void;
  }): Promise<{ linksBySourceKey: Map<string, any[]>; targets: any[] }> {
    const {
      applyTargetFilters,
      edge,
      enforceTargetKeyCap,
      entries,
      fetchLimit,
      fetchTargets,
      targetFields,
      throughIndexName,
      throughTableConfig,
    } = params;
    const throughTargetFields = edge.through!.targetFields;

    const cursors = entries.map(([key, values]) => ({
      /** Visible links pulled but not yet classified. Never dropped. */
      buffered: [] as any[],
      exhausted: false,
      iterator: this._queryByFields(
        this.db.query(edge.through!.table),
        edge.through!.sourceFields,
        values,
        throughIndexName
      )[Symbol.asyncIterator]() as AsyncIterator<any>,
      key,
      /** Links whose target reached the page, in junction order. */
      links: [] as any[],
    }));
    type LinkCursor = (typeof cursors)[number];

    // Junction-table RLS also drops rows after the read, so the buffer counts
    // visible links rather than scanned ones.
    const bufferVisibleLinks = async (cursor: LinkCursor, count: number) => {
      let batch: any[] = [];
      const drain = async () => {
        const visible = await this._applyRlsSelectFilter(
          batch,
          throughTableConfig
        );
        batch = [];
        cursor.buffered.push(...visible);
      };
      while (
        !cursor.exhausted &&
        cursor.buffered.length + batch.length < count
      ) {
        const next = await cursor.iterator.next();
        if (next.done) {
          cursor.exhausted = true;
          break;
        }
        batch.push(next.value);
        if (batch.length >= RELATION_FILTER_STREAM_CHUNK) {
          await drain();
        }
      }
      // Runs even for an empty batch: that is also what validates policy
      // configuration on an empty partition, matching the unbounded read.
      await drain();
    };

    /** Target key -> the surviving document, absent when it did not survive. */
    const survivorByKey = new Map<string, any>();
    const resolvedKeys = new Set<string>();
    const survivors: any[] = [];

    while (true) {
      const active = cursors.filter(
        (cursor) =>
          cursor.links.length < fetchLimit &&
          !(cursor.exhausted && cursor.buffered.length === 0)
      );
      if (active.length === 0) {
        break;
      }

      const candidatesPerCursor = await this._mapWithConcurrency(
        active,
        async (cursor) => {
          const need = fetchLimit - cursor.links.length;
          await bufferVisibleLinks(cursor, need);
          return cursor.buffered.splice(0, need);
        }
      );

      const newKeys = new Map<string, unknown[]>();
      for (const candidates of candidatesPerCursor) {
        for (const link of candidates) {
          const values = throughTargetFields.map((field) => link[field]);
          if (values.some((value) => value === null || value === undefined)) {
            continue;
          }
          const key = JSON.stringify(values);
          if (resolvedKeys.has(key) || newKeys.has(key)) {
            continue;
          }
          newKeys.set(key, values);
        }
      }

      if (newKeys.size > 0) {
        enforceTargetKeyCap(resolvedKeys.size + newKeys.size);
        const fetched = await fetchTargets(Array.from(newKeys.entries()));
        for (const key of newKeys.keys()) {
          resolvedKeys.add(key);
        }
        const surviving = await applyTargetFilters(
          fetched
            .map((entry) => entry.target)
            .filter((target): target is any => !!target)
        );
        for (const target of surviving) {
          const key = this._buildRelationKey(target, targetFields);
          if (!key || survivorByKey.has(key)) {
            continue;
          }
          survivorByKey.set(key, target);
          survivors.push(target);
        }
      }

      for (let i = 0; i < active.length; i += 1) {
        const cursor = active[i];
        for (const link of candidatesPerCursor[i]) {
          if (cursor.links.length >= fetchLimit) {
            break;
          }
          const key = this._buildRelationKey(link, throughTargetFields);
          if (!key || !survivorByKey.has(key)) {
            continue;
          }
          cursor.links.push(link);
        }
      }
    }

    const linksBySourceKey = new Map<string, any[]>();
    const usedKeys = new Set<string>();
    for (const cursor of cursors) {
      linksBySourceKey.set(cursor.key, cursor.links);
      for (const link of cursor.links) {
        const key = this._buildRelationKey(link, throughTargetFields);
        if (key) {
          usedKeys.add(key);
        }
      }
    }

    // A round can survive more targets than the parents that triggered it end
    // up keeping. Dropping the leftovers here keeps the nested `with` and the
    // next fan-out level sized to the page.
    return {
      linksBySourceKey,
      targets: survivors.filter((target) => {
        const key = this._buildRelationKey(target, targetFields);
        return key !== null && usedKeys.has(key);
      }),
    };
  }

  /**
   * Load many() relation (one-to-many)
   * Example: users.posts where posts.authorId → users.id
   *
   * For many() relations, use the configured from/to fields to match rows.
   * Supports .through() for many-to-many relations via a junction table.
   * M6.5 Phase 2: Added support for nested relations
   * M6.5 Phase 3: Added support for where filters, orderBy, and per-parent limit
   */
  private async _loadManyRelation(
    rows: any[],
    relationName: string,
    edge: EdgeMetadata,
    relationConfig: unknown,
    depth: number,
    maxDepth: number,
    tableConfig: TableRelationalConfig
  ): Promise<void> {
    const sourceFields =
      edge.sourceFields.length > 0 ? edge.sourceFields : ['_id'];
    const targetFields =
      edge.targetFields.length > 0 ? edge.targetFields : [edge.fieldName];

    const sourceKeyMap = new Map<string, unknown[]>();
    for (const row of rows) {
      const values = sourceFields.map((field) => row[field]);
      if (values.some((value) => value === null || value === undefined)) {
        continue;
      }
      const key = JSON.stringify(values);
      if (!sourceKeyMap.has(key)) {
        sourceKeyMap.set(key, values);
      }
    }

    if (sourceKeyMap.size === 0) {
      return;
    }
    this._enforceRelationFanOutKeyCap({
      tableConfig,
      relationName,
      keyCount: sourceKeyMap.size,
      scope: 'source',
    });

    const targetTableConfig = this._getTableConfigByDbName(edge.targetTable);
    if (!targetTableConfig) {
      throw new Error(
        `Relation '${relationName}' target table '${edge.targetTable}' not found.`
      );
    }
    const relationDefinition = tableConfig.relations[relationName];
    const strict = tableConfig.strict !== false;

    // RLS and the relation `where` clauses are applied in JavaScript after the
    // read, so a `take()` pushed into the FK query would spend its budget on
    // rows that are about to be discarded — `{ limit: 3, where: { published:
    // true } }` returns nothing when three unpublished children sort first.
    //
    // `mode: 'skip'` returns every row untouched, so it discards nothing and
    // must not cost the read bound.
    const hasPostFetchTargetFilter =
      (this.rls?.mode !== 'skip' &&
        isRlsEnabled(targetTableConfig.table as any)) ||
      Boolean(relationDefinition?.where) ||
      Boolean(
        relationConfig &&
          typeof relationConfig === 'object' &&
          'where' in relationConfig &&
          (relationConfig as { where?: unknown }).where
      );

    let orderSpecs: { field: string; direction: 'asc' | 'desc' }[] = [];
    if (
      relationConfig &&
      typeof relationConfig === 'object' &&
      'orderBy' in relationConfig
    ) {
      let orderByValue = (relationConfig as any).orderBy;
      if (typeof orderByValue === 'function') {
        orderByValue = orderByValue(targetTableConfig.table as any, {
          asc,
          desc,
        });
      }
      orderSpecs = this._orderBySpecs(orderByValue, targetTableConfig);
    }

    const perParentLimit =
      relationConfig &&
      typeof relationConfig === 'object' &&
      'limit' in relationConfig
        ? (relationConfig as any).limit
        : undefined;
    const effectivePerParentLimit =
      perParentLimit ??
      getOrmContext(this.db as any)?.resolvedDefaults?.defaultLimit ??
      tableConfig.defaults?.defaultLimit;
    if (
      effectivePerParentLimit !== undefined &&
      (!Number.isInteger(effectivePerParentLimit) ||
        effectivePerParentLimit < 1)
    ) {
      throw new Error('Only positive integer limit is supported in kitcn ORM.');
    }
    if (effectivePerParentLimit === undefined && !this.allowFullScan) {
      throw new Error(
        `Relation "${tableConfig.name}.${relationName}" requires limit, allowFullScan: true, or defineSchema(..., { defaults: { defaultLimit } }).`
      );
    }

    const perParentOffset =
      relationConfig &&
      typeof relationConfig === 'object' &&
      'offset' in relationConfig
        ? (relationConfig as any).offset
        : undefined;
    if (perParentOffset !== undefined && typeof perParentOffset !== 'number') {
      throw new Error('Only numeric offset is supported in kitcn ORM.');
    }

    const applyOffsetAndLimit = (items: any[]): any[] => {
      let result = items;
      if (perParentOffset !== undefined && perParentOffset > 0) {
        result = result.slice(perParentOffset);
      }
      if (effectivePerParentLimit !== undefined) {
        result = result.slice(0, effectivePerParentLimit);
      }
      return result;
    };

    const applyPostFetchTargetFilters = async (
      candidateTargets: any[]
    ): Promise<any[]> => {
      let filteredTargets = await this._applyRlsSelectFilter(
        candidateTargets,
        targetTableConfig
      );

      if (relationDefinition?.where) {
        filteredTargets = filteredTargets.filter((target) =>
          this._evaluateTableFilter(
            target,
            targetTableConfig,
            relationDefinition.where as any
          )
        );
      }

      if (
        relationConfig &&
        typeof relationConfig === 'object' &&
        'where' in relationConfig
      ) {
        const whereFilter = (relationConfig as any).where;
        if (typeof whereFilter === 'function') {
          const whereExpression = this._resolveWhereCallbackExpression(
            whereFilter as (...args: any[]) => unknown,
            targetTableConfig,
            { context: 'relation' }
          );
          if (
            whereExpression &&
            !this._isPredicateWhereClause(whereExpression)
          ) {
            filteredTargets = filteredTargets.filter((target) =>
              this._evaluatePostFetchFilter(target, whereExpression)
            );
          }
        } else if (whereFilter) {
          const targetEdges = this._getTargetTableEdges(edge.targetTable);
          filteredTargets = await this._applyRelationsFilterToRows(
            filteredTargets,
            targetTableConfig,
            whereFilter,
            targetEdges,
            depth + 1,
            maxDepth,
            (relationConfig as any).with
          );
        }
      }

      return filteredTargets;
    };

    let targets: any[] = [];
    let throughBySourceKey: Map<string, any[]> | undefined;
    let targetFiltersApplied = false;

    if (edge.through) {
      const throughTableConfig = this._getTableConfigByDbName(
        edge.through.table
      );
      if (!throughTableConfig) {
        throw new Error(
          `Relation '${relationName}' through table '${edge.through.table}' not found.`
        );
      }

      const throughIndexName = findRelationIndex(
        throughTableConfig.table as any,
        edge.through.sourceFields,
        `${tableConfig.name}.${relationName}`,
        edge.through.table,
        strict,
        this.allowFullScan
      );

      const entries = Array.from(sourceKeyMap.entries());
      const enforceTargetKeyCap = (keyCount: number) =>
        this._enforceRelationFanOutKeyCap({
          tableConfig,
          relationName,
          keyCount,
          scope: 'through-target',
        });

      // Resolved on first use so an empty junction partition still costs
      // nothing and never reports a missing target index.
      let targetLookup: {
        useGetById: boolean;
        indexName: string | null;
      } | null = null;
      const fetchThroughTargets = async (
        keyEntries: [string, unknown[]][]
      ): Promise<{ key: string; target: any }[]> => {
        if (!targetLookup) {
          const useGetById =
            targetFields.length === 1 && targetFields[0] === '_id';
          targetLookup = {
            useGetById,
            indexName: useGetById
              ? null
              : findRelationIndex(
                  targetTableConfig.table as any,
                  targetFields,
                  `${tableConfig.name}.${relationName}`,
                  edge.targetTable,
                  strict,
                  this.allowFullScan
                ),
          };
        }
        const { useGetById, indexName } = targetLookup;
        return await this._mapWithConcurrency(
          keyEntries,
          async ([key, values]) => {
            let target: any | null = null;
            if (useGetById) {
              target = await this._getById(edge.targetTable, values[0]);
            } else {
              target = await this._queryByFields(
                this.db.query(edge.targetTable),
                targetFields,
                values,
                indexName
              ).first();
            }
            return { key, target };
          }
        );
      };

      // `orderBy` on a through relation sorts by *target* columns, which the
      // junction index knows nothing about, so that case still needs the whole
      // partition. Every other shape can stop at the page the caller asked for
      // instead of reading every link of every parent.
      const boundJunctionRead =
        orderSpecs.length === 0 && effectivePerParentLimit !== undefined;

      if (boundJunctionRead) {
        const bounded = await this._readBoundedThroughLinks({
          applyTargetFilters: applyPostFetchTargetFilters,
          edge,
          enforceTargetKeyCap,
          entries,
          fetchLimit:
            Math.max(perParentOffset ?? 0, 0) + effectivePerParentLimit!,
          fetchTargets: fetchThroughTargets,
          targetFields,
          throughIndexName,
          throughTableConfig,
        });
        throughBySourceKey = bounded.linksBySourceKey;
        targets = bounded.targets;
        targetFiltersApplied = true;
      } else {
        const throughRowsPerSource = await this._mapWithConcurrency(
          entries,
          async ([key, values]) => {
            const query = this._queryByFields(
              this.db.query(edge.through!.table),
              edge.through!.sourceFields,
              values,
              throughIndexName
            );
            const throughRows = await this._applyRlsSelectFilter(
              await query.collect(),
              throughTableConfig
            );
            return { key, rows: throughRows };
          }
        );

        throughBySourceKey = new Map<string, any[]>();
        const targetKeyMap = new Map<string, unknown[]>();
        for (const entry of throughRowsPerSource) {
          throughBySourceKey.set(entry.key, entry.rows);
          for (const row of entry.rows) {
            const values = edge.through!.targetFields.map(
              (field) => row[field]
            );
            if (values.some((value) => value === null || value === undefined)) {
              continue;
            }
            const key = JSON.stringify(values);
            if (!targetKeyMap.has(key)) {
              targetKeyMap.set(key, values);
            }
          }
        }
        enforceTargetKeyCap(targetKeyMap.size);

        if (targetKeyMap.size > 0) {
          const fetchedTargets = await fetchThroughTargets(
            Array.from(targetKeyMap.entries())
          );
          targets = fetchedTargets
            .map((entry) => entry.target)
            .filter((value): value is any => !!value);
        }
      }
    } else {
      const indexName = findRelationIndex(
        targetTableConfig.table as any,
        targetFields,
        `${tableConfig.name}.${relationName}`,
        edge.targetTable,
        strict,
        this.allowFullScan,
        orderSpecs
      );

      const entries = Array.from(sourceKeyMap.entries());
      // The FK is pinned by `eq`, so the rest of the index key is the child
      // order Convex already walks. Resolved once for the whole relation, not
      // per group: a per-group answer would make the global sort below unsound.
      const orderPushdownDirection = resolveIndexOrderPushdown({
        indexFields: indexName
          ? (getIndexes(targetTableConfig.table as any).find(
              (idx) => idx.name === indexName
            )?.fields ?? null)
          : null,
        pinnedEqCount: targetFields.length,
        orderSpecs,
      });
      const orderServedByIndex =
        orderSpecs.length === 0 || orderPushdownDirection !== null;
      const applyPushdownOrder = (query: any) =>
        orderPushdownDirection ? query.order(orderPushdownDirection) : query;

      const streamPostFetchTargetFilters =
        orderServedByIndex &&
        hasPostFetchTargetFilter &&
        effectivePerParentLimit !== undefined;
      targetFiltersApplied = streamPostFetchTargetFilters;
      const targetGroups = await this._mapWithConcurrency(
        entries,
        async ([, values]) => {
          const query = this._queryByFields(
            this.db.query(edge.targetTable),
            targetFields,
            values,
            indexName
          );

          if (
            orderServedByIndex &&
            !hasPostFetchTargetFilter &&
            effectivePerParentLimit !== undefined
          ) {
            const fetchLimit =
              (perParentOffset ?? 0) + (effectivePerParentLimit ?? 0);
            return await applyPushdownOrder(query).take(fetchLimit);
          }

          if (streamPostFetchTargetFilters) {
            const visibleTargets: any[] = [];
            const fetchLimit =
              Math.max(perParentOffset ?? 0, 0) +
              (effectivePerParentLimit ?? 0);
            let batch: any[] = [];
            // Filtering one row at a time defeats the batching and foreign-key
            // de-duplication `_applyRelationsFilterToRows` does, so drain the
            // cursor in chunks. The chunk is never larger than the number of
            // rows still needed, which keeps the read bound as tight as the
            // one-at-a-time version while still letting the sub-reads batch.
            const drain = async () => {
              if (batch.length === 0) return;
              const filtered = await applyPostFetchTargetFilters(batch);
              batch = [];
              for (const row of filtered) {
                if (visibleTargets.length >= fetchLimit) return;
                visibleTargets.push(row);
              }
            };
            for await (const target of applyPushdownOrder(query)) {
              batch.push(target);
              const chunk = Math.min(
                RELATION_FILTER_STREAM_CHUNK,
                fetchLimit - visibleTargets.length
              );
              if (batch.length < chunk) continue;
              await drain();
              if (visibleTargets.length >= fetchLimit) break;
            }
            if (visibleTargets.length < fetchLimit) {
              await drain();
            }
            return visibleTargets;
          }

          return await query.collect();
        }
      );

      targets = targetGroups.flat();
    }

    if (!targetFiltersApplied) {
      targets = await applyPostFetchTargetFilters(targets);
    }

    if (orderSpecs.length > 0) {
      targets.sort((a, b) => this._compareByOrderSpecs(a, b, orderSpecs));
    }

    // Trim to the per-parent page before the nested `with`, extras and column
    // selection run. A child that is about to be sliced away should not pay for
    // its own grandchild queries, and — because the surviving children are the
    // next level's source keys — should not consume the fan-out budget either.
    // Filtering and sorting must both have happened first, so this is the only
    // sound insertion point.
    //
    // Through relations build their per-parent lists from junction rows further
    // down instead, so grouping their globally deduped targets here would trim
    // the wrong thing.
    if (
      !edge.through &&
      (perParentOffset !== undefined || effectivePerParentLimit !== undefined)
    ) {
      const groupedTargets = new Map<string, any[]>();
      for (const target of targets) {
        const parentKey = this._buildRelationKey(target, targetFields);
        if (!parentKey) continue;
        const group = groupedTargets.get(parentKey);
        if (group) {
          group.push(target);
        } else {
          groupedTargets.set(parentKey, [target]);
        }
      }
      const trimmed: any[] = [];
      for (const children of groupedTargets.values()) {
        for (const child of applyOffsetAndLimit(children)) {
          trimmed.push(child);
        }
      }
      targets = trimmed;
    }

    if (
      relationConfig &&
      typeof relationConfig === 'object' &&
      'with' in relationConfig
    ) {
      const targetTableEdges = this._getTargetTableEdges(edge.targetTable);
      await this._loadRelations(
        targets,
        (relationConfig as any).with,
        depth + 1,
        maxDepth,
        targetTableEdges,
        targetTableConfig
      );
    }

    if (
      relationConfig &&
      typeof relationConfig === 'object' &&
      'extras' in relationConfig
    ) {
      targets = this._applyExtras(
        targets,
        (relationConfig as any).extras,
        this._getColumns(targetTableConfig),
        (relationConfig as any).with,
        targetTableConfig.name,
        targetTableConfig
      );
    }

    const selectedTargets = this._selectColumns(
      targets,
      relationConfig &&
        typeof relationConfig === 'object' &&
        'columns' in relationConfig
        ? (relationConfig as any).columns
        : undefined,
      this._getColumns(targetTableConfig),
      targetTableConfig
    );
    const selectedTargetsByKey = new Map<string, any>();
    for (let i = 0; i < targets.length; i += 1) {
      const key = this._buildRelationKey(targets[i], targetFields);
      if (key) {
        selectedTargetsByKey.set(key, selectedTargets[i]);
      }
    }

    if (edge.through) {
      const targetOrder = new Map<string, number>();
      targets.forEach((target, index) => {
        const key = this._buildRelationKey(target, targetFields);
        if (key) targetOrder.set(key, index);
      });

      const targetsByKey = selectedTargetsByKey;

      for (const row of rows) {
        const sourceKey = this._buildRelationKey(row, sourceFields);
        if (!sourceKey || !throughBySourceKey) {
          row[relationName] = [];
          continue;
        }
        const throughRowsForSource = throughBySourceKey.get(sourceKey) ?? [];
        const relatedTargets = throughRowsForSource
          .map((throughRow) => {
            const key = this._buildRelationKey(
              throughRow,
              edge.through!.targetFields
            );
            return key ? targetsByKey.get(key) : undefined;
          })
          .filter((t): t is any => !!t)
          .sort((a, b) => {
            const aKey = this._buildRelationKey(a, targetFields) ?? '';
            const bKey = this._buildRelationKey(b, targetFields) ?? '';
            return (targetOrder.get(aKey) ?? 0) - (targetOrder.get(bKey) ?? 0);
          });
        row[relationName] = applyOffsetAndLimit(relatedTargets);
      }
    } else {
      // Group targets by parent key
      const byParentKey = new Map<string, any[]>();
      const targetsForMapping = selectedTargets ?? targets;
      for (let i = 0; i < targets.length; i += 1) {
        const target = targets[i];
        const mappedTarget = targetsForMapping[i];
        const parentKey = this._buildRelationKey(target, targetFields);
        if (!parentKey) continue;
        if (!byParentKey.has(parentKey)) {
          byParentKey.set(parentKey, []);
        }
        byParentKey.get(parentKey)!.push(mappedTarget);
      }

      // Offset/limit already applied above, before the nested loads.

      // Map relations back to parent rows
      for (const row of rows) {
        const rowKey = this._buildRelationKey(row, sourceFields);
        row[relationName] = rowKey ? (byParentKey.get(rowKey) ?? []) : [];
      }
    }
  }

  private _applyExtras(
    rows: any[],
    extrasConfig: unknown,
    tableColumns: Record<string, ColumnBuilder<any, any, any>>,
    withConfig: Record<string, unknown> | undefined,
    tableName: string,
    tableConfig: TableRelationalConfig = this.tableConfig
  ): any[] {
    if (!extrasConfig || rows.length === 0) {
      return rows;
    }

    const resolvedExtras =
      typeof extrasConfig === 'function'
        ? extrasConfig(tableColumns)
        : extrasConfig;

    if (!this._isRecord(resolvedExtras)) {
      return rows;
    }

    const entries = Object.entries(resolvedExtras);
    if (entries.length === 0) {
      return rows;
    }

    for (const [key] of entries) {
      if (key in tableColumns) {
        throw new Error(
          `extras.${key} conflicts with a column on table '${tableName}'.`
        );
      }
      if (withConfig && key in withConfig) {
        throw new Error(
          `extras.${key} conflicts with a relation on table '${tableName}'.`
        );
      }
    }

    for (const row of rows) {
      // Hydrate at most once per row and mirror each computed extra onto the
      // public copy, so later extras still observe earlier ones without paying
      // a fresh reshape per extra.
      let publicRow: any;
      for (const [key, definition] of entries) {
        if (typeof definition === 'function') {
          publicRow ??= this._toPublicRow(row, tableConfig);
          row[key] = definition(publicRow);
        } else {
          row[key] = definition;
        }
        if (publicRow) {
          publicRow[key] = row[key];
        }
      }
    }

    return rows;
  }

  /**
   * Select specific columns from rows
   * Phase 5 implementation
   */
  private _selectColumns(
    rows: any[],
    columnsConfig?: Record<string, boolean>,
    tableColumns?: Record<string, ColumnBuilder<any, any, any>>,
    tableConfig: TableRelationalConfig = this.tableConfig
  ): any[] {
    if (!columnsConfig) {
      // No column selection - return all columns
      return rows.map((row) => this._toPublicRow(row, tableConfig));
    }

    const columnKeys = tableColumns
      ? new Set(
          Object.keys(tableColumns).map((key) =>
            this._normalizePublicFieldName(key, tableConfig)
          )
        )
      : undefined;
    const entries = Object.entries(columnsConfig).filter(
      ([, value]) => value !== undefined
    );
    const hasTrue = entries.some(([, value]) => value === true);

    if (entries.length === 0) {
      return rows.map((row) => {
        if (!columnKeys) return {};
        const selected: any = {};
        for (const key of Object.keys(row)) {
          if (!columnKeys.has(key)) {
            selected[key] = row[key];
          }
        }
        return this._toPublicRow(selected, tableConfig);
      });
    }

    if (hasTrue) {
      const includeKeys = entries
        .filter(([, value]) => value === true)
        .map(([key]) => this._normalizePublicFieldName(key, tableConfig));
      return rows.map((row) => {
        const selected: any = {};
        for (const key of includeKeys) {
          if (key in row) {
            selected[key] = row[key];
          }
        }
        if (columnKeys) {
          for (const key of Object.keys(row)) {
            if (!columnKeys.has(key)) {
              selected[key] = row[key];
            }
          }
        }
        return this._toPublicRow(selected, tableConfig);
      });
    }

    const excludeKeys = entries
      .filter(([, value]) => value === false)
      .map(([key]) => this._normalizePublicFieldName(key, tableConfig));
    return rows.map((row) => {
      const selected = { ...row };
      for (const key of excludeKeys) {
        if (!columnKeys || columnKeys.has(key)) {
          delete selected[key];
        }
      }
      return this._toPublicRow(selected, tableConfig);
    });
  }
}
