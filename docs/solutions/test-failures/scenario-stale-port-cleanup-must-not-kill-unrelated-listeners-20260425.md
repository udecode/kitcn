---
title: Scenario stale-port cleanup must not kill unrelated listeners
date: 2026-04-25
category: test-failures
module: scenarios
problem_type: test_failure
component: tooling
symptoms:
  - "`bun run scenario:test -- all` dies with SIGKILL after the first scenario"
  - "A single scenario like `bun run scenario:test -- expo` passes"
  - "Running `expo` then `expo-auth` in one process dies between scenarios"
root_cause: logic_error
resolution_type: code_fix
severity: high
tags:
  - scenarios
  - runtime
  - cleanup
  - lsof
  - sigkill
---

# Scenario stale-port cleanup must not kill unrelated listeners

## Problem

The aggregate scenario runtime gate can kill itself between scenarios when
stale prepared apps point at shared local ports. The bug hides in cleanup, so
single-scenario proof can pass while `scenario:test -- all` dies.

## Symptoms

- `bun run scenario:test -- all` exits with SIGKILL immediately after the
  first scenario reaches ready.
- `bun run scenario:test -- expo` and `bun run scenario:test -- expo-auth`
  both pass on their own.
- A two-scenario repro logs `AFTER expo`, then dies before `expo-auth` starts.

## What Didn't Work

- Treating the failure as memory pressure was too vague. The machine had other
  stale processes, but the first scenario passed reliably on its own.
- Rerunning the full gate without isolating the transition only repeated the
  SIGKILL.
- Looking only at dev server shutdown missed the stale prepared-app cleanup
  that runs before the next scenario is prepared.

## Solution

Constrain stale-port cleanup to processes that are actually owned by the
prepared scenario project.

Before this fix, `stopLocalConvexBackendForProject()` read a port from the old
project's `.env.local`, ran `lsof -ti tcp:<port>`, and sent `kill -9` to every
listener. That was too broad because scenario ports are shared across prepared
apps.

The fixed flow checks each candidate listener's cwd and only kills it when the
process cwd is inside the target scenario project:

```ts
export const isProcessOwnedByProject = (pid: string, projectDir: string) => {
  const result = Bun.spawnSync({
    cmd: ["lsof", "-a", "-p", pid, "-d", "cwd", "-Fn"],
    stdin: "ignore",
    stdout: "pipe",
    stderr: "ignore",
  });

  const resolvedProjectDir = path.resolve(projectDir);
  return result.stdout
    .toString()
    .split(/\r?\n/)
    .filter((line) => line.startsWith("n"))
    .some((line) => {
      const cwd = path.resolve(line.slice(1));
      return (
        cwd === resolvedProjectDir ||
        cwd.startsWith(`${resolvedProjectDir}${path.sep}`)
      );
    });
};
```

Add a regression with an unrelated child listener on the stale port. Cleanup
must leave that process alive.

## Why This Works

The cleanup intent is to stop stale processes from the prepared scenario app,
not to own the whole machine's port table. Filtering by cwd preserves that
intent while avoiding a broad `kill -9` against any process that happens to use
the same localhost port.

## Prevention

- Never kill by port alone in scenario tooling.
- For temp-app cleanup, prove both sides: stale project-owned listeners are
  eligible, unrelated listeners are not.
- When `scenario:test -- all` fails but individual scenarios pass, debug the
  transition between scenarios before blaming the scenario itself.

## Related Issues

- [Scenario dev needed a Vite frontend split and React 18-safe client build](../integration-issues/scenario-vite-dev-split-and-react18-runtime-20260322.md)
