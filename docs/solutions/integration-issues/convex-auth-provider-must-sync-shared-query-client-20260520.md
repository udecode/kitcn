---
title: ConvexAuthProvider must sync shared query clients
date: 2026-05-20
category: integration-issues
module: react-auth-query-client
problem_type: integration_issue
component: authentication
symptoms:
  - TanStack Query apps create a shared ConvexQueryClient outside React
  - ConvexAuthProvider owns the kitcn auth store inside React
  - client components need a child useAuthStore bridge to sync the query client
  - scaffolded auth providers import useAuthStore only for provider wiring
root_cause: async_timing
resolution_type: code_fix
severity: medium
tags: [auth, react, tanstack-query, convex-query-client, provider]
---

# ConvexAuthProvider must sync shared query clients

## Problem

kitcn auth apps using TanStack Query had two auth paths: route loaders used
`syncConvexAuthForStartLoader()`, while mounted client components still needed a
small child component to pass `useAuthStore()` into the shared
`ConvexQueryClient`.

That made scaffolded providers expose an internal bridge as app code.

## Symptoms

- Auth-enabled provider snippets import `useAuthStore()` only to wire
  `getConvexQueryClientSingleton({ authStore, ... })`.
- Start apps with loaders fix loader auth, but still need a client-side bridge
  inside `ConvexAuthProvider`.
- Protected component queries rely on callers remembering to sync the shared
  query client with the provider-owned auth store.

## What Didn't Work

- Leaving the bridge in every app works, but it leaks provider internals into
  scaffolded user code.
- Moving the bridge to a child effect is too late for render-time consumers and
  still requires every app to wire the same pattern.
- Relying on loader sync alone only handles router loader timing; it does not
  attach the React auth store to client component query subscriptions.

## Solution

Add a `convexQueryClient` prop to `ConvexAuthProvider` and sync it with the
internal auth store before children render:

```tsx
<ConvexAuthProvider
  authClient={authClient}
  client={convex}
  convexQueryClient={convexQueryClient}
>
  {children}
</ConvexAuthProvider>
```

Generated providers now create the shared clients before rendering the provider
and pass the query client directly:

```tsx
const queryClient = getQueryClientSingleton(createQueryClient);
const convexQueryClient = getConvexQueryClientSingleton({
  convex,
  queryClient,
});

return (
  <ConvexAuthProvider
    authClient={authClient}
    client={convex}
    convexQueryClient={convexQueryClient}
  >
    <TanstackQueryClientProvider client={queryClient}>
      <CRPCProvider convexClient={convex} convexQueryClient={convexQueryClient}>
        {children}
      </CRPCProvider>
    </TanstackQueryClientProvider>
  </ConvexAuthProvider>
);
```

## Why This Works

`ConvexAuthProvider` is the component that creates and owns the kitcn auth store.
The shared query client is still created outside that provider, but the provider
can update it as soon as `useAuthStore()` is available and before descendant
queries render.

Loader auth remains separate: loaders run before React mounts, so they still use
`syncConvexAuthForStartLoader()`.

## Prevention

- Do not put `useAuthStore()` in scaffolded app providers just to wire auth.
- For mounted React trees, pass the shared `ConvexQueryClient` to
  `ConvexAuthProvider`.
- Keep a provider test proving the query client is synced before children
  render.
- Keep Start docs split between loader auth sync and React provider auth sync.

## Related Issues

- [start-loader-auth-must-prime-convex-query-client-before-provider-20260519.md](./start-loader-auth-must-prime-convex-query-client-before-provider-20260519.md)
- [react-auth-hooks-must-read-synced-store-state-during-token-catch-up-20260410.md](./react-auth-hooks-must-read-synced-store-state-during-token-catch-up-20260410.md)
- [react-query-peer-drift-creates-duplicate-contexts-20260325.md](./react-query-peer-drift-creates-duplicate-contexts-20260325.md)
