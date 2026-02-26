---
"better-convex": patch
---

## Patches

- Fix server auth queries and mutations to refresh stale JWTs and retry once on unauthorized responses before returning unauthenticated results.
- Fix auth header generation to fall back to Better Auth session-token cookies when JWT identity is unavailable, including secure and custom cookie prefixes.
