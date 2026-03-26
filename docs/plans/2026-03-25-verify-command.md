# better-convex verify

## Goal

Add an agent-friendly runtime verification command for local Better Convex apps.

The command should:

- verify local dev/runtime boot works
- avoid lint/typecheck/build scope creep
- hide upstream non-interactive Convex setup junk
- be usable in CI as `better-convex verify`

## Findings

- `better-convex dev --once` is the closest existing runtime smoke path.
- `better-convex dev --bootstrap` is a different contract: one-shot bootstrap,
  no watcher, forced `--typecheck disable`.
- `CONVEX_AGENT_MODE=anonymous` is upstream Convex plumbing, not a good public
  Better Convex surface.
- local stale `.convex/` state can trigger a non-interactive Convex backend
  upgrade prompt, so verify needs to isolate or neutralize that seam.

## Plan

- [x] Add failing CLI tests for a new `verify` command.
- [x] Implement `verify` as a local runtime proof command.
- [x] Update docs + Convex skill refs.
- [x] Update the active changeset.
- [x] Run targeted tests, package build, and lint.

## Progress

- 2026-03-25: gathered current `dev` behavior, runtime learnings, and the
  scenario/non-interactive Convex seam before implementation.
- 2026-03-25: added `better-convex verify`, wired it into the public CLI,
  updated docs and skill refs, and proved it live in
  `tmp/scenarios/create-convex-bare/project`.
- 2026-03-25: added a dedicated root `test:verify` lane and wired `check` to
  run it once before the broader scenario runtime matrix.
- 2026-03-25: fixed a follow-up codegen regression where generated module
  runtimes typed refs from `typeof import("../module").export`, reintroducing
  self-import cycles in apps like `example`. Runtime refs now type against the
  app's generated Convex API contract instead, which unblocks `example`
  `typecheck` and `check`.
