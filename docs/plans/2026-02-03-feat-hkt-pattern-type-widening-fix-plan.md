---
title: Implement HKT Pattern to Fix Type Widening in Query Results
type: feat
date: 2026-02-03
module: kitcn ORM
component: Type System
priority: high
estimated_effort: 8-10 hours
tags: [typescript, hkt-pattern, drizzle-mirroring, type-inference, query-builder]
related_docs:
  - "docs/solutions/typescript-patterns/phantom-type-brand-preservation-20260202.md"
  - "docs/solutions/typescript-patterns/select-ts-type-inference-drizzle-patterns-20260202.md"
  - "docs/brainstorms/2026-01-31-typescript-patterns-from-drizzle-and-ents.md"
enhancement_date: 2026-02-03
enhanced_by: /deepen-plan with 5 parallel research agents
---

# Implement HKT Pattern to Fix Type Widening in Query Results

---

## 🔬 Enhancement Summary (Added 2026-02-03)

**Research Conducted:**
- ✅ Deep Drizzle ORM comparison (cloned repo at `/tmp/cc-repos/drizzle-orm`)
- ✅ GelRelationalQuery architecture analysis (two-layer pattern)
- ✅ TypeScript conditional distribution research (official docs)
- ✅ Institutional learnings review (phantom brands, GetColumnData patterns)
- ✅ Pattern recognition analysis (naming, constraints, risks)

**Root Cause Identified:**
The type widening issue has **6 specific causes** (not just missing HKT):

