---
title: Migrate from v.* Validators to Drizzle-Style Column Builders
type: refactor
date: 2026-02-01
milestone: M6 (Column Builders Only)
---

# Migrate from v.* Validators to Drizzle-Style Column Builders

## Overview

**Breaking change**: Replace all Convex validator syntax (`v.string()`, `v.number()`, etc.) with Drizzle-style column builders (`text()`, `integer()`, etc.) to provide familiar ORM ergonomics.

**Rationale**: Using `v.*` validators makes TypeScript type inference extremely difficult. Drizzle's column builder pattern provides clean type extraction and better DX. This migration focuses ONLY on the column builder API change, not other M6 features.

**Scope**:
- ✅ Create Drizzle-style column builders (`text()`, `integer()`, `boolean()`, etc.)
- ✅ Implement chaining methods (`.notNull()`, `.default()`, `.primaryKey()`)
- ✅ Update type inference to extract from builders instead of validators
- ✅ Migrate all schemas from `v.*` to builders
- ❌ **NOT included**: Transactions, computed fields, schema migrations (defer to separate M6.x milestones)

**Impact**:
- **Breaking**: All schemas must migrate from `v.string()` → `text()`
- **Type inference**: Simplified, following proven Drizzle patterns
- **Files affected**: 59 validator instances across convex/schema.ts + core ORM files

## Problem Statement

### Current State (M1-M5)

We're using Convex validators directly in schema definitions:

```typescript
const users = convexTable('users', {
  name: v.string(),
  email: v.string(),
  age: v.optional(v.number()),
  cityId: v.id('cities'),
});
```

**Type Inference Pain Points**:
1. `ValidatorToType` must unwrap nested `v.optional(v.number())` structures
2. Nullable vs optional distinction is confusing (Convex `optional` vs SQL `NULL`)
3. No builder pattern means no method chaining for constraints
4. Type extraction from `Validator<T, any, fieldness>` is complex
5. 40 persistent type errors due to complex conditional types

### Target State (M6 - This Refactor)

Drizzle-style column builders with clean type inference:

```typescript
const users = convexTable('users', {
  name: text().notNull(),
  email: text().notNull(),
  age: integer(),  // nullable by default
  cityId: id('cities').notNull(),
});
```

**Benefits**:
1. Clean type extraction: `text()` → `string | null`, `.notNull()` → `string`
2. Method chaining matches Drizzle exactly
3. Simpler `BuilderToType` utility (phantom `_` property pattern)
4. Familiar API for developers from SQL ORMs
5. Fixes type inference issues blocking M4 completion

## Proposed Solution

### Three-Layer Architecture

Following Drizzle's proven pattern:

```
ColumnBuilder (base abstract class)
  ↓
ConvexColumnBuilder (Convex-specific, replaces PgColumnBuilder)
  ↓
Specific Builders (ConvexTextBuilder, ConvexIntegerBuilder, etc.)
```

### Builder→Validator Compilation

**Key Design**: Builders are syntactic sugar that compile to Convex validators.

```typescript
// Builder creates validator internally
text().notNull()  →  v.string()
text()            →  v.optional(v.string())
integer()         →  v.optional(v.number())
id('users')       →  v.id('users')
```

**Why This Works**:
- Convex's `defineTable()` needs `Validator<T, any, any>`
- Builders store config, then call `build()` to produce validators
- Type system extracts from builder's phantom `_` property
- Runtime uses compiled validator for actual validation

## Technical Approach

### Phase 1: Builder Base Classes

**Files to create**:
- `packages/kitcn/src/orm/builders/column-builder.ts` - Base abstract class
- `packages/kitcn/src/orm/builders/convex-column-builder.ts` - Convex-specific base

**Base ColumnBuilder** (from Drizzle pattern):

