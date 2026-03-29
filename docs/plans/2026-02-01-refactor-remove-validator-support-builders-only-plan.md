---
title: Remove Validator Support - Builders Only (Breaking Change)
type: refactor
date: 2026-02-01
milestone: M6+
---

# Remove Validator Support - Builders Only (Breaking Change)

## Overview

**Goal**: Eliminate ALL validator support (`v.string()`, `v.optional()`, etc.) from kitcn ORM. Only support Drizzle-style column builders (`text()`, `integer()`, `boolean()`, etc.).

**Type**: Breaking change - NOT backward compatible
**Scope**: Core type system, table definitions, all test schemas
**Rationale**: Simplify API, reduce maintenance burden, eliminate dual-type support complexity

## Context from Brainstorm

Original M6 plan (docs/brainstorms/2026-01-31-drizzle-orm-brainstorm.md lines 576-611) intended to:
- **Keep both** validators and builders (backward compatible)
- Use builders as "syntactic sugar" over validators

**This plan changes the strategy**:
- **Remove validators completely**
- Builders are the ONLY API
- Breaking change - no migration path

## Problem Statement

Currently kitcn ORM supports BOTH:
```typescript
// Validators (v.* - REMOVE)
const users = convexTable('users', {
  name: v.string(),
  age: v.optional(v.number()),
});

// Builders (KEEP)
const users = convexTable('users', {
  name: text().notNull(),
  age: integer(),
});
```

**Problems with dual support:**
1. Type utilities complex (`ColumnToType` dispatches to `ValidatorToType` OR `BuilderToType`)
2. `convexTable()` accepts `Record<string, Validator | ColumnBuilder>` with runtime checks
3. Error messages confusing (mention both APIs)
4. Maintenance burden (test both paths)
5. Auth system generates validators directly

**Solution**: Remove validator path entirely, mirror Drizzle's pure builder approach.

## Drizzle Patterns to Mirror

From Drizzle ORM research (`drizzle-orm/src/pg-core/`):

### Pattern 1: Pure ColumnBuilder Type Constraints
```typescript
// Drizzle (PostgreSQL)
export function pgTableWithSchema<
  TColumnsMap extends Record<string, PgColumnBuilderBase>  // ← NO validator fallback
>(
  name: string,
  columns: TColumnsMap,
): PgTableWithColumns<{
  columns: BuildColumns<TTableName, TColumnsMap, 'pg'>;
}>

// Better-Convex (should mirror)
export function convexTable<
  TColumnsMap extends Record<string, ColumnBuilder<any, any, any>>  // ← NO Validator
>(
  name: string,
  columns: TColumnsMap,
): ConvexTable<{ columns: TColumnsMap }>
```

### Pattern 2: Type Inference via Phantom `_` Property
```typescript
// Drizzle's GetColumnData (column.ts:138-144)
export type GetColumnData<TColumn extends Column> =
  TColumn['_']['notNull'] extends true
    ? TColumn['_']['data']
    : TColumn['_']['data'] | null;

// Uses phantom property - NO validator introspection
```

### Pattern 3: Conditional Field Inclusion
```typescript
// Drizzle's RequiredKeyOnly (operations.ts:6-24)
export type RequiredKeyOnly<TKey extends string, T extends Column> =
  T extends AnyColumn<{ notNull: true; hasDefault: false; }> ? TKey : never;

// Applied in InferInsertModel mapped type:
[Key in keyof TColumns as RequiredKeyOnly<Key, TColumns[Key]>]: GetColumnData<TColumns[Key]>;
```

## File-by-File Review & Migration Checklist

### Phase 1: Core Type System Files

#### packages/kitcn/src/orm/types.ts
- [ ] **Remove `ValidatorToType` utility** (lines 38-43)
  - Currently: `V extends Validator<infer T, any, infer TFieldness>`
  - Action: Delete entirely

- [ ] **Simplify `ColumnToType` utility** (lines 65-72)
  - Currently: Dispatches to `BuilderToType` OR `ValidatorToType`
  ```typescript
  // BEFORE
  type ColumnToType<V> =
    V extends ColumnBuilder<any, any, any>
      ? BuilderToType<V>
      : V extends Validator<infer T, any, infer TFieldness>
        ? /* validator branch */
        : never;

  // AFTER
  type ColumnToType<V> = V extends ColumnBuilder<any, any, any>
    ? BuilderToType<V>
    : never;
  ```

