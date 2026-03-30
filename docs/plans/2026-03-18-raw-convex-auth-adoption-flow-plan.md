# Raw Convex auth adoption flow

Date: 2026-03-18
Status: in_progress

## Goal

Replace the staged raw Convex auth bootstrap flow with the real user flow:

1. `convex init`
2. `kitcn add auth --preset convex --yes`

`add auth --preset convex` should require a local Convex deployment first, then
run auth-scoped codegen plus `env push --auth` automatically unless the caller
explicitly passes `--no-codegen`.

## Plan

- [x] Inspect current `add`, `codegen`, `env push`, template, and scenario
      flows
- [x] Add a raw Convex deployment preflight for `add auth --preset convex`
- [x] Change raw Convex auth add to auto-run `codegen --scope auth`
- [x] Change raw Convex auth add to auto-run `env push --auth`
- [x] Update dry-run plan output so operations match real execution
- [x] Update scenario flow to `convex init` then `add auth --preset convex`
- [x] Update docs and skill references to remove staged bootstrap guidance
- [x] Update changeset if wording needs to reflect the breaking flow cut
- [x] Run focused tests, then repo verification
- [x] Patch prepared local scenario/template apps to `3005` without changing
      package scaffold defaults
- [x] Re-sync committed templates from source
- [x] Re-verify scenario prepare/dev flow on the updated port
- [x] Rerun template checks and record the current blocker

## Findings

- Templates already represent the intended user path better than scenarios:
  `next-auth` and `vite-auth` use `add auth --yes` without `--no-codegen`.
- Scenario bootstrap lanes started setup-heavy:
  - `convex-next-auth-bootstrap`: `add auth --no-codegen`, then `convex init`,
    then `kitcn dev --once`, then `env push --auth`
  - `create-convex-nextjs-shadcn-auth`: `add auth --preset convex --no-codegen`,
    then `convex init`, then `codegen --scope auth`, then `env push --auth`
- `handleAddCommand(...)` already owns post-scaffold codegen, so raw Convex
  auth can chain scoped codegen there without new command plumbing.
- `resolveRunDeps(...)` already exposes `syncEnv`, so raw Convex auth can call
  the existing env push implementation directly.
- Dry-run planner currently only knows about generic `kitcn codegen`
  plus env reminders, so raw Convex auth would lie unless operation output is
  adjusted.
- Fixture scenarios cannot run `convex init` inside `setup`, because `setup`
  happens before local kitcn install and before the fixture gets its
  project-local `node_modules/.bin/convex`.
- Replacing `runLocalCliSteps(...)` with a generic scenario runner dropped the
  local tarball env overrides. That made `add resend` fall back to npm instead
  of the packed local `@kitcn/resend` tarball.
- The `3005` preference belongs in prepared temp apps, not package defaults.
  The runnable local contract still needs three files patched together:
  package scripts, `.env.local`, and `convex/.env` for auth apps.
- Concave local dev has a second contract bug beyond frontend port drift:
  kitcn templates assume Convex-style local URLs
  (`NEXT_PUBLIC_CONVEX_URL=127.0.0.1:3210`,
  `NEXT_PUBLIC_CONVEX_SITE_URL=127.0.0.1:3211`), but upstream `concave dev`
  still defaults to a single server on `3000`. kitcn needs to normalize
  Concave local dev back onto the Convex two-port contract instead of teaching
  templates a backend-specific exception.
- The generated auth runtime failure on Concave dev was a real module cycle:
  `convex/functions/auth.ts` imports `defineAuth` from `generated/auth`, while
  `generated/auth` imports `../auth` and tried to read the default export at
  module top-level. Depending on the loader, that early read surfaced either as
  a TDZ `ReferenceError` or as a temporarily `undefined` export in the bundled
  Concave module graph.
- `template:check` and root `bun typecheck` are currently blocked by the
  existing generated runtime type failure in template packages
  (`fixtures/vite` and temp template checks), specifically
  `generated/server.runtime.ts` indexing `api["server"]` / `api["messages"]`
  against empty or auth-only API shapes. The port change did not introduce
  those errors; they reproduce on targeted template validation immediately
  after sync.

## Progress log

- 10:xx: scanned scenario config, template config, add/codegen/env command
  surfaces
- 10:xx: confirmed desired breaking cut: raw Convex auth only; leave create/init
  and batched multi-plugin scenario behavior alone
- 13:xx: added raw preset deployment preflight plus auto `codegen --scope auth`
  and `env push --auth`
- 13:xx: updated dry-run planner, docs, skill refs, and active changeset to the
  hard-cut `convex init` then `add auth --preset convex` flow
- 13:21: fixed scenario runner regression by restoring local kitcn and
  local Resend tarball env overrides for non-`convex` steps
- 13:21: verified targeted raw-auth tests, default scenario lane, and full
  Convex scenario lane
- 16:xx: resumed after scaffold:dev repro; traced port conflict to scaffold
  source defaults still assuming `3000`
- 16:4x: moved the `3005` preference out of package scaffolds and into
  prepared temp apps only, then re-synced committed templates back to package
  defaults
- 16:4x: verified prepared `next-auth` still starts Next on
  `http://localhost:3005`
- 16:4x: confirmed full template/typecheck blockers are the existing generated
  runtime type failures in template packages, not the port diff
- 07:2x: normalized Concave local dev to port `3210` plus a local site proxy on
  `3211`, with `CONVEX_SITE_URL` wired for backend auth/http flows
- 07:2x: fixed generated auth resolution to defer default-export access until
  runtime use, which kills both the TDZ variant and the bundled-`undefined`
  variant of the auth cycle
- 07:3x: verified `bun run scenario:dev -- next-auth` boots cleanly with Next on
  `3005`, Concave on `3210`, a live proxy on `3211`, and no auth runtime crash

## Risks

- Raw Convex deployment detection must read project-local state, not inherited
  parent env.
- `--no-codegen` still needs to remain a valid CI/batched-install escape hatch.
- Scenario validation must stay green after swapping to the user path and after
  genericizing scenario command execution.
