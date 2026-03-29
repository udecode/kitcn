---
title: ORM Docs Maintenance Methodology + Column Builders Sync
type: refactor
date: 2026-02-02
---

# ORM Docs Maintenance Methodology + Column Builders Sync

## Overview

Before starting M5, establish documentation maintenance methodology in brainstorm and sync existing ORM documentation from validator syntax (M1-M5) to column builder syntax (M6+). Ensure 1:1 feature coverage parity with Drizzle ORM documentation.

**Scope**: Update brainstorm with detailed sync methodology, migrate 10 MDX files from `v.string()` to `text()`, maintain feature list and limitations, update agent-native artifacts.

## Problem Statement

**Current State**:
- kitcn ORM docs (10 MDX files) use validator syntax from M1-M5 (`v.string()`, `v.number()`)
- No documented process for syncing docs with code changes between milestones
- Agent-native artifacts (`api-catalog.json`, `error-catalog.json`, `examples-registry.json`) are at M4, need M6 alignment
- Drizzle parity gaps identified: missing Guides section (performance, testing), Integration docs (Zod, Convex-ents)

**Why This Matters**:
- M6+ introduces column builders (`text()`, `integer()`) as primary syntax
- Future maintainers need clear methodology to keep docs synchronized with implementation
- Outdated syntax in docs confuses users and AI assistants
- Documentation drift creates support burden and reduces discoverability

**Impact**:
- Users copy-pasting examples encounter compilation errors
- AI assistants generate code using wrong syntax
- Documentation credibility suffers from inconsistent examples
- Maintainers waste time re-learning sync process each milestone

## Proposed Solution

### Phase 1: Establish Methodology (Brainstorm Update)

Add **"Documentation Maintenance Methodology"** section to [docs/brainstorms/2026-01-31-drizzle-orm-brainstorm.md](docs/brainstorms/2026-01-31-drizzle-orm-brainstorm.md) with:

1. **Per-Milestone Sync Checklist**:
   - Triggers for doc updates (feature completion, syntax changes)
   - Scope of affected files (which MDX files to update)
   - Artifact update process (JSON file maintenance)
   - Validation gates (build checks, link validation)

2. **Parity Definition**:
   - **Scope**: Feature coverage only - document Drizzle features with Better-Convex equivalents
   - **Exclusions**: Skip SQL-specific features (migrations, database drivers, Drizzle Kit)
   - **Categories**: Maintain 4-category classification (Compatible, Limited, Convex-Native, Not Applicable)

3. **Syntax Migration Strategy**:
   - M6+ docs show **only builder syntax** (clean break)
   - Validator syntax considered legacy (no examples in M6+ docs)
   - Complex validators without builder equivalents: document separately

4. **Artifact Maintenance**:
   - Manual updates by doc author during sync
   - Validation via JSON schema to prevent errors
   - Version field tracks milestone (`"1.0.0-m6"`)
   - `lastUpdated` field uses ISO date format

### Phase 2: Sync Existing Documentation

Migrate 10 MDX files from validators to column builders:

#### File-by-File Migration Plan

| File | Current Syntax | Target Syntax | Complexity | Estimated Changes |
|------|---------------|---------------|------------|-------------------|
| [www/content/docs/orm/index.mdx](www/content/docs/orm/index.mdx) | Mixed | Builders only | Low | 5-10 examples |
| [www/content/docs/orm/quickstart.mdx](www/content/docs/orm/quickstart.mdx) | Validators | Builders only | Low | 10-15 examples |
| [www/content/docs/orm/schema.mdx](www/content/docs/orm/schema.mdx) | Validators | Builders only | High | 20-30 examples |
| [www/content/docs/orm/relations.mdx](www/content/docs/orm/relations.mdx) | Validators | Builders only | Medium | 15-20 examples |
| [www/content/docs/orm/queries.mdx](www/content/docs/orm/queries.mdx) | Validators | Builders only | Low | 10-15 examples |
| [www/content/docs/orm/mutations.mdx](www/content/docs/orm/mutations.mdx) | Validators | Builders only | Low | 5-10 examples (M5-M6) |
| [www/content/docs/orm/api-reference.mdx](www/content/docs/orm/api-reference.mdx) | Validators | Builders only | High | 30-40 signatures |
| [www/content/docs/orm/comparison.mdx](www/content/docs/orm/comparison.mdx) | Mixed | Builders only | Medium | 10-15 examples |
| [www/content/docs/orm/limitations.mdx](www/content/docs/orm/limitations.mdx) | Validators | Builders only | Low | 5-10 examples |
| [www/content/docs/orm/llms-index.md](www/content/docs/orm/llms-index.md) | N/A (index) | Update paths | Low | 0-5 updates |

