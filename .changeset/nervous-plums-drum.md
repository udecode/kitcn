---
"kitcn": patch
---

## Patches

- Stop `insert().returning({ ... })` reading each row back after writing it. A
  projected `returning()` is now answered from the values that were just
  inserted, so an 8-row insert spends 0 reads on post-images instead of 8.
  Argument-less `returning()` still reads, because `createdAt` is only known
  once the row is stored.
- Stop `insert().onConflictDoUpdate({ ... }).returning()` reading the row back
  after patching it.
- Stop `returning({ _count })` re-fetching each affected row before counting its
  relations, on `insert()`, `update()` and `delete()`. That is one fewer read
  per row, and the counts, their `where` filters and `delete()`'s
  before-cascade ordering are unchanged.
- Keep reading the row back on tables with triggers, `aggregateIndex` or
  `rankIndex`, where a hook can rewrite what gets stored.
