---
date: 2026-02-03
topic: drizzle-v1-upgrade
---

# kitcn ORM: Drizzle v1 Upgrade (Breaking)

## What We're Building
We are upgrading kitcn ORM from Drizzle stable (v0.45.x) to **Drizzle v1** with full API parity for the parts that are relevant to Convex. This is a **clean break**: no backward compatibility, no dual APIs. The end state is a single, v1-only surface that mirrors the `drizzle-v1` repository as the source of truth, including TypeScript typing behavior and test coverage.  

Scope includes schema definitions, relations, query syntax, and mutations, plus mirrored tests and updated docs. Out of scope: SQL-only features that cannot map to Convex semantics and any long-term support for v0.45 patterns.

## Why This Approach
The project goal is parity with Drizzle v1, so the simplest and most reliable strategy is to mirror `drizzle-v1` directly and remove v0.45 compatibility entirely. A single API keeps the codebase and documentation coherent, reduces type complexity, and eliminates adapter layers. Mirroring Drizzle tests is the fastest path to accurate typing and behavior, while keeping Convex-specific adaptations explicit and minimal.

## Key Decisions
- **Breaking upgrade only**: remove v0.45 API entirely; no adapters or transitional shims.
- **`drizzle-v1` is the canonical reference** for behavior, typings, and tests.
- **Canonical integration: PostgreSQL** (mirror `drizzle-orm/type-tests/pg/*` and `pg-core` patterns).
- **Tests are copied and adapted**, not reinvented; type tests and runtime tests should follow Drizzle structure.
- **Convex-only constraints are explicit**: if Drizzle behavior cannot map to Convex, document the divergence and test it.

## Open Questions
- What Convex-specific divergences are unavoidable, and how should they be documented?
- How should relation filtering and query object syntax map to Convex query capabilities without surprises?
- What migration guidance is required to move users off v0.45 (docs only vs. codemods)?

## Next Steps
→ Run `/workflows:plan` to define the implementation steps, files, and testing strategy based on this scope.
