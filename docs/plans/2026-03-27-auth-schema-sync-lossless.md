# Auth schema sync lossless

## Goal
Keep `better-convex add auth --only schema` lossless for `example/`, including
the `--overwrite` path when auth tables are already explicitly owned locally.

## Findings
- Plain `bunx better-convex add auth --only schema --yes` in `example/` is
  already lossless; it skips `schema.ts` and `plugins.lock.json`.
- `bunx better-convex add auth --only schema --overwrite --yes` is not
  lossless. It rewrites local auth tables in
  `example/convex/functions/schema.ts` and flips local auth ownership to
  managed in `example/convex/functions/plugins.lock.json`.
- Root cause is `decideOwnership()` in
  `packages/better-convex/src/cli/registry/schema-ownership.ts`:
  `lockEntry.owner === "local"` currently returns `"managed"` whenever
  `overwrite` is true, even during schema-only managed refresh flows.

## Plan
1. Add a regression test for schema-only overwrite preserving locally-owned
   auth tables.
2. Patch ownership resolution so `overwriteManaged` refreshes managed blocks
   without stealing `owner: "local"` auth tables.
3. Verify with focused tests, package build/typecheck/lint, and a live
   `example/` auth schema sync rerun.

## Verification
- Added auth regression coverage in
  `packages/better-convex/src/cli/registry/items/auth/auth-item.test.ts`.
- Focused tests passed:
  - `bun test packages/better-convex/src/cli/registry/schema-ownership.test.ts packages/better-convex/src/cli/registry/items/auth/auth-item.test.ts`
- Package checks passed:
  - `bun --cwd packages/better-convex build`
  - `bun typecheck`
  - `bun lint:fix`
- Live `example/` proof passed:
  - `bunx better-convex add auth --only schema --overwrite --yes`
  - result: `0 updated, 2 skipped`
  - `schema.ts` and `plugins.lock.json` hashes were unchanged before/after
