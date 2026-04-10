---
title: dev local preflight must auto-upgrade local Convex backend
date: 2026-04-10
category: integration-issues
module: kitcn cli
problem_type: integration_issue
component: development_workflow
symptoms:
  - `kitcn dev` prints `Bootstrapping local Convex...` then stalls in non-interactive terminals
  - raw `npx convex init` fails with `This deployment is using an older version of the Convex backend. Upgrade now?`
  - anonymous local Convex setups still fail even with `CONVEX_AGENT_MODE=anonymous`
root_cause: wrong_api
resolution_type: code_fix
severity: high
tags:
  - kitcn
  - convex
  - dev
  - bootstrap
  - non-interactive
  - local-backend
---

# dev local preflight must auto-upgrade local Convex backend

## Problem

`kitcn dev` used `convex init` as its quiet local preflight step. That looked
clean, but it breaks when the local Convex backend needs an upgrade.

`convex init` asks for upgrade confirmation. In a piped non-interactive child
process, that prompt cannot be answered, so `kitcn dev` gets stuck after the
bootstrap banner.

## Symptoms

- `kitcn dev` prints `Bootstrapping local Convex...` and never reaches the real
  dev loop.
- `npx convex init` exits with:

```text
This deployment is using an older version of the Convex backend. Upgrade now?
✖ Cannot prompt for input in non-interactive terminals. (This deployment is using an older version of the Convex backend. Upgrade now?)
```

- `CONVEX_AGENT_MODE=anonymous npx convex init` still fails with the same
  upgrade prompt.

## What Didn't Work

- Preserving `CONVEX_AGENT_MODE=anonymous`.
  That handles anonymous deployment selection, not local backend upgrade
  confirmation.
- Treating this like a logging bug.
  The real problem was not swallowed stderr. The process was blocked inside the
  wrong upstream command.
- Re-running raw `npx convex dev --once --typecheck disable`.
  That still reaches the same local backend upgrade prompt.

## Solution

Keep the `runConvexInitIfNeeded(...)` seam, but swap the upstream command for
local targets.

For local Convex deployments, stop calling `convex init`. Use the hidden
upstream preflight lane instead:

```text
convex dev --local --once --skip-push --local-force-upgrade --typecheck disable --codegen disable
```

That lane keeps the "configure only" behavior we want, but it can auto-upgrade
the local backend without an interactive prompt.

Implementation shape:

```ts
const shouldUseLocalDevPreflight =
  getAggregateBackfillDeploymentKey(
    params.targetArgs ?? [],
    process.cwd(),
    params.env
  ) === "local";

const commandArgs = shouldUseLocalDevPreflight
  ? [
      ...params.backendAdapter.argsPrefix,
      "dev",
      "--local",
      "--once",
      "--skip-push",
      "--local-force-upgrade",
      "--typecheck",
      "disable",
      "--codegen",
      "disable",
    ]
  : [...params.backendAdapter.argsPrefix, "init", ...(params.targetArgs ?? [])];
```

## Why This Works

The bug was not "anonymous mode got lost." The bug was "we picked the only
upstream command that cannot force a local backend upgrade in non-interactive
mode."

Upstream Convex already has a path for this. It is just hidden behind `dev`
flags instead of `init`.

Once local preflight moves to that lane:

1. local target detection stays in one place
2. remote targets still use normal `convex init`
3. local anonymous dev no longer blocks on upgrade confirmation

## Prevention

- Do not assume `convex init` and `convex dev --once --skip-push` are
  interchangeable for non-interactive local flows.
- When an upstream CLI has hidden recovery flags, reproduce the real command
  directly before adding local glue around the symptom.
- Keep one regression test on `handleDevCommand(...)` proving anonymous local
  dev uses the local-upgrade preflight lane.
- Keep at least one live repro on the built CLI, not just helper-level tests.

## Related Issues

- [published-cli-bootstrap-must-ship-runtime-deps-and-anonymous-convex-init-20260331](/Users/zbeyens/git/better-convex/docs/solutions/integration-issues/published-cli-bootstrap-must-ship-runtime-deps-and-anonymous-convex-init-20260331.md)
- [dev-preflight-and-fast-failure-output-must-not-be-silent-20260325](/Users/zbeyens/git/better-convex/docs/solutions/integration-issues/dev-preflight-and-fast-failure-output-must-not-be-silent-20260325.md)
