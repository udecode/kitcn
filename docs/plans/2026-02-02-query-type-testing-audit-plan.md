# Query Type Testing Audit & Gap Closure Plan

**Date**: 2026-02-02
**Type**: Testing
**Milestone Context**: Pre-M7 (Mutations) - Ensure comprehensive Query type testing before implementing mutations
**Related Brainstorm**: [docs/brainstorms/2026-01-31-drizzle-orm-brainstorm.md](../brainstorms/2026-01-31-drizzle-orm-brainstorm.md)

---

## Executive Summary

**Problem**: M1-M6 completed but type testing coverage is incomplete. M4.5 deferred 9 tests for unimplemented features. Before implementing M7 (Mutations), we need comprehensive type testing for all implemented Query features to ensure:
- Type safety for all query operations
- Drizzle parity in testing methodology
- Strong foundation for mutation tests
- No regressions when adding new features

**Solution**: Systematic audit and closure of type testing gaps, following Drizzle's testing methodology (Equal<> assertions, @ts-expect-error negatives, comprehensive coverage).

**Scope**: Type tests for M1-M6 implemented features ONLY. Deferred features (relation loading, column exclusion) remain deferred.

---

## 🔬 Enhancement Summary

**Deepened on**: 2026-02-02
**Research agents used**: 6 parallel agents (TypeScript expert, pattern analyst, simplicity reviewer, best practices researcher, framework docs researcher, learnings integration)
**Sections enhanced**: All phases + new Phase 0

### 🎯 Key Improvements Discovered

1. **Phase 0 Added** (CRITICAL): Pre-implementation cleanup
   - Fix 100+ lines of type duplication in select.ts
   - Move 5 debug files (211 lines) to debug/ subdirectory
   - Fix 6 unused @ts-expect-error directives
   - **Impact**: Clean baseline prevents tech debt at scale

2. **Institutional Learning Integration**:
   - Added phantom type brand preservation tests (Merge utility)
   - Added GetColumnData mode verification ('raw' vs 'query')
   - Added type widening prevention tests (GenericId → string)
   - **Impact**: +27 tests ensuring past type regressions don't recur

3. **Industry-Standard Validation**:
   - Equal<>/Expect<> pattern used by Drizzle, Zod, TanStack Query, tRPC, MUI
   - Plain tsc + custom utilities (zero deps) validated as best practice
   - Vitest expectTypeOf available but not required
   - **Impact**: Confidence in tooling choices

4. **Simplification Opportunities** (Optional):
   - Could reduce from 40-50 tests to 15-20 essential tests (60% reduction)
   - Phase 6 (file reorganization) flagged as premature optimization
   - 50% Drizzle parity is arbitrary target (YAGNI)
   - **Impact**: Option for faster implementation with same coverage

### 🔍 New Considerations Discovered

- **Type duplication is critical issue**: 100+ lines repeated in select.ts (blocking)
- **Debug file pollution**: 5 temporary files mixed with production (cleanup needed)
- **@ts-expect-error positioning matters**: Must be on line immediately before error
- **Index signature prevention**: Prevent `keyof Columns` widening to `string`
- **Merge utility is foundation**: All type combination must use Merge<>, not `&`
- **Mode-based type extraction**: GetColumnData('raw') vs ('query') critical for correctness

### 📊 Enhanced Metrics

| Metric | Original Plan | Enhanced Plan | Change |
|--------|--------------|---------------|--------|
| Total phases | 6 | 7 (added Phase 0) | +1 phase |
| Estimated time | 10-16 hours | 13-19 hours | +3 hours (cleanup) |
| Test count target | 100-110 | 144 | +34 tests |
| Drizzle parity | 50% | 65% | +15% |
| Type duplication | Ignored | Fixed in Phase 0 | -100+ lines |
| Debug files | Mixed | Separated | +organization |

### ⚡ Critical Path Changes

**Original**: Phase 1 → Phase 2 → ... → Phase 6 (optional)
**Enhanced**: **Phase 0 (cleanup)** → Phase 1 → Phase 2 → ... → Phase 6 (skip)

**Rationale**: Cannot scale to 140+ assertions on duplicated foundation. 3-hour cleanup prevents weeks of tech debt.

---

## Research Summary

### Drizzle Analysis
Explored `/tmp/cc-repos/drizzle-orm/type-tests/pg/` (17 test files, 200+ assertions):

**Key Patterns**:
- `Equal<X, Y>` distributive conditional type for assertions
- `Expect<T extends true>()` assertion function
- Test both utility types AND branded properties (`$inferSelect`)
- Separate files per feature (tables.ts, select.ts, insert.ts, etc.)
- Comprehensive negative tests (@ts-expect-error)
- Run with `tsc --noEmit` in CI

**Most Relevant Files**:
- `tables.ts` (39KB) - Table inference, all column types
- `select.ts` (30KB) - Query results, joins, nullability
- `insert.ts` (6.7KB) - INSERT operations, RETURNING clauses

