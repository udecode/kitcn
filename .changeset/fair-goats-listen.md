---
"better-convex": major
---

Remove `api` and `auth` config toggles from `meta["better-convex"]` in `concave.json`.

- Code generation mode is scope-only via `codegen.scope` (`all`, `auth`, `orm`).
- When `codegen.scope` is missing, `better-convex` defaults to `all`.
- `better-convex dev` always runs full codegen scope.
