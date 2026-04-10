---
"kitcn": patch
---

## Patches

- Fix React auth hooks so `useAuth()` and `useSafeConvexAuth()` stay loading
  while a cached session token is still syncing to Convex, which prevents a
  brief signed-out flash before the signed-in state settles.
