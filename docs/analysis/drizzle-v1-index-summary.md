# Drizzle v1 Index Implementation - Quick Reference

Quick reference guide for implementing Drizzle-style indexes in kitcn ORM.

## Core API Pattern

### Basic Structure

```ts
// Export functions
export function index(name: string): IndexBuilderOn
export function uniqueIndex(name: string): IndexBuilderOn

// Builder chain
class IndexBuilderOn {
  on(...columns: [Column | SQL, ...Column | SQL[]]): IndexBuilder
}

class IndexBuilder {
  where(condition: SQL): this  // Optional: for partial indexes
  build(table: Table): Index   // Internal
}

class Index {
  readonly config: IndexConfig & { table: Table };
  readonly isNameExplicit: boolean;
}
```

### Usage in Table Definition

```ts
export const users = defineTable({
  name: v.string(),
  email: v.string(),
  age: v.number(),
}, (t) => [
  // Return array of builders (Drizzle v1 new API)
  index('name_idx').on(t.name),
  uniqueIndex('email_idx').on(t.email),
  index('name_age_idx').on(t.name, t.age),  // Composite
]);
```

## TypeScript Types to Implement

### Config Types

```ts
interface IndexConfig {
  name: string;  // Required (like SQLite, not PostgreSQL)
  columns: IndexColumn[];
  unique: boolean;
  where?: SQL;  // Optional: for future partial index support
}

type IndexColumn = Column | SQL;  // SQL for future expression support
```

### Builder Types

```ts
export interface AnyIndexBuilder {
  build(table: Table): Index;
}

export class IndexBuilderOn {
  constructor(private unique: boolean, private name: string) {}

  on(...columns: [IndexColumn, ...IndexColumn[]]): IndexBuilder {
    return new IndexBuilder(this.name, columns, this.unique);
  }
}

export class IndexBuilder implements AnyIndexBuilder {
  constructor(
    name: string,
    columns: IndexColumn[],
    unique: boolean
  ) {
    this.config = { name, columns, unique, where: undefined };
  }

  config: IndexConfig;

  where(condition: SQL): this {
    this.config.where = condition;
    return this;
  }

  build(table: Table): Index {
    return new Index(this.config, table);
  }
}

export class Index {
  readonly config: IndexConfig & { table: Table };
  readonly isNameExplicit: boolean;

  constructor(config: IndexConfig, table: Table) {
    this.config = { ...config, table };
    this.isNameExplicit = !!config.name;  // Always true in our case
  }
}
```

## Table Integration

### Table Function Signature

```ts
export interface ConvexTableFn {
  <TColumns extends Record<string, ColumnBuilder>>(
    columns: TColumns,
    extraConfig?: (
      self: BuildColumns<TColumns>
    ) => ExtraConfigValue[]  // Note: array, not object
  ): ConvexTableWithColumns<TColumns>;
}

type ExtraConfigValue =
  | IndexBuilder
  // | CheckBuilder  // Future
  // | ForeignKeyBuilder  // Future
  // | PrimaryKeyBuilder  // Future
  // | UniqueConstraintBuilder  // Future
  ;
```

### Table Implementation Pattern

```ts
export const defineTable: ConvexTableFn = (columns, extraConfig) => {
  const rawTable = new ConvexTable(...);

  // Build columns first
  const builtColumns = buildColumns(columns, rawTable);

  // Assign columns to table
  const table = Object.assign(rawTable, builtColumns);
  table[Table.Symbol.Columns] = builtColumns;

  // Process extraConfig if provided
  if (extraConfig) {
    const configValues = extraConfig(builtColumns);

    // Extract indexes
    const indexes = configValues
      .filter(v => v instanceof IndexBuilder)
      .map(builder => builder.build(table));

    table[Table.Symbol.Indexes] = indexes;
  }

  return table;
};
```

## Implementation Phases

### Phase 1: Basic Indexes (MVP)

Minimum viable implementation:

```ts
// Support basic single and composite column indexes
index('name').on(t.column1)
index('composite').on(t.column1, t.column2)
uniqueIndex('unique').on(t.column)

// Types needed:
// - IndexConfig (name, columns, unique)
// - IndexBuilderOn (constructor, on method)
// - IndexBuilder (constructor, build method)
// - Index (config storage)
// - Table integration (extraConfig parameter)
```

