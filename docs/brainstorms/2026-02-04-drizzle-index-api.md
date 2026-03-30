---
date: 2026-02-04
topic: drizzle-index-api
status: implemented
---

# Drizzle v1 Index API Migration

Migrate kitcn ORM index definitions from method chaining to Drizzle v1's builder pattern with extraConfig callback for maximum API parity and type safety.

## What We're Building

### Goal
Replace string-based index method chaining with Drizzle v1's type-safe builder pattern:

**Before (old syntax):**
```ts
export const posts = convexTable('posts', {
  text: text().notNull(),
  type: text().notNull(),
})
  .index('numLikesAndType', ['type', 'numLikes'])
  .searchIndex('text', { searchField: 'text', filterFields: ['type'] });
```

**After (Drizzle-style):**
```ts
export const posts = convexTable('posts', {
  text: text().notNull(),
  type: text().notNull(),
}, (t) => [
  index('numLikesAndType').on(t.type, t.numLikes),
  searchIndex('text').on(t.text).filter(t.type),
  vectorIndex('embedding').on(t.embedding).dimensions(1536).filter(t.type),
]);
```

### Key Improvements
1. **Type safety**: Column references (`t.field`) instead of string literals
2. **Drizzle parity**: Exact API match for standard indexes
3. **Natural extensions**: searchIndex/vectorIndex follow same builder pattern
4. **Better DX**: IDE autocomplete for columns, catch errors at compile time

## Why This Approach

### Decision: Full Migration to Drizzle v1 API

