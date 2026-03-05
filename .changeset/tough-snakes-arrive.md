---
"better-convex": major
---

Add `meta["better-convex"].codegen.trimSegments` for runtime export naming.

- `plugins` is always trimmed, even if omitted from `trimSegments`.
- Additional trim segments can be provided via `trimSegments`.
- Trimming affects generated runtime symbol names only.
- Runtime file paths and import resolution are unchanged.
- Colliding trimmed names get a deterministic hash suffix.
