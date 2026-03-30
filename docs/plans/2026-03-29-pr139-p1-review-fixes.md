# PR #139 P1 Review Fixes

## Goal

Fix the valid P1 review comments on PR #139 and clear any unrelated `check`
blocker so the branch can be pushed honestly.

## Status

- [x] Reload review context after compaction
- [x] Validate the P1 review comments
- [x] Implement the valid P1 fixes locally
- [ ] Fix the unrelated `check` failure in `scenario:test -- all`
- [ ] Rerun verification
- [ ] Push once `check` is green

## Valid P1s

1. `project-context` should not require a Vite entry file just to detect
   supported non-Vite React frameworks.
2. `init --config` should resolve relative to the target project directory.
3. Generated migrations should not import `schema` when schema metadata is
   absent.
4. Generated disabled-auth runtime should not import `schema` when schema
   metadata is absent.

## Current Blocker

`bun check` is red on the unrelated `test:runtime` lane for `next-auth`.
Prepared scenario output is missing `.env.local`, so the Next auth route boots
without `NEXT_PUBLIC_CONVEX_SITE_URL`, which then trips `CONVEX_SITE_URL is not
set`.

## Verification Targets

- `bun test packages/kitcn/src/cli/project-context.test.ts`
- `bun test packages/kitcn/src/cli/commands/init.test.ts`
- `bun test packages/kitcn/src/cli/codegen.test.ts`
- `bun typecheck`
- `bun --cwd packages/kitcn build`
- `bun lint:fix`
- `bun check`
