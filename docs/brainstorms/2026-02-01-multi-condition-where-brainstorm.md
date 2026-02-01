---
date: 2026-02-01
topic: multi-condition-where
---

# Multi-condition WHERE Clause Support in HTTP Adapter

## What We're Building

Support for multiple AND conditions in WHERE clauses for the HTTP adapter's `update()` method, unblocking the Better Auth organization plugin's member permissions endpoint.

**Current limitation:**
```typescript
if (data.where?.length === 1 && data.where[0].operator === "eq")
```

**Target support:**
- Multiple AND conditions (e.g., `organizationId=X AND userId=Y`)
- Count validation before update (ensure exactly 1 match)
- No OR support (keep complexity low, AND is safer)

## Why This Approach

**Context:** Better-auth is the only caller of this adapter

**Considered:**

| Option | WHERE Support | Validation | Trade-offs |
|--------|---------------|------------|------------|
| A | Multiple AND only | Count first | **Chosen** - Solves org plugin, safe, simple |
| B | Any complex (AND/OR) | Optional | Over-engineered for known use case |
| C | Single EQ + unique validation | Count first | Too restrictive, doesn't solve problem |

**Chose A because:**
1. **Solves immediate problem** - Org plugin needs compound WHERE with `organizationId + userId`
2. **AND is inherently safer** - Multiple AND conditions narrow results (more restrictive than single condition)
3. **Count validation adds safety** - Even with trusted caller, validate exactly 1 match before update
4. **Future-proof but constrained** - Allows growth without OR complexity

## Key Decisions

### 1. Multiple AND Conditions Only

**Rationale:**
- Better Auth org plugin needs compound conditions for unique lookups
- AND narrows scope → safer than single condition (counterintuitive but true)
- OR support adds complexity without known use case

**Example:**
```typescript
// Before: ❌ Fails
update({
  where: [
    { field: "organizationId", operator: "eq", value: "org123" },
    { field: "userId", operator: "eq", value: "user456" }
  ]
})

// After: ✅ Works
// Matches exactly 1 doc via compound index
```

### 2. Count Validation Before Update

**Rationale:**
- Prevents accidental 0 or multi-doc updates
- Makes bugs obvious early (fail fast)
- Low cost (single query overhead)
- Good practice even with trusted caller

**Implementation:**
```typescript
// 1. Count matches
const count = await db.query("table")
  .filter(q => buildWhereConditions(q, where))
  .count()

// 2. Validate exactly 1
if (count !== 1) {
  throw new Error(`Expected 1 match, found ${count}`)
}

// 3. Proceed with update
```

### 3. Infrastructure Already Supports This

**Key insight:** The safety constraint is artificial, not technical.

- Underlying Convex queries already handle complex WHERE safely
- Read operations use same infrastructure without restriction
- Security risk is low - AND conditions are more restrictive
- Only change: relax the length check, add count validation

## Implementation Details

### Files to Modify

```
packages/better-convex/src/
└── http/
    └── adapter.ts  # Relax WHERE check, add count validation
```

### Code Changes

**Before:**
```typescript
if (data.where?.length === 1 && data.where[0].operator === "eq") {
  // single EQ update
}
```

**After:**
```typescript
if (data.where?.length >= 1 && allOperatorsAreEq(data.where)) {
  // Count validation
  const count = await countMatches(data.where)
  if (count !== 1) throw new Error(...)

  // Proceed with update
}
```

### Helper Functions Needed

1. `allOperatorsAreEq(where)` - Validate all conditions use "eq" operator
2. `countMatches(where)` - Run count query with WHERE conditions
3. `buildWhereConditions(q, where)` - Build Convex filter from WHERE array (may already exist)

## Open Questions

None remaining - ready for implementation planning

## Next Steps

Choose implementation approach:
- `/plan` - Research-driven plan with codebase exploration
- `/draft` - Quick plan based on brainstorm
- `/lfg` - Full autonomous implementation
