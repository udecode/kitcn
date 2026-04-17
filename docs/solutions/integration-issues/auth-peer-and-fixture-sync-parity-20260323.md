---
title: Auth scaffold peer installs and fixture sync must follow the packaged CLI path
last_updated: 2026-04-17
category: integration-issues
tags:
  - auth
  - better-auth
  - opentelemetry
  - fixtures
  - cli
  - codegen
symptoms:
  - `bun check` fails in `fixtures:check` during temp app `kitcn codegen`
  - auth apps hit `Cannot find package '@opentelemetry/api'`
  - fresh Bun apps can warn during later `kitcn add ...` runs because `bun.lock` already carries Better Auth peers
  - plain non-auth apps can still fail codegen because the packaged CLI bundle imports Better Auth too early
  - fresh `kitcn add auth` runs can fail before scaffold with `Cannot find package 'better-auth'`
  - `fixtures:sync` can say snapshots are fresh while `fixtures:check` still reports drift
module: cli-fixtures-auth
resolved: 2026-03-31
---

# Auth scaffold peer installs and fixture sync must follow the packaged CLI path

## Problem

`bun check` was blocked by two different seams that looked like one:

1. Auth scaffolds installed `better-auth` but not its undeclared runtime peer
   `@opentelemetry/api`.
2. Plain non-auth fixture checks still blew up because the packaged CLI bundle
   imported `better-auth/db` at module load time through auth schema reconcile
   code, even when no auth scaffold was present.

That made `fixtures:check` fail in both auth and non-auth lanes, but for
different reasons.

## Root Cause

There were three separate mistakes:

1. The auth registry item treated `@opentelemetry/api` like a late scaffold
   hint even though auth planning can import Better Auth internals before any
   scaffold file is written.
2. Dependency hints only really behaved like bare package names. They did not
   understand exact install specs cleanly.
3. `fixtures:sync` and `fixtures:check` were not symmetric. `check` validated a
   packaged local install and reran codegen, while `sync` snapshotted the app
   earlier in the flow. That let generated fixture output drift even after a
   fresh sync.
4. Fresh app baselines still omitted `@opentelemetry/api`, so Bun could keep
   warning on later `bun add` operations even after the auth-specific planning
   fix landed.
5. First-pass auth schema registration still called
   `loadDefaultManagedAuthOptions()` when `auth.ts` did not exist yet. That
   pulled the managed Convex auth plugin into the published CLI before
   `better-auth` was installed.

## Solution

Install the missing auth runtime peer explicitly during auth scaffold:

- pin `@opentelemetry/api@1.9.0`
- install it as an auth planning dependency before the planner touches Better
  Auth internals
- teach dependency hints to treat exact install specs by package name when
  deciding whether a dependency is already present

Then stop Bun from rediscovering the same peer gap later:

- add `@opentelemetry/api@1.9.0` to fresh `init -t next` and `init -t vite`
  package baselines
- preinstall `@opentelemetry/api` before later plugin adds when `bun.lock`
  already contains `@better-auth/core` and the app still lacks the package

Then cut the hot auth import out of the CLI bundle:

- replace the top-level `better-auth/db` import in auth schema reconcile with a
  lazy dynamic import that only runs when auth schema reconciliation actually
  happens

Then keep first-pass auth scaffold on a static schema fallback:

- if `convex/functions/auth.ts` is missing, resolve the default managed auth
  schema from baked extension units instead of calling the Better Auth-backed
  fallback loader
- only reach for `loadDefaultManagedAuthOptions()` after auth is already
  present and the app can legitimately load Better Auth runtime code

Finally, make fixture sync mirror fixture check:

- sync the generated app through the same packaged local install + validation
  path before snapshotting it
- normalize generated Concave API files on the checked app before diffing

## Verification

- `bun test packages/kitcn/src/cli/registry/dependencies.test.ts packages/kitcn/src/cli/supported-dependencies.test.ts`
- `bun test ./packages/kitcn/src/cli/cli.commands.ts --test-name-pattern 'run\\(add auth --yes --no-codegen\\) patches the next baseline with minimal auth scaffolding|run\\(add auth --preset convex --yes\\) adopts a raw next convex app without kitcn baseline churn'`
- `bun test packages/kitcn/src/cli/registry/items/auth/reconcile-auth-schema.test.ts packages/kitcn/src/cli/registry/items/auth/auth-item.test.ts`
- `bun --cwd packages/kitcn build`
- fresh packed CLI smoke: `KITCN_INSTALL_SPEC=<tarball> bunx --bun --package <tarball> kitcn init -t next --yes`
- fresh packed CLI smoke: `bunx kitcn add auth --yes --no-codegen`
- fresh packed CLI smoke: `bunx kitcn codegen`
- fresh packed CLI smoke: `node node_modules/kitcn/dist/cli.mjs add auth --yes`

## Prevention

1. If a plugin needs extra runtime packages, make the registry own them. Do not
   rely on users discovering undeclared peers from stack traces.
2. If the planner can import a package before file writes, that package is a
   planning dependency, not a scaffold hint.
3. Keep the packaged CLI cold by default. Auth-only helpers must not drag Better
   Auth into plain scaffold flows at module load time.
4. Snapshot sync and snapshot check must execute the same product path, or the
   fixture diff becomes theater.
5. If Bun warnings only disappear after manually adding a package once, fix the
   generated app baseline or the CLI preflight. Do not teach users to ignore
   the warning.
6. First-pass auth scaffold must not require Better Auth runtime code just to
   compute the default managed schema.
