---
"kitcn": minor
---

## Breaking changes

- Build ORM tables on first use. `convexTable(...)` no longer throws definition errors (invalid indexes, constraints, extra config). They throw when the schema is pushed, when `kitcn codegen` runs, or when `schema.export()` is called.

```ts
// Before: throws here
const posts = convexTable('posts', { text: text() }, () => [searchIndex('s')]);

// After: throws on push and codegen, or in a test with schema.export()
const schema = defineSchema({ posts });
schema.export();
```

- Reference columns in extra config through the table argument. A column builder variable shared across tables and used directly in an index throws an ownership error at push.

```ts
// Before
const tenantId = text().notNull();
const a = convexTable('a', { tenantId }, () => [index('a_t').on(tenantId)]);

// After
const a = convexTable('a', { tenantId }, (t) => [index('a_t').on(t.tenantId)]);
```

- Require `rlsPolicy(...).link(table)` at module scope, in `schema.ts` or in the module that declares the table. A linked policy applies to its table as soon as it is linked.

```ts
// Before: linked inside another table's extra config
const posts = convexTable('posts', { body: text() }, () => [
  rlsPolicy('read_users', { for: 'select' }).link(users),
]);

// After: link at module scope
export const readUsers = rlsPolicy('read_users', { for: 'select' }).link(users);
```

## Patches

- Preserve self-referencing foreign keys whose callbacks read table metadata through `getTableConfig`.
- Preserve foreign-key targets and required fields when column builders are reused across tables or in a discriminator.
- Improve cold Convex function start: a query or insert builds only the tables it touches, and query contexts no longer build every table's query builder and foreign-key graph. The first update or delete still reads every table's foreign keys, and `createOrm` without the aggregate capability still builds every table.
- Fix broken `references(() => ...)` callbacks surfacing on the first ORM call instead of on push, and passing on a retry.
