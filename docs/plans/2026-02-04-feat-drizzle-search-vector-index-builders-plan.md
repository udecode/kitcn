---
title: Implement searchIndex() and vectorIndex() Drizzle-style Builders
type: feat
date: 2026-02-04
---

# Implement searchIndex() and vectorIndex() Drizzle-style Builders

Dig into https://github.com/zbeyens/drizzle-v1 for Drizzle v1 - it's the latest version of Drizzle. Only when needed, you can dig into https://github.com/drizzle-team/drizzle-orm which was the original reference so far.
Make sure we maximize mirroring drizzle-v1 - dont forget all ts answers are in drizzle repo, dig into it when needed. they master more typescript than you. drizzle has many db integrations so just pick the most relevant one - making sure we mirror all typing magic - dig into https://github.com/get-convex/convex-backend if you need to dig into convex typing, testing or src code.
SAME for testing / type testing - but when you need to test convex part, see .claude/skills/kitcn-test/convex-test.mdc or convex-backend/npm-packages tests. see @.claude/skills/kitcn-test-orm/convex-test-orm.mdc for more details. We don't want to reinvent the wheel, but we want the closest API to Drizzle. At the end of each package change, make sure you didn't break the types: `bun typecheck` at root and `bun run test` at root.agents/skills/dig/SKILL.md has more details on how to dig into code.

## Overview

Complete Phase 2 of Drizzle v1 index API migration by implementing searchIndex() and vectorIndex() builders that extend the Drizzle pattern for Convex-specific features.

**Phase 1 Status**: ✅ COMPLETED

- `index()` and `uniqueIndex()` builders working
- extraConfig callback pattern established
- Type-safe column references with validation

**Phase 2 Goal**: Add searchIndex() and vectorIndex() builders

- Follow same builder pattern as Phase 1
- Support Convex-specific features (search, vectors)
- Maintain full type safety and Drizzle API parity

## Problem Statement

Current schema uses deprecated method chaining for search/vector indexes:

```ts
// Old syntax (method chaining)
const posts = convexTable("posts", { text: text() }).searchIndex("text", {
  searchField: "text",
  filterFields: ["type"],
});
```

**Issues:**

1. **Inconsistent API**: Basic indexes use builder pattern, search/vector use methods
2. **String literals**: Filter fields are strings, not type-safe column references
3. **Doesn't match Drizzle**: Diverges from established Drizzle v1 patterns
4. **Mixed syntax during migration**: Confusing developer experience

## Proposed Solution

Extend extraConfig builder pattern to search and vector indexes:

```ts
// New syntax (builders in extraConfig)
const posts = convexTable(
  "posts",
  {
    text: text().notNull(),
    type: text().notNull(),
    embedding: vector(1536),
  },
  (t) => [
    searchIndex("text_search").on(t.text).filter(t.type),
    vectorIndex("embedding_vec")
      .on(t.embedding)
      .dimensions(1536)
      .filter(t.type),
  ],
);
```

**Benefits:**

1. **Consistent API**: All indexes use same builder pattern
2. **Type safety**: Column references instead of strings
3. **Drizzle parity**: Natural extension of Drizzle v1 patterns
4. **Better DX**: IDE autocomplete for columns and methods

## Technical Approach

### Architecture

**Builder Pattern** (mirroring Phase 1):

```
SearchIndexBuilderOn → .on(field) → SearchIndexBuilder → .filter(...fields) → SearchIndexBuilder
VectorIndexBuilderOn → .on(field) → VectorIndexBuilder → .dimensions(n) / .filter(...) → VectorIndexBuilder
```

**Integration Points:**

1. **New builder classes** in `packages/kitcn/src/orm/indexes.ts`
2. **Update extraConfig processing** in `packages/kitcn/src/orm/table.ts`
3. **Export new functions** from `packages/kitcn/src/orm/index.ts`
4. **Add vector column builder** (decision needed - see Open Questions)

### Implementation Phases

#### Phase 2a: Search Index Builders

**Files to modify:**

- `packages/kitcn/src/orm/indexes.ts`
- `packages/kitcn/src/orm/table.ts`
- `packages/kitcn/src/orm/index.ts`

**New classes:**

