---
status: complete
priority: p1
issue_id: "002"
tags: [orm, drizzle, indexes, convex, typescript, tests, docs]
dependencies: []
---

# Implement Drizzle v1 search/vector index builders

Implement `searchIndex()` and `vectorIndex()` builders following Drizzle v1 patterns, add a `vector(dimensions)` column builder with runtime validation, remove old method chaining APIs, add comprehensive tests, and sync ORM docs.

## Problem Statement

The ORM currently supports Drizzle-style builders for basic indexes but still uses deprecated method chaining for search and vector indexes. This creates an inconsistent API, weak type safety, and divergence from Drizzle v1 patterns. We need full builder coverage, runtime validation, and tests, with no backward compatibility.

## Findings

- Phase 1 builder pattern exists for `index()` and `uniqueIndex()`.
- `applyExtraConfig` in `packages/kitcn/src/orm/table.ts` already handles index builders with type-guard based validation.
- Search/vector index builders need to mirror Drizzle v1 style while integrating Convex-specific behaviors.
- Vector column builder is required to ensure runtime validation and full Convex coverage.

## Proposed Solutions

### Option 1: Full builder implementation + vector column + tests + docs (recommended)

**Approach:**
- Add `searchIndex()` and `vectorIndex()` builders with `.on()`, `.filter()`, `.staged()`, and `.dimensions()`.
- Add `vector(dimensions)` column builder with runtime length validation.
- Update `applyExtraConfig` to handle new builders and validate field/table matches.
- Remove deprecated method chaining `.searchIndex()` / `.vectorIndex()`.
- Add runtime tests, type tests (including negative cases), and sync ORM docs.

**Pros:**
- Full Drizzle v1 parity and consistent API
- Strong validation and coverage
- Clear docs and examples

**Cons:**
- Touches several files and test suites

**Effort:** 1-2 days

**Risk:** Medium

---

### Option 2: Builders only, no vector column builder

**Approach:**
- Implement builders and tests, but leave vector field definition to manual validators.

**Pros:**
- Less scope

**Cons:**
- Incomplete Convex coverage and weaker UX

**Effort:** <1 day

**Risk:** Medium

## Recommended Action

Implement Option 1: full builder support, vector column builder with runtime validation, remove deprecated APIs, add complete tests (runtime/type/negative), and update ORM docs.

## Technical Details

**Affected files (expected):**
- `packages/kitcn/src/orm/indexes.ts`
- `packages/kitcn/src/orm/table.ts`
- `packages/kitcn/src/orm/index.ts`
- `packages/kitcn/src/orm/validators.ts` (or similar for column builders)
- `convex/schema.ts`
- `test/...` (type + runtime tests)
- `www/content/docs/...` (ORM docs)

## Resources

- Plan: `docs/plans/2026-02-04-feat-drizzle-search-vector-index-builders-plan.md`
- Brainstorm: `docs/brainstorms/2026-02-04-drizzle-index-api.md`
- Drizzle v1: https://github.com/zbeyens/drizzle-v1
- Convex backend: https://github.com/get-convex/convex-backend

## Acceptance Criteria

- [x] `searchIndex(name).on(field)` creates a search index
- [x] `.filter(...fields)` and `.staged()` work on search index
- [x] `vectorIndex(name).on(field).dimensions(n)` creates vector index
- [x] `.filter(...fields)` and `.staged()` work on vector index
- [x] `.dimensions()` can be chained in any order with `.filter()`
- [x] Missing `.on()` throws a clear error
- [x] Missing `.dimensions()` throws a clear error
- [x] Wrong-table columns throw clear errors
- [x] Invalid dimensions (non-integer, <=0) throw clear errors
- [x] Old method chaining APIs removed
- [x] `vector(dimensions)` column builder added with runtime length validation
- [x] Type tests cover positive and negative cases
- [x] Runtime tests cover search/vector index creation and errors
- [x] ORM docs updated
- [x] `bun typecheck` and `bun run test` pass

## Work Log

### 2026-02-04 - Planning

**By:** Codex

**Actions:**
- Created ready todo from plan and clarified requirements

**Learnings:**
- No backward compatibility required; full Drizzle v1 syntax only

### 2026-02-04 - Implementation

**By:** Codex

**Actions:**
- Implemented search/vector index builders and vector column builder with runtime validation
- Updated `applyExtraConfig` to support new builders and removed legacy chain APIs
- Added runtime and type tests (positive + negative) for index builders and vector validation
- Updated Convex schema and ORM docs to new syntax
- Ran `bun typecheck` and `bun run test` (pass)

**Notes:**
- `bun --cwd packages/kitcn build` fails with a tsdown/rolldown `node:util: styleText` error on Node.js v20.12.1
