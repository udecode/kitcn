# Dev Log Cleanup

## Goal

Make `better-convex dev` show Better Convex-owned bootstrap summaries instead of
raw Convex subprocess spam.

## Phases

- [completed] Research existing learnings and inspect current log sources.
- [completed] Add failing tests for the desired quiet bootstrap contract.
- [completed] Implement filtered bootstrap logging.
- [completed] Verify with tests, package gates, and runtime proof.

## Notes

- Default output should show one clear bootstrap story, not duplicate upstream
  noise.
- Raw subprocess chatter belongs behind debug output, not the normal path.
- Follow-up: keep one explicit rerun signal on file edits. `chokidar@5`
  dropped glob support, so the watcher has to use explicit roots plus an
  ignore predicate or live dev silently stops regenerating shared API output.
- Final cut: long-running `better-convex dev` keeps the raw Convex backend
  stream. Only one-shot bootstrap/verify stay on the filtered owned output
  path.
