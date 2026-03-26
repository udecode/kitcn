---
title: Local Convex CLI flows must re-exec under a supported Node
problem_type: integration_issue
component: development_workflow
root_cause: missing_tooling
tags:
  - convex
  - dev
  - verify
  - node
  - bun
  - fnm
severity: high
symptoms:
  - better-convex dev fails with `DeploymentNotConfiguredForNodeActions`
  - bun run convex:dev uses Homebrew Node 25 even when fnm has Node 22 available
  - forcing a supported Node in PATH makes the same app boot cleanly
---

# Local Convex CLI flows must re-exec under a supported Node

## Problem

Local Convex runtime proof could fail for a stupid reason.

`bun run convex:dev` launched `better-convex` under whatever `node` Bun found
first. In the broken path that was Homebrew Node 25, even though fnm already
had Node 22 installed and available later in PATH.

That made local Convex reject node actions with:

`DeploymentNotConfiguredForNodeActions`

## Root cause

The CLI trusted the current runtime too much.

Two separate seams were fragile:

1. packaged watcher startup used the current Node runtime directly
2. local Convex runtime commands assumed the parent CLI was already running on a
   supported Node

When Bun picked the wrong `node`, local Convex inherited that bad runtime and
the whole flow died before app code even mattered.

## Fix

Treat supported local Node selection as a Better Convex responsibility.

Implementation rules:

1. packaged watcher execution resolves through `node` from PATH instead of
   blindly reusing `process.execPath`
2. local Convex child commands prefer the first supported Node found in PATH
   (`18`, `20`, `22`, `24`)
3. `better-convex` re-execs itself once under that supported Node for local
   runtime commands (`dev`, `verify`, `init`, `add`, `codegen`) before touching
   local Convex
4. the re-exec is single-shot and guarded by an env flag so it cannot loop

## Verification

- targeted unit tests for:
  - supported Node selection from PATH
  - CLI self-reexec under a supported Node
- package typecheck
- package build
- live example proof from the bad parent runtime:
  - shell still reports `node -v` as `v25.8.1`
  - `bun run convex:dev -- --once` still reaches `Convex ready`

## Takeaways

1. local Convex cares about the actual Node runtime, not your shell lore
2. Bun script execution and shell `node` resolution are not the same thing
3. if the product can detect and fix the runtime automatically, make it do that
