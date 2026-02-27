- In all interactions and commit messages, be extremely concise and sacrifice grammar for the sake of concision.
- ALWAYS read and understand relevant files before proposing edits. Do not speculate about code you have not inspected.
- Never browse GitHub, use `gh` instead. Use `dig` skill when the user asks a question about a library, needs to understand a library's API, or when you need information about a library that you don't know about.
- When using git worktree, copy `example/.env.local` and `example/convex/.env` to the worktree directory.
- Dirty workspace: Never pause to ask about unrelated local changes. Continue work and ignore unrelated diffs.
- Proactively use Skill(tdd) when it adds value; skip TDD for high-friction tests (hard setup or slow React/UI flows).
- After any package modification, run `bun --cwd packages/better-convex build`, then touch `example/convex/functions/schema.ts` to trigger a re-build
- Always use @.claude/skills/changeset/changeset.mdc when updating packages to write a changeset before completing
- If you get `failed to load config from /Users/zbeyens/GitHub/better-convex/vitest.config.mts`, rimraf `**/node_modules` and install again.

## Browser Testing

- Never close agent-browser
- Use `--headed` unless asked for headless
- Port 3005 for main app
- Use `agent-browser` instead of Do NOT use next-devtools `browser_eval` (overlaps with agent-browser)
- Use `bun convex:logs` to watch the Convex logs

## Compound Engineering Overrides

- **Git:** Never git add, commit, push, or create PR.
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
