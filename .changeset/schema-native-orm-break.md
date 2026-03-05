---
"better-convex": major
---

## Breaking changes

- `createOrm` is now schema-native. Pass the schema export directly and stop passing `triggers`.

```ts
// Before
const relations = requireSchemaRelations(schema);
const triggers = getSchemaTriggers(schema);
const orm = createOrm({
  schema: relations,
  triggers,
  ormFunctions,
  migrations,
  internalMutation,
});

// After
const orm = createOrm({
  schema,
  ormFunctions,
  migrations,
  internalMutation,
});
```

- Generated migrations helper is now schema-typed and no longer derives a local `relations` binding.

```ts
// generated/migrations.gen.ts
export function defineMigration(
  migration: MigrationDefinition<typeof schema>
): MigrationDefinition<typeof schema> {
  return baseDefineMigration<typeof schema>(migration);
}
```

- `MigrationDefinition` now accepts schema-like inputs (`typeof schema`) directly.

- Public ORM types are now schema-native. Use `typeof schema` directly in type positions; no `ResolveOrmSchema<...>` wrapper needed in app/generated code.

```ts
// Before
type Ctx = GenericOrmCtx<ServerMutationCtx, ResolveOrmSchema<typeof schema>>;
type Writer = OrmWriter<ResolveOrmSchema<typeof schema>>;

// After
type Ctx = GenericOrmCtx<ServerMutationCtx, typeof schema>;
type Writer = OrmWriter<typeof schema>;
```

## Notes

- ORM still supports no-relations-mode projects.
- `getSchemaRelations` / `requireSchemaRelations` remain low-level utilities, but generated/example canonical wiring no longer uses them.