### Current State
**Existing Coverage** (14 test files, ~50-60 assertions):
- ✅ Core utilities: Equal<>, Expect<>
- ✅ Table inference: InferModelFromColumns
- ✅ Column builders: GetColumnData for all types
- ✅ Query tests: WHERE, ORDER BY, LIMIT/OFFSET
- ✅ Some negative tests: 11 @ts-expect-error in select.ts

**Deferred** (from M4.5):
- ⏸️ Relation loading: 7 tests in db-rel.ts (Phase 4)
- ⏸️ Column exclusion: 2 tests in select.ts (M5 or later)
- ⏸️ Type widening: 1 test in debug-typeof-widening.ts

### Gap Analysis

#### Critical Gaps 🔴 (P0 - Before M7)
1. **Table inference parity**: Missing tests for `$inferSelect` / `$inferInsert` properties
2. **Column builder coverage**: No tests for method chaining, default values, all builder types
3. **Query result types**: Missing findFirst, complex combinations
4. **Negative tests**: Only 11/50+ needed (invalid columns, type mismatches, etc.)
5. **M5 features**: Incomplete orderBy tests, no string operator tests
6. **M6 features**: No tests for builder method chaining (.notNull(), .default())

#### Medium Gaps 🟡 (P1 - Before Phase 4)
1. Edge cases: circular relations, null handling, empty results
2. Complex query combinations
3. Relation type inference (deferred to Phase 4)

#### Low Gaps 🟢 (P2 - Future)
1. Test file reorganization
2. Integration test patterns
3. strictNullChecks variations

---

## Goals

### Primary Goals
1. **Comprehensive coverage** of M1-M6 implemented features
2. **Drizzle parity** in testing methodology and patterns
3. **Strong foundation** for M7 mutation tests
4. **No regressions** when adding new features

### Success Metrics
- **Test count**: 40-50 new type assertions (total ~100-110, 50% of Drizzle)
- **Coverage**: All P0 gaps closed before M7
- **Validation**: `bun typecheck` passes, `vitest run` passes
- **Quality**: Negative tests prevent common mistakes

---

## Implementation Plan

### ⚠️ Phase 0: Pre-Implementation Cleanup (BLOCKING)

**Status**: 🚨 **REQUIRED BEFORE Phase 1**
**Time Estimate**: 3 hours
**Risk Level**: HIGH (tech debt multiplies without cleanup)

**Goal**: Eliminate type duplication and debug file pollution before scaling to 140+ assertions

**Discovered By**: Pattern Recognition Specialist agent + Kieran TypeScript Reviewer

**Why This Wasn't in Original Plan**:
The original plan deferred file reorganization to "optional" Phase 6. Research revealed this is a **critical mistake** - the codebase has:
- **100+ lines** of duplicated type definitions (10x repetition of `Expected` type)
- **5 debug files** (211 lines) mixed with production tests
- **6 unused @ts-expect-error** directives creating false confidence

**Consequence of Skipping**: Adding 60 tests on this foundation = 160+ lines of duplication, unmaintainable test suite

---

#### Task 1: Extract Shared Types (2 hours)

**Problem**: select.ts repeats the same `Expected` type **10 times** (100+ lines):

```typescript
// Repeated 10 times in select.ts:
type Expected = Array<{
  _id: string;
  _creationTime: number;
  name: string;
  email: string;
  age: number | null;
  cityId: GenericId<'cities'>;
  homeCityId: GenericId<'cities'> | null;
}>;
```

**Solution**:

1. Create `convex/test-types/fixtures/types.ts`:
```typescript
import type { GenericId } from 'convex/values';

// Shared test fixture types
export type UserRow = {
  _id: string;
  _creationTime: number;
  name: string;
  email: string;
  age: number | null;
  cityId: GenericId<'cities'>;
  homeCityId: GenericId<'cities'> | null;
};

export type PostRow = {
  _id: string;
  _creationTime: number;
  title: string;
  content: string;
  authorId: GenericId<'users'> | null;
  published: boolean | null;
};

export type CityRow = {
  _id: string;
  _creationTime: number;
  name: string;
};

// Add other shared types as needed
```

2. Update `convex/test-types/select.ts`:
```typescript
import { UserRow, PostRow, CityRow } from './fixtures/types';

// Before (10 repetitions):
type Expected = Array<{...10 lines...}>;

// After (1 import):
type Expected = UserRow[];
```

**Impact**: 100+ lines → <20 lines (87% reduction)

---

#### Task 2: Move Debug Files to debug/ Subdirectory (30 min)

**Problem**: 5 temporary debug files (211 lines) mixed with production:
- `debug-const-assertion.ts`
- `debug-typeof-columns.ts`
- `debug-typeof-widening.ts`
- `ORIGINAL-ISSUE-never-type.ts`
- `VERIFY-merge-fix-works.ts`

**Solution**:

