---
title: Fix M5 Type System Regressions
type: fix
date: 2026-02-02
---

# Fix M5 Type System Regressions

## Overview

TypeScript typecheck errors introduced during M5 (OrderBy & String Operators) milestone. Main issue: `ConvexTableWithColumns` uses `&` intersection operator which strips phantom type brands, preventing column property access. Secondary issue: test files using deprecated function-based orderBy API.

## Problem Statement

After M5 implementation (commits 8918f91, eeaf5e6, f80464a), typecheck reports 16 errors:

1. **7 property access errors** - TypeScript can't access column properties (e.g., `createdAt`, `_creationTime`) on `ConvexTableWithColumns` type
2. **9 orderBy signature errors** - Test files use old function-based API instead of new value-based API

**Example Error**:
```
Property 'createdAt' does not exist on type 'ConvexTableWithColumns<{
  name: "posts";
  columns: { ...; createdAt: ConvexNumberBuilderInitial<...>; };
}>'
```

## Root Cause

### Issue 1: Intersection Operator Violates Phantom Brand Preservation

**Location**: [packages/kitcn/src/orm/table.ts:210-212](packages/kitcn/src/orm/table.ts#L210-L212)

```typescript
// ❌ CURRENT (violates institutional learning)
export type ConvexTableWithColumns<T extends TableConfig> = ConvexTable<T> & {
  [Key in keyof T['columns']]: T['columns'][Key];
} & ReturnType<typeof createSystemFields>;
```

**Why it fails**:
- TypeScript's `&` operator strips phantom properties during type flattening
- Documented in `/Users/zbeyens/GitHub/kitcn/docs/solutions/typescript-patterns/phantom-type-brand-preservation-20260202.md`
- Commit eeaf5e6 fixed this exact issue in `BuildQueryResult` using `Merge` utility
- `ConvexTableWithColumns` was missed during the fix

### Issue 2: Test Files Using Deprecated OrderBy API

**Location**: [convex/test-types/select.ts:123,142,204](convex/test-types/select.ts#L123)

```typescript
// ❌ OLD PATTERN (pre-f80464a)
orderBy: (users, { asc }) => asc(users.name)

// ✅ NEW PATTERN (post-f80464a)
orderBy: asc(users.name)
```

**Why it changed**:
- Commit f80464a changed orderBy from function to value (Drizzle pattern)
- Test files weren't updated to match new signature

## Proposed Solution

### Fix 1: Replace Intersection with Merge Utility

Change `ConvexTableWithColumns` to use `Merge` pattern (already used in `BuildQueryResult`):

```typescript
// ✅ FIXED (preserves phantom brands)
export type ConvexTableWithColumns<T extends TableConfig> = Merge<
  ConvexTable<T>,
  Merge<
    { [Key in keyof T['columns']]: T['columns'][Key] },
    ReturnType<typeof createSystemFields>
  >
>;
```

**Rationale**:
- Follows institutional learning from phantom-type-brand-preservation-20260202.md
- Consistent with `BuildQueryResult` fix in commit eeaf5e6
- `Merge` utility explicitly combines keys without stripping phantom properties

### Fix 2: Update Test Files to New OrderBy API

Update all orderBy usages in test files to use value-based API:

```typescript
// Files to update:
// - convex/test-types/select.ts:123, 142, 204

// BEFORE
orderBy: (users, { asc }) => asc(users.name)

// AFTER
orderBy: asc(users.name)
```

**Note**: Tests may need to import table instances (not just types) to access builders.

## Technical Considerations

### Type System Constraints

- **Merge utility already exists** in types.ts (added in commit eeaf5e6)
- **No runtime changes needed** - only type-level modifications
- **Preserves all existing behavior** - runtime code remains unchanged

### Verification Strategy

1. Run `bun typecheck` before and after changes
2. Verify all 16 errors are resolved
3. Run `bun test` to ensure no runtime regressions
4. Check IDE hover on table columns shows proper types

### Related Patterns

**From institutional learnings**:
1. Never use `extends Record<string, T>` constraints (causes type widening)
2. Use `Merge<A, B>` instead of `&` for branded types
3. Test types in combination, not isolation
4. Study Drizzle ORM patterns as reference

## Acceptance Criteria

- [ ] `bun typecheck` passes with 0 errors (currently 16)
- [ ] Column properties accessible on `ConvexTableWithColumns` type
- [ ] System fields (_id, _creationTime) accessible on table instances
- [ ] OrderBy tests use new value-based API signature
- [ ] All existing tests pass (`bun test`)
- [ ] IDE hover shows correct types for table columns

## Implementation Steps

### Step 1: Update ConvexTableWithColumns Type

**File**: `packages/kitcn/src/orm/table.ts`

1. Locate `ConvexTableWithColumns` type definition (line 210)
2. Replace intersection operators with nested `Merge` pattern
3. Verify `Merge` utility import is present

```typescript
// Add to imports if not present
import type { Merge } from './types';

// Replace type definition
export type ConvexTableWithColumns<T extends TableConfig> = Merge<
  ConvexTable<T>,
  Merge<
    { [Key in keyof T['columns']]: T['columns'][Key] },
    ReturnType<typeof createSystemFields>
  >
>;
```

### Step 2: Update Test Files OrderBy Signatures

**File**: `convex/test-types/select.ts`

1. Update line 123: Change `orderBy: (users, { asc }) => asc(users.name)` to `orderBy: asc(users.name)`
2. Update line 142: Change `orderBy: (users, { desc }) => desc(users.name)` to `orderBy: desc(users.name)`
3. Update line 204: Change `orderBy: (users, { desc }) => desc(users.age)` to `orderBy: desc(users.age)`
4. Add imports if needed: `import { asc, desc } from 'kitcn/orm'`

### Step 3: Rebuild Package

```bash
bun --cwd packages/kitcn build
```

### Step 4: Verify Typecheck

```bash
bun typecheck
```

Expected output: 0 errors (currently 16)

### Step 5: Run Tests

```bash
bun test
```

Expected: All tests pass (no regressions)

## Success Metrics

**Before**: 16 typecheck errors
**After**: 0 typecheck errors

**Type inference verification**:
```typescript
const posts = convexTable('posts', {
  title: text().notNull(),
  createdAt: number().notNull(),
});

// Should work without errors
const t = posts.createdAt;  // ✅ Accessible
const id = posts._id;       // ✅ Accessible (system field)
```

## Dependencies & Risks

### Dependencies

- `Merge` utility already exists in types.ts (no new dependencies)
- No runtime library changes required

### Risks

**Low Risk**:
- Type-only changes (no runtime impact)
- Following proven pattern from commit eeaf5e6
- Institutional learning documents exact solution

**Mitigation**:
- Run full test suite after changes
- Verify IDE hover types match expectations
- Test both development and production builds

## References & Research

### Internal References

- **Root cause**: [docs/solutions/typescript-patterns/phantom-type-brand-preservation-20260202.md](docs/solutions/typescript-patterns/phantom-type-brand-preservation-20260202.md)
- **Pattern fix**: Commit eeaf5e6 - BuildQueryResult Merge pattern
- **Breaking change**: Commit f80464a - orderBy signature change
- **Test pattern**: [convex/orm/ordering.test.ts:62](convex/orm/ordering.test.ts#L62)

### Related Commits

- `8918f91` - Added GetColumnData utility (Feb 2, 10:39 AM)
- `eeaf5e6` - Fixed BuildQueryResult with Merge (Feb 2, 10:48 AM)
- `f80464a` - Removed ColumnFieldReferences, changed orderBy (Feb 2, 10:43 AM)

### Institutional Learnings Applied

1. **Phantom Type Brand Preservation**: Use Merge instead of `&` for branded types
2. **GetColumnData Pattern**: Mode-based type extraction (not directly related but good context)
3. **ConvexTable Schema Integration**: Duck typing pattern (runtime already correct)
4. **Type Testing**: Test types in combination, not isolation

## Notes

**Why this wasn't caught earlier**:
- Turbo cache may have hidden errors during incremental builds
- Tests passed because runtime code is correct (type-only issue)
- Issue only visible when running full `bun typecheck` across all packages

**Related work**:
- M5 milestone successfully implemented OrderBy and String Operators
- Only type system cleanup remains
- No functional changes needed
