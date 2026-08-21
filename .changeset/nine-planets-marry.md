---
"kitcn": patch
---

## Patches

- Fix a multi-field `orderBy` reading the whole table even when a declared
  compound index already produces that exact order. `orderBy: [asc(type),
  asc(numLikes)]` with `limit: 5` against an index on `(type, numLikes)` now
  reads 5 documents instead of every row, at any table size — previously the
  read cost was the same whether you asked for 5 rows or 50. The same bound
  applies to relations: `with: { posts: { orderBy: { numLikes: 'asc' },
  limit: 2 } }` now reads 2 children per parent instead of all of them.
- Prefer an index that supplies more of the requested sort when several serve
  the filter equally well, so `(orgId, createdAt, title)` is chosen over
  `(orgId, createdAt)` for a sort on both `createdAt` and `title`.
- Stop warning that secondary `orderBy` fields are unstable across pages when
  the index carries the whole sort. A Convex cursor is the index key, so those
  pages are stable. The warning still fires — with corrected wording — when no
  index serves the full sort and the extra fields really are dropped.
- Sorts that mix directions, skip an index key, or run over a column that can
  be missing or null keep using the post-fetch sort, so row order and null
  placement are unchanged.
