---
title: Auth schema-only reconcile breaks if the auth item drops applyScope
category: integration-issues
tags:
  - auth
  - cli
  - schema
  - scaffolding
symptoms:
  - `better-convex add auth --only schema --yes` still throws managed drift errors
  - the schema reconciler works when called directly, but the real command path fails
  - `example` cannot refresh only `schema.ts` and `plugins.lock.json`
module: auth-cli
resolved: 2026-03-24
---

# Auth schema-only reconcile breaks if the auth item drops applyScope

## Problem

`better-convex add auth --only schema --yes` existed on paper, but the real
auth install path still threw:

`Table "user" has drifted from the managed auth schema ...`

That made the new schema-only flow useless for real apps like `example`.

## Root Cause

The schema ownership engine already supported schema-only managed replacement
through `overwriteManaged`.

The break was one layer higher: the auth registry item destructured its
`buildSchemaRegistrationPlanFile` params and forgot to forward `applyScope`
into `buildAuthSchemaRegistrationPlanFile`.

So `--only schema` was parsed correctly, but the auth item silently downgraded
back to the full drift rules.

## Solution

Forward `applyScope` all the way through the auth registry item wrapper.

Once `buildAuthSchemaRegistrationPlanFile` sees `applyScope: "schema"`, it
passes `overwriteManaged: true` into root schema ownership and replaces stale
managed auth blocks without forcing a full auth scaffold rewrite.

## Verification

- `bun test packages/better-convex/src/cli/registry/items/auth/auth-item.test.ts --test-name-pattern 'schema-only auth reconcile forwards applyScope'`
- `bun test packages/better-convex/src/cli/registry/items/auth/auth-item.test.ts packages/better-convex/src/cli/commands/add.test.ts packages/better-convex/src/cli/registry/schema-ownership.test.ts --test-name-pattern 'schema-only auth reconcile forwards applyScope|only schema|drifted managed|reuses a fresh managed lock'`
- `bun --cwd packages/better-convex build`
- `bun --cwd packages/better-convex typecheck`
- `bun lint:fix`
- `cd example && bun run auth:schema -- --no-codegen`

## Prevention

1. Add thin wrapper tests around registry items, not just deep helper tests.
2. New scoped CLI modes are worthless unless the scope flag reaches the final
   integration seam.
3. Live example commands are good bullshit detectors for planner plumbing.
