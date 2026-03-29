---
title: Write Complete Better-Convex ORM Documentation
type: feat
date: 2026-02-01
deepened: 2026-02-01
---

# Write Complete Better-Convex ORM Documentation

## 🔬 Enhancement Summary

**Deepened on**: 2026-02-01
**Sections enhanced**: 8 (Technical Approach, Page Structure, Code Examples, Components, Navigation, Phases, Content Strategy, Acceptance Criteria)
**Research agents used**: 8 parallel agents (best-practices-researcher, framework-docs-researcher, kieran-typescript-reviewer, code-simplicity-reviewer, architecture-strategist, pattern-recognition-specialist, agent-native-reviewer, performance-oracle)

### Key Improvements

1. **Simplified Structure**: Reduced from 26 pages to 20 core pages, flattened navigation from 6 sections to 13 top-level pages
2. **TypeScript Excellence**: Added type inference examples, negative examples, and IDE DX documentation throughout
3. **Agent-Native Features**: Added llms-index.md, api-catalog.json, error-catalog.json, and examples registry for AI discoverability
4. **Performance Documentation**: Added N+1 prevention patterns, index performance matrix, and pagination strategy comparisons
5. **Reusable Components**: Created DrizzleComparison, GotchasTable, PerformanceMatrix components for consistency
6. **Progressive Disclosure**: Three-column layout (Quick Start | Core Docs | Advanced/Reference) for better learning flow

### New Considerations Discovered

- **Documentation Structure**: Three-column progressive disclosure more effective than deep hierarchical navigation
- **TypeScript Patterns**: Need explicit type inference examples showing what developers get, not just what they write
- **Agent-Native Design**: Machine-readable indexes (llms-index.md, api-catalog.json) critical for AI-assisted development
- **Performance Documentation**: Need concrete benchmarks and N+1 prevention patterns, not just abstract guidance
- **Consistency**: Automated linting for code examples and MDX structure prevents drift
- **Migration Priority**: Migration guides should be Phase 1, not Phase 4 - highest value for Drizzle/Prisma users

## Overview

Create comprehensive documentation for Better-Convex ORM that mirrors Drizzle ORM's structure while adapting to fumadocs syntax and highlighting Convex-specific advantages. This documentation will help developers familiar with Drizzle/Prisma migrate seamlessly to Better-Convex.

**Goal**: Every Drizzle documentation page has a Better-Convex equivalent, showing exact API mappings, workarounds for limitations, and Convex-native advantages.

## Problem Statement

Developers coming from SQL ORMs (Drizzle, Prisma) face a steep learning curve when adopting Convex. While Better-Convex ORM provides Drizzle-compatible APIs (M1-M3 complete, M4 in progress), there's **no documentation** showing:

1. How Drizzle patterns map to Better-Convex
2. Which features are 100% compatible vs limited
3. Workarounds for SQL-specific features not available in Convex
4. Convex-native advantages (real-time, edges, cursor pagination)

**Current State**:
- ✅ ORM implementation: M1-M3 complete (schema, relations, queries)
- ✅ Feature categorization: 4-category system documented in brainstorm
- ✅ Documentation infrastructure: fumadocs setup in `www/content/docs/`
- ❌ **No ORM documentation**: Zero pages exist for ORM features

**Impact**: Without docs, developers can't discover or use the ORM features we've built.

## Proposed Solution

Write **26 comprehensive documentation pages** organized into 6 sections, mirroring Drizzle's structure but adapted for Better-Convex:

```
www/content/docs/
└── db/
    ├── orm/
    │   ├── index.mdx                    # Overview & Getting Started
    │   ├── quickstart.mdx              # 5-minute setup guide
    │   ├── schema/
    │   │   ├── tables.mdx              # convexTable() definition
    │   │   ├── relations.mdx           # one(), many() relations
    │   │   ├── indexes.mdx             # Index configuration
    │   │   └── types.mdx               # Type inference, validators
    │   ├── queries/
    │   │   ├── relational.mdx          # findMany(), findFirst()
    │   │   ├── select.mdx              # Column selection
    │   │   ├── filtering.mdx           # where clause, operators
    │   │   ├── ordering.mdx            # orderBy, asc, desc
    │   │   ├── pagination.mdx          # limit/offset + cursor
    │   │   └── joins.mdx               # with option for relations
    │   ├── mutations/
    │   │   ├── insert.mdx              # insert().values()
    │   │   ├── update.mdx              # update().set().where()
    │   │   └── delete.mdx              # delete().where()
    │   ├── advanced/
    │   │   ├── type-safety.mdx         # Generic patterns
    │   │   ├── dynamic-queries.mdx     # Conditional building
    │   │   └── real-time.mdx           # Convex reactivity
    │   ├── guides/
    │   │   ├── migration-drizzle.mdx   # Drizzle → Better-Convex
    │   │   ├── migration-prisma.mdx    # Prisma → Better-Convex
    │   │   ├── migration-ents.mdx      # Ents → ORM
    │   │   └── best-practices.mdx      # Patterns & gotchas
    │   └── reference/
    │       ├── api.mdx                 # Complete API surface
    │       ├── operators.mdx           # All filter operators
    │       └── limitations.mdx         # Category 2 & 4 features
```

