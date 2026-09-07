---
"kitcn": patch
---

## Patches

- Improve bulk aggregate writes by folding shared bucket and extrema updates
  within uninterrupted statements. A 40-row key migration writes two shared
  buckets and two extrema entries, plus forty membership rows.
- Preserve read-your-own-writes through aggregate reads and nested functions
  called by lifecycle hooks or RLS policies. Reads and callbacks flush pending
  writes; callbacks suspend batching until they settle.
- Fix mid-statement aggregate reads through `withoutTriggers()` and an ORM
  rebuilt from a hook context to observe the same rows as `ctx.orm`.
