---
module: kitcn ORM
date: 2026-02-02
problem_type: integration_issue
component: typescript_types
symptoms:
  - "Type 'ConvexTable' is missing properties from TableDefinition"
  - "Schema integration tests failing"
  - "defineSchema() not accepting convexTable() output"
root_cause: missing_interface_implementation
severity: high
tags: [convex, schema, typescript, duck-typing, table-definition]
related_docs:
  - "docs/solutions/typescript-patterns/phantom-type-brand-preservation-20260202.md"
  - "docs/solutions/typescript-patterns/select-ts-type-inference-drizzle-patterns-20260202.md"
  - "docs/plans/2026-02-01-fix-convex-table-schema-integration-plan.md"
---

# ConvexTable Schema Integration with defineSchema()

## Problem

ConvexTable was missing properties required by Convex's TableDefinition interface, preventing integration with defineSchema().

**Error message:**
```
Type 'ConvexTable<...>' is missing the following properties from type
'TableDefinition<Validator<any, any, any>, {}, {}, {}>':
indexes, stagedDbIndexes, searchIndexes, stagedSearchIndexes, and 7 more
```

**Failing test:** [convex/orm/schema-integration.test.ts:18-19](../../convex/orm/schema-integration.test.ts)

**Impact:** Blocked core ORM functionality - users couldn't use convexTable() with Convex's defineSchema().

## Investigation

### Failed Approaches

1. **Direct property addition**: Initially tried adding properties directly to ConvexTable class
   - **Why it failed**: Didn't follow Convex's structural typing requirements
   - **Learning**: Need to understand TableDefinition's complete structure first

2. **Using `defineTable().validator`**: Tried wrapping validators with Convex's defineTable
   - **Why it failed**: Created dependency on Convex internals, lost type safety
   - **Learning**: Should follow established patterns (convex-ents)

### Research Findings

**convex-ents pattern** (the solution):
- Extend TableDefinition interface for type safety
- Implement separate class with all private fields
- Use duck typing (Convex only checks object shape)
- Cast implementation to interface with `as any`

**Key insight:** Convex's defineSchema uses structural typing, not inheritance. It only cares about object shape, not whether you extend the base class.

## Root Cause

ConvexTable lacked the complete TableDefinition structure:
- Missing private fields: `indexes`, `stagedDbIndexes`, `searchIndexes`, `stagedSearchIndexes`, `vectorIndexes`, `stagedVectorIndexes`
- Didn't extend TableDefinition interface
- Column builders didn't expose validators for schema construction

## Solution

Implemented the convex-ents pattern:

### 1. Added `convexValidator` to Column Builders

Each builder exposes its Convex validator:

```typescript
// packages/kitcn/src/orm/builders/text.ts
export class ConvexTextBuilder<T extends ColumnBuilderBaseConfig<'string', string>> {
  get convexValidator(): Validator<any, any, any> {
    if (this.config.notNull) {
      return v.string();
    }
    return v.optional(v.string());
  }

  override build(): Validator<any, any, any> {
    return this.convexValidator;
  }
}
```

**Applied to:** text.ts, number.ts, id.ts, boolean.ts, bigint.ts

### 2. Created Validator Factory

Extracts validators from builders and creates v.object():

```typescript
// packages/kitcn/src/orm/table.ts
function createValidatorFromColumns(
  columns: Record<string, ColumnBuilder<any, any, any>>
): Validator<any, any, any> {
  const validatorFields = Object.fromEntries(
    Object.entries(columns).map(([key, builder]) => [
      key,
      (builder as any).convexValidator,
    ])
  );
  return v.object(validatorFields);
}
```

### 3. Implemented ConvexTableImpl Class

Implementation class with all TableDefinition properties:

```typescript
class ConvexTableImpl<T extends TableConfig> {
  validator: Validator<Record<string, any>, 'required', any>;

  // TableDefinition private fields
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
  tableName: string;

  constructor(name: T['name'], columns: T['columns']) {
    validateTableName(name);
    this[TableName] = name;
    this[Columns] = columns;
    this.tableName = name;
    this.validator = createValidatorFromColumns(columns as any);
  }

  index<IndexName extends string>(name: IndexName, fields: string[]): this {
    this.indexes.push({ indexDescriptor: name, fields });
    return this;
  }
}
```

