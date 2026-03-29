---
title: Auth scaffold peer installs and fixture sync must follow the packaged CLI path
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
  - plain non-auth apps can still fail codegen because the packaged CLI bundle imports Better Auth too early
  - `fixtures:sync` can say snapshots are fresh while `fixtures:check` still reports drift
module: cli-fixtures-auth
resolved: 2026-03-23
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

1. The auth registry item only installed `better-auth`. Extra runtime deps were
   available through scaffold dependency hints, but auth was not using them.
2. Dependency hints only really behaved like bare package names. They did not
   understand exact install specs cleanly.
3. `fixtures:sync` and `fixtures:check` were not symmetric. `check` validated a
   packaged local install and reran codegen, while `sync` snapshotted the app
   earlier in the flow. That let generated fixture output drift even after a
   fresh sync.

## Solution

Install the missing auth runtime peer explicitly during auth scaffold:

- pin `@opentelemetry/api@1.9.0`
- attach it as a dependency hint to both auth scaffold presets
- teach dependency hints to treat exact install specs by package name when
  deciding whether a dependency is already present

Then cut the hot auth import out of the CLI bundle:

- replace the top-level `better-auth/db` import in auth schema reconcile with a
  lazy dynamic import that only runs when auth schema reconciliation actually
  happens

Finally, make fixture sync mirror fixture check:

- sync the generated app through the same packaged local install + validation
  path before snapshotting it
- normalize generated Concave API files on the checked app before diffing

## Verification

- `bun test packages/kitcn/src/cli/registry/dependencies.test.ts packages/kitcn/src/cli/supported-dependencies.test.ts`
- `bun test ./packages/kitcn/src/cli/cli.commands.ts --test-name-pattern 'run\\(add auth --yes --no-codegen\\) patches the next baseline with minimal auth scaffolding|run\\(add auth --preset convex --yes\\) adopts a raw next convex app without kitcn baseline churn'`
- `bun test packages/kitcn/src/cli/registry/items/auth/reconcile-auth-schema.test.ts`
- `bun --cwd packages/kitcn build`
- `bun run fixtures:sync`
- `bun run fixtures:check`
- `bun check`

## Prevention

1. If a plugin needs extra runtime packages, make the registry own them. Do not
   rely on users discovering undeclared peers from stack traces.
2. If dependency hints can install packages, they must understand exact install
   specs too.
3. Keep the packaged CLI cold by default. Auth-only helpers must not drag Better
   Auth into plain scaffold flows at module load time.
4. Snapshot sync and snapshot check must execute the same product path, or the
   fixture diff becomes theater.
