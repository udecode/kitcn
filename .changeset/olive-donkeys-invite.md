---
"kitcn": patch
---

## Patches

- Improve update read costs on `aggregateIndex` and `rankIndex` tables: read
  each row once unless a user `update.before` hook requires a fresh read.
- Fix CLEARING checks for deletes of already-deleted rows: report the
  transient aggregate-index state instead of `Delete on non-existent doc`.
