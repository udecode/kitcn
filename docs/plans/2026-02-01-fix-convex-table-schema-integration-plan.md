---
title: Fix ConvexTable schema integration with defineSchema()
type: fix
date: 2026-02-01
---

# Fix ConvexTable Schema Integration

## Problem

`ConvexTable` is missing properties required by Convex's `TableDefinition` type, causing schema integration tests to fail:

```typescript
Type 'ConvexTable<...>' is missing the following properties from type
'TableDefinition<Validator<any, any, any>, {}, {}, {}>':
indexes, stagedDbIndexes, searchIndexes, stagedSearchIndexes, and 7 more
```

**Failing test**: [convex/orm/schema-integration.test.ts:18-19](convex/orm/schema-integration.test.ts:18-19)

This blocks integration with Convex's `defineSchema()`, which is foundational for the ORM.

## Research Findings

### convex-ents Approach (Preferred Pattern)

**Pattern**: Extend `TableDefinition` interface + Implement with concrete class

```typescript
// 1. Interface extends TableDefinition
export interface EntDefinition<
  DocumentType extends Validator<any, any, any>,
  Indexes extends GenericTableIndexes = {},
  SearchIndexes extends GenericTableSearchIndexes = {},
  VectorIndexes extends GenericTableVectorIndexes = {},
  Edges extends GenericEdges = {},  // Custom addition
> extends TableDefinition<DocumentType, Indexes, SearchIndexes, VectorIndexes> {
  // Custom methods
}

// 2. Implementation class with private fields
class EntDefinitionImpl {
  validator: Validator<Record<string, any>, "required", any>;

  private indexes: Index[] = [];
  private searchIndexes: SearchIndex[] = [];
  private vectorIndexes: VectorIndex[] = [];

  constructor(documentSchema: Validator<...>) {
    this.validator = documentSchema;
  }

  index(name: string, fields: string[]) {
    this.indexes.push({ indexDescriptor: name, fields });
    return this;
  }
}

// 3. Factory function with type cast
export function defineEnt<DocumentSchema>(
  documentSchema: DocumentSchema
): EntDefinition<...> {
  return new EntDefinitionImpl(asObjectValidator(documentSchema)) as any;
}
```

**Key insights**:
- Duck typing: Convex's `defineSchema` only cares about object shape, not inheritance
- Validator stored directly (no re-wrapping needed)
- Private fields match TableDefinition requirements
- `as any` cast allows structural typing

### Convex TableDefinition Constraints

**Cannot extend class directly**:
- Constructor is `@internal` (private)
- Must use `defineTable()` factory
- Methods return `TableDefinition` (not polymorphic)
- Not designed for inheritance

**Required properties** (all private in base class):
- `indexes`, `stagedDbIndexes`
- `searchIndexes`, `stagedSearchIndexes`
- `vectorIndexes`, `stagedVectorIndexes`
- `validator` (public)

## Proposed Solution

**Approach**: Follow convex-ents pattern with kitcn adaptations

### Phase 1: Create Validator from Column Builders

```typescript
// packages/kitcn/src/orm/table.ts

function createValidatorFromColumns<TColumns>(
  columns: TColumns
): Validator<Record<string, any>, "required", any> {
  const fields: Record<string, Validator> = {};

  for (const [key, builder] of Object.entries(columns)) {
    // Extract Convex validator from each column builder
    fields[key] = builder.convexValidator;
  }

  return v.object(fields);
}
```

**Requirement**: Each column builder must expose `.convexValidator` property.

### Phase 2: Extend TableDefinition Interface

```typescript
// packages/kitcn/src/orm/table.ts

export interface ConvexTableDefinition<
  T extends TableConfig,
  Indexes extends GenericTableIndexes = {},
  SearchIndexes extends GenericTableSearchIndexes = {},
  VectorIndexes extends GenericTableVectorIndexes = {},
> extends TableDefinition<
    Validator<any, any, any>,
    Indexes,
    SearchIndexes,
    VectorIndexes
  > {
  // Phantom type storage (existing)
  readonly _: {
    readonly brand: 'ConvexTable';
    readonly name: T['name'];
    readonly columns: T['columns'];
    readonly inferSelect: InferSelectModel<ConvexTableDefinition<T>>;
    readonly inferInsert: InferInsertModel<ConvexTableDefinition<T>>;
  };

  // Drizzle-style inference properties (existing)
  readonly $inferSelect: InferSelectModel<ConvexTableDefinition<T>>;
  readonly $inferInsert: InferInsertModel<ConvexTableDefinition<T>>;

  // Symbol-based metadata (existing)
  [TableName]: T['name'];
  [Columns]: T['columns'];
}
```

### Phase 3: Implementation Class

```typescript
// packages/kitcn/src/orm/table.ts

class ConvexTableImpl<T extends TableConfig> {
  // Required by TableDefinition
  validator: Validator<Record<string, any>, "required", any>;

  private indexes: any[] = [];
  private stagedDbIndexes: any[] = [];
  private searchIndexes: any[] = [];
  private stagedSearchIndexes: any[] = [];
  private vectorIndexes: any[] = [];
  private stagedVectorIndexes: any[] = [];

  // Symbol-based metadata
  [TableName]: T['name'];
  [Columns]: T['columns'];
  [Brand] = 'ConvexTable' as const;

  constructor(
    name: T['name'],
    columns: T['columns']
  ) {
    this[TableName] = name;
    this[Columns] = columns;
    this.validator = createValidatorFromColumns(columns);
  }

  // Chainable index method
  index<IndexName extends string>(
    name: IndexName,
    fields: string[]
  ): this {
    this.indexes.push({ indexDescriptor: name, fields });
    return this;
  }

  // TODO: searchIndex, vectorIndex methods
}
```