```bash
# Create debug directory
mkdir -p convex/test-types/debug/

# Move debug files
git mv convex/test-types/debug-*.ts convex/test-types/debug/
git mv convex/test-types/ORIGINAL-*.ts convex/test-types/debug/
git mv convex/test-types/VERIFY-*.ts convex/test-types/debug/

# Update any imports (if needed)
```

**Impact**: Clear separation of production vs investigation artifacts

---

#### Task 3: Fix Unused @ts-expect-error Directives (15 min)

**Problem**: 6 @ts-expect-error directives in select.ts (lines 302-372) marked as unused. They're not producing errors, creating false type safety confidence.

**Root Cause**: Directives positioned incorrectly or code actually type-checks

**Solution**:

From institutional learning (select-ts-type-inference-drizzle-patterns-20260202.md):

```typescript
// ❌ WRONG positioning:
db.query.users.findMany({
  // @ts-expect-error - Property 'invalidField' does not exist
  where: (users, { eq }) => eq(users.invalidField, 'test'),
});

// ✅ CORRECT positioning:
db.query.users.findMany({
  where: (users, { eq }) =>
    // @ts-expect-error - Property 'invalidField' does not exist
    eq(users.invalidField, 'test'),
});
```

**Action**:
1. Review each unused directive in select.ts
2. Either fix positioning or remove if code actually type-checks
3. Document pattern in comments

**Impact**: Valid negative tests that actually catch type errors

---

#### Task 4: Standardize Section Separators (15 min)

**Current**: Inconsistent separators across files
**Target**: Drizzle-style 80-char separator with centered text

```typescript
// ============================================================================
// WHERE CLAUSE TYPE TESTS
// ============================================================================
```

**Action**: Add to all production test files for easy navigation

---

#### Task 5: Create Test Documentation (15 min)

**File**: `convex/test-types/README.md`

```markdown
# Type Tests

Type-only tests for kitcn ORM, following Drizzle patterns.

## Running Tests

\`\`\`bash
bun typecheck  # Runs tsc --noEmit on all test files
\`\`\`

## File Structure

- `utils.ts` - Shared test utilities (Equal<>, Expect<>)
- `tables.ts` - Table inference tests (InferSelectModel, InferInsertModel)
- `select.ts` - Query result type tests
- `filter-operators.ts` - Operator type tests
- `get-column-data.ts` - GetColumnData utility tests
- `db-rel.ts` - Relation loading tests (deferred to Phase 4)
- `fixtures/` - Shared test data types
- `debug/` - Investigation artifacts (not production tests)

## Patterns

### Type Assertions
Use `Expect<Equal<Actual, Expected>>` pattern:
\`\`\`typescript
type Result = InferSelectModel<typeof users>;
Expect<Equal<Result, { _id: string; name: string }>>;
\`\`\`

### Negative Tests
Use `@ts-expect-error` on line immediately before error:
\`\`\`typescript
// @ts-expect-error - Property 'invalid' does not exist
eq(users.invalid, 'test')
\`\`\`

## Anti-Patterns

❌ Don't repeat type definitions - use fixtures/types.ts
❌ Don't mix debug files with production - use debug/ subdirectory
❌ Don't use incorrect @ts-expect-error positioning
\`\`\`

---

#### Phase 0 Validation Checklist

- [ ] Shared types extracted to fixtures/types.ts
- [ ] select.ts uses imported types (100+ lines removed)
- [ ] Debug files moved to debug/ subdirectory
- [ ] All 6 @ts-expect-error directives fixed or removed
- [ ] Section separators standardized across files
- [ ] README.md created with patterns documented
- [ ] `bun typecheck` passes with 0 errors
- [ ] Git status shows clean commits

**Deliverable**: Clean, maintainable baseline ready for 140+ assertions

**Next Step**: Proceed to Phase 1 (Table Inference Tests)

---

### Phase 1: Table Inference Tests (P0)

**Goal**: Comprehensive table definition and type inference tests

**New Test File**: `convex/test-types/tables.ts`

**Test Coverage** (15-20 assertions):

#### A. InferSelectModel Tests
1. InferSelectModel equivalence with `$inferSelect` property
2. InferSelectModel equivalence with `_['inferSelect']` property
3. System fields always present (_id, _creationTime)
4. NotNull vs nullable field types
5. GenericId brand preservation (no widening to string)
6. All column builder types (text, integer, boolean, bigint, id, number)

#### B. InferInsertModel Tests
7. InferInsertModel equivalence with `$inferInsert` property
8. InferInsertModel equivalence with `_['inferInsert']` property
9. No system fields in insert (_id, _creationTime excluded)
10. Required vs optional fields in insert
11. Default values not required in insert

#### C. Column Builder Tests
12. text().notNull() type inference
13. integer() nullable by default
14. boolean().default(true) type inference
15. id('table').notNull() GenericId inference
16. bigint() nullable type
17. number() vs integer() distinction

#### D. Negative Tests
18. @ts-expect-error - Invalid column access
19. @ts-expect-error - Type mismatch in column definition
20. @ts-expect-error - Duplicate column names

#### 🆕 E. Institutional Learning Tests (From Research)

**Added Based On**: docs/solutions/typescript-patterns/phantom-type-brand-preservation-20260202.md

21. **Merge utility preservation**: Verify InferSelectModel uses Merge<>, not `&`
22. **Index signature prevention**: Verify `keyof Columns` returns union type, not `string`
23. **Type widening prevention**: GenericId<'users'> doesn't widen to `string`
24. **Phantom brand survival**: Verify `_` properties exist in intermediate types

```typescript
// NEW TEST 21: Merge utility preserves phantom brands
{
  const users = convexTable('users', {
    name: text().notNull(),
  });

  type User = InferSelectModel<typeof users>;
  type NameField = User['name'];

  // Should be `string`, NOT `never` (proves Merge used, not &)
  Expect<Equal<NameField, string>>;
}

