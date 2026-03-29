---
status: pending
priority: p2
issue_id: "009"
tags: [code-review, documentation, performance, orm]
dependencies: []
---

# Document ORM Performance Checklist By Operation

## Problem Statement

There is no single, operation-by-operation performance checklist for the ORM. This makes it easy to use non-scalable patterns (full scans, post-fetch filters, deep offset pagination) without realizing the impact. The request is to document a table checklist mapping ALL ORM operations to performance characteristics and safe usage.

## Findings

- Existing docs cover general limitations and performance tips but do not map each operation (`findMany`, `findFirst`, `paginate`, `insert`, `update`, `delete`, relations, conflict handling) to its performance behavior.
- Multiple non-scalable patterns exist in the ORM codebase (unbounded `collect()`, relation loading with `take(10_000)`), reinforcing the need for explicit guidance.

## Proposed Solutions

### Option 1: Add Checklist Table To Limitations Doc (Preferred)

**Approach:**
- Extend `www/content/docs/orm/limitations.mdx` with a table listing each ORM operation, its query strategy, index expectations, and failure modes.
- Include flags for: index required, post-fetch behavior, pagination behavior, and scalability notes.

**Pros:**
- Centralized location for performance guidance
- Minimal navigation changes

**Cons:**
- Limitations doc may become long

**Effort:** Small–Medium

**Risk:** Low

---

### Option 2: New "ORM Performance Checklist" Doc

**Approach:**
- Create a dedicated doc (e.g., `docs/analysis/orm-performance-checklist.md` or `www/content/docs/orm/performance.mdx`).
- Link from `limitations.mdx`, `queries.mdx`, `relations.mdx`.

**Pros:**
- More space for examples and anti-patterns
- Easier to keep updated

**Cons:**
- Requires new navigation entry

**Effort:** Medium

**Risk:** Low

---

### Option 3: Lightweight Checklist In README/Docs Only

**Approach:**
- Add a minimal checklist block without deep details.

**Pros:**
- Very low effort

**Cons:**
- May not be discoverable or actionable

**Effort:** Small

**Risk:** Medium

## Recommended Action

**To be filled during triage.**

## Technical Details

**Suggested content for checklist table:**
- Operation (`findMany`, `findFirst`, `paginate`, `insert`, `update`, `delete`, `relations`, `conflict handling`)
- Query strategy (`withIndex`, `filter`, post-fetch)
- Index requirements
- Pagination behavior (cursor vs offset)
- Post-fetch filters/ordering
- Known non-scalable patterns (e.g., unbounded `collect()`, `take(10_000)`, deep offsets)
- Preferred alternatives (e.g., `paginate`, `kitcn/orm/stream`)

**Candidate files:**
- `www/content/docs/orm/limitations.mdx`
- `www/content/docs/orm/queries.mdx`
- `www/content/docs/orm/relations.mdx`

## Resources

- Convex best practices: `.claude/skills/convex/convex.mdc`
- Convex filters/streams: `.claude/skills/convex-filters/convex-filters.mdc`

## Acceptance Criteria

- [ ] Checklist table documents every ORM operation and its performance behavior
- [ ] Non-scalable patterns are explicitly called out with alternatives
- [ ] Links added from relevant ORM docs
- [ ] Examples include `kitcn/orm/stream` where appropriate

## Work Log

### 2026-02-05 - Initial Discovery

**By:** Codex

**Actions:**
- Audited ORM docs for performance guidance gaps
- Identified need for operation-by-operation checklist
- Drafted table dimensions and candidate locations

**Learnings:**
- Current docs provide tips but lack explicit per-operation guidance

## Notes

- Keep checklist aligned with future ORM implementation changes
