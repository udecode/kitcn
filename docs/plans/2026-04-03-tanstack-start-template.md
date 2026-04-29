---
title: "feat: add TanStack Start init template and first-class Start auth surface"
type: feat
status: active
date: 2026-04-03
origin: .omx/specs/deep-interview-start-template.md
depth: deep
---

# feat: add TanStack Start init template and first-class Start auth surface

## Overview

Ship `kitcn init -t start` as a real fresh-scaffold lane, built on shadcn's
own TanStack Start template, and make Start auth a first-class public surface
via `kitcn/auth/start`.

This is not a docs-only cleanup. The current contract is split across four
different truths:

- fresh `init -t` only supports `next|vite`
- adoption already detects `tanstack-start`
- docs already describe TanStack Start auth
- package exports still do not provide a Start auth entrypoint

That split is exactly how stale exceptions and auth/init clobbering bugs keep
breeding.

## Problem Frame

Today Start is half-supported in the most annoying way:

- `packages/kitcn/src/cli/project-context.ts` detects `tanstack-start`
- `packages/kitcn/src/cli/commands/init.ts` and
  `packages/kitcn/src/cli/backend-core.ts` still reject `-t start`
- `www/content/docs/tanstack-start.mdx` and
  `packages/kitcn/skills/kitcn/references/setup/start.md` document direct
  `@convex-dev/better-auth/react-start` usage as a special-case exception
- the generic React scaffold path assumes a Vite-style `main.tsx`, which is the
  wrong seam for Start
- auth registry target resolution currently treats route/page output through the
  app-shell assumptions used by existing frameworks, not Start route
  conventions

If shipped as-is, `-t start` would either:

1. pretend generic React/Vite patches are close enough
2. keep generated Start auth on direct upstream imports forever
3. skip real fixture/scenario proof

All three are bogus.

## Requirements Trace

Source of truth: [deep-interview-start-template.md](/Users/zbeyens/git/better-convex/.omx/specs/deep-interview-start-template.md)

- R1. Support `kitcn init -t start` as a public fresh-scaffold command.
- R2. Use shadcn's own Start template, not a homegrown approximation.
- R3. Expose a first-class public Start auth entrypoint at `kitcn/auth/start`.
- R4. Keep that surface thin by re-exporting
  `@convex-dev/better-auth/react-start`.
- R5. Add Start-aware `kitcn add auth` support with explicit ownership
  boundaries.
- R6. Preserve auth-managed Start variants on init reruns and preserve
  user-owned auth definitions on add-auth reruns.
- R7. Sync docs and Convex skill references to the latest contract.
- R8. Add fixture/scenario proof so the shipped lane is honest.

## Scope Boundaries

- Include:
  - single-app Start fresh scaffold
  - single-app Start auth scaffold
  - `kitcn/auth/start`
  - fixture + scenario proof for Start
- Exclude:
  - Start monorepo support
  - a new custom Start auth wrapper
  - “just keep importing upstream directly in generated code”
  - extra auth feature work unrelated to making Start honest

## Context & Research

### Primary code references

- `packages/kitcn/src/cli/commands/init.ts`
- `packages/kitcn/src/cli/backend-core.ts`
- `packages/kitcn/src/cli/project-context.ts`
- `packages/kitcn/src/cli/registry/init/react/*`
- `packages/kitcn/src/cli/registry/items/auth/auth-item.ts`
- `packages/kitcn/src/auth-nextjs/index.ts`
- `packages/kitcn/package.json`
- `packages/kitcn/tsdown.config.ts`
- `tooling/template.config.ts`
- `tooling/scenario.config.ts`
- `tooling/scenarios.ts`

### External repo references already available locally

- `../shadcn/packages/shadcn/src/templates/start.ts`
- `../shadcn/templates/start-app/**`
- `../convex-better-auth/src/react-start/index.ts`

### Institutional learnings to follow

- `docs/solutions/integration-issues/init-yes-scenarios-must-skip-generic-codegen-fallback-and-preserve-auth-managed-next-files-20260324.md`
  : init must preserve more-specific auth-managed files.
- `docs/solutions/integration-issues/add-auth-reruns-must-preserve-auth-definition-and-relations-20260323.md`
  : if add-auth reads a file as source of truth, it does not get to overwrite
  it later.
- `docs/solutions/integration-issues/auth-guidance-must-follow-convex-functions-dir-20260323.md`
  : docs and generated guidance must use the same real contract.
