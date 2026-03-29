# Scenario Init Yes Simplification

## Goal

Make bootstrap-heavy kitcn scenarios use the same public contract as the CLI: fresh scaffold through `init -t ... --yes`, then in-place local bootstrap through `init --yes` during scenario validation.

## Steps

- [completed] Verify current scenario config, runner, and synced scenario skill all point at `init --yes`.
- [completed] Prove the live bootstrap-heavy lanes and fix the remaining runner/bootstrap bugs.
- [completed] Re-run focused verification and record the final state.

## Findings

- Fresh app generation already uses `kitcn init -t <template> --yes`.
- The stale piece was bootstrap-heavy scenario validation, which previously chained `convex init`, `kitcn dev --once --typecheck disable`, and `kitcn env push`.
- Re-entering with `init --yes` exposed a scenario runner bug: later steps must reuse the prepared app's installed `kitcn` package spec instead of recomputing a new local tarball spec.
- `init` cannot rely on the generic codegen fallback for auth scenarios. It must run the auth-aware `syncEnv(prepare) -> local bootstrap -> syncEnv(complete)` path directly, and failed generic fallback bootstrap processes must be stopped instead of leaking the local port.
- In-place `init --yes` must preserve auth-managed Next variants like `lib/convex/server.ts` and `lib/convex/convex-provider.tsx` instead of forcing them back to the plain init baseline.
- Better Auth ORM schema generation cannot emit a plain index for a field that already uses `.unique()`. That created duplicate `session.token` indexes and broke live Convex pushes.

## Verification

- `bun test packages/kitcn/src/cli/commands/init.test.ts packages/kitcn/src/auth/create-schema-orm.test.ts tooling/scenarios.test.ts packages/kitcn/src/cli/cli.commands.ts --test-name-pattern 'init|generate ORM schema code with field mappings and indexes|resolveScenarioInstallSpecs|runScenarioTest|prepareScenario installs local kitcn before auth env backfill steps|scenario registry skips lint|runScenarioDev'`
- `bun --cwd packages/kitcn typecheck`
- `bun --cwd packages/kitcn build`
- `bun lint:fix`
- `bun run scenario:test -- convex-vite-auth-bootstrap`
- `bun run scenario:test -- convex-next-all`
