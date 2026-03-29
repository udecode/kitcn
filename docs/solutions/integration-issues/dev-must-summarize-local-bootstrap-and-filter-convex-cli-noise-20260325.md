---
title: Dev must keep raw Convex logs in long-running mode
problem_type: integration_issue
component: development_workflow
root_cause: missing_tooling
tags:
  - convex
  - dev
  - verify
  - logs
  - bootstrap
  - env
severity: medium
symptoms:
  - kitcn dev hides the normal Convex dev stream
  - editing a Convex file gives no obvious signal that Convex rebuilt again
  - verify output needs a quieter contract than long-running dev
---

# Dev must keep raw Convex logs in long-running mode

## Problem

`kitcn dev` got too clever.

Quieting startup was fine for one-shot bootstrap and `verify`, but applying the
same filtered contract to normal long-running `dev` hid the real Convex rebuild
stream. That made file edits feel dead even when Convex was working.

## Root cause

The CLI treated all dev modes the same.

That was wrong. There are two different jobs:

1. one-shot bootstrap and `verify`, where concise owned output is useful
2. long-running local `dev`, where the upstream Convex stream is the product

## Fix

Split the modes.

Implementation rules:

1. keep automatic env sync and initial shared-API codegen quiet
2. keep backend-readiness gating for auth sync, migrations, and backfill
3. keep one-shot bootstrap and `verify` on the filtered owned output path
4. restore raw Convex backend output for long-running local `kitcn dev`
5. keep the kitcn watcher signal on edit: `Convex api updated`

## Verification

- targeted dev tests proving:
  - long-running `dev` preserves raw Convex output
  - filtered startup handling still exists for one-shot paths
  - aggregate backfill waits for backend readiness before kickoff
- targeted watcher test proving edit-triggered shared API regeneration still
  prints `Convex api updated`
- package typecheck
- package build
- repo `lint:fix`
- live runtime proof in a prepared `create-convex-bare` app via
  `kitcn dev` plus a real file edit

## Takeaways

1. Long-running dev is not the same product as one-shot verification.
2. When users are watching the terminal, hiding the backend stream is a bad UX
   trade.
3. Quiet the scaffolding. Do not mute the actual dev server.
