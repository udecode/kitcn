---
title: Init bootstrap must stage empty targets and reuse init-time bootstrap
problem_type: integration_issue
component: development_workflow
root_cause: missing_workflow_step
tags:
  - init
  - bootstrap
  - shadcn
  - convex
  - cli
severity: high
symptoms:
  - `kitcn init -t next --yes --bootstrap` fails in an already-created empty directory
  - shadcn reports `dest already exists`
  - fresh `init --bootstrap` tries to start a second local Convex bootstrap and collides on port `3210`
---

# Init bootstrap must stage empty targets and reuse init-time bootstrap

## Problem

The intended quickstart path was:

```bash
mkdir my-app
cd my-app
kitcn init -t next --yes --bootstrap
```

But that shape broke in two places:

1. shadcn refuses to scaffold directly into an already-created empty target
   directory, so the old parent+name flow exploded with `dest already exists`
2. fresh template init could already run a local Convex bootstrap while
   generating real runtime files, then `init --bootstrap` immediately tried to
   start another one and hit port `3210`

## Root cause

We treated shadcn and local Convex bootstrap as if they were cleanly
idempotent in-place operations.

They are not:

- shadcn wants to create a named project directory, not fill an existing empty
  one
- fresh init can already touch local Convex enough that a second bootstrap pass
  is redundant or actively conflicting

## Fix

Make `init` own both seams explicitly:

1. When template init targets an already-created empty directory, scaffold the
   shadcn app in a temp sibling directory, then move the generated files into
   the real target
2. Resolve explicit `--config` paths before any cwd changes so post-init
   adoption bootstrap still reads the right config file
3. On fresh template init, treat the init-time local Convex bootstrap work as
   satisfying `--bootstrap` instead of immediately spawning a second one-shot
   bootstrap
4. Keep the explicit post-init bootstrap step for in-place adoption, where it
   still does real work

## Verification

- targeted `init` command tests for:
  - current empty directory template scaffold
  - fresh scaffold `--bootstrap` without duplicate public bootstrap
  - in-place adoption `--bootstrap`
  - explicit relative `--config` resolution during adoption bootstrap
- package typecheck
- package build
- repo `lint:fix`
- packed tarball smoke:
  - `kitcn init -t next --yes --bootstrap`
  - from an already-created empty temp directory
  - with generated runtime files present afterward

## Takeaways

1. If shadcn owns project creation, an empty existing target still needs a
   staging dance.
2. `--bootstrap` means "be bootstrapped when this command exits," not "always
   start one more backend process no matter what just happened."
