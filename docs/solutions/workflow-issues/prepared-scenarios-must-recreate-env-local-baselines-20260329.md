---
title: Prepared scenarios must recreate stripped .env.local baselines
date: 2026-03-29
category: workflow-issues
module: tooling
problem_type: workflow_issue
component: tooling
symptoms:
  - "`bun run scenario:test -- next-auth` fails with `CONVEX_SITE_URL is not set`"
  - "Prepared apps under `tmp/scenarios/**/project` can be missing `.env.local` entirely"
  - "`fixtures:check` stays green while runtime scenario lanes die on clean machines"
root_cause: missing_workflow_step
resolution_type: code_fix
severity: medium
tags:
  - scenarios
  - fixtures
  - env-local
  - next-auth
  - runtime
---

# Prepared scenarios must recreate stripped .env.local baselines

## Problem

Committed fixtures intentionally strip `.env.local`, but prepared scenario apps
still need a live local env file to boot Next/Vite runtime flows correctly.

That gap let fixture parity stay clean while runtime scenario lanes crashed on a
fresh checkout.

## Symptoms

- `bun run scenario:test -- next-auth` dies in the auth route with
  `CONVEX_SITE_URL is not set. This must be set in the environment.`
- `tmp/scenarios/next-auth/project/.env.local` does not exist after
  `scenario:prepare`
- Next auth fixtures compile, but runtime callers that depend on
  `NEXT_PUBLIC_CONVEX_SITE_URL` boot with `undefined`

## What Didn't Work

- Treating this like fixture drift was wrong. The committed fixture should not
  keep `.env.local`.
- The existing local-port patch only rewrote `.env.local` when the file already
  existed, so it could never repair prepared apps copied from stripped
  fixtures.

## Solution

Make `patchPreparedLocalDevPort()` recreate a baseline `.env.local` when a
prepared app is missing it, then patch the selected local dev port on top.

Detect the app shape from the prepared project and write the same baseline env
template used by scaffold init:

- Next apps get `renderInitNextEnvLocalTemplate()`
- Vite apps get `renderInitReactEnvLocalTemplate()`

Then keep the existing port rewrite logic so the recreated file ends with the
right local site URL.

## Why This Works

Fixture sync and runtime prep have different jobs:

- fixture sync should strip machine-local files from committed snapshots
- runtime prep should materialize whatever local files the app actually needs

Recreating `.env.local` at prepare time preserves both contracts instead of
forcing one workflow to lie for the other.

## Prevention

- Treat stripped fixture artifacts and prepared runtime artifacts as separate
  phases with separate rules.
- If a prepared scenario depends on local env keys, backfill them during
  prepare, not during fixture sync.
- Keep a direct regression test for missing `.env.local` recreation in
  `patchPreparedLocalDevPort()`.
- When a scenario fails only on clean machines, inspect `tmp/scenarios/**`
  before blaming the committed fixture.

## Related Issues

- [AppleDouble sidecars must be stripped from temp scaffolds](/Users/zbeyens/git/better-convex/docs/solutions/workflow-issues/appledouble-sidecars-must-be-stripped-from-temp-scaffolds-20260329.md)
