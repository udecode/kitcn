---
title: Init yes scenarios must skip generic codegen fallback and preserve auth-managed Next files
problem_type: integration_issue
component: development_workflow
root_cause: missing_workflow_step
tags:
  - init
  - scenarios
  - auth
  - bootstrap
  - nextjs
  - convex
severity: high
symptoms:
  - bootstrap-heavy scenario lanes fail after switching to `better-convex init --yes`
  - init fallback starts a local backend before auth env prepare runs
  - failed fallback bootstrap leaves the local Convex port wedged
  - in-place init rewrites auth-aware `lib/convex/server.ts` back to the plain baseline
---

# Init yes scenarios must skip generic codegen fallback and preserve auth-managed Next files

## Problem

The bootstrap-heavy scenario cut moved validation onto in-place
`better-convex init --yes`.

That exposed two real bugs:

1. `init` still let `runConfiguredCodegenDetailed(...)` take its generic
   "backend not running" fallback before the init-specific auth bootstrap path
   had a chance to prepare env.
2. in-place init treated auth-managed Next helpers as drift and rewrote them
   back to the plain scaffold baseline.

The result was a pile of fake-seeming failures that were actually real:

- missing `DEPLOY_ENV` during auth analyze
- timed-out local bootstrap plus a leaked backend still occupying the port
- `app/api/auth/[...all]/route.ts` importing `handler` from a server helper that
  init had already downgraded

## Root cause

The init contract and the generic codegen contract are not the same thing.

The generic codegen fallback knows how to wake a local backend. It does not
know how to do the auth-aware bootstrap order that init needs:

1. sync env in `prepare` mode
2. boot local Convex once
3. finish auth sync in `complete` mode

On top of that, init-owned Next scaffold files had no notion of auth-managed
variants, so valid auth scaffolds looked like drift and got overwritten.

## Fix

Make init own its own fallback path.

- Call `runConfiguredCodegenDetailed(...)` with
  `allowLocalBootstrapFallback: false` during init-time Convex codegen.
- Keep the explicit auth-aware fallback in `runInitializationCodegen(...)`.
- If the generic fallback ever does run elsewhere and fails, always stop the
  spawned bootstrap process before returning the failure.
- Treat auth-managed Next scaffold files as valid owned content when init
  replans scaffold output. Preserve:
  - `lib/convex/server.ts`
  - `lib/convex/convex-provider.tsx`

## Verification

- targeted init tests proving fallback ordering is:
  - `codegen`
  - `sync:prepare`
  - `dev`
  - `sync:complete`
- targeted init test proving in-place adoption preserves auth-managed Next
  server/provider files
- `bun run scenario:test -- convex-vite-auth-bootstrap`
- `bun run scenario:test -- convex-next-all`

## Takeaways

1. `init --yes` is allowed to be opinionated. It should not secretly delegate
   critical auth bootstrap behavior to a generic codegen helper.
2. Failed fallback bootstrap processes must be stopped immediately or the next
   retry lies to you with a port-collision error.
3. Scaffold ownership is not binary. Init has to recognize more-specific
   plugin-managed variants or it becomes a file clobbering machine.
