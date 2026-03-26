# Add Auth Reconcile

## Goal
Make `better-convex add auth` the canonical reconciliation path for auth-owned schema/runtime scaffolding instead of documenting a manual `@better-auth/cli generate` step.

## Scope
- Add/adjust tests first for rerunning `add auth` as reconcile behavior.
- Update CLI/docs wording and any output seams needed for that UX.
- Keep one verb: `add`.

## Plan
1. Write failing tests for the desired `add auth` rerun behavior and docs contract.
2. Implement minimal code changes to make tests pass.
3. Verify package build/tests/lint and update the active changeset.

## Notes
- Prefer generic `add` reconcile behavior over new `sync` verb.
- Keep managed file vs patch seam ownership explicit.
