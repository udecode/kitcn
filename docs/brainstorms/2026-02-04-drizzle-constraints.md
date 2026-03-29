---
date: 2026-02-04
topic: drizzle-constraints
status: implemented
---

# Drizzle v1 Constraints Support

Add Drizzle v1 unique constraint support to kitcn ORM with runtime enforcement only (no syntax-only constraints).

## What We're Building

### Goal
Support Drizzle v1 unique constraints in kitcn ORM with runtime enforcement only:

```ts
export const users = convexTable('users', {
  email: text().notNull(),
  firstName: text().notNull(),
  lastName: text().notNull(),
  age: integer(),
  orgId: id('orgs'),
}, (t) => [
  uniqueIndex('email_unique').on(t.email),  // ✅ Enforced at runtime
]);
```

### Key Decision: `uniqueIndex()` Must Enforce

**Problem:** Current `uniqueIndex()` does nothing - just creates regular index
- Misleading API: why use `uniqueIndex()` if it doesn't enforce?
- Users expect uniqueness when they use `uniqueIndex()`

**Solution:** Enforce uniqueness by default
```ts
// Regular index - no enforcement
index('by_type').on(t.type)

// Unique index - automatic runtime enforcement
uniqueIndex('email_unique').on(t.email)
```

**Rationale:**
- Self-documenting API: name matches behavior
- No confusion: if you want unique, use `uniqueIndex()`
- Matches user expectations
- Simple: no `.enforce()` flag needed

## Why This Approach

### Research: convex-ents Unique Implementation

**Source:** Dug into `/tmp/cc-repos/convex-ents`

**How convex-ents does it:**
1. **Field-level API**: `.field("email", v.string(), { unique: true })`
2. **Automatic index creation**: Unique fields get indexes automatically
3. **Runtime enforcement**: Query-based check before every write
4. **Implementation** (`src/writer.ts:293-357`):
   ```ts
   const existing = await this.ctx.db
     .query(table)
     .withIndex(field, (q) => q.eq(field, value))
     .unique();

   if (existing !== null && existing._id !== currentId) {
     throw new Error(`duplicate found: ${field} = ${value}`);
   }
   ```

**Performance cost:**
- Every write operation (insert/patch/replace) checks for duplicates
- Query-based lookup using the index (efficient)
- Clear error messages with field name, value, and existing document ID

**Key insight:** convex-ents proves runtime unique enforcement is practical and valuable

### Decision: uniqueIndex() = Automatic Enforcement

**API design:**
- `index()` = regular index, no enforcement
- `uniqueIndex()` = enforced uniqueness (convex-ents style)

**Why this is cleaner:**
1. API name matches behavior
2. No `.enforce()` opt-in needed
3. Follows principle of least surprise
4. If you don't want enforcement, use `index()`

## Constraints to Support

### 1. uniqueIndex() - RUNTIME ENFORCEMENT ✅

**Syntax:**
```ts
(t) => [uniqueIndex('email_unique').on(t.email)]
```

**Behavior:**
- Creates regular index (for efficient lookup)
- Adds runtime check before insert/patch/replace
- Throws clear error on duplicate: `"duplicate found: email = foo@bar.com"`
- Only works with kitcn mutation builders

**Implementation:**
- Hook into mutation helpers (to be created)
- Query-based uniqueness check
- Store unique config in table metadata

### 2. column.unique() - RUNTIME ENFORCEMENT ✅

**Syntax:**
```ts
email: text().notNull().unique()
handle: text().unique('handle_unique', { nulls: 'not distinct' })
```

**Behavior:**
- Creates backing unique index
- Enforces uniqueness at runtime
- Respects nulls distinct vs not distinct semantics

### 3. unique() - RUNTIME ENFORCEMENT ✅

**Syntax:**
```ts
(t) => [unique('full_name').on(t.firstName, t.lastName)]
```

