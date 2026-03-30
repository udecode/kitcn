---
date: 2026-02-08
topic: orm-v1-breaking-parity-performance-convex-helpers-ranked
status: proposed
scope: kitcn/orm only
---

# ORM v1 Release: Breaking Changes, Parity, Performance, and convex-helpers

## What We're Building

A final pre-release decision set for `kitcn/orm` that uses remaining breaking-change budget on correctness and long-term API trust, while still shipping targeted parity improvements.

This is scoped to ORM only (`packages/kitcn/src/orm/*` and `www/content/docs/orm/*`). It intentionally excludes `crpc`, `auth`, and other packages.

Coverage used for this brainstorm:

- ORM runtime and types: `index.ts`, `query-builder.ts`, `query.ts`, `where-clause-compiler.ts`, `database.ts`, `create-orm.ts`, `insert.ts`, `update.ts`, `delete.ts`, `mutation-utils.ts`, `stream.ts`, `pagination.ts`, `schema.ts`.
- ORM docs: all pages under `www/content/docs/orm/*`.
- Convex parity references: `/tmp/cc-repos/convex-backend/npm-packages/docs/docs` (query/index/search/vector/system-table behavior).
- convex-helpers surface + guidance: `/tmp/cc-repos/convex-helpers/packages/convex-helpers/README.md`, `/tmp/cc-repos/convex-helpers/packages/convex-helpers/package.json`, and `server/*.ts`.

## Why This Approach

### Approach A (Recommended): Contract hardening first, selective parity now

Lock semantics now where a wrong decision becomes expensive after v1. Add small, additive parity wins that do not destabilize current behavior.

Pros:

- Reduces chance of post-v1 breaking fixes.
- Keeps maintenance cost bounded.
- Uses break budget where it matters most.

Cons:

- Fewer headline additions in v1 marketing.

Best when:

- Product trust and operability are prioritized over feature count.

### Approach B: Parity-first expansion

Add more Convex/Drizzle/convex-helpers parity quickly, defer semantic tightening.

Pros:

- Bigger short-term checklist parity.

Cons:

- Higher risk of shipping ambiguous or unsafe defaults.
- Future fixes likely become breaking.

Best when:

- Near-term breadth is more important than correctness guarantees.

### Approach C: Performance-first rewrite

Focus first on relation-loading and pagination internals before contract cleanup.

Pros:

- Potentially larger immediate performance wins.

Cons:

- Highest implementation and timeline risk.
- Defers key API/semantics decisions.

Best when:

- Current production load pain is the dominant blocker.

## Key Decisions

### Ranked recommendations

1. **[v1 blocker] Decide FK fan-out + RLS contract and freeze it now.**  
   Current implementation intentionally bypasses child-table RLS during FK fan-out after root authorization (`mutation-utils.ts`). If this is the intended contract, keep it explicit and prominent in docs; if not, change now before v1.

2. **[v1 blocker] Add relation-loading fan-out guardrails before release.**  
   Relation loading deduplicates keys but still performs per-key lookups at runtime. Add explicit caps/fail-fast behavior for pathological cardinality, with opt-in override (`allowFullScan`) for exceptional cases.

3. **[v1 blocker] Fix ORM docs correctness mismatches before shipping.**  
   Current docs contain at least these inaccuracies:
   - `schema.mdx` still labels vector indexes as WIP.
   - `schema.mdx` says predicate `where` can rely on `allowFullScan`; code requires explicit `index`.
   - `schema.mdx` says unindexed pagination orderBy warns/falls back under strict mode; code throws when `strict: true`.

4. **[v1 high, additive parity] Add `findUnique()` for `_id` and unique indexes.**  
   This closes a high-friction parity gap vs Convex `.unique()`/Drizzle expectations and reduces ambiguous `findFirst` usage for unique lookups.

5. **[v1 high] Align strict-mode behavior policy for pagination orderBy.**  
   Keep one contract: either strict should throw (current runtime) or warn/fallback. Pick one and make runtime + docs match.

6. **[v1 medium, additive parity] Expose optional vector score metadata.**  
   Convex vector search returns `_score`; ORM currently drops it during document hydration. Add opt-in score projection to avoid default response-shape churn.

7. **[v1 medium] Document `db.normalizeId` parity explicitly.**  
   `db` passthrough includes raw Convex APIs, but ORM docs do not clearly cover `normalizeId` as a supported passthrough companion to `db.system`.

8. **[v1.x medium, performance] Implement cursor-stable multi-probe pagination.**  
   Current behavior requires `allowFullScan: true` fallback for multi-probe filter plans. Keep current guard in v1 and schedule a dedicated v1.x implementation.

9. **[v1 policy] Keep selective convex-helpers fork strategy.**  
   Continue maintaining internal fork lineage only for `stream` and `pagination`; these are already integrated and strategically valuable.

10. **[v1 policy] Do not fork helper subsystems that overlap ORM abstractions.**  
    Avoid forking `relationships`, `filter`, `rowLevelSecurity`, `crud`, and `customFunctions` into ORM core. They overlap and would increase maintenance surface without clear net gain.

11. **[v1.x low] Consider tiny utility cherry-picks only.**  
    If reuse is needed, cherry-pick minimal utilities (for example ergonomic helpers), not full helper modules.

### convex-helpers triage (ORM scope)

- `server/stream.ts`: Keep forked and periodically sync.
- `server/pagination.ts`: Keep forked and periodically sync.
- `server/relationships.ts`: Do not fork wholesale; ORM relation DSL supersedes core relationship traversal.
- `server/filter.ts`: Do not fork; ORM already has object/predicate `where` strategy.
- `server/rowLevelSecurity.ts`: Do not fork; ORM has integrated policy model and evaluation points.
- `server/crud.ts`: Do not fork; ORM insert/update/delete/query builders supersede.
- `server/customFunctions.ts`, `triggers.ts`, `migrations.ts`, `rateLimit.ts`, `retries.ts`, `sessions.ts`, `hono.ts`, `cors.ts`, `zod*`: out of ORM-core scope.

## Open Questions

- For v1, should FK fan-out continue bypassing child-table RLS (documented contract), or should child RLS be enforced?
- Do you want `findUnique()` in v1, or explicitly defer to v1.x?
- For strict mode, should unindexed pagination orderBy throw (current runtime) or warn/fallback?
- For relation-loading guardrails, prefer hard error by default or warning + explicit opt-in?

## Next Steps

-> Run `/workflows:plan` using this brainstorm as source and prioritize items 1-5.  
-> Keep items 6-11 as explicit v1/v1.x scope decisions.
