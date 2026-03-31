---
title: Bootstrap docs must use the remote latest CLI while local runtime commands stay local
category: integration-issues
tags:
  - docs
  - cli
  - bootstrap
  - copy-buttons
  - package-managers
  - shadcn-parity
symptoms:
  - landing-page and quickstart copy buttons paste stale or ambiguous bootstrap commands
  - docs mix first-run remote CLI commands with post-install local project commands as if they were the same thing
  - `@latest` is missing exactly where users copy a command into a blank directory
module: docs
resolved: 2026-03-31
---

# Bootstrap docs must use the remote latest CLI while local runtime commands stay local

## Problem

The docs were flattening two different command contracts into one.

Bootstrap commands like `kitcn init` run before a project has a local `kitcn`
dependency, so the honest copy-button contract is the remote package-manager
launcher with `@latest`. But once the project exists, commands like
`kitcn dev` and `kitcn add auth` should target the local project binary, not a
fresh remote install.

When docs blur those together, copy buttons stop being trustworthy.

## Root Cause

We were treating every CLI example like it lived in the same environment:

- landing-page and quickstart bootstrap commands used bare `npx kitcn` /
  `bunx kitcn`
- reference pages mixed bootstrap and local project commands in the same
  sections without explaining the boundary
- the docs site had no reusable bootstrap command tabs, so package-manager
  parity depended on hand-authored snippets

That made the docs easy to drift and easy to lie.

## Solution

Split the command contract in the docs:

1. **Remote bootstrap commands** use package-manager-specific launchers with
   `kitcn@latest`
   - `npx kitcn@latest ...`
   - `pnpm dlx kitcn@latest ...`
   - `yarn dlx kitcn@latest ...`
   - `bunx --bun kitcn@latest ...`
2. **Local project commands** stay local and unversioned
   - `npx kitcn dev`
   - `npx kitcn add auth --yes`
   - `bunx kitcn dev` in Bun-oriented setup references

Then encode the bootstrap half as a reusable docs component so quickstart,
registry, auth setup, and the landing-page copy button all pull from the same
rule instead of hand-typing variants.

## Verification

- `bun lint:fix`
- `bun typecheck`
- `bun --cwd packages/kitcn build`
- browser proof on the docs site:
  - quickstart tabs rendered `npm`, `pnpm`, `yarn`, `bun`
  - active tab text switched to `pnpm dlx kitcn@latest ...` and
    `bunx --bun kitcn@latest ...`
  - landing-page hero command rendered `npx kitcn@latest init -t next --yes`
- `rg -n 'npx kitcn init|bunx kitcn init' www/content/docs packages/kitcn/skills/convex`
  returned no stale bootstrap commands

## Prevention

1. Treat blank-directory bootstrap and post-install project commands as
   different docs surfaces.
2. Put package-manager parity into a reusable component anywhere copy buttons
   matter.
3. Use `@latest` only for the remote bootstrap seam. Do not spray it onto
   local runtime commands just because it looks symmetrical.
