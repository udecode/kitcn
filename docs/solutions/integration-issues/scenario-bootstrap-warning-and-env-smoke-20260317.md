---
title: Scenario bootstrap warning and env smoke cleanup
category: integration-issues
tags:
  - convex
  - codegen
  - env
  - scenarios
  - tooling
  - bootstrap
symptoms:
  - bun run scenario:check:convex fails before scenario validation starts
  - tooling/node-env-smoke.ts throws Cannot find package 'dotenv'
  - adoption scenarios pass but log Failed to parse http.ts warnings
  - scaffolded http.ts files reference kitcn/server before the package is installed
module: scenario-tooling
resolved: 2026-03-17
---

# Scenario bootstrap warning and env smoke cleanup

## Problem

The dedicated Convex scenario lane failed immediately in repo tooling, even
though the main scenario lane still passed.

At the same time, adoption scenarios printed `Failed to parse http.ts`
warnings that looked like real breakage, but were just bootstrap noise.

## Root Cause

Two separate issues stacked together:

1. `tooling/node-env-smoke.ts` imported `dotenv` from the repo root. That
   package was not available in the tooling runtime, so the smoke check died
   before validating `env push` / `env pull`.
2. `packages/kitcn/src/cli/codegen.ts` always logged `http.ts` parse
   failures. In adoption fixtures, that parse can fail briefly because
   `http.ts` imports `kitcn/server` before `kitcn` is
   installed into the generated app.

The second case was expected during bootstrap, but the logger treated it like
any other `http.ts` failure.

## Solution

Use built-in env parsing in the smoke script:

```ts
import { parseEnv } from "node:util";

const parsed = parseEnv(pulledEnv);
```

Then keep `http.ts` failures loud only when they are real:

```ts
const shouldLogParseFailure =
  debug ||
  (file === "http.ts" && !shouldSuppressHttpParseWarning(error));
```

`shouldSuppressHttpParseWarning(...)` only matches the known missing
`kitcn/*` import shape. Everything else still logs.

## Verification

- `bun test packages/kitcn/src/cli/codegen.test.ts`
- `bun tooling/node-env-smoke.ts`
- `bun run scenario:check:convex`
- `bun run scenario:check` with zero `Failed to parse http.ts` lines in the
  captured log

## Prevention

1. Repo-root tooling should use Node/Bun built-ins or explicit root
   dependencies, not package-local transitive installs.
2. If bootstrap is expected to fail before local package installation, suppress
   only the exact known error shape. Never blanket-hide `http.ts` failures.
3. When cleaning up scenario noise, capture the full run log and grep for the
   warning. Eyeballing terminal output is how lies sneak in.

## Files Changed

- `tooling/node-env-smoke.ts`
- `packages/kitcn/src/cli/codegen.ts`
- `packages/kitcn/src/cli/codegen.test.ts`
