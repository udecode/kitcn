# convex dev cancel leaves kitcn dev blocked

## Goal

Fix the `npx convex dev` -> Ctrl-C -> `kitcn dev` flow on backend `convex`.

## Plan

- [completed] Reproduce the exact cancel-flow in a prepared bare Convex app.
- [completed] Lock the bug with targeted dev regression tests.
- [completed] Restore `convex init` as the normal local preflight and use the
  hidden local `convex dev --local --once --skip-push --local-force-upgrade`
  lane only when `convex init` fails on the older-backend upgrade prompt.
- [completed] Run targeted tests, package build, lint, and typecheck.
- [completed] Update the active changeset and refresh the existing learning doc.

## Findings

- In a prepared bare app, `npx convex dev` can keep its CLI process alive after
  Ctrl-C even when nothing is listening on `3210`.
- `npx convex init` still succeeds in that stale-process state.
- `kitcn dev` currently fails because local preflight always uses the hidden
  `convex dev --local --once --skip-push --local-force-upgrade ...` lane.
- That hidden lane is stricter than `convex init` in this stale-process state,
  so we over-shipped the previous fix.
- After switching back to `convex init` first and keeping the hidden local dev
  lane as a narrow fallback, the live bare-app repro succeeds:
  `npx convex dev` -> Ctrl-C -> `bunx kitcn dev` reaches `Convex functions ready!`.
