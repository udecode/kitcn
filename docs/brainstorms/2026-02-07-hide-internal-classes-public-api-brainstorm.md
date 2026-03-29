---
date: 2026-02-07
topic: hide-internal-classes-public-api
---

# Hide Internal Classes from Public API

## What We're Building
Reduce accidental public surface area in `kitcn/orm` by stopping direct public exports of implementation classes and internal helpers from the top-level ORM entrypoint.

The intended public contract becomes:
- factory functions and user-facing DSL (`createDatabase`, `convexTable`, `text`, `id`, `eq`, `and`, etc.)
- stable public types for type-level composition
- opaque class instances returned by public APIs, not user-constructed internals

The objective is to preserve user workflows (`db.query.table.findMany()`, `db.insert(table)`, etc.) while removing exports that create long-term compatibility burdens and block internal refactors.

## Why This Approach
### Approach A (Chosen): Hard Boundary in Next Breaking Release
Remove internal class/value exports from the top-level public API in one breaking change.

Pros:
- Clears API contract immediately
- Maximizes refactor freedom
- Aligns with opaque-instance API design

Cons:
- Breaking for users importing internals directly
- Requires explicit migration communication

Best when:
- API stability quality is prioritized over short-term compatibility

### Approach B: Two-Step Deprecation Then Removal
Keep current exports temporarily, mark deprecated, remove later.

Pros:
- Smoother consumer transition
- Lower immediate upgrade friction

Cons:
- Extends maintenance burden
- Delays boundary enforcement

Best when:
- Ecosystem compatibility is more important than immediate cleanup

### Approach C: Keep Exports, Add Documentation Warnings
Document internals as unsupported but keep them public.

Pros:
- No breakage now
- Minimal short-term work

Cons:
- Does not actually remove contract risk
- Refactor constraints remain

Best when:
- Backward compatibility is the only priority

## Key Decisions
- Use a hard API boundary in the next breaking release (selected).
- Keep public factory functions and operators as first-class API.
- Keep public types needed for type-level usage; avoid exposing constructor-driven internals.
- Treat class instances as opaque results of public factories/builders.
- Position this as API-surface tightening for long-term maintainability and safer refactors.

## Open Questions
- Which exported types must remain public versus move to internal-only?
- Should any internals remain available via deep imports, or be fully private?
- What migration guidance is required for users currently importing internals?
- Should release notes include an explicit “unsupported internals” policy going forward?

## Next Steps
-> `/workflows:plan` to define exact export list changes, compatibility policy, migration notes, and validation scope.