**Total**: 26 MDX files across 6 subdirectories

## Technical Approach

### 1. Documentation Categories (From Brainstorm)

Each page explicitly shows which category the feature falls into:

**Category 1: 100% Drizzle Compatible** (Green badge)
- Side-by-side identical code examples
- "✅ API Compatibility: 100%" callout

**Category 2: Limited/Workaround** (Yellow badge)
- Show Drizzle approach, then Better-Convex alternatives
- "⚠️ Limitation" + "💡 Workaround" callouts
- Performance comparison table

**Category 3: Convex-Native** (Blue badge)
- Highlight advantages over Drizzle
- "✅ Convex Advantage" callouts
- Use case examples

**Category 4: Not Applicable** (Gray badge)
- Explain why not needed in Convex
- Show Convex alternative
- "❌ Not Needed" callout

#### 🔬 Research Insights: Documentation Best Practices

**Progressive Disclosure Pattern**:
- Use three-column layout: Quick Start (left) | Core Docs (center) | Advanced/Reference (right)
- Users navigate linearly from left to right as they gain expertise
- Reduces cognitive load compared to deep hierarchical navigation

**Realistic Examples**:
- Use production-quality examples, not toy data
- Show actual use cases: blog platform, e-commerce, SaaS app
- Include error handling, edge cases, not just happy path

**Migration Guide Structure** (elevate to Phase 1):
- Side-by-side code comparison tables
- Common gotchas section with solutions
- Performance implications of API differences
- Link to equivalent Better-Convex patterns

**References**:
- Three-column pattern: https://stripe.com/docs, https://tailwindcss.com/docs
- Progressive complexity: https://orm.drizzle.team

### 2. Page Structure Template

Every page follows this fumadocs-compatible structure:

```mdx
---
title: {Feature Name}
description: {One-line SEO description}
links:
  doc: {Link to Drizzle equivalent if applicable}
---

import { InfoIcon, AlertTriangle, CheckCircle } from "lucide-react"

{Opening paragraph: What you'll learn in 1-2 sentences}

## Overview

**Category**: {1/2/3/4 with badge}

{Feature capabilities table}

## Drizzle Comparison

<Tabs groupId="orm" items={["Drizzle", "Better-Convex"]} persist>
  <Tab value="Drizzle">
    ```ts title="drizzle-example.ts"
    // Drizzle code
    ```
  </Tab>
  <Tab value="Better-Convex">
    ```ts title="convex/schema.ts"
    // Better-Convex equivalent
    ```
  </Tab>
</Tabs>

{Category-specific callout: ✅/⚠️/✅/❌ based on category}

## Setup

{Installation/configuration steps if needed}

## Basic Usage

{Simple example with explanation}

## Advanced Patterns

{Complex scenarios, edge cases}

## Common Gotchas

| Issue | Solution |
|-------|----------|
| ... | ... |

## Performance Considerations

{Index usage, optimization tips}

## Next Steps

<Cards>
  <Card title="Related Topic" href="/docs/orm/{page}" />
</Cards>
```

#### 🔬 Research Insights: Simplified Page Templates

**Reduce Complexity**:
- Remove redundant "Setup" section if installation is covered in quickstart
- Combine "Basic Usage" and "Advanced Patterns" into single "Usage" section with progressive examples
- Use inline callouts instead of separate "Common Gotchas" section when < 3 gotchas

**Use Emoji Badges**:
```mdx
**Category**: ✅ 100% Compatible | ⚠️ Limited | 🚀 Convex Advantage | ❌ Not Needed
```

**Simplification Impact**: Reduces average page length by 30%, improves readability

### 3. Code Example Format

Following Better-Convex conventions:

```mdx
```ts title="convex/schema.ts" showLineNumbers {2-5}
import { convexTable, relations } from 'kitcn/orm';
import { v } from 'convex/values';

const users = convexTable('users', {
  name: v.string(),
  email: v.string(),
});

const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
}));
```

// Generated Convex Query:
// ctx.db.query("users").collect()

// Type Inference:
// { _id: Id<'users'>, name: string, email: string, _creationTime: number }[]
```
```

**Patterns**:
- Always show imports
- Include file path in `title`
- Highlight key lines with `{2-5}`
- Show "Generated Convex Query" comment (like Drizzle shows SQL)
- Show "Type Inference" comment for complex types
- Use `showLineNumbers` for files > 10 lines

#### 🔬 Research Insights: TypeScript & Code Examples

**Critical TypeScript Documentation Gaps** (from kieran-typescript-reviewer):

1. **Show Type Inference Examples**:
```ts
// ❌ Don't just show API usage
const user = await db.query.users.findFirst();

