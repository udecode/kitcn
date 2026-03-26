---
title: Scenario teardown must use SIGINT for bun run dev
category: integration-issues
tags:
  - scenarios
  - cli
  - bun
  - dev
  - runtime
symptoms:
  - `bun check` passes but runtime scenario logs still print `error: script "dev" exited with code 143`
  - Vite and Next scenario lanes look like they failed even though readiness proof already passed
  - scenario teardown noise makes the runtime gate look flaky or dishonest
module: scenarios
resolved: 2026-03-23
---

# Scenario teardown must use SIGINT for bun run dev

## Problem

Scenario runtime proof was working, but teardown still looked broken.

After readiness passed, the runner killed spawned `bun run dev` processes with
`SIGTERM`. Bun treats that as an error and prints:

```txt
error: script "dev" was terminated by signal SIGTERM
```

That made `bun check` look like it was proving runtime badly even though the
actual proof had already succeeded.

## Root Cause

The runner used the wrong signal for intentional shutdown.

For `bun run dev` wrappers:

- `SIGTERM` looks like an abnormal script failure
- `SIGINT` looks like normal Ctrl-C shutdown

So the bug was not scenario readiness. It was teardown semantics.

## Solution

Use `SIGINT` for intentional scenario shutdown.

That applies to both:

- runtime proof teardown after readiness
- multi-process dev teardown when one owned process exits first

This keeps the process stop explicit without printing fake runtime failure
noise.

## Verification

- `bun test tooling/scenarios.test.ts --test-name-pattern 'runScenarioDev'`
- `bun run scenario:test -- vite`
- `bun check`

Observed after the fix:

- scenario teardown stays clean
- `scenario:test -- vite` no longer prints the fake `script "dev"` termination
  error
- `bun check` still exits `0`

## Prevention

1. When a runner owns `bun run dev`, use Ctrl-C semantics for intentional
   shutdown.
2. Do not treat teardown noise as harmless forever. If the gate looks fake,
   people stop trusting it.
3. Keep at least one live Vite scenario in the runtime gate. That is where
   this teardown ugliness was easiest to spot.

## Files Changed

- `tooling/scenarios.ts`
- `tooling/scenarios.test.ts`

## Related

- `docs/solutions/integration-issues/scenario-test-auth-proof-before-teardown-20260322.md`
- `docs/solutions/integration-issues/scenario-vite-dev-split-and-react18-runtime-20260322.md`
