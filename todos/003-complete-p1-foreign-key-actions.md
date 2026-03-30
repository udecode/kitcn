---
status: complete
priority: p1
issue_id: "003"
tags: [orm, constraints, foreign-keys, deletes]
dependencies: []
---

# Finalize foreign key actions + soft/scheduled deletes

Make foreign key actions, soft deletes, and scheduled deletes behave correctly and pass runtime/type tests.

## Problem Statement

Foreign key action enforcement and delete helpers are partially implemented but tests are failing. Duplicate implicit + explicit foreign keys cause restrict violations, and missing index handling fails even when no referencing rows exist.

## Findings

- `convex/orm/foreign-key-actions.test.ts` fails in cascade/set-null/set-default and soft/scheduled delete cases.
- Implicit FK from `id()` plus explicit `foreignKey()` creates duplicate incoming FK entries; restrict action fires before cascade.
- `ensureIndexForForeignKey` throws even when there are no referencing rows, causing unrelated deletes to fail.

## Proposed Solutions

### Option 1: De-duplicate FKs + conditional index requirement (Recommended)

**Approach:**
- Remove implicit FK when explicit FK with same columns/target exists.
- For cascade/set-null/set-default, require index only if referencing rows exist; otherwise skip.
- For restrict/no action, allow filter-based existence checks when index is missing.

**Pros:**
- Passes tests and matches expected semantics
- Avoids unnecessary hard failures
- Keeps performance guardrails for cascading actions

**Cons:**
- Filter-based checks can scan without index

**Effort:** 1-2 hours

**Risk:** Low

---

### Option 2: Always require indexes for all FK actions

**Approach:**
- Keep strict index requirement; remove duplicate FKs only.

**Pros:**
- Strong performance guarantees

**Cons:**
- Fails deletes even when no referencing rows
- Does not match expected test behavior

**Effort:** < 1 hour

**Risk:** Medium

## Recommended Action

Implement Option 1. Update FK metadata handling and referencing-row queries. Re-run targeted vitest, then full `bun typecheck` and `bun run test`.

## Technical Details

**Affected files:**
- `packages/kitcn/src/orm/table.ts`
- `packages/kitcn/src/orm/mutation-utils.ts`
- `convex/orm/foreign-key-actions.test.ts`

## Acceptance Criteria

- [x] Cascade delete works without restrict interference
- [x] Set null/default works with correct updates
- [x] Missing index only errors when referencing rows exist
- [x] Soft delete sets `deletionTime`
- [x] Scheduled delete enqueues job
- [x] `bunx vitest run convex/orm/foreign-key-actions.test.ts` passes
- [x] `bun typecheck` passes
- [x] `bun run test` passes

## Work Log

### 2026-02-04 - Initial implementation

**By:** Codex

**Actions:**
- Added FK action enforcement and delete helpers
- Added runtime + type tests and docs updates
- Found failing tests due to FK duplicates and index handling

**Learnings:**
- Implicit `id()` FKs must not conflict with explicit `foreignKey()`
- Index requirement should be conditional for cascading actions

### 2026-02-04 - Completion

**By:** Codex

**Actions:**
- De-duplicated implicit/explicit foreign keys in table metadata
- Made FK action enforcement conditional on indexes with filter fallback for existence checks
- Updated relation-loading tests to include `cities` in schema to satisfy FK graph
- Ran `bunx vitest run convex/orm/foreign-key-actions.test.ts`
- Ran `bun typecheck`
- Ran `bun run test`
- Ran `npx ultracite fix` and `npx ultracite check`

**Learnings:**
- FK action graph should not block unrelated deletes when no referencing rows exist

## Notes

- Keep behavior close to Drizzle v1; no backward compat.
