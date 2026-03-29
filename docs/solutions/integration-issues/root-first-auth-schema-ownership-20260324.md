---
title: Root-first auth schema ownership needs fragment locks and real generator checks
category: integration-issues
tags:
  - auth
  - cli
  - schema
  - scaffolding
  - codegen
symptoms:
  - `kitcn add auth` needs to patch root `schema.ts` instead of extending a separate auth schema file
  - rerunning `add auth` must preserve local schema ownership decisions per auth table
  - fixture sync can fail after root-schema insertion with broken `.relations(...)` output
  - schema finalization can crash on generated auth indexes that reference missing columns
module: auth-cli
resolved: 2026-03-24
---

# Root-first auth schema ownership needs fragment locks and real generator checks

## Problem

Default auth scaffold ownership lived in the wrong place.

`kitcn add auth` wrote a separate auth schema file, then patched root
`schema.ts` through `authExtension()`. That kept root schema clean, but it made
real ownership fuzzy:

- users still wanted auth tables to live in root `schema.ts`
- reruns needed per-table conflict handling, not file-level overwrite logic
- local vs managed ownership had nowhere durable to live

## Root Cause

The old flow treated auth schema as one managed scaffold file. That broke down
once auth moved into root schema:

1. ownership had to be remembered per auth table, not per file
2. the patcher had to own declaration, registration, and relation fragments
   together
3. the auth schema generator had stale assumptions that the old extension path
   did not expose quickly enough

Two real bugs fell out immediately:

- fresh `.relations(...)` insertion forgot trailing commas on managed relation
  blocks
- manual Better Auth index config still asked for `user.userId`, which does
  not exist

## Solution

Move the default kitcn auth path to root-first schema ownership.

`add auth` now:

1. patches auth-owned table fragments directly into `<functionsDir>/schema.ts`
2. stores per-table ownership and managed checksums in
   `<functionsDir>/plugins.lock.json`
3. reuses stored ownership in `--yes`
4. requires `--overwrite` for first-time claims and managed drift replacement
5. keeps raw `--preset convex` on its existing `<functionsDir>/authSchema.ts`
   path

To make that hold up in practice:

- relation insertion now forces trailing commas on fresh managed relation
  blocks
- manual auth index generation now skips missing fields instead of falling back
  to stale static names

## Verification

- `bun test packages/kitcn/src/cli/registry/schema-ownership.test.ts packages/kitcn/src/cli/registry/index.test.ts packages/kitcn/src/cli/registry/planner.test.ts packages/kitcn/src/cli/registry/items/auth/auth-item.test.ts packages/kitcn/src/cli/registry/items/auth/reconcile-auth-schema.test.ts packages/kitcn/src/cli/cli.commands.ts --test-name-pattern 'add auth|plugin stack|schema ownership|root schema'`
- `bun test packages/kitcn/src/auth/create-schema-orm.test.ts packages/kitcn/src/auth/create-schema.test.ts packages/kitcn/src/cli/registry/schema-ownership.test.ts`
- `bun --cwd packages/kitcn typecheck`
- `bun --cwd packages/kitcn build`
- `bun lint:fix`
- `bun run fixtures:sync`
- `bun run fixtures:check`
- `bun run scenario:test -- next-auth`

## Prevention

1. Root-schema ownership needs fragment-level locks, not “managed file” hand
   waving.
2. Schema patch tests must use the real fragment shape that codegen extracts.
   Nice-looking fake inputs miss syntax bugs.
3. Static Better Auth index maps must never assume a field exists. If the field
   is gone, skip the index.