// ✅ Show what developers get
const user = await db.query.users.findFirst();
// type: { _id: Id<'users'>, name: string, email: string, _creationTime: number } | null
```

2. **Include Negative Examples**:
```ts
// ❌ This won't work - type error
const users = db.query.users.where({ age: "25" }); // Type error: age is number

// ✅ Correct approach
const users = db.query.users.where({ age: 25 });
```

3. **Document IDE DX**:
- Show autocomplete screenshots for complex APIs
- Explain hover tooltips for type signatures
- Demonstrate "Go to Definition" for schema types

**Fumadocs Patterns** (from framework-docs-researcher):

- **Code blocks with titles**: Always use `title="file/path.ts"`
- **SQL-style output**: Show "Generated Convex Query" comments (mirrors Drizzle's SQL output)
- **Type annotations**: Add `// type: ...` comments for complex inferred types
- **Multiple examples per page**: Show 3-5 variations, not just one canonical example

**References**:
- Drizzle SQL output pattern: https://orm.drizzle.team/docs/rqb
- TypeScript DX examples: https://www.typescriptlang.org/docs

### 4. Component Usage

**Tabs** - For showing alternatives:
```mdx
<Tabs groupId="approach" items={["ORM", "Ents", "Raw Convex"]} persist>
  <Tab value="ORM">{/* Drizzle-style */}</Tab>
  <Tab value="Ents">{/* convex-ents style */}</Tab>
  <Tab value="Raw Convex">{/* ctx.db style */}</Tab>
</Tabs>
```

**Callouts** - For category-specific guidance:
```mdx
<Callout icon={<CheckCircle />}>
**✅ API Compatibility: 100%** - This API is identical to Drizzle
</Callout>

<Callout icon={<AlertTriangle />}>
**⚠️ Limitation**: Convex doesn't support SQL LIKE operators.
**💡 Workaround**: Use post-filter or index ranges.
</Callout>
```

**Cards** - For navigation:
```mdx
<Cards>
  <Card title="Relations" href="/docs/orm/schema/relations" />
  <Card title="Filtering" href="/docs/orm/queries/filtering" />
</Cards>
```

#### 🔬 Research Insights: Reusable Documentation Components

**Create Custom Components** (from pattern-recognition-specialist):

1. **DrizzleComparison Component**:
```tsx
// www/components/docs/DrizzleComparison.tsx
<DrizzleComparison
  drizzleCode="..."
  kitcnCode="..."
  category="compatible|limited|advantage|not-needed"
/>
```
Renders side-by-side tabs with automatic category badge and callout.

2. **GotchasTable Component**:
```tsx
<GotchasTable items={[
  { issue: "...", solution: "...", severity: "warning|info" }
]} />
```
Consistent formatting for common gotchas across all pages.

3. **PerformanceMatrix Component**:
```tsx
<PerformanceMatrix
  comparisons={[
    { feature: "...", drizzle: "...", kitcn: "...", notes: "..." }
  ]}
/>
```
Standardized performance comparison tables.

**Shared Code Snippets**:
- Create `/www/snippets/` directory for reusable code examples
- Import with: `import CodeSnippet from '@/snippets/schema-basic.ts'`
- Ensures consistency across pages, single source of truth

**Benefits**:
- Consistency across 20+ pages
- Easy bulk updates (change component, all pages update)
- Reduced maintenance burden

### 5. Navigation Configuration

#### 🔬 Research Insights: Simplified Navigation Structure

**Architecture Strategist Recommendation**: Flatten from 6 sections (26 pages) to 13 top-level pages (20 total).

**Recommended Structure** (Updated):

```json
{
  "pages": [
    "---Database---",
    "db/ents",
    "---ORM (Drizzle-Style)---",
    "db/orm",                           // Overview + Getting Started (combined)
    "db/orm/quickstart",               // 5-minute tutorial

    "---Core Concepts---",
    "db/orm/schema",                   // Tables + relations + types (combined)
    "db/orm/queries",                  // findMany/findFirst + select + filtering (combined)
    "db/orm/mutations",                // insert + update + delete (combined)

    "---Advanced---",
    "db/orm/relations-deep-dive",      // Advanced relation patterns
    "db/orm/ordering-pagination",      // orderBy + pagination strategies (combined)
    "db/orm/type-safety",              // Generic patterns + type inference
    "db/orm/real-time",                // Convex reactivity patterns

    "---Migration Guides---",
    "db/orm/from-drizzle",             // Drizzle → Better-Convex (PRIORITY)
    "db/orm/from-prisma",              // Prisma → Better-Convex
    "db/orm/from-ents",                // Ents → ORM

    "---Reference---",
    "db/orm/api-reference",            // Complete API surface + operators (combined)
    "db/orm/limitations",              // Category 2 & 4 features + performance

    "---Database (Core)---",
    "db/triggers",
    "db/filters",
    "db/aggregates"
  ]
}
```

