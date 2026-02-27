---
"better-convex": minor
---

## Breaking Changes

- Moved imports from `better-convex/migration` to `better-convex/orm`.

## Features

- Add `arrayOf(...)` and `objectOf(...)` ORM helpers to reduce `custom(...)` boilerplate for nested array/object schemas.
- Add schema plugin pipeline to `defineSchema(...)` with builtin/default `aggregatePlugin()` and `migrationPlugin()`.
- Add optional `plugins` option on `defineSchema` so feature tables can be opt-in.
- Expose `aggregatePlugin` and `migrationPlugin` from `better-convex/plugins`.
- Add new `better-convex/plugins/ratelimit` module with Upstash-style APIs (`limit`, `check`, `getRemaining`, `blockUntilReady`, `resetUsedTokens`, dynamic limits, timeout/cache/deny reasons) backed by Convex DB tables.
- Add `better-convex/plugins/ratelimit/react` with `useRateLimit` hook support for browser-side status checks and retry timing.
- Add `ratelimitPlugin()` for explicit ratelimit internal table enablement in ORM `defineSchema`.

Usage:

- Replace example app rate limiting from `@convex-dev/rate-limiter` component usage to `better-convex/plugins/ratelimit`.
- Add `/ratelimit` coverage demo and guard test suite for ratelimit coverage definitions.
- Rewrite rate-limiting docs/template references to the new `better-convex/plugins/ratelimit` package surface.
