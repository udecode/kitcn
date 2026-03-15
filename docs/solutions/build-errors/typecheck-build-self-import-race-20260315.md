---
title: Avoid parallel build and typecheck self-import races
category: build-errors
tags:
  - typecheck
  - build
  - turbo
  - tsdown
  - self-imports
severity: medium
component: packages/better-convex
date: 2026-03-15
---

# Avoid parallel build and typecheck self-import races

## Problem

Running `bun typecheck` and `bun --cwd packages/better-convex build` at the
same time can produce fake type errors inside the `better-convex` package:

```text
Cannot find module 'better-convex/orm' or its corresponding type declarations.
```

The failure can cascade into bogus implicit `any` errors in package-local
fixtures like `packages/better-convex/convex/schema.ts`.

## Root Cause

`packages/better-convex` resolves some package self-imports through built
artifacts. During build, `tsdown` cleans `dist/`. If `tsc` is resolving those
self-imports at the same time, it briefly sees an incomplete package surface
and reports missing modules.

This is a timing issue, not a real type regression.

## Solution

Do not run the package build and repo typecheck in parallel when validating
changes in `packages/better-convex`.

Run them sequentially instead:

```bash
bun --cwd packages/better-convex build
bun typecheck
```

If you already hit the error, rerun `bun typecheck` after the build finishes.

## Verification

- Parallel run failed with transient `Cannot find module 'better-convex/orm'`
- Sequential rerun of `bun typecheck` passed without code changes

## Prevention

- Prefer sequential verification for package build + repo typecheck
- Treat sudden self-import resolution failures during concurrent validation as a
  likely dist-clean race before assuming a real type break
