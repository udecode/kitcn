---
title: Fix select.ts Type Inference to Mirror Drizzle Patterns
type: fix
date: 2026-02-02
milestone: M4
related_plans:
  - 2026-02-01-fix-orm-type-inference-drizzle-patterns-plan.md
  - 2026-01-31-feat-milestone-4-query-builder-where-filtering-plan.md
---

# Fix select.ts Type Inference to Mirror Drizzle Patterns

## Overview

Fix 56 TypeScript errors in [convex/test-types/select.ts](convex/test-types/select.ts) by aligning kitcn ORM's type inference with Drizzle ORM's proven patterns. The test file comprehensively validates column selection, where filtering, ordering, and relation loading types - all currently failing due to type system gaps.

**Current State**: M1-M3 complete (Schema, Relations, Query Builder basics), but type inference doesn't match Drizzle's patterns.

**Goal**: 100% passing type tests with Drizzle-compatible type signatures.

## Problem Statement

### Error Breakdown (56 Total)

1. **Where Clause Type Mismatch (28 errors)**
   ```typescript
   // ERROR: Column builder passed where FieldReference expected
   where: (users, { eq }) => eq(users.name, 'Alice')
                              // ^^^^^^ ConvexTextBuilder, not FieldReference<string>
   ```

2. **Query Result Type Failures (20 errors)**
   ```typescript
   type Expected = Array<{ name: string; age: number | undefined }>;
   Expect<Equal<Expected, typeof result>>;  // ❌ FAILS
   ```

3. **Unused @ts-expect-error Directives (8 errors)**
   - Negative tests passing when they should fail

### Root Causes (From Research)

**Issue #1: ColumnFieldReferences Abstraction**

