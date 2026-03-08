---
'better-convex': patch
---

Fix trigger-generated callers in `schema.ts` so they stay schema-safe during Convex pushes, and preserve mutation scheduling APIs when triggers are parameterized with `MutationCtx`.
