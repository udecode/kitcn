---
title: Scenario tooling must run the packaged Node CLI, not the Bun source CLI
category: integration-issues
tags:
  - scenarios
  - cli
  - bun
  - node
  - module-resolution
  - create-convex
symptoms:
  - `bun run scenario:test -- create-convex-nextjs-shadcn` fails during local `better-convex init --yes`
  - the same prepared scenario app works when running the installed `better-convex` binary directly
  - anonymous scenario homes produce fake module-resolution errors like missing `zod/v4` from the packaged runtime
module: scenarios
resolved: 2026-03-28
---

# Scenario tooling must run the packaged Node CLI, not the Bun source CLI

## Problem

The `create-convex-nextjs-shadcn` scenario lane was red even though the actual
generated app was fine.

The failure only appeared inside the scenario harness while it was running local
CLI steps like `better-convex init --yes`. Replaying the same flow with the
installed package binary inside the prepared scenario app passed.

That meant the scenario runner was validating a toolchain users do not run.

## Root Cause

Scenario tooling was invoking the repo source CLI with Bun:

```txt
bun packages/better-convex/src/cli/cli.ts ...
```

That path is not the shipped contract. The shipped CLI is
`packages/better-convex/dist/cli.mjs` under Node.

In anonymous scenario homes, the Bun source-CLI path produced false
module-resolution failures while the packaged Node CLI worked under the same
project and `HOME`.

## Solution

Make scenario tooling execute the same CLI surface users actually get:

1. build the package first
2. run `packages/better-convex/dist/cli.mjs`
3. invoke it with `node`, not Bun

That moves scenario validation onto the real packaged contract and avoids Bun
source-runtime quirks that do not affect shipped usage.

## Verification

- targeted regression test proving local scenario CLI commands use:
  - `node`
  - `packages/better-convex/dist/cli.mjs`
- `bun test tooling/scenarios.test.ts`
- `bun run scenario:test -- create-convex-nextjs-shadcn`
- `bun typecheck`
- `bun lint:fix`
- `bun check`

## Prevention

1. Scenario tooling should exercise shipped package surfaces, not repo-only
   implementation entrypoints.
2. If a scenario fails but the installed package binary works in the prepared
   app, assume the harness is lying before you blame the product.
3. Bun is fine for repo tooling, but not as a silent stand-in for a Node CLI
   contract.
