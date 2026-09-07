---
"kitcn": patch
---

## Patches

- Improve `aggregateIndex` maintenance read costs: read each bucket once per
  distinct key tuple and each membership once per document within a mutation.
  Aggregate queries still see preceding writes in that mutation.
- Document that nested `ctx.runMutation` writes do not refresh the caller's
  aggregate maintenance cache and can make subsequent writes use stale rows.
  Compose modules with `create<Module>Handler(ctx)` to share the caller's context.
