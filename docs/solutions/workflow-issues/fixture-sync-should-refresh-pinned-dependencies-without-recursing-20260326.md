---
title: Fixture sync should refresh pinned dependencies without recursing
category: workflow-issues
tags:
  - fixtures
  - dependency-pins
  - scripts
  - workflow
  - scaffolding
symptoms:
  - committed fixture snapshots can lag behind pinned dependency versions
  - `example/package.json` and scaffold fixtures can drift until someone remembers to run two commands
  - naively chaining `deps:sync` into `fixtures:sync` would recurse forever
module: fixture-dependency-sync
resolved: 2026-03-26
---

# Fixture sync should refresh pinned dependencies without recursing

## Problem

`fixtures:sync` and dependency pin sync were separate chores.

That meant the repo could regenerate fixture snapshots from one dependency
baseline while committed manifests still pointed at another.

## Root Cause

The obvious shell fix was wrong.

`deps:sync` already validates the repo by running `fixtures:sync`, so making
`fixtures:sync` call `deps:sync` directly would loop back into itself.

## Solution

Split the dependency pin flow into two modes:

1. normal `sync` keeps the full validation pass
2. `sync --skip-validate` rewrites committed pinned manifests and exits

Then make `fixtures:sync` call the lightweight mode first:

```bash
bun tooling/dependency-pins.ts sync --skip-validate && \
  bun tooling/fixtures.ts sync --backend concave
```

That keeps committed manifests, fixture snapshots, and prepared scenario inputs
on the same dependency baseline without recursive script calls.

## Verification

- `bun test tooling/dependency-pins.test.ts`
- `bun run fixtures:sync`
- `bun lint:fix`
- `bun typecheck`

## Prevention

1. If one workflow owns generated snapshots, let it refresh the committed input
   manifests first.
2. Validation commands and write-only sync commands are different jobs. Give
   them different modes instead of making scripts call each other blindly.
