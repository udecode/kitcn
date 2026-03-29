---
title: Milestone 4: Query Builder - Where Filtering
type: feat
date: 2026-01-31
deepened: 2026-01-31
---

# Milestone 4: Query Builder - Where Filtering

## Enhancement Summary

**Deepened on:** 2026-01-31
**Sections enhanced:** 7 implementation phases + architecture + type system
**Research agents used:** 7 specialized reviewers (kieran-typescript, architecture-strategist, performance-oracle, pattern-recognition-specialist, code-simplicity, data-integrity-guardian, framework-docs-researcher)

### Key Improvements Discovered

1. **Simplification** - Reduce from 7 to 5 phases by deferring `orderBy` (belongs in M4.5 query features, not M4 filtering) and starting with single operator implementation instead of all 6 binary operators at once
2. **Type Safety** - Replace all `any` types with proper opaque types (`FilterExpression`, `FieldReference`), use branded types and conditional type inference
3. **Performance** - Fix critical limit/offset calculation bug (offset applied in-memory after take is inefficient), implement proper index selection algorithm (currently stubbed in plan)
4. **Architecture** - Add missing filter splitting algorithm to separate index-compatible from post-filters, decouple from M2 via FieldReference abstraction
5. **Patterns** - Implement visitor pattern for expression tree traversal to avoid manual recursion throughout codebase
6. **Data Integrity** - Add undefined filter validation, proper null operator handling, validate filter arrays aren't empty
7. **Advanced TypeScript** - Use conditional types with `infer`, branded types for nominal typing, template literal types for field paths, recursive conditional types for nested relations

### New Considerations

- **FieldReference Abstraction**: Critical missing layer between column schema and filter operators - prevents tight coupling to M2 table config
- **Filter Splitting Algorithm**: Must separate filters into index-compatible (eq on indexed fields) vs post-filters (gt, lt, complex expressions)
- **Visitor Pattern**: Essential for extensibility - allows adding new filter transformations without modifying FilterExpression class
- **N+1 Prevention**: Index selection must batch-load related entities when using `with` option
- **Type Inference Depth**: Test with 5+ levels of nested `and`/`or` to ensure TypeScript doesn't hit recursion limits

## Overview

Implement Drizzle-style where clause filtering with compile-time type safety and efficient Convex query generation. This milestone delivers the filtering API that developers familiar with Drizzle ORM expect, enabling complex queries with full type inference and optimal index usage.

**Target API**:
```typescript
const users = await ctx.db.query.users.findMany({
  where: (user, { eq, and, gt }) =>
    and(
      eq(user.role, 'admin'),
      gt(user.credits, 100)
    ),
  with: { posts: true },
  limit: 10
});

// Inferred type:
// {
//   _id: Id<"users">;
//   name: string;
//   role: string;
//   credits: number;
//   posts: Post[];
// }[]
```

## Problem Statement

M3 (Query Builder - Read Operations) established the foundation for querying with relations, but lacks the familiar Drizzle-style filtering API. Developers coming from Drizzle/Prisma expect:

1. **Type-safe where clauses**: Filter values constrained to field types
2. **Composable operators**: `eq`, `gt`, `lt`, `and`, `or` with intuitive syntax
3. **Index-aware queries**: Automatic index selection for optimal performance
4. **Convex-native execution**: Compile to efficient Convex query expressions

**Current State** (from M3):
- ✅ `FilterFunction<TColumns>` type exists
- ✅ `FilterOperators` interface defined
- ✅ Callback pattern: `where: (cols, { eq }) => eq(cols.email, 'alice@example.com')`
- ❌ **NOT IMPLEMENTED**: Operator compilation to Convex expressions
- ❌ **NOT IMPLEMENTED**: Index selection logic
- ❌ **NOT IMPLEMENTED**: Logical operators (and, or, not)

**Pain Points Without M4**:
- No way to filter query results with Drizzle-familiar syntax
- Manual Convex query construction required
- Type safety lost at the filter boundary
- Sub-optimal queries without index guidance

## Proposed Solution

Implement a **two-layer compilation architecture** that:

1. **Filter Expression Layer**: Typed operators (eq, gt, lt) that capture filter intent
2. **Query Compilation Layer**: Translate filter expressions to Convex query API calls

**Key Design Decisions**:

- **Operator Return Type**: Operators return opaque `FilterExpression<T>` objects (not raw Convex expressions)
- **Deferred Compilation**: Expressions compile to Convex only at query execution time
- **Type Inference**: Use Drizzle's `BinaryOperator` pattern with 3 type overloads
- **Index Selection**: Match filter fields to EdgeMetadata indexes from M2

**Convex Adaptation**:

Unlike Drizzle's SQL compilation, we compile to Convex's query builder API:

```typescript
// Drizzle (SQL):
eq(users.name, "Alice") → SQL`users.name = 'Alice'`

// kitcn (Convex API):
eq(users.name, "Alice") → db.query('users').withIndex('name', q => q.eq('name', 'Alice'))
```

## Technical Approach

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  User Query API                              │
│  where: (cols, { eq, gt, and }) => and(                      │
│    eq(cols.role, 'admin'),                                   │
│    gt(cols.credits, 100)                                     │
│  )                                                           │
└────────────────────┬────────────────────────────────────────┘
                     │
         ┌───────────▼────────────┐
         │   FilterFunction       │  Callback with operators
         │   (cols, operators)    │
         └───────────┬────────────┘
                     │
         ┌───────────▼────────────┐
         │  FilterExpression<T>   │  Opaque expression objects
         │  - eq(field, value)    │  (captured filter intent)
         │  - gt(field, value)    │
         │  - and(expr1, expr2)   │
         └───────────┬────────────┘
                     │
         ┌───────────▼────────────┐
         │  WhereClauseCompiler   │  Translation engine
         │  - compileExpression() │
         │  - selectIndex()       │
         │  - generateFilter()    │
         └───────────┬────────────┘
                     │
         ┌───────────▼────────────┐
         │   Convex Query API     │  Native Convex operations
         │  - .withIndex()        │
         │  - .filter()           │
         │  - .order()            │
         └────────────────────────┘
```

### Type System Architecture

```typescript
// 1. Filter Expression (Opaque Type)
class FilterExpression<T> {
  constructor(
    readonly type: 'binary' | 'logical' | 'unary',
    readonly operator: string,
    readonly operands: any[]
  ) {}
}

// 2. Binary Operator with Type Overloads (from Drizzle)
interface BinaryOperator {
  // For field references with column schema
  <TField extends FieldReference>(
    left: TField,
    right: InferFieldType<TField> | FilterExpression,
  ): FilterExpression<boolean>;

  // For raw values
  <T>(left: T, right: T | FilterExpression): FilterExpression<boolean>;
}

// 3. Type Inference from Field Schema
type InferFieldType<TField> = TField extends FieldReference<infer T>
  ? T
  : never;

// 4. Logical Operators
function and(...conditions: FilterExpression<boolean>[]): FilterExpression<boolean>;
function or(...conditions: FilterExpression<boolean>[]): FilterExpression<boolean>;
function not(condition: FilterExpression<boolean>): FilterExpression<boolean>;
```

### Index Selection Strategy

**Algorithm**:

1. **Extract filter fields**: Parse FilterExpression tree for field references
2. **Match to indexes**: Query EdgeMetadata for indexes containing those fields
3. **Rank candidates**:
   - Exact match (all filter fields in index): Score 100
   - Prefix match (filter fields as index prefix): Score 75
   - Partial match (some filter fields in index): Score 50
   - No match: Score 0 (table scan)
4. **Select best**: Use highest-scoring index

**Example**:
```typescript
// Filter: and(eq(user.role, 'admin'), gt(user.credits, 100))
// Available indexes:
//   - ['role', '_creationTime'] → Score 75 (prefix match on 'role')
//   - ['credits', 'role']       → Score 100 (exact match, both fields)
//   - ['name']                  → Score 0 (no match)
// Selected: ['credits', 'role'] index
```

### Implementation Phases

#### Phase 1: Filter Expression Foundation

**Deliverables**:
- [x] `FilterExpression<T>` class - opaque type for filter operations
- [x] Type-safe field references from column schema
- [x] Basic binary operators: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`
- [x] Type inference system with overloads

