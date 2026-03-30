---
title: feat: table-level scheduled delete opt-in default
type: feat
date: 2026-02-07
status: draft
---

# feat: table-level scheduled delete opt-in default

## Overview
Add an Ents-style, **per-table opt-in** so plain `.delete(...).execute()` can default to scheduled-delete semantics (soft now, hard later) without replacing global behavior.

This is intentionally not a global default replacement for all tables. `executeAsync()` remains the explicit scale path for hard deletes.

## Brainstorm Context
Found brainstorm from 2026-02-07: `cascade-delete-scale-vs-ents`. Using as context for planning.

Relevant decision carried forward:
- Keep hard-delete async scaling (`executeAsync` / `mutationExecutionMode: 'async'`) separate from product-level scheduled-delete semantics.

## Problem Statement
Current ORM behavior requires calling `.scheduled({ delayMs })` per mutation. That is explicit but easy to forget on tables that should always have delayed hard-delete behavior.

Goal: provide table-level ergonomics similar to Ents `.deletion("scheduled")`, while preserving:
- explicit hard-delete scale controls,
- predictable precedence rules,
- cancellation-safe scheduled worker behavior.

## Proposed API (Locked)

### Table-level opt-in
Add a new table extra-config helper:

```ts
const users = convexTable(
  'users',
  { slug: text().notNull(), deletionTime: integer() },
  () => [deletion('scheduled', { delayMs: 60_000 })]
);
```

Modes:
- `'hard'` (default if unset)
- `'soft'`
- `'scheduled'` (requires `deletionTime` on that table)

### Per-query overrides
Keep existing methods and add explicit hard override:
- `.soft()`
- `.scheduled({ delayMs })`
- `.hard()` (new)

### Precedence
1. Per-query override (`hard` / `soft` / `scheduled`)
2. Table default via `deletion(...)`
3. Fallback default `'hard'`

### Async interaction
- If resolved delete mode is `scheduled`, `executeAsync()` remains invalid (same contract as today).
- If table default is `scheduled`, users can explicitly opt out per query via `.hard().executeAsync(...)`.

## Architecture Changes

### 1) Table metadata surface
Add table-level deletion metadata symbol + storage on `ConvexTableImpl`.

Planned files:
- `packages/kitcn/src/orm/symbols.ts`
- `packages/kitcn/src/orm/table.ts`
- `packages/kitcn/src/orm/index.ts` (export helper)

### 2) New helper/builder
Implement `deletion(mode, options?)` as a supported `convexTable` extra config value.

Validation:
- `mode` must be `hard | soft | scheduled`
- `delayMs` must be non-negative integer when provided

Planned files:
- `packages/kitcn/src/orm/table.ts`
- `packages/kitcn/src/orm/types.ts` (if helper types are exposed)
- `packages/kitcn/src/orm/index.ts`

### 3) Delete mode resolver
Centralize mode resolution in delete builder:
- read table default metadata from table symbol
- apply precedence rules
- resolve effective delay for scheduled mode:
  - explicit `.scheduled({ delayMs })` first
  - otherwise table configured delay
  - otherwise `0`

Planned files:
- `packages/kitcn/src/orm/delete.ts`

### 4) Scheduled worker compatibility
No behavior change needed to cancellation token logic; only ensure table-default scheduled path enqueues same tokenized payload as explicit `.scheduled(...)`.

Planned files:
- `packages/kitcn/src/orm/delete.ts`
- `packages/kitcn/src/orm/scheduled-delete.ts` (no-op unless wiring changes needed)

## TDD Plan (Required)

## Slice A: Default mode resolution
RED:
- Add tests showing table with `deletion('scheduled', { delayMs })` schedules delete when query has no explicit mode.
- Add tests showing table with `deletion('soft')` sets `deletionTime` when query has no explicit mode.

GREEN:
- Implement minimal table metadata + resolver in `delete.ts`.

