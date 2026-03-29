---
title: AppleDouble sidecars must be stripped from temp scaffolds
category: workflow-issues
tags:
  - ci
  - fixtures
  - scenarios
  - macos
  - eslint
symptoms:
  - `fixtures:check` fails in temp apps with `Parsing error: Invalid character`
  - ESLint reports failures on files like `._eslint.config.mjs` or `app/._page.tsx`
  - GitHub Actions fails even though the committed fixture files are clean
module: tooling
resolved: 2026-03-29
---

# AppleDouble sidecars must be stripped from temp scaffolds

## Problem

CI failed inside generated fixture apps with ESLint parse errors on files that
were never part of the scaffold, such as `._eslint.config.mjs` and
`app/._page.tsx`.

The real scaffold output was fine. The junk files only appeared in temp copies.

## Root Cause

macOS can leave AppleDouble sidecar files named `._*` alongside normal files.
Our fixture and scenario tooling already had a volatile-artifact scrubber, but
validation ran before the generated temp app was scrubbed.

That meant ESLint could still parse AppleDouble sidecars from the fresh temp app
and blow up with `Invalid character` before snapshot normalization ever ran.

## Solution

Strip `._*` entries with a dedicated AppleDouble scrubber and run that at the
validation seam before `codegen`, `lint`, and `typecheck`.

Do not reuse the full volatile-artifact scrubber there, because that cleaner is
supposed to delete install output like `node_modules` and lockfiles during
snapshot normalization. Validation only wants to kill AppleDouble junk.

## Verification

- `bun test tooling/fixtures.test.ts`
- `bun run fixtures:check`

## Prevention

1. Treat `._*` like machine junk, but do not lump it together with
   install-output cleanup.
2. Clean temp scaffold apps before validation and clean snapshots separately.
3. When CI shows parse errors on impossible file names, inspect the temp app
   tree before blaming the scaffold output.
