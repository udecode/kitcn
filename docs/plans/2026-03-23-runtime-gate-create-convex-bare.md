# Runtime Gate Create-Convex-Bare

## Goal

Get `bun check` green again by fixing the last runtime gate failure in
`scenario:test -- all`.

## Plan

- [x] Inspect the failing scenario path and confirm the exact break.
- [x] Add a failing test for the bare `create-convex-bare` scenario contract.
- [x] Remove the stale `init --yes` bootstrap from the bare scenario.
- [x] Re-run targeted scenario tests and `bun check`.

## Findings

- `create-convex-bare` is a raw Convex fixture with no supported Next/Vite app
  scaffold.
- `scenario:test -- create-convex-bare` fails during prepare because
  `better-convex init --yes` now only adopts supported app scaffolds.
- `create-convex-nextjs-shadcn` and `create-convex-react-vite-shadcn` still
  pass. The bare fixture is the outlier.
- The correct contract is plain runtime smoke: copy fixture, install local
  package, boot backend. No Better Convex adoption step.
- Verified green with `bun test tooling/scenarios.test.ts`,
  `bun run scenario:test -- create-convex-bare`, `bun typecheck`, and
  `bun check`.
