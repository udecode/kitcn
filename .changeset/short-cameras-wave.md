---
"better-convex": minor
"@better-convex/resend": minor
"@better-convex/ratelimit": minor
---

Add schema-plugin extension support for relation composition and storage table overrides.

- `defineSchema` now composes optional plugin `schema.relations(...)` with app `relations`.
- Relation collisions on the same `table.field` now fail fast during schema build.
- `resendPlugin` and `ratelimitPlugin` now accept `tables` overrides for advanced storage customization.
