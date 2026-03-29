---
title: Internal example typechecks must resolve workspace packages to source
category: integration-issues
tags:
  - typecheck
  - workspaces
  - example
  - resend
  - rebrand
symptoms:
  - `bun check` fails in CI while local example work still looks fine
  - `example#typecheck` says it cannot find `@kitcn/resend`
  - internal apps only fail after a package rename or fresh checkout
module: example-workspace-typecheck
resolved: 2026-03-29
---

# Internal example typechecks must resolve workspace packages to source

## Problem

The repo `example` app was typechecking Convex files as if workspace packages
were already built and published. That passed locally when old `dist/` output
was lying around, then blew up in CI on a fresh checkout after the rebrand to
`@kitcn/resend`.

## Root Cause

`example/convex/functions/tsconfig.json` had no workspace path mapping, so
`tsc` tried to resolve `kitcn/*` and `@kitcn/resend` through package exports.
That is the wrong contract for an internal monorepo app. It depends on built
`dist/` output and package metadata instead of the current source tree.

Pointing the example at source immediately exposed one real source typing bug:
`createEnv()` was pretending an empty snapshot was a full `NodeJS.ProcessEnv`
object, which Bun's stricter env typing rejects.

## Solution

Treat internal repo apps as source consumers, not published-package consumers.

- add workspace `paths` in the example tsconfigs so `kitcn/*` and
  `@kitcn/resend` resolve directly to `packages/**/src`
- keep runtime env helpers typed as plain string maps when they build synthetic
  snapshots instead of lying with `NodeJS.ProcessEnv`

## Verification

- `bun --cwd packages/kitcn build`
- `cd example && bun run typecheck`
- `bun typecheck`
- `bun lint:fix`
- `bun check`

## Prevention

1. Internal examples and scenarios should typecheck against workspace source.
   Only packed-install scenarios should prove published package metadata.
2. Fresh CI checkouts are the honest test for monorepo resolution. Local
   `dist/` leftovers are not proof.
3. Helper APIs that accept synthetic env snapshots should use generic string
   maps, not full `ProcessEnv` types.