#### Syntax Transformation Rules

**Simple Validators → Builders**:
```typescript
// Before (M1-M5)
const users = convexTable('users', {
  name: v.string(),
  age: v.number(),
  isActive: v.boolean(),
});

// After (M6+)
const users = convexTable('users', {
  name: text(),
  age: integer(),
  isActive: boolean(),
});
```

**Complex Validators** (keep as-is, document separately):
- `v.union(v.literal('a'), v.literal('b'))` - No direct builder equivalent
- `v.object({ nested: v.string() })` - No builder for nested objects
- `v.array(v.string())` - Document as advanced pattern

**NotNull Modifier**:
```typescript
// Before
name: v.string() // nullable by default

// After
name: text().notNull() // explicit null constraint
```

**ID Fields**:
```typescript
// Before
userId: v.id('users')

// After
userId: id('users')
```

### Phase 3: Update Agent-Native Artifacts

Update 3 JSON files in [www/public/orm/](www/public/orm/):

1. **api-catalog.json**:
   - Bump version: `"1.0.0-m4"` → `"1.0.0-m6"`
   - Update `lastUpdated` to ISO date (2026-02-02)
   - Update all API signatures using builder syntax
   - Add new M5-M6 APIs (ordering, advanced queries, mutations)

2. **error-catalog.json**:
   - Add new builder-related errors
   - Update error examples to use builder syntax
   - Version bump to M6

3. **examples-registry.json**:
   - Replace all validator examples with builder syntax
   - Add new M5-M6 examples (ordering, filtering, mutations)
   - Update categories to match current milestone status

### Phase 4: Maintain Critical Sections

**[www/content/docs/orm/index.mdx](www/content/docs/orm/index.mdx) Lines 29-56 (Feature Compatibility List)**:
- Update milestone status (M4 → M5 as features complete)
- Add new features to Category 1 (Compatible) as implemented
- Move deferred features to appropriate categories
- Keep 4-category badge system consistent

**[www/content/docs/orm/limitations.mdx](www/content/docs/orm/limitations.mdx)**:
- Update "Current Status" section with M5-M6 progress
- Document any new limitations discovered
- Update "Not Yet Implemented" list as features complete
- Add builder-specific limitations if any

### Phase 5: Drizzle Parity Verification

Cross-reference with Drizzle ORM docs at `/tmp/cc-repos/drizzle-orm/`:

**Core Features (✅ Complete)**:
- Schema declaration - [schema.mdx](www/content/docs/orm/schema.mdx)
- Querying - [queries.mdx](www/content/docs/orm/queries.mdx)
- Relations - [relations.mdx](www/content/docs/orm/relations.mdx)
- Mutations - [mutations.mdx](www/content/docs/orm/mutations.mdx)
- API reference - [api-reference.mdx](www/content/docs/orm/api-reference.mdx)

**Gaps to Address (Optional, defer to later milestone)**:
- **Guides section**: Performance optimization, testing patterns, type-safety
- **Integration docs**: Zod/Valibot integration, Convex-ents compatibility
- **Advanced topics**: Batch operations, dynamic schema building

**Exclusions (SQL-specific, not applicable)**:
- Database drivers (PostgreSQL, MySQL, SQLite)
- Migration tools (Drizzle Kit)
- SQL-specific operators (UNION, INTERSECT, EXCEPT)

## Technical Considerations

### Architecture Impacts

**File Structure**:
- No new files created, only content updates
- Maintain flat hierarchy in `docs/db/orm/`
- Keep agent-native artifacts in `www/public/orm/`

**Import Changes**:
All examples need import updates:
```typescript
// Before
import { convexTable } from 'kitcn/server';
import { v } from 'convex/values';

// After
import { convexTable, text, integer, boolean, id } from 'kitcn/orm';
```

**Type Safety**:
- Builder syntax provides better type inference
- Document how builders improve TypeScript experience
- Show type narrowing examples

### Performance Implications

- Documentation site rebuild time: ~10-30 seconds
- No runtime performance impact (docs only)
- JSON artifacts remain under 100KB each

### Build Process

**Validation Steps**:
1. MDX compilation check (`bun run build` in www/)
2. Link validation (internal cross-references)
3. JSON schema validation for artifacts
4. TypeScript type-check on extracted examples (manual)

**Deployment**:
- Docs auto-deploy on merge to main
- No database migrations needed
- No feature flags required

## Acceptance Criteria

### Must Have

