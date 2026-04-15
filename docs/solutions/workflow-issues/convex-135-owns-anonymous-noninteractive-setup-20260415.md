---
title: Convex 1.35 owns anonymous non-interactive setup
date: 2026-04-15
category: workflow-issues
module: kitcn cli
problem_type: workflow_issue
component: development_workflow
severity: medium
applies_when:
  - Upgrading Convex CLI behavior that kitcn previously wrapped for agents
  - Removing local bootstrap code that forces upstream agent environment flags
tags: [convex, cli, agentic, bootstrap, non-interactive, scenarios]
---

# Convex 1.35 owns anonymous non-interactive setup

## Context

Convex 1.35 defaults unconfigured non-interactive commands to anonymous local
deployment setup. That changes the kitcn boundary: `CONVEX_AGENT_MODE=anonymous`
is no longer kitcn's responsibility for normal local bootstrap, verify, or
scenario lanes.

Older kitcn fixes correctly injected the env var because Convex needed it at
the time. After the Convex 1.35 upgrade, keeping that injection preserves stale
plumbing, emits upstream beta warnings, and makes tests assert implementation
detail instead of product behavior.

## Guidance

Pin scaffold/runtime Convex installs to the latest supported exact version, but
set package peer ranges at the release family floor:

```json
{
  "dependencies": {
    "convex": "1.35.1"
  },
  "peerDependencies": {
    "convex": ">=1.35"
  }
}
```

Delete kitcn-owned anonymous-agent injection for local flows:

```ts
// Before
env: createBackendCommandEnv({
  ...params.env,
  CONVEX_AGENT_MODE: "anonymous",
});

// After
env: createBackendCommandEnv(params.env);
```

Keep preserving explicit user-provided `CONVEX_AGENT_MODE` through
`createCommandEnv()`. The hard cut is only for kitcn deciding to force the env
var.

Scenario configs should also stop setting `CONVEX_AGENT_MODE`. Raw Convex
fixtures and `kitcn verify` should prove the current upstream CLI contract:
non-interactive setup works without local env magic.

## Why This Matters

Agent-native CLI code gets worse when it carries old upstream escape hatches
after the upstream API grows the real behavior. The old env var was useful, but
once Convex owns non-interactive anonymous setup, kitcn should trust that
contract and keep its own surface smaller.

This also makes scenario output cleaner. If `CONVEX_AGENT_MODE=anonymous mode is
in beta` appears after the 1.35 upgrade, something is still forcing stale
plumbing.

## When to Apply

- When a Convex release adds first-class CLI behavior for an old kitcn
  workaround.
- When scenario config or CLI code sets upstream environment flags for agentic
  setup.
- When docs or tests claim kitcn provisions anonymous Convex deployments
  directly.

## Examples

Use release evidence to justify the cut before editing:

```bash
npm view convex version --json
gh api -H "Accept: application/vnd.github.raw" \
  repos/get-convex/convex-backend/contents/npm-packages/convex/CHANGELOG.md
```

Then search for stale local glue:

```bash
rg -n "CONVEX_AGENT_MODE|anonymous-agent|local-force-upgrade" \
  packages tooling docs
```

Do not remove the local backend upgrade fallback just because anonymous setup
improved. `--local-force-upgrade` still covers the older-backend upgrade prompt,
which is a different upstream gap.

## Related

- [Published CLI bootstrap must keep TypeScript off the cold path and use anonymous Convex init](/Users/zbeyens/git/better-convex/docs/solutions/integration-issues/published-cli-bootstrap-must-ship-runtime-deps-and-anonymous-convex-init-20260331.md)
- [Verify must prove local runtime without leaking Convex agent plumbing](/Users/zbeyens/git/better-convex/docs/solutions/integration-issues/verify-command-must-prove-local-runtime-without-leaking-convex-agent-plumbing-20260325.md)
- [dev local preflight must auto-upgrade local Convex backend](/Users/zbeyens/git/better-convex/docs/solutions/integration-issues/dev-local-preflight-must-auto-upgrade-local-convex-backend-20260410.md)
