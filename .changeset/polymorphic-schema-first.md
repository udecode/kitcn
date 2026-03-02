---
"better-convex": minor
---

ORM Discriminator (polymorphic):

- Drop the experimental query-level `polymorphic` config from `findMany`, `findFirst`, and `findFirstOrThrow`.

```ts
// Before
await db.query.auditLogs.findMany({
  polymorphic: {
    discriminator: "actionType",
    schema: targetSchema,
    cases: { role_change: "roleChange", document_update: "documentUpdate" },
  },
  limit: 20,
});

// After
const rows = await db.query.auditLogs.findMany({ limit: 20 });
// Polymorphic data is synthesized from table schema at row.details
```

- Add schema-first polymorphic discriminator columns via `discriminator({ variants, as? })` directly in `convexTable(...)`.
- Add typed nested read unions at `details` by default (or custom alias via `as`).
- Add `withVariants: true` as a query shortcut to auto-load one() relations on discriminator tables.
- Reject invalid branch writes when required variant fields are missing.
- Reject cross-branch write combinations that set fields outside the active discriminator variant.
