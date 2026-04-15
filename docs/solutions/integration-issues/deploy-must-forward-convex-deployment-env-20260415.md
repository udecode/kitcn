---
title: kitcn deploy must forward Convex deployment env
date: 2026-04-15
category: integration-issues
module: cli
problem_type: integration_issue
component: tooling
symptoms:
  - `kitcn deploy` fails in CI even when `CONVEX_DEPLOY_KEY` is set
  - Convex reports missing deployment configuration or asks for `convex login`
  - `bunx convex deploy` works with the same CI environment
root_cause: wrong_api
resolution_type: code_fix
severity: high
tags:
  - convex
  - deploy
  - ci
  - env
  - cli
---

# kitcn deploy must forward Convex deployment env

## Problem

`kitcn deploy` wrapped `convex deploy` with `createBackendCommandEnv()` and
therefore cleared `CONVEX_DEPLOY_KEY`, `CONVEX_DEPLOYMENT`, and self-hosted
deployment env vars. CI deploys then fell back to anonymous or unconfigured
Convex behavior.

## Symptoms

- CI logs say no Convex deployment configuration was found.
- Convex suggests `convex login`, which is wrong for CI.
- Passing `--env-file` works because Convex reads that file itself.

## What Didn't Work

- Keeping the deployment env wipe globally. That is correct for local dev and
  codegen, but deploy is the opposite contract: ambient CI env is the target.
- Forwarding env only to the first `convex deploy` call. Post-deploy migration
  and aggregate backfill calls also need the same deployment target.

## Solution

Keep the default backend env wipe, but add a deploy-specific override sourced
from the ambient Convex deployment env keys.

```ts
const deployCommandEnv =
  backend === 'convex' ? getConvexDeploymentCommandEnv() : undefined;

env: createBackendCommandEnv(deployCommandEnv);
```

Pass the same `deployCommandEnv` into post-deploy migration and aggregate
backfill flows so the whole deploy pipeline targets the same deployment.

## Why This Works

Convex deployment env is not incidental process noise in CI. It is the target
selection API for `convex deploy` and follow-up `convex run` calls.

`kitcn dev` and `kitcn codegen` still clear ambient deployment env by default,
so stale shell variables do not hijack local development.

## Prevention

- Test deploy wrappers with ambient `CONVEX_DEPLOY_KEY`, not only CLI flags.
- When a deploy command fans out into post-deploy `run` commands, carry the
  same target env through the whole flow.

## Related Issues

- [#208](https://github.com/udecode/kitcn/issues/208)
- [#209](https://github.com/udecode/kitcn/issues/209)
- [kitcn dev must honor remote Convex deployments from .env.local](/Users/zbeyens/git/better-convex/docs/solutions/integration-issues/dev-must-honor-remote-convex-deployments-from-env-local-20260404.md)
