---
title: M6.5: Complete Query Support
type: feat
date: 2026-02-03
milestone: M6.5
status: planned
---

# M6.5: Complete Query Support

## Overview

Complete all query features that Convex can support before moving to mutations (M7). This ensures queries are 100% production-ready with runtime relation loading and Convex-native pagination advantages.

**Core deliverables:**
1. **Relation loading runtime** - Make `with: { posts: true }` actually load related data
2. **Nested relations** - Support `with: { posts: { with: { comments: true } } }`
3. **Relation filters** - Support `with: { posts: { where, limit, orderBy } }`
4. **Cursor pagination** - Convex-native `.paginate({ cursor, numItems })` (O(1) vs O(n) for offset)

**Context from brainstorm:** [docs/brainstorms/2026-02-03-m6.5-complete-query-support-brainstorm.md](../../brainstorms/2026-02-03-m6.5-complete-query-support-brainstorm.md)

## Problem Statement

**Current state:** M1-M6 complete, but relation loading runtime is stubbed. Type inference works (types infer relations correctly), but `_loadRelations()` returns rows unchanged at [packages/kitcn/src/orm/query.ts:633-641](../../packages/kitcn/src/orm/query.ts#L633-641).

**User pain:** Types pass but queries return empty relations. Confusing UX where `with: { posts: true }` compiles but doesn't actually load posts.

**Decision:** Block M7 (Mutations) until queries are 100% complete. Rationale:
- User expectations: If types infer relations, runtime should load them
- Testing foundation: Mutations need working relation loading for comprehensive tests
- Clean boundaries: Complete reads before adding writes
- Convex advantages: Cursor pagination showcases Convex's O(1) performance

## Technical Approach

### 1. Relation Loading Runtime

**Integration point:** [packages/kitcn/src/orm/query.ts:335](../../packages/kitcn/src/orm/query.ts#L335)
```typescript
// Current call site (execute method)
rowsWithRelations = await this._loadRelations(rows, this.config.with);
```

**Implementation location:** [packages/kitcn/src/orm/query.ts:633-641](../../packages/kitcn/src/orm/query.ts#L633-641)

**Algorithm:**
1. Extract edge metadata from `this.edgeMetadata` (filtered by source table)
2. For each relation in `withConfig`, determine field mapping via EdgeMetadata
3. Batch load related records using Convex `.withIndex()` for edge fields
4. Use `Promise.all()` to load all relations in parallel (avoid N+1 queries)
5. Map relation results back to parent rows (group by parent ID)

**Key data structures:**
- `EdgeMetadata` interface: [packages/kitcn/src/orm/extractRelationsConfig.ts:17-40](../../packages/kitcn/src/orm/extractRelationsConfig.ts#L17-40)
  - `sourceTable`, `edgeName`, `targetTable`, `cardinality` ('one' | 'many')
  - `fieldName` (FK field like "userId"), `indexName`, `indexFields`
  - `inverseEdge`, `optional`, `onDelete`

**Type safety:**
- Use `BuildQueryResult` type: [packages/kitcn/src/orm/types.ts:392-442](../../packages/kitcn/src/orm/types.ts#L392-442)
- Use `BuildRelationResult` to map `with` config to types: [types.ts:425-442](../../packages/kitcn/src/orm/types.ts#L425-442)
- Apply `Merge<BaseModel, RelationTypes>` pattern (learning: phantom-type-brand-preservation)
- Use `GetColumnData<TBuilder, 'query'>` mode for relation results (includes null for nullable)

#### Research Insights: N+1 Query Prevention

**From Convex Ents patterns:**
- Use `Promise.all()` for parallel batch loading across all relations
- For 1:many and many:many edges, use `.take(limit)` or `.paginate()` - default fetches ALL related records
- Many:many edges don't support `.filter()` or `.search()` - must filter in memory
- Use `.withIndex()` on the edge field for efficient lookups

**Performance consideration:**
Without parallel loading, querying 100 users with posts becomes:
- 1 query for users (100 docs)
- 100 queries for posts (N+1 problem)
- Total: 101 queries

With `Promise.all()` batching:
- 1 query for users (100 docs)
- 1 query for all posts with `.withIndex('userId', q => q.in([...userIds]))`
- Total: 2 queries (50x reduction)

**Cardinality handling:**
- `'one'` cardinality: Return single doc or `null` if not found
- `'many'` cardinality: Return array (empty `[]` if no matches, never `null`)
- `optional: true`: For 'one' cardinality, field is nullable in types (`T | null`)

**Edge case: Empty relations**
```typescript
// User with no posts should return:
{ _id: '...', name: 'Alice', posts: [] }  // NOT posts: null
```

### 2. Nested Relations

**Approach:** Recursive relation loading with max depth limit

**Algorithm:**
```typescript
async _loadRelations(rows, withConfig, depth = 0) {
  if (!withConfig || depth > 3) return rows; // Max depth 3

  for (const [relationName, relationConfig] of Object.entries(withConfig)) {
    // Load current level
    const relatedRows = await this._loadRelationLevel(rows, relationName, relationConfig);

    // Recursively load nested relations
    if (relationConfig.with) {
      await this._loadRelations(relatedRows, relationConfig.with, depth + 1);
    }
  }

  return rows;
}
```

**Circular reference handling:**
- Max depth of 3 prevents infinite loops
- Convex Ents already detects circular references in schema (extractRelationsConfig.ts:126-183)

#### Research Insights: Depth Limiting Rationale

**Why max depth 3?**
Industry standard based on memory explosion calculations:
- Depth 1: 100 users = 100 docs
- Depth 2: 100 users × 5 posts = 500 docs (600 total)
- Depth 3: 100 users × 5 posts × 20 comments = 10,000 docs (10,600 total)
- Depth 4: 100 users × 5 posts × 20 comments × 30 replies = 300,000 docs (310,600 total) ❌

**At depth 4, document count explodes 30x vs depth 3.** Max depth 3 is safe for most use cases.

**Alternative: User-configurable depth**
```typescript
db.query.users.findMany({
  with: { posts: true },
  maxDepth: 5,  // Override default (future enhancement)
});
```
Decision: Defer to future milestone if user feedback demands it.

**Circular self-reference example:**
```typescript
// User → manager (User) → manager (User) → ...
// Stops at depth 3 automatically:
user.manager?.manager?.manager  // Depth 3 reached, no further loading
```

**Performance consideration:**
Nested relations still use parallel batch loading at each level:
- Level 1: Load all user posts in 1 query
- Level 2: Load all post comments in 1 query (batched across all posts)
- Level 3: Load all comment replies in 1 query (batched across all comments)
Total: 3 queries for 3-level nesting (not N×M×P queries)

### 3. Relation Filters/Limits

**Integration:** Reuse existing WHERE clause compilation from [packages/kitcn/src/orm/query.ts](../../packages/kitcn/src/orm/query.ts)

**Key methods to reuse:**
- `_createColumnProxies()` - Wrap columns for WHERE clause
- `_createOperators()` - Provide eq/gt/lt/etc operators
- `_toConvexExpression()` - Convert FilterExpression to Convex filter function
- `_applyFilterToQuery()` - Apply single filter to query builder

**Algorithm:**
```typescript
async _loadRelationLevel(rows, relationName, relationConfig) {
  const edge = this.edgeMetadata.find(e => e.edgeName === relationName);

  // Batch load with index
  let query = this.db
    .query(edge.targetTable)
    .withIndex(edge.indexName, q => q.in(relatedIds));

  // Apply WHERE filter if provided
  if (relationConfig.where) {
    query = this._applyFilterToQuery(query, relationConfig.where);
  }

  // Apply ORDER BY if provided
  if (relationConfig.orderBy) {
    query = this._applyOrderBy(query, relationConfig.orderBy);
  }

  let relatedRecords = await query.collect();

  // Apply LIMIT per parent (not global limit)
  if (relationConfig.limit) {
    relatedRecords = this._groupByParent(relatedRecords, edge.fieldName)
      .flatMap(group => group.slice(0, relationConfig.limit));
  }

  return relatedRecords;
}
```

**Per-parent limiting:** Group relation results by parent ID, then apply limit to each group independently. This ensures consistent result counts (e.g., "5 posts per user" not "5 posts total").

#### Research Insights: Per-Parent vs Global Limits

**Why per-parent limiting matters:**

**Global limit (WRONG):**
```typescript
// Query: Get 5 most recent posts per user
const users = await db.query.users.findMany({
  with: {
    posts: {
      orderBy: desc(posts._creationTime),
      limit: 5,  // Intended: 5 per user
    },
  },
});

// With global limit, results are unpredictable:
// User 1: 5 posts ✓
// User 2: 0 posts ❌ (all 5 were from User 1)
// User 3: 0 posts ❌
```

**Per-parent limit (CORRECT):**
```typescript
// Group by parent first, then limit each group:
const grouped = groupBy(posts, 'userId');
for (const [userId, userPosts] of Object.entries(grouped)) {
  grouped[userId] = userPosts.slice(0, 5);  // 5 per user
}

// Results:
// User 1: 5 posts ✓
// User 2: 5 posts ✓
// User 3: 5 posts ✓
```

**Implementation detail:**
```typescript
_groupByParent(records: any[], parentField: string): Record<string, any[]> {
  return records.reduce((acc, record) => {
    const parentId = record[parentField];
    if (!acc[parentId]) acc[parentId] = [];
    acc[parentId].push(record);
    return acc;
  }, {} as Record<string, any[]>);
}
```

**Filter optimization:**
- Apply filters DURING batch load (use `.filter()` on query), not after `.collect()`
- Reduces documents transferred over network
- Leverages Convex's query optimizer
- For many:many edges: Must filter in memory (Convex Ents limitation)

**Edge case: Empty results after filter**
```typescript
// User has 10 posts but 0 published → returns empty array
{ _id: '...', name: 'Alice', posts: [] }  // Not null, not undefined
```

### 4. Cursor Pagination

**New method:** Add `.paginate()` to RelationalQueryBuilder class

**File:** [packages/kitcn/src/orm/query-builder.ts:52-64](../../packages/kitcn/src/orm/query-builder.ts#L52-64) (add after findMany)

**Implementation:**
```typescript
paginate(config: { cursor: string | null; numItems: number }) {
  const query = this.db.query(this.tableName);

  // Apply WHERE filters
  if (this.config.where) {
    this._applyWhereClause(query, this.config.where);
  }

  // Apply ORDER BY (required for cursor pagination)
  if (this.config.orderBy) {
    this._applyOrderBy(query, this.config.orderBy);
  } else {
    // Default: order by _creationTime desc
    query = query.order('desc');
  }

  // Use Convex native paginate
  return query.paginate({
    cursor: config.cursor,
    numItems: config.numItems,
  });
}
```

**Return type:** `{ page: T[], continueCursor: string | null, isDone: boolean }`

**Type safety:**
- Cursor values use `GetColumnData<TBuilder, 'raw'>` mode (base type without null)
- This prevents null in cursor comparisons (learning: select-ts-type-inference)

#### Research Insights: O(1) vs O(n) Performance

**Offset pagination (current - slow for deep pages):**
```typescript
// Page 1: Skip 0, read 20 docs
const page1 = await db.query.users.findMany({ offset: 0, limit: 20 });

// Page 100: Skip 1980 docs, read 20 docs
const page100 = await db.query.users.findMany({ offset: 1980, limit: 20 });
// ❌ O(n) - must read and discard 1980 docs to reach page 100
```

**Cursor pagination (new - constant time):**
```typescript
// Page 1: Start from beginning
const result1 = await db.query.users.paginate({ cursor: null, numItems: 20 });
// ✓ O(1) - reads exactly 20 docs

// Page 100: Start from cursor
const result100 = await db.query.users.paginate({
  cursor: result99.continueCursor,
  numItems: 20,
});
// ✓ O(1) - reads exactly 20 docs (no skip overhead)
```

**Performance comparison:**
| Page | Offset (O(n)) | Cursor (O(1)) | Speedup |
|------|---------------|---------------|---------|
| 1    | 20 docs read  | 20 docs read  | 1x      |
| 10   | 200 docs read | 20 docs read  | 10x     |
| 100  | 2000 docs read| 20 docs read  | 100x    |
| 1000 | 20000 docs read| 20 docs read | 1000x   |

**Cursor stability guarantees:**
- Convex cursors encode `_creationTime` + `_id` (immutable fields)
- Cursors remain valid even if new documents are inserted
- Replaying same cursor returns same results (idempotent)
- No "page drift" where items appear/disappear between pages

**Default ordering rationale:**
- `_creationTime desc` ensures stable ordering (all docs have this field)
- Newer items first (common UX pattern for feeds, logs, activity)
- If custom `orderBy` provided, respects user preference

**Edge cases:**
- `cursor: null` → Start from beginning (first page)
- `isDone: true` → No more pages available
- `continueCursor: null` and `isDone: true` → Last page reached
- Empty result set → `{ page: [], continueCursor: null, isDone: true }`

**Typical usage pattern:**
```typescript
// Infinite scroll implementation
let cursor = null;
let allItems = [];

while (true) {
  const { page, continueCursor, isDone } = await db.query.users.paginate({
    cursor,
    numItems: 50,
  });

  allItems.push(...page);
  if (isDone) break;

  cursor = continueCursor;
}
```

## Implementation Patterns & Best Practices

### Pattern 1: Batch Loading with Promise.all()

**Code pattern:**
```typescript
async _loadRelations(rows, withConfig, depth = 0) {
  if (!withConfig || depth > 3) return rows;

  // Load ALL relations in parallel (avoid N+1)
  await Promise.all(
    Object.entries(withConfig).map(async ([relationName, relationConfig]) => {
      const relatedRows = await this._loadRelationLevel(
        rows,
        relationName,
        relationConfig
      );

      // Map results back to parent rows
      for (const row of rows) {
        row[relationName] = this._getRelatedForParent(row, relatedRows, edge);
      }

      // Recursively load nested relations
      if (relationConfig.with) {
        await this._loadRelations(relatedRows, relationConfig.with, depth + 1);
      }
    })
  );

  return rows;
}
```

**Why Promise.all():**
- Loads all relations in parallel (not sequential)
- For 3 relations: 1 query time (not 3× query time)
- Critical for performance with multiple `with` clauses

### Pattern 2: Index-Based Batch Queries

**Code pattern:**
```typescript
async _loadRelationLevel(rows, relationName, relationConfig) {
  const edge = this.edgeMetadata[relationName];

  // Collect all parent IDs
  const parentIds = rows.map(row => row[edge.fieldName]).filter(id => id !== null);

  // Single batch query with index
  const relatedRecords = await this.db
    .query(edge.targetTable)
    .withIndex(edge.indexName, q => q.in(parentIds))  // Batch load
    .filter(record => {
      // Apply WHERE clause if provided
      if (relationConfig.where) {
        return this._evaluateFilter(record, relationConfig.where);
      }
      return true;
    })
    .collect();

  return relatedRecords;
}
```

**Why .withIndex():**
- Uses Convex's optimized index lookups
- Single query instead of N queries
- Index on FK field required (edge configuration)

### Pattern 3: Group-By for Per-Parent Operations

**Code pattern:**
```typescript
_getRelatedForParent(parentRow, relatedRecords, edge) {
  const parentId = parentRow[edge.sourceField];

  // Filter related records for this parent
  let related = relatedRecords.filter(
    record => record[edge.targetField] === parentId
  );

  // Apply ORDER BY
  if (edge.orderBy) {
    related = this._sortRecords(related, edge.orderBy);
  }

  // Apply LIMIT per parent (not global)
  if (edge.limit) {
    related = related.slice(0, edge.limit);
  }

  // Return based on cardinality
  if (edge.cardinality === 'one') {
    return related[0] ?? null;  // Single doc or null
  } else {
    return related;  // Array (possibly empty)
  }
}
```

**Why per-parent filtering:**
- Ensures consistent results (5 posts per user, not 5 total)
- Limits apply independently to each parent
- Empty results return `[]` for arrays, `null` for single relations

### Pattern 4: Type-Safe Relation Results

**Code pattern:**
```typescript
// Use GetColumnData with correct mode
type RelationResult<TColumn, TCardinality> = TCardinality extends 'one'
  ? GetColumnData<TColumn, 'query'> | null  // Nullable for optional edges
  : Array<GetColumnData<TColumn, 'query'>>;  // Array for 1:many

// Apply Merge to preserve phantom brands
type QueryWithRelations<TBase, TRelations> = Simplify<
  Merge<TBase, TRelations>
>;

// Avoid intersection types (loses GenericId brands)
// ❌ WRONG: TBase & TRelations
// ✅ CORRECT: Merge<TBase, TRelations>
```

**Why GetColumnData 'query' mode:**
- Includes `| null` for nullable fields (correct for results)
- Excludes `| null` in 'raw' mode (correct for filters/cursors)
- See learning: select-ts-type-inference-drizzle-patterns

**Why Merge utility:**
- Preserves GenericId phantom brands
- Intersection types strip brands during flattening
- See learning: phantom-type-brand-preservation

### Pattern 5: Recursive Depth Limiting

**Code pattern:**
```typescript
async _loadRelations(rows, withConfig, depth = 0) {
  // Max depth check (prevents infinite recursion)
  if (!withConfig || depth > 3) {
    if (depth > 3) {
      console.warn(`Max relation depth (3) exceeded, stopping at depth ${depth}`);
    }
    return rows;
  }

  // Load current level
  await this._loadCurrentLevel(rows, withConfig);

  // Recursively load nested relations
  for (const [relationName, relationConfig] of Object.entries(withConfig)) {
    if (relationConfig.with) {
      const relatedRows = rows.flatMap(row => row[relationName] || []);
      await this._loadRelations(relatedRows, relationConfig.with, depth + 1);
    }
  }

  return rows;
}
```

**Why depth limiting:**
- Prevents infinite loops in circular references
- Prevents memory explosion (depth 4 = 30x docs vs depth 3)
- Industry standard: max depth 3

### Pattern 6: Cursor Pagination with Stable Ordering

**Code pattern:**
```typescript
paginate(config: { cursor: string | null; numItems: number }) {
  let query = this.db.query(this.tableName);

  // Apply filters
  if (this.config.where) {
    query = this._applyFilters(query, this.config.where);
  }

  // Ordering REQUIRED for cursor stability
  if (this.config.orderBy) {
    query = this._applyOrderBy(query, this.config.orderBy);
  } else {
    // Default: _creationTime (immutable, always present)
    query = query.order('desc');
  }

  // Convex native pagination (O(1) performance)
  return query.paginate({
    cursor: config.cursor,
    numItems: config.numItems,
  });
}
```

**Why default ordering:**
- `_creationTime` is immutable (stable cursors)
- Always present (no null handling needed)
- Descending order (newest first - common UX pattern)

**Cursor stability:**
- Convex cursors encode `_creationTime` + `_id`
- Both fields immutable → cursor always valid
- Replaying cursor returns identical results

## Implementation Phases

### Phase 1: Basic One-Level Relation Loading (5-7 days)

**Goal:** Implement `_loadRelations()` for simple one-level relations

**Files to modify:**
- [packages/kitcn/src/orm/query.ts:633-641](../../packages/kitcn/src/orm/query.ts#L633-641) - Implement _loadRelations
- [packages/kitcn/src/orm/query.ts:335](../../packages/kitcn/src/orm/query.ts#L335) - Verify integration point

**Implementation steps:**
1. Extract relation name → EdgeMetadata mapping
2. Collect all parent IDs (row[edge.fieldName])
3. Batch load related records: `db.query(edge.targetTable).withIndex(edge.indexName, q => q.in(parentIds))`
4. Group by parent: `groupBy(relatedRecords, edge.referenceField)`
5. Map back to rows: `row[relationName] = groupedRecords[row[edge.fieldName]] ?? (cardinality === 'one' ? null : [])`

**Handle cardinality:**
- `'one'`: Return single doc or null
- `'many'`: Return array (empty if no matches)

**Testing:**
- Enable [convex/test-types/db-rel.ts:52-80](../../convex/test-types/db-rel.ts#L52-80) (Test 1: Basic findMany with relations)
- Create `/convex/orm/relation-loading.test.ts` with convex-test
- 5-7 runtime tests: one-to-many, many-to-one, optional edges, batch loading efficiency

**Validation:**
- `bun typecheck` passes
- `bun run test` passes
- db-rel.ts Test 1 type assertion passes

### Phase 2: Nested Relations (3-4 days)

**Goal:** Support `with: { posts: { with: { comments: true } } }`

**Files to modify:**
- [packages/kitcn/src/orm/query.ts:633-641](../../packages/kitcn/src/orm/query.ts#L633-641) - Add recursive call
- No new files (extend _loadRelations method)

**Implementation steps:**
1. Add `depth` parameter to `_loadRelations(rows, withConfig, depth = 0)`
2. Max depth check: `if (depth > 3) return rows`
3. After loading relation level, check for nested `with` config
4. Recursively call: `await this._loadRelations(relatedRows, relationConfig.with, depth + 1)`
5. Handle circular references (already detected in schema by convex-ents)

**Testing:**
- Enable [convex/test-types/db-rel.ts:82-121](../../convex/test-types/db-rel.ts#L82-121) (Test 2: Nested relations)
- Add runtime tests: 2-level nesting, 3-level nesting, max depth enforcement, circular detection
- 4-6 runtime tests total

**Validation:**
- `bun typecheck` passes
- `bun run test` passes
- db-rel.ts Test 2 type assertion passes

### Phase 3: Relation Filters & Limits (4-5 days)

**Goal:** Apply WHERE, ORDER BY, LIMIT to relations

**Files to modify:**
- [packages/kitcn/src/orm/query.ts:633-641](../../packages/kitcn/src/orm/query.ts#L633-641) - Add _loadRelationLevel helper
- Extract helper methods from existing WHERE clause compiler

**Implementation steps:**
1. Create `_loadRelationLevel(rows, relationName, relationConfig)` helper
2. Reuse `_applyFilterToQuery()` for WHERE clause (already exists)
3. Reuse `_applyOrderBy()` for ORDER BY (already exists)
4. Implement per-parent limiting:
   ```typescript
   const groupedByParent = groupBy(relatedRecords, edge.fieldName);
   for (const [parentId, records] of Object.entries(groupedByParent)) {
     groupedByParent[parentId] = records.slice(0, relationConfig.limit);
   }
   ```

**Key insight:** LIMIT applies per parent, not globally. "5 posts per user" not "5 posts total".

**Testing:**
- Enable [convex/test-types/db-rel.ts:123-149](../../convex/test-types/db-rel.ts#L123-149) (Test 3: Column selection with relations)
- Add runtime tests: WHERE on relations, ORDER BY on relations, LIMIT per parent, combined filters
- 6-8 runtime tests total

**Validation:**
- `bun typecheck` passes
- `bun run test` passes
- db-rel.ts Test 3 type assertion passes

### Phase 4: Cursor Pagination (3-4 days)

**Goal:** Add `.paginate()` method with Convex-native O(1) performance

**Files to modify:**
- [packages/kitcn/src/orm/query-builder.ts](../../packages/kitcn/src/orm/query-builder.ts) - Add paginate method
- [packages/kitcn/src/orm/types.ts](../../packages/kitcn/src/orm/types.ts) - Add PaginatedResult type if needed

**Implementation steps:**
1. Add method to RelationalQueryBuilder after findMany (line ~65):
   ```typescript
   paginate(config: { cursor: string | null; numItems: number }) {
     // Create query with WHERE + ORDER BY
     // Call Convex native .paginate()
     // Return { page, continueCursor, isDone }
   }
   ```
2. Default ORDER BY to `_creationTime desc` if not specified
3. Type cursor values with `GetColumnData<TBuilder, 'raw'>` (base type, no null)

**Testing:**
- Create new `/convex/test-types/pagination.ts` for cursor pagination types
- Add runtime tests in `/convex/orm/pagination.test.ts`:
  - Basic pagination (3 pages)
  - Empty results
  - Single page (isDone: true)
  - With WHERE filters
  - With ORDER BY
  - Cursor stability (same results on replay)
- 8-10 runtime tests total

**Validation:**
- `bun typecheck` passes
- `bun run test` passes
- All pagination.ts type assertions pass

### Phase 5: Enable Deferred Type Tests (1-2 days)

**Goal:** Uncomment all TODO(Phase 4) tests in db-rel.ts

**Files to modify:**
- [convex/test-types/db-rel.ts](../../convex/test-types/db-rel.ts) - Remove TODO comments

**Tests to enable:**
- Test 1: Basic findMany with relations (line 52-80)
- Test 2: Nested relations (line 82-121)
- Test 3: Column selection with relations (line 123-149)
- Test 4: One relation nullable (line 151-179)
- Test 5: Self-referential relations (line 181-209)
- Test 6: Many-to-many through join table (line 211-247)
- Test 7: findFirst with relations (line 249-277)

**Implementation steps:**
1. Remove `// TODO(Phase 4):` comment lines
2. Uncomment test blocks
3. Run `bun typecheck` to verify all assertions pass
4. Update README.md progress (126 → 133-138 assertions)

**Validation:**
- All 7 relation loading type tests pass
- `bun typecheck` passes with 0 errors
- README.md updated with new assertion count

### Phase 6: Documentation & Examples (1-2 days)

**Goal:** Update docs to reflect M6.5 completion

**Files to modify:**
- [www/content/docs/orm/limitations.mdx](../../www/content/docs/orm/limitations.mdx) - Move features from "Coming Soon" to "Implemented"
- [www/content/docs/orm/index.mdx](../../www/content/docs/orm/index.mdx) - Update feature compatibility list
- Create [www/content/docs/orm/pagination.mdx](../../www/content/docs/orm/pagination.mdx) - Cursor vs offset guide
- [convex/test-types/README.md](../../convex/test-types/README.md) - Reference M6.5 completion

**Content updates:**
- limitations.mdx: ✅ Relation loading (M6.5), ✅ Cursor pagination (M6.5)
- index.mdx: Update Category 1 + Category 3 feature lists
- pagination.mdx: Explain O(1) cursor vs O(n) offset, code examples
- README.md: Note M6.5 adds 7-12 type assertions (→ 90% parity)

**Validation:**
- Docs build without errors: `cd www && bun run build`
- All internal links work

## Testing Strategy

### Type Testing (convex/test-types/)

**Methodology:** Follow [convex/test-types/README.md](../../convex/test-types/README.md) established patterns

**Enable 7 deferred tests from db-rel.ts:**
1. Basic findMany with relations (one-to-many)
2. Nested relations (2-3 levels deep)
3. Column selection with relations
4. One relation nullable (many-to-one optional)
5. Self-referential relations
6. Many-to-many through join table
7. findFirst with relations

**Add new pagination.ts tests:**
1. Paginate result type (`{ page, continueCursor, isDone }`)
2. Cursor type (string | null)
3. numItems parameter (number)
4. Empty result page type
5. Combined with filters type inference

**Pattern to follow:**
```typescript
import { Expect, Equal } from './utils';
import { GenericId } from 'convex/values';

{
  const mockDb = {} as any; // Mock database (type-only test)

  const result = await mockDb.query.users.findMany({
    with: {
      posts: {
        where: (post, { eq }) => eq(post.published, true),
        limit: 5,
      },
    },
  });

  type Expected = Array<{
    _id: GenericId<'users'>;
    name: string;
    posts: Array<{
      _id: GenericId<'posts'>;
      title: string;
      published: boolean;
    }>;
  }>;

  Expect<Equal<typeof result, Expected>>;
}
```

**Target:** 133-138 total assertions (90% toward 65% Drizzle parity)

### Runtime Testing (convex/orm/)

**Create new test files:**
- `/convex/orm/relation-loading.test.ts` (~20 tests)
- `/convex/orm/pagination.test.ts` (~10 tests)

**Follow convex-test pattern from where-filtering.test.ts:**
```typescript
import { convexTest } from 'convex-test';
import { test, expect } from 'vitest';
import schema from './schema';

test('loads one-to-many relations', async () => {
  const t = convexTest(schema);

  // Setup: Create user with posts
  await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', { name: 'Alice', email: 'alice@example.com' });
    await ctx.db.insert('posts', { title: 'Post 1', userId });
    await ctx.db.insert('posts', { title: 'Post 2', userId });
  });

  // Test: Load user with posts
  await t.run(async (ctx) => {
    const db = createDatabase(ctx.db, schema, edges);
    const users = await db.query.users.findMany({
      with: { posts: true },
    });

    expect(users).toHaveLength(1);
    expect(users[0].posts).toHaveLength(2);
    expect(users[0].posts[0].title).toBe('Post 1');
  });
});
```

#### Research Insights: convex-test Best Practices

**Context injection pattern:**
```typescript
// ✅ CORRECT: Use project's convexTest wrapper with runCtx
import { convexTest, runCtx } from './setup.testing';

test('example', async () => {
  const t = convexTest(schema);
  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);  // Wraps with kitcn helpers

    const userId = await ctx.table('users').insert({ name: 'Alice' });
    const user = await ctx.table('users').getX(userId);
    expect(user.name).toEqual('Alice');
  });
});

// ❌ WRONG: Using baseConvexTest or missing runCtx
import { convexTest as baseConvexTest } from 'convex-test';
const t = baseConvexTest(schema);  // Missing project wrapper
```

**Edge traversal testing:**
```typescript
// Test edge methods with convex-test
test('edge traversal', async () => {
  const t = convexTest(schema);
  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);

    const userId = await ctx.table('users').insert({ name: 'Alice' });
    const postId = await ctx.table('posts').insert({ title: 'Post', userId });

    // Test edge navigation
    const user = await ctx.table('users').getX(userId);
    const posts = await user.edge('posts');  // 1:many edge
    expect(posts).toHaveLength(1);

    const post = await ctx.table('posts').getX(postId);
    const author = await post.edge('author');  // many:1 edge
    expect(author?.name).toBe('Alice');
  });
});
```

**Rules and skipRules:**
```typescript
// Use ctx.skipRules for test data setup that violates rules
test('rules enforcement', async () => {
  const t = convexTest(schema);
  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);

    // Setup: Create test data that violates rules
    const adminId = await ctx.skipRules.table('users').insert({
      name: 'Admin',
      role: 'admin',  // Rule: Only admins can set role
    });

    // Test: Verify rules are enforced in actual test
    await expect(
      ctx.table('users').insert({ name: 'Hacker', role: 'admin' })
    ).rejects.toThrow('Unauthorized');
  });
});
```

**Scheduled function testing:**
```typescript
import { vi } from 'vitest';

test('scheduled cleanup', async () => {
  vi.useFakeTimers();  // Required for scheduled functions

  const t = convexTest(schema);
  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);

    // Schedule cleanup
    await ctx.scheduler.runAfter(1000, api.cleanupOldPosts, {});

    // Advance time
    vi.advanceTimersByTime(1000);

    // Verify cleanup ran
    const posts = await ctx.table('posts').collect();
    expect(posts).toHaveLength(0);
  });

  vi.useRealTimers();  // Cleanup
});
```

**Common mistakes to avoid:**
- Using `baseConvexTest` directly instead of `convexTest` from setup.testing
- Not wrapping `baseCtx` with `runCtx(baseCtx)`
- Missing `schema` import when calling `convexTest(schema)`
- Forgetting `vi.useFakeTimers()` for scheduled function tests
- Not cleaning up with `vi.useRealTimers()` after fake timers

**Test coverage:**

**relation-loading.test.ts:**
- Basic one-to-many loading
- Many-to-one (nullable) loading
- Nested relations (user → posts → comments)
- Relation filters (WHERE)
- Relation ordering (ORDER BY)
- Relation limits (LIMIT per parent)
- Empty relations (no matches)
- Optional edges (return null)
- Self-referential relations
- Many-to-many via join table
- Batch loading (no N+1 verification)
- Max depth enforcement (3 levels)
- Circular reference handling

**pagination.test.ts:**
- Basic cursor pagination (3 pages)
- Empty first page
- Single page (isDone: true)
- Pagination with WHERE
- Pagination with ORDER BY
- Cursor stability (replay returns same results)
- Large result sets (100+ items)
- Default ordering (_creationTime desc)
- Null cursor (first page)
- continueCursor round-trip

**Performance benchmarks:**
- Relation loading: No N+1 queries (verify with Convex dashboard logs)
- Cursor pagination: O(1) performance for page 100+ (vs O(n) for offset)
- Nested relations: Max depth 3 supported without stack overflow

## Performance Benchmarks & Validation

### N+1 Query Prevention

**Verification method:** Use Convex dashboard logs to count queries

**Baseline (without optimization):**
```
Query 100 users with posts:
- 1 query: users.findMany() → 100 users
- 100 queries: posts.findMany({ where: userId === ... }) → N+1 problem
Total: 101 queries
```

**Target (with Promise.all batching):**
```
Query 100 users with posts:
- 1 query: users.findMany() → 100 users
- 1 query: posts.withIndex('userId').in([...userIds]) → batched
Total: 2 queries (50x improvement)
```

**Acceptance criteria:**
- ✅ 2 queries for one-level relation loading (100 users with posts)
- ✅ 3 queries for two-level nesting (users → posts → comments)
- ✅ 4 queries for three-level nesting (users → posts → comments → replies)
- ❌ FAIL if query count scales with number of parent docs (N+1 detected)

### Cursor Pagination Performance

**Benchmark setup:** 10,000 documents in users table

**Offset pagination (baseline):**
| Page | Docs Read | Time (ms) | Notes |
|------|-----------|-----------|-------|
| 1    | 20        | ~5ms      | Fast (first page) |
| 10   | 200       | ~20ms     | Starting to slow |
| 100  | 2000      | ~150ms    | Noticeable lag |
| 1000 | 20000     | ~1500ms   | Unacceptable (1.5s) |

**Cursor pagination (target):**
| Page | Docs Read | Time (ms) | Notes |
|------|-----------|-----------|-------|
| 1    | 20        | ~5ms      | Same as offset |
| 10   | 20        | ~5ms      | Constant time ✓ |
| 100  | 20        | ~5ms      | Constant time ✓ |
| 1000 | 20        | ~5ms      | Constant time ✓ |

**Acceptance criteria:**
- ✅ Page 100 takes <10ms (vs ~150ms with offset)
- ✅ Page 1000 takes <10ms (vs ~1500ms with offset)
- ✅ Time remains constant regardless of page number
- ✅ Cursor replays return identical results (idempotency)

### Nested Relation Depth

**Memory explosion test:** Create deeply nested schema

```typescript
// Schema:
// users → posts → comments → replies
// 100 users × 5 posts × 20 comments × 30 replies

// Depth 1: 100 docs (users)
// Depth 2: 600 docs (users + posts)
// Depth 3: 10,600 docs (users + posts + comments)
// Depth 4: 310,600 docs (users + posts + comments + replies) ❌
```

**Acceptance criteria:**
- ✅ Depth 3 completes without stack overflow (<15s for 10,600 docs)
- ✅ Depth 4 blocked by max depth limit (returns depth 3 results)
- ✅ Circular references detected and prevented
- ✅ Max depth configurable (future enhancement)

### Per-Parent Limiting

**Test scenario:** 10 users, each with 100 posts, limit 5 posts per user

**Global limit (incorrect behavior):**
```
Results:
- User 1: 5 posts ✓
- User 2-10: 0 posts ❌ (all 5 from User 1)
Total: 5 posts (incorrect)
```

**Per-parent limit (correct behavior):**
```
Results:
- User 1: 5 posts ✓
- User 2: 5 posts ✓
- ...
- User 10: 5 posts ✓
Total: 50 posts (correct - 5 per user)
```

**Acceptance criteria:**
- ✅ Each parent gets exactly `limit` items (or fewer if less available)
- ✅ No parent starved due to other parents consuming limit
- ✅ Empty parents still return `[]` (not skipped)

## Success Criteria

**M6.5 is complete when:**

✅ **Runtime complete:**
- Relation loading runtime works (one-level and nested)
- Relation filters/limits apply correctly
- Cursor pagination API implemented
- Max depth 3 for nested relations enforced

✅ **Type tests passing:**
- All 7 deferred relation loading type tests enabled and passing (db-rel.ts)
- All new cursor pagination type tests passing (pagination.ts)
- `bun typecheck` passes with 0 errors

✅ **Runtime tests passing:**
- relation-loading.test.ts: 20+ tests passing
- pagination.test.ts: 10+ tests passing
- `bun run test` passes (all vitest tests)

✅ **Documentation updated:**
- limitations.mdx: Relation loading + cursor pagination marked as implemented
- index.mdx: Feature compatibility list updated
- pagination.mdx: New guide created
- README.md in convex/test-types/ references M6.5 completion

✅ **Package validation:**
- `bun --cwd packages/kitcn build` succeeds
- `touch example/convex/functions/schema.ts` triggers rebuild
- No type regressions introduced

**Performance benchmarks:**
- Relation loading: No N+1 queries (verify with Convex dashboard logs)
- Cursor pagination: O(1) performance for page 100+ (vs O(n) for offset)
- Nested relations: Max depth 3 supported without stack overflow

## File Changes

### Core Implementation

**packages/kitcn/src/orm/query.ts:**
- Line 633-641: Implement `_loadRelations()` method (currently stubbed)
- Line ~645-700: Add `_loadRelationLevel()` helper method (new)
- Line 335: Verify integration point (already calls _loadRelations)
- Reuse existing methods: `_applyFilterToQuery()`, `_createOperators()`, `_toConvexExpression()`

**packages/kitcn/src/orm/query-builder.ts:**
- Line ~65: Add `.paginate(config)` method after findMany
- Integrate with existing WHERE/ORDER BY compilation

**packages/kitcn/src/orm/types.ts:**
- No changes expected (type inference already complete)
- Verify `BuildQueryResult` and `BuildRelationResult` handle all cases
- May need PaginatedResult type if not already defined

### Testing

**convex/test-types/db-rel.ts:**
- Remove `// TODO(Phase 4):` comments
- Uncomment lines 52-277 (7 relation loading tests)

**convex/test-types/pagination.ts:** (new file)
- 5-7 type assertions for cursor pagination

**convex/orm/relation-loading.test.ts:** (new file)
- ~20 runtime tests with convex-test

**convex/orm/pagination.test.ts:** (new file)
- ~10 runtime tests with convex-test

### Documentation

**www/content/docs/orm/limitations.mdx:**
- Move relation loading from "Coming Soon" to "Implemented (M6.5)"
- Move cursor pagination from "Coming Soon" to "Implemented (M6.5)"
- Update "Current Status" section

**www/content/docs/orm/index.mdx:**
- Update feature compatibility list (Category 1 + Category 3)
- Add cursor pagination to Convex-Native Advantages section

**www/content/docs/orm/pagination.mdx:** (new file)
- Explain cursor vs offset pagination
- Code examples for both approaches
- Performance characteristics (O(1) vs O(n))

**convex/test-types/README.md:**
- Update progress: 126 → 133-138 assertions
- Update target: 88% → 90%+ toward 65% Drizzle parity
- Note M6.5 completion

## Dependencies & Risks

### Dependencies

**Internal:**
- EdgeMetadata interface stable (extractRelationsConfig.ts)
- Query builder architecture stable (query.ts, query-builder.ts)
- Type inference complete (BuildQueryResult, BuildRelationResult)
- WHERE clause compiler reusable (FilterExpression, _toConvexExpression)
- convex-test harness available for runtime tests

**External:**
- Convex `.withIndex()` API for batch loading
- Convex `.paginate()` API for cursor pagination
- No new dependencies required

### Risks

**Risk 1: Batch loading performance**
- **Impact:** High
- **Mitigation:** Use `Promise.all()` for parallel loading, verify no N+1 with Convex dashboard
- **Fallback:** Dataloader pattern if Promise.all insufficient

**Risk 2: Type inference complexity**
- **Impact:** Medium
- **Mitigation:** Reuse existing BuildQueryResult/BuildRelationResult, apply Merge pattern from learnings
- **Fallback:** Simplify types if necessary (less strict inference)

**Risk 3: Nested relation depth limit**
- **Impact:** Low
- **Mitigation:** Max depth 3 prevents stack overflow, document limitation clearly
- **Fallback:** Make depth configurable via query option

**Risk 4: Relation filter performance**
- **Impact:** Medium
- **Mitigation:** Apply filters during batch load (index-level), not after
- **Fallback:** Post-filter if index-level not feasible

**Risk 5: Testing coverage gaps**
- **Impact:** Medium
- **Mitigation:** Follow M4.5 methodology, mirror Drizzle test patterns, use convex-test extensively
- **Fallback:** Add tests iteratively as edge cases discovered

## Open Questions

1. **Circular relation depth limit?**
   - **Proposed:** Max depth 3 for nested relations
   - **Alternative:** User-configurable depth limit via query option
   - **Decision:** Default max depth 3, expose `maxDepth` option in future if needed

2. **Relation loading performance strategy?**
   - **Proposed:** Batch load with `Promise.all()` to avoid N+1
   - **Alternative:** Dataloader pattern with request deduplication
   - **Decision:** Start with simple batch loading, optimize with dataloader if benchmarks show issues

3. **Cursor pagination ordering requirement?**
   - **Question:** Should cursor pagination require explicit `orderBy`?
   - **Proposed:** Default to `_creationTime desc` if no `orderBy` provided
   - **Alternative:** Throw error if no `orderBy` (stricter)
   - **Decision:** Default to `_creationTime desc` for convenience

4. **Column exclusion priority?**
   - **Question:** Should we implement `columns: { age: false }` in M6.5 or defer?
   - **Current decision:** Defer (low value, workaround exists: explicitly list included columns)
   - **Reconsider:** If user feedback demands it

## Next Steps

1. **Phase 1:** Implement basic one-level relation loading (~5-7 days)
2. **Phase 2:** Add nested relations with depth limiting (~3-4 days)
3. **Phase 3:** Implement relation filters and limits (~4-5 days)
4. **Phase 4:** Add cursor pagination (~3-4 days)
5. **Phase 5:** Enable all deferred type tests (~1-2 days)
6. **Phase 6:** Update documentation (~1-2 days)

**Total estimated timeline:** 2-3 weeks (17-25 days)

**After M6.5 complete:**
- → M7: Mutations (INSERT/UPDATE/DELETE)

## References

**Internal:**
- [Brainstorm Document](../../brainstorms/2026-02-03-m6.5-complete-query-support-brainstorm.md)
- [Type Testing Methodology](../../convex/test-types/README.md)
- [Original Drizzle ORM Brainstorm](../../brainstorms/2026-01-31-drizzle-orm-brainstorm.md)
- [Implementation Status Summary](../../brainstorms/2026-01-31-drizzle-orm-brainstorm.md#L1286-1509)

**Learnings:**
- [Select.ts Type Inference (GetColumnData Pattern)](../../docs/solutions/typescript-patterns/select-ts-type-inference-drizzle-patterns-20260202.md)
- [Phantom Type Brand Preservation (Merge Pattern)](../../docs/solutions/typescript-patterns/phantom-type-brand-preservation-20260202.md)
- [Schema Integration Pattern](../../docs/solutions/integration-issues/convex-table-schema-integration-20260202.md)
- [Test Deferral Methodology](../../docs/solutions/workflow-issues/type-testing-defer-unimplemented-features-20260202.md)

## Key Learnings Applied in This Plan

### From docs/solutions/typescript-patterns/select-ts-type-inference-drizzle-patterns-20260202.md

**GetColumnData utility with dual modes:**
- `'query'` mode: Includes `| null` for nullable fields (relation results, query output)
- `'raw'` mode: Excludes `| null` (filter operators, cursor values)

**Applied in:**
- Relation result types: `GetColumnData<TColumn, 'query'>` for nullable handling
- Cursor pagination: `GetColumnData<TColumn, 'raw'>` to prevent null in comparisons

### From docs/solutions/typescript-patterns/phantom-type-brand-preservation-20260202.md

**Merge<A, B> utility to preserve GenericId brands:**
- Problem: Intersection types (`A & B`) strip phantom type brands during TypeScript flattening
- Solution: Manual key merging with `Merge<A, B>` utility
- Result: GenericId brands preserved, no `never` types, notNull fields typed correctly

**Applied in:**
- `BuildQueryResult` type construction
- Combining base model with relation types
- All type inference that merges system fields with user columns

### From docs/solutions/workflow-issues/type-testing-defer-unimplemented-features-20260202.md

**Test deferral pattern for unimplemented features:**
- Comment out tests with `// TODO(Phase N): Enable once X implemented`
- Document deferred features in roadmap with implementation status
- Write tests AFTER implementation complete, not aspirationally

**Applied in:**
- Phase 5: Enable deferred type tests from db-rel.ts
- All 7 relation loading tests marked TODO during M3-M4
- Will be enabled once runtime implementation complete in M6.5

**External:**
- [Convex Pagination Docs](https://docs.convex.dev/database/pagination)
- [Drizzle Relations API](https://orm.drizzle.team/docs/rqb#with-select)
- Drizzle ORM repo (local): `/tmp/cc-repos/drizzle-orm`
- Convex Ents repo (reference): `/tmp/cc-repos/convex-ents`

**Key Files:**
- [packages/kitcn/src/orm/query.ts:633-641](../../packages/kitcn/src/orm/query.ts#L633-641) - _loadRelations stub
- [packages/kitcn/src/orm/extractRelationsConfig.ts:17-40](../../packages/kitcn/src/orm/extractRelationsConfig.ts#L17-40) - EdgeMetadata
- [packages/kitcn/src/orm/types.ts:392-442](../../packages/kitcn/src/orm/types.ts#L392-442) - BuildQueryResult
- [convex/test-types/db-rel.ts](../../convex/test-types/db-rel.ts) - Deferred relation tests
- [convex/orm/where-filtering.test.ts](../../convex/orm/where-filtering.test.ts) - Runtime test pattern
