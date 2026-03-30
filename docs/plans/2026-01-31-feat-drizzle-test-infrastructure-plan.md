---
title: Drizzle-Convex Test Infrastructure (Pull from convex-ents)
type: feat
date: 2026-01-31
---

# Drizzle-Convex Test Infrastructure (Pull from convex-ents)

## Overview

Pull convex-ents' complete test folder into `packages/kitcn/src/drizzle/test` to establish a **green test baseline** before implementing Drizzle API.

**Strategy**: Get all tests passing with bun + convex-ents first (safe baseline), THEN incrementally adapt to drizzle implementation.

**This plan**: Pull tests → Make them work with bun → All tests green ✅
**Next step**: Milestone 1 implementation (adapt schema incrementally)

## Development Approach

**CRITICAL: Test-Driven Development (TDD)**

- **Always run `/test:tdd` skill** when implementing Milestone 1+ features
- **Use existing tests** from this plan as baseline (103 passing tests from convex-ents)
- **Add tests for new coverage** if implementing drizzle-specific features not covered by convex-ents
- **Keep tests green**: All changes must maintain 100% passing tests

**Workflow:**
1. Identify feature to implement (e.g., `convexTable()`)
2. Run `/test:tdd` skill
3. Use existing convex-ents tests as reference
4. Write test for drizzle API equivalent
5. Implement until test passes
6. Refactor while keeping tests green

## Problem Statement / Motivation

Convex-ents has battle-tested:
- 7 test files covering all functionality
- convex-test harness (will adapt for bun test)
- Comprehensive schema fixtures
- Type testing patterns
- Edge-runtime environment setup

Building from scratch would duplicate this proven work. Better to pull, adapt minimally, and focus on implementing Drizzle API.

## Proposed Solution

**Pull entire test folder** from convex-ents:

```bash
# Copy test infrastructure
cp -r /tmp/cc-repos/convex-ents/test packages/kitcn/src/drizzle/

# Result structure:
packages/kitcn/src/drizzle/
├── test/
│   ├── convex/
│   │   ├── _generated/     # Convex generated files
│   │   ├── functions/      # Test helpers
│   │   ├── cascade.test.ts
│   │   ├── paginate.test.ts
│   │   ├── read.test.ts
│   │   ├── rules.test.ts
│   │   ├── types.test.ts
│   │   ├── write.test.ts
│   │   ├── setup.testing.ts
│   │   └── schema.ts       # Test fixtures
│   ├── vitest.config.mts
│   ├── package.json
│   └── tsconfig.json
```

## Technical Approach

### This Plan: Minimal Changes Only

**In scope (this plan):**
1. **package.json** - Update scripts to use `bun test` (keep convex-ents deps)
2. **Get all tests passing** - Validate bun + convex-test work together

**Out of scope (future Milestone 1 plan):**
1. **schema.ts** - Adapt to `convexTable()` syntax
2. **Test files** - Adapt ents API → drizzle API
3. **Remove convex-ents dependency** - Replace incrementally

### Keep As-Is (Minimal Changes)

- vitest.config.mts (may need bun test adaptation or removal)
- setup.testing.ts (test harness - adapt imports if needed)
- tsconfig.json
- Test structure and patterns

## Implementation Steps

### Step 1: Copy Test Folder

```bash
# From repo root
cp -r /tmp/cc-repos/convex-ents/test packages/kitcn/src/drizzle/
```

### Step 2: Update package.json for Bun (Minimal Changes)

**File**: `packages/kitcn/src/drizzle/test/package.json`

```json
{
  "name": "@kitcn/drizzle-tests",
  "private": true,
  "version": "0.1.0",
  "scripts": {
    "lint": "tsc && eslint .",
    "typecheck": "tsc --noEmit",
    "test": "bun test",
    "test:once": "bun test run",
    "test:debug": "bun test --inspect-brk --no-file-parallelism",
    "test:coverage": "bun test run --coverage"
  },
  "dependencies": {
    "convex": "workspace:*",
    "convex-ents": "^0.13.4",
    "convex-helpers": "^0.1.63"
  },
  "devDependencies": {
    "@eslint/eslintrc": "^3.3.1",
    "@eslint/js": "^9.39.1",
    "@edge-runtime/vm": "^3.2.0",
    "@typescript-eslint/eslint-plugin": "^8.47.0",
    "convex-test": "^0.0.39",
    "eslint": "^9.39.1",
    "typescript": "^5.4.5"
  }
}
```

