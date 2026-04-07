---
"kitcn": patch
---

## Patches

- Fix `bunx --bun kitcn init -t start --yes` bootstrap parsing so scaffolded
  backend files resolve against the project install instead of the Bun cache,
  and preserve anonymous local Convex mode for follow-up `kitcn dev` runs.
