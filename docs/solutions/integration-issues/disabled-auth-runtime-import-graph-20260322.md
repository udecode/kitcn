---
title: Disabled generated auth runtime must not import the full auth stack
category: integration-issues
tags:
  - auth
  - codegen
  - scenarios
  - concave
  - templates
  - runtime
symptoms:
  - `bun run scenario:test -- next` boots, then Concave logs a generated auth bundle error in a non-auth app
  - the error points at `convex/functions/generated/auth.ts`
  - the generated file reaches Better Auth runtime code even when `auth.ts` does not exist
module: codegen
resolved: 2026-03-22
---

# Disabled generated auth runtime must not import the full auth stack

## Problem

Plain Better Convex apps still generate `convex/functions/generated/auth.ts`
even when auth is disabled.

That part is fine. The problem was what the generated file imported.

In the disabled case it still imported from:

```ts
import { ... } from "better-convex/auth";
```

That pulled in the full auth surface, which in turn reached Better Auth
runtime code. On a non-auth app, Concave tried to bundle that generated module
and crashed on startup with a missing Better Auth runtime dependency.

## Root Cause

The package had one auth surface doing two jobs:

1. full auth runtime
2. disabled auth contract for generated code

The disabled contract only needs:

- `defineAuth`
- `GenericAuthDefinition`
- `BetterAuthOptionsWithoutDatabase`
- `AuthRuntime`
- `createDisabledAuthRuntime`
- `getGeneratedAuthDisabledReason`

But `better-convex/auth` also exports runtime pieces like `createAuthRuntime`
and Better Auth integration wiring. That made the disabled generated module
import too much.

## Solution

Split a cold export path:

```ts
better-convex/auth/generated
```

Then point disabled generated auth output at that path instead of the full auth
surface.

Implementation details:

- move disabled runtime helpers into
  `src/auth/generated-contract-disabled.ts`
- export the cold surface from `src/auth/generated.ts`
- add package export `./auth/generated`
- add a dedicated build entry for `auth/generated`
- keep full auth-enabled codegen on `better-convex/auth`
- switch only disabled codegen output to `better-convex/auth/generated`

## Verification

- `bun test packages/better-convex/src/cli/codegen.test.ts --test-name-pattern 'disabled auth runtime'`
- `bun test packages/better-convex/src/integration/generated-api.integration.test.ts --test-name-pattern 'disabled auth runtime'`
- `bun --cwd packages/better-convex build`
- `bun run fixtures:sync`
- `bun run scenario:test -- next`

Observed live result after the fix:

- plain `next` reaches ready
- no generated auth bundle error from Concave startup
- app returns `GET / 200`

## Prevention

1. Treat generated disabled code as its own runtime surface. Do not make it
   import the full feature stack.
2. If a generated module exists in non-feature apps, test that module on a
   real prepared runtime, not just by reading the file.
3. When a package export is used only by generated code, keep it cold and
   dependency-thin.

## Files Changed

- `packages/better-convex/src/auth/generated-contract-disabled.ts`
- `packages/better-convex/src/auth/generated.ts`
- `packages/better-convex/src/auth/generated-contract.ts`
- `packages/better-convex/src/cli/codegen.ts`
- `packages/better-convex/package.json`
- `packages/better-convex/tsdown.config.ts`
- `packages/better-convex/src/cli/codegen.test.ts`
- `packages/better-convex/src/integration/generated-api.integration.test.ts`
