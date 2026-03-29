---
title: Dev preRun must use Convex native dev run flow
problem_type: integration_issue
component: development_workflow
root_cause: wrong_api
tags:
  - convex
  - dev
  - prerun
  - init
  - example
severity: high
symptoms:
  - kitcn dev fails before local Convex functions are available
  - convex run init reports Could not find function for init
---

# Dev preRun must use Convex native dev run flow

## Problem

`kitcn dev` supported `meta["kitcn"].dev.preRun`, but it
implemented that hook as a separate `convex run <function>` call before the
main `convex dev` process started.

That breaks bootstrap functions like `init`, because those functions do not
exist on a fresh local deployment until `convex dev` has started and pushed
the app.

## Root cause

The CLI treated `dev.preRun` as an external preflight step instead of using
Convex's built-in `convex dev --run <function>` behavior.

So the sequence was:

1. `convex init`
2. `convex run init`
3. `convex dev`

The correct sequence is one command:

1. `convex init`
2. `convex dev --run init`

## Fix

Inject `--run <function>` into the real Convex dev args and remove the separate
`convex run` call.

That keeps `dev.preRun` inside Convex's own startup lifecycle, where the
function exists when Convex tries to execute it.

## Verification

- targeted CLI test proving `dev.preRun` becomes `convex dev --run init`
- package typecheck
- package build
- live `cd example && bun run convex:dev` no longer fails with
  `Could not find function for 'init'`

## Takeaways

1. If Convex already has a native lifecycle hook, use it.
2. Bootstrap functions that depend on pushed local code cannot run before
   `convex dev`.
