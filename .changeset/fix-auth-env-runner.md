---
"kitcn": patch
---

## Patches

- Fix auth env sync and local auth bootstrap so `kitcn add auth`, `kitcn env push`, and `kitcn dev --bootstrap` use the real Convex CLI entrypoint more reliably across runtimes and platforms.
- Fix `kitcn init -t <next|start|vite>` custom shadcn preset exits so they stop with a clear rerun instruction instead of crashing while patching scaffold files.
