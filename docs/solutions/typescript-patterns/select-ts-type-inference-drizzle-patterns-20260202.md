---
module: kitcn ORM
date: 2026-02-02
problem_type: type_inference_issue
component: query_builder
symptoms:
  - "56 type errors in convex/test-types/select.ts"
  - "FilterOperators value parameters accepting wrong types"
  - "Relations tests failing with 'Cannot convert undefined or null to object'"
  - "@ts-expect-error directives unused due to incorrect positioning"
root_cause: missing_type_utility_and_constructor_bug
severity: high
tags: [typescript, drizzle-pattern, type-inference, query-builder, relations, getcolumndata]
related_docs:
  - "docs/solutions/typescript-patterns/phantom-type-brand-preservation-20260202.md"
  - "docs/solutions/integration-issues/convex-table-schema-integration-20260202.md"
  - "docs/plans/2026-02-02-fix-select-ts-type-inference-drizzle-patterns-plan.md"
---

# Select.ts Type Inference - Drizzle GetColumnData Pattern

## Problem

Query builder type inference was failing in two ways: FilterOperators accepted wrong value types, and Relations runtime tests crashed with "Cannot convert undefined or null to object".

**Error count:** 56 type errors in select.ts, 7 failing runtime tests

**Impact:** Blocked M4 completion (query builder with where filtering). Users couldn't write type-safe where clauses or use relations in queries.

## Environment
- Module: kitcn ORM
- Component: Query Builder (M3/M4 milestone)
- TypeScript: 5.x
- Date: 2026-02-02
- Plan: [docs/plans/2026-02-02-fix-select-ts-type-inference-drizzle-patterns-plan.md](../../docs/plans/2026-02-02-fix-select-ts-type-inference-drizzle-patterns-plan.md)

## Symptoms

