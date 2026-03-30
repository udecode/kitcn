---
title: Milestone 1 - Schema Foundation (Drizzle-Convex ORM)
type: feat
date: 2026-01-31
---

# Milestone 1: Schema Foundation - TypeScript-First Table Definitions

## Overview

Implement the foundational schema layer for Drizzle-Convex ORM, providing TypeScript-first table definitions with full type inference. This milestone establishes the core API that developers will use to define database schemas, mirroring Drizzle ORM's ergonomics while adapting to Convex's document database architecture.

**Context**: Part of larger effort to clone Drizzle ORM's API for Convex, reducing learning curve for developers familiar with SQL ORMs. See [2026-01-31-drizzle-orm-brainstorm.md](../brainstorms/2026-01-31-drizzle-orm-brainstorm.md) for full project context.

**Scope**: Schema definition ONLY - no query builders, mutations, or relations (covered in later milestones).

## Problem Statement / Motivation

### Current Challenges with convex-ents

1. **Learning Barrier**: Developers familiar with Drizzle/Prisma face steep learning curve with convex-ents' unique API
2. **Different Paradigm**: Builder pattern (`.field()`, `.edge()`) differs from familiar schema definition approaches
3. **Type Complexity**: Generic type extraction requires understanding convex-ents internals

### Why Drizzle-Style Matters

- **Familiar Ergonomics**: Developers already know Drizzle's `pgTable()` pattern
- **TypeScript-Native**: No DSL parsing needed (unlike Prisma Schema Language)
- **Type Inference**: Automatic generation of insert/select types from schema
- **Reduced Context Switching**: Same mental model across SQL and document databases

### Success Looks Like

```typescript
// Drizzle-Convex (Goal)
import { convexTable, InferSelectModel, InferInsertModel } from 'kitcn/orm';

const users = convexTable("users", {
  name: v.string(),
  email: v.string(),
});

type User = InferSelectModel<typeof users>;
// → { _id: Id<'users'>, name: string, email: string, _creationTime: number }

type NewUser = InferInsertModel<typeof users>;
// → { name: string, email: string }
```

## Proposed Solution

### Core API Design

**Three Primary Exports**:

1. `convexTable(name, validators)` - Table definition function
2. `InferSelectModel<Table>` - Extract full document type (with system fields)
3. `InferInsertModel<Table>` - Extract insert type (without system fields)

### Critical Design Decisions

Based on SpecFlow analysis, resolving 5 critical questions:

#### Decision 1: Import Paths & Module Structure

**Decision**: Export from dedicated ORM submodule

```typescript
// Primary import path
import { convexTable, InferSelectModel, InferInsertModel } from 'kitcn/orm';
import { v } from 'convex/values';
```

**Rationale**:
- Separate namespace prevents collision with existing kitcn exports
- Allows independent evolution of ORM features
- Clear signal to developers ("this is ORM-specific")

#### Decision 2: Default Values (DEFERRED to Milestone 6)

**Decision**: NOT included in Milestone 1

**Rationale**:
- Convex validators don't support options objects natively
- Requires additional metadata layer (adds complexity)
- Can be added later without breaking changes
- Focus Milestone 1 on core type inference

**Future Syntax** (Milestone 6):
```typescript
// Option: Builder pattern
const posts = convexTable("posts", {
  status: v.string().default("draft"),
});
```

#### Decision 3: Optional Field Type Inference

**Decision**: Use truly optional properties (`field?: type`)

```typescript
const users = convexTable("users", {
  name: v.string(),
  nickname: v.optional(v.string()),
});

type NewUser = InferInsertModel<typeof users>;
// → { name: string, nickname?: string }
// NOT: { name: string, nickname: string | undefined }
```

**Rationale**:
- Matches Drizzle's behavior (familiar to developers)
- Better DX (can omit optional fields entirely)
- TypeScript convention: `?` for truly optional properties

#### Decision 4: System Fields in Type Inference

