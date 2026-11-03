---
"kitcn": minor
---

## Breaking changes

- Build ORM tables on first use. `convexTable(...)` no longer throws definition errors (invalid indexes, constraints, extra config); they throw when the schema is pushed, when `kitcn codegen` runs, or when `defineSchema` runs with `eagerTables: true`.

```ts
// Before: throws here
const posts = convexTable('posts', { text: text() }, () => [searchIndex('s')]);

// After: throws on push and codegen, or here with eagerTables
export default defineSchema({ posts }, { eagerTables: true });
```

- Require `rlsPolicy(...).link(table)` at module scope. A linked policy applies to its table as soon as it is linked.

## Features

- Add `defineSchema(tables, { eagerTables: true })` to build every table when the schema is defined.

## Patches

- Improve cold Convex function start: a function builds only the tables it reads or writes, and query contexts no longer build every table's query builder and foreign-key graph.
- Fix broken `references(() => ...)` callbacks surfacing on the first ORM call instead of on push.
