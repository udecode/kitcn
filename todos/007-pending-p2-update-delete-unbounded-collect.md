---
status: pending
priority: p2
issue_id: "007"
tags: [code-review, performance, orm, mutations]
dependencies: []
---

# Avoid Unbounded collect() In Update/Delete Builders

## Problem Statement

`update()` and `delete()` builders currently call `.collect()` on a query and then apply filters in memory. This can scan entire tables, consuming memory and time proportional to table size, and does not scale for large datasets.

## Findings

- `packages/kitcn/src/orm/update.ts:101-115` uses `query.collect()` and then `evaluateFilter` in memory.
- `packages/kitcn/src/orm/delete.ts:94-108` repeats the same pattern.
- Filtering is done via `.filter()` without index selection; no batching or explicit limit is enforced.

## Proposed Solutions

### Option 1: Index-Aware Filtering + Batched Processing (Preferred)

**Approach:**

- Reuse `WhereClauseCompiler` logic from query builder to select `withIndex` filters for mutations.
- Process rows in batches using `paginate()` or `take()` loops to keep memory bounded.
- Apply post-fetch filters only to batched results.

**Pros:**

- Scales with data size
- Reduces memory footprint
- Aligns mutation behavior with query planner logic

**Cons:**

- Requires refactoring mutation filtering pipeline
- More code paths to test

**Effort:** Medium

**Risk:** Medium

---

### Option 2: Guardrails + Unsafe Escape Hatch

**Approach:**

- Require explicit `limit()`/`batchSize()` on update/delete when filters are not indexable.
- Introduce `.unsafe()` to allow full-scan behavior for small datasets only.

**Pros:**

- Immediate protection against accidental full-table scans
- Clear developer intent

**Cons:**

- Requires API changes and docs updates
- Still leaves unsafe path

**Effort:** Medium

**Risk:** Low–Medium

---

### Option 3: Document As Non-Scalable Behavior

**Approach:**

- Keep implementation, but update docs to flag update/delete as full-scan unless constrained.

**Pros:**

- Minimal code changes

**Cons:**

- Scalability issue remains
- Easy for users to miss

**Effort:** Small

**Risk:** Medium

## Recommended Action

**To be filled during triage.**

## Technical Details

**Affected files:**

- `packages/kitcn/src/orm/update.ts:101`
- `packages/kitcn/src/orm/delete.ts:94`

**Related components:**

- Filter expressions (`toConvexFilter`, `evaluateFilter`)
- RLS evaluation (`evaluateUpdateDecision`, `canDeleteRow`)

## Resources

- Convex best practices: `.claude/skills/kitcn/convex.mdc`

## Acceptance Criteria

- [ ] Update/Delete avoid unbounded `.collect()` calls
- [ ] Mutations support batched processing for large datasets
- [ ] Index-aware filtering is applied where possible
- [ ] Behavior documented with examples for safe usage

## Work Log

### 2026-02-05 - Initial Discovery

**By:** Codex

**Actions:**

- Located unbounded `.collect()` usage in update/delete builders
- Identified in-memory filter re-evaluation path
- Drafted index-aware and batching options

**Learnings:**

- Current mutation pipeline scales poorly for large tables

## Notes

- Consider explicit API surface for batch size and unsafe mode