### Phase 2: Partial Indexes (Future)

Add when/if Convex supports filtered indexes:

```ts
index('active').on(t.name).where(sql`${t.isActive} = true`)

// Add to IndexConfig:
// - where?: SQL

// Add to IndexBuilder:
// - where(condition: SQL): this
```

### Phase 3: Expression Indexes (Future)

Add when/if Convex supports expression indexes:

```ts
index('email_lower').on(sql`lower(${t.email})`)

// Already supported by:
// - type IndexColumn = Column | SQL
```

### Phase 4: Column Modifiers (Future)

Add if Convex adds ordering/operator support:

```ts
index('ordered').on(t.column.asc(), t.other.desc())

// Need to implement:
// - ExtraConfigColumn class
// - IndexedColumn class
// - Column modifier methods (asc, desc, etc.)
```

## Key Differences from Drizzle

### Simplifications for kitcn

1. **Name always required** (like SQLite, unlike PostgreSQL)
   - Drizzle PG: `index()` and `index('name')` both valid
   - kitcn: `index('name')` required

2. **No database-specific features** (initially)
   - Skip: `.concurrently()`, `.onOnly()`, `.using()`, `.with()`, `.op()`
   - Focus: `.on()` and optional `.where()`

3. **Simpler column types**
   - Skip: `ExtraConfigColumn` (initially)
   - Skip: `IndexedColumn` (initially)
   - Use: Direct column references

4. **Array-only extraConfig**
   - Drizzle: Supports both object (old) and array (new)
   - kitcn: Array only from start

## Code Organization

Recommended file structure:

```
packages/kitcn/src/schema/
  ├── index.ts           # Main exports
  ├── table.ts           # Table definition
  ├── indexes.ts         # Index builders and types
  ├── columns/
  │   └── index.ts       # Column definitions
  └── types.ts           # Shared types
```

## Real-World Examples

### From kitcn Context

```ts
// Current Convex indexes
.index("by_email", ["email"])
.index("by_workspace", ["workspaceId"])
.index("by_workspace_and_email", ["workspaceId", "email"])

// Drizzle-style equivalent
(t) => [
  index('by_email').on(t.email),
  index('by_workspace').on(t.workspaceId),
  index('by_workspace_and_email').on(t.workspaceId, t.email),
]
```

### Migration Strategy

```ts
// Option 1: Support both syntaxes initially
defineTable({
  // columns
})
  .index("old_style", ["column"])  // Current syntax
  .indexes((t) => [                 // New syntax
    index('new_style').on(t.column),
  ])

// Option 2: Direct migration
defineTable({
  // columns
}, (t) => [
  index('by_email').on(t.email),
  // ...
])
```

## Testing Strategy

Key test cases to implement (based on Drizzle test patterns):

```ts
// Basic index
test('single column index')
test('composite index')
test('unique index')

// Edge cases
test('index name required')
test('empty columns array rejected')
test('duplicate index names rejected')

// Type tests
test('index column type safety')
test('builder return types')
test('table with indexes type')

// Future features
test.skip('partial indexes with where')
test.skip('expression indexes')
test.skip('column modifiers')
```

## Migration Checklist

- [ ] Create `indexes.ts` with builder classes
- [ ] Add `IndexConfig` type
- [ ] Implement `index()` and `uniqueIndex()` functions
- [ ] Update table function signature for `extraConfig`
- [ ] Add table symbol for storing indexes
- [ ] Update table building logic to process indexes
- [ ] Add type tests for index builders
- [ ] Add runtime tests for index creation
- [ ] Document index API in kitcn docs
- [ ] Create migration guide for existing code
- [ ] (Future) Add `.where()` support
- [ ] (Future) Add expression support
- [ ] (Future) Add column modifiers

## References

- Full analysis: `drizzle-v1-index-analysis.md`
- Drizzle repo: https://github.com/zbeyens/drizzle-v1
- Key files:
  - `drizzle-orm/src/pg-core/indexes.ts`
  - `drizzle-orm/src/sqlite-core/indexes.ts`
  - `drizzle-orm/src/pg-core/table.ts`