- `docs/solutions/integration-issues/managed-auth-first-pass-jwks-and-auth-demo-session-20260324.md`
  : first-pass auth fallbacks must match the real scaffold contract, and auth
  demo pages should trust real session state.
- `docs/solutions/integration-issues/auth-env-push-must-be-auth-aware-and-dev-bootstrap-must-stay-two-phase-20260324.md`
  : auth bootstrap sequencing is real; do not flatten it into fake simplicity.

### External research decision

No internet research needed. Local source-of-truth repos already answer the two
external contract questions:

- shadcn has a real `start` template
- Convex Better Auth already has a real Start runtime helper

## Key Technical Decisions

### 1. Treat Start as first-class, not “generic React with extra patches”

`tanstack-start` should keep mapping to `mode: 'react'` for broad shared client
behavior, but the init and auth planners need a dedicated Start branch.

Reason:

- the current React init path literally requires `main.tsx`
- Start’s actual seam is `src/router.tsx` plus `src/routes/__root.tsx`

### 2. Keep `kitcn/auth/start` thin

Create a new package entrypoint that re-exports
`@convex-dev/better-auth/react-start`.

Reason:

- Start already has a correct upstream runtime seam
- the real value here is stable package surface + scaffold ownership, not a
  second wrapper

### 3. Give Start a real auth route/demo lane

Do not copy Vite’s weaker “auth runtime only” proof path. Start has file-based
routes, and the auth registry already has an auth demo page template. Start
should ship a real `/auth` route and use an auth-demo scenario lane.

Reason:

- weaker proof would undercut the point of first-class Start support
- Start can support browser auth honestly without inventing new product surface

### 4. Preserve ownership boundaries explicitly

- `init -t start` owns the Start baseline
- `add auth` owns Start-specific auth files and auth-aware overlays
- init reruns must preserve auth-managed Start variants
- add-auth reruns must preserve user-owned auth definition files

### 5. Add dedicated fixtures/scenarios instead of pretending existing Vite lanes cover Start

Start should get its own committed fixtures and scenario keys.

Reason:

- Start baseline files differ materially from Vite baseline files
- Start auth proof is stronger than Vite auth proof

## Execution Posture

Carry TDD posture for package code that changes live behavior.

That means:

- add or extend focused tests before reshaping init/auth branching
- use fixtures/scenarios as proof for scaffold/runtime behavior, not as the
  first way to discover the contract

## Implementation Units

- [ ] **Unit 1: Open the public init contract to `-t start`**

**Goal:** make `start` a supported fresh-scaffold template everywhere the CLI
surfaces that contract.

**Files:**

- Modify: `packages/kitcn/src/cli/backend-core.ts`
- Modify: `packages/kitcn/src/cli/commands/init.ts`
- Modify: `packages/kitcn/src/cli/project-context.ts`
- Modify: `packages/kitcn/src/cli/commands/init.test.ts`
- Modify: `packages/kitcn/src/cli/cli.commands.ts`

**Approach:**

- Add `start` to `SUPPORTED_INIT_TEMPLATES`.
- Pass `start` through `createProjectWithShadcn(...)` unchanged.
- Teach `resolveProjectScaffoldContext({ template })` that `template: 'start'`
  implies detected framework `tanstack-start`.
- Update help text and error strings so they stop lying about `next|vite`.
- Keep the existing staging-in-empty-dir behavior and bootstrap flow shared.

**Test files:**

- `packages/kitcn/src/cli/commands/init.test.ts`
- `packages/kitcn/src/cli/cli.commands.ts`

**Test scenarios:**

- `init -t start --yes` is accepted and shells out to shadcn with
  `--template start`
- current empty-directory staging still works for `start`
- “unsupported template” and “supported modes” errors now mention `start`
- adoption detection still resolves existing TanStack Start apps as supported

- [ ] **Unit 2: Add a Start-specific init overlay instead of the current Vite-style React patch path**

**Goal:** bootstrap a Start app against the real Start shell files.

**Files:**

- Modify: `packages/kitcn/src/cli/backend-core.ts`
- Add: `packages/kitcn/src/cli/registry/init/start/init-start-root.template.ts`
- Add: `packages/kitcn/src/cli/registry/init/start/init-start-router.template.ts`
- Add: `packages/kitcn/src/cli/registry/init/start/init-start-convex-provider.template.ts`
- Add: `packages/kitcn/src/cli/registry/init/start/init-start-crpc.template.ts`
- Add: `packages/kitcn/src/cli/registry/init/start/init-start-provider-mount.template.ts`
- Modify or reuse: `packages/kitcn/src/cli/registry/init/next/init-next-query-client.template.ts`
- Modify: `packages/kitcn/src/cli/commands/init.test.ts`