**Files**:
```
packages/kitcn/src/orm/
  filter-expression.ts      # FilterExpression class
  filter-operators.ts       # Operator factory functions
  types.ts                  # Update with filter types
```

**Example**:
```typescript
// filter-expression.ts
export class FilterExpression<T = boolean> {
  constructor(
    readonly type: 'binary' | 'logical' | 'unary',
    readonly operator: string,
    readonly operands: any[],
  ) {}

  // Helper to walk expression tree during compilation
  walk(visitor: ExpressionVisitor): void {
    visitor.visit(this);
    for (const operand of this.operands) {
      if (operand instanceof FilterExpression) {
        operand.walk(visitor);
      }
    }
  }
}

// filter-operators.ts
export const eq: BinaryOperator = <TField extends FieldReference>(
  left: TField,
  right: InferFieldType<TField> | FilterExpression,
): FilterExpression<boolean> => {
  return new FilterExpression('binary', 'eq', [left, right]);
};

export const gt: BinaryOperator = <TField extends FieldReference>(
  left: TField,
  right: InferFieldType<TField> | FilterExpression,
): FilterExpression<boolean> => {
  return new FilterExpression('binary', 'gt', [left, right]);
};

// ... lt, lte, gte, ne follow same pattern
```

**Success Criteria**:
- Type inference works: `eq(users.age, 25)` accepts numbers, rejects strings
- Operators return FilterExpression objects
- Filter expressions are composable (can pass to and/or)

### Research Insights

**Best Practices**:
- Use **branded types** for `FilterExpression` to create nominal typing (prevents accidental misuse):
  ```typescript
  type FilterExpression<T> = { readonly __brand: 'FilterExpression'; __type: T };
  ```
- Implement **visitor pattern** for expression tree traversal instead of manual recursion:
  ```typescript
  interface ExpressionVisitor {
    visitBinary(expr: BinaryExpression): void;
    visitLogical(expr: LogicalExpression): void;
    visitUnary(expr: UnaryExpression): void;
  }
  ```
- Use **conditional types with `infer`** for type-safe operator overloading (Drizzle pattern):
  ```typescript
  type InferFieldType<T> = T extends FieldReference<infer U> ? U : never;
  ```

**Critical Simplification**:
- **Start with ONE operator (`eq`) only** - prove the architecture works before adding all 6 binary operators
- This reduces Phase 1 scope by 80% and allows faster validation of type inference system
- Other operators (`ne`, `gt`, `gte`, `lt`, `lte`) follow identical pattern, add in Phase 2

**Performance Considerations**:
- FilterExpression objects must be **lightweight** (< 100 bytes) since deeply nested filters create many instances
- Use **structural sharing** where possible (immutable operands array)
- Consider **object pooling** if profiling shows allocation pressure

**Implementation Details**:
```typescript
// Recommended: Use private brand symbol for nominal typing
const FilterExpressionBrand: unique symbol = Symbol('FilterExpression');

export interface FilterExpression<T = boolean> {
  readonly [FilterExpressionBrand]: true;
  readonly type: 'binary' | 'logical' | 'unary';
  readonly operator: string;
  readonly operands: ReadonlyArray<any>; // Immutable

  // Visitor pattern instead of manual walk
  accept<R>(visitor: ExpressionVisitor<R>): R;
}

// FieldReference abstraction (CRITICAL - missing from original plan)
export interface FieldReference<T = unknown> {
  readonly __brand: 'FieldReference';
  readonly fieldName: string;
  readonly fieldType: T; // Phantom type for inference
}
```

**Edge Cases**:
- **Undefined in operator calls**: Should `eq(field, undefined)` throw or create `isNull` expression?
- **Empty operands array**: Validate `new FilterExpression('and', [])` throws error
- **Circular references**: Prevent `const x = not(x)` infinite recursion
- **Type inference depth**: Test 5+ levels of nesting to avoid TypeScript "Type instantiation is excessively deep" errors

**Anti-Patterns to Avoid**:
- ❌ Using `any` for operands - loses type safety at the most critical point
- ❌ Mutable FilterExpression - creates unpredictable behavior when expressions are reused
- ❌ Direct field name strings - bypasses type checking, use FieldReference abstraction
- ❌ Manual recursion instead of visitor pattern - leads to code duplication

**References**:
- Drizzle BinaryOperator pattern: `/tmp/cc-repos/drizzle-orm/drizzle-orm/src/sql/expressions/conditions.ts:32-42`
- TypeScript conditional types: https://www.typescriptlang.org/docs/handbook/2/conditional-types.html
- Visitor pattern in TypeScript: https://refactoring.guru/design-patterns/visitor/typescript/example
- Branded types: https://github.com/microsoft/TypeScript/wiki/FAQ#can-i-make-a-type-alias-nominal

---

#### Phase 2: Logical Operators

**Deliverables**:
- [x] `and(...conditions)` - logical AND with undefined filtering
- [x] `or(...conditions)` - logical OR with undefined filtering
- [x] `not(condition)` - logical NOT
- [x] Nested condition support

**Files**:
```
packages/kitcn/src/orm/
  filter-operators.ts       # Add logical operators
```

**Example**:
```typescript
// filter-operators.ts
export function and(
  ...conditions: (FilterExpression<boolean> | undefined)[]
): FilterExpression<boolean> | undefined {
  // Filter out undefined (same as Drizzle)
  const filtered = conditions.filter(
    (c): c is FilterExpression<boolean> => c !== undefined
  );

  if (filtered.length === 0) return undefined;
  if (filtered.length === 1) return filtered[0];

  return new FilterExpression('logical', 'and', filtered);
}

export function or(
  ...conditions: (FilterExpression<boolean> | undefined)[]
): FilterExpression<boolean> | undefined {
  const filtered = conditions.filter(
    (c): c is FilterExpression<boolean> => c !== undefined
  );

  if (filtered.length === 0) return undefined;
  if (filtered.length === 1) return filtered[0];

  return new FilterExpression('logical', 'or', filtered);
}

export function not(
  condition: FilterExpression<boolean>
): FilterExpression<boolean> {
  return new FilterExpression('unary', 'not', [condition]);
}
```

**Usage Example**:
```typescript
where: (user, { eq, gt, and, or }) =>
  and(
    eq(user.role, 'admin'),
    or(
      gt(user.credits, 100),
      eq(user.plan, 'premium')
    )
  )
```

**Success Criteria**:
- `and()` combines multiple conditions correctly
- `or()` provides alternative conditions
- `not()` negates conditions
- Undefined conditions are filtered automatically
- Nested and/or work correctly

### Research Insights

**Best Practices**:
- **Filter undefined values exactly like Drizzle** (from `/tmp/cc-repos/drizzle-orm/drizzle-orm/src/sql/expressions/conditions.ts:104-125`):
  ```typescript
  const filtered = conditions.filter((c): c is FilterExpression<boolean> => c !== undefined);
  ```
- **Return undefined when no conditions remain** - allows conditional filter composition:
  ```typescript
  where: (u, { and, eq }) => and(
    eq(u.role, 'admin'),
    isActive ? eq(u.status, 'active') : undefined // Omitted if isActive=false
  )
  ```
- **Flatten nested same-operator chains** for optimization:
  ```typescript
  and(and(a, b), c) → and(a, b, c) // Reduces expression depth
  ```

**Performance Considerations**:
- **Short-circuit evaluation**: When compiling to Convex, `and` can stop at first false, `or` at first true
- **De-duplicate identical conditions**: `and(eq(x, 1), eq(x, 1))` → `eq(x, 1)`
- **Optimize single-condition cases**: `and(single)` → `single` (avoid unnecessary wrapping)

**Implementation Details**:
```typescript
// Enhanced logical operators with optimizations
export function and(
  ...conditions: (FilterExpression<boolean> | undefined)[]
): FilterExpression<boolean> | undefined {
  const filtered = conditions.filter(
    (c): c is FilterExpression<boolean> => c !== undefined
  );

  if (filtered.length === 0) return undefined;
  if (filtered.length === 1) return filtered[0]; // Optimization

  // Flatten nested AND expressions
  const flattened = filtered.flatMap(c =>
    c.type === 'logical' && c.operator === 'and' ? c.operands : [c]
  );

  // De-duplicate (use expression equality)
  const unique = [...new Map(flattened.map(e => [JSON.stringify(e), e])).values()];

  if (unique.length === 1) return unique[0];
  return createFilterExpression('logical', 'and', unique);
}
```

