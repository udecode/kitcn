# kitcn dev local upgrade prompt

## Goal

Stop `kitcn dev` from hanging in non-interactive local Convex bootstrap when
the local backend needs an upgrade.

## Plan

- [completed] Add a regression test at `handleDevCommand(...)` proving local
  anonymous dev preflight uses the non-interactive local-upgrade path instead
  of raw `convex init`.
- [completed] Patch `runConvexInitIfNeeded(...)` to switch local Convex targets
  to the hidden upstream `convex dev --local --once --skip-push
  --local-force-upgrade` preflight lane.
- [completed] Run targeted tests, `lint:fix`, `typecheck`, and
  `bun --cwd packages/kitcn build`.
- [completed] Update the active unreleased changeset with the shipped behavior.

## Findings

- Raw `npx convex init` and `npx convex dev --once --typecheck disable` both
  fail in non-interactive mode with:
  `This deployment is using an older version of the Convex backend. Upgrade now?`
- The hidden upstream lane
  `convex dev --local --once --skip-push --local-force-upgrade --typecheck disable --codegen disable`
  exits successfully for the same local deployment.
- `kitcn dev` live proof no longer dies on the upgrade prompt. After the fix,
  the same repro moved past bootstrap and hit a separate local backend port
  conflict instead.