```ts
// indexes.ts
export class ConvexSearchIndexBuilderOn {
  static readonly [entityKind] = "ConvexSearchIndexBuilderOn";
  readonly [entityKind]: typeof ConvexSearchIndexBuilderOn.prototype.entityKind;

  constructor(private name: string) {}

  on(searchField: ConvexIndexColumn): ConvexSearchIndexBuilder {
    return new ConvexSearchIndexBuilder(this.name, searchField);
  }
}

export class ConvexSearchIndexBuilder {
  static readonly [entityKind] = "ConvexSearchIndexBuilder";
  readonly [entityKind]: typeof ConvexSearchIndexBuilder.prototype.entityKind;

  declare _: { brand: "ConvexSearchIndexBuilder" };

  config: ConvexSearchIndexConfig;

  constructor(name: string, searchField: ConvexIndexColumn) {
    this.config = {
      name,
      searchField,
      filterFields: [],
      staged: false,
    };
  }

  filter(...fields: ConvexIndexColumn[]): this {
    this.config.filterFields = fields;
    return this;
  }

  staged(): this {
    this.config.staged = true;
    return this;
  }
}

export function searchIndex(name: string): ConvexSearchIndexBuilderOn {
  return new ConvexSearchIndexBuilderOn(name);
}
```

**Config type:**

```ts
export interface ConvexSearchIndexConfig {
  name: string;
  searchField: ConvexIndexColumn;
  filterFields: ConvexIndexColumn[];
  staged: boolean;
}
```

**table.ts updates:**

```ts
// Add type guard
function isConvexSearchIndexBuilder(
  value: unknown,
): value is ConvexSearchIndexBuilder {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { [entityKind]?: string })[entityKind] ===
      "ConvexSearchIndexBuilder"
  );
}

// Update applyExtraConfig
if (isConvexSearchIndexBuilder(entry)) {
  const { name, searchField, filterFields, staged } = entry.config;

  // Validate columns belong to table
  const searchFieldName = getColumnName(searchField);
  validateColumnTable(searchField, table.tableName);

  const filterFieldNames = filterFields.map((field) => {
    validateColumnTable(field, table.tableName);
    return getColumnName(field);
  });

  table.searchIndex(name, {
    searchField: searchFieldName,
    filterFields: filterFieldNames,
    staged,
  });
  continue;
}

// Helper
function validateColumnTable(column: ColumnBuilderBase, expectedTable: string) {
  const tableName = getColumnTableName(column);
  if (tableName && tableName !== expectedTable) {
    throw new Error(
      `Search index references column from '${tableName}', but belongs to '${expectedTable}'.`,
    );
  }
}
```

**Update union:**

```ts
export type ConvexTableExtraConfigValue =
  | ConvexIndexBuilder
  | ConvexSearchIndexBuilder;
```

#### Phase 2b: Vector Index Builders

**Similar pattern to searchIndex, with additional `.dimensions()` method:**

```ts
export class ConvexVectorIndexBuilderOn {
  static readonly [entityKind] = "ConvexVectorIndexBuilderOn";

  constructor(private name: string) {}

  on(vectorField: ConvexIndexColumn): ConvexVectorIndexBuilder {
    return new ConvexVectorIndexBuilder(this.name, vectorField);
  }
}

export class ConvexVectorIndexBuilder {
  static readonly [entityKind] = "ConvexVectorIndexBuilder";

  declare _: { brand: "ConvexVectorIndexBuilder" };

  config: ConvexVectorIndexConfig;

  constructor(name: string, vectorField: ConvexIndexColumn) {
    this.config = {
      name,
      vectorField,
      dimensions: undefined as unknown as number, // Will throw if not set
      filterFields: [],
      staged: false,
    };
  }

  dimensions(n: number): this {
    if (n <= 0) {
      throw new Error(
        `Vector index '${this.config.name}' dimensions must be positive, got ${n}`,
      );
    }
    if (!Number.isInteger(n)) {
      throw new Error(
        `Vector index '${this.config.name}' dimensions must be an integer, got ${n}`,
      );
    }
    if (n > 10000) {
      console.warn(
        `Vector index '${this.config.name}' has unusually large dimensions (${n}). Common values: 768, 1536, 3072`,
      );
    }
    this.config.dimensions = n;
    return this;
  }

  filter(...fields: ConvexIndexColumn[]): this {
    this.config.filterFields = fields;
    return this;
  }

  staged(): this {
    this.config.staged = true;
    return this;
  }
}

export function vectorIndex(name: string): ConvexVectorIndexBuilderOn {
  return new ConvexVectorIndexBuilderOn(name);
}
```

**Config type:**

```ts
export interface ConvexVectorIndexConfig {
  name: string;
  vectorField: ConvexIndexColumn;
  dimensions: number;
  filterFields: ConvexIndexColumn[];
  staged: boolean;
}
```

**table.ts processing:**

