# Concave Alpha.14 Parity Cut

## Goal

Remove Concave-specific Better Convex bandaids that alpha.14 made obsolete,
keep the ones still justified, and update the parity skill to match reality.

## Findings

- Raw `concave dev` on alpha.14 defaults to `http://localhost:3210`.
- Raw `concave run` now succeeds for:
  - `generated/server:migrationRun`
  - `generated/server:aggregateBackfill`
- Raw `concave dev` still does not expose `3211`.
- Raw `concave dev` in a Vite app still auto-detects and starts the frontend.
- Immediate `concave run` after spawning `concave dev` can still fail with
  `ECONNREFUSED`, so the startup retry loop still has a job.
- Raw `concave codegen --static` now emits the same `api.d.ts` shape our
  old source-backed override used to force.

## Cut List

- Remove the `/api/execute` internal runtime shim.
- Stop forcing `--port 3210` in Concave dev.
- Remove the source-backed `api.d.ts` override and fixture normalization step.
- Keep the `3211` site proxy.
- Keep the Concave startup retry loop.
- Keep the Vite `--frontend no` scenario split.

## Verification

- `bun test packages/better-convex/src/cli/commands/dev.test.ts packages/better-convex/src/cli/commands/migrate.test.ts`
- `bun run test:concave`
- `bun run fixtures:sync`
- `bun run fixtures:check`
- `bun run scenario:test -- next`
- `bun lint:fix`
- `bun typecheck`
