---
title: M5 Query Builder - Ordering and Advanced Queries
type: feat
date: 2026-02-02
milestone: M5
---

# M5 Query Builder - Ordering and Advanced Queries

## Overview

Implement `orderBy` support and advanced string operators for the Better-Convex ORM query builder. This completes the core querying functionality by adding sorting and pattern matching capabilities while maintaining 1:1 Drizzle API parity.

**Milestone:** M5 (Query Builder - Ordering & Advanced Queries)

**Scope from brainstorm:**
- `orderBy` option: Sort results by field(s) with `asc`/`desc`
- String operators: `like`, `ilike`, `startsWith`, `endsWith`, `contains`
- Index-aware ordering: Use Convex index ordering when possible
- Multi-field ordering: Combine multiple sort fields
- Search integration: Full-text search operators

## Problem Statement / Motivation

**Current state (M4):**
- ✅ Basic queries: `findMany()`, `findFirst()`
- ✅ WHERE filtering: `eq`, `ne`, `gt`, `lt`, `gte`, `lte`, `and`, `or`, `not`, `isNull`, `isNotNull`
- ✅ Pagination: `limit`, `offset`
- ❌ Ordering: `orderBy` stubbed but not implemented
- ❌ String matching: No `like`, `ilike`, `startsWith`, `endsWith`, `contains`

**User pain:**
```typescript
// Workaround: Manual sorting after fetch
const posts = await db(ctx).query.posts.findMany();
const sorted = posts.sort((a, b) => b._creationTime - a._creationTime);
```

**Goal:**
```typescript
// M5: Native ordering
import { desc } from 'kitcn/orm';
const posts = await db(ctx).query.posts.findMany({
  orderBy: desc(posts._creationTime),
});

// M5: String operators
import { like } from 'kitcn/orm';
const users = await db(ctx).query.users.findMany({
  where: like(users.name, '%alice%'),
});
```

## Proposed Solution

### Architecture

Extend existing query builder pattern from M3-M4:

```
QueryBuilder (query.ts)
  ├─> FilterExpression (filter-expression.ts) [EXTEND]
  │    └─> String operators: like, ilike, startsWith, endsWith, contains
  ├─> OrderByClause [NEW]
  │    └─> asc(), desc() helpers
  └─> QueryCompiler (query-compiler.ts) [EXTEND]
       └─> Compile orderBy to Convex .order() API
```

**Key files to modify:**
1. `packages/kitcn/src/orm/filter-expression.ts` - Add string operators
2. `packages/kitcn/src/orm/query.ts` - Implement orderBy stub (lines 96-99)
3. `packages/kitcn/src/orm/query-compiler.ts` - Compile orderBy to Convex API
4. `packages/kitcn/src/orm/types.ts` - Add OrderBy types
5. `packages/kitcn/src/orm/index.ts` - Export asc(), desc() helpers

### Implementation Phases

#### Phase 1: OrderBy Foundation

**Tasks:**
- [x] Define `OrderByClause` type in `types.ts`
- [x] Create `asc()` and `desc()` helper functions
- [x] Add `orderBy` parameter to `FindManyOptions` type
- [x] Update `query.ts` orderBy stub to accept single field ordering

**Deliverables:**
```typescript
// types.ts
export type OrderByClause<TTable> = {
  field: Column<TTable>;
  direction: 'asc' | 'desc';
};

// index.ts
export function asc<TTable>(field: Column<TTable>): OrderByClause<TTable>;
export function desc<TTable>(field: Column<TTable>): OrderByClause<TTable>;
```

**Success criteria:**
- Type-safe field references
- Drizzle-compatible API (same signature)

#### Phase 2: OrderBy Compilation

**Tasks:**
- [x] Implement Convex `.order()` compilation in `query-compiler.ts`
- [x] Handle index-aware ordering (use index if available)
- [x] Add ordering direction support (asc/desc)
- [x] Implement fallback for non-indexed fields (post-fetch sort)

**Convex limitations to handle:**
- Single-field ordering only (Convex API restriction)
- Must use index for efficient ordering
- Multi-field ordering requires post-fetch sort

**Deliverables:**
```typescript
// query-compiler.ts
compileOrderBy(orderBy: OrderByClause): ConvexQuery {
  // If field has index: use .order('asc'|'desc')
  // Else: post-fetch sort with Array.sort()
}
```

**Success criteria:**
- Uses Convex index when available
- Falls back to post-fetch sort for non-indexed fields
- Correct ascending/descending behavior

#### Phase 3: String Operators

**Tasks:**
- [x] Add `like()` operator to `filter-expression.ts`
- [x] Add `ilike()` operator (case-insensitive)
- [x] Add `startsWith()` operator
- [x] Add `endsWith()` operator
- [x] Add `contains()` operator
- [x] Implement pattern compilation in `where-clause-compiler.ts`

**Convex limitations:**
- No native LIKE operator
- Requires post-filter or search indexes

