---
module: kitcn ORM
date: 2026-02-02
problem_type: type_inference_issue
component: typescript_types
symptoms:
  - "Fields resolving to never instead of actual types"
  - "NotNull brands disappearing (fields become T | null instead of T)"
  - "Phantom _ properties vanishing from final types"
  - "Types work individually but fail when combined"
root_cause: typescript_intersection_flattening
severity: high
tags: [typescript, phantom-types, type-branding, intersection-types, drizzle-pattern]
related_docs:
  - "docs/solutions/integration-issues/convex-table-schema-integration-20260202.md"
  - "docs/solutions/typescript-patterns/select-ts-type-inference-drizzle-patterns-20260202.md"
---

# TypeScript Phantom Type Brand Preservation

## Problem

TypeScript intersection types (`&`) lose phantom type brands when combining literal objects with mapped types, causing branded types to be stripped during type flattening.

**Symptoms:**
- Fields resolve to `never` instead of actual types (e.g., `string`, `number`)
- NotNull brands disappear - fields become `T | null` instead of `T`
- Phantom `_` properties containing type metadata vanish
- Types work when tested individually but fail when combined with intersection

**Common in:**
- ORMs (Drizzle, Prisma, kitcn)
- Type-safe APIs (tRPC)
- Any code using phantom type branding for compile-time metadata

## Investigation

### Trigger Patterns

**Code that triggers the bug:**

```typescript
// ❌ Loses phantom brands
type Result = {
  _id: string;
  _creationTime: number;
} & MappedType<Columns>;  // Phantom brands in Columns are stripped

type User = Result;
type NameField = User['name'];  // Type is `never` instead of `string`
```

**Common scenarios:**
- Combining system fields with user-defined columns (ORMs)
- Merging base types with extended types (type builders)
- Intersecting literal objects with conditional/mapped types

### Failed Approaches

1. **Using different intersection order**: Tried reversing `A & B` to `B & A`
   - **Why it failed**: Intersection flattening happens regardless of order
   - **Learning**: Problem is with the `&` operator itself, not usage

2. **Adding Simplify wrapper**: Tried wrapping with `Simplify<A & B>`
   - **Why it failed**: Simplify only affects display, doesn't prevent brand loss
   - **Learning**: Need to avoid intersection entirely, not just flatten it

3. **Using type guards**: Tried runtime type guards to preserve types
   - **Why it failed**: Runtime doesn't affect compile-time type inference
   - **Learning**: This is purely a compile-time type system issue

### Research Findings

**Drizzle ORM pattern** (the solution):
- Never use `extends Record<string, T>` constraints (causes type widening)
- Replace intersection types with manual key merging
- Use `Merge<A, B>` utility for explicit key combination
- Codebase analysis: Drizzle **never** uses `&` for combining column types

**Key insight:** TypeScript's intersection resolution flattens types during evaluation. When intersecting a literal object with a mapped type, phantom properties (starting with `_`) are treated as implementation details and stripped to produce a "clean" intersection.

## Root Cause

TypeScript's type flattening behavior:

1. Evaluates intersection operator (`&`)
2. During flattening, identifies phantom properties as internal
3. Strips these properties to produce clean intersection
4. Result: phantom type brands disappear completely

**Why phantom properties are lost:**
- TypeScript treats `_` prefixed properties as private/internal
- Intersection flattening removes "implementation details"
- No way to prevent this with intersection operator

## Solution

Replace intersection types with a `Merge<A, B>` utility that manually combines keys:

### 1. Create Merge Utility

```typescript
// packages/kitcn/src/orm/types.ts

/**
 * Merge two object types without using intersection
 * Intersection can cause TypeScript to lose phantom type brands
 * This manually combines keys from both types
 */
type Merge<A, B> = {
  [K in keyof A | keyof B]: K extends keyof B
    ? B[K]
    : K extends keyof A
      ? A[K]
      : never;
};
```

**Why Merge works:**
- Manually iterates over all keys from both types
- Preserves phantom properties during key mapping
- Avoids TypeScript's intersection flattening behavior
- Works with `Simplify` for clean IDE display

### 2. Update Type Inference

**Before (loses brands):**

```typescript
export type InferSelectModel<TTable> = Simplify<
  {
    _id: string;
    _creationTime: number;
  } & ColumnsToType<TTable['columns']>
>;
```

**After (preserves brands):**

```typescript
export type InferSelectModel<TTable> = Simplify<
  Merge<
    {
      _id: string;
      _creationTime: number;
    },
    ColumnsToType<TTable['columns']>
  >
>;
```

### 3. Apply to All Inference Types

Also updated `InferModelFromColumns` with same pattern:

```typescript
export type InferModelFromColumns<TColumns> = Simplify<
  Merge<
    {
      _id: GenericId<string>;
      _creationTime: number;
    },
    ColumnsToType<TColumns>
  >
>;
```

## Verification

### Test Pattern

