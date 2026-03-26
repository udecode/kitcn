---
title: Local auth codegen must sync env before auth config analysis
category: integration-issues
tags:
  - codegen
  - auth
  - env
  - scenarios
  - cli
  - bun-check
symptoms:
  - `bun check` fails in `scenario:check -- convex-next-all`
  - local `better-convex codegen` fails in auth-enabled Convex apps even though `convex/.env` already contains the needed values
  - auth config analysis reports missing env like `DEPLOY_ENV`
module: cli-codegen-auth-env
resolved: 2026-03-26
---

# Local auth codegen must sync env before auth config analysis

## Problem

`bun check` was green through the static gates, then died in the runtime
scenario lane for `convex-next-all`.

The failure looked like broken auth config, but the app already had the right
values in `convex/.env`.

## Root Cause

Local `better-convex codegen` could bootstrap a local backend and then jump
straight into Convex codegen without first pushing `convex/.env` into that
local deployment.

That meant auth-enabled apps reached auth config analysis with disk env ready
but deployment env still stale. `init` already owned an env prepare/complete
flow, but plain `codegen` and callers that reused it did not.

## Solution

Make package codegen auth-aware for local Convex targets:

1. detect whether auth is installed before local codegen
2. run `syncEnv(..., authSyncMode: "prepare")` before Convex codegen
3. run `syncEnv(..., authSyncMode: "complete")` after codegen when runtime is
   ready
4. keep both steps best-effort so cold callers can still fall back to their own
   live bootstrap path

Then keep init-owned bootstrap from doing the same work twice by disabling the
auto-sync branch when `init` already owns the explicit prepare/bootstrap/
complete sequence.

## Verification

- `bun test packages/better-convex/src/cli/cli.commands.ts --test-name-pattern 'run\\(codegen\\) calls generateMeta first and then invokes convex codegen with merged args|run\\(codegen\\) bootstraps local convex once when the backend is not running|run\\(codegen\\) prepares and completes auth env for local auth-enabled convex apps'`
- `bun test packages/better-convex/src/cli/commands/add.test.ts packages/better-convex/src/cli/commands/init.test.ts --test-name-pattern 'reuses a running local convex backend for auth live bootstrap|falls back to local bootstrap when auth live bootstrap probe fails|runs local bootstrap after in-place adoption when --yes defaults bootstrap|resolves explicit --config paths before default adoption bootstrap|syncs auth env around fallback init bootstrap before skipping duplicate local bootstrap'`
- `bun lint:fix`
- `bun typecheck`
- `bun --cwd packages/better-convex build`
- `bun run scenario:check -- convex-next-all`
- `bun check`

## Prevention

1. Treat local auth codegen as a deployment-aware operation, not a pure file
   generator.
2. If auth config can read deployment env, codegen must prepare that env before
   analysis.
3. Shared bootstrap helpers need an explicit owner. If `init` already owns env
   sync, nested codegen must not blindly do it again.
