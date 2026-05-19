---
title: Start loader auth must prime Convex Query Client before provider
date: 2026-05-19
category: integration-issues
module: auth-start
problem_type: integration_issue
component: authentication
symptoms:
  - TanStack Start loaders run protected Convex queries before ConvexAuthProvider mounts
  - the shared ConvexQueryClient has no kitcn auth store during loader execution
  - protected loader queries reach Convex without auth
root_cause: inadequate_documentation
resolution_type: tooling_addition
severity: medium
tags:
  - auth
  - tanstack-start
  - loaders
  - react-query
  - convex
  - better-auth
---

# Start loader auth must prime Convex Query Client before provider

## Problem

TanStack Start route loaders can execute before the React provider tree mounts.
That matters for kitcn auth because the normal `ConvexAuthProvider` path wires
the auth store inside React, while router loaders often use a shared
`ConvexQueryClient` created outside React.

## Symptoms

- protected Convex queries in route loaders run as unauthenticated
- component queries work after `ConvexAuthProvider` mounts
- root `beforeLoad` code grows hand-rolled `getToken()` plus `setAuth()` glue
- SSR query code may set only `serverHttpClient`, while browser loader code
  sets only `convexClient`

## What Didn't Work

- telling users to use `useCRPC()` or `useCRPCClient()` in loaders; those are
  React hooks and do not belong in route loader code
- relying on `ConvexAuthProvider` alone; it mounts too late for child loaders
- documenting only `serverHttpClient.setAuth(token)`; browser-side loaders also
  need the shared Convex client primed before protected queries execute

## Solution

Add `syncConvexAuthForStartLoader()` to `kitcn/auth/start`.

The helper accepts either a `ConvexReactClient` or a `ConvexQueryClient`-shaped
target:

```ts
await syncConvexAuthForStartLoader({
  convex: context.convexQueryClient,
  getToken: getLoaderToken,
});
```

It does four things in one public API:

- fetches the current Convex auth token
- calls `convexClient.setAuth(...)` for browser loader queries
- calls `serverHttpClient.setAuth(token)` when the target has an SSR HTTP client
- skips duplicate `setAuth` calls for the same token and clears auth on logout

The TanStack Start docs now split the supported paths:

- server loaders and server functions use `runServerCall` or `fetchAuthQuery`
- client/router loaders use `syncConvexAuthForStartLoader` before protected
  `ConvexQueryClient` queries run
- components keep using `ConvexAuthProvider`

## Why This Works

The loader auth problem is an execution-order problem, not an auth-provider
bug. React has not mounted yet, so the loader cannot depend on React auth
state. The router does have access to the shared query client, so the root
loader can prime the underlying Convex clients before child loaders execute.

Keeping this in `kitcn/auth/start` makes the behavior explicit and keeps users
away from half-fixes that only handle SSR or only handle the browser client.

## Prevention

- For Start loader guidance, classify the loader first: server loader versus
  client/router loader.
- Do not recommend React hooks for loader code.
- When documenting Start loader auth, mention both `convexClient` and
  `serverHttpClient`.
- Keep a focused auth/start test that proves repeated loader auth sync is
  idempotent and that a `ConvexQueryClient` target primes SSR auth too.

## Related Issues

- [start-auth-reload-must-rehydrate-from-persisted-session-token-20260408.md](./start-auth-reload-must-rehydrate-from-persisted-session-token-20260408.md)
- [raw-convex-start-auth-adoption-must-patch-start-provider-and-react-client-20260410.md](./raw-convex-start-auth-adoption-must-patch-start-provider-and-react-client-20260410.md)
- [react-query-peer-drift-creates-duplicate-contexts-20260325.md](./react-query-peer-drift-creates-duplicate-contexts-20260325.md)
