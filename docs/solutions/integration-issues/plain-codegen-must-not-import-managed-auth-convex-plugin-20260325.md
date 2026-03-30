---
title: Plain codegen must not import the managed auth Convex plugin
category: integration-issues
tags:
  - codegen
  - auth
  - fixtures
  - better-auth
  - opentelemetry
  - cli
symptoms:
  - plain `kitcn codegen` fails in non-auth apps with `Cannot find package '@opentelemetry/api'`
  - `fixtures:sync` or `fixtures:check` break in plain `vite` or `next` lanes before auth is installed
  - the packaged CLI imports Better Auth runtime code on startup even when the app has no `auth.ts`
module: codegen
resolved: 2026-03-25
---

# Plain codegen must not import the managed auth Convex plugin

## Problem

Plain scaffold lanes started failing again during packaged CLI runs.

The app did not have auth enabled, but `kitcn codegen` still crashed
with:

```txt
Cannot find package '@opentelemetry/api'
```

That error came from Better Auth internals, which should have been nowhere near
plain codegen.

## Root Cause

The managed auth schema reconcile helper had a static import:

```ts
import { convex } from "@convex-dev/better-auth/plugins";
```

That file is bundled into the CLI. So a cold command like `kitcn
codegen` dragged the managed auth Convex plugin into the startup graph even
when auth was disabled.

Once Bun had auto-installed `better-auth` through peer resolution without its
optional telemetry peer, the packaged CLI blew up on startup.

## Solution

Keep the managed auth Convex plugin on a lazy import path:

```ts
const loadConvexAuthPlugin = async () =>
  (await import("@convex-dev/better-auth/plugins")).convex;
```

Only load it inside the managed auth fallback that actually needs it.

That keeps plain codegen cold while preserving one-pass managed auth schema
generation when auth scaffold is present.

## Verification

- `bun test packages/kitcn/src/cli/registry/items/auth/reconcile-auth-schema.test.ts`
- `bun test packages/kitcn/src/cli/codegen.test.ts`
- `bun --cwd packages/kitcn typecheck`
- `bun --cwd packages/kitcn build`
- `bun run fixtures:sync`
- `bun run fixtures:check`
- `bun run scenario:test -- vite`

Live repro after the fix:

- a freshly packed `kitcn` tarball installed into a plain temp Vite app
- `bun run codegen` completed without pulling `@opentelemetry/api`

## Prevention

1. Plain CLI startup paths must stay cold. If a helper is only needed for auth
   fallback, load it lazily.
2. Do not trust “optional peer” resolution to save a hot import graph.
3. Any codegen or fixture regression touching auth must be proved in a plain
   non-auth app, not just an auth scaffold.