**Changes from Original**:
- **Reduced from 26 to 20 pages** by combining related topics
- **Flattened hierarchy**: 13 top-level ORM pages instead of 6 nested sections
- **Elevated migration guides**: Moved from Phase 4 to Phase 1 - highest value for target audience
- **Consolidated entry points**: Single "schema" page instead of 4 separate pages

**Benefits**:
- Easier to scan full documentation in sidebar
- Reduced navigation depth (1 level vs 2-3 levels)
- Prioritizes migration guides for Drizzle/Prisma users
- Clearer learning path: Core → Advanced → Migration → Reference

### 6. Agent-Native Documentation Features

#### 🔬 Research Insights: Machine-Readable Documentation

**Critical for AI-Assisted Development** (from agent-native-reviewer):

Create machine-readable indexes alongside human docs:

1. **llms-index.md** (LLM discovery):
```markdown
# Better-Convex ORM Documentation Index

## Core Concepts
- /docs/orm/schema - Table definitions, relations, types
- /docs/orm/queries - Reading data with type-safe queries
- /docs/orm/mutations - Creating, updating, deleting records

## Migration Guides
- /docs/orm/from-drizzle - Drizzle ORM → Better-Convex mappings
- /docs/orm/from-prisma - Prisma → Better-Convex patterns

## Quick Reference
- convexTable() - Define table schema
- relations() - One-to-many, many-to-one relations
- findMany() - Query multiple records
- where() - Filter results
```

2. **api-catalog.json** (function discovery):
```json
{
  "schema": {
    "convexTable": {
      "signature": "convexTable<T>(name: string, fields: T): ConvexTable<T>",
      "example": "convexTable('users', { name: v.string() })",
      "docUrl": "/docs/orm/schema#convextable"
    }
  },
  "queries": {
    "findMany": {
      "signature": "findMany<T>(): QueryBuilder<T[]>",
      "example": "db.query.users.findMany()",
      "docUrl": "/docs/orm/queries#findmany"
    }
  }
}
```

3. **error-catalog.json** (error → solution mapping):
```json
{
  "Type 'string' is not assignable to type 'number'": {
    "cause": "Filter value type mismatch",
    "solution": "Check schema field type and use matching value",
    "docUrl": "/docs/orm/queries#type-safety",
    "example": "where({ age: 25 }) // not where({ age: '25' })"
  }
}
```

4. **examples-registry.json** (searchable examples):
```json
{
  "one-to-many-relation": {
    "title": "User has many posts",
    "code": "...",
    "tags": ["relations", "one-to-many"],
    "docUrl": "/docs/orm/schema#relations"
  }
}
```

**Files to Create**:
- `/Users/zbeyens/GitHub/kitcn/www/content/docs/orm/llms-index.md`
- `/Users/zbeyens/GitHub/kitcn/www/public/orm/api-catalog.json`
- `/Users/zbeyens/GitHub/kitcn/www/public/orm/error-catalog.json`
- `/Users/zbeyens/GitHub/kitcn/www/public/orm/examples-registry.json`

**Benefits**:
- LLMs can quickly find relevant docs without reading all pages
- Code assistants can suggest correct APIs based on catalog
- Error messages link directly to solutions
- Searchable examples across all documentation

## Implementation Phases

#### 🔬 Research Insights: Updated Phase Structure

**Key Changes**:
- Reduced total pages from 26 to 20 (combined related topics)
- Elevated migration guides to Phase 1 (highest value for target users)
- Added agent-native artifacts (llms-index, catalogs) to each phase
- Added performance documentation throughout, not just reference section

### Phase 1: Core Documentation + Migration (Priority: Critical)

**Pages**: 6 essential pages to unblock developers

1. **db/orm/index.mdx** - Overview + Getting Started (combined)
2. **db/orm/quickstart.mdx** - 5-minute tutorial
3. **db/orm/schema.mdx** - Tables + relations + types (combined from 4 pages)
4. **db/orm/queries.mdx** - findMany/findFirst + select + filtering (combined from 6 pages)
5. **db/orm/mutations.mdx** - insert + update + delete (combined from 3 pages)
6. **db/orm/from-drizzle.mdx** - **ELEVATED: Complete Drizzle migration guide**

