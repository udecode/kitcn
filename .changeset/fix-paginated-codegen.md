---
"kitcn": patch
---

## Patches

- Fix `kitcn codegen` parse-time cRPC builder stubs so `.paginated()` chains
  after `.input()` keep working and preserve pagination metadata.
- Fix TanStack Start auth reloads so `createAuthMutations()` persists the
  returned Better Auth session token/data and `ConvexAuthProvider` restores the
  signed-in state after a page refresh.
