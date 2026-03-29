---
title: Fix M5 Type Regressions - Complete Implementation
type: fix
date: 2026-02-02
---

# Fix M5 Type Regressions - Complete Implementation

## Overview

Fix 25 TypeScript errors introduced during M5 implementation (OrderBy & String Operators). The errors stem from 3 distinct issues that require coordinated fixes following Drizzle ORM patterns discovered through institutional learnings and Drizzle repo analysis.

## Problem Statement

After M5 implementation, `bun typecheck` reports 25 errors on feat/orm-5 branch:

1. **6 property access errors** - Column properties (createdAt, _creationTime, name, age) don't exist on ConvexTable type
2. **10 string operator errors** - like, ilike, startsWith, endsWith, contains missing from FilterOperators interface
3. **2 export errors** - asc and desc not exported from 'kitcn/orm'
4. **7 additional errors** - Various type inference issues

**Example Error:**
```
Property 'createdAt' does not exist on type 'ConvexTable<{
  name: "posts";
  columns: { ... createdAt: ConvexNumberBuilderInitial<...>; };
}, {}, {}, {}>'
```

## Root Cause Analysis

### Issue 1: convexTable() Returns Wrong Type

**Location**: [packages/kitcn/src/orm/table.ts:246-262](packages/kitcn/src/orm/table.ts#L246-L262)

**Current code:**
```typescript
export function convexTable<
  TName extends string,
  TColumns extends Record<string, ColumnBuilder<any, any, any>>,
>(
  name: TName,
  columns: TColumns
): ConvexTableWithColumns<{ name: TName; columns: TColumns }> {  // ✅ Return type is correct
  const rawTable = new ConvexTableImpl(name, columns);
  const systemFields = createSystemFields();
  const table = Object.assign(rawTable, rawTable[Columns], systemFields);  // ✅ Runtime is correct

  return table as any;  // ✅ Cast is correct
}
```

**But in error messages, TypeScript sees ConvexTable, not ConvexTableWithColumns.**

**Why:** The `ConvexTableWithColumns` type uses `&` operator which is CORRECT per Drizzle pattern, but the actual returned object type gets narrowed somewhere in type inference.

**Drizzle comparison:**
```typescript
// Drizzle also uses & operator (from repo analysis)
export type PgTableWithColumns<T extends TableConfig> =
  & PgTable<T>
  & { [Key in keyof T['columns']]: T['columns'][Key] }

// They use Object.assign at runtime too
const table = Object.assign(rawTable, builtColumns);
```

**The actual issue:** When tests use `asc(posts.createdAt)`, TypeScript infers `posts` type as `ConvexTable<T>` instead of `ConvexTableWithColumns<T>`, losing the mapped column properties.

**Solution:** Change `convexTable()` return type from explicit annotation to rely on inference from Object.assign, OR fix the table variable type explicitly.

### Issue 2: String Operators Not in FilterOperators Interface

**Location**: [packages/kitcn/src/orm/types.ts](packages/kitcn/src/orm/types.ts) - FilterOperators interface

**Current code:**
```typescript
export interface FilterOperators {
  eq<TBuilder extends ColumnBuilder<any, any, any>>(
    field: TBuilder,
    value: any
  ): any;

  // ... other operators ...

  isNotNull<TBuilder extends ColumnBuilder<any, any, any>>(
    field: TBuilder
  ): any;

  // ❌ MISSING: like, ilike, startsWith, endsWith, contains
}
```

**Solution:** Add string operator signatures to FilterOperators interface.

### Issue 3: asc/desc Not Exported from Main Index

**Location**: [packages/kitcn/src/orm/index.ts](packages/kitcn/src/orm/index.ts)

**Current exports:**
```typescript
// ❌ MISSING: asc and desc
export * from './builders';
export * from './database';
export * from './filter-expression';
export * from './query';
export * from './relations';
export * from './table';
export * from './types';
```

**Drizzle pattern:** Export asc/desc from main index (they export from `sql/expressions/select.ts` → `sql/expressions/index.ts`)

**Solution:** Add `export { asc, desc } from './order-by';` to index.ts

## Proposed Solution

### Fix 1: Ensure convexTable() Returns Correctly Typed Object

**File:** `packages/kitcn/src/orm/table.ts`

**Option A (Recommended): Change return type to ConvexTable and rely on runtime Object.assign**
```typescript
export function convexTable<
  TName extends string,
  TColumns extends Record<string, ColumnBuilder<any, any, any>>,
>(
  name: TName,
  columns: TColumns
): ConvexTable<{ name: TName; columns: TColumns }> {  // Changed from ConvexTableWithColumns
  const rawTable = new ConvexTableImpl(name, columns);
  const systemFields = createSystemFields();

  // Object.assign adds columns at runtime
  const table = Object.assign(rawTable, rawTable[Columns], systemFields);

  // Cast is safe because Object.assign added the column properties
  return table as any;
}
```

**Why this works:**
- Matches Drizzle pattern exactly (they return PgTable, not PgTableWithColumns)
- Object.assign adds column properties at runtime
- TypeScript will see the broader ConvexTable type but runtime has all properties
- The mapped type in ConvexTableWithColumns is for TYPE-LEVEL only, not runtime

**Option B (Alternative): Keep ConvexTableWithColumns but fix the interface**

Make ConvexTableWithColumns an interface instead of type:
```typescript
export interface ConvexTableWithColumns<T extends TableConfig> extends ConvexTable<T> {
  // Explicitly declare column properties - this is the key difference
  // But hard to do generically without mapped types
}
```

This is harder and not the Drizzle pattern, so **Option A is preferred**.

### Fix 2: Add String Operators to FilterOperators Interface

**File:** `packages/kitcn/src/orm/types.ts`

**Add after isNotNull:**
```typescript
export interface FilterOperators {
  // ... existing operators ...

  isNotNull<TBuilder extends ColumnBuilder<any, any, any>>(
    field: TBuilder
  ): any;

  // M5 String Operators (Post-Fetch Filters)
  like<TBuilder extends ColumnBuilder<any, any, any>>(
    field: TBuilder,
    pattern: string
  ): any;

  ilike<TBuilder extends ColumnBuilder<any, any, any>>(
    field: TBuilder,
    pattern: string
  ): any;

  startsWith<TBuilder extends ColumnBuilder<any, any, any>>(
    field: TBuilder,
    prefix: string
  ): any;

  endsWith<TBuilder extends ColumnBuilder<any, any, any>>(
    field: TBuilder,
    suffix: string
  ): any;

  contains<TBuilder extends ColumnBuilder<any, any, any>>(
    field: TBuilder,
    substring: string
  ): any;
}
```

**Why this signature:**
- Accepts `TBuilder` (column builder) instead of Column
- Returns `any` (filter expression will be created)
- Pattern/prefix/suffix/substring are `string` type (not generic)
- Matches the pattern from filter-expression.ts implementations

### Fix 3: Export asc and desc from Main Index

**File:** `packages/kitcn/src/orm/index.ts`

**Add export:**
```typescript
// Existing exports
export * from './builders';
export * from './database';
export * from './filter-expression';
export * from './query';
export * from './relations';
export * from './table';
export * from './types';

// M5 OrderBy exports
export { asc, desc } from './order-by';  // ← ADD THIS LINE
```

**Why explicit export:**
- order-by.ts only exports asc and desc functions
- Need to make them available from main 'kitcn/orm' import
- Matches Drizzle pattern (they export from sql/expressions)

### Fix 4: Add String Operators to Dynamic Operators in Query

**File:** `packages/kitcn/src/orm/query.ts`

**Update _createOperators method:**
```typescript
private _createOperators(): any {
  const {
    eq, ne, gt, gte, lt, lte,
    inArray, notInArray,
    isNull, isNotNull,
    like, ilike, startsWith, endsWith, contains,  // ← ADD these imports
  } = require('./filter-expression');

  return {
    eq, ne, gt, gte, lt, lte,
    inArray, notInArray,
    isNull, isNotNull,
    like, ilike, startsWith, endsWith, contains,  // ← ADD these to return object
  };
}
```

**Why:** The where callback receives operators from this method. If string operators aren't included, they won't be available in the where clause callback.

## Technical Considerations

### Drizzle Pattern Validation

From institutional learnings and Drizzle repo analysis:

**✅ They use `&` operator for PgTableWithColumns** (contrary to the phantom brand preservation doc - that's for TYPE INFERENCE functions, not table definitions)

**✅ They use Object.assign at runtime** to add column properties

**✅ They export asc/desc from main index**

**✅ They add operators to the filter interface**

### Why ConvexTableWithColumns Uses `&` Operator Correctly

The institutional learning about avoiding `&` operator applies to **type inference utilities** like InferSelectModel and BuildQueryResult. But for **table definitions**, Drizzle proves `&` is correct because:

1. It creates a structural type that TypeScript can check
2. Runtime Object.assign provides the actual properties
3. The type is used for intellisense, not runtime behavior

### Test Coverage

All tests in convex/orm/ directory should pass after these fixes:
- ordering.test.ts (6 errors about _creationTime and createdAt properties)
- string-operators.test.ts (10 errors about string operators)
- convex/test-types/select.ts (2 export errors + 3 property access errors)

## Acceptance Criteria

- [ ] `bun typecheck` passes with 0 errors (currently 25)
- [ ] All 6 property access errors resolved (createdAt, _creationTime, name, age accessible)
- [ ] All 10 string operator errors resolved (operators available in FilterOperators)
- [ ] All 2 export errors resolved (asc and desc importable from 'kitcn/orm')
- [ ] All existing tests pass (`bun test`)
- [ ] Column properties accessible: `posts.createdAt` works in asc/desc calls
- [ ] String operators callable: `like(posts.title, '%keyword%')` works in where clauses

## Implementation Steps

### Step 1: Fix convexTable() Return Type

**File:** `packages/kitcn/src/orm/table.ts`

1. Change line 252 return type annotation:
   ```typescript
   // BEFORE
   ): ConvexTableWithColumns<{ name: TName; columns: TColumns }> {

   // AFTER
   ): ConvexTable<{ name: TName; columns: TColumns }> {
   ```

2. Verify Object.assign line 260 still includes:
   - rawTable (ConvexTableImpl instance)
   - rawTable[Columns] (column builders)
   - systemFields (_id and _creationTime builders)

**Why:** Drizzle returns PgTable, not PgTableWithColumns. The runtime Object.assign provides column properties; TypeScript just needs the base interface.

### Step 2: Add String Operators to FilterOperators Interface

**File:** `packages/kitcn/src/orm/types.ts`

1. Find FilterOperators interface (around line 200+)
2. After `isNotNull` method, add 5 string operator signatures:
   ```typescript
   like<TBuilder extends ColumnBuilder<any, any, any>>(
     field: TBuilder,
     pattern: string
   ): any;

   ilike<TBuilder extends ColumnBuilder<any, any, any>>(
     field: TBuilder,
     pattern: string
   ): any;

   startsWith<TBuilder extends ColumnBuilder<any, any, any>>(
     field: TBuilder,
     prefix: string
   ): any;

   endsWith<TBuilder extends ColumnBuilder<any, any, any>>(
     field: TBuilder,
     suffix: string
   ): any;

   contains<TBuilder extends ColumnBuilder<any, any, any>>(
     field: TBuilder,
     substring: string
   ): any;
   ```

### Step 3: Export asc and desc from Main Index

**File:** `packages/kitcn/src/orm/index.ts`

1. Add explicit export after existing wildcard exports:
   ```typescript
   // Add at end of file
   export { asc, desc } from './order-by';
   ```

### Step 4: Update Dynamic Operators in Query Builder

**File:** `packages/kitcn/src/orm/query.ts`

1. Find `_createOperators()` method (around line 50)
2. Update destructuring import:
   ```typescript
   const {
     eq, ne, gt, gte, lt, lte,
     inArray, notInArray,
     isNull, isNotNull,
     like, ilike, startsWith, endsWith, contains,  // ADD
   } = require('./filter-expression');
   ```
3. Update return object:
   ```typescript
   return {
     eq, ne, gt, gte, lt, lte,
     inArray, notInArray,
     isNull, isNotNull,
     like, ilike, startsWith, endsWith, contains,  // ADD
   };
   ```

### Step 5: Rebuild Package

```bash
bun --cwd packages/kitcn build
```

Expected: Clean build with no compilation errors.

### Step 6: Verify Typecheck Passes

```bash
bun typecheck
```

Expected output: **0 errors** (currently 25)

### Step 7: Run All Tests

```bash
bun test
```

Expected: All tests pass, no regressions.

## Success Metrics

**Before:** 25 typecheck errors
**After:** 0 typecheck errors

**Type inference verification:**
```typescript
// Should work without errors
const posts = convexTable('posts', {
  title: text().notNull(),
  createdAt: number().notNull(),
});

const sorted = await db.query.posts.findMany({
  orderBy: desc(posts.createdAt),  // ✅ posts.createdAt accessible
  where: like(posts.title, '%keyword%'),  // ✅ like operator available
});
```

## Dependencies & Risks

### Dependencies

- Drizzle ORM patterns (analyzed from /tmp/cc-repos/drizzle-orm)
- Institutional learnings (phantom-type-brand-preservation, convex-table-schema-integration)
- Existing type system (GetColumnData, Merge utility, ColumnBuilder)

### Risks

**Low Risk:**
- All changes are type-level (no runtime behavior changes)
- Following proven Drizzle patterns exactly
- Changes are localized to 4 files
- Runtime Object.assign already correct

**Mitigation:**
- Run full test suite after each change
- Verify IDE intellisense shows correct types
- Check error messages show expected types
- Test both development and production builds

## References & Research

### Internal References

**Institutional Learnings:**
- [docs/solutions/typescript-patterns/phantom-type-brand-preservation-20260202.md](docs/solutions/typescript-patterns/phantom-type-brand-preservation-20260202.md) - Merge utility pattern (applies to InferSelectModel, not table definitions)
- [docs/solutions/integration-issues/convex-table-schema-integration-20260202.md](docs/solutions/integration-issues/convex-table-schema-integration-20260202.md) - TableDefinition duck typing
- [docs/solutions/typescript-patterns/select-ts-type-inference-drizzle-patterns-20260202.md](docs/solutions/typescript-patterns/select-ts-type-inference-drizzle-patterns-20260202.md) - GetColumnData utility

**Brainstorm:**
- [docs/brainstorms/2026-01-31-drizzle-orm-brainstorm.md](docs/brainstorms/2026-01-31-drizzle-orm-brainstorm.md) - Drizzle-Convex ORM design

### External References

**Drizzle ORM Repository Analysis:**
- `/tmp/cc-repos/drizzle-orm/drizzle-orm/src/pg-core/table.ts` - PgTableWithColumns uses `&` operator
- `/tmp/cc-repos/drizzle-orm/drizzle-orm/src/sql/expressions/select.ts` - asc/desc exports
- `/tmp/cc-repos/drizzle-orm/drizzle-orm/src/sql/expressions/conditions.ts` - String operators

**Key Drizzle Patterns:**
```typescript
// PgTableWithColumns uses intersection
export type PgTableWithColumns<T> = PgTable<T> & { [Key in keyof T['columns']]: T['columns'][Key] };

// Runtime uses Object.assign
const table = Object.assign(rawTable, builtColumns);

// asc/desc are simple wrappers
export function asc(column: AnyColumn): SQL { return sql`${column} asc`; }
```

### Related Commits

- M5 implementation commits (8918f91, eeaf5e6, f80464a)
- BuildQueryResult Merge fix (eeaf5e6) - different context than table definitions
- OrderBy signature change (f80464a) - already implemented correctly

## Notes

**Why This Wasn't Caught Earlier:**
- Turbo cache may have hidden errors during incremental builds
- Tests passed because runtime code is correct (type-only issue)
- Only visible when running full `bun typecheck` across all packages

**Key Insight from Drizzle Analysis:**
The institutional learning about avoiding `&` operator applies to TYPE INFERENCE utilities (InferSelectModel, BuildQueryResult), NOT to table definition types. Drizzle uses `&` for PgTableWithColumns successfully because:
1. Runtime Object.assign provides actual properties
2. The type is for compile-time checking, not runtime behavior
3. Structural typing makes the properties accessible even if type uses `&`

**Related Work:**
- M5 milestone successfully implemented OrderBy and String Operators (runtime)
- Only type system cleanup remains (exports and FilterOperators interface)
- No functional changes needed