```ts
if (isConvexVectorIndexBuilder(entry)) {
  const { name, vectorField, dimensions, filterFields, staged } = entry.config;

  if (dimensions === undefined) {
    throw new Error(
      `Vector index '${name}' is missing dimensions. Call .dimensions(n) before using.`,
    );
  }

  const vectorFieldName = getColumnName(vectorField);
  validateColumnTable(vectorField, table.tableName);

  const filterFieldNames = filterFields.map((field) => {
    validateColumnTable(field, table.tableName);
    return getColumnName(field);
  });

  table.vectorIndex(name, {
    vectorField: vectorFieldName,
    dimensions,
    filterFields: filterFieldNames,
    staged,
  });
  continue;
}
```

#### Phase 2c: Update Type Exports

**packages/kitcn/src/orm/index.ts:**

```ts
export { searchIndex, vectorIndex } from "./indexes";
export type {
  ConvexSearchIndexBuilder,
  ConvexSearchIndexBuilderOn,
  ConvexSearchIndexConfig,
  ConvexVectorIndexBuilder,
  ConvexVectorIndexBuilderOn,
  ConvexVectorIndexConfig,
} from "./indexes";
```

#### Phase 2d: Migrate Example Schema

**convex/schema.ts:**

```ts
// BEFORE
export const posts = convexTable(
  "posts",
  { text: text().notNull(), type: text().notNull() },
  (t) => [index("numLikesAndType").on(t.type, t.numLikes)],
);
posts.searchIndex("text", { searchField: "text", filterFields: ["type"] });

// AFTER
export const posts = convexTable(
  "posts",
  { text: text().notNull(), type: text().notNull() },
  (t) => [
    index("numLikesAndType").on(t.type, t.numLikes),
    searchIndex("text").on(t.text).filter(t.type),
  ],
);
```

### Technical Considerations

**TypeScript Patterns** (from institutional learnings):

1. **Use Merge<> not &** (phantom-type-brand-preservation-20260202.md):

   ```ts
   // ❌ WRONG: Loses phantom brands
   type Result = BaseConfig & UserConfig;

   // ✅ CORRECT: Preserves brands
   type Result = Merge<BaseConfig, UserConfig>;
   ```

2. **GetColumnData modes** (select-ts-type-inference-drizzle-patterns-20260202.md):

   ```ts
   // Use 'raw' mode for index config (no null)
   type FilterFieldType = GetColumnData<TColumn, "raw">;
   ```

3. **Duck typing for Convex** (convex-table-schema-integration-20260202.md):

   ```ts
   // Extend interface, implement class, cast with `as any`
   export interface ConvexSearchIndexBuilder extends SearchIndexDefinition {
     // Type-safe interface
   }

   class Impl {
     // Implementation with all required private fields
   }

   export function searchIndex(...): ConvexSearchIndexBuilder {
     return new Impl(...) as any;
   }
   ```

**Error Handling**:

- Mirror patterns from existing `index()` implementation
- Fail-fast with context-rich error messages
- Validate at applyExtraConfig time (not at builder construction)

**Performance**:

- Single-pass processing in applyExtraConfig
- No additional runtime overhead vs old syntax
- Type guards use symbol checks (O(1))

## Acceptance Criteria

### Functional Requirements

- [x] `searchIndex(name).on(field)` creates search index with single field
- [x] `searchIndex(name).on(field).filter(...fields)` adds filter fields
- [x] `searchIndex(name).on(field).staged()` marks as staged
- [x] `vectorIndex(name).on(field).dimensions(n)` creates vector index
- [x] `vectorIndex(name).on(field).dimensions(n).filter(...fields)` adds filters
- [x] `vectorIndex(name).on(field).filter(...).dimensions(n)` works (any order)
- [x] Multiple search/vector indexes on same table work
- [x] Indexes exported correctly to Convex schema
- [x] `defineSchema()` accepts tables with new builders

### Type Safety

- [x] Column references type-safe (IDE autocomplete works)
- [x] Wrong table columns cause runtime errors
- [x] Forgetting `.on()` causes clear error
- [x] Forgetting `.dimensions()` on vectorIndex causes clear error
- [x] InferSelectModel/InferInsertModel still work correctly

### Validation & Errors

- [x] Error: "Did you forget to call .on(...)?" if `.on()` not called
- [x] Error: "Missing dimensions" if vectorIndex without `.dimensions()`
- [x] Error: "Index references column from X, belongs to Y" for wrong table
- [x] Error: "Dimensions must be positive integer" for invalid dimensions
- [x] Validate: searchField extracted correctly
- [x] Validate: filterFields array extracted correctly
- [x] Validate: staged flag processed correctly

### Migration & Compatibility

