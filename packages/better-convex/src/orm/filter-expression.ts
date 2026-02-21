/**
 * FilterExpression - Type-safe filter expression tree
 *
 * Pattern from Drizzle: drizzle-orm/sql/expressions/conditions.ts
 * Uses opaque branded types to prevent direct construction and ensure type safety
 *
 * Architecture:
 * - FilterExpression: Opaque branded type for all filter nodes
 * - Visitor pattern: Extensible traversal without modifying expression classes
 * - Immutable tree structure: Expressions are read-only after construction
 */

import type { ColumnBuilder } from './builders/column-builder';

/**
 * Extract TypeScript type from a column builder
 * Uses phantom `_` property to get type info
 */
type ColumnToType<TBuilder extends ColumnBuilder<any, any, any>> =
  TBuilder['_']['notNull'] extends true
    ? TBuilder['_']['data']
    : TBuilder['_']['data'] | null;

// ============================================================================
// Branded Type Symbol
// ============================================================================

/**
 * Unique symbol for FilterExpression brand
 * Prevents structural typing - only expressions created by factory functions are valid
 */
const FilterExpressionBrand: unique symbol = Symbol('FilterExpression');

// ============================================================================
// Core Expression Types
// ============================================================================

/**
 * Base filter expression interface
 * All filter expressions (binary, logical, unary) implement this interface
 *
 * @template TValue - The TypeScript type this expression evaluates to
 */
export interface FilterExpression<_TValue = boolean> {
  /** Brand symbol for nominal typing */
  readonly [FilterExpressionBrand]: true;
  /** Expression type discriminator */
  readonly type: 'binary' | 'logical' | 'unary';
  /** Operator string (eq, and, not, etc.) */
  readonly operator: string;
  /** Expression operands (FieldReference, values, or nested expressions) */
  readonly operands: readonly any[];
  /** Accept visitor for traversal */
  accept<R>(visitor: ExpressionVisitor<R>): R;
}

/**
 * Binary operator expression (eq, ne, gt, gte, lt, lte, inArray, notInArray)
 * Compares field to value: field eq value
 *
 * @template TField - Field type being compared
 */
export interface BinaryExpression<TField = any>
  extends FilterExpression<boolean> {
  readonly type: 'binary';
  readonly operator:
    | 'eq'
    | 'ne'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte'
    | 'inArray'
    | 'notInArray'
    | 'arrayContains'
    | 'arrayContained'
    | 'arrayOverlaps'
    | 'like'
    | 'ilike'
    | 'notLike'
    | 'notIlike'
    | 'startsWith'
    | 'endsWith'
    | 'contains';
  /** [field, value] or [field, array] for inArray/notInArray */
  readonly operands: readonly [FieldReference<TField>, TField | TField[]];
}

/**
 * Logical operator expression (and, or)
 * Combines multiple filter expressions
 */
export interface LogicalExpression extends FilterExpression<boolean> {
  readonly type: 'logical';
  readonly operator: 'and' | 'or';
  /** Array of nested filter expressions */
  readonly operands: readonly FilterExpression<boolean>[];
}

/**
 * Unary operator expression (not, isNull, isNotNull)
 * Negates or checks null state of an expression
 */
export interface UnaryExpression extends FilterExpression<boolean> {
  readonly type: 'unary';
  readonly operator: 'not' | 'isNull' | 'isNotNull';
  /** Single nested filter expression or field reference for null checks */
  readonly operands: readonly [FilterExpression<boolean> | FieldReference<any>];
}

// ============================================================================
// Field Reference
// ============================================================================

/**
 * CRITICAL: FieldReference abstraction
 *
 * Decouples filter expressions from M2 table configuration
 * Allows filter expressions to reference fields without knowing about validators
 *
 * @template TValue - TypeScript type of the field
 */
export interface FieldReference<TValue = unknown> {
  readonly __brand: 'FieldReference';
  readonly fieldName: string;
  /** Phantom type for type inference - not present at runtime */
  readonly __type?: TValue;
}

/**
 * Create a field reference
 * Used internally by operator functions
 */
export function fieldRef<T>(fieldName: string): FieldReference<T> {
  return {
    __brand: 'FieldReference',
    fieldName,
  };
}

/**
 * Type guard for FieldReference
 */
