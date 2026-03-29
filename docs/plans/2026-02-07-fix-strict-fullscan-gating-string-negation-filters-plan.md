---
title: fix: strict full-scan gating for scan-prone string and negation filters
type: fix
date: 2026-02-07
status: draft
---

# 🐛 fix: strict full-scan gating for scan-prone string and negation filters

## Overview
Current strict-mode gating misses some query shapes that are index-planned but still scan-heavy in practice. Specifically, negation operators compiled as `multiProbe` can read broad table ranges without requiring explicit `allowFullScan: true`. This plan makes issue scope explicit, measurable, and implementation-ready.

## Brainstorm Context
Found brainstorm from 2026-02-07: `orm-pre-release-comprehensive-analysis`. Using as planning context.

Key carry-over decisions:
- Treat scan-prone string/negation shapes as strict-mode full-scan risk.
- Keep prefix-optimized paths (`startsWith`, `like('prefix%')`) exempt when compiled to `rangeIndex`.
- Add planner metadata so runtime strict gate can make a precise decision.

## Problem Statement / Motivation
The current runtime gate only throws when there is no selected index and post-filters exist. This leaves a gap: `ne`, `notInArray`, and `isNotNull` can compile to `multiProbe` with an index selected, but still scan a large fraction of rows. Users can interpret “index-backed” as “safe,” which weakens strict-mode guarantees and makes performance behavior less predictable.

## Proposed Solution
Add explicit scan-risk metadata to query planning and use it to enforce strict-mode gating.

1. Planner emits strict full-scan risk metadata.
2. Runtime enforces `allowFullScan: true` when strict mode + risk metadata says required.
3. Warnings become reason-aware (text matching vs negation multi-probe).
4. Prefix range optimizations remain unaffected.

## Implementation Scope (File-Level)
- `packages/kitcn/src/orm/where-clause-compiler.ts`
  - Extend `WhereClauseResult` with risk metadata.
  - Classify risky operators and safe prefix optimizations.
- `packages/kitcn/src/orm/query.ts`
  - Enforce strict gate using planner risk metadata.
  - Add targeted warning messages for risky paths when full scan is allowed.
- `test/orm/where-clause-compiler.test.ts`
  - Validate risk classification for risky vs safe cases.
- `test/types/select.ts`
  - Lock current type contract and decide runtime-only vs type-level tightening for negation operators.
- `test/orm/query.test.ts` (or closest existing runtime query execution test file)
  - Add strict-mode runtime behavior coverage.

## SpecFlow Analysis
### Flow A: Prefix-safe path
- Input: `startsWith` or `like('prefix%')` on leading indexed field.
- Expected: `rangeIndex` strategy, no strict-mode full-scan requirement.
- Risk: false positives if risk metadata is too broad.

### Flow B: Negation multi-probe path
- Input: `ne`, `notInArray`, `isNotNull` with usable index.
- Expected: marked as scan-risk; strict mode requires `allowFullScan: true`.
- Risk: behavior change for existing strict users.

### Flow C: Text post-filter path
- Input: `contains`, `endsWith`, non-prefix `like`, `ilike`, `notLike`, `notIlike`.
- Expected: strict mode requires explicit full-scan opt-in; warning recommends search index.
- Risk: warning fatigue if repeated too aggressively.

### Flow D: Existing pagination multi-probe behavior
- Input: `paginate` + `multiProbe`.
- Expected: keep existing gate requiring `allowFullScan: true`; no regression.

### Flow E: Non-strict mode
- Input: strict disabled table config.
- Expected: preserve current behavior (warn/allow semantics) unless explicitly tightened in separate issue.

## Technical Considerations
- `WhereClauseResult` currently has no risk metadata, only strategy/index/probe/post filters.
- `query.ts` strict gate currently keys off `!queryConfig.index && postFilters.length > 0`; this is insufficient for risky `multiProbe`.
- Prefix optimizations already exist and should remain exempt:
  - `startsWith` -> `rangeIndex`
  - `like('prefix%')` -> `rangeIndex`
