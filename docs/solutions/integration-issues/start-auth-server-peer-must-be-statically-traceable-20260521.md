---
title: Start auth server peer must be statically traceable
date: 2026-05-21
category: integration-issues
module: auth-start
problem_type: integration_issue
component: authentication
symptoms:
  - TanStack Start Nitro/Vercel production output crashes from kitcn/auth/start/server
  - Runtime error says @tanstack/react-start cannot be found from _libs/kitcn.mjs
  - The app already has @tanstack/react-start installed
root_cause: wrong_api
resolution_type: code_fix
severity: high
tags: [auth, tanstack-start, nitro, vercel, package-tracing, peer-dependency]
---

# Start auth server peer must be statically traceable

## Problem

`kitcn/auth/start/server` used a variable-fed dynamic import for
`@tanstack/react-start/server`. Nitro could not see that dependency while
building Vercel output, so the deployed server crashed even though the app had
the Start peer installed.

## Symptoms

- Production build deploys, then crashes at runtime:

```txt
Cannot find package '@tanstack/react-start' imported from /var/task/_libs/kitcn.mjs
```

- Local development works.
- Adding the peer to the app does not help if Nitro does not copy it into the
  server output.
- Built kitcn output contains a dynamic import instead of a top-level import.

## What Didn't Work

- Treating this as an app install problem. The app already had
  `@tanstack/react-start`; the deployed output did not.
- Relying on Nitro config as the primary answer. `traceDeps` can force-copy
  packages, but that makes every Start app owner patch around kitcn's hidden
  dependency.

## Solution

Make the Start server import a literal static import in the Start server-only
package entrypoint:

```ts
import { getRequestHeaders } from '@tanstack/react-start/server';
```

Do not hide the module behind a string constant:

```ts
const TANSTACK_REACT_START_SERVER = '@tanstack/react-start/server';
await import(TANSTACK_REACT_START_SERVER);
```

Also declare `@tanstack/react-start` as an optional peer and package dev
dependency so the entrypoint's runtime contract is explicit and testable.

Keep shared loader helpers in `kitcn/auth/start`. Do not put the server import
in that shared entrypoint, because client/router loader bundles can import
`syncConvexAuthForStartLoader()` from there.

## Why This Works

Nitro traces production server dependencies from the import graph. A literal
top-level import gives Nitro a stable package edge from
`kitcn/auth/start/server` to `@tanstack/react-start/server`, so Vercel output
can include the Start server peer.

The dynamic import kept the public API technically lazy, but it made the
packaging contract invisible. For a framework-specific entrypoint, static is the
right tradeoff.

## Prevention

- Framework-specific server entrypoints should statically import their required
  framework server peers.
- Client-shared entrypoints should remain browser-bundleable; split server
  helpers out before adding Node-only framework imports.
- Use optional peer dependencies for framework-specific surfaces, not hidden
  dynamic imports.
- Keep a focused test that asserts the source contains a literal
  `@tanstack/react-start/server` import.
- After building, inspect the emitted entrypoint when fixing tracing bugs.

## Related Issues

- [start-loader-auth-must-prime-convex-query-client-before-provider-20260519.md](./start-loader-auth-must-prime-convex-query-client-before-provider-20260519.md)
- [auth-peer-and-fixture-sync-parity-20260323.md](./auth-peer-and-fixture-sync-parity-20260323.md)
