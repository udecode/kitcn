---
name: concave-parity
description: 'Skill: concave-parity'
---

# Concave Parity

## Contract

When the user asks for Concave parity, treat Convex behavior as the source of
truth for Better Convex runtime contracts.

Do not hand-wave with "compatible enough."

Do not normalize a parity shift into "just how Concave works" if Better Convex
already has a shim for it. Name the shift, point at the shim, and state the
delete condition.

If upstream Concave reaches parity, delete the bandaid. Do not keep fallback
sludge around for nostalgia.

## Hard Rules

- Every Concave-specific workaround must be listed here with file locations.
- Every new Concave workaround needs a removal trigger.
- If you touch a listed bandaid, re-check whether upstream parity makes it
  deletable right now.
- If the shift only affects repo tooling or scenarios, say that explicitly.
- If the shift is only observed and not patched, keep it in the watchlist, not
  the bandaid section.

## Active Bandaids

### 1. Local dev site-side `3211` proxy

Convex local dev shape in this repo:

- backend on `127.0.0.1:3210`
- site URL on `127.0.0.1:3211`
- frontend app on `localhost:3005` in prepared scenarios

Concave alpha.14 fixed the backend default to `3210`, but it still does not
expose the site side on `3211`.

Better Convex workaround:

- start a local site proxy on `3211`
- inject `CONVEX_SITE_URL=http://127.0.0.1:3211`
- inject `SITE_URL` from `.env.local`

Code locations:

- `packages/better-convex/src/cli/commands/dev.ts`
  - `resolveConcaveLocalDevContract(...)`
  - `resolveConcaveLocalSiteUrl(...)`
  - `startLocalSiteProxy(...)`
- `packages/better-convex/src/cli/commands/dev.test.ts`
- `tooling/scenarios.ts`
  - `DEFAULT_SCENARIO_READY_URL`
  - `readScenarioSiteUrl(...)`
- `tooling/scaffold-utils.ts`
  - local env patching for `3005`

Why it exists:

- prepared apps and auth wiring already assume the Convex-style split
- upstream still only exposes the backend side

Delete when:

- Concave local dev natively supports the same backend/site split contract, or
- Better Convex no longer needs to emulate Convex local URLs for prepared apps

### 2. Startup retry loop for dev migration/backfill hooks

Convex dev startup usually accepts Better Convex migration/backfill hooks
cleanly on first call.

Concave alpha.14 fixed `concave run` for internal runtime functions, but
startup can still race readiness.

Better Convex workaround:

- Concave-only retry loop
- backoff: `1s`, `2s`, `4s`
- show retry count only while retrying

Code locations:

- `packages/better-convex/src/cli/commands/dev.ts`
  - `runDevStartupRetryLoop(...)`
  - startup `migration up` and `aggregateBackfill kickoff` callers
- `packages/better-convex/src/cli/commands/dev.test.ts`
- related notes:
  - `docs/solutions/integration-issues/concave-internal-runtime-calls-20260322.md`
  - `docs/solutions/integration-issues/concave-local-dev-auth-cycle-20260319.md`

Why it exists:

- immediate `concave run` calls can still hit `ECONNREFUSED` before local dev
  is ready

Delete when:

- Concave local dev exposes a reliable readiness signal integrated into the CLI,
  or
- startup hooks become reliably callable with no transient failures

### 3. Vite scenario backend/frontend split

Prepared Vite scenarios in this repo are supposed to prove:

- frontend on `3005`
- backend on the Better Convex local contract

Concave alpha.14 still auto-detects and starts Vite itself, which steals
frontend ownership and lands on `5173`.

Better Convex workaround:

- run backend dev with `--frontend no`
- run the prepared Vite frontend separately

Code locations:

- `tooling/scenarios.ts`
  - `buildBackendOnlyDevCommand(...)`
  - `resolveScenarioDevCommands(...)`
- `tooling/scenarios.test.ts`
- related note:
  - `docs/solutions/integration-issues/scenario-vite-dev-split-and-react18-runtime-20260322.md`

Why it exists:

- scenario proof should validate the prepared app contract, not Concave's
  auto-detected default frontend behavior

Delete when:

- Concave backend-only dev becomes unnecessary for prepared Vite scenarios, or
- Concave frontend auto-detection respects the prepared dev command/port with
  no special handling

### 4. Generated auth runtime fallback for empty Concave internals

Convex-generated `_generated/api.js` exposes internal refs for generated auth
runtime calls.

Concave alpha.14 still leaves prepared auth apps with:

```js
export const internal = {};
```