- Type contract currently treats some operators as requiring `allowFullScan` (`endsWith`, `NOT`) while allowing `ne`/`notIn`/`isNotNull` without it. Decide whether this mismatch remains acceptable.

## Acceptance Criteria
- [ ] Strict mode throws for scan-risk string and negation query shapes unless `allowFullScan: true` is provided.
- [ ] Prefix-optimized `startsWith` and `like('prefix%')` remain allowed without `allowFullScan` when indexable.
- [ ] Runtime warnings differentiate:
  - text matching risk -> recommend search index
  - negation multi-probe risk -> explain broad-range read risk
- [ ] Compiler tests cover risk classification for risky and safe cases.
- [ ] Runtime tests verify throw/warn behavior in strict mode.
- [ ] Type tests explicitly document intended contract for `ne`/`notIn`/`isNotNull` (runtime-only gate vs compile-time requirement).

## Success Metrics
- No strict-mode false negatives for known risky operators in tests.
- No regressions for prefix range optimization tests.
- Clear error/warning messages that explain why opt-in is required.

## Dependencies & Risks
Dependencies:
- Stable planner contract between `where-clause-compiler.ts` and `query.ts`.
- Existing strict-mode semantics preserved outside this issue scope.

Risks:
- Behavior change for strict-mode users relying on negation queries without `allowFullScan`.
- Type/runtime policy drift if compile-time contract is not aligned with runtime gating.
- Overly broad risk flags could block legitimate indexed queries.

Mitigations:
- Keep prefix-safe exemptions explicit and tested.
- Add targeted tests for each risky operator family.
- Document final policy in query/performance docs after merge.

## Issue Validity Checklist
- [x] Searchable, specific title (`fix:` prefix + concrete scope).
- [x] Clear problem statement with concrete runtime gap.
- [x] Measurable acceptance criteria.
- [x] File-level scope and test scope defined.
- [x] Risks and open decisions captured.
- [x] Brainstorm context linked and incorporated.

## References & Research
### Internal References
- Runtime strict gate currently only checks no-index + post-filter:
  - `packages/kitcn/src/orm/query.ts:1650`
- Existing multi-probe pagination full-scan gate:
  - `packages/kitcn/src/orm/query.ts:1976`
- Planner result shape lacks strict-risk metadata:
  - `packages/kitcn/src/orm/where-clause-compiler.ts:35`
- Negation operators compile as `multiProbe`:
  - `packages/kitcn/src/orm/where-clause-compiler.ts:211`
  - `packages/kitcn/src/orm/where-clause-compiler.ts:240`
  - `packages/kitcn/src/orm/where-clause-compiler.ts:300`
- Prefix optimizations:
  - `packages/kitcn/src/orm/where-clause-compiler.ts:331`
  - `packages/kitcn/src/orm/where-clause-compiler.ts:366`
  - `packages/kitcn/src/orm/where-clause-compiler.ts:534`
- Existing compiler tests for these strategies:
  - `test/orm/where-clause-compiler.test.ts:47`
  - `test/orm/where-clause-compiler.test.ts:140`
  - `test/orm/where-clause-compiler.test.ts:154`
  - `test/orm/where-clause-compiler.test.ts:168`
- Existing type expectations around allowFullScan:
  - `test/types/select.ts:1387`
  - `test/types/select.ts:1400`

### Institutional Learnings
- Keep null checks explicit (`isNull` / `isNotNull`) and keep operator contracts explicit in type tests:
  - `docs/solutions/typescript-patterns/select-ts-type-inference-drizzle-patterns-20260202.md:124`
  - `docs/solutions/typescript-patterns/select-ts-type-inference-drizzle-patterns-20260202.md:206`

### Brainstorm / Related Work
- `docs/brainstorms/2026-02-07-orm-pre-release-comprehensive-brainstorm.md:14`
- `docs/analysis/2026-02-05-orm-performance-checklist.md:18`

### External Research
- Skipped. Strong local context and existing code/test coverage are sufficient for this issue.

## Unresolved Questions
- Require `allowFullScan` for `ne`/`notIn`/`isNotNull` at type-level too?
- Keep strict=false behavior unchanged in this issue?
- Warn once per query or once per risky reason?
