---
"kitcn": patch
---

## Patches

- Fix `kitcn dev` so local Convex preflight uses `convex init` by default, and only falls back to the upgrade-capable local dev lane when older local backends require it.
- Improve auth and backend docs so Convex and Concave env/JWKS flows are split into explicit backend lanes.
