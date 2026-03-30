---
title: feat: smart findMany pagination (no paginate API)
type: feat
date: 2026-02-05
---

# Summary
Make `findMany` the single list API. Add `paginate` option to `findMany` and remove `.paginate()` method. No alias, no backward‑compat. Allow `where` as a JS predicate for stream path. Strict true enforces indexes.

# Why
Users should not choose between many similar APIs. Drizzle parity favors one query surface. Convex pagination should feel like `findMany`.

# Scope
- Code: remove `paginate()` method, add `paginate` option to `findMany` and planner.
- Docs: replace all `.paginate()` examples with `findMany({ paginate })`.
- Tests: update query tests, add planner coverage.

# Non‑Goals
- Keep `.paginate()` compatibility.
- Add new `find` API.
- Change Convex core.

# Public API Changes
- **Remove:** `db.query.<table>.paginate()`.
- **Add:** `db.query.<table>.findMany({ paginate: { cursor, numItems }, ... })`.
- **Add:** `where?: (row) => boolean | Promise<boolean>` (function form; stream path).

# Behavior Rules
- `findMany` without `paginate` returns `T[]`.
- `findMany` with `paginate` returns `{ page, continueCursor, isDone }`.
- `where` stays indexable only.
- `where` function triggers stream path.

# Strict Guardrails
- strict true: throw on
  - `paginate` with non‑indexed `orderBy`.
  - `where` function without index range.
  - relation lookup missing index.
- strict false: warn + allow.

# Implementation Plan
## 1) Types
- Update `DBQueryConfig` to include `paginate?: { cursor: string | null; numItems: number }`.
- Add `where?: (row)=>boolean|Promise<boolean>` (function form).
- Update `BuildQueryResult` types to return paginated shape when `paginate` present.
- Remove `paginate` method from `RelationalQueryBuilder` types.

## 2) Query Builder
- Remove `paginate()` method from `packages/kitcn/src/orm/query-builder.ts`.
- Add `paginate` handling inside `findMany` execution.

## 3) Planner
- In query execution (likely `packages/kitcn/src/orm/query.ts`):
  - If `paginate` + no `where` function → Convex native paginate.
  - If `paginate` + `where` function → stream + filterWith + paginate.
  - If `where` function only → stream + filterWith + collect/take.
  - If `search` + `where` function → strict true throw, strict false warn + drop predicate.

## 4) Docs
- Replace `.paginate()` usage in:
  - `www/content/docs/orm/queries.mdx`
  - `www/content/docs/orm/api-reference.mdx`
  - `www/content/docs/orm/limitations.mdx`
  - `docs/analysis/2026-02-05-orm-performance-checklist.md`
- Add explicit note: `.paginate()` removed; use `findMany({ paginate })`.

## 5) Tests
- Update any `paginate()` tests to use `findMany({ paginate })`.
- Add type tests for overload return shape.
- Runtime tests for planner path selection.
- Strict true throws on non‑indexed paginate + `where` function.

# Acceptance Criteria
- No `.paginate()` in public API or docs.
- `findMany({ paginate })` works and returns page object.
- `where` function works and is guarded.
- Strict true blocks full scans.

# Risks
- Breaking change. Mitigate with clear docs + migration note.
- Overload return type confusion. Mitigate with examples.

# Unresolved q
- none
