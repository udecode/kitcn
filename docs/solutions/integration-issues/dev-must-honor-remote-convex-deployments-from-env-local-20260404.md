---
title: kitcn dev must honor remote Convex deployments from .env.local
date: 2026-04-04
category: integration-issues
module: cli
problem_type: integration_issue
component: development_workflow
symptoms:
  - `kitcn dev` prints `Bootstrapping local Convex...` in an app that already has a remote Convex dev deployment in `.env.local`
  - migrated Convex apps fall back to local runtime behavior without any config change
  - internal dev follow-up commands (`init`, env sync, migrations, aggregate backfill) stop targeting the remote deployment unless the target is carried explicitly
root_cause: wrong_api
resolution_type: code_fix
severity: high
tags:
  - convex
  - dev
  - env-local
  - remote-deployment
  - cli
---

# kitcn dev must honor remote Convex deployments from .env.local

## Problem

`kitcn dev` treated `backend=convex` as shorthand for "use local Convex."
That breaks migrated Convex apps that already have a real remote dev
deployment configured in `.env.local`.

## Symptoms

- Running `kitcn dev` in a remote-backed app logs `Bootstrapping local Convex...`
  even though `.env.local` already contains `CONVEX_DEPLOYMENT`.
- Direct repro with remote-looking env showed the command taking the local lane
  immediately.
- A naive `--env-file .env.local` fix looked promising, but `convex init` and
  `convex run` do not accept that flag even though `convex dev` does.

## What Didn't Work

- Treating `--env-file .env.local` as a universal Convex target flag.
  That broke direct repro because `convex init` rejected `--env-file`.
- Relying on `targetArgs` alone.
  The existing code only considered explicit CLI target flags like `--prod` or
  `--deployment-name`, so remote deployments configured through `.env.local`
  never entered the decision path.

## Solution

Keep the remote deployment target as environment overrides for the internal
Convex subprocesses instead of trying to force everything through CLI flags.

- Read remote Convex deployment env from `.env.local` only when no explicit
  Convex target flags are present.
- Pass those deployment env vars into the internal `convex init`, `convex run`,
  `convex env`, migration, and aggregate-backfill subprocesses.
- Keep `convex dev` arguments unchanged.
- Suppress the misleading `Bootstrapping local Convex...` summary whenever the
  resolved dev target is remote.

## Why This Works

Convex has two different target contracts:

- `convex dev` accepts `--env-file`
- `convex init`, `convex run`, and env commands target deployments through env
  variables

The broken implementation assumed one target transport would work everywhere.
The fix matches the real CLI behavior instead:

- env-file remains a `convex dev` concern
- deployment env is what the rest of the subprocess chain consumes

That keeps the whole `kitcn dev` flow pointed at the same remote deployment.

## Prevention

- Do not assume a target flag supported by one Convex subcommand works for all
  subcommands.
- Test remote-target dev flows with a real `.env.local` fixture, not just local
  anonymous deployments.
- Keep one regression test on `handleDevCommand(...)` proving remote
  `.env.local` suppresses the local bootstrap lane.

## Related Issues

- [local-bootstrap-first-class-20260324.md](/Users/zbeyens/git/better-convex/docs/solutions/integration-issues/local-bootstrap-first-class-20260324.md)
- [bootstrap-docs-must-use-latest-remote-cli-but-local-runtime-commands-stay-local-20260331.md](/Users/zbeyens/git/better-convex/docs/solutions/integration-issues/bootstrap-docs-must-use-latest-remote-cli-but-local-runtime-commands-stay-local-20260331.md)
