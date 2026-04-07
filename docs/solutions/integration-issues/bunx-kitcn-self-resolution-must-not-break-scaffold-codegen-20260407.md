---
title: bunx kitcn self-resolution must not break scaffold codegen
date: 2026-04-07
last_updated: 2026-04-07
category: integration-issues
module: cli-codegen
problem_type: integration_issue
component: tooling
symptoms:
  - `bunx --bun kitcn@latest init -t start --yes` aborts with `kitcn codegen aborted because module parsing failed`
  - scaffolded `messages.ts` and `http.ts` fail with `Cannot find module 'convex/server'`
  - follow-up `bunx kitcn dev` can hit Convex anonymous-agent link prompts in a non-interactive subprocess
root_cause: logic_error
resolution_type: code_fix
severity: high
tags:
  - bunx
  - codegen
  - init
  - bootstrap
  - jiti
  - anonymous-agent
---

# bunx kitcn self-resolution must not break scaffold codegen

## Problem

Fresh `bunx --bun kitcn@latest init -t start --yes` runs could fail during the
first codegen pass even though the generated app had already installed `kitcn`
and `convex`.

The failing files were the stock scaffold backend demo files, not user code.

## Symptoms

- `kitcn codegen aborted because module parsing failed`
- `messages.ts` and `http.ts` fail on `convex/server`
- the error path points into Bun's install cache, not the newly created app
- later `bunx kitcn dev` can treat `anonymous-agent` like a remote deployment
  and fall into a dead-end interactive link prompt

## What Didn't Work

- only suppressing `http.ts` parse warnings; `messages.ts` still failed and the
  run stayed fatal
- relying on the freshly installed app copy of `kitcn`; Bun can still execute
  package files from its shared cache path
- relying on source-level cache-path tests alone; the published bundled
  `backend-core` artifact can still miss a direct-import rewrite that never
  shows up in the raw TypeScript path
- treating local deployment detection as only `local:*` or `anonymous:*`; plain
  `anonymous-agent` now shows up too

## Solution

Patch the loader seam, not each scaffold file:

1. create a project-aware `jiti` helper for CLI parsing
2. alias `kitcn/server` to a tiny parser shim so scaffold parsing does not need
   the real runtime package graph during bootstrap
3. rewrite direct `from "kitcn/server"` imports to the project shim path before
   the bundled parser imports the module
4. keep local `convex` export aliases so project-local resolution still works
5. treat plain `anonymous-agent` as a local deployment and preserve
   `CONVEX_AGENT_MODE=anonymous` in `dev`

## Why This Works

The root bug was still Bun cache self-resolution, but the important detail was
where the fix had to land. Source-level parser tests were green once
`kitcn/server` could alias to a parser shim, but the published `backend-core`
bundle still imported direct `kitcn/server` specifiers unchanged.

Under `bunx`, those unchanged imports could still resolve through Bun's shared
install-cache copy of `kitcn`, which then re-entered `dist/api-entry-*.js` and
crashed on `convex/server` even though the generated app had already installed
the right dependencies.

Rewriting direct `kitcn/server` imports to the absolute project shim path
removes bare-specifier resolution from that parse step, so the bundled parser
never falls back to the Bun cache copy.

The `anonymous-agent` follow-up bug was separate but adjacent: local deployment
classification missed the plain `anonymous-agent` value, so `dev` failed to
carry the anonymous mode back into Convex subprocesses.

## Prevention

- When a CLI package parses scaffolded project files during bootstrap, do not
  assume package self-resolution points at the new app install
- For Bun-specific bootstrap bugs, verify both the source path and the packed
  artifact path; source tests alone can miss a bundled regression
- Add a packed-artifact regression whenever the real bug only reproduces from
  `bunx` or another published-package entry point
- Treat local deployment-name formats as compatibility inputs; upstream CLI
  output can drift without changing the underlying product meaning

## Related Issues

- `packages/kitcn/src/cli/codegen.test.ts`
- `packages/kitcn/src/cli/commands/dev.test.ts`
- `packages/kitcn/src/package-intent.test.ts`