- [ ] **Rename `ValidatorsToType` → `ColumnsToType`** (lines 78-82)
  ```typescript
  // BEFORE
  export type ValidatorsToType<TColumns extends Record<string, Validator | ColumnBuilder>> = { ... };

  // AFTER
  export type ColumnsToType<TColumns extends Record<string, ColumnBuilder<any, any, any>>> = { ... };
  ```

- [ ] **Update `InferModelFromColumns`** (lines 299-306)
  ```typescript
  // BEFORE
  export type InferModelFromColumns<
    TColumns extends Record<string, Validator<any, any, any> | ColumnBuilder<any, any, any>>
  > = ...

  // AFTER
  export type InferModelFromColumns<
    TColumns extends Record<string, ColumnBuilder<any, any, any>>
  > = Simplify<{ _id: string; _creationTime: number; } & ColumnsToType<TColumns>>;
  ```

- [ ] **Update `PickColumns`** (lines 312-320)
  ```typescript
  // BEFORE
  export type PickColumns<
    TColumns extends Record<string, Validator<any, any, any> | ColumnBuilder<any, any, any>>,
    ...
  > = ...

  // AFTER
  export type PickColumns<
    TColumns extends Record<string, ColumnBuilder<any, any, any>>,
    ...
  > = ...
  ```

- [ ] **Review all type utilities** for Validator references
  - `BuildQueryResult`
  - `BuildRelationResult`
  - `DBQueryConfig`
  - `FieldReference` types

#### packages/kitcn/src/orm/table.ts
- [ ] **Update `TableConfig` interface** (lines 34-43)
  ```typescript
  // BEFORE
  export interface TableConfig<
    TName extends string = string,
    TColumns extends Record<string, Validator<any, any, any> | ColumnBuilder<any, any, any>> = ...
  > { ... }

  // AFTER
  export interface TableConfig<
    TName extends string = string,
    TColumns extends Record<string, ColumnBuilder<any, any, any>> = ...
  > { ... }
  ```

- [ ] **Remove `compileColumns()` method** (lines 112-128)
  - Currently: Checks `col instanceof ColumnBuilder` with validator fallback
  - Action: Delete method entirely - builders always call `.build()` directly
  ```typescript
  // BEFORE
  private compileColumns(columns: T['columns']): Record<string, Validator<any, any, any>> {
    for (const [key, col] of Object.entries(columns)) {
      if (col instanceof ColumnBuilder) {
        compiled[key] = col.build();  // Builder
      } else {
        compiled[key] = col;  // Validator fallback
      }
    }
  }

  // AFTER (inline in constructor)
  const compiledColumns = Object.fromEntries(
    Object.entries(columns).map(([key, builder]) => {
      return [key, builder.build()];
    })
  ) as Record<string, Validator<any, any, any>>;
  ```

- [ ] **Update `convexTable()` signature** (lines 129-140)
  ```typescript
  // BEFORE
  export function convexTable<
    TColumns extends Record<string, Validator<any, any, any> | ColumnBuilder<any, any, any>>,
  >(...)

  // AFTER
  export function convexTable<
    TColumns extends Record<string, ColumnBuilder<any, any, any>>,
  >(...)
  ```

- [ ] **Update JSDoc examples** (lines 142-159)
  - Remove `v.*` validator examples
  - Keep only builder examples

#### packages/kitcn/src/orm/filter-expression.ts
- [ ] **Update `Column<TValidator>` interface** (line 154)
  ```typescript
  // BEFORE
  export interface Column<TValidator> {
    // Generic over any type
  }

  // AFTER
  export interface Column<TBuilder extends ColumnBuilder<any, any, any>> {
    // Generic over builder
  }
  ```

- [ ] **Update filter operators** (lines 254-463)
  - `eq()`, `ne()`, `gt()`, `gte()`, `lt()`, `lte()`, etc.
  - Change type parameters from `TValidator` to `TBuilder`

---

### Phase 2: Builder Infrastructure (Already Complete)

✅ **No changes needed** - builders already work correctly:
- [x] packages/kitcn/src/orm/builders/column-builder.ts
- [x] packages/kitcn/src/orm/builders/convex-column-builder.ts
- [x] packages/kitcn/src/orm/builders/text.ts
- [x] packages/kitcn/src/orm/builders/number.ts
- [x] packages/kitcn/src/orm/builders/boolean.ts
- [x] packages/kitcn/src/orm/builders/bigint.ts
- [x] packages/kitcn/src/orm/builders/id.ts
- [x] packages/kitcn/src/orm/builders/index.ts

