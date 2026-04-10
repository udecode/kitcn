## Task

Fix the React auth startup race where `useAuth()` can report
`{ isLoading: false, isAuthenticated: false }` for a beat even though a cached
session/token exists and the UI is about to settle to signed-in.

## Source

- User report: spinner disappears, `Logged out` flashes, then `Logged in`
- Repro clue: browser console shows `GET /api/auth/convex/token 401`

## Findings

- `packages/kitcn/src/auth-client/convex-auth-provider.tsx` already computes a
  defensive loading state in `AuthStateSync` for `token && !isAuthenticated`.
- `packages/kitcn/src/react/auth-store.tsx` ignores that synced store state and
  returns raw `useConvexAuth()` values from both `useAuth()` and
  `useSafeConvexAuth()`.
- Solid already reads the synced store state, so React/Solid parity drifted.
- Auth templates already worked around this with `hasSession || Boolean(user)`,
  which is evidence the public hook contract was flaky.

## Plan

1. Add failing React tests for the token-present / Convex-not-ready state.
2. Change the React auth hooks to read the synced store state for kitcn auth.
3. Verify the change against query skip logic, auth guard, and auth display
   hooks.
4. Run targeted tests, `typecheck`, `lint:fix`, and `bun --cwd packages/kitcn build`.

## Release Note

- `packages/kitcn` is published package code.
- If code changes land, update the active unreleased changeset before handoff.
