---
title: Raw Convex auth adoption bootstrap sequencing
category: integration-issues
tags:
  - convex
  - auth
  - better-auth
  - scenarios
  - env
  - bootstrap
  - typescript
symptoms:
  - raw Convex auth adoption should use `convex init` first, then one `add auth --preset convex` command
  - raw Convex auth adoption should not create concave.json, get-env.ts, or cRPC files
  - staged bootstrap commands leak `--no-codegen`, manual `codegen --scope auth`, and manual `env push --auth` into user-facing flow
  - auth-scoped codegen fails on first bootstrap when auth.config.ts expects JWKS too early
  - env push --auth fails because generated auth code runs before BETTER_AUTH_SECRET is deployed
  - registerRoutes(http, getAuth, ...) rejects generated getAuth under strict typing
  - generic scenario runners can accidentally drop local package-spec env overrides and start installing plugin deps from npm
module: auth-adoption
resolved: 2026-03-18
---

# Raw Convex auth adoption bootstrap sequencing

## Problem

`better-convex add auth` had to support a real adoption path for apps that
started from `create-convex`, not from Better Convex `create`.

That path needed to stay bare: plain `convex/`, plain `httpRouter()`,
no `concave.json`, no `convex/lib/get-env.ts`, and no cRPC scaffolding.

The flow also needed to stop leaking bootstrap internals into docs and
scenarios. The intended user path is:

1. `convex init`
2. `better-convex add auth --preset convex --yes`

The obvious shortcut, reusing the Better Convex-first auth path and tolerating
the old staged bootstrap dance, broke that contract and fell over during the
new `create-convex-nextjs-shadcn-auth` scenario.

## Root Cause

Four separate assumptions in the existing auth flow were wrong for raw
Convex adoption:

1. `add auth` assumed Better Convex initialization had already happened, so
   it tried to route raw Convex apps through init/bootstrap behavior that
   creates Better Convex structure.
2. The raw preset tolerated running `add auth` before `convex init`, which
   forced users and scenarios into `--no-codegen` plus manual follow-up
   commands instead of one stable flow.
3. Raw `auth.config.ts` cannot require `process.env.JWKS` on first bootstrap,
   because `better-convex codegen --scope auth` runs before `env push --auth`
   has generated and pushed that value.
4. `env push --auth` tried to fetch JWKS before the deployment had the new
   `BETTER_AUTH_SECRET`, so Better Auth booted with its default-secret guard
   and the fetch failed.

There was also a typing bug in `registerRoutes(...)`: the helper accepted
`GetAuth<unknown, ...>`, which is too narrow under strict function variance
for generated `getAuth` functions.

During validation, a second regression showed up in tooling: replacing
`runLocalCliSteps(...)` with a generic scenario command runner silently dropped
`BETTER_CONVEX_INSTALL_SPEC` and `BETTER_CONVEX_RESEND_INSTALL_SPEC`. That made
plugin scenarios install from npm instead of the packed local tarballs.

## Solution

Add an explicit raw adoption mode: `better-convex add auth --preset convex`.

That preset uses a separate scaffold branch and a hard-cut execution flow:

1. require `convex init` first
2. scaffold raw Convex auth files
3. auto-run `better-convex codegen --scope auth`
4. auto-run `better-convex env push --auth`

`--no-codegen` stays available as a CI or batching escape hatch, but it is no
longer part of the normal user path.

The raw preset writes:

- writes plain Convex auth files in `convex/`
- patches app provider wiring only where needed
- patches plain `convex/schema.ts` with `...authSchema`
- writes plain `convex/http.ts` with `httpRouter()` +
  `registerRoutes(...)`
- skips `concave.json`, `get-env.ts`, cRPC files, and Better Convex demo
  surfaces

Make the first bootstrap auth config secret-safe instead of JWKS-hardcoded:

```ts
providers: [getAuthConfigProvider()],
```

Then fix auth env sequencing in `pushEnv --auth`:

1. push current env first, including `BETTER_AUTH_SECRET`
2. run `generated/auth:getLatestJwks`
3. push final env again with `JWKS`

Finally, widen `registerRoutes(...)` to accept the real generated auth
context generically instead of pretending every auth factory is
`GetAuth<unknown, ...>`.

For scenario tooling, keep local Better Convex steps on the packed local
tarballs by restoring the env overrides for every non-`convex` scenario step:

- `BETTER_CONVEX_INSTALL_SPEC`
- `BETTER_CONVEX_RESEND_INSTALL_SPEC`

## Verification

- `bun test ./packages/better-convex/src/cli/cli.commands.ts --test-name-pattern "run\\(add auth"`
- `bun test ./packages/better-convex/src/cli/env.test.ts`
- `bun test ./packages/better-convex/src/auth/registerRoutes.test.ts`
- `bun test ./tooling/scenarios.test.ts`
- `bun tooling/scenarios.ts check create-convex-nextjs-shadcn-auth`
- `bun run scenario:check:convex`
- `bun typecheck`
- `bun lint:fix`
- `bun --cwd packages/better-convex build`

## Prevention

1. Treat raw Convex adoption as a separate mode, not as a skinny version of
   Better Convex init.
2. If a bootstrap step needs auth runtime code before env push, make the
   config bootstrap-safe first and harden it later.
3. For auth env flows, deploy secrets before asking the backend to derive
   JWKS from them.
4. If a helper accepts generated function types, check variance under real
   scenario output before assuming `unknown` is the "generic" answer.
5. If a scenario runner stops using `runLocalCliSteps(...)`, preserve the
   local install-spec env overrides or plugin scenarios will quietly start
   hitting npm.

## Files Changed

- `packages/better-convex/src/cli/commands/add.ts`
- `packages/better-convex/src/cli/registry/planner.ts`
- `packages/better-convex/src/cli/registry/items/auth/auth-item.ts`
- `packages/better-convex/src/cli/env.ts`
- `packages/better-convex/src/auth/registerRoutes.ts`
- `tooling/scenario.config.ts`

## Related

- `docs/solutions/integration-issues/generated-auth-definition-variance-constraint-20260316.md`
- `docs/solutions/integration-issues/scenario-bootstrap-warning-and-env-smoke-20260317.md`
