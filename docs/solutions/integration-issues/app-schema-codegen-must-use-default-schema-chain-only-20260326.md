---
title: App schema codegen must use the default schema chain only
category: integration-issues
tags:
  - codegen
  - orm
  - schema
  - docs
  - example
symptoms:
  - docs show both `defineSchema(...).relations(...)` and `export const relations = defineRelations(...)` as valid app patterns
  - `better-convex codegen` accepts named `relations` or `triggers` exports from `schema.ts`
  - CLI schema patching mutates standalone `defineRelations(...)` helpers instead of the default schema chain
module: cli-codegen-orm
resolved: 2026-03-26
---

# App schema codegen must use the default schema chain only

## Problem

The app schema surface had drifted into two competing styles:

1. chain relations and triggers on the default schema export
2. export standalone `relations` / `triggers` helpers from `schema.ts`

That made the docs contradictory, let codegen branch on two app contracts, and
let CLI schema patching keep old helper-style schemas alive.

## Root Cause

We fixed an earlier regression by teaching codegen to trust explicit
`relations` exports. That solved the immediate example break, but it preserved
the wrong abstraction: app codegen was still pretending two schema styles were
first-class.

Once that branch existed, the repo immediately drifted:

- `schema/index.mdx` taught `.relations(...)`
- `relations.mdx` kept teaching standalone `defineRelations(...)`
- `example` regressed back to `export const relations = defineRelations(...)`
- schema patching still edited helper-style relation objects

## Solution

Hard-cut the app schema contract back to one path:

1. app schemas use `export default defineSchema(...).relations(...).triggers(...)`
2. codegen rejects named `relations` exports in `schema.ts`
3. codegen rejects named `triggers` exports in `schema.ts` and `triggers.ts`
4. generated server and migration helpers type against the default schema
   export only
5. root schema patching rejects standalone `defineRelations(...)` helper
   schemas instead of mutating them
6. `example` moved back to chained `.relations(...)`

The low-level ORM helpers still exist, but they are not a supported app schema
codegen contract anymore.

## Verification

- `bun test packages/better-convex/src/cli/codegen.test.ts packages/better-convex/src/cli/registry/schema-ownership.test.ts`
- `cd example && bun run codegen`
- `cd example && bun run typecheck`
- `bun typecheck`
- `bun lint:fix`
- `bun --cwd packages/better-convex build`

## Prevention

1. App docs get one blessed schema shape. No equal-weight alternatives.
2. If codegen cannot round-trip a schema style cleanly, reject it instead of
   carrying a second branch forever.
3. CLI schema patching should only mutate the current public contract, not
   preserve old helper-era layouts.