**Changes (Minimal - just for bun):**
- Scripts use `bun test` (bun's native test runner)
- Dependencies use workspace protocol for convex
- **Keep convex-ents and convex-helpers** - tests need them to pass
- Removed `vitest` and `@vitest/coverage-v8` (using bun test)

### Step 3: Install Dependencies

```bash
cd packages/kitcn/src/drizzle/test
bun install
```

### Step 4: Initial Test Run (Expected to Pass ✅)

```bash
bun test
```

**Expected**: All tests PASS because we kept convex-ents dependencies.

**Goal**: Establish green baseline before refactoring to drizzle API.

### Step 5: Acceptance Criteria - Green Tests ✅

**Before proceeding to Milestone 1 implementation:**

```bash
bun test
```

**Must see**: All tests passing (100% green)

**Checklist:**
- [ ] All 7 test files run successfully
- [ ] No errors in test output
- [ ] convex-test harness works with bun
- [ ] Edge-runtime environment configured correctly

**Only after green tests**: Begin Milestone 1 (adapt schema incrementally)

### Step 6: Future - Incremental Adaptation (After This Plan)

**After green baseline established**, adapt incrementally **as you implement** drizzle features:

| Milestone | Test Files to Adapt | Focus |
|-----------|-------------------|-------|
| **M1: Schema** | types.test.ts, write.test.ts (partial) | Type inference, table metadata |
| **M2: Relations** | read.test.ts (edge tests) | Edge traversal → relations |
| **M3: Queries** | read.test.ts (query tests), paginate.test.ts | findMany, with relations |
| **M4: Filtering** | read.test.ts (index tests) | where clauses |
| **M5: Mutations** | write.test.ts (full), cascade.test.ts | insert, update, delete |
| **M6: Advanced** | rules.test.ts | Authorization |

## Acceptance Criteria

### Functional Requirements

- [ ] Test folder copied to `packages/kitcn/src/drizzle/test`
- [ ] package.json adapted for bun (scripts only, keep convex-ents deps)
- [ ] Dependencies install successfully with `bun install`
- [ ] **All tests pass with `bun test`** (using convex-ents)

### Non-Functional Requirements

- [ ] Bun test runner works with convex-test + edge-runtime
- [ ] Test files preserve original structure (easy to sync updates from convex-ents)
- [ ] Comments added explaining adaptations made

### Quality Gates

- [ ] **All tests pass** with `bun test` (100% green using convex-ents)
- [ ] TypeScript compiles with `bun typecheck`
- [ ] Linting passes with `bun lint`

## Test Files Overview

### Files Pulled from convex-ents

| File | Purpose | Lines | Adapt for Milestone |
|------|---------|-------|---------------------|
| **cascade.test.ts** | Soft deletion, scheduled deletion, cascade behavior | 44 | M5 (Mutations) |
| **paginate.test.ts** | Pagination with edge traversal | ~100 | M3 (Queries) |
| **read.test.ts** | Index queries, edge traversal, getX, firstX | ~500 | M2-M4 (Relations, Queries, Filtering) |
| **rules.test.ts** | Authorization rules, skipRules | ~200 | M6 (Advanced) |
| **types.test.ts** | Type inference validation | 16 | **M1 (Schema)** ← Start here |
| **write.test.ts** | Insert, unique constraints, edge creation | ~200 | **M1 + M5** |
| **setup.testing.ts** | Test harness, convexTest wrapper | 26 | **M1** - Minimal changes |

### Test Infrastructure Files

| File | Purpose | Changes Needed |
|------|---------|----------------|
| **vitest.config.mts** | Test config with edge-runtime | Adapt for bun test or remove |
| **package.json** | Dependencies and scripts | Bun adaptation (remove vitest) |
| **tsconfig.json** | TypeScript config | None (or inherit from workspace) |
| **schema.ts** | Comprehensive test fixtures | Convert to `convexTable()` syntax |

## Success Metrics

- **All convex-ents tests pass** with bun test (green baseline)
- Test infrastructure runs with bun (no errors)
- Zero setup friction for contributors
- Safe foundation for incremental drizzle implementation

## Dependencies & Risks

### Dependencies

- convex-test ^0.0.39 (Convex test harness)
- bun (package manager + native test runner)
- edge-runtime (Convex environment simulation)

### Risks

**Risk**: Bun test runner incompatibility with convex-test (written for vitest)
**Mitigation**: Bun test is compatible with vitest-style `describe/it/expect` API. Adapt test syntax if needed.

**Risk**: convex-test expects ents API, not drizzle API
**Mitigation**: Adapt incrementally. Start with minimal changes (just schema), expand as features are implemented.

**Risk**: Test files drift from convex-ents upstream
**Mitigation**: Document origin in comments. Sync periodically if needed.

## References & Research

### Convex-ents Test Files (Source)

**Test infrastructure:**
- [vitest.config.mts](file:///tmp/cc-repos/convex-ents/test/vitest.config.mts) - Edge-runtime environment
- [package.json](file:///tmp/cc-repos/convex-ents/test/package.json) - Dependencies
- [setup.testing.ts](file:///tmp/cc-repos/convex-ents/test/convex/setup.testing.ts) - Test harness wrapper

**Test files:**
- [cascade.test.ts](file:///tmp/cc-repos/convex-ents/test/convex/cascade.test.ts) - Soft deletion patterns
- [paginate.test.ts](file:///tmp/cc-repos/convex-ents/test/convex/paginate.test.ts) - Pagination + edge traversal
- [read.test.ts](file:///tmp/cc-repos/convex-ents/test/convex/read.test.ts) - Query operations
- [rules.test.ts](file:///tmp/cc-repos/convex-ents/test/convex/rules.test.ts) - Authorization
- [types.test.ts](file:///tmp/cc-repos/convex-ents/test/convex/types.test.ts) - Type validation
- [write.test.ts](file:///tmp/cc-repos/convex-ents/test/convex/write.test.ts) - Insert operations
- [schema.ts](file:///tmp/cc-repos/convex-ents/test/convex/schema.ts) - Comprehensive test fixtures

### Internal References

- Brainstorm: [docs/brainstorms/2026-01-31-drizzle-convex-brainstorm.md](docs/brainstorms/2026-01-31-drizzle-convex-brainstorm.md)
- Direct ctx.db mapping decision: [brainstorm#260](docs/brainstorms/2026-01-31-drizzle-convex-brainstorm.md#260)

## Future Considerations (Beyond This Plan)

- **M2-M6**: Incrementally adapt test files as features are implemented
- **Test coverage**: Add drizzle-specific tests (not covered by convex-ents)
- **Performance tests**: Benchmark direct ctx.db vs convex-ents performance
- **Integration tests**: Test drizzle API against real Convex backend

## Open Questions

- [ ] Should we keep both ents and drizzle test suites for comparison?
- [ ] How to handle test fixtures when schema syntax changes significantly?
- [ ] Do we need additional tests beyond what convex-ents provides?

---

**This Plan - Next Steps**:
1. Pull test folder with `cp -r` command
2. Adapt package.json for bun (scripts only, keep convex-ents)
3. Run `bun install`
4. Run `bun test` → **All tests must pass ✅**
5. Commit green baseline

**Future Milestone 1 Plan**:
1. Implement `convexTable()` and type inference
2. Adapt schema.ts incrementally (keep tests green)
3. Remove convex-ents dependency when drizzle API complete

---

## Implementation Progress

### ✅ Completed (2026-01-31)

**Green Baseline Achieved**: All 103 tests passing with vitest

**Final Structure**:
- Tests located at `/convex/` (root level, not packages/)
- vitest.config.mts at root
- convex-test in root package.json devDependencies

**Key Decisions**:
1. **Used vitest instead of bun test**: Bun test doesn't support `import.meta.glob` ([Issue #6060](https://github.com/oven-sh/bun/issues/6060)), which convex-test requires
2. **Tests at root**: Moved to `/convex/` for simpler structure and easier Convex codegen access
3. **All imports fixed**: Changed `from "../../src"` to `from "convex-ents"` in schema.ts, functions.ts, rules.ts, setup.testing.ts, types.ts
4. **Removed duplicate index**: Removed `.index('legacyEmail', ['email'])` since `{ unique: true }` creates index automatically
5. **Fixed legacyEmail references**: Replaced with `email` in read.test.ts

**Test Results**:
```bash
bun test  # Other tests (8 pass)
vitest run  # Convex tests (103 pass)

Test Files: 6 passed (6)
Tests: 103 passed (103)
```

**Files Modified**:
- [convex/schema.ts](convex/schema.ts) - Removed duplicate index, fixed imports
- [convex/functions.ts](convex/functions.ts) - Fixed imports to convex-ents
- [convex/rules.ts](convex/rules.ts) - Fixed imports to convex-ents
- [convex/setup.testing.ts](convex/setup.testing.ts) - Fixed imports to convex-ents
- [convex/types.ts](convex/types.ts) - Fixed imports to convex-ents
- [convex/read.test.ts](convex/read.test.ts) - Replaced legacyEmail → email
- [vitest.config.mts](vitest.config.mts) - Configured for convex/**/*.test.ts
- [package.json](package.json) - Added test script, updated typecheck

**Next Steps**: Ready for Milestone 1 - Implement Drizzle-style API while keeping tests green
