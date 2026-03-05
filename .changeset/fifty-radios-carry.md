---
"better-convex": major
---

Remove `meta["better-convex"].plugins` from CLI config.

- Plugin enablement is schema-only via `defineSchema(..., { plugins: [...] })`.
- `concave.json` no longer accepts plugin preset/config keys.
