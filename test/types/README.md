# Type Tests

Type-only tests for kitcn ORM, following Drizzle patterns.

## Running Tests

```bash
bun typecheck  # Runs tsc --noEmit on all test files
```

## File Structure

- `utils.ts` - Shared test utilities (Equal<>, Expect<>)
- `tables-rel.ts` - Test table fixtures with relations
- `select.ts` - Query result type tests (WHERE, ORDER BY, LIMIT, columns)
- `insert.ts` - Insert mutation type tests (values, returning, onConflict)
- `update.ts` - Update mutation type tests (set, where, returning)
- `delete.ts` - Delete mutation type tests (where, returning)
- `filter-operators.ts` - Operator type tests
- `get-column-data.ts` - GetColumnData utility tests
- `minimal-*.ts` - Minimal focused tests for specific utilities
- `db-rel.ts` - Relation loading tests (deferred to Phase 4)
- `fixtures/` - Shared test data types (UserRow, PostRow, etc.)
- `debug/` - Investigation artifacts (not production tests)

## Patterns

### Type Assertions

Use `Expect<Equal<Actual, Expected>>` pattern from Drizzle:

```typescript
import { Expect, Equal } from './utils';
import { InferSelectModel } from 'kitcn/orm';

const users = convexTable('users', {
  name: text().notNull(),
  age: integer(),
});

type User = InferSelectModel<typeof users>;

Expect<Equal<User, {
  _id: string;
  createdAt: number;
  name: string;
  age: number | null;
}>>;
```

### Negative Tests

Use `@ts-expect-error` on line immediately before error:

```typescript
// ✅ CORRECT: Directive on line immediately before error
db.query.users.findMany({
  where: (users, { eq }) =>
    // @ts-expect-error - Property 'invalid' does not exist
    eq(users.invalid, 'test'),
});

// ❌ WRONG: Directive not on line immediately before error
db.query.users.findMany({
  // @ts-expect-error - Property 'invalid' does not exist
  where: (users, { eq }) => eq(users.invalid, 'test'),
});
```

### Section Organization

Use Drizzle-style 80-char separators for major sections:

```typescript
// ============================================================================
// WHERE CLAUSE TYPE TESTS
// ============================================================================

// Test 1: eq operator
{
  const result = await db.query.users.findMany({
    where: (users, { eq }) => eq(users.name, 'Alice'),
  });

  type Expected = UserRow[];
  Expect<Equal<Expected, typeof result>>;
}
```

## Anti-Patterns

❌ **Don't repeat type definitions** - use `fixtures/types.ts`:

```typescript
// ❌ BAD: Repeated type definition
type Expected = Array<{
  _id: string;
  createdAt: number;
  name: string;
  // ... 10+ lines repeated 10 times
}>;

// ✅ GOOD: Import shared type
import { UserRow } from './fixtures/types';
type Expected = UserRow[];
```

❌ **Don't mix debug files with production** - use `debug/` subdirectory

❌ **Don't use incorrect @ts-expect-error positioning** - must be on line immediately before error

## Test Coverage

Current coverage (Phases 0-5 complete):
- ✅ Table inference: InferSelectModel, InferInsertModel (28 assertions)
- ✅ Column builders: All types with GetColumnData (included in tables)
- ✅ Query results: WHERE, ORDER BY, LIMIT/OFFSET, columns (38 assertions)
- ✅ Filter operators: eq, gt, lt, inArray, isNull, isNotNull
- ✅ M5 features: String operators, extended orderBy (9 assertions)
- ✅ M6 features: Method chaining, defaults (included in tables)
- ✅ Mutations: Insert/update/delete returning types (6 assertions)
- ✅ Negative tests: 40+ @ts-expect-error tests
- ✅ Edge cases: Empty results, null handling, GenericId preservation (5 assertions)
- ⏸️ Relation loading: Deferred to Phase 4
- ⏸️ Column exclusion: Deferred to M5+

**Progress**: 164 assertions / 144 target = **114% toward 65% Drizzle parity**

## Methodology

### Core Principles

1. **Mirror Drizzle** - Copy all applicable test patterns from `drizzle-v1`
2. **Use Equal<>/Expect<>** - Industry standard pattern (Drizzle, Zod, TanStack Query, tRPC, MUI)
3. **Test public API only** - Don't test internal implementation details
4. **Negative tests** - Use @ts-expect-error to prevent common mistakes
5. **Shared types** - Extract repeated types to fixtures/
6. **Plain tsc** - Zero dependencies, run with `bun typecheck`

### How to Calculate Progress & Parity

**Step 1: Baseline Count**
- Use local clone: `/tmp/cc-repos/drizzle-v1`
- Count their PostgreSQL type assertions: `grep -r "Expect<Equal<" /tmp/cc-repos/drizzle-v1/drizzle-orm/type-tests/pg/ | wc -l`
- Result: ~220 assertions for PostgreSQL

