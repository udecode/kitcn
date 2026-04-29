# Aggregates

> Prerequisites: `setup/server.md`

Canonical runtime rules:

- Use ORM scalar metrics (`aggregateIndex` + `count()`/`aggregate()`) for counts, sums, averages
- Use `_count` relation loading instead of per-row `.count()` fanout loops
- Use `rankIndex` + `rank()` for rankings, random access, sorted pagination
- `aggregateIndex` and `rankIndex` backfill automatically via `kitcn dev` — no manual trigger wiring needed

## ORM Scalar Metrics

### `aggregateIndex` Schema Declaration

Declare count/aggregate coverage in table definitions:

```ts
const orders = convexTable(
  "orders",
  { orgId: text(), amount: integer(), score: integer() },
  (t) => [
    aggregateIndex("by_org")
      .on(t.orgId)
      .sum(t.amount)
      .avg(t.amount)
      .min(t.score)
      .max(t.score),
    aggregateIndex("all_metrics").all().sum(t.amount).count(t.orgId),
  ]
);
```

- `.on(fields)` — filter key fields (namespaced counts)
- `.all()` — unfiltered global metrics
- `.count(field)` / `.sum(field)` / `.avg(field)` / `.min(field)` / `.max(field)` — chainable metrics

After deploying, CLI runs `aggregateBackfill` automatically. Wait for `aggregateBackfillStatus` to report `READY`.

### `count()` — O(1) No-Scan Counts

```ts
const total = await ctx.orm.query.todos.count({ where: { projectId } });
```

Unfiltered `count()` uses native Convex count syscall (no aggregateIndex required).
Filtered `count()` accepts `eq`, `in`, `isNull`, `gt`, `gte`, `lt`, `lte`, conjunction via `AND`, and bounded finite DNF `OR` when every branch is index-plannable on one `aggregateIndex`. Requires matching `aggregateIndex`.

Windowed count: `count({ where, orderBy, skip, take, cursor })` counts rows within a window.

- `skip`/`take` for pagination windows, `cursor` for "after this value" counting (requires `orderBy`, single field in v1)
- `count({ select: { field: true } })` with `skip`/`take`/`cursor` throws `COUNT_FILTER_UNSUPPORTED` in v1

| Error                      | Cause                                        |
| -------------------------- | -------------------------------------------- |
| `COUNT_NOT_INDEXED`        | No `aggregateIndex` matches the filter shape |
| `COUNT_FILTER_UNSUPPORTED` | Uses unsupported operators                   |
| `COUNT_INDEX_BUILDING`     | Index still backfilling                      |
| `COUNT_RLS_UNSUPPORTED`    | Called in RLS-restricted context             |

### `aggregate()` — Prisma-style Aggregate Blocks

```ts
const stats = await ctx.orm.query.orders.aggregate({
  where: { orgId: "org-1" },
  _count: { _all: true },
  _sum: { amount: true },
  _avg: { amount: true },
});
```

Same filter rules as `count()`. Supports bounded finite DNF `OR` when every branch is index-plannable and resolves to one `aggregateIndex`.
Windowed aggregate:

- `orderBy` + `cursor` works for `_count/_sum/_avg/_min/_max`
- `skip`/`take` are `_count`-only in v1 (`AGGREGATE_ARGS_UNSUPPORTED` for non-count metrics) because metric window skip/take is not bucket-computable under strict no-scan

### `groupBy()` — Finite Indexed Groups Only

`groupBy()` is supported with strict no-scan bounds:

- `by` is required
- every `by` field must be constrained in `where` via `eq`/`in`/`isNull`
- `orderBy` supports `by` fields and selected metric fields
- `skip`/`take`/`cursor` require explicit `orderBy`
- `having` supports conjunction filters on `by` fields and selected metrics
- `OR`/`NOT` in `having` are unsupported (`AGGREGATE_FILTER_UNSUPPORTED`)

```ts
const rows = await ctx.orm.query.orders.groupBy({
  by: ["orgId"],
  where: { orgId: { in: ["org-1", "org-2"] }, status: "paid" },
  _count: true,
  _sum: { amount: true },
  orderBy: [{ _count: "desc" }, { _sum: { amount: "desc" } }],
  having: { _count: { gt: 0 } },
  take: 10,
});
```

#### When to use `groupBy` vs alternatives

Use `groupBy` when you need **multi-bucket metrics in one call** where each bucket is a distinct field value:

