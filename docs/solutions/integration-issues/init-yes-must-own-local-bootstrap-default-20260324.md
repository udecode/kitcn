---
title: Init yes must own the local bootstrap default
problem_type: integration_issue
component: development_workflow
root_cause: incomplete_setup
tags:
  - init
  - bootstrap
  - cli
  - convex
  - prompts
severity: high
symptoms:
  - docs keep teaching `better-convex init --bootstrap`
  - fresh local bootstrap requires remembering an extra init flag
  - interactive init has no built-in bootstrap choice
---

# Init yes must own the local bootstrap default

## Problem

`better-convex init` had two overlapping bootstrap modes:

- plain `init`
- `init --bootstrap`

That made the public flow worse than it needed to be:

- docs had to explain the extra flag everywhere
- interactive init still had no bootstrap decision in-band
- `--yes` did not mean "take the default local bootstrap path"

## Root cause

The local bootstrap decision lived in the `init` flag surface instead of the
command policy.

That was backwards. The real question is not "did the user remember a second
flag?" The real question is "is local Convex bootstrap eligible for this init
run?"

## Fix

Make `init` own that decision:

1. remove `better-convex init --bootstrap`
2. on local Convex, treat `init --yes` as "take the bootstrap default"
3. in interactive mode, ask whether to run the one-shot local bootstrap after
   init
4. skip the bootstrap path entirely for backend `concave`, `--json`, and
   Convex deployment-targeting flags
5. keep `better-convex dev --bootstrap` as the explicit one-shot bootstrap
   command for an existing app

## Verification

- targeted `init` command tests for:
  - rejecting `init --bootstrap`
  - `--yes` default bootstrap on in-place adoption
  - prompt-driven bootstrap opt-out
  - no local bootstrap on remote Convex target flags
  - no duplicate public bootstrap after fresh scaffold
- package typecheck
- package build
- repo `lint:fix`

## Takeaways

1. `--yes` should mean "take the default path," not "skip the good path unless
   you remembered another flag."
2. Local bootstrap eligibility is a policy decision, not a public flag.