// NEW TEST 22: No index signature pollution
{
  const users = convexTable('users', {
    name: text().notNull(),
    age: integer(),
  });

  type Columns = typeof users['_']['columns'];
  type Keys = keyof Columns;

  // Should be 'name' | 'age', NOT 'string'
  Expect<Equal<Keys, 'name' | 'age'>>;

  // Verify no index signature
  type HasIndexSignature = string extends Keys ? true : false;
  Expect<Equal<HasIndexSignature, false>>;
}

// NEW TEST 23: GenericId brand preservation
{
  const users = convexTable('users', {
    cityId: id('cities').notNull(),
  });

  type User = InferSelectModel<typeof users>;
  type CityId = User['cityId'];

  // Should be GenericId<'cities'>, NOT string
  Expect<Equal<CityId, GenericId<'cities'>>>;

  // Verify brand not widened
  type IsString = string extends CityId ? true : false;
  Expect<Equal<IsString, false>>;
}

// NEW TEST 24: Phantom properties exist
{
  const users = convexTable('users', {
    name: text().notNull(),
  });

  type NameBuilder = typeof users.name;
  type HasPhantom = '_' extends keyof NameBuilder ? true : false;
  Expect<Equal<HasPhantom, true>>;
}
```

**Why Critical**: These tests ensure the type system issues documented in phantom-type-brand-preservation-20260202.md don't regress. The "never type" bug was caused by using `&` instead of `Merge<>`.

---

#### 🆕 F. Enhanced Test Utilities (From Kieran TypeScript Reviewer)

Add to `convex/test-types/utils.ts`:

```typescript
// Existing utilities
export function Expect<T extends true>() {}
export type Equal<X, Y> = ...

// NEW: Additional utilities for edge case testing
export type Not<T extends boolean> = T extends true ? false : true;
export type IsAny<T> = 0 extends (1 & T) ? true : false;
export type IsNever<T> = [T] extends [never] ? true : false;

// Usage:
Expect<Not<Equal<string, number>>>;  // More explicit negation
Expect<Not<IsAny<InferSelectModel<typeof users>>>>;  // Catch 'any' leaks
```

**Implementation**:
```typescript
// Example structure (tables.ts)
import { convexTable, text, integer, id, InferSelectModel, InferInsertModel } from 'kitcn/orm';
import { Expect, Equal } from './utils';

// Test 1: InferSelectModel equivalence
{
  const users = convexTable('users', {
    name: text().notNull(),
    age: integer(),
  });

  type Result = InferSelectModel<typeof users>;
  type FromProperty = typeof users['$inferSelect'];
  type FromBrand = typeof users['_']['inferSelect'];

  Expect<Equal<Result, FromProperty>>;
  Expect<Equal<Result, FromBrand>>;

  Expect<Equal<Result, {
    _id: string;
    _creationTime: number;
    name: string;
    age: number | null;
  }>>;
}

// Test 2: InferInsertModel excludes system fields
{
  const users = convexTable('users', {
    name: text().notNull(),
    age: integer(),
  });

  type Result = InferInsertModel<typeof users>;

  Expect<Equal<Result, {
    name: string;
    age?: number | null;
  }>>;
}

// Test 3: Default values not required
{
  const posts = convexTable('posts', {
    title: text().notNull(),
    status: text().default('draft'),
  });

  type Insert = InferInsertModel<typeof posts>;

  Expect<Equal<Insert, {
    title: string;
    status?: string | null;
  }>>;
}

