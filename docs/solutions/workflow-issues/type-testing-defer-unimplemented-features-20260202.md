---
module: kitcn ORM
date: 2026-02-02
problem_type: workflow_issue
component: testing_framework
symptoms:
  - "19 TypeScript errors in type test files during M4.5 audit"
  - "Type tests written for unimplemented features (relation loading, column exclusion)"
  - "Equal<> assertions failing for stubbed runtime implementations"
root_cause: missing_workflow_step
resolution_type: workflow_improvement
severity: medium
tags: [type-testing, deferred-features, test-management, typescript, milestone-planning, orm]
---

# Type Testing: Deferring Tests for Unimplemented Features

## Problem

During M4.5 Type Testing Audit, 19 TypeScript errors appeared in type test files. Investigation revealed these weren't bugs - tests were written for features not yet implemented (relation loading runtime, column exclusion, type constraints).

## Environment

- Module: kitcn ORM
- Milestone: M4.5 (Type Testing Audit)
- TypeScript: via bun typecheck
- Test Framework: Vitest
- Date: 2026-02-02

## Symptoms

- 19 TypeScript errors in type test files ([convex/test-types/db-rel.ts](../../convex/test-types/db-rel.ts), [convex/test-types/select.ts](../../convex/test-types/select.ts))
- `Expect<Equal<...>>` assertions failing for relation loading tests
- Unused `@ts-expect-error` directives for unimplemented type constraints
- Tests passing individually but failing when features stubbed

## What Didn't Work

**Attempted Solution 1:** Fix all type errors assuming they were bugs
- **Why it failed:** Many errors were for features intentionally deferred (M3 relation loading runtime stubbed, M5 column exclusion not started)

**Attempted Solution 2:** Implement missing features to make tests pass
- **Why it failed:** User directive: "only fix what has been fully implemented by M1-4. incomplete features will be tested later"

## Solution

Established workflow pattern for managing type tests with deferred features:

### 1. Identify Implementation Status

Read source code to verify what's implemented vs stubbed:
- Relation loading: Type inference complete, runtime stubbed ([packages/kitcn/src/orm/query.ts:390](../../packages/kitcn/src/orm/query.ts))
- Column exclusion: Not implemented (only `include === true` handled)

### 2. Defer Tests with TODO Markers

Comment out tests for unimplemented features with milestone references:

```typescript
// TODO(Phase 4): Enable once relation loading implemented
// Relation loading with `with` option is not yet implemented
// _loadRelations() currently returns rows unchanged
// {
//   const result = await db.query.users.findMany({
//     with: {
//       posts: true,
//     },
//   });
//
//   type Expected = Array<{
//     // ...expected type
//   }>;
//
//   Expect<Equal<Expected, typeof result>>;
// }
```

### 3. Document Deferred Features in Brainstorm

Update project roadmap ([docs/brainstorms/2026-01-31-drizzle-orm-brainstorm.md](../../docs/brainstorms/2026-01-31-drizzle-orm-brainstorm.md)) with "Deferred Features" section:

```markdown
**Deferred Features** (documented during M4.5 audit):

The following M3 features are **type-only** (runtime stubbed) and deferred to **Phase 4**:
- ❌ **Relation loading with `with` option** - Type inference works, runtime stubbed
  - Types: BuildQueryResult and BuildRelationResult fully implemented
  - Runtime: _loadRelations() currently returns rows unchanged
  - Tests: db-rel.ts relation loading tests marked as TODO
  - Plan: Implement in separate milestone focused on edge traversal integration
```

### 4. Fix Tests for Implemented Features Only

Keep type tests aligned with actual implementation:
- ✅ M1 (Schema/Tables): Fully tested
- ✅ M2 (Relations API): Fully tested
- ✅ M4 (Where Filtering): Fully tested
- ⚠️ M3 (Queries): Basic queries tested, relation loading deferred

### Code Changes