**Approach:**

- Split the current “react scaffold” logic into:
  - shared React files that are actually framework-neutral
  - framework-specific overlay paths for Vite vs Start
- Do not call `buildInitReactMainPlanFile(...)` for Start.
- Patch or replace:
  - `src/router.tsx`
  - `src/routes/__root.tsx`
  - `src/lib/convex/crpc.tsx`
  - `src/lib/convex/convex-provider.tsx`
- Reuse shared env/package/query-client files only where they are truly
  framework-agnostic.

**Test files:**

- `packages/kitcn/src/cli/commands/init.test.ts`
- new unit tests under `packages/kitcn/src/cli/registry/init/start/*.test.ts`
  if any new patch helpers are extracted

**Test scenarios:**

- fresh Start scaffold gets kitcn baseline files in the expected Start paths
- Start baseline does not require `main.tsx`
- Start root/router files receive provider/context wiring without corrupting the
  underlying shadcn Start template shape

- [ ] **Unit 3: Publish `kitcn/auth/start`**

**Goal:** give generated code and docs a stable first-class Start import path.

**Files:**

- Add: `packages/kitcn/src/auth-start/index.ts`
- Add: `packages/kitcn/src/auth-start/index.test.ts`
- Modify: `packages/kitcn/package.json`
- Modify: `packages/kitcn/tsdown.config.ts`
- Modify: `packages/kitcn/src/package-intent.test.ts`

**Approach:**

- Re-export upstream Start helpers from `src/auth-start/index.ts`.
- Add `./auth/start` to package exports and build entrypoints.
- Keep the surface thin; do not wrap or rename the upstream helper unless a
  packaging constraint forces it.

**Test files:**

- `packages/kitcn/src/auth-start/index.test.ts`
- `packages/kitcn/src/package-intent.test.ts`

**Test scenarios:**

- package exports include `./auth/start`
- packed package contains the built Start auth entrypoint
- local source import from `kitcn/auth/start` resolves and exposes the expected
  upstream runtime members

- [ ] **Unit 4: Teach auth scaffolding and registry target resolution about Start**

**Goal:** make `kitcn add auth` work honestly for Start apps, including route
output and rerun ownership.

**Files:**

- Modify: `packages/kitcn/src/cli/registry/items/auth/auth-item.ts`
- Add: `packages/kitcn/src/cli/registry/items/auth/auth-start-server.template.ts`
- Add: `packages/kitcn/src/cli/registry/items/auth/auth-start-route.template.ts`
- Add: `packages/kitcn/src/cli/registry/items/auth/auth-start-convex-provider.template.ts`
- Add: `packages/kitcn/src/cli/registry/items/auth/auth-start-server-call.template.ts`
- Modify: `packages/kitcn/src/cli/registry/items/auth/auth-client.template.ts`
- Modify: `packages/kitcn/src/cli/registry/planner.ts`
- Modify: `packages/kitcn/src/cli/registry/files.ts` only if target typing must
  distinguish Start route output from current app page output
- Modify: `packages/kitcn/src/cli/commands/init.test.ts`
- Modify: `packages/kitcn/src/cli/registry/items/auth/auth-item.test.ts`
- Modify: `packages/kitcn/src/cli/cli.commands.ts`

**Approach:**

- Add a Start-specific auth branch instead of using the current generic React
  “patch the client entry file” path.
- Generate or patch:
  - `src/lib/convex/auth/auth-client.ts`
  - `src/lib/convex/auth/auth-server.ts`
  - `src/lib/convex/server.ts`
  - `src/routes/api/auth/$.ts`
  - `src/lib/convex/convex-provider.tsx`
  - `src/routes/__root.tsx`
  - `src/routes/auth.tsx` or the resolved Start-equivalent auth route target
- Make Start-generated auth-server imports use `kitcn/auth/start`.
- Extend scaffold root resolution so a registry file targeting the “app” surface
  can land in a Start route file instead of assuming Next-like app shell paths.
- Preserve Start auth-managed files during init reruns the same way Next
  auth-managed files are preserved today.
- Preserve user-owned auth definition/auth-config files during add-auth reruns.

**Test files:**

- `packages/kitcn/src/cli/registry/items/auth/auth-item.test.ts`
- `packages/kitcn/src/cli/commands/init.test.ts`
- `packages/kitcn/src/cli/cli.commands.ts`

**Test scenarios:**

- `add auth --yes` on a Start app writes Start-specific auth files, not Vite
  `main.tsx` patches