// Negative test: Invalid column access
{
  const users = convexTable('users', {
    name: text().notNull(),
  });

  // @ts-expect-error - Property 'invalidColumn' does not exist
  type Invalid = typeof users['_']['columns']['invalidColumn'];
}
```

**Validation**:
- `bun typecheck` passes
- All Equal assertions succeed
- @ts-expect-error directives work

---

### Phase 2: Query Result Type Tests (P0)

**Goal**: Comprehensive query result type tests for all query variations

**Existing File**: `convex/test-types/select.ts` (expand)

**New Test Coverage** (10-15 assertions):

#### A. findMany Result Types
1. findMany returns Array<T>
2. findMany with where clause type
3. findMany with orderBy type
4. findMany with limit/offset type
5. findMany with columns selection type
6. findMany empty result type (still Array<T>)

#### B. findFirst Result Types
7. findFirst returns T | undefined
8. findFirst with where clause
9. findFirst with orderBy
10. findFirst never returns array

#### C. Complex Combinations
11. where + orderBy + limit combined
12. columns + where combined
13. Multiple orderBy fields (array)
14. Complex where with and/or

#### D. Negative Tests
15. @ts-expect-error - findFirst with array assignment
16. @ts-expect-error - Invalid query config options
17. @ts-expect-error - Type mismatch in complex query

#### 🆕 E. GetColumnData Mode Verification (From Research)

**Added Based On**: docs/solutions/typescript-patterns/select-ts-type-inference-drizzle-patterns-20260202.md

18. **InferSelectModel uses 'query' mode**: Includes null for nullable fields
19. **BuildQueryResult uses 'query' mode**: Column selection preserves nullability
20. **FilterOperators use 'raw' mode**: eq/gt/lt don't accept null values

```typescript
// NEW TEST 18: Verify InferSelectModel uses 'query' mode
{
  const users = convexTable('users', {
    name: text().notNull(),
    age: integer(), // nullable
  });

  type User = InferSelectModel<typeof users>;

  // Age should include null (query mode)
  Expect<Equal<User['age'], number | null>>;

  // Name should NOT include null (notNull brand)
  Expect<Equal<User['name'], string>>;
}

// NEW TEST 19: BuildQueryResult column selection uses 'query' mode
{
  const result = await db.query.users.findMany({
    columns: { age: true },
  });

  type Row = typeof result[number];

  // Selected age field preserves nullability
  Expect<Equal<Row['age'], number | null>>;
}

// NEW TEST 20: FilterOperators use 'raw' mode (critical!)
{
  const users = convexTable('users', {
    age: integer(), // nullable column
  });

  // eq should accept `number`, NOT `number | null`
  db.query.users.findMany({
    where: (users, { eq }) => eq(users.age, 30), // ✓ Should work
  });

  // @ts-expect-error - eq uses 'raw' mode, doesn't accept null
  db.query.users.findMany({
    where: (users, { eq }) => eq(users.age, null), // Use isNull instead
  });
}
```

**Why Critical**: The GetColumnData utility has two modes. Using the wrong mode causes type mismatches (FilterOperators accepting null when they shouldn't). This was a root cause of 56 type errors in the select.ts learning document.

---

#### 🆕 F. @ts-expect-error Positioning Examples (From Research)

Document correct positioning pattern from institutional learning:

```typescript
// ❌ WRONG: Directive not on line immediately before error
db.query.users.findMany({
  // @ts-expect-error - Property 'invalid' does not exist
  where: (users, { eq }) => eq(users.invalid, 'test'),  // Error here
});

// ✅ CORRECT: Directive on line immediately before error
db.query.users.findMany({
  where: (users, { eq }) =>
    // @ts-expect-error - Property 'invalid' does not exist
    eq(users.invalid, 'test'),  // Error on next line
});
```

**Implementation**:
```typescript
// Example additions to select.ts

// Test: findFirst returns T | undefined
{
  const result = await db.query.users.findFirst({
    where: (users, { eq }) => eq(users.name, 'Alice'),
  });

  type Expected = {
    _id: string;
    _creationTime: number;
    name: string;
    email: string;
    age: number | null;
    cityId: GenericId<'cities'>;
    homeCityId: GenericId<'cities'> | null;
  } | undefined;

  Expect<Equal<Expected, typeof result>>;
}

// Negative: findFirst should not accept array assignment
{
  const result = await db.query.users.findFirst();

  // @ts-expect-error - Type 'User | undefined' is not assignable to type 'User[]'
  const users: Array<typeof result> = [result];
}

// Test: Multiple orderBy fields
{
  const result = await db.query.posts.findMany({
    orderBy: [desc(schema.posts.createdAt), asc(schema.posts.title)],
  });

  type Expected = Array<{
    _id: string;
    _creationTime: number;
    title: string;
    content: string;
    authorId: GenericId<'users'> | null;
    published: boolean | null;
  }>;

  Expect<Equal<Expected, typeof result>>;
}
```

---

### Phase 3: M5 & M6 Feature Tests (P0)

**Goal**: Test M5 (orderBy, string operators) and M6 (column builders) features

**Test Coverage** (10-12 assertions):

#### A. OrderBy Tests (M5)
1. Single field orderBy (asc, desc)
2. Multiple field orderBy array
3. orderBy with nullable fields
4. orderBy with system fields (_creationTime, _id)

#### B. String Operator Tests (M5)
5. like operator type safety
6. ilike operator type safety
7. startsWith operator type safety
8. endsWith operator type safety
9. contains operator type safety

#### C. Column Builder Tests (M6)
10. Method chaining: .notNull().default()
11. Default value type inference
12. Builder vs validator equivalence

#### D. Negative Tests
13. @ts-expect-error - orderBy on invalid field
14. @ts-expect-error - String operator on number field
15. @ts-expect-error - Invalid default value type

**Implementation**:
```typescript
// M5: String operators
{
  const result = await db.query.users.findMany({
    where: (users, { startsWith }) => startsWith(users.name, 'A'),
  });

  type Expected = Array<{
    _id: string;
    _creationTime: number;
    name: string;
    email: string;
    age: number | null;
    cityId: GenericId<'cities'>;
    homeCityId: GenericId<'cities'> | null;
  }>;

  Expect<Equal<Expected, typeof result>>;
}

