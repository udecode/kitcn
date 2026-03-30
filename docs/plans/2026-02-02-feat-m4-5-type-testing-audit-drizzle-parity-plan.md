---
title: "feat: M4.5 Type Testing Audit - Drizzle Parity Validation"
type: feat
date: 2026-02-02
milestone: M4.5
status: planning
---

# M4.5 Type Testing Audit - Drizzle Parity Validation

## Overview

Comprehensive type testing audit for M1-M4 features to validate type inference correctness and ensure parity with Drizzle ORM's TypeScript patterns. M1-M4 were implemented without rigorous type testing methodology - this milestone systematically validates all type utilities before proceeding to M5.

**Current State**:
- 19 type errors in `convex/test-types/`
- 103 runtime tests passing
- 99 type assertions (Expect/Equal pattern)
- Known gaps in column selection, nested relations, negative tests

**Goal**: Achieve Drizzle-level type system maturity with comprehensive test coverage matching Drizzle's testing approach.

## Problem Statement

M1-M4 implementation focused on functional correctness but lacked systematic type testing. Current type errors and gaps indicate type inference issues that could surface as runtime bugs or poor DX.

**Evidence**:
- 6 unused `@ts-expect-error` directives in [select.ts](../../convex/test-types/select.ts) - type system not enforcing constraints
- Column exclusion (`columns: { age: false }`) not implemented
- Nested where clauses in one() relations not properly typed
- Type narrowing after `isNotNull()` not validated

**Impact**:
- Users may encounter unexpected type errors
- Invalid code may compile without errors
- Type inference may not match Drizzle ergonomics
- Future features (M5-M7) built on unstable type foundation

## Proposed Solution

