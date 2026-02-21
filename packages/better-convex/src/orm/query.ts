/**
 * GelRelationalQuery - Promise-based query builder
 *
 * Implements Drizzle's query pattern for Convex:
 * - Extends QueryPromise for lazy execution
 * - Stores query configuration
 * - Executes Convex queries on await
 */

import type { GenericDatabaseReader } from 'convex/server';
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
import { Columns, OrmSchemaDefinition } from './symbols';
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
const PUBLIC_ID_FIELD = 'id';
const INTERNAL_ID_FIELD = '_id';
const ID_MIGRATION_MESSAGE = '`_id` is no longer public. Use `id` instead.';

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
    private mode: 'many' | 'first' | 'firstOrThrow',
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
    return first as TResult;
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
    const defaultLimit = this.tableConfig.defaults?.defaultLimit;
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

  private async _finalizeRows(rows: any[]): Promise<any[]> {
    let rowsWithRelations = rows;
    if (this.config.with) {
      rowsWithRelations = await this._loadRelations(
        rows,
        this.config.with,
        0,
        3,
        this.edgeMetadata,
        this.tableConfig
      );
    }

    if ((this.config as any).extras) {
      rowsWithRelations = this._applyExtras(
        rowsWithRelations,
        (this.config as any).extras,
        this._getColumns(this.tableConfig),
        this.config.with as Record<string, unknown> | undefined,
        this.tableConfig.name,
        this.tableConfig
      );
    }

    return this._selectColumns(
      rowsWithRelations,
      (this.config as any).columns,
      this._getColumns(this.tableConfig),
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

  /**
   * Execute the query and return results
   * Phase 4 implementation with WhereClauseCompiler integration
   */
  async execute(): Promise<TResult> {
    const config = this.config as any;
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

        let pageWithRelations = pageRows;
        if (this.config.with) {
          pageWithRelations = await this._loadRelations(
            pageRows,
            this.config.with,
            0,
            3,
            this.edgeMetadata,
            this.tableConfig
          );
        }

        if ((this.config as any).extras) {
          pageWithRelations = this._applyExtras(
            pageWithRelations,
            (this.config as any).extras,
            this._getColumns(this.tableConfig),
            this.config.with as Record<string, unknown> | undefined,
            this.tableConfig.name,
            this.tableConfig
          );
        }

        const selectedPage = this._selectColumns(
          pageWithRelations,
          (this.config as any).columns,
          this._getColumns(this.tableConfig),
          this.tableConfig
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

      let rowsWithRelations = rows;
      if (this.config.with) {
        rowsWithRelations = await this._loadRelations(
          rows,
          this.config.with,
          0,
          3,
          this.edgeMetadata,
          this.tableConfig
        );
      }

      if ((this.config as any).extras) {
        rowsWithRelations = this._applyExtras(
          rowsWithRelations,
          (this.config as any).extras,
          this._getColumns(this.tableConfig),
          this.config.with as Record<string, unknown> | undefined,
          this.tableConfig.name,
          this.tableConfig
        );
      }

      const selectedRows = this._selectColumns(
        rowsWithRelations,
        (this.config as any).columns,
        this._getColumns(this.tableConfig),
        this.tableConfig
      );
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

      let rowsWithRelations = rows;
      if (this.config.with) {
        rowsWithRelations = await this._loadRelations(
          rows,
          this.config.with,
          0,
          3,
          this.edgeMetadata,
          this.tableConfig
        );
      }

      if ((this.config as any).extras) {
        rowsWithRelations = this._applyExtras(
          rowsWithRelations,
          (this.config as any).extras,
          this._getColumns(this.tableConfig),
          this.config.with as Record<string, unknown> | undefined,
          this.tableConfig.name,
          this.tableConfig
        );
      }

      const selectedRows = this._selectColumns(
        rowsWithRelations,
        (this.config as any).columns,
        this._getColumns(this.tableConfig),
        this.tableConfig
      );
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

          let pageWithRelations = pageRows;
          if (this.config.with) {
            pageWithRelations = await this._loadRelations(
              pageRows,
              this.config.with,
              0,
              3,
              this.edgeMetadata,
              this.tableConfig
            );
          }

          if ((this.config as any).extras) {
            pageWithRelations = this._applyExtras(
              pageWithRelations,
              (this.config as any).extras,
              this._getColumns(this.tableConfig),
              this.config.with as Record<string, unknown> | undefined,
              this.tableConfig.name,
              this.tableConfig
            );
          }

          const selectedPage = this._selectColumns(
            pageWithRelations,
            (this.config as any).columns,
            this._getColumns(this.tableConfig),
            this.tableConfig
          );

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

          let pageWithRelations = pageRows;
          if (this.config.with) {
            pageWithRelations = await this._loadRelations(
              pageRows,
              this.config.with,
              0,
              3,
              this.edgeMetadata,
              this.tableConfig
            );
          }

          if ((this.config as any).extras) {
            pageWithRelations = this._applyExtras(
              pageWithRelations,
              (this.config as any).extras,
              this._getColumns(this.tableConfig),
              this.config.with as Record<string, unknown> | undefined,
              this.tableConfig.name,
              this.tableConfig
            );
          }

          const selectedPage = this._selectColumns(
            pageWithRelations,
            (this.config as any).columns,
            this._getColumns(this.tableConfig),
            this.tableConfig
          );

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

      // Load relations for page results if configured
      let pageWithRelations = pageRows;
      if (this.config.with) {
        pageWithRelations = await this._loadRelations(
          pageRows,
          this.config.with,
          0,
          3,
          this.edgeMetadata,
          this.tableConfig
        );
      }

      if ((this.config as any).extras) {
        pageWithRelations = this._applyExtras(
          pageWithRelations,
          (this.config as any).extras,
          this._getColumns(this.tableConfig),
          this.config.with as Record<string, unknown> | undefined,
          this.tableConfig.name,
          this.tableConfig
        );
      }

      // Apply column selection if configured
      const selectedPage = this._selectColumns(
        pageWithRelations,
        (this.config as any).columns,
        this._getColumns(this.tableConfig),
        this.tableConfig
      );

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

    // Load relations if configured
    let rowsWithRelations = rows;
    if (this.config.with) {
      rowsWithRelations = await this._loadRelations(
        rows,
        this.config.with,
        0,
        3,
        this.edgeMetadata,
        this.tableConfig
      );
    }

    if ((this.config as any).extras) {
      rowsWithRelations = this._applyExtras(
        rowsWithRelations,
        (this.config as any).extras,
        this._getColumns(this.tableConfig),
        this.config.with as Record<string, unknown> | undefined,
        this.tableConfig.name,
        this.tableConfig
      );
    }

    // Apply column selection if configured
    const selectedRows = this._selectColumns(
      rowsWithRelations,
      (this.config as any).columns,
      this._getColumns(this.tableConfig),
      this.tableConfig
    );

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
    const value = tableConfig.defaults?.relationFanOutMaxKeys;
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

    // Load all relations in parallel to avoid sequential N+1 queries
    await Promise.all(
      Object.entries(withConfig).map(([relationName, relationConfig]) =>
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
      perParentLimit ?? tableConfig.defaults?.defaultLimit;
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
