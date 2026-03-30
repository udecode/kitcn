---
title: chore: upgrade tanstack intent to latest
type: chore
date: 2026-03-28
status: in_progress
---

# chore: upgrade tanstack intent to latest

## Goal
Upgrade `@tanstack/intent` to the latest official release and fix the repo's
Intent integration around the real breakpoints.

## Findings
- Official TanStack Intent docs still recommend `npx @tanstack/intent@latest`
  for `scaffold`, `validate`, and `stale`.
- npm reports the latest `@tanstack/intent` as `0.0.23`.
- The repo is still on `0.0.13`.
- The repo already has a known `intent stale` path bug: it resolves the CLI
  from root `node_modules` instead of the packed temp install.

## Work plan
1. Bump `@tanstack/intent` to `0.0.23`.
2. Run the focused Intent commands to see what actually broke.
3. Fix the real integration seams in packaging/scripts/tests.
4. Verify with Intent commands plus normal package checks.
