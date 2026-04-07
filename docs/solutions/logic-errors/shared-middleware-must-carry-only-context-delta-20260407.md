---
title: Shared middleware must carry only context deltas across query and mutation chains
date: 2026-04-07
category: logic-errors
module: kitcn/server
problem_type: logic_error
component: middleware_system
symptoms:
  - reusable `c.middleware()` auth chains make `authMutation` handlers see `ctx.db` as `GenericDatabaseReader`
  - mutation handlers lose `ctx.db.insert` after `.use(sharedMiddleware)`
  - inline mutation middleware works, but the same logic extracted to `c.middleware()` does not
root_cause: logic_error
resolution_type: code_fix
severity: high
tags:
  - middleware
  - mutation
  - query
  - context
  - types
  - auth
  - crpc
---

# Shared middleware must carry only context deltas across query and mutation chains

## Problem

Reusable `c.middleware()` chains could poison mutation procedure types.

The common failure shape was auth middleware shared between `authQuery` and
`authMutation`: query procedures stayed fine, but mutation handlers suddenly saw
`ctx.db` as read-only.

## Symptoms

- `Property 'insert' does not exist on type 'GenericDatabaseReader<DataModel>'`
- the same auth logic works when written inline on `c.mutation.use(...)`
- the bug reproduces from generated `initCRPC` + ORM-wrapped ctx, not just from
  raw builder tests

## What Didn't Work

- blaming the generated server wrapper first; it only exposed the deeper typing
  bug more reliably
- relying on raw builder type tests with simple fake ctx types; those were too
  weak to trigger the real inference failure
- treating the issue as docs-only because `server/middlewares` already had a
  workaround note

## Solution

Make `MiddlewareNext` infer override deltas from the next ctx value instead of
carrying the entire current ctx shape forward.

```ts
type ContextOverridesFromNext<TCurrent, TNext> = TNext extends object
  ? Simplify<Pick<TNext, ChangedKeys<TCurrent, TNext>>> extends infer TDiff
    ? keyof TDiff extends never
      ? UnsetMarker
      : TDiff
    : never
  : TNext;

export type MiddlewareNext<TContext, TContextOverridesIn> = <
  TNextContext extends object = CurrentMiddlewareContext<
    TContext,
    TContextOverridesIn
  >,
>(
  opts?: { ctx?: TNextContext; input?: unknown }
) => Promise<
  MiddlewareResult<
    Overwrite<
      TContextOverridesIn,
      ContextOverridesFromNext<
        CurrentMiddlewareContext<TContext, TContextOverridesIn>,
        TNextContext
      >
    >
  >
>;
```

Add regressions in two places:

- package-level type tests for shared middleware on query/mutation builders
- example generated-server type tests that prove `ctx.db.insert` survives
  `c.mutation.use(sharedAuthMiddleware)`

## Why This Works

The broken path came from `next({ ctx: { ...ctx, user, userId } })`.

TypeScript inferred that full object as the middleware override output. When the
middleware was created from query context, that full query-shaped ctx got stored
as the override type. Applying that middleware to a mutation chain then
overwrote the mutation ctx with the query ctx shape, which downgraded
`ctx.db` from writer to reader.

By computing the delta relative to the current ctx, the middleware only carries
the new auth fields (`user`, `userId`, narrowed `auth`, etc.). The mutation
chain keeps its own writer ctx.

## Prevention

- Test shared middleware typing against the generated `initCRPC` surface, not
  only the raw builder surface
- When a middleware calls `next({ ctx: { ...ctx, ... } })`, verify the type
  system stores only the added/narrowed fields as overrides
- Keep example type tests for auth/shared middleware paths; they catch generated
  wrapper regressions the core builder tests can miss

## Related Issues

- [Middleware Input Access (tRPC-style)](../patterns/middleware-input-access-trpc-style.md)
