---
"kitcn": minor
---

## Breaking changes

- Cursor pages for an index-union filter with no `orderBy` are now in the order of the index the read walks, grouped by the probed value, instead of creation order. Add `orderBy` to keep newest-first paging.

```ts
// Before
const page = await db.query.users.withIndex('by_status').findMany({
  where: { status: { in: ['active', 'pending'] } },
  cursor: null,
  limit: 20,
  maxScan: 500,
});

// After
const page = await db.query.users.withIndex('by_status').findMany({
  where: { status: { in: ['active', 'pending'] } },
  orderBy: { createdAt: 'desc' },
  cursor: null,
  limit: 20,
});
```

## Features

- Page `in`, `notIn`, `ne`, and same-field equality `OR` filters from one index range per value instead of scanning the table. Cursor pagination over these filters no longer needs `maxScan`, and `orderBy` sorts across the whole result rather than per value.

## Patches

- Fix `select()` composition and `endCursor` pagination reading a whole index instead of the compiled index ranges when the filter is an index union.
- Fix cursor pagination with a residual post-filter reading a whole index instead of the compiled index ranges when the filter is an index union.
- Fall back to a bounded scan when the probed index cannot supply the requested `orderBy` or the union is wider than 64 ranges.
