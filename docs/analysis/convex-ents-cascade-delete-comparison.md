# Cascade Delete at Scale: kitcn ORM vs Convex Ents

Date: 2026-02-07
Status: Post-plan comparison (verified against code)

## Goal

Compare cascade delete architectures after implementing the 5 hardening changes in `docs/plans/2026-02-07-fix-cascade-delete-scale-safety-plan.md`.

## Convex Transaction Limits (design constraints)

| Limit | Value |
|---|---|
| Documents scanned | 32,000 |
| Documents written | 16,000 |
| Data read | 16 MiB |
| Data written | 16 MiB |
| Index ranges read | 4,096 |
| IO operations per function | 1,000 |
| Scheduled functions per mutation | 1,000 |
| Mutation execution time | 1s (user code) |

## Delete Flow Comparison

### Scenario: Delete team with 10,000 members

```
CONVEX ENTS                              BETTER CONVEX ORM (after plan)
===========                              ==============================

User calls:                              User calls:
  ctx.table("teams").getX(id).delete()     db.delete(teams).where(eq(teams._id, id)).executeAsync()

+----------------------------------+     +----------------------------------+
| MUTATION 1 (initial)             |     | MUTATION 1 (initial)             |
|                                  |     |                                  |
| 1. Edge collection depends on   | !!  | 1. Paginate members (100 rows)   |
|    deletion mode:                |     | 2. Hard-delete 100 members       |
|    - hard: .collect() full fan-out|!! | 3. Schedule cascade-delete cont  |
|    - soft/scheduled: mostly gated|    | 4. Hard-delete team              |
| 2. Soft-delete team (scheduled)  |     |                                  |
| 3. Schedule scheduledDelete      |     | IO: ~201 ops (1 paginate +       |
|    with empty stack              |     |   100 reads + 100 deletes)       |
|                                  |     |                                  |
| IO: 10,000+ reads in one tx!    |     +----------------+-----------------+
+----------------+-----------------+                      |
                 |                                         |
                 v                                         v
+----------------------------------+     +----------------------------------+
| MUTATION 2 (scheduled)           |     | MUTATION 2 (scheduled)           |
|                                  |     |                                  |
| 1. Check deletionTime matches    | OK  | 1. Re-query members from null    |
|    (supports cancellation!)      |     |    (100 rows - some now gone)    |
| 2. Build stack from edges        |     | 2. Hard-delete batch             |
| 3. Start processing...           |     | 3. .first() -> more remain?      |
|                                  |     |    -> schedule next batch         |
| Stack: [{id, table, edges:[      |     |                                  |
|   {members, "cascade", idx}      |     | IO: ~201 ops per batch           |
| ]}]                              |     +----------------+-----------------+
+----------------+-----------------+                      |
                 |                                         | ... repeats ~100x
                 v                                         |
+----------------------------------+                      v
| MUTATION 2 cont. (or 3, 4...)    |     +----------------------------------+
|                                  |     | MUTATION ~101 (final)            |
| Pop stack -> paginate edge       |     |                                  |
| approach="cascade" -> 1 at a time|     | 1. Re-query -> 0 rows            |
| approach="paginate" -> up to 2048|     | 2. Done.                         |
|                                  |     +----------------------------------+
| Per batch:                       |
|  - 2048 docs OR 256KB (x8)       |
|  - ~32KB effective bytes          |
|  - then runAfter(0) -> self       |
|                                  |
| Stack preserved across batches   |
| Single job tracks ALL edges      |
+----------------------------------+
```

## State Machine Comparison

```
ENTS: Single stack, single job               US: N jobs, one per FK relation
==============================               ==============================

scheduledDelete({                            scheduledMutationBatch({
  origin: { id, table, deletionTime },         workType: "cascade-delete",
  stack: [                                     table: "members",
    { id: "team1", table: "teams",             foreignIndexName: "by_team",
      edges: [                                 foreignSourceColumns: ["teamId"],
        { table: "members",                    targetValues: ["team1"],
          approach: "cascade",                 cursor: null,        <- always null
          indexName: "by_team" },               batchSize: 100,
        { table: "team_tags",                  delayMs: 0,
          approach: "paginate",                })
          indexName: "by_team" },
      ]                                      + separate job for each FK:
    }                                        scheduledMutationBatch({
  ],                                           workType: "cascade-delete",
  inProgress: true                             table: "team_tags", ...
})                                           })

-> ONE job tracks ALL edges                  -> N jobs, one per FK relation
-> Stack pops edges one by one               -> Each job re-queries independently
-> cursor saved in stack                     -> cursor always null (re-scan)
-> Resumes exactly where left off            -> Re-scans from beginning each time
```

## Cancellation

```
ENTS                                         US (after plan)
====                                         ===============

// Cancel: unset deletionTime                // Cancel: unset deletionTime
await ctx.table("teams")                     await db.update(teams)
  .getX(teamId)                                .set({ deletionTime: undefined })
  .patch({ deletionTime: undefined });         .where(eq(teams._id, teamId));

// scheduledDelete checks:                   // scheduledDelete does NOT check:
if (doc.deletionTime !== origin.deletionTime)  db.delete(table)
  -> return; // canceled!  OK                    .where(eq(table._id, id))
                                                 .execute({ mode: 'async' });
                                               -> deletes anyway!  MISSING
```

Evidence:
- Ents: `deletion.ts:85-97` - checks `doc.deletionTime !== origin.deletionTime`
- Us: `scheduled-delete.ts:35` - no deletionTime validation