**Step 2: Set Target Parity**
- Not all Drizzle tests apply (SQL-specific: views, CTEs, joins, subqueries)
- Choose realistic target: **65% parity** = 144 assertions
- This covers all applicable features for a Convex ORM

**Step 3: Count Current Assertions**
```bash
# Count all Expect<Equal<> assertions in test files
grep -r "Expect<Equal<" convex/test-types/*.ts | wc -l

# Result: 164 assertions (60 baseline + 104 new)
```

**Step 4: Calculate Progress**
```
Progress = (Current / Target) × 100
         = (164 / 144) × 100
         = 113.9% ≈ 114%
```

### How to Mirror Drizzle for New Milestones

**Phase 1: Research** (2-3 hours)
1. **Explore Drizzle's type tests**: Browse `/tmp/cc-repos/drizzle-v1/drizzle-orm/type-tests/pg/`
2. **Identify relevant files**: Focus on files matching your milestone (e.g., `insert.ts` for M7 Mutations)
3. **Count test patterns**: `grep -c "Expect<Equal<" [filename]` to understand scope
4. **Read test structure**: Study how Drizzle organizes tests (sections, comments, patterns)

**Phase 2: Gap Analysis** (1-2 hours)
1. **List Drizzle's tests**: Extract all test descriptions/comments
2. **Filter applicable tests**: Remove SQL-specific features
3. **Check existing coverage**: `grep -r "[test pattern]" convex/test-types/`
4. **Identify gaps**: Create list of missing tests

**Phase 3: Implementation** (4-8 hours per milestone)
1. **Create/expand test file**: Follow naming convention (e.g., `insert.ts`, `mutations.ts`)
2. **Copy test structure**: Use Drizzle's section separators and organization
3. **Adapt for Convex**: Replace SQL concepts with Convex equivalents:
   - `db.insert()` → `db.insert()`
   - `RETURNING` → return value
   - `GenericId` instead of numeric IDs
4. **Add institutional learnings**: Include tests preventing known regressions
5. **Validate incrementally**: Run `bun typecheck` after each section

**Phase 4: Validation** (30 min)
1. Count assertions: `grep -c "Expect<Equal<" [new file]`
2. Update progress calculation
3. Run `bun typecheck` and `bun run test`
4. Update this README with new coverage

### Example: Adding M7 Mutations Tests

```bash
# 1. Research Drizzle's insert patterns
cd /tmp/cc-repos/drizzle-v1/drizzle-orm
cat type-tests/pg/insert.ts | grep "// Test" | head -20

# 2. Count scope
grep -c "Expect<Equal<" type-tests/pg/insert.ts
# Output: 45 assertions

# 3. Filter applicable (remove RETURNING, ON CONFLICT, etc.)
# Estimated applicable: ~30 assertions (67%)

# 4. Create test file
cat > convex/test-types/insert.ts << 'EOF'
import { convexTable, text, integer, InferInsertModel } from 'kitcn/orm';
import { Expect, Equal } from './utils';

// ============================================================================
// INSERT TYPE INFERENCE TESTS
// ============================================================================

// Test 1: Basic insert type
{
  const users = convexTable('users', {
    name: text().notNull(),
    age: integer(),
  });

  type InsertUser = InferInsertModel<typeof users>;

  Expect<Equal<InsertUser, {
    name: string;
    age: number | null;
  }>>;
}
EOF

# 5. Validate
bun typecheck

# 6. Update README progress
# Old: 126/144 = 88%
# New: 156/174 = 90% (if target increases to 70% of Drizzle's ~250 total)
```

### Maintaining Parity Over Time

**When Drizzle adds new tests**:
1. Watch Drizzle releases: https://github.com/drizzle-team/drizzle-orm/releases (upstream)
2. Check `type-tests/` changes: `git diff v0.x.0..v0.y.0 type-tests/`
3. Evaluate applicability to Convex
4. Add corresponding tests if applicable

**When kitcn adds features**:
1. Check if Drizzle has equivalent feature
2. Copy test patterns if they exist
3. Create custom tests if Convex-specific
4. Update target count if needed

**Annual audit**:
- Re-count Drizzle's total assertions (may grow)
- Adjust target parity % if needed
- Identify new test patterns worth adopting

## Implementation Workflow (Phases 0-5)

This is the proven workflow used to achieve 88% progress toward 65% Drizzle parity. Use this for future milestones:

### Phase 0: Pre-Implementation Cleanup (CRITICAL)
**Time**: 1-3 hours | **Blocking**: Must complete before Phase 1

**Goal**: Clean baseline prevents tech debt at scale

**Tasks**:
1. **Extract shared types** to `fixtures/types.ts`:
   - Identify repeated type definitions (10+ lines repeated 5+ times)
   - Create shared types (UserRow, PostRow, etc.)
   - Replace all repetitions with imports
   - **Impact**: Removed 100+ lines of duplication

