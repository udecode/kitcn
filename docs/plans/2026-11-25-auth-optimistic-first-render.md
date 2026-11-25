# Optimistic auth from the first render

Status: Done
Playbook: bug-fix

## Outcome

With `optimisticAuth` and an unexpired JWT `initialToken`, `useAuth()` reports `isAuthenticated: true, isLoading: false` on the server render and the first client render, the same state `AuthStateSync` publishes after its first effect today. The two renders agree, so hydration does not change.

## Scope

- `packages/kitcn/src/auth-client/convex-auth-provider.tsx`: the store's initial values.
- `packages/kitcn/src/react/auth-store.tsx`: `useAuth()`'s server branch reads the store instead of returning a fixed loading state.
- Tests in `convex-auth-provider.test.tsx`, the `www` auth client page and its skill reference, a changeset.

## Decisions

- **Seed at the provider, not in `useAuth()`.** Every gate reads the store (`useAuthSkip`, `useAuthGuard`, `ConvexQueryClient`), so seeding the store opens them all at once and keeps one owner for the optimistic rule. A `useAuth()`-only change would leave queries and the write guard closed.
- **Same rule as `resolveAuthGate`'s optimistic branch**: a JWT whose `exp` is in the future (`isOptimisticToken`), on a client with no auth result yet (`isClientSettled`). A remount over a client that already reported keeps waiting, as the window rule says.
- **The server branch reads the store.** Without the option, or without a usable token, the store holds the old defaults (`false`, `true`), so the server render is unchanged.

## Steps

- [x] Seed `isAuthenticated`/`isLoading` in `tokenValues`. Proof: "reports authenticated on the first render from a held, unexpired JWT" fails on main.
- [x] `useAuth()` server branch reads the store. Proof: "reports the seeded state on the server render too" fails on main.
- [x] A settled client stays closed. Proof: "a client that already reported an auth result does not open from the first render again" fails with the `isClientSettled` condition removed.
- [x] Docs row and skill reference; changeset.

## Proof

`bun test packages/kitcn/src/auth-client packages/kitcn/src/react`: 283 pass. `bun typecheck` passes after `bun --cwd packages/kitcn build`.

## Close

Reported from a consumer (nimble) whose server-rendered organization pages held their content until `AuthStateSync`'s first effect; the consumer keeps its own fallback and does not depend on this change.