**Files modified:**
- [convex/test-types/db-rel.ts](../../convex/test-types/db-rel.ts) - Deferred 7 relation loading tests
- [convex/test-types/select.ts](../../convex/test-types/select.ts) - Deferred 2 tests (column exclusion, nested relations)
- [convex/test-types/debug-typeof-widening.ts](../../convex/test-types/debug-typeof-widening.ts) - Deferred type widening test
- [convex/orm/where-filtering.test.ts](../../convex/orm/where-filtering.test.ts) - Fixed unused @ts-expect-error
- [docs/brainstorms/2026-01-31-drizzle-orm-brainstorm.md](../../docs/brainstorms/2026-01-31-drizzle-orm-brainstorm.md) - Added "Deferred Features" section

**Results:**
```bash
# Before
$ bun typecheck
19 errors

# After
$ bun typecheck
0 errors

# Runtime tests
$ vitest run
147 passed, 1 skipped
```

## Why This Works

**Root Cause**: Type tests were written aspirationally (testing desired behavior) before implementation was complete. This creates false positives when features are stubbed.

**Solution**: Defer tests until features are implemented, maintaining clean type checking while preserving test intent for future milestones.

**Key Insight**: Type tests should validate **current implementation**, not future plans. Deferred tests serve as implementation TODOs rather than active validation.

## Prevention

### For Future Type Testing Audits

1. **Verify implementation status first**: Before fixing type errors, check if feature is actually implemented (grep for function bodies, not just type signatures)

2. **Use milestone-linked TODO markers**:
   ```typescript
   // TODO(M5): Enable once column exclusion implemented
   // TODO(Phase 4): Enable once relation loading implemented
   ```

3. **Document deferred features in roadmap**: Keep single source of truth (brainstorm/plan) listing what's stubbed vs complete

4. **Test incrementally by milestone**: Write type tests AFTER implementation, not before
   - M1 complete → Write M1 type tests
   - M2 complete → Write M2 type tests
   - Don't write M3 tests until M3 runtime complete

5. **Distinguish type-only vs runtime-complete**: Features can have complete type inference while runtime is stubbed (relation loading pattern). Document this distinction clearly.

### Code Pattern

**✅ CORRECT** - Test aligned with implementation:
```typescript
// M2 complete: Relation API types
{
  const result = await db.query.users.findMany();

  type Expected = Array<{
    _id: string;
    name: string;
    // ...
  }>;

  Expect<Equal<Expected, typeof result>>;
}
```

**❌ WRONG** - Test for unimplemented feature:
```typescript
// M3 incomplete: Relation loading stubbed
{
  const result = await db.query.users.findMany({
    with: { posts: true }, // Runtime returns unchanged!
  });

  Expect<Equal<Expected, typeof result>>; // Fails - feature not implemented
}
```

**✅ CORRECT** - Deferred test with TODO:
```typescript
// TODO(Phase 4): Enable once relation loading implemented
// {
//   const result = await db.query.users.findMany({
//     with: { posts: true },
//   });
//   Expect<Equal<Expected, typeof result>>;
// }
```

## Related Issues

### TypeScript Patterns
- [Phantom Type Brand Preservation](../typescript-patterns/phantom-type-brand-preservation-20260202.md) - Related type inference pattern
- [Select.ts Type Inference Drizzle Patterns](../typescript-patterns/select-ts-type-inference-drizzle-patterns-20260202.md) - Type testing patterns learned from Drizzle

### Project Management
No related workflow issues documented yet. This establishes the pattern for test deferral.

## References

- Drizzle ORM type tests: `/tmp/cc-repos/drizzle-orm/drizzle-orm/type-tests/pg/`
- kitcn M4.5 Plan: [docs/plans/2026-02-02-feat-m4-5-type-testing-audit-drizzle-parity-plan.md](../../docs/plans/2026-02-02-feat-m4-5-type-testing-audit-drizzle-parity-plan.md)
- Brainstorm with Deferred Features: [docs/brainstorms/2026-01-31-drizzle-orm-brainstorm.md](../../docs/brainstorms/2026-01-31-drizzle-orm-brainstorm.md)
