# Smart root schema sync

## Goal
Replace root `schema.ts` auth sync ownership gating with additive TypeScript AST
patching that:

- adds missing fields, indexes, registrations, and relations
- preserves compatible custom schema definitions
- throws on incompatible overlapping definitions
- warns when old lockfile entries reference schema tables the plugin no longer
  asks for

## Why
- `example/` is the real stress case. It owns a forked auth schema and still
  needs plugin-driven field additions like `username()` / `displayUsername`
  without getting clobbered.
- Whole-table ownership is too blunt for root schema merge. The useful behavior
  is additive structural patching, not replace-or-skip.

## Plan
1. Replace `reconcileRootSchemaOwnership()` table replacement logic with
   structural declaration/registration/relation merge helpers.
2. Keep dedicated generated files on their own ownership model; change only root
   `schema.ts` behavior.
3. Add regression tests for additive merge and conflict detection.
4. Thread manual cleanup warnings through plan/apply output.
5. Verify with focused tests, package build/typecheck/lint, and live `example/`
   username-plugin repro.

## Status

- Done: root auth schema sync now merges compatible fragments into existing
  local tables instead of treating them as all-or-nothing ownership blocks.
- Done: schema reconcile returns manual cleanup warnings for stale root schema
  lock entries.
- Done: auth schema planning and CLI output surface those manual actions.

## Verification

- Passed: `bun test packages/kitcn/src/cli/registry/schema-ownership.test.ts packages/kitcn/src/cli/registry/items/auth/auth-item.test.ts`
- Passed: `bun --cwd packages/kitcn build`
- Passed: `bun lint:fix`
- Live proof: `bunx kitcn add auth --only schema --overwrite --yes`
  updated `example/convex/functions/schema.ts` to add auth plugin fields such
  as `displayUsername` while leaving `plugins.lock.json` unchanged.
- Blocked: `bun typecheck` is still red on unrelated existing `example`
  generated-runtime / Resend output breakage, not on the root schema merge
  itself.
