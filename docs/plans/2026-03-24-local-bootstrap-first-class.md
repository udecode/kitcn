# Local Bootstrap First-Class

## Goal

Replace the leaked public one-shot flow with `kitcn dev --bootstrap`
and make `kitcn add` reuse the same local Convex bootstrap path when a
plugin needs live multi-pass work.

## Phases

- [completed] Add red tests for `dev --bootstrap`, planner live bootstrap
  operations, and `add` local reuse/fallback behavior.
- [completed] Refactor the dev bootstrap path into a shared helper and wire
  `--bootstrap`.
- [completed] Move auth live bootstrap from hardcoded add logic into planner +
  executor.
- [completed] Update docs, Convex skill refs, example scripts, and changeset.
- [completed] Run targeted tests, typecheck, lint, build, and live scenario
  proof.
- [completed] Run `bun check` and confirm the remaining blocker is the existing
  `example/` generated runtime/type mess, not the local bootstrap cut.

## Notes

- Local-only bootstrap automation for `add`.
- Start with auth presets; the planner model should support future plugins.
- `env push` stays for prod, rotate, and explicit repair.
- `next-auth` scenario passed after clearing a stale local `3005` listener.
- Direct `kitcn dev --bootstrap` proof passed in the prepared local
  Convex auth app under
  `tmp/scenarios/create-convex-nextjs-shadcn-auth/project`.
