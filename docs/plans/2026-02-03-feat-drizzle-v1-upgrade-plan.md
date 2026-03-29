---
title: "feat: Drizzle v1 upgrade for kitcn ORM (breaking)"
type: feat
date: 2026-02-03
---

# ✨ Drizzle v1 Upgrade (Breaking)

## Overview
Upgrade kitcn ORM from Drizzle stable (v0.45.x) to Drizzle v1 with full API parity for Convex-relevant features. This is a clean break: remove v0.45 API entirely, mirror `drizzle-v1` behavior and typings, and align tests/docs with v1.

## Problem Statement
The current ORM mirrors Drizzle stable and diverges from Drizzle v1’s API and typing patterns. Maintaining compatibility with v0.45 limits parity, increases type complexity, and blocks alignment with Drizzle’s latest TypeScript patterns and test coverage. We need a v1-only surface that mirrors `drizzle-v1` to reduce drift and keep typing behavior aligned with Drizzle’s canonical patterns.

## Proposed Solution
Adopt a v1-only API surface that mirrors the `drizzle-v1` repo as canonical reference for behavior, typings, and tests. Implement schema/relations/query/mutation upgrades, mirror Drizzle v1 tests (type + runtime), document Convex-specific divergences, and publish a migration guide. Choose one primary Drizzle integration (most relevant to Convex) as the reference for typing and tests.

## Stakeholders
- **Library users**: migrate existing apps to v1 syntax.
- **Maintainers**: enforce parity with Drizzle v1 and prevent drift.
- **Docs consumers**: need clear v1-only guidance and migration steps.

## Technical Approach

### Architecture
- **Canonical reference**: `drizzle-v1` repo is the single source of truth for v1 behavior/typing.
- **Primary integration**: pick one DB integration (likely PG) as the typing + test baseline.
- **Convex adaptation layer**: explicitly document and test divergences where Convex semantics differ.
- **Test mirroring**: copy Drizzle v1 tests, adapt to Convex, and keep structure aligned.

## Drizzle v1 Source Map (dig)
- `drizzle-orm/src/relations.ts` defineRelations, relation helpers.
- `drizzle-orm/src/_relations.ts` extractTablesRelationalConfig, BuildRelationalQueryResult, mapRelationalRow.
- `drizzle-orm/src/pg-core/query-builders/query.ts` relational query builder (v1).
- `drizzle-orm/src/pg-core/query-builders/_query.ts` legacy relational builder (diff reference).
- `drizzle-orm/src/pg-core/query-builders/insert.ts` insert + returning + upsert.
- `drizzle-orm/src/pg-core/query-builders/update.ts` update + returning.
- `drizzle-orm/src/pg-core/query-builders/delete.ts` delete + returning.
- `drizzle-orm/tests/rqb-builders.test.ts` relational query builder runtime tests.
- `drizzle-orm/tests/relation.test.ts` relations runtime tests.
- `drizzle-orm/tests/type-hints.test.ts` type hint runtime tests.
- `drizzle-orm/type-tests/pg/*` canonical PG type tests to mirror.
- `changelogs/drizzle-orm/*.md` v1 changelog source.
- `docs/learn-drizzle.md` local quick ref.

### Implementation Phases

#### Phase 0: Decisions + Baseline (Week 1)
- Decide canonical Drizzle integration (PG vs other) and document in plan.
- Create a reference map doc for v1 API diffs.
- Confirm test mirroring strategy and folders.

**Deliverables**
- Decision note in `docs/brainstorms/2026-02-03-drizzle-v1-upgrade-brainstorm.md`.
- Reference map in `docs/learn-drizzle.md` (v1-specific notes).
- Test scaffolding notes in `convex/test-types/README.md`.

**Files**
- `docs/learn-drizzle.md`
- `docs/brainstorms/2026-02-03-drizzle-v1-upgrade-brainstorm.md`
- `convex/test-types/README.md`

#### Phase 1: Schema + Relations v1 (Weeks 1-3)
- Implement v1 relations API (centralized `defineRelations`, `from`/`to`, `alias`, `.through`).
- Update column array notation (`array('[][]')`).
- Align relation config extraction + typing with Drizzle v1.

