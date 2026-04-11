---
"kitcn": patch
---

## Patches

- Fix `bunx --bun kitcn init -t start --yes` so Bun-native parse-time imports
  no longer bypass project aliases and crash first-run codegen on scaffolded
  Start files.
