---
"kitcn": minor
---

## Breaking changes

- Read a `select().flatMap(relation, { where })` stage through an index that extends the relation's foreign key when the schema declares one. Children arrive in that index's order, so a lowered range field now orders them ahead of creation time, and outstanding page cursors for those queries do not carry over.

```ts
// Before: every post by the author is read, then filtered, in creation order.
// After: only the by_author_likes range is read, in numLikes order.
index("by_author_likes").on(t.authorId, t.numLikes);

await ctx.orm.query.users
  .select()
  .flatMap("posts", { includeParent: false, where: { numLikes: { gt: 10 } } })
  .paginate({ cursor: null, limit: 20 });
```

## Patches

- Compile a `select().union([{ where }])` source `where` against the table's indexes instead of filtering every scanned row, so an object `where` on an indexed field bounds the read. A source keeps its unanchored read when the lowered one could not supply `interleaveBy`, and a `where` never displaces an index the source or the chain pinned with a range.
- Report what a caller can actually do when a `predicate(...)` `where` runs over an unbounded pipeline read: a union source names its own `index` option, and a `flatMap` stage names the relation index it needs.
- Resolve a `select()` union source or `flatMap` stage `where` once per read. A callback `where` runs a single time instead of twice, and an object `where` compiles once instead of once per row.
