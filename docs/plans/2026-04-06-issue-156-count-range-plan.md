# Issue 156 plan

- Source: GitHub issue #156 `count() with range query on composite aggregateIndex suffix silently returns 0`
- Type: bug, package code, non-trivial
- Repro seam: aggregate/count planner emits string-mode timestamp range values as ISO strings; aggregate buckets store numeric millis
- Chosen seam: normalize aggregate/count comparable values inside `packages/kitcn/src/orm/aggregate-index/runtime.ts`
- Why not quick patch: fixing only `count()` would leave `aggregate()` and OR-collapse paths inconsistent
- Verification:
  - targeted Vitest regression for string-mode timestamp range count
  - `bun --cwd packages/kitcn typecheck`
  - `bun --cwd packages/kitcn build`
- Release artifact: update existing unreleased `.changeset/smooth-cows-invite.md`
