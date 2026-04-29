---
title: chore: adopt tanstack intent packaging for convex skill
type: chore
date: 2026-03-07
status: complete
---

# chore: adopt tanstack intent packaging for convex skill

## Goal

Make the existing Convex skill discoverable by `@tanstack/intent` without losing any skill content.

## Locked decisions

- Source of truth moves to `packages/kitcn/skills/kitcn`.
- The published `kitcn` package must ship `skills/**` at package root.
- Use package metadata compatible with intent discovery instead of relying on inferred fields.
- Verify compatibility with a pack-level test and `intent validate`.

## Findings

- `@tanstack/intent` scans `node_modules/<pkg>/skills/**/SKILL.md`.
- Discovery requires a valid `intent` config or derivable `repository` + `homepage`.
- The current release also expects a library shim at `bin/intent.js` plus `bin.intent` in `package.json`.
- `intent validate` enforces a 500-line ceiling on `SKILL.md`, so the core skill had to be compressed back into a true always-loaded summary.
- Current repo instructions pointed at root-level `skills/kitcn`, so active references needed updating after the move.

## Work plan

1. Add a failing package-pack verification test.
2. Move the Convex skill tree into `packages/kitcn/skills/kitcn`.
3. Update live repo references that still point at `skills/kitcn`.
4. Add `intent` metadata and package `files` coverage.
5. Verify with tests, build, `intent validate`, and pack inspection.

## Verification checklist

- [x] Targeted failing test observed before implementation
- [x] `bun test` for new package-pack test passes
- [x] `bun --cwd packages/kitcn build` passes
- [x] `bunx intent validate skills` passes from `packages/kitcn/`
- [x] `npm pack --json --dry-run ./packages/kitcn` shows `skills/kitcn/**`
- [x] `bun lint:fix` passes
- [x] `bun typecheck` passes
