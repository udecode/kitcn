# Managed schema TS cutover

## Goal
Remove visible `better-convex-managed` comment markers from root `schema.ts` ownership while preserving plugin schema reconciliation, drift detection, and schema-only claim flows.

## Plan
1. Replace comment-marker ownership reads with structural TS extraction by table key.
2. Keep lockfile as ownership source of truth and compute checksums from extracted declaration/registration/relations fragments.
3. Strip legacy managed comments on read so existing apps migrate cleanly on the next schema reconcile.
4. Update tests to assert pure TS output and legacy-source migration.
5. Verify focused package tests, build, typecheck, lint, and fixture/scenario/example proof as needed.
