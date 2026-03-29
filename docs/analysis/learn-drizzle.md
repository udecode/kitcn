# Drizzle ORM - Quick Reference for Prisma Users

> Concise guide mapping Drizzle v1 patterns to Prisma equivalents. Assumes proficiency in Prisma and Convex.

**Version Note:** kitcn mirrors **Drizzle v1** (canonical PG integration). This doc is v1-only.

## Quick Mental Map

```
Prisma                     -> Drizzle
schema.prisma DSL          -> TypeScript code-first
create()                   -> insert().values()
findMany()                 -> findMany({ where: ... })
update()                   -> update().set().where()
delete()                   -> delete().where()
upsert()                   -> insert().onConflictDoUpdate()
include: { relation }      -> with: { relation: true }
select: { field: true }    -> columns: { field: true }
```

---

## 1. Schema Definition

### Table Definition

**Prisma:**

```prisma
model User {
  id    String @id @default(uuid())
  name  String
  email String?
  age   Int    @default(18)
}
```

**Drizzle (kitcn):**

```ts
import { convexTable, text, integer } from 'kitcn/orm';

const users = convexTable('users', {
  name: text().notNull(),
  email: text(), // Nullable by default
  age: integer().default(18),
});
```

**Key differences:**
- Drizzle: Fluent API (`.notNull()`, `.default()`, `.primaryKey()`)
- Prisma: Decorators (`@id`, `@default()`, `?`)
- Drizzle: Nullable by default
- Prisma: Required by default

### Column Types (Better-Convex subset)

| Type    | Builder        | Notes            |
| ------- | -------------- | ---------------- |
| Text    | `text()`       | string           |
| Integer | `integer()`    | number           |
| Number  | `number()`     | number           |
| Boolean | `boolean()`    | boolean          |
| BigInt  | `bigint()`     | bigint           |
| Id      | `id('table')`  | Convex reference |
| Array   | `.array('[][]')` | PG-style arrays |

### Arrays (v1)

```ts
text('tags').array('[]');    // 1D
text('tags').array('[][]');  // 2D
```

### Type Inference

```ts
type User = typeof users.$inferSelect;
type UserInsert = typeof users.$inferInsert;

import { InferSelectModel, InferInsertModel } from 'kitcn/orm';

type User = InferSelectModel<typeof users>;
type UserInsert = InferInsertModel<typeof users>;
```

**Type rules:**
- `$inferSelect`: All fields, nullable if !notNull
- `$inferInsert`: Required if notNull && !hasDefault, otherwise optional

---

## 2. Relations (defineRelations)

### Basic One-to-Many

```ts
import { convexTable, defineRelations, id, text } from 'kitcn/orm';

const users = convexTable('users', {
  name: text().notNull(),
});

const posts = convexTable('posts', {
  title: text().notNull(),
  userId: id('users'),
});

export const relations = defineRelations({ users, posts }, (r) => ({
  users: {
    posts: r.many.posts(),
  },
  posts: {
    author: r.one.users({
      from: r.posts.userId,
      to: r.users._id,
    }),
  },
}));
```

### One-to-One

```ts
export const relations = defineRelations({ users, profiles }, (r) => ({
  profiles: {
    user: r.one.users({ from: r.profiles.userId, to: r.users._id }),
  },
  users: {
    profile: r.one.profiles(),
  },
}));
```

### Many-to-Many (Join Table)

```ts
const bookAuthors = convexTable('bookAuthors', {
  bookId: id('books'),
  authorId: id('users'),
});

export const relations = defineRelations(
  { books, users, bookAuthors },
  (r) => ({
    books: {
      authors: r.many.users({
        from: r.books._id.through(r.bookAuthors.bookId),
        to: r.users._id.through(r.bookAuthors.authorId),
      }),
    },
    bookAuthors: {
      book: r.one.books({ from: r.bookAuthors.bookId, to: r.books._id }),
      author: r.one.users({ from: r.bookAuthors.authorId, to: r.users._id }),
    },
  })
);
```

### Self-Referencing (alias)

```ts
const users = convexTable('users', {
  name: text().notNull(),
  managerId: id('users'),
});

export const relations = defineRelations({ users }, (r) => ({
  users: {
    manager: r.one.users({
      from: r.users.managerId,
      to: r.users._id,
      alias: 'manager',
    }),
    reports: r.many.users({
      from: r.users._id,
      to: r.users.managerId,
      alias: 'manager',
    }),
  },
}));
```

---

## 3. Querying Data

### findMany / findFirst

```ts
const users = await db.query.users.findMany({
  where: { role: 'admin' },
  orderBy: { _creationTime: 'desc' },
  limit: 10,
});

const user = await db.query.users.findFirst({
  where: { email: 'alice@example.com' },
});
```

### Where Object Operators

```ts
const users = await db.query.users.findMany({
  where: {
    OR: [{ role: 'admin' }, { role: 'premium' }],
    age: { gt: 18 },
    email: { ilike: '%@example.com' },
  },
});
```

### Relation Filters

```ts
const users = await db.query.users.findMany({
  where: {
    posts: {
      title: { like: '%drizzle%' },
    },
  },
});
```

**Note:** For `many()` relations, filters are applied as "any" (match if at least one related row passes). Filters are post-fetch in Convex.

### Column Selection

```ts
const users = await db.query.users.findMany({
  columns: { name: true, email: true },
});
```

---

## 4. Mutations

```ts
import { eq } from 'kitcn/orm';
```

### Insert

```ts
await db.insert(users).values({ name: 'Ada', email: 'ada@example.com' });
```

### Returning

```ts
const [user] = await db
  .insert(users)
  .values({ name: 'Ada', email: 'ada@example.com' })
  .returning({ id: users._id, email: users.email });
```

### Update

```ts
await db
  .update(users)
  .set({ name: 'Ada Lovelace' })
  .where(eq(users._id, userId));
```

### Delete

```ts
await db.delete(users).where(eq(users._id, userId));
```

### Upsert

```ts
await db
  .insert(users)
  .values({ email: 'ada@example.com', name: 'Ada' })
  .onConflictDoUpdate({
    target: users.email,
    set: { name: 'Ada Lovelace' },
  });
```

---

## 5. Convex Differences

- No raw SQL (`RAW` filters are rejected)
- `where` uses object filters, not SQL callbacks
- String operators (`like`, `ilike`, `startsWith`, `endsWith`, `contains`) are post-fetch
- Relation filters on `many()` are post-fetch
- `returning()` always returns arrays
- Column defaults are not applied automatically

---

## 6. Migration (v0.45 -> v1)

**Breaking changes:**
- `relations()` -> `defineRelations()`
- `fields` -> `from`
- `references` -> `to`
- `relationName` -> `alias`
- `where` callbacks -> object filters

**Quick diff:**

```ts
// v0.45
const postsRelations = relations(posts, ({ one }) => ({
  author: one(users, { fields: [posts.userId], references: [users.id] }),
}));

// v1
export const relations = defineRelations({ users, posts }, (r) => ({
  posts: {
    author: r.one.users({ from: r.posts.userId, to: r.users._id }),
  },
}));
```