**Edge Cases**:
- **Empty array**: `and()` → `undefined` (matches Drizzle)
- **Undefined-only array**: `and(undefined, undefined)` → `undefined`
- **Deeply nested**: `and(and(and(...)))` should flatten, not create deep tree
- **Mixed undefined**: `and(eq(x, 1), undefined, eq(y, 2))` → `and(eq(x, 1), eq(y, 2))`

**Anti-Patterns to Avoid**:
- ❌ `and(...[])` without undefined check - creates invalid expression
- ❌ Not flattening nested same-operator - leads to excessively deep trees
- ❌ Using `&&` or `||` directly - bypasses type system, doesn't create FilterExpression
- ❌ Forgetting to handle undefined return - `where: (u, {and}) => and()` crashes if not checked

**TypeScript Type Safety**:
```typescript
// Ensure undefined is handled in return type
type LogicalOperator = (
  ...conditions: (FilterExpression<boolean> | undefined)[]
) => FilterExpression<boolean> | undefined; // Not just FilterExpression!

// Allow variadic arguments
function and(...conditions: (FilterExpression<boolean> | undefined)[]): ReturnType<LogicalOperator>;
```

**References**:
- Drizzle logical operators: `/tmp/cc-repos/drizzle-orm/drizzle-orm/src/sql/expressions/conditions.ts:104-125`
- Short-circuit evaluation patterns: https://en.wikipedia.org/wiki/Short-circuit_evaluation

---

#### Phase 3: Where Clause Compiler

**Deliverables**:
- [x] `WhereClauseCompiler` class - translates FilterExpression to Convex API
- [x] Expression visitor pattern for tree traversal
- [x] Field reference resolution from column schema
- [x] Value binding with type validation

**Files**:
```
packages/kitcn/src/orm/
  query-compiler.ts         # Add WhereClauseCompiler
  field-reference.ts        # FieldReference class
```

**Example**:
```typescript
// query-compiler.ts
export class WhereClauseCompiler<TTableConfig extends TableRelationalConfig> {
  constructor(
    private tableConfig: TTableConfig,
    private edgeMetadata: EdgeMetadata[],
  ) {}

  compile(
    expression: FilterExpression<boolean> | undefined
  ): CompiledWhere {
    if (!expression) {
      return { useIndex: false, filters: [] };
    }

    // 1. Extract field references from expression tree
    const fields = this.extractFields(expression);

    // 2. Select best index for these fields
    const selectedIndex = this.selectIndex(fields);

    // 3. Split expression into index filters and post-filters
    const { indexFilters, postFilters } = this.splitFilters(
      expression,
      selectedIndex
    );

    return {
      useIndex: !!selectedIndex,
      indexName: selectedIndex?.indexName,
      indexFilters,  // Filters that can use the index
      postFilters,   // Filters applied after index scan
    };
  }

  private extractFields(expr: FilterExpression): string[] {
    const fields: string[] = [];
    expr.walk({
      visit: (node) => {
        if (node.type === 'binary') {
          const [left] = node.operands;
          if (left instanceof FieldReference) {
            fields.push(left.fieldName);
          }
        }
      }
    });
    return [...new Set(fields)];
  }

  private selectIndex(fields: string[]): EdgeMetadata | undefined {
    // Score each index based on field match
    const scored = this.edgeMetadata.map(meta => ({
      meta,
      score: this.scoreIndex(meta.indexFields, fields)
    }));

    // Return highest scoring index (if score > 0)
    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.score > 0 ? scored[0].meta : undefined;
  }

  private scoreIndex(indexFields: string[], filterFields: string[]): number {
    // Exact match: all filter fields in index, same order
    if (this.isExactMatch(indexFields, filterFields)) return 100;

    // Prefix match: filter fields are prefix of index
    if (this.isPrefixMatch(indexFields, filterFields)) return 75;

    // Partial match: some filter fields in index
    const overlap = filterFields.filter(f => indexFields.includes(f)).length;
    if (overlap > 0) return 50 * (overlap / filterFields.length);

    return 0;  // No match
  }
}
```

**Success Criteria**:
- Compiler extracts field references from FilterExpression tree
- Index selection algorithm ranks indexes correctly
- Filters split into index-compatible and post-filters
- Type validation ensures filter values match field types

### Research Insights

**CRITICAL MISSING FEATURE - Filter Splitting Algorithm**:

The original plan mentions splitting filters but **doesn't implement it**. This is essential because:

- **Index filters**: Only equality (`eq`) on indexed fields - passed to `.withIndex()`
- **Post filters**: All other operators (`gt`, `lt`, `and`, `or`) - passed to `.filter()`

```typescript
// Filter Splitting Algorithm (MUST IMPLEMENT)
private splitFilters(
  expression: FilterExpression,
  selectedIndex: EdgeMetadata | undefined
): { indexFilters: FilterExpression[]; postFilters: FilterExpression[] } {
  if (!selectedIndex) {
    return { indexFilters: [], postFilters: [expression] };
  }

  const indexableFields = new Set(selectedIndex.indexFields);
  const indexFilters: FilterExpression[] = [];
  const postFilters: FilterExpression[] = [];

  const visitor: ExpressionVisitor = {
    visitBinary: (expr) => {
      const [field, _value] = expr.operands;
      const isIndexable =
        expr.operator === 'eq' &&
        field instanceof FieldReference &&
        indexableFields.has(field.fieldName);

      if (isIndexable) {
        indexFilters.push(expr);
      } else {
        postFilters.push(expr);
      }
    },
    visitLogical: (expr) => {
      // Logical operators always go to post-filters
      postFilters.push(expr);
    }
  };

  expression.accept(visitor);
  return { indexFilters, postFilters };
}
```

**Best Practices**:
- **Use visitor pattern** for expression tree traversal (original plan uses manual `walk` method - less extensible)
- **Cache index selection** - don't re-score on every query execution
- **Validate field references** against table schema before compilation
- **Fail fast** on invalid field names with clear error messages

**Performance Considerations**:
- **Index selection is NOT implemented in plan's example code** - shows scoring algorithm but doesn't use results
- **Compilation must be < 5ms** - cache EdgeMetadata lookup, pre-compute index rankings
- **N+1 Prevention**: When using `with` option, compiler must detect relation joins and batch-load
  ```typescript
  // BAD: N+1 queries
  users.forEach(async u => await loadPosts(u.id));

  // GOOD: Batch load
  const userIds = users.map(u => u.id);
  const posts = await loadPostsBatch(userIds);
  ```

**Implementation Details - Index Selection**:

```typescript
// Enhanced scoring with tie-breaking
private scoreIndex(indexFields: string[], filterFields: string[]): number {
  const filterSet = new Set(filterFields);

  // Exact match: all filter fields in index, same order
  if (this.isExactMatch(indexFields, filterFields)) {
    return 100 + indexFields.length; // Tie-break: prefer shorter index
  }

  // Prefix match: filter fields are prefix of index
  if (this.isPrefixMatch(indexFields, filterFields)) {
    return 75 + filterFields.length; // Tie-break: prefer more matched fields
  }

  // Partial match: some filter fields in index
  const overlap = indexFields.filter(f => filterSet.has(f)).length;
  if (overlap > 0) {
    return 50 * (overlap / filterFields.length);
  }

  return 0; // No match - table scan
}

// CRITICAL: Implement these helper methods (missing from plan)
private isExactMatch(indexFields: string[], filterFields: string[]): boolean {
  if (indexFields.length !== filterFields.length) return false;
  return indexFields.every((f, i) => f === filterFields[i]);
}

private isPrefixMatch(indexFields: string[], filterFields: string[]): boolean {
  if (filterFields.length > indexFields.length) return false;
  return filterFields.every((f, i) => f === indexFields[i]);
}
```

**Edge Cases**:
- **No indexes defined**: Should fall back to table scan, not crash
- **Filter on non-indexed field**: Should use table scan with `.filter()`
- **Multiple equally-scored indexes**: Use tie-breaker (prefer shorter index)
- **Compound index partial match**: `index: ['a', 'b', 'c']`, `filter: ['a']` → prefix match (score 75)

