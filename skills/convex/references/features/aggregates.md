# Aggregates

> Prerequisites: `setup/server.md`

Canonical runtime rules:

- Use aggregate components for counters/rankings
- Avoid row-scan count patterns in feature code
- Wire aggregate updates through trigger paths
- NEVER manually update aggregates in mutations — ALWAYS use triggers

## Overview

`@convex-dev/aggregate` provides O(log n) aggregations:

| Feature | Description |
|---------|-------------|
| Counts | Total users, likes per post, followers per user |
| Sums | Total revenue, points per user |
| Rankings | Leaderboards, sorted lists, percentiles |
| Random access | Get document at specific index |

## Always Use Triggers

```ts
// CORRECT: Register aggregate trigger in defineTriggers, aggregates stay in sync
export const triggers = defineTriggers(relations, {
  scores: { change: scoresAggregate.trigger },
});
await ctx.orm.insert(scores).values({ score: 100 }); // Done!

// WRONG: Manual updates in every mutation
await ctx.orm.insert(scores).values({ score: 100 });
await scoresAggregate.insert(ctx, doc); // Don't do this!
```

## createAggregate Definition

```ts
import { createAggregate } from 'better-convex/aggregate';
import { components } from './_generated/api';
import type { DataModel } from './_generated/dataModel';

// Count likes per post
export const aggregatePostLikes = createAggregate<{
  DataModel: DataModel;
  Key: null;              // No sorting, just counting
  Namespace: string;      // postId
  TableName: 'postLikes';
}>(components.aggregatePostLikes, {
  namespace: (doc) => doc.postId,
  sortKey: () => null,
});
```

## Aggregate Types

### Count by Namespace

```ts
export const aggregatePostLikes = createAggregate<{
  DataModel: DataModel;
  Key: null;
  Namespace: string;
  TableName: 'postLikes';
}>(components.aggregatePostLikes, {
  namespace: (doc) => doc.postId,
  sortKey: () => null,
});

const likeCount = await aggregatePostLikes.count(ctx, {
  namespace: postId,
  bounds: {},
});
```

### Global Count

```ts
export const aggregateTotalUsers = createAggregate<{
  DataModel: DataModel;
  Key: null;
  Namespace: string;
  TableName: 'user';
}>(components.aggregateTotalUsers, {
  namespace: () => 'global',
  sortKey: () => null,
});

const totalUsers = await aggregateTotalUsers.count(ctx, {
  namespace: 'global',
  bounds: {},
});
```

### Multiple Aggregates on Same Table

For bidirectional relationships (followers/following):

```ts
export const aggregateFollowers = createAggregate<{
  DataModel: DataModel;
  Key: null;
  Namespace: string;
  TableName: 'follows';
}>(components.aggregateFollowers, {
  namespace: (doc) => doc.followingId,
  sortKey: () => null,
});

export const aggregateFollowing = createAggregate<{
  DataModel: DataModel;
  Key: null;
  Namespace: string;
  TableName: 'follows';
}>(components.aggregateFollowing, {
  namespace: (doc) => doc.followerId,
  sortKey: () => null,
});
```

### Sorted Aggregates

For rankings and top-N queries:

```ts
export const aggregateScoresByValue = createAggregate<{
  DataModel: DataModel;
  Key: [number, string];  // [score desc, name asc]
  Namespace: string;
  TableName: 'scores';
}>(components.aggregateScoresByValue, {
  namespace: (doc) => doc.userId,
  sortKey: (doc) => [-doc.value, doc.name], // Negative for descending
});

const topScores = await aggregateScoresByValue.paginate(ctx, {
  namespace: userId,
  limit: 5,
});
```

## Key Selection

### Simple Keys

```ts
sortKey: (doc) => doc.score           // Number (rankings)
sortKey: (doc) => doc.username        // String (alphabetical)
sortKey: (doc) => doc._creationTime   // Timestamp (chronological)
sortKey: () => null                   // No sorting (counting only)
```

### Composite Keys

```ts
sortKey: (doc) => [doc.game, doc.username, doc.score]

// Query with prefix
const gameCount = await aggregate.count(ctx, {
  bounds: { prefix: [game] },
});
const userGameCount = await aggregate.count(ctx, {
  bounds: { prefix: [game, username] },
});
```

Key ordering matters for composite keys:
- `[game, username, score]` — query by game OR game+username
- `[game, score]` — find highest score per game
- `[username, score]` — find user's highest score

### Bounds for Null Keys

When using `sortKey: () => null`, you must provide `bounds`:

