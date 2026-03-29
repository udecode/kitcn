---
title: React Query peer drift creates duplicate contexts
problem_type: integration_issue
component: development_workflow
root_cause: config_error
tags:
  - react-query
  - peer-dependencies
  - react
  - runtime
  - example
  - init
severity: high
symptoms:
  - useInfiniteQuery crashes with "No QueryClient set"
  - the same app later crashes with "ConvexQueryClient not connected to TanStack QueryClient"
  - provider code looks correct, but hooks still act like no provider exists
---

# React Query peer drift creates duplicate contexts

## Problem

The app crashed inside `useInfiniteQuery` even though the provider tree was
correct.

The failure looked like a hook bug:

- `No QueryClient set, use QueryClientProvider to set one`
- `ConvexQueryClient not connected to TanStack QueryClient`

But the provider code in `example/src/lib/convex/convex-provider.tsx` was not
the problem.

## Root cause

The app and the package were resolving two different physical installs of
`@tanstack/react-query`.

Direct proof from `createRequire(...).resolve(...)`:

- app path:
  `.../@tanstack+react-query@5.95.2/...`
- package path:
  `.../@tanstack+react-query@5.90.21/...`

That means:

1. the app's `QueryClientProvider` wrote to one React context
2. `kitcn/react` read from a different React Query module instance
3. the contexts never matched, so hooks behaved like no provider existed

The drift came from two seams at once:

- `example/package.json` lost its direct `@tanstack/react-query` dependency
- the repo baseline install policy did not pin React Query, so workspace/package
  resolution could drift across versions

## Fix

Pin React Query as a first-class supported baseline dependency.

1. Add `SUPPORTED_TANSTACK_REACT_QUERY_VERSION`
2. export `PINNED_TANSTACK_REACT_QUERY_INSTALL_SPEC`
3. use that exact install spec in `BASELINE_DEPENDENCY_INSTALL_SPECS`
4. make dependency pin sync write the same exact version into:
   - root `package.json`
   - `example/package.json`

After the fix, both the app and the package resolve the same file:

- app path:
  `.../@tanstack+react-query@5.95.2/...`
- package path:
  `.../@tanstack+react-query@5.95.2/...`

And `QueryClientContext` identity matches again.

## Verification

- red test:
  `bun test packages/kitcn/src/cli/supported-dependencies.test.ts`
  failed before the new pinned React Query spec existed
- green tests:
  - `bun test packages/kitcn/src/cli/supported-dependencies.test.ts`
  - `bun test tooling/dependency-pins.test.ts`
- package gates:
  - `bun --cwd packages/kitcn typecheck`
  - `bun --cwd packages/kitcn build`
- runtime proof of the actual seam:
  `createRequire(...).resolve('@tanstack/react-query')` returns the same path
  for both the app and `packages/kitcn/dist/react/index.js`
- fixture sync output shows fresh app installs now explicitly install
  `@tanstack/react-query@5.95.2`

## Takeaways

1. Context bugs are often dependency bugs wearing a fake runtime mask.
2. Peer dependencies that define React context identity should be pinned in the
   local bootstrap/install contract.
3. A workspace app must declare `@tanstack/react-query` directly if it imports
   it directly.
4. `require.resolve()` is the fastest way to prove or kill a duplicate-context
   hypothesis.
