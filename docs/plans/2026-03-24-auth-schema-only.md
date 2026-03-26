## Goal

Make `better-convex add auth --only schema --yes` a real schema-only refresh
path for the default Better Convex auth scaffold, even when auth schema
ownership has not been written to `plugins.lock.json` yet.

## Plan

- [completed] Add a red test that proves auth-item forwards `applyScope:
  "schema"` into root schema ownership.
- [completed] Fix the auth-item wrapper so schema-only mode can replace managed
  drift without forcing full auth reconcile.
- [completed] Verify the live `example` command only touches auth schema +
  `plugins.lock.json`.
- [completed] Re-run package verification and capture the solution note.

## Findings

- The schema ownership engine already supports schema-only managed overwrite via
  `overwriteManaged`.
- The actual bug is one layer higher: the auth registry item wrapper destructures
  plan params and drops `applyScope` before calling
  `buildAuthSchemaRegistrationPlanFile`.
- Direct `reconcileRootSchemaOwnership({ overwriteManaged: true })` works
  against `example`; the wrapper path is the liar.
- Live proof after the fix: `example` updates exactly
  `convex/functions/schema.ts` and `convex/functions/plugins.lock.json`.
- The command still needs the default Better Convex auth scaffold files to
  exist. It no longer needs a prior auth schema lock entry.
