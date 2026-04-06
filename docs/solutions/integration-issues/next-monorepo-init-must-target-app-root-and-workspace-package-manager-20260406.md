---
title: next monorepo init must target the app root and workspace package manager
category: integration-issues
tags:
  - next
  - monorepo
  - init
  - shadcn
  - scaffolding
  - package-manager
symptoms:
  - `kitcn init -t next` can fail after a shadcn monorepo scaffold with `Could not patch components.json`
  - shadcn monorepo output contains `apps/*/components.json`, but kitcn still looks at root
  - workspace app installs can fall back to Bun and fail on `workspace:*` deps instead of using the workspace package manager
module: init-next
resolved: 2026-04-06
---

# next monorepo init must target the app root and workspace package manager

## Problem

`kitcn init -t next` treated every shadcn scaffold like a single-app root.

That broke monorepo output immediately:

- patch steps looked for `components.json` and `tsconfig.json` at repo root
- dependency install detection stayed at the app cwd and missed the workspace
  package manager above it

So the first visible error was `Could not patch components.json`, but the real
bug was broader than one file path.

## Root Cause

Two assumptions were wrong:

1. After `shadcn init --template next`, kitcn always re-entered the overlay at
   the scaffold root.
2. Package-manager detection only inspected the current directory, not the
   workspace root above it.

For monorepos, the real app root is under `apps/*`, and the real package
manager often lives on the workspace root package or lockfile.

## Solution

- detect the actual Next app root under `apps/*` after shadcn monorepo output
  exists
- run the existing Next init overlay from that app root
- walk upward when detecting the package manager so workspace roots still pick
  `pnpm`/`yarn`/`npm` instead of defaulting to Bun

That fixes the visible `components.json` crash and keeps later install steps on
the monorepo's real package manager.

## Verification

- `bun test ./packages/kitcn/src/cli/commands/init.test.ts`
- live repro with the built local CLI:
  - `node packages/kitcn/dist/cli.mjs init -t next --name web --backend concave`
  - choose monorepo `yes`, component library `Radix`, preset `Nova`
  - confirm the command completes instead of failing on `components.json`

## Prevention

1. Template overlays must not assume the scaffold root is the app root.
2. Workspace package-manager detection must walk upward, not just inspect the
   current package directory.
3. If the first error is “missing file X,” still inspect whether the whole init
   overlay is pointed at the wrong root.
