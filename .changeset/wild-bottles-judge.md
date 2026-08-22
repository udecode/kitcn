---
"kitcn": patch
---

## Patches

- Improve the read cost of filtering parents by whether a related child exists.
  `where: { posts: { type: 'wanted' } }` now stops at the first matching child
  instead of loading the whole per-parent child window and testing it afterwards.
  On one parent with 61 posts and a match sorting first, that is 2 document reads
  instead of 62 — the same cost as the hand-written
  `with: { posts: { where: { type: 'wanted' }, limit: 1 } }`. The same applies to
  `where: { posts: true }`, to a relation existence test under `NOT`, and to
  `through` relations, where it also stops at the first matching junction row.
  Results are unchanged: the filter still decides from the same window it read
  before, so a match past `defaultLimit` is excluded exactly as it was.
- A relation named more than once in one `where` — across `OR`, `AND` and `NOT`
  branches — keeps the previous single unbounded load, because those branches
  share it and each needs to read it in full.
