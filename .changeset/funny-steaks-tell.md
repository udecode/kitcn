---
"better-convex": patch
---

## Patches

- Fix server auth queries and mutations to refresh stale JWTs and retry once on unauthorized responses before returning unauthenticated results.
- Fix auth header generation to fall back to Better Auth session-token cookies when JWT identity is unavailable, including secure and custom cookie prefixes.
- Update `@convex-dev/better-auth` support to `0.10.11` to include upstream cross-domain and Convex plugin auth fixes.
- Fix `ConvexAuthProvider` token refresh behavior by deduplicating concurrent token fetches and forcing non-throwing internal token fetch calls.
- Improve SSR/OTT auth stability in `ConvexAuthProvider` so session hydration and one-time-token URL handling avoid transient unauthorized states.
- Align reactive auth query subscriptions with `skipUnauth` semantics so unauthorized subscription updates resolve to `null` instead of triggering unauthorized callbacks.
- Ensure `ConvexAuthProvider` auth state follows confirmed Better Auth session state so stale JWTs do not keep authenticated state after sign-out.
- Fix auth adapter date output normalization to return `Date` values for date fields.
- Fix Next.js auth token forwarding by removing body-related headers from internal token fetch requests.
- Prefer `better-auth/minimal` imports in auth runtime/type paths where available
