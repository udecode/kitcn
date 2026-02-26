/**
 * WhereClauseCompiler - Compiles FilterExpression to Convex queries
 *
 * Core responsibilities:
 * 1. Filter splitting - separate index-compatible from post-filters
 * 2. Index selection - choose best index using scoring algorithm
 * 3. Query generation - convert to Convex withIndex/filter calls
 *
 * Pattern from Drizzle: drizzle-orm/mysql-core/query-builders/select.ts
 */

import type {
  BinaryExpression,
  FilterExpression,
  LogicalExpression,
  UnaryExpression,
} from './filter-expression';
import {
  eq,
  fieldRef,
  gt,
  gte,
  isFieldReference,
  lt,
} from './filter-expression';

// ============================================================================
// Compilation Result
// ============================================================================

/**
 * Result of compiling a where clause
 * Contains index selection and filter expressions
 */
export interface WhereClauseResult {
  /** Filters that can use the index (eq/range on indexed fields) */
  indexFilters: FilterExpression<boolean>[];
  /** Filters applied after index scan (gt, lt, and, or, not) */
  postFilters: FilterExpression<boolean>[];
  /** Multi-probe filter groups for OR/inArray index union plans */
  probeFilters: FilterExpression<boolean>[][];
  /** Selected index for query optimization (null if no suitable index) */
  selectedIndex: IndexLike | null;
  /** Planning strategy used for index compilation */
  strategy: IndexStrategy;
}

export type IndexStrategy =
  | 'none'
  | 'singleIndex'
  | 'rangeIndex'
  | 'multiProbe';

/**
 * Index match score for ranking candidate indexes
 */
interface IndexScore {
  index: IndexLike;
  matchedFields: string[];
  matchType: 'exact' | 'prefix' | 'partial';
  score: number;
}

// ============================================================================
// WhereClauseCompiler
// ============================================================================

/**
 * Compiles FilterExpression trees into optimized Convex queries
 *
 * Algorithm:
 * 1. Extract field references from expression tree
 * 2. Score available indexes by field match quality
 * 3. Select best index (exact > prefix > partial)
 * 4. Split filters into index-compatible vs post-filters
 */
export interface IndexLike {
  indexFields: string[];
  indexName: string;
}

export class WhereClauseCompiler {
  constructor(
    _tableName: string,
    private availableIndexes: IndexLike[]
  ) {}

  /**
   * Compile a filter expression to Convex query structure
   *
   * @param expression - Filter expression tree
   * @returns Compilation result with index and filters
   */
  compile(
    expression: FilterExpression<boolean> | undefined
  ): WhereClauseResult {
    // No filter - return empty result
    if (!expression) {
      return {
        strategy: 'none',
        selectedIndex: null,
        indexFilters: [],
        probeFilters: [],
        postFilters: [],
      };
    }

    const specialCase = this.tryCompileSpecialCase(expression);
    if (specialCase) {
      return specialCase;
    }

    // Extract all field references from expression
    const referencedFields = this.extractFieldReferences(expression);

    // Score and select best index
    const selectedIndex = this.selectIndex(referencedFields);

    // Split filters based on selected index
    const { indexFilters, postFilters } = this.splitFilters(
      expression,
      selectedIndex
    );

    return {
      strategy: this.resolveStrategy(selectedIndex, indexFilters),
      selectedIndex,
      indexFilters,
      probeFilters: [],
      postFilters,
    };
  }

  private tryCompileSpecialCase(
    expression: FilterExpression<boolean>
  ): WhereClauseResult | null {
    if (expression.type === 'binary') {
      const binaryExpression = expression as BinaryExpression;
      return (
        this.tryCompileInArray(binaryExpression) ??
        this.tryCompileNe(binaryExpression) ??
        this.tryCompileNotIn(binaryExpression) ??
        this.tryCompileStartsWith(binaryExpression) ??
        this.tryCompileLikePrefix(binaryExpression)
      );
    }

    if (expression.type === 'unary') {
      return (
        this.tryCompileIsNull(expression as UnaryExpression) ??
        this.tryCompileIsNotNull(expression as UnaryExpression)
      );
    }

    if (expression.type === 'logical') {
      return this.tryCompileOrSpecialCase(expression as LogicalExpression);
    }

    return null;
  }

