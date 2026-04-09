---
title: Dev watcher must ignore kitcn parse temp files
date: 2026-04-09
category: integration-issues
module: codegen
problem_type: integration_issue
component: development_workflow
symptoms:
  - saving a Convex source file during `kitcn dev` can retrigger codegen forever
  - the same file appears to be rewritten repeatedly until the dev process stops
  - watcher logs keep firing even though the user only saved once
root_cause: missing_tooling
resolution_type: code_fix
severity: medium
tags:
  - watcher
  - codegen
  - temp-files
  - parse
  - convex
  - dev
---

# Dev watcher must ignore kitcn parse temp files

## Problem

`kitcn dev` was watching the real source tree, but codegen was also writing its
own temporary parse helpers into that same tree.

That meant one real save could turn into a self-inflicted watch storm: codegen
reacted to the save, wrote a temp file, the watcher treated that temp file like
another source edit, and codegen ran again.

## Symptoms

- Save a Convex source file while `kitcn dev` is running.
- Watcher output keeps firing even though there was only one user edit.
- The loop stops only when `kitcn dev` stops.

## What Didn't Work

- Existing loop-suppression work for `convex/.env` did not help. That fixed a
  different loop caused by env sync writes, not parse-time temp files.
- Ignoring only generated outputs like `generated/**`, `_generated/**`,
  `generated.ts`, and `*.runtime.ts` was not enough. The temp parse files lived
  next to real source files, so they still looked like fresh edits.

## Solution

Treat `*.kitcn-parse.ts` as watcher-owned output and ignore it in
`shouldIgnoreWatchPath(...)`.

That keeps the watcher focused on real source edits while still allowing
codegen to create temporary parser shims when it needs to rewrite
`kitcn/server` imports for parse-time evaluation.

## Why This Works

The loop was not caused by debounce failure. It was caused by the watcher
trusting a file that codegen itself created inside the watched roots.

Once `*.kitcn-parse.ts` is classified as watcher-owned output, the watch graph
stops reacting to codegen's own scratch files. Real saves still trigger
codegen. Codegen scratch writes do not.

## Prevention

- If codegen writes scratch files inside watched roots, add that suffix or path
  to the watcher ignore contract in the same change.
- When a watcher bug smells like "save once, rerun forever", inspect temp-file
  writes before touching debounce logic.
- Keep a regression test at the ignore-path seam for every watcher-owned file
  class.

## Related Issues

- [local-convex-dev-should-watch-convex-env-20260324](./local-convex-dev-should-watch-convex-env-20260324.md)
- [dev-watcher-must-use-explicit-roots-with-chokidar-v5-20260325](./dev-watcher-must-use-explicit-roots-with-chokidar-v5-20260325.md)
