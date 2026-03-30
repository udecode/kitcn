# Example Auth Add And Relations

## Goal

Use `example/` as a real stress case for `kitcn add auth`, especially
with multiple Better Auth plugins already in play. If rerunning `add auth`
breaks, fix the package source. Then support auth schema relations generation
the same way the example app expects.

## Phases

- [completed] Gather context from prior auth-schema learnings and the example
  app's current auth/schema setup.
- [completed] Reproduce `add auth` behavior in `example/` with real plugin
  churn.
- [completed] Add a failing test for the confirmed package bug.
- [completed] Implement the minimal package fix for auth plugin/schema
  generation.
- [completed] Verify with targeted tests, `example/` reruns, and the required
  package gates.

## Findings

- `example/package.json` already uses `gen:auth = kitcn add auth --yes`
- `example/` already ships auth-heavy app code, including admin and
  organization client usage.
- Existing auth schema reconcile coverage lives in
  `packages/kitcn/src/cli/registry/items/auth/reconcile-auth-schema.test.ts`
- Existing docs already state that rerunning `add auth` should refresh the
  managed auth schema file.
- Rerun auth schema generation has to set the `__KITCN_CODEGEN__`
  sentinel or env-backed `auth.ts` definitions can fail before schema
  derivation.
- `auth.ts` and `auth.config.ts` are user-owned on reruns because the schema
  reconcile step reads `auth.ts` as the source of truth.
- Apps that already define local auth tables must skip `authExtension()`
  injection in the root schema.
- Managed auth schema output must include ORM `.relations(...)`, not just
  tables and foreign keys.

## Open Questions

- None.
