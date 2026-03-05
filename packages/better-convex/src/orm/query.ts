/**
 * GelRelationalQuery - Promise-based query builder
 *
 * Implements Drizzle's query pattern for Convex:
 * - Extends QueryPromise for lazy execution
 * - Stores query configuration
 * - Executes Convex queries on await
 */

import type { GenericDatabaseReader } from 'convex/server';
import {
  compileRankPlan,
  ensureRankAllowedForRls,
  ensureRankIndexReady,
  readRankAt,
  readRankCount,
  readRankIndexOf,
  readRankMax,
  readRankMin,
  readRankPaginate,
  readRankRandom,
  readRankSum,
} from './aggregate-index/rank-runtime';
import type { PlanBucketReadCache } from './aggregate-index/runtime';
import {
  AGGREGATE_ERROR,
  COUNT_ERROR,
  compileAggregateQueryPlan,
  compileCountFieldQueryPlan,
  compileCountQueryPlan,
  createAggregateError,
  createCountError,
  ensureAggregateAllowedForRls,
  ensureAggregateIndexReady,
  ensureCountAllowedForRls,
  ensureCountIndexReady,
  isAggregatePlanZero,
  isIndexCountZero,
  readAverageFromBuckets,
  readCountFieldFromBuckets,
  readCountFromBuckets,
  readExtremaFromBuckets,
  readSumFromBuckets,
} from './aggregate-index/runtime';
import { type ColumnBuilder, entityKind } from './builders/column-builder';
import { OrmNotFoundError } from './errors';
import type { EdgeMetadata } from './extractRelationsConfig';
import type {
  BinaryExpression,
  ExpressionVisitor,
  FilterExpression,
  LogicalExpression,
  UnaryExpression,
} from './filter-expression';
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
import { filterSelectRows } from './rls/evaluator';
import type { RlsContext } from './rls/types';
import {
  EmptyStream,
  getIndexFields,
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
  WhereClauseCompiler,
} from './where-clause-compiler';

const DEFAULT_RELATION_FAN_OUT_MAX_KEYS = 1000;
const DEFAULT_AGGREGATE_CARTESIAN_MAX_KEYS = 4096;
const DEFAULT_AGGREGATE_WORK_BUDGET = 16_384;
const PUBLIC_ID_FIELD = 'id';
const INTERNAL_ID_FIELD = '_id';
const ID_MIGRATION_MESSAGE = '`_id` is no longer public. Use `id` instead.';
const RELATION_COUNT_ERROR = {
  NOT_INDEXED: 'RELATION_COUNT_NOT_INDEXED',
  FILTER_UNSUPPORTED: 'RELATION_COUNT_FILTER_UNSUPPORTED',
} as const;

type GroupByOrderSpec = {
  direction: 'asc' | 'desc';
  label: string;
  path: string[];
};

class LimitedQueryStream<
  T extends NonNullable<unknown>,
