---
title: Scenario dev needed a Vite frontend split and React 18-safe client build
category: integration-issues
tags:
  - scenarios
  - vite
  - concave
  - react
  - build
symptoms:
  - `bun run scenario:dev -- create-convex-bare` could stop on interactive Convex login
  - `bun run scenario:dev -- vite` or `vite-auth` started Vite on `5173` instead of the prepared `3005` port
  - `bun run scenario:dev -- create-convex-react-vite-shadcn` failed with `Missing "./compiler-runtime" specifier in "react" package`
module: scenarios
resolved: 2026-03-22
---

# Scenario dev needed a Vite frontend split and React 18-safe client build

## Problem

The new `scenarios` skill said plain runtime proof should work for raw
`create-convex-*` adoption fixtures and Vite templates. That was not true.

Three separate failures showed up in live runs:

1. raw `create-convex` scenarios could still hit interactive Convex login
2. Vite scenarios booted on `5173`, even though prepare patched them to `3005`
3. the raw React Vite adoption fixture crashed before rendering because the
   packaged kitcn React entry imported `react/compiler-runtime`

So the skill matrix was only half real. The login prompt was gone for some
lanes, but Vite still ignored the prepared port contract and React 18 adoption
still broke on the published package build.

## Root Cause

### Raw `create-convex` scenarios still trusted upstream scripts too much

The fixture package scripts still contain raw upstream `convex dev` flows.
Those scripts can prompt for login in non-interactive runs unless
`CONVEX_AGENT_MODE=anonymous` is injected.

For raw adoption scenarios, `scenario:dev` was sometimes running those scripts
too literally instead of forcing the local agent-mode contract itself.

### Concave Vite dev owned the frontend, so the prepared `3005` patch never mattered

`kitcn dev` on backend `concave` delegates to `concave dev`.
For Vite apps, `concave dev` auto-detects the frontend and starts Vite itself.

That meant the scenario runner was proving the backend contract, but not the
prepared frontend contract:

- prepared temp apps said `vite --port 3005`
- `concave dev` still launched Vite on its own default `5173`

The old "single owner" fix only stopped the double spawn. It did not make the
prepared port real.

### The package build still emitted React Compiler runtime imports

`packages/kitcn/tsdown.config.ts` ran the React client bundle through
`babel-plugin-react-compiler`. That rewrote the published client entries to
import:

```ts
import { c } from "react/compiler-runtime";
```

That is fine for React 19 consumers. It is not fine for raw adoption fixtures
still on React 18, like `create-convex-react-vite-shadcn`.

So the scenario failure was not a fixture bug. The published kitcn
client build was lying about React 18 compatibility.

## Solution

Fix the scenario runner and the package build at the seams that actually own
those contracts.

### Force anonymous agent mode for raw `create-convex` scenarios

The raw adoption scenarios now carry:

```txt
CONVEX_AGENT_MODE=anonymous
```

That keeps local scenario proof non-interactive and stops upstream Convex
login prompts from hijacking `scenario:dev`.

### Split Vite scenario dev into backend-only Concave plus the prepared frontend script

For Concave-backed Vite scenarios, `scenario:dev` now does two things:

1. start kitcn backend dev with:

```bash
kitcn dev --frontend no
```

2. start the prepared frontend script separately:

```bash
vite --port 3005
```

or the fixture's `dev:frontend` variant

This keeps Concave on the backend contract:

- backend on `3210`
- site proxy on `3211`

while the frontend finally uses the prepared temp app contract on `3005`.

### Stop compiling the published React client bundle against `react/compiler-runtime`

The kitcn package build no longer runs the client entries through the
React Compiler Babel plugin.

That keeps these published entrypoints React 18-safe again:

- `kitcn/react`
- `kitcn/auth/client`
- `kitcn/ratelimit/react`

## Verification

- `bun test ./tooling/scenarios.test.ts ./packages/kitcn/tsdown.config.test.ts`
- `bun --cwd packages/kitcn build`
- `rg -n "react/compiler-runtime" packages/kitcn/dist`
- `bun run scenario:dev -- create-convex-nextjs-shadcn`
- `bun run scenario:dev -- create-convex-react-vite-shadcn`
- `bun run scenario:dev -- vite`
- `bun run scenario:dev -- vite-auth`
- `bun run scenario:dev -- create-convex-bare`
- `lsof -nP -iTCP:3005 -sTCP:LISTEN`
- `lsof -nP -iTCP:5173 -sTCP:LISTEN`

Repo gates:

- `bun lint:fix` passed
- `bun typecheck` is still blocked by the existing committed `fixtures/vite`
  generated runtime typing errors in `convex/functions/generated/server.runtime.ts`

## Prevention

1. If a scenario is supposed to prove the prepared app contract, never let
   backend auto-detection silently replace the prepared frontend command.
2. For Concave Vite dev, use `--frontend no` when the scenario runner wants to
   own the frontend port explicitly.
3. If the package claims `react >=18`, the published client bundle cannot rely
   on `react/compiler-runtime`.
4. Keep live scenario proof in the loop. The old unit tests caught the double
   spawn, but they did not catch the wrong frontend owner or the React 18
   package build break.

## Files Changed

- `tooling/scenario.config.ts`
- `tooling/scenarios.ts`
- `tooling/scenarios.test.ts`
- `packages/kitcn/tsdown.config.ts`
- `packages/kitcn/tsdown.config.test.ts`

## Related

- `docs/solutions/integration-issues/concave-local-dev-auth-cycle-20260319.md`
