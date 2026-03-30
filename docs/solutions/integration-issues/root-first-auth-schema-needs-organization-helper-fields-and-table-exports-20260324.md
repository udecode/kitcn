---
title: Root-first auth schema needs organization helper fields and table exports
category: integration-issues
tags:
  - auth
  - cli
  - schema
  - orm
symptoms:
  - `kitcn add auth --schema --yes --no-codegen` rewrites auth schema, but generated auth tables are missing organization helper fields
  - example auth code references `userTable` / `sessionTable`, but root-first auth schema exports `user` / `session`
  - codegen fails after schema refresh because relations point at missing auth columns or app imports point at missing table exports
module: auth-cli
resolved: 2026-03-24
---

# Root-first auth schema needs organization helper fields and table exports

## Problem

Root-first auth schema refresh looked correct at first glance, but it broke real
apps in two ways.

First, Better Auth's `organization()` plugin did not produce every auth field
our app code expected. The generated auth tables included
`session.activeOrganizationId`, but they did not include
`user.lastActiveOrganizationId` or `user.personalOrganizationId`.

Second, the root-first ORM generator exported bare table identifiers like
`user`, `session`, and `organization`, while the rest of the app imported
`userTable`, `sessionTable`, and `organizationTable`.

That combination was enough to make schema-only auth refresh look successful
while codegen still failed right after.

## Root Cause

There were two separate mismatches.

1. We treated `getAuthTables(authOptions)` as the whole source of truth for the
   managed auth schema.
2. We rendered ORM table declarations with raw model-name identifiers instead
   of the `*Table` naming the rest of the project already used.

That was too literal.

For kitcn apps, organization auth needs a few extra schema affordances:

- `user.lastActiveOrganizationId`
- `user.personalOrganizationId`
- real foreign-key references for `session.activeOrganizationId`
- `*Table` exports that match normal app imports

Without those, the generated schema and the app code drift apart.

## Solution

Normalize Better Auth tables before rendering the managed schema.

The schema generators now:

1. augment organization auth with kitcn helper fields on `user`
2. upgrade session and team foreign-key fields to real references when the
   related tables exist
3. render ORM declarations as `userTable`, `sessionTable`, `accountTable`, and
   so on
4. keep table registration keyed by the real auth table names (`user`,
   `session`, `organization`, ...)

That gives root-first auth schema refresh the best of both worlds:

- app imports stay stable
- auth relations have the columns they point at
- schema-only refresh stays one-pass

## Verification

- `bun test packages/kitcn/src/auth/create-schema.test.ts packages/kitcn/src/auth/create-schema-orm.test.ts packages/kitcn/src/cli/registry/items/auth/reconcile-auth-schema.test.ts`
- `bun --cwd packages/kitcn typecheck`
- `bun --cwd packages/kitcn build`
- `bun lint:fix`
- `bunx kitcn add auth --schema --yes --no-codegen`

## Prevention

1. Better Auth table metadata is not always the full kitcn schema
   contract.
2. Managed schema generators should match the app's naming conventions, not
   invent a second style.
3. If example code imports generated auth tables, keep a live check that
   refreshing auth schema does not rename those exports under it.