REFRACTOR:
- Extract `resolveDeleteModeAndDelay(...)` helper for readability.

## Slice B: Override precedence
RED:
- Table default scheduled + query `.hard()` performs hard delete immediately.
- Table default scheduled + query `.soft()` performs soft delete only.
- Table default soft + query `.scheduled(...)` uses explicit scheduled behavior.

GREEN:
- Implement `.hard()` and precedence resolution.

## Slice C: Async guard behavior
RED:
- Table default scheduled + `executeAsync()` throws the same incompatibility error.
- Table default scheduled + `.hard().executeAsync()` is allowed.

GREEN:
- Reuse existing async guard against resolved mode, not just explicit `.scheduled()`.

## Slice D: Token continuity
RED:
- Table-default scheduled path includes `deletionTime` token in scheduler payload.
- Worker no-ops when token mismatches (regression guard).

GREEN:
- Ensure default-scheduled path routes through current tokenized scheduled enqueue.

## Test Files
- `convex/orm/foreign-key-actions.test.ts`
- `convex/orm/mutations.test.ts`
- `test/types/tables.ts`
- `test/types/delete.ts` (or nearest delete API type test file)

## Documentation Plan

### 1) API + behavior docs
- `www/content/docs/orm/api-reference.mdx`
  - add `deletion(...)` helper
  - add `.hard()` override
  - add precedence section

### 2) Delete guide
- `www/content/docs/orm/delete.mdx`
  - add table-level scheduled default examples
  - add “when to use table default vs executeAsync” guidance
  - add explicit precedence matrix

### 3) Schema guide
- `www/content/docs/orm/schema.mdx`
  - document table-level deletion config in `convexTable` extra config

### 4) Migration guide
- `www/content/docs/orm/migrate-from-ents.mdx`
  - map Ents `.deletion("scheduled")` to ORM `deletion('scheduled', ...)`
  - clarify behavioral differences from async hard-delete path

### 5) Limitations page
- `www/content/docs/orm/limitations.mdx`
  - clarify `executeAsync()` incompatibility with resolved scheduled mode
  - show `.hard().executeAsync()` escape hatch for scheduled-default tables

## Acceptance Criteria
- [ ] Table-level `deletion('scheduled', { delayMs })` makes plain `.execute()` behave as scheduled delete.
- [ ] `.hard()` exists and overrides table default mode.
- [ ] Mode precedence is deterministic and tested.
- [ ] `executeAsync()` remains blocked for resolved scheduled mode.
- [ ] Table-default scheduled path preserves cancellation token contract (`deletionTime` match required).
- [ ] Type tests cover valid/invalid `deletion(...)` declarations.
- [ ] Docs updated across API reference, delete guide, schema guide, limitations, and Ents migration guide.

## Risks & Mitigations
- Risk: Hidden semantic change for existing tables.
  - Mitigation: opt-in only; no global default changes.
- Risk: Confusion between “scheduled for product behavior” vs “async for scale.”
  - Mitigation: docs include explicit decision guide and precedence examples.
- Risk: Missing `deletionTime` column for scheduled/soft mode.
  - Mitigation: keep runtime guard; optionally add schema-time warning in a follow-up.

## Out of Scope
- Global schema default for scheduled delete mode.
- Automatic migration of existing table definitions.
- Ents-style stack-machine rewrite for continuation.

## References
- Delete mode execution flow:
  - `packages/kitcn/src/orm/delete.ts:81`
  - `packages/kitcn/src/orm/delete.ts:160`
  - `packages/kitcn/src/orm/delete.ts:218`
  - `packages/kitcn/src/orm/delete.ts:532`
- Scheduled worker + token check:
  - `packages/kitcn/src/orm/scheduled-delete.ts:14`
  - `packages/kitcn/src/orm/scheduled-delete.ts:40`
- Table extra config parsing:
  - `packages/kitcn/src/orm/table.ts:653`
  - `packages/kitcn/src/orm/table.ts:1164`
