---
title: Add a real deslop skill and slop-scan command surface
type: feature
date: 2026-04-19
status: completed
---

# Add a real deslop skill and slop-scan command surface

## Goal
Add a local `deslop` skill that is worth using: generated from repo source of
truth, backed by runnable slop-scan commands, and aligned with the repo's
review + verification rules.

## Findings
- Local skills come from `.agents/rules/*.mdc`; `bun install` regenerates
  `.agents/skills/**` and root `AGENTS.md`.
- The current user-drafted deslop shape already fits the repo: bounded final
  cleanup pass, parallel review vectors, then narrow re-verification.
- `slop-scan` is useful here, but whole-repo raw scans are noisy; the valuable
  surface is delta-oriented and should summarize added/worsened findings.
- The repo currently has no `deslop` source file and no `lint:slop*` scripts.

## Plan
1. Add a root tooling wrapper that runs `slop-scan delta` against a sensible
   local baseline and prints a short summary.
2. Wire `lint:slop` and `lint:slop:delta` scripts in root `package.json`.
3. Add `.agents/rules/deslop.mdc` as the source-of-truth skill.
4. Register/described the new skill in `.agents/AGENTS.md`, then run
   `bun install` to regenerate generated skill artifacts.
5. Run narrow verification for the new tooling and generated skill output.

## Result
- Added repo-local `deslop` source-of-truth plus generated skill output.
- Added `tooling/slop.ts` and `tooling/slop.test.ts`.
- Added root scripts `lint:slop` and `lint:slop:delta`.
- Captured the non-obvious workflow/tooling lesson in `docs/solutions/`.

## Verification
- `bun test ./tooling/slop.test.ts`
- `bun run lint:fix`
- `bun run typecheck`
- `bun run intent:validate`
- `bun run intent:stale`
- `bun run lint:slop:delta -- --top 3`
