# Drizzle v1 Index Examples - Side-by-Side Comparison

Real-world examples from Drizzle v1 tests showing different index patterns.

## Basic Index Examples

### Single Column Index

**Drizzle PostgreSQL:**
```ts
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name'),
}, (users) => [
  index('name_idx').on(users.name),
]);
```

**Drizzle SQLite:**
```ts
export const users = sqliteTable('users', {
  id: integer('id').primaryKey(),
  name: text('name'),
}, (users) => [
  index('name_idx').on(users.name),
]);
```

**kitcn (Target):**
```ts
export const users = defineTable({
  name: v.string(),
}, (t) => [
  index('name_idx').on(t.name),
]);
```

### Composite Index

**Drizzle:**
```ts
export const users = pgTable('users', {
  firstName: text('first_name'),
  lastName: text('last_name'),
}, (users) => [
  index('name_idx').on(users.firstName, users.lastName),
]);
```

**kitcn (Target):**
```ts
export const users = defineTable({
  firstName: v.string(),
  lastName: v.string(),
}, (t) => [
  index('name_idx').on(t.firstName, t.lastName),
]);
```

### Unique Index

**Drizzle:**
```ts
export const users = pgTable('users', {
  email: text('email'),
}, (users) => [
  uniqueIndex('email_unique').on(users.email),
]);
```

**kitcn (Target):**
```ts
export const users = defineTable({
  email: v.string(),
}, (t) => [
  uniqueIndex('email_unique').on(t.email),
]);
```

## Advanced PostgreSQL Examples (Future Reference)

### Partial Index with WHERE Clause

**Drizzle PostgreSQL:**
```ts
export const users = pgTable('users', {
  email: text('email'),
  deletedAt: timestamp('deleted_at'),
}, (users) => [
  uniqueIndex('active_email_unique')
    .on(users.email)
    .where(sql`${users.deletedAt} IS NULL`),
]);
```

**kitcn (Future):**
```ts
export const users = defineTable({
  email: v.string(),
  deletedAt: v.optional(v.number()),
}, (t) => [
  uniqueIndex('active_email_unique')
    .on(t.email)
    .where(sql`${t.deletedAt} IS NULL`),
]);
```

### Expression-Based Index

**Drizzle PostgreSQL:**
```ts
export const users = pgTable('users', {
  email: text('email'),
  firstName: text('first_name'),
}, (users) => [
  // Single expression
  index('email_lower_idx').on(sql`lower(${users.email})`),

  // Multiple expressions
  index('multi_expr_idx').on(
    sql`lower(${users.firstName})`,
    sql`lower(${users.email})`
  ),
]);
```

**kitcn (Future):**
```ts
export const users = defineTable({
  email: v.string(),
  firstName: v.string(),
}, (t) => [
  index('email_lower_idx').on(sql`lower(${t.email})`),
  index('multi_expr_idx').on(
    sql`lower(${t.firstName})`,
    sql`lower(${t.email})`
  ),
]);
```

### Column Modifiers (ASC/DESC, NULLS)

**Drizzle PostgreSQL:**
```ts
export const users = pgTable('users', {
  name: text('name'),
  age: integer('age'),
  createdAt: timestamp('created_at'),
}, (users) => [
  index('name_age_idx').on(
    users.name.asc(),
    users.age.desc().nullsLast()
  ),

  index('created_desc_idx').on(
    users.createdAt.desc().nullsFirst()
  ),
]);
```

**kitcn (Future):**
```ts
export const users = defineTable({
  name: v.string(),
  age: v.number(),
  createdAt: v.number(),
}, (t) => [
  index('name_age_idx').on(
    t.name.asc(),
    t.age.desc().nullsLast()
  ),

  index('created_desc_idx').on(
    t.createdAt.desc().nullsFirst()
  ),
]);
```

### Index Methods (USING)

**Drizzle PostgreSQL:**
```ts
export const users = pgTable('users', {
  email: text('email'),
  title: text('title'),
  tags: text('tags').array(),
}, (users) => [
  // Hash index
  index('email_hash').using('hash', users.email),

  // GIN index for full-text search
  index('title_search').using(
    'gin',
    sql`to_tsvector('english', ${users.title})`
  ),

  // GIN index for array
  index('tags_gin').using('gin', users.tags),
]);
```

### Storage Parameters (WITH)

**Drizzle PostgreSQL:**
```ts
export const users = pgTable('users', {
  name: text('name'),
}, (users) => [
  index('name_idx')
    .on(users.name)
    .with({ fillfactor: '70' }),

  index('name_btree')
    .using('btree', users.name)
    .with({
      deduplicate_items: true,
      fillfactor: '80',
    }),
]);
```

### Concurrent Index Creation

**Drizzle PostgreSQL:**
```ts
export const users = pgTable('users', {
  email: text('email'),
}, (users) => [
  index('email_idx')
    .on(users.email)
    .concurrently(),  // Non-blocking index creation
]);
```

### Operator Classes

