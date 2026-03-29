---
title: Fixture snapshots must not depend on ignored .env.local files
category: workflow-issues
tags:
  - ci
  - fixtures
  - env
  - gitignore
  - snapshots
symptoms:
  - `fixtures:check` passes locally but fails on GitHub Actions
  - fixture diff shows generated `.env.local` as a new file on CI
  - clean checkouts disagree with a maintainer machine on fixture parity
module: tooling
resolved: 2026-03-29
---

# Fixture snapshots must not depend on ignored .env.local files

## Problem

`fixtures:check` failed on GitHub Actions even though it looked clean locally.
The diff showed generated template apps creating `.env.local`, while the fixture
snapshot side of the diff had no such file.

## Root Cause

The committed fixture contract accidentally depended on ignored local files.

Maintainer machines had `fixtures/**/.env.local` lying around from previous
sync runs, so local diffs looked clean. GitHub Actions checks out the repo
without ignored files, so the same fixture comparison correctly treated
`.env.local` as missing.

That made fixture parity depend on untracked machine state instead of the repo.

## Solution

Treat `.env.local` as non-snapshot material for fixture output:

- strip it from generated apps during fixture snapshot normalization
- strip it from the fixture side before running `git diff --no-index`
- keep it available during temp-app validation before normalization, because
  scaffolded apps still need it at runtime

This keeps fixture validation honest on both clean CI checkouts and dirty local
machines.

## Verification

- `bun test ./tooling/fixtures.test.ts`
- `bun run fixtures:check -- next`
- `bun check`

## Prevention

1. Fixture snapshots cannot rely on ignored files existing locally.
2. If a file is runtime-only or machine-local, strip it before snapshot diffing.
3. When CI and local fixture diffs disagree, inspect whether the local pass is
   being propped up by untracked files.