**Agent-Native Artifacts**:
- [ ] **llms-index.md** - LLM discovery file
- [ ] **api-catalog.json** - Core APIs (schema, queries, mutations)

**Deliverables**: Developers can migrate from Drizzle and use core ORM features

**Success Criteria**:
- [ ] Drizzle developer can migrate and query in < 10 minutes
- [ ] All Category 1 (100% compatible) features documented
- [ ] Migration guide shows exact API mappings with code comparison
- [ ] Performance guidance included (N+1 prevention patterns)

### Phase 2: Advanced Patterns + Migration (Priority: High)

**Pages**: 5 advanced and migration pages

7. **db/orm/relations-deep-dive.mdx** - Advanced relation patterns (joins, nested queries)
8. **db/orm/ordering-pagination.mdx** - orderBy + cursor/offset strategies (combined)
9. **db/orm/type-safety.mdx** - Generic patterns + type inference examples
10. **db/orm/from-prisma.mdx** - Prisma migration guide
11. **db/orm/from-ents.mdx** - Ents → ORM migration guide

**Agent-Native Artifacts**:
- [ ] **error-catalog.json** - Common errors and solutions
- [ ] Update **api-catalog.json** with advanced APIs

**Deliverables**: Advanced features and all migration paths covered

**Success Criteria**:
- [ ] All M3 advanced query features documented
- [ ] All M4 filter operators documented with TypeScript examples
- [ ] Prisma and Ents migration guides complete
- [ ] Type inference examples show IDE DX

### Phase 3: Convex-Native Features + Reference (Priority: Medium)

**Pages**: 4 Convex-specific and reference pages

12. **db/orm/real-time.mdx** - Convex reactivity, subscriptions, live queries
13. **db/orm/api-reference.mdx** - Complete API surface + all operators (combined)
14. **db/orm/limitations.mdx** - Category 2 & 4 features + **Performance Deep Dive**

**Agent-Native Artifacts**:
- [ ] **examples-registry.json** - Searchable code examples
- [ ] Finalize **llms-index.md** with all pages

**Performance Documentation** (from performance-oracle):

Add to `db/orm/limitations.mdx`:

**N+1 Prevention Patterns**:
```ts
// ❌ N+1 Query (Bad)
const users = await db.query.users.findMany();
for (const user of users) {
  const posts = await db.query.posts.findMany({
    where: eq(posts.userId, user._id)
  });
}

// ✅ Eager Loading (Good)
const users = await db.query.users.findMany({
  with: { posts: true }
});
```

**Index Performance Matrix**:
| Query Pattern | Without Index | With Index | Recommendation |
|---------------|---------------|------------|----------------|
| `eq(field, val)` | O(n) scan | O(log n) | ✅ Always index |
| `gt/lt/gte/lte` | O(n) scan | O(log n) | ✅ Index for ranges |
| `like/ilike` | O(n) always | O(n) always | ⚠️ Use search index |

**Pagination Strategy Comparison**:
| Strategy | Performance | Use Case | Trade-offs |
|----------|-------------|----------|------------|
| Offset/Limit | O(n+offset) | Small datasets | ❌ Slow for deep pages |
| Cursor | O(log n) | Large datasets | ✅ Fast, but no random access |

**Deliverables**: Convex advantages + complete reference + performance guidance

**Success Criteria**:
- [ ] Real-time patterns documented with examples
- [ ] Complete API reference (all functions, operators)
- [ ] Performance benchmarks for common operations
- [ ] N+1 prevention patterns documented
- [ ] Index selection guidance provided

### Phase 4: Finalization (Priority: Low)

**Pages**: 2 final pages + infrastructure

15. **Update meta.json** - Add all pages to navigation with flattened structure
16. **Create custom components** - DrizzleComparison, GotchasTable, PerformanceMatrix

**Documentation Infrastructure**:
- [ ] Shared snippets in `/www/snippets/`
- [ ] Custom fumadocs components in `/www/components/docs/`
- [ ] Automated linting for MDX consistency (check code blocks, frontmatter)
- [ ] Link checker for internal documentation links

**Testing & Validation**:
- [ ] All code examples compile and run
- [ ] All internal links working
- [ ] All external references valid
- [ ] Fumadocs dev server renders all pages correctly

**Deliverables**: Complete, production-ready documentation suite

**Success Criteria**:
- [ ] All 20 pages published
- [ ] Navigation hierarchy complete
- [ ] All machine-readable artifacts generated (llms-index, catalogs)
- [ ] Zero broken links
- [ ] All code examples validated

## Content Strategy

### Reuse Drizzle Wording (Where Applicable)

For Category 1 (100% compatible) features:
1. Clone Drizzle's conceptual explanation
2. Adapt code examples to Better-Convex syntax
3. Keep the same section structure
4. Maintain Drizzle's technical terminology

