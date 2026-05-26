---
"kitcn": patch
---

## Patches

- Fix ORM update and delete filters on primary id arrays so bounded mutations do not require `allowFullScan`.
- Bound sync primary-id mutation fanout by `mutationBatchSize` and keep legacy scheduled cursors on the query-pagination path.
