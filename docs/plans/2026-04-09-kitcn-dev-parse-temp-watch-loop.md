# kitcn dev parse temp watch loop

## Source of truth

- User report:
  - with `kitcn dev` running, saving a file can cause nonstop rewrites until
    shutdown
  - suspected self-watch loop
- Type: bug

## Scope

- Package: `packages/kitcn`
- Likely seam: watcher ignore contract in `src/cli/watcher.ts`
- Root cause candidate: parse-time temp files written by codegen inside watched
  roots
- No browser surface

## Acceptance

- Watcher ignores codegen-owned `*.kitcn-parse.ts` temp files.
- Regression test fails before fix, passes after fix.
- Package checks run for touched TS.

## Repo-required follow-ups

- Update active unreleased `.changeset/issue-186-watcher-env-codegen.md`.
- Run `bun --cwd packages/kitcn build`.
