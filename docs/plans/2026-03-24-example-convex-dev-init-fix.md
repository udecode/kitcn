# 2026-03-24 Example Convex Dev Init Fix

## Goal

Fix `example` so `better-convex dev` does not try to run `internal.init` before
functions exist on a fresh local Convex deployment.

## Learnings

- `docs/solutions/integration-issues/raw-convex-auth-adoption-bootstrap-20260318.md`
  confirms raw Convex bootstrap must respect `convex init` timing and not assume
  Better Convex install state.
- `docs/solutions/integration-issues/auth-schema-only-should-bootstrap-ownership-from-existing-scaffold-20260324.md`
  and related schema-only notes confirm `example` is the live bullshit detector
  for auth/bootstrap flows.

## Plan

- [ ] Reproduce `example` `convex:dev` failure and trace who invokes `init`
- [ ] Add a failing test for the bad bootstrap path
- [ ] Fix the bootstrap sequencing with minimal code
- [ ] Verify with package tests, build, lint, and a live `example` run

## Notes

- Do not patch `example` outputs first unless the bug is genuinely example-only.
- Keep the fix Convex-first. No generic sludge for Concave.
