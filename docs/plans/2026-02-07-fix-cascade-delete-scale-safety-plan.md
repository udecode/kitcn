---
title: fix: cascade delete scale safety under Convex limits
type: fix
date: 2026-02-07
status: draft
---

# fix: cascade delete scale safety under Convex limits

## Overview
Harden kitcn ORM cascade execution so large fan-out delete/update workloads remain correct and predictable under Convex transaction and scheduling limits.

This plan implements five changes together:
1. Fix cascade continuation semantics by work type (cursor-forward for patch/update paths, re-query-from-null for hard-delete cascade path).
2. Route `scheduledDelete` through async batching.
3. Add byte-aware read budget with safety margin.
4. Add recursive vs non-recursive routing defaults (`100` vs `900`).
5. Add scheduler fan-out cap per mutation with coalescing strategy.

## Brainstorm Context
Found brainstorm from 2026-02-07: `cascade-delete-scale-vs-ents`. Using as context for planning.

## Problem Statement / Motivation
Current async cascade logic has scale and correctness gaps for high fan-out graphs:
- Scheduled cascade worker currently ignores passed cursor for cascade work and re-queries from start (`packages/kitcn/src/orm/scheduled-mutation-batch.ts:207`, `packages/kitcn/src/orm/scheduled-mutation-batch.ts:316`).
- `scheduledDelete` executes sync cascade path (`packages/kitcn/src/orm/scheduled-delete.ts:39`), which can hit single-mutation limits for large delayed hard deletes.
- Batch budgeting uses row count only; no byte budget to protect `16 MiB` read limits.
- Scheduler usage is uncapped per mutation despite Convex scheduling limit of 1000 enqueues per mutation.

Convex limits to design against (per mutation/query):
- Documents scanned: 32,000
- Documents written: 16,000
- Data read: 16 MiB
- Data written: 16 MiB
- Index ranges read: 4,096
- IO operations per function: 1,000
- Scheduled functions enqueued per mutation: 1,000

References:
- `/tmp/cc-repos/convex-backend/npm-packages/docs/docs/production/state/limits.mdx:95`
- `/tmp/cc-repos/convex-backend/npm-packages/docs/docs/production/state/limits.mdx:106`

## Scope
### In scope
- Cascade continuation behavior by work type.
- Async scheduled hard-delete path.
- Runtime defaults/types/schema support for byte and routing controls.
- Scheduler fan-out cap and continuation coalescing.
- Runtime + type test coverage and docs updates.

### Out of scope
- Full Ents-style stack-machine rewrite.
- Auto-fallback from sync mode to async mode.
- RLS semantics changes for cascade mutations.

## Final Decisions (Locked for this plan)
1. Keep sync fail-fast (`mutationMaxRows`) behavior.
2. Keep async mode explicit (`executeAsync` / `mode: 'async'`).
3. Use narrow vs wide routing:
   - Narrow (`100`) for recursive cascade-delete work.
   - Wide (`900`) for non-recursive actions (`set null`, `set default`, `restrict`, `no action`, `cascade-update`).
4. Ship wide-batch default directly (no feature flag).
5. Cap scheduler fan-out per mutation (~100 runAfter calls target).
6. Add read-budget byte awareness with safety margin:
   - Measured threshold default: `2 MiB` (assuming 2x safety factor toward `4 MiB` effective budget).
7. `scheduledDelete` must execute via async batching.

## SpecFlow Analysis
### Flow A: Async delete with non-recursive fan-out (`set null`/`set default`)
- Root row delete triggers incoming FK action lookup.
- Worker paginates and applies patches.
- Continuation uses forwarded cursor.
- Expectation: full fan-out completes with stable progress and no repeated reprocessing.

### Flow B: Async recursive hard cascade delete
- Root row delete cascades into child tables with recursive deletes.
- Continuation uses re-query-from-null strategy for hard-delete cascade work type.
- Expectation: correctness preserved when rows deleted from the same index range mid-execution.

### Flow C: Scheduled soft->hard delete at scale
- `scheduled()` marks soft delete and schedules delayed hard-delete.
- Delayed worker executes async mode and continues through `scheduledMutationBatch`.
- Expectation: no single-transaction blowup for large cascades.

