---
title: Start auth routes must use literal createFileRoute paths
date: 2026-04-15
category: integration-issues
module: cli
problem_type: integration_issue
component: tooling
symptoms:
  - TanStack Router generation fails with `expected route id to be a string literal or plain template literal`
  - Start auth smoke fails after route generation leaves the API route unusable
  - Plain `tsc` fails when new route files are present but `routeTree.gen.ts` is stale
root_cause: wrong_api
resolution_type: code_fix
severity: medium
tags:
  - tanstack-start
  - auth
  - routes
  - scaffold
  - cli
---

# Start auth routes must use literal createFileRoute paths

## Problem

The Start auth scaffold emitted `createFileRoute('/auth' as never)` and
`createFileRoute('/api/auth/$' as never)`. The cast hid stale
`routeTree.gen.ts` type errors, but current TanStack Router generation rejects
non-literal route arguments at runtime.

## Symptoms

- Vite logs `expected route id to be a string literal or plain template literal`.
- `/api/auth/sign-up/email` returns a 500 because the Start auth route never
  registers cleanly.
- Replacing the cast with a clean literal fixes generation but makes fixture
  `typecheck` fail until TanStack refreshes `routeTree.gen.ts`.

## What Didn't Work

- Keeping `as never`. It satisfies TypeScript but violates the router
  generator's parser contract.
- Using only clean literals. That works after route generation but fails the
  repo's plain `tsc` fixture validation while `routeTree.gen.ts` is stale.

## Solution

Emit literal route paths and use a narrow `@ts-ignore` for the stale route tree
window.

```ts
// @ts-ignore routeTree.gen.ts is refreshed by TanStack Router during dev/build.
export const Route = createFileRoute('/auth')({
  component: AuthPage,
});
```

The generator sees the literal route path, and plain typecheck survives until
TanStack updates `routeTree.gen.ts`.

## Why This Works

TanStack has two separate contracts here:

- route generation needs a literal AST node
- TypeScript needs `routeTree.gen.ts` to include the new route IDs

The scaffold has to satisfy both during the gap between writing route files and
running dev/build generation.

## Prevention

- Do not use type casts inside `createFileRoute(...)` arguments in generated
  Start routes.
- Verify Start auth changes with `scenario:test -- start-auth`, not just
  fixture typecheck.

## Related Issues

- [raw Convex Start auth adoption must patch Start provider and React client](/Users/zbeyens/git/better-convex/docs/solutions/integration-issues/raw-convex-start-auth-adoption-must-patch-start-provider-and-react-client-20260410.md)
- [start auth reload must rehydrate from persisted session token](/Users/zbeyens/git/better-convex/docs/solutions/integration-issues/start-auth-reload-must-rehydrate-from-persisted-session-token-20260408.md)
