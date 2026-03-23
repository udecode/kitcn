# 2026-03-22 fixtures rename

## Goal

Rename committed template snapshot commands to `fixtures:*`, remove fake runtime template aliases, and simplify the scenarios skill/docs to match the real split.

## Plan

1. Inspect source-of-truth docs/skills for template references.
2. Update root scripts to `fixtures:*` and drop `template:prepare` / `template:dev`.
3. Update scenarios skill and AGENTS/docs references.
4. Verify scripts/docs with install, lint, and command spot-checks.

## Progress

- 2026-03-22: renamed committed snapshot scripts to `fixtures:sync` and
  `fixtures:check`.
- 2026-03-22: removed redundant `check:*` wrappers in favor of
  `fixtures:check`, `fixtures:check:full`, `scenario:check`, and
  `scenario:check:convex`.
- 2026-03-22: removed fake runtime `template:prepare` and `template:dev`
  aliases.
- 2026-03-22: updated source-of-truth AGENTS, scenarios skill, shadcn parity,
  template tooling messages, and dependency pin validation.
- 2026-03-22: ran `bun install`, `bun --cwd packages/better-convex build`,
  `bun run fixtures:check -- next`, `bun lint:fix`, and `bun typecheck`.
- 2026-03-22: `fixtures:check -- next` and root `typecheck` still hit the
  existing generated runtime type failure in `fixtures/vite`, unrelated to
  the script rename.
