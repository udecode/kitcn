---
"kitcn": patch
---

## Patches

- Fix `kitcn deploy` and `kitcn aggregate backfill|rebuild|prune` failing with `Too many documents read in a single function execution (limit: 32000)` once a table with an `aggregateIndex()` grows past ~32k rows. Backfill kickoff now discovers removed aggregate indexes with bounded distinct-key index scans instead of reading every aggregate row. Clearing a removed index whose aggregate rows already exceed platform limits still requires a chunked prune.
- Fix `backend=concave` failing to locate the Concave CLI with `@concavejs/cli` releases that do not export `./package.json`.
- Pin `@concavejs/cli` in concave scaffolds to the supported version instead of `latest`.