  private resolveStrategy(
    selectedIndex: IndexLike | null,
    indexFilters: FilterExpression<boolean>[]
  ): IndexStrategy {
    if (!selectedIndex || indexFilters.length === 0) {
      return 'none';
    }
    const hasRangeFilter = indexFilters.some(
      (filter) =>
        filter.type === 'binary' &&
        (filter.operator === 'gt' ||
          filter.operator === 'gte' ||
          filter.operator === 'lt' ||
          filter.operator === 'lte')
    );
    return hasRangeFilter ? 'rangeIndex' : 'singleIndex';
  }

  private tryCompileInArray(
    expression: BinaryExpression
  ): WhereClauseResult | null {
    if (expression.operator !== 'inArray') {
      return null;
    }
    const [field, values] = expression.operands;
    if (
      !isFieldReference(field) ||
      !Array.isArray(values) ||
      values.length < 1
    ) {
      return null;
    }
    const selectedIndex = this.findLeadingIndex(field.fieldName);
    if (!selectedIndex) {
      return null;
    }

    const uniqueValues = Array.from(new Set(values));
    return {
      strategy: 'multiProbe',
      selectedIndex,
      indexFilters: [],
      probeFilters: uniqueValues.map((value) => [
        eq(fieldRef(field.fieldName) as any, value as any),
      ]),
      postFilters: [expression],
    };
  }

  private tryCompileNe(expression: BinaryExpression): WhereClauseResult | null {
    if (expression.operator !== 'ne') {
      return null;
    }
    const [field, value] = expression.operands;
    if (!isFieldReference(field)) {
      return null;
    }
    const selectedIndex = this.findLeadingIndex(field.fieldName);
    if (!selectedIndex) {
      return null;
    }

    const probeFilters = this.buildComplementProbeFilters(field.fieldName, [
      value,
    ]);
    if (!probeFilters || probeFilters.length === 0) {
      return null;
    }

    return {
      strategy: 'multiProbe',
      selectedIndex,
      indexFilters: [],
      probeFilters,
      postFilters: [expression],
    };
  }

  private tryCompileNotIn(
    expression: BinaryExpression
  ): WhereClauseResult | null {
    if (expression.operator !== 'notInArray') {
      return null;
    }
    const [field, values] = expression.operands;
    if (
      !isFieldReference(field) ||
      !Array.isArray(values) ||
      values.length < 1
    ) {
      return null;
    }
    const selectedIndex = this.findLeadingIndex(field.fieldName);
    if (!selectedIndex) {
      return null;
    }

    const probeFilters = this.buildComplementProbeFilters(
      field.fieldName,
      values
    );
    if (!probeFilters || probeFilters.length === 0) {
      return null;
    }

    return {
      strategy: 'multiProbe',
      selectedIndex,
      indexFilters: [],
      probeFilters,
      postFilters: [expression],
    };
  }

  private tryCompileIsNull(
    expression: UnaryExpression
  ): WhereClauseResult | null {
    if (expression.operator !== 'isNull') {
      return null;
    }
    const [operand] = expression.operands;
    if (!isFieldReference(operand)) {
      return null;
    }
    const selectedIndex = this.findLeadingIndex(operand.fieldName);
    if (!selectedIndex) {
      return null;
    }

    return {
      strategy: 'singleIndex',
      selectedIndex,
      indexFilters: [eq(fieldRef(operand.fieldName) as any, null)],
      probeFilters: [],
      postFilters: [],
    };
  }

  private tryCompileIsNotNull(
    expression: UnaryExpression
  ): WhereClauseResult | null {
    if (expression.operator !== 'isNotNull') {
      return null;
    }
    const [operand] = expression.operands;
    if (!isFieldReference(operand)) {
      return null;
    }
    const selectedIndex = this.findLeadingIndex(operand.fieldName);
    if (!selectedIndex) {
      return null;
    }

    const probeFilters = this.buildComplementProbeFilters(operand.fieldName, [
      null,
    ]);
    if (!probeFilters || probeFilters.length === 0) {
      return null;
    }

    return {
      strategy: 'multiProbe',
      selectedIndex,
      indexFilters: [],
      probeFilters,
      postFilters: [expression],
    };
  }

