- `.agents/AGENTS.md` and `.agents/rules/*.mdc` are source of truth. After editing them, run `bun install` to sync. Never edit generated `.agents/skills/**/SKILL.md` directly.
- Never update `.agents/skills/kitcn/**` manually. Update `packages/kitcn/skills/kitcn/**`, then run `bun tooling/sync-kitcn-skill.ts` or `bun install` to regenerate the repo-local copy.
- In all interactions and commit messages, be extremely concise and sacrifice grammar for the sake of concision.
- Answer in English by default. Switch languages only when the user explicitly asks for another language.
- Prefer the best long-term architecture fix over the nearest local patch. If the real fix is an API or abstraction change, do that.

## Git

- **Git:** Never git add, commit, push, or create PR unless the user explicitly asks, or the active command/skill explicitly requires it.
- **Task PR default:** The `task` and `major-task` skills explicitly require verified code-changing work to be committed, pushed, and opened/updated as a PR unless the user explicitly says not to, the work has no local patch, or a real blocker is recorded. Do not treat the lack of a separate "open a PR" user sentence as a blocker.
- **Push scope:** When you do commit and push, include unrelated dirty files outside src; those are often manual user changes or synced skill/docs updates, so do not silently leave them behind.
- **PR:** Before creating or updating a PR, run `check`. If it fails, stop and fix it or report the blocker. Do not open a PR with failing `check` unless the user explicitly says to.
- **PR branch:** If the user explicitly says to open or create a PR, do not ask for confirmation. If the current branch is `main`, create a new `codex/` branch first, then commit/push/open the PR. If already on a non-`main` branch, proceed directly.
- **Worktree env:** When starting from a worktree, copy all nested `**/.env` and `**/.env.local` files from the source checkout into the worktree, including `example/.env.local` and `example/convex/.env` when present.
- Dirty workspace: Never pause to ask about unrelated local changes. Continue work and ignore unrelated diffs.
- Never browse GitHub files. For library/API questions or unfamiliar deps, inspect the repo at `..`; if missing, clone `https://github.com/{owner}/{repo}.git` to `../{repo-name}`.

## Package

- Project is in closed alpha with no external users. Breaking changes are allowed and recommended if they produce better results. No backward compatibility needed. Still confirm with the user before proceeding with a set of breaking changes.
- Breaking changes: default to a hard cut. Do not add backward-compat aliases, deprecated shims, fallback parsing, migration bridges, or tests for the previous API unless the user explicitly asks. Remove the old surface and write tests only for the current behavior, as if the old API never existed.
- Bundle size: Convex does not support dynamic imports. Each function entry bundles everything it statically imports. Prefer splittable per-module patterns such as per-module callers and plugins over monolithic globals. Keep each entry's import graph minimal.
- Parity: Don't reinvent the wheel. Before designing APIs or architecture, study how proven OSS projects solve the same problem: Drizzle, tRPC, shadcn, better-auth. Inspect local clones in `..` first.
- DX: Optimize for the absolute best developer experience. CLI must be first-class for agents: deterministic, machine-readable output (`--json`), non-interactive defaults (`--yes`), and composable commands.
- Docs (www/): NEVER write changelog-style language ("has been removed", "new feature", "previously", "now supports"). Docs are user-facing reference for the LATEST state only. Write as if no prior version exists. No migration notes, no "what changed".
- Docs sync: When updating `www/` docs, also update matching `packages/kitcn/skills/kitcn/**` content. Follow `packages/kitcn/skills/kitcn/references/setup/doc-guidelines.md`.
- Plugins: ALWAYS read `packages/kitcn/skills/kitcn/references/features/create-plugins.md` before creating or modifying plugins. Keep it synced when any plugin API changes.
- Intent maintainer loop: use `bunx intent scaffold` when you need new skills or a major skill reshuffle. For normal work, update docs and `packages/kitcn/skills/kitcn/**` in the same diff. Run `bunx intent validate skills` and `bunx intent stale`.
- Always use @.agents/rules/changeset.mdc when updating packages to write a changeset before completing.
- After any package modification, run `bun --cwd packages/kitcn build`.
- Use `tdd` for package updates that add or change live behavior.
- Do not write TDD cases for dead code/legacy removal assertions. Remove the dead path directly and keep tests focused on current behavior.
- Never edit scaffolded example output first. Change package scaffold source, then regenerate scaffold files via CLI.
- Never update example plugin files directly. Update the package plugin template first, then regenerate with `kitcn add ... --overwrite`.
- When changing `kitcn init -t` scaffold output, treat `fixtures/**` as generated fixture output from `bun run fixtures:sync`, including committed fixture `package.json` files. Do not patch fixture files by hand.
- After any `init -t` template or scaffold change, run `bun run fixtures:sync` and `bun run fixtures:check`. No exceptions.
- For manual runtime, never run committed `fixtures/**` in place. Materialize a tmp app with `bun run scenario:prepare <name>` and run it from `tmp/scenarios/<name>/project`, or use `bun run scenario:dev <name>`.
- Use @.agents/rules/scenarios.mdc for fixture and scenario runtime proof.
- Default `bun check` must not depend on auth browser E2E. Treat `test:e2e` as an auth-specific lane only.
- If `bun run fixtures:sync` dies with Convex/esbuild `EPIPE`, `The service was stopped`, or `Timed out waiting for local Convex bootstrap`, kill stale workers once, then rerun sync. If workers stay wedged in `U` state after `kill -9`, reboot.
- Prefer inline Zod schemas when used once; extract constants only when reused.

