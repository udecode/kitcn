---
title: Published @kitcn/resend packages must self-build before pack
date: 2026-04-01
category: integration-issues
module: resend
problem_type: integration_issue
component: tooling
symptoms:
  - "`kitcn add resend` succeeds but `kitcn codegen` crashes in a fresh app."
  - "Installed `@kitcn/resend` packages contain `package.json` only and no `dist/index.js`."
root_cause: missing_workflow_step
resolution_type: workflow_improvement
severity: high
tags: [resend, packaging, npm-pack, prepack, codegen]
---

# Published @kitcn/resend packages must self-build before pack

## Problem

Fresh apps could install `@kitcn/resend`, but `kitcn codegen` blew up right
after because the published package exported `./dist/index.js` without actually
shipping `dist/`.

## Symptoms

- `bunx kitcn add resend --yes --no-codegen` succeeds.
- `bunx kitcn codegen` fails with `Cannot find module .../@kitcn/resend/dist/index.js`.
- `find node_modules/@kitcn/resend -maxdepth 2 -type f` shows only
  `package.json`.

## What Didn't Work

- Assuming the root release script was enough because it built `kitcn`. That
  never guaranteed `@kitcn/resend` had fresh build output when `changeset
  publish` packed it.
- Looking only at source files. `packages/resend/dist` existed locally, so the
  bug hid until a real `npm pack` or fresh-app install.

## Solution

Make `@kitcn/resend` own its own publish step by rebuilding on `prepack`, then
lock that with a pack-level regression test.

```json
{
  "scripts": {
    "build": "tsdown",
    "prepack": "bun run build"
  }
}
```

The regression test should move `dist/` out of the way, run `npm pack`, unpack
the tarball, and prove `package/dist/index.js` exists in the packed output.

## Why This Works

The broken package was not a source bug. It was a publish-contract bug. The
manifest already pointed at `./dist/index.js`, but the package only shipped what
was present at pack time. `prepack` forces `npm pack` and `npm publish` to
build `dist/` right before the tarball is created, so the published package
matches its own exports.

## Prevention

- Every publishable package that exports built files should own that build via
  `prepack` instead of trusting a repo-level release script.
- Prove packaging with `npm pack`, not just local source imports.
- Keep at least one fresh-app smoke that installs the packed artifact and runs
  the first real consumer command, here `kitcn codegen`.

## Related Issues

- [Scenario resend pack helpers must always write package.json](/Users/zbeyens/git/better-convex/docs/solutions/integration-issues/scenario-resend-pack-helpers-must-always-write-package-json-20260331.md)
- [Published CLI bootstrap must keep TypeScript off the cold path and use anonymous Convex init](/Users/zbeyens/git/better-convex/docs/solutions/integration-issues/published-cli-bootstrap-must-ship-runtime-deps-and-anonymous-convex-init-20260331.md)
