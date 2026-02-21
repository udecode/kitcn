# Filters, Search & Composition

Canonical runtime rules:

- Pre-filter by indexes first
- Keep expensive post-fetch logic bounded
- Explicitly document search + pagination limitations

## Filtering + Pagination Decision Table

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

## Object `where` (Default)

```ts
const admins = await ctx.orm.query.users.findMany({
  where: {
    role: "admin",
    age: { gt: 18 },
  },
});
```

### Operators

| Category            | Operators                                                                    |
| ------------------- | ---------------------------------------------------------------------------- |
| Comparison          | `eq`, `ne`, `gt`, `gte`, `lt`, `lte`                                         |
| Range               | `between` (inclusive), `notBetween` (strict outside)                         |
| Set                 | `in`, `notIn`                                                                |
| Null                | `isNull`, `isNotNull`                                                        |
| Logical             | `AND`, `OR`, `NOT`                                                           |
| String (post-fetch) | `like`, `ilike`, `notLike`, `notIlike`, `startsWith`, `endsWith`, `contains` |
| Array (post-fetch)  | `arrayContains`, `arrayContained`, `arrayOverlaps`                           |

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

## Callback `where` (Drizzle Style)

```ts
const admins = await ctx.orm.query.users.findMany({
  where: (users, { and, eq, isNotNull }) =>
    and(eq(users.role, "admin"), isNotNull(users.email)),
});
```

Same planner as object `where` — can use indexes when possible.

## Predicate `where` (Explicit Index Required)

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

## Mutation `where` (Filter Expressions)

Mutation builders use operator helpers with column builders:

```ts
import { and, eq, gt } from "better-convex/orm";

await ctx.orm
  .update(users)
  .set({ role: "admin" })
  .where(and(eq(users.role, "member"), gt(users.age, 18)));
```

Helpers: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `between`, `notBetween`, `inArray`, `notInArray`, `and`, `or`, `not`, `isNull`, `isNotNull`.

## Full-Text Search

Each search index searches ONE field with optional equality filter fields.

### Schema

```ts
import {
  convexTable,
  defineSchema,
  searchIndex,
  text,
} from "better-convex/orm";

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
  .withIndex("by_from_to")
  .select()
  .union([
    { where: { from: input.me, to: input.them } },
    { where: { from: input.them, to: input.me } },
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

### Union with index ranges

```ts
const page = await ctx.orm.query.messages
  .select()
  .union([
    {
      index: {
        name: "by_from_to",
        range: (q) => q.eq("from", me).eq("to", them),
      },
    },
    {
      index: {
        name: "by_from_to",
        range: (q) => q.eq("from", them).eq("to", me),
      },
    },
  ])
  .interleaveBy(["createdAt", "id"])
  .paginate({ cursor: null, limit: 20 });
```

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

### Composition limitations

| Combination               | Status        |
| ------------------------- | ------------- |
| `select() + search`       | Not supported |
| `select() + vectorSearch` | Not supported |
| `select() + offset`       | Not supported |
| `select() + with`         | Not supported |
| `select() + extras`       | Not supported |
| `select() + columns`      | Not supported |

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

## Combining Search and Complex Filters

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

## Performance

1. **Index first** — constrain leading index fields. Compound indexes follow prefix rules.
2. **Bound scans** — use `maxScan` for predicate `where` (cursor mode only).
3. **Limit results** — always use `limit` or cursor pagination.
4. **Cursor stability** — keep same `where`/`orderBy` between page requests.
5. **`allowFullScan`** — non-cursor only. Cursor mode uses `maxScan` instead.
6. **Strict mode** — `strict: true` throws on missing `maxScan` for scan-fallback plans; `strict: false` warns.
7. **Search overhead** — don't over-index. Use `filterFields` to narrow before text matching.

## Full-Scan Operator Workarounds

| Operator                           | Scalable workaround                                |
| ---------------------------------- | -------------------------------------------------- |
| `arrayContains/Contained/Overlaps` | Inverted/join table keyed by element               |
| `contains`                         | `withSearchIndex` or tokenized denormalized field  |
| `endsWith`                         | Store reversed column, use `startsWith`            |
| `ilike`/`notIlike`                 | Lowercase column + `startsWith`/`like('prefix%')`  |
| `notLike`                          | Indexed positive pre-filter + `notLike` post-fetch |
| `NOT` (general)                    | Rewrite to positive predicates; cap with `maxScan` |