**Implementation strategy:**
```typescript
// Post-filter approach (fallback)
like(field, pattern) -> filter(q => matchPattern(field, pattern))

// Search index approach (optimized)
contains(field, text) -> .withSearchIndex('fieldName', q => q.search('fieldName', text))
```

**Deliverables:**
```typescript
// filter-expression.ts
export function like<T>(field: Column<T>, pattern: string): FilterExpression;
export function ilike<T>(field: Column<T>, pattern: string): FilterExpression;
export function startsWith<T>(field: Column<T>, prefix: string): FilterExpression;
export function endsWith<T>(field: Column<T>, suffix: string): FilterExpression;
export function contains<T>(field: Column<T>, substring: string): FilterExpression;
```

**Success criteria:**
- Correct pattern matching behavior
- Case-sensitive vs case-insensitive variants work
- Search index optimization when available

#### Phase 4: Type Testing

**Tasks:**
- [ ] Create `convex/orm/ordering.test.ts` following `where-filtering.test.ts` pattern
- [ ] Test single-field ordering (asc/desc)
- [ ] Test orderBy with where filtering combined
- [ ] Test orderBy with pagination (limit/offset)
- [ ] Create `convex/orm/string-operators.test.ts`
- [ ] Test each string operator (like, ilike, startsWith, endsWith, contains)
- [ ] Mark multi-field ordering as TODO (Convex limitation)

**Test deferral pattern** (from institutional learnings):
```typescript
// ordering.test.ts
describe('OrderBy', () => {
  test('single field asc', async () => { /* ... */ });
  test('single field desc', async () => { /* ... */ });

  test.todo('multi-field ordering'); // M7 or later - Convex limitation
});
```

**Success criteria:**
- All implemented features have passing tests
- Deferred features marked with `.todo()` and explanation

#### Phase 5: Documentation Updates

**Tasks:**
- [ ] Update `www/content/docs/orm/queries.mdx` with orderBy examples
- [ ] Update string operators section in queries.mdx
- [ ] Update `www/content/docs/orm/api-reference.mdx` with new operators
- [ ] Update `www/content/docs/orm/limitations.mdx` status (M5 complete)
- [ ] Update feature compatibility table in `www/content/docs/orm/index.mdx`
- [ ] Sync `www/public/orm/api-catalog.json` to M5 version
- [ ] Sync `www/public/orm/examples-registry.json` with new examples

**Follow methodology from brainstorm** (lines 849-1156):
- Verify 1:1 Drizzle parity for orderBy and string operators
- Use column builder syntax throughout (no validators)
- Maintain Category classification (Cat 1: Compatible, Cat 2: Limited)
- Update JSON artifacts for agent-native access

**Success criteria:**
- All docs use column builder syntax
- Drizzle parity verified
- Feature compatibility table accurate
- JSON artifacts version bumped to M5

## Technical Considerations

### Type Inference

Use **GetColumnData dual-mode pattern** from institutional learnings:

```typescript
// types.ts - GetColumnData with 'query' mode
type OrderByResult<TTable, TOrderBy> = {
  // Infer return type with proper brands preserved
};
```

**Critical:** Use `Merge` utility for type brand preservation (NEVER intersection `&`).

### Convex API Constraints

**Single-field ordering:**
```javascript
// Convex supports
db.query('posts').order('desc')

// Convex does NOT support
db.query('posts').order('desc').thenBy('asc') // ❌
```

**Strategy:** Multi-field ordering = post-fetch sort with clear documentation.

**Search vs LIKE:**
- `like()` / `ilike()` → Post-filter (slow, no index)
- `contains()` → Search index when available (fast, indexed)
- Document trade-offs clearly

### Performance

**Index-aware ordering:**
```typescript
// Fast: Uses index
orderBy: desc(posts._creationTime) // Convex has default _creationTime index

// Slow: Post-fetch sort
orderBy: desc(posts.title) // No index on title
```

**Documentation:** Add performance callout to docs explaining when to create indexes.

## Acceptance Criteria

### Functional Requirements

**OrderBy:**
- [ ] `asc()` function exported and works with typed fields
- [ ] `desc()` function exported and works with typed fields
- [ ] Single-field ordering compiles to Convex `.order()`
- [ ] Index-aware optimization (uses index when available)
- [ ] Fallback to post-fetch sort for non-indexed fields
- [ ] Works combined with `where`, `limit`, `offset`

**String Operators:**
- [ ] `like(field, pattern)` matches SQL LIKE behavior (% wildcards)
- [ ] `ilike(field, pattern)` case-insensitive variant
- [ ] `startsWith(field, prefix)` optimized for prefix matching
- [ ] `endsWith(field, suffix)` suffix matching
- [ ] `contains(field, substring)` substring matching
- [ ] Search index optimization when available

