---
title: Fix Relations Type Inference (InferRelations)
type: fix
date: 2026-02-02
---

# Fix Relations Type Inference - InferRelations Type Error

## Problem

`InferRelations<typeof usersRelations>` infers `posts` field as `never[]` instead of the proper post object array type.

**Error:**
```typescript
Type 'never[]' is missing the following properties from type
'{ _creationTime: number; userId: Id<"users">; _id: Id<"posts">; title: string; }':
_creationTime, userId, _id, title
```

**Failing test:** [convex/orm/relations.test.ts:101-106](../../convex/orm/relations.test.ts#L101-106)

## Root Cause Analysis

### Current Implementation Issue

Our `InferRelationType` tries to extract the table type directly from the relation generic:

```typescript
// packages/kitcn/src/orm/types.ts:126-133
type InferRelationType<T> =
  T extends One<infer TTable, any>
    ? InferSelectModel<TTable> | null
    : T extends Many<infer TTable>
      ? InferSelectModel<TTable>[]  // ❌ TTable is ConvexTable<any>, loses config
```

**The problem:**
- `Many<TTable>` generic is `ConvexTable<any>` - type information is erased
- `infer TTable` captures `ConvexTable<any>`, not the specific table config
- `InferSelectModel<ConvexTable<any>>` resolves to `never[]`

### Drizzle's Approach (The Solution)

**Key insight from Drizzle research:**

Drizzle **does NOT have standalone relation type inference**. They only infer relations within schema context:

```typescript
// Drizzle pattern - uses schema to look up tables
export type BuildRelationResult<
  TSchema extends TablesRelationalConfig,  // ← Schema required
  TInclude extends Record<string, unknown>,
  TRelations extends Record<string, Relation>,
> = {
  [K in keyof TInclude]:
    TRelations[K] extends Relation
      ? BuildQueryResult<
          TSchema,
          FindTableByDBName<TSchema, TRelations[K]['referencedTableName']>,  // ← Lookup
          TInclude[K]
        > extends infer TResult
        ? TRelations[K] extends One ? TResult | null : TResult[]
        : never
      : never;
};
```

**Why this works:**
1. Schema provides mapping of table names to table configurations
2. `FindTableByDBName` looks up the referenced table in schema
3. Full table config is available for type inference
4. No reliance on generic type parameters that get erased

### What Drizzle Does Instead

Drizzle users don't write:
```typescript
type Relations = InferRelations<typeof usersRelations>;  // ❌ Doesn't exist
```

They use:
```typescript
// Relations are inferred from query context
const usersWithPosts = await db.query.usersTable.findMany({
  with: { posts: true }  // ← Type inferred here
});
// Type: { id: number, name: string, posts: Post[] }[]
```

**However**, for test utilities, we CAN provide standalone inference if we add schema parameter.

## Proposed Solution

### Option 1: Add Schema Parameter (Recommended)

Make `InferRelations` require schema context, matching Drizzle's pattern:

```typescript
// New signature
export type InferRelations<
  TRelations extends Relations<any, any>,
  TSchema extends TablesRelationalConfig
> = TRelations extends Relations<any, infer TConfig>
  ? Simplify<{
      [K in keyof TConfig]: TConfig[K] extends Relation<any>
        ? InferRelationTypeWithSchema<TConfig[K], TSchema>
        : never;
    }>
  : never;

// New helper with schema
type InferRelationTypeWithSchema<
  TRel extends Relation<any>,
  TSchema extends TablesRelationalConfig
> = BuildQueryResult<
  TSchema,
  FindTableByDBName<TSchema, TRel['referencedTableName']>,
  true
> extends infer TResult
  ? TRel extends One<any, any>
    ? TResult | (TRel['isNullable'] extends true ? null : never)
    : TResult[]
  : never;
```

**Usage:**
```typescript
// Test needs to pass schema
type Relations = InferRelations<typeof usersRelations, typeof schema>;
```

**Pros:**
- Matches Drizzle's pattern exactly
- Type-safe and correct
- Reuses existing `BuildQueryResult` and `FindTableByDBName`

**Cons:**
- Breaking change - existing tests need schema parameter
- More verbose for users

### Option 2: Store Full Table Type (Complex, Not Recommended)

Modify relation classes to preserve full table configuration in phantom type:

```typescript
export class Many<
  TTable extends ConvexTable<any>,
  TTableConfig = TTable['_']  // ← Capture config
> extends Relation<TTable> {
  declare readonly _tableConfig: TTableConfig;  // ← Phantom property
}
```

**Problems:**
- TypeScript erases generic parameters in class instances
- Phantom types don't survive runtime instantiation
- Would require complex type gymnastics
- Doesn't match Drizzle's proven pattern

## Implementation Plan

### Phase 1: Add Schema-Aware InferRelations

**File:** [packages/kitcn/src/orm/types.ts](../../packages/kitcn/src/orm/types.ts)

1. **Add new InferRelations with schema parameter:**
```typescript
/**
 * Extract relation types from a Relations definition
 * Requires schema context to look up referenced tables
 *
 * @template TRelations - Relations definition
 * @template TSchema - Full schema configuration
 *
 * @example
 * const usersRelations = relations(users, ({ many }) => ({
 *   posts: many(posts),
 * }));
 * type UserRelations = InferRelations<typeof usersRelations, typeof schema>;
 * // → { posts: Post[] }
 */
export type InferRelations<
  TRelations extends Relations<any, any>,
  TSchema extends TablesRelationalConfig
> = TRelations extends Relations<any, infer TConfig>
  ? Simplify<{
      [K in keyof TConfig]: TConfig[K] extends Relation<any>
        ? InferRelationTypeWithSchema<TConfig[K], TSchema>
        : never;
    }>
  : never;

/**
 * Infer type for a single relation with schema context
 * - one() → T | null (with schema lookup)
 * - many() → T[] (with schema lookup)
 *
 * Uses schema to find referenced table, then builds query result
 */
type InferRelationTypeWithSchema<
  TRel extends Relation<any>,
  TSchema extends TablesRelationalConfig
> = BuildQueryResult<
  TSchema,
  FindTableByDBName<TSchema, TRel['referencedTableName']>,
  true
> extends infer TResult
  ? TRel extends One<any, any>
    ? TResult | (TRel['isNullable'] extends true ? null : never)
    : TResult[]
  : never;
```

2. **Keep old InferRelations as deprecated (optional):**
```typescript
/**
 * @deprecated Use InferRelations<TRelations, TSchema> with schema parameter instead
 * Standalone relation inference doesn't work without schema context
 */
export type InferRelationsLegacy<T extends Relations<any, any>> =
  T extends Relations<any, infer TConfig>
    ? Simplify<{
        [K in keyof TConfig]: never;  // Always returns never
      }>
    : never;
```

### Phase 2: Update Tests

**File:** [convex/orm/relations.test.ts](../../convex/orm/relations.test.ts)

Update the type inference test to pass schema:

```typescript
it('should infer relation types correctly', () => {
  const users = convexTable('users', {
    name: text().notNull(),
  });

  const posts = convexTable('posts', {
    title: text().notNull(),
    userId: id('users').notNull(),
  });

  const usersRelations = relations(users, ({ many }) => ({
    posts: many(posts),
  }));

  // Create schema for type inference
  const schema = {
    users,
    posts,
  } as const;

  // Extract schema config type
  type Schema = ExtractTablesWithRelations<typeof schema>;

  // Now inference works with schema context
  type Relations = InferRelations<typeof usersRelations, Schema>;

  // Type-level test - should compile correctly
  const _typeTest: Relations = {
    posts: [],  // ✓ Type: Post[]
  };

  expect(_typeTest).toBeDefined();
});
```

### Phase 3: Add ExtractTablesWithRelations Helper

**File:** [packages/kitcn/src/orm/index.ts](../../packages/kitcn/src/orm/index.ts)

Export helper to extract schema type from schema object:

```typescript
/**
 * Extract TablesRelationalConfig from a schema definition object
 * Used for type inference in tests and utilities
 *
 * @example
 * const schema = { users, posts };
 * type Schema = ExtractTablesWithRelations<typeof schema>;
 * type Relations = InferRelations<typeof usersRelations, Schema>;
 */
export type ExtractTablesWithRelations<TSchema extends Record<string, unknown>> = {
  [K in keyof TSchema]: TSchema[K] extends ConvexTable<infer TConfig>
    ? {
        tsName: K;
        dbName: TConfig['name'];
        columns: TConfig['columns'];
        relations: {};  // Relations extracted separately
      }
    : never;
};
```

### Phase 4: Verify with Drizzle Pattern

Compare final implementation with Drizzle's approach:

**Checklist:**
- [x] Uses schema context like Drizzle ✓
- [x] Reuses `FindTableByDBName` utility ✓
- [x] Reuses `BuildQueryResult` for type building ✓
- [x] Handles `One` vs `Many` correctly ✓
- [x] Preserves nullable vs notNull distinction ✓

## Acceptance Criteria

- [x] `InferRelations<TRelations, TSchema>` correctly infers post array type
- [x] Test `convex/orm/relations.test.ts` passes without type errors
- [x] `posts` field type is `Post[]`, not `never[]`
- [x] Pattern matches Drizzle's schema-based inference approach
- [x] Existing `BuildRelationResult` continues to work (used in query builder)

## Technical Considerations

### Why Schema is Required

**TypeScript limitation:** Generic type parameters are erased at runtime and during type inference:

```typescript
class Many<TTable extends ConvexTable<any>> {
  // At type-checking time, TTable is known
  // At inference time, TTable becomes ConvexTable<any>
}

type Test<T> = T extends Many<infer TTable> ? TTable : never;
type Result = Test<Many<typeof posts>>;  // Result is ConvexTable<any>, not specific table
```

**Solution:** Use runtime property (`referencedTableName`) + schema lookup instead of generic inference.

### Migration Path

**For existing code using InferRelations without schema:**

```typescript
// Before (broken)
type Relations = InferRelations<typeof usersRelations>;

// After (fixed)
const schema = { users, posts };
type Schema = ExtractTablesWithRelations<typeof schema>;
type Relations = InferRelations<typeof usersRelations, Schema>;
```

**For production code:**

Relations are typically inferred from query context automatically:
```typescript
// No manual InferRelations needed
const result = await db.query.users.findMany({
  with: { posts: true }
});
// Type inferred automatically from query
```

## References

- Drizzle ORM relations research: [Task output from dig skill](../../tmp/cc-repos/drizzle-orm)
- Drizzle `BuildRelationResult` pattern: `/tmp/cc-repos/drizzle-orm/drizzle-orm/src/table.ts:320-339`
- Drizzle `ExtractTablesWithRelations`: `/tmp/cc-repos/drizzle-orm/drizzle-orm/src/relations.ts:298-315`
- Our `FindTableByDBName`: [packages/kitcn/src/orm/types.ts:340](../../packages/kitcn/src/orm/types.ts#L340)
- Our `BuildRelationResult`: [packages/kitcn/src/orm/types.ts:277-294](../../packages/kitcn/src/orm/types.ts#L277-294)

## Related Patterns

- **TypeScript generic erasure**: Why `infer TTable` loses type information
- **Schema-based type lookup**: Drizzle's pattern for preserving type information
- **Phantom type limitations**: Why storing types in generics doesn't work for class instances
