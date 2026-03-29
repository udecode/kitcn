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
Our fixture and scenario tooling already stripped volatile artifacts like packed
tarballs, but it did not treat AppleDouble sidecars as volatile content.

When those files leaked into temp apps, ESLint tried to parse them as source and
blew up with `Invalid character`.

## Solution

Strip `._*` entries in the shared volatile-artifact scrubber used by scaffold,
fixture, and scenario copy flows.

Keep the fix central. Do not special-case ESLint or patch generated fixtures by
hand.

## Verification

- `bun test tooling/fixtures.test.ts`
- `bun run fixtures:check`

## Prevention

1. Treat `._*` like any other machine-local artifact.
2. Clean temp scaffold copies at the copy layer, not in individual checks.
3. When CI shows parse errors on impossible file names, inspect the temp app
   tree before blaming the scaffold output.