  private tryCompileStartsWith(
    expression: BinaryExpression
  ): WhereClauseResult | null {
    if (expression.operator !== 'startsWith') {
      return null;
    }
    const [field, value] = expression.operands;
    if (!isFieldReference(field) || typeof value !== 'string' || !value) {
      return null;
    }

    const selectedIndex = this.findLeadingIndex(field.fieldName);
    if (!selectedIndex) {
      return null;
    }

    const upperBound = this.getPrefixUpperBound(value);
    const rangeFilters: FilterExpression<boolean>[] = [
      gte(fieldRef(field.fieldName) as any, value as any),
    ];
    if (upperBound) {
      rangeFilters.push(
        lt(fieldRef(field.fieldName) as any, upperBound as any)
      );
    }

    return {
      strategy: 'rangeIndex',
      selectedIndex,
      indexFilters: rangeFilters,
      probeFilters: [],
      postFilters: [expression],
    };
  }

  private tryCompileLikePrefix(
    expression: BinaryExpression
  ): WhereClauseResult | null {
    if (expression.operator !== 'like') {
      return null;
    }

    const [field, value] = expression.operands;
    if (!isFieldReference(field) || typeof value !== 'string') {
      return null;
    }

    const prefix = this.getLikePrefix(value);
    if (!prefix) {
      return null;
    }

    const selectedIndex = this.findLeadingIndex(field.fieldName);
    if (!selectedIndex) {
      return null;
    }

    const upperBound = this.getPrefixUpperBound(prefix);
    const rangeFilters: FilterExpression<boolean>[] = [
      gte(fieldRef(field.fieldName) as any, prefix as any),
    ];
    if (upperBound) {
      rangeFilters.push(
        lt(fieldRef(field.fieldName) as any, upperBound as any)
      );
    }

    return {
      strategy: 'rangeIndex',
      selectedIndex,
      indexFilters: rangeFilters,
      probeFilters: [],
      postFilters: [expression],
    };
  }

  private tryCompileOrSpecialCase(
    expression: LogicalExpression
  ): WhereClauseResult | null {
    return (
      this.tryCompileOrEquality(expression) ??
      this.tryCompileOrRangeComplement(expression)
    );
  }

  private tryCompileOrEquality(
    expression: LogicalExpression
  ): WhereClauseResult | null {
    if (expression.operator !== 'or' || expression.operands.length < 1) {
      return null;
    }

    let fieldName: string | null = null;
    const values: unknown[] = [];
    for (const operand of expression.operands) {
      if (operand.type === 'binary') {
        const [field, value] = operand.operands;
        if (!isFieldReference(field)) {
          return null;
        }
        if (operand.operator === 'eq') {
          if (fieldName && fieldName !== field.fieldName) {
            return null;
          }
          fieldName = field.fieldName;
          values.push(value);
          continue;
        }
        if (operand.operator === 'inArray' && Array.isArray(value)) {
          if (fieldName && fieldName !== field.fieldName) {
            return null;
          }
          fieldName = field.fieldName;
          values.push(...value);
          continue;
        }
      }
      return null;
    }

    if (!fieldName || values.length === 0) {
      return null;
    }

    const selectedIndex = this.findLeadingIndex(fieldName);
    if (!selectedIndex) {
      return null;
    }

    const uniqueValues = Array.from(new Set(values));
    return {
      strategy: 'multiProbe',
      selectedIndex,
      indexFilters: [],
      probeFilters: uniqueValues.map((value) => [
        eq(fieldRef(fieldName) as any, value as any),
      ]),
      postFilters: [expression],
    };
  }

  private tryCompileOrRangeComplement(
    expression: LogicalExpression
  ): WhereClauseResult | null {
    if (expression.operator !== 'or' || expression.operands.length !== 2) {
      return null;
    }

    const [left, right] = expression.operands;
    if (left.type !== 'binary' || right.type !== 'binary') {
      return null;
    }

    const leftBinary = left as BinaryExpression;
    const rightBinary = right as BinaryExpression;
    const [leftField] = leftBinary.operands;
    const [rightField] = rightBinary.operands;

    if (!isFieldReference(leftField) || !isFieldReference(rightField)) {
      return null;
    }
    if (leftField.fieldName !== rightField.fieldName) {
      return null;
    }

    const isLowerRangeOperator = (operator: string) =>
      operator === 'lt' || operator === 'lte';
    const isUpperRangeOperator = (operator: string) =>
      operator === 'gt' || operator === 'gte';

    const leftIsLower = isLowerRangeOperator(leftBinary.operator);
    const leftIsUpper = isUpperRangeOperator(leftBinary.operator);
    const rightIsLower = isLowerRangeOperator(rightBinary.operator);
    const rightIsUpper = isUpperRangeOperator(rightBinary.operator);

    if (!(leftIsLower && rightIsUpper) && !(leftIsUpper && rightIsLower)) {
      return null;
    }

    const selectedIndex = this.findLeadingIndex(leftField.fieldName);
    if (!selectedIndex) {
      return null;
    }

    const lowerProbe = leftIsLower ? leftBinary : rightBinary;
    const upperProbe = leftIsUpper ? leftBinary : rightBinary;

    return {
      strategy: 'multiProbe',
      selectedIndex,
      indexFilters: [],
      probeFilters: [[lowerProbe], [upperProbe]],
      postFilters: [expression],
    };
  }

