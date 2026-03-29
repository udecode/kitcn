---
title: Root auth schema sync should merge missing fragments into local tables
category: integration-issues
tags:
  - auth
  - cli
  - schema
  - typescript
  - ast
  - example
symptoms:
  - `kitcn add auth --schema --yes` leaves compatible local auth tables stale because the lock says they are local
  - auth plugin changes like `username()` or `displayUsername()` do not land in forked app schemas such as `example/`
  - schema-only auth refresh needs app-specific cleanup guidance without stealing or deleting local schema
module: auth-cli
resolved: 2026-03-28
---

# Root auth schema sync should merge missing fragments into local tables

## Problem

Root `schema.ts` was using the wrong abstraction.

The old ownership model treated each auth table as an all-or-nothing unit:

1. managed tables could be replaced
2. local tables were skipped

That sounded safe, but it was too blunt for real apps. `example/` keeps a
forked auth schema on purpose. When auth plugins added compatible fields,
indexes, or relations, schema-only refresh had no smart path forward. It could
either rewrite too much or refuse to patch anything useful.

## Root Cause

The root schema reconcile path was reasoning about ownership instead of
structure.

For dedicated generated files, ownership is fine. For root `schema.ts`, it is
not. The real question is not "who owns this whole table?" The real question
is "what schema fragments are already here, and are they compatible with the
plugin fragments we want to add?"

That mismatch caused two bad behaviors:

- older fixes tried to keep local tables as a hard skip, which blocked valid
  additive updates
- overwrite paths tempted the CLI to replace too much because replacement was
  the only tool it had

## Solution

Change root auth schema sync to an additive TypeScript AST merge.

`reconcileRootSchemaOwnership()` now parses `schema.ts` and handles root auth
schema refresh structurally:

1. add missing table declarations and table registrations
2. merge missing fields into existing compatible tables
3. merge missing indexes into existing index callbacks
4. merge missing relation entries into the existing `.relations(...)` chain
5. keep local tables local in `plugins.lock.json`
6. throw on real conflicts instead of guessing
7. emit manual cleanup warnings when stale lockfile schema tables no longer
   match the plugin plan

That gives the command the behavior it actually needs:

- compatible custom schema stays intact
- missing auth plugin fragments land automatically
- incompatible schema fails loudly with a precise error
- stale cleanup is warning-only instead of destructive

## Verification

- `bun test packages/kitcn/src/cli/registry/schema-ownership.test.ts packages/kitcn/src/cli/registry/items/auth/auth-item.test.ts`
- `bun --cwd packages/kitcn build`
- `bun lint:fix`
- live proof against `example/`:
  - before: `example/convex/functions/schema.ts` did not contain
    `displayUsername`
  - run: `bunx kitcn add auth --schema --yes`
  - result: `example/convex/functions/schema.ts` gained
    `displayUsername: text(),`
  - result: `example/convex/functions/plugins.lock.json` stayed unchanged and
    kept auth tables marked `local`

## Prevention

1. Use ownership for dedicated generated files, not for the root schema merge
   itself.
2. For root `schema.ts`, merge compatible fragments and reject only true
   conflicts.
3. If cleanup is ambiguous, warn. Do not delete app schema automatically.
