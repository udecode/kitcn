# Issue 249 onUpdate date normalization

## Source

- GitHub issue: https://github.com/udecode/kitcn/issues/249
- Type: bug
- Expected outcome: ORM update hooks returning `Date` for timestamp columns are
  normalized before Convex `db.patch`.

## Scope

- Package code: `packages/kitcn/src/orm/update.ts`
- Regression: `convex/orm/constraints.test.ts`
- Release artifact: create or update an unreleased changeset.
- Browser: not applicable.

## Verification

- Red regression for `timestamp().$onUpdateFn(() => new Date())`: confirmed
  with `bunx vitest run convex/orm/constraints.test.ts -t "normalizes timestamp"`.
- Targeted ORM test: `bunx vitest run convex/orm/constraints.test.ts`.
- Package build: `bun --cwd packages/kitcn build`.
- Lint fix: `bun lint:fix`.
- Typecheck: `bun typecheck`.
- PR gate: `bun check`.
