---
title: Schema-only auth overwrite must not steal local auth tables
category: integration-issues
tags:
  - auth
  - cli
  - schema
  - ownership
  - overwrite
  - example
symptoms:
  - `better-convex add auth --only schema --overwrite --yes` rewrites local auth tables in `example/`
  - `convex/functions/plugins.lock.json` flips auth tables from `local` to `managed`
  - schema-only auth refresh is not lossless even when auth table ownership is explicit
module: auth-cli
resolved: 2026-03-27
---

# Schema-only auth overwrite must not steal local auth tables

## Problem

`better-convex add auth --only schema` exists so apps can refresh managed auth
schema output without disturbing app-owned auth code.

That contract broke on the `--overwrite` path.

If an app already marked auth tables as `local` in
`convex/functions/plugins.lock.json`, schema-only auth refresh could still
rewrite those tables as managed and replace the app-owned schema in
`example/convex/functions/schema.ts`.

## Root Cause

Root schema ownership handled two different overwrite meanings as if they were
the same thing.

`overwriteManaged` is supposed to mean "refresh managed blocks even if they
drifted." But `decideOwnership()` treated any `lockEntry.owner === "local"` as
fair game whenever `overwrite` was true.

Schema-only auth sync passes both:

- `overwrite: true`
- `overwriteManaged: true`

So the generic overwrite branch hijacked locally-owned auth tables even though
the schema lock already said they belonged to the app.

## Solution

Keep the ownership boundary hard.

When a table is already marked `local`, schema-only managed refresh leaves it
local even if `--overwrite` is present. `overwriteManaged` can still replace
drifted managed auth blocks, but it no longer steals app-owned ones.

That restores the intended split:

- managed auth schema refresh updates managed auth tables
- app-owned auth tables stay untouched
- `example/` remains lossless under schema-only auth reruns

## Verification

- `bun test packages/better-convex/src/cli/registry/schema-ownership.test.ts packages/better-convex/src/cli/registry/items/auth/auth-item.test.ts`
- `bun --cwd packages/better-convex build`
- `bun typecheck`
- `bun lint:fix`
- live proof in `example/`:
  - before: `schema.ts` hash `40e13735b9b4dfe0d705c57c19c82b97eac3a2c3`
  - before: `plugins.lock.json` hash `5656868a613a412f59acc474fc2d9d41e7290fce`
  - run: `bunx better-convex add auth --only schema --overwrite --yes`
  - result: `0 updated, 2 skipped`
  - after: both hashes unchanged

## Prevention

1. `overwriteManaged` must only mean "replace managed drift," never "claim
   local tables too."
2. Schema locks are the source of truth for ownership. Once a table is marked
   `local`, refresh flows must treat that as a hard boundary.
3. Keep at least one live proof against `example/` for auth schema sync. That
   app is the real trap, not the toy scaffolds.
