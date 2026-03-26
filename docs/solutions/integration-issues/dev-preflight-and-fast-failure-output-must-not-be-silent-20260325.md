---
title: Dev preflight and fast backend failures must print their real output
problem_type: integration_issue
component: development_workflow
root_cause: missing_tooling
tags:
  - convex
  - dev
  - logs
  - bootstrap
  - init
severity: high
symptoms:
  - better-convex dev prints only `Bootstrapping local Convex...` then exits
  - fast backend failures never show the actual Convex error
  - convex init preflight failures disappear completely in quiet mode
---

# Dev preflight and fast backend failures must print their real output

## Problem

`better-convex dev` could fail like a mime.

In the broken path, users saw the bootstrap banner and then a dead exit code,
with none of the real Convex error text.

## Root cause

There were two separate holes:

1. `runConvexInitIfNeeded(..., { echoOutput: false })` muted *all* init output,
   including failures.
2. The piped backend stream observer resolved on process exit before stdout and
   stderr finished draining, so fast failures could lose their final lines.

## Fix

Keep quiet mode quiet only for success.

Implementation rules:

1. `convex init` preflight may hide normal noise, but it must always print
   stdout/stderr when exit code is non-zero.
2. The dev output observer may resolve `true` immediately on the ready line.
3. When no ready line appears, it must resolve `false` only after stdout/stderr
   close and any pending partial line is flushed.
4. When the backend process is the thing that exited, `handleDevCommand(...)`
   must wait for that output observer before returning.

## Verification

- targeted dev tests proving:
  - fast backend stderr is flushed before `handleDevCommand(...)` returns
  - failing silent `convex init` preflight output is printed
  - normal raw Convex dev logs still pass through
- package typecheck
- package build
- live `example` smoke:
  - `bun run convex:dev`
  - output now includes the real failure:
    `A local backend is still running on port 3210...`

## Takeaways

1. Quiet bootstrap is fine. Silent failure is not.
2. A preflight helper should never eat the only actionable error.
3. Child-process exit and child-stream drain are not the same event.
