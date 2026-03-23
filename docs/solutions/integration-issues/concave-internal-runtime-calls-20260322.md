---
title: Concave internal runtime calls need system auth over execute
category: integration-issues
tags:
  - concave
  - dev
  - migrations
  - aggregate
  - auth
  - cli
symptoms:
  - `better-convex dev --backend concave` prints startup retry counters, then still warns that migration or aggregate kickoff failed
  - Concave logs `INTERNAL_FUNCTION_ACCESS` for `generated/server:migrationRun` or `generated/server:aggregateBackfill`
  - routing those calls through `_system:systemExecuteFunction` via `concave run` still fails with the same internal access error
module: concave-dev
resolved: 2026-03-22
---

# Concave internal runtime calls need system auth over execute

## Problem

Better Convex startup hooks call internal runtime mutations:

- `generated/server:migrationRun`
- `generated/server:migrationStatus`
- `generated/server:aggregateBackfill`
- `generated/server:aggregateBackfillStatus`

On Convex local dev, those startup-time calls work.

On Concave local dev, they do not. `concave run` invokes the normal public
execute path, so internal Better Convex runtime functions are rejected with:

```txt
INTERNAL_FUNCTION_ACCESS
```

That made the new retry loop useless. Retries stopped the early warning spam,
but they could never succeed because the function access path itself was wrong.

## Root Cause

Concave has two different execution seams:

1. public execute calls
2. internal/system execute calls

`concave run` only uses the public seam.

That is fine for normal user functions. It is wrong for Better Convex runtime
functions because those are generated internal mutations under
`generated/server:*`.

Trying to wrap them in `_system:systemExecuteFunction` through `concave run`
does not help. `_system:systemExecuteFunction` is itself internal, so the same
public call path rejects it too.

The actual working seam is the raw execute endpoint:

- `POST /api/execute`

with a body like:

```json
{
  "path": "_system:systemExecuteFunction",
  "type": "mutation",
  "format": "json",
  "args": {
    "functionPath": "generated/server:migrationRun",
    "args": {
      "direction": "up",
      "batchSize": 256,
      "allowDrift": true
    },
    "functionType": "mutation"
  },
  "auth": {
    "tokenType": "System"
  }
}
```

In development, Concave accepts insecure system auth, so no token is required.

## Solution

Use two fixes together.

### Keep the Concave-only startup retry loop

Startup migration and aggregate kickoff in `better-convex dev` still use the
TanStack-style retry loop:

- 1s
- 2s
- 4s

While retrying, only show:

```txt
↻ migration up retry 2/4
↻ aggregateBackfill kickoff retry 2/4
```

No warning spam during intermediate retries.

### Route Concave internal Better Convex runtime calls through `/api/execute`

When Better Convex calls `generated/server:*` on backend `concave`, do not
shell out to `concave run`.

Instead:

1. resolve the Concave base URL from `--url`, `--port`, or the local default
2. `POST` directly to `/api/execute`
3. call `_system:systemExecuteFunction`
4. send `auth: { tokenType: "System" }`
5. unwrap `result` into the JSON stdout shape Better Convex already expects

That keeps the existing migration/backfill flows intact without requiring the
Concave CLI to grow new flags first.

## Verification

- `bun test ./packages/better-convex/src/cli/commands/dev.test.ts`
- `bun test ./packages/better-convex/src/cli/commands/migrate.test.ts ./packages/better-convex/src/cli/cli.commands.ts --test-name-pattern "concave"`
- `bun run scenario:prepare -- next`
- `bun run scenario:dev -- next`

Observed live behavior after the fix:

- startup shows retry counters only
- no `INTERNAL_FUNCTION_ACCESS` log spam
- `No pending migrations to apply.` prints once the backend is ready
- no fallback warning about migration or aggregate kickoff failure

Repo gates:

- `bun --cwd packages/better-convex build`
- `bun lint:fix`
- `bun typecheck` is still blocked by the existing committed `fixtures/vite`
  generated runtime typing errors

## Prevention

1. Do not assume a backend CLI `run` command can execute internal runtime
   functions just because public functions work.
2. If Concave parity work touches Better Convex runtime internals, test the
   live local dev path, not just stubbed CLI args.
3. Retry loops only help for transient failures. If the backend is rejecting
   the function class entirely, fix the execution seam first.

## Files Changed

- `packages/better-convex/src/cli/backend-core.ts`
- `packages/better-convex/src/cli/commands/dev.ts`
- `packages/better-convex/src/cli/commands/dev.test.ts`
- `packages/better-convex/src/cli/commands/migrate.test.ts`
- `packages/better-convex/src/cli/cli.commands.ts`

## Related

- `docs/solutions/integration-issues/concave-local-dev-auth-cycle-20260319.md`
