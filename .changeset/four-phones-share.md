---
"kitcn": patch
---

## Patches

- Fix the remaining `bunx --bun kitcn@latest init -t start --yes` bootstrap
  parse failure by inlining a bootstrap-safe generated server stub for the real
  nested scaffold chain.
