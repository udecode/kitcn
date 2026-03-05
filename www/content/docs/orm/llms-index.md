---
title: LLMs Index
description: Structured index of ORM documentation for AI assistants and code completion tools
---

# ORM Documentation Index

This file provides a structured index of the ORM documentation for AI assistants and code completion tools.

## Core Concepts

**Getting Started:**

- `/docs/orm` - Overview, installation, and value proposition
- `/docs/quickstart#orm-setup` - ORM setup section in the main quickstart

**Schema Definition:**

- `/docs/orm/schema` - Table definitions, field types, indexes, and type inference
- `/docs/orm/schema/column-types` - Column builders and TypeScript type mapping
- `/docs/orm/schema/indexes-constraints` - Indexes, unique constraints, and foreign keys

**Relations:**

- `/docs/orm/schema/relations` - One‑to‑one, one‑to‑many, many‑to‑many relations, polymorphic associations

**Querying Data:**

- `/docs/orm/queries` - findMany(), findFirst(), cursor pagination (`cursor` + `limit`), filters, orderBy
- `/docs/orm/queries/operators` - All supported `where` operators (query + mutation)

**Mutations:**

- `/docs/orm/mutations` - insert(), update(), delete(), returning(), onConflictDoUpdate()
- `/docs/orm/mutations/insert` - insert() builder details
- `/docs/orm/mutations/update` - update() builder details
- `/docs/orm/mutations/delete` - delete() builder details

**Row-Level Security:**

- `/docs/orm/rls` - rlsPolicy, rlsRole, and runtime enforcement

## Data Migrations

- `/docs/orm/migrations` - Built-in online data migrations with `defineMigration`, CLI commands (`create`, `up`, `down`, `status`, `cancel`), deploy integration, and drift safety

## Migration & Comparison

- `/docs/orm/migrate-from-convex` - Native Convex (`ctx.db`) → ORM migration guide
- `/docs/orm/migrate-from-ents` - Convex Ents → ORM migration guide
- `/docs/comparison/drizzle` - Drizzle v1 mapping and migration guidance

## Reference

- `/docs/orm/api-reference` - Full API surface and TypeScript helpers
- `/docs/comparison/drizzle` - Differences, limitations, and performance guidance

## Quick Reference

### Key APIs

**Schema:**

```ts
convexTable(name, columns)
discriminator({ variants, as? })  // schema-first discriminated union column
defineSchema(tables, { defaults?: { defaultLimit?, mutationBatchSize?, mutationMaxRows? } })
defineRelations(schema, callback)
extractRelationsConfig(schema)
```

**Queries:**

```ts
await ctx.orm.query.table.findMany({
  where: { field: value },
  orderBy: { createdAt: "desc" },
  limit: 10,
  offset: 0,
});

await ctx.orm.query.table.findFirst({
  where: { field: value },
});

await ctx.orm.query.table.findMany({
  where: { active: true },
  cursor: null,
  limit: 20,
});

await ctx.orm.query.table.withIndex("by_status").findMany({
  // Predicate where requires an explicit index plan (no allowFullScan fallback)
  where: (_table, { predicate }) => predicate((row) => row.status === "active"),
  cursor: null,
  limit: 20,
  maxScan: 2000,
});
```

**Mutations:**

```ts
await ctx.orm.insert(table).values(data);
await ctx.orm.update(table).set(data).where(eq(table.id, id));
await ctx.orm.delete(table).where(eq(table.id, id));
// Full-scan opt-in (only if no index on email)
await ctx.orm.update(table).set(data).where(eq(table.email, email)); // indexed
await ctx.orm
  .update(table)
  .set(data)
  .where(eq(table.email, email))
  .allowFullScan();
await ctx.orm.delete(table).where(eq(table.email, email)); // indexed
await ctx.orm.delete(table).where(eq(table.email, email)).allowFullScan();
```

**RLS:**

```ts
const secret = convexTable.withRLS(
  "secrets",
  {
    /* ... */
  },
  (t) => [
    rlsPolicy("read_own", {
      for: "select",
      using: (ctx) => eq(t.ownerId, ctx.viewerId),
    }),
  ]
);
```

**Object `where` operators:**

```ts
{ field: value }
{ field: { ne: value } }
{ field: { gt: value } }
{ field: { gte: value } }
{ field: { lt: value } }
{ field: { lte: value } }
{ field: { between: [min, max] } }
{ field: { notBetween: [min, max] } }
{ field: { in: [a, b] } }
{ field: { notIn: [a, b] } }
{ field: { isNull: true } }
{ field: { isNotNull: true } }
{ AND: [ ... ] }
{ OR: [ ... ] }
{ NOT: { ... } }
```

