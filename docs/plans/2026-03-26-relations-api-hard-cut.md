# 2026-03-26 Relations API Hard Cut

## Goal
Decide whether Better Convex should support exported relations or only chained .relations(...) and implement the cleanest API.

## Plan
- [x] Inspect docs and current implementation
- [x] Decide hard-cut API
- [x] Implement code/docs changes
- [x] Verify with focused tests

## Findings

- Codegen still treated named `relations` and named `triggers` exports as a
  second app-schema contract even though the ORM already stores metadata on the
  default schema chain.
- Root schema patching still mutated standalone `defineRelations(...)` helpers,
  which kept the dead pattern alive.
- `example` had regressed to `export const relations = defineRelations(schema,
  ...)`, which directly contradicted the current docs.

## Verification

- `bun test packages/better-convex/src/cli/codegen.test.ts packages/better-convex/src/cli/registry/schema-ownership.test.ts`
- `cd example && bun run codegen`
- `cd example && bun run typecheck`
- `bun typecheck`
- `bun lint:fix`
- `bun --cwd packages/better-convex build`
- `cd example && bun run check`
  blocked by an already-running local backend on port `3210`, not by codegen or
  type errors
