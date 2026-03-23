---
title: Auth browser lanes and stale sign-out state
category: integration-issues
tags:
  - auth
  - browser
  - agent-browser
  - scenarios
  - testing
  - react
symptoms:
  - `bun run test:e2e -- next-auth` times out even though sign-up succeeds
  - browser auth can reach `POST /api/auth/sign-up/email 200` and `GET /api/auth/convex/token 200` but still fail to show the signed-in UI
  - sign-out can return `POST /api/auth/sign-out 200` while the page still renders the signed-in branch
  - `agent-browser eval` output looks like JSON but parsing it yields an empty page state
module: auth-browser-lanes
resolved: 2026-03-21
---

# Auth browser lanes and stale sign-out state

## Problem

We wanted two live auth checks:

- a fast HTTP smoke lane
- a slower browser lane for release confidence

The browser lane looked broken even after backend auth succeeded.

Sign-up requests returned `200`, token exchange returned `200`, and manual
browser inspection showed the app could reach the signed-in view. But
`bun run test:e2e -- next-auth` still timed out. Then sign-out exposed a real
second bug: the network request succeeded, but the UI stayed signed in.

## Root Cause

There were two different failures.

### 1. The browser test parser was reading the wrong shape

`agent-browser eval` returns a quoted JSON string, not the final object.

So this payload:

```txt
"{\"url\":\"http://localhost:3005/auth\",\"body\":\"Signed in\"}"
```

needs two parses, not one.

The first version of `tooling/auth-e2e.ts` parsed once, treated the result like
an object, and silently read `body = ""`. That made the wait loop poll forever
even though the page had already changed.

### 2. Sign-out was waiting for Better Auth session state to clear itself

The sign-out mutations relied on the provider/session hook to clear the cached
token later:

1. call `authClient.signOut(...)`
2. wait for the auth store token to disappear

That is too optimistic.

The network sign-out completed, but the session hook could lag behind for a
beat. During that window, the UI still rendered the signed-in branch. The
browser lane was correctly telling us the page stayed signed in.

## Solution

Fix the tooling seam and the package seam separately.

### Browser lane

- parse `agent-browser eval` output until it becomes a real object
- wait for generic signed-out UI (`Auth demo`) instead of a mode-specific string
  like `Don't have an account? Sign up`

The auth page can return to either sign-in or sign-up mode after sign-out, so
the browser test must assert "signed-out shell" rather than one exact toggle
label.

### Auth mutations

On successful sign-out:

- clear `token`
- clear `expiresAt`
- stop waiting for the session hook to do it later

On successful sign-in/sign-up:

- seed the returned session token into the auth store immediately

That keeps the UI honest in both directions:

- sign-in can flip to the signed-in view as soon as the backend exchange works
- sign-out can leave the signed-in view immediately after the backend confirms
  logout

## Verification

- `bun test packages/better-convex/src/react/auth-mutations.test.tsx`
- `bun x vitest run packages/better-convex/src/solid/auth-mutations.vitest.tsx`
- `bun test tooling/auth-e2e.test.ts`
- `bun --cwd packages/better-convex build`
- `bun run scenario:prepare -- next-auth`
- `bun run scenario:dev -- next-auth`
- `bun run test:e2e -- next-auth`

Additional repo gates:

- `bun lint:fix` passed
- `bun typecheck` is still blocked by the existing template/runtime typing
  failures in `fixtures/vite`

## Prevention

1. Treat browser E2E failures and backend auth failures as separate classes of
   bug. Do not blur them together.
2. If a test driver shells out to another CLI, inspect the exact output shape
   before trusting your parser.
3. Do not make sign-out UX depend on an eventually consistent session hook when
   you already know logout succeeded.
4. Browser assertions for auth pages should target stable shells, not one
   toggle label that depends on the last mode the user touched.

## Files Changed

- `packages/better-convex/src/react/auth-mutations.ts`
- `packages/better-convex/src/react/auth-mutations.test.tsx`
- `packages/better-convex/src/solid/auth-mutations.ts`
- `packages/better-convex/src/solid/auth-mutations.vitest.tsx`
- `tooling/auth-e2e.ts`
- `tooling/auth-e2e.test.ts`

## Related

- `docs/solutions/integration-issues/concave-local-dev-auth-cycle-20260319.md`