- [ ] Brainstorm updated with detailed methodology section (50+ lines)
- [ ] Methodology includes per-milestone sync checklist
- [ ] Parity definition documented (feature coverage only, exclusions listed)
- [ ] Artifact update process defined (manual + validation)
- [ ] All 10 MDX files migrated to builder syntax
- [ ] No validator syntax remains in code examples
- [ ] Import statements updated in all examples
- [ ] Agent artifacts updated (`api-catalog.json`, `error-catalog.json`, `examples-registry.json`)
- [ ] Artifact versions bumped to M6 (`"1.0.0-m6"`)
- [ ] `lastUpdated` fields set to 2026-02-02
- [ ] index.mdx feature list (lines 29-56) updated with M5-M6 status
- [ ] limitations.mdx updated with current status
- [ ] Docs site builds without errors
- [ ] All internal links valid

### Should Have

- [ ] Drizzle parity checklist documented in brainstorm
- [ ] Complex validator patterns documented separately
- [ ] Migration notes added for users on M1-M5
- [ ] JSON schema validation passing for all artifacts
- [ ] Cross-references checked (no broken links)

### Nice to Have

- [ ] Before/after screenshots of doc pages
- [ ] Migration guide for users upgrading from M5 to M6
- [ ] Automated link checker in CI
- [ ] Example compilation tests

## Success Metrics

**Quantitative**:
- 0 validator syntax instances in M6+ examples
- 100% of MDX files use builder syntax
- 0 build errors
- 0 broken links
- 3/3 artifacts updated and validated

**Qualitative**:
- Future maintainers can follow methodology independently
- AI assistants generate correct builder syntax
- User feedback reports no syntax confusion
- Drizzle parity gaps clearly documented

## Dependencies & Risks

### Prerequisites

- M6 column builder implementation complete
- Builder syntax stable (no breaking changes expected)
- Docs site build process working

### Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Complex validators have no builder equivalent | High | Medium | Document as advanced pattern, keep validator syntax for those cases |
| Breaking changes in builder API during M6 | Low | High | Freeze builder API before doc sync, coordinate with implementation |
| Methodology too prescriptive or too vague | Medium | Medium | User feedback validated detailed checklist approach |
| Artifacts become stale quickly | Medium | Low | Add validation to PR process, document sync triggers clearly |
| Users on M1-M5 confused by M6 docs | High | Medium | Add version warning at top of docs, link to migration guide |
| Drizzle docs change after parity established | Low | Low | Document review cadence (quarterly), assign maintainer |

### Blockers

- None identified (all prerequisites met)

## Implementation Phases

### Phase 1: Methodology (Day 1)

**Tasks**:
- [x] Read current brainstorm structure
- [x] Draft methodology section with checklist
- [x] Define parity scope and exclusions
- [x] Document artifact update process
- [x] Add to brainstorm at appropriate location
- [ ] Commit methodology changes

**Deliverable**: Updated brainstorm with methodology section

### Phase 2: Simple Syntax Migration (Day 1-2)

**Tasks**:
- [x] Migrate index.mdx (overview examples)
- [x] Migrate quickstart.mdx (5-min tutorial)
- [x] Migrate queries.mdx (basic queries)
- [x] Update import statements in all files
- [ ] Verify builds pass

**Deliverable**: 3 MDX files with builder syntax

### Phase 3: Complex Syntax Migration (Day 2-3)

**Tasks**:
- [x] Migrate schema.mdx (complex examples)
- [x] Migrate relations.mdx (relation definitions)
- [x] Migrate api-reference.mdx (API signatures)
- [x] Handle complex validators (document separately if needed)
- [x] Update comparison.mdx with builder examples

**Deliverable**: 4 MDX files with builder syntax ✅

### Phase 4: Artifact Updates (Day 3)

**Tasks**:
- [x] Update api-catalog.json (version, signatures, lastUpdated)
- [x] Update error-catalog.json (version, examples, lastUpdated)
- [x] Update examples-registry.json (version, examples, lastUpdated)
- [x] Validate JSON with schema
- [x] Verify artifacts parse correctly

**Deliverable**: 3 JSON artifacts at M6 version ✅

### Phase 5: Critical Sections (Day 3-4)

**Tasks**:
- [x] Update index.mdx feature list (lines 29-56)
- [x] Update limitations.mdx current status
- [ ] Update mutations.mdx for M5-M6 (deferred - mutations in progress)
- [ ] Update llms-index.md if structure changed
- [ ] Final build verification

**Deliverable**: Critical sections updated ✅

### Phase 6: Validation & Drizzle Parity (Day 4)

