---
title: scenario:test auth proof must stay inside runtime and stop at smoke
category: integration-issues
tags:
  - scenarios
  - auth
  - testing
  - dev
  - cli
symptoms:
  - `bun check` and `test:runtime` become slower and flakier when browser auth E2E is bundled into the default auth-demo scenario lane
  - `scenario:test -- next-auth` reaches a healthy auth smoke pass, but the extra browser lane still extends the default gate
  - the scenarios skill and docs drift when auth-demo lanes are described inconsistently
module: scenarios
resolved: 2026-03-22
last_updated: 2026-04-06
---

# scenario:test auth proof must stay inside runtime and stop at smoke

## Problem

`scenario:test` was added as the CLI wrapper for the proof matrix already
documented in the scenarios skill.

The original routing logic was half right:

- plain runtime scenarios: prepare, boot, wait for ready, stop
- auth-demo scenarios: prepare, boot, run auth smoke, stop
- browser auth proof: explicit `test:e2e` lane only
- bootstrap-heavy Convex scenarios: defer to `scenario:check`

Keeping auth proof inside the runtime owner was necessary, but keeping browser
E2E inside the default `scenario:test` path was the wrong contract. That made
the default runtime gate depend on a slower, flakier browser lane even when the
auth demo itself was already healthy.

## Root Cause

`runScenarioRuntimeProof()` correctly owns process lifetime:

1. spawn dev processes
2. wait for ready
3. run any proof that needs the live app
4. stop processes in `finally`

The real mistake was at the proof-matrix boundary. `runScenarioTest()` treated
auth-demo scenarios as "smoke plus browser E2E" instead of "runtime plus auth
smoke". That made the default `test:runtime` gate inherit the browser lane.

So there were really two separate concerns:

1. proof that needs the app alive must run before teardown
2. browser auth E2E must not be part of the default runtime gate

## Solution

Keep the existing runtime seam, but narrow the auth-demo proof:

- keep `runScenarioRuntimeProof()` responsible for startup and teardown
- pass an `afterReadyFn` from `runScenarioTest()` for auth-demo scenarios
- run `test:auth` inside that `afterReadyFn`
- keep browser auth proof in the explicit `test:e2e` lane

So the order becomes:

1. prepare
2. spawn dev processes
3. wait for ready
4. run auth smoke
5. stop processes

Browser auth proof stays separate:

1. `bun run scenario:prepare -- <next-auth|start-auth>`
2. `bun run scenario:dev -- <next-auth|start-auth>`
3. `bun run test:e2e -- <next-auth|start-auth>`

## Verification

- `bun test ./tooling/scenarios.test.ts ./tooling/auth-e2e.test.ts`
- `bun lint:fix`
- `bun typecheck`
- `bun run scenario:test -- next-auth`

Observed live behavior after the fix:

- `POST /api/auth/sign-up/email 200`
- `Auth smoke passed against http://localhost:3005.`

Repo blocker still unrelated:

- `bun check` currently dies earlier in `fixtures:check` because upstream
  `bunx shadcn@4.0.1 init --template start` fails with
  `Cannot find module './options'`

## Prevention

1. If a proof step needs the app alive, keep it inside the runtime owner's
   lifecycle instead of sequencing it afterward.
2. Do not sneak browser E2E into the default runtime gate. Make that lane
   explicit.
3. Keep the scenarios skill, scenario tests, and `scenario:test` contract in
   sync for every auth-demo key, not just `next-auth`.

## Files Changed

- `tooling/scenarios.ts`
- `tooling/scenarios.test.ts`
- `tooling/auth-e2e.ts`
- `tooling/auth-e2e.test.ts`
- `.agents/rules/scenarios.mdc`
- `.agents/AGENTS.md`
