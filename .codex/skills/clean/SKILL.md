---
description: Clean all docs following style guide — remove redundancy, DRY, fix ordering
name: clean
---

Use `planning-with-files` skill with reset. The task:

## Task

Scan every `.mdx` doc in `www/content/docs/` and clean it following `@docs/solutions/style.md`.

## Rules

### KEEP (do not remove)

- Callouts (`<Callout>`) — especially at end of sections
- Intro/transitioning text at start of docs and sections ("In this guide...", "Let's...", "We'll...")
- Conversational tone, progressive build-up, celebratory endings
- All technical content — be **lossless** on information

### REMOVE

- **Marketing filler**: "battle-tested", "secret sauce", "you can copy into your project"
- **True redundancy**: same info stated twice in same doc (duplicate code blocks, sentences restating a table above)
- **DRY violations**: identical code blocks appearing 2-3x in same file — keep first occurrence, replace later ones with cross-reference ("See [section above](#section)")
- **Technical details users don't care about**: internal implementation notes that don't help usage

### FIX

- **Linear ordering**: concepts should build progressively, not jump back and forth

## Process

1. Use `planning-with-files` to create task_plan.md with all 54 docs as checklist items
2. Batch docs into parallel agents (5-6 files per agent) for scanning
3. Pass 1 — conservative: grep for known filler patterns, fix obvious marketing language
4. Pass 2 — deeper: read each file, find duplicate code blocks, DRY violations, ordering issues
5. Mark each doc as `— no change needed` or `— updated: [what changed]`
6. Run `bun lint:fix` after all edits
