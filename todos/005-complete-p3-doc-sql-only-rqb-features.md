---
status: complete
priority: p3
issue_id: "005"
tags: [code-review, docs, orm, parity]
dependencies: []
---

# Document SQL-only RQB features that are unsupported in Convex

## Problem Statement

Drizzle v1 RQB docs cover SQL-only features like `extras` (SQL computed fields), `RAW` filters, and SQL placeholders for prepared statements. Better-Convex currently treats `extras` as type-only and throws on `RAW`/placeholders at runtime, but the public docs don’t clearly explain these limitations. This can mislead users expecting parity.

## Findings

- Runtime throws for `RAW` filters and SQL placeholders in `packages/kitcn/src/orm/query.ts`.
- `DBQueryConfig.extras` is explicitly type-only (see comment in `packages/kitcn/src/orm/types.ts`) and is ignored at runtime.
- `www/content/docs/orm/relations.mdx` does not call out these unsupported SQL-only features.

## Proposed Solutions

### Option 1: Add a dedicated “RQB limitations” section in docs (recommended)

**Approach:** Update ORM docs to explicitly list unsupported SQL-only features (extras/RAW/placeholders), explain why (Convex is not SQL), and point to supported alternatives.

**Pros:**
- Clear user expectations
- Minimal engineering effort
- Avoids breaking API

**Cons:**
- Still not full parity

**Effort:** 1-2 hours

**Risk:** Low

---

### Option 2: Implement a Convex-friendly `extras` runtime

**Approach:** Accept a JS callback that computes fields from row data (non-SQL). Document divergence from Drizzle SQL semantics.

**Pros:**
- Better DX than type-only extras
- Gives users a real runtime feature

**Cons:**
- Diverges from Drizzle semantics
- Requires careful typing and performance considerations

**Effort:** 4-8 hours

**Risk:** Medium

---

### Option 3: Remove/ban `extras` in Better-Convex types

**Approach:** Drop `extras` from `DBQueryConfig` or mark it as unsupported via type errors.

**Pros:**
- Avoids confusion

**Cons:**
- Reduces parity with Drizzle v1 types
- Breaking change for existing users

**Effort:** 1-2 hours

**Risk:** Medium

## Recommended Action

Documented SQL-only RQB limitations in `limitations.mdx` and clarified per-relation offset in queries docs.

## Technical Details

**Affected files:**
- `packages/kitcn/src/orm/query.ts`
- `packages/kitcn/src/orm/types.ts`
- `www/content/docs/orm/limitations.mdx`
- `www/content/docs/orm/queries.mdx`

## Resources

- Drizzle v1 RQB docs and `drizzle-orm/src/relations.ts`

## Acceptance Criteria

- [x] Docs clearly list unsupported SQL-only RQB features
- [x] Users can find alternatives or rationale in docs
- [x] No regression in `bun typecheck` / `bun run test`

## Work Log

### 2026-02-04 - Initial Discovery

**By:** Claude Code

**Actions:**
- Reviewed Drizzle v1 RQB feature list vs Better-Convex runtime behavior
- Noted `RAW`/placeholders are rejected and `extras` is type-only

**Learnings:**
- This is a parity gap caused by Convex’s non-SQL runtime

### 2026-02-04 - Completed

**By:** Codex

**Actions:**
- Documented SQL-only RQB limitations in `limitations.mdx`
- Added per-parent `offset` note in `queries.mdx`
- Verified with `bun typecheck` and `bun run test`

**Learnings:**
- Explicitly calling out SQL-only features avoids parity confusion

## Notes

- If Option 2 is chosen, align types with the new runtime semantics and document divergence from Drizzle.