**Critical Bugs Identified**:
- ❌ **Limit/offset calculation bug**: Original plan applies offset in-memory AFTER `.take(limit)`:
  ```typescript
  // BAD (from original plan Phase 4 example)
  const rows = await query.take(limit ?? 100);
  const sliced = offset ? rows.slice(offset) : rows; // WRONG!
  ```
  This is inefficient and incorrect. Should be:
  ```typescript
  // GOOD - Use Convex's built-in pagination
  const rows = await query
    .skip(offset ?? 0)  // CORRECT: Skip in database
    .take(limit ?? 100);
  ```

**Anti-Patterns to Avoid**:
- ❌ Applying offset in-memory - defeats purpose of pagination
- ❌ Not implementing filter splitting - puts all filters in `.filter()`, misses index usage
- ❌ Scoring indexes but not using highest score - original plan shows scoring but doesn't select
- ❌ Using `any` for field references - loses type safety in compiler

**References**:
- Convex index API: https://docs.convex.dev/database/indexes
- Convex pagination: https://docs.convex.dev/database/reading-data#pagination
- Visitor pattern: https://refactoring.guru/design-patterns/visitor/typescript/example
- Drizzle SQL compilation: `/tmp/cc-repos/drizzle-orm/drizzle-orm/src/sqlite-core/dialect.ts:303-389`

---

#### Phase 4: Convex Query Generation

**Deliverables**:
- [x] Generate `.withIndex()` calls for index-compatible filters
- [x] Generate `.filter()` calls for post-filters
- [x] Translate filter operators to Convex query expressions
- [x] Handle logical operators (and, or, not) in Convex filters

**Files**:
```
packages/kitcn/src/orm/
  query-compiler.ts         # Extend with query generation
  query.ts                  # Update _toConvexQuery() to use compiler
```

**Example**:
```typescript
// query-compiler.ts (continued)
export class WhereClauseCompiler<TTableConfig> {
  // ... previous methods

  generateConvexQuery(
    compiled: CompiledWhere,
    baseQuery: ConvexQueryBuilder
  ): ConvexQueryBuilder {
    let query = baseQuery;

    // 1. Apply index filters via .withIndex()
    if (compiled.useIndex && compiled.indexFilters.length > 0) {
      query = query.withIndex(compiled.indexName, (q) => {
        return this.applyIndexFilters(q, compiled.indexFilters);
      });
    }

    // 2. Apply post-filters via .filter()
    if (compiled.postFilters.length > 0) {
      query = query.filter((q) => {
        return this.applyPostFilters(q, compiled.postFilters);
      });
    }

    return query;
  }

  private applyIndexFilters(
    q: IndexRangeBuilder,
    filters: FilterExpression[]
  ): IndexRangeBuilder {
    // Convex index filters only support equality on compound indexes
    // e.g., q.eq('field1', value1).eq('field2', value2)
    for (const filter of filters) {
      if (filter.operator === 'eq') {
        const [field, value] = filter.operands;
        q = q.eq(field.fieldName, value);
      }
    }
    return q;
  }

  private applyPostFilters(
    q: FilterBuilder,
    filters: FilterExpression[]
  ): ExpressionOrValue<boolean> {
    // Translate each filter to Convex expression
    const expressions = filters.map(f => this.toConvexExpression(q, f));

    // Combine with AND (Convex default)
    if (expressions.length === 1) return expressions[0];

    return q.and(...expressions);
  }

  private toConvexExpression(
    q: FilterBuilder,
    expr: FilterExpression
  ): ExpressionOrValue<boolean> {
    switch (expr.type) {
      case 'binary': {
        const [left, right] = expr.operands;
        const field = q.field(left.fieldName);

        switch (expr.operator) {
          case 'eq': return q.eq(field, right);
          case 'ne': return q.neq(field, right);
          case 'gt': return q.gt(field, right);
          case 'gte': return q.gte(field, right);
          case 'lt': return q.lt(field, right);
          case 'lte': return q.lte(field, right);
        }
        break;
      }

      case 'logical': {
        const subExprs = expr.operands.map(op =>
          this.toConvexExpression(q, op)
        );

        switch (expr.operator) {
          case 'and': return q.and(...subExprs);
          case 'or': return q.or(...subExprs);
        }
        break;
      }

      case 'unary': {
        if (expr.operator === 'not') {
          const [operand] = expr.operands;
          return q.not(this.toConvexExpression(q, operand));
        }
        break;
      }
    }

    throw new Error(`Unsupported filter operator: ${expr.operator}`);
  }
}

// query.ts - Integration with GelRelationalQuery
async execute(): Promise<TResult> {
  const { where, limit, offset } = this.config;

  // 1. Compile where clause
  const compiler = new WhereClauseCompiler(this.tableConfig, this.edgeMetadata);
  const compiled = compiler.compile(where);

  // 2. Build Convex query with where filters
  let query = this.db.query(this.tableConfig.tsName);
  query = compiler.generateConvexQuery(compiled, query);

  // 3. Apply limit and execute
  const rows = await query.take(limit ?? 100);

  // 4. Apply offset (in-memory)
  const sliced = offset ? rows.slice(offset) : rows;

  // 5. Load relations, select columns, return
  // ... (existing M3 logic)
}
```

**Success Criteria**:
- Simple `eq` filters compile to `.withIndex()` when index available
- Range filters (gt, lt) compile to `.filter()` expressions
- Logical operators (and, or, not) generate correct Convex expressions
- Queries execute successfully with correct results

### Research Insights

**CRITICAL BUG FIX - Pagination Implementation**:

The original plan's example code in this phase contains a **critical performance and correctness bug**:

```typescript
// ❌ WRONG (from original Phase 4 example around line 550)
const rows = await query.take(limit ?? 100);
const sliced = offset ? rows.slice(offset) : rows; // BUG: In-memory offset
```

**Why this is wrong**:
1. **Performance**: Loads extra rows from database then discards them
2. **Incorrectness**: If `limit=10, offset=20`, this loads 10 rows, then tries to skip 20 - returns empty array!
3. **Memory waste**: Large offsets load unnecessary data into memory

**Correct implementation**:
```typescript
// ✅ CORRECT - Use Convex's native pagination
async execute(): Promise<TResult> {
  const { where, limit, offset } = this.config;
  const compiler = new WhereClauseCompiler(this.tableConfig, this.edgeMetadata);
  const compiled = compiler.compile(where);

  let query = this.db.query(this.tableConfig.tsName);
  query = compiler.generateConvexQuery(compiled, query);

  // FIX: Apply offset BEFORE take using Convex's skip()
  if (offset) {
    query = query.skip(offset);
  }

  const rows = await query.take(limit ?? 100);

  // 4. Load relations, select columns, return
  // ... (existing M3 logic)
}
```

**Best Practices**:
- **Always use database-level pagination** (`.skip()` and `.take()`) - never slice in-memory
- **Apply filters in order**: index → filter → skip → take
- **Validate pagination params**: `skip >= 0`, `take > 0`
- **Document default limit**: Why 100? Consider making configurable

**Performance Considerations**:
- **Index filters first**: `.withIndex()` reduces dataset before `.filter()`
- **Limit filter complexity**: Deep nesting in `.filter()` can be slow - consider query splitting
- **Benchmark filter compilation**: Should be < 1ms for typical queries (< 5 operators)
- **Cache compiled queries**: If same where clause used repeatedly, cache compilation result

**Implementation Details - Convex Filter Generation**:

