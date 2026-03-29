---
title: fix: ORM v1 blocker set (index planner, FK cascade x RLS, strict full-scan)
type: fix
date: 2026-02-07
brainstorm: docs/brainstorms/2026-02-07-orm-pre-release-api-coverage-convex-helpers-brainstorm.md
scope: kitcn/orm only
---

# fix: ORM v1 blocker set (index planner, FK cascade x RLS, strict full-scan)

## Overview

This plan covers only the four scoped v1 blockers:

1. Fix compound-index planner correctness.
2. Add regression tests for index-prefix/order validity.
3. Decide and codify FK cascade x RLS contract.
4. Keep strict full-scan semantics explicit for post-filter-heavy plans.

Found brainstorm from 2026-02-07: `orm-pre-release-api-coverage-convex-helpers`. Using as context for planning.

## Problem Statement

Current query planning can select a non-prefix compound index and push invalid filter order into `withIndex`, which can violate Convex index constraints at runtime. In parallel, FK cascade behavior currently applies child-row mutations through raw `db.patch` / `db.delete` paths, while root mutation rows are RLS-checked, leaving contract ambiguity for cascade x RLS semantics. Strict full-scan gating exists, but post-filter-heavy strategies need explicit, test-backed policy to avoid accidental expensive scans.

## Research Summary

### Local findings (repo-research-analyst equivalent)

- Planner scoring/splitting hotspots:
  - `packages/kitcn/src/orm/where-clause-compiler.ts:741`
  - `packages/kitcn/src/orm/where-clause-compiler.ts:879`
- Query execution and index application:
  - `packages/kitcn/src/orm/query.ts:1597`
  - `packages/kitcn/src/orm/query.ts:1650`
  - `packages/kitcn/src/orm/query.ts:1859`
  - `packages/kitcn/src/orm/query.ts:2208`
- FK cascade + RLS relevant runtime paths:
  - `packages/kitcn/src/orm/delete.ts:500`
  - `packages/kitcn/src/orm/update.ts:463`
  - `packages/kitcn/src/orm/mutation-utils.ts:919`
  - `packages/kitcn/src/orm/mutation-utils.ts:1112`
  - `packages/kitcn/src/orm/rls/evaluator.ts:166`

### Institutional learnings (learnings-researcher equivalent)

- No direct `docs/solutions/` write-up currently covers this exact planner-prefix bug or cascade-RLS contract.
- Closest related learnings are schema/type integration and index metadata patterns:
  - `docs/solutions/integration-issues/convex-table-schema-integration-20260202.md:29`

### Existing test surface

- Planner tests exist and are extensible:
  - `test/orm/where-clause-compiler.test.ts:18`
- FK action behavior tests exist:
  - `convex/orm/foreign-key-actions.test.ts:324`
- Mutation full-scan behavior tests exist:
  - `convex/orm/mutations.test.ts:155`
- Type-level strict/full-scan gating exists:
  - `test/types/select.ts:1263`
  - `test/types/select.ts:1400`

## Research Decision (External)

No external research required. This is an internal ORM correctness and contract-hardening pass with sufficient local context, tests, and brainstorm decisions.

## Stakeholders

- ORM maintainers: own planner/mutation/runtime behavior and release contract.
- Better-Convex users: affected by query correctness, cascade semantics, and strict-mode behavior.
- Docs maintainers: must keep ORM behavior docs aligned with runtime contract.

## SpecFlow Analysis

### Primary user flows

1. Developer writes object `where` against compound indexes.
2. ORM chooses index strategy and builds Convex query.
3. Query executes without violating Convex index prefix/order rules.
4. Developer performs delete/update with FK cascade and RLS enabled.
5. System behaves according to explicit, documented cascade-RLS contract.
6. Strict mode requires explicit opt-in for risky post-filter/full-scan paths.

### Edge cases to close

- `where` references only non-leading field of compound index (must not push invalid index predicate).
- `and(eq(b), eq(a))` against `[a,b]` index (must normalize or avoid invalid ordering).
- Multi-probe + post-filters under strict mode (no accidental implicit scan behavior).
- FK cascade child rows under RLS (behavior must be deterministic and documented).

### Spec gaps to resolve in this plan

- Missing explicit contract choice for FK cascade x RLS.
- Missing regression tests proving planner never emits invalid prefix/order index constraints.

## Alternative Approaches Considered

### Approach A: Defer to post-v1

Delay all four changes to v1.x.

