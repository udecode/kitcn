# Issue 218 bidirectional revision pointers

## Context

- Source: GitHub issue #218.
- Report: a CMS schema with `pageLocaleRevisions.pageLocaleId` plus
  `pageLocales.currentRevisionId` and `pageLocales.publishedRevisionId` all
  using `.references(...)` was believed to create a schema/codegen cycle.
- Current HEAD repro: `defineSchema(...)`, `getTableConfig(...)`, and
  `generateMeta(...)` already handle that shape.
- Real gap: no regression proves the pattern, and docs do not say the CMS shape
  is supported.

## Acceptance

- Regression coverage proves bidirectional revision pointers resolve in ORM
  schema metadata.
- Regression coverage proves codegen imports a real cyclic revision schema
  without dropping ORM support.
- ORM docs show the supported pattern for `belongs-to + current pointer +
  published pointer`.

## Verification

- `bun test ./packages/kitcn/src/orm/schema-integration.test.ts`
- `bun test ./packages/kitcn/src/cli/codegen.test.ts`
- `bun --cwd packages/kitcn build`
- `bun lint:fix`
- `bun typecheck`

## Notes

- No browser surface.
- If package runtime behavior does not change, no changeset update needed.
