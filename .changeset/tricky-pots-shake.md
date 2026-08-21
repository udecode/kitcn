---
"kitcn": patch
---

## Patches

- Fix `insert()` re-reading the same parent row once per inserted row. Rows of one statement that share a foreign key now cost one existence check instead of one per row.
- Fix the aggregate write barrier re-scanning the `CLEARING` index-state range once per written row. A multi-row write now checks it once per transaction, and a backfill that starts clearing an index still blocks the writes that follow it.
- Fix a relation `where` re-reading the same related document once per scanned row. Filtering by a relation now reads each distinct related document once per query instead of once per candidate row.