```ts
// WRONG: Missing bounds
const count = await aggregate.count(ctx, { namespace: itemId });

// CORRECT: Include empty bounds
const count = await aggregate.count(ctx, { namespace: itemId, bounds: {} });
```

This also fixes the TypeScript "Type instantiation is excessively deep" error.

## Trigger Integration

Register aggregates in `defineTriggers`:

```ts
import { defineTriggers } from 'better-convex/orm';
import { aggregateFollowers, aggregateFollowing, aggregatePostLikes, aggregateTotalUsers } from './aggregates';

export const triggers = defineTriggers(relations, {
  postLikes: {
    change: aggregatePostLikes.trigger,
  },
  user: {
    change: aggregateTotalUsers.trigger,
  },
  follows: {
    change: async (change, ctx) => {
      await aggregateFollowers.trigger(change, ctx);
      await aggregateFollowing.trigger(change, ctx);
    },
  },
});
```

## Usage API

### Count, Sum, Statistical Ops

```ts
const likeCount = await aggregatePostLikes.count(ctx, { namespace: postId, bounds: {} });

const totalPoints = await aggregatePoints.sum(ctx, { namespace: userId });

// Average
const sum = await aggregate.sum(ctx, { namespace: gameId });
const count = await aggregate.count(ctx, { namespace: gameId, bounds: {} });
const average = count > 0 ? sum / count : 0;

// 95th percentile
const p95Index = Math.floor(count * 0.95);
const p95Result = await aggregate.at(ctx, p95Index, { namespace: gameId });

// User ranking
const rank = await aggregate.indexOf(ctx, userScore, { namespace: gameId });
```

### Random Access

```ts
const randomAggregate = createAggregate<{
  Key: null;
  DataModel: DataModel;
  TableName: 'songs';
}>(components.randomAggregate, {
  sortKey: () => null,
});

const count = await randomAggregate.count(ctx, { bounds: {} });
if (count === 0) return null;

const randomIndex = Math.floor(Math.random() * count);
const result = await randomAggregate.at(ctx, randomIndex);
const song = result
  ? await ctx.orm.query.songs.findFirst({ where: { id: result.doc.id } })
  : null;
```

### Paginate

```ts
const results = await aggregateSkillsByLevel.paginate(ctx, {
  namespace: characterId,
  limit: 10,
  cursor: paginationCursor,
});
```

### Bounded Queries

```ts
const highScoreCount = await aggregate.count(ctx, {
  namespace: gameId,
  bounds: {
    lower: { key: 100, inclusive: true },
    upper: { key: 1000, inclusive: true },
  },
});

const topScore = await aggregate.max(ctx, { namespace: gameId });
const lowestScore = await aggregate.min(ctx, { namespace: gameId });
```

### Batch Operations

```ts
// Batch for better performance
const counts = await aggregate.countBatch(ctx, [
  { namespace: id1, bounds: {} },
  { namespace: id2, bounds: {} },
  { namespace: id3, bounds: {} },
]);

// Also: sumBatch, atBatch
const sums = await aggregate.sumBatch(ctx, [{ namespace: id1 }, { namespace: id2 }]);
const items = await aggregate.atBatch(ctx, [0, 1, 2], { namespace: gameId });
```

## Backfill and Repair

### Initial Backfill

For existing data when adding a new aggregate:

```ts
export const backfillAggregate = privateMutation
  .input(z.object({ cursor: z.string().nullable(), batchSize: z.number().default(100) }))
  .mutation(async ({ ctx, input }) => {
    const results = await ctx.orm.query.scores.findMany({
      orderBy: { createdAt: 'asc' },
      cursor: input.cursor,
      limit: input.batchSize,
    });

    for (const doc of results.page) {
      await aggregate.insertIfDoesNotExist(ctx, doc);
    }

    if (!results.isDone) {
      const caller = createAggregatesCaller(ctx);
      await caller.schedule.now.backfillAggregate({
        cursor: results.continueCursor,
        batchSize: input.batchSize,
      });
    }
  });
```

### Repair Aggregate

```ts
export const repairAggregate = privateMutation
  .mutation(async ({ ctx }) => {
    await aggregate.clear(ctx);

    const docs = await ctx.orm.query.scores.findMany({
      limit: 10_000,
      orderBy: { createdAt: 'asc' },
    });
    for (const doc of docs) {
      await aggregate.insert(ctx, doc);
    }
  });
```

## DirectAggregate

For aggregating data not stored in tables (manual management):