**Example**:
```markdown
// Drizzle docs say:
"Relations are a way to define how tables are connected to each other."

// Better-Convex docs say:
"Relations are a way to define how tables are connected to each other.
In Better-Convex, relations use the same API as Drizzle ORM."
```

### Diverge for Limitations

For Category 2 (limited) features:
1. Start with Drizzle's explanation
2. Add "In Better-Convex" section showing workarounds
3. Include performance comparison table
4. Link to Convex-specific alternatives

### Emphasize Advantages

For Category 3 (Convex-native) features:
1. Explain what Drizzle lacks
2. Show Better-Convex advantage
3. Provide real-world use cases
4. Link to Convex docs for deep dives

#### 🔬 Research Insights: Consistency & Automation

**Automated Consistency Checks** (from pattern-recognition-specialist):

Create ESLint-style rules for MDX documentation:

```bash
# www/scripts/lint-docs.js
```

**Rules to enforce**:
1. **Code block titles**: All `ts`/`tsx` blocks must have `title="..."` attribute
2. **Frontmatter completeness**: Required fields: `title`, `description`, `links`
3. **Category badges**: Every page must declare category (✅/⚠️/🚀/❌)
4. **Type annotations**: Complex return types must have `// type:` comments
5. **Drizzle comparisons**: Category 1/2 pages must include `<DrizzleComparison>`
6. **Next steps**: Every page must end with `<Cards>` for navigation

**Prevent drift**: Run `npm run lint:docs` in CI to catch inconsistencies.

**Shared Vocabulary**:
- Maintain `/www/docs-glossary.md` for consistent terminology
- "Table" not "collection", "Query" not "read", "Mutation" not "write"
- Matches Drizzle/SQL terminology for familiarity

## Acceptance Criteria

#### 🔬 Updated Based on Research Findings

### Content Quality

- [ ] All **20 pages** written with complete examples (reduced from 26)
- [ ] Every code example is runnable and tested
- [ ] All pages follow fumadocs MDX conventions
- [ ] All pages include Drizzle comparison via **DrizzleComparison component**
- [ ] Category badges (✅/⚠️/🚀/❌) on every page
- [ ] **TypeScript type inference examples** on every page showing complex types
- [ ] **Negative examples** showing common mistakes and type errors
- [ ] Performance considerations documented with **PerformanceMatrix component**

### Navigation & Structure

- [ ] meta.json updated with **flattened navigation** (13 top-level ORM pages)
- [ ] Navigation follows **progressive disclosure**: Core → Advanced → Migration → Reference
- [ ] Section separators used (---Database---, ---ORM---, ---Core Concepts---, ---Advanced---, ---Migration Guides---, ---Reference---)
- [ ] Cards component used for "Next Steps" on every page
- [ ] All internal links working
- [ ] **Migration guides elevated to Phase 1** (highest priority)

### Fumadocs Compliance

- [ ] All files use .mdx extension
- [ ] All frontmatter includes title, description, links
- [ ] All code blocks have `title` attribute
- [ ] All code blocks use appropriate language tags
- [ ] Line highlighting used for key lines
- [ ] **DrizzleComparison component** used instead of manual Tabs
- [ ] **GotchasTable component** used for consistent gotcha formatting
- [ ] Callout component used for category indicators

### Agent-Native Features

- [ ] **llms-index.md** created with complete page catalog
- [ ] **api-catalog.json** generated with all API signatures + examples
- [ ] **error-catalog.json** populated with common errors and solutions
- [ ] **examples-registry.json** contains searchable code snippets
- [ ] All machine-readable artifacts validated and tested

### Migration Guides

- [ ] Drizzle → Better-Convex guide complete
- [ ] Prisma → Better-Convex guide complete
- [ ] Ents → ORM guide complete
- [ ] Each guide shows 5+ common patterns
- [ ] Each guide includes gotchas table

### API Reference

- [ ] All operators documented with examples
- [ ] All schema APIs documented
- [ ] All query APIs documented
- [ ] All mutation APIs documented
- [ ] Type inference examples for complex types

## Success Metrics

#### 🔬 Updated Success Metrics

**Developer Experience**:
- Developer can find any Drizzle concept in Better-Convex docs
- Side-by-side code comparison via **DrizzleComparison component**
- Clear category indicators (✅/⚠️/🚀/❌)
- **Drizzle/Prisma developers can migrate in < 10 minutes**
- **TypeScript autocomplete and hover tooltips documented**

**Content Completeness**:
- **20/20 pages written** (optimized from 26)
- **4 machine-readable artifacts** (llms-index, api-catalog, error-catalog, examples-registry)
- All M1-M3 features documented
- All M4 operators documented with TypeScript examples
- All migration paths covered (Drizzle, Prisma, Ents)
- **Performance patterns documented** (N+1 prevention, index selection, pagination)

