## Package

- Project is in closed alpha with no external users. Breaking changes are allowed and recommended if they produce better results. No backward compatibility needed. Still confirm with the user before proceeding with a set of breaking changes.
- Bundle size: Convex does not support dynamic imports. Each function entry bundles everything it statically imports. Prefer splittable per-module patterns (e.g. per-module callers, plugins) over monolithic globals. Keep each entry's import graph minimal.
- Parity: Don't reinvent the wheel. Before designing APIs or architecture, study how proven OSS projects solve the same problem — Drizzle (schema/ORM), tRPC (procedures/middleware), shadcn (CLI/codegen), better-auth (plugin system/auth). Adopt their patterns when applicable. Do `ls` in `..` directory to find the respective repositories, then inspect their source code when needed.
- DX: Optimize for the absolute best developer experience. CLI must be first-class for agents — deterministic, machine-readable output (--json), non-interactive defaults (--yes), composable commands. Every API surface should be intuitive for both humans and AI agents.
- Docs (www/): NEVER write changelog-style language ("has been removed", "new feature", "previously", "now supports"). Docs are user-facing reference for the LATEST state only. Write as if no prior version exists. No migration notes, no "what changed" — just document what IS. Follow docs/solutions/style.md for writing tone/structure.
- Docs sync: When updating www/ docs, also update the corresponding content in skills/convex/SKILL.md or skills/convex/references/ to stay synced. Follow skills/convex/references/setup/doc-guidelines.md for compression/placement rules.
- Plugins: ALWAYS read skills/convex/references/features/create-plugins.md before creating or modifying plugins. Keep it synced when any plugin API changes in the package.
- Always use @.claude/skills/changeset/changeset.mdc when updating packages to write a changeset before completing
- After any package modification, run `bun --cwd packages/better-convex build`, then touch `example/convex/functions/schema.ts` to trigger a re-build
- Use tdd skill for package updates that add or change live behavior.
- Do not write TDD cases for dead code/legacy removal assertions (for example: "should not contain old API X anymore"). Remove the dead path directly and keep tests focused on current behavior.
- Never edit scaffolded example output first. Change package templates/source, then regenerate scaffold files via CLI.
- Prefer inline Zod schemas when used once; extract constants only when reused.

## General

- In all interactions and commit messages, be extremely concise and sacrifice grammar for the sake of concision.
- ALWAYS read and understand relevant files before proposing edits. Do not speculate about code you have not inspected.
- Never browse GitHub, use `gh` instead. Use `dig` skill when the user asks a question about a library, needs to understand a library's API, or when you need information about a library that you don't know about.
- When using git worktree, copy `example/.env.local` and `example/convex/.env` to the worktree directory.
- Dirty workspace: Never pause to ask about unrelated local changes. Continue work and ignore unrelated diffs.
- If you get `failed to load config from /Users/zbeyens/GitHub/better-convex/vitest.config.mts`, rimraf `**/node_modules` and install again.

## Browser Testing

- Never close agent-browser
- Use `--headed` only you failed to test and need manual input from human.
- Port 3005 for main app
- Use `agent-browser` instead of Do NOT use next-devtools `browser_eval` (overlaps with agent-browser)
- Use `bun convex:logs` to watch the Convex logs

## Compound Engineering Overrides

- **Git:** Never git add, commit, push, or create PR unless the user explicitly asks.
- **plan:** Include test-browser in acceptance criteria for browser features
- **deepen-plan:** Context7 only when not covered by skills
- **work:** UI tasks require test-browser BEFORE marking complete. Never guess.
- **review:** Skip kieran-rails, dhh-rails, rails-turbo. Trust user input (internal). Keep simple.

## Prompt Hook

### Mandatory First Response

🚨 STOP - SKILL ANALYSIS IS MANDATORY

**Instructions:**
• DO NOT edit until skill analysis is complete.
• Use `TodoWrite` only if that tool is available in the current runtime.
• If `TodoWrite` is unavailable, run the same checklist inline.
• Condition NO -> mark completed -> proceed
• Condition YES -> work through steps -> mark completed -> proceed
• Skipping skill analysis = FAILED to follow instructions

**Skill Analysis Checklist:**
☐ Skill analysis (SKIP if 'quick' in message): (1) STOP rationalizing ('simple question', 'overkill', 'might be relevant') (2) List ALL available skills (3) For EACH: 'always apply' or 'Does task involve [topic]?' -> YES/MIGHT/MAYBE = ✓. Only ✗ if DEFINITELY not related (4) Skill(...) for ALL ✓ IN ONE PARALLEL CALL - do NOT load one then wait (5) Output '[Skills: X available, Y loaded: name1, name2]' CRITICAL: 'Might be relevant' = MUST load. '1% chance' = MUST load.

### Verification Checklist

🔒 VERIFICATION REQUIRED - NO COMPLETION WITHOUT FRESH EVIDENCE

**Instructions:**
• Track ALL verification items below (use `TodoWrite` if available, otherwise inline)
• Condition NO -> mark completed and skip
• Condition YES -> in_progress -> verify -> completed
• NEVER git commit unless explicitly asked
• Avoid unnecessary `bun dev` or `bun run build`
• Use Skill(agent-browser) for all browser testing instead of next-devtools browser_eval

**Verification Checklist:**

- [ ] Typecheck (IF updated .ts files): Bash `bun typecheck`
- [ ] Lint: Bash `bun lint:fix`
- [ ] Learn (SKIP if trivial): CRITICAL: After completing this request, you MUST evaluate whether it produced extractable knowledge. EVALUATION PROTOCOL (NON-NEGOTIABLE): (1) COMPLETE the user's request first (2) EVALUATE - Did this require non-obvious investigation or debugging? Was the solution something that would help in future similar situations? Did I discover something not immediately obvious from documentation? (3) IF YES to any: Skill(learn) NOW to extract the knowledge (4) IF NO to all: Skip - no extraction needed This is NOT optional. Failing to evaluate = valuable knowledge lost.

### Post Compact Recovery

🚨 CONTEXT WIPED - MANDATORY SKILL RELOAD

**Instructions:**
• STOP. Context compaction DELETED all skills. You FORGOT everything.
• DO NOT proceed until skill reload complete
• DO NOT assume you remember skills - they are GONE
• Skipping = GUARANTEED FAILURE

**Skill Reload Checklist:**
☐ Skill reload (MANDATORY): (1) Check current task tracking (TodoWrite if available, otherwise inline) (2) List ALL available skills (3) For EACH: 'always apply' or 'Does task involve [topic]?' -> YES/MIGHT/MAYBE = ✓ (4) Skill(...) for ALL ✓ IN ONE PARALLEL CALL - do NOT load one then wait (5) ONLY after reload, resume task CRITICAL: ALL skills GONE. MUST reload. 'Might apply' = MUST load.
