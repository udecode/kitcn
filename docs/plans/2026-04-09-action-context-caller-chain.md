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

1. Keep the runtime rule: mutation ctx cannot call actions directly.
2. Improve `requireActionCtx(ctx)` so mutation-like misuse points at
   `requireSchedulerCtx(ctx)` + `caller.schedule.*`.
3. Replace broken docs/examples that force `requireActionCtx(ctx)` in
   mutation-capable flows.
4. Sync the Convex skill docs with the same rule.
5. Update the active unreleased changeset because `packages/kitcn` changed.

## Outcome

- `requireActionCtx(ctx)` now gives a scheduler-specific hint when the passed
  ctx can schedule work but cannot call actions directly.
- Server docs now show `requireSchedulerCtx(ctx)` + `caller.schedule.now.*`
  for mutation-or-action flows instead of the broken direct action example.
- Convex skill docs now match the public docs.
- Active unreleased changeset updated.

## Verification

- Targeted unit tests for `context-utils`.
- Relevant package tests/docs checks as needed.
- `bun --cwd packages/kitcn build`.
- `typecheck` because `.ts` files change.
- `lint:fix` because code changes.
