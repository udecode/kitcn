---
status: complete
priority: p2
issue_id: "004"
tags: [code-review, orm, relations, parity]
dependencies: []
---

# Support per-relation `offset` in `with` configs

## Problem Statement

Drizzle v1 RQB allows `offset` in `DBQueryConfig`, including nested `with` configs. Better-Convex accepts `offset` in types but does not apply it when loading `many()` relations, so `with: { posts: { offset: 1 } }` is silently ignored. This is a parity and correctness gap.

## Findings

- `DBQueryConfig` in `packages/kitcn/src/orm/types.ts` includes `offset?: number` for all configs, so relation configs type-check with `offset`.
- `_loadManyRelation` in `packages/kitcn/src/orm/query.ts` applies `limit` and `orderBy`, but never applies `offset` for per-parent results.
- Drizzle v1 relational query builder supports `offset` in query config; parity expectation is that nested configs behave the same as top-level config.

## Proposed Solutions

### Option 1: Apply per-parent offset after grouping (recommended)

**Approach:** After grouping children by parent (or through mapping), slice each parent’s array with `offset` before `limit` (or apply offset then limit). For through-relations, apply on the mapped array per parent, preserving ordering.

**Pros:**
- Matches Drizzle config semantics in nested `with`
- Minimal runtime overhead
- Aligns with existing per-parent `limit` logic

**Cons:**
- Needs careful ordering relative to `orderBy` and `limit`

**Effort:** 2-4 hours

**Risk:** Low

---

### Option 2: Apply offset globally before grouping

**Approach:** Slice the full `targets` array before grouping by parent.

**Pros:**
- Minimal changes to per-parent handling

**Cons:**
- Semantics differ from Drizzle (offset should be per-parent)
- Surprising behavior for users

**Effort:** 1-2 hours

**Risk:** Medium

---

### Option 3: Reject offset in nested `with`

**Approach:** Add a runtime check to throw if `offset` is specified in relation config.

**Pros:**
- Avoids silent mismatch

**Cons:**
- Breaks type-level parity with Drizzle
- Less useful API

**Effort:** 1 hour

**Risk:** Medium

## Recommended Action

Implemented per-parent offset in `_loadManyRelation`, added runtime tests for direct and `through()` relations, added type coverage, and verified with `bun typecheck` + `bun run test`.

## Technical Details

**Affected files:**
- `packages/kitcn/src/orm/query.ts` (_loadManyRelation)
- `convex/orm/relation-loading.test.ts` (add per-parent offset tests)

## Resources

- Drizzle v1 RQB config includes `offset` (see `drizzle-orm/src/relations.ts`)

## Acceptance Criteria

- [x] `with: { relation: { offset: N } }` skips first N children per parent
- [x] Works for both direct and `through()` relations
- [x] Behavior validated with runtime tests
- [x] `bun run test` passes

## Work Log

### 2026-02-04 - Initial Discovery

**By:** Claude Code

**Actions:**
- Identified mismatch between `DBQueryConfig` type and runtime relation loading
- Located `_loadManyRelation` limit/orderBy logic without offset handling

**Learnings:**
- Per-parent slicing is already in place for `limit`; offset can reuse the same pattern

### 2026-02-04 - Completed

**By:** Codex

**Actions:**
- Added per-parent offset handling in `_loadManyRelation`
- Added runtime tests for direct and `through()` relations
- Added nested relation offset type coverage
- Ran `bun typecheck` and `bun run test`

**Learnings:**
- Apply `orderBy` then `offset` then `limit` per parent for parity

## Notes

- Maintain order: apply `orderBy` → `offset` → `limit` per parent