// Negative: String operator on number field
{
  db.query.users.findMany({
    // @ts-expect-error - Argument of type 'number' field is not compatible with string operator
    where: (users, { startsWith }) => startsWith(users.age, '1'),
  });
}

// M6: Column builder method chaining
{
  const posts = convexTable('posts', {
    title: text().notNull(),
    status: text().notNull().default('draft'),
  });

  type Insert = InferInsertModel<typeof posts>;

  Expect<Equal<Insert, {
    title: string;
    status?: string; // Optional because of default
  }>>;
}
```

---

### Phase 4: Comprehensive Negative Tests (P0)

**Goal**: Prevent common mistakes with @ts-expect-error tests

**Test Coverage** (15-20 assertions):

#### A. Invalid Column Access
1. @ts-expect-error - Invalid column in where
2. @ts-expect-error - Invalid column in orderBy
3. @ts-expect-error - Invalid column in columns selection
4. @ts-expect-error - Invalid column in relation config

#### B. Type Mismatches
5. @ts-expect-error - String value for number field
6. @ts-expect-error - Number value for string field
7. @ts-expect-error - Wrong GenericId table reference
8. @ts-expect-error - Array for single value operator

#### C. Invalid Operations
9. @ts-expect-error - isNull on notNull field
10. @ts-expect-error - isNotNull on nullable field (should allow)
11. @ts-expect-error - gt/lt on boolean field
12. @ts-expect-error - String operator on number field

#### D. Invalid Query Config
13. @ts-expect-error - Unknown query option
14. @ts-expect-error - Invalid where clause return type
15. @ts-expect-error - limit with string value
16. @ts-expect-error - offset with negative number

#### E. Relation Constraints (deferred to Phase 4)
17. TODO: @ts-expect-error - where in one() relation (not yet implemented)
18. TODO: @ts-expect-error - limit in one() relation (not yet implemented)
19. TODO: @ts-expect-error - Invalid relation name in with

**Implementation**:
```typescript
// Add to select.ts negative tests section

// Invalid column in where
db.query.users.findMany({
  // @ts-expect-error - Property 'nonExistentField' does not exist
  where: (users, { eq }) => eq(users.nonExistentField, 'test'),
});

// Type mismatch in operator
db.query.users.findMany({
  // @ts-expect-error - Argument of type 'string' is not assignable to parameter of type 'number'
  where: (users, { eq }) => eq(users.age, 'not a number'),
});

// isNull on notNull field
db.query.users.findMany({
  // @ts-expect-error - Argument of type notNull column is not assignable
  where: (users, { isNull }) => isNull(users.name),
});

// String operator on non-string field
db.query.users.findMany({
  // @ts-expect-error - Argument of type 'number' field incompatible with string operator
  where: (users, { startsWith }) => startsWith(users.age, '1'),
});

// Invalid query config option
db.query.users.findMany({
  // @ts-expect-error - Object literal may only specify known properties
  unknownOption: true,
});
```

---

### Phase 5: Edge Cases & Documentation (P1)

**Goal**: Test edge cases and document methodology

**Test Coverage** (5-10 assertions):

#### A. Edge Cases
1. Empty result arrays
2. Null handling in complex queries
3. System field ordering (_id, _creationTime)
4. GenericId across multiple tables
5. Deeply nested query configs (no implementation, just type check)

#### B. Documentation
6. Update convex/test-types/README.md with:
   - Testing methodology
   - How to add new tests
   - How to run tests (`bun typecheck`)
   - How to interpret failures
7. Update M4.5 methodology in brainstorm
8. Document deferred tests for Phase 4

**Implementation**:
```typescript
// Edge case: Empty result
{
  const result = await db.query.users.findMany({
    where: (users, { eq }) => eq(users.name, 'NonExistent'),
  });

  // Should still be Array<T>, not undefined
  Expect<Equal<typeof result, Array<{...}>>>;
}

