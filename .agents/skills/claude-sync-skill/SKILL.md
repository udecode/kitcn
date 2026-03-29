---
description: Sync doc changes from www/content/docs/ into packages/kitcn/skills/convex/
name: claude-sync-skill
---

## Task

Sync recent doc changes into `packages/kitcn/skills/convex/` so the skill stays current.

**Input**: $ARGUMENTS (doc file path, PR diff, or "all" to scan for drift)

## Skill layout

- `SKILL.md` — essentials (~80-90% of e2e feature work: cRPC, ORM, auth, React)
- `references/` — setup guides (one-time bootstrap) and advanced features (aggregates, scheduling, rate limiting, etc.)

**Routing rule**: If the changed doc covers a topic already in SKILL.md → update SKILL.md. If it covers setup or an advanced/niche feature → update or create the matching reference file.

## Process

1. **Identify changes**: Read the source doc(s) in `www/content/docs/`. If input is a diff, extract only changed sections.
2. **Read target**: Read SKILL.md and scan `references/` to find where the topic lives. Note: skill files are compressed for machine consumption — they won't match docs verbatim.
3. **Diff**: Compare source doc content against skill coverage.
4. **Apply delta**: Update only the sections that changed. Do NOT rewrite unchanged sections.

## Rules

### Lossless

- Every API, parameter, pattern, and code example in the docs MUST exist in the skill
- Never drop information — if something is removed from docs, verify it's truly gone before removing from skill

### DRY

- **Within a file**: No duplicate code blocks or pattern descriptions. Define once, cross-reference later
- **Across files**: If SKILL.md already covers a pattern, references must not repeat it — use `→ See SKILL.md Section N`
- **Code blocks**: Identical snippets appearing 2+ times → keep first, replace later with "See [section] above"

### Machine-consumable

- Strip marketing filler ("battle-tested", "powerful", "easy-to-use")
- Strip hand-holding prose ("Let's now look at...", "As you can see...")
- Keep: API signatures, code examples, option tables, gotchas/callouts, error patterns
- Compress prose into terse bullets — grammar optional, clarity mandatory
- Prefer code over prose when both convey the same information
- **Parity baseline**: AI already knows tRPC + Drizzle + Better Auth semantics. Condense parity-only content; keep full detail only for kitcn/Convex-specific deltas

### Structure

- Follow existing section hierarchy in the target file
- New topics get their own section only if they don't fit an existing one
- Cross-reference format: `→ See Section N` or `→ See [topic]`
- SKILL.md may link to references for advanced depth; references must not duplicate SKILL.md content

### Verification

- After editing, confirm no information was lost by scanning the source doc headers against skill coverage
- Run quality gates from `references/setup/doc-guidelines.md` §8
- Run `bun lint:fix`
