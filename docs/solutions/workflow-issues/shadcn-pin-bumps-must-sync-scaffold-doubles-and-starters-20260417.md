---
title: shadcn pin bumps must sync scaffold doubles and starters
date: 2026-04-17
category: workflow-issues
module: init-scaffolds
problem_type: workflow_issue
component: tooling
symptoms:
  - "`packages/kitcn/src/cli/backend-core.ts` still pins an older `shadcn@x.y.z` while upstream starters have already moved on"
  - "Local scaffold doubles in `packages/kitcn/src/cli/test-utils.ts` keep passing init tests even though fresh upstream scaffold output has changed"
  - "`fixtures:sync` and scenario lanes become the first place real drift shows up"
root_cause: missing_workflow_step
resolution_type: code_fix
severity: medium
tags:
  - shadcn
  - scaffolding
  - fixtures
  - scenarios
  - parity
  - test-doubles
---

# shadcn pin bumps must sync scaffold doubles and starters

## Problem

`kitcn` wraps shadcn scaffolding in two places:

- the real CLI pin used by `init -t`
- fake scaffold output used by local tests

If those move separately, the repo starts lying. Unit tests still pass against
stale fake output while fresh scaffold generation and runtime scenarios follow a
different upstream contract.

## Symptoms

- The pinned `INIT_SHADCN_PACKAGE_SPEC` lags behind the upstream release range.
- Starter package versions and `components.json` fields drift from the current
  shadcn template contract.
- `fixtures:sync`, `fixtures:check`, or prepared scenario apps expose drift
  that targeted unit tests missed.

## What Didn't Work

- Bumping only the shadcn version pin is incomplete. It leaves fake scaffold
  output frozen in old template assumptions.
- Updating only the local doubles is also incomplete. It keeps committed
  starters and runtime scenarios on the wrong upstream release.

## Solution

Treat the shadcn pin, the scaffold doubles, and the committed starters as one
contract.

When bumping shadcn:

1. Update the real `INIT_SHADCN_PACKAGE_SPEC`.
2. Sync local scaffold doubles in `packages/kitcn/src/cli/test-utils.ts` to the
   same upstream starter shape.
3. Refresh committed starters with `bun run fixtures:sync`.
4. Prove they still match with `bun run fixtures:check`.
5. Run runtime scenario proof for the affected template lanes.

For the `4.0.1 -> 4.3.0` bump, that meant syncing starter dependency versions,
monorepo root metadata, and shadcn-owned `components.json` fields like
`iconLibrary`.

## Why This Works

The real scaffold pin decides what users get. The local doubles decide what the
tests believe users get.

Keeping both on the same upstream release removes the false-green state where:

- unit tests validate stale fake output
- fixture regeneration rewrites half the repo
- scenario lanes become the first honest signal

## Prevention

- Never treat a shadcn version bump as a one-line constant change.
- If `init -t` owns a scaffold lane, its fake output in test helpers must match
  the same upstream release.
- After every scaffold contract bump, run both fixture lanes and at least the
  relevant runtime scenarios before calling it done.
- If fresh fixtures change more than expected, assume the local doubles are
  stale until proven otherwise.
