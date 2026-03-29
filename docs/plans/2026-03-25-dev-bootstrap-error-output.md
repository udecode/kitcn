## Goal

Make `kitcn dev` print the real Convex bootstrap failure output instead
of dying with only `Bootstrapping local Convex...`.

## Plan

- [completed] Add a failing test proving `handleDevCommand` waits for backend
  stderr drain on fast failure.
- [completed] Fix the dev output observer so it resolves false only after
  stream close, while still resolving true immediately on the ready line.
- [completed] Verify with targeted tests, package typecheck/build, lint, and a
  live `example` smoke.

## Findings

- `bun run convex:dev` and `bunx kitcn dev` both hide the underlying
  backend error right now.
- Raw `bun convex dev --once --typecheck disable` in `example` prints the real
  stderr: `A local backend is still running on port 3210...`.
- `observeDevProcessOutput(...)` settles false as soon as the child promise
  resolves, before stdout/stderr necessarily finish draining.
- `handleDevCommand(...)` returns on backend exit without waiting for that drain.
- The current `example` repro is even earlier: silent `convex init` preflight
  failure. `runConvexInitIfNeeded(..., { echoOutput: false })` was suppressing
  failure output along with normal noise.