```typescript
// packages/kitcn/src/orm/builders/column-builder.ts

export interface ColumnBuilderBaseConfig<
  TDataType extends ColumnDataType,
  TColumnType extends string,
> {
  name: string;
  dataType: TDataType;  // 'string' | 'number' | 'boolean' | 'bigint'
  columnType: TColumnType;  // 'ConvexText' | 'ConvexInteger' | etc.
  data: unknown;  // Actual TS type (string, number, boolean)
}

export interface ColumnBuilderRuntimeConfig<TData> {
  name: string;
  notNull: boolean;
  default: TData | SQL | undefined;
  hasDefault: boolean;
  primaryKey: boolean;
  dataType: string;
  columnType: string;
}

export abstract class ColumnBuilder<
  T extends ColumnBuilderBaseConfig<ColumnDataType, string>,
  TRuntimeConfig extends object = object,
> {
  static readonly [entityKind]: string = 'ColumnBuilder';

  // Phantom property - never instantiated, just for types
  declare _: {
    brand: 'ColumnBuilder';
    config: T;
    data: T['data'];
    notNull: false;  // Changed by .notNull()
    hasDefault: false;  // Changed by .default()
  };

  protected config: ColumnBuilderRuntimeConfig<T['data']> & TRuntimeConfig;

  constructor(
    name: T['name'],
    dataType: T['dataType'],
    columnType: T['columnType'],
  ) {
    this.config = {
      name,
      notNull: false,
      default: undefined,
      hasDefault: false,
      primaryKey: false,
      dataType,
      columnType,
    } as ColumnBuilderRuntimeConfig<T['data']> & TRuntimeConfig;
  }

  // Chaining methods (return type-branded instances)
  notNull(): NotNull<this> {
    this.config.notNull = true;
    return this as NotNull<this>;
  }

  default(value: T['data']): HasDefault<this> {
    this.config.default = value;
    this.config.hasDefault = true;
    return this as HasDefault<this>;
  }

  primaryKey(): IsPrimaryKey<NotNull<this>> {
    this.config.primaryKey = true;
    this.config.notNull = true;
    return this as IsPrimaryKey<NotNull<this>>;
  }

  // Abstract: subclasses produce Convex validators
  abstract build(): Validator<T['data'], any, any>;
}

// Type utilities for phantom type branding
export type NotNull<T extends ColumnBuilder<any>> = T & {
  _: { notNull: true };
};

export type HasDefault<T extends ColumnBuilder<any>> = T & {
  _: { hasDefault: true };
};

export type IsPrimaryKey<T extends ColumnBuilder<any>> = T & {
  _: { isPrimaryKey: true };
};
```

**ConvexColumnBuilder** (Convex-specific extensions):

```typescript
// packages/kitcn/src/orm/builders/convex-column-builder.ts

export abstract class ConvexColumnBuilder<
  T extends ColumnBuilderBaseConfig<ColumnDataType, string>,
  TRuntimeConfig extends object = object,
> extends ColumnBuilder<T, TRuntimeConfig> {
  static override readonly [entityKind]: string = 'ConvexColumnBuilder';

  // Optional references for foreign keys (Convex-specific)
  references(
    tableName: string,
  ): this {
    // Store reference config for validation
    return this;
  }

  // Override build to produce Convex validators
  abstract override build(): Validator<T['data'], any, any>;
}
```

### Phase 2: Specific Column Builders

**Files to create**:
- `packages/kitcn/src/orm/builders/text.ts`
- `packages/kitcn/src/orm/builders/integer.ts`
- `packages/kitcn/src/orm/builders/boolean.ts`
- `packages/kitcn/src/orm/builders/bigint.ts`
- `packages/kitcn/src/orm/builders/id.ts`
- `packages/kitcn/src/orm/builders/number.ts`

**Text Builder**:

```typescript
// packages/kitcn/src/orm/builders/text.ts

import { v } from 'convex/values';
import type { Validator } from 'convex/values';
import { ConvexColumnBuilder } from './convex-column-builder';

export type ConvexTextBuilderInitial<TName extends string> = ConvexTextBuilder<{
  name: TName;
  dataType: 'string';
  columnType: 'ConvexText';
  data: string;
}>;

export class ConvexTextBuilder<
  T extends ColumnBuilderBaseConfig<'string', 'ConvexText'>,
> extends ConvexColumnBuilder<T> {
  static override readonly [entityKind]: string = 'ConvexTextBuilder';

  constructor(name: T['name']) {
    super(name, 'string', 'ConvexText');
  }

  // Compile to Convex validator
  override build(): Validator<string, any, any> {
    if (this.config.notNull) {
      return v.string();  // Required string
    } else {
      return v.optional(v.string());  // Optional string (nullable)
    }
  }
}

// Factory function (overloads for name vs no-name)
export function text(): ConvexTextBuilderInitial<''>;
export function text<TName extends string>(
  name: TName,
): ConvexTextBuilderInitial<TName>;
export function text(name?: string) {
  return new ConvexTextBuilder(name ?? '');
}
```

