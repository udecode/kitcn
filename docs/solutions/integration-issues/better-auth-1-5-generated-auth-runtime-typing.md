---
title: Better Auth 1.5 Generated Auth Runtime Typing
category: integration-issues
tags:
  - better-auth
  - auth
  - codegen
  - generated-contract
  - typescript
symptoms:
  - tsc fails in packages/kitcn/src/auth/generated-contract.ts after upgrading to Better Auth 1.5
  - ReturnType<typeof betterAuth> stops being a reliable generated runtime type
  - invalid generic ReturnType attempts fail to parse or typecheck
module: auth-runtime
resolved: 2026-03-15
---

# Better Auth 1.5 Generated Auth Runtime Typing

## Problem

Upgrading `better-auth` from `1.4.x` to `1.5.x` broke the generated auth runtime typing in `packages/kitcn/src/auth/generated-contract.ts`.

The old pattern was too tied to `ReturnType<typeof betterAuth>` and fell apart once the `better-auth/minimal` type surface shifted.

## Root Cause

In Better Auth `1.5`, the stable public contract is:

```ts
declare const betterAuth: <Options extends BetterAuthOptions>(
  options: Options
) => Auth<Options>;
```

That means the generated runtime should model the auth instance as `Auth<Options>`, not try to reconstruct the type through brittle `ReturnType` gymnastics on a generic function.

## Solution

Import the exported `Auth` type from `better-auth/types` and use it directly:

```ts
import { type BetterAuthOptions, betterAuth } from 'better-auth/minimal';
import type { Auth } from 'better-auth/types';

type BetterAuthRuntime<
  Options extends BetterAuthOptions = BetterAuthOptions,
> = Auth<Options>;
```

Then use:

```ts
type GeneratedAuth = BetterAuthRuntime<ReturnType<typeof resolveAuthOptions>>;
```

This keeps the generated contract aligned with Better Auth's public type surface instead of depending on inference through a generic factory.

## Verification

After switching to `Auth<Options>`:

- `bun --cwd packages/kitcn build` passed
- `bun typecheck` passed
- focused auth tests still passed

## Prevention

1. When Better Auth changes its generic factory typing, prefer exported public types from `better-auth/types` over `ReturnType<typeof betterAuth>`.
2. If generated auth runtime types start failing after a Better Auth upgrade, inspect `node_modules/better-auth/dist/auth/minimal.d.mts` and `node_modules/better-auth/dist/types/auth.d.mts` first.
3. Do not try to force generic function application inside `ReturnType`; that path is fragile and easy to break with invalid syntax.

## Files Changed

- `packages/kitcn/src/auth/generated-contract.ts`

## Related

- `docs/solutions/integration-issues/better-auth-mutation-error-handling.md`
- `docs/solutions/integration-issues/generated-auth-definition-variance-constraint-20260316.md`