**Considered alternatives:**
- ❌ **Hybrid approach** - Support both old and new syntax (rejected - too confusing)
- ❌ **Enhanced current** - Keep `.index()` but make it type-safe (rejected - doesn't match Drizzle)
- ✅ **Full migration** - Pure Drizzle v1 + Convex extensions (chosen)

**Rationale:**
1. User explicitly chose "full migration" approach
2. Clean break - one clear way to define indexes
3. Maximizes Drizzle API compatibility
4. Natural extension pattern for Convex-specific features (search/vector)
5. TypeScript patterns mastered by Drizzle team (dig into their repo when needed)

### Research Foundation

**Drizzle v1 analysis** (see `/docs/drizzle-v1-index-*.md`):
- Builder pattern: `IndexBuilderOn` → `IndexBuilder` → `Index`
- Method chaining: `.on()` → `.where()` (future)
- Composite indexes: `index('name').on(t.col1, t.col2)`
- Unique indexes: `uniqueIndex('name').on(t.email)`
- Advanced features: partial indexes (`.where()`), expressions, column modifiers

**Convex-ents research** (via dig skill):
- Field-level uniqueness: `.field("email", v.string(), { unique: true })`
- Runtime enforcement with automatic index creation
- No index-level unique constraints (only field-level)
- Limitation: No composite unique indexes

**Convex native support:**
- ✅ Basic indexes (single and composite)
- ✅ Search indexes (full-text search)
- ✅ Vector indexes (embeddings)
- ❌ Unique index enforcement (accept syntax for parity, no enforcement)
- ❌ Partial indexes (no `.where()` support)
- ❌ Expression indexes (no computed columns)

## Key Decisions

### 1. Builder Pattern Architecture
**Decision:** Three-class builder chain matching Drizzle exactly

```ts
index(name)           // → ConvexIndexBuilderOn
  .on(...columns)     // → ConvexIndexBuilder
  .where(condition)   // → ConvexIndexBuilder (future)
```

**Why:** Exact Drizzle API match ensures TypeScript patterns work identically

### 2. extraConfig Callback Signature
**Decision:** Accept both array and object returns (array preferred)

```ts
convexTable('posts', {
  // columns
}, (t) => [
  index('idx').on(t.field),  // Array return (recommended)
])

// Also accepts object for flexibility
(t) => ({
  idx: index('idx').on(t.field),
})
```

**Why:** Array matches Drizzle v1 new API, object provides fallback compatibility

### 3. Unique Index Handling
**Decision:** Accept `uniqueIndex()` syntax but no enforcement (yet)

```ts
uniqueIndex('email_unique').on(t.email)  // Creates regular index
```

**Implementation in [table.ts:144-146](packages/kitcn/src/orm/table.ts#L144-L146):**
```ts
if (unique) {
  // Convex does not enforce unique indexes, but we accept the syntax for Drizzle parity.
}
```

**Why:**
- Drizzle API parity (uniqueIndex exists in Drizzle)
- Future-proof (if Convex adds unique support)
- Documents intent in schema
- Can add runtime enforcement later (like convex-ents)

### 4. Convex Extension Pattern
**Decision:** Extend Drizzle pattern for search/vector indexes

```ts
// Standard Drizzle (exact match)
index('name').on(t.field)
uniqueIndex('email').on(t.email)

// Convex extensions (following same pattern)
searchIndex('search').on(t.field).filter(t.otherField)
vectorIndex('vec').on(t.embedding).dimensions(1536).filter(t.type)
```

**Why:**
- Consistent builder pattern across all index types
- Natural "what would Drizzle do?" extension
- Type-safe column references throughout
- Clear documentation: "Drizzle v1 + these Convex-specific builders"

### 5. Error Handling Strategy
**Decision:** Fail fast with helpful errors

**Implemented checks in [table.ts:129-165](packages/kitcn/src/orm/table.ts#L129-L165):**
```ts
// Forgot to call .on()
if (isConvexIndexBuilderOn(entry)) {
  throw new Error(`Did you forget to call .on(...)?`);
}

// Partial indexes not supported
if (where) {
  throw new Error(`Convex does not support partial indexes. Remove .where(...)`);
}

// Wrong table columns
if (tableName && tableName !== table.tableName) {
  throw new Error(`Index references column from '${tableName}', but belongs to '${table.tableName}'`);
}
```

**Why:** Clear error messages prevent confusion and guide users to correct syntax

## Implementation Status

### ✅ Phase 1: Basic Indexes (COMPLETED)

**Files created/modified:**
- ✅ [packages/kitcn/src/orm/indexes.ts](packages/kitcn/src/orm/indexes.ts) - Builder classes
- ✅ [packages/kitcn/src/orm/table.ts](packages/kitcn/src/orm/table.ts) - extraConfig integration
- ✅ [convex/schema.ts](convex/schema.ts) - Example usage

**Implemented:**
```ts
// Export functions
export function index(name: string): ConvexIndexBuilderOn
export function uniqueIndex(name: string): ConvexIndexBuilderOn

// Builder classes
class ConvexIndexBuilderOn {
  on(...columns): ConvexIndexBuilder
}

class ConvexIndexBuilder {
  config: ConvexIndexConfig
  where(condition): this  // Accepts but errors at runtime
}

// Types
interface ConvexIndexConfig {
  name: string;
  columns: ConvexIndexColumn[];
  unique: boolean;
  where?: unknown;
}
```

**Usage example from [schema.ts:45](convex/schema.ts#L45):**
```ts
export const posts = convexTable(
  'posts',
  { text: text().notNull(), type: text().notNull() },
  (t) => [index('numLikesAndType').on(t.type, t.numLikes)]
);
```

### 🚧 Phase 2: Convex Extensions (IN PROGRESS)

**Remaining work:**

1. **searchIndex() builder**
   ```ts
   searchIndex(name)
     .on(searchField)           // Required: which field to search
     .filter(...filterFields)   // Optional: equality filters
   ```

2. **vectorIndex() builder**
   ```ts
   vectorIndex(name)
     .on(vectorField)           // Required: embedding field
     .dimensions(n)             // Required: vector dimensions
     .filter(...filterFields)   // Optional: equality filters
   ```

3. **Update schema.ts**
   - Replace `.searchIndex()` method with builder syntax
   - Current: `posts.searchIndex('text', { searchField: 'text', filterFields: ['type'] })`
   - Target: `searchIndex('text').on(t.text).filter(t.type)`

### 📋 Phase 3: Documentation & Migration (TODO)

- [ ] Update ORM docs with new index API
- [ ] Create migration guide from old to new syntax
- [ ] Add type tests for index builders
- [ ] Add runtime tests for all index types
- [ ] Examples in README

## Open Questions

### 1. searchIndex/vectorIndex API Design

**Current thinking:**
```ts
searchIndex('name')
  .on(t.searchField)        // Single field (search target)
  .filter(t.field1, t.field2)  // Multiple fields (equality filters)
```

**Alternative:**
```ts
searchIndex('name')
  .on(t.searchField, { filterFields: [t.field1, t.field2] })  // Config object
```

**Question:** Should `.filter()` be a separate method or part of `.on()` config?

**Recommendation:** Separate `.filter()` method for consistency with potential future Drizzle patterns

**Decision:** Keep `.filter()` as a separate method (implemented).

### 2. Backward Compatibility

**Question:** Should we keep the old `.index(name, fields)` method during transition?

**Current decision:** No - full migration means removing old API. Users update schemas in one pass.

**Decision:** Old chainable index/search/vector methods removed; runtime throws with builder guidance.

**Trade-off:**
- ✅ Clean codebase, one clear way
- ❌ Breaking change requires migration effort

### 3. Runtime Unique Enforcement

**Question:** Should we add convex-ents-style runtime unique checking?

**Options:**
1. **No enforcement** - uniqueIndex() is documentation only
2. **Opt-in enforcement** - `.uniqueIndex(name, { enforce: true })`
3. **Always enforce** - Like convex-ents

**Current decision:** No enforcement yet (Phase 1)

**Rationale:**
- Convex doesn't natively support unique constraints
- Runtime checks add query overhead on every write
- Can add as opt-in feature later
- Document intent is valuable even without enforcement

### 4. Column Modifiers (Future)

**Question:** Should we add `.asc()`, `.desc()`, `.nullsFirst()` like Drizzle?

**Status:** Skip for now - Convex doesn't support index ordering hints

**Future consideration:** If Convex adds index ordering, add:
```ts
index('name').on(t.field.asc(), t.other.desc())
```

### 5. Expression Indexes (Future)

**Question:** Should we support `sql` template literals in `.on()`?

**Status:** Skip - Convex doesn't support computed column indexes

**Future consideration:** If Convex adds support:
```ts
index('email_lower').on(sql`lower(${t.email})`)
```

## Testing Strategy

### Type Tests (Required)

Following convex-test-orm patterns:

```ts
// Type safety
test('index column type safety')
test('uniqueIndex column type safety')
test('builder return types')
test('table with indexes type')

// Negative tests
test('@ts-expect-error: wrong table columns')
test('@ts-expect-error: missing .on() call')
```

### Runtime Tests (Required)

```ts
// Basic functionality
test('single column index')
test('composite index')
test('unique index (creates regular index)')

// Error handling
test('error when .on() not called')
test('error when .where() used')
test('error when wrong table columns used')

// Future features
test.skip('partial indexes with .where()')
test.skip('searchIndex builder')
test.skip('vectorIndex builder')
```

### Integration Tests

```ts
// Schema integration
test('defineSchema accepts new index syntax')
test('indexes exported correctly to Convex')

// Query integration
test('queries use defined indexes')
```

## References

### Documentation Created
- [/docs/drizzle-v1-index-analysis.md](../drizzle-v1-index-analysis.md) - Comprehensive Drizzle analysis
- [/docs/drizzle-v1-index-summary.md](../drizzle-v1-index-summary.md) - Quick reference
- [/docs/drizzle-v1-index-examples.md](../drizzle-v1-index-examples.md) - Side-by-side examples

### External Resources
- Drizzle v1 repo: https://github.com/zbeyens/drizzle-v1
- Convex-ents repo: https://github.com/get-convex/convex-ents
- Convex backend: https://github.com/get-convex/convex-backend

### Key Source Files
- Drizzle: `drizzle-orm/src/pg-core/indexes.ts`
- Drizzle: `drizzle-orm/src/sqlite-core/indexes.ts`
- kitcn: `packages/kitcn/src/orm/indexes.ts`
- kitcn: `packages/kitcn/src/orm/table.ts`

## Next Steps

1. **Implement searchIndex() builder** (Phase 2)
   - Create `ConvexSearchIndexBuilderOn` class
   - Implement `.on(field).filter(...fields)` chain
   - Update `applyExtraConfig` to handle search indexes

2. **Implement vectorIndex() builder** (Phase 2)
   - Create `ConvexVectorIndexBuilderOn` class
   - Implement `.on(field).dimensions(n).filter(...fields)` chain
   - Update `applyExtraConfig` to handle vector indexes

3. **Update schema.ts** (Phase 2)
   - Migrate all `.searchIndex()` calls to builder syntax
   - Test with `bun typecheck`

4. **Add tests** (Phase 3)
   - Type tests in `test/types/`
   - Runtime tests in `test/orm/`
   - Follow convex-test-orm patterns

5. **Documentation** (Phase 3)
   - Update `www/content/docs/orm/schema.mdx`
   - Create migration guide
   - Add examples to quickstart

---

**Note:** When implementing search/vector builders, dig into Drizzle repo for TypeScript patterns. They master TypeScript more than we do - mirror their typing magic.
