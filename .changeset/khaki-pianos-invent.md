---
"kitcn": patch
---

## Patches

- Fix soft cascade delete re-reading every child it had already processed. A soft delete only stamps `deletionTime`, so processed children stayed inside the foreign key index range and each scheduled batch replayed them, growing reads quadratically with row count and eventually failing the campaign on Convex's read limit — which could leave an `aggregateIndex`/`rankIndex` table stuck refusing writes. Batches now resume where the previous one stopped, so a full campaign's reads scale linearly with the number of children.
