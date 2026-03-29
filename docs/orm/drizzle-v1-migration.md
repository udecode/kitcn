# Drizzle v1 Migration Guide (Better-Convex ORM)

This guide migrates Better-Convex ORM usage from Drizzle v0.45-style patterns to v1-only API.

## Summary of Breaking Changes

- `relations()` -> `defineRelations()`
- `fields` -> `from`
- `references` -> `to`
- `relationName` -> `alias`
- `where` callbacks -> object filters
- Mutations now use ORM builders (`insert`, `update`, `delete`)

## Checklist

- [ ] Replace `relations()` exports with a single `defineRelations()` call
- [ ] Update relation configs to `from` / `to`
- [ ] Replace `relationName` with `alias`
- [ ] Update query `where` to object filters
- [ ] Update docs/examples to v1 syntax
- [ ] Switch mutations to ORM builders

## Relations Migration

### Before (v0.45)

```ts
const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
}));

const postsRelations = relations(posts, ({ one }) => ({
  author: one(users, {
    fields: [posts.userId],
    references: [users.id],
  }),
}));
```

### After (v1)

```ts
export const relations = defineRelations({ users, posts }, (r) => ({
  users: {
    posts: r.many.posts(),
  },
  posts: {
    author: r.one.users({
      from: r.posts.userId,
      to: r.users.id,
    }),
  },
}));
```

## Query Filters

### Before (callback)

```ts
const admins = await db.query.users.findMany({
  where: (users, { and, eq, gt }) =>
    and(eq(users.role, 'admin'), gt(users.lastSeen, Date.now() - 86_400_000)),
});
```

### After (object filters)

```ts
const admins = await db.query.users.findMany({
  where: {
    role: 'admin',
    lastSeen: { gt: Date.now() - 86_400_000 },
  },
});
```

## Mutations

### Before (native Convex)

```ts
await ctx.db.insert('users', { name: 'Ada' });
await ctx.db.patch(id, { name: 'Ada Lovelace' });
await ctx.db.delete(id);
```

### After (ORM builders)

```ts
await db.insert(users).values({ name: 'Ada' });
await db.update(users).set({ name: 'Ada Lovelace' }).where(eq(users.id, id));
await db.delete(users).where(eq(users.id, id));
```

## Verification

- Run `bun typecheck`
- Run `bun run test`
- Run `bun --cwd packages/kitcn build` (known rolldown issue may persist)