2. **Move debug files** to `debug/` subdirectory:
   - Separate investigation artifacts from production tests
   - Use `git mv` to preserve history
   - Fix import paths (`./utils` → `../utils`)

3. **Fix @ts-expect-error directives**:
   - Check for unused directives: `bun typecheck 2>&1 | grep "Unused '@ts-expect-error'"`
   - Fix positioning (must be on line immediately before error)
   - Remove if code actually type-checks

4. **Standardize section separators**:
   ```typescript
   // ============================================================================
   // SECTION NAME
   // ============================================================================
   ```

5. **Create/update README.md** with patterns and anti-patterns

**Validation**: `bun typecheck` passes, git commits clean

---

### Phase 1: Core Type Inference Tests
**Time**: 3-4 hours | **Priority**: P0

**Goal**: Table and model type inference with institutional learnings

**File**: Create `tables.ts` (or milestone-specific file)

**Test Coverage**:
- InferSelectModel (6+ tests)
- InferInsertModel (5+ tests)
- Column builders (6+ tests)
- Negative tests (3+ tests)
- Institutional learnings (4+ tests from past regressions)

**Key Pattern**:
```typescript
// Test: InferSelectModel with system fields
{
  const users = convexTable('users', {
    name: text().notNull(),
  });

  type Result = InferSelectModel<typeof users>;

  Expect<Equal<Result, {
    _id: GenericId<'users'>;
    createdAt: number;
    name: string;
  }>>;
}
```

**Validation**: `bun typecheck` passes after each section

---

### Phase 2: Query/Operation Result Types
**Time**: 3-4 hours | **Priority**: P0

**Goal**: Comprehensive result type tests for all operations

**File**: Expand `select.ts` (or create `insert.ts`, `update.ts`, etc.)

**Test Coverage**:
- Basic operations (findMany, findFirst, etc.) (6+ tests)
- Result type variations (with/without selections) (4+ tests)
- Complex combinations (where + orderBy + limit) (4+ tests)
- Negative tests (4+ tests)

**Key Pattern**:
```typescript
// Test: findFirst returns T | undefined
{
  const result = await db.query.users.findFirst({
    where: (users, { eq }) => eq(users.name, 'Alice'),
  });

  type Expected = UserRow | undefined;
  Expect<Equal<typeof result, Expected>>;
}
```

---

### Phase 3: Milestone-Specific Features
**Time**: 2-3 hours | **Priority**: P0

**Goal**: Test new features introduced in current milestone

**Examples**:
- M5: orderBy variations, string operators
- M6: Column builder method chaining
- M7: Insert operations, defaults

**Test Coverage**:
- Feature variations (3+ tests per feature)
- Edge cases (2+ tests)
- Negative tests (2+ tests)

---

### Phase 4: Comprehensive Negative Tests
**Time**: 2-3 hours | **Priority**: P0

**Goal**: Prevent common mistakes with type errors

**Test Coverage**:
- Invalid column access (4+ tests)
- Type mismatches (4+ tests)
- Invalid operations (4+ tests)
- Invalid config options (3+ tests)

**Key Pattern**:
```typescript
// Invalid column in where clause
db.query.users.findMany({
  // @ts-expect-error - Property 'invalidField' does not exist
  where: (users, { eq }) => eq(users.invalidField, 'test'),
});
```

**Critical**: @ts-expect-error must be on line immediately before error

---

### Phase 5: Edge Cases & Documentation
**Time**: 1-2 hours | **Priority**: P1

**Goal**: Test boundary conditions and document methodology

**Test Coverage**:
- Empty results (Array<T> not undefined)
- Null handling in complex scenarios
- System field behavior
- GenericId preservation across tables
- Deeply nested configurations

**Documentation**:
- Update this README with new coverage
- Document deferred tests with TODO markers
- Update progress calculation

---

### Validation Checklist (After Each Phase)

```bash
# 1. Typecheck passes
bun typecheck

# 2. All tests pass
bun run test

# 3. Lint passes
bun lint:fix

# 4. Count assertions
grep -r "Expect<Equal<" convex/test-types/*.ts | wc -l

# 5. Calculate progress
# Progress = (current / target) × 100
# Example: 126 / 144 = 87.5% ≈ 88%

# 6. Commit
git add convex/test-types/
git commit -m "feat(types): add [milestone] type tests (Phase X)"
```

## References

- [Drizzle ORM Type Tests](https://github.com/drizzle-team/drizzle-orm/tree/main/drizzle-orm/type-tests/pg) (upstream reference)
- [Implementation Plan](../../docs/plans/2026-02-02-query-type-testing-audit-plan.md)
- [Task Plan](../../task_plan.md)
- [Institutional Learnings](../../docs/solutions/typescript-patterns/)