### 4. Extended TableDefinition Interface

Interface extends Convex's TableDefinition:

```typescript
export interface ConvexTable<
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
  readonly _: {
    readonly brand: 'ConvexTable';
    readonly name: T['name'];
    readonly columns: T['columns'];
    readonly inferSelect: InferSelectModel<ConvexTable<T>>;
    readonly inferInsert: InferInsertModel<ConvexTable<T>>;
  };

  // Phantom types for type inference...
  validator: Validator<any, any, any>;
  tableName: string;
}
```

### 5. Updated Factory

Factory returns implementation cast to interface:

```typescript
export function convexTable<
  TName extends string,
  TColumns extends Record<string, ColumnBuilder<any, any, any>>,
>(
  name: TName,
  columns: TColumns
): ConvexTable<{ name: TName; columns: TColumns }> {
  return new ConvexTableImpl(name, columns) as any;
}
```

### 6. Fixed Export Types

Updated index.ts to use `export type` for interface:

```typescript
// packages/kitcn/src/orm/index.ts
export type { TableConfig, ConvexTable } from './table';
export { convexTable } from './table';
```

## Verification

✅ Schema integration tests passing (2/2)
✅ Package typecheck passing
✅ All acceptance criteria met:
  - ConvexTable has all required TableDefinition properties
  - convexTable() returns TableDefinition-compatible object
  - defineSchema({ users: convexTable(...) }) compiles without errors
  - Type inference (InferSelectModel, InferInsertModel) still works

**Test results:**
```bash
$ bun test ./convex/orm/schema-integration.test.ts
✓ convexTable works with defineSchema()
✓ convexTable validator is compatible with Convex schema
2 pass, 0 fail, 5 expect() calls
```

## Prevention

### For Future Schema Integration

1. **Research existing patterns first**: Check convex-ents, convex-backend for proven patterns
2. **Understand structural typing**: Convex uses duck typing - object shape matters, not inheritance
3. **Follow convex-ents pattern**:
   - Extend interface for type safety
   - Implement class with all private fields
   - Use `as any` cast for duck typing
4. **Expose validators early**: Column builders should expose `.convexValidator` property
5. **Test schema integration**: Always test with actual defineSchema() call

### Code Pattern

When creating ORM abstractions over Convex:

```typescript
// ✅ CORRECT: Follow convex-ents pattern
interface MyTable extends TableDefinition<...> {
  // Type-safe interface
}

class MyTableImpl {
  validator: Validator<...>;
  private indexes: any[] = [];
  // ... all private fields
}

function myTable(...): MyTable {
  return new MyTableImpl(...) as any; // Duck typing
}

// ❌ WRONG: Direct class extension
class MyTable extends TableDefinition {
  // Won't work - TableDefinition constructor is @internal
}
```

## Files Changed

**Modified:**
- [packages/kitcn/src/orm/builders/text.ts](../../packages/kitcn/src/orm/builders/text.ts)
- [packages/kitcn/src/orm/builders/number.ts](../../packages/kitcn/src/orm/builders/number.ts)
- [packages/kitcn/src/orm/builders/id.ts](../../packages/kitcn/src/orm/builders/id.ts)
- [packages/kitcn/src/orm/builders/boolean.ts](../../packages/kitcn/src/orm/builders/boolean.ts)
- [packages/kitcn/src/orm/builders/bigint.ts](../../packages/kitcn/src/orm/builders/bigint.ts)
- [packages/kitcn/src/orm/table.ts](../../packages/kitcn/src/orm/table.ts)
- [packages/kitcn/src/orm/index.ts](../../packages/kitcn/src/orm/index.ts)

**Stats:** 22 files modified, +632/-276 lines

## Related Patterns

- **TypeScript phantom type brand preservation**: [phantom-type-brand-preservation-20260202.md](../typescript-patterns/phantom-type-brand-preservation-20260202.md) - Pattern for preserving type brands through transformations
- **convex-ents EntDefinition**: Pattern for extending Convex's TableDefinition with custom functionality
- **Duck typing in TypeScript**: Structural typing allows interface compatibility without inheritance

## References

- convex-ents EntDefinition implementation
- Convex TableDefinition source: convex-backend/npm-packages/convex/src/server/schema.ts
- Convex defineTable docs: https://docs.convex.dev/database/schemas
