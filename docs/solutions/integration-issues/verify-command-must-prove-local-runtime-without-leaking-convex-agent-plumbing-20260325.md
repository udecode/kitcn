---
title: Verify must prove local runtime without leaking Convex agent plumbing
problem_type: integration_issue
component: development_workflow
root_cause: wrong_abstraction
tags:
  - convex
  - verify
  - dev
  - ci
  - runtime
  - cli
severity: high
symptoms:
  - agents need one command that proves local runtime really boots
  - CI scripts leak CONVEX_AGENT_MODE=anonymous or raw convex dev flags
  - runtime proof gets mixed with lint, typecheck, or build sludge
---

# Verify must prove local runtime without leaking Convex agent plumbing

## Problem

`better-convex` had the pieces for local runtime proof, but no clean product
surface for it.

Agents and CI ended up reaching for raw commands like:

```bash
CONVEX_AGENT_MODE=anonymous better-convex dev --once
```

That is bad API. It leaks upstream Convex non-interactive setup plumbing, makes
app scripts uglier than they need to be, and invites every repo to invent its
own fake `check` command that mixes runtime proof with unrelated static gates.

## Root cause

The real proof path already existed inside `better-convex dev`, but it was
buried under the wrong abstraction.

- `dev --once` is the real runtime lane
- `dev --bootstrap` is a different contract for one-shot setup
- `CONVEX_AGENT_MODE=anonymous` is upstream Convex plumbing, not product API

Because there was no first-class runtime verifier, the leaked plumbing became
the documented and scripted workaround.

## Fix

Add `better-convex verify` as a dedicated local runtime proof command.

The command should:

1. run the real Better Convex dev path through `dev --once`
2. reject remote deployment flags
3. reject non-Convex backends
4. reuse an existing local Convex deployment when one is already configured
5. inject anonymous local Convex mode only for fresh verification runs
5. keep lint, typecheck, and build out of scope

That gives agents a sharp split:

- `typecheck` proves static correctness
- `better-convex verify` proves local runtime boots
- one dedicated repo gate can run `verify` once without replacing scenario
  proof lanes

## Verification

- targeted `verify` command tests for help, backend rejection, remote target
  rejection, anonymous env injection, env restoration, and configured-local
  deployment reuse
- targeted root CLI tests proving `verify --help` is wired into the public CLI
- package typecheck
- package build
- repo `lint:fix`
- live `bunx better-convex verify` in
  `tmp/scenarios/create-convex-bare/project`
- live `bunx better-convex verify` in `example/`

## Takeaways

1. Runtime proof deserves its own verb.
2. `check` is repo glue. `verify` is product intent.
3. If upstream CLI plumbing is necessary, hide it behind the product surface.
4. Run `verify` once as a dedicated gate. Do not stuff it into every scenario.
5. Fresh local proof and configured local proof are different seams. Treat them
   differently.