**Deliverables**
- V1 relations API works end-to-end.
- Type tests mirrored for relations.
- Runtime relation loading works with v1 config.

**Files**
- `packages/kitcn/src/orm/relations.ts`
- `packages/kitcn/src/orm/extractRelationsConfig.ts`
- `packages/kitcn/src/orm/builders/column-builder.ts`
- `packages/kitcn/src/orm/types.ts`
- `convex/test-types/db-rel.ts`
- `convex/orm/relations.test.ts`

#### Phase 2: Query Syntax v1 (Weeks 3-5)
- Replace callback-style `where/orderBy` with object syntax.
- Add relation filtering and predefined relation filters.
- Add relation `offset` support.

**Deliverables**
- v1 query object syntax works with Convex.
- Type tests mirror Drizzle v1 for filters and relations.
- Runtime tests cover relation filtering and offsets.

**Files**
- `packages/kitcn/src/orm/query-builder.ts`
- `packages/kitcn/src/orm/where-clause-compiler.ts`
- `packages/kitcn/src/orm/query.ts`
- `packages/kitcn/src/orm/types.ts`
- `convex/test-types/select.ts`
- `convex/orm/query-builder.test.ts`
- `convex/orm/where-filtering.test.ts`

#### Phase 3: Mutations v1 (Weeks 5-7)
- Implement insert/update/delete builders with `.returning()` and upsert behavior.
- Mirror Drizzle v1 mutation typing patterns (InferInsertModel, InferSelectModel).
- Add runtime tests for mutations.

**Deliverables**
- v1 mutation API parity for Convex.
- Type tests mirror Drizzle v1.
- Runtime tests for insert/update/delete/upsert/returning.

**Files**
- `packages/kitcn/src/orm/database.ts`
- `packages/kitcn/src/orm/insert.ts`
- `packages/kitcn/src/orm/update.ts`
- `packages/kitcn/src/orm/delete.ts`
- `packages/kitcn/src/orm/types.ts`
- `convex/test-types/` (new mutation-focused type tests)
- `convex/write.test.ts`

#### Phase 4: Docs + Migration (Weeks 7-8)
- Update docs for v1-only API.
- Create breaking migration guide (v0.45 → v1).
- Update examples to v1 syntax.

**Deliverables**
- v1 docs published.
- Migration guide complete.
- Examples updated and consistent.

**Files**
- `docs/learn-drizzle.md`
- `docs/brainstorms/2026-01-31-drizzle-orm-brainstorm.md`
- `www/content/docs/orm/*`
- `example/convex/schema.ts`

## Alternative Approaches Considered
- **Dual API (v0.45 + v1)**: Rejected. Too much type complexity and doc confusion.
- **Adapter layer**: Rejected. Hides v1 semantics and introduces long-term maintenance.
- **Partial parity**: Rejected. Increases drift from Drizzle and undermines goal.

## SpecFlow Analysis (Developer Journeys)

### User Flow Overview
1. **New user (v1-only)**: define schema → define relations → run queries → run mutations → run type tests.
2. **Existing user migration**: update schema syntax → update relations API → update query syntax → update mutations → fix tests/docs.
3. **Maintainer parity check**: mirror Drizzle tests → adapt for Convex → validate typing + runtime.

### Flow Permutations Matrix
- **User state**: new vs migrating.
- **Context**: type-only usage vs runtime usage.
- **Entry point**: schema-first vs query-first.
- **Environment**: local tests vs CI.

### Missing Elements & Gaps
- **Migration scope**: exact list of breaking changes, codemod vs manual.
- **Relation filtering semantics**: how to map to Convex queries without surprises.
- **Primary integration choice**: PG vs other as canonical reference.
- **Convex divergence list**: which Drizzle behaviors are not supported.

### Critical Questions Requiring Clarification
1. **Critical**: Which Drizzle integration is canonical for v1 parity?
2. **Critical**: Which Drizzle behaviors cannot map to Convex (must document)?
3. **Important**: Migration guidance depth (docs only vs codemods)?
4. **Important**: Relation filter semantics for Convex query planner?

### Recommended Next Steps
- Decide canonical integration now (affects tests + types).
- Draft divergence list as a living doc.
- Define migration guide scope early to avoid rework.

