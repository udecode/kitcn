---
title: Auth schema-only refresh should bootstrap ownership from existing scaffold
category: integration-issues
tags:
  - auth
  - cli
  - schema
  - scaffolding
symptoms:
  - `better-convex add auth --only schema --yes` fails in an already-auth-wired app
  - `plugins.lock.json` has no `auth` entry, so schema-only refresh refuses to run
  - apps like `example` need auth schema refresh without rerunning full auth scaffold
module: auth-cli
resolved: 2026-03-24
---

# Auth schema-only refresh should bootstrap ownership from existing scaffold

## Problem

`better-convex add auth --only schema --yes` still failed in apps that already
had the default Better Convex auth scaffold on disk but no `auth.schema` entry
in `plugins.lock.json`.

That made the command useless for real projects that had auth files and root
schema tables already, but had lost or never written schema ownership state.

## Root Cause

The command treated `plugins.lock.json` as the only proof that managed auth
schema existed.

That was too narrow:

1. `add.ts` blocked schema-only refresh before planning if `auth.schema` was
   missing from the lockfile
2. after that guard was relaxed, root schema ownership still treated untracked
   auth tables as local conflicts because there was no prior lock entry

So the flow knew how to refresh managed auth schema, but it had no first-claim
path for an already scaffolded app.

## Solution

Use the existing Better Convex auth scaffold as the bootstrap source of truth.

Schema-only refresh now:

1. allows execution when the default auth scaffold files already exist on disk
2. still rejects raw Convex auth via `authSchema.ts`
3. treats the first schema-only run with no auth schema lock as a managed claim
   for auth-owned tables
4. writes `convex/functions/schema.ts` and `convex/functions/plugins.lock.json`
   without rewriting the rest of the auth scaffold

## Verification

- `bun test packages/better-convex/src/cli/cli.commands.ts --test-name-pattern 'fails clearly before auth scaffold exists|works without an existing auth lock entry'`
- `bun test packages/better-convex/src/cli/registry/items/auth/auth-item.test.ts --test-name-pattern 'schema-only auth reconcile forwards applyScope|claims existing auth tables'`
- `bun --cwd packages/better-convex build`
- `bun --cwd packages/better-convex typecheck`
- `bun lint:fix`
- `cd example && bun run auth:schema`

## Prevention

1. Schema-only commands should key off real scaffold state, not just lockfile
   memory.
2. If a command can repair state, don’t make that state a hard prerequisite.
3. Keep command-level tests for lockfile-loss cases. They happen.
