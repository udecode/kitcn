---
title: Auth guidance must follow convex.json functions dir
category: integration-issues
tags:
  - auth
  - codegen
  - docs
  - convex
  - functions-dir
symptoms:
  - generated auth errors tell users to create `convex/functions/auth.ts` even when `convex.json.functions` points somewhere else
  - auth docs hardcode `convex/functions/auth.ts` and `convex/functions/generated/auth.ts` as if they were universal
module: auth-runtime
resolved: 2026-03-23
---

# Auth guidance must follow convex.json functions dir

## Problem

kitcn already respected `convex.json.functions` in codegen and
scaffolding, but generated auth guidance and parts of the docs still hardcoded
`convex/functions/...`.

That made the contract look more rigid than it really was and sent users with a
custom functions directory to the wrong path.

## Root Cause

The real functions dir was resolved in codegen and registry planning, but the
auth guidance strings were frozen in package code:

- disabled auth messages always referenced `convex/functions/auth.ts`
- invalid auth export guidance did the same
- docs copied the scaffolded path instead of describing the real rule

So the runtime logic and the user guidance drifted apart.

## Solution

Generate auth guidance from the resolved functions dir:

- default to `convex/auth.ts` when `convex.json` is absent
- use `<functionsDir>/auth.ts` when `convex.json.functions` is set
- emit that resolved path into generated `auth.ts` output

Keep the static-codegen contract. Only the path became dynamic.

Also update docs and skill references to say:

- auth definition lives at `<functionsDir>/auth.ts`
- generated auth runtime lives at `<functionsDir>/generated/auth.ts`
- scaffolded kitcn apps use `convex/functions/*` because that is what
  their `convex.json` config says

## Verification

- `bun test packages/kitcn/src/cli/codegen.test.ts packages/kitcn/src/integration/generated-api.integration.test.ts`
- `bun --cwd packages/kitcn build`
- `bun --cwd packages/kitcn typecheck`
- `bun lint:fix`

Root `bun typecheck` still fails on unrelated `example/` package-resolution and
typing issues, not on this auth-path change.

## Prevention

1. If generated output already respects `convex.json.functions`, docs and
   runtime guidance must use the same source of truth.
2. Test at least one generated auth case with a non-default functions dir.
3. Keep scaffold defaults and product contract separate. `convex/functions/*`
   is the scaffold default, not the universal rule.
