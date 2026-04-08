---
title: Start auth reload must rehydrate from persisted session token
date: 2026-04-08
category: integration-issues
module: auth-start
problem_type: integration_issue
component: authentication
symptoms:
  - the Start auth page shows `Signed in` immediately after sign-up or sign-in
  - reloading `/auth` drops back to the signed-out view
  - the auth mutation response includes a Better Auth session token, but no durable Better Auth session cookie is available on reload
root_cause: logic_error
resolution_type: code_fix
severity: high
tags:
  - auth
  - tanstack-start
  - reload
  - session
  - better-auth
  - convex
---

# Start auth reload must rehydrate from persisted session token

## Problem

The TanStack Start auth template could look signed in right after a mutation,
then drop back to signed out after a reload.

The immediate sign-in state came from mutation-time client state, not from a
durable session source the page could rebuild after refresh.

## Symptoms

- sign-up or sign-in reaches the `Signed in` view
- reloading `/auth` shows `Auth demo` again
- the response body contains a Better Auth session token, but the reload path
  still loses the session

## What Didn't Work

- treating this like a missing Convex JWT cookie; `better-auth.convex_jwt`
  alone did not restore Better Auth session state
- relying on `authClient.getSession()` through the normal reactive proxy during
  early reload hydration
- assuming the Start path behaved like the Next.js template

## Solution

Persist the Better Auth session token and hydrated session payload when
`createAuthMutations()` succeeds, then seed the auth provider from that
snapshot on reload.

Key pieces:

- store the opaque Better Auth session token in `sessionStorage`
- store the hydrated session payload in `sessionStorage`
- clear both on sign-out
- have `ConvexAuthProvider` read that fallback on startup, seed the auth store,
  and sync the Better Auth session atom before the page settles
- still validate in the background with a raw `authClient.$fetch('/get-session')`
  call using `Authorization: Bearer <session-token>`

## Why This Works

The mutation response already had the one thing needed to rebuild the session:
the Better Auth session token.

Persisting that token plus the session snapshot turns reload from a cold start
into a local rehydrate. The page can stay signed in immediately, and the
background validation keeps the fallback honest instead of trusting stale data
forever.

## Prevention

- When an auth surface depends on mutation-time session data, verify the reload
  path explicitly
- For TanStack Start auth, do not assume a mutation success implies a durable
  reload path unless the session source is persisted somewhere reload can read
- Keep auth mutation helpers and auth provider bootstrap logic in sync; fixing
  only one side creates fake signed-in state

## Related Issues

- `packages/kitcn/src/react/auth-mutations.ts`
- `packages/kitcn/src/auth-client/convex-auth-provider.tsx`
- `packages/kitcn/src/react/auth-session-fallback.ts`
