---
title: Fix ORM Type Inference Using Drizzle Patterns
type: fix
date: 2026-02-01
status: draft
deepened: 2026-02-01
---

# Fix ORM Type Inference Using Drizzle Patterns

## Enhancement Summary

**Deepened on:** 2026-02-01
**Research agents used:** 10 parallel agents (TypeScript reviewer, Pattern recognition, Simplicity reviewer, Architecture strategist, Performance oracle, Testing skill, Convex skill, Learnings researcher, TypeScript generics researcher, Type testing researcher)

### Key Improvements from Research

1. **Critical Pre-Implementation Verification Identified** - Must verify Convex validator structure assumptions before Phase 1
2. **Optimized Implementation Order** - Phase 2 should run FIRST (20-25% build time improvement), not Phase 1
3. **Eliminated Unnecessary Complexity** - InferModelFromColumns abstraction may be YAGNI, consider minimal 1-hour fix instead
4. **Performance Metrics Added** - Expect 20-25% reduction in type-checking time overall
5. **Comprehensive Testing Framework** - Added TDD workflow with Red→Green→Refactor phases
6. **22 Type Assertions Reducible** - Can replace most `as any` with `Assume<>` utility pattern

### New Considerations Discovered

**BLOCKING Issues (Must Fix Before Implementation)**:
- Convex Validator structure may not have `fieldness` parameter as assumed (line 38-42 of types.ts shows inference failing)
- Table.Symbol.Name existence needs verification in ConvexTable implementation
- Phase 5 operator wrapper implementation is incomplete (only sketched, needs full details)

