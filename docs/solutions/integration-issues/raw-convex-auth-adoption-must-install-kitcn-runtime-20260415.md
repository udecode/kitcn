---
title: Raw Convex auth adoption must install kitcn runtime before codegen
date: 2026-04-15
category: integration-issues
module: auth-adoption
problem_type: integration_issue
component: tooling
severity: high
symptoms:
  - '`kitcn add auth --preset convex --yes` fails during Convex bootstrap with `Could not resolve "kitcn/auth"` or `Could not resolve "kitcn/auth/http"`'
  - raw Convex auth adoption writes `convex/auth.ts`, `convex/http.ts`, and `src/lib/convex/auth-client.ts`, but the app `package.json` still lacks `kitcn`'
  - local scenario runs with `KITCN_INSTALL_SPEC` can end up with duplicate `kitcn` dependency keys if the hint is pre-resolved too early'
root_cause: missing_tooling
resolution_type: code_fix
tags:
  - convex
  - auth
  - cli
  - scaffolding
  - package-management
  - scenarios
---

# Raw Convex auth adoption must install kitcn runtime before codegen

## Problem

The raw Convex auth preset generated files that import `kitcn/*`, but the
install plan only guaranteed `better-auth` and OpenTelemetry.

That meant `kitcn add auth --preset convex --yes` could scaffold the right
files and then immediately die when Convex tried to bundle them.

## Symptoms

- `convex/auth.ts` imports `kitcn/auth`, but the app has no `kitcn`
  dependency
- Convex bootstrap fails before JWKS sync with unresolved `kitcn/*` imports
- local scenario runs can show duplicate `kitcn` keys in `package.json` if the
  dependency hint is stored as a pre-resolved tarball path

## What Didn't Work

- treating `better-auth` as the only runtime dependency for the raw preset
- storing the raw preset hint as an already-resolved install spec like
  `file:/.../kitcn-0.12.27.tgz`

The second cut was especially sneaky: it fixed published installs, but it
defeated package-name detection during local scenario runs, so the CLI could no
longer tell that `kitcn` was already present.

## Solution

Keep the raw preset dependency hint at the package-name level:

- declare `kitcn` as a raw auth scaffold dependency hint
- resolve that hint to the current package install spec only at install time

That keeps both paths honest:

1. published CLI runs install `kitcn@<current-version>`
2. local scenario runs still collapse to the tarball override from
   `KITCN_INSTALL_SPEC`
3. duplicate detection still works because the missing-dependency scan compares
   against the raw package name `kitcn`, not a tarball URL

## Why This Works

The raw preset contract is different from the managed kitcn baseline.

Managed apps already depend on `kitcn`, so auth scaffolding can assume the
runtime helpers exist. Raw Convex adoption cannot. It patches a foreign app in
place, so every emitted `kitcn/*` import must be matched by an explicit
dependency install before codegen or local bootstrap runs.

Resolving the install spec too early turns `kitcn` into an opaque file URL,
which breaks the package-name check that prevents duplicate installs.

## Prevention

1. If a preset emits `kitcn/*` imports into an app that did not come from
   `kitcn init`, treat `kitcn` as an explicit scaffold dependency.
2. Keep dependency hints as package-name specs until install time. Resolve
   local tarball overrides as late as possible.
3. Keep `raw-start-auth-adoption` in the scenario gate. This bug is easy to
   miss in file-only tests and obvious in the real bootstrap lane.

## Related Issues

- `docs/solutions/integration-issues/raw-convex-auth-adoption-bootstrap-20260318.md`
- `docs/solutions/integration-issues/raw-convex-start-auth-adoption-must-patch-start-provider-and-react-client-20260410.md`
