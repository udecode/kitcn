---
"better-convex": major
---

## Breaking changes

- CLI config is now JSON-only.
  - Default discovery only reads `./concave.json`.
  - Better Convex config is read from `meta["better-convex"]`.
  - Legacy auto-discovery of `./better-convex.json` now throws.
  - `better-convex.config.ts` is no longer loaded.
  - Passing a non-JSON file to `--config` now throws.

- `paths.lib` is now resolved from project root (same model as `paths.shared`).
  - Default remains `convex/lib` via config defaults.
  - `paths.lib: "custom-lib"` now resolves to `<project>/custom-lib`.
