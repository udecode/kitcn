# React Query Peer Drift

## Goal

Fix the runtime regression where app hooks and Better Convex hooks resolve
different `@tanstack/react-query` installs and lose provider context identity.

## Phases

- [completed] Reproduce the crash and confirm the provider tree itself is not
  the problem.
- [completed] Compare resolved module paths for the app and package imports.
- [completed] Pin React Query in the baseline install contract and repo sync.
- [completed] Verify the pin with tests, package gates, and module-resolution
  identity.

## Notes

- The reverted hook patch was the wrong fix. It only changed which broken
  context path failed first.
- The real regression was version drift:
  - app resolved `@tanstack/react-query@5.95.2`
  - package resolved `@tanstack/react-query@5.90.21`
- After pinning, both resolve the same physical module path and the React Query
  context identity matches again.
