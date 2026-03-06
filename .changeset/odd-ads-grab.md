---
'better-convex': patch
---

Fix SSR auth token refresh when Convex requests `forceRefreshToken` during pending Better Auth session hydration.

`ConvexAuthProvider` now fetches a fresh JWT instead of reusing the cached SSR token in that forced-refresh path, so Convex can schedule preemptive refresh instead of waiting for an auth failure.
