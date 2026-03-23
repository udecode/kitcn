---
title: Generated auth definition variance constraint typing
category: integration-issues
tags:
  - better-auth
  - auth
  - codegen
  - generated-contract
  - typescript
  - variance
symptoms:
  - bun check fails in scaffolded or scenario apps while package tests still pass
  - generated convex/functions/generated/auth.ts reports that a typed auth definition does not satisfy the constraint UnknownFn
  - auth definitions that accept generated ctx types fail under strict function variance
module: auth-runtime
resolved: 2026-03-16
---

# Generated auth definition variance constraint typing

## Problem

`bun check` failed in generated scenario apps after auth scaffolding with a
type error in `convex/functions/generated/auth.ts`.

The generated auth definition had a normal typed signature like
`(ctx: GenericCtx) => ...`, but the contract in
`packages/better-convex/src/auth/generated-contract.ts` rejected it.

## Root Cause

`resolveGeneratedAuthDefinition` constrained auth definitions with:

```ts
type UnknownFn = (...args: unknown[]) => unknown;
```

That looks generic, but under strict function variance it is too narrow.

A function requiring a specific parameter type does not safely extend a
function that claims it can accept `unknown` arguments. In practice, typed
generated auth definitions stopped satisfying the constraint even though they
were otherwise valid.

## Solution

Use `never[]` for the argument constraint instead:

```ts
type UnknownFn = (...args: never[]) => unknown;
```

This is the correct "any function shape" constraint for this case. It accepts
functions with specific typed parameters without lying about callable argument
compatibility.

## Verification

After changing the constraint:

- `bun --cwd packages/better-convex build` passed
- `bun typecheck` passed
- `bun check` passed
- auth bootstrap scenarios validated again

## Prevention

1. When a generic helper is meant to accept any function signature, prefer
   `(...args: never[]) => unknown` over `unknown[]`.
2. Verify auth runtime typing against real generated/scenario apps, not just
   package-local tests.
3. If a generated auth file fails with an `UnknownFn` constraint error, check
   function variance before blaming Better Auth itself.

## Files Changed

- `packages/better-convex/src/auth/generated-contract.ts`

## Related

- `docs/solutions/integration-issues/better-auth-1-5-generated-auth-runtime-typing.md`
