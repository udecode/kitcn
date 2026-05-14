---
title: Scenario Vite runtime proof must strip open flags
date: 2026-05-14
category: test-failures
module: scenarios
problem_type: test_failure
component: tooling
symptoms:
  - "`bun check` fails because `create-convex-react-vite-shadcn` never becomes ready"
  - "The same prepared scenario can pass when rerun in isolation"
  - "Logs show Convex ready while Vite prints no ready URL before the timeout"
root_cause: config_error
resolution_type: test_fix
severity: medium
tags:
  - scenarios
  - vite
  - runtime-proof
  - convex
  - readiness
  - open-flag
---

# Scenario Vite runtime proof must strip open flags

## Problem

Prepared Vite scenarios can fail the aggregate runtime gate even after the
Convex backend is healthy. The frontend command inherits fixture scripts that
are fine for humans, but bad for automated proof.

## Symptoms

- `bun check` fails in `test:runtime` with
  `create-convex-react-vite-shadcn did not become ready`.
- A targeted rerun can pass, which makes the full gate look flaky instead of
  misconfigured.
- Convex logs reach `Server ready`, but Vite does not print its ready URL
  before the scenario readiness timeout.

## What Didn't Work

- Treating the failure as a Convex 1.38 upgrade bug was too broad. The backend
  was already ready.
- Only increasing the readiness timeout helped slow cold starts, but did not
  remove the interactive browser-open behavior from prepared apps.
- Rerunning stale worker cleanup was useful for wedged esbuild workers, but it
  did not address the Vite command shape.

## Solution

Keep prepared scenario scripts headless. When `patchPreparedLocalDevPort()`
normalizes Vite commands for prepared apps, strip `--open` while forcing the
scenario port:

```ts
const VITE_OPEN_FLAG_RE = /\s+--open(?=\s|$)/g;

export const normalizeLocalDevScript = (script: string, port: number) => {
  if (!script.includes("vite")) {
    return script;
  }

  return script
    .replace(VITE_OPEN_FLAG_RE, "")
    .replace(VITE_PORT_RE, `--port ${port}`);
};
```

Pair that with a readiness timeout that matches real Vite cold starts on
fixture-heavy apps:

```ts
export const SCENARIO_READY_TIMEOUT_MS = 60_000;
```

The targeted regression should prove that a fixture script like
`vite --open --port 3000` becomes `vite --port 3017` in the prepared app.

## Why This Works

Scenario runtime proof needs a deterministic server process, not a local browser
launcher. Stripping `--open` keeps the command focused on binding the expected
port, and the longer timeout covers legitimate dependency-heavy Vite startup.

## Prevention

- Normalize human-facing scaffold scripts before using them as automated
  runtime proof commands.
- Keep `--open` out of prepared Vite scenario scripts.
- If Convex is ready but the frontend has no ready URL, inspect the prepared
  frontend command before blaming Convex or package versions.
- Prove changes with both targeted Vite scenario tests and the full `bun check`
  gate.

## Related Issues

- [Scenario dev needed a Vite frontend split and React 18-safe client build](../integration-issues/scenario-vite-dev-split-and-react18-runtime-20260322.md)
- [Scenario stale-port cleanup must not kill unrelated listeners](./scenario-stale-port-cleanup-must-not-kill-unrelated-listeners-20260425.md)