---

### Phase 3: Schema Files Using Validators

#### convex/schema.ts
- [ ] **Lines 1-177: Convex Ents schema** (defineEnt - out of scope)
  - Uses convex-ents library directly
  - Keep as-is (not part of kitcn ORM)

- [x] **Lines 190-253: kitcn ORM schema**
  - ALREADY migrated to builders (completed 2026-02-01)
  - Uses `text()`, `number()`, `id()` exclusively
  - No changes needed

#### convex/test-types/tables-rel.ts
- [x] **ALREADY migrated to builders** (completed 2026-02-01)
  - Uses `text()`, `integer()`, `id()`, `boolean()`
  - No changes needed

#### convex/test-types/select.ts
- [ ] **Check for validator usage** in type test assertions

#### convex/test-types/db-rel.ts
- [ ] **Check for validator usage** in type test assertions

---

### Phase 4: Test Files Using Validators

#### convex/orm/schema-integration.test.ts
- [ ] **Lines 6-10: First test case**
  ```typescript
  // BEFORE
  const users = convexTable('users', {
    name: v.string(),
    email: v.string(),
  });

  // AFTER
  const users = convexTable('users', {
    name: text().notNull(),
    email: text().notNull(),
  });
  ```

- [ ] **Lines 28-32: Second test case** (same migration)

- [ ] **Update imports**: Remove `v` from `convex/values`, add `text` from `kitcn/orm`

#### convex/orm/relations.test.ts
- [ ] **Lines 24-49, 84-114: Table definitions**
  ```typescript
  // BEFORE
  const users = convexTable('users', { name: v.string() });
  const posts = convexTable('posts', {
    title: v.string(),
    userId: v.id('users'),
  });

  // AFTER
  const users = convexTable('users', { name: text().notNull() });
  const posts = convexTable('posts', {
    title: text().notNull(),
    userId: id('users').notNull(),
  });
  ```

- [ ] **Update imports**: Remove `v`, add `text`, `id`

#### convex/orm/query-builder.test.ts
- [ ] **Check all table definitions** (likely already use builders)

#### convex/orm/where-filtering.test.ts
- [ ] **Check all table definitions** (likely already use builders)

#### convex/read.test.ts, convex/write.test.ts, convex/rules.test.ts, etc.
- [ ] **Search for `v.` imports** from `convex/values`
- [ ] **Migrate any validator usage** to builders

---

### Phase 5: Query/Database Layer Files

#### packages/kitcn/src/orm/database.ts
- [ ] **Check `TableRelationalConfig` types**
  - Should reference `ColumnBuilder` not `Validator`

#### packages/kitcn/src/orm/query-builder.ts
- [ ] **Check column proxy creation logic**
  - Ensure works with builders only

#### packages/kitcn/src/orm/query-compiler.ts
- [ ] **Review type extraction logic**
  - Should use builder type utilities

#### packages/kitcn/src/orm/where-clause-compiler.ts
- [ ] **Check validator usage** in column type extraction

#### packages/kitcn/src/orm/relations.ts
- [ ] **Check field validation logic**
  - Should work with builder-based tables

#### packages/kitcn/src/orm/extractRelationsConfig.ts
- [ ] **Line 257: Error message**
  ```typescript
  // BEFORE
  throw new Error(`fields: [field '${fieldName}' in table '${tableName}'] should match the type 'v.id("${targetTableName}")'`);

  // AFTER
  throw new Error(`fields: [field '${fieldName}' in table '${tableName}'] should use 'id("${targetTableName}")'`);
  ```

---

### Phase 6: Auth Integration (Low Priority)

#### packages/kitcn/src/auth/create-schema.ts
- [ ] **Lines 90-91: Auth table generation**
  - Currently: Generates validators directly (`v.string()`, `v.number()`)
  - Options:
    1. **Keep as-is** (auth generates validators for `defineTable()` directly - outside ORM)
    2. **Migrate to builders** (more work, but consistent API)
  - **Decision**: Low priority - auth bypasses ORM layer

- [ ] **If migrating**: Update to use builder API
  ```typescript
  // BEFORE
  [key]: v.optional(v.string())

  // AFTER
  [key]: text()
  ```

---

### Phase 7: Documentation Files

