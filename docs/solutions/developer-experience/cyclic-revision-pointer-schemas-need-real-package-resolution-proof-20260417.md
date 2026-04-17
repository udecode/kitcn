---
title: Cyclic revision-pointer schemas need real package-resolution proof
date: 2026-04-17
category: developer-experience
module: orm-codegen
problem_type: developer_experience
component: tooling
severity: medium
applies_when:
  - Triaging issue reports about cyclic ORM foreign keys in schema.ts
  - Writing codegen regressions that import a real kitcn schema
  - Verifying CMS models with current and published revision pointers
tags:
  - codegen
  - orm
  - schema
  - foreign-keys
  - cyclic-references
  - revision-pointers
---

# Cyclic revision-pointer schemas need real package-resolution proof

## Context

Issue #218 reported that a common CMS model looked unsupported:

- `pageLocaleRevisions.pageLocaleId -> pageLocales.id`
- `pageLocales.currentRevisionId -> pageLocaleRevisions.id`
- `pageLocales.publishedRevisionId -> pageLocaleRevisions.id`

Current HEAD already supported that schema in ORM metadata and codegen. The
real gap was proof: no regression covered the shape, and a fake test fixture
could silently make `generateMeta()` fall back out of ORM mode by failing to
resolve `kitcn/orm`.

## Guidance

Treat this schema shape as supported.

For ORM proof, use a direct schema regression like:

```ts
const pageLocales = convexTable("pageLocales", {
  currentRevisionId: id("pageLocaleRevisions").references(
    () => pageLocaleRevisions.id
  ),
  publishedRevisionId: id("pageLocaleRevisions").references(
    () => pageLocaleRevisions.id
  ),
});

const pageLocaleRevisions = convexTable("pageLocaleRevisions", {
  pageLocaleId: id("pageLocales")
    .references(() => pageLocales.id, { onDelete: "cascade" })
    .notNull(),
});
```

For codegen proof, use a temp app that resolves the real package layout. In
tests, symlink `node_modules/kitcn` to the actual package directory instead of
faking package exports with ad-hoc absolute targets.

```ts
fs.mkdirSync(path.join(dir, "node_modules"), { recursive: true });
fs.symlinkSync(packageRoot, path.join(dir, "node_modules", "kitcn"), "dir");
```

Then assert `generateMeta()` keeps ORM mode enabled by checking generated
server output for `createOrm` / `withOrm`.

## Why This Matters

If the fixture does not resolve `kitcn/orm` the way a real app does,
`resolveSchemaMetadataForCodegen()` can swallow the schema import failure and
quietly downgrade generated output to plain Convex ctx types. That looks like a
schema-cycle product bug when it is actually a bad proof setup.

The supported CMS shape is worth pinning because it is a natural model for
draft/current/published revision flows and easy to regress accidentally if no
test names it directly.

## When to Apply

- When someone reports that bidirectional revision pointers break schema/codegen
- When adding or refactoring `generateMeta()` schema-import coverage
- When documenting ORM foreign-key patterns beyond simple parent/child examples

## Examples

Before:

- Manual repro says the schema works
- No regression proves it
- A fake `kitcn` package fixture can hide the truth

After:

- ORM regression proves both directions of the foreign-key graph
- Codegen regression imports a real schema through a real package layout
- Docs say the CMS revision-pointer pattern is valid

## Related

- [GitHub issue #218](https://github.com/udecode/kitcn/issues/218)
- [Generated runtime refs must type from Convex generated api contracts](../build-errors/generated-runtime-must-type-from-generated-api-contracts-20260325.md)