Implement 5-step testing methodology from [brainstorm M4.5](../brainstorms/2026-01-31-drizzle-orm-brainstorm.md#milestone-45-type-testing-audit):

1. **Clone and Study Drizzle-ORM** - Use dig skill to clone drizzle-orm, study pg-core types and tests
2. **Map Test Structure** - Compare Drizzle's test organization with Better-Convex
3. **Create Comprehensive Coverage** - Type inference, runtime, negative, edge case tests for all M1-M4 features
4. **Fix Gaps** - Identify differences from Drizzle, adapt patterns, verify fixes
5. **Validation** - 8-point checklist before completion

## Technical Approach

### Phase 1: Drizzle-ORM Deep Dive

**Objective**: Clone drizzle-orm and systematically study PostgreSQL adapter patterns.

**Tasks**:

- [ ] Clone drizzle-orm to `/tmp/cc-repos/` using dig skill
  ```bash
  # Check if already cloned
  ls /tmp/cc-repos/drizzle-orm 2>/dev/null

  # If not, clone
  mkdir -p /tmp/cc-repos
  git clone https://github.com/drizzle-team/drizzle-orm.git /tmp/cc-repos/drizzle-orm
  ```

- [ ] Study type inference patterns in `drizzle-orm/src/pg-core/`
  - `columns/common.ts` - GetColumnData implementation
  - `query-builders/select.types.ts` - Query result type inference
  - `relations.ts` - Relation type utilities
  - `table.ts` - InferSelectModel, InferInsertModel patterns

- [ ] Study test organization in `drizzle-orm/tests/pg/`
  - Test file structure and naming conventions
  - Equal<> assertion usage patterns
  - @ts-expect-error positioning and error message patterns
  - Edge case coverage approach

- [ ] Document Drizzle patterns not yet adopted
  - List TypeScript tricks we're missing
  - Identify type utilities we haven't implemented
  - Note test coverage gaps compared to Drizzle

**Deliverable**: Research document summarizing Drizzle patterns to adopt.

### Phase 2: Test Structure Mapping

**Objective**: Align Better-Convex test organization with Drizzle's proven structure.

**Current Structure**:
```
convex/
  test-types/          # Type-level tests (14 files, 1,480 lines)
  orm/                 # Runtime tests (4 test files)
  *.test.ts            # Legacy convex-ents tests (103 passing)
```

**Drizzle Structure** (to mirror):
```
tests/pg/
  *.test.ts            # Combined type + runtime tests
  select.test.ts       # Query builder types
  where.test.ts        # Filter expression types
  insert.test.ts       # Mutation types
```

**Tasks**:

- [ ] Map Drizzle test files to Better-Convex equivalents
  - `tests/pg/select.test.ts` → `convex/test-types/select.ts`
  - `tests/pg/where.test.ts` → `convex/test-types/filter-operators.ts`
  - `tests/pg/insert.test.ts` → (M6 future)

- [ ] Identify coverage gaps by comparing file counts and line counts
  - Drizzle: ~80 type test files
  - Better-Convex: 14 type test files
  - Gap analysis: Which areas under-tested?

- [ ] Create test matrix for M1-M4 features
  ```markdown
  | Feature | Type Tests | Runtime Tests | Negative Tests | Edge Cases |
  |---------|-----------|---------------|----------------|------------|
  | M1 Schema | ✅ 3 files | ✅ 2 files | ⚠️ Limited | ✅ Good |
  | M2 Relations | ⚠️ Gaps | ✅ 6 tests | ❌ Missing | ⚠️ Limited |
  | M3 Query Builder | ⚠️ Gaps | ✅ 7 tests | ⚠️ Limited | ❌ Missing |
  | M4 Where Filtering | ✅ Good | ✅ 34 tests | ⚠️ 6 unused | ⚠️ Limited |
  ```

**Deliverable**: Test coverage matrix documenting current state vs Drizzle parity.

### Phase 3: Expand Type Test Coverage

**Objective**: Create comprehensive type tests for all M1-M4 features in four categories.

#### 3A. Type Inference Tests

**Scope**: Verify type utilities produce correct types.

**Tasks**:

M1 Schema:
- [ ] Test `InferSelectModel` with all column types (text, number, bigint, boolean, id)
- [ ] Test `InferInsertModel` excludes system fields (_id, _creationTime)
- [ ] Test notNull brand preservation through inference chain
- [ ] Test nullable fields produce `T | null` types
- [ ] Test GenericId brand preservation (no widening to string)

M2 Relations:
- [ ] Test `InferRelations` for one() relations
- [ ] Test `InferRelations` for many() relations
- [ ] Test bidirectional relation type inference
- [ ] Test self-referential relation types
- [ ] Test many-to-many through junction tables

M3 Query Builder:
- [ ] Test `BuildQueryResult` with column selection
- [ ] Test `BuildQueryResult` with relation loading
- [ ] Test `PickColumns` utility for selective fields
- [ ] Test nested relation result types (2-3 levels deep)
- [ ] Test empty query result types

M4 Where Filtering:
- [ ] Test `FilterOperators` use GetColumnData<TBuilder, 'raw'>
- [ ] Test all comparison operators (eq, ne, gt, gte, lt, lte)
- [ ] Test logical operators (and, or, not)
- [ ] Test array operators (inArray, notInArray)
- [ ] Test null operators (isNull, isNotNull) on nullable fields only

**File Location**: Expand existing files in `convex/test-types/`

**Pattern**:
```typescript
// Scoped test block pattern
{
  const column = text().notNull();
  type Result = GetColumnData<typeof column, 'query'>;
  type Expected = string;

  Expect<Equal<Result, Expected>>;
}
```

#### 3B. Runtime Behavior Tests

**Scope**: Verify runtime execution matches type predictions.

**Tasks**:

M1 Schema:
- [ ] Test convexTable() creates valid Convex schema
- [ ] Test system fields auto-added (_id, _creationTime)
- [ ] Test default values applied correctly

M2 Relations:
- [ ] Test extractRelationsConfig() produces correct EdgeMetadata
- [ ] Test Relations constructor evaluates config callback
- [ ] Test inverse relation detection algorithm

M3 Query Builder:
- [ ] Test findMany() returns correct data
- [ ] Test findFirst() returns single result or undefined
- [ ] Test limit/offset pagination
- [ ] Test relation loading with `with` option

M4 Where Filtering:
- [ ] Test WhereClauseCompiler produces correct Convex queries
- [ ] Test index selection algorithm chooses optimal index
- [ ] Test filter splitting (index filters vs post-filters)
- [ ] Test complex nested expressions compile correctly

**File Location**: Expand `convex/orm/*.test.ts` files

**Pattern**:
```typescript
test('feature description', async ({ ctx }) => {
  const result = await db.query.users.findMany({
    where: (users, { eq }) => eq(users.name, 'Alice'),
  });

  expect(result).toHaveLength(1);
  expect(result[0].name).toEqual('Alice');
});
```

#### 3C. Negative Type Tests

**Scope**: Verify invalid usage produces type errors.

**Tasks**:

- [ ] Fix 6 unused `@ts-expect-error` directives in [select.ts:302-363](../../convex/test-types/select.ts#L302-L363)
  - Move to line immediately before error
  - Verify each produces expected error

- [ ] Add negative tests for M1 Schema
  ```typescript
  // @ts-expect-error - Cannot use invalid validator type
  const users = convexTable('users', {
    name: 123,  // Should error: not a validator
  });
  ```

- [ ] Add negative tests for M2 Relations
  ```typescript
  // @ts-expect-error - Field does not exist on table
  const usersRelations = relations(users, ({ one }) => ({
    profile: one(profiles, { fields: ['invalidField'] }),
  }));
  ```

- [ ] Add negative tests for M3 Query Builder
  ```typescript
  // @ts-expect-error - Invalid column name
  db.query.users.findMany({
    columns: { invalidColumn: true },
  });
  ```

- [ ] Add negative tests for M4 Where Filtering
  ```typescript
  // @ts-expect-error - Type mismatch
  db.query.users.findMany({
    where: (users, { eq }) => eq(users.age, 'not a number'),
  });
  ```

**Pattern**: One `@ts-expect-error` per invalid usage, positioned on line immediately before error.

#### 3D. Edge Case Coverage

**Scope**: Test boundary conditions and unusual combinations.

**Tasks**:

- [ ] Test nullable vs notNull combinations in same table
- [ ] Test GenericId types don't widen to string
- [ ] Test union types in relations (multiple table references)
- [ ] Test optional fields in inserts vs selects
- [ ] Test empty result sets type inference
- [ ] Test circular relation detection (already tested in relations.test.ts)
- [ ] Test many-to-many self-referential edges
- [ ] Test deeply nested relations (4+ levels)

**File Location**: Create `convex/test-types/edge-cases.ts`

### Phase 4: Fix Type Errors & Gaps

**Objective**: Reduce 19 type errors to 0 by implementing missing features or documenting limitations.

**Current Type Errors** (from research):

M2 Relations (`db-rel.ts`):
- 7 Equal<> failures - Relation type inference issues
- 6 unused @ts-expect-error - Type constraints not enforced

M3 Query Builder (`select.ts`):
- 3 Equal<> failures - Column selection type inference
- 1 property access error - Nested relation types

M4 Where Filtering:
- 2 feature gaps (documented, not bugs):
  - Column exclusion with `false` not implemented
  - Nested where clauses in one() relations not supported

**Tasks**:

- [ ] Address M2 relation type inference failures
  - Compare with Drizzle's relation type utilities
  - Fix InferRelations helper type
  - Verify all 7 Equal assertions pass

- [ ] Address M3 column selection gaps
  - Implement column exclusion (`columns: { age: false }`)
  - OR document as known limitation if Convex doesn't support
  - Fix PickColumns type utility

- [ ] Fix M2 @ts-expect-error positioning
  - Move directives to correct line positions
  - Verify each produces expected error

- [ ] Document M4 feature gaps
  - Add TODO comments for unimplemented features
  - Create tracking issues for M5+ work

**Decision Rule**: If implementing a feature takes >4 hours, document as limitation for M5+ instead.

### Phase 5: Validation & Documentation

**Objective**: Complete 8-point validation checklist and document type testing patterns.

**Validation Checklist** (from brainstorm):

- [ ] All Drizzle type inference patterns mirrored
- [ ] 100% of Equal<> assertions passing
- [ ] All negative tests producing expected errors
- [ ] Runtime tests passing with convex-test
- [ ] Edge cases documented and tested
- [ ] `bun typecheck` passes with 0 errors
- [ ] `vitest run` passes all tests
- [ ] Coverage report shows >90% for type utilities

**Documentation Tasks**:

- [ ] Add type testing guide to docs/db/orm/
  - Document Equal<> pattern usage
  - Explain GetColumnData mode-based extraction
  - Show @ts-expect-error best practices

- [ ] Update api-reference.mdx with type utility documentation
  - GetColumnData modes and usage
  - InferSelectModel / InferInsertModel
  - FilterOperators type safety

- [ ] Create type testing examples for examples-registry.json
  - Basic type inference example
  - Negative test example
  - Complex nested type example

**Deliverable**: Type system ready for M5+ features with documented testing approach.

## Implementation Plan

### Step 1: Clone and Study Drizzle-ORM (Day 1)

**Time Budget**: 2-3 hours for thorough exploration

**Tasks**:
```bash
# 1.1 Check if drizzle-orm already cloned
ls /tmp/cc-repos/drizzle-orm 2>/dev/null

# 1.2 Clone if needed (use dig skill)
Skill(dig, "drizzle-orm")

# 1.3 Study key files
Read /tmp/cc-repos/drizzle-orm/drizzle-orm/src/pg-core/columns/common.ts
Read /tmp/cc-repos/drizzle-orm/drizzle-orm/src/pg-core/query-builders/select.types.ts
Read /tmp/cc-repos/drizzle-orm/drizzle-orm/src/table.ts

# 1.4 Study test patterns
Grep pattern:"Expect<Equal<" path:/tmp/cc-repos/drizzle-orm/tests/pg/ output_mode:content
Grep pattern:"@ts-expect-error" path:/tmp/cc-repos/drizzle-orm/tests/ output_mode:content -A 1
```

**Deliverable**: Research notes on Drizzle patterns to adopt (markdown file).

**Focus Areas**:
1. GetColumnData utility implementation details
2. Phantom type branding strategies
3. Mode-based type extraction patterns
4. Nullable vs notNull tracking mechanisms
5. Relation type inference utilities
6. Negative test organization

### Step 2: Map Test Structure (Day 1)

**Time Budget**: 1 hour

**Tasks**:

- [ ] Create test coverage matrix
  ```markdown
  | Milestone | Drizzle Files | Better-Convex Files | Coverage % |
  |-----------|--------------|---------------------|------------|
  | M1 Schema | ~15 files | 3 files | ~20% |
  | M2 Relations | ~10 files | 2 files | ~20% |
  | M3 Query | ~20 files | 1 file | ~5% |
  | M4 Filtering | ~15 files | 2 files | ~13% |
  ```

- [ ] Identify high-value test files to copy
  - Prioritize files testing features we've implemented
  - Skip Drizzle-specific features (prepared statements, raw SQL, etc.)

- [ ] Map testing categories to Better-Convex structure
  | Drizzle Location | Better-Convex Equivalent | Purpose |
  |------------------|-------------------------|---------|
  | `tests/pg/*.test.ts` | `convex/test-types/*.ts` | Type-level tests |
  | Runtime tests in type files | `convex/orm/*.test.ts` | Runtime behavior |
  | @ts-expect-error in tests | `select.ts:300-363` | Negative tests |

**Deliverable**: Test structure mapping document (add to plan as section).

### Step 3: Expand Type Test Coverage (Day 2-3)

**Time Budget**: 6-8 hours (largest phase)

**File Organization**:
```
convex/test-types/
  schema-inference.ts         # M1: Table, column type inference (NEW)
  relations-inference.ts      # M2: Relation types (EXPAND)
  query-result-types.ts       # M3: Query builder result types (NEW)
  filter-operators.ts         # M4: Operator types (EXISTS, expand)
  get-column-data.ts          # Core utility (EXISTS, good coverage)
  edge-cases.ts               # Cross-milestone edge cases (NEW)
  negative-tests.ts           # Consolidated @ts-expect-error (NEW)
```

#### 3A. M1 Schema Type Inference Tests

**Create**: `convex/test-types/schema-inference.ts`

**Test Cases** (minimum 30 assertions):
```typescript
// Basic column types
{ const col = text().notNull(); type T = GetColumnData<typeof col>; Expect<Equal<T, string>>; }
{ const col = integer(); type T = GetColumnData<typeof col>; Expect<Equal<T, number | null>>; }

// System fields
{ const users = convexTable('users', { name: text() }); type U = InferSelectModel<typeof users>; type HasId = '_id' extends keyof U ? true : false; Expect<Equal<HasId, true>>; }

// InferInsertModel excludes system fields
{ const users = convexTable('users', { name: text() }); type Insert = InferInsertModel<typeof users>; type HasId = '_id' extends keyof Insert ? true : false; Expect<Equal<HasId, false>>; }

// GenericId brand preservation
{ const col = id('users').notNull(); type T = GetColumnData<typeof col>; Expect<Equal<T, GenericId<'users'>>>; }

// Union types
// TODO: v.union(v.literal('a'), v.literal('b')) type inference

// Array types
// TODO: v.array(v.string()) type inference

// Object types
// TODO: v.object({ nested: v.string() }) type inference
```

**Coverage Goal**: All M1 type utilities with comprehensive assertions.

#### 3B. M2 Relations Type Inference Tests

**Expand**: `convex/test-types/relations-inference.ts` (create new file)

**Test Cases** (minimum 25 assertions):
```typescript
// one() relation types
{ const rel = relations(users, ({ one }) => ({ profile: one(profiles) })); type R = InferRelations<typeof rel>; type P = R['profile']; Expect<Equal<P, Profile | null>>; }

// many() relation types
{ const rel = relations(users, ({ many }) => ({ posts: many(posts) })); type R = InferRelations<typeof rel>; type P = R['posts']; Expect<Equal<P, Post[]>>; }

// Bidirectional inference
// Test both sides of relation infer correctly

// Self-referential
// Test users.friends: many(users) type inference

// Many-to-many
// Test through join table type inference

// Ambiguous relations (multiple to same table)
// Test cityId and homeCityId both infer correctly
```

**Current Gaps**: Fix 7 Equal<> failures in db-rel.ts

#### 3C. M3 Query Builder Result Type Tests

**Expand**: `convex/test-types/select.ts` (existing file)

**Test Cases to Add** (minimum 20 new assertions):
```typescript
// Column exclusion
{ const result = await db.query.users.findMany({ columns: { age: false } }); type R = typeof result; type HasAge = 'age' extends keyof R[number] ? true : false; Expect<Equal<HasAge, false>>; }

// Mixed inclusion/exclusion
// RESEARCH: Does Drizzle support this? If not, should be @ts-expect-error

// Deeply nested relations (3 levels)
{ const result = await db.query.users.findMany({ with: { posts: { with: { comments: { with: { author: true } } } } } }); /* Type assertions for 3-level nesting */ }

// Empty result inference
{ const result = await db.query.users.findMany({ where: () => false }); type R = typeof result; Expect<Equal<R, User[]>>; }  // Still typed as User[], not never[]

// findFirst undefined handling
{ const result = await db.query.users.findFirst(); type R = typeof result; type IsOptional = undefined extends R ? true : false; Expect<Equal<IsOptional, true>>; }
```

**Current Gaps**: Fix 3 Equal<> failures, implement column exclusion

#### 3D. M4 Where Filtering Type Safety Tests

**Expand**: `convex/test-types/filter-operators.ts` (existing file)

**Test Cases to Add** (minimum 15 new assertions):
```typescript
// Type narrowing after isNotNull()
// RESEARCH: Does Drizzle support this? If yes, implement

// Complex nested logical expressions
{ const expr = and(eq(users.name, 'Alice'), or(gt(users.age, 18), isNull(users.age))); /* Type assertions */ }

// Operator chaining type preservation
// Test that chained calls preserve types correctly

// Error messages for type mismatches
// Verify clear error messages when types don't match
```

**Current Status**: 15 tests exist, good coverage for raw mode extraction

#### 3E. Edge Cases Test Suite

**Create**: `convex/test-types/edge-cases.ts`

**Test Cases** (minimum 30 assertions):
```typescript
// Nullable + notNull in same table
{ const users = convexTable('users', { name: text().notNull(), bio: text() }); type U = InferSelectModel<typeof users>; Expect<Equal<U['name'], string>>; Expect<Equal<U['bio'], string | null>>; }

// GenericId no widening
{ const userId = id('users').notNull(); type T = GetColumnData<typeof userId>; type IsGeneric = GenericId<'users'> extends T ? true : false; Expect<Equal<IsGeneric, true>>; type IsString = string extends T ? true : false; Expect<Equal<IsString, false>>; }

// Multiple relations to same table
// Test cityId: id('cities') and homeCityId: id('cities') both work

// Optional field combinations
// Test all 4 combinations: notNull+default, notNull+no-default, nullable+default, nullable+no-default

// System table types (_scheduled_functions, _storage)
// Test system table query result types

// Relation cardinality edge cases
// Empty many(), nullable one()
```

**Deliverable**: Comprehensive edge case coverage for all M1-M4 features.

### Step 4: Fix Gaps & Ensure Drizzle Parity (Day 3-4)

**Objective**: For each test failure or gap, identify difference from Drizzle and implement fix.

**Workflow for Each Gap**:
1. **Identify difference**: What does Drizzle do that we don't?
2. **Dig into Drizzle source**: Find implementation in drizzle-orm
3. **Adapt pattern**: Apply Drizzle's approach to Better-Convex
4. **Verify fix**: Ensure test passes
5. **Document limitation**: If unfixable due to Convex constraints, add to limitations.mdx

**Priority 1: Type Error Fixes**

- [ ] Fix M2 relation type inference (7 failures)
  - Read `/tmp/cc-repos/drizzle-orm/src/pg-core/relations.ts`
  - Compare InferRelations implementation
  - Apply Drizzle's pattern

- [ ] Fix M3 column selection (3 failures)
  - Read `/tmp/cc-repos/drizzle-orm/src/pg-core/query-builders/select.types.ts`
  - Study PickColumns utility
  - Implement column exclusion OR document as limitation

- [ ] Fix @ts-expect-error positioning (6 unused)
  - Move to line immediately before error
  - Verify TypeScript reports error on that exact line

**Priority 2: Feature Gaps**

- [ ] Column exclusion implementation
  - **Option A**: Implement if simple (<2 hours)
  - **Option B**: Document as M5 feature, add @ts-expect-error for now

- [ ] Nested where in one() relations
  - **Decision**: Likely not supported by design (one() loads single record, no filtering needed)
  - Add @ts-expect-error with comment explaining limitation

- [ ] Limit in one() relations should error
  - Investigate Drizzle's approach
  - Add type constraint to prevent this

**Priority 3: TypeScript Pattern Alignment**

- [ ] Verify all phantom type brands preserved
  - Test NotNull brand through full inference chain
  - Test GenericId brand doesn't widen
  - Test custom brands (if any) preserved

- [ ] Verify Merge utility used everywhere
  - Grep for intersection operators in types.ts
  - Replace remaining `&` with Merge where combining branded types

- [ ] Verify GetColumnData modes used correctly
  - FilterOperators use 'raw' mode: ✅ verified
  - Query results use 'query' mode: verify
  - Insert types use appropriate mode: verify

**Deliverable**: 0 type errors, all test assertions passing.

### Step 5: Final Validation (Day 4)

**Objective**: Complete 8-point checklist before marking M4.5 complete.

**Validation Steps**:

```bash
# 1. Type inference patterns
bun typecheck
# Expected: 0 errors (currently 19)

# 2. Equal<> assertions
bun typecheck:types
# Expected: All type tests pass

# 3. Negative tests
# Manually verify each @ts-expect-error produces expected error
# Expected: 0 unused directives

# 4. Runtime tests
vitest run
# Expected: All tests pass (currently 103/103)

# 5. Edge cases
# Review edge-cases.ts test file
# Expected: Comprehensive coverage documented

# 6. Full typecheck
bun typecheck
# Expected: 0 errors across entire monorepo

# 7. All tests
vitest run
# Expected: 100% pass rate

# 8. Coverage report
vitest run --coverage --coverage.reporter=text
# Expected: >90% coverage for orm/ types
```

**Pass Criteria**: ALL 8 checks must pass.

**Documentation**:

- [ ] Update [brainstorm milestone M4.5](../brainstorms/2026-01-31-drizzle-orm-brainstorm.md#milestone-45-type-testing-audit) with completion status
- [ ] Add testing methodology to [llms-index.md](../../www/content/docs/orm/llms-index.md)
- [ ] Update project status in [3-project-status.mdc](../../.claude/skills/3-project-status/3-project-status.mdc)

## Acceptance Criteria

### Functional Requirements

- [ ] All M1 schema types infer correctly (InferSelectModel, InferInsertModel)
- [ ] All M2 relation types infer correctly (InferRelations, one/many)
- [ ] All M3 query result types infer correctly (BuildQueryResult with columns/with)
- [ ] All M4 filter operator types enforce type safety (no invalid comparisons compile)

### Non-Functional Requirements

- [ ] **0 type errors** in `bun typecheck`
- [ ] **100% Equal<> passing** - All type assertions succeed
- [ ] **0 unused @ts-expect-error** - All negative tests verify actual errors
- [ ] **>90% type coverage** - All type utilities have comprehensive tests

### Quality Gates

- [ ] All 8 validation checklist items pass
- [ ] Test coverage matrix shows parity with Drizzle (adjusted for Convex constraints)
- [ ] Documentation updated with type testing patterns
- [ ] Known limitations explicitly documented in limitations.mdx

## Success Metrics

**Quantitative**:
- Type errors: 19 → 0
- Type test files: 14 → 20+ (expand coverage)
- Type assertions: 99 → 200+ (comprehensive coverage)
- Negative tests: 12 → 40+ (all invalid usage tested)
- Runtime tests: 103 → 110+ (edge cases added)

**Qualitative**:
- IDE autocomplete shows correct types (no `never`, no incorrect `| null`)
- Error messages guide users to fix invalid usage
- Type inference matches Drizzle ergonomics
- Documentation provides clear type testing guide

## Dependencies & Prerequisites

**Technical**:
- drizzle-orm repository cloned to `/tmp/cc-repos/`
- dig skill available for repository exploration
- convex-test infrastructure functional
- TypeScript 5.9.3+ with strict mode

**Knowledge**:
- Understanding of Drizzle's type system patterns (from dig research)
- Familiarity with Equal<> assertion pattern
- Knowledge of phantom type branding strategies
- convex-test testing patterns

**Blockers**:
- None identified - all infrastructure exists

## Risk Analysis & Mitigation

**Risk 1: Drizzle Patterns Incompatible with Convex**
- **Likelihood**: MEDIUM
- **Impact**: HIGH - May need custom patterns instead of pure Drizzle clone
- **Mitigation**: Document as Category 2 limitations, provide Convex-native alternatives
- **Contingency**: Keep test coverage high even if patterns diverge

**Risk 2: Type System Constraints Prevent Parity**
- **Likelihood**: MEDIUM
- **Impact**: MEDIUM - Some Drizzle features may be impossible in Convex
- **Mitigation**: Early exploration of each feature gap, decide implement vs document quickly
- **Contingency**: Explicit limitations.mdx documentation with workarounds

**Risk 3: Scope Creep into M5 Features**
- **Likelihood**: HIGH - Type testing may reveal feature gaps requiring new implementation
- **Impact**: LOW - Can defer to M5 if >4 hour fixes
- **Mitigation**: 4-hour rule - document as limitation if longer, track for M5
- **Contingency**: Create M5 tracking issues, keep M4.5 scoped to testing only

**Risk 4: Test Coverage Diminishing Returns**
- **Likelihood**: MEDIUM - Could spend weeks achieving 100% Drizzle parity
- **Impact**: LOW - 80/20 rule applies
- **Mitigation**: Focus on high-value tests (core features, known bugs, common usage)
- **Contingency**: Define "good enough" threshold (90% coverage, 0 errors, key features tested)

## Test Files Structure

### File Breakdown

**Schema Layer (M1)**:
- `schema-inference.ts` (NEW) - InferSelectModel, InferInsertModel, system fields
- `minimal-inferModel-test.ts` (EXISTS) - Basic model inference
- `minimal-notNull-test.ts` (EXISTS) - NotNull brand verification
- `get-column-data.ts` (EXISTS, EXPAND) - Mode-based extraction

**Relations Layer (M2)**:
- `relations-inference.ts` (NEW) - InferRelations, one/many types
- `db-rel.ts` (EXISTS, FIX) - Fix 7 Equal failures
- `tables-rel.ts` (EXISTS) - Test fixtures

**Query Builder (M3)**:
- `query-result-types.ts` (NEW) - BuildQueryResult comprehensive tests
- `select.ts` (EXISTS, EXPAND) - Add column exclusion, nested relations

**Where Filtering (M4)**:
- `filter-operators.ts` (EXISTS, EXPAND) - Add operator chaining tests
- `where-filtering.test.ts` (EXISTS) - Runtime tests (comprehensive)

**Cross-Cutting**:
- `edge-cases.ts` (NEW) - Boundary conditions, unusual combinations
- `negative-tests.ts` (NEW) - Consolidated @ts-expect-error tests

**Utilities**:
- `utils.ts` (EXISTS) - Equal<>, Expect<> helpers

**Estimated Total**: 7 new files + 4 expanded files = **11 files**, **~2,500 lines** total (currently 1,480)

## Technical Considerations

### TypeScript Patterns from Drizzle

**1. Conditional Type Chaining**:
```typescript
// Extract type through multiple conditional steps
type GetData<T> = T extends Builder<infer Config>
  ? Config extends { notNull: true }
    ? InferType<Config>
    : InferType<Config> | null
  : never;
```

**2. Phantom Type Branding**:
```typescript
interface Column {
  _: {
    notNull: boolean;
    dataType: 'string' | 'number';
    brand: 'Column';
  };
}
```

**3. Mode-Based Extraction**:
```typescript
type GetColumnData<T, Mode> = Mode extends 'raw'
  ? BaseType<T>
  : BaseType<T> | null;
```

**4. Merge Instead of Intersection**:
```typescript
// ✅ Preserves brands
type Combined = Merge<SystemFields, UserFields>;

// ❌ Loses brands
type Combined = SystemFields & UserFields;
```

### Convex-Specific Testing Constraints

**1. No Column Selection at Runtime** (Convex always returns full document):
- Type tests can verify column selection types
- Runtime tests cannot verify partial documents
- Document this as type-only feature

**2. No SQL-Style Joins** (Convex uses edge traversal):
- Drizzle's join type tests not applicable
- Focus on `with` relation loading instead

**3. Real-Time Subscriptions** (Convex-specific):
- Type tests same for query() and useQuery()
- Runtime tests can use convex-test's reactive features

## Reference Files from Research

**Type Inference Documentation**:
- [docs/solutions/typescript-patterns/select-ts-type-inference-drizzle-patterns-20260202.md](../../docs/solutions/typescript-patterns/select-ts-type-inference-drizzle-patterns-20260202.md)
- [docs/solutions/typescript-patterns/phantom-type-brand-preservation-20260202.md](../../docs/solutions/typescript-patterns/phantom-type-brand-preservation-20260202.md)
- [docs/solutions/integration-issues/convex-table-schema-integration-20260202.md](../../docs/solutions/integration-issues/convex-table-schema-integration-20260202.md)

**Implementation Plans**:
- [docs/plans/2026-02-01-fix-orm-type-inference-drizzle-patterns-plan.md](../../docs/plans/2026-02-01-fix-orm-type-inference-drizzle-patterns-plan.md) (1,148 lines - comprehensive type inference fix)
- [docs/plans/2026-02-02-fix-relations-type-inference-plan.md](../../docs/plans/2026-02-02-fix-relations-type-inference-plan.md)

**Core ORM Files**:
- [packages/kitcn/src/orm/types.ts](../../packages/kitcn/src/orm/types.ts) - All type utilities
- [packages/kitcn/src/orm/relations.ts](../../packages/kitcn/src/orm/relations.ts) - Relations implementation
- [packages/kitcn/src/orm/query-builder.ts](../../packages/kitcn/src/orm/query-builder.ts) - Query builder

**Existing Test Files**:
- [convex/test-types/get-column-data.ts](../../convex/test-types/get-column-data.ts) - 22 tests, good coverage
- [convex/test-types/filter-operators.ts](../../convex/test-types/filter-operators.ts) - 15 tests
- [convex/test-types/select.ts](../../convex/test-types/select.ts) - Comprehensive query tests
- [convex/orm/where-filtering.test.ts](../../convex/orm/where-filtering.test.ts) - 34 runtime tests

## Open Questions

1. **Coverage Threshold**: Is 90% type coverage sufficient, or should we target 100% parity with Drizzle?
2. **Feature Implementation vs Documentation**: For gaps requiring >4 hours (column exclusion), implement now or document for M5?
3. **Test File Organization**: Keep current split (test-types/ vs orm/), or consolidate like Drizzle does?
4. **Negative Test Consolidation**: Keep @ts-expect-error in select.ts, or create dedicated negative-tests.ts file?
5. **M5 Prep**: Should M4.5 include placeholder tests for M5 features (orderBy, string operators), or pure M1-M4 focus?

## Next Steps

After plan approval:

1. **Phase 1 (Day 1)**: Clone drizzle-orm, study patterns, create research notes
2. **Phase 2 (Day 1)**: Map test structure, identify high-value tests to mirror
3. **Phase 3 (Day 2-3)**: Expand type test coverage across 4 categories (A-D)
4. **Phase 4 (Day 3-4)**: Fix all type errors and gaps, achieve Drizzle parity
5. **Phase 5 (Day 4)**: Run 8-point validation checklist, update documentation

**Estimated Duration**: 3-4 days for comprehensive audit

**Command to Start Implementation**:
```bash
/workflows:work docs/plans/2026-02-02-feat-m4-5-type-testing-audit-drizzle-parity-plan.md
```
