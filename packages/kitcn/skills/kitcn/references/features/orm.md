# ORM Reference

Complete ORM API for feature work. Prerequisites: `setup/server.md`.

## Core Rules

1. `ctx.orm.query.*` for reads, `ctx.orm.insert/update/delete` for writes.
2. Keep list queries bounded (`limit`/cursor) and index-aware.
3. Use relations (`with`) for loading related data.
4. Put cross-row side effects in schema triggers.
5. Constraints (unique, FK, check) enforced by ORM mutations only — `ctx.db` bypasses them.

## Column Types

All from `kitcn/orm`. See [Column Types](#column-types-1) in API Reference.

### Column Modifiers

```ts
text().notNull(); // required on select, required on insert
text().default("draft"); // optional on insert, uses default
text().notNull().unique(); // unique constraint (runtime-enforced)
timestamp().defaultNow(); // shorthand for $defaultFn(() => new Date())
timestamp().$onUpdateFn(() => new Date()); // runs on update when field not explicitly set
json<T>().$type<T>(); // type-only override
text().$defaultFn(() => crypto.randomUUID()); // custom default
```

### Type Inference

```ts
type Post = typeof posts.$inferSelect; // Select type (fields are T | null unless .notNull())
type NewPost = typeof posts.$inferInsert; // Insert type (required if .notNull() + no default)

// Or with helpers:
import { InferSelectModel, InferInsertModel } from "kitcn/orm";
type Post = InferSelectModel<typeof posts>;
```

## Constraints

### Unique

```ts
// Column-level
email: text().notNull().unique();

// Table-level unique index
import { uniqueIndex } from "kitcn/orm";
(t) => [uniqueIndex("users_email_unique").on(t.email)];

// Compound unique
import { unique } from "kitcn/orm";
(t) => [unique("full_name").on(t.firstName, t.lastName)];
```

### Foreign Keys

```ts
// Column-level (.references)
authorId: id("users")
  .notNull()
  .references(() => users.id);

// With cascading actions
authorId: id("users")
  .notNull()
  .references(() => users.id, {
    onDelete: "cascade", // cascade | set null | set default | restrict | no action
  });

// Self-referencing (use AnyColumn return type)
import { type AnyColumn } from "kitcn/orm";
parentId: text().references((): AnyColumn => commentsTable.id, {
  onDelete: "cascade",
});

// Bidirectional CMS revision pointers also work.
// This shape is valid:
// - revision.pageLocaleId -> pageLocales.id
// - pageLocales.currentRevisionId -> pageLocaleRevisions.id
// - pageLocales.publishedRevisionId -> pageLocaleRevisions.id
currentRevisionId: id("pageLocaleRevisions").references(
  () => pageLocaleRevisions.id
);

// Table-level (foreignKey builder, for non-id references)
import { foreignKey } from "kitcn/orm";
(t) => [foreignKey({ columns: [t.userSlug], foreignColumns: [users.slug] })];
```

### Check Constraints

```ts
import { check, gt, isNotNull } from "kitcn/orm";
(t) => [
  check("age_over_18", gt(t.age, 18)),
  check("email_present", isNotNull(t.email)),
];
```

## Indexes

```ts
import { index, searchIndex, vectorIndex } from 'kitcn/orm';

// Standard index
(t) => [index('by_author').on(t.authorId)]

// Search index (full-text)
(t) => [searchIndex('by_title').on(t.title).filter(t.authorId)]

// Vector index
(t) => [vectorIndex('embedding_vec').on(t.embedding).dimensions(1536).filter(t.authorId)]
```

## Relations

```ts
import { defineSchema } from "kitcn/orm";

export default defineSchema({ users, posts, tags, postsTags }).relations(
  (r) => ({
    users: {
      posts: r.many.posts(),
    },
    posts: {
      author: r.one.users({ from: r.posts.authorId, to: r.users.id }),
      // optional: false → non-nullable return type
      // alias: 'author' → disambiguate multiple relations to same table
      // where: { published: true } → predefined filter
    },
    // Many-to-many via join table
    postsTags: {
      post: r.one.posts({ from: r.postsTags.postId, to: r.posts.id }),
      tag: r.one.tags({ from: r.postsTags.tagId, to: r.tags.id }),
    },
  })
);
```

Plugin relation composition:

1. Extensions can expose `relations(...)`.
2. `defineSchema` merges extension relations first, then app `relations`.
3. Duplicate relation fields (`table.field`) throw.

### Many-to-many with `.through()`

```ts
users: {
  groups: r.many.groups({
    from: r.users.id.through(r.usersToGroups.userId),
    to: r.groups.id.through(r.usersToGroups.groupId),
    alias: 'users-groups-direct',
  }),
},
```

### Self-referencing

```ts
users: {
  manager: r.one.users({ from: r.users.managerId, to: r.users.id, alias: 'manager' }),
  reports: r.many.users({ from: r.users.id, to: r.users.managerId, alias: 'manager' }),
},
```

### Split relations (`defineRelationsPart`)

For large schemas, split relation definitions across modules and merge:

```ts
import { defineRelationsPart } from "kitcn/orm";
const userRelations = defineRelationsPart({ users, posts }, (r) => ({
  users: { posts: r.many.posts({ from: r.users.id, to: r.posts.authorId }) },
}));
// Merge into defineRelations
```

### Polymorphic associations

Polymorphism is schema-first via a discriminator column builder.

```ts
import { boolean, convexTable, discriminator, id, index, integer, text } from 'kitcn/orm';

const auditLogs = convexTable(
  'audit_logs',
  {
    timestamp: integer().notNull(),
    actionType: discriminator({
      as: 'details', // optional, default "details"
      variants: {
        role_change: {
          targetUserId: id('users'),
          oldRole: text().notNull(),
          newRole: text().notNull(),
        },
        document_update: {
          documentId: id('documents'),
          version: integer().notNull(),
          changes: text().notNull(),
        },
        security_alert: {
          severity: text().notNull(),
          errorCode: text().notNull(),
          isResolved: boolean().notNull(),
        },
      },
    }),
  },
  (t) => [
    index('by_action_ts').on(t.actionType, t.timestamp),
    index('by_role_target').on(t.actionType, t.targetUserId),
    index('by_doc').on(t.actionType, t.documentId),
  ]
);
```

Behavior:
- Storage and writes are flat (`actionType`, `targetUserId`, `documentId`, ...)
- Reads synthesize nested discriminated data at `details` (or custom `as`)
- `withVariants: true` auto-loads all `one()` relations on discriminator tables
- Generated variant fields are normal top-level refs for indexes/filters (`t.targetUserId`)

```ts
const rows = await ctx.orm.query.audit_logs.findMany({
  limit: 20,
  withVariants: true,
});

for (const row of rows) {
  if (row.actionType === 'role_change') {
    row.details.targetUserId;
    row.details.oldRole;
  }
}
```

Rules:
- One `discriminator(...)` discriminator column per table (current limit)
- Variant keys become discriminator literals
- Variant fields are generated as nullable physical columns
- Variant `.notNull()` means required in that branch only
- Duplicate field names across variants require identical builder signatures
- Alias (`as`) cannot collide with columns, relations, `with`, or `extras`
- Query config does not include a `polymorphic` option; polymorphism is defined in schema columns.

### Relation indexing requirements

- `many()` → index child FK field (e.g., `posts.userId`)
- `.through()` → index junction table FK fields (both directions)
- `one()` with `to: ...id` → uses `db.get()` (no extra index)
- Missing index throws unless `allowFullScan` on parent query

Relation `limit`/`orderBy` are pushed into the relation index when the index
already walks in that order. After the FK, `index('by_user').on(t.userId)`
orders by creation time, so `with: { posts: { limit: 5, orderBy: { createdAt:
'desc' } } }` reads 5 posts per parent. Sorting by any other column reads the
parent's whole child partition and sorts in memory — put the sort column in the
relation index (`index('by_user_rank').on(t.userId, t.rank)`) to stay bounded.

### Nested `with` depth

Nested `with:` loads every level it is given, up to 10. A tree that still has
rows to expand past that throws `RELATION_DEPTH_EXCEEDED` rather than coming back
shorter than requested — which is how a `with` object that references itself
surfaces. Fan-out per level is bounded by that level's `limit`, not by the depth
ceiling.

## Schema Definition

```ts
import {
  defineSchema,
} from "kitcn/orm";

// defineSchema takes tables map (not relations)
export default defineSchema(tables, {
  strict: false, // false = warn instead of throw on missing indexes
  defaults: {
    defaultLimit: 100, // default limit for findMany
    mutationBatchSize: 100, // page size for mutation row collection
    mutationMaxRows: 1000, // sync-mode hard cap
    mutationLeafBatchSize: 900, // async FK fan-out batch size
    mutationMaxBytesPerBatch: 2_097_152, // async measured-byte budget
    mutationScheduleCallCap: 100, // async schedule calls per mutation
    mutationExecutionMode: "async", // default when codegen wiring present; use 'sync' to opt out
    mutationAsyncDelayMs: 0,
    relationFanOutMaxKeys: 1000,
  },
}).relations((r) => ({
  users: {
    posts: r.many.posts(),
  },
  posts: {
      author: r.one.users({ from: r.posts.authorId, to: r.users.id }),
  },
}));
```

## Queries

```ts
// findMany with full options
const posts = await ctx.orm.query.posts.findMany({
  where: { authorId: ctx.userId, status: "published" },
  orderBy: { createdAt: "desc" },
  limit: 20,
  columns: { id: true, title: true, createdAt: true },
  with: { author: true, tags: { limit: 5 } },
});

// findFirst / findFirstOrThrow
const post = await ctx.orm.query.posts.findFirst({ where: { id: input.id } });
const post = await ctx.orm.query.posts.findFirstOrThrow({
  where: { id: input.id },
});

// Cursor pagination
const page = await ctx.orm.query.posts.findMany({
  where: { published: true },
  orderBy: { createdAt: "desc" },
  cursor: input.cursor ?? null,
  limit: 20,
});
// Returns: { page, continueCursor, isDone }

// Extras (computed fields, post-fetch)
const users = await ctx.orm.query.users.findMany({
  extras: { emailDomain: (row) => row.email.split("@")[1]! },
  limit: 50,
});

// System tables (raw Convex, not ORM)
const job = await ctx.orm.system.get(jobId);
const files = await ctx.orm.system.query("_storage").take(20);
```

### allowFullScan

Non-paginated `findMany()` requires sizing: `limit`, `cursor + limit`, `allowFullScan`, or `defaults.defaultLimit`.

### distinct (`findMany` unsupported)

`findMany({ distinct })` is not available to preserve strict no-scan/index-backed guarantees.

Use select-pipeline distinct instead:

```ts
const page = await ctx.orm.query.todos
  .select()
  .where({ projectId })
  .distinct({ fields: ['status'] })
  .paginate({ cursor: null, limit: 100 });
```

## Filtering + Pagination

| Query mode                       | Index required?                               | Pagination                                  | Ordering        |
| -------------------------------- | --------------------------------------------- | ------------------------------------------- | --------------- |
| `findMany({ where: object })`    | Optional (planner uses indexes when possible) | `limit/offset`, `cursor + limit`            | `orderBy`       |
| `findMany({ where: callback })`  | Optional (planner uses indexes when possible) | `limit/offset`, `cursor + limit`            | `orderBy`       |
| `findMany({ where: predicate })` | **Required** `.withIndex(name, range?)`       | `cursor + limit`, optional `maxScan`        | Index-backed    |
| `findMany({ search })`           | **Required** `searchIndex`                    | `limit/offset`, `cursor + limit`            | Relevance only  |
| `findMany({ vectorSearch })`     | **Required** `vectorIndex`                    | `vectorSearch.limit` only                   | Similarity only |
| `select()` composition           | Schema + index per source                     | `cursor + limit` (+ `endCursor`, `maxScan`) | Stream-backed   |

### How to choose

1. Need relevance-ranked text search? → `search`
2. Need vector similarity? → `vectorSearch`
3. Need relation-aware filtering? → object `where`
4. Need Drizzle callback syntax? → callback `where`
5. Need custom JS predicate? → `predicate(...)` + `.withIndex(...)`
6. Need union/interleave/map/filter/flatMap/distinct before pagination? → `select()` composition

### Object `where` (Default)

```ts
const admins = await ctx.orm.query.users.findMany({
  where: {
    role: "admin",
    age: { gt: 18 },
  },
});
```

See [Operators](#operators-1) in API Reference.

Index-compiled: `eq`, `ne`, `in`, `notIn`, `isNull`, `isNotNull`, `between`, `notBetween`, `startsWith`, `like('prefix%')`.
Post-fetch: everything else. Require `.withIndex(...)` in typed API to make scan scope deliberate.

### Relation filters

```ts
// Users with posts
await ctx.orm.query.users.findMany({ where: { posts: true } });

// Users with no posts
await ctx.orm.query.users.findMany({ where: { NOT: { posts: true } } });

// Nested relation filter
await ctx.orm.query.users.findMany({
  where: { posts: { title: { like: "A%" } } },
});
```

### Logical combinators

```ts
await ctx.orm.query.users.findMany({
  where: {
    OR: [{ role: "admin" }, { role: "premium" }],
    NOT: { email: { isNull: true } },
  },
});
```

### Callback `where` (Drizzle Style)

```ts
const admins = await ctx.orm.query.users.findMany({
  where: (users, { and, eq, isNotNull }) =>
    and(eq(users.role, "admin"), isNotNull(users.email)),
});
```

Same planner as object `where` — can use indexes when possible.

### Predicate `where` (Explicit Index Required)

For complex JS logic. Must call `.withIndex(...)` first.

```ts
return await ctx.orm.query.characters
  .withIndex("private", (q) => q.eq("private", false))
  .findMany({
    where: (_characters, { predicate }) =>
      predicate((char) => {
        if (input.category && !char.categories?.includes(input.category))
          return false;
        if (input.minScore && char.score < input.minScore) return false;
        return true;
      }),
    cursor: input.cursor,
    limit: input.limit,
    maxScan: 500,
  });
```

Use `maxScan` (cursor mode only) to cap scan size.

### Mutation `where` (Filter Expressions)

Mutation builders use operator helpers with column builders:

```ts
import { and, eq, gt } from "kitcn/orm";

await ctx.orm
  .update(users)
  .set({ role: "admin" })
  .where(and(eq(users.role, "member"), gt(users.age, 18)));
```

Helpers: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `between`, `notBetween`, `inArray`, `notInArray`, `and`, `or`, `not`, `isNull`, `isNotNull`.

## Full-Text Search

Each search index searches ONE field with optional equality filter fields.

### Search schema

```ts
import {
  convexTable,
  defineSchema,
  searchIndex,
  text,
} from "kitcn/orm";

export const articles = convexTable(
  "articles",
  {
    title: text().notNull(),
    content: text().notNull(),
    author: text().notNull(),
    category: text().notNull(),
  },
  (t) => [
    searchIndex("search_content").on(t.content).filter(t.category, t.author),
    searchIndex("search_title").on(t.title),
  ]
);
```

### Basic search

```ts
const results = await ctx.orm.query.articles.findMany({
  search: { index: "search_content", query: input.query },
  limit: input.limit,
});
```

### Search with filters

```ts
const results = await ctx.orm.query.articles.findMany({
  search: {
    index: "search_content",
    query: input.query,
    filters: {
      category: input.category,
      ...(input.author ? { author: input.author } : {}),
    },
  },
  limit: 20,
});
```

### Paginated search

```ts
return await ctx.orm.query.articles.findMany({
  search: {
    index: "search_content",
    query: input.query,
    filters: input.category ? { category: input.category } : undefined,
  },
  cursor: input.cursor,
  limit: input.limit,
});
```

### Search constraints

- `orderBy` not allowed (Convex relevance ordering)
- Callback `where` not allowed
- Relation `where` not allowed
- Object `where` on base table fields is allowed (post-search filter)
- `with:` allowed for eager loading

## Select Composition (Advanced)

`select()` is the stream-style composition API. Use when you need pre-pagination transforms.

### Union + interleave (merged-stream equivalent)

```ts
return await ctx.orm.query.messages
  .select()
  .union([
    {
      index: {
        name: "by_from_to",
        range: (q) => q.eq("from", input.me).eq("to", input.them),
      },
    },
    {
      index: {
        name: "by_from_to",
        range: (q) => q.eq("from", input.them).eq("to", input.me),
      },
    },
  ])
  .interleaveBy(["createdAt", "id"])
  .filter(async (m) => !m.deletedAt)
  .map(async (m) => ({ ...m, body: m.body.slice(0, 240) }))
  .paginate({
    cursor: input.cursor,
    limit: input.limit,
    maxScan: 500,
  });
```

Per source:

- `index: { name, range }` anchors that source on its own range. It overrides
  the chain-level `.withIndex(...)`; sources that omit it use the chain index.
- `where` filters that source's rows after the read.

`interleaveBy` fields must be the trailing fields each source is already ordered
by, so every field before them has to be pinned with `eq` in that source's
range. Sources may name different indexes when they land on the same trailing
fields — e.g. `by_author_likes` (authorId, numLikes) with `eq("authorId", ...)`
merges with `numLikesAndType` (type, numLikes) with `eq("type", ...)` under
`interleaveBy(["numLikes"])`.

Anchor every source. A shared `.withIndex(...)` plus per-source `where` makes
each source walk the same range and discard the misses after reading them.

### Pre-pagination transforms

```ts
const page = await ctx.orm.query.messages
  .select()
  .filter(async (m) => !m.deletedAt)
  .map(async (m) => ({ ...m, preview: m.body.slice(0, 120) }))
  .distinct({ fields: ["channelId"] })
  .paginate({ cursor: null, limit: 20, maxScan: 500 });
```

### flatMap (relation join)

```ts
const page = await ctx.orm.query.users
  .select()
  .flatMap("posts", { includeParent: true })
  .paginate({ cursor: null, limit: 20 });
```

See [Select Composition Limitations](#select-composition-limitations) in API Reference.

## Pagination Modes

| Mode        | API                                      | Best for                                 |
| ----------- | ---------------------------------------- | ---------------------------------------- |
| Offset      | `findMany({ offset, limit })`            | Page-number UIs, small datasets          |
| Cursor      | `findMany({ cursor, limit })`            | Infinite scroll, large lists             |
| Composition | `select()...paginate({ cursor, limit })` | Stream-like transforms before pagination |
| Key-based   | `findMany({ pageByKey })`                | Deterministic key boundaries             |

### Cursor pagination

```ts
const page1 = await ctx.orm.query.posts.findMany({
  where: { published: true },
  orderBy: { createdAt: "desc" },
  cursor: null,
  limit: 20,
});

// Next page
const page2 = await ctx.orm.query.posts.findMany({
  where: { published: true },
  orderBy: { createdAt: "desc" },
  cursor: page1.continueCursor,
  limit: 20,
});
```

Return: `{ page, continueCursor, isDone, pageStatus?, splitCursor? }`

### Index-union filters

`in`, `notIn`, `ne`, and same-field equality `OR` compile to one index range per value when the field is one an index leads with. Cursor pages come from those ranges as a merged stream, so `orderBy` sorts across the whole result and no scan budget is needed.

```ts
const page = await ctx.orm.query.users.withIndex("by_status").findMany({
  where: { status: { in: ["active", "pending"] } },
  orderBy: { createdAt: "desc" },
  cursor: null,
  limit: 20,
});
```

Falls back to a bounded scan (needs `maxScan`) when the probed index cannot supply the requested `orderBy`, or when the union is wider than 64 ranges.

Without an `orderBy`, an index-union page is in the order of the index it walks — grouped by the probed value — not in creation order.

### Boundary pinning with `endCursor`

```ts
const refreshed = await ctx.orm.query.posts.findMany({
  where: { published: true },
  orderBy: { createdAt: "desc" },
  cursor: null,
  endCursor: page1.continueCursor,
  limit: 20,
});
```

### Key-based paging (`pageByKey`)

```ts
const first = await ctx.orm.query.messages.findMany({
  pageByKey: {
    index: "by_channel",
    order: "asc",
    targetMaxRows: 100,
  },
});

const second = await ctx.orm.query.messages.findMany({
  pageByKey: {
    index: "by_channel",
    order: "asc",
    startKey: first.indexKeys[99],
    targetMaxRows: 100,
  },
});
```

Return: `{ page, indexKeys, hasMore }`

### Combining Search and Complex Filters

Search mode supports `search.filters` plus base-table object `where`. For predicate/relation `where`:

**Option 1: Add more filterFields** (recommended)

```ts
searchIndex("search_content")
  .on(t.content)
  .filter(t.category, t.author, t.status, t.dateGroup);
```

**Option 2: Separate query paths**

```ts
if (input.query) {
  // Search path — limited filtering
  return await ctx.orm.query.articles.findMany({
    search: { index: 'search_content', query: input.query, filters: ... },
    cursor: input.cursor,
    limit: input.limit,
  });
}

// Predicate path — full filtering with explicit .withIndex(...)
return await ctx.orm.query.articles
  .withIndex('by_creation_time')
  .findMany({
    where: (_articles, { predicate }) =>
      predicate((article) => {
        if (input.category && article.category !== input.category) return false;
        if (input.startDate && article.publishedAt < input.startDate) return false;
        return true;
      }),
    cursor: input.cursor,
    limit: input.limit,
  });
```

**Option 3: Post-process** (small datasets only)

```ts
const results = await ctx.orm.query.articles.findMany({
  search: { index: "search_content", query },
  limit: 100,
});
const filtered = results.filter((a) => a.publishedAt >= startDate);
```

### Performance

1. **Index first** — constrain leading index fields. Compound indexes follow prefix rules. Put the `orderBy` column right after the constrained prefix so the scan is already sorted and `limit` bounds the read.
2. **Bound scans** — use `maxScan` for predicate `where` (cursor mode only). `in`/`notIn`/`ne` on an indexed leading field page from index ranges and need no budget. A `.select()` ID-list query with `orderBy` needs a single field that an index leads with.
3. **Limit results** — always use `limit` or cursor pagination.
4. **Cursor stability** — keep same `where`/`orderBy` between page requests.
5. **`allowFullScan`** — non-cursor only. Cursor mode uses `maxScan` instead.
6. **Strict mode** — `strict: true` throws on missing `maxScan` for scan-fallback plans; `strict: false` warns.
7. **Search overhead** — don't over-index. Use `filterFields` to narrow before text matching.

See [Full-Scan Operator Workarounds](#full-scan-operator-workarounds-1) in API Reference.

## Mutations

### Insert

```ts
import { user } from "./schema";

// Basic
await ctx.orm.insert(user).values({ name: "Ada", email: "ada@domain.test" });

// Multi-row
await ctx.orm.insert(user).values([
  { name: "A", email: "a@domain.test" },
  { name: "B", email: "b@domain.test" },
]);

// Returning
const [row] = await ctx.orm
  .insert(user)
  .values({ name: "Ada", email: "ada@domain.test" })
  .returning(); // all fields

const [partial] = await ctx.orm
  .insert(user)
  .values({ name: "Ada", email: "ada@domain.test" })
  .returning({ id: user.id, email: user.email });

// Upsert: onConflictDoUpdate
await ctx.orm
  .insert(user)
  .values({ email: "ada@domain.test", name: "Ada" })
  .onConflictDoUpdate({ target: user.email, set: { name: "Ada Lovelace" } });

// Skip on conflict
await ctx.orm
  .insert(user)
  .values({ email: "ada@domain.test", name: "Ada" })
  .onConflictDoNothing({ target: user.email });
```

### Update

```ts
import { eq } from "kitcn/orm";
import { user } from "./schema";

// Basic
await ctx.orm
  .update(user)
  .set({ name: "Updated" })
  .where(eq(user.id, input.id));

// Returning
const [updated] = await ctx.orm
  .update(user)
  .set({ name: "New" })
  .where(eq(user.id, input.id))
  .returning();

// Unset a field
import { unsetToken } from "kitcn/orm";
await ctx.orm
  .update(user)
  .set({ nickname: unsetToken })
  .where(eq(user.id, input.id));

// Update without .where() throws — use .allowFullScan() to opt in
await ctx.orm.update(user).set({ role: "member" }).allowFullScan();
```

### Delete

```ts
await ctx.orm.delete(user).where(eq(user.id, input.id));

// Returning
const [deleted] = await ctx.orm
  .delete(user)
  .where(eq(user.id, input.id))
  .returning();

// Delete all (use with care)
await ctx.orm.delete(user).allowFullScan();
```

### Delete Modes

```ts
// Table-level default
import { deletion } from "kitcn/orm";
const user = convexTable(
  "user",
  {
    slug: text().notNull(),
    deletionTime: integer(),
  },
  () => [deletion("scheduled", { delayMs: 60_000 })]
);

// Per-query overrides
await ctx.orm.delete(user).where(eq(user.id, id)).hard(); // immediate
await ctx.orm.delete(user).where(eq(user.id, id)).soft(); // mark deleted
await ctx.orm
  .delete(user)
  .where(eq(user.id, id))
  .scheduled({ delayMs: 60_000 });

// Cancel scheduled delete: clear/change deletionTime before worker runs
```

### Paginated Mutations

For large workloads exceeding safety limits:

```ts
// Requires index on filtered field: index('by_role').on(t.role)
const page1 = await ctx.orm
  .update(user)
  .set({ role: "member" })
  .where(eq(user.role, "pending"))
  .paginate({ cursor: null, limit: 100 });
// Returns: { continueCursor, isDone, numAffected }
```

### Async Batched Mutations

Async is the default — first batch runs inline, remaining auto-scheduled. Customize per call:

```ts
await ctx.orm
  .update(user)
  .set({ role: "member" })
  .where(eq(user.role, "pending"))
  .execute({ batchSize: 200, delayMs: 0 });
```

To force sync (all rows in one transaction): `.execute({ mode: 'sync' })` or `defineSchema(tables, { defaults: { mutationExecutionMode: "sync" } })`.

## RLS (Row-Level Security)

### Define policies

```ts
import { convexTable, rlsPolicy, text, id, eq } from "kitcn/orm";

export const secrets = convexTable.withRLS(
  "secrets",
  {
    value: text().notNull(),
    ownerId: id("users").notNull(),
  },
  (t) => [
    rlsPolicy("read_own", {
      for: "select",
      using: (ctx) => eq(t.ownerId, ctx.viewerId),
    }),
    rlsPolicy("insert_own", {
      for: "insert",
      withCheck: (ctx) => eq(t.ownerId, ctx.viewerId),
    }),
    rlsPolicy("update_own", {
      for: "update",
      using: (ctx) => eq(t.ownerId, ctx.viewerId),
      withCheck: (ctx) => eq(t.ownerId, ctx.viewerId),
    }),
    rlsPolicy("delete_own", {
      for: "delete",
      using: (ctx) => eq(t.ownerId, ctx.viewerId),
    }),
  ]
);
```

### Policy operations

| Operation | Clause                | When                            |
| --------- | --------------------- | ------------------------------- |
| `select`  | `using`               | Filters rows after fetch        |
| `insert`  | `withCheck`           | Validates new rows before write |
| `update`  | `using` + `withCheck` | Filters existing, validates new |
| `delete`  | `using`               | Filters rows before delete      |

### Bypass RLS

```ts
await ctx.orm.skipRules.query.secrets.findMany();
```

### Roles

```ts
import { rlsRole } from "kitcn/orm";
const admin = rlsRole("admin");
rlsPolicy("admin_only", {
  for: "select",
  to: admin,
  using: (ctx, t) => eq(t.ownerId, ctx.viewerId),
});

// roleResolver is required by any policy scoped to a named role
const ormDb = orm.db(ctx, {
  rls: { ctx, roleResolver: (ctx) => ctx.roles ?? [] },
});
```

**Important:** a policy scoped to a named role throws `RLS_ROLE_RESOLVER_REQUIRED` when no `roleResolver` is configured, instead of granting the policy to every caller. Queries and mutations validate this per table before reading rows, so an empty table throws too. The SQL pseudo-roles `public`, `current_user`, `current_role`, and `session_user` apply to everyone and need no resolver.

### Null handling

Policy expressions use SQL null semantics: a comparison against a missing document field or a missing context value is unknown, and unknown denies. An unauthenticated caller (`ctx.viewerId` is `undefined`) never matches rows whose column is unset. Use `isNull` to match absent columns on purpose.

### Relations

`with` enforces the related table's policies, and for many-to-many relations the junction table's policies as well, so a caller only traverses links it may read.

**Important:** `ctx.db` bypasses RLS. Only `ctx.orm` enforces policies. FK cascade fan-out also bypasses child-table RLS.

## Triggers

Schema-level hooks live on the default schema export via `.triggers(...)`. Trigger definitions are schema-level only; `convexTable(..., extraConfig)` no longer accepts trigger callbacks.

```ts
export default defineSchema({ comments, posts })
  .relations((r) => ({
    comments: {
      post: r.one.posts({ from: r.comments.postId, to: r.posts.id }),
    },
    posts: {
      comments: r.many.comments(),
    },
  }))
  .triggers({
  comments: {
    create: {
      after: async (doc, ctx) => {
        await ctx.orm
          .update(posts)
          .set({ lastCommentAt: new Date() })
          .where(eq(posts.id, doc.postId));
      },
    },
    delete: {
      after: async (doc, ctx) => {
        await ctx.orm
          .update(posts)
          .set({ lastCommentAt: new Date() })
          .where(eq(posts.id, doc.postId));
      },
    },
  },
});
```

### change payload

```ts
export default defineSchema({ comments })
  .relations(() => ({
    comments: {},
  }))
  .triggers({
  comments: {
    change: async (change, ctx) => {
      change.id; // always present
      change.operation; // 'insert' | 'update' | 'delete'
      change.oldDoc; // null on insert
      change.newDoc; // null on delete
    },
  },
});
```

### Aggregate triggers

```ts
import { aggregatePostLikes } from "./aggregates";

export default defineSchema({ postLikes })
  .relations(() => ({
    postLikes: {},
  }))
  .triggers({
  postLikes: {
    change: aggregatePostLikes.trigger,
  },
});
```

### `withoutTriggers`

Bypass all trigger hooks for a block of operations (bulk resets, migrations, seeding):

```ts
await ctx.orm.withoutTriggers(async (orm) => {
  await orm.delete(todosTable).allowFullScan();
});
```

### Trigger safety checklist

1. Idempotent logic.
2. Bounded writes (no full-scan loops).
3. No recursive ping-pong between tables.
4. Expensive work → keep triggers thin; enqueue background work from procedure layer via `caller.schedule.*`.
5. Auth checks in procedure layer; triggers focus on data invariants.

### Auth triggers vs DB triggers

Auth triggers (`triggers: { user, session }` in `defineAuth`) are separate from DB triggers. For DB-level side effects, use schema triggers. When your schema exports `relations`, generated runtime automatically wires ORM context for auth handlers.

## Complete Schema Template

```ts
import {
  boolean,
  check,
  convexTable,
  defineRelations,
  defineSchema,
  deletion,
  eq,
  id,
  index,
  integer,
  json,
  searchIndex,
  text,
  textEnum,
  timestamp,
  uniqueIndex,
} from "kitcn/orm";

export const user = convexTable("user", {
  name: text().notNull(),
  email: text().notNull().unique(),
  role: textEnum(["admin", "user"] as const)
    .notNull()
    .default("user"),
  plan: text(),
  banned: boolean(),
  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: timestamp()
    .notNull()
    .defaultNow()
    .$onUpdateFn(() => new Date()),
  metadata: json<Record<string, unknown>>(),
});

export const post = convexTable(
  "post",
  {
    title: text().notNull(),
    content: text().notNull(),
    published: boolean().notNull().default(false),
    authorId: id("user")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    deletionTime: integer(),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (t) => [
    index("by_author").on(t.authorId),
    index("by_author_created").on(t.authorId, t.createdAt),
    searchIndex("search_title").on(t.title).filter(t.authorId),
    deletion("scheduled", { delayMs: 60_000 }),
  ]
);

const tables = { user, post };
export default defineSchema(tables, {
  strict: false,
})
  .relations((r) => ({
    user: {
      posts: r.many.post(),
    },
    post: {
      author: r.one.user({
        from: r.post.authorId,
        to: r.user.id,
        optional: false,
      }),
    },
  }))
  .triggers({
    post: {
      create: {
        after: async (doc) => {
          console.log("post created", doc._id);
        },
      },
    },
  });
```

## Related References

- Aggregates: `./aggregates.md`
- Migrations: `./migrations.md`
- Scheduling: `./scheduling.md`
- HTTP: `./http.md`
- React/RSC: `./react.md`

## API Reference

### Column Types

All come from `kitcn/orm`: `text`, `textEnum`, `integer`, `boolean`,
`bigint`, `timestamp`, `date`, `id`, `vector`, `bytes`, `unionOf`, `objectOf`,
`json`, and `custom`.

Key type notes: `timestamp()` stores Convex numbers and exposes `Date`;
`timestamp({ mode: "string" })` exposes `string`; `date()` is YYYY-MM-DD unless
`{ mode: "date" }`; `json<T>()` is type-only over `v.any()`; `custom(...)`
keeps the provided Convex validator.

### Operators

- Comparison: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`
- Range/set/null: `between`, `notBetween`, `in`, `notIn`, `isNull`, `isNotNull`
- Logical: `AND`, `OR`, `NOT`
- Post-fetch string/array: `like`, `ilike`, `notLike`, `notIlike`,
  `startsWith`, `endsWith`, `contains`, `arrayContains`, `arrayContained`,
  `arrayOverlaps`

### Select Composition Limitations

Do not combine `select()` with `search`, `vectorSearch`, `offset`, `with`,
`extras`, or `columns`.

### Full-Scan Operator Workarounds

- Array membership/overlap: use an inverted or join table keyed by element.
- `contains`: use `withSearchIndex` or tokenized denormalized fields.
- `endsWith`: store a reversed column and query with `startsWith`.
- `ilike` / `notIlike`: lowercase a query column and use prefix/like filters.
- `notLike` and general `NOT`: rewrite to positive indexed predicates and cap
  fallback scans with `maxScan`.
