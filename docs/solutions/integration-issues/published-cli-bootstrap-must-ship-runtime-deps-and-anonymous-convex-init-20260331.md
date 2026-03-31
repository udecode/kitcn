---
title: Published CLI bootstrap must keep TypeScript off the cold path and use anonymous Convex init
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

# Published CLI bootstrap must keep TypeScript off the cold path and use anonymous Convex init

## Problem

The release path looked fine in workspace tests, but a real fresh-app run broke
in two places. `bunx` dropped `typescript` from its transient temp install even
though the npm tarball declared it correctly, and the first local Convex
bootstrap stopped on an account prompt in a non-interactive terminal.

## Symptoms

- `bunx kitcn init -t next --yes` crashed with `Cannot find package 'typescript'
  imported from .../node_modules/kitcn/dist/cli.mjs`.
- `npm view kitcn dependencies` and the packed tarball both showed
  `typescript`, but Bun's temp `bunx` install tree still omitted it.
- After getting past CLI startup, the same quickstart path failed with
  `Cannot prompt for input in non-interactive terminals. (Welcome to Convex!
  Would you like to login to your account?)`.

## What Didn't Work

- Verifying only against the workspace build hid the first failure, because the
  repo already had `typescript` available at the root.
- Shipping `typescript` as a runtime dependency was necessary, but it was not
  sufficient. The npm tarball was correct; Bun's transient `bunx` install was
  still missing the package.
- Forwarding `--yes` to `convex init` looked reasonable, but Convex does not
  support that flag. Direct CLI runs failed with `error: unknown option
  '--yes'`.
- Re-running `bunx --package <local-tarball>` was noisy because Bun cached the
  launcher package. The reliable proof path was the built `dist/cli.mjs` plus a
  packed tarball for scaffold installs.

## Solution

Keep TypeScript off the cold CLI startup path and translate `kitcn init --yes`
into anonymous local Convex bootstrap instead of trying to push `--yes` into
Convex itself.

Use a lazy runtime proxy anywhere the CLI needs TypeScript APIs:

```ts
// packages/kitcn/src/cli/utils/typescript-runtime.ts
type TypeScriptModule = typeof import("typescript");

export const createTypeScriptProxy = (): TypeScriptModule =>
  new Proxy({} as TypeScriptModule, {
    get(_target, property) {
      return loadTypeScript()[property as keyof TypeScriptModule];
    },
  });
```

```ts
// packages/kitcn/src/cli/backend-core.ts
const ts = createTypeScriptProxy();

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

- package-intent test unpacks the packed CLI, removes `typescript` from the
  install tree, and proves `node dist/cli.mjs --version` still works
- init test asserts `kitcn init -t next --yes` sets
  `CONVEX_AGENT_MODE=anonymous` for local Convex bootstrap and does not forward
  `--yes` to `convex init`

## Why This Works

The first failure was not just packaging. The tarball was correct, but Bun's
ephemeral `bunx` tree still left out `typescript`. The durable fix was to stop
making plain CLI startup depend on TypeScript at module load. The second
failure was an upstream CLI contract mismatch: Convex agent bootstrap is
controlled by `CONVEX_AGENT_MODE=anonymous`, not by a `--yes` flag.

Putting both fixes at the published CLI boundary makes the quickstart path work
the way docs promise:

1. `kitcn` can start even when `bunx` omits `typescript` from the temp install
   tree.
2. `kitcn init -t next --yes` can finish the first local Convex bootstrap
   without an account prompt.

## Prevention

- Test release-path CLIs from a truly blank app, not just from the monorepo.
- Keep cold CLI startup paths free of optional or heavyweight runtime imports.
- Add packed-cli tests that delete suspicious runtime deps and prove basic
  commands still boot.
- Treat upstream agent-mode env like internal plumbing. Product APIs should hide
  it, but bootstrap code still needs to set it deliberately when the happy path
  depends on it.

## Related Issues

- [init-bootstrap-must-stage-empty-targets-and-reuse-init-bootstrap-20260324](/Users/zbeyens/git/better-convex/docs/solutions/integration-issues/init-bootstrap-must-stage-empty-targets-and-reuse-init-bootstrap-20260324.md)
- [verify-command-must-prove-local-runtime-without-leaking-convex-agent-plumbing-20260325](/Users/zbeyens/git/better-convex/docs/solutions/integration-issues/verify-command-must-prove-local-runtime-without-leaking-convex-agent-plumbing-20260325.md)
