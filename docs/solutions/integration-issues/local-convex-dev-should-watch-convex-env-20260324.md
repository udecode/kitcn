---
title: Local Convex dev should watch convex/.env and auto-sync edits
problem_type: integration_issue
component: development_workflow
root_cause: missing_workflow_step
tags:
  - convex
  - dev
  - env
  - auth
  - jwks
  - scenarios
severity: medium
symptoms:
  - local Convex dev requires a manual env push after editing convex/.env
  - auth bootstrap feels two-pass during a single dev session
  - scenario tooling still references removed env push auth flags
---

# Local Convex dev should watch convex/.env and auto-sync edits

## Problem

`kitcn dev` already handled the internal two-phase auth bootstrap on
backend `convex`, but it stopped there. After startup, local edits to
`convex/.env` still required a manual `kitcn env push`, which is dumb
for an active dev session.

The same seam left stale tooling behind: Convex auth scenarios still called
`kitcn env push --auth` even though that flag was hard-cut.

## Root cause

The CLI treated env sync as a startup-only step instead of a live local-dev
responsibility.

So the flow was:

1. prepare env before startup
2. finish auth env sync after backend readiness
3. make the user manually push later edits

That split leaked internal lifecycle details into normal local dev.

## Fix

Keep the real two-phase auth bootstrap, then add a Convex-only watcher on
`convex/.env` during `kitcn dev`.

Implementation rules:

1. Watch only on backend `convex`.
2. Debounce file events.
3. Wait for the initial auth env completion pass before syncing later edits.
4. Snapshot `convex/.env` content before and after sync so generated writes
   like `BETTER_AUTH_SECRET` do not trigger infinite loops.

Keep `kitcn env push` for:

- one-off syncs outside dev
- `--prod`
- `--rotate`
- explicit repair

Then hard-cut stale scenario/bootstrap refs to the removed `--auth` flag.

## Verification

- targeted dev tests proving:
  - `handleDevCommand` watches `convex/.env`
  - later local edits trigger auth-aware env sync
  - follow-up writes caused by the sync do not loop
- targeted scenario registry test proving Convex bootstrap lanes use
  `kitcn env push` without `--auth`
- targeted CLI tests proving the updated dev/env expectations still hold
- package typecheck
- package build
- repo `lint:fix`
- live smoke in `tmp/scenarios/next/project`:
  1. start `CONVEX_AGENT_MODE=anonymous bun run convex:dev -- --backend convex`
  2. edit `convex/.env`
  3. observe a second `Pushing environment variables to Convex...`

## Takeaways

1. Local dev should hide local env churn, not teach users a repair command as a
   normal workflow.
2. File watchers need loop suppression, or they turn one generated write into a
   small fire.
3. When a flag is hard-cut, clean scenario tooling and tests in the same pass,
   or the corpse keeps walking.
