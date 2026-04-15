---
"kitcn": patch
---

## Patches

- Fix raw Convex auth adoption so `kitcn add auth --preset convex --yes`
  installs `kitcn` before codegen and local bootstrap.
- Fix `kitcn deploy` so CI deployment env vars reach Convex deploy, migrations,
  and aggregate backfill.
