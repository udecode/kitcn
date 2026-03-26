# Aggregate Page Failures

## Goal

Fix the two failing checks on `/aggregate` in the example app without papering
over the underlying runtime or package bug.

## Plan

1. Reproduce the failing checks in the live app and capture the exact failures.
2. Trace the failing checks back to the aggregate demo backend/runtime path.
3. Add or update tests around the real seam.
4. Apply the minimal fix.
5. Verify in browser and with package/app checks that actually cover the change.

## Findings

- Initial inspection: the page derives its pass/fail counts from
  `snapshot.parity.entries` and `snapshot.runtimeCoverage`, both served by
  `example/convex/functions/aggregateDemo.ts`.
- The two live failures were `count-window-cursor` and
  `aggregate-window-cursor-metrics`.
- The first broken layer was query cursor coercion: count/aggregate cursor
  bounds were injected as `_creationTime`, but the no-scan aggregate planner
  only accepts public filter keys like `createdAt`.
- Fixing only that layer was not enough. Aggregate index matching also needed to
  normalize `createdAt` back to `_creationTime` and treat system creation time
  as the implicit trailing range field on aggregate indexes.
- Source tests were green before the page because `example` was still bundling
  stale `packages/better-convex/dist`. Rebuilding the package was required for
  live proof.

## Verification

- `bun test packages/better-convex/src/orm/query.is-nullish.test.ts`
- `bun --cwd packages/better-convex typecheck`
- `bun --cwd packages/better-convex build`
- live snapshot proof from `example`:
  - anonymous sign-in
  - `bun convex run --push --identity ... aggregateDemo:getSnapshot '{}'`
  - both runtime probes now return `ok: true`
- `agent-browser` is blocked in this environment and hangs even on
  `agent-browser open about:blank`, so browser verification was not trustworthy
  enough to use
