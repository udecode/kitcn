---
title: Managed auth first pass must include jwks and auth demo pages must trust real session state
category: integration-issues
tags:
  - auth
  - cli
  - schema
  - scaffolding
  - scenarios
symptoms:
  - `better-convex add auth` omits the `jwks` table on the first scaffold pass
  - `plugins.lock.json` records only `user`, `session`, `account`, and `verification` after fresh auth install
  - `fixtures/next-auth/convex/functions/_generated/dataModel.d.ts` drops `jwks`
  - `scenario:test -- next-auth` signs up successfully but times out waiting for the signed-in auth page
module: auth-cli
resolved: 2026-03-24
---

# Managed auth first pass must include jwks and auth demo pages must trust real session state

## Problem

Fresh managed auth scaffold was lying on the first pass.

The real `next-auth` auth definition includes the Convex Better Auth plugin,
which means auth schema generation should include:

- `user`
- `session`
- `account`
- `verification`
- `jwks`

Instead, fresh `add auth` only claimed the first four tables. That leaked into
the fixture lock and generated data model, so `jwks` vanished from scaffolded
output.

At the same time, the auth demo browser scenario was flaky in a separate but
related-looking way. Sign-up succeeded, the session endpoint returned a live
session, but the page still failed to show the signed-in state.

## Root Cause

Two different seams were wrong.

### 1. First-pass schema planning used fallback auth options that were too weak

`buildAuthSchemaRegistrationPlanFile()` tries to load `<functionsDir>/auth.ts`.
On a fresh install, that file does not exist yet, so the planner falls back to
default managed auth options.

That fallback only described the email/password baseline. It did **not**
include the Convex Better Auth plugin, so `getAuthTables(...)` produced only:

- `user`
- `session`
- `account`
- `verification`

No plugin meant no `jwks` table.

### 2. The auth demo page trusted the slower auth flag instead of the real session

The browser scenario used the demo page under `/auth`. After sign-up, the page
already had a live Better Auth session, but the UI still gated the signed-in
view behind `useAuth().hasSession`.

That made the E2E lane wait for `Signed in` even though the real session was
already available.

## Solution

Fix both seams at the source.

### 1. Make default managed auth fallback mirror the real scaffold

The default managed auth fallback now includes the Convex Better Auth plugin
shape, but the stronger cut is that it no longer bakes in a fake local-dev
`http://localhost:3211` runtime.

Instead, the fallback builds a schema-only provider through the same auth-config
helper the scaffold relies on, with a sentinel `https://convex.invalid` site
URL. That keeps the first-pass planner aligned with the scaffold contract
without pretending it is talking to a real local server.

That makes first-pass `getAuthTables(...)` return `jwks` immediately, so fresh
managed auth scaffolds claim the full table set in one pass.

### 2. Keep the auth demo on `/auth` and trust the real session too

The scaffolded auth page now:

1. uses `/auth` as its callback URL
2. renders the signed-in state when either `hasSession` or the Better Auth
   session object is present

That makes the demo page and browser scenario agree on the actual signed-in
state.

## Verification

- `bun test packages/better-convex/src/cli/registry/items/auth/auth-item.test.ts`
- `bun test packages/better-convex/src/cli/registry/items/auth/reconcile-auth-schema.test.ts`
- `bun --cwd packages/better-convex build`
- `bun typecheck`
- `bun lint:fix`
- `bun run fixtures:sync -- next-auth`
- `bun run fixtures:check -- next-auth`
- `bun run scenario:test -- next-auth`

## Prevention

1. First-pass scaffold fallbacks must match the real scaffold contract, not a
   watered-down approximation.
2. If schema generation depends on plugin presence, first-install planning
   should use a schema-only scaffold contract, not fake runtime localhost
   wiring.
3. Demo auth pages should trust the real session object when deciding whether
   the user is signed in. Gating on a slower derived flag makes browser tests
   lie.