**Drizzle PostgreSQL:**
```ts
export const users = pgTable('users', {
  name: text('name'),
  customField: text('custom_field'),
}, (users) => [
  index('name_idx').on(
    users.name.op('text_ops')
  ),

  index('custom_idx').using(
    'btree',
    users.customField.op('custom_ops')
  ),
]);
```

## pg_vector Examples (Advanced)

### Vector Similarity Search Indexes

**Drizzle PostgreSQL with pg_vector:**
```ts
export const documents = pgTable('documents', {
  id: serial('id').primaryKey(),
  embedding: vector('embedding', { dimensions: 1536 }),
}, (docs) => [
  // L2 distance (Euclidean)
  index('embedding_l2')
    .using('hnsw', docs.embedding.op('vector_l2_ops')),

  // Inner product
  index('embedding_ip')
    .using('hnsw', docs.embedding.op('vector_ip_ops')),

  // Cosine distance
  index('embedding_cosine')
    .using('hnsw', docs.embedding.op('vector_cosine_ops')),

  // With storage parameters
  index('embedding_l2_tuned')
    .using('hnsw', docs.embedding.op('vector_l2_ops'))
    .with({ m: '16', ef_construction: '64' }),
]);
```

## Mixed Column and Expression Indexes

**Drizzle PostgreSQL:**
```ts
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email'),
  firstName: text('first_name'),
  lastName: text('last_name'),
}, (users) => [
  // Mix of columns and expressions
  index('mixed_idx').on(
    users.id,
    sql`lower(${users.email})`,
    users.firstName.asc(),
    sql`lower(${users.lastName})`
  ),
]);
```

## Real-World Patterns from Drizzle Tests

### User Authentication Table

**Drizzle PostgreSQL:**
```ts
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull(),
  username: text('username'),
  deletedAt: timestamp('deleted_at'),
  isActive: boolean('is_active').default(true),
}, (users) => [
  // Unique email for active (non-deleted) users only
  uniqueIndex('active_email_unique')
    .on(users.email)
    .where(sql`${users.deletedAt} IS NULL`),

  // Username lookup (case-insensitive)
  index('username_lower_idx')
    .on(sql`lower(${users.username})`),

  // Active users lookup
  index('active_users_idx')
    .on(users.isActive)
    .where(sql`${users.isActive} = true`),
]);
```

**kitcn (Target - Phase 1):**
```ts
export const users = defineTable({
  email: v.string(),
  username: v.string(),
  deletedAt: v.optional(v.number()),
  isActive: v.boolean(),
}, (t) => [
  // Phase 1: Basic indexes only
  uniqueIndex('email_unique').on(t.email),
  index('username_idx').on(t.username),
  index('active_idx').on(t.isActive),
]);

// Phase 2: Add partial indexes
export const users = defineTable({
  // ... same columns
}, (t) => [
  uniqueIndex('active_email_unique')
    .on(t.email)
    .where(sql`${t.deletedAt} IS NULL`),

  index('username_lower_idx')
    .on(sql`lower(${t.username})`),

  index('active_users_idx')
    .on(t.isActive)
    .where(sql`${t.isActive} = true`),
]);
```

### E-Commerce Orders Table

**Drizzle PostgreSQL:**
```ts
export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),
  status: text('status').notNull(), // 'pending', 'completed', 'cancelled'
  totalAmount: numeric('total_amount').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  shippedAt: timestamp('shipped_at'),
}, (orders) => [
  // User's orders lookup
  index('user_orders_idx').on(orders.userId, orders.createdAt.desc()),

  // Pending orders
  index('pending_orders_idx')
    .on(orders.status, orders.createdAt)
    .where(sql`${orders.status} = 'pending'`),

  // High-value orders
  index('high_value_idx')
    .on(orders.totalAmount.desc())
    .where(sql`${orders.totalAmount} > 1000`),

  // Composite for order history queries
  index('user_status_date_idx').on(
    orders.userId,
    orders.status,
    orders.createdAt.desc()
  ),
]);
```

**kitcn (Target):**
```ts
export const orders = defineTable({
  userId: v.id('users'),
  status: v.string(),
  totalAmount: v.number(),
  createdAt: v.number(),
  shippedAt: v.optional(v.number()),
}, (t) => [
  index('user_orders_idx').on(t.userId, t.createdAt),
  index('user_status_date_idx').on(t.userId, t.status, t.createdAt),

  // Future: with partial indexes
  // index('pending_orders_idx')
  //   .on(t.status, t.createdAt)
  //   .where(sql`${t.status} = 'pending'`),
]);
```

### Multi-Tenant Application

