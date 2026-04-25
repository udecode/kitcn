---
title: Auth schema reconciliation belongs to add auth
category: integration-issues
tags:
  - auth
  - cli
  - schema
  - scaffolding
  - docs
symptoms:
  - docs tell users to run `@better-auth/cli generate` by hand after changing auth plugins or auth fields
  - managed auth schema files drift from the current auth definition
  - raw Convex and kitcn auth paths use different generated files but need the same refresh behavior
  - `kitcn add auth --preset convex --yes` reports the generated raw Convex auth schema in "Skipped files" after auth plugins change
module: auth-cli
resolved: 2026-03-23
last_updated: 2026-04-23
---

# Auth schema reconciliation belongs to add auth

## Problem

The auth install flow already owned managed schema files:

- kitcn scaffold writes `convex/lib/plugins/auth/schema.ts`
- raw Convex adoption writes `<functionsDir>/authSchema.ts`

But the docs still told users to run `@better-auth/cli generate` by hand when
the auth definition changed.

That split the ownership model in half. `add auth` installed the auth scaffold,
then some other CLI was supposed to keep it fresh.

## Root Cause

The registry planner rendered auth schema files from static templates only.
There was no reconciliation step that loaded the current auth definition and
re-rendered the managed schema file from real auth tables.

So rerunning `kitcn add auth` could patch routes and other files, but
it could not refresh the managed auth schema file from the current auth
options.

A later raw Convex failure exposed the apply-layer half of the same ownership
contract. Reconciliation computed fresh `authSchema.ts` content, but scaffold
files with a template id require explicit overwrite by default. In
non-interactive `--yes` mode, the generated schema was skipped unless the user
deleted the file or passed `--overwrite`.

## Solution

Teach the registry planner a generic scaffold-file reconciliation hook, then
use it for auth.

Auth now:

1. loads the current `<functionsDir>/auth.ts` definition with `jiti`
2. derives auth tables with `getAuthTables(...)`
3. re-renders the managed schema file for the active mode
4. keeps `add auth` as the only public command users need to rerun

Mode-specific output stays intact:

- kitcn scaffold refreshes the schema extension file
- raw Convex adoption refreshes `<functionsDir>/authSchema.ts` with
  `export const authSchema = ...`

Generated auth schema files also carry managed-update policy through the
scaffold planner:

```ts
nextFiles[index] = {
  ...nextFiles[index]!,
  content,
  requiresExplicitOverwrite: false,
};
```

That lets `kitcn add auth --preset convex --yes` refresh generated schema
content while preserving user-owned auth runtime, config, and client files.

## Verification

- `bun test packages/kitcn/src/auth/create-schema-orm.test.ts packages/kitcn/src/auth/create-schema.test.ts packages/kitcn/src/cli/registry/index.test.ts packages/kitcn/src/cli/registry/planner.test.ts packages/kitcn/src/cli/registry/items/auth/reconcile-auth-schema.test.ts`
- `bun --cwd packages/kitcn build`
- `bun --cwd packages/kitcn typecheck`
- `bun lint:fix`
- `bun test packages/kitcn/src/cli/cli.commands.ts -t "regenerates raw convex auth schema"`
- `bun run test:cli`
- `bun test packages/kitcn/src/cli/registry/planner.test.ts packages/kitcn/src/cli/registry/items/auth/reconcile-auth-schema.test.ts`
- `bun typecheck`

## Prevention

1. Managed scaffold files need a reconciliation hook, not one-off external CLI
   instructions.
2. Keep one public verb per capability. Installing and refreshing auth both
   belong to `add auth`.
3. If docs require users to hand-run a generator for a file the CLI already
   owns, the architecture is lying.
4. Preserve user-authored scaffold files and auto-refresh generated schema
   files with separate apply policies. `--yes` should skip user edits, not skip
   managed schema regeneration.
