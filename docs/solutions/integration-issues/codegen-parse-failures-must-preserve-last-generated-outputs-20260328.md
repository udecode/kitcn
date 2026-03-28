---
title: Codegen parse failures must preserve last generated outputs
category: integration-issues
tags:
  - codegen
  - generated
  - cli
  - resend
  - api
  - example
symptoms:
  - `better-convex codegen` fails while parsing one Convex module, but `convex/shared/api.ts` still gets rewritten to an empty surface
  - `convex/functions/generated/plugins/*.runtime.ts` disappears after a failed codegen run
  - one bad parse leaves the app with less generated output than before the run
module: codegen
resolved: 2026-03-28
---

# Codegen parse failures must preserve last generated outputs

## Problem

`better-convex codegen` was mutating generated output before it knew whether
the parse phase had actually succeeded.

That made failures destructive. One broken module could leave the app in a
worse state than before the run:

- `convex/shared/api.ts` collapsed to a partial or empty surface
- generated plugin runtimes under `convex/functions/generated/plugins/` got
  deleted
- downstream Convex bundling then failed on missing generated imports

That is garbage behavior. Failed codegen should fail closed, not partially
rewrite the app.

## Root Cause

The generate step was not atomic.

Two things were wrong in `generateMeta()`:

1. it deleted `generated/plugins/` before finishing module parsing
2. it treated unexpected parse failures as warnings, then kept emitting fresh
   generated files from incomplete metadata

So a parse failure could happen after pre-cleanup but before successful
regeneration. That is exactly how a stale-good runtime file got removed while
`shared/api.ts` got rewritten from an empty metadata set.

## Solution

Make codegen preserve the last good generated state on fatal parse failures.

The fixed contract is:

1. create only temporary placeholder files up front
2. collect fatal parse failures during module scan
3. if any fatal parse failure occurred:
   - remove only the placeholders created by this run
   - throw an explicit codegen error
   - leave prior generated outputs untouched
4. only after a clean parse:
   - clean stale generated plugin artifacts
   - emit fresh generated files

Expected bootstrap-only `http.ts` parse noise stays non-fatal. Real parse
failures do not.

## Verification

- `bun test packages/better-convex/src/cli/codegen.test.ts`
- `bun --cwd packages/better-convex typecheck`
- `bun --cwd packages/better-convex build`
- `bun lint:fix`
- live repo proof:
  - before: `example/convex/shared/api.ts` hash stayed stable across a failing
    `bun run codegen`
  - run: `cd example && bun run codegen`
  - result: codegen still failed on the real parse/bundling problem, but it no
    longer rewrote `convex/shared/api.ts`
- regression test:
  - preexisting `convex/shared/api.ts` sentinel stays intact after fatal parse
    failure
  - preexisting `convex/generated/plugins/resend.runtime.ts` sentinel stays
    intact after fatal parse failure

## Prevention

1. Treat codegen as a transaction. Parse first, write later.
2. If a codegen run does not have a full metadata graph, do not emit a new
   generated surface from partial data.
3. Cleanup of generated artifacts belongs after successful parse, not before.
