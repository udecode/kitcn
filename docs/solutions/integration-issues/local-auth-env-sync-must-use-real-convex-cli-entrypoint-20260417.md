---
title: local auth env sync must use the real Convex CLI entrypoint
date: 2026-04-17
category: integration-issues
module: kitcn cli env sync
problem_type: integration_issue
component: development_workflow
symptoms:
  - auth bootstrap can fail at `generated/auth:getLatestJwks` even after the backend is ready
  - `kitcn add auth`, `kitcn env push`, or `kitcn dev --bootstrap` can print JWKS output and still exit non-zero on some runtime/platform combinations
  - Windows Bun runs can trip `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` after the auth JWKS fetch path
root_cause: wrong_api
resolution_type: code_fix
severity: high
tags:
  - auth
  - env
  - convex
  - bootstrap
  - windows
  - bun
---

# local auth env sync must use the real Convex CLI entrypoint

## Problem

Auth env sync already had the right lifecycle shape: prepare
`BETTER_AUTH_SECRET`, then fetch `JWKS` after the generated auth runtime is
live.

But the actual command runner for `env push` was still using the local
`convex` bin shim, while the rest of the CLI already used
`node <real convex/bin/main.js>`. That split made auth bootstrap
runtime-sensitive.

## Symptoms

- `kitcn add auth --yes` can reach the final JWKS fetch, print returned key
  data, then still fail the command.
- `kitcn dev --bootstrap` can fail on the same auth env sync leg after the
  backend reports ready.
- Platform/runtime combos that shell through Bun on Windows can crash after the
  child command closes, even though the auth function returned usable output.

## What Didn't Work

- Treating the returned JWKS payload as the bug.
  The payload shape was fine for kitcn's auth config flow.
- Blaming auth generation or Better Auth runtime wiring first.
  Fresh Start repros on mac passed cleanly once the command path behaved.
- Letting env sync keep its own Convex invocation style.
  That kept the most platform-sensitive callsite off the hardened runner path
  already used elsewhere in the CLI.

## Solution

Make `runLocalConvexCommand(...)` execute the real Convex CLI entrypoint
through Node instead of the local `convex` bin wrapper.

Before:

```ts
await execa("convex", args, {
  cwd: options.cwd,
  localDir: options.cwd,
  preferLocal: true,
  reject: false,
});
```

After:

```ts
await execa("node", [REAL_CONVEX_CLI_PATH, ...args], {
  cwd: options.cwd,
  reject: false,
  stdio: "pipe",
});
```

This makes auth env sync use the same Convex execution shape as
`createBackendAdapter(...)` and `runBackendFunction(...)`.

## Why This Works

The auth flow itself was not the unstable part. The unstable part was using two
different ways to launch Convex commands inside the same CLI:

1. backend-core paths used `node <real convex/bin/main.js>`
2. env sync used the local `convex` bin wrapper

On friendly setups both work. On touchier runtime/platform combinations,
especially Bun on Windows, the wrapper path can die after emitting usable
stdout. Moving env sync onto the same Node-driven entrypoint removes that
split-brain behavior.

## Prevention

- Keep local Convex calls on one execution path across `env`, `dev`, `add`,
  and backend helpers.
- Add regression coverage for the command shape, not just the parsed output.
- If a child command returns valid stdout but still exits non-zero, inspect the
  launcher first before rewriting the higher-level auth flow.

## Related Issues

- [auth-env-push-must-be-auth-aware-and-dev-bootstrap-must-stay-two-phase-20260324](/Users/zbeyens/git/better-convex/docs/solutions/integration-issues/auth-env-push-must-be-auth-aware-and-dev-bootstrap-must-stay-two-phase-20260324.md)
- [dev-local-preflight-must-auto-upgrade-local-convex-backend-20260410](/Users/zbeyens/git/better-convex/docs/solutions/integration-issues/dev-local-preflight-must-auto-upgrade-local-convex-backend-20260410.md)
