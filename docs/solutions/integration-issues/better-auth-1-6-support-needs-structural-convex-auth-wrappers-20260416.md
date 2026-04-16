---
title: Better Auth 1.6 support needs structural Convex auth wrappers
date: 2026-04-16
category: integration-issues
module: auth-client
problem_type: integration_issue
component: authentication
symptoms:
  - upgrading `better-auth` from `1.5.3` to `1.6.5` breaks typecheck in kitcn auth clients and generated auth apps
  - `createAuthMutations(authClient)` reports missing `signIn`, `signOut`, or `signUp` even though those methods exist at runtime
  - generated auth pages see `authClient.useSession().data` collapse to `never`
root_cause: wrong_api
resolution_type: code_fix
severity: high
tags: [better-auth, auth, convex, wrappers, typecheck]
---

# Better Auth 1.6 support needs structural Convex auth wrappers

## Problem

`kitcn` uses `@convex-dev/better-auth` for the Convex plugin and client plugin,
but Better Auth `1.6.x` changed enough of the client and plugin type surface
that the old exported types no longer compose cleanly.

Runtime behavior was mostly fine. TypeScript was the part that exploded.

## Symptoms

- `createAuthMutations(authClient)` rejects the auth client because TypeScript
  thinks core auth methods are missing
- `ConvexAuthProvider` rejects the auth client prop for the same reason
- generated auth pages cannot read `authClient.useSession().data.user`
- the richer example auth client loses organization and anonymous helper types

## What Didn't Work

- bumping version pins alone
- trusting direct re-exports from `@convex-dev/better-auth`
- expecting Better Auth `1.6.x` to infer the same client shape through the old
  Convex plugin types

## Solution

Treat the Convex plugin and client plugin as structurally compatible with the
current Better Auth interfaces instead of inheriting the old package's stricter
generic types.

Key changes:

- wrap `convex` and `convexClient` in `kitcn` and cast them to the current
  `BetterAuthPlugin` / `BetterAuthClientPlugin` shape
- make `createAuthMutations()` accept a structural auth client contract instead
  of requiring perfect generic inference
- do the same for `ConvexAuthProvider`
- add a local `mode` field to the auth adapter `where` validator so Better Auth
  `1.6` queries do not fail validation
- cast generated auth client templates and the example auth client through
  `unknown` to a stable local interface with the methods the app actually uses

## Why This Works

The runtime object already had the right methods. The breakage was in the type
bridge between:

1. Better Auth `1.6.x`
2. `@convex-dev/better-auth@0.11.4`
3. kitcn's wrappers and generated auth client files

By making kitcn depend on structural contracts at the boundaries, we stop
TypeScript from forcing those three packages to agree on every internal generic
detail before the app can compile.

## Prevention

1. When a dependency wrapper sits between two fast-moving auth libraries,
   prefer structural boundary types over direct re-exports of deep generic
   contracts.
2. If a version bump fails only in generated apps, fix the template type shape,
   not just the hand-written example app.
3. Re-run `bun typecheck`, `bun run fixtures:check`, and `bun check` after any
   auth client type widening. The generated apps are the real proof.

## Related Issues

- `docs/solutions/integration-issues/better-auth-1-5-generated-auth-runtime-typing.md`
- `docs/solutions/integration-issues/convex-better-auth-upstream-sync-runtime-fixes-20260416.md`
