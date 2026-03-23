# 2026-03-22 concave dev startup retry

## Goal

Add a concave-only retry loop around dev startup migration and aggregate
backfill kickoff so transient readiness failures stop spamming warnings.

## Findings

- `better-convex dev` fires `runMigrationFlow` and
  `runAggregateBackfillFlow` immediately on startup.
- The warnings reproduce on Concave but not on Convex for the same prepared
  app.
- Current code warns on the first non-zero exit code.
- A short retry loop in `dev.ts` is the right seam; schema-update backfill
  can stay as-is.

## Plan

1. Add tests for retry behavior in `dev.test.ts`.
2. Add a concave-only retry helper in `dev.ts` with TanStack-style backoff.
3. Use it for startup migration and startup aggregate kickoff.
4. Update the active changeset.
5. Verify with tests, build, typecheck, and lint.

## Progress

- 2026-03-22: gathered reproduction and confirmed the Convex vs Concave
  parity gap.
- 2026-03-22: retry loop landed, then live Concave repro showed the deeper
  seam: `concave run` cannot execute Better Convex internal runtime functions.
- 2026-03-22: fixed Concave internal runtime calls by posting to
  `/api/execute` with system auth for `generated/server:*`, and verified live
  `scenario:dev -- next` now settles without the old warning spam.
