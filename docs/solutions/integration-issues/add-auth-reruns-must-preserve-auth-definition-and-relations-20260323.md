---
title: Add auth reruns must preserve the auth definition and regenerate relations
category: integration-issues
tags:
  - auth
  - cli
  - schema
  - relations
  - scaffolding
  - example
symptoms:
  - rerunning `better-convex add auth --overwrite` overwrites user-authored `auth.ts` or `auth.config.ts`
  - apps that already own auth tables can get duplicate auth schema registration
  - managed auth schema files drift when auth plugins are added, removed, or replaced
  - scaffolded auth schema output misses `.relations(...)` that apps expect
module: auth-cli
resolved: 2026-03-23
---

# Add auth reruns must preserve the auth definition and regenerate relations

## Problem

`example/` is the real stress case for `better-convex add auth`.

It already owns auth-heavy app code, already defines local auth tables in its
root schema, and changes Better Auth plugins over time. Rerunning `add auth`
has to refresh the managed auth schema file without stomping on the current
auth definition.

That was not true.

Three separate failures showed up:

- rerunning `add auth --overwrite` could overwrite `auth.ts` and
  `auth.config.ts`
- apps with local auth tables could get duplicate schema registration attempts
- generated auth schema output did not include ORM `.relations(...)`

## Root Cause

The ownership model was split in the wrong place.

The auth schema reconcile step already treated `<functionsDir>/auth.ts` as the
source of truth when deriving Better Auth tables. But the scaffold planner
still treated `auth.ts` and `auth.config.ts` like fully managed files on
reruns.

So the same command that was supposed to read the current auth definition could
overwrite it.

At the same time, auth schema registration assumed every app wanted
`authExtension()` injected into the root schema, even when the app already
owned the auth tables locally. And the ORM auth schema generator only emitted
tables and foreign keys, not the relation graph that app code expects.

## Solution

Keep one source of truth and make the ownership boundaries explicit.

`add auth` now:

1. preserves user-owned `auth.ts` and `auth.config.ts` on reruns
2. refreshes the managed auth schema file from the current auth definition
3. skips schema registration when the app already owns the auth tables locally
4. generates ORM `.relations(...)` for scaffolded auth schema output

That gives the command the right behavior for plugin churn:

- remove plugins and stale auth tables disappear
- add plugins and new tables appear
- replace plugins and the managed schema tracks the new auth definition
- local auth runtime files stay intact

## Verification

- `bun test packages/better-convex/src/cli/registry/items/auth/reconcile-auth-schema.test.ts packages/better-convex/src/cli/registry/items/auth/auth-item.test.ts packages/better-convex/src/auth/create-schema-orm.test.ts`
- `bun --cwd packages/better-convex build`
- `bun --cwd packages/better-convex typecheck`
- live example churn with `bun run gen:auth -- --overwrite --no-codegen` for:
  - base `convex()` only
  - `admin()`
  - `organization()`
  - `admin() + organization()`

## Prevention

1. If a rerun command reads a file as source of truth, that file is not
   scaffold-managed anymore.
2. Schema registration must respect apps that already own their auth tables.
3. Auth schema generation is not complete without relations. Foreign keys alone
   are not enough for ORM callers.
