# Drizzle v1 Index Analysis

Comprehensive analysis of how Drizzle v1 handles indexes, based on repository analysis of https://github.com/zbeyens/drizzle-v1

## Table of Contents
- [API Syntax](#api-syntax)
- [TypeScript Types](#typescript-types)
- [Database Integration Patterns](#database-integration-patterns)
- [Index Naming](#index-naming)
- [Composite Indexes](#composite-indexes)
- [Unique Indexes](#unique-indexes)
- [Special Features](#special-features)
- [Patterns for kitcn](#patterns-for-kitcn)

---

## API Syntax

### PostgreSQL Index API

Drizzle provides two main approaches for defining indexes in PostgreSQL:

#### 1. Using `.on()` method (most common)

```ts
index('index_name')
  .on(table.column1, table.column2)
  .where(sql`condition`)  // Partial index
  .with({ fillfactor: '70' })  // Storage parameters
```

#### 2. Using `.using()` method (for custom index methods)

```ts
index('index_name')
  .using('btree', table.column1.asc(), sql`lower(${table.column2})`, table.column1.op('text_ops'))
  .where(sql`condition`)
  .with({ fillfactor: '70' })
```

### SQLite Index API

SQLite has a simpler API (fewer features than PostgreSQL):

```ts
index('index_name')
  .on(table.column1, table.column2)
  .where(sql`condition`)  // Partial index
```

### Column Modifiers

In PostgreSQL, columns can be configured with modifiers inside the index definition:

```ts
index('name')
  .on(
    table.column1.asc(),           // Ascending order
    table.column2.desc(),          // Descending order
    table.column3.nullsFirst(),    // Nulls first
    table.column4.nullsLast(),     // Nulls last
    table.column5.op('text_ops')   // Operator class
  )
```

These modifiers can be chained:

```ts
table.column.asc().nullsFirst()
table.column.desc().nullsLast().op('vector_l2_ops')
```

---

## TypeScript Types

### Core Index Types (PostgreSQL)

```ts
interface IndexConfig {
  name?: string;
  columns: Partial<IndexedColumn | SQL>[];
  unique: boolean;
  concurrently?: boolean;  // PostgreSQL only
  only: boolean;           // PostgreSQL only
  where?: SQL;             // Partial index condition
  with?: Record<string, any>;  // Storage parameters
  method?: 'btree' | string;   // Index method
}

type PgIndexMethod =
  | 'btree'
  | 'hash'
  | 'gist'
  | 'spgist'
  | 'gin'
  | 'brin'
  | 'hnsw'      // pg_vector
  | 'ivfflat'   // pg_vector
  | (string & {});  // Extensible for custom methods

type PgIndexOpClass =
  | 'text_ops'
  | 'varchar_ops'
  | 'int4_ops'
  | 'uuid_ops'
  | 'vector_l2_ops'      // pg_vector
  | 'vector_ip_ops'      // pg_vector
  | 'vector_cosine_ops'  // pg_vector
  | (string & {});  // Extensible
```

### Core Index Types (SQLite)

```ts
interface IndexConfig {
  name: string;  // Required in SQLite
  columns: IndexColumn[];
  unique: boolean;
  where: SQL | undefined;
}

type IndexColumn = SQLiteColumn | SQL;
```

### Builder Pattern Types

```ts
class IndexBuilderOn {
  constructor(unique: boolean, name?: string)

  on(...columns: [Column | SQL, ...Column | SQL[]]): IndexBuilder
  onOnly(...columns: [Column | SQL, ...Column | SQL[]]): IndexBuilder  // PostgreSQL only
  using(method: PgIndexMethod, ...columns: [Column | SQL, ...Column | SQL[]]): IndexBuilder  // PostgreSQL only
}

class IndexBuilder {
  concurrently(): this  // PostgreSQL only
  with(obj: Record<string, any>): this  // PostgreSQL only
  where(condition: SQL): this

  build(table: Table): Index  // Internal
}

class Index {
  readonly config: IndexConfig & { table: Table };
  readonly isNameExplicit: boolean;
}
```

### Column Extra Config Types (PostgreSQL)

```ts
type IndexedExtraConfigType = {
  order?: 'asc' | 'desc';
  nulls?: 'first' | 'last';
  opClass?: string;
};

class ExtraConfigColumn {
  indexConfig: IndexedExtraConfigType;

  asc(): Omit<this, 'asc' | 'desc'>
  desc(): Omit<this, 'asc' | 'desc'>
  nullsFirst(): Omit<this, 'nullsFirst' | 'nullsLast'>
  nullsLast(): Omit<this, 'nullsFirst' | 'nullsLast'>
  op(opClass: PgIndexOpClass): Omit<this, 'op'>
}

class IndexedColumn {
  name: string | undefined;
  keyAsName: boolean;
  type: string;
  indexConfig: IndexedExtraConfigType;
}
```

---

## Database Integration Patterns

### PostgreSQL Pattern

Indexes are defined in the table's third parameter (extraConfig):

```ts
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name'),
  email: text('email'),
}, (users) => [
  // Array of index definitions (new API)
  index('name_idx').on(users.name),
  uniqueIndex('email_idx').on(users.email),
  index('name_email_idx').on(users.name, users.email),
]);

// Old API (deprecated) - returns object instead of array
export const oldUsers = pgTable('users', {
  // ...
}, (users) => ({
  nameIdx: index('name_idx').on(users.name),
  emailIdx: uniqueIndex('email_idx').on(users.email),
}));
```

### SQLite Pattern

Similar to PostgreSQL but with fewer features:

```ts
export const users = sqliteTable('users', {
  id: integer('id').primaryKey(),
  name: text('name'),
  email: text('email'),
}, (users) => [
  index('name_idx').on(users.name),
  uniqueIndex('email_idx').on(users.email),
]);
```

### Table Extra Config Type

```ts
// PostgreSQL
type PgTableExtraConfigValue =
  | AnyIndexBuilder
  | CheckBuilder
  | ForeignKeyBuilder
  | PrimaryKeyBuilder
  | UniqueConstraintBuilder
  | RlsPolicy;

type PgTableExtraConfig = Record<string, PgTableExtraConfigValue>;

// SQLite
type SQLiteTableExtraConfigValue =
  | IndexBuilder
  | CheckBuilder
  | ForeignKeyBuilder
  | PrimaryKeyBuilder
  | UniqueConstraintBuilder;

type SQLiteTableExtraConfig = Record<string, SQLiteTableExtraConfigValue>;
```

---

## Index Naming

### Naming Patterns

1. **Explicit names** (recommended for production):
```ts
index('user_name_idx').on(table.name)
uniqueIndex('user_email_unique').on(table.email)
```

2. **Auto-generated names** (PostgreSQL only, not recommended):
```ts
index().on(table.name)  // Name will be auto-generated by database
```

3. **Naming conventions observed in tests**:
- Single column: `{table}_{column}_idx`
- Multiple columns: `{table}_{col1}_{col2}_idx`
- Unique: `{table}_{column}_unique` or `{table}_{column}_unique_idx`
- Expression-based: `{descriptive_name}_idx` (e.g., `email_lower_idx`)

### Name Tracking

```ts
class Index {
  readonly isNameExplicit: boolean;  // Tracks if name was provided explicitly
}
```

---

## Composite Indexes

Composite indexes are created by passing multiple columns to `.on()`:

```ts
// Simple composite index
index('name_email_idx').on(users.name, users.email)

// Composite with column modifiers (PostgreSQL)
index('name_email_idx').on(
  users.name.asc(),
  users.email.desc().nullsLast()
)

// Composite with expressions
index('expr_idx').on(
  sql`lower(${users.name})`,
  users.email
)

// Using .using() method (PostgreSQL)
index('composite_btree').using(
  'btree',
  users.name.asc(),
  users.email.desc()
)
```

---

## Unique Indexes

Unique indexes use the `uniqueIndex()` function instead of `index()`:

```ts
// Basic unique index
uniqueIndex('email_unique').on(users.email)

// Composite unique index
uniqueIndex('name_email_unique').on(users.name, users.email)

// Unique index with partial condition (PostgreSQL)
uniqueIndex('active_email_unique')
  .on(users.email)
  .where(sql`${users.isActive} = true`)

// Unique index with custom method (PostgreSQL)
uniqueIndex('email_hash_unique')
  .using('hash', users.email)
```

---

## Special Features

### 1. Partial Indexes (WHERE clause)

Both PostgreSQL and SQLite support partial indexes:

```ts
index('active_users_idx')
  .on(users.name)
  .where(sql`${users.isActive} = true`)

uniqueIndex('undeleted_email_unique')
  .on(users.email)
  .where(sql`${users.deletedAt} IS NULL`)
```

### 2. Expression-based Indexes

Indexes can use SQL expressions instead of just columns:

```ts
// Single expression
index('email_lower_idx').on(sql`lower(${users.email})`)

// Multiple expressions
index('name_email_lower_idx').on(
  sql`lower(${users.name})`,
  sql`lower(${users.email})`
)

// Mixed columns and expressions
index('mixed_idx').on(
  users.id,
  sql`lower(${users.email})`
)
```

### 3. PostgreSQL-Specific: Index Methods (USING)

PostgreSQL supports various index methods:

```ts
// B-tree (default)
index('btree_idx').using('btree', users.name)

// Hash
index('hash_idx').using('hash', users.email)

// GIN (for full-text search, JSONB)
index('title_search').using('gin', sql`to_tsvector('english', ${table.title})`)

// BRIN (for large tables with natural ordering)
index('created_at_idx').using('brin', users.createdAt)

// pg_vector extensions
index('embedding_l2').using('hnsw', users.embedding.op('vector_l2_ops'))
index('embedding_cosine').using('hnsw', users.embedding.op('vector_cosine_ops'))
```

### 4. PostgreSQL-Specific: Storage Parameters (WITH)

```ts
index('idx_with_params')
  .on(users.name)
  .with({
    fillfactor: '70',
    deduplicate_items: true
  })

index('brin_idx')
  .using('brin', users.createdAt)
  .with({ autosummarize: false })
```

### 5. PostgreSQL-Specific: Concurrent Creation

```ts
index('concurrent_idx')
  .on(users.email)
  .concurrently()  // CREATE INDEX CONCURRENTLY (non-blocking)
```

### 6. PostgreSQL-Specific: ONLY modifier

```ts
index('only_idx')
  .onOnly(users.name)  // Creates index only on parent table, not partitions
```

### 7. Operator Classes (PostgreSQL)

```ts
// Text operators
index('text_idx').on(users.name.op('text_ops'))

// Vector operators (pg_vector)
index('vector_idx').using(
  'hnsw',
  users.embedding.op('vector_l2_ops')
)

// Custom operators
index('custom_idx').on(users.customField.op('my_custom_ops'))
```

---

## Patterns for kitcn

Based on Drizzle v1's design, here are recommended patterns for kitcn ORM:

### 1. API Design

**Recommended approach**: Start simple (like SQLite), add features incrementally:

```ts
// Phase 1: Basic indexes (matching Convex capabilities)
export const users = defineTable({
  name: v.string(),
  email: v.string(),
}).indexes((t) => [
  index('name_idx').on(t.name),
  index('name_email_idx').on(t.name, t.email),
]);

// Phase 2: Add expressions when Convex supports them
export const users = defineTable({
  // ...
}).indexes((t) => [
  index('email_lower').on(sql`lower(${t.email})`),
]);
```

### 2. Naming Strategy

```ts
// Explicit names (required in Convex, unlike PostgreSQL)
index('user_name_idx')  // ✅ Clear, explicit

// Auto-generated names (not recommended for Convex)
index()  // ❌ Convex requires explicit names
```

### 3. Type Safety

Key type patterns to adopt:

```ts
// Builder pattern with method chaining
class IndexBuilder {
  on(...columns: [Column, ...Column[]]): IndexBuilder
  where(condition: SQL): this  // Future feature

  build(table: Table): Index  // Internal
}

// Column with index configuration (for future features)
type IndexedExtraConfigType = {
  order?: 'asc' | 'desc';  // Future: if Convex adds ordering
};

// Track explicit vs implicit naming
class Index {
  readonly isNameExplicit: boolean;
}
```

### 4. Table Integration Pattern

```ts
// Use same extraConfig pattern as Drizzle
export interface ConvexTableFn {
  <TColumns>(
    columns: TColumns,
    extraConfig?: (self: BuildColumns<TColumns>) => ExtraConfigValue[]
  ): ConvexTableWithColumns<TColumns>;
}

type ExtraConfigValue =
  | IndexBuilder
  | ... other builders;
```

### 5. Column Modifiers (Future)

If Convex adds support for ordering or other features:

```ts
class ExtraConfigColumn {
  asc(): this
  desc(): this

  // Remove methods from return type to prevent chaining
  asc(): Omit<this, 'asc' | 'desc'>
  desc(): Omit<this, 'asc' | 'desc'>
}
```

### 6. Extensibility

Make the API extensible for future Convex features:

```ts
// Allow SQL expressions (for future)
type IndexColumn = Column | SQL;

// Allow custom configurations (for future)
interface IndexConfig {
  name: string;
  columns: IndexColumn[];
  where?: SQL;  // Future: partial indexes
  // ...extensible for future Convex features
}
```

### 7. Deprecation Strategy

Follow Drizzle's approach for API changes:

```ts
// Old API (deprecated but supported)
defineTable(columns, (t) => ({
  nameIdx: index('name_idx').on(t.name),
}));

// New API (preferred)
defineTable(columns, (t) => [
  index('name_idx').on(t.name),
]);
```

### 8. Real-World Usage Examples

Based on Drizzle test patterns:

```ts
// Single column index
index('name_idx').on(t.name)

// Composite index
index('name_email_idx').on(t.name, t.email)

// Partial index (future)
index('active_users_idx')
  .on(t.name)
  .where(sql`${t.isActive} = true`)

// Expression-based (future)
index('email_lower_idx').on(sql`lower(${t.email})`)
```

---

## Key Takeaways for kitcn

1. **Start simple**: Begin with basic index support (name + columns), add features as Convex evolves
2. **Explicit naming**: Require explicit index names (like SQLite), not optional (like PostgreSQL)
3. **Builder pattern**: Use the same IndexBuilderOn → IndexBuilder → Index pattern
4. **Type safety**: Track whether names are explicit, use phantom types for column modifiers
5. **Extensibility**: Design API to accommodate future Convex features (expressions, partial indexes)
6. **Array-based API**: Use array return from extraConfig (new Drizzle API) rather than object
7. **Column modifiers**: Prepare for future by having ExtraConfigColumn infrastructure
8. **Integration**: Follow same table function signature pattern with optional extraConfig parameter

---

## Files Analyzed

- `/drizzle-orm/src/pg-core/indexes.ts` - PostgreSQL index implementation
- `/drizzle-orm/src/sqlite-core/indexes.ts` - SQLite index implementation
- `/drizzle-orm/src/pg-core/columns/common.ts` - Column types and ExtraConfigColumn
- `/drizzle-orm/src/pg-core/table.ts` - Table integration
- `/drizzle-orm/src/sqlite-core/table.ts` - SQLite table integration
- Various test files demonstrating real-world usage patterns
- Changelog 0.31.0 - PostgreSQL index API redesign
