# Next Auth template browser auth 404s

## Goal

Find why the prepared `next-auth` scenario returns `404` for auth browser
requests like `/api/auth/get-session`, `/login`, and sign-up POSTs, then fix the
smallest real root cause.

## Plan

- [in_progress] Reproduce the broken flow against a running `next-auth`
  scenario with agent-browser
- [pending] Trace route and auth client wiring in the generated template output
- [pending] Implement the minimal fix and verify in browser plus targeted checks

## Findings

- User reports browser traffic from the `next-auth` template hitting:
  - `GET /api/auth/get-session` -> `404`
  - `GET /login` -> `404`
  - `POST /api/auth/sign-up/email` -> `404`
- The previous auth runtime cycle crash is fixed; this is a new browser/runtime
  mismatch after the app boots.
- The dev server is not currently running in the shared terminal, so reproduce
  from a fresh `scenario:dev -- next-auth` session.

## Verification

- agent-browser repro against `next-auth`
- targeted tests for the changed auth/template wiring
- `bun lint:fix`
- typecheck if touched `.ts` files warrant it
