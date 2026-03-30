# Root First Auth Schema Ownership

## Goal

Replace the default auth scaffold path with root-schema ownership that still
behaves losslessly enough for real apps:

- `kitcn add auth` should patch `convex/functions/schema.ts` directly
- conflicts should be resolved per auth table
- ownership decisions should persist in `plugins.lock.json`
- `--yes` should reuse known ownership only
- `--overwrite` should be the explicit hammer for first-time claims and drift

## Phases

- [completed] Ground the current auth planner, lockfile, prompt, and apply
  seams.
- [completed] Add failing tests for schema-unit ownership, lockfile memory, and
  non-interactive behavior.
- [completed] Implement a generic schema ownership engine and wire auth to it.
- [completed] Remove the default managed auth schema file path and update auth
  docs/skills/changeset.
- [completed] Verify with targeted tests, package gates, and auth runtime
  proof.

## Findings

- `add auth` already had the right public verb. The missing piece was per-table
  ownership memory in `plugins.lock.json`, not another command.
- Root schema patching needs fragment ownership, not file ownership:
  declaration, registration, and relation blocks have to move together per
  auth table.
- Fresh `.relations(...)` insertion needs explicit trailing commas on managed
  relation blocks. The AST parser test seam was too weak until it matched real
  extracted relation units.
- Better Auth schema generation carried a stale manual `user.userId` index.
  Root-first loading exposed it immediately during schema finalization, so
  manual index generation now skips missing fields instead of trusting the
  static index map blindly.

## Verification

- `bun test packages/kitcn/src/cli/registry/schema-ownership.test.ts packages/kitcn/src/cli/registry/index.test.ts packages/kitcn/src/cli/registry/planner.test.ts packages/kitcn/src/cli/registry/items/auth/auth-item.test.ts packages/kitcn/src/cli/registry/items/auth/reconcile-auth-schema.test.ts packages/kitcn/src/cli/cli.commands.ts --test-name-pattern 'add auth|plugin stack|schema ownership|root schema'`
- `bun test packages/kitcn/src/auth/create-schema-orm.test.ts packages/kitcn/src/auth/create-schema.test.ts packages/kitcn/src/cli/registry/schema-ownership.test.ts`
- `bun --cwd packages/kitcn typecheck`
- `bun --cwd packages/kitcn build`
- `bun lint:fix`
- `bun run fixtures:sync`
- `bun run fixtures:check`
- `bun run scenario:test -- next-auth`

## Open Decisions Locked

- Default mode: root-first hard cut
- Granularity: per auth table
- Memory: `plugins.lock.json`
- Non-interactive first claim: `--overwrite`
- `--yes`: reuse stored ownership only
- Drift on owned root block: prompt interactively, fail on `--yes`,
  replace on `--overwrite`
