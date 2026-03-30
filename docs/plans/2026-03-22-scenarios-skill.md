# 2026-03-22 scenarios skill

## Goal

Add an internal `scenarios` skill that owns runtime proof for committed
templates and scenario fixtures.

## Findings

- `.claude/skills/` has no `scenarios` source yet.
- `next-auth` is the only scenario with a real auth browser surface today.
- `vite-auth` has no `/auth` page or equivalent browser auth UI.
- `convex-next-auth-bootstrap`, `convex-vite-auth-bootstrap`,
  `convex-next-all`, and `create-convex-nextjs-shadcn-auth` already encode
  bootstrap-heavy proof in `scenario:check`.
- `tooling/scenarios.ts` already provides the only runner surface we need:
  `prepare`, `dev`, and `check`.
- The sync instruction in `.claude/AGENTS.md` says `install`, but the real
  repo sync seam is `bun install` because root `postinstall` runs
  `bunx skiller@latest apply`.

## Plan

1. Add `.claude/skills/scenarios/scenarios.mdc`.
2. Cross-link it from `.claude/AGENTS.md`.
3. Point `shadcn-parity` at `scenarios` for runtime proof instead of
   duplicating that matrix.
4. Run `bun install` to sync generated skills.
5. Run `bun lint:fix` and spot-check the generated output.

## Progress

- 2026-03-22: gathered current scenario registry truth and auth/browser
  surface split.
- 2026-03-22: added `.claude/skills/scenarios/scenarios.mdc`.
- 2026-03-22: linked `scenarios` from `.claude/AGENTS.md` and
  `shadcn-parity.mdc`.
- 2026-03-22: ran `bun install` to sync generated skills.
- 2026-03-22: ran `bun lint:fix`.
- 2026-03-22: spot-checked generated output at
  `.agents/skills/scenarios/SKILL.md` and synced root `AGENTS.md`.
