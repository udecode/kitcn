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

Keep the `runConvexInitIfNeeded(...)` seam, but stop using the hidden local
`convex dev` lane as the default path.

For local Convex deployments:

1. try normal `convex init` first
2. only fall back to the hidden local `convex dev` preflight when `convex init`
   fails on the older-backend upgrade prompt
3. keep any non-deployment target args that still matter locally, such as
   `--component`

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

const initCommandArgs = [
  ...params.backendAdapter.argsPrefix,
  "init",
  ...(params.targetArgs ?? []),
];

let result = await runCommand(initCommandArgs);

if (
  shouldUseLocalDevPreflight &&
  result.exitCode !== 0 &&
  isLocalBackendUpgradePrompt(`${result.stdout}\n${result.stderr}`)
) {
  result = await runCommand([
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
    ...(params.targetArgs ?? []),
  ]);
}
```

## Why This Works

The upgrade fix was right, but the first cut was too broad.

The hidden local `convex dev` preflight solves one real Convex bug: older local
backends that need an interactive upgrade confirmation. But it is worse than
`convex init` in another real state: a stale raw `npx convex dev` process that
survived Ctrl-C.

In that stale-process state:

- `convex init` still succeeds
- the hidden local `convex dev --local --once --skip-push ...` lane fails with
  a fake `port 3210` conflict

So the durable fix is not "always use hidden dev." It is "use hidden dev only
for the specific upgrade-prompt failure that `convex init` cannot handle."

That keeps both behaviors:

1. normal local preflight still uses the safer upstream `convex init`
2. local-only target args like `--component` stay aligned between preflight and
   the later runtime command
3. remote targets still use normal `convex init`
4. older local backends still get an upgrade-capable fallback
5. `npx convex dev` -> Ctrl-C -> `kitcn dev` no longer trips the hidden-dev
   regression

## Prevention

- Do not assume `convex init` and hidden local `convex dev --once --skip-push`
  are interchangeable for non-interactive local flows.
- When an upstream CLI has hidden recovery flags, reproduce the real command
  directly before adding local glue around the symptom.
- Keep one regression test proving normal local dev stays on `convex init`.
- Keep one regression test proving the upgrade prompt falls back to the hidden
  local `convex dev` lane.
- Keep at least one live repro on the built CLI, not just helper-level tests.

## Related Issues

- [published-cli-bootstrap-must-ship-runtime-deps-and-anonymous-convex-init-20260331](/Users/zbeyens/git/better-convex/docs/solutions/integration-issues/published-cli-bootstrap-must-ship-runtime-deps-and-anonymous-convex-init-20260331.md)
- [dev-preflight-and-fast-failure-output-must-not-be-silent-20260325](/Users/zbeyens/git/better-convex/docs/solutions/integration-issues/dev-preflight-and-fast-failure-output-must-not-be-silent-20260325.md)