export function isFieldReference(value: any): value is FieldReference<any> {
  return (
    value && typeof value === 'object' && value.__brand === 'FieldReference'
  );
}

// ============================================================================
// Column Wrapper
// ============================================================================

/**
 * Column wrapper - combines builder with column name
 * Used in where clause to pass column objects to operators
 * Following Drizzle's pattern: operators receive columns, not extracted types
 *
 * @template TBuilder - The column builder type
 * @template TName - The column name (string literal)
 */
export interface Column<
  TBuilder extends ColumnBuilder<any, any, any> = any,
  TName extends string = string,
> {
  readonly builder: TBuilder;
  readonly columnName: TName;
}

type ColumnArgument<TBuilder extends ColumnBuilder<any, any, any>> =
  | Column<TBuilder, string>
  | TBuilder;

/**
 * Create a column wrapper
 * Used internally by query builder's _createColumnProxies
 */
export function column<
  TBuilder extends ColumnBuilder<any, any, any>,
  TName extends string,
>(builder: TBuilder, columnName: TName): Column<TBuilder, TName> {
  return { builder, columnName };
}

function resolveColumn<TBuilder extends ColumnBuilder<any, any, any>>(
  col: ColumnArgument<TBuilder>
): Column<TBuilder, string> {
  if (col && typeof col === 'object' && 'columnName' in col) {
    return col as Column<TBuilder, string>;
  }
  if (isFieldReference(col as any)) {
    return {
      builder: col as any,
      columnName: (col as any).fieldName,
    } as Column<TBuilder, string>;
  }
  const builder = col as ColumnBuilder<any, any, any>;
  const columnName = (builder as any)?.config?.name;
  if (!columnName) {
    throw new Error('Column builder is missing a column name');
  }
  return column(builder as TBuilder, columnName);
}

// ============================================================================
// Visitor Pattern
// ============================================================================

/**
 * Expression visitor interface for tree traversal
 * Extensible pattern - add new visit methods without modifying expression classes
 *
 * @template R - Return type of visit operations
 */
export interface ExpressionVisitor<R = void> {
  visitBinary(expr: BinaryExpression): R;
  visitLogical(expr: LogicalExpression): R;
  visitUnary(expr: UnaryExpression): R;
}

// ============================================================================
// Expression Implementation Classes
// ============================================================================

/**
 * Internal binary expression implementation
 * Private class - only accessible via factory functions
 */
class BinaryExpressionImpl<TField> implements BinaryExpression<TField> {
  readonly [FilterExpressionBrand] = true as const;
  readonly type = 'binary' as const;

  constructor(
    readonly operator: BinaryExpression['operator'],
    readonly operands: readonly [FieldReference<TField>, TField | TField[]]
  ) {}

  accept<R>(visitor: ExpressionVisitor<R>): R {
    return visitor.visitBinary(this);
  }
}

/**
 * Internal logical expression implementation
 * Private class - only accessible via factory functions
 */
class LogicalExpressionImpl implements LogicalExpression {
  readonly [FilterExpressionBrand] = true as const;
  readonly type = 'logical' as const;

  constructor(
    readonly operator: LogicalExpression['operator'],
    readonly operands: readonly FilterExpression<boolean>[]
  ) {}

  accept<R>(visitor: ExpressionVisitor<R>): R {
    return visitor.visitLogical(this);
  }
}

/**
 * Internal unary expression implementation
 * Private class - only accessible via factory functions
 */
class UnaryExpressionImpl implements UnaryExpression {
  readonly [FilterExpressionBrand] = true as const;
  readonly type = 'unary' as const;

  constructor(
    readonly operator: UnaryExpression['operator'],
    readonly operands: readonly [FilterExpression<boolean>]
  ) {}

  accept<R>(visitor: ExpressionVisitor<R>): R {
    return visitor.visitUnary(this);
  }
}

// ============================================================================
// Factory Functions - Binary Operators
// ============================================================================

/**
 * Equality operator: field == value
 *
 * @example
 * const filter = eq(cols.name, 'Alice');
 */
export function eq<TBuilder extends ColumnBuilder<any, any, any>>(
  col: ColumnArgument<TBuilder>,
  value: ColumnToType<TBuilder>
): BinaryExpression<ColumnToType<TBuilder>> {
  const resolved = resolveColumn(col);
  return new BinaryExpressionImpl('eq', [fieldRef(resolved.columnName), value]);
}

