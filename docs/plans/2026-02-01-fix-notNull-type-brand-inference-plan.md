---
title: Fix NotNull Type Brand Inference
type: fix
date: 2026-02-01
milestone: M6+
---

# Fix NotNull Type Brand Inference

## Overview

**Problem**: Type inference for column builders with `.notNull()` is broken - fields are showing as `never` type instead of their actual types (string, number, etc.).

**Root Cause**: Our `ColumnBuilderTypeConfig` hard-codes `notNull: false` instead of using conditional type inference like Drizzle ORM. When we intersect with `NotNull<T>` which adds `{ _: { notNull: true } }`, we get `false & true` = `never`.

**Solution**: Mirror Drizzle's pattern - use conditional type inference to extract existing values or default to broad types (`boolean`, `unknown`).

## Context from Research

### Drizzle's Approach

**Location:** `/tmp/cc-repos/drizzle-orm/drizzle-orm/src/column-builder.ts` (lines 81-100)

```typescript
export type ColumnBuilderTypeConfig<
	T extends ColumnBuilderBaseConfig<ColumnDataType, string>,
	TTypeConfig extends object = object,
> = Simplify<
	& {
		brand: 'ColumnBuilder';
		name: T['name'];
		dataType: T['dataType'];
		columnType: T['columnType'];
		data: T['data'];
		driverParam: T['driverParam'];
		notNull: T extends { notNull: infer U } ? U : boolean;  // ← CONDITIONAL!
		hasDefault: T extends { hasDefault: infer U } ? U : boolean;
		enumValues: T['enumValues'];
		// ... more properties
	}
	& TTypeConfig
>;
```

**Key Pattern:** Uses conditional type inference:
- `T extends { notNull: infer U } ? U : boolean`
- If `T` has `notNull` property, extract its value (`infer U`)
- Otherwise, default to `boolean`

### Our Buggy Implementation

**Location:** `packages/kitcn/src/orm/builders/column-builder.ts` (lines 55-66)

```typescript
export interface ColumnBuilderTypeConfig<
  T extends ColumnBuilderBaseConfig<ColumnDataType, string>,
  TTypeConfig extends object,
> {
  brand: 'ColumnBuilder';
  config: T;
  data: T['data'];
  notNull: false;  // ← HARD-CODED! This is the bug.
  hasDefault: false;
  isPrimaryKey: false;
  typeConfig: TTypeConfig;
}
```

**Problem:**
- When we do `NotNull<this>` which adds `{ _: { notNull: true } }`
- The intersection becomes `{ notNull: false } & { notNull: true }`
- TypeScript resolves this to `notNull: never`
- Since `notNull` is `never`, the whole type check `TBuilder['_']['notNull'] extends true` fails
- This cascades to make the data type resolve to `never`

### How Drizzle Avoids the Conflict

When Drizzle does:
```typescript
type NotNull<T> = T & { _: { notNull: true } }
```

The `_` property from `ColumnBuilderTypeConfig` has:
```typescript
{
  notNull: boolean,  // ← Broad type (could be true or false)
  ...
}
```

Intersecting with `{ notNull: true }` narrows:
```typescript
boolean & true = true  // ← TypeScript narrows to the literal type
```

## Technical Approach

### Fix 1: Update ColumnBuilderTypeConfig (Primary Fix)

**File:** `packages/kitcn/src/orm/builders/column-builder.ts`

**Change:**
```typescript
// BEFORE
export interface ColumnBuilderTypeConfig<
  T extends ColumnBuilderBaseConfig<ColumnDataType, string>,
  TTypeConfig extends object,
> {
  brand: 'ColumnBuilder';
  config: T;
  data: T['data'];
  notNull: false;  // ← Remove hard-coded false
  hasDefault: false;
  isPrimaryKey: false;
  typeConfig: TTypeConfig;
}

// AFTER
export type ColumnBuilderTypeConfig<
  T extends ColumnBuilderBaseConfig<ColumnDataType, string>,
  TTypeConfig extends object,
> = {
  brand: 'ColumnBuilder';
  config: T;
  data: T['data'];
  notNull: T extends { notNull: infer U } ? U : boolean;  // ← Conditional inference
  hasDefault: T extends { hasDefault: infer U } ? U : boolean;
  isPrimaryKey: T extends { isPrimaryKey: infer U } ? U : boolean;
  typeConfig: TTypeConfig;
};
```

**Changes:**
1. Convert from `interface` to `type` (required for conditional types)
2. Use conditional type inference for `notNull`, `hasDefault`, `isPrimaryKey`
3. Default to `boolean` if property doesn't exist