### Phase 4: Update convexTable Factory

```typescript
// packages/kitcn/src/orm/table.ts

export function convexTable<
  TName extends string,
  TColumns extends Record<string, ColumnBuilder<any, any, any>>
>(
  name: TName,
  columns: TColumns
): ConvexTableDefinition<{ name: TName; columns: TColumns }> {
  return new ConvexTableImpl(name, columns) as any;
}
```

## Acceptance Criteria

- [x] `ConvexTable` has all required TableDefinition properties (indexes, validator, etc.)
- [x] `convexTable()` returns TableDefinition-compatible object
- [x] `defineSchema({ users: convexTable(...) })` compiles without errors
- [x] Schema integration tests pass ([schema-integration.test.ts](convex/orm/schema-integration.test.ts))
- [x] Existing ORM tests remain passing
- [x] `.index()` method works for basic index definition (inherited from TableDefinition)
- [x] Type inference (InferSelectModel, InferInsertModel) still works

## Implementation Steps

### Step 1: Add convexValidator to Column Builders

**Files**: All builder files ([text.ts](packages/kitcn/src/orm/builders/text.ts), [number.ts](packages/kitcn/src/orm/builders/number.ts), etc.)

```typescript
export class ConvexTextBuilder<T extends ColumnBuilderBaseConfig<'string', string>> {
  // Add this property
  readonly convexValidator: Validator<string, any, any>;

  constructor() {
    this.convexValidator = v.string();
  }

  notNull() {
    // Return new builder with same validator
    return this as ConvexTextBuilder<T & { notNull: true }>;
  }
}
```

**Why**: Validators drive Convex's schema system - we need to expose them.

### Step 2: Create Validator Factory

**File**: [packages/kitcn/src/orm/table.ts](packages/kitcn/src/orm/table.ts)

Implement `createValidatorFromColumns()` as shown in Phase 1.

**Why**: `defineSchema` requires a Validator, not raw column builders.

### Step 3: Implement ConvexTableImpl Class

**File**: [packages/kitcn/src/orm/table.ts](packages/kitcn/src/orm/table.ts)

Create `ConvexTableImpl` with:
- All private fields (indexes, searchIndexes, etc.)
- Public `validator` property
- Symbol-based metadata
- `.index()` method (basic implementation)

**Why**: Provides the structure Convex's `defineSchema` expects.

### Step 4: Update ConvexTableDefinition Interface

**File**: [packages/kitcn/src/orm/table.ts](packages/kitcn/src/orm/table.ts)

Extend `TableDefinition` interface as shown in Phase 2.

**Why**: Type-level compatibility with Convex's schema system.

### Step 5: Update convexTable Factory

**File**: [packages/kitcn/src/orm/table.ts](packages/kitcn/src/orm/table.ts)

Return `ConvexTableImpl` instance cast to `ConvexTableDefinition`.

**Why**: Factory pattern hides implementation details.

### Step 6: Run Tests & Verify

```bash
# Run schema integration tests
bun test convex/orm/schema-integration.test.ts

# Run full test suite
bun test

# Verify type inference still works
bun typecheck
```

## Technical Considerations

### Validator Handling

**Challenge**: Column builders use phantom types for NotNull, but Convex validators use `v.optional()`.

**Solution**:
- Keep phantom types for ORM type inference
- Translate to Convex validators only when creating `validator` property
- NotNull columns → `v.string()` (required)
- Nullable columns → `v.optional(v.string())`

### Index Method Return Types

**Challenge**: Convex's `.index()` returns `TableDefinition<..., Indexes & NewIndex>`, updating the index type parameter.

**Solution**: Match this pattern in `ConvexTableDefinition`:

```typescript
index<IndexName extends string>(
  name: IndexName,
  fields: string[]
): ConvexTableDefinition<
  T,
  Indexes & Record<IndexName, string[]>,
  SearchIndexes,
  VectorIndexes
>;
```

### Type Inference Preservation

**Challenge**: Adding TableDefinition compatibility must not break existing type inference.

**Test**: Verify these still work:
```typescript
const users = convexTable('users', { name: text().notNull() });
type User = InferSelectModel<typeof users>;  // { _id: GenericId<'users'>, _creationTime: number, name: string }
```

## Dependencies & Risks

**Dependencies**:
- Convex `v.object()` validator
- Understanding of Convex's index structure

**Risks**:
1. **Validator translation complexity** - NotNull phantom types → Convex validators
   - Mitigation: Simple mapping, well-tested in convex-ents

2. **Breaking existing type inference** - Adding TableDefinition might conflict
   - Mitigation: Extensive type tests before/after

3. **Index method signature complexity** - Need to match Convex's overloads
   - Mitigation: Start with simple `.index(name, fields)` overload only

## Success Metrics

- Schema integration tests pass
- `defineSchema()` accepts `convexTable()` results
- Type inference tests remain green
- No new type errors in codebase

## References

### Internal References

- Current implementation: [packages/kitcn/src/orm/table.ts](packages/kitcn/src/orm/table.ts)
- Failing test: [convex/orm/schema-integration.test.ts](convex/orm/schema-integration.test.ts)
- Column builders: [packages/kitcn/src/orm/builders/](packages/kitcn/src/orm/builders/)

### External References

- convex-ents EntDefinition: `/tmp/cc-repos/convex-ents/src/index.ts:534-1387`
- Convex TableDefinition: `/tmp/cc-repos/convex-backend/npm-packages/convex/src/server/schema.ts`
- Convex defineTable: https://docs.convex.dev/database/schemas

### Related Learnings

- TypeScript phantom type brand preservation: [docs/solutions/typescript-patterns/phantom-type-brand-preservation-20260202.md](../solutions/typescript-patterns/phantom-type-brand-preservation-20260202.md)
