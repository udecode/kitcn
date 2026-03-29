---
title: Concave local dev contract and generated auth cycle
category: integration-issues
tags:
  - concave
  - auth
  - dev
  - scenarios
  - codegen
  - proxy
symptoms:
  - `bun run scenario:dev -- next-auth` starts Next on `3005` but Concave on `3000`
  - scaffolded apps still expect `NEXT_PUBLIC_CONVEX_URL=127.0.0.1:3210` and `NEXT_PUBLIC_CONVEX_SITE_URL=127.0.0.1:3211`
  - Concave startup fails with `Auth runtime is disabled. convex/functions/auth.ts default export is unavailable`
  - auth sign-up on `http://localhost:3005/auth` can fail with `Invalid origin: http://localhost:3005` even after the app boots
  - importing the generated auth runtime can fail either with a TDZ `ReferenceError` or with an early `undefined` default export
module: concave-dev
resolved: 2026-03-19
---

# Concave local dev contract and generated auth cycle

## Problem

Prepared kitcn apps were carrying the Convex local dev contract:

- frontend app on `3005`
- backend client URL on `127.0.0.1:3210`
- backend site URL on `127.0.0.1:3211`

But `kitcn dev --backend concave` was still delegating to upstream
`concave dev` with its raw default port `3000`.

At the same time, auth-enabled scenarios like `next-auth` crashed during
Concave startup with:

```txt
Auth runtime is disabled. convex/functions/auth.ts default export is unavailable
```

So local dev was broken three ways: the local URL contract was wrong, Concave
runtime auth could resolve `SITE_URL` to the backend site proxy instead of the
frontend app URL, and the generated auth runtime could disable itself before
the app even booted.

## Root Cause

These were three separate bugs.

### 1. Concave local dev leaked the upstream single-port default

kitcn templates and React helpers assume the Convex-style split local
URLs:

- `NEXT_PUBLIC_CONVEX_URL=http://127.0.0.1:3210`
- `NEXT_PUBLIC_CONVEX_SITE_URL=http://127.0.0.1:3211`

That contract is already baked into scaffolded `.env.local` files and the
generated client wiring.

Upstream `concave dev`, however, defaults to one local server on `3000`.
kitcn was passing that through untouched, so the prepared app and the
backend process disagreed about where the backend lived.

### 2. Generated auth runtime read the default export too early

The auth scaffold creates a real module cycle:

1. `convex/functions/auth.ts` imports `defineAuth` from
   `convex/functions/generated/auth.ts`
2. `convex/functions/generated/auth.ts` imports `../auth`
3. generated auth tried to resolve `auth.ts`'s default export at module
   top-level

Depending on the loader, that early read surfaced in two different ways:

- direct ESM/Bun import: `ReferenceError: Cannot access 'default' before initialization`
- bundled Concave module graph: the default export existed but was still
  temporarily `undefined`

In both cases, the generated runtime concluded that auth was unavailable and
disabled itself.

### 3. Concave local dev left `SITE_URL` pointing at the backend site proxy

The auth scaffold trusts the frontend app origin through `getEnv().SITE_URL`.

On Concave local dev, kitcn already injected:

- `CONVEX_SITE_URL=http://127.0.0.1:3211`

But it was not also injecting the frontend app URL as `SITE_URL`.

In the Concave runtime, that let `getEnv().SITE_URL` resolve to the proxy site
URL `http://127.0.0.1:3211` instead of the frontend origin
`http://localhost:3005`.

So auth requests arriving with:

- `Origin: http://localhost:3005`

were compared against the wrong trusted origin and Better Auth rejected them as
`Invalid origin`.

## Solution

Fix both layers, not just the symptom.

### Normalize Concave local dev back onto the kitcn contract

When `kitcn dev` runs on backend `concave` without an explicit target:

1. start `concave dev` on `127.0.0.1:3210`
2. expose a tiny local site proxy on `127.0.0.1:3211`
3. set `CONVEX_SITE_URL=http://127.0.0.1:3211` for the backend process
4. set `SITE_URL` from the scaffold's frontend `.env.local` value, falling back
   to `http://localhost:3005`

That keeps the scaffolded app contract stable. Frontend env files do not need
to care whether the backend is Convex or Concave, and backend auth still trusts
the real frontend origin instead of the local site proxy.

### Defer generated auth resolution until runtime use

`resolveGeneratedAuthDefinition(...)` must not insist on a callable default
export at module initialization time.

Instead:

- if the default export is already callable, return it
- if the module namespace has a `default` export slot but it is not ready yet,
  return a lazy wrapper
- on first real auth use, re-read the default export and throw only if it is
  still invalid

That kills both variants of the cycle:

- TDZ `ReferenceError`
- bundled early-`undefined` default export

## Verification

- `bun test packages/kitcn/src/auth/generated-contract.test.ts packages/kitcn/src/cli/commands/dev.test.ts`
- `bun --cwd packages/kitcn build`
- `bun run scenario:prepare -- next-auth`
- `bun run scenario:dev -- next-auth`
- `curl -i -X POST http://localhost:3005/api/auth/sign-up/email ...` returns `200`
- `curl -I http://127.0.0.1:3211/_dashboard`
- `curl http://127.0.0.1:3211/api/auth/convex/jwks`

Additional repo gates:

- `bun lint:fix` passed
- `bun typecheck` is still blocked by the existing generated runtime typing
  failures in committed template packages
- `bun run scenario:check -- next-auth` is blocked by the same existing
  template/runtime typing failures, not by this fix

## Prevention

1. Do not let kitcn templates depend on backend-specific local URL
   quirks. Normalize the backend to the template contract instead.
2. If generated code imports a file that also imports the generated code back,
   never read that file's default export at module top-level.
3. For auth/runtime bugs, test both direct source imports and bundled scenario
   output. Loader behavior can hide the same cycle in different ways.
4. Concave local dev needs explicit parity checks against the Convex local
   contract whenever scaffolded frontend env defaults change.
5. If Concave local dev injects backend-only env like `CONVEX_SITE_URL`, also
   inject the matching frontend auth origin explicitly. Do not rely on backend
   runtimes to infer or alias `SITE_URL` correctly.

## Files Changed

- `packages/kitcn/src/auth/generated-contract.ts`
- `packages/kitcn/src/auth/generated-contract.test.ts`
- `packages/kitcn/src/cli/commands/dev.ts`
- `packages/kitcn/src/cli/commands/dev.test.ts`

## Related

- `docs/solutions/integration-issues/raw-convex-auth-adoption-bootstrap-20260318.md`
- `docs/solutions/integration-issues/generated-auth-definition-variance-constraint-20260316.md`
