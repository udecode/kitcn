---
"better-convex": patch
---

## Features

- Add new `better-convex/ratelimit` module with Upstash-style APIs (`limit`, `check`, `getRemaining`, `blockUntilReady`, `resetUsedTokens`, dynamic limits, timeout/cache/deny reasons) backed by Convex DB tables.
- Add `better-convex/ratelimit/react` with `useRateLimit` hook support for browser-side status checks and retry timing.
- Auto-inject ratelimit internal tables (`ratelimit_state`, `ratelimit_dynamic_limit`, `ratelimit_protection_hit`) via ORM `defineSchema` and include them in reset-table orchestration.

Usage:

- Replace example app rate limiting from `@convex-dev/rate-limiter` component usage to `better-convex/ratelimit`.
- Add `/ratelimit` coverage demo and guard test suite for ratelimit coverage definitions.
- Rewrite rate-limiting docs/template references to the new `better-convex/ratelimit` package surface.
