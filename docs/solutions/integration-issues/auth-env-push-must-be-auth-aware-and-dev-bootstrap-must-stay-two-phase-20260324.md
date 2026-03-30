---
title: Auth env push must be auth-aware and dev bootstrap must stay two-phase
problem_type: integration_issue
component: development_workflow
root_cause: missing_workflow_step
tags:
  - auth
  - env
  - dev
  - jwks
  - convex
severity: high
symptoms:
  - setup docs require a second manual env pass after dev
  - kitcn env push needs a special auth flag for Better Auth apps
  - auth bootstrap feels two-pass even after scaffold and codegen are already in place
---

# Auth env push must be auth-aware and dev bootstrap must stay two-phase

## Problem

The old CLI contract split auth env sync into a separate public mode:

- `kitcn env push --auth`
- `kitcn env push --auth --rotate`

That leaked internal bootstrap sequencing into the user flow. Fresh Convex auth
setup ended up reading like:

1. scaffold auth
2. run `kitcn dev --once`
3. run `kitcn env push --auth`

That is dumb. Users should not have to remember a second auth-only env command
just because JWKS needs a live backend.

## Root cause

There are really two different auth env phases:

1. `BETTER_AUTH_SECRET` can be prepared before startup
2. `JWKS` can only be fetched after the generated auth runtime is available on
   a live backend

The old contract exposed that split as a public `--auth` mode instead of
handling it inside the CLI lifecycle.

## Fix

Make `kitcn env push` auth-aware by default and remove the public
`--auth` flag.

Use scaffold state, not `concave.json`, to detect auth:

- if auth scaffold is absent, `env push` behaves like normal env sync
- if auth scaffold is present, `env push` ensures `BETTER_AUTH_SECRET`, fetches
  `JWKS`, and pushes both
- `--rotate` still exists, but it rotates keys through the same auth-aware path

Keep `kitcn dev` split internally:

- pre-start: `prepare` auth env sync for `BETTER_AUTH_SECRET`
- post-start: `complete` auth env sync for `JWKS`

That preserves the real two-phase backend dependency without forcing users to
run two commands.

## Verification

- targeted env tests proving `env push` auto-detects auth, generates
  `BETTER_AUTH_SECRET`, fetches `JWKS`, and rejects the removed `--auth` flag
- targeted dev test proving `kitcn dev --once` runs `prepare` before
  startup and waits for `complete` before returning
- targeted CLI tests proving raw Convex auth adoption now calls auth-aware
  `env push`
- package typecheck
- package build
- repo `lint:fix`
- live `bun run scenario:test -- create-convex-nextjs-shadcn-auth`

## Takeaways

1. `env push` is the right public verb. Auth is app state, not a separate env
   sub-mode.
2. `dev` can hide bootstrap sequencing, but it cannot cheat the JWKS runtime
   dependency.
3. Do not store plugin/auth install state in backend config just to make CLI
   behavior line up.
