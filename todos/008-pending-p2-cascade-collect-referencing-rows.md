---
status: pending
priority: p2
issue_id: "008"
tags: [code-review, performance, orm, foreign-keys]
dependencies: []
---

# Batch Cascade/Delete FK Actions Instead Of collect()

## Problem Statement

Foreign key cascade handling loads all referencing rows via `.collect()`, which can explode memory and runtime for high-cardinality relationships. Cascades should process in bounded batches and require index-backed queries.

## Findings

- `packages/kitcn/src/orm/mutation-utils.ts:521-533` uses `.collect()` in `collectReferencingRows()`.
- `applyIncomingForeignKeyActionsOnDelete()` uses this to expand cascade deletes; for large referencing tables this becomes unbounded.

## Proposed Solutions

### Option 1: Paginated Cascade Processing (Preferred)

**Approach:**
- Replace `.collect()` with paginated iteration using `query.paginate()` or chunked `take()` loops.
- Process cascade actions per batch to keep memory bounded.

**Pros:**
- Scales to large datasets
- Avoids memory spikes and timeout risk

**Cons:**
- More complex control flow
- Requires careful handling of visited set and recursion

**Effort:** Medium

**Risk:** Medium

---

### Option 2: Stream-Based Cascade

**Approach:**
- Use `kitcn/orm/stream` to iterate indexed queries and apply cascade actions incrementally.

**Pros:**
- Fits Convex guidance for large data processing
- Natural batching

**Cons:**
- Introduces stream dependency into mutation utils
- Needs clear abort/backoff strategy

**Effort:** Medium

**Risk:** Medium

---

### Option 3: Enforce Index + Size Guardrails

**Approach:**
- Require foreign key indexes for cascade paths and throw if missing.
- Add configurable cap/warning if cascade expands beyond a threshold.

**Pros:**
- Quick protection
- Minimal refactor

**Cons:**
- Still risks truncation or failure
- Doesn’t solve large-scale cascade correctness

**Effort:** Small

**Risk:** Medium

## Recommended Action

**To be filled during triage.**

## Technical Details

**Affected files:**
- `packages/kitcn/src/orm/mutation-utils.ts:521`

**Related components:**
- Cascade delete/update flows
- Foreign key graph traversal

## Resources

- Convex filters/streams guidance: `.claude/skills/convex-filters/convex-filters.mdc`

## Acceptance Criteria

- [ ] Cascade operations process referencing rows in bounded batches
- [ ] No unbounded `.collect()` remains in cascade handling
- [ ] Index-backed lookups required and enforced
- [ ] Tests cover large fan-out cascade scenarios

## Work Log

### 2026-02-05 - Initial Discovery

**By:** Codex

**Actions:**
- Located `.collect()` in `collectReferencingRows()`
- Mapped cascade flow to unbounded fetch behavior
- Drafted batched/stream alternatives

**Learnings:**
- Cascade behavior currently scales linearly with full referencing table size

## Notes

- Ensure recursion guard (`visited`) still prevents cycles in batched mode
