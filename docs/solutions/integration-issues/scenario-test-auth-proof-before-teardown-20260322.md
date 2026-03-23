---
title: scenario:test auth proof must run before runtime teardown
category: integration-issues
tags:
  - scenarios
  - auth
  - testing
  - dev
  - cli
symptoms:
  - `bun run scenario:test -- next-auth` starts the app, reaches ready, then `test:auth` fails with `ConnectionRefused`
  - the runner shuts the dev processes down before auth smoke or browser auth runs
  - focused unit tests for the proof matrix pass, but the live `next-auth` lane still dies
module: scenarios
resolved: 2026-03-22
---

# scenario:test auth proof must run before runtime teardown

## Problem

`scenario:test` was added as the CLI wrapper for the proof matrix already
documented in the scenarios skill.

The routing logic was correct on paper:

- plain runtime scenarios: prepare, boot, wait for ready, stop
- `next-auth`: prepare, boot, run auth smoke, run browser auth, stop
- bootstrap-heavy Convex scenarios: defer to `scenario:check`

But the live `next-auth` lane still failed. The app booted, reached ready, then
`test:auth` hit:

```txt
ConnectionRefused
```

because the dev runner had already shut the app down.

## Root Cause

`runScenarioRuntimeProof()` always owned process lifetime:

1. spawn dev processes
2. wait for ready
3. stop processes in `finally`

`runScenarioTest()` called it first, then ran `runAuthSmoke()` and
`runAuthE2E()` after it returned.

That meant the auth checks were executing after teardown, outside the runtime
window they were supposed to verify.

## Solution

Use the seam that already existed:

- keep `runScenarioRuntimeProof()` responsible for startup and teardown
- pass an `afterReadyFn` from `runScenarioTest()` for auth-demo scenarios
- run `test:auth` and `test:e2e` inside that `afterReadyFn`

So the order becomes:

1. prepare
2. spawn dev processes
3. wait for ready
4. run auth smoke
5. run browser auth
6. stop processes

The unit test stub for `next-auth` also has to execute `afterReadyFn`, or it
will falsely claim the auth callbacks are wired when they are not.

## Verification

- `bun test ./tooling/scenarios.test.ts`
- `bun lint:fix`
- `bun --cwd packages/better-convex build`
- `bun run scenario:test -- next-auth`

Observed live behavior after the fix:

- `POST /api/auth/sign-up/email 200`
- `Auth smoke passed against http://localhost:3005.`
- `POST /api/auth/sign-out 200`
- `Auth E2E passed against http://localhost:3005.`

Repo blocker still unrelated:

- `bun typecheck` still fails on the existing committed template issue in
  `fixtures/vite/convex/functions/generated/server.runtime.ts`

## Prevention

1. If a proof step needs the app alive, keep it inside the runtime owner's
   lifecycle instead of sequencing it afterward.
2. When a runner composes smaller helpers, test the live lane once. Mock-only
   wiring tests will miss teardown bugs like this.
3. If a helper already exposes an `afterReady` seam, use it before inventing a
   second process manager.

## Files Changed

- `tooling/scenarios.ts`
- `tooling/scenarios.test.ts`
- `package.json`
- `.claude/skills/scenarios/scenarios.mdc`

