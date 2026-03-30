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
module: auth-cli
resolved: 2026-03-23
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

## Solution

Teach the registry planner a generic scaffold-file reconciliation seam, then use
it for auth.

Auth now:

1. loads the current `<functionsDir>/auth.ts` definition with `jiti`
2. derives auth tables with `getAuthTables(...)`
3. re-renders the managed schema file for the active mode
4. keeps `add auth` as the only public command users need to rerun

Mode-specific output stays intact:

- kitcn scaffold refreshes the schema extension file
- raw Convex adoption refreshes `<functionsDir>/authSchema.ts` with
  `export const authSchema = ...`

## Verification

- `bun test packages/kitcn/src/auth/create-schema-orm.test.ts packages/kitcn/src/auth/create-schema.test.ts packages/kitcn/src/cli/registry/index.test.ts packages/kitcn/src/cli/registry/planner.test.ts packages/kitcn/src/cli/registry/items/auth/reconcile-auth-schema.test.ts`
- `bun --cwd packages/kitcn build`
- `bun --cwd packages/kitcn typecheck`
- `bun lint:fix`

## Prevention

1. Managed scaffold files need a reconciliation seam, not one-off external CLI
   instructions.
2. Keep one public verb per capability. Installing and refreshing auth both
   belong to `add auth`.
3. If docs require users to hand-run a generator for a file the CLI already
   owns, the architecture is lying.