```typescript
// Enhanced toConvexExpression with proper type handling
private toConvexExpression(
  q: FilterBuilder,
  expr: FilterExpression
): ExpressionOrValue<boolean> {
  switch (expr.type) {
    case 'binary': {
      const [left, right] = expr.operands;

      // CRITICAL: Validate left is FieldReference (not any)
      if (!(left instanceof FieldReference)) {
        throw new Error(`Expected FieldReference, got ${typeof left}`);
      }

      const field = q.field(left.fieldName);

      switch (expr.operator) {
        case 'eq': return q.eq(field, right);
        case 'ne': return q.neq(field, right);
        case 'gt': return q.gt(field, right);
        case 'gte': return q.gte(field, right);
        case 'lt': return q.lt(field, right);
        case 'lte': return q.lte(field, right);
        default:
          throw new Error(`Unsupported binary operator: ${expr.operator}`);
      }
    }

    case 'logical': {
      // VALIDATE: operands array not empty
      if (expr.operands.length === 0) {
        throw new Error(`Logical operator '${expr.operator}' requires at least one operand`);
      }

      const subExprs = expr.operands.map(op =>
        this.toConvexExpression(q, op)
      );

      switch (expr.operator) {
        case 'and': return q.and(...subExprs);
        case 'or': return q.or(...subExprs);
        default:
          throw new Error(`Unsupported logical operator: ${expr.operator}`);
      }
    }

    case 'unary': {
      if (expr.operator === 'not') {
        const [operand] = expr.operands;
        return q.not(this.toConvexExpression(q, operand));
      }
      throw new Error(`Unsupported unary operator: ${expr.operator}`);
    }

    default:
      // Exhaustiveness check
      const _exhaustive: never = expr;
      throw new Error(`Unknown expression type: ${(_exhaustive as any).type}`);
  }
}
```

**Edge Cases**:
- **Empty filter**: `where: undefined` → No `.filter()` call
- **Null values in filter**: `eq(field, null)` → Should work (Convex supports null equality)
- **Undefined in filter array**: Should be filtered out before compilation (done in Phase 2 `and`/`or`)
- **Unsupported operator**: Throw clear error with operator name

**Anti-Patterns to Avoid**:
- ❌ In-memory offset with `.slice()` - major performance bug
- ❌ Not validating FieldReference type - allows invalid expressions to pass through
- ❌ Silent failures on unsupported operators - throw descriptive errors
- ❌ Applying filters after pagination - defeats purpose of limiting result set

**Integration with M3**:
- **Preserve existing relation loading** from M3's `GelRelationalQuery`
- **Preserve column selection** logic
- **Add filter compilation** as new step between query building and execution
- **Don't break existing tests** - M3's 7 tests must still pass

**References**:
- Convex pagination API: https://docs.convex.dev/database/reading-data#pagination
- Convex filter expressions: https://docs.convex.dev/database/reading-data#filtering
- Convex-ents filter delegation: `/tmp/cc-repos/convex-ents/src/functions.ts:394-411`

---

#### Phase 5: Advanced String Operators

**Deliverables**:
- [x] `like(field, pattern)` - SQL-style pattern matching (%, \_)
- [x] `ilike(field, pattern)` - case-insensitive like
- [x] `startsWith(field, prefix)` - prefix matching
- [x] `endsWith(field, suffix)` - suffix matching
- [x] `contains(field, substring)` - substring matching

**Files**:
```
packages/kitcn/src/orm/
  filter-operators.ts       # Add string operators
  query-compiler.ts         # Add string operator compilation
```

**Example**:
```typescript
// filter-operators.ts
export const like: BinaryOperator = <TField extends FieldReference<string>>(
  left: TField,
  pattern: string,
): FilterExpression<boolean> => {
  return new FilterExpression('binary', 'like', [left, pattern]);
};

export const startsWith: BinaryOperator = <TField extends FieldReference<string>>(
  left: TField,
  prefix: string,
): FilterExpression<boolean> => {
  return new FilterExpression('binary', 'startsWith', [left, prefix]);
};

// query-compiler.ts - String operator compilation
private toConvexExpression(q: FilterBuilder, expr: FilterExpression): any {
  // ... existing operators

  case 'like': {
    const [left, pattern] = expr.operands;
    // Convert SQL LIKE pattern to regex
    const regex = pattern.replace(/%/g, '.*').replace(/_/g, '.');
    return new RegExp(`^${regex}$`).test(q.field(left.fieldName));
  }

  case 'startsWith': {
    const [left, prefix] = expr.operands;
    const field = q.field(left.fieldName);
    return q.gte(field, prefix) && q.lt(field, prefix + '\uffff');
  }

  case 'contains': {
    const [left, substring] = expr.operands;
    // Use JavaScript includes() since Convex doesn't have native contains
    return q.field(left.fieldName).includes(substring);
  }
}
```

**Usage Example**:
```typescript
where: (user, { like, startsWith }) =>
  and(
    like(user.email, '%@example.com'),
    startsWith(user.name, 'A')
  )
```

**Success Criteria**:
- String operators work with string fields only (compile-time type error for non-strings)
- `like` patterns correctly match with % and \_ wildcards
- `startsWith` uses index range when available
- `contains` falls back to client-side filter

### Research Insights

**SIMPLIFICATION RECOMMENDATION**: **Defer string operators to M4.5** (Query Builder - Ordering & Advanced Queries).

**Rationale**:
1. String operators are **advanced features** not critical for MVP filtering
2. Convex doesn't have native `LIKE` or `contains` - requires JavaScript fallback
3. Implementing regex-based filtering adds complexity without proving core architecture
4. Focus M4 on **validating filter compilation pipeline** with simple operators first
5. M4.5 will add `orderBy` + string operators + other advanced query features

**If implementing in M4**, follow these practices:

**Best Practices**:
- **Type-constrain to string fields only** using conditional types:
  ```typescript
  type StringOperator = <TField extends FieldReference<string>>(
    left: TField,
    right: string
  ) => FilterExpression<boolean>;
  ```
- **Use index ranges for `startsWith`** when field is indexed:
  ```typescript
  // Convex index range trick
  .withIndex('name', q => q
    .gte('name', prefix)
    .lt('name', prefix + '\uffff')
  )
  ```
- **Document regex pattern conversion** for `like`:
  - `%` → `.*` (any characters)
  - `_` → `.` (single character)
  - Escape special regex chars: `.*+?^${}()|[]\\`

**Performance Considerations**:
- **`startsWith` with index**: Fast (O(log n) index seek)
- **`like` with regex**: Slow (O(n) table scan + JavaScript regex matching)
- **`contains`**: Very slow (O(n) table scan + JavaScript `includes()`)
- **Recommendation**: Defer all string operators to M4.5 to keep M4 focused on core filtering

**Edge Cases**:
- **Empty pattern**: `like(field, '')` → Match all?
- **Special characters**: `like(field, '100%')` → Must escape `%` as literal
- **Case sensitivity**: `like` is case-sensitive, `ilike` case-insensitive (requires `.toLowerCase()`)
- **Unicode**: `startsWith` range trick works with Unicode, but '\uffff' might not cover all code points

**Anti-Patterns to Avoid**:
- ❌ Using regex without anchors - `like('%test')` should be `/^.*test$/`, not `/.*test/`
- ❌ Not escaping user input - `like(field, userInput)` is regex injection vulnerability
- ❌ Implementing `contains` with naive `.includes()` - doesn't work in Convex filter expressions
- ❌ Type allowing string operators on non-string fields - creates runtime errors

**References**:
- Convex string filtering: https://docs.convex.dev/database/reading-data#filtering
- Drizzle string operators: https://orm.drizzle.team/docs/operators#like

---

#### Phase 6: Array and Null Operators

**Deliverables**:
- [x] `inArray(field, values)` - field IN (value1, value2, ...)
- [x] `notInArray(field, values)` - field NOT IN (...)
- [x] `isNull(field)` - field IS NULL
- [x] `isNotNull(field)` - field IS NOT NULL

**Files**:
```
packages/kitcn/src/orm/
  filter-operators.ts       # Add array and null operators
  query-compiler.ts         # Add compilation logic
```

**Example**:
```typescript
// filter-operators.ts
export function inArray<TField extends FieldReference>(
  field: TField,
  values: InferFieldType<TField>[],
): FilterExpression<boolean> {
  return new FilterExpression('binary', 'in', [field, values]);
}

export function isNull<TField extends FieldReference>(
  field: TField,
): FilterExpression<boolean> {
  return new FilterExpression('unary', 'isNull', [field]);
}

// query-compiler.ts
case 'in': {
  const [left, values] = expr.operands;
  const field = q.field(left.fieldName);

  // Generate OR chain: field === v1 || field === v2 || ...
  const conditions = values.map((v: any) => q.eq(field, v));
  return q.or(...conditions);
}

case 'isNull': {
  const [left] = expr.operands;
  return q.eq(q.field(left.fieldName), null);
}
```

**Usage Example**:
```typescript
where: (user, { inArray, isNotNull, and }) =>
  and(
    inArray(user.role, ['admin', 'moderator']),
    isNotNull(user.email)
  )
```

