---
date: 2026-02-07
topic: cascade-delete-scale-vs-ents
status: reviewed-with-limit-audit
---

# Cascade Delete at Scale: Reviewed Brainstorm (Limit-Aware)

## What We're Building
We want a cascade architecture that is predictable at very high fan-out (10k+ children), explicitly safe in sync mode, and robust against Convex per-mutation limits.

## Convex Limits We Must Design Around
Most relevant per mutation/query constraints:
- Documents scanned: 32,000
- Documents written: 16,000
- Data read: 16 MiB
- Data written: 16 MiB
- Index ranges read: 4,096
- IO operations per function: 1,000
- Scheduled functions enqueued per mutation: 1,000

Implication: row-count-only batching is insufficient. We need both row and byte budgets, and we should avoid producing excessive scheduler fan-out in one mutation.

## Verified Comparison (Corrected)
### kitcn ORM strengths
- Async cascade path paginates from the first FK query and schedules continuation.
- FK action coverage is broader (`cascade`, `restrict`, `no action`, `set null`, `set default`) for delete and update.
- Cascade updates are supported (`cascade-update`).
- Sync fail-fast contract (`mutationMaxRows`) is explicit and tested.
- Cycle guard exists via `visited` set in cascade delete traversal.

### Convex Ents strengths
- Scheduled deletion uses a stack-based continuation model.
- Batch budgeting is both document-count and byte-aware.
- Route choice (`paginate` vs `cascade`) is explicit in scheduled deletion flow.

### Important corrections to prior claims
- Ents does use `.collect()` in initial delete paths, but not unconditionally in all deletion modes; some paths are gated when soft/scheduled deletion behavior applies.
- kitcn cascade continuation currently ignores passed cursor in scheduled cascade work. This is a correctness risk, not only perf risk.
- kitcn `scheduledDelete` currently executes sync delete cascade (`.execute()`), so large delayed hard-deletes are not yet scale-batched.

## Decision Audit (From Provided Spec)
1. Keep sync fail-fast as default: **Keep**
Reason: explicit contract, predictable semantics, avoids hidden async behavior.

2. Async as explicit scale path: **Keep**
Reason: aligns with existing API and user intent.

3. Add byte limits globally + per-call override: **Keep with adjustment**
Adjustment: start with global defaults first; add per-call override after stability.

4. Static leaf classification: **Adjust**
Adjustment: classify recursion by `cascade` edges only. `set null`/`set default` are fan-out but not recursive.

5. `scheduledDelete` should use async batching: **Keep**
Reason: required for large delayed hard-delete safety under transaction limits.

6. No stack state machine: **Keep for now**
Reason: YAGNI if cursor continuation and batching are fixed; revisit only if scheduler fan-out remains problematic.

7. `mutationLeafBatchSize: 900`: **Adjust**
Adjustment: treat as experimental, not default. IO and scheduler limits vary by shape and edge count.

## Key Risks to Prior Spec
- Cursor bug in scheduled cascade can reprocess rows; with soft cascades this can repeatedly target the same rows.
- Scheduler fan-out per mutation can breach the 1,000 scheduled-functions limit in wide FK graphs if not controlled.
- Byte budget assumptions should not rely on rough string-size proxies alone without safety margin.

## Recommended Direction
Approach A (recommended): keep current async architecture and harden it.
- First: fix cascade cursor continuation semantics.
- Second: make scheduled delayed hard-deletes run through async batching.
- Third: add byte-aware budgets.
- Fourth: add conservative adaptive routing and scheduler fan-out guardrails.

## Open Questions
- Should we cap schedule calls per mutation to avoid hitting 1,000 enqueues?
- Should byte limits be read-only budget, write-only budget, or combined worst-case budget?
- Do we ship leaf-batch tuning behind a feature flag first?

## Next Steps
-> `/workflows:plan` to define an incremental rollout with tests for soft-cascade continuation, wide fan-out scheduling, and byte-budget cutoffs.