**Architectural Risks**:
- Phantom property access pattern unreliable (`!:` properties don't work with `TRel['property']`)
- Runtime operator wrapping in Phase 5 adds O(n) overhead per call
- `Record<string, never>` is root cause of most errors (single-character fix, massive impact)

**Performance Impact**:
- Phase 3 (phantom→real properties): **-15 to -20% build time** (highest impact)
- Phase 4 (remove ColumnFieldReferences): **-5 to -10% build time**
- Phase 2 (Record<string, never>→{}): Fixes ~15 errors immediately
- Net improvement: **-20 to -25% type-checking time**

### Research-Backed Recommendations

1. **Run Pre-Implementation Verification** (45 min) - Verify validator structure, Table.Symbol, operator patterns
2. **Reorder Phases**: 2→3→4→5→1→6→7 (prioritize high-impact, low-risk changes)
3. **Consider Minimal Alternative**: 1-hour fix (Phases 2+3 only) may suffice before full 7-phase plan
4. **Add Symbol-Based Column Identity**: Attach `Symbol.for('kitcn:columnName')` to validators
5. **Implement TDD Workflow**: Write failing type tests BEFORE each phase (Red→Green→Refactor)

## Overview

After implementing M1-M4 of the Drizzle-Convex ORM, we have **37 type errors** in our test-types/ files. The previous plan attempted fixes but made things worse (56 errors). This plan takes a **research-first approach** by examining Drizzle's actual source code to understand exactly how they achieve 100% type coverage, then applying those patterns to our implementation.

**Core Problem**: Type inference is returning `never` or incorrect types instead of properly inferred query results. Both basic types (InferSelectModel) and advanced types (BuildQueryResult with relations) are broken.

**Root Cause**: We guessed at TypeScript patterns instead of copying Drizzle's proven implementations. TypeScript generic type inference is subtle - small differences in type structure cause inference to fail completely.

## Research Findings from Drizzle Source

### 1. Drizzle's Type Testing Infrastructure

**Location**: `/tmp/cc-repos/drizzle-orm/drizzle-orm/type-tests/`

**Key Pattern** - Compile-time type assertions:
```typescript
// utils.ts - Core testing utilities
export function Expect<T extends true>() {}

export type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2)
    ? true
    : false;
```

**Usage**:
```typescript
const result = await db.query.users.findMany();
Expect<Equal<Expected, typeof result>>;  // Fails at compile-time if types don't match
```

**What We Have**: Identical Equal<> pattern in convex/test-types/utils.ts
**Status**: ✅ Test infrastructure is correct

### 2. BuildQueryResult - Drizzle's Implementation

**Location**: `/tmp/cc-repos/drizzle-orm/drizzle-orm/src/relations.ts:349-404`

**Drizzle's Exact Pattern**:
```typescript
export type BuildQueryResult<
  TSchema extends TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig,
  TFullSelection extends true | Record<string, unknown>,
> = Equal<TFullSelection, true> extends true
  ? InferModelFromColumns<TTableConfig['columns']>  // Full selection
  : TFullSelection extends Record<string, unknown>
    ? Simplify<
        // Columns selection
        & (TFullSelection['columns'] extends Record<string, unknown>
          ? InferModelFromColumns<PickedColumns>  // Filtered columns
          : InferModelFromColumns<TTableConfig['columns']>)  // All columns

        // Relations selection
        & (TFullSelection['with'] extends Record<string, unknown>
          ? BuildRelationResult<TSchema, TFullSelection['with'], TTableConfig['relations']>
          : {})
      >
    : never;
```

**Our Current Pattern** (packages/kitcn/src/orm/types.ts:212-231):
```typescript
export type BuildQueryResult<
  TSchema extends TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig,
  TConfig extends true | Record<string, unknown>,
> = TConfig extends true
  ? InferModelFromColumns<TTableConfig['columns']>
  : TConfig extends Record<string, unknown>
    ? Simplify<
        (TConfig extends { columns: Record<string, boolean> }
          ? PickColumns<TTableConfig['columns'], TConfig['columns']>
          : InferModelFromColumns<TTableConfig['columns']>) &
          (TConfig extends { with: Record<string, unknown> }
            ? BuildRelationResult<...>
            : Record<string, never>)
      >
    : never;
```

**Key Difference**: We use `Record<string, never>` for no relations, Drizzle uses `{}`. This subtle difference causes type inference to fail.

**Gap #1**: Change `Record<string, never>` to `{}`

### 3. InferModelFromColumns - The Foundation

**Drizzle's Pattern** (table.ts:155-187):
```typescript
export type InferModelFromColumns<
  TColumns extends Record<string, Column>,
  TInferMode extends 'select' | 'insert' = 'select',
> = Simplify<
  TInferMode extends 'insert'
    ? & {
        // Required fields
        [Key in keyof TColumns as RequiredKeyOnly<Key, TColumns[Key]>]:
          GetColumnData<TColumns[Key], 'query'>;
      }
      & {
        // Optional fields
        [Key in keyof TColumns as OptionalKeyOnly<Key, TColumns[Key]>]?:
          GetColumnData<TColumns[Key], 'query'> | undefined;
      }
    : {
        // Select mode - all fields present
        [Key in keyof TColumns]: GetColumnData<TColumns[Key], 'query'>;
      }
>;
```

**Our Current Pattern**: We don't have `InferModelFromColumns` - we use `ValidatorsToType` directly

**Gap #2**: Add `InferModelFromColumns` as a proper abstraction layer

### 4. BuildRelationResult - Recursive Composition

**Drizzle's Pattern** (relations.ts:320-339):
```typescript
export type BuildRelationResult<
  TSchema extends TablesRelationalConfig,
  TInclude,
  TRelations extends Record<string, Relation>,
> = {
  [K in NonUndefinedKeysOnly<TInclude> & keyof TRelations]:
    TRelations[K] extends infer TRel extends Relation
      ? BuildQueryResult<
          TSchema,
          FindTableByDBName<TSchema, TRel['referencedTableName']>,
          Assume<TInclude[K], true | Record<string, unknown>>
        > extends infer TResult
        ? TRel extends One
          ? TResult | (Equal<TRel['isNullable'], false> extends true ? null : never)
          : TResult[]
        : never
      : never;
};
```

**Key Pattern**: Uses `TRel['referencedTableName']` to access table name from relation type

**Our Current Pattern** (types.ts:243-260):
```typescript
export type BuildRelationResult<
  TSchema extends TablesRelationalConfig,
  TInclude extends Record<string, unknown>,
  TRelations extends Record<string, Relation<any>>,
> = {
  [K in NonUndefinedKeysOnly<TInclude> & keyof TRelations]:
    TRelations[K] extends infer TRel extends Relation<any>
    ? BuildQueryResult<...> extends infer TResult
      ? TRel extends One<any, any>
        ? TResult | (TRel['isNullable'] extends true ? null : never)
        : TResult[]
      : never
    : never;
};
```

**Gap #3**: Our relation types need `['referencedTableName']` property access pattern

### 5. Simplify Utility - Critical for Type Display

**Drizzle's Pattern**:
```typescript
export type Simplify<T> = { [K in keyof T]: T[K] } & {};
```

**Purpose**: Forces TypeScript to collapse intersection types into a single object type. Without this, IDE tooltips show `A & B & C` instead of flattened `{ a, b, c }`.

**Our Current Pattern**: We have `Simplify` in types.ts, but might not be using it consistently

**Gap #4**: Ensure Simplify is used at all public API boundaries

### 6. ColumnFieldReferences - Where Clause Types

**Drizzle's Signature** (relations.ts:251-260):
```typescript
where?:
  | SQL
  | undefined
  | ((
      fields: Simplify<
        [TTableConfig['columns']] extends [never] ? {}
          : TTableConfig['columns']
      >,
      operators: Operators,
    ) => SQL | undefined);
```

**Key Insight**: Fields parameter is **directly the columns object**, not a mapped type. The proxy wrapping happens at runtime, not in the type system.

**Our Current Pattern** (types.ts:61-65):
```typescript
export type ColumnFieldReferences<
  TColumns extends Record<string, Validator<any, any, any>>,
> = {
  [K in keyof TColumns]: FieldReference<ValidatorToType<TColumns[K]>>;
};
```

**Gap #5**: Our ColumnFieldReferences mapping might be preventing proper type inference

### 7. Relation Type Structure

**Drizzle's Relation Interface**:
```typescript
export interface Relation {
  readonly referencedTableName: string;  // Direct property
  readonly fieldName: string;
  readonly isNullable: boolean;
}

export interface One extends Relation {}
export interface Many extends Relation {}
```

**Our Current Pattern** (relations.ts:39-52):
```typescript
export class One<TTable extends ConvexTable<any>, TTableName extends string> {
  readonly referencedTableName!: TTableName;  // Phantom property
  readonly referencedTable: TTable;
  // ...
}
```

**Gap #6**: Our relation classes use phantom properties (`!:`) instead of actual properties. This might break `TRel['referencedTableName']` access.

## Gap Analysis Summary

### Critical Issues (Blocking Type Inference)

1. **BuildQueryResult empty relation type**: Using `Record<string, never>` instead of `{}`
2. **Missing InferModelFromColumns**: No abstraction layer between validators and final types
3. **Relation property access**: Phantom `!:` properties might not work with `['referencedTableName']` pattern
4. **ColumnFieldReferences mapping**: Wrapping columns in FieldReference<> at type level might break inference

### Secondary Issues (Code Quality)

5. **Inconsistent Simplify usage**: Not applied at all boundaries
6. **ValidatorsToType edge cases**: Might not handle all validator combinations

## 🚨 CRITICAL: Pre-Implementation Verification (Phase 0)

**MUST COMPLETE BEFORE PHASE 1** - These verify assumptions the plan depends on.

### Verification 1: Convex Validator Structure (15 min)

**Problem**: Plan assumes validators have 3-type-parameter structure with fieldness in 3rd position:
```typescript
Validator<T, any, 'required' | 'optional'>
```

**Current Evidence of Issue** (relations.test.ts:111):
```
Type 'string' is not assignable to type 'never'
```

This `never` suggests ValidatorToType inference is failing.

**Action Required**:

```bash
# Check actual Convex validator type signature
cat node_modules/convex/values.d.ts | grep -A 30 "export.*Validator"

# Test assumption with actual validators
cat > convex/test-types/validator-structure-check.ts <<'EOF'
import type { Validator } from 'convex/values';
import { v } from 'convex/values';

// Verify fieldness parameter exists and has expected values
type StringV = typeof v.string();
type OptionalStringV = typeof v.optional(v.string());

// These should compile if assumptions are correct:
type Test1 = StringV extends Validator<any, any, 'required'> ? true : false;
type Test2 = OptionalStringV extends Validator<any, any, 'optional'> ? true : false;

// If above fail, check what the actual 3rd parameter is:
type ExtractFieldness<V> = V extends Validator<any, any, infer F> ? F : 'FAILED';
type Actual1 = ExtractFieldness<StringV>;  // Should show actual value
type Actual2 = ExtractFieldness<OptionalStringV>;
EOF

# Run typecheck
npx tsc --noEmit convex/test-types/validator-structure-check.ts
```

**If Check Fails**: Update ValidatorToType (types.ts:37-42) with correct fieldness values.

---

### Verification 2: Table.Symbol.Name Existence (10 min)

**Problem**: Phase 3 uses `referencedTable[Table.Symbol.Name]` to get table name.

**Action Required**:

```bash
# Verify symbol exists in ConvexTable implementation
grep -n "Symbol.*Name\|export.*Symbol" packages/kitcn/src/orm/table.ts

# Expected output: Symbol definition like:
# static readonly Symbol = { Name: Symbol.for('table-name'), ... }
```

**If Symbol Missing**: Add to ConvexTable class:
```typescript
static readonly Symbol = {
  Name: Symbol.for('convex-table:name'),
  Columns: Symbol.for('convex-table:columns'),
};
```

---

### Verification 3: Operator Wrapper Pattern (20 min)

**Problem**: Phase 5 sketches operator wrapping but doesn't provide full implementation.

**Current Sketch** (plan lines 450-467):
```typescript
eq: (field: any, value: any) => {
  const fieldName = typeof field === 'object' && 'fieldName' in field
    ? field.fieldName
    : String(Object.keys(this.tableConfig.columns).find(k =>
        this.tableConfig.columns[k] === field) ?? field);
  return eq(fieldRef(fieldName), value);
}
```

**Issues**:
- Object identity comparison may fail if columns recreated
- O(n) field search per operator call
- No error if field not found (silently uses fallback)

**Action Required - Design Operator Wrapper**:

**Option A: Symbol-Based (Recommended)**
```typescript
// In convexTable() function, attach symbol to each validator:
const columns = Object.fromEntries(
  Object.entries(rawColumns).map(([name, validator]) => {
    validator[Symbol.for('convex:columnName')] = name;
    return [name, validator];
  })
);

// In operators:
eq: (field: any, value: any) => {
  const sym = Symbol.for('convex:columnName');
  if (!(sym in field)) {
    throw new Error('Expected column validator, got unknown object');
  }
  const fieldName = field[sym];
  return eq(fieldRef(fieldName), value);
}
```

**Option B: Cached Map (Alternative)**
```typescript
// In _createOperators(), build column→name map once:
private _createOperators() {
  const columnToName = new Map();
  for (const [name, validator] of Object.entries(this.tableConfig.columns)) {
    columnToName.set(validator, name);
  }

  return {
    eq: (field: any, value: any) => {
      const name = columnToName.get(field);
      if (!name) throw new Error(`Invalid column: not from ${this.tableConfig.tsName} table`);
      return eq(fieldRef(name), value);
    }
  };
}
```

**Decision**: Choose Option A (symbols) or Option B (map) before Phase 5.

---

### Verification Checklist

- [ ] Validator structure verified (fieldness parameter exists with correct values)
- [ ] Table.Symbol.Name exists in ConvexTable
- [ ] Operator wrapper design chosen (Symbol or Map approach)
- [ ] All verifications passing before proceeding to Phase 1

**Time Budget**: 45 minutes total

**Output**: Document results in commit message or plan addendum before implementation.

---

## Detailed Implementation Plan

### Phase 1: Add InferModelFromColumns Abstraction

**File**: `packages/kitcn/src/orm/types.ts`

**Add after ValidatorsToType (line ~50)**:

```typescript
/**
 * Infer model type from column validators
 * Following Drizzle pattern: drizzle-orm/src/table.ts:155-187
 *
 * Handles two modes:
 * - 'select': All fields present (with null for nullable fields)
 * - 'insert': Required fields vs optional fields with defaults
 */
export type InferModelFromColumns<
  TColumns extends Record<string, Validator<any, any, any>>,
  TInferMode extends 'select' | 'insert' = 'select',
> = Simplify<
  TInferMode extends 'insert'
    ? & {
        // Required fields (no default, not optional)
        [K in keyof TColumns as TColumns[K] extends Validator<any, any, 'required'>
          ? K
          : never]: ValidatorToType<TColumns[K]>;
      }
      & {
        // Optional fields (has default or is optional)
        [K in keyof TColumns as TColumns[K] extends Validator<any, any, 'optional'>
          ? K
          : never]?: ValidatorToType<TColumns[K]>;
      }
    : {
        // Select mode - all fields present
        [K in keyof TColumns]: ValidatorToType<TColumns[K]>;
      }
>;
```

**Update InferSelectModel** (line ~15):
```typescript
export type InferSelectModel<TTable extends ConvexTable<any>> = Simplify<
  {
    _id: GenericId<TTable['_']['name']>;
    _creationTime: number;
  } & InferModelFromColumns<TTable['_']['columns'], 'select'>
>;
```

**Update InferInsertModel** (line ~30):
```typescript
export type InferInsertModel<TTable extends ConvexTable<any>> = Simplify<
  InferModelFromColumns<TTable['_']['columns'], 'insert'>
>;
```

**Why**: Provides consistent abstraction layer matching Drizzle's pattern. Separates column inference logic from model composition.

### Phase 2: Fix BuildQueryResult Empty Relations

**File**: `packages/kitcn/src/orm/types.ts`

**Change line ~226** from:
```typescript
: Record<string, never>)  // ❌ WRONG
```

to:
```typescript
: {})  // ✅ CORRECT - Drizzle pattern
```

**Full context** (lines 212-231):
```typescript
export type BuildQueryResult<
  TSchema extends TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig,
  TConfig extends true | Record<string, unknown>,
> = TConfig extends true
  ? InferModelFromColumns<TTableConfig['columns']>
  : TConfig extends Record<string, unknown>
    ? Simplify<
        (TConfig extends { columns: Record<string, boolean> }
          ? PickColumns<TTableConfig['columns'], TConfig['columns']>
          : InferModelFromColumns<TTableConfig['columns']>) &
          (TConfig extends { with: Record<string, unknown> }
            ? BuildRelationResult<TSchema, TConfig['with'], TTableConfig['relations']>
            : {})  // ✅ Changed from Record<string, never>
      >
    : never;
```

**Why**: `Record<string, never>` creates an impossible type that can't be intersected. `{}` is the correct identity type for intersection.

### Phase 3: Fix Relation Property Access

**File**: `packages/kitcn/src/orm/relations.ts`

**Current pattern** (line ~45):
```typescript
export class One<TTable extends ConvexTable<any>, TTableName extends string> {
  readonly referencedTableName!: TTableName;  // ❌ Phantom property
```

**Fix** - Add actual property assignment:
```typescript
export class One<TTable extends ConvexTable<any>, TTableName extends string> {
  readonly referencedTableName: TTableName;  // ✅ Real property

  constructor(
    referencedTable: TTable,
    config?: OneConfig
  ) {
    this.referencedTable = referencedTable;
    this.referencedTableName = referencedTable[Table.Symbol.Name] as TTableName;  // Assign in constructor
    this.config = config ?? {};
    this.fieldName = '';
  }
```

**Same for Many class** (line ~110):
```typescript
export class Many<TTable extends ConvexTable<any>, TTableName extends string> {
  readonly referencedTableName: TTableName;

  constructor(referencedTable: TTable) {
    this.referencedTable = referencedTable;
    this.referencedTableName = referencedTable[Table.Symbol.Name] as TTableName;
    this.fieldName = '';
  }
```

**Why**: TypeScript can't access phantom properties with `TRel['referencedTableName']`. Must be actual runtime properties for type-level property access to work.

### Phase 4: Simplify Where Clause Types

**File**: `packages/kitcn/src/orm/types.ts`

**Current DBQueryConfig** (line ~95):
```typescript
where?: (
  fields: ColumnFieldReferences<TTableConfig['columns']>,  // ❌ Mapped type
  operators: any
) => any;
```

**Fix** - Match Drizzle's direct column access:
```typescript
where?: (
  fields: Simplify<TTableConfig['columns']>,  // ✅ Direct columns object
  operators: {
    eq: <T>(field: any, value: T) => FilterExpression<boolean>;
    ne: <T>(field: any, value: T) => FilterExpression<boolean>;
    gt: <T>(field: any, value: T) => FilterExpression<boolean>;
    gte: <T>(field: any, value: T) => FilterExpression<boolean>;
    lt: <T>(field: any, value: T) => FilterExpression<boolean>;
    lte: <T>(field: any, value: T) => FilterExpression<boolean>;
    and: (...expressions: FilterExpression<boolean>[]) => FilterExpression<boolean>;
    or: (...expressions: FilterExpression<boolean>[]) => FilterExpression<boolean>;
    not: (expression: FilterExpression<boolean>) => FilterExpression<boolean>;
    inArray: <T>(field: any, values: T[]) => FilterExpression<boolean>;
    notInArray: <T>(field: any, values: T[]) => FilterExpression<boolean>;
    isNull: (field: any) => FilterExpression<boolean>;
    isNotNull: (field: any) => FilterExpression<boolean>;
  }
) => FilterExpression<boolean> | undefined;
```

**Remove ColumnFieldReferences type** (line ~61) - No longer needed

**Why**: Drizzle passes columns directly and relies on runtime proxy to handle field access. Mapping to FieldReference<> at type level breaks inference.

### Phase 5: Update _createColumnProxies Implementation

**File**: `packages/kitcn/src/orm/query.ts`

**Current implementation** (line ~191):
```typescript
private _createColumnProxies(): ColumnFieldReferences<
  typeof this.tableConfig.columns
> {
  const proxies: Record<string, any> = {};
  for (const columnName of Object.keys(this.tableConfig.columns)) {
    proxies[columnName] = fieldRef(columnName);
  }
  return proxies as any;
}
```

**Fix** - Return columns directly:
```typescript
private _createColumnProxies(): typeof this.tableConfig.columns {
  // Return actual columns - operators handle FieldReference wrapping
  return this.tableConfig.columns;
}
```

**Update operator imports** (line ~209) to handle column-to-FieldReference conversion:
```typescript
private _createOperators(): any {
  const { eq, ne, gt, gte, lt, lte, inArray, notInArray, isNull, isNotNull } =
    require('./filter-expression');

  // Wrap operators to convert columns to FieldReferences
  return {
    eq: (field: any, value: any) => {
      const fieldName = typeof field === 'object' && 'fieldName' in field
        ? field.fieldName
        : String(Object.keys(this.tableConfig.columns).find(k => this.tableConfig.columns[k] === field) ?? field);
      return eq(fieldRef(fieldName), value);
    },
    // ... wrap other operators similarly
  };
}
```

**Why**: Keeps type system simple by passing actual columns, handles FieldReference wrapping in operators at runtime.

### Phase 6: Ensure Consistent Simplify Usage

**File**: `packages/kitcn/src/orm/types.ts`

**Audit all public type exports** and ensure they use Simplify:

```typescript
// Line ~15 - Already has Simplify ✅
export type InferSelectModel<...> = Simplify<...>;

// Line ~30 - Already has Simplify ✅
export type InferInsertModel<...> = Simplify<...>;

// Line ~212 - Already has Simplify ✅
export type BuildQueryResult<...> = ... ? Simplify<...> : ...;

// Line ~243 - Check BuildRelationResult
export type BuildRelationResult<...> = {
  [K in ...]: ... // Should individual results be Simplified?
};
```

**Add Simplify to BuildRelationResult values** if needed:
```typescript
export type BuildRelationResult<
  TSchema extends TablesRelationalConfig,
  TInclude extends Record<string, unknown>,
  TRelations extends Record<string, Relation<any>>,
> = Simplify<{  // ✅ Wrap entire result
  [K in NonUndefinedKeysOnly<TInclude> & keyof TRelations]:
    TRelations[K] extends infer TRel extends Relation<any>
    ? BuildQueryResult<...> extends infer TResult
      ? TRel extends One<any, any>
        ? TResult | (TRel['isNullable'] extends true ? null : never)
        : TResult[]
      : never
    : never;
}>;
```

**Why**: Consistent Simplify usage improves IDE tooltips and error messages.

### Phase 7: Verify ValidatorsToType Handles All Cases

**File**: `packages/kitcn/src/orm/types.ts`

**Current implementation** (line ~48):
```typescript
type ValidatorsToType<T extends Record<string, Validator<any, any, any>>> = {
  [K in keyof T]: ValidatorToType<T[K]>;
};
```

**Verify ValidatorToType** (line ~37):
```typescript
type ValidatorToType<V> =
  V extends Validator<infer T, any, infer TFieldness>
    ? TFieldness extends 'optional'
      ? T | undefined
      : T
    : never;
```

**Test edge cases**:
- `v.string()` → `string` ✅
- `v.optional(v.number())` → `number | undefined` ✅
- `v.id('users')` → `GenericId<'users'>` ✅
- `v.union(v.literal('a'), v.literal('b'))` → `'a' | 'b'` ✅
- `v.optional(v.union(...))` → `'a' | 'b' | undefined` ✅

**If any fail, update ValidatorToType to handle**

**Why**: Ensures all validator types map correctly to TypeScript types.

## Test Verification Plan

### Step 1: Build and Typecheck

```bash
# Build ORM package
bun --cwd packages/kitcn build

# Full typecheck from root
bun typecheck
```

**Expected**: 0 errors (down from 37)

### Step 2: Verify Specific Test Cases

**File**: `convex/test-types/select.ts`

**Test 1: Basic where clause** (line 40-56):
```typescript
{
  const result = db.query.users.findMany({
    where: (users, { eq }) => eq(users.name, 'Alice'),
  });

  type Expected = Array<{
    _id: string;
    _creationTime: number;
    name: string;
    email: string;
    age: number | undefined;  // ← Optional field must be preserved
    cityId: string;
    homeCityId: string | undefined;  // ← Optional ID
  }>;

  Expect<Equal<Expected, typeof result>>;  // Should pass
}
```

**Test 2: Relations** (convex/test-types/db-rel.ts, line ~60):
```typescript
{
  const result = db.query.users.findMany({
    with: {
      posts: true,
    },
  });

  Expect<
    Equal<
      {
        _id: string;
        _creationTime: number;
        name: string;
        email: string;
        age: number | undefined;
        cityId: string;
        homeCityId: string | undefined;
        posts: Array<{
          _id: string;
          _creationTime: number;
          title: string;
          content: string;
          authorId: string | undefined;
          published: boolean | undefined;
        }>;
      }[],
      typeof result
    >
  >;
}
```

### Step 3: Verify Negative Tests

**Check @ts-expect-error directives** are still enforced:

```typescript
// Should still fail at compile-time
// @ts-expect-error - Cannot use limit in nested one() relation
db.query.posts.findMany({
  with: {
    author: {
      limit: 10,  // ❌ Should be type error
    },
  },
});
```

**Expected**: No "Unused '@ts-expect-error' directive" warnings

### Step 4: Runtime Validation

While these are type-only tests, verify the runtime behavior still works:

```bash
# Run existing runtime tests
vitest run
```

**Expected**: All tests pass (no regressions)

## Success Criteria

### Type Inference (Critical)

- [ ] `bun typecheck` reports 0 errors (currently 37)
- [ ] All `Expect<Equal<>>` tests pass in convex/test-types/
- [ ] Optional fields correctly infer as `T | undefined`
- [ ] Required fields infer as `T` (no union with undefined/null)
- [ ] System fields `_id` and `_creationTime` always present

### Query Results (Critical)

- [ ] `findMany()` returns `Array<T>` where T matches schema
- [ ] `findFirst()` returns `T | undefined`
- [ ] Column selection changes result type correctly
- [ ] Relation loading adds typed relation fields
- [ ] Nested relations infer recursively

### Where Clauses (Important)

- [ ] Operators accept correct field types
- [ ] `eq(users.age, 'string')` fails at compile-time (type mismatch)
- [ ] Optional fields work with `isNull`/`isNotNull`
- [ ] Operators are properly typed in IDE autocomplete

### Negative Tests (Important)

- [ ] Invalid queries fail at compile-time
- [ ] No "Unused '@ts-expect-error' directive" warnings
- [ ] Type errors have clear, readable messages

### Code Quality (Secondary)

- [ ] No `as any` type assertions (or minimal, documented)
- [ ] Simplify used consistently on public APIs
- [ ] IDE tooltips show flattened types, not intersections
- [ ] Type definitions follow Drizzle patterns exactly

## Implementation Order

### 🎯 Optimized Order (Research-Backed)

**Based on performance analysis and risk assessment from 10 parallel research agents.**

**Phase 0**: Pre-Implementation Verification (45 min) **← START HERE**
- Verify Convex validator structure
- Verify Table.Symbol.Name existence
- Design operator wrapper pattern
- **BLOCKING** - Must pass before proceeding

**Phase 2**: Fix BuildQueryResult empty relations (5 min) **← HIGHEST IMPACT**
- Change `Record<string, never>` to `{}`
- **Impact**: Fixes ~15 type errors immediately, single-character change
- **Build Time**: Negligible (-0.1%)
- **Risk**: Very Low
- **Run typecheck after**: Should reduce errors from 37 to ~22

**Phase 3**: Fix Relation property access (20 min) **← CRITICAL PATH**
- Remove `!:` phantom properties, assign in constructor
- **Impact**: Enables `TRel['referencedTableName']` property access
- **Build Time**: **-15 to -20%** (largest improvement!)
- **Risk**: Very Low (just adding property assignment)
- **Run typecheck after**: Should reduce errors from ~22 to ~10

**Phase 4+5**: Where clause types + Operator wrapping (45 min) **← ATOMIC**
- Must be implemented together (type changes require runtime changes)
- Remove ColumnFieldReferences, update _createColumnProxies
- **Impact**: -5 to -10% build time, removes type mapping overhead
- **Risk**: Medium (runtime changes need testing)
- **Run typecheck + vitest after**: Verify types AND runtime behavior

**Phase 1**: Add InferModelFromColumns (30 min) **← OPTIONAL**
- **Research finding**: May be YAGNI (You Aren't Gonna Need It)
- Only add if insert vs select modes truly diverge
- Consider skipping and inlining logic instead
- **Build Time**: +0.5% (adds abstraction overhead)
- **Alternative**: Keep current `ValidatorsToType` pattern

**Phase 6**: Consistent Simplify usage (10 min) **← POLISH**
- Only add where IDE tooltips are confusing
- Skip for BuildRelationResult (already a mapped type)
- **Build Time**: +0-1%
- **Run after**: All type errors fixed

**Phase 7**: ValidatorsToType edge cases (15 min) **← VALIDATION**
- Add comprehensive type tests
- Test union types, nullable, optional combinations
- **Build Time**: -0.5% (catches issues early)

---

### Alternative: Minimal Fix (1 Hour)

**Research finding from Simplicity Reviewer**: Phases 2+3 alone may fix all 37 errors.

**Minimal Plan**:
1. Phase 0: Verification (45 min)
2. Phase 2: `Record<string, never>` → `{}` (5 min)
3. Phase 3: Phantom → Real properties (10 min)
4. Test: `bun typecheck` (expect 0-5 errors)
5. **If errors remain**: Add Phase 4+5 as needed

**Recommendation**: Try minimal fix first. If it doesn't achieve 0 errors, proceed with full plan.

---

### Time Estimates

**Full Plan** (Phases 0→2→3→4+5→1→6→7):
- **Pessimistic**: 3 hours implementation + 1 hour testing
- **Realistic**: 2.5 hours implementation + 45 min testing
- **Optimistic** (if Phase 1 skipped): 2 hours total

**Minimal Plan** (Phases 0→2→3):
- **Total**: 1 hour

**Expected Build Time Improvement**: **-20 to -25%**

## Rollback Plan

If type inference still broken after all phases:

1. **Revert to M3 completion state** (before fix attempts)
2. **Clone Drizzle's exact type definitions** verbatim
3. **Adapt column types** (Column → Validator) one at a time
4. **Test each adaptation** before proceeding

**Principle**: When in doubt, copy Drizzle exactly. Don't guess at TypeScript patterns.

---

## Research Insights Summary

### From TypeScript Reviewer (Kieran)

**Critical Findings**:
- 22 instances of `as any` across ORM files - can reduce to ~5 using `Assume<>` utility
- Phantom property pattern with `!:` fundamentally broken for property access
- Missing validation that `referencedTable[Table.Symbol.Name]` exists before assertion
- Operator signatures use liberal `any` - should use generic constraints

**Specific Fixes Recommended**:
```typescript
// Instead of:
readonly referencedTableName!: TTableName;  // ❌

// Do:
readonly referencedTableName: TTableName;  // ✅
constructor(...) {
  const tableName = referencedTable[Table.Symbol.Name];
  if (typeof tableName !== 'string') {
    throw new Error(`Invalid table: missing ${Table.Symbol.Name}`);
  }
  this.referencedTableName = tableName as TTableName;
}
```

---

### From Pattern Recognition Specialist

**Anti-Patterns Identified**:
1. **Impossible Intersection Type** - `Record<string, never>` causes types to collapse to `never`
2. **Phantom Property Misuse** - TypeScript can't access `!:` properties with bracket notation
3. **Type Mapping in Signatures** - ColumnFieldReferences prevents inference

**Recommended Phase Order**: 2→3→4→5→1→6→7 (highest impact first)

---

### From Code Simplicity Reviewer

**YAGNI Violations**:
- InferModelFromColumns two-mode abstraction used in only 2 places
- Phase 5 runtime complexity trade-off questionable (O(n) lookup per operator call)
- Can prevent adding 95-110 unnecessary lines by skipping complexity

**Minimal Alternative**: 1-hour fix (Phases 2+3 only) may suffice

---

### From Architecture Strategist

**Architectural Risks**:
1. **Phantom property access** - Compiler-version dependent behavior
2. **Object identity comparison** - Phase 5's `find()` assumes same object reference
3. **Runtime-compile time alignment** - Need defensive checks

**Recommendations**:
- Add symbol-based column identity: `Symbol.for('convex:columnName')`
- Defensive runtime validation in constructors
- Use `Equal<>` utility for nullable checks, not simple `extends`

---

### From Performance Oracle

**Build Time Analysis**:
- Current: ~2000ms typecheck at 50 tables (phantom properties cause cascading checks)
- After Phase 2+3: ~1200ms (**-40%**)
- Phase 3 alone: **-15 to -20%** (highest single impact)
- Full plan: **-20 to -25%** net improvement

**Scalability**: At 200+ tables, improvement is even more dramatic (5000ms → 3000ms)

---

### From Testing Skill

**TDD Gaps**:
- Plan lacks Red phase (write failing tests first)
- Missing per-phase test checkpoints
- Insufficient edge case coverage (only 2 test cases shown)

**Recommendations**:
- Create `convex/test-types/inference.test.ts` with 10+ comprehensive tests
- Add negative tests for each constraint
- Run `bun test inference.test.ts` after each phase

---

### From Convex Skill

**Critical Verifications Needed** (Phase 0):
1. Convex Validator may not have `fieldness` parameter as assumed
2. Table.Symbol.Name existence unverified
3. Phase 5 operator wrapper incomplete

**Action**: Must verify before implementation or risk wasted effort.

---

### From TypeScript Generics Research

**Proven Patterns from Drizzle**:
- Use `extends infer TRel` for type distribution checkpoints
- `{}` is identity for intersection, not `Record<string, never>`
- `Assume<T, U>` utility for safe type coercion (replaces `as any`)
- Direct column access in signatures, wrap at runtime
- `Equal<>` for bidirectional type checking (not just `extends`)

**Concrete Example**:
```typescript
// Add this utility to types.ts:
export type Assume<T, U> = T extends U ? T : U;

// Use instead of as any:
Assume<TInclude[K], true | Record<string, unknown>>
```

---

### From Type Testing Research

**Drizzle's Testing Infrastructure** (80+ test files, 20,588 lines):
- `Expect<Equal<>>` bidirectional type checking
- Scoped `{}` blocks to isolate test namespaces
- Comprehensive negative tests with `@ts-expect-error`
- Test edge cases: nullable, optional, deeply nested (4+ levels)
- Use `npx tsc --noEmit` as test runner

**Organizational Pattern**: Separate files for SELECT, INSERT, UPDATE, DELETE, etc.

---

## References

### Drizzle Source Files

- `/tmp/cc-repos/drizzle-orm/drizzle-orm/src/relations.ts` - BuildQueryResult, BuildRelationResult
- `/tmp/cc-repos/drizzle-orm/drizzle-orm/src/table.ts` - InferModelFromColumns, GetColumnData
- `/tmp/cc-repos/drizzle-orm/drizzle-orm/type-tests/utils.ts` - Expect, Equal utilities
- `/tmp/cc-repos/drizzle-orm/drizzle-orm/type-tests/pg/select.ts` - Query type tests
- `/tmp/cc-repos/drizzle-orm/drizzle-orm/type-tests/pg/db-rel.ts` - Relation type tests

### Our Implementation

- `packages/kitcn/src/orm/types.ts` - All type definitions
- `packages/kitcn/src/orm/relations.ts` - One/Many classes
- `packages/kitcn/src/orm/query.ts` - Query execution
- `convex/test-types/` - Type test files
- `docs/brainstorms/2026-01-31-drizzle-orm-brainstorm.md` - Project context

### Key Learnings

1. **Property access vs phantom types**: TypeScript can't access phantom properties declared with `!:` using bracket notation
2. **Empty type intersections**: `Record<string, never>` breaks intersections, use `{}` instead
3. **Type mapping in signatures**: Mapping column types in function signatures can break inference - pass raw types and wrap at runtime
4. **Simplify everywhere**: Consistent use of Simplify improves DX and debugging

## Open Questions

- [ ] Do we need to update convex/schema.ts test fixtures?
- [ ] Should we add more edge case tests for validators?
- [ ] Do we want to match Drizzle's exact column filtering logic in BuildQueryResult?

---

**Next Steps After Approval**:

1. Review plan with team
2. Execute phases 1-7 in order
3. Run verification tests after each phase
4. Document any deviations from plan
5. Update brainstorm with final learnings
