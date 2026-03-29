# Init Overwrite Ownership

## Goal

Make `kitcn init` behave like `add` for owned files:

- `--yes` skips conflicting owned file replacements
- interactive `init` prompts per conflicting file
- `--overwrite` is the only bulk replacement hammer
- narrow seam patches still apply without being blocked

## Phases

- [completed] Replace the broad init scaffold protection rule with
  file-level ownership metadata.
- [completed] Keep managed/generated baselines updatable under `--yes`,
  especially `${functionsDir}/tsconfig.json`.
- [completed] Update tests, help text, and parity notes for the new contract.
- [completed] Verify with targeted init tests, package gates, fixtures sync/check,
  and scenario proof.

## Notes

- The current `protectScaffoldLikeUpdates` switch is too broad. It blocks seam
  patches like root `tsconfig.json` and `layout.tsx`, which is wrong.
- Shadcn parity says kitcn should patch seams, not clobber the shell.
- The right split is file ownership, not file kind. Some scaffold files are
  fully owned replacements; some are just seam patches.
- Cold CLI paths also need the same discipline. Plain `kitcn codegen`
  must not statically pull the managed auth Convex plugin into the packaged
  bundle.
