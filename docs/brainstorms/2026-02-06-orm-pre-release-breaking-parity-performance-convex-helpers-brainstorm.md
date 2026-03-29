---
date: 2026-02-06
topic: orm-pre-release-breaking-parity-performance-convex-helpers
status: proposed
---

# ORM Pre-release Breaking Changes, Parity, and Performance

## What We're Building

A pre-release product decision for **`kitcn/orm` only** that spends breaking-change budget where it most improves trust and long-term maintainability.

Scope reviewed in this brainstorm:

- ORM source surface: `packages/kitcn/src/orm` (43 files, ~16k LOC)
- ORM tests: `convex/orm` + `test/orm` (20 files, 212 runtime tests)
- ORM docs: `www/content/docs/orm` (18 docs pages)
- Related upstream helpers: `/tmp/cc-repos/convex-helpers/packages/convex-helpers` (especially `stream`, `pagination`, `filter`, `relationships`, `rowLevelSecurity`, `customFunctions`, `zod4`, `cors`)

Problem framing:

- We are still pre-stable, so this is the best time to remove risky semantics.
- The ORM already has broad capability, but some defaults and fallbacks can create surprising runtime behavior at scale.
- We should prioritize a crisp v1 boundary: high trust + clear tradeoffs, then expand parity from that foundation.

## Why This Approach

### Approach A (Recommended): Reliability-first boundary before feature expansion

Define and enforce safer defaults now, then add parity features that fit that boundary.

Pros:

- Uses pre-release break window on the highest-risk behavior.
- Reduces chance of shipping footguns into stable API contracts.
- Makes future performance work additive instead of corrective.

Cons:

- Slower visible feature velocity in the short term.

Best when:

- First stable ORM release reputation matters more than checklist breadth.

### Approach B: Parity-first expansion (Convex + convex-helpers)

Maximize feature parity quickly and defer strict behavior changes.

Pros:

- Fast growth of capability and marketing-friendly parity claims.

Cons:

- Locks in semantics that may be expensive to unwind later.
- Risk of carrying ambiguous or unsafe defaults into v1.

Best when:

- Immediate breadth matters more than strictness and predictability.

### Approach C: Freeze API and document caveats

Avoid major behavior changes; keep existing runtime behavior and improve docs/warnings.

Pros:

- Low churn and low immediate migration cost.

Cons:

- Known runtime ambiguities remain in stable contract.
- Higher downstream support burden.

Best when:

- Timeline pressure dominates and risk tolerance is high.

### Recommended blend: A + targeted B

Use Approach A for defaults and safety semantics, then selectively apply Approach B for high-value parity (notably vector search) in the same pre-release window.

Why:

- Keeps the v1 contract trustworthy.
- Still ships meaningful parity where it strengthens ORM value.

## Ranked Recommendations

1. **Breaking**: Replace silent implicit query caps with an explicit implicit-limit policy.
   Rationale: today `limit ?? 1000` prevents unbounded scans but can silently truncate results. Also, there is no single “Convex max rows” value that guarantees no errors because limits combine (`data read` 16 MiB, `docs scanned` 32k, `return size` 16 MiB, plus search/vector-specific caps). Stable behavior should default to no silent truncation.
   Proposed direction:
   - Default policy: require explicit sizing (`limit` or `paginate`) for non-paginated multi-row reads.
   - Compatibility policy (schema-level): allow implicit cap behavior when explicitly configured.
   - Optional compatibility variant: implicit cap + overflow detection (fail fast instead of returning a silently truncated array).

2. **Breaking**: Make non-indexed pagination fallback paths hard errors in stable mode.
   Rationale: today, strict-off and `allowFullScan` paths can fall back to unstable or expensive pagination behavior. Cursor semantics should be predictable by default.

3. **Breaking**: Hide internal implementation classes from public ORM API.
   Rationale: exported internals like `GelRelationalQuery`, `QueryPromise`, and compiler primitives harden accidental contracts and raise migration cost later.

4. **Parity with Convex**: Add first-class vector search query support.
   Rationale: ORM supports vector index definition, but not a typed query API equivalent to Convex `vectorSearch(...)`. This is the largest current Convex parity gap on the read path.

5. **Performance**: Bound mutation fan-out and relation loading materialization paths.
   Rationale: update/delete/cascade and many-relation loading can still materialize large sets. Define explicit safety ceilings and failure modes.

6. **convex-helpers fork decision**: Keep `stream`/`pagination` internal forks and track upstream changes; do not fork `relationships`, `filter`, `rowLevelSecurity`, or `crud` into ORM.
   Rationale: those modules duplicate ORM abstractions or conflict with ORM’s relation/RLS model.

7. **convex-helpers fork decision (non-ORM overlap)**: Avoid adding large helper dependencies into ORM surface (especially `customFunctions`, `zod4`, `cors`).
   Rationale: these are package-level concerns, not ORM-core concerns, and increase maintenance drag for little ORM value.

8. **Coverage hardening**: Add compile-time API contract tests for strict/full-scan/search/predicate constraints.
   Rationale: runtime tests are broad; type-contract guarantees still need stronger lock-in before stable.

## Key Decisions

- Prioritize **Approach A** defaults, plus targeted **Approach B** parity additions.
- Spend breaking-change budget on behavior clarity and safety, not only feature count.
- Treat Convex parity and convex-helpers parity as selective: adopt only what improves ORM’s core contract.
- Keep ORM architecture opinionated (Drizzle-like API + Convex-native constraints) instead of mirroring every helper API.

## Open Questions

- Should stable mode require explicit sizing intent for all non-paginated reads?
- If we keep a compatibility mode, should it be:
  - implicit cap with truncation, or
  - implicit cap with overflow error (no silent truncation)?
- Should implicit-limit behavior be configurable globally in `defineSchema(...)`?
- Should vector search be in ORM v1 boundary, or in v1.x immediately after boundary hardening?

## Next Steps

-> `/workflows:plan` to convert this into a concrete release plan with migration notes, compatibility flags, and rollout order.
