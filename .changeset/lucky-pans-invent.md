---
"kitcn": patch
---

## Patches

- Stop `aggregateBackfill` rewriting the stored state it is about to delete.
  Clearing a `rankIndex` walked the btree once per member — a root-to-leaf
  descent plus a patch on every node along the way — and then dropped the whole
  tree regardless, so all of that work was thrown away. Clearing an
  `aggregateIndex` did the same thing with buckets, decrementing each one down to
  zero before deleting it. Both now delete their member rows outright and let the
  existing tree and bucket sweeps reclaim the rest. Clearing 120 rank members
  across three partitions went from 201 btree node writes to 15, one per node.
- Fix a `rankIndex` clear crashing with `Unexpected field 'deletionStack'` once a
  partition holds more than a few hundred rows. The rank storage tables now
  reuse the same definitions the btree writes to, so a large tree can persist its
  traversal state and resume across mutations. Run
  `npx convex dev` (or your usual codegen) to pick the schema up.
- Report real work from a clear chunk instead of a fixed guess, so
  `aggregateBackfill --batch-size` now bounds a clear by the documents it
  actually touches. Multi-partition rank indexes no longer schedule far more
  chunks than the remaining work needs.
- Allow an app to declare `aggregateStorageTables` from `kitcn/aggregate`
  alongside a table that also declares a `rankIndex`. `defineSchema` used to
  reject that combination as a duplicate table name.
