# Init Bootstrap

## Goal

Add `kitcn init --bootstrap` so scaffold or adoption can chain directly
into the first local Convex bootstrap.

## Phases

- [completed] Add red tests for `init --bootstrap` parsing, local bootstrap
  chaining, and invalid target/backend cases.
- [completed] Wire `init` to reuse the shared local Convex bootstrap runner.
- [completed] Update docs, Convex skill refs, and the active changeset to point to
  `init --bootstrap` where it improves the bootstrap path.
- [completed] Verify with focused tests, package typecheck/build, lint, and a live
  `init --bootstrap` smoke.

## Notes

- `init --bootstrap` is local-only.
- Concave stays out; this is a Convex bootstrap wrapper.
- `dev --bootstrap` still matters for already-initialized apps and follow-up
  local bootstrap runs.
- Fresh template init stages shadcn output through a temp sibling dir when the
  target directory already exists and is empty.
- Fresh template init with `--bootstrap` reuses init-time local Convex
  bootstrap work instead of immediately spawning a second one-shot bootstrap.
