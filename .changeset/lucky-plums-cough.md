---
"kitcn": patch
---

## Patches

- Fix `findMany` losing its read bound when a `limit` is combined with `in`, `ne`,
  `notIn` or a same-field `OR` on a table that has RLS enabled, or alongside a
  filter Convex cannot evaluate such as `contains`. Either one used to make the
  query read every row it matched against, so
  `findMany({ where: { ownerId: { in: [a, b] } }, limit: 3 })` read 500 documents
  on a 500-row table and 200 on a 200-row table. It now reads 6 at either size,
  and the count no longer grows with the table.
- Improve how that `limit` is counted, so it bounds rows the caller can actually
  see: with 80 rows an RLS policy hides sitting in front of the matches,
  `limit: 3` still returns three rows and reads 86 documents instead of 200.
- Support that bound for an `in` list of any length.

Rows and their order are unchanged. A `where` that filters through a relation
keeps its previous read cost, as does `ne`, `notIn` or `isNotNull` ordered by a
field no index can serve.