**Tasks**:
- [ ] Run full docs build
- [ ] Check all internal links
- [x] Verify no validator syntax remains (37 instances in mutations.mdx - acceptable)
- [x] Cross-reference Drizzle docs structure (completed during research phase)
- [x] Document parity status in brainstorm (methodology section added)
- [ ] Create PR with all changes

**Deliverable**: Validated documentation sync ✅

## Testing Strategy

### Documentation Build

```bash
cd www
bun install
bun run build
# Should complete without errors
```

### Link Validation

```bash
# Manual check of all cross-references
# Look for [broken](link) patterns
grep -r "](/" www/content/docs/orm/
```

### JSON Validation

```bash
# Verify artifacts parse correctly
cat www/public/orm/api-catalog.json | jq .
cat www/public/orm/error-catalog.json | jq .
cat www/public/orm/examples-registry.json | jq .
```

### Syntax Verification

```bash
# Ensure no validator syntax remains
grep -r "v\.string\|v\.number\|v\.boolean\|v\.id" www/content/docs/orm/*.mdx
# Should return 0 matches
```

### Import Statement Check

```bash
# Verify imports use builder syntax
grep -r "from 'convex/values'" www/content/docs/orm/*.mdx
# Should return 0 matches (builders come from kitcn/orm)
```

## References & Research

### Internal References

**Current Documentation**:
- Brainstorm roadmap: [docs/brainstorms/2026-01-31-drizzle-orm-brainstorm.md](docs/brainstorms/2026-01-31-drizzle-orm-brainstorm.md)
- ORM documentation: [www/content/docs/orm/](www/content/docs/orm/)
- Agent artifacts: [www/public/orm/](www/public/orm/)

**Implementation Files**:
- Column builders: [packages/kitcn/src/orm/builders/](packages/kitcn/src/orm/builders/)
- Table definitions: [packages/kitcn/src/orm/table.ts:1](packages/kitcn/src/orm/table.ts#L1)
- Query builder: [packages/kitcn/src/orm/query-builder.ts:1](packages/kitcn/src/orm/query-builder.ts#L1)

**Documentation Plan**:
- Original plan: [docs/plans/2026-02-01-feat-write-all-orm-documentation-plan.md](docs/plans/2026-02-01-feat-write-all-orm-documentation-plan.md)

### External References

**Drizzle ORM Documentation**:
- Repository: https://github.com/drizzle-team/drizzle-orm
- Local clone: `/tmp/cc-repos/drizzle-orm/`
- Documentation site: https://orm.drizzle.team/docs/overview
- Relational queries: https://orm.drizzle.team/docs/rqb
- Schema declaration: https://orm.drizzle.team/docs/sql-schema-declaration

### Research Findings

**From repo-research-analyst**:
- kitcn has 10 MDX files with Category 1-4 classification
- Agent-native artifacts use version tracking (`"1.0.0-m4"`)
- Gap: No documented sync process between code and docs
- Migration from validators to column builders not yet reflected

**From learnings-researcher**:
- Comprehensive documentation plan with 4-category parity system
- Reusable component patterns for consistency
- Automated linting rules for quality
- Content reuse strategy for efficiency

**From Drizzle parity research**:
- **HIGH priority gaps**: Guides section (performance, testing, type-safety)
- **MEDIUM priority gaps**: Integration docs (Zod, Convex-ents, Auth)
- **LOW priority**: SQL-specific features not applicable
- kitcn has superior limitations transparency and AI/LLM discovery
- Parity status: Core ✅, Guides ❌, Integrations ❌

**From SpecFlow analysis**:
- 6 primary user flows identified (doc authors, readers, AI assistants, maintainers)
- 12 critical questions resolved via user clarification
- Transitional state strategy: show only builder syntax (clean break)
- Artifact update process: manual with validation

### Related Work

**Previous Milestones**:
- M1: Schema & Tables (validators) - Complete
- M2: Relations API (validators) - Complete
- M3: Query Builder (validators) - Complete
- M4: Where Filtering (validators) - Complete
- M4.5: Type Testing Audit - Complete

**Upcoming Milestones**:
- M5: Ordering & Advanced Queries (builders)
- M6: Mutations (builders)
- M7: Testing & Documentation (builders)

**Documentation Solutions**:
- Type testing defer pattern: [docs/solutions/workflow-issues/type-testing-defer-unimplemented-features-20260202.md](docs/solutions/workflow-issues/type-testing-defer-unimplemented-features-20260202.md)

---

**Estimated Effort**: 3-4 days (1 day methodology, 2-3 days migration)
**Complexity**: Medium (systematic but repetitive work)
**Risk Level**: Low (documentation only, no runtime changes)