**Mutation filter helpers:**

```ts
eq(field, value);
ne(field, value);
gt(field, value);
gte(field, value);
lt(field, value);
lte(field, value);
between(field, min, max);
notBetween(field, min, max);
inArray(field, values);
notInArray(field, values);
and(...filters);
or(...filters);
not(filter);
isNull(field);
isNotNull(field);
```

### Feature Overview

**Core features:**

- Schema definition (convexTable, column builders)
- Relations definition and loading (one, many, with)
- Query operations (findMany, findFirst, cursor pagination)
- Count operations (`db.query.*.count()`, windowed `count({ orderBy, skip, take, cursor })`)
- Prisma-style aggregate operations (`db.query.*.aggregate({ _count/_sum/_avg/_min/_max })`)
- GroupBy operations (`db.query.*.groupBy({ by, _count/_sum/_avg/_min/_max })`)
- Where filtering (object filters)
- Pagination (limit, offset)
- Order by (multi‑field, index‑aware first sort)
- Type inference
- Column selection (post‑fetch)
- String operators (post‑fetch)
- Mutations (insert, update, delete, returning)
- Schema-first polymorphic unions via `discriminator({ variants, as? })` in `convexTable(...)` (reads synthesize typed discriminated union at alias; no query config needed)
- Distinct via select pipeline (`.select().distinct({ fields: ['field'] })`)
- Ranked access via `/docs/orm/queries/aggregates` (`rankIndex` + `rank()` for leaderboards, random access, sorted pagination)

**Unavailable in Convex:**

- Raw SQL queries
- SQL joins
- SQL `having` and SQL window functions (`groupBy` is supported with finite constraints)

## Error Messages & Solutions

- `where is not a function` → Use object form: `where: { field: value }`
- `Property 'query' does not exist` → Ensure ORM is attached as `ctx.orm`
- `Type error: missing required field` → Check `.notNull()` in schema
- `findUnique is not a function` → Use `findFirst` with `where`
- `COUNT_NOT_INDEXED` → declare matching `aggregateIndex(...).on(...)` and run backfill until READY
- `COUNT_FILTER_UNSUPPORTED` → count supports `eq`/`in`/`isNull`/range + `AND`, plus finite safe `OR` rewrite in v1
- `COUNT_INDEX_BUILDING` → run `aggregateBackfill`, then check `aggregateBackfillStatus` until READY
- `aggregateBackfill` says rebuild required (or CLI tells you to run rebuild) → key shape changed; run `better-convex aggregate rebuild`
- `COUNT_RLS_UNSUPPORTED` → count is disabled in RLS-restricted contexts in v1
- `AGGREGATE_NOT_INDEXED` → declare matching `aggregateIndex(...).on(...)` metric coverage and run backfill until READY
- `AGGREGATE_FILTER_UNSUPPORTED` → `aggregate(...)` supports `eq`/`in`/`isNull`/range + `AND`, plus finite safe `OR` rewrite in v1
- `AGGREGATE_INDEX_BUILDING` → run `aggregateBackfill` and wait for `READY`
- `AGGREGATE_RLS_UNSUPPORTED` → `aggregate(...)` is disabled in RLS-restricted contexts in v1
- `'include' does not exist` → Use `with` instead of `include`
- `findMany() requires explicit sizing` → Add `limit`, use cursor pagination (`cursor` + `limit`), set schema `defaultLimit`, or opt in with `allowFullScan`
- `.withIndex(...) required` → `predicate` `where` and typed post-fetch operators need explicit index selection
- `matched more than mutationMaxRows` → Narrow update/delete filter or raise `defaults.mutationMaxRows`
- `update/delete pagination does not support multi-probe filters yet` → Rewrite to a single-range index filter, or run non-paginated mode with row cap

**Index-compiled operators (when indexed):**

- `eq`, `ne`, `gt`, `gte`, `lt`, `lte`
- `between`, `notBetween`
- `in`, `notIn`
- `isNull`, `isNotNull`
- `startsWith`
- `like('prefix%')`
- same-field equality `OR` branches

**Post-fetch operators (typed API requires explicit `.withIndex(...)`):**

- `arrayContains`, `arrayContained`, `arrayOverlaps` (use inverted/join tables)
- `contains` (use search index or tokenized denormalized field)
- `endsWith` (use reversed-string indexed column + `startsWith`)
- `ilike`, `notIlike` (use normalized lowercase indexed field)
- `notLike` (use indexed pre-filter then post-filter)
- predicate `where` and `RAW` (narrow with indexed pre-filters first)