/**
 * Not equal operator: field != value
 */
export function ne<TBuilder extends ColumnBuilder<any, any, any>>(
  col: ColumnArgument<TBuilder>,
  value: ColumnToType<TBuilder>
): BinaryExpression<ColumnToType<TBuilder>> {
  const resolved = resolveColumn(col);
  return new BinaryExpressionImpl('ne', [fieldRef(resolved.columnName), value]);
}

/**
 * Greater than operator: field > value
 */
export function gt<TBuilder extends ColumnBuilder<any, any, any>>(
  col: ColumnArgument<TBuilder>,
  value: ColumnToType<TBuilder>
): BinaryExpression<ColumnToType<TBuilder>> {
  const resolved = resolveColumn(col);
  return new BinaryExpressionImpl('gt', [fieldRef(resolved.columnName), value]);
}

/**
 * Greater than or equal operator: field >= value
 */
export function gte<TBuilder extends ColumnBuilder<any, any, any>>(
  col: ColumnArgument<TBuilder>,
  value: ColumnToType<TBuilder>
): BinaryExpression<ColumnToType<TBuilder>> {
  const resolved = resolveColumn(col);
  return new BinaryExpressionImpl('gte', [
    fieldRef(resolved.columnName),
    value,
  ]);
}

/**
 * Less than operator: field < value
 */
export function lt<TBuilder extends ColumnBuilder<any, any, any>>(
  col: ColumnArgument<TBuilder>,
  value: ColumnToType<TBuilder>
): BinaryExpression<ColumnToType<TBuilder>> {
  const resolved = resolveColumn(col);
  return new BinaryExpressionImpl('lt', [fieldRef(resolved.columnName), value]);
}

/**
 * Less than or equal operator: field <= value
 */
export function lte<TBuilder extends ColumnBuilder<any, any, any>>(
  col: ColumnArgument<TBuilder>,
  value: ColumnToType<TBuilder>
): BinaryExpression<ColumnToType<TBuilder>> {
  const resolved = resolveColumn(col);
  return new BinaryExpressionImpl('lte', [
    fieldRef(resolved.columnName),
    value,
  ]);
}

/**
 * Between operator: field BETWEEN min AND max (inclusive)
 *
 * Sugar for and(gte(field, min), lte(field, max)).
 */
export function between<TBuilder extends ColumnBuilder<any, any, any>>(
  col: ColumnArgument<TBuilder>,
  min: ColumnToType<TBuilder>,
  max: ColumnToType<TBuilder>
): FilterExpression<boolean> {
  return and(gte(col, min), lte(col, max))!;
}

/**
 * Not between operator: field < min OR field > max
 *
 * Sugar for or(lt(field, min), gt(field, max)).
 */
export function notBetween<TBuilder extends ColumnBuilder<any, any, any>>(
  col: ColumnArgument<TBuilder>,
  min: ColumnToType<TBuilder>,
  max: ColumnToType<TBuilder>
): FilterExpression<boolean> {
  return or(lt(col, min), gt(col, max))!;
}

// ============================================================================
// Factory Functions - String Operators (M5)
// ============================================================================

/**
 * LIKE operator: SQL-style pattern matching with % wildcards
 * Note: Implemented as post-filter (Convex has no native LIKE)
 *
 * @example
 * const users = await db.query.users.findMany({
 *   where: like(users.name, '%alice%'),
 * });
 */
export function like<TBuilder extends ColumnBuilder<any, any, any>>(
  col: ColumnArgument<TBuilder>,
  pattern: string
): BinaryExpression<string> {
  const resolved = resolveColumn(col);
  return new BinaryExpressionImpl('like', [
    fieldRef(resolved.columnName),
    pattern,
  ]);
}

/**
 * ILIKE operator: Case-insensitive LIKE
 * Note: Implemented as post-filter (Convex has no native LIKE)
 *
 * @example
 * const users = await db.query.users.findMany({
 *   where: ilike(users.name, '%ALICE%'),
 * });
 */