**Decision**: Include `_id` and `_creationTime` in SELECT, exclude from INSERT

```typescript
type User = InferSelectModel<typeof users>;
// → { _id: Id<'users'>, name: string, _creationTime: number }

type NewUser = InferInsertModel<typeof users>;
// → { name: string } // No _id, no _creationTime
```

**Rationale**:
- Convex auto-generates these fields on insert
- Matches Convex behavior exactly
- Prevents users from providing invalid values

#### Decision 5: Schema Integration

**Decision**: Return compatible object for direct `defineSchema()` usage

```typescript
import { defineSchema } from 'convex/server';

const users = convexTable("users", { name: v.string() });

export default defineSchema({
  users, // ✅ Works directly
});
```

**Implementation**: `convexTable()` returns object with `validator` property that Convex recognizes.

### Technical Approach

#### 1. Symbol-Based Metadata Storage

Following Drizzle's pattern, store metadata using symbols:

```typescript
// packages/kitcn/src/orm/symbols.ts
export const TableName = Symbol.for('kitcn:TableName');
export const Columns = Symbol.for('kitcn:Columns');
export const Brand = Symbol.for('kitcn:Brand');
```

**Why Symbols**:
- No namespace pollution
- Hidden from autocomplete
- Type-safe runtime introspection
- Can't accidentally override

#### 2. Type Branding with `_` Property

```typescript
// packages/kitcn/src/orm/table.ts
export class ConvexTable<T extends TableConfig> {
  declare readonly _: {
    readonly brand: 'ConvexTable';
    readonly name: T['name'];
    readonly columns: T['columns'];
    readonly inferSelect: InferSelectModel<ConvexTable<T>>;
    readonly inferInsert: InferInsertModel<ConvexTable<T>>;
  };

  [TableName]: T['name'];
  [Columns]: T['columns'];
}
```

**Purpose**: Enable generic type extraction without runtime overhead

#### 3. Type Inference Implementation

```typescript
// packages/kitcn/src/orm/types.ts
import { Simplify } from '../internal/types';

export type InferSelectModel<TTable extends ConvexTable<any>> = Simplify<
  {
    _id: Id<TTable['_']['name']>;
    _creationTime: number;
  } & ValidatorsToType<TTable['_']['columns']>
>;

export type InferInsertModel<TTable extends ConvexTable<any>> = Simplify<
  ValidatorsToType<TTable['_']['columns']>
>;

// Recursive type to extract types from validators
type ValidatorsToType<T> = {
  [K in keyof T]: ValidatorToType<T[K]>;
};

type ValidatorToType<V> =
  V extends Validator<infer T> ? T : never;
```

**Key Pattern**: Use `Simplify` utility to flatten complex intersections (from institutional learning)

#### 4. Convex Validator Handling

Support ALL standard Convex validators:

- Primitives: `v.string()`, `v.number()`, `v.boolean()`, `v.bigint()`
- IDs: `v.id("tableName")`
- Optional: `v.optional(v.string())`
- Objects: `v.object({ ... })`
- Arrays: `v.array(v.string())`
- Unions: `v.union(v.literal("a"), v.literal("b"))`
- Advanced: `v.bytes()`, `v.any()`, `v.null()`

**Implementation Strategy**: Map each validator type to corresponding TypeScript type using conditional types.

## Technical Considerations

### Architecture Impacts

**File Structure**:
```
packages/kitcn/src/orm/
├── index.ts          # Public exports
├── table.ts          # ConvexTable class
├── types.ts          # Type inference utilities
├── symbols.ts        # Symbol definitions
└── validators.ts     # Validator type mapping
```

**Integration Point**: Works alongside existing convex-ents (no conflicts)

### Performance Implications

- **Compile Time**: Type inference adds minimal compilation overhead (similar to Drizzle)
- **Runtime**: Symbols add ~100 bytes per table (negligible)
- **Type Checking**: Complex nested types may slow IDE on large schemas (acceptable tradeoff)

