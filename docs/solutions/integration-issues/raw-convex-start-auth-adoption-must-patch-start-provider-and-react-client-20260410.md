---
title: Raw Convex Start auth adoption must patch Start provider and React client
category: integration-issues
tags:
  - convex
  - auth
  - tanstack-start
  - better-auth
  - cli
  - scaffolding
symptoms:
  - `kitcn add auth --preset convex --yes` fails on TanStack Start with `Auth preset "convex" requires a Vite-style client entry file (main.tsx/main.jsx).`
  - raw Convex Start auth adoption writes `process.env.NEXT_PUBLIC_CONVEX_SITE_URL!` into `src/lib/convex/auth-client.ts`
  - TanStack Start is detected as a supported shell, but raw auth adoption still behaves like plain Vite
module: auth-adoption
resolved: 2026-04-10
---

# Raw Convex Start auth adoption must patch Start provider and React client

## Problem

Raw Convex auth adoption already worked for Next and plain Vite, but
TanStack Start still fell through the generic React/Vite raw preset path.

That made `kitcn add auth --preset convex --yes` fail on real Start apps even
though the CLI already detected `tanstack-start` as a supported framework.

## Root Cause

Two raw-preset branches were missing for TanStack Start:

1. provider patch planning only handled Next or plain React/Vite entry files,
   so Start tried to patch `main.tsx` and failed
2. template resolution only swapped the default Start auth client template, not
   the raw Convex auth client template, so Start inherited the Next
   `NEXT_PUBLIC_CONVEX_SITE_URL` variant

The bug was not in auth bootstrap itself. It was in scaffold selection.

## Solution

Keep the raw Convex preset minimal on TanStack Start.

Do not route Start through the richer kitcn auth scaffold. Instead:

1. patch `src/lib/convex/convex-provider.tsx` in place, the same way raw Next
   patches its provider shell
2. keep the raw auth client shape with no `createAuthMutations()`
3. use the React/Vite raw auth client template for Start so it reads
   `import.meta.env.VITE_CONVEX_SITE_URL!`

That preserves the raw Convex contract:

- no `kitcn.json`
- no cRPC scaffold churn
- no generated `/auth` page
- no Start auth proxy route

## Verification

- `bun test ./packages/kitcn/src/cli/cli.commands.ts --test-name-pattern 'raw start convex app|raw vite convex app|raw next convex app'`
- `bun test ./tooling/scenarios.test.ts`
- `bun --cwd packages/kitcn build`
- `bun lint:fix`
- `bun typecheck`
- `bun run fixtures:sync`
- `bun run fixtures:check`
- `bun run scenario:check -- raw-start-auth-adoption`

## Prevention

1. Treat `tanstack-start` as its own raw preset shell, not as a Vite app with
   a missing `main.tsx`
2. When a framework gets a shell-specific default auth template, check the raw
   auth template branch too
3. For raw preset adoption, patch the narrowest existing provider shell instead
   of replacing it with the full managed auth baseline
4. Keep a dedicated bootstrap-heavy raw Start scenario so raw auth adoption
   drift fails in scenario validation, not in user migration threads

## Files Changed

- `packages/kitcn/src/cli/registry/items/auth/auth-item.ts`
- `packages/kitcn/src/cli/cli.commands.ts`

## Related

- `docs/solutions/integration-issues/raw-convex-auth-adoption-bootstrap-20260318.md`