**Integer Builder**:

```typescript
// packages/kitcn/src/orm/builders/integer.ts

import { v } from 'convex/values';
import type { Validator } from 'convex/values';
import { ConvexColumnBuilder } from './convex-column-builder';

export type ConvexIntegerBuilderInitial<TName extends string> = ConvexIntegerBuilder<{
  name: TName;
  dataType: 'number';
  columnType: 'ConvexInteger';
  data: number;
}>;

export class ConvexIntegerBuilder<
  T extends ColumnBuilderBaseConfig<'number', 'ConvexInteger'>,
> extends ConvexColumnBuilder<T> {
  static override readonly [entityKind]: string = 'ConvexIntegerBuilder';

  constructor(name: T['name']) {
    super(name, 'number', 'ConvexInteger');
  }

  override build(): Validator<number, any, any> {
    if (this.config.notNull) {
      return v.number();
    } else {
      return v.optional(v.number());
    }
  }
}

export function integer(): ConvexIntegerBuilderInitial<''>;
export function integer<TName extends string>(
  name: TName,
): ConvexIntegerBuilderInitial<TName>;
export function integer(name?: string) {
  return new ConvexIntegerBuilder(name ?? '');
}
```

**Boolean Builder**:

```typescript
// packages/kitcn/src/orm/builders/boolean.ts

export class ConvexBooleanBuilder<
  T extends ColumnBuilderBaseConfig<'boolean', 'ConvexBoolean'>,
> extends ConvexColumnBuilder<T> {
  static override readonly [entityKind]: string = 'ConvexBooleanBuilder';

  constructor(name: T['name']) {
    super(name, 'boolean', 'ConvexBoolean');
  }

  override build(): Validator<boolean, any, any> {
    if (this.config.notNull) {
      return v.boolean();
    } else {
      return v.optional(v.boolean());
    }
  }
}

export function boolean(): ConvexBooleanBuilderInitial<''>;
export function boolean<TName extends string>(
  name: TName,
): ConvexBooleanBuilderInitial<TName>;
export function boolean(name?: string) {
  return new ConvexBooleanBuilder(name ?? '');
}
```

**ID Builder** (Convex-specific):

```typescript
// packages/kitcn/src/orm/builders/id.ts

export class ConvexIdBuilder<
  T extends ColumnBuilderBaseConfig<'string', 'ConvexId'>,
  TTableName extends string = string,
> extends ConvexColumnBuilder<T & { tableName: TTableName }> {
  static override readonly [entityKind]: string = 'ConvexIdBuilder';

  constructor(
    name: T['name'],
    private tableName: TTableName,
  ) {
    super(name, 'string', 'ConvexId');
  }

  override build(): Validator<GenericId<TTableName>, any, any> {
    if (this.config.notNull) {
      return v.id(this.tableName);
    } else {
      return v.optional(v.id(this.tableName));
    }
  }
}

export function id<TTableName extends string>(
  tableName: TTableName,
): ConvexIdBuilderInitial<'', TTableName>;
export function id<TName extends string, TTableName extends string>(
  name: TName,
  tableName: TTableName,
): ConvexIdBuilderInitial<TName, TTableName>;
export function id(a: string, b?: string) {
  if (b !== undefined) {
    return new ConvexIdBuilder(a, b);  // name + tableName
  } else {
    return new ConvexIdBuilder('', a);  // just tableName
  }
}
```

### Phase 3: Update Type Inference

**Files to modify**:
- `packages/kitcn/src/orm/types.ts` - Add `BuilderToType` utility

**Current ValidatorToType** (works with validators):

```typescript
// Current approach - extracts from Validator generic
type ValidatorToType<V> =
  V extends Validator<infer T, any, infer TFieldness>
    ? TFieldness extends 'optional'
      ? T | undefined
      : T
    : never;
```