## Budget Comparison

```
                    ENTS                    US (after plan)
                    ====                    ===============
Row budget          2,048 docs              100 (recursive) / 900 (non-recursive)
Byte budget         256KB nominal           2 MiB adjusted budget
                    x8 measurement          (JSON bytes are multiplied by 2
                    = ~32KB raw JSON        before comparing to the cap)
Byte measurement    JSON.stringify(          JSON.stringify(row).length
                      convexToJson(doc)
                    ).length * 8
Configurable?       No (hard-coded)         Yes (schema defaults)
Per-call override?  No                      batchSize, delayMs, mode only
Scheduler cap       None                    100 (throws on overflow, no coalescing)
```

## Initial Transaction Budget Usage

```
Scenario: Delete parent with 10k children, each child ~1KB

ENTS (hard delete):
  .collect() 10,000 docs x 1KB = 10 MB read    <- close to 16 MiB limit
  10,000 doc scans                               <- under 32,000 limit
  10,001 writes                                  <- under 16,000 write limit

ENTS (scheduled delete):
  Soft-delete parent = 1 write
  Edge collection gated by isDeletingSoftly
  -> 1:many refs: skipped unless edge.deletion="soft"
  -> m:m edges: skipped (isDeletingSoftly=true)
  Schedule 1 job = 1 schedule call
  Total: ~2 IO ops                               <- safe

US (async mode):
  Paginate 100 children = 100 reads              <- safe
  Delete 100 children = 100 writes               <- safe
  Delete parent = 1 write
  Schedule 1 continuation = 1 schedule call
  Total: ~202 IO ops                             <- safe

US (sync mode):
  Collect up to mutationMaxRows (1000)
  -> throws at 1001                              <- fail-fast
```

## Scorecard

```
                              ENTS    US (after plan)   Notes
                              ====    ===============   =====
Initial tx safety (async)      No      Yes              Ents .collect() can blow tx
Initial tx safety (scheduled)  Yes     Yes              Ents gates collection; us uses async
Cancel scheduled delete        Yes     No               Gap: no deletionTime check
Continuation efficiency        ~       ~                Both re-query from null
Single-job state tracking      Yes     No               Ents: 1 stack job. Us: N jobs
Byte-aware batching            Yes     Yes              Ents ~32KB eff. Us 2MiB measured
Row-aware batching             Yes     Yes              Ents 2048. Us 100/900
Leaf/recursive routing         Yes     Yes              Ents: cascade/paginate. Us: narrow/wide
Scheduler pressure control     No      Partial          Us caps at 100 but throws, no coalesce
FK action variety              No      Yes              Us: cascade/restrict/set null/set default
Cascade updates                No      Yes              Us only
Cycle detection                No      Yes              Us: visited set
Configurable limits            No      Yes              6 schema defaults
Per-call overrides             No      Partial          batchSize, delayMs, mode only
Sync fail-fast                 No      Yes              mutationMaxRows throws
```

## Ents Routing Classification (for reference)

Source: `deletion.ts:120-163`

```
getEdgeArgs(entDefinitions, table):
  For each edge of the deleted entity:
    1:many ref edges / multiple-field edges:
      -> Check target table for cascading edges
      -> hasCascadingEdges? "cascade" (1 at a time) : "paginate" (up to 2048)
    m:m edges:
      -> Always "paginate" (both directions if symmetric)
    1:1 stored edges:
      -> Skipped (handled in initial writeEdges)
```

Our routing (after plan):
```
per incoming FK action in async mode:
  onDelete: 'cascade'      -> recursive batch (mutationBatchSize, default 100)
  onDelete: 'set null'     -> non-recursive batch (mutationLeafBatchSize, default 900)
  onDelete: 'set default'  -> non-recursive batch (mutationLeafBatchSize, default 900)
  onUpdate: 'cascade'      -> non-recursive batch (mutationLeafBatchSize, default 900)
  onUpdate: 'set null'     -> non-recursive batch (mutationLeafBatchSize, default 900)
  onUpdate: 'set default'  -> non-recursive batch (mutationLeafBatchSize, default 900)
```

Difference: Ents chooses `cascade` vs `paginate` by target-edge topology and keeps that in a stack. We route by FK action type at scheduling time.

## Remaining Gaps (post-plan)

1. **Cancellation** - Add `deletionTime` check in `scheduledDelete` before hard-deleting. Trivial fix. Real user value.
2. **Scheduler coalescing** - Cap exists but throws on overflow. No coalescing implemented. Plan spec mentions coalescing but code currently errors.
3. **Keep re-query continuation for patch actions** - `set null` / `set default` / `cascade-update` patch the same indexed FK columns used by continuation queries, so cursor-forward can skip rows. Current `cursor: null` re-query behavior is correctness-preserving.

## What NOT to adopt from Ents

- **Stack-based state machine** - Over-engineered for our FK model. Per-relation scheduling works fine once correctness bugs are fixed. Ents needs the stack because edges are schema-level concepts; we have FK relations which are naturally independent.
- **Hard-coded limits** - Ents' 2048/256KB constants aren't tunable. Our configurable defaults are strictly better for production use.
- **x8 byte multiplier** - Overly conservative. Results in ~32KB effective budget, meaning only ~30 small documents per batch. Our 2x safety factor on 2 MiB measured is more practical while still conservative.
- **Edge-based deletion model** - Our FK actions model is more expressive (set null, set default, cascade updates, restrict).
