# Issue 186 watcher env codegen

## Source of truth

- GitHub issue: https://github.com/udecode/kitcn/issues/186
- Title: Watcher codegen doesn't load convex/.env vars, causing env validation failures
- Type: bug

## Scope

- Package: `packages/kitcn`
- Likely seam: watcher codegen path in `src/cli/watcher.ts`
- No browser surface

## Acceptance

- Watcher-triggered codegen sees `convex/.env` for Convex parse-time imports.
- Regression test fails before fix, passes after fix.
- Package checks run for touched TS.

## Repo-required follow-ups

- Update active unreleased `.changeset/*.md` if package behavior changed.
- Run `bun --cwd packages/kitcn build`.
