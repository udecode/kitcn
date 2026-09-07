---
"kitcn": minor
---

## Breaking changes

- Support index-ordered pagination for indexed filters with more than 64 values. Pages follow index order, grouped by the filtered value, rather than creation order. Add `orderBy` and `maxScan` to preserve newest-first paging.

```ts
// Before
const page = await db.query.users.withIndex("by_status").findMany({
  where: { status: { in: manyStatuses } },
  cursor: null,
  limit: 20,
  maxScan: 500,
});

// After
const page = await db.query.users.withIndex("by_status").findMany({
  where: { status: { in: manyStatuses } },
  orderBy: { createdAt: "desc" },
  cursor: null,
  limit: 20,
  maxScan: 500,
});
```

## Patches

- Fix unnecessary full-table reads for `select()` filters containing more than 64 values.
- Fix unnecessary full-table reads for long `in` lists combined with another condition, such as `name: { contains: 'x' }`.
- Improve limited reads with additional conditions so they stop after enough matching rows are found when index order satisfies the requested sort.
- Support index-bounded reads for indexed `in`, `notIn`, `ne`, and same-field equality `OR` filters regardless of list length.
- Support pagination without `maxScan` for wide filters whose requested order follows their indexed values; cross-value sorting, such as `orderBy: { createdAt: 'desc' }`, still requires `maxScan` past 64 values.
