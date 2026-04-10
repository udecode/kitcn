---
title: React auth hooks must read synced store state during token catch-up
date: 2026-04-10
category: integration-issues
module: react-auth-hooks
problem_type: integration_issue
component: authentication
symptoms:
  - `useAuth()` can flip from `{ isLoading: true }` to `{ isLoading: false, isAuthenticated: false }` before settling to signed in
  - auth UIs can briefly render signed-out content even though a cached token or session still exists
  - `useSafeConvexAuth()` can stop skipping auth-gated queries too early during startup
  - `/api/auth/convex/token` can transiently return `401` while session sync is still catching up
root_cause: async_timing
resolution_type: code_fix
severity: high
tags: [auth, react, convex, better-auth, useauth, loading-state]
---

# React auth hooks must read synced store state during token catch-up

## Problem

The React auth surface had a split brain during startup.

`ConvexAuthProvider` already computed a defensive loading window for
`token && !isAuthenticated`, but `useAuth()` and `useSafeConvexAuth()` ignored
that synced state and returned raw `useConvexAuth()` values instead. That let
the UI briefly render "logged out" before the signed-in state caught up.

## Symptoms

- `useAuth()` shows a spinner, then briefly reports signed out, then flips to
  signed in
- auth pages need caller-side workarounds like `hasSession || Boolean(user)` to
  avoid flicker
- auth-gated query helpers can treat startup as settled too early
- the browser can show a transient `401` on `/api/auth/convex/token` during the
  same window

## What Didn't Work

- treating the page-level workaround as the fix; it hides one caller but leaves
  the public hook contract wrong
- assuming `isLoading === false` from raw `useConvexAuth()` means auth is fully
  settled for kitcn consumers

## Solution

Make the React auth hooks read the synced auth store, not the raw Convex hook,
when kitcn's `AuthProvider` is active.

Before:

```tsx
export function useSafeConvexAuth(): ConvexAuthResult {
  const authStore = useAuthStore();

  if (authStore.store) {
    return useConvexAuth();
  }

  return { isAuthenticated: false, isLoading: false };
}
```

After:

```tsx
export function useSafeConvexAuth(): ConvexAuthResult {
  const authStore = useAuthStore();

  if (authStore.store) {
    const isAuthenticated = useAuthValue("isAuthenticated");
    const isLoading = useAuthValue("isLoading");
    return { isAuthenticated, isLoading };
  }

  return { isAuthenticated: false, isLoading: false };
}
```

Do the same in `useAuth()`:

- keep `hasSession` derived from the cached token
- read `isAuthenticated` and `isLoading` from `useAuthValue(...)`
- stop exposing raw `useConvexAuth()` state directly for kitcn auth

## Why This Works

`AuthStateSync` is the owning seam for the startup race. It already knows when
kitcn should stay loading even though raw Convex auth has not caught up yet.

Once the public React hooks read that synced store state, every caller sees one
consistent contract:

- token present + Convex still catching up => loading
- confirmed auth => authenticated
- confirmed no session => signed out

That matches the Solid implementation too, so React and Solid stop drifting.

## Prevention

- If a provider computes a defensive derived auth state, public hooks must read
  that derived state instead of bypassing it
- Keep React and Solid auth hooks behaviorally aligned; parity drift here is
  expensive
- Add a regression test for `token present + synced store loading + raw Convex
  false` so the flash does not come back

## Related Issues

- `docs/solutions/integration-issues/auth-browser-lanes-and-stale-signout-20260321.md`
- `docs/solutions/integration-issues/start-auth-reload-must-rehydrate-from-persisted-session-token-20260408.md`