## Tooling

- If typecheck/build/dev suddenly fails with missing-module or package-resolution garbage that does not match the diff, run `bun install` once before deeper debugging.
- Treat local-only React runtime weirdness as install corruption first, not product code:
  - `Invalid hook call`
  - `resolveDispatcher()` / null dispatcher crashes
  - package-local `node_modules/react` or `node_modules/react-dom` paths under `packages/*`
  - mixed `.bun` and `.pnpm` React paths in the same failing stack
- Do not use reinstall as a lazy substitute for fixing real code errors.
- If you get `failed to load config from /Users/zbeyens/GitHub/kitcn/vitest.config.mts`, rimraf `**/node_modules` and install again.
- Run `convex:logs` to watch Convex logs.

## Skill

Use those skills when relevant:

- `autogoal` for any prompt with a verifiable and quantitative outcome. Always use the autogoal skill before durable work when the task has a measurable completion threshold.
- `orchestrator` when the current thread should route per-branch work to child threads instead of executing locally.
- `task` for normal repo task execution.
- `major-task` for heavyweight architecture, framework comparison, migration, benchmark, or proposal work.
- `deslop` for the final bounded cleanup pass once a change already works.
- `tdd`.
- `agent-native-reviewer` when changes touch `.agents/**`, `.claude/**`,
  `.codex/**`, skills, hooks, commands, prompts, or user-action tooling.
- @.agents/rules/changeset.mdc when updating packages.

Convex-specific CE exclusions:

- Do not install or reference these by default in this repo unless the user explicitly asks: `data-integrity-guardian`, `data-migration-expert`, `data-migrations-reviewer`, `schema-drift-detector`, `deployment-verification-agent`, `dhh-rails-reviewer`, `kieran-rails-reviewer`, `kieran-python-reviewer`, `previous-comments-reviewer`, `pr-comment-resolver`, `figma-design-sync`.
- Reason: better-convex is a framework/tooling repo. Data migration, Rails, deployment, PR-thread, and Figma workflow agents are mostly overkill or the wrong shape here.

Goal plans:

- For issue-backed goal work, start the filename with the ticket number.
  Example: `docs/plans/123-fix-schema.md`
- For non-ticket goal work, keep the date-based format.
  Example: `docs/plans/2026-02-07-fix-schema.md`

Browser usage:

- Always try `[@browser-use](plugin://browser-use@openai-bundled)` first for browser usage.
- Do not substitute Puppeteer, standalone Playwright, or raw Chrome DevTools for browser usage.

## Commands

### Development

Default to source-first typecheck. Do not build packages just to run types unless the repo script or failure proves the typecheck graph still resolves built output.

If a local-only build/runtime/test failure points at corrupted files under `node_modules/.bun`, mixed `.bun` / `.pnpm` React installs, package-local `node_modules/react*` symlinks, `Invalid hook call`, or other non-versioned env state while CI is green, clean local env before changing repo code: run `bun install` once, then rerun the exact failing command. If the failure shape changes or disappears, it was local env rot. If not, go back to normal debugging.

Required sequence for type checking modified packages:

1. `bun install` when needed by the task or lockfile state.
2. `bun typecheck` or the relevant workspace typecheck.
3. If that fails because the graph resolves built output, fix the source-entry or path setup when that is the right long-term shape.
4. Build only when checking artifact output, package exports, or a package that intentionally has no source-first typecheck path.
5. `bun lint:fix`.

Focused commands:

```bash
bun --cwd packages/kitcn build
bun run fixtures:sync
bun run fixtures:check
bun run scenario:prepare <name>
bun run scenario:dev <name>
bun run test:auth
bun run test:e2e
```

Full project commands:

- `bun check` - final repo gate before PR.
- `bun typecheck` - root typecheck.
- `bun run test` - default test suite.
- `bun lint:fix` - auto-fix linting issues.