1. **🔴 CRITICAL: `as any` casts** at [query-builder.ts:82](../../packages/kitcn/src/orm/query-builder.ts#L82), [114](../../packages/kitcn/src/orm/query-builder.ts#L114), [154](../../packages/kitcn/src/orm/query-builder.ts#L154)
   - These completely destroy type information when instantiating `GelRelationalQuery`
   - Type system cannot preserve specific table types through cast

2. **Missing `KnownKeysOnly` wrapper** on config parameters
   - Drizzle wraps all config objects: `KnownKeysOnly<TConfig, DBQueryConfig<...>>`
   - Prevents extra properties from widening the inferred type

3. **Missing `TIsRoot` generic parameter** in DBQueryConfig
   - Drizzle uses this to optimize type instantiation depth
   - Constrains valid config shapes at type level

4. **Missing `Simplify` wrapper with `[never]` guard** on fields parameter
   - Drizzle pattern: `Simplify<[TConfig["columns"]] extends [never] ? {} : TConfig["columns"]>`
   - Prevents key widening when fields is undefined

5. **HKT `_` interface declared but never used**
   - We added the interface but methods don't reference it
   - Type resolution bypasses the anchor entirely

6. **Missing `KnownKeysOnly` utility** implementation
   - Need to add this utility to `internal/types.ts`
   - Filters config properties to known keys only

**Updated Estimates:**
- Original: 6-8 hours
- **Enhanced: 8-10 hours** (6 fixes instead of 1)

**Key Files to Modify:**
- `packages/kitcn/src/internal/types.ts` (add KnownKeysOnly)
- `packages/kitcn/src/orm/types.ts` (add TIsRoot to DBQueryConfig)
- `packages/kitcn/src/orm/query-builder.ts` (remove as any, use HKT, add wrappers)

---

## Overview

Implement Drizzle ORM's Higher-Kinded Type (HKT) pattern to fix type widening issue where query results are incorrectly typed as unions of all table types instead of specific table types.

**Current Behavior**: `db.query.users.findMany()` returns `(UserType | PostType)[] | UserType | PostType | null`

**Expected Behavior**: `db.query.users.findMany()` returns `UserType[]`

**Root Cause**: Combination of 6 issues (see Enhancement Summary above). Primary culprit: `as any` casts destroy type information at GelRelationalQuery instantiation. TypeScript cannot preserve specific table types through the cast.

**Impact**:
- ✅ **Runtime**: Works perfectly (190/190 tests passing)
- ❌ **Types**: 31 type errors showing union widening (cosmetic only)

## Problem Statement

### Current Type Widening Issue

When using the query builder API, TypeScript infers result types as unions of all possible table types:

```typescript
// What we write:
const users = await db.query.users.findMany({
  with: { posts: true }
});

// What TypeScript infers (WRONG):
type Users = (UserType | PostType)[] | UserType | PostType | null

// What we want:
type Users = UserType[]
```

### Previous Attempts (Partial Success)

Applied 3 of 5 Drizzle patterns:
1. ✅ `K & string` literal anchor - [database.ts:143](../../packages/kitcn/src/orm/database.ts#L143)
2. ✅ `& {}` type seals - [Simplify](../../packages/kitcn/src/internal/types.ts#L15), [Merge](../../packages/kitcn/src/orm/types.ts#L19)
3. ✅ Array wrapping at type level - Already had this
4. ❌ **Missing: HKT pattern with readonly `_` interface** ← The critical piece
5. ✅ IsUnion detection - Not needed yet

**Result**: Type widening persists despite simpler fixes. HKT pattern is mandatory.

### Why HKT Pattern is Required

From Drizzle analysis, the **readonly `_` interface** creates a "type anchor" that prevents TypeScript from re-evaluating or widening types as they flow through the query builder. Without this:

1. TypeScript evaluates `TSchema[K]` across all K values
2. Distributive conditional behavior causes union widening
3. Result type becomes union of all possible table results
4. IDE autocomplete shows incorrect suggestions

With HKT pattern:
1. Result type stored in immutable `_` property
2. TypeScript cannot re-evaluate the anchored type
3. Specific table type preserved throughout chain
4. IDE autocomplete works correctly

## Proposed Solution

### Implementation Strategy (3 Phases + 1 Prep)

#### Phase 0: Add Missing Utilities (2 hours) **[NEW]**

Add utilities that Drizzle uses alongside HKT pattern.

**Files to Modify**:
- `packages/kitcn/src/internal/types.ts` (add KnownKeysOnly)
- `packages/kitcn/src/orm/types.ts` (update DBQueryConfig)

**Step 1: Add KnownKeysOnly Utility**

```typescript
// packages/kitcn/src/internal/types.ts

/**
 * Filter object type to only known keys from reference type.
 * Pattern from Drizzle: drizzle-orm/src/utils.ts:151-156
 *
 * Prevents extra properties from widening inferred types.
 *
 * @example
 * type Config = { name: string; age: number };
 * type Input = { name: string; age: number; extra: boolean };
 * type Filtered = KnownKeysOnly<Input, Config>; // { name: string; age: number }
 */
export type KnownKeysOnly<T, K> = {
  [P in keyof T as P extends keyof K ? P : never]: T[P];
};
```

**Step 2: Add TIsRoot Parameter to DBQueryConfig**

```typescript
// packages/kitcn/src/orm/types.ts

// BEFORE:
export type DBQueryConfig<
  TRelationType extends 'one' | 'many' = 'one' | 'many',
  TSchema extends TablesRelationalConfig = TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig = TableRelationalConfig,
> = {
  // ...
};

// AFTER: Add TIsRoot parameter
export type DBQueryConfig<
  TRelationType extends 'one' | 'many' = 'one' | 'many',
  TIsRoot extends boolean = boolean,  // ✅ NEW: Constrains valid config shapes
  TSchema extends TablesRelationalConfig = TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig = TableRelationalConfig,
> = {
  columns?: TIsRoot extends true
    ? Simplify<
        [TConfig['columns']] extends [never]
          ? {}
          : TConfig['columns']
      >
    : undefined;  // ✅ NEW: Only root queries can select columns
  with?: TIsRoot extends true
    ? Record<string, DBQueryConfig<'one' | 'many', false, TSchema, any>>
    : undefined;  // ✅ NEW: Nested relations cannot have nested with
  where?: // ... existing
  orderBy?: // ... existing
  limit?: TRelationType extends 'many' ? number : undefined;
  offset?: TRelationType extends 'many' ? number : undefined;
};
```

**Verification**:
- [ ] TypeScript compiles without errors
- [ ] `KnownKeysOnly` utility tests pass
- [ ] DBQueryConfig accepts valid configs
- [ ] DBQueryConfig rejects invalid configs (nested with in non-root)

---

#### Phase 1: Add HKT Base Type & Interface (2 hours)

Create HKT foundation following Drizzle's pattern exactly.

**Files to Modify**:
- `packages/kitcn/src/orm/types.ts` (add HKT base types)
- `packages/kitcn/src/orm/query-builder.ts` (add `_` interface)

**New Types to Add** (already done, but document usage):

```typescript
// packages/kitcn/src/orm/types.ts

/**
 * HKT Base Type for Query Builder
 * Pattern from Drizzle: drizzle-orm/src/pg-core/query-builders/select.types.ts:180-199
 */
export interface RelationalQueryBuilderHKT {
  readonly _type: unknown;
}

/**
 * HKT Kind Resolution
 * Extracts concrete query builder type from HKT base
 */
export type RelationalQueryBuilderKind<
  T extends RelationalQueryBuilderHKT,
  TSchema extends TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig,
  TResult = BuildQueryResult<TSchema, TTableConfig, true>[]
> = (T & {
  schema: TSchema;
  tableConfig: TTableConfig;
  result: TResult;
})['_type'];
```

**Update RelationalQueryBuilder**:

```typescript
// packages/kitcn/src/orm/query-builder.ts

export class RelationalQueryBuilder<
  TSchema extends TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig,
> {
  // ✅ ADD: Readonly interface for type anchoring
  declare readonly _: {
    readonly schema: TSchema;
    readonly tableConfig: TTableConfig;
    readonly result: BuildQueryResult<TSchema, TTableConfig, true>[];
  };

  constructor(
    private schema: TSchema,  // ✅ RENAME: was fullSchema (see findings.md)
    private tableConfig: TTableConfig,
    private edgeMetadata: EdgeMetadata[],
    private db: GenericDatabaseReader<any>,
    private allEdges?: EdgeMetadata[]
  ) {
    // Runtime: no changes needed
    // The _ property is purely for TypeScript, never initialized
  }

  // ... existing methods
}
```

**Verification**:
- [ ] TypeScript compiles without errors
- [ ] `RelationalQueryBuilder` has `_` property visible in IDE hover
- [ ] No runtime behavior changes (190 tests still pass)

---

#### Phase 2: Remove `as any` Casts & Use HKT (3-4 hours) **[ENHANCED]**

**THIS IS THE CRITICAL PHASE** - Removing `as any` casts is what actually fixes type widening.

**Files to Modify**:
- `packages/kitcn/src/orm/query-builder.ts` (fix 3 methods)
- `packages/kitcn/src/orm/query.ts` (update GelRelationalQuery constructor)

**Step 1: Update GelRelationalQuery to Preserve Generic Types**

```typescript
// packages/kitcn/src/orm/query.ts

// BEFORE:
export class GelRelationalQuery<TSelection> {
  constructor(
    private fullSchema: any,  // ❌ Loses type information
    private tableConfig: any,  // ❌ Loses type information
    // ...
  ) {}
}

// AFTER: Add generic parameters
export class GelRelationalQuery<
  TSchema extends TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig,
  TSelection,
> {
  constructor(
    private schema: TSchema,  // ✅ Preserves schema type
    private tableConfig: TTableConfig,  // ✅ Preserves table config type
    private mode: 'many' | 'first' | 'pagination',
    private edgeMetadata: EdgeMetadata[],
    private db: GenericDatabaseReader<any>,
    private config?: any,  // TODO: Type this with KnownKeysOnly
    private paginationConfig?: { cursor: string | null; numItems: number },
    private allEdges?: EdgeMetadata[]
  ) {}

  // ... rest of implementation
}
```

**Step 2: Fix findMany Method (Remove `as any`)**

```typescript
// packages/kitcn/src/orm/query-builder.ts:71-82

// BEFORE:
findMany<TConfig extends DBQueryConfig<'many', TSchema, TTableConfig>>(
  config?: TConfig
): GelRelationalQuery<BuildQueryResult<TSchema, TTableConfig, TConfig>[]> {
  return new GelRelationalQuery(
    this.fullSchema,
    this.tableConfig,
    'many',
    this.edgeMetadata,
    this.db,
    config,
    undefined,
    this.allEdges
  ) as any;  // ❌ DESTROYS TYPE INFORMATION
}

// AFTER: Remove cast, use KnownKeysOnly, reference HKT
findMany<
  TConfig extends DBQueryConfig<'many', true, TSchema, TTableConfig>
>(
  config?: KnownKeysOnly<TConfig, DBQueryConfig<'many', true, TSchema, TTableConfig>>
): GelRelationalQuery<
  TSchema,
  TTableConfig,
  BuildQueryResult<TSchema, TTableConfig, TConfig>[]
> {
  return new GelRelationalQuery<
    TSchema,
    TTableConfig,
    BuildQueryResult<TSchema, TTableConfig, TConfig>[]
  >(
    this.schema,
    this.tableConfig,
    'many',
    this.edgeMetadata,
    this.db,
    config,
    undefined,
    this.allEdges
  );  // ✅ NO CAST - Type information preserved
}
```

**Step 3: Fix findFirst Method (Remove `as any`)**

```typescript
// packages/kitcn/src/orm/query-builder.ts:101-116

// BEFORE:
findFirst<TConfig extends DBQueryConfig<'one', TSchema, TTableConfig>>(
  config?: TConfig
): GelRelationalQuery<
  BuildQueryResult<TSchema, TTableConfig, TConfig> | null
> {
  return new GelRelationalQuery(
    this.fullSchema,
    this.tableConfig,
    'first',
    this.edgeMetadata,
    this.db,
    config,
    undefined,
    this.allEdges
  ) as any;  // ❌ DESTROYS TYPE INFORMATION
}

// AFTER: Remove cast, use KnownKeysOnly
findFirst<
  TConfig extends DBQueryConfig<'one', true, TSchema, TTableConfig>
>(
  config?: KnownKeysOnly<TConfig, DBQueryConfig<'one', true, TSchema, TTableConfig>>
): GelRelationalQuery<
  TSchema,
  TTableConfig,
  BuildQueryResult<TSchema, TTableConfig, TConfig> | null
> {
  return new GelRelationalQuery<
    TSchema,
    TTableConfig,
    BuildQueryResult<TSchema, TTableConfig, TConfig> | null
  >(
    this.schema,
    this.tableConfig,
    'first',
    this.edgeMetadata,
    this.db,
    config,
    undefined,
    this.allEdges
  );  // ✅ NO CAST - Type information preserved
}
```

**Step 4: Fix paginate Method (Remove `as any`)**

```typescript
// packages/kitcn/src/orm/query-builder.ts:134-154

// BEFORE:
paginate<TConfig extends DBQueryConfig<'many', TSchema, TTableConfig>>(
  config?: TConfig,
  paginationConfig?: { cursor: string | null; numItems: number }
): GelRelationalQuery<{
  page: BuildQueryResult<TSchema, TTableConfig, TConfig>[];
  continueCursor: string | null;
  isDone: boolean;
}> {
  return new GelRelationalQuery(
    this.fullSchema,
    this.tableConfig,
    'pagination',
    this.edgeMetadata,
    this.db,
    config,
    paginationConfig,
    this.allEdges
  ) as any;  // ❌ DESTROYS TYPE INFORMATION
}

// AFTER: Remove cast, use KnownKeysOnly
paginate<
  TConfig extends DBQueryConfig<'many', true, TSchema, TTableConfig>
>(
  config?: KnownKeysOnly<TConfig, DBQueryConfig<'many', true, TSchema, TTableConfig>>,
  paginationConfig?: { cursor: string | null; numItems: number }
): GelRelationalQuery<
  TSchema,
  TTableConfig,
  {
    page: BuildQueryResult<TSchema, TTableConfig, TConfig>[];
    continueCursor: string | null;
    isDone: boolean;
  }
> {
  return new GelRelationalQuery<
    TSchema,
    TTableConfig,
    {
      page: BuildQueryResult<TSchema, TTableConfig, TConfig>[];
      continueCursor: string | null;
      isDone: boolean;
    }
  >(
    this.schema,
    this.tableConfig,
    'pagination',
    this.edgeMetadata,
    this.db,
    config,
    paginationConfig,
    this.allEdges
  );  // ✅ NO CAST - Type information preserved
}
```

**Step 5: Update DatabaseWithQuery (No Changes Needed)**

The mapped type already works correctly once the casts are removed:

```typescript
// packages/kitcn/src/orm/database.ts:25-32

export type DatabaseWithQuery<TSchema extends TablesRelationalConfig> =
  GenericDatabaseReader<any> & {
    query: TSchema extends Record<string, never>
      ? { error: 'Schema is empty - did you forget to add tables?' }
      : {
          [K in keyof TSchema]: RelationalQueryBuilder<TSchema, TSchema[K]>;
          // ✅ Type preserved because no as any casts in methods
        };
  };
```

**Verification**:
- [ ] `db.query.users.findMany()` returns `UserType[]` not union
- [ ] IDE autocomplete shows correct properties for each table
- [ ] No runtime errors (190 tests still pass)
- [ ] TypeScript compilation succeeds

---

#### Phase 3: Enable Type Tests & Verify (2-4 hours)

Re-enable 7 deferred type tests and verify HKT pattern fixes type widening.

**Files to Modify**:
- `convex/test-types/db-rel.ts` (uncomment 7 tests)
- `convex/test-types/pagination.ts` (create new file, 5 tests)

**Enable Tests in db-rel.ts**:

Uncomment these test blocks (lines 92-291):
1. Basic findMany with relations (lines 92-94)
2. Nested relations (lines 133-135)
3. Column selection with relations (lines 161-163)
4. One relation (nullable) (lines 191-193)
5. Self-referential relations (lines 221-223)
6. Many-to-many through join table (lines 259-261)
7. findFirst returns single item or null (lines 289-291)

**Create pagination.ts Type Tests**:

```typescript
// convex/test-types/pagination.ts

import {
  defineRelations,
  createDatabase,
  extractRelationsConfig,
} from 'kitcn/orm';
import type { GenericDatabaseReader } from 'convex/server';
import * as schema from './tables';
import { type Equal, Expect } from './utils';

const schemaConfig = defineRelations(schema);
const edgeMetadata = extractRelationsConfig(schema);
const mockDb = {} as GenericDatabaseReader<any>;
const db = createDatabase(mockDb, schemaConfig, edgeMetadata);

// Test 1: Paginate returns correct structure
{
  const result = await db.query.users.paginate(
    { where: (users, { eq }) => eq(users.name, 'Alice') },
    { cursor: null, numItems: 10 }
  );

  type Expected = {
    page: UserType[];
    continueCursor: string | null;
    isDone: boolean;
  };

  Expect<Equal<Expected, typeof result>>;
}

// Test 2: Paginate with relations
{
  const result = await db.query.users.paginate(
    { with: { posts: true } },
    { cursor: null, numItems: 10 }
  );

  type Expected = {
    page: Array<UserType & { posts: PostType[] }>;
    continueCursor: string | null;
    isDone: boolean;
  };

  Expect<Equal<Expected, typeof result>>;
}

// Test 3: Paginate with column selection
{
  const result = await db.query.users.paginate(
    { columns: { name: true, email: true } },
    { cursor: null, numItems: 10 }
  );

  type Expected = {
    page: Array<{ name: string; email: string }>;
    continueCursor: string | null;
    isDone: boolean;
  };

  Expect<Equal<Expected, typeof result>>;
}

// Test 4: Paginate first page (null cursor)
{
  const result = await db.query.users.paginate(
    undefined,
    { cursor: null, numItems: 10 }
  );

  type PageType = typeof result.page;
  Expect<Equal<PageType, UserType[]>>;
}

// Test 5: Paginate with cursor continuation
{
  const result = await db.query.users.paginate(
    undefined,
    { cursor: 'some-cursor-string', numItems: 10 }
  );

  type CursorType = typeof result.continueCursor;
  Expect<Equal<CursorType, string | null>>;
}
```

**Verification Steps**:

```bash
# 1. Run typecheck (should have 0 errors)
bun typecheck

# 2. Verify specific error count reduction
bun typecheck 2>&1 | grep "error TS" | wc -l
# Expected: 0 (was 31 before fixes)

# 3. Run runtime tests (should still pass)
bun run test
# Expected: 190 passing (same as before)

# 4. Check specific test files
bun typecheck --noEmit --project convex/tsconfig.json
# Expected: 0 errors in db-rel.ts and pagination.ts
```

**Success Criteria**:
- [ ] All 7 deferred tests in db-rel.ts pass type checking
- [ ] All 5 new tests in pagination.ts pass type checking
- [ ] `bun typecheck` shows 0 errors (was 31)
- [ ] `bun run test` shows 190 passing (no change)
- [ ] IDE autocomplete for `db.query.users.findMany()` shows `UserType[]`

---

## Technical Approach

### Root Cause Deep Dive **[NEW]**

The type widening has **two failure points**:

**1. Type Loss at Instantiation (Primary)**

```typescript
// query-builder.ts:82
return new GelRelationalQuery(
  this.fullSchema,  // ← TSchema generic available here
  this.tableConfig,  // ← TTableConfig generic available here
  'many',
  this.edgeMetadata,
  this.db,
  config,
  undefined,
  this.allEdges
) as any;  // ❌ Cast destroys ALL type information

// TypeScript sees this as:
return new GelRelationalQuery(any, any, 'many', ...) as any;
// Result: GelRelationalQuery<any> instead of GelRelationalQuery<TSchema, TTableConfig, UserType[]>
```

**2. Type Widening at Definition (Secondary)**

Even if we preserved types through instantiation, the mapped type causes widening:

```typescript
// database.ts:27-32
export type DatabaseWithQuery<TSchema> = {
  query: {
    [K in keyof TSchema]: RelationalQueryBuilder<TSchema, TSchema[K]>;
    // ↑ When K = 'users' | 'posts', TSchema[K] widens to union
  };
};
```

**Solution requires BOTH fixes:**
1. Remove `as any` casts → Preserve types through instantiation
2. Use HKT `_` interface → Prevent widening in mapped type

### HKT Pattern Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    HKT Pattern Flow                         │
└─────────────────────────────────────────────────────────────┘

1. Schema Definition
   ┌─────────────────┐
   │ defineRelations() │ → Creates TablesRelationalConfig
   │ { users, posts }│    with tsName: K & string
   └─────────────────┘

2. Database Creation
   ┌──────────────────┐
   │ createDatabase() │ → Instantiates RelationalQueryBuilder
   │   for each table │    for each K in schema
   └──────────────────┘

3. Query Builder (with HKT)
   ┌────────────────────────────────────────┐
   │ RelationalQueryBuilder<TSchema, TTable>│
   │                                        │
   │ declare readonly _: {                  │ ← Type anchor
   │   readonly schema: TSchema;            │
   │   readonly tableConfig: TTableConfig;  │
   │   readonly result: TResult[];          │ ← Stored here
   │ }                                      │
   └────────────────────────────────────────┘
                    ↓
4. Method Calls (Preserve Types)
   ┌─────────────────────────────────────┐
   │ findMany(): GelRelationalQuery<     │
   │   TSchema,                          │ ← NO widening
   │   TTableConfig,                     │ ← NO widening
   │   BuildQueryResult<...>[]           │ ← Specific type
   │ >                                   │
   │                                     │
   │ NO as any cast!                     │ ← KEY CHANGE
   └─────────────────────────────────────┘
                    ↓
5. Result Type (Preserved)
   ┌──────────────────┐
   │ UserType[]       │ ← Specific table type
   │                  │
   │ NOT:             │
   │ (User|Post)[]    │ ← Union widening prevented
   └──────────────────┘
```

### Why This Works **[ENHANCED]**

**Problem 1**: `as any` cast loses type information:
```typescript
// BEFORE:
return new GelRelationalQuery(...) as any;
// TypeScript: "I don't know what type this is, so I'll infer from context"
// Context: DatabaseWithQuery mapped type
// Inference: Union of all possible table types (widened)
```

**Solution 1**: Explicit generic parameters, no cast:
```typescript
// AFTER:
return new GelRelationalQuery<TSchema, TTableConfig, UserType[]>(...);
// TypeScript: "I know exactly what type this is"
// No inference needed, no widening possible
```

**Problem 2**: `TSchema[K]` evaluated across all K causes distributive behavior:
```typescript
type Query<TSchema, K> = TSchema[K] extends TableConfig ? Result<TSchema[K]> : never;
// K = 'users' | 'posts'
// TSchema[K] = UserConfig | PostConfig (WIDENED)
// Result = UserResult | PostResult (WIDENED)
```

**Solution 2**: Store result in immutable property BEFORE evaluation:
```typescript
declare readonly _: {
  readonly result: TResult; // ← Anchored at instantiation
};

type Query = this['_']['result']; // ← Access pre-anchored type
// K is already concrete at this point
// No re-evaluation, no widening
```

**Key Insight**: The `_` interface alone doesn't help if types are destroyed by `as any` before reaching it. Must fix BOTH issues.

---

## Alternative Approaches Considered

### Alternative 1: Type Assertion Workaround (Quick Fix)

**Approach**: Add helper function with explicit type assertion:
```typescript
function assertType<T>(value: any): T {
  return value as T;
}

const users = assertType<UserType[]>(db.query.users.findMany());
```

**Pros**:
- Quick to implement (30 minutes)
- Unblocks development immediately
- No architectural changes

**Cons**:
- Loses type safety (defeats purpose of TypeScript)
- User must manually specify types
- IDE autocomplete doesn't work
- Doesn't fix root cause

**Verdict**: ❌ Not recommended. Band-aid that undermines kitcn's value proposition.

---

### Alternative 2: Conditional Types with Guards (Attempted)

**Approach**: Use conditional types to narrow TSchema[K]:
```typescript
export type DatabaseWithQuery<TSchema> = {
  query: {
    [K in keyof TSchema]: TSchema[K] extends TableConfig
      ? RelationalQueryBuilder<TSchema, TSchema[K]>
      : never;
  };
};
```

**Pros**:
- Simpler than HKT pattern
- Uses familiar TypeScript constructs

**Cons**:
- Already tried, didn't work (still widens)
- Conditional evaluation happens AFTER distribution
- Can't prevent TypeScript from evaluating TSchema[K] as union

**Verdict**: ❌ Already failed. TypeScript evaluates conditionals after distribution.

---

### Alternative 3: Separate Type Utility per Table (Nuclear Option)

**Approach**: Generate explicit types for each table:
```typescript
type UsersQueryBuilder = RelationalQueryBuilder<Schema, Schema['users']>;
type PostsQueryBuilder = RelationalQueryBuilder<Schema, Schema['posts']>;

export type DatabaseWithQuery<TSchema> = {
  query: {
    users: UsersQueryBuilder;
    posts: PostsQueryBuilder;
    // ... explicit for each table
  };
};
```

**Pros**:
- Guarantees no type widening (explicit types)
- Maximum type safety

**Cons**:
- Not scalable (manual for each table)
- Breaks type inference (can't use TSchema generic)
- Massive code generation required
- Defeats purpose of generic ORM

**Verdict**: ❌ Not maintainable. ORM must work with any schema.

---

## Acceptance Criteria

### Functional Requirements

- [ ] `db.query.users.findMany()` returns `UserType[]` (not union)
- [ ] `db.query.posts.findFirst()` returns `PostType | null` (not union)
- [ ] `db.query.users.paginate()` returns `{ page: UserType[], ... }` (not union)
- [ ] IDE autocomplete shows correct properties for each table
- [ ] No type errors when accessing specific fields (e.g., `users[0].name`)

### Non-Functional Requirements

- [ ] Zero runtime behavior changes (190 tests still pass)
- [ ] Type checking performance not degraded (< 5% increase)
- [ ] IDE hover tooltips remain clear and readable
- [ ] No breaking changes to public API

### Quality Gates

- [ ] All 7 deferred tests in db-rel.ts pass
- [ ] All 5 new tests in pagination.ts pass
- [ ] `bun typecheck` shows 0 errors (was 31)
- [ ] `bun run test` shows 190 passing
- [ ] No new type instantiation depth warnings

---

## Success Metrics

| Metric | Before HKT | After HKT | Target |
|--------|------------|-----------|--------|
| Type errors | 31 | ? | 0 |
| Runtime tests passing | 190/190 | ? | 190/190 |
| Type tests enabled | 0/12 deferred | ? | 12/12 passing |
| Query result type | Union of all tables | Specific table | Specific table |
| IDE autocomplete accuracy | ❌ Wrong suggestions | ✅ Correct | ✅ Correct |

---

## Dependencies & Prerequisites

### Required Before Starting

1. ✅ **Drizzle analysis complete** - Already done (5 research agents)
2. ✅ **Runtime tests passing** - 190/190 tests pass
3. ✅ **Clean git state** - Commit or stash changes first
4. ✅ **Local research complete** - Repo + learnings analyzed

### External Dependencies

- None (pure TypeScript changes)

### Breaking Changes

- **None expected** - Only type system changes, no API changes
- Public method signatures unchanged (except generic parameters)
- Runtime behavior identical

---

## Risk Analysis & Mitigation

### Risk 1: Type Instantiation Depth Limit

**Probability**: MEDIUM
**Impact**: HIGH
**Symptom**: TypeScript error "Type instantiation is excessively deep and possibly infinite"

**Mitigation**:
- Monitor type instantiation depth during implementation
- Test with deeply nested schemas (5+ levels)
- Add type instantiation depth limit tests
- If hit limit, simplify HKT resolution (fewer generic parameters)

**Rollback Plan**: Revert to simpler type system, document limitation

---

### Risk 2: Performance Degradation

**Probability**: LOW
**Impact**: MEDIUM
**Symptom**: TypeScript takes > 5% longer to type check

**Mitigation**:
- Benchmark type checking time before/after (use `tsc --extendedDiagnostics`)
- Profile with `tsc --generateTrace`
- Optimize HKT resolution if needed (fewer property accesses)

**Rollback Plan**: Revert HKT pattern, accept type widening limitation

---

### Risk 3: IDE Tooltip Degradation

**Probability**: LOW
**Impact**: LOW
**Symptom**: IDE hover shows complex HKT types instead of clean result types

**Mitigation**:
- Wrap result types in `Simplify<>` utility
- Test IDE hover tooltips in VSCode
- Use `@ts-expect-error` comments to document complex types

**Rollback Plan**: Add `Simplify<>` wrappers to improve display

---

## Resource Requirements

### Time Estimate **[UPDATED]**

- **Phase 0** (Missing utilities): 2 hours ← NEW
- **Phase 1** (HKT foundation): 2 hours
- **Phase 2** (Remove casts, use HKT): 3-4 hours ← UPDATED
- **Phase 3** (Type tests): 2-4 hours
- **Total**: 8-10 hours ← WAS 6-8 hours

### Team Requirements

- 1 developer with strong TypeScript knowledge
- Optional: Review from TypeScript expert familiar with HKT patterns

### Infrastructure

- None (local development only)
- Requires: bun, TypeScript 5.x

---

## Future Considerations

### Extensibility

**Pattern established by HKT**:
- Can add more type-anchored properties to `_` interface
- Enables future optimizations (e.g., query plan caching)
- Foundation for advanced features (e.g., query batching)

**Example Future Enhancement**:
```typescript
declare readonly _: {
  readonly result: TResult[];
  readonly queryPlan: QueryPlan;     // ← Future: Query optimization
  readonly cacheKey: string;         // ← Future: Result caching
};
```

### Long-term Vision

This HKT pattern enables:
1. **Smart query batching** - Type-safe batch queries with preserved types
2. **Query plan optimization** - Cache execution plans per query shape
3. **Advanced type inference** - Conditional loading based on schema structure
4. **Better error messages** - Type-anchored context for debugging

**Next Steps After HKT**:
- M7: Advanced query features (joins, subqueries)
- M8: Query optimization (batching, caching)
- M9: Real-time subscriptions with type-safe updates

---

## Documentation Plan

### Files to Update

1. **README.md** (`packages/kitcn/README.md`)
   - Add section: "Type System Architecture"
   - Document HKT pattern usage
   - Link to type testing guide

2. **API Documentation** (`www/content/docs/`)
   - Update query builder API docs
   - Add TypeScript inference guide
   - Document IDE autocomplete expectations

3. **Type Testing Guide** (`convex/test-types/README.md`)
   - Add section: "Testing HKT-based Query Results"
   - Document `Expect<Equal<>>` pattern for query results
   - Add examples with nested relations

4. **Solutions Database** (`docs/solutions/typescript-patterns/`)
   - Create: `hkt-pattern-implementation-20260203.md`
   - Document: Problem, solution, gotchas, prevention
   - Link to this plan and related solutions

### Code Comments

Add JSDoc comments to:
- `RelationalQueryBuilder` class explaining HKT pattern
- `_` interface property explaining type anchoring
- HKT type utilities explaining resolution process

**Example JSDoc**:
```typescript
/**
 * Query builder for a specific table
 *
 * Uses HKT (Higher-Kinded Type) pattern to prevent type widening.
 * The readonly `_` interface anchors the result type, preventing
 * TypeScript from re-evaluating TSchema[K] as a union of all tables.
 *
 * Pattern from Drizzle ORM:
 * drizzle-orm/src/pg-core/query-builders/select.types.ts:180-199
 *
 * @template TSchema - Full schema configuration
 * @template TTableConfig - Configuration for this specific table
 */
export class RelationalQueryBuilder<
  TSchema extends TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig,
> {
  declare readonly _: {
    readonly schema: TSchema;
    readonly tableConfig: TTableConfig;
    readonly result: BuildQueryResult<TSchema, TTableConfig, true>[];
  };
  // ...
}
```

---

## References & Research

### Internal References

**Current Implementation**:
- [query-builder.ts:27-154](../../packages/kitcn/src/orm/query-builder.ts#L27-L154) - RelationalQueryBuilder class (**as any at lines 82, 114, 154**)
- [query.ts:36-1037](../../packages/kitcn/src/orm/query.ts#L36-L1037) - GelRelationalQuery execution engine
- [database.ts:25-85](../../packages/kitcn/src/orm/database.ts#L25-L85) - DatabaseWithQuery type utility
- [types.ts:14-556](../../packages/kitcn/src/orm/types.ts#L14-L556) - Core type utilities (Merge, GetColumnData, BuildQueryResult)

**Documented Solutions**:
- [Phantom Type Brand Preservation](../../docs/solutions/typescript-patterns/phantom-type-brand-preservation-20260202.md) - Merge utility pattern
- [GetColumnData Pattern](../../docs/solutions/typescript-patterns/select-ts-type-inference-drizzle-patterns-20260202.md) - Mode-based type extraction
- [Type Testing Workflow](../../docs/solutions/workflow-issues/type-testing-defer-unimplemented-features-20260202.md) - Testing strategy

**Analysis Documents**:
- [Type Inference Pattern Analysis](../../docs/analysis/2026-02-01-type-inference-pattern-analysis.md) - Phantom property patterns
- [Type Testing Pattern Analysis](../../docs/analysis/2026-02-02-type-testing-pattern-analysis.md) - Testing best practices
- [Type Testing Research](../../docs/research/type-testing-research.md) - Drizzle pattern research (1473 lines)

**Enhancement Research (2026-02-03)**:
- [findings.md](../../../findings.md) - Pattern recognition analysis (571 lines)
- 5 parallel research agents (Deep Drizzle HKT, GelRelationalQuery architecture, TypeScript conditional distribution, learnings, pattern recognition)

### External References

**Drizzle ORM Source** (cloned to `/tmp/cc-repos/drizzle-orm`):
- `drizzle-orm/src/pg-core/query-builders/select.types.ts:180-199` - HKT pattern implementation
- `drizzle-orm/src/pg-core/query-builders/select.ts:153-179` - Query builder with `_` interface
- `drizzle-orm/src/relations.ts:298-315` - Schema extraction with `K & string`
- `drizzle-orm/src/utils.ts:144-149` - Simplify utility with `& {}` seal
- `drizzle-orm/src/utils.ts:151-156` - KnownKeysOnly utility **[NEW]**

**TypeScript Resources**:
- TypeScript Handbook: Conditional Types
- TypeScript Handbook: Mapped Types
- TypeScript Handbook: Template Literal Types

**Community Resources**:
- [Type Challenges](https://github.com/type-challenges/type-challenges) - Advanced TypeScript patterns
- [ts-toolbelt](https://github.com/millsp/ts-toolbelt) - Type utility library

### Related Work

**Previous PRs** (if applicable):
- Link to GetColumnData implementation PR
- Link to Merge utility implementation PR
- Link to M6.5 relation loading runtime PR

**Related Issues**:
- GitHub issue: Type widening in query results
- GitHub issue: M6.5 Phase 5 type testing blocked

**Design Documents**:
- [Drizzle ORM Brainstorm](../../docs/brainstorms/2026-01-31-drizzle-orm-brainstorm.md) - ORM design decisions
- [TypeScript Patterns Brainstorm](../../docs/brainstorms/2026-01-31-typescript-patterns-from-drizzle-and-ents.md) - Type system research

---

## Implementation Checklist

Before starting each phase, verify:

### Phase 0: Missing Utilities **[NEW]**
- [ ] Read Drizzle's KnownKeysOnly implementation
- [ ] Add KnownKeysOnly to internal/types.ts
- [ ] Add TIsRoot parameter to DBQueryConfig
- [ ] Update DBQueryConfig field constraints
- [ ] Write tests for KnownKeysOnly
- [ ] Verify TypeScript compiles

### Phase 1: HKT Foundation
- [ ] Read current RelationalQueryBuilder implementation
- [ ] Study Drizzle's HKT pattern in cloned repo
- [ ] Verify HKT base types exist in types.ts (already done)
- [ ] Verify `_` interface exists in RelationalQueryBuilder (already done)
- [ ] Rename `fullSchema` → `schema` in constructor
- [ ] Update references at lines 75, 107, 147
- [ ] Verify TypeScript compiles
- [ ] Verify no runtime behavior changes

### Phase 2: Remove Casts & Use HKT **[CRITICAL]**
- [ ] Update GelRelationalQuery constructor with generics
- [ ] Remove `as any` cast from findMany (line 82)
- [ ] Add explicit generic parameters to GelRelationalQuery instantiation
- [ ] Wrap config with KnownKeysOnly
- [ ] Remove `as any` cast from findFirst (line 114)
- [ ] Add explicit generic parameters to GelRelationalQuery instantiation
- [ ] Wrap config with KnownKeysOnly
- [ ] Remove `as any` cast from paginate (line 154)
- [ ] Add explicit generic parameters to GelRelationalQuery instantiation
- [ ] Wrap config with KnownKeysOnly
- [ ] Verify IDE autocomplete shows correct types
- [ ] Verify no runtime behavior changes

### Phase 3: Type Tests
- [ ] Uncomment 7 tests in db-rel.ts
- [ ] Create pagination.ts with 5 tests
- [ ] Run `bun typecheck` (expect 0 errors)
- [ ] Run `bun run test` (expect 190 passing)
- [ ] Verify IDE tooltips are clean
- [ ] Update convex/test-types/README.md

### Post-Implementation
- [ ] Run `bun --cwd packages/kitcn build`
- [ ] Touch `example/convex/functions/schema.ts`
- [ ] Update documentation (README, API docs, solutions)
- [ ] Create solution document: hkt-pattern-implementation-20260203.md
- [ ] Ask user: "Ready to commit?"

---

## Notes

- **Phase execution order is critical** - Must complete Phase 0 before Phase 1 (utilities must exist first)
- **Phase 2 is the most critical** - Removing `as any` casts is what actually fixes the issue
- **Test incrementally** - Run `bun typecheck` after each phase to catch issues early
- **Monitor type instantiation depth** - Watch for "excessively deep" warnings during implementation
- **Preserve runtime behavior** - All 190 tests must continue passing throughout
- **Document failures** - If any approach fails, document in solutions/ for future reference
- **Generic parameter order matters** - Always TSchema, then TTableConfig, then TResult/TSelection

---

## Unresolved Questions **[UPDATED]**

1. ~~Should we add `& {}` seal to the HKT resolution type?~~ → **RESOLVED**: Yes, already done in Simplify and Merge
2. ~~Do we need a separate HKT type per method (findMany, findFirst, paginate)?~~ → **RESOLVED**: No, shared result type works
3. Should `_` interface include query plan for future optimization? → **DEFERRED**: No - YAGNI, add later if needed
4. How to handle edge cases with very deep schema nesting (10+ tables)? → **NEEDS TESTING**: Test and document limits
5. Should GelRelationalQuery config parameter be typed with KnownKeysOnly? → **YES**: Add in Phase 2

---

**Created**: 2026-02-03
**Author**: Claude (via /workflows:plan)
**Enhanced**: 2026-02-03 (via /deepen-plan with 5 research agents)
**Status**: Ready for implementation
**Next Step**: Begin Phase 0 (Add missing utilities)