**Behavior:**
- Creates backing unique index (name uses Drizzle default if omitted)
- Enforces composite uniqueness at runtime
- Supports `.nullsNotDistinct()` for PG parity

### 4. foreignKey() - RUNTIME ENFORCEMENT ✅

**Syntax:**
```ts
(t) => [foreignKey({ columns: [t.userSlug], foreignColumns: [users.slug] })]
```

**Behavior:**
- Enforces references at runtime for ORM mutations
- `_id` references use `db.get`
- Non‑`_id` references require an index on the foreign columns
- No cascade/delete behavior (accepted for API parity)

### 5. Deferred constraints (enforced only)

We will not add `primaryKey()` or `check()` until enforcement is implemented. No syntax-only constraints.

### 6. Column Defaults - RUNTIME ENFORCEMENT ✅

**Drizzle v1 syntax:**
```ts
age: integer().default(0)
```

**kitcn behavior:**
- Defaults are applied by ORM inserts when value is `undefined`
- Explicit `null` is preserved
- Direct `ctx.db` writes bypass defaults

## Implementation Plan

### Phase 1: uniqueIndex() + unique() Runtime Enforcement

**Files to modify:**
1. `packages/kitcn/src/orm/indexes.ts`
   - Store `unique: true` in config (already done)

2. `packages/kitcn/src/orm/table.ts`
   - Store unique index metadata when `unique: true`
   - Auto-create unique indexes for `unique()` constraints
   - Auto-create unique indexes for column `.unique()`
   - Make available to mutation builders

3. Create `packages/kitcn/src/orm/mutation-utils.ts`
   - `checkUniqueness()` helper (convex-ents style)
   - Query-based duplicate check
   - Clear error messages

4. Update mutation builders (insert/update/delete)
   - Hook in `checkUniqueness()` before writes
   - Only for tables with unique indexes
   - Check all unique fields

**Testing:**
- Type tests for unique index syntax
- Runtime tests for uniqueness enforcement
- Test error messages
- Test that regular `index()` doesn't enforce

### Phase 2: Documentation

**Update docs:**
- `www/content/docs/orm/schema.mdx`
  - Document `uniqueIndex()` enforcement
  - Clarify that other constraints are deferred until enforced

- Create `www/content/docs/orm/constraints.mdx`
  - Unique index enforcement reference
  - Performance considerations for uniqueIndex
  - Migration guide from SQL ORMs

## Technical Details

### Unique Index Enforcement

**When enforcement happens:**
```ts
// Before insert
await ctx.table('users').insert({ email: 'test@example.com' });
// → checkUniqueness('users', 'email_unique', { email: 'test@example.com' }, undefined)

// Before patch
await ctx.table('users').get(userId).patch({ email: 'new@example.com' });
// → checkUniqueness('users', 'email_unique', { email: 'new@example.com' }, userId)
```

**Implementation** (convex-ents style):
```ts
async function checkUniqueness(
  ctx: MutationCtx,
  table: string,
  indexName: string,
  values: Record<string, any>,
  currentId?: Id<any>
): Promise<void> {
  const existing = await ctx.db
    .query(table)
    .withIndex(indexName, (q) =>
      Object.entries(values).reduce(
        (builder, [field, value]) => builder.eq(field as any, value),
        q
      )
    )
    .unique();

  if (existing !== null && (currentId === undefined || existing._id !== currentId)) {
    throw new Error(
      `In table "${table}" cannot create a duplicate document for unique index "${indexName}".`
    );
  }
}
```

**Performance:**
- Query overhead: One indexed query per unique field per write
- Efficient: Uses existing unique index for lookup
- Transaction safe: All checks happen before write
- Multiple unique fields: Check all in parallel with `Promise.all()`

### Constraint Metadata Storage