  private findLeadingIndex(fieldName: string): IndexLike | null {
    const candidates = this.availableIndexes
      .filter((index) => index.indexFields[0] === fieldName)
      .sort((a, b) => a.indexFields.length - b.indexFields.length);
    return candidates[0] ?? null;
  }

  private getLikePrefix(pattern: string): string | null {
    if (!pattern || pattern.startsWith('%') || pattern.includes('_')) {
      return null;
    }
    const wildcardIndex = pattern.indexOf('%');
    if (wildcardIndex === -1) {
      return null;
    }
    if (wildcardIndex !== pattern.length - 1) {
      return null;
    }
    const prefix = pattern.slice(0, -1);
    return prefix || null;
  }

  private getPrefixUpperBound(prefix: string): string | null {
    if (!prefix) {
      return null;
    }
    const chars = Array.from(prefix);
    for (let index = chars.length - 1; index >= 0; index -= 1) {
      const codePoint = chars[index].codePointAt(0);
      if (codePoint === undefined) {
        continue;
      }
      if (codePoint < 0x10_ff_ff) {
        chars[index] = String.fromCodePoint(codePoint + 1);
        return chars.slice(0, index + 1).join('');
      }
    }
    return null;
  }

  private buildComplementProbeFilters(
    fieldName: string,
    excludedValues: unknown[]
  ): FilterExpression<boolean>[][] | null {
    const sortedValues = this.sortComparableValues(excludedValues);
    if (!sortedValues || sortedValues.length === 0) {
      return null;
    }

    const field = fieldRef(fieldName) as any;
    const probes: FilterExpression<boolean>[][] = [];

    const first = sortedValues[0];
    probes.push([lt(field, first as any)]);

    for (let i = 1; i < sortedValues.length; i += 1) {
      const previous = sortedValues[i - 1];
      const current = sortedValues[i];
      probes.push([gt(field, previous as any), lt(field, current as any)]);
    }

    const last = sortedValues.at(-1)!;
    probes.push([gt(field, last as any)]);

    return probes;
  }

  private sortComparableValues(values: unknown[]): unknown[] | null {
    const comparableValues: unknown[] = [];
    for (const value of values) {
      if (!this.isComparableIndexValue(value)) {
        return null;
      }
      comparableValues.push(value);
    }

    const sorted = [...comparableValues].sort((a, b) => {
      const comparison = this.compareIndexValues(a, b);
      if (comparison === null) {
        throw new Error('Index value comparison is not supported.');
      }
      return comparison;
    });

    const deduped: unknown[] = [];
    for (const value of sorted) {
      if (deduped.length === 0) {
        deduped.push(value);
        continue;
      }
      const last = deduped.at(-1)!;
      const comparison = this.compareIndexValues(last, value);
      if (comparison !== 0) {
        deduped.push(value);
      }
    }
    return deduped;
  }

  private isComparableIndexValue(value: unknown): boolean {
    if (value === null) {
      return true;
    }
    if (typeof value === 'string') {
      return true;
    }
    if (typeof value === 'number') {
      return Number.isFinite(value);
    }
    if (typeof value === 'bigint') {
      return true;
    }
    if (typeof value === 'boolean') {
      return true;
    }
    return false;
  }