**Success Criteria**:
- `inArray` accepts array of values matching field type
- `notInArray` correctly negates IN condition
- `isNull`/`isNotNull` work with optional fields
- Operators compile to efficient Convex expressions

### Research Insights

**CRITICAL DATA INTEGRITY ISSUE - Null Operator Validation**:

Null operators (`isNull`, `isNotNull`) **must validate** that the field is actually optional in the schema:

```typescript
// BAD: No validation
export function isNull<TField extends FieldReference>(
  field: TField
): FilterExpression<boolean> {
  return new FilterExpression('unary', 'isNull', [field]); // BUG: Allows on non-nullable fields!
}

// GOOD: Type-level validation
export function isNull<TField extends FieldReference<T | null | undefined>>(
  field: TField
): FilterExpression<boolean> {
  // Compile-time error if field type doesn't include null/undefined
  return new FilterExpression('unary', 'isNull', [field]);
}
```

**Best Practices**:
- **Validate array is non-empty** in `inArray`:
  ```typescript
  export function inArray<TField extends FieldReference>(
    field: TField,
    values: InferFieldType<TField>[]
  ): FilterExpression<boolean> {
    if (values.length === 0) {
      throw new Error('inArray requires at least one value');
    }
    return new FilterExpression('binary', 'in', [field, values]);
  }
  ```
- **De-duplicate values** in `inArray` for performance:
  ```typescript
  const unique = [...new Set(values)]; // Removes duplicates
  ```
- **Type-check array elements** match field type (TypeScript should enforce)
- **`notInArray` is just `not(inArray())`** - don't duplicate logic:
  ```typescript
  export function notInArray<T>(field: FieldReference<T>, values: T[]): FilterExpression {
    return not(inArray(field, values));
  }
  ```

**Performance Considerations**:
- **`inArray` compiles to OR chain**: `inArray(field, [1,2,3])` → `q.or(q.eq(field,1), q.eq(field,2), q.eq(field,3))`
- **Large arrays are slow**: > 100 values creates deep OR nesting - consider alternative approach
- **Optimization**: If field is indexed and `inArray` is only filter, run separate indexed queries and merge:
  ```typescript
  // Instead of: OR chain in filter
  // Do: Multiple indexed queries
  const results = await Promise.all(
    values.map(v => db.query(table).withIndex('field', q => q.eq('field', v)).collect())
  );
  return results.flat();
  ```

**Implementation Details**:
```typescript
// Null operator compilation to Convex
case 'isNull': {
  const [field] = expr.operands;
  if (!(field instanceof FieldReference)) {
    throw new Error('isNull requires FieldReference');
  }
  // Convex: null and undefined are equivalent
  const f = q.field(field.fieldName);
  return q.or(q.eq(f, null), q.eq(f, undefined));
}

case 'isNotNull': {
  const [field] = expr.operands;
  if (!(field instanceof FieldReference)) {
    throw new Error('isNotNull requires FieldReference');
  }
  const f = q.field(field.fieldName);
  return q.and(q.neq(f, null), q.neq(f, undefined));
}

case 'in': {
  const [field, values] = expr.operands;
  if (!(field instanceof FieldReference)) {
    throw new Error('inArray requires FieldReference');
  }
  if (!Array.isArray(values)) {
    throw new Error('inArray requires array of values');
  }
  if (values.length === 0) {
    // Empty array: always false
    return q.eq(q.field('_id'), null); // Hack: always false
  }

  const f = q.field(field.fieldName);
  const conditions = values.map(v => q.eq(f, v));
  return q.or(...conditions);
}
```

**Edge Cases**:
- **Empty array**: `inArray(field, [])` → Should this throw error or return "always false"?
- **Null in array**: `inArray(field, [1, null, 3])` → Mixed types, should validate
- **`isNull` on non-nullable field**: Type error at compile time (not runtime)
- **Convex null vs undefined**: Convex treats them as equivalent - `isNull` checks both

**Anti-Patterns to Avoid**:
- ❌ Allowing `inArray(field, [])` - creates confusing queries
- ❌ Not de-duplicating array values - wastes OR chain slots
- ❌ Using `notInArray` with large arrays - very slow (deep NOT(OR(...)))
- ❌ Allowing null operators on non-nullable fields - creates impossible queries

**References**:
- Convex null handling: https://docs.convex.dev/database/types#null-and-undefined
- Drizzle array operators: https://orm.drizzle.team/docs/operators#in

---

#### Phase 7: Integration & Testing

**Deliverables**:
- [x] Update `GelRelationalQuery.execute()` to use WhereClauseCompiler
- [x] Update type exports in `index.ts`
- [x] Comprehensive test suite (50+ test cases)
- [x] Type inference tests
- [x] Edge case handling (empty filters, undefined values, etc.)

**Files**:
```
convex/
  where-filtering.test.ts   # Core filtering tests
  where-types.test.ts       # Type inference tests
  where-operators.test.ts   # Operator-specific tests
  index-selection.test.ts   # Index selection logic tests
```

**Test Cases**:

```typescript
// where-filtering.test.ts
describe('M4 Where Filtering', () => {
  describe('Basic Operators', () => {
    it('should filter with eq operator', async () => {
      const users = await db.query.users.findMany({
        where: (user, { eq }) => eq(user.role, 'admin')
      });
      expect(users.every(u => u.role === 'admin')).toBe(true);
    });

    it('should filter with gt operator', async () => {
      const users = await db.query.users.findMany({
        where: (user, { gt }) => gt(user.age, 18)
      });
      expect(users.every(u => u.age > 18)).toBe(true);
    });
  });

  describe('Logical Operators', () => {
    it('should combine filters with and', async () => {
      const users = await db.query.users.findMany({
        where: (user, { eq, gt, and }) => and(
          eq(user.role, 'admin'),
          gt(user.credits, 100)
        )
      });
      expect(users.every(u => u.role === 'admin' && u.credits > 100)).toBe(true);
    });

    it('should combine filters with or', async () => {
      const users = await db.query.users.findMany({
        where: (user, { eq, or }) => or(
          eq(user.role, 'admin'),
          eq(user.role, 'moderator')
        )
      });
      expect(users.every(u => ['admin', 'moderator'].includes(u.role))).toBe(true);
    });
  });

  describe('Index Selection', () => {
    it('should use index for eq filter on indexed field', async () => {
      // Setup: users table has index on 'role'
      const users = await db.query.users.findMany({
        where: (user, { eq }) => eq(user.role, 'admin')
      });

      // Verify index was used (via query plan inspection)
      expect(users).toBeDefined();
    });

    it('should select best index for compound filter', async () => {
      // Setup: users table has indexes: ['role'], ['credits', 'role']
      const users = await db.query.users.findMany({
        where: (user, { eq, gt, and }) => and(
          eq(user.role, 'admin'),
          gt(user.credits, 100)
        )
      });

      // Should select ['credits', 'role'] index (score 100 vs 75)
      expect(users).toBeDefined();
    });
  });

  describe('String Operators', () => {
    it('should filter with like pattern', async () => {
      const users = await db.query.users.findMany({
        where: (user, { like }) => like(user.email, '%@example.com')
      });
      expect(users.every(u => u.email.endsWith('@example.com'))).toBe(true);
    });

    it('should filter with startsWith', async () => {
      const users = await db.query.users.findMany({
        where: (user, { startsWith }) => startsWith(user.name, 'A')
      });
      expect(users.every(u => u.name.startsWith('A'))).toBe(true);
    });
  });

  describe('Array Operators', () => {
    it('should filter with inArray', async () => {
      const users = await db.query.users.findMany({
        where: (user, { inArray }) => inArray(user.role, ['admin', 'moderator'])
      });
      expect(users.every(u => ['admin', 'moderator'].includes(u.role))).toBe(true);
    });
  });

  describe('Null Operators', () => {
    it('should filter with isNull', async () => {
      const users = await db.query.users.findMany({
        where: (user, { isNull }) => isNull(user.deletedAt)
      });
      expect(users.every(u => u.deletedAt === undefined)).toBe(true);
    });
  });
});

// where-types.test.ts
describe('M4 Type Inference', () => {
  it('should enforce number type for numeric operators', () => {
    const users = convexTable('users', {
      age: v.number(),
      name: v.string(),
    });

    // ✅ Valid: gt accepts number
    const valid = {} as ReturnType<typeof users>['where'];
    valid((u, { gt }) => gt(u.age, 25));

    // ❌ Invalid: gt rejects string
    // @ts-expect-error - Type 'string' is not assignable to type 'number'
    valid((u, { gt }) => gt(u.age, "25"));
  });

  it('should enforce string type for string operators', () => {
    const users = convexTable('users', {
      name: v.string(),
      age: v.number(),
    });

    const valid = {} as ReturnType<typeof users>['where'];

    // ✅ Valid: startsWith accepts string
    valid((u, { startsWith }) => startsWith(u.name, "A"));

    // ❌ Invalid: startsWith on number field
    // @ts-expect-error - Property 'startsWith' does not exist on number
    valid((u, { startsWith }) => startsWith(u.age, "2"));
  });
});
```