- generated Start auth imports `kitcn/auth/start`
- Start auth reruns preserve auth-managed provider/root variants
- Start auth reruns preserve user-owned auth definition files
- Start auth demo route lands in a real Start route file and renders the auth
  page

- [ ] **Unit 5: Sync docs, skills, fixtures, and scenario proof**

**Goal:** make the published docs and proof lanes reflect the real shipped
Start contract.

**Files:**

- Modify: `www/content/docs/tanstack-start.mdx`
- Modify: `packages/kitcn/skills/kitcn/references/setup/start.md`
- Modify if needed: `packages/kitcn/skills/kitcn/SKILL.md`
- Modify: `tooling/template.config.ts`
- Modify: `tooling/fixtures.ts`
- Modify: `tooling/fixtures.test.ts`
- Modify: `tooling/scenario.config.ts`
- Modify: `tooling/scenarios.ts`
- Modify: `tooling/scenarios.test.ts`
- Add: `fixtures/start/**`
- Add: `fixtures/start-auth/**`

**Approach:**

- Rewrite Start docs to use `kitcn/auth/start` and the new init/auth paths.
- Keep docs latest-state only; no migration prose.
- Add Start fixture templates:
  - `start`
  - `start-auth`
- Add Start scenarios:
  - `start`
  - `start-auth`
  - `convex-start-auth-bootstrap` if bootstrap-heavy proof is needed for fresh
    Convex auth parity
- Classify `start-auth` as an auth-demo lane with a real `/auth` proof path.

**Test files:**

- `tooling/fixtures.test.ts`
- `tooling/scenarios.test.ts`

**Test scenarios:**

- fixture config accepts `start` and `start-auth`
- scenario config accepts Start keys and assigns the right proof path
- Start auth proof runs browser auth smoke/e2e instead of Vite’s weaker runtime
  lane
- prepared Start scenarios preserve expected `.env.local` and generated files

## Sequencing

1. Unit 1 opens the CLI contract.
2. Unit 2 makes the base Start scaffold real.
3. Unit 3 adds the public import path.
4. Unit 4 builds auth on top of the real Start shell and ownership model.
5. Unit 5 syncs docs and adds proof lanes.

Unit 3 can run in parallel with late Unit 2 work if the public export stays a
thin re-export, but Unit 4 should assume Unit 2’s file layout and Unit 3’s
public path are already settled.

## Verification Strategy

### Focused package tests

- `packages/kitcn/src/cli/commands/init.test.ts`
- `packages/kitcn/src/cli/cli.commands.ts`
- `packages/kitcn/src/cli/registry/items/auth/auth-item.test.ts`
- `packages/kitcn/src/package-intent.test.ts`
- `packages/kitcn/src/auth-start/index.test.ts`
- `tooling/fixtures.test.ts`
- `tooling/scenarios.test.ts`

### Build/package verification

- `packages/kitcn/tsdown.config.ts` must publish `./auth/start`
- packed package must include the Start auth entrypoint

### Fixture/scenario verification

- fixture snapshot proof for `start`
- fixture snapshot proof for `start-auth`
- runtime proof for `start`
- auth-demo proof for `start-auth`
- bootstrap-heavy convex proof for Start auth if the template is advertised as
  supported under `backend=convex`

### Repo gates after implementation

- `bun --cwd packages/kitcn build`
- `bun lint:fix`
- `bun typecheck`
- `bun run fixtures:sync`
- `bun run fixtures:check`
- matching Start scenario proof lanes

## Risks

- **Generic React leakage:** if Start keeps inheriting Vite assumptions, the
  scaffold will compile only by accident.
- **Route target mismatch:** auth page scaffolding may land in the wrong place
  unless registry root resolution learns Start route conventions.
- **Ownership drift:** init can easily overwrite Start auth-managed files unless
  Start variants get the same preserve-managed treatment already needed for
  Next.
- **Proof underreach:** shipping Start without fixture/scenario keys would leave
  CI blind.

## Open Questions

### Resolved

- **Should the public import path be `kitcn/auth/start` or a longer alias?**
  `kitcn/auth/start`.
- **Should Start auth use a custom wrapper?** No. Thin re-export only.
- **Should Start reuse the Vite auth proof path?** No. Give it a real auth-demo
  lane.

### Deferred to implementation

- whether Start route output is best expressed by extending existing `target:
'app'` semantics or by adding a more explicit Start route target
- whether the Start init overlay is cleanest as separate template files or a
  small set of patch helpers over shadcn-generated files
