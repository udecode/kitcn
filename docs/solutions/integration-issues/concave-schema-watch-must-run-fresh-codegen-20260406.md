---
title: Concave schema watch must run fresh codegen and ignore generated outputs
category: integration-issues
tags:
  - concave
  - dev
  - watcher
  - codegen
  - schema
symptoms:
  - editing `convex/functions/schema.ts` during `kitcn dev --backend concave` logs watch activity, but `_generated/dataModel.d.ts` stays stale
  - manual `kitcn codegen` immediately fixes the stale schema output
  - generated output folders can trigger noisy watch churn if the watcher treats backend-owned files as source inputs
module: concave-dev
resolved: 2026-04-06
---

# Concave schema watch must run fresh codegen and ignore generated outputs

## Problem

Concave local dev was reacting to `schema.ts` edits, but not honestly finishing
the job.

After a schema edit, the watcher logged success and the app reloaded, yet the
actual Concave-generated schema types under `_generated/` still reflected the
old schema until a manual `kitcn codegen`.

## Root Cause

The watcher only ran `generateMeta(...)`.

That updates kitcn-owned generated files, but Concave schema output is owned by
the backend codegen pass. So the watch lane was doing half a codegen and then
claiming success.

There was a second trap waiting behind the fix: once the watcher starts
refreshing backend-owned outputs too, `_generated/**` must be ignored or the
watcher can start reacting to its own codegen artifacts.

## Solution

Split the watch behavior by backend:

1. keep the old in-process `generateMeta(...)` path for Convex
2. for Concave, run a fresh `kitcn codegen` child process from the watcher
3. treat both `generated/**` and `_generated/**` as watcher-owned outputs
4. pass the resolved backend into the watcher child so `kitcn dev --backend concave`
   does not silently fall back to Convex behavior

The key detail is the fresh child process. Manual `kitcn codegen` already
worked, so the watcher should reuse that exact behavior instead of trying to
fake Concave codegen inline.

## Verification

- `bun test ./packages/kitcn/src/cli/watcher.test.ts ./packages/kitcn/src/cli/commands/dev.test.ts`
- `bun lint:fix`
- `bun typecheck`
- `bun --cwd packages/kitcn build`
- fresh temp app:
  - `bun run scenario:prepare -- next`
  - `cd tmp/scenarios/next/project`
  - `./node_modules/.bin/kitcn dev`
  - edit `convex/functions/schema.ts`
  - confirm `_generated/dataModel.d.ts` updates without manual `kitcn codegen`

## Prevention

1. Concave watcher fixes must verify the real backend-owned `_generated/**`
   output, not only kitcn-owned `generated/**`.
2. If a manual CLI command works but the watch lane does not, prefer reusing
   the real CLI behavior over rebuilding the flow from partial helpers.
3. Never watch backend-generated output directories as if they were source
   files.
