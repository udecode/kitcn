# 2026-03-23 Init Hard Cut

## Goal

Remove `better-convex create`. Make `better-convex init` the only bootstrap
entrypoint for both:

- fresh app scaffold with `-t <next|vite>`
- in-place Better Convex adoption of an existing supported app

Also remove `/docs/templates` and move the remaining scaffold docs into the CLI
registry page.

## Plan

- [x] Flip CLI tests to `init`-only bootstrap behavior and watch them fail
- [x] Merge fresh scaffold behavior into `init`
- [x] Remove public `create` command surface
- [x] Update tooling to generate fixtures/scenarios through `init -t`
- [x] Rewrite docs and synced Convex references
- [x] Update the unreleased changeset
- [x] Verify with tests, fixtures sync/check, build, typecheck, lint

## Notes

- Hard cut. No `create` alias.
- `convex init` remains the deployment/bootstrap command under the hood.
- `better-convex init --yes` in an empty dir should not keep the old hidden
  overlay-only behavior.
- `bun typecheck` and `bun run fixtures:check` are still blocked by the
  pre-existing generated runtime typing issue in `fixtures/vite` /
  `fixtures/next`, not by this command cut.