Create minimal type tests to verify phantom brands are preserved:

```typescript
// Test that notNull brand is preserved
const users = convexTable('users', {
  name: text().notNull(),
  age: number(),  // nullable
});

type User = InferSelectModel<typeof users>;
type NameField = User['name'];
type AgeField = User['age'];

// Should be `string`, NOT `string | null`
type NameTest = Equal<NameField, string>;
const nameVerify: NameTest = true;  // ✓ Passes if brand preserved

// Should be `number | null`
type AgeTest = Equal<AgeField, number | null>;
const ageVerify: AgeTest = true;  // ✓ Passes
```

### Red Flags

Signs the problem still exists:
- Type tests failing with "Type 'false' does not satisfy constraint 'true'"
- Fields showing as `never` in IDE autocomplete
- Nullable types appearing for notNull fields
- Phantom `_` properties missing from type hover

### Test Results

✓ NotNull fields: `string` (not `string | null`)
✓ Nullable fields: `number | null` (correct)
✓ No `never` types
✓ All phantom brands preserved

## Prevention

### For Future Type Work

1. **Never use intersection for branded types**: Use Merge utility instead
2. **Avoid `extends Record<string, T>` constraints**: Causes type widening that loses brands
3. **Test types in combination, not isolation**: Individual utilities may work but fail when combined
4. **Use conditional pattern matching**: Follow convex-ents pattern instead of Record constraints
5. **Create minimal type tests**: Isolate exact failure point with TDD approach

### Code Pattern

**✅ CORRECT: Use Merge utility**

```typescript
type Result = Merge<
  { _id: string; _creationTime: number },
  MappedType<Columns>
>;
```

**❌ WRONG: Use intersection operator**

```typescript
type Result = {
  _id: string;
  _creationTime: number;
} & MappedType<Columns>;  // Loses phantom brands
```

### When NOT to Use Merge

- Both sides are already mapped types (intersection works fine)
- No phantom type brands involved (intersection is simpler)
- TypeScript version < 4.1 (conditional types behave differently)

## Example: Fixing ORM Type Inference

**Context:** Building kitcn ORM with Drizzle-like API. NotNull brands were being lost during type inference.

**Investigation approach:**

1. Created minimal tests isolating each type utility
2. Found all individual utilities worked (`BuilderToType`, `ColumnsToType`)
3. Discovered intersection with system fields caused failure
4. Used `dig` skill to research Drizzle ORM's solution
5. Applied Merge utility pattern from Drizzle codebase

**Files changed:**

- `packages/kitcn/src/orm/types.ts`
  - Added `Merge<A, B>` utility
  - Updated `InferSelectModel` to use Merge
  - Updated `InferModelFromColumns` to use Merge

**Impact:**
- Fixed NotNull type inference
- Enabled schema integration
- Unblocked ORM development

## Related Patterns

### Simplify Utility

Often used WITH Merge to flatten final type for IDE display:

```typescript
type Result = Simplify<
  Merge<BaseType, ExtendedType>
>;
```

**Why both:**
- Merge preserves brands during combination
- Simplify flattens for clean IDE hover

### Drizzle's Pattern

Drizzle ORM completely avoids:
- `extends Record<string, T>` constraints
- Intersection types for column combinations
- Any pattern that causes type widening

Instead uses:
- Conditional pattern matching
- Manual key iteration with mapped types
- Merge-style utilities throughout

### convex-ents Pattern

Similar approach:
- Avoid Record constraints to prevent type widening
- Use structural typing carefully
- Test type combinations, not just individual pieces

## Performance Consideration

**Compile-time:**
- Merge utility adds minimal overhead
- Iterates keys at compile-time (type-level only)
- May slightly increase type checking time for large types

**Runtime:**
- Zero impact - types are erased during compilation
- No runtime code generated
- Same JavaScript output as intersection approach

## Files Changed

**Modified:**
- [packages/kitcn/src/orm/types.ts](../../packages/kitcn/src/orm/types.ts) - Added Merge utility, updated inference types

**Test files created:**
- [convex/test-types/ORIGINAL-ISSUE-never-type.ts](../../convex/test-types/ORIGINAL-ISSUE-never-type.ts) - Verifies fields are not `never`
- [convex/test-types/VERIFY-merge-fix-works.ts](../../convex/test-types/VERIFY-merge-fix-works.ts) - Verifies Merge preserves brands

## References

- Drizzle ORM source: `/tmp/cc-repos/drizzle-orm/drizzle-orm/src/table.ts` (InferModelFromColumns pattern)
- Drizzle's Simplify: `/tmp/cc-repos/drizzle-orm/drizzle-orm/src/utils.ts` (uses `& {}` stabilization)
- convex-ents pattern: Avoiding Record constraints for type preservation
- TypeScript Handbook: Intersection Types (doesn't document phantom type behavior)
- Related fix: [Schema integration issue](../integration-issues/convex-table-schema-integration-20260202.md) - Required this fix first