export function ilike<TBuilder extends ColumnBuilder<any, any, any>>(
  col: ColumnArgument<TBuilder>,
  pattern: string
): BinaryExpression<string> {
  const resolved = resolveColumn(col);
  return new BinaryExpressionImpl('ilike', [
    fieldRef(resolved.columnName),
    pattern,
  ]);
}

/**
 * NOT LIKE operator: Negated LIKE pattern
 */
export function notLike<TBuilder extends ColumnBuilder<any, any, any>>(
  col: ColumnArgument<TBuilder>,
  pattern: string
): BinaryExpression<string> {
  const resolved = resolveColumn(col);
  return new BinaryExpressionImpl('notLike', [
    fieldRef(resolved.columnName),
    pattern,
  ]);
}

/**
 * NOT ILIKE operator: Negated case-insensitive LIKE
 */
export function notIlike<TBuilder extends ColumnBuilder<any, any, any>>(
  col: ColumnArgument<TBuilder>,
  pattern: string
): BinaryExpression<string> {
  const resolved = resolveColumn(col);
  return new BinaryExpressionImpl('notIlike', [
    fieldRef(resolved.columnName),
    pattern,
  ]);
}

/**
 * startsWith operator: Check if string starts with prefix
 * Optimized for prefix matching
 *
 * @example
 * const users = await db.query.users.findMany({
 *   where: startsWith(users.email, 'admin@'),
 * });
 */
export function startsWith<TBuilder extends ColumnBuilder<any, any, any>>(
  col: ColumnArgument<TBuilder>,
  prefix: string
): BinaryExpression<string> {
  const resolved = resolveColumn(col);
  return new BinaryExpressionImpl('startsWith', [
    fieldRef(resolved.columnName),
    prefix,
  ]);
}

/**
 * endsWith operator: Check if string ends with suffix
 *
 * @example
 * const users = await db.query.users.findMany({
 *   where: endsWith(users.email, '@example.com'),
 * });
 */
export function endsWith<TBuilder extends ColumnBuilder<any, any, any>>(
  col: ColumnArgument<TBuilder>,
  suffix: string
): BinaryExpression<string> {
  const resolved = resolveColumn(col);
  return new BinaryExpressionImpl('endsWith', [
    fieldRef(resolved.columnName),
    suffix,
  ]);
}

/**
 * contains operator: Check if string contains substring
 * Can use search index for optimization when available
 *
 * @example
 * const posts = await db.query.posts.findMany({
 *   where: contains(posts.title, 'javascript'),
 * });
 */
export function contains<TBuilder extends ColumnBuilder<any, any, any>>(
  col: ColumnArgument<TBuilder>,
  substring: string
): BinaryExpression<string> {
  const resolved = resolveColumn(col);
  return new BinaryExpressionImpl('contains', [
    fieldRef(resolved.columnName),
    substring,
  ]);
}

// ============================================================================
// Factory Functions - Logical Operators
// ============================================================================

/**
 * Logical AND: all expressions must be true
 * Filters out undefined expressions (following Drizzle pattern)
 *
 * @example
 * const filter = and(
 *   eq(fieldRef('age'), 25),
 *   eq(fieldRef('name'), 'Alice')
 * );
 */
export function and(
  ...expressions: (FilterExpression<boolean> | undefined)[]
): LogicalExpression | undefined {
  // Filter out undefined expressions
  const defined = expressions.filter(
    (expr): expr is FilterExpression<boolean> => expr !== undefined
  );

  // If no expressions remain, return undefined
  if (defined.length === 0) {
    return;
  }

  // If only one expression, return it directly (optimization)
  if (defined.length === 1) {
    return defined[0] as LogicalExpression;
  }

  return new LogicalExpressionImpl('and', defined);
}

/**
 * Logical OR: at least one expression must be true
 * Filters out undefined expressions (following Drizzle pattern)
 *
 * @example
 * const filter = or(
 *   eq(fieldRef('status'), 'active'),
 *   eq(fieldRef('status'), 'pending')
 * );
 */
export function or(
  ...expressions: (FilterExpression<boolean> | undefined)[]
): LogicalExpression | undefined {
  // Filter out undefined expressions
  const defined = expressions.filter(
    (expr): expr is FilterExpression<boolean> => expr !== undefined
  );

  // If no expressions remain, return undefined
  if (defined.length === 0) {
    return;
  }

  // If only one expression, return it directly (optimization)
  if (defined.length === 1) {
    return defined[0] as LogicalExpression;
  }

  return new LogicalExpressionImpl('or', defined);
}

