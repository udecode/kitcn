---
title: Local bootstrap should be a first-class dev mode, not a leaked incantation
problem_type: integration_issue
component: development_workflow
root_cause: missing_workflow_step
tags:
  - dev
  - bootstrap
  - auth
  - jwks
  - convex
  - cli
severity: high
symptoms:
  - docs tell users to run kitcn dev --once --typecheck disable
  - add auth needs a follow-up live step to finish local setup
  - fresh local auth setup feels like two commands glued together
---

# Local bootstrap should be a first-class dev mode, not a leaked incantation

## Problem

The local bootstrap story leaked an internal backend command into the public
API:

```bash
npx kitcn dev --once --typecheck disable
```

That is ugly for humans and worse for agents. It exposes backend adapter flags
instead of the actual intent: boot the local Convex app once, finish auth/JWKS
setup, run startup work, and exit.

The same leak also showed up in `add auth`. The scaffold step could finish, but
the live auth/bootstrap step still needed separate logic outside the plugin
planner.

## Root cause

The CLI had a real one-shot bootstrap flow, but it lived as a side effect of
`dev` internals instead of a first-class command mode.

Because the planner had no way to express "this plugin needs a live local
bootstrap after scaffold changes", `add` ended up with auth-specific glue.

## Fix

Make one-shot local bootstrap explicit:

- `kitcn dev --bootstrap` is the public one-shot local Convex bootstrap
  command
- `kitcn dev` remains the long-running local runtime
- `kitcn add <plugin>` can request a planner operation of kind
  `live_bootstrap`

Use one shared bootstrap runner for all of them:

1. run `convex init` if needed
2. prepare auth env before startup
3. run codegen/bootstrap startup through local Convex
4. complete auth env sync after the runtime is ready
5. run startup migration/backfill hooks
6. exit cleanly for `--bootstrap`, or stay attached for normal `dev`

For `add`, keep it local-only and probe-first:

- if a local Convex backend is already reachable, reuse it and finish the live
  post-scaffold step against that deployment
- if probe fails because no local backend is up, run the one-shot bootstrap
  path internally
- do not auto-bootstrap remote targets

## Verification

- targeted dev tests proving `--bootstrap` runs one-shot local bootstrap,
  rejects Concave, and does not start watchers
- targeted planner/add tests proving plugins can declare `live_bootstrap`,
  auth uses it, reuse works against a running local backend, and fallback
  spawns local bootstrap when probe fails
- package typecheck
- package build
- repo `lint:fix`
- live `bun run scenario:test -- next-auth`
- live `bun run scenario:test -- create-convex-nextjs-shadcn-auth`
- live `bunx kitcn dev --bootstrap` in
  `tmp/scenarios/create-convex-nextjs-shadcn-auth/project`

## Takeaways

1. One-shot bootstrap is a product concept. It deserves a real flag.
2. Live plugin follow-up work belongs in the planner model, not in auth-only
   command glue.
3. Reuse detection should probe the backend, not inspect processes like a
   raccoon in a dumpster.