```ts
import { DirectAggregate } from '@convex-dev/aggregate';

const aggregate = new DirectAggregate<{
  Key: number;
  Id: string;
}>(components.aggregate);

await aggregate.insert(ctx, {
  key: Date.now(),
  id: `${userId}-${Date.now()}`,
  sumValue: value,
});

await aggregate.replace(
  ctx,
  { key: oldTimestamp, id: eventId },
  { key: Date.now(), id: eventId, sumValue: newValue }
);
```

## Multiple Sort Orders

Multiple aggregates on same table for different access patterns:

```ts
const byScore = createAggregate<{
  Key: number; DataModel: DataModel; TableName: 'players';
}>(components.byScore, { sortKey: (doc) => doc.score });

const byUsername = createAggregate<{
  Key: string; DataModel: DataModel; TableName: 'players';
}>(components.byUsername, { sortKey: (doc) => doc.username });

const byActivity = createAggregate<{
  Key: number; DataModel: DataModel; TableName: 'players';
}>(components.byActivity, { sortKey: (doc) => doc.lastActiveAt });
```

## Composite Aggregation

Multi-dimensional leaderboards with regional queries:

```ts
const leaderboard = createAggregate<{
  Namespace: string;
  Key: [string, number, number]; // [region, score, timestamp]
  DataModel: DataModel;
  TableName: 'matches';
}>(components.leaderboard, {
  namespace: (doc) => doc.gameMode,
  sortKey: (doc) => [doc.region, doc.score, doc.timestamp],
});

const regionalHighScore = await leaderboard.max(ctx, {
  namespace: 'ranked',
  bounds: { prefix: ['us-west'] },
});

const usWestCount = await leaderboard.count(ctx, {
  namespace: 'ranked',
  bounds: { prefix: ['us-west'] },
});
```

## Cascade Deletes with Aggregates

Aggregates update automatically when triggers handle cascade deletes:

```ts
import { defineTriggers } from 'better-convex/orm';

export const triggers = defineTriggers(relations, {
  user: {
    delete: {
      after: async (doc, ctx) => {
        const characterRows = await ctx.orm.query.characters.findMany({
          where: { userId: doc._id },
          limit: 1000,
        });

        for (const char of characterRows) {
          await ctx.orm.delete(characters).where(eq(characters.id, char.id));
        }
      },
    },
  },
  characterStars: {
    change: aggregateCharacterStars.trigger,
  },
});
```

## Performance

### Namespace vs prefix

```ts
// GOOD: Namespace for complete isolation (no contention between users)
namespace: (doc) => doc.userId,
sortKey: (doc) => doc.timestamp

// AVOID: Prefix without namespace causes contention
sortKey: (doc) => [doc.userId, doc.timestamp]
```

### Lazy aggregation

```ts
await aggregate.clear(ctx, 32, true);  // High-write: larger nodes, lazy root
await aggregate.clear(ctx, 16, false); // High-read: smaller nodes, eager root
```

### Bounded queries reduce conflicts

```ts
// GOOD: Bounded
const recentCount = await aggregate.count(ctx, {
  bounds: { lower: { key: Date.now() - 86400000, inclusive: true } },
});

// AVOID: Unbounded causes more conflicts
const allCount = await aggregate.count(ctx);
```

## When to Use

| Scenario | Standard Query | Aggregate |
|----------|---------------|-----------|
| Small tables (under 1000 rows) | O(n) is fine | Not needed |
| Large tables, frequent reads | O(n) per read | O(log n) |
| Real-time counts | Slow, blocks UI | Fast |
| Dashboard metrics | Very slow | Essential |

## Limitations

| Consideration | Guideline |
|--------------|-----------|
| Document count | Works best with large tables (thousands+) |
| Update frequency | High-frequency updates to nearby keys cause contention |
| Key size | Keep composite keys reasonable (3-4 components max) |
| Namespace count | Each namespace has overhead |
| Query patterns | Design keys for actual needs |

## Time-Based Aggregations

```ts
const activityByHour = createAggregate<{
  Key: [number, string]; // [hour, userId]
  DataModel: DataModel;
  TableName: 'activities';
}>(components.activityByHour, {
  sortKey: (doc) => [
    Math.floor(doc.timestamp / 3600000), // Hour bucket
    doc.userId,
  ],
});

const now = Date.now();
const results = [];
for (let i = 0; i < 24; i++) {
  const hour = Math.floor((now - i * 3600000) / 3600000);
  const count = await activityByHour.count(ctx, { bounds: { prefix: [hour] } });
  results.push({ hour, count });
}
```

## Error Handling

```ts
try {
  await aggregate.delete(ctx, doc);
} catch (error) {
  if (error.message.includes('not found in aggregate')) {
    console.warn('Document not in aggregate:', doc._id);
  } else {
    throw error;
  }
}
```
