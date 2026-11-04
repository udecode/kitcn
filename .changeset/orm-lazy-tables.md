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

```ts
// Before: linked inside another table's extra config
const posts = convexTable('posts', { body: text() }, () => [
  rlsPolicy('read_users', { for: 'select' }).link(users),
]);

// After: link at module scope
export const readUsers = rlsPolicy('read_users', { for: 'select' }).link(users);
```

## Features

- Add `defineSchema(tables, { eagerTables: true })` to build every table when the schema is defined.

## Patches

- Preserve self-referencing foreign keys whose callbacks read table metadata through `getTableConfig`.
- Improve cold Convex function start: a query or insert builds only the tables it touches, and query contexts no longer build every table's query builder and foreign-key graph. The first update or delete still reads every table's foreign keys, and `createOrm` without the aggregate capability still builds every table.
- Fix broken `references(() => ...)` callbacks surfacing on the first ORM call instead of on push, and passing on a retry.