  private compareIndexValues(a: unknown, b: unknown): number | null {
    if (a === b) {
      return 0;
    }
    if (a === null) {
      return -1;
    }
    if (b === null) {
      return 1;
    }
    if (typeof a !== typeof b) {
      return null;
    }
    switch (typeof a) {
      case 'string':
        return a < (b as string) ? -1 : 1;
      case 'number':
        if (!Number.isFinite(a) || !Number.isFinite(b as number)) {
          return null;
        }
        return a < (b as number) ? -1 : 1;
      case 'bigint':
        return a < (b as bigint) ? -1 : 1;
      case 'boolean':
        return Number(a) - Number(b as boolean);
      default:
        return null;
    }
  }

  /**
   * Extract all field references from expression tree
   * Uses visitor pattern to traverse tree
   *
   * @param expression - Filter expression to traverse
   * @returns Set of referenced field names
   */
  private extractFieldReferences(
    expression: FilterExpression<boolean>
  ): Set<string> {
    const fields = new Set<string>();

    const isIndexableOperator = (operator: string) =>
      operator === 'eq' ||
      operator === 'gt' ||
      operator === 'gte' ||
      operator === 'lt' ||
      operator === 'lte';

    const visit = (expr: FilterExpression<boolean>, indexable: boolean) => {
      if (expr.type === 'binary') {
        const [field] = expr.operands;
        if (
          indexable &&
          isIndexableOperator(expr.operator) &&
          isFieldReference(field)
        ) {
          fields.add(field.fieldName);
        }
        return;
      }
      if (expr.type === 'logical') {
        if (expr.operator === 'and') {
          for (const operand of expr.operands) {
            visit(operand, indexable);
          }
        } else {
          // OR is not indexable - skip fields inside OR
          for (const operand of expr.operands) {
            visit(operand, false);
          }
        }
        return;
      }
      if (expr.type === 'unary') {
        // Unary operators are not indexable
        return;
      }
    };

    visit(expression, true);
    return fields;
  }

  /**
   * Select best index using scoring algorithm
   *
   * Scoring:
   * - Exact match: 100 + index field count (all fields match in order)
   * - Prefix match: 75 + matched field count (subset matches from start)
   * - Partial match: 50 * overlap ratio (some fields match)
   * - No match: null (no suitable index)
   *
   * @param referencedFields - Fields referenced in filter expression
   * @returns Best matching index or null
   */
  private selectIndex(referencedFields: Set<string>): IndexLike | null {
    if (referencedFields.size === 0 || this.availableIndexes.length === 0) {
      return null;
    }

    const scores: IndexScore[] = [];

    for (const index of this.availableIndexes) {
      const score = this.scoreIndex(index, referencedFields);
      if (score) {
        scores.push(score);
      }
    }

    // Sort by score descending, then by match type priority
    scores.sort((a, b) => {
      if (a.score !== b.score) {
        return b.score - a.score;
      }
      // Tie-breaker: exact > prefix > partial
      const typeOrder = { exact: 3, prefix: 2, partial: 1 };
      return typeOrder[b.matchType] - typeOrder[a.matchType];
    });

    return scores[0]?.index ?? null;
  }

  /**
   * Score a single index for field match quality
   *
   * @param index - Index to score
   * @param referencedFields - Fields referenced in filter
   * @returns Score or null if no match
   */
  private scoreIndex(
    index: IndexLike,
    referencedFields: Set<string>
  ): IndexScore | null {
    const indexFields = index.indexFields;
    const refArray = Array.from(referencedFields);

    // Check for exact match - all fields match in order
    if (this.isExactMatch(indexFields, refArray)) {
      return {
        index,
        score: 100 + indexFields.length,
        matchType: 'exact',
        matchedFields: indexFields,
      };
    }

    // Check for prefix match - subset matches from start
    const prefixCount = this.getPrefixMatchCount(indexFields, referencedFields);
    if (prefixCount > 0) {
      return {
        index,
        score: 75 + prefixCount,
        matchType: 'prefix',
        matchedFields: indexFields.slice(0, prefixCount),
      };
    }

    // Check for partial match - some fields overlap
    const overlapCount = this.getOverlapCount(indexFields, referencedFields);
    if (overlapCount > 0) {
      const overlapRatio =
        overlapCount / Math.max(indexFields.length, refArray.length);
      return {
        index,
        score: 50 * overlapRatio,
        matchType: 'partial',
        matchedFields: indexFields.filter((f: string) =>
          referencedFields.has(f)
        ),
      };
    }

    return null;
  }

