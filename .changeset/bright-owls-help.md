---
"kitcn": patch
---

## Patches

- Fix shared `c.middleware()` auth chains so mutation procedures keep mutation
  writer types like `ctx.db.insert`.
- Improve shared middleware docs so mutation-only middleware uses
  `c.middleware<MutationCtx>(...)` instead of a query-only workaround.