**Technical Accuracy**:
- All code examples compile and run
- All type inference examples accurate with `// type:` annotations
- All Convex queries shown correctly
- All category classifications correct
- **Negative examples** show common mistakes and type errors

## Dependencies & Prerequisites

**Prerequisites**:
- ✅ Better-Convex ORM M1-M3 complete (schema, relations, queries)
- ✅ Fumadocs infrastructure set up (`www/content/docs/`)
- ✅ Feature categorization documented (brainstorm)
- ✅ Drizzle docs structure researched

**Blockers**:
- None - can start writing immediately

**Nice-to-have**:
- M4 (filtering) complete - can document as we implement
- M5 (mutations) complete - can document basic patterns, update later

## Risk Analysis & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Drizzle docs change after we write ours | Low | Mirror stable features first, link to Drizzle for latest |
| M4-M6 incomplete during doc writing | Medium | Document implemented features, add "Coming Soon" badges |
| Examples become outdated as API evolves | Medium | Use code snippets in tests, auto-validate examples |
| Fumadocs syntax differs from Drizzle | Low | Research confirmed compatibility, templates ready |

## Resource Requirements

**Development**:
- 1 technical writer or developer familiar with both Drizzle and Convex
- Access to Drizzle docs (orm.drizzle.team)
- Access to Better-Convex ORM codebase for accurate examples

**Testing**:
- All code examples must compile
- Spot-check rendering in fumadocs dev server
- Review by someone familiar with Drizzle for accuracy

**Timeline Estimate** (updated based on simplified structure):
- Phase 1 (6 pages + 2 agent-native artifacts): 2-3 days
- Phase 2 (5 pages + 2 agent-native artifacts): 2 days
- Phase 3 (4 pages + 2 agent-native artifacts): 2 days
- Phase 4 (Infrastructure + components): 1 day
- **Total**: 7-8 days for all 20 pages + 4 agent-native artifacts + components

**Time Savings**: Reduced from 6-10 days (26 pages) to 7-8 days (20 pages + automation)
- **-23% page count** (26 → 20)
- **+Agent-native features** for better discoverability
- **+Reusable components** for long-term maintainability

## Future Considerations

**Post-documentation**:
- Add search keywords for common Drizzle/Prisma terms
- Create video walkthroughs for key migrations
- Interactive examples with Convex playground
- AI-powered Drizzle → Better-Convex code converter

**Maintenance**:
- Update docs when M4-M6 ship
- Add examples as community requests come in
- Keep Drizzle comparison up-to-date
- Monitor Drizzle docs for new patterns to mirror

## Documentation Plan

#### 🔬 Updated Documentation Plan

**What needs creating**:
- [ ] Create `/Users/zbeyens/GitHub/kitcn/www/content/docs/orm/` directory
- [ ] Create all **20 MDX files** following phase order (reduced from 26)
- [ ] Create **4 agent-native artifacts**: llms-index.md, api-catalog.json, error-catalog.json, examples-registry.json
- [ ] Create **3 custom components**: DrizzleComparison.tsx, GotchasTable.tsx, PerformanceMatrix.tsx
- [ ] Create `/Users/zbeyens/GitHub/kitcn/www/snippets/` directory for shared code examples
- [ ] Create `/Users/zbeyens/GitHub/kitcn/www/scripts/lint-docs.js` for automated consistency checks
- [ ] Update `/Users/zbeyens/GitHub/kitcn/www/content/docs/meta.json` with flattened navigation
- [ ] Add ORM section to main docs landing page
- [ ] Update README with link to ORM docs

## References & Research

### Internal References

**Brainstorm**: [docs/brainstorms/2026-01-31-drizzle-orm-brainstorm.md](docs/brainstorms/2026-01-31-drizzle-orm-brainstorm.md)
- Feature categorization (4 categories)
- 1:1 documentation mapping strategy
- Implementation milestones

**Existing Docs**: `/Users/zbeyens/GitHub/kitcn/www/content/docs/`
- fumadocs conventions and patterns
- meta.json navigation structure
- Component usage (Tabs, Callout, Cards)

**ORM Implementation**:
- [packages/kitcn/src/orm/table.ts](packages/kitcn/src/orm/table.ts) - M1 schema
- [packages/kitcn/src/orm/relations.ts](packages/kitcn/src/orm/relations.ts) - M2 relations
- [packages/kitcn/src/orm/query-builder.ts](packages/kitcn/src/orm/query-builder.ts) - M3 queries

### External References

**Drizzle ORM Docs**: https://orm.drizzle.team
- 10-section documentation structure
- Progressive complexity model
- Code example patterns

**Drizzle GitHub**: https://github.com/drizzle-team/drizzle-orm
- Source code for accurate examples
- TypeScript patterns and generics

