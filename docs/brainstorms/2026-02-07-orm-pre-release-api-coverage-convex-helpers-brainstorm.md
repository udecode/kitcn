---
date: 2026-02-07
topic: orm-pre-release-api-coverage-convex-helpers
status: in_progress
scope: kitcn/orm only
---

# ORM Pre-release: API Coverage, Breaking Changes, Parity, and Convex-Helpers

## What We're Building

A pre-release product decision for `kitcn/orm` that uses remaining breaking-change budget where it most improves long-term correctness and trust. The target is a stable v1 contract with explicit decisions on parity with Convex core APIs, performance priorities, and what to fork (or not) from `convex-helpers`.

Coverage baseline for this brainstorm:

- ORM source and public exports: `packages/kitcn/src/orm/index.ts`, `query.ts`, `where-clause-compiler.ts`, `database.ts`, `insert.ts`, `update.ts`, `delete.ts`, `stream.ts`, `pagination.ts`.
- Convex core API parity references: `convex-backend/npm-packages/convex/src/server/database.ts`, `query.ts`, `registration.ts`.
- convex-helpers module surface and docs: `/tmp/cc-repos/convex-helpers/packages/convex-helpers/README.md`, `package.json`, and server modules.
- Existing test coverage for ORM behavior and type contracts in `convex/orm/*` and `test/orm/*`.

Current state summary:

- Strong ORM core already exists: schema DSL, relations, query builder (`findMany`, `findFirst`), mutation builders, search and vector modes, runtime RLS, stream integration, and async scheduled mutation flows.
- High-risk gaps are now mostly semantic/correctness and scale behavior (not missing headline features).
- The most critical correctness issue is index planning around compound index prefix/order behavior.

## Why This Approach

### Approach A (Recommended): Contract hardening + selective parity

Stabilize correctness and behavior now, add only low-risk additive parity in v1.

Pros:

- Uses break budget on correctness before public lock-in.
- Reduces long-term maintenance and support risk.
- Keeps v1.x mostly additive.

Cons:

- Fewer headline features for initial release messaging.

Best when:

- You optimize for API trust and operational reliability.

### Approach B: Parity-first expansion

Prioritize adding Convex/convex-helpers parity features first, defer hardening.

Pros:

- Bigger immediate feature checklist.

Cons:

- Risks locking in unstable semantics.
- Later fixes become breaking changes.

Best when:

- Short-term breadth matters more than correctness guarantees.

### Approach C: Performance-first rewrite

Prioritize relation-loading and query execution rewrites before contract cleanup.

Pros:

- Can produce measurable wins on large datasets.

Cons:

- Highest delivery risk before v1.
- Can delay needed semantic decisions.

Best when:

- Production scale pain is already the dominant blocker.

## Key Decisions

### Ranked suggestions (highest first)

5. **[P1, v1] Add relation-loading guardrails now; defer batching rewrite**
   Current loading dedupes keys but still does per-key fetch/query patterns. Guardrails belong in v1; batching can land in v1.x.

6. **[P2, additive parity] Add optional vector score exposure**
   `ctx.vectorSearch` returns `_score`; ORM currently drops it. Opt-in metadata avoids default shape churn.

7. **[P2, v1 policy] Keep selective convex-helpers fork policy**
   Continue internal fork/sync for `stream.ts` and `pagination.ts` only.

8. **[P2, v1 policy] Do not fork overlapping helper subsystems into ORM core**
   Do not fork `relationships`, `filter`, `rowLevelSecurity`, `crud`, or `customFunctions` into ORM core.

9. **[P3, optional] Evaluate cherry-picking tiny utility ideas only**
   If needed, copy minimal utility logic, not module-level abstractions.

## Progress Sync (2026-02-07)

### Implemented in `feat/orm-5` (ORM scope only)

1. **[P0] Compound-index planner correctness**: implemented.
   - Non-leading-only compound predicates are no longer pushed into index filters.
   - Equality filters are normalized to compound index field order before execution.
   - Main change: `packages/kitcn/src/orm/where-clause-compiler.ts`.

2. **[P0] Index prefix/order regression tests**: implemented.
   - Compiler regressions: `test/orm/where-clause-compiler.test.ts`.
   - Runtime coverage: `convex/orm/where-filtering.test.ts`, `convex/orm/pagination.test.ts`.

3. **[P1] FK cascade x RLS contract**: decided and codified for v1.
   - Contract: root mutation row is RLS-checked; cascade fan-out writes run as system actions and bypass child-table RLS.
   - Coverage and documentation added:
     - `convex/orm/foreign-key-actions.test.ts`
     - `packages/kitcn/src/orm/mutation-utils.ts`
     - `www/content/docs/orm/rls.mdx`
     - `www/content/docs/orm/limitations.mdx`

4. **[P1] Strict full-scan semantics for risky post-filter paths**: made explicit and test-backed.
   - Non-leading compound usage requires explicit `allowFullScan: true` opt-in.
   - Docs updated in `www/content/docs/orm/queries.mdx` and `www/content/docs/orm/limitations.mdx`.

### Remaining from ranked list

- [ ] **[P1]** Relation-loading guardrails now; batching rewrite deferred.
- [ ] **[P2]** Optional vector score exposure (`_score`) decision/implementation.
- [ ] **[P2]** Keep selective convex-helpers fork policy as release process item.
- [ ] **[P3]** Optional tiny utility cherry-picks only.

### Convex-helpers module decisions (ORM scope)

- `server/stream.ts`: **KEEP FORK + sync cadence** (already integrated).
- `server/pagination.ts`: **KEEP FORK + sync cadence** (already integrated).
- `server/relationships.ts`: **NO FORK** (overlaps ORM relations API and loader semantics).
- `server/filter.ts`: **NO FORK** (ORM has predicate `where` + stream path).
- `server/rowLevelSecurity.ts`: **NO FORK** (ORM has its own RLS contract and policy model).
- `server/crud.ts`: **NO FORK** (ORM mutation/query builders supersede it).
- `server/customFunctions.ts`: **NO FORK INTO ORM CORE** (useful at app layer, not ORM core).
- `server/triggers.ts`: **DEFER** (possible future companion, not v1 ORM core).
- `server/migrations.ts`, `rateLimit.ts`, `retries.ts`, `sessions.ts`, `hono.ts`, `cors.ts`, `zod*`: **OUT OF ORM SCOPE**.

## Open Questions

- Should `findUnique()` be in v1 or immediate v1.x?
- For multi-probe pagination, block outright in v1 or keep allowFullScan fallback?
- Do you want a fixed sync cadence for stream/pagination forks (for example monthly vs release-based)?
- Should vector `_score` be opt-in only, or included by default in vector mode?

## Next Steps

-> Run `/workflows:plan` using this brainstorm as source.
-> Start with items 1-5 as release-gating work.
-> Treat items 6-10 as additive v1/v1.x scope based on your answers.