### Flow D: Wide relation graph scheduler pressure
- A mutation that could enqueue many cascade continuation jobs.
- Scheduler fan-out cap enforces bounded runAfter calls.
- Remaining work is coalesced into fewer continuation jobs.
- Expectation: stay below Convex per-mutation schedule limit.

### Flow E: Byte-heavy documents
- Cascade over large documents (high JSON size).
- Worker halts batch by measured-byte threshold before row threshold.
- Expectation: avoid read-budget transaction failures.

## Proposed Solution

## 1) Continuation Strategy by Work Type (P1)
Implement explicit continuation policy in `scheduledMutationBatchFactory`.

- `cascade-update`, `set null`, `set default`: cursor-forward pagination.
- `cascade-delete` (hard recursive delete): re-query-from-null loop per continuation, with deterministic bounded work per invocation.

Why:
- Patch/update paths are stable with cursor-forward.
- Hard-delete paths mutate the scanned set; this plan intentionally uses re-query-from-null for correctness-first behavior.

File scope:
- `packages/kitcn/src/orm/scheduled-mutation-batch.ts:196-323`

## 2) Async `scheduledDelete` (P1)
Make delayed hard-delete scale-safe.

Changes:
- Wire scheduler and `scheduledMutationBatch` into `scheduledDeleteFactory` context creation.
- Execute delayed delete via `.execute({ mode: 'async' })`.
- Update `createOrm` wiring to pass required refs.

File scope:
- `packages/kitcn/src/orm/scheduled-delete.ts:16-44`
- `packages/kitcn/src/orm/create-orm.ts:151-162`

Compatibility note:
- If `scheduledDeleteFactory` signature changes, treat as internal API change and update all internal exports/re-exports.

## 3) Byte-Aware Read Budget (P2)
Add measured-byte stop condition for async cascade batches.

Defaults:
- `mutationMaxBytesPerBatch = 2_097_152` (2 MiB measured).
- Safety model: measured JSON bytes are conservative proxy toward larger internal overhead.

Behavior:
- For each row processed in batch worker, accumulate measured bytes.
- Stop and continue when measured threshold reached.
- Read-budget only (no separate write-byte budget in v1).

File scope:
- `packages/kitcn/src/orm/symbols.ts:6-12`
- `packages/kitcn/src/orm/schema.ts:16-63` (validation + normalization)
- `packages/kitcn/src/orm/mutation-utils.ts` (defaults plumbing)
- `packages/kitcn/src/orm/scheduled-mutation-batch.ts` (enforcement)
- `packages/kitcn/src/orm/types.ts:994-1002` (optional async config extension if per-call override added now)

## 4) Recursive vs Non-Recursive Batch Routing (P2)
Add separate defaults for narrow and wide cascade work.

Defaults:
- `mutationBatchSize` remains narrow default: `100`.
- New `mutationLeafBatchSize`: `900` for non-recursive incoming FK actions.

Classification:
- Recursive: incoming FK contains `onDelete: 'cascade'` for path that can recurse into delete traversal.
- Non-recursive: all other delete/update action types.

File scope:
- `packages/kitcn/src/orm/symbols.ts`
- `packages/kitcn/src/orm/schema.ts`
- `packages/kitcn/src/orm/mutation-utils.ts:834-1130`
- `packages/kitcn/src/orm/scheduled-mutation-batch.ts:215-314`

## 5) Scheduler Fan-Out Cap + Coalescing (P1)
Add hard cap for runAfter calls per mutation invocation (target ~100).

Policy:
- Track runAfter count in current mutation execution context.
- If projected schedules exceed cap:
  - Coalesce pending continuation units into fewer jobs where safe.
  - Prefer grouping by `(workType, table, foreignIndexName, foreignSourceColumns, action)` with packed target tuples.
  - If coalescing cannot fully satisfy cap, reduce per-invocation processed rows and defer remainder.

Notes:
- Must also respect total scheduled args size limit (`16 MiB`).
- Coalescing should include deterministic dedupe to avoid duplicate continuation units.

File scope:
- `packages/kitcn/src/orm/mutation-utils.ts`
- `packages/kitcn/src/orm/scheduled-mutation-batch.ts`

## Data Model / Config Changes
Add new schema defaults:
- `mutationMaxBytesPerBatch?: number`
- `mutationLeafBatchSize?: number`
- `mutationScheduleCallCap?: number` (default `100`)

