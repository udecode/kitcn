---
"kitcn": patch
---

## Patches

- Fix `useAuth()` reporting `isAuthenticated: false` on the server render and the first client render under `optimisticAuth` when `initialToken` is an unexpired JWT. The provider now seeds the store as authenticated, so a server-rendered page can render its signed-in tree, auth-bound queries are enabled from the first render, and a `required` mutation fired from a mount effect is no longer refused as `UNAUTHORIZED` before `AuthStateSync`'s first effect. A refused token still closes the gate, an expired token still waits for Convex, and a client that already reported an auth result does not reopen the window.