// Edge case: System field ordering
{
  const result = await db.query.users.findMany({
    orderBy: asc(schema.users._creationTime),
  });

  type Expected = Array<{
    _id: string;
    _creationTime: number;
    name: string;
    email: string;
    age: number | null;
    cityId: GenericId<'cities'>;
    homeCityId: GenericId<'cities'> | null;
  }>;

  Expect<Equal<Expected, typeof result>>;
}
```

---

### Phase 6: Test File Reorganization (P2 - Optional)

**Goal**: Drizzle-style file structure for clarity

**Current Structure**:
```
convex/test-types/
├── utils.ts
├── minimal-inferModel-test.ts
├── minimal-notNull-test.ts
├── filter-operators.ts
├── select.ts
├── db-rel.ts (deferred)
├── tables-rel.ts (fixtures)
├── get-column-data.ts
├── debug-*.ts (various)
└── ORIGINAL-ISSUE-*.ts
```

**Proposed Structure**:
```
convex/test-types/
├── utils.ts
├── tables.ts (NEW - Phase 1)
├── queries.ts (RENAME select.ts, expand in Phase 2)
├── column-builders.ts (NEW - M6 tests)
├── operators.ts (RENAME filter-operators.ts + get-column-data.ts)
├── relations.ts (RENAME db-rel.ts, deferred to Phase 4)
├── fixtures/
│   └── tables-rel.ts (MOVE - shared test fixtures)
└── debug/ (MOVE all debug-* files here)
    ├── const-assertion.ts
    ├── typeof-columns.ts
    ├── typeof-widening.ts
    └── ORIGINAL-ISSUE-never-type.ts