### Type Errors
- 56 type errors in [convex/test-types/select.ts](../../convex/test-types/select.ts)
- FilterOperators accepting wrong types (e.g., `eq(users.age, 'not a number')` should error but didn't)
- Negative test `@ts-expect-error` directives marked as unused

### Runtime Errors
```
Cannot convert undefined or null to object
  at Object.entries
  at extractRelationsConfig (orm/extractRelationsConfig.ts:24)
```

**All 7 relation tests failing:**
- schema-integration.test.ts: Define schema with relations
- relations.test.ts: all 6 tests (one, many, self-referencing, circular, many-to-many, complex multi-level)

## What Didn't Work

### Attempt 1: Making FilterOperators Generic Interface
```typescript
// ❌ Tried to make the interface itself generic
export interface FilterOperators<TBuilder extends ColumnBuilder<any, any, any>> {
  eq(field: TBuilder, value: ColumnToType<TBuilder>): any;
  // ... other operators
}
```
- **Why it failed**: TypeScript error "Type 'FilterOperators' is not generic" (27 errors)
- **Learning**: FilterOperators should have generic **methods**, not be a generic interface itself

### Attempt 2: Direct ColumnToType Usage
```typescript
// ❌ Tried using ColumnToType directly for value parameters
export interface FilterOperators {
  eq<TBuilder extends ColumnBuilder<any, any, any>>(
    field: TBuilder,
    value: ColumnToType<TBuilder>  // Problem: includes | null for nullable fields
  ): any;
}
```
- **Why it failed**: Value parameters should not include `| null` union even for nullable fields (Drizzle's 'raw' mode)
- **Learning**: Need a mode-based type extraction utility like Drizzle's GetColumnData

### Attempt 3: Fixing @ts-expect-error Positioning
Initially thought errors were legitimate type system issues, but they were just positioned incorrectly:
- **Why it seemed to fail**: Directives appeared to not work
- **Actual issue**: Directives must be on line immediately before error, not before the entire statement
- **Learning**: TypeScript directive placement is strict

## Research Findings

### Drizzle ORM Pattern (the solution)

Studied Drizzle's type inference system and discovered **GetColumnData utility**:

```typescript
// From Drizzle: drizzle-orm/src/column.ts (conceptually)
type GetColumnData<
  TColumn extends ColumnBuilder,
  TInferMode extends 'query' | 'raw' = 'query'
> = TInferMode extends 'raw'
  ? ColumnToType<TColumn>  // Base type without null
  : TColumn['notNull'] extends true
  ? ColumnToType<TColumn>
  : ColumnToType<TColumn> | null;  // Add null for nullable fields
```

**Key insight:**
- **'query' mode**: Type as it appears in database results (`string | null` for nullable)
- **'raw' mode**: Base type without null (`string` even for nullable) - used for filter values
- FilterOperators should use 'raw' mode since filter values never include null

### Why Raw Mode for Filters

```typescript
// User writes:
db.query.users.findMany({
  where: (users, { eq }) => eq(users.age, null)  // ❌ WRONG - use isNull() instead
})

// Correct approach:
db.query.users.findMany({
  where: (users, { isNull }) => isNull(users.age)  // ✅ Explicit null check
})
```

Filter operators compare values, not null. Null checks have dedicated operators (isNull, isNotNull).

## Root Cause

### Issue 1: Missing GetColumnData Utility
- FilterOperators had no way to extract raw types without null union
- Type inference couldn't distinguish between query results (include null) and filter values (exclude null)
- Without mode-based extraction, nullable field filters accepted `T | null` instead of `T`

### Issue 2: Relations Constructor Never Evaluated Config
```typescript
// Before (broken):
class Relations<TTable, TConfig> {
  constructor(table: TTable, config: (helpers: RelationHelpers) => TConfig) {
    this.table = table;
    this.config = config;
    // ❌ Never evaluates config callback!
    // this[RelationsSymbol] remains undefined
  }
}

// When extractRelationsConfig tries:
Object.entries(relationsConfig)  // relationsConfig is undefined → crash
```

**Why it happened:** Constructor stored the callback but never called it with helpers to generate the actual relations object.

## Solution

### 1. Implemented GetColumnData Utility

Added mode-based type extraction to [packages/kitcn/src/orm/types.ts:75-82](../../packages/kitcn/src/orm/types.ts#L75-L82):

```typescript
/**
 * Extract column data type with mode-based inference
 *
 * @param TInferMode - 'query' includes null for nullable fields, 'raw' returns base type
 */
export type GetColumnData<
  TColumn extends ColumnBuilder<any, any, any>,
  TInferMode extends 'query' | 'raw' = 'query'
> = TInferMode extends 'raw'
  ? ColumnToType<TColumn>  // Raw mode: base type without null
  : TColumn['_']['notNull'] extends true
  ? ColumnToType<TColumn>  // Query mode + notNull: base type
  : ColumnToType<TColumn> | null;  // Query mode + nullable: add null union
```

**Why this works:**
- 'raw' mode returns base type (string, number, bigint) without null union
- 'query' mode adds null for nullable fields (matches database result type)
- Conditional type checks notNull brand to determine nullability

### 2. Updated FilterOperators Interface

Changed value parameters to use GetColumnData<TBuilder, 'raw'> in [packages/kitcn/src/orm/types.ts:195-259](../../packages/kitcn/src/orm/types.ts#L195-L259):

```typescript
// Before (broken):
export interface FilterOperators {
  eq<TBuilder extends ColumnBuilder<any, any, any>>(
    field: TBuilder,
    value: ColumnToType<TBuilder>  // Includes | null
  ): any;
}

// After (fixed):
export interface FilterOperators {
  eq<TBuilder extends ColumnBuilder<any, any, any>>(
    field: TBuilder,
    value: GetColumnData<TBuilder, 'raw'>  // Base type only
  ): any;

  // inArray also uses raw mode for array elements
  inArray<TBuilder extends ColumnBuilder<any, any, any>>(
    field: TBuilder,
    values: readonly GetColumnData<TBuilder, 'raw'>[]
  ): any;
}
```

**Applied to all operators:** eq, ne, gt, gte, lt, lte, inArray, notInArray

### 3. Fixed Relations Constructor Bug

Added config evaluation in [packages/kitcn/src/orm/relations.ts:34-45](../../packages/kitcn/src/orm/relations.ts#L34-L45):

```typescript
// Before (broken):
constructor(table: TTable, config: (helpers: RelationHelpers) => TConfig) {
  this.table = table;
  this.config = config;
  // ❌ Missing: never evaluates config callback
}

// After (fixed):
constructor(table: TTable, config: (helpers: RelationHelpers) => TConfig) {
  this.table = table;
  this.config = config;

  // ✅ Evaluate config callback and store in symbol for runtime access
  const helpers: RelationHelpers = {
    one: createOne(table),
    many: createMany(table),
  };
  this[RelationsSymbol] = config(helpers);
}
```

**Why this works:**
- Creates helpers object with one() and many() functions
- Calls config callback with helpers to generate relations object
- Stores result in RelationsSymbol for extractRelationsConfig to read
- Now Object.entries(relationsConfig) works because relationsConfig is defined

### 4. Fixed @ts-expect-error Positioning

Moved directives to line immediately before error in [convex/test-types/select.ts:302-335](../../convex/test-types/select.ts#L302-L335):

```typescript
// Before (unused):
db.query.users.findMany({
  // @ts-expect-error - Property 'invalidField' does not exist
  where: (users, { eq }) => eq(users.invalidField, 'test'),  // Error on this line
});

// After (working):
db.query.users.findMany({
  where: (users, { eq }) =>
    // @ts-expect-error - Property 'invalidField' does not exist
    eq(users.invalidField, 'test'),  // Error on next line
});
```

## Verification

### Type Tests Created

**[convex/test-types/get-column-data.ts](../../convex/test-types/get-column-data.ts)** (22 tests):
- GetColumnData 'query' mode with notNull fields → base type
- GetColumnData 'query' mode with nullable fields → base type | null
- GetColumnData 'raw' mode with notNull fields → base type
- GetColumnData 'raw' mode with nullable fields → base type (no null)
- Default mode behaves like 'query' mode

**[convex/test-types/filter-operators.ts](../../convex/test-types/filter-operators.ts)** (15 tests):
- Raw mode with all column types (text, number, boolean, bigint, id)
- Array types for inArray operator
- Verifies FilterOperators use GetColumnData<T, 'raw'>

**[convex/test-types/select.ts](../../convex/test-types/select.ts)** (comprehensive):
- Where clause operators (eq, gt, lt, inArray, isNull)
- OrderBy (asc, desc)
- Limit/offset
- Column selection
- Combined where + relations
- 12 negative tests with @ts-expect-error

### Test Results

✅ **Type errors reduced:** 56 → 20 (36 fixed)
- Remaining 20 errors are documented feature gaps (column exclusion, nested where clauses in one() relations)

✅ **All runtime tests passing:** 147/147
```bash
$ bun test
✓ convex/orm/query-builder.test.ts (3 tests)
✓ convex/orm/relations.test.ts (6 tests)
✓ convex/orm/schema-integration.test.ts (2 tests)
✓ convex/orm/where-filtering.test.ts (34 tests)
✓ convex/read.test.ts (102 tests)
147 pass, 0 fail
```

✅ **Lint passing:**
```bash
$ bun lint:fix
All files formatted successfully
```

## Why This Works

### GetColumnData Dual Mode Design

**For query results** ('query' mode - default):
```typescript
const user = await db.query.users.findFirst();
type User = typeof user;
type Age = User['age'];  // number | null (nullable field)
```

**For filter values** ('raw' mode):
```typescript
db.query.users.findMany({
  where: (users, { eq }) => eq(users.age, 30)  // 30: number (not number | null)
});
```

This separation prevents users from passing `null` to comparison operators (they must use `isNull()` explicitly).

### Relations Symbol Pattern

The Relations class uses Symbol-based storage for runtime access:
1. Constructor receives config callback
2. Creates helpers object (one, many functions)
3. Evaluates config(helpers) to get actual relations object
4. Stores in `this[RelationsSymbol]` for extractRelationsConfig
5. extractRelationsConfig reads symbol to build edge metadata

**Why symbol storage:** Keeps relations config separate from class properties, prevents naming conflicts, provides runtime access without affecting type system.

## Prevention

### For Future Type Utility Work

1. **Study Drizzle patterns first**: Use `dig` skill to clone drizzle-orm and study their type utilities
   ```bash
   # The pattern we followed:
   git clone https://github.com/drizzle-team/drizzle-orm.git /tmp/cc-repos/drizzle-orm
   # Study: drizzle-orm/src/pg-core/columns/common.ts (GetColumnData)
   ```

2. **Use mode-based type extraction**: When types need different behavior in different contexts
   - Query results: include null for nullable fields
   - Filter values: exclude null (use explicit isNull/isNotNull)
   - Insert models: exclude _id, _creationTime
   - Update models: all fields optional

3. **Initialize runtime state in constructors**: Don't just store callbacks, evaluate them
   ```typescript
   // ❌ WRONG: Store callback without evaluating
   constructor(config: () => T) {
     this.config = config;
   }

   // ✅ CORRECT: Evaluate and store result
   constructor(config: () => T) {
     this.config = config;
     this[Symbol] = config();  // Actually call it
   }
   ```

4. **Test type utilities in context**: GetColumnData worked individually but needed testing in FilterOperators context
   - Create dedicated test files for each utility
   - Test in actual usage context (where clauses, order by, etc.)
   - Write negative tests with @ts-expect-error

5. **Position @ts-expect-error correctly**: Must be on line immediately before error
   ```typescript
   // ❌ WRONG:
   // @ts-expect-error - Error message
   functionCall({
     property: invalidValue  // Error on this line
   });

   // ✅ CORRECT:
   functionCall({
     // @ts-expect-error - Error message
     property: invalidValue  // Error on next line
   });
   ```

### Code Patterns

**✅ CORRECT: GetColumnData with mode parameter**
```typescript
// For query results (default)
type UserAge = GetColumnData<typeof users.age>;  // number | null

// For filter values
type FilterAge = GetColumnData<typeof users.age, 'raw'>;  // number
```

**❌ WRONG: Using ColumnToType directly in filters**
```typescript
export interface FilterOperators {
  eq<TBuilder extends ColumnBuilder<any, any, any>>(
    field: TBuilder,
    value: ColumnToType<TBuilder>  // Includes | null for nullable fields
  ): any;
}
```

**✅ CORRECT: Evaluate callbacks in constructors**
```typescript
class Relations<TTable, TConfig> {
  constructor(table: TTable, config: (helpers: RelationHelpers) => TConfig) {
    this.table = table;
    this.config = config;

    // ✅ Create helpers and evaluate callback
    const helpers: RelationHelpers = {
      one: createOne(table),
      many: createMany(table),
    };
    this[RelationsSymbol] = config(helpers);
  }
}
```

**❌ WRONG: Storing callback without evaluation**
```typescript
class Relations<TTable, TConfig> {
  constructor(table: TTable, config: (helpers: RelationHelpers) => TConfig) {
    this.table = table;
    this.config = config;
    // ❌ Never calls config() - RelationsSymbol remains undefined
  }
}
```

## Implementation Details

### Files Modified

**Type system:**
- [packages/kitcn/src/orm/types.ts](../../packages/kitcn/src/orm/types.ts)
  - Added GetColumnData utility (lines 75-82)
  - Updated FilterOperators interface to use GetColumnData<TBuilder, 'raw'> (lines 195-259)

**Runtime:**
- [packages/kitcn/src/orm/relations.ts](../../packages/kitcn/src/orm/relations.ts)
  - Fixed Relations constructor to evaluate config callback (lines 34-45)

**Tests created:**
- [convex/test-types/get-column-data.ts](../../convex/test-types/get-column-data.ts) - 22 tests for GetColumnData utility
- [convex/test-types/filter-operators.ts](../../convex/test-types/filter-operators.ts) - 15 tests for raw mode extraction

**Tests updated:**
- [convex/test-types/select.ts](../../convex/test-types/select.ts) - Fixed @ts-expect-error positioning (9 directives)

### Build Process

After changes, rebuild required:
```bash
bun --cwd packages/kitcn build
touch convex/schema.ts  # Trigger type regen
```

## Results

### Metrics
- **Type errors fixed:** 36 of 56 (64% reduction)
- **Remaining errors:** 20 (documented feature gaps, not type system issues)
- **Runtime tests:** 147/147 passing (was 140/147)
- **New test coverage:** 37 type tests added

### Feature Gaps (Remaining 20 Errors)

Documented in [select.ts:243-363](../../convex/test-types/select.ts#L243-L363):

1. **Column exclusion with false** (not yet implemented)
   ```typescript
   columns: { age: false }  // Should exclude age field
   ```

2. **Nested where clauses in one() relations** (not supported by design)
   ```typescript
   with: {
     author: {
       where: (users, { eq }) => eq(users.name, 'Alice')  // Not allowed
     }
   }
   ```

3. **Limit in one() relations** (should error, currently allowed)
   ```typescript
   with: {
     author: {
       limit: 10  // Should be type error for one() relations
     }
   }
   ```

These are tracked for future milestones.

## Related Patterns

### Drizzle's Type Inference Strategy
- GetColumnData for mode-based extraction
- Separate types for query/insert/update models
- 'raw' mode for filter values (no null union)
- Extensive type tests in drizzle-orm/drizzle-orm/tests/pg

### Symbol-Based Runtime Storage
Pattern used by both kitcn and Drizzle:
```typescript
// Compile-time phantom types
declare readonly [Symbol]: Type;

// Runtime initialization
this[Symbol] = actualValue;
```

Keeps runtime data separate from class properties, prevents naming conflicts.

### Test-Driven Type Development
1. Create minimal test isolating issue
2. Verify test fails with current implementation
3. Implement fix following Drizzle pattern
4. Verify test passes
5. Add comprehensive test coverage

This session used this approach for GetColumnData implementation.

## References

- **Drizzle ORM source:** cloned to /tmp/cc-repos/drizzle-orm via `dig` skill
  - GetColumnData pattern: drizzle-orm/src/pg-core/columns/common.ts
  - FilterOperators: drizzle-orm/src/pg-core/query-builders/select.types.ts
  - Type tests: drizzle-orm/tests/pg/ (comprehensive coverage)
- **Related fixes:**
  - [Phantom type brand preservation](phantom-type-brand-preservation-20260202.md) - Required for notNull brand inference
  - [Schema integration](../integration-issues/convex-table-schema-integration-20260202.md) - TableDefinition compatibility
- **Plan:** [Fix select.ts type inference plan](../../docs/plans/2026-02-02-fix-select-ts-type-inference-drizzle-patterns-plan.md)

## Future Work

### M4.5 Type Testing Audit (Recommended Next)
Clone drizzle-orm and systematically compare:
- All type utilities (GetColumnData, InferModel, etc.)
- Test coverage patterns
- Edge cases we might have missed
- TypeScript tricks we haven't applied yet

Goal: Achieve parity with Drizzle's type system maturity.

### M5 Ordering & Advanced Queries
Implement remaining query builder features:
- Multi-column orderBy
- Array operators (contains, overlaps)
- Text search operators (like, ilike)
- JSON operators

Both tracked in [brainstorm milestones](../../docs/brainstorms/2026-01-31-drizzle-orm-brainstorm.md).
