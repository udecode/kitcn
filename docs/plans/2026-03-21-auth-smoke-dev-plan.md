# Auth smoke dev lane

## Goal

Add the fastest honest auth-dev check: one live HTTP smoke script that hits the
running app on `3005`, proves sign-up plus session wiring, and avoids browser
startup overhead.

## Plan

- [completed] Inspect existing auth/dev seams and pick the narrowest live
  check shape
- [completed] Implement `tooling/auth-smoke.ts` plus one root script entrypoint
- [completed] Add targeted tests and run the narrow verification stack
- [completed] Add a slower `tooling/auth-e2e.ts` browser lane for release
  confidence and fix the stale sign-out/session seams it exposed

## Findings

- `convex-better-auth` uses direct auth API tests as the fast lane and
  Playwright only as the slower top layer.
- Our own documented auth/dev proof already uses a raw HTTP call to
  `/api/auth/sign-up/email`.
- The right contract is "dev server already running"; the smoke script should
  not try to own app startup.
- `agent-browser eval` returns a quoted JSON string, so browser tooling needs
  to parse twice before reading page state.
- Auth sign-out cannot wait on Better Auth's session hook to clear local state;
  the client store has to clear immediately after successful logout.

## Verification

- targeted tooling tests
- live auth smoke against a running local app when practical
- live `test:e2e` against a prepared `next-auth` scenario app
- `bun lint:fix`
- `bun typecheck` (expected existing template/runtime blocker may remain)