That breaks generated auth runtime access like `authFunctions.findOne` even
though the actual function paths are known.

Better Convex workaround:

- synthesize generated auth internal refs from their function path names
- use `createGeneratedFunctionReference(...)` instead of trusting Concave's
  empty `internal` object

Code locations:

- `packages/better-convex/src/auth/generated-contract.ts`
- `packages/better-convex/src/auth/generated-contract.test.ts`
- related note:
  - `docs/solutions/integration-issues/concave-alpha14-generated-auth-and-run-output-20260323.md`

Why it exists:

- Concave local codegen/runtime shape is still missing generated auth internal
  refs that Convex-generated output exposes

Delete when:

- Concave-generated `_generated/api.js` includes generated auth internal refs,
  and
- prepared auth scenarios no longer need synthesized fallback references

### 5. Concave `run` output JSON fallback parsing

Convex-style machine output is clean JSON when Better Convex shells out to a
backend `run` command and expects structured results.

Concave alpha.14 now prints a human preamble before the JSON body, for example:

- `Running ...`
- `Args: ...`
- `URL: ...`
- `Success`
- pretty JSON

Better Convex workaround:

- parse a trailing JSON block after the preamble
- keep the existing one-line JSON path for Convex and any future clean output

Code locations:

- `packages/better-convex/src/cli/backend-core.ts`
  - `parseBackendRunJson(...)`
- `packages/better-convex/src/cli/commands/migrate.test.ts`
- related note:
  - `docs/solutions/integration-issues/concave-alpha14-generated-auth-and-run-output-20260323.md`

Why it exists:

- alpha.14 made `concave run` human-friendlier but less machine-clean for the
  startup migration and aggregate flows Better Convex shells out to

Delete when:

- `concave run` exposes clean JSON output by default or under a stable flag we
  can rely on, and
- `parseBackendRunJson(...)` no longer needs the trailing-block fallback

## Removed Bandaids

### Internal runtime execution via `/api/execute`

Removed in alpha.14 verification.

Old workaround:

- bypass `concave run` for `generated/server:*`
- `POST /api/execute`
- call `_system:systemExecuteFunction`

Why it died:

- raw `concave run` now succeeds for `generated/server:migrationRun` and
  `generated/server:aggregateBackfill`

### Forced `3210` dev port on Concave

Removed in alpha.14 verification.

Old workaround:

- always append `--port 3210` to `concave dev` when Better Convex owned local
  dev boot

Why it died:

- raw `concave dev` now defaults to `3210`

### Source-backed Concave API type override

Removed in alpha.14 verification.

Old workaround:

- wait briefly after Concave codegen
- overwrite `_generated/api.d.ts` with a source-backed version

Why it died:

- raw `concave codegen --static` now emits the same `api.d.ts` shape our
  override used to force

## Watchlist: Known Gaps Without a Better Convex Bandaid

### No env command parity

Current repo truth:

- Better Convex can wrap/pass through Convex env commands
- Concave has no equivalent upstream env command surface

Current location:

- `.claude/skills/concave/concave.mdc`

Meaning:

- do not invent fake env passthrough parity on our side unless the user asks
  for that product cut explicitly

### `staticDataModel` mismatch

Current repo truth:

- `fixtures/next/convex.json` sets `codegen.staticDataModel: true`
- Concave-generated `_generated/dataModel.d.ts` is still dynamic

Current location:

- `.claude/skills/concave/concave.mdc`

Meaning:

- treat this as an upstream parity gap
- do not silently document it as if Concave already matches Convex here

## Read First

Start with the active bandaid seams:

- `packages/better-convex/src/cli/commands/dev.ts`
- `tooling/scenarios.ts`

Then read the solution notes:

- `docs/solutions/integration-issues/concave-local-dev-auth-cycle-20260319.md`
- `docs/solutions/integration-issues/concave-internal-runtime-calls-20260322.md`
- `docs/solutions/integration-issues/concave-alpha14-generated-auth-and-run-output-20260323.md`
- `docs/solutions/integration-issues/scenario-vite-dev-split-and-react18-runtime-20260322.md`

## Verification

When touching any active Concave parity bandaid, run the smallest real gate
that proves the seam:

```bash
bun test packages/better-convex/src/cli/commands/dev.test.ts \
  packages/better-convex/src/cli/commands/migrate.test.ts \
  packages/better-convex/src/auth/generated-contract.test.ts \
  tooling/scenarios.test.ts

bun run test:concave
bun run scenario:test -- next-auth
bun run scenario:test -- vite
```