- [x] Legacy `.searchIndex()` chain removed (throws with guidance)
- [x] Legacy `.vectorIndex()` chain removed (throws with guidance)
- [x] Only builder syntax supported (no mixed syntax)

### Testing

- [x] Type tests verify builder chaining works
- [x] Type tests verify column type safety
- [x] Runtime tests verify schema integration
- [x] Runtime tests verify error handling
- [x] Test: Multiple search indexes on same field
- [x] Test: Empty filter() call behavior
- [x] Test: Staged index creation
- [x] Test: Array vs object return from extraConfig

## Success Metrics

1. **API Consistency**: 100% of indexes use builder pattern
2. **Type Safety**: Zero runtime type errors in tests
3. **Legacy Removal**: Builder-only schema surface (no mixed syntax)
4. **Test Coverage**: >90% coverage of new builders
5. **Documentation**: Complete API reference + examples

## Dependencies & Risks

### Dependencies

1. **Vector column builder**
   - `vector(dimensions)` implemented (wraps `v.array(v.float64())`)
   - Dimension validation at build time

2. **Convex native support**
   - Search indexes: ✅ Supported (text fields only)
   - Vector indexes: ✅ Supported (array of float64)
   - Staged indexes: ✅ Supported via `staged` flag

### Risks

| Risk                             | Impact | Mitigation                                                 |
| -------------------------------- | ------ | ---------------------------------------------------------- |
| Breaking changes by design       | High   | Builder-only API; clear errors + docs                      |
| Type complexity too high         | Medium | Follow Drizzle patterns, extensive type tests              |
| Convex schema incompatibility    | High   | Test with actual defineSchema(), validate export structure |
| Performance regression           | Low    | Profile applyExtraConfig processing                        |
| User confusion during transition | Medium | Clear migration guide, good error messages                 |

## Open Questions

### Q1: Vector Column Builder (CRITICAL)

**Question**: Should kitcn provide a `vector(dimensions)` column builder?

**Options**:

1. **Add `vector()` builder**: `vector(1536)` or `vector().dimensions(1536)`
2. **No builder**: Users manually define with validators
3. **Array builder**: Generic `array(type)` that can do `array(number())`

**Recommendation**: Add `vector(dimensions)` builder for consistency

**Decision:** Add `vector(dimensions)` builder (implemented).

- Wraps `v.array(v.float64())`
- Validates dimensions at build time

### Q2: Search Field Type Validation (IMPORTANT)

**Question**: Should `searchIndex().on()` only accept text columns?

**Options**:

1. **Type-level constraint**: Only allow text() columns at compile time
2. **Runtime validation**: Accept all, validate at applyExtraConfig
3. **No validation**: Defer to Convex error handling

**Recommendation**: Runtime validation with helpful error

- Convex search only works on text fields
- Type-level constraint too complex (needs column type inference)
- Error message: "Search indexes only support text fields. Field 'X' is type Y."

**Decision:** Runtime validation at applyExtraConfig (implemented).

### Q3: Filter Field Type Validation (NICE-TO-HAVE)

**Question**: Which column types are valid for filter fields?

**Options**:

1. **All types**: text, number, boolean, id, bigint
2. **Restricted types**: Only types that support equality
3. **No validation**: Defer to Convex

**Recommendation**: No validation initially

- Convex will error if incompatible
- Can add validation later if needed
- Document which types work in API reference

**Decision:** No filter field validation (implemented).

### Q4: Deprecation Timeline (NICE-TO-HAVE)

**Question**: When should old `.searchIndex()` / `.vectorIndex()` methods be removed?

**Options**:

1. **Immediate removal**: Breaking change, force migration
2. **Deprecated with warning**: Keep for 1-2 versions
3. **Keep indefinitely**: Both syntaxes supported

**Recommendation**: Deprecated with warning

- Mark with `@deprecated` JSDoc
- Keep for 2 minor versions
- Remove in next major version

**Decision:** Immediate removal; chainable methods throw (implemented).

## Implementation Checklist

### Phase 2a: Search Index Builders

- [x] Create `ConvexSearchIndexBuilderOn` class with `.on()` method
- [x] Create `ConvexSearchIndexBuilder` class with `.filter()` and `.staged()` methods
- [x] Add `searchIndex(name)` export function
- [x] Add `ConvexSearchIndexConfig` interface
- [x] Add `isConvexSearchIndexBuilder()` type guard
- [x] Update `applyExtraConfig()` to handle search index builders
- [x] Validate search field column belongs to table
- [x] Validate filter field columns belong to table
- [x] Extract search field and filter field names
- [x] Call `table.addSearchIndex()` with extracted config
- [x] Update `ConvexTableExtraConfigValue` union type
- [x] Export types from `index.ts`
- [x] Add type tests for search index builders
- [x] Add runtime tests for search index creation
- [x] Add error scenario tests