**Type Safety:**
- [ ] All operators accept only string fields (type error for non-strings)
- [ ] Return types preserve type brands from GetColumnData
- [ ] IDE autocomplete works for field references

### Non-Functional Requirements

**Performance:**
- [ ] Indexed ordering uses Convex `.order()` API (O(log n))
- [ ] Non-indexed ordering documented as post-fetch (O(n log n))
- [ ] Search index preferred over post-filter for `contains()`

**Drizzle Parity:**
- [ ] `asc()` / `desc()` match Drizzle signature exactly
- [ ] String operators match Drizzle names (like, ilike, etc.)
- [ ] Behavior matches Drizzle semantics (same wildcards, case sensitivity)

**Documentation:**
- [ ] All new operators in API reference
- [ ] Performance guidance (when to use indexes)
- [ ] Limitations clearly stated (multi-field ordering, search vs LIKE)

### Quality Gates

**Test Coverage:**
- [ ] Unit tests for each operator in isolation
- [ ] Integration tests for combined queries (orderBy + where + limit)
- [ ] Type tests verify correct inference
- [ ] Deferred features marked with `.todo()` and explanation

**Documentation Sync:**
- [ ] All 7 MDX docs updated (if applicable)
- [ ] JSON artifacts version bumped to M5
- [ ] Feature compatibility table accurate
- [ ] No validator syntax remaining

## Success Metrics

**Drizzle migration readiness:**
- Users can replace Drizzle `orderBy` with Better-Convex 1:1
- String operators provide familiar SQL-like API

**Performance:**
- Indexed ordering as fast as native Convex `.order()`
- Non-indexed ordering acceptable for small datasets (<1000 records)

**Type safety:**
- Zero type errors in example queries
- IDE autocomplete shows available fields for ordering

## Dependencies & Prerequisites

**Completed milestones:**
- ✅ M1: Schema Foundation (column builders)
- ✅ M2: Relations Layer
- ✅ M3: Query Builder - Read Operations
- ✅ M4: Query Builder - WHERE Filtering

**External dependencies:**
- Convex SDK API (ordering, search indexes)
- Drizzle ORM types (for parity verification)

**Prerequisites:**
- All M4 tests passing
- Documentation in sync (M6 column builder syntax)

## Risk Analysis & Mitigation

**Risk 1: Multi-field ordering limitation**
- **Impact:** Users expect SQL-like multi-field ORDER BY
- **Mitigation:** Clear documentation, post-fetch sort fallback, mark as Cat 2 (Limited)

**Risk 2: LIKE operator performance**
- **Impact:** Post-filter LIKE is O(n) and slow
- **Mitigation:** Document search index alternative, provide `contains()` optimization

**Risk 3: Type inference complexity**
- **Impact:** GetColumnData dual-mode may cause type errors
- **Mitigation:** Use established patterns from M4, test thoroughly

## Future Considerations

**M7: Multi-field ordering** (deferred)
- Requires Convex API enhancement OR post-fetch sort
- Mark as TODO in tests

**M7: Aggregations** (out of M5 scope)
- `count()`, `sum()`, `avg()` etc.
- Separate milestone

**Search optimization:**
- Deep integration with Convex search indexes
- Auto-detect when to use search vs post-filter

## References & Research

### Internal References

**Query builder patterns:**
- `packages/kitcn/src/orm/query.ts:96-99` - Stubbed orderBy
- `packages/kitcn/src/orm/filter-expression.ts` - Operator pattern to extend
- `packages/kitcn/src/orm/where-clause-compiler.ts` - Visitor pattern for compilation

**Type inference patterns:**
- `packages/kitcn/src/orm/types.ts` - GetColumnData dual-mode pattern
- Institutional learning: Merge utility for type brand preservation

**Test structure:**
- `convex/orm/where-filtering.test.ts` - Pattern to follow
- Institutional learning: Test-after-implementation, defer with `.todo()`

### External References

**Drizzle ORM:**
- OrderBy API: https://orm.drizzle.team/docs/select#order-by
- String operators: https://orm.drizzle.team/docs/operators

**Convex API:**
- Ordering: https://docs.convex.dev/database/reading-data#ordering
- Search indexes: https://docs.convex.dev/text-search

### Related Work

**Previous plans:**
- `docs/plans/2026-02-01-feat-milestone-4-query-builder-where-filtering-plan.md` - WHERE filtering (M4)
- `docs/plans/2026-02-02-refactor-orm-docs-maintenance-methodology-column-builders-sync-plan.md` - Docs sync methodology

**Brainstorm:**
- `docs/brainstorms/2026-01-31-drizzle-orm-brainstorm.md:663-675` - M5 scope definition
- Lines 849-1156 - Documentation maintenance methodology

## Unresolved Questions

- Multi-field orderBy implementation strategy? (post-fetch vs Convex API future)
- Search index auto-detection heuristic? (when to use vs post-filter)
- Performance threshold for post-fetch sort warning? (<1000 records?)