### Fix 2: Verify Type Extraction Works

**File:** `packages/kitcn/src/orm/types.ts`

**Current BuilderToType (should work after Fix 1):**
```typescript
type BuilderToType<TBuilder extends ColumnBuilder<any, any, any>> =
  TBuilder['_']['notNull'] extends true
    ? TBuilder['_']['data']
    : TBuilder['_']['data'] | null;
```

**This should work because:**
- After Fix 1, `TBuilder['_']['notNull']` will be `true` (not `never`)
- The conditional check `extends true` will succeed
- Will return the correct data type

### Fix 3: Update Tests

**Files to check:**
- `convex/orm/relations.test.ts` - Type assertions should pass
- `convex/orm/schema-integration.test.ts` - defineSchema compatibility
- `convex/test-types/db-rel.ts` - All type assertions should pass
- `convex/test-types/select.ts` - All type assertions should pass

## Implementation Checklist

### Phase 1: Core Fix
- [x] Change `ColumnBuilderTypeConfig` from `interface` to `type` in [column-builder.ts](packages/kitcn/src/orm/builders/column-builder.ts:55)
- [x] Replace `notNull: false` with `notNull: T extends { notNull: infer U } ? U : boolean`
- [x] Replace `hasDefault: false` with `hasDefault: T extends { hasDefault: infer U } ? U : boolean`
- [x] Replace `isPrimaryKey: false` with `isPrimaryKey: T extends { isPrimaryKey: infer U } ? U : boolean`
- [ ] Run typecheck: `bun typecheck`

### Phase 2: Verify Type Inference
- [ ] Check [relations.test.ts:105](convex/orm/relations.test.ts:105) - should no longer show `never` types
- [ ] Check [schema-integration.test.ts:18](convex/orm/schema-integration.test.ts:18) - should pass
- [ ] Run: `bun tsgo --noEmit --project convex/tsconfig.json`

### Phase 3: Fix Type Test Assertions
- [ ] Review [db-rel.ts](convex/test-types/db-rel.ts) - update expected types if needed
- [ ] Review [select.ts](convex/test-types/select.ts) - update expected types if needed
- [ ] Address any remaining `@ts-expect-error` that are now unused
- [ ] Run typecheck again to verify all pass

### Phase 4: Validate with Real Usage
- [ ] Create test case: `text().notNull()` should infer as `string` (not `string | null`)
- [ ] Create test case: `text()` should infer as `string | null`
- [ ] Create test case: `id('users').notNull()` should infer as `GenericId<'users'>`
- [ ] Verify chaining: `text().notNull().default('x')` works

## Success Criteria

- [ ] Zero type errors in `packages/kitcn`
- [ ] Zero type errors in `convex/`
- [ ] All type assertions in `convex/test-types/` pass
- [ ] Type inference test: `text().notNull()` → `string` (not `never`)
- [ ] Type inference test: `text()` → `string | null`
- [ ] Build succeeds: `bun --cwd packages/kitcn build`

## Expected Outcome

### Before Fix
```typescript
const posts = convexTable('posts', {
  title: text().notNull(),
  userId: id('users').notNull(),
});

type Post = InferSelectModel<typeof posts>;
// Result: { _id: string, _creationTime: number, title: never, userId: never }
//                                                    ^^^^^ BUG  ^^^^^ BUG
```

### After Fix
```typescript
const posts = convexTable('posts', {
  title: text().notNull(),
  userId: id('users').notNull(),
});

type Post = InferSelectModel<typeof posts>;
// Result: { _id: string, _creationTime: number, title: string, userId: GenericId<'users'> }
//                                                    ^^^^^^ FIXED  ^^^^^^^^^^^^^^ FIXED
```

## References

- Drizzle column-builder.ts: `/tmp/cc-repos/drizzle-orm/drizzle-orm/src/column-builder.ts`
- Drizzle PostgreSQL columns: `/tmp/cc-repos/drizzle-orm/drizzle-orm/src/pg-core/columns/common.ts`
- Research findings: Full Drizzle type system analysis (see above)
- Related brainstorm: [docs/brainstorms/2026-01-31-drizzle-orm-brainstorm.md](docs/brainstorms/2026-01-31-drizzle-orm-brainstorm.md)
- Related brainstorm: [docs/brainstorms/2026-01-31-typescript-patterns-from-drizzle-and-ents.md](docs/brainstorms/2026-01-31-typescript-patterns-from-drizzle-and-ents.md)

## Notes

- This is a **type-level fix only** - no runtime behavior changes
- The fix mirrors Drizzle's exact pattern - proven to work in production
- After this fix, the type system should match Drizzle's behavior exactly