Validation rules:
- positive integer for batch-size/byte/cap fields
- keep `mutationAsyncDelayMs >= 0`

## Test Plan
### Runtime tests
- `convex/orm/foreign-key-actions.test.ts`
  - Add coverage for non-recursive wide batch behavior.
  - Add byte-threshold stop/continue behavior.
  - Add schedule-cap behavior under many rows/relations.
- `convex/orm/mutations.test.ts`
  - Verify `scheduledDelete` async continuation at scale.
  - Verify continuation policy by work type.
- Add new stress-focused test file if needed:
  - `convex/orm/cascade-scaling.test.ts`.

### Type tests
- `test/types/tables.ts` and related default options type tests:
  - New defaults accepted/rejected appropriately.
- `test/types/delete.ts` / `test/types/update.ts`:
  - If per-call byte override is added, ensure type support.

### Correctness assertions
- No duplicate child processing in patch/update continuation paths.
- Hard-delete cascade eventually converges and drains all matching rows.
- Scheduler cap never exceeded in a single mutation invocation.

## Rollout Plan
### Phase 1 (P1 correctness + limits)
- Implement continuation strategy split.
- Add scheduler fan-out cap.
- Route `scheduledDelete` to async.
- Ship tests for correctness regressions.

### Phase 2 (P2 efficiency)
- Add byte-aware budget.
- Add recursive vs non-recursive routing defaults.
- Tune defaults against integration tests.

### Phase 3 (docs + verification)
- Update ORM docs and performance checklist.
- Add migration notes for new defaults.
- Verify root test suite and typecheck.

## Acceptance Criteria
- [ ] Delayed hard-delete path (`scheduledDelete`) uses async continuation and succeeds on large fan-out datasets.
- [ ] Cascade continuation strategy is explicit by work type and covered by tests.
- [ ] Byte-aware threshold prevents oversized read batches in async cascade workers.
- [ ] Non-recursive actions use wide default batch (`900`), recursive delete uses narrow (`100`).
- [ ] Scheduler runAfter calls are capped per mutation and never exceed configured cap.
- [ ] New defaults are validated at schema definition and available in runtime context.
- [ ] All mutation and FK action tests pass with new behavior.

## Risks & Mitigations
- Risk: Coalescing logic introduces duplicate/omitted work.
  - Mitigation: deterministic keys, dedupe sets, invariant tests.
- Risk: Hard-delete re-query strategy increases total query cost.
  - Mitigation: cap + wide routing where safe; benchmark against fan-out scenarios.
- Risk: Byte proxy mismatch with true runtime memory/read behavior.
  - Mitigation: conservative default threshold and tuning via stress tests.
- Risk: Scheduler cap too low causing slow convergence.
  - Mitigation: configurable cap with safe default.

## References (Code + Docs)
- Current cascade scheduling behavior:
  - `packages/kitcn/src/orm/mutation-utils.ts:893`
  - `packages/kitcn/src/orm/scheduled-mutation-batch.ts:207`
  - `packages/kitcn/src/orm/scheduled-mutation-batch.ts:316`
- Current scheduled delete sync path:
  - `packages/kitcn/src/orm/scheduled-delete.ts:39`
  - `packages/kitcn/src/orm/delete.ts:213`
- Current defaults/types:
  - `packages/kitcn/src/orm/symbols.ts:6`
  - `packages/kitcn/src/orm/schema.ts:16`
  - `packages/kitcn/src/orm/types.ts:994`
- Existing async/cascade tests:
  - `convex/orm/foreign-key-actions.test.ts:442`
  - `convex/orm/mutations.test.ts:527`
- Convex limits:
  - `/tmp/cc-repos/convex-backend/npm-packages/docs/docs/production/state/limits.mdx:95`
  - `/tmp/cc-repos/convex-backend/npm-packages/docs/docs/production/state/limits.mdx:106`
- Convex system clear-table byte-safety precedent:
  - `/tmp/cc-repos/convex-backend/npm-packages/system-udfs/convex/_system/frontend/clearTablePage.ts:36`

## External Research Decision
Skipped. Local repo context and upstream Convex/Ents source available in workspace were sufficient for this plan.

## Unresolved Questions
- Should per-call `maxBytesPerBatch` override be included in v1, or schema-default only first?
- Should scheduler cap enforcement be hard-fail when coalescing cannot stay under limit, or auto-throttle rows further?
