---
date: 2026-02-07
topic: drizzle-aggregations-v1x-deferral
status: proposed
---

# Drizzle Aggregations v1.x Deferral

## What We're Building

Define the ORM v1 boundary for Drizzle-style aggregations: `count`, `sum`, `avg`, `max`, and `min` are not added to the kitcn ORM query API in v1.

Instead, v1 documentation should clearly position aggregation as a platform-level capability handled through Convex aggregates, with `@convex-dev/aggregate` as the recommended path. This keeps the v1 release focused on stable query/mutation parity and avoids introducing incomplete or misleading SQL-like aggregation semantics.

The user-facing outcome is clarity, not new API surface:
- v1 docs call out aggregation as deferred to v1.x for ORM-native ergonomics.
- v1 docs point to existing aggregate patterns (`TableAggregate`/component) for production use now.
- Drizzle migration docs state the mapping directly so users know where to go immediately.

## Why This Approach

### Approach A (Recommended): Defer ORM aggregations to v1.x and document the Convex aggregate path

Keep ORM API unchanged for v1, and add explicit docs that route aggregation use cases to `@convex-dev/aggregate`.

**Pros:**
- Smallest risk and cleanest v1 scope.
- Honest about Convex/SQL capability differences.
- Aligns with existing repo direction and previous brainstorm decisions.

**Cons:**
- Leaves a visible parity gap vs Drizzle query ergonomics.
- Users must learn an additional component-based path.

**Best when:**
- v1 stability and predictable behavior are higher priority than feature breadth.

### Approach B: Add `count()` only in v1, defer `sum/avg/max/min`

Ship one aggregation convenience now and postpone the rest.

**Pros:**
- Reduces the most common parity complaint quickly.

**Cons:**
- Creates an uneven API and more migration confusion.
- Higher risk of follow-up breaking behavior when completing the set.

**Best when:**
- A near-term `count()` requirement is blocking adoption.

### Approach C: Implement full Drizzle-like aggregations in v1

Add all five operations immediately as ORM primitives.

**Pros:**
- Highest API parity on paper.

**Cons:**
- Larger scope and semantics risk before v1 stabilization.
- Likely forces platform-specific caveats into core query behavior.

**Best when:**
- Parity breadth is prioritized over release focus.

## Key Decisions

- Choose **Approach A** for v1.
- Keep ORM query API free of `count/sum/avg/max/min` in v1.
- Treat this as a **documented platform/parity limitation** for v1, not a hidden omission.
- Route users to `@convex-dev/aggregate` for production aggregation needs.
- Track ORM-native aggregation ergonomics as a **v1.x follow-up**, after stable boundary hardening.

## Open Questions

- For v1.x, should aggregation support remain docs-first, or add ORM sugar over aggregate components?
- Should migration docs include explicit recipes for `avg` (derived from `sum` + `count`) and related patterns?
- Do we want a dedicated "Drizzle parity gaps" page that centralizes this and other deferred items?

## Next Steps

Move to `/workflows:plan` only if we want to execute doc updates now (ORM docs, migration mapping table, and parity-gap notes).
