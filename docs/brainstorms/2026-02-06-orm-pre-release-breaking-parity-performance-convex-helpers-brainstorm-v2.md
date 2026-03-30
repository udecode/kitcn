---
date: 2026-02-06
topic: orm-pre-release-breaking-parity-performance-convex-helpers-v2
status: proposed
---

# ORM Pre-release: Breaking Changes, Parity, Performance, convex-helpers

Deep audit of `packages/kitcn/src/orm` (~16k LOC), 212 runtime tests, 18 doc pages, and all of `convex-helpers`.

## Ranked Recommendations

### TIER 1: Breaking - Must Fix Before Stable

#### 2. [BREAKING] Unbounded `.collect()` in Update/Delete

**Severity**: Critical
**Files**: `update.ts:216,236,239`, `delete.ts:209,232,235`

`update()` and `delete()` builders call `.collect()` on the full query, then filter in memory. No limit, no batching. A `db.delete(posts).where(eq(posts.status, 'draft'))` on a 100k-row table hits Convex limits immediately.

**Proposed direction**:

- Reuse `WhereClauseCompiler` for mutations (currently only used for queries).
- Add batched processing via `take(N)` loops.
- Require `allowFullScan` if WHERE isn't indexable.

---

#### 3. [BREAKING] Unbounded `.collect()` in Cascade Deletes

**Severity**: High
**Files**: `mutation-utils.ts:493`, `delete.ts` cascade paths

Cascade operations call `.collect()` on referencing tables without limit. A cascade on a heavily-referenced row can scan entire tables.

**Proposed**: Batch cascade with configurable ceiling. Fail fast if ceiling exceeded rather than silently continuing.

---

#### 4. [BREAKING] multiProbe `.collect()` Unbounded

**Severity**: High
**Files**: `query.ts:1761`

`OR` / `inArray` with multi-probe strategy runs N separate index queries and calls `.collect()` on each probe. No per-probe limit. 50 probes × 1000 rows each = 50k in-memory rows before deduplication.

**Proposed**: Apply per-probe limit, fail fast if any probe hits ceiling.

---

#### 5. [BREAKING] Hide Internal Classes from Public API

**Severity**: Medium
**Files**: `index.ts` exports

`GelRelationalQuery`, `QueryPromise`, `WhereClauseCompiler`, `ConvexInsertBuilder`, `ConvexUpdateBuilder`, `ConvexDeleteBuilder` are all exported. These are implementation details that harden accidental API contracts.

**Proposed**: Only export types and factory functions. Users should interact via `db.query.table.findMany()`, `db.insert(table)`, etc., never construct builders directly.

---

#### 6. [BREAKING] `update().set()` Without `.where()` Updates ALL Rows

**Severity**: Medium
**Files**: `update.ts`

Calling `db.update(table).set({...})` without `.where()` requires `allowFullScan: true` but the API shape makes it too easy to forget. SQL ORMs typically require WHERE.

**Proposed**: Make `.where()` required on `update()` and `delete()`. Add `db.update(table).set({...}).all()` for explicit "update everything" intent.

---

### TIER 2: Performance - Fix Before or Shortly After Stable

#### 7. [PERF] Relation Loading N+1 Pattern

**Severity**: High
**Files**: `query.ts:2724-2927` (`_loadManyRelation`, `_loadOneRelation`)

Current relation loading uses `_mapWithConcurrency` per-key. For a findMany returning 100 posts each with an author, that's 100 separate `db.get()` calls. For many-to-many through relations, it's worse: N through-table queries + N target queries.

**Current mitigation**: `_mapWithConcurrency` with configurable concurrency (undocumented default).

**Proposed**:

- Batch same-table lookups: collect all needed IDs, single `.withIndex` query, distribute results.
- For through-relations: single through-table query with OR of source keys (if indexed).
- Document `relationLoading.concurrency` option.

---

#### 8. [PERF] Post-Fetch Sort After Offset/Limit = Wrong Results

**Severity**: High
**Files**: `query.ts:1691-1695`

When orderBy requires post-fetch sort (multi-field or non-indexable), the current flow is:

1. Fetch `offset + limit` rows from index
2. Slice for offset
3. Sort

This means sort happens on the already-truncated set, producing incorrect results. Should sort before slicing.

**Proposed**: Restructure to: fetch → sort → offset/slice → limit/slice. Document that non-indexed sorts require full dataset fetch (which conflicts with implicit limit).

---

#### 9. [PERF] String Operators Are Disguised Full Scans

**Severity**: Medium
**Files**: `where-clause-compiler.ts`, `query.ts`

`like()`, `startsWith()`, `endsWith()`, `contains()` are all post-fetch filters that look like first-class operators. Users assume they use indexes.

**Proposed**:

- In strict mode, require `allowFullScan` when using string operators without a search index.
- Add documentation: "For text matching, prefer `search` option with a search index."
- Consider mapping `startsWith` to Convex's prefix-scanning capabilities where possible.

---

