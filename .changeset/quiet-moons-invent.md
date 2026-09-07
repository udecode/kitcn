---
"kitcn": patch
---

## Patches

- Improve `aggregateIndex` bulk-write read costs by reusing bucket and member
  reads within uninterrupted ORM statements. User hooks and policy callbacks
  end reuse so nested mutation writes remain visible to later maintenance.