Rejected because:
- These are v1 trust blockers, not optional improvements.

### Approach B: Partial ship (tests only, no behavior changes)

Add tests now, defer runtime fixes.

Rejected because:
- Leaves known runtime correctness risk in release candidate.

## Proposed Solution

Ship a TDD-first fix set in four workstreams, in strict order:

1. Add failing planner regression tests for non-prefix and reversed-order predicates.
2. Fix planner/index-filter generation to enforce Convex index-prefix/order correctness.
3. Add failing contract tests for FK cascade x RLS semantics, implement chosen contract, and document behavior.
4. Tighten strict full-scan semantics tests for post-filter-heavy paths and align docs/errors accordingly.

## Technical Approach

### TDD Rules (Mandatory for this scope)

- Red-Green-Refactor for every behavior change.
- No production code changes before failing tests are committed for each workstream.
- Use deterministic unit/runtime tests only.

### Workstream A: Compound-index planner correctness

#### RED tests

- `test/orm/where-clause-compiler.test.ts`
  - Add case: non-leading field (`eq(b)`) on compound `[a,b]` should not produce index filters that can be applied directly.
  - Add case: reversed logical order (`and(eq(b), eq(a))`) should not produce invalid filter order for `withIndex`.
- `convex/orm/where-filtering.test.ts`
  - Add runtime case that currently reproduces invalid compound-prefix behavior.

#### GREEN implementation

- `packages/kitcn/src/orm/where-clause-compiler.ts`
  - Enforce prefix-valid index filter extraction.
  - Prevent partial-overlap index selection from producing executable index filters.
  - Normalize index filter order to index field order when applicable.
- `packages/kitcn/src/orm/query.ts`
  - Ensure `withIndex` predicate building uses validated index filter sequence only.

#### REFACTOR

- Keep compiler/query boundaries clear (planner decides validity, executor applies validated plan).

### Workstream B: Explicit index-prefix/order validity regression suite

#### RED tests

- `test/orm/where-clause-compiler.test.ts`
  - Add matrix tests for single-field, compound-prefix, compound-non-prefix, and mixed logical expressions.
- `test/types/select.ts`
  - Add/adjust type assertions to reflect prefix-safe behavior for relevant APIs.

#### GREEN implementation

- Minimal changes required after Workstream A, only if tests expose additional planner/executor mismatch.

#### REFACTOR

- Consolidate duplicated test helpers for index fixtures.

### Workstream C: FK cascade x RLS contract decision + codification

#### Decision point (explicit)

Choose one contract and lock it:

- Option 1: Enforce child-table RLS on cascade/set-null/set-default fan-out.
- Option 2: Keep current bypass semantics for fan-out rows, document clearly as intentional.

Recommended for v1 stabilization: Option 2 (documented explicit bypass), unless product policy requires strict child-row RLS enforcement now.

#### RED tests

- `convex/orm/foreign-key-actions.test.ts`
  - Add contract tests that assert expected behavior under RLS-enabled parent/child tables.
- `convex/orm/rls.test.ts`
  - Add explicit integration scenario for mutation roots vs cascade fan-out rows.

#### GREEN implementation

- If Option 1 selected:
  - `packages/kitcn/src/orm/mutation-utils.ts`
    - Add child-row RLS checks before cascade fan-out writes.
- If Option 2 selected:
  - Keep runtime behavior; add explicit invariant comments and docs.

#### REFACTOR

- Centralize cascade-RLS checks/notes in one helper path to avoid drift.

### Workstream D: Strict full-scan semantics for post-filter-heavy plans

#### RED tests

- `convex/orm/where-filtering.test.ts`
  - Add strict-mode cases for post-filter-heavy operators/compositions.
- `convex/orm/pagination.test.ts`
  - Add strict-mode expectations around multi-probe + pagination + full-scan gating.
- `test/types/select.ts`
  - Add/adjust compile-time constraints where intended policy is type-enforced.

#### GREEN implementation

- `packages/kitcn/src/orm/query.ts`
  - Make strict-mode checks explicit for risky post-filter paths.
  - Preserve existing safe/indexable fast paths.

#### REFACTOR

- Normalize strict gating logic into clearly named helper(s), avoid duplicated branch checks.

## Acceptance Criteria

### Functional requirements

- [ ] Planner never emits executable index filters that violate compound index prefix/order rules.
- [ ] Regression tests cover non-leading-field and reversed-order predicate scenarios.
- [ ] FK cascade x RLS behavior is explicitly decided, implemented, and documented.
- [ ] Strict-mode full-scan semantics are explicit and test-backed for post-filter-heavy plans.