#### 10. [PERF] `ne()` and `not()` Always Full Scan

**Severity**: Medium
**Files**: `where-clause-compiler.ts`

Negation operators can never use indexes (Convex doesn't support NOT index ranges). They're currently silent post-fetch filters.

**Proposed**: Require `allowFullScan` in strict mode when using `ne()`, `not()`, `notInArray()` without an index that covers other fields in the same WHERE.

---

### TIER 3: Parity - Convex Native Gaps

#### 11. [PARITY] Vector Search Query API

**Severity**: High
**Gap**: Schema supports `vectorIndex()` definitions but no query builder for `db.query.table.findMany({ vectorSearch: {...} })`.

Convex native: `ctx.vectorSearch(table, indexName, { vector, limit, filter })` - returns sorted by similarity.

**Proposed**: Add to findMany config:

```ts
findMany({
  vectorSearch: {
    index: 'embedding_index',
    vector: [0.1, 0.2, ...],
    limit: 10,
    filter: (q) => q.eq('status', 'published'),
  }
})
```

This is the largest Convex parity gap on the read path.

---

#### 12. [PARITY] `between` / `notBetween` Operators

**Severity**: Medium
**Gap**: Drizzle has `between(col, min, max)`. ORM requires `and(gte(col, min), lte(col, max))`.

**Proposed**: Add `between()` and `notBetween()` as sugar that compiles to `and(gte, lte)`. Index-compatible since it maps to range queries.

---

#### 13. [PARITY] System Table Access

**Severity**: Medium
**Gap**: `_storage` and `_scheduled_functions` not queryable through ORM. Must use `ctx.db.system.get/query`.

**Proposed**: Expose `db.system` passthrough for system table queries. Don't wrap with ORM features (no RLS, no relations), just typed access.

---

#### 14. [PARITY] `normalizeId()` Utility

**Severity**: Low
**Gap**: Stream API throws on `normalizeId()`. No ORM wrapper.

**Proposed**: Expose `db.normalizeId(table, idString)` as passthrough to `ctx.db.normalizeId`.

---

#### 15. [PARITY] Aggregation: `count()`

**Severity**: Low (v1.x)
**Gap**: No count support. Users do `.collect().length` which fetches all data.

**Proposed**: Consider integration with `@convex-dev/aggregate` component rather than building custom. Defer to post-v1.

---

### TIER 4: Drizzle Parity Gaps

#### 16. [DRIZZLE] `exists` / `notExists` Subquery Operators

**Severity**: Low
**Gap**: Drizzle has `exists(subquery)`. Not possible in Convex (no subqueries).

**Proposed**: Document as platform limitation. Can approximate with relation-based `where` filters.

---

#### 17. [DRIZZLE] Aggregation Operators (`sum`, `avg`, `max`, `min`)

**Severity**: Low (v1.x)
**Gap**: SQL-only feature. Convex has no server-side aggregation.

**Proposed**: Document as platform limitation. Point to `@convex-dev/aggregate` for counts/sums.

---

### TIER 5: convex-helpers Fork Decisions

#### 18. [FORK] stream.ts - Already Forked, Keep Internal

**Status**: Already forked into `packages/kitcn/src/orm/stream.ts`.
**LOC**: 1,888 (convex-helpers) → adapted in ORM.
**Decision**: **KEEP FORK**. Track upstream changes periodically. Don't re-export.

---

#### 19. [FORK] pagination.ts - Already Integrated

**Status**: ORM has `getPage()` and cursor pagination built-in.
**Decision**: **KEEP INTERNAL**. ORM's `.paginate()` supersedes.

---

#### 20. [IGNORE] relationships.ts - ORM Supersedes

**LOC**: 547
**Assessment**: `getManyFrom`, `getOneFrom`, `getManyVia` are exactly what ORM's `.with()` does. ORM's typed relation loading is strictly more powerful.
**Decision**: **IGNORE**. ORM supersedes.

---

#### 21. [IGNORE] rowLevelSecurity.ts - ORM Has Own RLS

**LOC**: 430
**Assessment**: convex-helpers RLS wraps database reader/writer. ORM has its own RLS system (`rls/` directory) integrated into query/mutation execution.
**Decision**: **IGNORE**. ORM's RLS is already more integrated.

---

#### 22. [IGNORE] customFunctions.ts - Orthogonal

**LOC**: 667
**Assessment**: Middleware pattern for wrapping query/mutation/action. Useful for users but not ORM-core.
**Decision**: **IGNORE in ORM**. Document as recommended companion.

---

#### 23. [IGNORE] filter.ts - ORM Where Clause Is Superior

**LOC**: 198
**Assessment**: Post-pagination async filter. ORM's WhereClauseCompiler is index-aware and more powerful.
**Decision**: **IGNORE**.

---

#### 24. [IGNORE] triggers.ts - Application Layer

**LOC**: 508
**Assessment**: DB write callbacks. Application concern, not query layer.
**Decision**: **IGNORE in ORM**. Document as companion.

---

#### 25. [IGNORE] crud.ts - ORM Supersedes

**LOC**: 180
**Assessment**: Basic CRUD generators. ORM is the successor.
**Decision**: **IGNORE**.

---

#### 26. [IGNORE] validators.ts - Recommend as Peer

**LOC**: 1,047
**Assessment**: `partial()`, `pick()`, `omit()` utilities. Useful but not ORM-core.
**Decision**: **DEPEND** as recommended peer. Link in docs.

---

#### 27. [IGNORE] zod4.ts, cors.ts, hono.ts, migrations.ts, rateLimit.ts, retries.ts, sessions.ts

All either deprecated (use components), orthogonal to ORM, or package-level concerns.
**Decision**: **IGNORE ALL**.

---

### TIER 6: Coverage & Docs

#### 28. [DOCS] Performance Checklist Per Operation

**Severity**: Medium
**Gap**: No operation-by-operation performance guidance. Users hit Convex limits without understanding which ORM calls trigger full scans.

**Proposed**: Add to `limitations.mdx`:

| Operation                   |  Index Required   |    Can Full Scan    | Silent Truncation | Notes                |
| --------------------------- | :---------------: | :-----------------: | :---------------: | -------------------- |
| `findMany`                  |    Recommended    | Yes (strict warns)  |  Yes (1000 cap)   | Use limit/paginate   |
| `findFirst`                 |    Recommended    | Yes (strict warns)  |   No (limit 1)    | - |
| `update().where()`          |    Recommended    | Yes (allowFullScan) |        No         | .collect() unbounded |
| `delete().where()`          |    Recommended    | Yes (allowFullScan) |        No         | .collect() unbounded |
| `with: { relation: true }`  | Required (strict) | Yes (allowFullScan) |        No         | N+1 per parent       |
| `search: { ... }`           |     Required      |         No          |        No         | Search index only    |
| `ne()`, `not()`, string ops |        N/A        |       Always        |        No         | Post-fetch only      |

---

#### 29. [TEST] Type Contract Tests for Strict/FullScan Constraints

**Severity**: Medium
**Gap**: Runtime tests are broad (212 tests), but no compile-time tests verify that strict mode correctly rejects non-indexed queries at the type level.

**Proposed**: Add `@ts-expect-error` tests for:

- `findMany()` without limit in strict mode
- `update()` without `.where()` in strict mode
- String operators without `allowFullScan`

---

## Summary: Priority Order

| #   | Category | Item                                 | Effort | Breaking?         |
| --- | -------- | ------------------------------------ | ------ | ----------------- |
| 1   | Breaking | Silent `limit ?? 1000`               | M      | Yes               |
| 2   | Breaking | Update/delete unbounded `.collect()` | M      | Yes               |
| 3   | Breaking | Cascade unbounded `.collect()`       | M      | Yes               |
| 4   | Breaking | multiProbe unbounded `.collect()`    | S      | Yes               |
| 5   | Breaking | Hide internal classes                | S      | Yes               |
| 6   | Breaking | Require `.where()` on update/delete  | S      | Yes               |
| 7   | Perf     | Relation loading N+1 batch           | L      | No                |
| 8   | Perf     | Post-fetch sort ordering bug         | M      | Yes (behavior)    |
| 9   | Perf     | String operators strict mode         | S      | Yes (strict only) |
| 10  | Perf     | Negation operators strict mode       | S      | Yes (strict only) |
| 11  | Parity   | Vector search query API              | L      | No                |
| 12  | Parity   | `between`/`notBetween`               | S      | No                |
| 13  | Parity   | System table access                  | S      | No                |
| 14  | Parity   | `normalizeId()`                      | XS     | No                |
| 15  | Parity   | Aggregation (`count`)                | M      | No (v1.x)         |
| 28  | Docs     | Performance checklist                | S      | No                |
| 29  | Test     | Type contract tests                  | M      | No                |

## Key Decisions

- **Approach A** (reliability-first) for items 1-10: spend breaking budget on safety.
- **Targeted parity** for items 11-15: vector search is highest-value parity addition.
- **convex-helpers**: stream/pagination already forked, rest ignored or documented as companions.
- **Drizzle parity**: at ~85%. Remaining gaps (`exists`, aggregations, JOINs) are platform limitations.

## Open Questions

1. Silent limit: require explicit sizing for ALL findMany, or only in strict mode?
2. If keeping implicit cap compatibility mode: truncation warning vs overflow error?
3. Vector search: v1 boundary or v1.x immediately after?
4. Should `.where()` requirement on update/delete be strict-only or always?
5. Post-fetch sort bug: fix silently or make it a breaking behavior change with docs?
6. Relation loading batch: acceptable to change from per-key to batched queries? (observable behavior change in query count)
7. Should stream/pagination forks sync from convex-helpers on a cadence?
8. Count/aggregation: build minimal ORM support or recommend `@convex-dev/aggregate`?

## Next Steps

-> `/workflows:plan` to convert ranked items into implementation plan with migration notes.