**New BuilderToType** (extracts from builder's `_` phantom property):

```typescript
// packages/kitcn/src/orm/types.ts

// Extract type from column builder
export type BuilderToType<TBuilder extends ColumnBuilder<any>> =
  TBuilder['_']['notNull'] extends true
    ? TBuilder['_']['data']  // notNull → just the data type
    : TBuilder['_']['data'] | null;  // nullable → union with null

// Unified extraction (supports both validators AND builders)
export type ColumnToType<V> =
  V extends ColumnBuilder<any>
    ? BuilderToType<V>  // New builder path
    : V extends Validator<infer T, any, infer TFieldness>
      ? TFieldness extends 'optional'
        ? T | undefined
        : T
      : never;  // Existing validator path

// Update InferSelectModel to use ColumnToType
export type InferSelectModel<TTable extends ConvexTable<any>> = Simplify<
  {
    _id: GenericId<TTable['_']['name']>;
    _creationTime: number;
  } & {
    [K in keyof TTable['_']['columns']]: ColumnToType<TTable['_']['columns'][K]>;
  }
>;

// InferInsertModel excludes system fields and handles defaults
export type InferInsertModel<TTable extends ConvexTable<any>> = Simplify<
  {
    [K in keyof TTable['_']['columns']]: TTable['_']['columns'][K] extends ColumnBuilder<any>
      ? TTable['_']['columns'][K]['_']['hasDefault'] extends true
        ? BuilderToType<TTable['_']['columns'][K]> | undefined  // Optional if has default
        : BuilderToType<TTable['_']['columns'][K]>
      : ColumnToType<TTable['_']['columns'][K]>;
  }
>;
```

### Phase 4: Update convexTable to Accept Builders

**File to modify**:
- `packages/kitcn/src/orm/table.ts`

**Current** (only accepts validators):

```typescript
export function convexTable<
  TTableName extends string,
  TColumns extends Record<string, Validator<any, any, any>>,
>(
  name: TTableName,
  columns: TColumns,
): ConvexTable<{
  name: TTableName;
  columns: TColumns;
}> {
  return new ConvexTable<{
    name: TTableName;
    columns: TColumns;
  }>(name, columns);
}
```

**Updated** (accepts builders OR validators):

```typescript
export function convexTable<
  TTableName extends string,
  TColumns extends Record<string, ColumnBuilder<any> | Validator<any, any, any>>,
>(
  name: TTableName,
  columns: TColumns,
): ConvexTable<{
  name: TTableName;
  columns: TColumns;
}> {
  // Compile builders to validators
  const compiledColumns = Object.fromEntries(
    Object.entries(columns).map(([key, col]) => [
      key,
      col instanceof ColumnBuilder ? col.build() : col,
    ]),
  ) as Record<string, Validator<any, any, any>>;

  return new ConvexTable<{
    name: TTableName;
    columns: TColumns;  // Store original (builders), not compiled
  }>(name, compiledColumns);  // Pass compiled validators to constructor
}
```

**ConvexTable constructor update**:

```typescript
export class ConvexTable<T extends TableConfig> {
  // ... existing phantom properties

  constructor(
    name: T['name'],
    private compiledColumns: Record<string, Validator<any, any, any>>,
  ) {
    this[TableName] = name;
    this[Columns] = compiledColumns;  // Use compiled validators
  }

  // Schema generation uses compiled validators
  toConvexSchema(): GenericTableInfo {
    return defineTable(this.compiledColumns);
  }
}
```

### Phase 5: Migrate Schemas

**Files to migrate**:
1. `convex/schema.ts` - Main schema (59 validator instances)
2. `convex/test-types/tables-rel.ts` - Type test schemas
3. `convex/*.test.ts` - Inline test schemas

**Migration Pattern**:

```typescript
// BEFORE (M1-M5)
const users = convexTable('users', {
  name: v.string(),
  email: v.string(),
  age: v.optional(v.number()),
  cityId: v.id('cities'),
  homeCityId: v.optional(v.id('cities')),
});

// AFTER (M6)
import { text, integer, id } from 'kitcn/orm/builders';

const users = convexTable('users', {
  name: text().notNull(),
  email: text().notNull(),
  age: integer(),  // nullable by default
  cityId: id('cities').notNull(),
  homeCityId: id('cities'),  // nullable
});
```

**Union Types Migration**:

```typescript
// BEFORE
role: v.union(
  v.literal('admin'),
  v.literal('user'),
  v.literal('guest'),
)

// AFTER (Phase 5.1 - simple approach)
role: text().notNull()  // Runtime validation happens elsewhere

// AFTER (Phase 5.2 - with enum support, optional)
role: text({ enum: ['admin', 'user', 'guest'] as const }).notNull()
```

### Phase 6: Update Exports

**File to modify**:
- `packages/kitcn/src/orm/index.ts`

**Add builder exports**:

```typescript
// Column builders
export {
  text,
  integer,
  boolean,
  bigint,
  number,
  id,
} from './builders';

export type {
  ConvexTextBuilder,
  ConvexIntegerBuilder,
  ConvexBooleanBuilder,
  ConvexBigIntBuilder,
  ConvexNumberBuilder,
  ConvexIdBuilder,
} from './builders';

// Base builder classes (for advanced usage)
export {
  ColumnBuilder,
  ConvexColumnBuilder,
} from './builders/column-builder';
```

## Implementation Phases

### Phase 1: Builder Foundation (2-3 hours)
- [ ] Create `builders/column-builder.ts` - Base abstract class
- [ ] Create `builders/convex-column-builder.ts` - Convex-specific base
- [ ] Add type utilities (`NotNull`, `HasDefault`, `IsPrimaryKey`)
- [ ] Add entityKind symbol pattern
- [ ] Test: Instantiate builder, call `.notNull()`, verify type

### Phase 2: Core Builders (3-4 hours)
- [ ] Implement `text()` builder with `.notNull()`, `.default()`
- [ ] Implement `integer()` builder
- [ ] Implement `boolean()` builder
- [ ] Implement `bigint()` builder
- [ ] Implement `number()` builder (for floats)
- [ ] Implement `id()` builder (Convex-specific)
- [ ] Test: Each builder compiles to correct validator

### Phase 3: Type Inference (2-3 hours)
- [ ] Add `BuilderToType` utility to types.ts
- [ ] Update `ColumnToType` to support builders AND validators
- [ ] Update `InferSelectModel` with new extraction
- [ ] Update `InferInsertModel` to handle `.hasDefault`
- [ ] Test: Type tests verify `text().notNull()` → `string`

### Phase 4: Table Integration (1-2 hours)
- [ ] Update `convexTable()` to accept builders
- [ ] Add builder→validator compilation in `convexTable()`
- [ ] Store compiled validators for schema generation
- [ ] Test: Define table with builders, verify schema output

### Phase 5: Schema Migration (3-4 hours)
- [ ] Migrate `convex/schema.ts` (59 instances)
  - [ ] `v.string()` → `text().notNull()`
  - [ ] `v.optional(v.string())` → `text()`
  - [ ] `v.number()` → `integer().notNull()` or `number().notNull()`
  - [ ] `v.optional(v.number())` → `integer()` or `number()`
  - [ ] `v.boolean()` → `boolean().notNull()`
  - [ ] `v.id('table')` → `id('table').notNull()`
  - [ ] `v.optional(v.id('table'))` → `id('table')`
- [ ] Migrate `convex/test-types/tables-rel.ts`
- [ ] Migrate inline schemas in `*.test.ts` files
- [ ] Remove all `import { v } from 'convex/values'` (except where truly needed)

### Phase 6: Exports & Documentation (1 hour)
- [ ] Add builder exports to `packages/kitcn/src/orm/index.ts`
- [ ] Update `package.json` exports for `kitcn/orm/builders`
- [ ] Add JSDoc comments to all builder functions
- [ ] Document breaking changes in CHANGELOG.md

### Phase 7: Testing & Validation (2-3 hours)
- [ ] Run full test suite: `vitest run`
- [ ] Run type check: `bun typecheck`
- [ ] Verify 40 type errors are resolved
- [ ] Add new type tests for builder type inference
- [ ] Test edge cases: nullable, defaults, primaryKey combinations
- [ ] Verify defineRelations() still works with compiled validators

**Total Estimate**: 14-20 hours

## Acceptance Criteria

### Functional Requirements

- [ ] All 6 core builders implemented: `text()`, `integer()`, `boolean()`, `bigint()`, `number()`, `id()`
- [ ] Chaining methods work: `.notNull()`, `.default()`, `.primaryKey()`
- [ ] Builders compile to correct Convex validators
- [ ] Type inference extracts correct types from builders
- [ ] `convexTable()` accepts both builders and validators
- [ ] All schemas migrated from `v.*` to builders
- [ ] No `v.*` validator usage remains (except internal compilation)

### Type Safety Requirements

- [ ] `text().notNull()` infers as `string` (not `string | null`)
- [ ] `text()` infers as `string | null`
- [ ] `integer().default(0)` is optional on insert, required on select
- [ ] `id('users').notNull()` infers as `Id<'users'>`
- [ ] `InferSelectModel` works with builder-defined tables
- [ ] `InferInsertModel` works with builder-defined tables
- [ ] All 40+ type errors resolved

### Quality Gates

- [ ] Zero TypeScript errors: `bun typecheck`
- [ ] All tests pass: `vitest run` (126+ tests)
- [ ] Build succeeds: `bun --cwd packages/kitcn build`
- [ ] Linting passes: `bun lint`
- [ ] No breaking changes to query builder API (M3-M4)

## Migration Strategy

### Breaking Changes

**This is a BREAKING refactor**. All schemas must migrate.

**Migration Path**:
1. Update `kitcn` to M6 version
2. Replace all `v.*` validators with builders
3. Run type check and fix any errors
4. Test thoroughly

### Automated Migration (Optional Future Work)

Could create a codemod for automated migration:

```bash
npx @kitcn/codemod migrate-to-builders convex/schema.ts
```

Pattern matching:
- `v.string()` → `text().notNull()`
- `v.optional(v.string())` → `text()`
- `v.number()` → `integer().notNull()` or `number().notNull()`
- etc.

**Defer to separate task** - manual migration is fast enough for this codebase.

### Rollback Plan

If M6 migration fails:
1. `git revert` to M5 commit
2. All `v.*` validators still work in M5
3. No data migration needed (validators compile to same schema)

## Risk Analysis & Mitigation

### Risk 1: Type Inference Regression

**Risk**: New `BuilderToType` breaks existing type inference.

**Mitigation**:
- Keep `ValidatorToType` working alongside `BuilderToType`
- `ColumnToType` dispatches to correct utility based on input type
- Run full type test suite before merging

**Likelihood**: Low (following proven Drizzle pattern)

### Risk 2: Runtime Validator Compilation Issues

**Risk**: Builders don't compile to correct validators, breaking Convex schema.

**Mitigation**:
- Test each builder's `.build()` output manually
- Verify `defineTable()` accepts compiled validators
- Compare compiled schema to M5 schema (should be identical)

**Likelihood**: Low (simple mapping)

### Risk 3: Migration Errors

**Risk**: Missing some `v.*` usage, causing mixed validator/builder schemas.

**Mitigation**:
- Grep for all `v\.` usage before declaring complete
- TypeScript will error on mixed usage (validators vs builders)
- Run full test suite to catch runtime issues

**Likelihood**: Low (TypeScript catches this)

### Risk 4: Performance Regression

**Risk**: Builder instantiation adds runtime overhead.

**Mitigation**:
- Builders only instantiated at schema definition time (not query time)
- `.build()` called once per table, cached in ConvexTable
- No performance impact on queries (M3-M4 unchanged)

**Likelihood**: Very Low (schema definition is one-time cost)

## References & Research

### Internal Documentation

- [Brainstorm: Drizzle-Convex](../brainstorms/2026-01-31-drizzle-orm-brainstorm.md) - Original M1-M6 plan
- [M1 Plan: Schema Foundation](./2026-01-31-feat-milestone-1-schema-foundation-plan.md) - Validator-based approach
- [Type Inference Fix Plan](./2026-02-01-fix-orm-type-inference-drizzle-patterns-plan.md) - Context on 40 type errors

### External References

- **Drizzle ORM Source**:
  - `/tmp/cc-repos/drizzle-orm/drizzle-orm/src/column-builder.ts` - Base builder pattern
  - `/tmp/cc-repos/drizzle-orm/drizzle-orm/src/pg-core/columns/text.ts` - Text builder
  - `/tmp/cc-repos/drizzle-orm/drizzle-orm/src/pg-core/columns/integer.ts` - Integer builder
  - `/tmp/cc-repos/drizzle-orm/drizzle-orm/src/pg-core/columns/common.ts` - PgColumnBuilder
  - `/tmp/cc-repos/drizzle-orm/drizzle-orm/src/entity.ts` - entityKind symbol pattern

### Key Insights from Drizzle

1. **Phantom `_` Property**: Accumulates type info without runtime cost
2. **Type-Preserving Methods**: Return `this as SomeType<this>` for chaining
3. **Symbol-Based Metadata**: `entityKind` enables runtime type checking
4. **Config Accumulation**: Mutable `config` object stores runtime state
5. **Conditional Type Utilities**: `NotNull<T>`, `HasDefault<T>` brand types
6. **Factory Overloads**: Handle flexible API (name vs no-name) cleanly

## Success Metrics

### Code Quality

- **Type Safety**: 0 TypeScript errors (down from 40)
- **Test Coverage**: All 126+ tests passing
- **Build Time**: No regression (builders are compile-time only)
- **Bundle Size**: Minimal increase (<5KB for builder classes)

### Developer Experience

- **API Familiarity**: Drizzle developers feel at home
- **Type Inference**: Autocomplete works for `.notNull()`, `.default()`
- **Error Messages**: Clear errors for invalid builder usage
- **Migration Effort**: <1 hour to migrate all schemas

### Technical Debt

- **Reduced Complexity**: Simpler type inference (BuilderToType vs ValidatorToType)
- **Pattern Alignment**: Now matches Drizzle exactly (easier to maintain)
- **Foundation for M6.x**: Enables future builder enhancements (transactions, computed fields)

## Future Work (NOT in This Refactor)

**Explicitly deferred to separate milestones**:

- M6.1: Transactions (Convex mutations are already transactional)
- M6.2: Computed fields / extras
- M6.3: Relation load strategies
- M6.4: Schema migration helpers
- M6.5: Enum support in builders (`text({ enum: [...] })`)
- M6.6: Default values with `$defaultFn()` (dynamic defaults)

**Why defer**: Focus on ONLY the v.* → builder migration. Each future feature deserves its own focused implementation.

## Open Questions

- [ ] **Q1**: Should `number()` builder exist separately from `integer()`?
  - **Context**: Convex uses `v.number()` for both integers and floats
  - **Drizzle**: Has `integer()`, `real()`, `doublePrecision()`, `numeric()`
  - **Proposal**: Start with `integer()` and `number()` (for floats), add precision types later
  - **Decision**: [TBD - ask user]

- [ ] **Q2**: How to handle `v.union()` patterns (enums)?
  - **Context**: Convex uses `v.union(v.literal('a'), v.literal('b'))` for enums
  - **Drizzle**: Uses `text({ enum: pgEnum('role', ['admin', 'user']) })`
  - **Proposal**: Phase 5.1 use plain `text().notNull()`, Phase 5.2+ add enum support
  - **Decision**: [TBD - ask user]

- [ ] **Q3**: Backward compatibility with `v.*` validators?
  - **Context**: User explicitly said "DONT be backward compatible"
  - **Proposal**: Remove all `v.*` usage in one PR (breaking change)
  - **Decision**: [TBD - confirm with user]

## Implementation Order

1. **Phase 1**: Builder foundation (column-builder.ts, convex-column-builder.ts)
2. **Phase 2**: Core builders (text, integer, boolean, id)
3. **Phase 3**: Type inference updates (BuilderToType, ColumnToType)
4. **Phase 4**: Table integration (convexTable accepts builders)
5. **Phase 5**: Schema migration (convex/schema.ts, test files)
6. **Phase 6**: Exports & docs
7. **Phase 7**: Testing & validation

**Total Phases**: 7
**Estimated Time**: 14-20 hours
**Complexity**: High (TypeScript type system, breaking change)

---

**Next Steps**:
1. Review this plan with team/user
2. Answer open questions (Q1-Q3)
3. Get approval for breaking change
4. Execute phases 1-7
5. Merge to main