/**
 * Logical NOT: negates expression
 *
 * @example
 * const filter = not(eq(fieldRef('isDeleted'), true));
 */
export function not(expression: FilterExpression<boolean>): UnaryExpression {
  return new UnaryExpressionImpl('not', [expression]);
}

// ============================================================================
// Factory Functions - Array Operators
// ============================================================================

/**
 * Array membership operator: field IN array
 *
 * @example
 * const filter = inArray(cols.status, ['active', 'pending']);
 */
export function inArray<TBuilder extends ColumnBuilder<any, any, any>>(
  col: ColumnArgument<TBuilder>,
  values: readonly ColumnToType<TBuilder>[]
): BinaryExpression<ColumnToType<TBuilder>> {
  const resolved = resolveColumn(col);
  return new BinaryExpressionImpl('inArray', [
    fieldRef(resolved.columnName),
    values as any,
  ]);
}

/**
 * Array exclusion operator: field NOT IN array
 * Validates array is non-empty at construction time
 *
 * @example
 * const filter = notInArray(cols.role, ['admin', 'moderator']);
 */
export function notInArray<TBuilder extends ColumnBuilder<any, any, any>>(
  col: ColumnArgument<TBuilder>,
  values: readonly ColumnToType<TBuilder>[]
): BinaryExpression<ColumnToType<TBuilder>> {
  // Validation: Array must be non-empty
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('notInArray requires a non-empty array of values');
  }
  const resolved = resolveColumn(col);
  return new BinaryExpressionImpl('notInArray', [
    fieldRef(resolved.columnName),
    values as any,
  ]);
}

/**
 * Array contains operator: field @> array
 */
export function arrayContains<TBuilder extends ColumnBuilder<any, any, any>>(
  col: ColumnArgument<TBuilder>,
  values: readonly ColumnToType<TBuilder>[]
): BinaryExpression<ColumnToType<TBuilder>> {
  const resolved = resolveColumn(col);
  return new BinaryExpressionImpl('arrayContains', [
    fieldRef(resolved.columnName),
    values as any,
  ]);
}

/**
 * Array contained operator: field <@ array
 */
export function arrayContained<TBuilder extends ColumnBuilder<any, any, any>>(
  col: ColumnArgument<TBuilder>,
  values: readonly ColumnToType<TBuilder>[]
): BinaryExpression<ColumnToType<TBuilder>> {
  const resolved = resolveColumn(col);
  return new BinaryExpressionImpl('arrayContained', [
    fieldRef(resolved.columnName),
    values as any,
  ]);
}

/**
 * Array overlaps operator: field && array
 */
export function arrayOverlaps<TBuilder extends ColumnBuilder<any, any, any>>(
  col: ColumnArgument<TBuilder>,
  values: readonly ColumnToType<TBuilder>[]
): BinaryExpression<ColumnToType<TBuilder>> {
  const resolved = resolveColumn(col);
  return new BinaryExpressionImpl('arrayOverlaps', [
    fieldRef(resolved.columnName),
    values as any,
  ]);
}

// ============================================================================
// Factory Functions - Null Operators
// ============================================================================

/**
 * Null check operator: field IS NULL
 * Type validation: Only works with nullable fields
 *
 * @example
 * const filter = isNull(cols.deletedAt);
 */
export function isNull<TBuilder extends ColumnBuilder<any, any, any>>(
  col: ColumnArgument<TBuilder>
): UnaryExpression {
  const resolved = resolveColumn(col);
  return new UnaryExpressionImpl('isNull', [
    fieldRef(resolved.columnName) as any,
  ]);
}

/**
 * Not null check operator: field IS NOT NULL
 * Type validation: Only works with nullable fields
 *
 * @example
 * const filter = isNotNull(cols.deletedAt);
 */
export function isNotNull<TBuilder extends ColumnBuilder<any, any, any>>(
  col: ColumnArgument<TBuilder>
): UnaryExpression {
  const resolved = resolveColumn(col);
  return new UnaryExpressionImpl('isNotNull', [
    fieldRef(resolved.columnName) as any,
  ]);
}