| Pattern                                                    | Use instead                               | Why                                   |
| ---------------------------------------------------------- | ----------------------------------------- | ------------------------------------- |
| Multiple `.count()` calls with different filter values     | `groupBy({ by, _count })`                 | One call replaces N sequential counts |
| `findMany` + manual Map/reduce grouping in JS              | `groupBy({ by, _count, _sum })`           | O(log n) per bucket vs O(n) scan      |
| Sampling + estimation (e.g. "count admins from 100 users") | `groupBy({ by: ['role'], _count })`       | Exact counts, no estimation           |
| Dashboard stats with breakdowns by category                | `groupBy({ by: ['status'], _sum, _avg })` | Single query for full breakdown       |

Delta from parity: Unlike Prisma, `groupBy` requires every `by` field to be finite-constrained in `where` (`eq`/`in`/`isNull`) and backed by an `aggregateIndex`. Unconstrained `by` fields throw `AGGREGATE_ARGS_UNSUPPORTED`.

### `findMany({ distinct })` (Unsupported)

`findMany({ distinct })` is not available to keep strict no-scan/index-backed guarantees.
If you need deduplication, use select-pipeline distinct:

```ts
const result = await ctx.orm.query.todos
  .select()
  .distinct({ fields: ["status"] })
  .paginate({ cursor: null, limit: 100 });
```

### Relation `_count` — Best Practice

**Always prefer `_count` relation loading over per-row `.count()` fanout loops.** Single query with embedded count vs N+1 separate count queries.

```ts
// ❌ BAD: N+1 count queries (one per tag)
const tags = await ctx.orm.query.tags.findMany({
  where: { createdBy: ctx.userId },
});
const usageCounts = await Promise.all(
  tags.map((tag) => ctx.orm.query.todoTags.count({ where: { tagId: tag.id } }))
);
return tags.map((tag, idx) => ({
  ...tag,
  usageCount: usageCounts[idx] ?? 0,
}));

// ✅ GOOD: Single query with embedded _count
const tags = await ctx.orm.query.tags.findMany({
  where: { createdBy: ctx.userId },
  with: {
    _count: {
      todos: true,
    },
  },
});
return tags.map((tag) => ({
  ...tag,
  usageCount: tag._count?.todos ?? 0,
}));
```

Filtered `_count`:

```ts
const users = await ctx.orm.query.user.findMany({
  with: {
    _count: {
      todos: {
        where: { deletionTime: { isNull: true } },
      },
    },
  },
});
const usersWithTodos = users.filter(
  (user) => (user._count?.todos ?? 0) > 0
).length;
```

Through-filtered `_count` works for `through()` relations:

```ts
const users = await ctx.orm.query.users.findMany({
  with: {
    _count: {
      memberTeams: { where: { name: "Core" } },
    },
  },
});
// users[0]._count?.memberTeams => 1
```

Works on `findMany`, `findFirst`, `findFirstOrThrow`. Access via `row._count?.relation ?? 0`.

### Mutation `returning({ _count })`

```ts
const [user] = await ctx.orm
  .insert(usersTable)
  .values({ name: "Alice" })
  .returning({
    id: usersTable.id,
    _count: { posts: true },
  });
// user._count?.posts => 0

const [updated] = await ctx.orm
  .update(usersTable)
  .set({ name: "Bob" })
  .where(eq(usersTable.id, userId))
  .returning({
    id: usersTable.id,
    _count: { posts: { where: { status: "published" } } },
  });
// updated._count?.posts => 2
```

Works on `insert`, `update`, and `delete`.

### `_sum` Nullability

`_sum` returns `null` for empty sets or when all field values are `null` (Prisma-compatible):

```ts
// Empty table or all-null amounts → { _sum: { amount: null } }
// Non-empty with values → { _sum: { amount: 1500 } }
```

## Ranked Access With `rankIndex`

For **rankings**, **random access**, and **sorted pagination**. ORM-native, no external dependency, backfills automatically.

| Operation                            | Description                 |
| ------------------------------------ | --------------------------- |
| `rank().indexOf({ id })`             | Position/rank of a document |
| `rank().at(offset)`                  | Row at a specific position  |
| `rank().paginate({ cursor, limit })` | Ordered page traversal      |
| `rank().max()` / `rank().min()`      | Extremes by rank order      |
| `rank().random()`                    | Random row from ranked set  |
| `rank().count()` / `rank().sum()`    | Ranked-set count/sum        |

### Declaring `rankIndex`

```ts
const scores = convexTable(
  "scores",
  {
    gameId: text().notNull(),
    score: integer().notNull(),
    createdAt: timestamp().notNull(),
    userId: text().notNull(),
  },
  (t) => [
    rankIndex("leaderboard")
      .partitionBy(t.gameId)
      .orderBy({ column: t.score, direction: "desc" })
      .orderBy({ column: t.createdAt, direction: "asc" })
      .sum(t.score),

    rankIndex("global_leaderboard")
      .all()
      .orderBy({ column: t.score, direction: "desc" }),
  ]
);
```