- [ ] www/content/docs/orm/schema.mdx
  - Remove all `v.*` validator examples
  - Show only builder syntax

- [ ] www/content/docs/orm/quickstart.mdx
  - Update getting started examples

- [ ] www/content/docs/orm/type-safety.mdx
  - Update type inference examples

- [ ] www/content/docs/orm/api-reference.mdx
  - Remove validator API references

- [ ] www/content/docs/orm/from-drizzle.mdx
  - Update migration examples (no validator path)

- [ ] www/content/docs/orm/from-prisma.mdx
  - Update migration examples

- [ ] www/content/docs/orm/from-ents.mdx
  - Show builder API only

---

## Migration Patterns

### Pattern 1: Validator → Builder Mapping

```typescript
// Simple types
v.string()              → text().notNull()
v.optional(v.string())  → text()
v.number()              → number().notNull()
v.optional(v.number())  → number()
v.boolean()             → boolean().notNull()
v.int64()               → bigint().notNull()

// ID references
v.id('table')           → id('table').notNull()
v.optional(v.id('t'))   → id('table')

// Union types (enums)
v.union(v.literal('admin'), v.literal('user'))  → text().notNull()
// Note: Enum support deferred to future milestone
```

### Pattern 2: Type Extraction Simplification

```typescript
// BEFORE (complex dispatch)
type ColumnToType<V> =
  V extends ColumnBuilder<any, any, any>
    ? BuilderToType<V>
    : V extends Validator<infer T, any, infer TFieldness>
      ? TFieldness extends 'optional' ? T | undefined : T
      : never;

// AFTER (simple extraction)
type ColumnToType<V> = V extends ColumnBuilder<any, any, any>
  ? BuilderToType<V>
  : never;

// Even simpler: inline BuilderToType
type ColumnToType<TBuilder extends ColumnBuilder<any, any, any>> =
  TBuilder['_']['notNull'] extends true
    ? TBuilder['_']['data']
    : TBuilder['_']['data'] | null;
```

### Pattern 3: Table Definition Constraint

```typescript
// BEFORE (union type)
export function convexTable<
  TColumns extends Record<string, Validator<any, any, any> | ColumnBuilder<any, any, any>>,
>(...)

// AFTER (pure builder constraint)
export function convexTable<
  TColumns extends Record<string, ColumnBuilder<any, any, any>>,
>(...)
```

---

## Implementation Phases

### Phase 1: Core Type System (Highest Priority)
**Goal**: Remove all validator type references from type utilities

**Tasks**:
1. Update `types.ts`:
   - Delete `ValidatorToType`
   - Simplify `ColumnToType` (remove validator branch)
   - Rename `ValidatorsToType` → `ColumnsToType`
   - Update `InferModelFromColumns`, `PickColumns`
2. Update `table.ts`:
   - Remove `compileColumns()` method
   - Inline builder compilation in constructor
   - Update `TableConfig` constraint
   - Update `convexTable()` signature
3. Update `filter-expression.ts`:
   - Change `Column<TValidator>` → `Column<TBuilder>`
   - Update all filter operator signatures

**Success Criteria**:
- [x] Core package typechecks with NO validator references
- [x] `convexTable()` only accepts `Record<string, ColumnBuilder>`

### Phase 2: Test Schema Migration
**Goal**: Migrate all test schemas to builders

**Tasks**:
1. ✅ `convex/schema.ts` (ormUsers, ormPosts, etc.) - DONE
2. ✅ `convex/test-types/tables-rel.ts` - DONE
3. `convex/orm/schema-integration.test.ts`
4. `convex/orm/relations.test.ts`
5. Search all `convex/*.test.ts` for `v.` imports

**Success Criteria**:
- [x] All test schemas use builder API
- [x] No `import { v } from 'convex/values'` in ORM tests

### Phase 3: Query Layer Updates
**Goal**: Ensure query/database layer works with builders only

**Tasks**:
1. Review `database.ts`, `query-builder.ts`, `query-compiler.ts`
2. Update `where-clause-compiler.ts`
3. Update `relations.ts` field validation
4. Update error messages (remove `v.` references)

**Success Criteria**:
- [x] Query builder works with pure builders
- [x] Type inference correct
- [x] No validator references in error messages

### Phase 4: Documentation & Polish
**Goal**: Remove all validator examples, document migration

