# Init Yes Default Bootstrap

## Goal

Remove `kitcn init --bootstrap`. Make `kitcn init --yes`
finish the first local Convex bootstrap by default, and move the same decision
into the interactive `init` flow.

## Phases

- [completed] Add red tests for removing the `init --bootstrap` flag and
  defaulting local bootstrap through `--yes` or the interactive prompt.
- [completed] Remove the `init --bootstrap` parser/help surface and resolve
  local bootstrap from backend + target + prompt state.
- [completed] Rewrite docs, Convex skill refs, and the active changeset for the
  hard cut.
- [completed] Verify with focused `init` tests plus package typecheck/build,
  lint, and a live `init -t next --yes` smoke.

## Notes

- `init --yes` only auto-bootstraps when the local bootstrap is actually
  eligible: backend `convex`, no deployment-targeting flags.
- `init --json` stays non-interactive. No prompt garbage in machine output.
- `dev --bootstrap` stays as the one-shot bootstrap command for an existing
  app.
