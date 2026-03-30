---
status: complete
priority: p1
issue_id: "001"
tags: [docs, orm, drizzle, convex]
dependencies: []
---

# Sync ORM docs with Drizzle parity and current API

Align all ORM docs in `www/content/docs/orm` with current Better-Convex API and Drizzle-compatible semantics. Ensure examples compile, feature compatibility is accurate, and SQL is not referenced.

## Problem Statement

ORM documentation is out of sync with recent API changes and Drizzle parity decisions. This risks broken examples, incorrect usage guidance, and confusion about supported features (especially around `where`, `orderBy`, relations, and SQL exclusions).

## Findings

- `index.mdx` uses `db(ctx)` and `eq(posts.published, true)` without a `where` callback; current API expects `createDatabase` and `where: (cols, { eq }) => ...`.
- `quickstart.mdx` relations example references `posts.userId` but schema definition omits `userId`.
- `index.mdx` orderBy example shows a single field; implementation now supports multi-field and column builders.
- `index.mdx` suggests `eq` from `kitcn/orm/filter`; actual export is from main package.
- Feature compatibility section needs re-check against current scope (no `sql` support, `with` implemented, orderBy implemented).

## Proposed Solutions

### Option 1: Full line-by-line sync (Recommended)

**Approach:** Review each file in `www/content/docs/orm` sequentially, cross-check examples against current API/types and Drizzle docs/tests. Update code snippets, feature compatibility, and limitations to match implementation and intentional gaps (no SQL).

**Pros:**
- Eliminates doc drift comprehensively
- Aligns with Drizzle semantics and current code
- Low chance of leaving stale examples

**Cons:**
- More time up front

**Effort:** 2-4 hours

**Risk:** Low

---

### Option 2: Partial sync (quickstart + index first)

**Approach:** Update most visible docs now, defer remaining pages.

**Pros:**
- Faster initial progress

**Cons:**
- Leaves other pages inconsistent
- Increases follow-up work

**Effort:** 1-2 hours

**Risk:** Medium

## Recommended Action

Proceed with Option 1. Read and update each of the following files: `index.mdx`, `quickstart.mdx`, `schema.mdx`, `relations.mdx`, `queries.mdx`, `mutations.mdx`, `limitations.mdx`, `api-reference.mdx`, `comparison.mdx`, `llms-index.md`. Validate each example against current API (createDatabase, where callbacks, orderBy arrays, with, findFirst returns undefined, no SQL). Update feature compatibility section accordingly.

## Technical Details

**Affected files:**
- `www/content/docs/orm/index.mdx`
- `www/content/docs/orm/quickstart.mdx`
- `www/content/docs/orm/schema.mdx`
- `www/content/docs/orm/relations.mdx`
- `www/content/docs/orm/queries.mdx`
- `www/content/docs/orm/mutations.mdx`
- `www/content/docs/orm/limitations.mdx`
- `www/content/docs/orm/api-reference.mdx`
- `www/content/docs/orm/comparison.mdx`
- `www/content/docs/orm/llms-index.md`

**Related components:**
- ORM package APIs in `packages/kitcn/src/orm`
- Type tests in `convex/test-types`

## Resources

- Drizzle ORM repo: `/tmp/cc-repos/drizzle-orm`
- Convex Ents repo: `/tmp/cc-repos/convex-ents`
- Convex backend repo: `/tmp/cc-repos/convex-backend`

## Acceptance Criteria

- [x] All 10 ORM doc files reviewed and updated to match current API
- [x] All code snippets use `createDatabase` and correct `where` callback shape
- [x] Relations examples compile (include all referenced fields)
- [x] Feature compatibility section reflects current scope (no SQL, orderBy and with status correct)
- [x] No documentation suggests `sql` support
- [x] Export paths and function names match actual package exports

## Work Log

### 2026-02-03 - Initial Review

**By:** Codex

**Actions:**
- Inventoried ORM docs in `www/content/docs/orm`
- Noted mismatches in `index.mdx` and `quickstart.mdx`
- Created plan to fully sync docs with Drizzle parity and current API

**Learnings:**
- Recent API changes (createDatabase, where callbacks, orderBy arrays) are not reflected in docs
- Relations examples need schema alignment

### 2026-02-03 - Docs Sync Complete

**By:** Codex

**Actions:**
- Updated all ORM docs in `www/content/docs/orm` to reflect current API
- Replaced `db(ctx)` usage with `createDatabase` + `defineRelations`/`extractRelationsConfig`
- Fixed `where` examples to use callback form and updated orderBy examples
- Updated relations examples (explicit FK fields, join table for many-to-many)
- Refreshed Feature Compatibility lists and removed SQL snippets

**Learnings:**
- `with` and `orderBy` are implemented but have post-fetch constraints
- Docs now align with type tests and current query builder behavior

## Notes

- Explicitly avoid SQL support in docs per requirement