`partitionBy(...)` isolates ranked sets per unique partition value. `.all()` for global (unpartitioned).

### Ranked Queries

```ts
const leaderboard = ctx.orm.query.scores.rank("leaderboard", {
  where: { gameId },
});

const top10 = await leaderboard.paginate({ cursor: null, limit: 10 });
const userRank = await leaderboard.indexOf({ id: userId });
const thirdPlace = await leaderboard.at(2);
const best = await leaderboard.max();
const worst = await leaderboard.min();
const randomPick = await leaderboard.random();
const total = await leaderboard.count();
const totalScore = await leaderboard.sum();
```

### Leaderboard + User Stats

```ts
const lb = ctx.orm.query.scores.rank("leaderboard", {
  where: { gameId: input.gameId },
});
const globalRank = await lb.indexOf({ id: ctx.userId });
const totalPlayers = await lb.count();
```

### Best Practices

```ts
// ✅ Partition per tenant to isolate write hot spots
rankIndex("tenant_scores")
  .partitionBy(t.tenantId)
  .orderBy({ column: t.score, direction: "desc" });

// ❌ Global rank can create cross-tenant contention
rankIndex("global_scores")
  .all()
  .orderBy({ column: t.score, direction: "desc" });
```

## Repair

If rank or aggregate state gets out of sync:

```bash
kitcn aggregate rebuild
```

## When to Use

| Need                   | Use                                                             |
| ---------------------- | --------------------------------------------------------------- |
| Counts, sums, averages | ORM Scalar Metrics (`aggregateIndex` + `count()`/`aggregate()`) |
| Relation counts        | `_count` relation loading (`with: { _count: { ... } }`)         |
| Rankings, leaderboards | `rankIndex` + `rank()` (`indexOf`, `at`, `paginate`)            |
| Random document access | `rankIndex` + `rank()` (`random()`, `at()`)                     |
| Sorted pagination      | `rankIndex` + `rank()` (`paginate({ cursor, limit })`)          |
| Non-table data         | Model as a table, then use `aggregateIndex` or `rankIndex`      |

## Limitations

| Consideration    | Guideline                                              |
| ---------------- | ------------------------------------------------------ |
| Update frequency | High-frequency updates to nearby keys cause contention |
| Key size         | Keep composite keys reasonable (3-4 components max)    |
| Namespace count  | Each namespace has overhead                            |
| Query patterns   | Design keys for actual needs                           |

## API Reference

### Prisma Parity Matrix (No-Scan)

| Prisma feature                                              | Status    | Notes                                                                                                                                 |
| ----------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `aggregate({ _count/_sum/_avg/_min/_max, where })`          | Supported | Bucket-backed, no base-table scan fallback                                                                                            |
| `aggregate({ _sum })` nullability                           | Supported | Returns `null` for empty/all-null sets                                                                                                |
| `groupBy({ by, where, _count/_sum/_avg/_min/_max })`        | Supported | `by` fields must be finite-constrained (`eq/in/isNull`) in `where`                                                                    |
| `groupBy({ having/orderBy/skip/take/cursor })`              | Partial   | Supported for finite index-bounded groups with conjunction-only `having`                                                              |
| `count()`                                                   | Supported | Native Convex count syscall                                                                                                           |
| `count({ where })`                                          | Supported | Indexed scalar subset                                                                                                                 |
| `count({ where, select: { _all, field } })`                 | Supported | Field counts require `aggregateIndex.count(field)`                                                                                    |
| `findMany({ with: { _count: { relation: true } } })`        | Supported | Indexed relation counts                                                                                                               |
| `findMany({ with: { _count: { relation: { where } } } })`   | Supported | Direct relation scalar filters                                                                                                        |
| `aggregate({ orderBy/take/skip/cursor })`                   | Partial   | `orderBy/cursor` supported; `skip/take` is `_count`-only in v1                                                                        |
| Advanced aggregate/count filters (`OR/NOT/string/relation`) | Partial   | Bounded finite DNF `OR` rewrite is supported when branches resolve to one `aggregateIndex`; `NOT`/string/relation filters are blocked |
| Relation `_count` nested relation filter                    | Blocked   | `RELATION_COUNT_FILTER_UNSUPPORTED`                                                                                                   |
| `findMany({ distinct })`                                    | Blocked   | Not available under strict no-scan contract. Use `select().distinct({ fields })`                                                      |
| Relation `_count` filtered through relation                 | Supported | Indexed `through()` relation filters                                                                                                  |
| Mutation return `_count` parity                             | Supported | `returning({ _count })` on insert/update/delete                                                                                       |