**Success Criteria**:
- All operator tests pass
- Type inference tests compile correctly
- Edge cases handled (undefined filters, empty arrays, etc.)
- No regression in M1-M3 tests (140+ total tests passing)

### Research Insights

**Test-Driven Development Approach**:

1. **Write tests FIRST** for each operator before implementation
2. **Follow Red-Green-Refactor**:
   - Red: Write failing test
   - Green: Implement minimum code to pass
   - Refactor: Clean up implementation
3. **Test compilation, not just execution**: Verify types prevent invalid queries

**Best Practices**:
- **Test type inference explicitly** using TypeScript's `@ts-expect-error`:
  ```typescript
  it('should reject string value for numeric field', () => {
    // @ts-expect-error - Type 'string' is not assignable to type 'number'
    db.query.users.findMany({ where: (u, {eq}) => eq(u.age, "25") });
  });
  ```
- **Test filter compilation separately from execution** using unit tests on `WhereClauseCompiler`
- **Test index selection algorithm** with mock EdgeMetadata to verify scoring
- **Snapshot test compiled queries** to detect regressions:
  ```typescript
  const compiled = compiler.compile(expression);
  expect(compiled).toMatchSnapshot();
  ```

**Test Coverage Requirements**:
- **Operator tests**: Each operator (eq, gt, and, or, etc.) - 1 test per operator = 10+ tests
- **Combination tests**: Multiple operators together - 5+ tests
- **Index selection tests**: Different index configurations - 5+ tests
- **Edge case tests**: Undefined, empty arrays, deep nesting - 10+ tests
- **Type inference tests**: Compile-time type checking - 10+ tests
- **Integration tests**: End-to-end with real database - 10+ tests
- **Total**: 50+ new tests minimum

**Performance Testing**:
```typescript
describe('Performance', () => {
  it('should compile simple filter in < 1ms', () => {
    const start = performance.now();
    compiler.compile(eq(user.age, 25));
    const duration = performance.now() - start;
    expect(duration).toBeLessThan(1);
  });

  it('should compile complex filter in < 5ms', () => {
    const start = performance.now();
    compiler.compile(
      and(
        eq(user.role, 'admin'),
        or(gt(user.age, 18), eq(user.verified, true)),
        inArray(user.status, ['active', 'pending'])
      )
    );
    const duration = performance.now() - start;
    expect(duration).toBeLessThan(5);
  });
});
```

**Edge Case Test Matrix**:

| Scenario | Expected Behavior | Test? |
|----------|------------------|-------|
| `where: undefined` | No filter applied | ✅ |
| `and()` empty | Returns `undefined` | ✅ |
| `and(undefined, undefined)` | Returns `undefined` | ✅ |
| `inArray(field, [])` | Throws error | ✅ |
| `eq(field, undefined)` | Throws or creates `isNull`? | ⚠️ Decide |
| Deeply nested (5+ levels) | Compiles without stack overflow | ✅ |
| Filter on non-existent field | Throws clear error | ✅ |
| `isNull` on non-nullable field | Type error (compile-time) | ✅ |
| Multiple filters on same field | Combines correctly | ✅ |
| Filter + relation loading | N+1 prevention works | ✅ |

**Integration with Existing Tests**:
- **Run M1, M2, M3 tests** after M4 changes - must all pass (no regressions)
- **Add M4 tests to same test file** (`convex/query-builder.test.ts`) or separate file
- **Use existing test fixtures** (users, posts tables from M3)
- **Test with Convex dev environment** - integration tests need real database

**Anti-Patterns to Avoid**:
- ❌ Only testing happy path - edge cases catch most bugs
- ❌ Not testing type inference - defeats purpose of type-safe API
- ❌ Mixing unit and integration tests - separate them for clarity
- ❌ Skipping performance benchmarks - compilation overhead can creep up

**Debugging Tools**:
```typescript
// Add debug logging to WhereClauseCompiler for development
compile(expression: FilterExpression, { debug = false } = {}) {
  if (debug) {
    console.log('Compiling expression:', JSON.stringify(expression, null, 2));
    console.log('Available indexes:', this.edgeMetadata);
    console.log('Selected index:', selectedIndex);
    console.log('Index filters:', indexFilters);
    console.log('Post filters:', postFilters);
  }
  // ... compilation logic
}
```

**References**:
- TypeScript type testing: https://github.com/Microsoft/TypeScript/issues/27024
- Jest snapshot testing: https://jestjs.io/docs/snapshot-testing
- Convex testing patterns: https://docs.convex.dev/production/testing

---

## Acceptance Criteria

### Functional Requirements

- [ ] Binary operators (`eq`, `ne`, `gt`, `gte`, `lt`, `lte`) work with type safety
- [ ] Logical operators (`and`, `or`, `not`) compose filters correctly
- [ ] String operators (`like`, `startsWith`, `endsWith`, `contains`) filter strings
- [ ] Array operators (`inArray`, `notInArray`) filter with value lists
- [ ] Null operators (`isNull`, `isNotNull`) check for null/undefined
- [ ] Index selection algorithm chooses optimal index
- [ ] Where clauses compile to efficient Convex queries
- [ ] Filters combine with relations (`with`), columns, limit, offset

### Non-Functional Requirements

- [ ] Type inference enforces filter value types match field types
- [ ] Autocomplete shows available operators based on field type
- [ ] Filter compilation is deterministic and predictable
- [ ] Error messages are clear for invalid filter configurations
- [ ] Performance matches hand-written Convex queries

### Quality Gates

- [ ] 50+ test cases covering all operators and edge cases
- [ ] All M1 + M2 + M3 + M4 tests pass (190+ tests total expected)
- [ ] TypeScript compiles with no errors
- [ ] Biome linting passes (with documented intentional warnings)
- [ ] No new console warnings or errors

## Success Metrics

**Developer Experience**:
- Developers familiar with Drizzle can write filtered queries without consulting docs
- Filter operators show correct type hints in IDE
- Index selection is transparent and automatic

**Technical**:
- Index selection uses best available index (measured via query plan analysis)
- Query compilation overhead < 5ms per query
- Type inference depth supports at least 3 levels of nested logical operators

## Dependencies & Prerequisites

**Prerequisites**:
- ✅ M1 (Schema Foundation) - `convexTable()`, column validators, type inference
- ✅ M2 (Relations Layer) - `relations()`, `extractRelationsConfig()`, `EdgeMetadata`
- ✅ M3 (Query Builder - Read Operations) - `findMany()`, `findFirst()`, `GelRelationalQuery`

**Dependencies**:
- Convex SDK 1.31+
- EdgeMetadata from M2 for index configuration
- kitcn package exports from M1/M2/M3
- FilterFunction and FilterOperators types from M3

**Blockers**:
- None - M1, M2, and M3 are complete

## Risk Analysis & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Convex filter API differences from SQL | High | Map Drizzle operators to closest Convex equivalent, document differences |
| Index selection complexity (multiple candidates) | Medium | Use scoring algorithm with clear ranking rules, allow manual index hints |
| Type inference depth limits (deeply nested and/or) | Medium | Test with deep nesting (5+ levels), use `Simplify` helper |
| String operators not native in Convex | Medium | Implement client-side for `like`/`contains`, use range queries for `startsWith` |
| Performance regression with complex filters | High | Benchmark against hand-written queries, optimize compilation path |
| Breaking changes to M3 query API | Low | Extend M3 without modifying existing behavior, maintain backward compatibility |

## Resource Requirements