**Drizzle PostgreSQL:**
```ts
export const documents = pgTable('documents', {
  id: serial('id').primaryKey(),
  workspaceId: integer('workspace_id').notNull(),
  userId: integer('user_id').notNull(),
  title: text('title').notNull(),
  status: text('status').notNull(), // 'draft', 'published', 'archived'
  createdAt: timestamp('created_at').notNull(),
}, (docs) => [
  // Workspace documents
  index('workspace_docs_idx').on(
    docs.workspaceId,
    docs.createdAt.desc()
  ),

  // User's documents in workspace
  index('workspace_user_docs_idx').on(
    docs.workspaceId,
    docs.userId,
    docs.createdAt.desc()
  ),

  // Published documents per workspace
  index('workspace_published_idx')
    .on(docs.workspaceId, docs.createdAt.desc())
    .where(sql`${docs.status} = 'published'`),

  // Full-text search on titles (workspace-scoped)
  index('title_search_idx')
    .using('gin', sql`to_tsvector('english', ${docs.title})`),
]);
```

**kitcn (Target):**
```ts
export const documents = defineTable({
  workspaceId: v.id('workspaces'),
  userId: v.id('users'),
  title: v.string(),
  status: v.string(),
  createdAt: v.number(),
}, (t) => [
  index('workspace_docs_idx').on(t.workspaceId, t.createdAt),
  index('workspace_user_docs_idx').on(t.workspaceId, t.userId, t.createdAt),

  // Convex search indexes (different pattern)
  // searchIndex('title_search', { searchField: 'title' }),
]);
```

## Old vs New Drizzle API

### Object-based (Deprecated)

```ts
export const users = pgTable('users', {
  name: text('name'),
  email: text('email'),
}, (users) => ({
  // Returns object with named keys
  nameIdx: index('name_idx').on(users.name),
  emailIdx: uniqueIndex('email_idx').on(users.email),
}));

// Access: users.nameIdx, users.emailIdx
```

### Array-based (Current)

```ts
export const users = pgTable('users', {
  name: text('name'),
  email: text('email'),
}, (users) => [
  // Returns array
  index('name_idx').on(users.name),
  uniqueIndex('email_idx').on(users.email),
]);

// Indexes stored internally, not exposed on table
```

## kitcn Migration Path

### Current Convex API

```ts
defineTable({
  email: v.string(),
  name: v.string(),
})
  .index("by_email", ["email"])
  .index("by_name", ["name"]);
```

### kitcn Target API

```ts
defineTable({
  email: v.string(),
  name: v.string(),
}, (t) => [
  index('by_email').on(t.email),
  index('by_name').on(t.name),
]);
```

### Potential Dual API Support

```ts
// Support both during migration period
const table = defineTable({
  email: v.string(),
  name: v.string(),
})
  // Old API (backwards compatible)
  .index("old_style", ["email"])

  // New API (preferred)
  .indexes((t) => [
    index('new_style').on(t.email),
  ]);
```

## Type Inference Examples

### Column Type Inference

**Drizzle:**
```ts
const users = pgTable('users', {
  id: serial('id'),
  name: text('name'),
});

// In extraConfig callback:
(t) => [
  index('name_idx').on(t.name),
  //                    ^^^^^^ Type: PgColumn<...>
]
```

**kitcn (Target):**
```ts
const users = defineTable({
  id: v.id('users'),
  name: v.string(),
});

// In extraConfig callback:
(t) => [
  index('name_idx').on(t.name),
  //                    ^^^^^^ Type: Column<string>
]
```

### Type Safety in Action

```ts
const users = defineTable({
  name: v.string(),
  age: v.number(),
});

// ✅ Valid
(t) => [
  index('name_idx').on(t.name),
  index('name_age_idx').on(t.name, t.age),
]

// ❌ Type error - column doesn't exist
(t) => [
  index('invalid').on(t.nonExistent),
  //                     ^^^^^^^^^^^ Property doesn't exist
]

// ❌ Type error - wrong number of arguments
(t) => [
  index('empty').on(),
  //             ^^^^ Expected at least 1 argument
]
```

## Testing Examples from Drizzle

### Basic Index Creation Test

```ts
test('create basic index', () => {
  const users = pgTable('users', {
    name: text('name'),
  }, (t) => [
    index('name_idx').on(t.name),
  ]);

  expect(users[Table.Symbol.Indexes]).toHaveLength(1);
  expect(users[Table.Symbol.Indexes][0].config.name).toBe('name_idx');
  expect(users[Table.Symbol.Indexes][0].config.unique).toBe(false);
});
```

### Composite Index Test

```ts
test('create composite index', () => {
  const users = pgTable('users', {
    firstName: text('first_name'),
    lastName: text('last_name'),
  }, (t) => [
    index('name_idx').on(t.firstName, t.lastName),
  ]);

  const idx = users[Table.Symbol.Indexes][0];
  expect(idx.config.columns).toHaveLength(2);
});
```

### Type Safety Test

```ts
test('index builder type safety', () => {
  const users = pgTable('users', {
    name: text('name'),
  });

  // Should accept column
  const idx1 = index('idx').on(users.name);

  // Should accept multiple columns
  const idx2 = index('idx').on(users.name, users.name);

  // Should accept SQL expressions
  const idx3 = index('idx').on(sql`lower(${users.name})`);

  // Type checks pass ✅
});
```