**Store in table class:**
```ts
class ConvexTableImpl {
  // Existing
  indexes: IndexDefinition[] = [];
  searchIndexes: SearchIndexDefinition[] = [];
  vectorIndexes: VectorIndexDefinition[] = [];

  // New
  uniqueIndexes: { name: string; fields: string[] }[] = [];
  primaryKeys: string[] = [];
  foreignKeys: ForeignKeyConfig[] = [];
}
```

**Access from mutations:**
```ts
const table = ctx.table('users');
const uniqueIndexes = table.uniqueIndexes; // [{ name: 'email_unique', fields: ['email'] }]
// Run checkUniqueness for each before write
```

## Open Questions

### Q1: Should unique() also enforce?

**Question:** We're enforcing `uniqueIndex()`. Should table-level `unique()` also enforce?

**Options:**
1. **Yes** - Both enforce uniqueness
2. **No** - Only `uniqueIndex()` enforces, `unique()` is syntax only
3. **Later** - Add `unique()` enforcement in future

**Recommendation:** Option 2 (only `uniqueIndex()` enforces)

**Rationale:**
- `uniqueIndex()` naturally needs an index for enforcement
- `unique()` without index would be expensive (full table scan)
- Can add `unique()` enforcement later if needed
- Most users will use `uniqueIndex()` for performance

### Q2: Composite unique constraints?

**Question:** Should `uniqueIndex()` support composite uniqueness?

**Example:**
```ts
uniqueIndex('user_org').on(t.userId, t.orgId)
// Enforces: (userId, orgId) pair must be unique
```

**Options:**
1. **Yes** - Support from day 1
2. **No** - Only single field initially
3. **Later** - Add after single-field works

**Recommendation:** Option 1 (support from day 1)

**Rationale:**
- Implementation is similar (just check multiple fields)
- Common use case (composite keys)
- Drizzle supports it
- convex-ents doesn't support this (limitation we can fix)

**Implementation:**
```ts
// Check composite unique: (userId, orgId)
const existing = await ctx.db
  .query(table)
  .withIndex(indexName, (q) =>
    q.eq('userId', userId).eq('orgId', orgId)
  )
  .unique();
```

### Q3: Opt-out mechanism?

**Question:** Should users be able to opt-out of uniqueness checks?

**Use case:** Bulk imports, migrations, or trusted data

**Options:**
1. **No opt-out** - Always enforce (convex-ents style)
2. **Context flag** - `ctx.skipUniqueChecks = true`
3. **Per-operation** - `.insert({ ... }, { skipUnique: true })`

**Recommendation:** Option 1 (no opt-out initially)

**Rationale:**
- Simpler implementation
- Prevents accidental data corruption
- Can add opt-out later if needed
- Users can use `ctx.db` directly to bypass ORM

## Next Steps

1. **Documentation**: Update docs with unique/default enforcement reference

2. **Future**: Add enforced constraints only
   - primaryKey() - enforce uniqueness + not-null
   - foreignKey() - referential integrity checks

## References

### Research Sources
- convex-ents repo: `/tmp/cc-repos/convex-ents`
  - `src/schema.ts:711-721` - Field-level unique API
  - `src/writer.ts:293-357` - Runtime uniqueness enforcement
  - `test/convex/write.test.ts:21-35` - Unique field tests
  - `docs/pages/schema.mdx:83-88` - Performance documentation

- Drizzle v1 repo: `/tmp/cc-repos/drizzle-v1`
  - `drizzle-orm/src/pg-core/indexes.ts` - uniqueIndex builder
  - `drizzle-orm/src/pg-core/unique-constraint.ts` - unique() constraint builder
  - `drizzle-orm/src/pg-core/primary-keys.ts` - primaryKey() builder
  - `drizzle-orm/src/sqlite-core/foreign-keys.ts` - foreignKey() builder

### Key Insights
- convex-ents proves runtime unique enforcement is practical
- Query-based approach is efficient with indexes
- Clear error messages are critical for DX
- Performance cost is acceptable (one query per unique field per write)
- If `uniqueIndex()` doesn't enforce, it's misleading API