### Phase 2b: Vector Index Builders

- [x] Create `ConvexVectorIndexBuilderOn` class
- [x] Create `ConvexVectorIndexBuilder` class with `.dimensions()`, `.filter()`, `.staged()`
- [x] Add `vectorIndex(name)` export function
- [x] Add `ConvexVectorIndexConfig` interface
- [x] Add dimensions validation (positive integer, reasonable max)
- [x] Add `isConvexVectorIndexBuilder()` type guard
- [x] Update `applyExtraConfig()` to handle vector index builders
- [x] Validate dimensions is set before processing
- [x] Validate vector field and filter fields belong to table
- [x] Extract field names and call `table.addVectorIndex()`
- [x] Update `ConvexTableExtraConfigValue` union
- [x] Export types from `index.ts`
- [x] Add type tests for vector index builders
- [x] Add runtime tests for vector index creation
- [x] Add error scenario tests (missing dimensions, invalid dimensions)

### Phase 2c: Schema Migration

- [x] Migrate `convex/schema.ts` to use new builder syntax
- [x] Remove old `.searchIndex()` calls
- [x] Verify schema exports correctly
- [x] Run `bun typecheck` - must pass
- [x] Run `bun run test` - must pass

### Phase 2d: Documentation

- [x] Remove legacy chainable `.searchIndex()` / `.vectorIndex()` methods
- [x] Update API reference documentation
- [x] Add usage examples for searchIndex
- [x] Add usage examples for vectorIndex
- [x] Document staged index pattern
- [x] Document error messages and how to fix
- [x] Update brainstorm with final decisions

### Phase 2e: Vector Column Builder (if decided)

- [x] Create `vector(dimensions)` column builder
- [x] Wrap `v.array(v.float64())` validator
- [x] Add dimension validation
- [x] Export from `index.ts`
- [x] Add type tests
- [x] Add runtime tests
- [x] Update documentation

## References & Research

### Internal References

- **Brainstorm**: [docs/brainstorms/2026-02-04-drizzle-index-api.md](docs/brainstorms/2026-02-04-drizzle-index-api.md)
- **Current builders**: [packages/kitcn/src/orm/indexes.ts](packages/kitcn/src/orm/indexes.ts)
- **Table integration**: [packages/kitcn/src/orm/table.ts:120-166](packages/kitcn/src/orm/table.ts#L120-L166)
- **Type utilities**: [packages/kitcn/src/orm/types.ts](packages/kitcn/src/orm/types.ts)

### Institutional Learnings

- **Phantom Type Preservation**: docs/solutions/typescript-patterns/phantom-type-brand-preservation-20260202.md
  - Use `Merge<>` not `&` for combining types with phantom brands

- **Mode-Based Type Extraction**: docs/solutions/typescript-patterns/select-ts-type-inference-drizzle-patterns-20260202.md
  - Use `GetColumnData<TColumn, TMode>` for context-aware types

- **Convex Schema Integration**: docs/solutions/integration-issues/convex-table-schema-integration-20260202.md
  - Duck typing pattern for Convex compatibility

### External References

- **Drizzle v1 repo**: https://github.com/zbeyens/drizzle-v1
  - PostgreSQL indexes: `drizzle-orm/src/pg-core/indexes.ts`
  - SQLite indexes: `drizzle-orm/src/sqlite-core/indexes.ts`
  - Table integration: `drizzle-orm/src/pg-core/table.ts`

- **Convex-ents repo**: https://github.com/get-convex/convex-ents
  - Unique index patterns: Field-level options with runtime validation

- **Drizzle Analysis Docs**:
  - [docs/drizzle-v1-index-analysis.md](docs/drizzle-v1-index-analysis.md)
  - [docs/drizzle-v1-index-summary.md](docs/drizzle-v1-index-summary.md)

### Testing References

- **Testing guide**: [.claude/skills/kitcn-test-orm/convex-test-orm.mdc](.claude/skills/kitcn-test-orm/convex-test-orm.mdc)
  - Type testing patterns with Equal<>/Expect<>
  - Runtime testing with convex-test

## Next Steps

After plan approval:

1. Implement Phase 2a (searchIndex builders)
2. Run `bun typecheck` and `bun run test`
3. Implement Phase 2b (vectorIndex builders)
4. Run `bun typecheck` and `bun run test`
5. Migrate schema and update docs
6. Final `bun typecheck` and `bun run test`