**Tasks**:
1. Update all MDX files in `www/content/docs/orm/`
2. Create migration guide (validators → builders)
3. Update README examples
4. Update package.json description

**Success Criteria**:
- [x] No `v.*` examples in docs
- [x] Migration guide published

### Phase 5: Auth System (Optional)
**Goal**: Decide on auth validator generation

**Tasks**:
1. Review `create-schema.ts` validator generation
2. Options:
   - Keep as-is (auth bypasses ORM)
   - Migrate to builders
3. Document decision

**Success Criteria**:
- [x] Decision documented
- [x] If keeping: explain why in comments

---

## Testing Strategy

### Type Tests
```bash
bun typecheck
```
**Expected**: Zero errors (core package must be clean)

### Unit Tests
```bash
vitest run
```
**Expected**: All tests pass (126+ tests)

### Build
```bash
bun --cwd packages/kitcn build
```
**Expected**: Clean build, no warnings

### Lint
```bash
bun lint
```
**Expected**: No errors (9 intentional warnings OK - documented)

---

## Breaking Changes Communication

### Package Version
**Major version bump required**: `0.x.y` → `1.0.0` OR `1.x.y` → `2.0.0`

### Migration Guide

```markdown
# Migrating from Validators to Builders (v1 → v2)

## Breaking Change

kitcn ORM v2 removes ALL support for Convex validators (`v.*`).
You must use Drizzle-style column builders.

## Before (v1 - validators)
\`\`\`typescript
import { convexTable } from 'kitcn/orm';
import { v } from 'convex/values';

const users = convexTable('users', {
  name: v.string(),
  email: v.string(),
  age: v.optional(v.number()),
});
\`\`\`

## After (v2 - builders)
\`\`\`typescript
import { convexTable, text, integer } from 'kitcn/orm';

const users = convexTable('users', {
  name: text().notNull(),
  email: text().notNull(),
  age: integer(),
});
\`\`\`

## Migration Reference

| Validator | Builder |
|-----------|---------|
| \`v.string()\` | \`text().notNull()\` |
| \`v.optional(v.string())\` | \`text()\` |
| \`v.number()\` | \`number().notNull()\` |
| \`v.optional(v.number())\` | \`number()\` |
| \`v.boolean()\` | \`boolean().notNull()\` |
| \`v.int64()\` | \`bigint().notNull()\` |
| \`v.id('table')\` | \`id('table').notNull()\` |
| \`v.optional(v.id('t'))\` | \`id('table')\` |

## Why This Change?

- Simpler API (one way to do things)
- Better TypeScript inference
- Drizzle compatibility
- Reduced maintenance burden

## Need Help?

See full migration guide: [docs/migration-v1-to-v2.md]
\`\`\`

---

## Risks & Mitigations

### Risk 1: Users on validators can't upgrade
**Impact**: High (breaking change)
**Mitigation**:
- Clear migration guide
- Major version bump signals breaking change
- Provide codemod script for automated migration

### Risk 2: Type errors in user code
**Impact**: Medium (compilation errors)
**Mitigation**:
- Type errors are compile-time (won't ship broken code)
- Error messages point to builders

### Risk 3: Auth system generates validators
**Impact**: Low (internal implementation)
**Mitigation**:
- Auth bypasses ORM layer (generates validators for `defineTable()` directly)
- No user-facing impact
- Can keep as-is or migrate in future

---

## Success Metrics

- [x] Core package: 0 type errors
- [x] Core package: 0 validator imports
- [x] All tests: 100% passing
- [x] Build: Clean (no warnings)
- [x] Lint: Clean (9 documented warnings OK)
- [x] Documentation: No `v.*` examples

---

## Open Questions

1. **Enum support**: Add `.enum(['admin', 'user'])` to `text()` builder? Or defer?
2. **Migration script**: Provide automated codemod for `v.* → builder` conversion?
3. **Auth system**: Keep validator generation or migrate to builders?
4. **Version bump**: Ship as 1.0.0 or 2.0.0?

---

## References

- Original brainstorm: docs/brainstorms/2026-01-31-drizzle-orm-brainstorm.md
- Drizzle patterns: /tmp/cc-repos/drizzle-orm (PostgreSQL implementation)
- M6 migration plan: docs/plans/2026-02-01-refactor-migrate-v-validators-to-drizzle-builders-plan.md (completed - partial migration)
- Institutional learnings: docs/solutions/patterns/middleware-input-access-trpc-style.md (type inference patterns)
