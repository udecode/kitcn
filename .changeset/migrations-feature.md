---
"better-convex": patch
---

## Features

- Add built-in ORM migrations with `defineMigration`, `defineMigrationSet`, and typed migration plan/status helpers.
- Add generated migration procedures (`migrationRun`, `migrationRunChunk`, `migrationStatus`, `migrationCancel`) to generated server/runtime contracts.
- Add `better-convex migrate` CLI commands: `create`, `up`, `down`, `status`, and `cancel`.
- Add migration orchestration to `better-convex dev` and `better-convex deploy` with configurable strictness, waiting, batching, and drift policy.
- Add safe-bypass migration writes by default with per-migration `writeMode: "normal"` override.
- Make `better-convex reset` clear migration state/history tables (`migration_state`, `migration_run`) in addition to user and aggregate tables.