```

**Rationale**:
- Clearer organization by feature
- Easier to find tests
- Mirrors Drizzle structure
- Separates debug/investigation files

**Implementation**:
1. Create new files (tables.ts, column-builders.ts)
2. Move and rename existing files
3. Update imports
4. Run `bun typecheck` to verify

---

## Validation Checklist

### Code Quality
- [ ] All new tests use Expect<Equal<>> pattern
- [ ] All negative tests use @ts-expect-error
- [ ] No any types in test assertions
- [ ] Clear test descriptions in comments
- [ ] Consistent naming (Test 1, Test 2, etc.)

### Coverage
- [ ] M1 (Schema): InferSelectModel, InferInsertModel, column builders
- [ ] M2 (Relations): Relation type inference (deferred to Phase 4)
- [ ] M3 (Queries): findMany, findFirst, query result types
- [ ] M4 (Filtering): All operators tested (existing + new negatives)
- [ ] M5 (Ordering): orderBy variations, string operators
- [ ] M6 (Builders): Method chaining, default values

### Validation
- [ ] `bun typecheck` passes with 0 errors
- [ ] No unused @ts-expect-error directives
- [ ] All Equal assertions compile
- [ ] No type widening (GenericId → string, etc.)
- [ ] `vitest run` passes (147+ tests)
- [ ] No test file imports fail

### Documentation
- [ ] Update task_plan.md with completion status
- [ ] Update findings.md with final coverage
- [ ] Update progress.md with session log
- [ ] Document deferred tests in comments
- [ ] Update brainstorm M4.5 section

---

## Test Count Summary (Enhanced)

| Category | Drizzle | Original Current | Enhanced Target | Gap | Research Notes |
|----------|---------|-----------------|----------------|-----|----------------|
| **Phase 0 Cleanup** | N/A | N/A | 0 tests (refactor) | -100 lines | Remove duplication |
| Table inference | 40+ | 10 | 28 (+8 learnings) | +18 | Add Merge, brand tests |
| Query results | 60+ | 15 | 36 (+6 modes) | +21 | Add GetColumnData modes |
| Operators | 30+ | 14 | 20 | +6 | Existing coverage good |
| M5/M6 features | 20+ | 2 | 12 | +10 | String ops, builders |
| Negative tests | 50+ | 11 | 25 | +14 | Fix positioning |
| Edge cases | 20+ | 5 | 23 (+13 learnings) | +18 | Widening, signatures |
| **TOTAL** | **220+** | **57** | **144** | **+87** | **65% Drizzle parity** |

**Enhanced Notes**:
- Original target: 117 tests (50% parity)
- Enhanced target: 144 tests (65% parity)
- Additional 27 tests from institutional learnings integration
- Phase 0 removes 100+ lines of duplication (net negative LOC)
- Drizzle includes SQL-specific features we don't need (views, CTEs, joins)
- Focus on applicable features + past type regression prevention

---

## Implementation Order (Enhanced)

**CRITICAL**: Phase 0 must complete before any other phase. Cannot scale to 144 assertions on duplicated foundation.

0. **🚨 Phase 0** (Cleanup) - **BLOCKING**: 3 hours
   - Extract shared types (fixtures/types.ts)
   - Move debug files to debug/
   - Fix 6 unused @ts-expect-error directives
   - Standardize separators, create README
   - Validate with `bun typecheck`
   - **Deliverable**: Clean baseline, -100 lines duplication

1. **Phase 1** (Tables): 3-4 hours (+1 hour for learnings)
   - Create tables.ts with 28 assertions (was 15-20)
   - Test InferSelectModel, InferInsertModel, column builders
   - **NEW**: Add Merge utility tests (4 tests)
   - **NEW**: Add brand preservation tests (4 tests)
   - Validate with `bun typecheck`

2. **Phase 2** (Queries): 3-4 hours (+1 hour for modes)
   - Expand select.ts with 36 assertions (was 10-15)
   - Test findMany, findFirst, complex combinations
   - **NEW**: Add GetColumnData mode tests (6 tests)
   - **NEW**: Add @ts-expect-error positioning examples
   - Validate with `bun typecheck`

3. **Phase 3** (M5/M6): 2-3 hours
   - Add M5 orderBy and string operator tests
   - Add M6 column builder method chaining tests
   - Validate with `bun typecheck`

4. **Phase 4** (Negatives): 2-3 hours
   - Add 15-20 @ts-expect-error tests
   - Cover all gap categories
   - Fix positioning based on learnings
   - Validate with `bun typecheck`

5. **Phase 5** (Edge Cases): 2-3 hours (+1 hour for learnings)
   - Add 23 edge case tests (was 5-10)
   - **NEW**: Add type widening prevention (5 tests)
   - **NEW**: Add index signature tests (5 tests)
   - **NEW**: Add recursive type tests (3 tests)
   - Document deferred tests
   - Update brainstorm

6. **Phase 6** (Reorganization - OPTIONAL): ~~1-2 hours~~ **SKIP**
   - **Research Recommendation**: Skip this phase
   - File reorganization flagged as premature optimization
   - Phase 0 handles critical cleanup
   - Defer to future if navigation problems occur
   - Document methodology
   - Update brainstorm

6. **Phase 6** (Reorganization - Optional): 1-2 hours
   - Reorganize file structure
   - Update imports
   - Validate with `bun typecheck`

**Total Estimated Time**: 10-16 hours

---

## Success Criteria

### Must-Have (Before M7)
- [ ] All P0 gaps closed (40-50 new assertions)
- [ ] `bun typecheck` passes with 0 errors
- [ ] Total ~100-110 type assertions (50% Drizzle parity)
- [ ] Comprehensive negative tests (20+ @ts-expect-error)
- [ ] M1-M6 features fully tested

### Nice-to-Have
- [ ] Test file reorganization complete
- [ ] Edge case coverage complete
- [ ] Documentation updated
- [ ] 60% Drizzle parity (140+ assertions)

---

## Deferred Features

**These features are NOT in scope for this plan** (deferred to future milestones):

### Phase 4 (Relation Loading)
- ⏸️ 7 relation loading tests in db-rel.ts
- ⏸️ Relation type inference with `with` option
- ⏸️ Nested relation type tests

**Reason**: Runtime not implemented, types stubbed

### M5+ (Column Exclusion)
- ⏸️ 2 column exclusion tests in select.ts
- ⏸️ `columns: { age: false }` pattern

**Reason**: Only `include === true` implemented, exclusion deferred

### Future (Type Widening)
- ⏸️ 1 test in debug-typeof-widening.ts
- ⏸️ GenericId widening to string prevention

**Reason**: Low priority, current behavior acceptable

---

## Risks & Mitigation

### Risk 1: Test Failures During Implementation
**Mitigation**: Incremental approach - validate after each phase with `bun typecheck`

### Risk 2: Type System Changes Break Tests
**Mitigation**: Keep existing tests passing, add new tests incrementally

### Risk 3: Time Overrun
**Mitigation**: Prioritize P0 tests, defer P1/P2 if needed

### Risk 4: Drizzle Parity Too Ambitious
**Mitigation**: Target is 50% (not 100%), focus on applicable features

---

## Unresolved Questions

1. Should we reorganize test files now or defer to P2?
   - **Recommendation**: Defer to P2, focus on test coverage first

2. Should we add vitest expectTypeOf patterns?
   - **Recommendation**: No, keep current Expect<Equal<>> approach

3. How to handle tests for deferred features?
   - **Recommendation**: Keep commented with TODO markers, clear phase labels

4. What's the right balance between type tests and runtime tests?
   - **Recommendation**: Type tests validate inference, runtime tests validate behavior. Both needed.

5. Should we test Convex-specific features not in Drizzle (system fields, GenericId)?
   - **Recommendation**: YES, add Convex-specific test sections

---

## Next Steps

1. Review this plan with team/user
2. Get approval for scope and priorities
3. Start Phase 1 (Tables) implementation
4. Validate with `bun typecheck` after each phase
5. Update progress.md with session logs
6. Update task_plan.md with completion status
7. Create final summary in findings.md

---

## References

- Brainstorm: [docs/brainstorms/2026-01-31-drizzle-orm-brainstorm.md](../brainstorms/2026-01-31-drizzle-orm-brainstorm.md)
- TypeScript Patterns: [docs/brainstorms/2026-01-31-typescript-patterns-from-drizzle-and-ents.md](../brainstorms/2026-01-31-typescript-patterns-from-drizzle-and-ents.md)
- Drizzle ORM: https://github.com/drizzle-team/drizzle-orm
- Convex Ents: https://github.com/get-convex/convex-ents
- Explore Agent: ad1a587
- Task Plan: [task_plan.md](../../task_plan.md)
- Findings: [findings.md](../../findings.md)
- Progress Log: [progress.md](../../progress.md)