> extends QueryStream<T> {
  constructor(
    private readonly inner: QueryStream<T>,
    private readonly limit: number
  ) {
    super();
  }

  iterWithKeys(): AsyncIterable<[T | null, IndexKey]> {
    const iterable = this.inner.iterWithKeys();
    const max = this.limit;
    return {
      [Symbol.asyncIterator]() {
        const iterator = iterable[Symbol.asyncIterator]();
        let seen = 0;
        return {
          async next() {
            if (seen >= max) {
              return { done: true as const, value: undefined };
            }
            const next = await iterator.next();
            if (!next.done) {
              seen += 1;
            }
            return next as any;
          },
        };
      },
    };
  }

  narrow(indexBounds: {
    lowerBound: IndexKey;
    lowerBoundInclusive: boolean;
    upperBound: IndexKey;
    upperBoundInclusive: boolean;
  }): QueryStream<T> {
    return new LimitedQueryStream(this.inner.narrow(indexBounds), this.limit);
  }

  getOrder(): 'asc' | 'desc' {
    return this.inner.getOrder();
  }

  getIndexFields(): string[] {
    return this.inner.getIndexFields();
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
    ensureRankAllowedForRls(this.tableConfig, this.rls?.mode);
    const plan = compileRankPlan(
      this.tableConfig,
      this.indexName,
      this.config.where
    );
    await ensureRankIndexReady(this.db, this.tableConfig.name, this.indexName);
    return plan;
  }

  async count(): Promise<number> {
    const plan = await this._plan();
    return await readRankCount(this.db, plan);
  }

  async sum(): Promise<number> {
    const plan = await this._plan();
    return await readRankSum(this.db, plan);
  }

  async at(
    offset: number
  ): Promise<{ id: string; key: unknown; sumValue: number } | null> {
    const plan = await this._plan();
    return await readRankAt(this.db, plan, offset);
  }

  async indexOf(args: { id: string }): Promise<number> {
    const plan = await this._plan();
    return await readRankIndexOf(this.db, plan, args);
  }

  async paginate(args: { cursor?: string | null; limit: number }): Promise<{
    continueCursor: string;
    isDone: boolean;
    page: Array<{ id: string; key: unknown; sumValue: number }>;
  }> {
    if (!Number.isInteger(args.limit) || args.limit < 1) {
      throw new Error('rank().paginate() requires a positive integer limit.');
    }
    const plan = await this._plan();
    return await readRankPaginate(
      this.db,
      plan,
      args.cursor ?? null,
      args.limit
    );
  }

  async min(): Promise<{ id: string; key: unknown; sumValue: number } | null> {
    const plan = await this._plan();
    return await readRankMin(this.db, plan);
  }

  async max(): Promise<{ id: string; key: unknown; sumValue: number } | null> {
    const plan = await this._plan();
    return await readRankMax(this.db, plan);
  }

  async random(): Promise<{
    id: string;
    key: unknown;
    sumValue: number;
  } | null> {
    const plan = await this._plan();
    return await readRankRandom(this.db, plan);
  }
}

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
  private readonly _countIndexReadinessByKey = new Map<string, Promise<void>>();
  private readonly _aggregateIndexReadinessByKey = new Map<
    string,
    Promise<void>
  >();

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
    private configuredIndex?: PredicateWhereIndexConfig<TTableConfig>
  ) {
    super();
    this.allowFullScan = (config as any).allowFullScan === true;
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

  private _extractIdOnlyWhere(
    where: unknown
  ): { kind: 'eq'; id: unknown } | { kind: 'in'; ids: unknown[] } | null {
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
    if (!rows.length || !tableConfig) return rows;
    return await filterSelectRows({
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
      throw new Error(
        'Only positive integer limit is supported in Better Convex ORM.'
      );
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

  private _getTableConfigByDbName(
    dbName: string
  ): TableRelationalConfig | undefined {
    const tables = Object.values(this.schema) as TableRelationalConfig[];
    return tables.find((table) => table.name === dbName);
  }

  private _matchLike(
    value: string,
    pattern: string,
    caseInsensitive: boolean
  ): boolean {
    const targetValue = caseInsensitive ? value.toLowerCase() : value;
    const targetPattern = caseInsensitive ? pattern.toLowerCase() : pattern;

    if (targetPattern.startsWith('%') && targetPattern.endsWith('%')) {
      const substring = targetPattern.slice(1, -1);
      return targetValue.includes(substring);
    }
    if (targetPattern.startsWith('%')) {
      const suffix = targetPattern.slice(1);
      return targetValue.endsWith(suffix);
    }
    if (targetPattern.endsWith('%')) {
      const prefix = targetPattern.slice(0, -1);
      return targetValue.startsWith(prefix);
    }
    return targetValue === targetPattern;
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
          return fieldValue === normalizedValue;
        case 'ne':
          return fieldValue !== normalizedValue;
        case 'gt':
          return fieldValue > comparableValue;
        case 'gte':
          return fieldValue >= comparableValue;
        case 'lt':
          return fieldValue < comparableValue;
        case 'lte':
          return fieldValue <= comparableValue;
        case 'inArray': {
          const arr = normalizedValue as any[];
          return arr.includes(fieldValue);
        }
        case 'notInArray': {
          const arr = normalizedValue as any[];
          return !arr.includes(fieldValue);
        }
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
        return fieldValue === this._normalizeComparableValue(fieldName, filter);
      }
      return fieldValue === filter;
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
          results.push((normalized as any[]).includes(fieldValue));
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
          results.push(!(normalized as any[]).includes(fieldValue));
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
            fieldValue ===
              (fieldName
                ? this._normalizeComparableValue(fieldName, value)
                : value)
          );
          continue;
        case 'ne':
          results.push(
            fieldValue !==
              (fieldName
                ? this._normalizeComparableValue(fieldName, value)
                : value)
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

    let rowsWithRelations = rows;
    if (effectiveWith) {
      rowsWithRelations = await this._loadRelations(
        rowsWithRelations,
        effectiveWith,
        0,
        3,
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

  private _buildBasePipelineStream(
    queryConfig: {
      index?: { name: string; filters: FilterExpression<boolean>[] };
      postFilters: FilterExpression<boolean>[];
      order?: { direction: 'asc' | 'desc'; field: string }[];
    },
    wherePredicate: ((row: any) => boolean | Promise<boolean>) | undefined,
    configuredIndex?: PredicateWhereIndexConfig<TTableConfig>
  ): QueryStream<any> {
    const schemaDefinition = this._getSchemaDefinitionOrThrow();
    let streamQuery: any = stream(
      this.db as GenericDatabaseReader<any>,
      schemaDefinition
    ).query(this.tableConfig.name as any);

    const primaryOrder = queryConfig.order?.[0];
    const primaryOrderDirection = primaryOrder?.direction ?? 'asc';

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
    } else if (primaryOrder && primaryOrder.field !== '_creationTime') {
      const orderIndex = getIndexes(this.tableConfig.table).find(
        (idx) => idx.fields[0] === primaryOrder.field
      );
      if (orderIndex) {
        streamQuery = streamQuery.withIndex(
          orderIndex.name as any,
          (q: any) => q
        );
      }
    }

    streamQuery = streamQuery.order(primaryOrderDirection);

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

  private _buildUnionSourceStream(
    source: FindManyUnionSource<TTableConfig>,
    fallbackOrder: 'asc' | 'desc'
  ): QueryStream<any> {
    const configuredIndex = this.configuredIndex;
    this._assertWhereIndexRequirement({
      where: source.where,
      tableConfig: this.tableConfig,
      hasConfiguredIndex: Boolean(configuredIndex?.name),
      context: 'pipeline.union source',
    });

    const schemaDefinition = this._getSchemaDefinitionOrThrow();
    let sourceStream: any = stream(
      this.db as GenericDatabaseReader<any>,
      schemaDefinition
    ).query(this.tableConfig.name as any);

    if (configuredIndex?.name) {
      sourceStream = sourceStream.withIndex(
        configuredIndex.name as any,
        configuredIndex.range ? (configuredIndex.range as any) : (q: any) => q
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
        return new EmptyStream<any>(outerOrder, innerIndexFields);
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

      if (stage.limit !== undefined) {
        if (!Number.isInteger(stage.limit) || stage.limit < 1) {
          throw new Error('pipeline.flatMap.limit must be a positive integer');
        }
        inner = new LimitedQueryStream(inner, stage.limit);
      }

      if (stage.includeParent ?? true) {
        inner = inner.map(async (child: any) => ({ parent, child }));
      }

      return inner;
    }, innerIndexFields);
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
        [orderField]: {
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
        [orderField]: {
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

    const pending = ensureCountIndexReady(
      this.db as any,
      tableName,
      indexName
    ).catch((error) => {
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

    const pending = ensureAggregateIndexReady(
      this.db as any,
      tableName,
      indexName
    ).catch((error) => {
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

    const plan = compileCountQueryPlan(this.tableConfig, where);
    if (isIndexCountZero(plan)) {
      return 0;
    }
    await this._ensureCountIndexReadyOnce(plan.tableName, plan.indexName);
    return await readCountFromBuckets(this.db as any, plan, bucketCache);
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

    const fieldEntries = await Promise.all(
      select.fields.map(async (field) => {
        const plan = compileCountFieldQueryPlan(
          this.tableConfig,
          normalizedWhere,
          field
        );
        if (isAggregatePlanZero(plan)) {
          return [field, 0] as const;
        }
        await this._ensureCountIndexReadyOnce(plan.tableName, plan.indexName);
        const value = await readCountFieldFromBuckets(this.db as any, plan);
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
                const plan = compileAggregateQueryPlan(
                  this.tableConfig,
                  normalized.where,
                  { kind: 'countField', field }
                );
                if (isAggregatePlanZero(plan)) {
                  countResult[field] = 0;
                  return;
                }
                await this._ensureAggregateIndexReadyOnce(
                  plan.tableName,
                  plan.indexName
                );
                countResult[field] = await readCountFieldFromBuckets(
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
              const plan = compileAggregateQueryPlan(
                this.tableConfig,
                normalized.where,
                { kind: 'sum', field }
              );
              if (isAggregatePlanZero(plan)) {
                return [field, null] as const;
              }
              await this._ensureAggregateIndexReadyOnce(
                plan.tableName,
                plan.indexName
              );
              const value = await readSumFromBuckets(
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
              const plan = compileAggregateQueryPlan(
                this.tableConfig,
                normalized.where,
                { kind: 'avg', field }
              );
              if (isAggregatePlanZero(plan)) {
                return [field, null] as const;
              }
              await this._ensureAggregateIndexReadyOnce(
                plan.tableName,
                plan.indexName
              );
              const value = await readAverageFromBuckets(
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
              const plan = compileAggregateQueryPlan(
                this.tableConfig,
                normalized.where,
                { kind: 'min', field }
              );
              if (isAggregatePlanZero(plan)) {
                return [field, null] as const;
              }
              await this._ensureAggregateIndexReadyOnce(
                plan.tableName,
                plan.indexName
              );
              const value = await readExtremaFromBuckets(
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
              const plan = compileAggregateQueryPlan(
                this.tableConfig,
                normalized.where,
                { kind: 'max', field }
              );
              if (isAggregatePlanZero(plan)) {
                return [field, null] as const;
              }
              await this._ensureAggregateIndexReadyOnce(
                plan.tableName,
                plan.indexName
              );
              const value = await readExtremaFromBuckets(
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
      return '__betterConvexUndefined';
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
      this._pushGroupByConstraint(constraints, fieldName, [null]);
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

  private _buildGroupByCandidates(
    byFields: string[],
    byFieldValues: Record<string, unknown[]>
  ): Record<string, unknown>[] {
    if (byFields.length === 0) {
      return [];
    }

    const output: Record<string, unknown>[] = [];
    const current: Record<string, unknown> = {};
    const build = (index: number) => {
      if (index >= byFields.length) {
        output.push({ ...current });
        return;
      }
      const field = byFields[index]!;
      const values = byFieldValues[field] ?? [];
      for (const value of values) {
        current[field] = value;
        build(index + 1);
      }
      delete current[field];
    };
    build(0);
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
    candidates: Record<string, unknown>[];
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
    if (candidates.length > maxKeys) {
      throw createAggregateError(
        AGGREGATE_ERROR.ARGS_UNSUPPORTED,
        `groupBy() expands to ${candidates.length} groups, exceeding aggregateCartesianMaxKeys (${maxKeys}). Reduce IN fan-out or increase defineSchema(..., { defaults: { aggregateCartesianMaxKeys } }).`
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
    const estimatedWork = candidates.length * Math.max(1, metricReads);
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
          ? candidate
          : {
              AND: [normalized.aggregate.where, candidate],
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
              candidate[entry.field]
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
   * Execute the query and return results
   * Phase 4 implementation with WhereClauseCompiler integration
   */
  async execute(): Promise<TResult> {
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

    // Fast path: `id` lookups use `db.get()` (primary key) instead of an index plan.
    // This keeps `where: { id: ... }` and `where: { id: { in: [...] } }` ergonomic
    // without requiring allowFullScan, and avoids full collection scans.
    const idLookup = this._extractIdOnlyWhere(whereFilter);
    if (
      idLookup &&
      !vectorSearchConfig &&
      !searchConfig &&
      !wherePredicate &&
      !isCursorPaginated &&
      configuredIndex === undefined
    ) {
      const orderSpecs = this._orderBySpecs(config.orderBy);
      const offset = config.offset ?? 0;
      if (offset !== undefined && typeof offset !== 'number') {
        throw new Error(
          'Only numeric offset is supported in Better Convex ORM.'
        );
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
        if (id === null || id === undefined) {
          return null;
        }
        return this.db.get(id as any);
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

    const queryConfig = this._toConvexQuery(whereExpressionFromCallback);
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
          3,
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
        streamQuery = this._buildBasePipelineStream(
          queryConfig,
          wherePredicate,
          configuredIndex
        );
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
          await this._applyRlsSelectFilter(
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
        throw new Error(
          'Only numeric offset is supported in Better Convex ORM.'
        );
      }
      const limit = this._resolveNonPaginatedLimit(config);
      let rows =
        limit === undefined
          ? await streamQuery.collect()
          : await streamQuery.take(offset > 0 ? offset + limit : limit);
      if (offset > 0) {
        rows = rows.slice(offset);
      }

      rows = await this._applyRlsSelectFilter(rows, this.tableConfig);
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
            3,
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
        throw new Error(
          'Only numeric offset is supported in Better Convex ORM.'
        );
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
          3,
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
        const orderField = primaryOrder.field;
        const indexFields = queryConfig.index.filters.map(
          (f: any) => (f as any).operands[0].fieldName
        );
        // _creationTime is always available as index ordering suffix in Convex.
        // If ordering by same field as index (or _creationTime), apply .order().
        if (
          indexFields.includes(orderField) ||
          orderField === '_creationTime'
        ) {
          query = query.order(primaryOrder.direction);
        } else {
          // Different field - need post-fetch sort
          needsPostFetchSortForPrimary = true;
        }
      }
    } else if (configuredIndex?.name) {
      query = query.withIndex(
        configuredIndex.name as any,
        configuredIndex.range ? (configuredIndex.range as any) : (q: any) => q
      );

      if (primaryOrder) {
        if (primaryOrder.field === '_creationTime') {
          query = query.order(primaryOrder.direction);
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
        const orderIndex =
          getIndexes(this.tableConfig.table).find((idx) =>
            idx.fields.includes(orderField)
          ) ??
          this.edgeMetadata.find((idx) => idx.indexFields.includes(orderField));

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
            3,
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
        throw new Error(
          'Only numeric offset is supported in Better Convex ORM.'
        );
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
          3,
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

          if (queryConfig.postFilters.length > 0) {
            probeQuery = probeQuery.filter((q: any) => {
              let result: any | null = null;
              for (const filter of queryConfig.postFilters) {
                const filterFn = this._toConvexExpression(filter);
                const expr = filterFn(q);
                result = result ? q.and(result, expr) : expr;
              }
              return result ?? q;
            });
          }

          return await probeQuery.collect();
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
          3,
          this.config.with as Record<string, unknown> | undefined
        );
      }

      if (usePostFetchSort && postFetchOrders.length > 0) {
        rows = rows.sort((a: any, b: any) =>
          this._compareByOrderSpecs(a, b, postFetchOrders)
        );
      }

      const offset = config.offset ?? 0;
      if (typeof offset !== 'number') {
        throw new Error(
          'Only numeric offset is supported in Better Convex ORM.'
        );
      }
      const limit = this._resolveNonPaginatedLimit(config);
      if (offset > 0) {
        rows = rows.slice(offset);
      }
      if (limit !== undefined) {
        rows = rows.slice(0, limit);
      }

      const selectedRows = await this._finalizeRows(rows);
      return this._returnSelectedRows(selectedRows);
    }

    // M6.5 Phase 4: Handle cursor pagination separately
    if (isCursorPaginated) {
      if (queryConfig.strategy === 'multiProbe') {
        if (maxScan === undefined) {
          if (strict) {
            throw new Error(
              'Pagination with multi-probe index-union filters requires maxScan when strict=true. Add maxScan or make the query indexable.'
            );
          }
          console.warn(
            'Pagination with multi-probe index-union filters is running without maxScan because strict: false.'
          );
        } else {
          const schemaDefinition = (this.schema as any)[OrmSchemaDefinition];
          if (!schemaDefinition) {
            throw new Error(
              'Pagination with maxScan requires defineSchema(). Ensure defineSchema(tables) was used with the same tables object passed to defineRelations.'
            );
          }

          let streamQuery: any = stream(
            this.db as GenericDatabaseReader<any>,
            schemaDefinition
          ).query(this.tableConfig.name as any);

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
            streamQuery = streamQuery.order(primaryOrder.direction);
          } else {
            streamQuery = streamQuery.order('desc');
          }

          if (queryConfig.postFilters.length > 0) {
            streamQuery = streamQuery.filterWith(async (row: any) =>
              queryConfig.postFilters.every((filter) =>
                this._evaluatePostFetchFilter(row, filter)
              )
            );
          }

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
              3,
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

      if (!queryConfig.index && queryConfig.postFilters.length > 0) {
        if (maxScan === undefined) {
          if (strict) {
            throw new Error(
              'Cursor pagination with scan fallback requires maxScan when strict=true. Add maxScan or make the query indexable.'
            );
          }
        } else {
          const schemaDefinition = (this.schema as any)[OrmSchemaDefinition];
          if (!schemaDefinition) {
            throw new Error(
              'Pagination with maxScan requires defineSchema(). Ensure defineSchema(tables) was used with the same tables object passed to defineRelations.'
            );
          }

          let streamQuery: any = stream(
            this.db as GenericDatabaseReader<any>,
            schemaDefinition
          ).query(this.tableConfig.name as any);

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
            streamQuery = streamQuery.order(primaryOrder.direction);
          } else {
            streamQuery = streamQuery.order('desc');
          }

          streamQuery = streamQuery.filterWith(async (row: any) =>
            queryConfig.postFilters.every((filter) =>
              this._evaluatePostFetchFilter(row, filter)
            )
          );

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
              3,
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

      // Apply post-filters
      if (queryConfig.postFilters.length > 0) {
        query = query.filter((q: any) => {
          let result: any | null = null;
          for (const filter of queryConfig.postFilters) {
            const filterFn = this._toConvexExpression(filter);
            const expr = filterFn(q);
            result = result ? q.and(result, expr) : expr;
          }
          return result ?? q;
        });
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
          3,
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

    // Apply post-filters
    if (queryConfig.postFilters.length > 0) {
      query = query.filter((q: any) => {
        // Combine all post-filters with AND logic
        let result: any | null = null;
        for (const filter of queryConfig.postFilters) {
          const filterFn = this._toConvexExpression(filter);
          const expr = filterFn(q);
          result = result ? q.and(result, expr) : expr;
        }
        return result ?? q;
      });
    }

    // Execute query with limit - .take() returns Promise<Doc[]>
    // M4.5: Offset pagination via post-fetch slicing
    // Convex doesn't have skip() - fetch offset + limit rows, then slice
    const offset = config.offset ?? 0;
    if (typeof offset !== 'number') {
      throw new Error('Only numeric offset is supported in Better Convex ORM.');
    }
    const limit = this._resolveNonPaginatedLimit(config);
    const paginateAfterPostFetchSort =
      usePostFetchSort && postFetchOrders.length > 0;
    let rows =
      limit === undefined || paginateAfterPostFetchSort
        ? await query.collect()
        : await query.take(offset > 0 ? offset + limit : limit);

    // Apply offset slicing if needed
    if (!paginateAfterPostFetchSort && offset > 0) {
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

    rows = await this._applyRlsSelectFilter(rows, this.tableConfig);

    if (whereFilter) {
      rows = await this._applyRelationsFilterToRows(
        rows,
        this.tableConfig,
        whereFilter,
        this.edgeMetadata,
        0,
        3,
        this.config.with as Record<string, unknown> | undefined
      );
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
  private _toConvexQuery(whereExpressionOverride?: FilterExpression<boolean>): {
    table: string;
    strategy: IndexStrategy;
    index?: { name: string; filters: FilterExpression<boolean>[] };
    probeFilters: FilterExpression<boolean>[][];
    postFilters: FilterExpression<boolean>[];
    order?: { direction: 'asc' | 'desc'; field: string }[];
  } {
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
    const compiled = compiler.compile(whereExpression);

    // Build query config
    const result: {
      table: string;
      strategy: IndexStrategy;
      index?: { name: string; filters: FilterExpression<boolean>[] };
      probeFilters: FilterExpression<boolean>[][];
      postFilters: FilterExpression<boolean>[];
      order?: { direction: 'asc' | 'desc'; field: string }[];
    } = {
      table: this.tableConfig.table.tableName,
      strategy: compiled.strategy,
      probeFilters: compiled.probeFilters,
      postFilters: compiled.postFilters,
    };

    // Add index if selected
    if (
      compiled.selectedIndex &&
      (compiled.indexFilters.length > 0 || compiled.probeFilters.length > 0)
    ) {
      result.index = {
        name: compiled.selectedIndex.indexName,
        filters: compiled.indexFilters,
      };
    }

    // Compile orderBy (M5 implementation)
    if (config.orderBy) {
      const orderByValue =
        typeof config.orderBy === 'function'
          ? config.orderBy(this.tableConfig.table as any, { asc, desc })
          : config.orderBy;

      const orderSpecs = this._orderBySpecs(orderByValue);
      if (orderSpecs.length > 0) {
        result.order = orderSpecs;
      }
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
    let expression = q.eq(q.field(fields[0]), values[0]);
    for (let i = 1; i < fields.length; i += 1) {
      expression = q.and(expression, q.eq(q.field(fields[i]), values[i]));
    }
    return expression;
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
    const visitor: ExpressionVisitor<(q: any) => any> = {
      visitBinary: (expr: BinaryExpression) => {
        const [field, value] = expr.operands;
        if (!isFieldReference(field)) {
          throw new Error(
            'Binary expression must have FieldReference as first operand'
          );
        }

        const fieldName = field.fieldName;
        const normalizedValue = this._normalizeComparableValue(
          fieldName,
          value
        );

        // Map our operators to Convex operators
        switch (expr.operator) {
          case 'eq':
            return (q: any) => q.eq(q.field(fieldName), normalizedValue);
          case 'ne':
            return (q: any) => q.neq(q.field(fieldName), normalizedValue);
          case 'gt':
            return (q: any) => q.gt(q.field(fieldName), normalizedValue);
          case 'gte':
            return (q: any) => q.gte(q.field(fieldName), normalizedValue);
          case 'lt':
            return (q: any) => q.lt(q.field(fieldName), normalizedValue);
          case 'lte':
            return (q: any) => q.lte(q.field(fieldName), normalizedValue);
          case 'inArray': {
            // inArray: field must be in the provided array
            const values = normalizedValue as any[];
            return (q: any) => {
              if (values.length === 0) {
                return q.eq(q.field('_id'), '__better_convex_never__');
              }
              // Convert to OR of eq operations
              const conditions = values.map((v) => q.eq(q.field(fieldName), v));
              return conditions.reduce((acc, cond) => q.or(acc, cond));
            };
          }
          case 'notInArray': {
            // notInArray: field must NOT be in the provided array
            const values = normalizedValue as any[];
            return (q: any) => {
              // Convert to AND of neq operations
              const conditions = values.map((v) =>
                q.neq(q.field(fieldName), v)
              );
              return conditions.reduce((acc, cond) => q.and(acc, cond));
            };
          }
          // M5: String operators (post-filter implementation)
          case 'like':
          case 'ilike':
          case 'notLike':
          case 'notIlike':
          case 'startsWith':
          case 'endsWith':
          case 'contains':
          case 'arrayContains':
          case 'arrayContained':
          case 'arrayOverlaps':
            // String operators require post-fetch filtering
            // They can't work in Convex filter context (no JavaScript string methods on field expressions)
            // These are handled in _evaluatePostFetchFilter after rows are fetched
            return () => true; // No-op in Convex filter, will be applied post-fetch
          default:
            throw new Error(`Unsupported binary operator: ${expr.operator}`);
        }
      },

      visitLogical: (expr: LogicalExpression) => {
        // Recursively convert operands
        const operandFns = expr.operands.map((op) => op.accept(visitor));

        if (expr.operator === 'and') {
          return (q: any) => {
            let result = operandFns[0](q);
            for (let i = 1; i < operandFns.length; i++) {
              result = q.and(result, operandFns[i](q));
            }
            return result;
          };
        }
        if (expr.operator === 'or') {
          return (q: any) => {
            let result = operandFns[0](q);
            for (let i = 1; i < operandFns.length; i++) {
              result = q.or(result, operandFns[i](q));
            }
            return result;
          };
        }

        throw new Error(`Unsupported logical operator: ${expr.operator}`);
      },

      visitUnary: (expr: UnaryExpression) => {
        const operand = expr.operands[0];

        if (expr.operator === 'not') {
          // not() operates on FilterExpression
          const operandFn = (operand as FilterExpression<boolean>).accept(
            visitor
          );
          return (q: any) => q.not(operandFn(q));
        }

        if (expr.operator === 'isNull') {
          // isNull() operates on FieldReference
          if (!isFieldReference(operand)) {
            throw new Error('isNull must operate on a field reference');
          }
          const fieldName = operand.fieldName;
          // Convex represents missing fields as `undefined` in filter contexts.
          // For SQL-like semantics, treat both `null` and `undefined` as "IS NULL".
          return (q: any) =>
            q.or(
              q.eq(q.field(fieldName), null),
              q.eq(q.field(fieldName), undefined)
            );
        }

        if (expr.operator === 'isNotNull') {
          // isNotNull() operates on FieldReference
          if (!isFieldReference(operand)) {
            throw new Error('isNotNull must operate on a field reference');
          }
          const fieldName = operand.fieldName;
          return (q: any) =>
            q.and(
              q.neq(q.field(fieldName), null),
              q.neq(q.field(fieldName), undefined)
            );
        }

        throw new Error(`Unsupported unary operator: ${expr.operator}`);
      },
    };

    return expression.accept(visitor);
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

  private async _mapWithConcurrency<T, R>(
    items: T[],
    worker: (item: T, index: number) => Promise<R>
  ): Promise<R[]> {
    if (items.length === 0) {
      return [];
    }
    const limit = Math.min(this._getRelationConcurrency(), items.length);
    const results = new Array<R>(items.length);
    let nextIndex = 0;

    const runWorker = async () => {
      while (true) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= items.length) {
          return;
        }
        results[index] = await worker(items[index], index);
      }
    };

    await Promise.all(Array.from({ length: limit }, () => runWorker()));

    return results;
  }

  /**
   * Load relations for query results
   * M6.5 Phase 2 implementation: Recursive relation loading with depth limiting
   *
   * @param rows - Array of parent records to load relations for
   * @param withConfig - Relation configuration object
   * @param depth - Current recursion depth (default 0)
   * @param maxDepth - Maximum recursion depth (default 3)
   * @param targetTableEdges - Edge metadata for nested relations (optional, defaults to this.edgeMetadata)
   */
  private async _loadRelations(
    rows: any[],
    withConfig: Record<string, unknown>,
    depth = 0,
    maxDepth = 3,
    targetTableEdges: EdgeMetadata[] = this.edgeMetadata,
    tableConfig: TableRelationalConfig = this.tableConfig
  ): Promise<any[]> {
    if (!withConfig || rows.length === 0) {
      return rows;
    }

    // Prevent infinite recursion / memory explosion
    if (depth >= maxDepth) {
      return rows;
    }

    const relationCountConfig = (withConfig as any)._count;
    const relationEntries = Object.entries(withConfig).filter(
      ([relationName]) => relationName !== '_count'
    );

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

  private _normalizeRelationCountCacheValue(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((entry) =>
        this._normalizeRelationCountCacheValue(entry)
      );
    }
    if (value && typeof value === 'object') {
      const normalized: Record<string, unknown> = {};
      const entries = Object.entries(value as Record<string, unknown>).sort(
        ([left], [right]) => left.localeCompare(right)
      );
      for (const [key, entry] of entries) {
        normalized[key] = this._normalizeRelationCountCacheValue(entry);
      }
      return normalized;
    }
    return value;
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

  private _buildRelationCountExecutionKey(
    relationName: string,
    where: unknown,
    parentKey: string
  ): string {
    return JSON.stringify({
      relationName,
      where: this._normalizeRelationCountCacheValue(where ?? null),
      parentKey,
    });
  }

  private async _readIndexedRelationCount(
    tableConfig: TableRelationalConfig,
    where: Record<string, unknown>,
    relationPath: string
  ): Promise<number> {
    ensureCountAllowedForRls(tableConfig, this.rls?.mode as any);
    try {
      const plan = compileCountQueryPlan(tableConfig, where);
      if (isIndexCountZero(plan)) {
        return 0;
      }
      await this._ensureCountIndexReadyOnce(plan.tableName, plan.indexName);
      return await readCountFromBuckets(this.db as any, plan);
    } catch (error) {
      throw this._remapRelationCountError(error, relationPath);
    }
  }

  private async _countRelationForRow(
    row: any,
    relationName: string,
    edge: EdgeMetadata,
    where: unknown,
    tableConfig: TableRelationalConfig
  ): Promise<number> {
    const relationPath = `${tableConfig.name}.${relationName}`;

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
          relationPath
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
        const filterPlan = compileCountQueryPlan(
          targetTableConfig,
          whereRecord
        );
        if (isIndexCountZero(filterPlan)) {
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

      const targetEntries = Array.from(targetKeyCounts.values());
      const matchedCounts = await this._mapWithConcurrency(
        targetEntries,
        async ({ values, occurrences }) => {
          let target: any | null = null;
          if (useGetById) {
            target = await this.db.get(values[0] as any);
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
            return 0;
          }
          return this._evaluateTableFilter(
            target,
            targetTableConfig,
            whereRecord
          )
            ? occurrences
            : 0;
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
      relationPath
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
        const relationCountExecutionCache = new Map<string, Promise<number>>();

        const counts = await this._mapWithConcurrency(rows, async (row) => {
          const parentKey = this._getRelationCountParentKey(row, edge);
          if (parentKey === null) {
            return 0;
          }

          const executionKey = this._buildRelationCountExecutionKey(
            relationName,
            where,
            parentKey
          );
          const existing = relationCountExecutionCache.get(executionKey);
          if (existing) {
            return await existing;
          }

          const pending = this._countRelationForRow(
            row,
            relationName,
            edge,
            where,
            tableConfig
          );
          relationCountExecutionCache.set(executionKey, pending);
          try {
            return await pending;
          } catch (error) {
            relationCountExecutionCache.delete(executionKey);
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
          target = await this.db.get(values[0] as any);
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
      throw new Error(
        'Only positive integer limit is supported in Better Convex ORM.'
      );
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
      throw new Error('Only numeric offset is supported in Better Convex ORM.');
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

    let targets: any[] = [];
    let throughBySourceKey: Map<string, any[]> | undefined;

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
      const throughRowsPerSource = await this._mapWithConcurrency(
        entries,
        async ([key, values]) => {
          const query = this._queryByFields(
            this.db.query(edge.through!.table),
            edge.through!.sourceFields,
            values,
            throughIndexName
          );
          const throughRows = await query.collect();
          return { key, rows: throughRows };
        }
      );

      throughBySourceKey = new Map<string, any[]>();
      const targetKeyMap = new Map<string, unknown[]>();
      for (const entry of throughRowsPerSource) {
        throughBySourceKey.set(entry.key, entry.rows);
        for (const row of entry.rows) {
          const values = edge.through!.targetFields.map((field) => row[field]);
          if (values.some((value) => value === null || value === undefined)) {
            continue;
          }
          const key = JSON.stringify(values);
          if (!targetKeyMap.has(key)) {
            targetKeyMap.set(key, values);
          }
        }
      }
      this._enforceRelationFanOutKeyCap({
        tableConfig,
        relationName,
        keyCount: targetKeyMap.size,
        scope: 'through-target',
      });

      if (targetKeyMap.size > 0) {
        const useGetById =
          targetFields.length === 1 && targetFields[0] === '_id';
        const targetIndexName = useGetById
          ? null
          : findRelationIndex(
              targetTableConfig.table as any,
              targetFields,
              `${tableConfig.name}.${relationName}`,
              edge.targetTable,
              strict,
              this.allowFullScan
            );

        const targetEntries = Array.from(targetKeyMap.entries());
        const fetchedTargets = await this._mapWithConcurrency(
          targetEntries,
          async ([key, values]) => {
            let target: any | null = null;
            if (useGetById) {
              target = await this.db.get(values[0] as any);
            } else {
              const query = this._queryByFields(
                this.db.query(edge.targetTable),
                targetFields,
                values,
                targetIndexName
              );
              target = await query.first();
            }
            return { key, target };
          }
        );

        targets = fetchedTargets
          .map((entry) => entry.target)
          .filter((value): value is any => !!value);
      }
    } else {
      const indexName = findRelationIndex(
        targetTableConfig.table as any,
        targetFields,
        `${tableConfig.name}.${relationName}`,
        edge.targetTable,
        strict,
        this.allowFullScan
      );

      const entries = Array.from(sourceKeyMap.entries());
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
            orderSpecs.length === 0 &&
            effectivePerParentLimit !== undefined
          ) {
            const fetchLimit =
              (perParentOffset ?? 0) + (effectivePerParentLimit ?? 0);
            return await query.take(fetchLimit);
          }

          return await query.collect();
        }
      );

      targets = targetGroups.flat();
    }

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

    if (orderSpecs.length > 0) {
      targets.sort((a, b) => this._compareByOrderSpecs(a, b, orderSpecs));
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

      // M6.5 Phase 3: Apply per-parent offset/limit
      if (
        perParentOffset !== undefined ||
        effectivePerParentLimit !== undefined
      ) {
        for (const [parentKey, children] of byParentKey.entries()) {
          byParentKey.set(parentKey, applyOffsetAndLimit(children));
        }
      }

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
      for (const [key, definition] of entries) {
        row[key] =
          typeof definition === 'function'
            ? definition(this._toPublicRow(row, tableConfig))
            : definition;
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
