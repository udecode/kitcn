# 2026-03-22 scenario typecheck removal

## Goal

Delete the redundant `scenario:typecheck` script and CLI mode because `scenario:check` already runs typecheck through app validation.

## Plan

1. Find the script, parser, and dispatch seams.
2. Remove the dead mode and any stale refs.
3. Verify with scenario tests, deleted-mode rejection, lint, and typecheck.

## Progress

- 2026-03-22: removed `scenario:typecheck` from `package.json`.
- 2026-03-22: removed `typecheck` mode support and `typecheckScenarios()` from `tooling/scenarios.ts`.
- 2026-03-22: verified `bun test ./tooling/scenarios.test.ts` passed.
- 2026-03-22: verified `bun tooling/scenarios.ts typecheck` now fails with the trimmed usage surface.
- 2026-03-22: `bun lint:fix` passed.
- 2026-03-22: `bun typecheck` still fails on the existing committed `fixtures/vite` generated runtime typing errors, unrelated to this removal.