### Security Considerations

- **Table Name Validation**: Prevent reserved names (`_storage`, `_scheduled_functions`)
- **Symbol Collision**: Use namespaced symbols (`kitcn:*`) to avoid conflicts
- **Type Safety**: No runtime casting, all type inference is compile-time

### Test-Driven Development Strategy

**CRITICAL**: TDD approach is mandatory per brainstorm

**Starting Point**: [convex/types.test.ts:1-15](../../../convex/types.test.ts#L1-L15) (simplest test file)

**Test Progression**:
1. **types.test.ts** - Add Drizzle-style type tests alongside existing
2. **schema.test.ts** - Create new file for schema definition tests
3. **inference.test.ts** - Test type inference edge cases
4. Keep all 103 existing tests passing (use compatibility layer if needed)

**Test Pattern**:
```typescript
import { test, expect } from 'vitest';
import { convexTable, InferSelectModel, InferInsertModel } from '@/orm';

test('basic table definition', () => {
  const users = convexTable("users", {
    name: v.string(),
    email: v.string(),
  });

  expect(users[TableName]).toBe("users");
  expect(users[Columns]).toHaveProperty("name");
});

test('type inference - select model', () => {
  type User = InferSelectModel<typeof users>;

  // Compile-time type check
  const user: User = {
    _id: "123" as Id<"users">,
    name: "Alice",
    email: "alice@example.com",
    _creationTime: Date.now(),
  };

  expect(user.name).toBe("Alice");
});
```

### Validation & Error Handling

**Table Name Validation**:
```typescript
// Reserved names
const RESERVED_TABLES = new Set([
  '_storage',
  '_scheduled_functions',
]);

// Valid pattern: alphanumeric + underscore, no leading underscore (except system)
const TABLE_NAME_REGEX = /^[a-zA-Z][a-zA-Z0-9_]*$/;

function validateTableName(name: string): void {
  if (RESERVED_TABLES.has(name)) {
    throw new Error(
      `Table name '${name}' is reserved. System tables cannot be redefined.`
    );
  }
  if (!TABLE_NAME_REGEX.test(name)) {
    throw new Error(
      `Invalid table name '${name}'. Must start with letter, contain only alphanumeric and underscore.`
    );
  }
}
```

**Error Messages**:
- Invalid validator: "Expected Convex validator, got [type]. Did you mean v.string()?"
- Reserved table: "Table name '_storage' is reserved. System tables cannot be redefined."
- Invalid name: "Invalid table name 'my-table'. Must start with letter, contain only alphanumeric and underscore."

## Acceptance Criteria

### Core Functionality

- [ ] `convexTable(name, validators)` creates table definition
- [ ] Table name validation (regex, reserved names)
- [ ] Symbol metadata storage (TableName, Columns)
- [ ] Type brand `_` property with all metadata
- [ ] Compatible with `defineSchema()` (direct usage)

### Type Inference

- [ ] `InferSelectModel` includes `_id`, `_creationTime`, and all columns
- [ ] `InferInsertModel` excludes `_id` and `_creationTime`
- [ ] Optional fields (`v.optional()`) become truly optional (`field?: type`)
- [ ] Nested objects (`v.object()`) infer correctly
- [ ] Arrays (`v.array()`) infer correctly
- [ ] Unions (`v.union()`) infer correctly
- [ ] All Convex validator types supported

### Validator Support

**Primitives**:
- [ ] `v.string()` → `string`
- [ ] `v.number()` → `number`
- [ ] `v.boolean()` → `boolean`
- [ ] `v.bigint()` → `bigint`

**Special Types**:
- [ ] `v.id("table")` → `Id<"table">`
- [ ] `v.optional(v.string())` → `string | undefined` (SELECT), `string` (INSERT, optional key)
- [ ] `v.null()` → `null`
- [ ] `v.any()` → `any`

**Complex Types**:
- [ ] `v.object({ name: v.string() })` → `{ name: string }`
- [ ] `v.array(v.string())` → `string[]`
- [ ] `v.union(v.literal("a"), v.literal("b"))` → `"a" | "b"`

### Testing

- [ ] All 103 existing tests pass
- [ ] Add `types.test.ts` tests for basic table definition
- [ ] Add `types.test.ts` tests for InferSelectModel
- [ ] Add `types.test.ts` tests for InferInsertModel
- [ ] Add `types.test.ts` tests for optional fields
- [ ] Add `types.test.ts` tests for complex validators
- [ ] Edge case: empty validator object
- [ ] Edge case: nested optional fields

### Documentation

- [ ] JSDoc comments on all public exports
- [ ] Type parameter documentation
- [ ] Example usage in function signatures
- [ ] Migration note (NOT compatible with convex-ents in same schema yet)

## Success Metrics

### Quantitative

- **Type Safety**: 100% type inference coverage for all Convex validators
- **Test Coverage**: All 103 existing tests pass + 10+ new tests added
- **Bundle Size**: <5KB added to kitcn package (gzipped)
- **Compilation Time**: <10% increase on large schemas (100+ tables)

### Qualitative

- **Developer Experience**: Can define tables without reading docs (IntelliSense guides)
- **Error Quality**: Clear, actionable error messages for common mistakes
- **Familiarity**: Drizzle users recognize pattern immediately

### Verification

```typescript
// Before implementation (fails)
const users = convexTable("users", {
  name: v.string(),
  email: v.string(),
});
type User = InferSelectModel<typeof users>;
// Error: Cannot find name 'convexTable'

// After implementation (passes)
const users = convexTable("users", {
  name: v.string(),
  email: v.string(),
});
type User = InferSelectModel<typeof users>;
// → { _id: Id<'users'>, name: string, email: string, _creationTime: number }

// Use in schema
export default defineSchema({ users }); // ✅ Works
```

## Dependencies & Risks

### Dependencies

**Required Before Implementation**:
- None (self-contained milestone)

**Leverages Existing**:
- [packages/kitcn/src/internal/types.ts:13-15](../../../packages/kitcn/src/internal/types.ts#L13-L15) - `Simplify<T>` utility
- [packages/kitcn/src/crpc/types.ts:32](../../../packages/kitcn/src/crpc/types.ts#L32) - `Symbol.for()` pattern
- [convex/setup.testing.ts](../../../convex/setup.testing.ts) - Test harness
- [vitest.config.mts](../../../vitest.config.mts) - Edge-runtime test environment

**Blocks Future Milestones**:
- Milestone 2: Relations Layer (requires table metadata from M1)
- Milestone 3: Query Builder (requires type inference from M1)

### Risks

**High Risk**:

1. **Type Inference Complexity** (Likelihood: Medium, Impact: High)
   - **Risk**: Complex nested types may not infer correctly
   - **Mitigation**: Start with simple types, add complexity incrementally via TDD
   - **Fallback**: Document unsupported patterns, provide manual type annotations

2. **Convex Schema Compatibility** (Likelihood: Low, Impact: Critical)
   - **Risk**: `convexTable()` output may not work with `defineSchema()`
   - **Mitigation**: Test integration early, consult Convex docs
   - **Fallback**: Provide `.toConvexTable()` conversion method

**Medium Risk**:

3. **Performance on Large Schemas** (Likelihood: Medium, Impact: Low)
   - **Risk**: TypeScript compiler slowdown on 100+ tables
   - **Mitigation**: Use `Simplify` to flatten types, benchmark early
   - **Fallback**: Document performance characteristics, suggest code splitting

4. **Breaking Changes in Convex** (Likelihood: Low, Impact: Medium)
   - **Risk**: Convex validator API changes
   - **Mitigation**: Pin Convex version, monitor releases
   - **Fallback**: Version lock, update when stable

**Low Risk**:

5. **Symbol Collision** (Likelihood: Very Low, Impact: Low)
   - **Risk**: Another library uses same symbol names
   - **Mitigation**: Namespace symbols with `kitcn:*`
   - **Fallback**: Use local symbols instead of global

## References & Research

### Internal Documentation

**Brainstorm & Patterns**:
- [docs/brainstorms/2026-01-31-drizzle-orm-brainstorm.md](../brainstorms/2026-01-31-drizzle-orm-brainstorm.md) - Full project context
- [docs/brainstorms/2026-01-31-typescript-patterns-from-drizzle-and-ents.md](../brainstorms/2026-01-31-typescript-patterns-from-drizzle-and-ents.md) - Drizzle pattern analysis

**Existing Code Patterns**:
- [convex/schema.ts](../../../convex/schema.ts) - Current convex-ents schema (10+ tables with edges)
- [convex/types.ts:10-17](../../../convex/types.ts#L10-L17) - Generic type extraction pattern
- [convex/types.test.ts](../../../convex/types.test.ts) - Starting point for TDD (15 lines)

**Type Utilities**:
- [packages/kitcn/src/internal/types.ts](../../../packages/kitcn/src/internal/types.ts) - `Simplify`, `DistributiveOmit`, `DeepPartial`

### Institutional Learnings

**From docs/solutions/**:

1. **Type-Safe Builder Chains** ([middleware-input-access-trpc-style.md](../solutions/patterns/middleware-input-access-trpc-style.md))
   - Use generic type parameters to track builder state
   - Conditional inference: `T extends UnsetMarker ? unknown : z.infer<T>`
   - Order matters for type safety

2. **Schema Introspection** ([auto-coerce-searchparams-zod-schema.md](../solutions/integration-issues/auto-coerce-searchparams-zod-schema.md))
   - Use explicit `instanceof` checks, NOT duck typing
   - `ZodOptional`, `ZodNullable`, `ZodDefault` have different `unwrap()` behavior
   - Build `getBaseSchema()` helper to unwrap recursively

3. **Metadata Generation** ([nested-files-meta-generation-codegen.md](../solutions/build-errors/nested-files-meta-generation-codegen.md))
   - Use flat keys with `/` separator instead of nested objects
   - Create shared utilities for filtering and lookups

### Key Patterns Applied

**Symbol-Based Metadata** (from Drizzle):
```typescript
export const TableName = Symbol.for('kitcn:TableName');
export const Columns = Symbol.for('kitcn:Columns');
```

**Type Branding** (from Drizzle):
```typescript
declare readonly _: {
  readonly brand: 'ConvexTable';
  readonly name: T['name'];
  readonly inferSelect: InferSelectModel<ConvexTable<T>>;
};
```

**Conditional Type Inference** (from institutional learning):
```typescript
type ValidatorToType<V> =
  V extends Validator<infer T> ? T : never;
```

## Unresolved Questions

For future milestones:

1. **Default Values**: How to specify syntactically? (Deferred to M6)
2. **Builder Chaining**: Support `.optional().default()`? (Deferred to M6)
3. **convex-ents Migration**: Full compatibility or separate migration? (Deferred to M6)
4. **Index Hints**: How to specify indexes in schema? (Deferred to M2)
5. **Unique Constraints**: How to mark fields unique? (Deferred to M2)

## Next Steps

1. **Set up TDD environment** - Ensure vitest + convex-test working
2. **Create package structure** - `packages/kitcn/src/orm/`
3. **Write failing tests** - Start with `types.test.ts`
4. **Implement `convexTable()`** - Basic function with symbol metadata
5. **Implement type inference** - `InferSelectModel`, `InferInsertModel`
6. **Test schema integration** - Verify `defineSchema()` compatibility
7. **Iterate until green** - All tests passing (103 existing + new)

**Estimated Effort**: 2-3 days for experienced TypeScript developer

**Ready for Implementation**: Yes, all critical questions resolved