### Quality gates

- [ ] New failing tests are written first for each workstream.
- [ ] All updated runtime tests pass.
- [ ] All updated type tests pass.
- [ ] No unrelated ORM behavior regressions.

## Success Metrics

- Zero runtime failures from invalid compound index predicate generation in covered scenarios.
- Deterministic FK cascade x RLS behavior in tests and docs.
- Clear strict full-scan errors/warnings in all scoped post-filter-heavy cases.

## Dependencies & Risks

### Dependencies

- Existing ORM test harness in `convex/orm/*` and `test/orm/*`.
- Type-test contract surface in `test/types/select.ts`.

### Risks

- Tightening planner behavior could alter previously permissive queries.
- FK cascade x RLS decision affects user-visible semantics and upgrade expectations.
- Strict gating changes may require doc updates to avoid confusion.

### Mitigation

- TDD-first regression suite before any runtime changes.
- Explicit release note for any behavior change in planner or cascade/RLS semantics.
- Keep scope limited to the four blockers only.

## Resource Requirements

- Engineering: 1 primary implementer, 1 reviewer.
- Estimated effort: 2-4 focused days (including test-first cycles and docs updates).
- Infra: existing repo/local Convex test harness only.

## AI-Era Notes

- AI assistance used for repository research and plan drafting.
- All implementation steps remain human-reviewed and test-gated.
- TDD is mandatory for this scope to reduce AI-assisted false confidence risk.

## Documentation Plan

Update ORM docs only for scoped behavior changes:

- `www/content/docs/orm/queries.mdx`
- `www/content/docs/orm/limitations.mdx`
- `www/content/docs/orm/rls.mdx`

## References

### Internal references

- `packages/kitcn/src/orm/where-clause-compiler.ts:741`
- `packages/kitcn/src/orm/where-clause-compiler.ts:879`
- `packages/kitcn/src/orm/query.ts:1597`
- `packages/kitcn/src/orm/query.ts:1650`
- `packages/kitcn/src/orm/query.ts:2208`
- `packages/kitcn/src/orm/delete.ts:500`
- `packages/kitcn/src/orm/update.ts:463`
- `packages/kitcn/src/orm/mutation-utils.ts:919`
- `packages/kitcn/src/orm/mutation-utils.ts:1112`
- `packages/kitcn/src/orm/rls/evaluator.ts:166`
- `test/orm/where-clause-compiler.test.ts:18`
- `convex/orm/foreign-key-actions.test.ts:324`
- `convex/orm/mutations.test.ts:155`
- `test/types/select.ts:1263`

### Brainstorm input

- `docs/brainstorms/2026-02-07-orm-pre-release-api-coverage-convex-helpers-brainstorm.md`

## Implementation Checklist

- [x] `test/orm/where-clause-compiler.test.ts` add failing compound-prefix/order regressions.
- [x] `convex/orm/where-filtering.test.ts` add failing runtime reproduction.
- [x] `packages/kitcn/src/orm/where-clause-compiler.ts` enforce prefix-valid index filter plan.
- [x] `packages/kitcn/src/orm/query.ts` apply only validated index filters in index order (achieved through compiler normalization; no direct query.ts logic change required).
- [x] `convex/orm/foreign-key-actions.test.ts` add FK cascade x RLS contract tests (RED first).
- [x] `convex/orm/rls.test.ts` add root-vs-fan-out contract coverage (RED first).
- [x] `packages/kitcn/src/orm/mutation-utils.ts` codify selected cascade-RLS contract.
- [x] `convex/orm/pagination.test.ts` add strict post-filter/full-scan path assertions.
- [x] `test/types/select.ts` adjust type-level strict-gating assertions if needed (no additional changes required after runtime/compile validation).
- [x] `www/content/docs/orm/{queries,limitations,rls}.mdx` document only scoped behavior updates.

## Final Review Checklist

- [ ] Title is searchable and specific.
- [ ] Plan scope is only the four requested blockers.
- [ ] TDD sequence is explicit and enforceable.
- [ ] Acceptance criteria are measurable.
- [ ] File names are present in all pseudocode/task sections.
- [ ] ERD not applicable (no new model schema required for this scope).

## Unresolved Questions

- FK cascade fan-out RLS: enforce child RLS now, or keep bypass + doc?
- Strict gating edge: any post-filter operators exempt beyond current safe index paths?
