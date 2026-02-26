# Aggregates

> Prerequisites: `setup/server.md`

Canonical runtime rules:

- Use ORM scalar metrics (`aggregateIndex` + `count()`/`aggregate()`) for counts, sums, averages
- Use `_count` relation loading instead of per-row `.count()` fanout loops
- Use `TableAggregate` ONLY for rankings, random access, sorted pagination (things ORM can't do)
- Wire aggregate updates through trigger paths
- NEVER manually update aggregates in mutations — ALWAYS use triggers

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

| Error | Cause |
|-------|-------|
| `COUNT_NOT_INDEXED` | No `aggregateIndex` matches the filter shape |
| `COUNT_FILTER_UNSUPPORTED` | Uses unsupported operators |
| `COUNT_INDEX_BUILDING` | Index still backfilling |
| `COUNT_RLS_UNSUPPORTED` | Called in RLS-restricted context |

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

### `findMany({ distinct })` (Unsupported)

`findMany({ distinct })` is not available to keep strict no-scan/index-backed guarantees.
If you need deduplication, use select-pipeline distinct:

```ts
const result = await ctx.orm.query.todos
  .select()
  .distinct({ fields: ['status'] })
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
  tags.map((tag) =>
    ctx.orm.query.todoTags.count({ where: { tagId: tag.id } })
  )
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
      memberTeams: { where: { name: 'Core' } },
    },
  },
});
// users[0]._count?.memberTeams => 1
```

Works on `findMany`, `findFirst`, `findFirstOrThrow`. Access via `row._count?.relation ?? 0`.

### Mutation `returning({ _count })`

```ts
const [user] = await ctx.orm.insert(usersTable).values({ name: 'Alice' }).returning({
  id: usersTable.id,
  _count: { posts: true },
});
// user._count?.posts => 0

const [updated] = await ctx.orm.update(usersTable).set({ name: 'Bob' })
  .where(eq(usersTable.id, userId))
  .returning({
    id: usersTable.id,
    _count: { posts: { where: { status: 'published' } } },
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

## TableAggregate Runtime

For **rankings**, **random access**, and **sorted pagination** — things ORM scalar metrics don't support. Built-in B-tree runtime, no external dependency.

**Use ORM scalar metrics for counts/sums. Use TableAggregate ONLY for:**

| Operation | Description |
|-----------|-------------|
| `indexOf(key)` | Position/rank of a key |
| `at(index)` | Document at a specific position |
| `paginate({ limit, cursor })` | Sorted page traversal |
| `max()` / `min()` | Extremes by sort key |

### Always Use Triggers

```ts
// ✅ Register trigger — aggregates stay in sync
export const triggers = defineTriggers(relations, {
  scores: { change: leaderboardAggregate.trigger },
});
await ctx.orm.insert(scores).values({ score: 100 }); // Done!

// ❌ Don't manually update in mutations
await ctx.orm.insert(scores).values({ score: 100 });
await leaderboardAggregate.insert(ctx, doc); // Easy to forget!
```

### TableAggregate Definition

```ts
import { TableAggregate } from 'better-convex/aggregate';
import type { DataModel } from './_generated/dataModel';

// Leaderboard — the canonical TableAggregate use case
export const leaderboardAggregate = new TableAggregate<{
  DataModel: DataModel;
  Key: [number, string];   // [score desc, name asc]
  Namespace: string;       // gameId isolates each game
  TableName: 'scores';
}>({
  name: 'leaderboardAggregate',
  table: 'scores',
  namespace: (doc) => doc.gameId,
  sortKey: (doc) => [-doc.value, doc.name],
});
```

| Parameter | Purpose | Examples |
|-----------|---------|---------|
| `Key` | Sort key type — determines ranking order | `number` for single-field, `[number, string]` for composite |
| `Namespace` | Grouping key — isolates separate B-trees | Parent ID like `gameId`, `userId` |

### Rankings

```ts
// Top 5 scores
const topScores = await leaderboardAggregate.paginate(ctx, {
  namespace: gameId,
  limit: 5,
});

// User's rank
const rank = await leaderboardAggregate.indexOf(ctx, [-userScore, userName], {
  namespace: gameId,
});

// Score at a specific position
const thirdPlace = await leaderboardAggregate.at(ctx, 2, {
  namespace: gameId,
});

// 95th percentile (use ORM count for the total)
const totalPlayers = await ctx.orm.query.scores.count({ where: { gameId } });
const p95Index = Math.floor(totalPlayers * 0.95);
const p95 = await leaderboardAggregate.at(ctx, p95Index, { namespace: gameId });
```

### Random Access

```ts
const songsAggregate = new TableAggregate<{
  Key: null; DataModel: DataModel; TableName: 'songs';
}>({ name: 'songsAggregate', table: 'songs', sortKey: () => null });

const totalSongs = await ctx.orm.query.songs.count();
if (totalSongs === 0) return null;

const randomIndex = Math.floor(Math.random() * totalSongs);
const result = await songsAggregate.at(ctx, randomIndex);
const song = result
  ? await ctx.orm.query.songs.findFirst({ where: { id: result.doc.id } })
  : null;
```

### Key Selection

**Simple Keys:**

```ts
sortKey: (doc) => doc.score           // Number (rankings)
sortKey: (doc) => doc.username        // String (alphabetical)
sortKey: (doc) => doc._creationTime   // Timestamp (chronological)
```

**Composite Keys:**

```ts
sortKey: (doc) => [doc.game, doc.username, doc.score]

// Top score in a specific game
const topInGame = await leaderboardAggregate.max(ctx, {
  bounds: { prefix: [game] },
});
```

Key ordering matters:
- `[game, username, score]` — query by game OR game+username
- `[game, score]` — find highest score per game

### Trigger Integration

```ts
import { defineTriggers } from 'better-convex/orm';
import { leaderboardAggregate } from './aggregates';

export const triggers = defineTriggers(relations, {
  scores: { change: leaderboardAggregate.trigger },
});
```

For tables with multiple aggregates:

```ts
players: {
  change: async (change, ctx) => {
    await byScore.trigger(change, ctx);
    await byUsername.trigger(change, ctx);
  },
},
```

### Bounded Queries

```ts
// Top score in a range
const topInRange = await leaderboardAggregate.max(ctx, {
  namespace: gameId,
  bounds: {
    lower: { key: [-1000], inclusive: true },
    upper: { key: [-100], inclusive: true },
  },
});

const topScore = await leaderboardAggregate.max(ctx, { namespace: gameId });
const lowestScore = await leaderboardAggregate.min(ctx, { namespace: gameId });
```

### Batch Operations

```ts
const items = await leaderboardAggregate.atBatch(ctx, [0, 1, 2], { namespace: gameId });
```

## Repair

If an aggregate gets out of sync:

```ts
export const repairAggregate = privateMutation
  .mutation(async ({ ctx }) => {
    await leaderboardAggregate.clear(ctx);

    const docs = await ctx.orm.query.scores.findMany({
      limit: 10_000,
      orderBy: { createdAt: 'asc' },
    });
    for (const doc of docs) {
      await leaderboardAggregate.insert(ctx, doc);
    }
  });
```

## DirectAggregate

For aggregating data not stored in tables (manual management):

```ts
import { createDirectAggregate } from 'better-convex/aggregate';

const eventAggregate = createDirectAggregate<{
  Key: number;
  Id: string;
}>({
  name: 'eventAggregate',
});

await eventAggregate.insert(ctx, {
  key: Date.now(),
  id: `${userId}-${Date.now()}`,
  sumValue: value,
});

await eventAggregate.replace(
  ctx,
  { key: oldTimestamp, id: eventId },
  { key: Date.now(), id: eventId, sumValue: newValue }
);
```

## Advanced Patterns

### Multiple Sort Orders

```ts
const byScore = new TableAggregate<{
  Key: number; DataModel: DataModel; TableName: 'players';
}>({ name: 'byScore', table: 'players', sortKey: (doc) => doc.score });

const byUsername = new TableAggregate<{
  Key: string; DataModel: DataModel; TableName: 'players';
}>({ name: 'byUsername', table: 'players', sortKey: (doc) => doc.username });
```

### Composite Aggregation

```ts
const regionalLeaderboard = new TableAggregate<{
  Namespace: string;
  Key: [string, number, number]; // [region, score, timestamp]
  DataModel: DataModel;
  TableName: 'matches';
}>({
  name: 'regionalLeaderboard',
  table: 'matches',
  namespace: (doc) => doc.gameMode,
  sortKey: (doc) => [doc.region, doc.score, doc.timestamp],
});

const regionalHigh = await regionalLeaderboard.max(ctx, {
  namespace: 'ranked',
  bounds: { prefix: ['us-west'] },
});
```

### Cascade Deletes

Aggregates update automatically when triggers handle cascade deletes:

```ts
export const triggers = defineTriggers(relations, {
  user: {
    delete: {
      after: async (doc, ctx) => {
        const characters = await ctx.orm.query.characters.findMany({
          where: { userId: doc._id },
          limit: 1000,
        });
        for (const char of characters) {
          await ctx.orm.delete(charactersTable).where(eq(charactersTable.id, char.id));
        }
      },
    },
  },
  characterStars: {
    change: characterStarsAggregate.trigger,
  },
});
```

### Performance

**Namespace vs prefix:**

```ts
// ✅ Namespace for isolation (no contention between users)
namespace: (doc) => doc.userId,
sortKey: (doc) => doc.timestamp

// ❌ Prefix without namespace causes contention
sortKey: (doc) => [doc.userId, doc.timestamp]
```

## When to Use

| Need | Use |
|------|-----|
| Counts, sums, averages | ORM Scalar Metrics (`aggregateIndex` + `count()`/`aggregate()`) |
| Relation counts | `_count` relation loading (`with: { _count: { ... } }`) |
| Rankings, leaderboards | TableAggregate (`indexOf`, `at`, `paginate`) |
| Random document access | TableAggregate (`at(randomIndex)`) |
| Sorted pagination | TableAggregate (`paginate({ limit, cursor })`) |
| Non-table data | DirectAggregate (manual insert/replace/delete) |

## Limitations

| Consideration | Guideline |
|--------------|-----------|
| Update frequency | High-frequency updates to nearby keys cause contention |
| Key size | Keep composite keys reasonable (3-4 components max) |
| Namespace count | Each namespace has overhead |
| Query patterns | Design keys for actual needs |

## API Reference

### Prisma Parity Matrix (No-Scan)

| Prisma feature | Status | Notes |
|---|---|---|
| `aggregate({ _count/_sum/_avg/_min/_max, where })` | Supported | Bucket-backed, no base-table scan fallback |
| `aggregate({ _sum })` nullability | Supported | Returns `null` for empty/all-null sets |
| `groupBy({ by, where, _count/_sum/_avg/_min/_max })` | Supported | `by` fields must be finite-constrained (`eq/in/isNull`) in `where` |
| `groupBy({ having/orderBy/skip/take/cursor })` | Partial | Supported for finite index-bounded groups with conjunction-only `having` |
| `count()` | Supported | Native Convex count syscall |
| `count({ where })` | Supported | Indexed scalar subset |
| `count({ where, select: { _all, field } })` | Supported | Field counts require `aggregateIndex.count(field)` |
| `findMany({ with: { _count: { relation: true } } })` | Supported | Indexed relation counts |
| `findMany({ with: { _count: { relation: { where } } } })` | Supported | Direct relation scalar filters |
| `aggregate({ orderBy/take/skip/cursor })` | Partial | `orderBy/cursor` supported; `skip/take` is `_count`-only in v1 |
| Advanced aggregate/count filters (`OR/NOT/string/relation`) | Partial | Bounded finite DNF `OR` rewrite is supported when branches resolve to one `aggregateIndex`; `NOT`/string/relation filters are blocked |
| Relation `_count` nested relation filter | Blocked | `RELATION_COUNT_FILTER_UNSUPPORTED` |
| `findMany({ distinct })` | Blocked | Not available under strict no-scan contract. Use `select().distinct({ fields })` |
| Relation `_count` filtered through relation | Supported | Indexed `through()` relation filters |
| Mutation return `_count` parity | Supported | `returning({ _count })` on insert/update/delete |
