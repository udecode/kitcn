# 2026-03-22 scenario test command

## Goal

Add a `scenario:test` command that executes the proof path already defined in the scenarios skill.

## Plan

1. Re-read the scenarios skill and current runner seams.
2. Add a `test` mode that dispatches per scenario class.
3. Add focused tests for the proof matrix.
4. Verify with scenario tests, build, lint, and typecheck.

## Progress

- 2026-03-22: started inspecting the scenarios skill matrix and current runner entrypoints.
- 2026-03-22: added `scenario:test` to `tooling/scenarios.ts` and root `package.json`, with proof-path dispatch for runtime, auth demo, auth runtime, and bootstrap-heavy check scenarios.
- 2026-03-22: added focused runner tests for the proof matrix and for `next-auth` auth checks executing inside the live runtime window instead of after teardown.
- 2026-03-22: verified `bun test ./tooling/scenarios.test.ts`, `bun lint:fix`, and `bun --cwd packages/better-convex build`.
- 2026-03-22: verified live `bun run scenario:test -- next-auth` end-to-end, including `test:auth` and `test:e2e`.
- 2026-03-22: `bun typecheck` is still blocked by the existing committed template error in `fixtures/vite/convex/functions/generated/server.runtime.ts`.
- 2026-03-22: live `bun run scenario:test -- next` still logs a Concave auth bundle error for generated auth code while the app otherwise reaches ready and exits cleanly. Logged as residual follow-up, not part of the new `scenario:test` seam.
