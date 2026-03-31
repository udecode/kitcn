---
title: Published CLI bootstrap must ship runtime deps and anonymous Convex init
date: 2026-03-31
category: integration-issues
module: kitcn cli
problem_type: integration_issue
component: tooling
symptoms:
  - `bunx kitcn init -t next --yes` fails in a brand new app before scaffold completes
  - non-interactive local bootstrap stops on Convex login instead of finishing the quickstart path
root_cause: incomplete_setup
resolution_type: code_fix
severity: high
tags:
  - kitcn
  - cli
  - convex
  - quickstart
  - npm-package
  - bootstrap
---

# Published CLI bootstrap must ship runtime deps and anonymous Convex init

## Problem

The release path looked fine in workspace tests, but a real fresh-app run broke
in two places. The published CLI could not load `typescript` in a transient
`bunx` install, and the first local Convex bootstrap stopped on an account
prompt in a non-interactive terminal.

## Symptoms

- `bunx kitcn init -t next --yes` crashed with `Cannot find package 'typescript'
  imported from .../node_modules/kitcn/dist/cli.mjs`.
- After fixing the package install locally, the same quickstart path failed with
  `Cannot prompt for input in non-interactive terminals. (Welcome to Convex!
  Would you like to login to your account?)`.

## What Didn't Work

- Verifying only against the workspace build hid the first failure, because the
  repo already had `typescript` available at the root.
- Forwarding `--yes` to `convex init` looked reasonable, but Convex does not
  support that flag. Direct CLI runs failed with `error: unknown option
  '--yes'`.
- Re-running `bunx --package <local-tarball>` was noisy because Bun cached the
  launcher package. The reliable proof path was the built `dist/cli.mjs` plus a
  packed tarball for scaffold installs.

## Solution

Ship the CLI's runtime dependencies in the published package and translate
`kitcn init --yes` into anonymous local Convex bootstrap instead of trying to
push `--yes` into Convex itself.

```json
// packages/kitcn/package.json
{
  "dependencies": {
    "typescript": "5.9.3"
  }
}
```

```ts
// packages/kitcn/src/cli/backend-core.ts
const shouldUseAnonymousAgentMode =
  params.yes && !hasRemoteConvexInitTargetArgs(params.targetArgs);

await params.execaFn(params.backendAdapter.command, [
  ...params.backendAdapter.argsPrefix,
  "init",
  ...(params.targetArgs ?? []),
], {
  env: createBackendCommandEnv({
    ...params.env,
    CONVEX_AGENT_MODE: shouldUseAnonymousAgentMode
      ? "anonymous"
      : params.env?.CONVEX_AGENT_MODE,
  }),
});
```

Also lock both contracts with tests:

- package-intent test asserts `typescript` exists in both source and packed
  `package.json`
- init test asserts `kitcn init -t next --yes` sets
  `CONVEX_AGENT_MODE=anonymous` for local Convex bootstrap and does not forward
  `--yes` to `convex init`

## Why This Works

The first failure was a packaging contract bug: the CLI imports `typescript` at
runtime, so the published tarball must declare it as a runtime dependency. The
second failure was an upstream CLI contract mismatch: Convex agent bootstrap is
controlled by `CONVEX_AGENT_MODE=anonymous`, not by a `--yes` flag.

Putting both fixes at the published CLI boundary makes the quickstart path work
the way docs promise:

1. `kitcn` can actually start in a blank `bunx` install.
2. `kitcn init -t next --yes` can finish the first local Convex bootstrap
   without an account prompt.

## Prevention

- Test release-path CLIs from a truly blank app, not just from the monorepo.
- Add package-contract tests for every runtime import that only exists because a
  published tarball installs it.
- Treat upstream agent-mode env like internal plumbing. Product APIs should hide
  it, but bootstrap code still needs to set it deliberately when the happy path
  depends on it.

## Related Issues

- [init-bootstrap-must-stage-empty-targets-and-reuse-init-bootstrap-20260324](/Users/zbeyens/git/better-convex/docs/solutions/integration-issues/init-bootstrap-must-stage-empty-targets-and-reuse-init-bootstrap-20260324.md)
- [verify-command-must-prove-local-runtime-without-leaking-convex-agent-plumbing-20260325](/Users/zbeyens/git/better-convex/docs/solutions/integration-issues/verify-command-must-prove-local-runtime-without-leaking-convex-agent-plumbing-20260325.md)