  /**
   * Check if referenced fields exactly match index fields in order
   */
  private isExactMatch(
    indexFields: string[],
    referencedFields: string[]
  ): boolean {
    if (indexFields.length !== referencedFields.length) {
      return false;
    }
    return indexFields.every((field, i) => field === referencedFields[i]);
  }

  /**
   * Count how many index fields match from the start
   * Example: index [a, b, c], refs [a, b] → 2 (prefix match)
   */
  private getPrefixMatchCount(
    indexFields: string[],
    referencedFields: Set<string>
  ): number {
    let count = 0;
    for (const field of indexFields) {
      if (referencedFields.has(field)) {
        count++;
      } else {
        break; // Stop at first non-match
      }
    }
    return count;
  }

  /**
   * Count total field overlap between index and references
   */
  private getOverlapCount(
    indexFields: string[],
    referencedFields: Set<string>
  ): number {
    return indexFields.filter((field) => referencedFields.has(field)).length;
  }

  /**
   * Split filters into index-compatible and post-filters
   *
   * Index-compatible filters:
   * - Binary eq operations that satisfy compound index prefix order
   * - Optional range operations (gt/gte/lt/lte) on the first non-eq prefix field
   * - Can be pushed into .withIndex() for efficient scanning
   *
   * Post-filters:
   * - All other operators (ne, gt, lt, and, or, not)
   * - Applied via .filter() after index scan
   *
   * @param expression - Filter expression tree
   * @param selectedIndex - Selected index (if any)
   * @returns Split filters
   */
  private splitFilters(
    expression: FilterExpression<boolean>,
    selectedIndex: IndexLike | null
  ): {
    indexFilters: FilterExpression<boolean>[];
    postFilters: FilterExpression<boolean>[];
  } {
    // No index selected - all filters are post-filters
    if (!selectedIndex) {
      return {
        indexFilters: [],
        postFilters: [expression],
      };
    }

    const indexFields = selectedIndex.indexFields;
    const indexFieldSet = new Set(indexFields);
    const binaryFilters: BinaryExpression[] = [];
    const postFilters: FilterExpression<boolean>[] = [];
    const isBinaryExpression = (
      expr: FilterExpression<boolean>
    ): expr is BinaryExpression => expr.type === 'binary';

    const collect = (expr: FilterExpression<boolean>) => {
      if (isBinaryExpression(expr)) {
        binaryFilters.push(expr);
        return;
      }
      if (expr.type === 'logical' && expr.operator === 'and') {
        for (const operand of expr.operands) {
          collect(operand);
        }
        return;
      }
      postFilters.push(expr);
    };

    collect(expression);

    const binariesByField = new Map<string, BinaryExpression[]>();
    for (const binary of binaryFilters) {
      const [field] = binary.operands;
      if (!isFieldReference(field) || !indexFieldSet.has(field.fieldName)) {
        postFilters.push(binary);
        continue;
      }
      const existing = binariesByField.get(field.fieldName) ?? [];
      existing.push(binary);
      binariesByField.set(field.fieldName, existing);
    }

    const indexFilters: FilterExpression<boolean>[] = [];
    const consumed = new Set<FilterExpression<boolean>>();
    const takeEq = (fieldName: string): boolean => {
      const filters = binariesByField.get(fieldName) ?? [];
      const eqFilter = filters.find((filter) => filter.operator === 'eq');
      if (!eqFilter) {
        return false;
      }
      indexFilters.push(eqFilter);
      consumed.add(eqFilter);
      return true;
    };

    const takeRange = (fieldName: string): boolean => {
      const filters = binariesByField.get(fieldName) ?? [];
      const lower =
        filters.find((filter) => filter.operator === 'gte') ??
        filters.find((filter) => filter.operator === 'gt');
      const upper =
        filters.find((filter) => filter.operator === 'lte') ??
        filters.find((filter) => filter.operator === 'lt');

      if (!lower && !upper) {
        return false;
      }

      if (lower) {
        indexFilters.push(lower);
        consumed.add(lower);
      }
      if (upper) {
        indexFilters.push(upper);
        consumed.add(upper);
      }
      return true;
    };

    for (const fieldName of indexFields) {
      if (takeEq(fieldName)) {
        continue;
      }
      takeRange(fieldName);
      break;
    }

    for (const binary of binaryFilters) {
      if (!consumed.has(binary) && !postFilters.includes(binary)) {
        postFilters.push(binary);
      }
    }

    return { indexFilters, postFilters };
  }
}