## Acceptance Criteria
- [x] v1-only API; no v0.45 compatibility.
- [x] Schema, relations, query syntax, and mutations mirror `drizzle-v1` for Convex-relevant parts.
- [x] Type tests mirror Drizzle v1 with minimal Convex adaptations.
- [x] Runtime tests pass for relations, query object syntax, and mutations.
- [x] Docs updated to v1-only and migration guide published.

## Success Metrics
- Typecheck passes with mirrored v1 tests.
- Runtime tests pass for ORM modules.
- Documentation fully v1-only with zero v0.45 references.
- Measurable reduction in divergence vs Drizzle v1 (tracked in divergence list).

## Dependencies & Prerequisites
- Access to `drizzle-v1` repo as canonical reference.
- Decision on primary integration (PG vs other).
- Availability of Convex test harness for runtime verification.

## ⚠️ Risk Analysis & Mitigation
- **Type inference regressions**: follow Drizzle patterns (GetColumnData, Merge) and mirror tests.
- **Convex schema integration breaks**: keep convex-ents pattern (TableDefinition duck typing).
- **Unimplemented features tested too early**: defer tests until feature runtime is complete.
- **Relation filtering mismatch**: document divergences and test them explicitly.
- **Docs drift**: update `docs/learn-drizzle.md` and `www/content/docs/orm` in same PR.

## Resource Requirements
- TypeScript expert review for typing parity.
- Maintainer time for migration guide and doc updates.
- CI time for extended type + runtime tests.

## Future Considerations
- Add additional Drizzle integrations if Convex adds support for new query semantics.
- Consider codemods if migration volume is high.

## 📚 Documentation Plan
- Update `docs/learn-drizzle.md` to v1-only guidance and mark breaking changes.
- Update `www/content/docs/orm/*` to match v1 syntax.
- Add a dedicated migration guide: `docs/orm/drizzle-v1-migration.md`.
- Update example schema + queries in `example/convex/schema.ts` and `example/convex/functions/*`.

**ERD**: not applicable (no new model changes).

## Quality Gates
- After each package change: `bun --cwd packages/kitcn build`.
- After each package change: `touch example/convex/functions/schema.ts`.
- After each package change: `bun typecheck`.
- After each package change: `bun run test`.
- Use `convex-test-orm` skill when adding Convex runtime/type tests.

## References & Research

### Internal References
- `docs/brainstorms/2026-02-03-drizzle-v1-upgrade-brainstorm.md:16`
- `docs/learn-drizzle.md:5`
- `docs/learn-drizzle.md:73`
- `packages/kitcn/src/orm/relations.ts`
- `packages/kitcn/src/orm/types.ts`
- `convex/test-types/select.ts`
- `convex/orm/relations.test.ts`

### Institutional Learnings
- **Select.ts Type Inference – Drizzle GetColumnData Pattern**
  - File: `docs/solutions/typescript-patterns/select-ts-type-inference-drizzle-patterns-20260202.md`
  - Key Insight: Use Drizzle’s GetColumnData with 'raw' vs 'query' modes for filter values.
- **Phantom Type Brand Preservation**
  - File: `docs/solutions/typescript-patterns/phantom-type-brand-preservation-20260202.md`
  - Key Insight: Avoid intersection types; use Merge utilities to preserve phantom brands.
- **ConvexTable Schema Integration**
  - File: `docs/solutions/integration-issues/convex-table-schema-integration-20260202.md`
  - Key Insight: Follow convex-ents duck typing pattern for TableDefinition compatibility.
- **Type Testing Deferred Features**
  - File: `docs/solutions/workflow-issues/type-testing-defer-unimplemented-features-20260202.md`
  - Key Insight: Defer tests for unimplemented runtime features; use TODO markers.

### External References
- `https://github.com/zbeyens/drizzle-v1`
- `https://github.com/drizzle-team/drizzle-orm`
- Local clone: `/tmp/cc-repos/drizzle-v1`

## AI-Era Considerations
- Keep prompts that worked in `docs/solutions/` and update with v1 specifics.
- Prefer mirroring Drizzle tests verbatim before adapting to Convex.
- Require human review for any AI-generated typing changes (high-risk area).

## Unresolved Questions
- Canonical integration?
- Convex divergences list?
- Migration guide depth?
- Relation filter semantics?
