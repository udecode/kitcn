## Task

Investigate report: `create<Module>Caller(requireActionCtx(ctx))` throws
`Action context required` in a client -> mutation -> internal action chain.

## Working read

- `requireActionCtx(ctx)` is honest. It only accepts real action ctx.
- Generated caller runtime already supports scheduling mutations/actions from
  mutation ctx via `caller.schedule.*`.
- Auth org docs + example app currently show action-only narrowing inside a
  callback created from `defineAuth((ctx) => ...)`.
- That callback can run under mutation ctx, so the example is wrong in exactly
  the reported chain.

## Planned fix

1. Add a helper that narrows `GenericCtx` to a scheduler-capable
   mutation-or-action ctx.
2. Add tests for that helper.
3. Update public exports test.
4. Replace broken auth example/docs to use the scheduler helper instead of
   `ActionCtx` / `requireActionCtx`.
5. If `packages/kitcn` changes, update the active unreleased changeset.

## Verification

- Targeted unit tests for `context-utils`.
- Relevant package tests/docs checks as needed.
- `bun --cwd packages/kitcn build`.
- `typecheck` because `.ts` files change.
- `lint:fix` because code changes.
