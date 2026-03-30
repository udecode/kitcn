---
date: 2026-02-07
topic: orm-pre-release-breaking-parity-performance-convex-helpers-ranked
status: proposed
scope: kitcn/orm only
---

# ORM Pre-release: Breaking Changes, Parity, Performance, and convex-helpers

## What We're Building

A final pre-release product decision for `kitcn/orm` that prioritizes long-term API trust over short-term feature count. The core question is not "can we add more" but "what contract should be stable on day one."

Coverage used for this brainstorm:
- ORM source API and internals (`packages/kitcn/src/orm/*`)
- ORM docs (`www/content/docs/orm/*`)
- Convex docs (`/tmp/cc-repos/convex-backend/npm-packages/docs/docs`)
- convex-helpers docs and source (`/tmp/cc-repos/convex-helpers/packages/convex-helpers/*`)

Important context from this audit:
- Several previously-open parity/safety gaps are already closed (explicit non-paginated sizing policy, vector search API in `findMany`, `db.system` passthrough, hidden internal classes from top-level exports).
- The remaining highest-risk items are mostly correctness semantics and scale behavior, not missing headline APIs.
- Convex index rules are strict about prefix/index-order constraints; this matters directly for ORM planner correctness.

Goal: ship v1 with fewer surprises under load, then expand parity in v1.x from a stable base.

## Why This Approach

### Approach A (Recommended): Contract hardening now, selective parity now

Use pre-release break budget for correctness and behavior clarity. Add only additive parity that has low semantic risk.

Pros:
- Prevents locking in incorrect or ambiguous semantics.
- Aligns with Convex execution model and limits before users depend on edge behavior.
- Keeps post-v1 work mostly additive.

Cons:
- Fewer "new features" in first release messaging.

Best when:
- v1 trust and operability matter more than raw checklist parity.

### Approach B: Parity-first expansion before hardening

Prioritize feature completeness vs Convex and convex-helpers first, defer deeper semantics cleanup.

Pros:
- Bigger immediate parity story.

Cons:
- Higher chance of freezing footguns into stable API.
- Future fixes become breaking changes instead of patch releases.

Best when:
- Marketing breadth is more important than correctness guarantees.

### Approach C: Performance-first internal rewrite

Invest primarily in relation loading/query execution rewrites before further API decisions.

Pros:
- Potential major performance wins.

Cons:
- Higher delivery risk and longer timeline.
- Can obscure unresolved API contract decisions.

Best when:
- Current performance is already the dominant blocker.

## Key Decisions

### Ranked suggestions (highest priority first)

1. **[v1 blocker] Fix index-planner prefix correctness**  
   Current planner can select partial index matches and emit `withIndex(...).eq(...)` patterns that violate Convex index-order constraints (compound index non-prefix usage). This is a correctness issue, not an optimization issue.

2. **[v1 blocker] Decide and codify RLS x FK-cascade semantics**  
   Root update/delete rows are RLS-checked, but FK cascade/set-null/set-default paths currently mutate child rows directly. Decide now whether this is intentional contract (documented) or should enforce child-table RLS. Pre-release is the right moment for this semantic line.

3. **[v1 high] Add explicit relation-loading scale guardrails**  
   Current relation loading dedupes keys but still performs per-distinct-key fetches. Add clear, enforced guardrails for fan-out/key cardinality in v1, even if full batching rewrite lands in v1.x.

4. **[v1 high] Normalize docs to current behavior and remove stale guidance**  
   `www` contains a few stale or inconsistent statements (for example vector marked as "wip" in schema docs while vector query API exists; some examples imply unsized reads). Align docs with actual runtime contract before release.

5. **[v1 medium, additive parity] Add `findUnique()`**  
   Convex exposes `.unique()` semantics and Drizzle users expect explicit uniqueness-oriented retrieval. A typed `findUnique` for `_id` and unique indexes improves intent clarity without destabilizing existing APIs.

6. **[v1.x medium, parity/perf] Expose optional vector score metadata**  
   Vector provider already returns `_score`, but ORM result shaping drops it. Optional score exposure is useful but not release-critical.

7. **[v1.x medium, performance] Implement cursor-stable multi-probe pagination**  
   Current multi-probe pagination requires `allowFullScan: true` fallback and warns about stability. Valuable, but safe to defer after v1 contract hardening.

8. **[decision] convex-helpers adoption policy: keep selective fork only**  
   Keep syncing `stream`/`pagination` fork lineage (already proven useful). Do **not** fork `relationships`, `filter`, `rowLevelSecurity`, or `crud` into ORM core; they overlap/conflict with ORM’s native abstractions and would increase maintenance surface.

9. **[optional, low] Evaluate tiny helper imports, not module imports**  
   If anything is reused from convex-helpers, reuse only very small utility ideas (for example doc-fetch helpers), not entire helper subsystems.

## Open Questions

- For FK cascades, should child-row RLS be enforced in v1, or explicitly bypassed and documented for v1 with a future opt-in check mode?
- Do you want `findUnique()` in v1 scope, or defer to immediate v1.x?
- Should relation-loading guardrails fail fast (hard cap) or warn + continue with explicit opt-in?
- Should vector `_score` be exposed only via an explicit opt-in API to avoid result-shape churn?

## Next Steps

-> Run `/workflows:plan` with this brainstorm as source, starting from items 1-4 as release-gating work.
-> Keep items 6-9 as v1.x candidates unless you intentionally broaden v1 scope.
