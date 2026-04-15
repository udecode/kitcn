# Issues 208 and 209 deploy env passthrough

## Context

- Source: GitHub issues #208 and #209.
- Bug: `kitcn deploy` does not pass ambient Convex deployment env to the
  `convex deploy` subprocess.
- User-visible failure: CI sees no deployment config even when
  `CONVEX_DEPLOY_KEY` is set.
- Comment on #208 confirms `--env-file` workaround and points to #209.

## Acceptance

- `kitcn deploy` passes ambient Convex deployment env vars to `convex deploy`.
- `kitcn dev` and `kitcn codegen` keep clearing ambient deployment env by
  default.
- Regression coverage proves deploy env passthrough through the CLI runner.
- Published package change updates the active unreleased changeset.

## Verification

- Targeted red-green test in `packages/kitcn/src/cli/cli.commands.ts`.
- `bun test ./packages/kitcn/src/cli/cli.commands.ts`.
- `bun --cwd packages/kitcn build`.
- `lint:fix`, `typecheck`, `check` before PR.

## Notes

- No browser surface.
- The deploy fix had no scaffold impact. PR gate exposed a Start auth scaffold
  route issue, so fixture sync/check became required and passed.