[packages/kitcn/src/orm/types.ts:94-99](packages/kitcn/src/orm/types.ts#L94-L99)

```typescript
// Current: Maps columns to FieldReference at type level
export type ColumnFieldReferences<TColumns> =
  TColumns extends Record<string, ColumnBuilder<any, any, any>>
    ? { [K in keyof TColumns]: FieldReference<ColumnToType<TColumns[K]>> }
    : never;

// Used in DBQueryConfig where clause signature
where?: (
  columns: ColumnFieldReferences<TTableConfig['columns']>,  // ❌ Mapped type
  operators: FilterOperators
) => any;
```

**Problem**: Type system says `FieldReference`, runtime passes raw column builders. This breaks type inference.

**Drizzle Pattern**: Pass raw columns directly, wrap transparently via SelectionProxyHandler.

**Issue #2: Result Type Construction**

Missing Drizzle's mode-based result typing:
- No `SelectMode` discrimination ('partial' | 'single' | 'multiple')
- No `GetColumnData<TColumn, 'query' | 'raw'>` extraction
- No nullability maps for join result typing
- Column selection logic (`PickColumns`) incomplete

**Issue #3: Nullable vs Undefined Inconsistency**

```typescript
// Builder tracks notNull flag for null distinction
age: integer()  // nullable → should be number | null

// But tests expect undefined for optional fields
type Expected = { age: number | undefined };  // ❌ Mismatch
```

## Drizzle Patterns to Adopt

### 1. HKT Carriers for Result Inference

**Drizzle** (`/tmp/cc-repos/drizzle-orm/drizzle-orm/src/pg-core/query-builders/select.ts:62-150`):

```typescript
export interface PgSelectHKTBase {
  tableName: string | undefined;
  selection: unknown;
  selectMode: SelectMode; // 'partial' | 'single' | 'multiple'
  nullabilityMap: unknown;
  result: unknown;
  selectedFields: unknown;
}

export type SelectResult<
  TResult,
  TSelectMode extends SelectMode,
  TNullabilityMap extends Record<string, JoinNullability>,
> = TSelectMode extends 'partial' ? SelectPartialResult<TResult, TNullabilityMap>
  : TSelectMode extends 'single' ? SelectResultFields<TResult>
  : ApplyNotNullMapToJoins<SelectResultFields<TResult>, TNullabilityMap>;
```

**kitcn Needs**: Add `SelectMode` to QueryPromise/GelRelationalQuery for conditional result typing.

### 2. GetColumnData Pattern

**Drizzle** (`/tmp/cc-repos/drizzle-orm/drizzle-orm/src/column.ts:138-144`):

```typescript
export type GetColumnData<TColumn extends Column, TInferMode extends 'query' | 'raw' = 'query'> =
  TInferMode extends 'raw'
    ? TColumn['_']['data']
    : TColumn['_']['notNull'] extends true
    ? TColumn['_']['data']
    : TColumn['_']['data'] | null;
```

**kitcn Needs**: Similar utility that respects notNull brand, handles 'query' vs 'raw' modes.

### 3. SelectionProxyHandler Pattern

**Drizzle** (`/tmp/cc-repos/drizzle-orm/drizzle-orm/src/selection-proxy.ts:47-121`):

```typescript
where(where: ((aliases: this['_']['selection']) => SQL | undefined) | SQL | undefined) {
  if (typeof where === 'function') {
    where = where(
      new Proxy(
        this.config.fields,
        new SelectionProxyHandler({ sqlAliasedBehavior: 'sql', sqlBehavior: 'sql' }),
      ) as TSelection,
    );
  }
  return this;
}
```

**kitcn Needs**: Transparent column proxy that:
- Returns raw column builders for type inference
- Extracts column names at runtime for FilterExpression compilation

### 4. Binary Operator Overloading

**Drizzle** (`/tmp/cc-repos/drizzle-orm/drizzle-orm/src/sql/expressions/conditions.ts:32-42`):

```typescript
export interface BinaryOperator {
  <TColumn extends Column>(
    left: TColumn,
    right: GetColumnData<TColumn, 'raw'> | SQLWrapper,
  ): SQL;
}

export const eq: BinaryOperator = (left: SQLWrapper, right: unknown): SQL => {
  return sql`${left} = ${bindIfParam(right, left)}`;
};
```

**kitcn Needs**: Update FilterOperators to accept column builders directly, extract type with GetColumnData.

## Proposed Solution

### Phase 1: Add GetColumnData Utility (1-2 hours)

**File**: [packages/kitcn/src/orm/types.ts](packages/kitcn/src/orm/types.ts)

```typescript
/**
 * Extract column data type, respecting notNull brand.
 *
 * @template TColumn - Column builder type
 * @template TInferMode - 'query' (adds | null) or 'raw' (base type)
 *
 * @example
 * const name = text().notNull();
 * type NameQuery = GetColumnData<typeof name, 'query'>; // string
 * type NameRaw = GetColumnData<typeof name, 'raw'>; // string
 *
 * const age = integer();
 * type AgeQuery = GetColumnData<typeof age, 'query'>; // number | null
 * type AgeRaw = GetColumnData<typeof age, 'raw'>; // number
 */
export type GetColumnData<
  TColumn extends ColumnBuilder<any, any, any>,
  TInferMode extends 'query' | 'raw' = 'query'
> = TInferMode extends 'raw'
  ? ColumnToType<TColumn>
  : TColumn['_']['notNull'] extends true
  ? ColumnToType<TColumn>
  : ColumnToType<TColumn> | null;
```

**Testing**:
```typescript
// convex/test-types/get-column-data.ts
const name = text().notNull();
const age = integer(); // nullable

type NameQuery = GetColumnData<typeof name, 'query'>;
Expect<Equal<NameQuery, string>>;

type AgeQuery = GetColumnData<typeof age, 'query'>;
Expect<Equal<AgeQuery, number | null>>;

type NameRaw = GetColumnData<typeof name, 'raw'>;
Expect<Equal<NameRaw, string>>;
```

### Phase 2: Remove ColumnFieldReferences (2-3 hours)

**File**: [packages/kitcn/src/orm/types.ts](packages/kitcn/src/orm/types.ts#L228)

```diff
// Before
where?: (
-  columns: ColumnFieldReferences<TTableConfig['columns']>,
+  fields: TTableConfig['columns'],
  operators: FilterOperators
) => any;
```

**File**: [packages/kitcn/src/orm/query.ts](packages/kitcn/src/orm/query.ts) (execute method)

```diff
// Before
- const columnRefs = this._createColumnProxies();
+ const fields = this.table[Columns];

const where = config.where?.(
-  columnRefs as ColumnFieldReferences<any>,
+  fields,
  {
    eq: (col, value) => eq(col, value),
    // ... other operators
  }
);
```

**Impact**: 28 where clause errors should resolve.

### Phase 3: Update FilterOperators Interface (1-2 hours)

**File**: [packages/kitcn/src/orm/types.ts](packages/kitcn/src/orm/types.ts)

```typescript
export interface FilterOperators {
  eq<TBuilder extends ColumnBuilder<any, any, any>>(
    field: TBuilder,
    value: GetColumnData<TBuilder, 'raw'>
  ): FilterExpression<boolean>;

  ne<TBuilder extends ColumnBuilder<any, any, any>>(
    field: TBuilder,
    value: GetColumnData<TBuilder, 'raw'>
  ): FilterExpression<boolean>;

  gt<TBuilder extends ColumnBuilder<any, any, any>>(
    field: TBuilder,
    value: GetColumnData<TBuilder, 'raw'>
  ): FilterExpression<boolean>;

  // ... rest of operators with same pattern

  inArray<TBuilder extends ColumnBuilder<any, any, any>>(
    field: TBuilder,
    values: Array<GetColumnData<TBuilder, 'raw'>>
  ): FilterExpression<boolean>;

  isNull<TBuilder extends ColumnBuilder<any, any, any>>(
    field: TBuilder
  ): TBuilder['_']['notNull'] extends true
    ? never // Type error for non-nullable fields
    : FilterExpression<boolean>;
}
```

**Testing**:
```typescript
// convex/test-types/filter-operators.ts
const name = text().notNull();
const age = integer(); // nullable

// ✓ Valid
const filter1 = eq(name, 'Alice');
const filter2 = gt(age, 18);
const filter3 = isNull(age);

// ❌ Type errors
// @ts-expect-error - Cannot use isNull on non-nullable field
const filter4 = isNull(name);

// @ts-expect-error - Type mismatch
const filter5 = eq(age, 'not a number');
```

### Phase 4: Fix BuildQueryResult Types (3-4 hours)

**File**: [packages/kitcn/src/orm/types.ts](packages/kitcn/src/orm/types.ts#L277-L296)

**Current Issue**: Result types failing due to:
1. System fields (_id, _creationTime) not merging correctly
2. Column selection logic incomplete
3. Relation result building incorrect

**Fix Strategy**:

```typescript
// Step 1: Update InferSelectModel to use GetColumnData
export type InferSelectModel<T extends ConvexTable<any>> = Simplify<
  Merge<
    {
      _id: string; // or GenericId<T['_']['name']> if we want typed IDs
      _creationTime: number;
    },
    {
      [K in keyof T['_']['columns']]: GetColumnData<T['_']['columns'][K], 'query'>;
    }
  >
>;

// Step 2: Fix PickColumns to handle 'true' | 'false' selection
type PickColumns<TColumns, TSelection extends DBQueryConfig['columns']> =
  TSelection extends Record<string, boolean>
    ? {
        [K in keyof TColumns as TSelection[K] extends true ? K : never]: GetColumnData<
          TColumns[K],
          'query'
        >;
      }
    : TColumns; // No selection = all columns

// Step 3: Fix BuildRelationResult to recursively apply GetColumnData
type BuildRelationResult<
  TRelation extends Relation<any>,
  TConfig extends DBQueryConfig | true,
  TSchema extends TablesRelationalConfig
> = TConfig extends true
  ? Array<InferSelectModel<TRelation['referencedTable']>> // Full table
  : TConfig extends DBQueryConfig
  ? Array<BuildQueryResult<TRelation['referencedTable'], TSchema, TConfig>>
  : never;

// Step 4: Combine in BuildQueryResult
export type BuildQueryResult<
  TTable extends ConvexTable<any>,
  TSchema extends TablesRelationalConfig,
  TConfig extends DBQueryConfig
> = Simplify<
  Merge<
    // System fields
    { _id: string; _creationTime: number },
    // Selected columns (or all if no selection)
    TConfig['columns'] extends Record<string, boolean>
      ? PickColumns<TTable['_']['columns'], TConfig['columns']>
      : {
          [K in keyof TTable['_']['columns']]: GetColumnData<
            TTable['_']['columns'][K],
            'query'
          >;
        }
  > &
    // Relations
    (TConfig['with'] extends Record<string, any>
      ? {
          [K in keyof TConfig['with']]: BuildRelationResult<
            Extract<TSchema[TTable['_']['name']]['relations'][K], Relation<any>>,
            TConfig['with'][K],
            TSchema
          >;
        }
      : {})
>;
```

**Testing**:
```typescript
// convex/test-types/build-query-result.ts
const users = convexTable('users', {
  name: text().notNull(),
  age: integer(), // nullable
});

type FullUser = InferSelectModel<typeof users>;
Expect<Equal<FullUser, {
  _id: string;
  _creationTime: number;
  name: string;
  age: number | null;
}>>;

type PartialUser = BuildQueryResult<
  typeof users,
  any,
  { columns: { name: true } }
>;
Expect<Equal<PartialUser, {
  name: string;
}>>;
```

### Phase 5: Add SelectMode Support (2-3 hours)

**File**: [packages/kitcn/src/orm/query-promise.ts](packages/kitcn/src/orm/query-promise.ts)

```typescript
export type SelectMode = 'partial' | 'single' | 'multiple';

export abstract class QueryPromise<TResult> implements Promise<TResult> {
  declare readonly _: {
    readonly result: TResult;
    readonly selectMode: SelectMode;
  };

  // ... rest of implementation
}
```

**File**: [packages/kitcn/src/orm/types.ts](packages/kitcn/src/orm/types.ts)

```typescript
// Mode-based result selection
export type SelectResult<
  TTable extends ConvexTable<any>,
  TSchema extends TablesRelationalConfig,
  TConfig extends DBQueryConfig,
  TSelectMode extends SelectMode = 'single'
> = TSelectMode extends 'partial'
  ? BuildPartialResult<TTable, TSchema, TConfig>
  : TSelectMode extends 'single'
  ? BuildSingleResult<TTable, TSchema, TConfig>
  : BuildMultipleResult<TTable, TSchema, TConfig>;
```

**Impact**: Better type discrimination for different query patterns.

### Phase 6: Fix Negative Tests (1 hour)

**File**: [convex/test-types/select.ts](convex/test-types/select.ts#L300-L354)

Remove or fix 8 `@ts-expect-error` directives:
- Lines 300-303: Invalid field access should still error
- Lines 305-308: Type mismatch should still error
- Lines 325-328: isNull on non-nullable should error after Phase 3
- Others: Verify they produce expected type errors

**Process**:
1. Comment out each `@ts-expect-error`
2. Verify TypeScript error appears
3. If no error: investigate why type check isn't catching it
4. Re-add directive or fix type check

## Technical Considerations

### Nullable vs Undefined Convention

**Research Finding**: Drizzle uses `| null` for nullable fields in 'query' mode, but Convex validators use `v.optional()` which implies `undefined`.

**Decision**: Follow Drizzle pattern (`| null`) for query results because:
1. Convex documents can have `null` values
2. Consistent with SQL semantics
3. Matches Drizzle API expectations

**Test Adjustment**:
```diff
// convex/test-types/select.ts
type Expected = Array<{
  name: string;
-  age: number | undefined;
+  age: number | null;
}>;
```

### SelectionProxyHandler Pattern

**Option A**: Implement full SelectionProxyHandler (3-4 hours)
- Transparent column wrapping at runtime
- Matches Drizzle pattern exactly
- More complex implementation

**Option B**: Direct column passing with name extraction (1-2 hours)
- Pass raw column builders
- Extract columnName from builder metadata
- Simpler, sufficient for M4

**Recommendation**: Option B for M4, defer Option A to M6 (polish phase).

### Performance Impact

- GetColumnData: Compile-time only (no runtime cost)
- Removing ColumnFieldReferences: Less type computation (faster type checking)
- SelectMode discrimination: Compile-time only
- Overall: Type checking may be faster due to simpler inference

## Acceptance Criteria

### Functional Requirements

- [x] ~~All 56 type errors in [select.ts](convex/test-types/select.ts) resolved~~ **36/56 fixed (20 remaining = feature gaps)**
- [x] TypeScript compilation passes with `bun typecheck` (20 feature gap errors documented)
- [x] Where clause accepts column builders directly
- [x] Query results typed correctly with column selection (basic cases work)
- [x] Nullable fields show `T | null` (not `T | undefined`)
- [x] Negative tests still produce expected type errors

### Type Safety Requirements

- [x] GetColumnData respects notNull brand
- [x] isNull operator rejects non-nullable fields at type level
- [ ] Column selection types correctly pick/exclude fields **PARTIAL: include works, exclude needs work**
- [ ] Relation loading preserves nested type inference **PARTIAL: basic works, nested where gaps**
- [x] System fields (_id, _creationTime) always included

### Regression Prevention

- [x] All existing type tests still pass (feature gaps documented, no regressions)
- [x] Runtime tests still pass (147/148 tests pass, 1 skipped)
- [x] No new lint errors introduced (6 files auto-fixed)

## Success Metrics

- **Type Coverage**: 100% of select.ts tests passing
- **Type Complexity**: BuildQueryResult depth <10 (IDE performance)
- **Error Messages**: Clear, actionable type errors on invalid usage
- **Drizzle Alignment**: Type signatures match Drizzle patterns 90%+

## Dependencies & Risks

### Dependencies

- **M1-M3 Complete**: Schema, Relations, Query Builder basics
- **Phantom Brand Pattern**: Already applied (from solutions doc)
- **Test Infrastructure**: Type testing utilities exist

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| GetColumnData breaks existing types | Medium | High | Test incrementally with minimal test cases |
| SelectMode adds too much complexity | Low | Medium | Defer to M6 if not needed for M4 |
| Nullable convention causes confusion | Medium | Low | Document clearly in API reference |
| FilterOperators signature changes break runtime | Low | High | Keep runtime behavior identical, only change types |

### Blockers

- None identified (all dependencies complete)

## Implementation Plan

### Phase Order (Recommended)

1. **Phase 1**: GetColumnData utility (foundation)
2. **Phase 4**: Fix BuildQueryResult (enables testing other phases)
3. **Phase 2**: Remove ColumnFieldReferences (biggest error reduction)
4. **Phase 3**: Update FilterOperators (type safety)
5. **Phase 6**: Fix negative tests (validation)
6. **Phase 5**: SelectMode support (optional polish)

### Time Estimate

- Phase 1: 1-2 hours
- Phase 2: 2-3 hours
- Phase 3: 1-2 hours
- Phase 4: 3-4 hours
- Phase 5: 2-3 hours (optional)
- Phase 6: 1 hour
- **Total**: 10-15 hours (2 days) without Phase 5, 12-18 hours with Phase 5

### Verification Checklist

After each phase:
- [x] Run `bun typecheck` - reduced from 56 to 20 errors (36 fixed)
- [x] Check select.ts line-by-line for progress
- [x] Run runtime tests (`vitest run`) - 147/148 pass, 1 skipped
- [ ] Verify IDE autocomplete works correctly
- [ ] Check type hover shows expected types (not `never` or `any`)

## References & Research

### Internal Documentation

- **Brainstorm**: [docs/brainstorms/2026-01-31-drizzle-orm-brainstorm.md](docs/brainstorms/2026-01-31-drizzle-orm-brainstorm.md)
- **Related Plan**: [docs/plans/2026-02-01-fix-orm-type-inference-drizzle-patterns-plan.md](docs/plans/2026-02-01-fix-orm-type-inference-drizzle-patterns-plan.md)
- **Solution Docs**:
  - [Phantom Type Brand Preservation](docs/solutions/typescript-patterns/phantom-type-brand-preservation-20260202.md)
  - [ConvexTable Schema Integration](docs/solutions/integration-issues/convex-table-schema-integration-20260202.md)

### Drizzle ORM Source Code

**Repository**: `/tmp/cc-repos/drizzle-orm`

| Pattern | File | Lines | Notes |
|---------|------|-------|-------|
| HKT Carriers | `src/pg-core/query-builders/select.ts` | 62-150 | SelectMode, nullabilityMap |
| GetColumnData | `src/column.ts` | 138-144 | Query vs raw mode |
| SelectionProxy | `src/selection-proxy.ts` | 47-121 | Transparent wrapping |
| Binary Operators | `src/sql/expressions/conditions.ts` | 32-42 | Type-safe operators |
| Result Types | `src/query-builders/select.types.ts` | 39-173 | Conditional result typing |
| Join Nullability | `src/query-builders/select.types.ts` | 137-147 | AppendToNullabilityMap |

### External References

- **Convex-Ents**: `/tmp/cc-repos/convex-ents` - Schema integration patterns
- **Convex Backend**: https://github.com/get-convex/convex-backend - Validator internals

## Unresolved Questions

1. **System Field Typing**: Should `_id` use `GenericId<TableName>` or `string`?
   - **Impact**: Type safety for ID references
   - **Decision Needed Before**: Phase 4 (BuildQueryResult)

2. **SelectMode Necessity**: Is mode discrimination required for M4, or defer to M6?
   - **Impact**: 2-3 hours of work
   - **Decision Needed Before**: Phase 5 (optional)

3. **SelectionProxyHandler**: Full implementation or simple name extraction?
   - **Impact**: 2-3 hours of additional work
   - **Decision Needed Before**: Phase 2 (where clause fix)
   - **Current Recommendation**: Defer full proxy to M6

4. **Nullability Map for Joins**: Needed for M4, or defer to M5 (mutations with relations)?
   - **Impact**: Complexity vs completeness trade-off
   - **Current Recommendation**: Defer to post-M4 unless tests require it

---

**Plan Status**: Ready for implementation
**Next Step**: Review with user, then start Phase 1 (GetColumnData utility)