**Fumadocs**: https://fumadocs.vercel.app
- MDX syntax and components
- Navigation configuration
- Code block formatting

### Related Work

- **M1 Implementation**: Schema foundation complete
- **M2 Implementation**: Relations layer complete
- **M3 Implementation**: Query builder complete
- **M4 Plan**: [docs/plans/2026-01-31-feat-milestone-4-query-builder-where-filtering-plan.md](docs/plans/2026-01-31-feat-milestone-4-query-builder-where-filtering-plan.md)

---

## File Inventory

#### 🔬 Updated File Inventory (Simplified Structure)

### Phase 1 Files (6 MDX + 2 agent-native)
**MDX Documentation**:
- [x] `/Users/zbeyens/GitHub/kitcn/www/content/docs/orm/index.mdx` (Overview + Getting Started)
- [x] `/Users/zbeyens/GitHub/kitcn/www/content/docs/orm/quickstart.mdx`
- [x] `/Users/zbeyens/GitHub/kitcn/www/content/docs/orm/schema.mdx` (tables + relations + types combined)
- [x] `/Users/zbeyens/GitHub/kitcn/www/content/docs/orm/queries.mdx` (findMany + select + filtering combined)
- [x] `/Users/zbeynes/GitHub/kitcn/www/content/docs/orm/mutations.mdx` (insert + update + delete combined)
- [x] `/Users/zbeyens/GitHub/kitcn/www/content/docs/orm/from-drizzle.mdx` (ELEVATED: Migration guide)

**Agent-Native Artifacts**:
- [x] `/Users/zbeyens/GitHub/kitcn/www/content/docs/orm/llms-index.md`
- [x] `/Users/zbeyens/GitHub/kitcn/www/public/orm/api-catalog.json`

### Phase 2 Files (5 MDX + 2 agent-native) ✅ COMPLETE
**MDX Documentation**:
- [x] `/Users/zbeyens/GitHub/kitcn/www/content/docs/orm/relations-deep-dive.mdx`
- [x] `/Users/zbeyens/GitHub/kitcn/www/content/docs/orm/ordering-pagination.mdx` (orderBy + pagination combined)
- [x] `/Users/zbeyens/GitHub/kitcn/www/content/docs/orm/type-safety.mdx`
- [x] `/Users/zbeyens/GitHub/kitcn/www/content/docs/orm/from-prisma.mdx`
- [x] `/Users/zbeyens/GitHub/kitcn/www/content/docs/orm/from-ents.mdx`

**Agent-Native Artifacts**:
- [x] `/Users/zbeyens/GitHub/kitcn/www/public/orm/error-catalog.json`
- [x] Update `/Users/zbeyens/GitHub/kitcn/www/public/orm/api-catalog.json`

### Phase 3 Files (3 MDX + 2 agent-native) ✅ COMPLETE
**MDX Documentation**:
- [x] `/Users/zbeyens/GitHub/kitcn/www/content/docs/orm/real-time.mdx`
- [x] `/Users/zbeyens/GitHub/kitcn/www/content/docs/orm/api-reference.mdx` (API + operators combined)
- [x] `/Users/zbeyens/GitHub/kitcn/www/content/docs/orm/limitations.mdx` (Category 2/4 + Performance)

**Agent-Native Artifacts**:
- [x] `/Users/zbeyens/GitHub/kitcn/www/public/orm/examples-registry.json`
- [x] Finalize `/Users/zbeyens/GitHub/kitcn/www/content/docs/orm/llms-index.md`

### Phase 4 Files (Infrastructure + Components)
**Navigation & Config**:
- [ ] Update `/Users/zbeyens/GitHub/kitcn/www/content/docs/meta.json` (flattened navigation)

**Custom Components**:
- [ ] `/Users/zbeyens/GitHub/kitcn/www/components/docs/DrizzleComparison.tsx`
- [ ] `/Users/zbeyens/GitHub/kitcn/www/components/docs/GotchasTable.tsx`
- [ ] `/Users/zbeyens/GitHub/kitcn/www/components/docs/PerformanceMatrix.tsx`

**Shared Snippets & Tooling**:
- [ ] `/Users/zbeyens/GitHub/kitcn/www/snippets/` (directory for reusable code)
- [ ] `/Users/zbeyens/GitHub/kitcn/www/scripts/lint-docs.js` (consistency automation)
- [ ] `/Users/zbeyens/GitHub/kitcn/www/docs-glossary.md` (terminology reference)

**Total**:
- 15 MDX files (down from 26)
- 4 agent-native JSON/MD artifacts
- 3 custom React components
- 1 shared snippets directory
- 2 tooling/automation files
- 1 navigation config update

**= 26 total file operations** (same count, but better organized)