**Development**:
- 1-2 developers
- Familiarity with TypeScript generics, Drizzle operator patterns, Convex query API

**Testing**:
- Comprehensive test suite (50+ new tests)
- Type-level tests with `Expect<Equal<>>` assertions
- Integration tests with mock database
- Performance benchmarks

**Infrastructure**:
- Convex dev environment for testing
- Drizzle ORM source code for reference patterns
- Convex-ents source code for Convex API mapping patterns

## Future Considerations

**Post-M4 Enhancements**:
- M5: Query Builder - Mutations (`insert`, `update`, `delete` with where clauses)
- M6: Advanced Operators (aggregations, subqueries, joins via relations)
- M7: Query Optimization (query plan analysis, index recommendations)

**Extensibility**:
- Custom operator registration for domain-specific filters
- Query hooks for logging, tracing, analytics
- Filter expression serialization for query caching
- Support for Convex's upcoming query features

## Documentation Plan

**Updates needed**:
- [ ] Add M4 section to main README with where clause examples
- [ ] Create filtering guide with operator reference
- [ ] Document index selection algorithm and manual hints
- [ ] Add migration guide from manual Convex queries to Drizzle-style filters
- [ ] Update type inference examples with filter types
- [ ] Document Convex API differences and workarounds

## References & Research

### Internal References

**M3 Query Builder** (Foundation):
- [packages/kitcn/src/orm/query-builder.ts](packages/kitcn/src/orm/query-builder.ts) - RelationalQueryBuilder class
- [packages/kitcn/src/orm/query.ts](packages/kitcn/src/orm/query.ts) - GelRelationalQuery execution
- [packages/kitcn/src/orm/query-compiler.ts](packages/kitcn/src/orm/query-compiler.ts) - FilterFunction types (M3 stub)
- [packages/kitcn/src/orm/types.ts](packages/kitcn/src/orm/types.ts) - DBQueryConfig, BuildQueryResult types

**M2 Relations** (Index Metadata):
- [packages/kitcn/src/orm/extractRelationsConfig.ts:17-40](packages/kitcn/src/orm/extractRelationsConfig.ts#L17-L40) - EdgeMetadata interface
- [packages/kitcn/src/orm/relations.ts:88-165](packages/kitcn/src/orm/relations.ts#L88-L165) - One and Many relation classes

**M1 Schema Foundation**:
- [packages/kitcn/src/orm/table.ts](packages/kitcn/src/orm/table.ts) - ConvexTable implementation
- [packages/kitcn/src/orm/symbols.ts](packages/kitcn/src/orm/symbols.ts) - Metadata symbols

**Test Suite**:
- [convex/query-builder.test.ts](convex/query-builder.test.ts) - M3 query builder tests (7 tests)
- [convex/relations.test.ts](convex/relations.test.ts) - M2 relations tests (11 tests)

**Institutional Learnings**:
- [docs/solutions/integration-issues/auto-coerce-searchparams-zod-schema.md](docs/solutions/integration-issues/auto-coerce-searchparams-zod-schema.md) - Use instanceof checks for schema introspection
- [docs/solutions/patterns/middleware-input-access-trpc-style.md](docs/solutions/patterns/middleware-input-access-trpc-style.md) - Type inference with generics pattern

### External References

**Drizzle ORM Source Code** (`/tmp/cc-repos/drizzle-orm`):
- [drizzle-orm/src/sql/expressions/conditions.ts:32-42](file:///tmp/cc-repos/drizzle-orm/drizzle-orm/src/sql/expressions/conditions.ts#L32-L42) - BinaryOperator type inference
- [drizzle-orm/src/sql/expressions/conditions.ts:62-197](file:///tmp/cc-repos/drizzle-orm/drizzle-orm/src/sql/expressions/conditions.ts#L62-L197) - Operator implementations (eq, gt, lt, etc.)
- [drizzle-orm/src/sql/expressions/conditions.ts:104-125](file:///tmp/cc-repos/drizzle-orm/drizzle-orm/src/sql/expressions/conditions.ts#L104-L125) - Logical operators (and, or)
- [drizzle-orm/src/sqlite-core/query-builders/select.ts:613-626](file:///tmp/cc-repos/drizzle-orm/drizzle-orm/src/sqlite-core/query-builders/select.ts#L613-L626) - Where clause integration
- [drizzle-orm/src/sqlite-core/dialect.ts:303-389](file:///tmp/cc-repos/drizzle-orm/drizzle-orm/src/sqlite-core/dialect.ts#L303-L389) - SQL compilation

**Convex-Ents Source Code** (`/tmp/cc-repos/convex-ents`):
- [convex-ents/src/functions.ts:394-411](file:///tmp/cc-repos/convex-ents/src/functions.ts#L394-411) - Filter method implementation
- [convex-ents/src/functions.ts:1078-1098](file:///tmp/cc-repos/convex-ents/src/functions.ts#L1078-L1098) - Index-based filtering with .withIndex()
- [convex-ents/test/convex/read.test.ts:275-282](file:///tmp/cc-repos/convex-ents/test/convex/read.test.ts#L275-L282) - Filter usage examples

**Convex Documentation**:
- Database query API: https://docs.convex.dev/database/reading-data
- Indexes and filtering: https://docs.convex.dev/database/indexes
- Filter expressions: https://docs.convex.dev/database/reading-data#filtering

**TypeScript Resources**:
- Conditional types: https://www.typescriptlang.org/docs/handbook/2/conditional-types.html
- Type inference in conditional types: https://www.typescriptlang.org/docs/handbook/2/conditional-types.html#inferring-within-conditional-types
- Recursive conditional types: https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-1.html#recursive-conditional-types

### Related Work

**M3 Milestone**:
- Plan: [docs/plans/2026-01-31-feat-milestone-3-query-builder-read-operations-plan.md](docs/plans/2026-01-31-feat-milestone-3-query-builder-read-operations-plan.md)
- Tests: [convex/query-builder.test.ts](convex/query-builder.test.ts)

**M2 Milestone**:
- Plan: [docs/plans/2026-01-31-feat-milestone-2-relations-layer-plan-deepened.md](docs/plans/2026-01-31-feat-milestone-2-relations-layer-plan-deepened.md)
- Tests: [convex/relations.test.ts](convex/relations.test.ts)

**Similar Implementations**:
- Drizzle ORM filters: https://orm.drizzle.team/docs/operators
- Convex-ents filtering: https://github.com/get-convex/convex-ents

---

## Unresolved Questions

### Resolved by Research

- **Operator priority**: ✅ **Resolved** - Start with single operator (`eq`) in Phase 1, add others incrementally. Defer string operators to M4.5.
- **Performance tuning**: ✅ **Resolved** - Target < 1ms for simple filters, < 5ms for complex. No caching needed initially.
- **Convex limitations**: ✅ **Resolved** - Use index ranges for `startsWith`, JavaScript fallback for `like`/`contains`. Document limitations.

### Still Unresolved

- **Index hint syntax**: Should we expose manual index selection for advanced users? Syntax options:
  - Option A: `findMany({ where: ..., useIndex: 'role' })`
  - Option B: `findMany({ where: (u, { eq, and, withIndex }) => withIndex('role', eq(u.role, 'admin')) })`
  - **Recommendation**: Defer to M4.5 or later - automatic selection should work for 95% of cases

- **`eq(field, undefined)` behavior**: Should this throw error or create `isNull` expression?
  - Option A: Throw error - force explicit `isNull(field)`
  - Option B: Auto-convert to `isNull(field)` for convenience
  - **Recommendation**: Option A (throw) - explicit is better than implicit

- **`inArray(field, [])` behavior**: Should empty array throw or return "always false"?
  - Option A: Throw error - likely programmer mistake
  - Option B: Return expression that's always false
  - **Recommendation**: Option A (throw) - fail fast on likely bugs

- **Error handling**: How to surface index selection failures? Query plan debugging?
  - **Recommendation**: Add debug mode with `{ debug: true }` option to log index selection, compiled queries

- **Search integration**: Should full-text search use special operators or separate API?
  - **Recommendation**: Separate API in M6 - full-text search has different semantics (ranking, stemming, etc.)

- **`orderBy` implementation**: Defer to M4.5 or include in M4?
  - **Strong Recommendation**: Defer to M4.5 - M4 should focus on proving filter compilation architecture works
