## Goal

Add server-only procedure info to middleware so reusable logging/tracing can
log what ran plus duration without abusing client-visible `meta`.

## Constraints

- Convex root query/mutation/action ctx does not expose function path.
- Raw `queryGeneric(...)` / `mutationGeneric(...)` exports do not carry
  `Symbol.for("functionName")` automatically before generated API refs.
- Do not fake automatic names.

## Chosen slice

1. Add built-in `procedure` middleware opts.
2. Always expose procedure `type`.
3. Expose explicit cRPC `name` via server-only builder method.
4. Expose HTTP route info automatically from route definition.
5. Update docs example to use `procedure`.
6. Add tests first.
7. Update active unreleased changeset.

## Verification

- targeted builder/http-builder tests
- relevant typecheck/lint path if needed
- `bun --cwd packages/kitcn build`

