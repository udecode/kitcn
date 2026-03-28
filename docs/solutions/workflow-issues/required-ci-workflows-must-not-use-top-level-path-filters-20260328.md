---
title: Required CI workflows must not use top-level path filters
category: workflow-issues
tags:
  - github-actions
  - ci
  - branch-protection
  - pull-request
  - paths
symptoms:
  - PR shows `CI` as `Expected — Waiting for status to be reported`
  - no GitHub Actions run exists for the PR branch even though relevant files changed
  - large PRs with hundreds of files silently skip required workflows
module: tooling
resolved: 2026-03-28
---

# Required CI workflows must not use top-level path filters

## Problem

A protected PR showed `CI` as expected forever, but GitHub Actions never
created a run.

The branch did contain matching files like `packages/**` and `www/**`, so the
workflow looked valid at first glance. It still did not trigger.

## Root Cause

The required `CI` workflow used top-level `on.pull_request.paths` filters.

That is a trap on large PRs. GitHub evaluates path filters from a limited set
of changed files, so a huge branch can miss the matching files and skip the
workflow entirely. When the skipped workflow is also a required check, branch
protection leaves it stuck in `Expected`.

## Solution

Do not put top-level `paths` filters on required CI workflows.

For `CI`, trigger on every PR and push that should report a status. If path
based optimization is needed later, do it inside jobs, not at workflow
dispatch.

Keep the expensive lanes out of required PR CI. Split them into separate,
non-required workflows that run on `main`, on a schedule, or by manual
dispatch.

## Verification

- `gh run list --workflow ci.yml --branch feat/plugins --limit 10` returned no
  CI runs before the fix
- PR 139 showed `CI` as expected without a reported status
- `bun lint:fix`
- `bun check`

## Prevention

1. Required checks must always emit a status.
2. Keep required PR checks fast; put heavy scenario matrices in separate
   workflows.
3. Use top-level path filters only on non-required workflows.
4. If a PR shows `Expected` with no run, inspect workflow triggers before
   blaming the code.
