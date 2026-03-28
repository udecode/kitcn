## Goal

Clear the ship blockers from the branch review except the TanStack Intent gate,
which the user explicitly deferred.

## Plan

- [ ] Fix stale generated-api integration tests to use the chained schema
      contract and current generated server expectations.
- [ ] Replace the remaining `agent-browser` auth E2E tooling seam with the
      repo's `dev-browser --connect` direction, including tests.
- [ ] Update the unreleased changeset so it reflects the real branch delta
      against `main`, including migrations.
- [ ] Re-run focused verification plus the full ship gate that should now pass
      except for the intentionally deferred Intent check.

## Findings

- The current hard blocker is `bun check`: `packages/better-convex/src/integration/generated-api.integration.test.ts`
  still writes `export const relations` fixtures, which codegen now rejects by
  design.
- The browser tooling drift is concrete, not philosophical:
  `tooling/auth-e2e.ts` still shells out to `agent-browser`.
- The changeset draft is still missing the new migrations surface.
