# 2026-03-24 Auth Env Auto Detect

## Goal

Make `kitcn env push` auth-aware by default and remove the public
`--auth` flag.

`kitcn dev` should stop requiring a second manual auth env pass. It
should prepare auth env before startup, then finish JWKS sync after the local
backend is up.

## Learnings

- `docs/solutions/integration-issues/raw-convex-auth-adoption-bootstrap-20260318.md`
  proves auth env bootstrap is a two-phase reality:
  deploy `BETTER_AUTH_SECRET` first, then fetch/push `JWKS`.
- `docs/solutions/integration-issues/dev-prerun-must-use-native-convex-dev-run-20260324.md`
  proves local Convex boot sequencing matters; bolting preflight calls onto the
  wrong phase breaks fresh local dev.

## Plan

- [x] Add failing tests for auth-aware `env push` without `--auth`
- [x] Add a failing dev test for one-pass auth env bootstrap
- [x] Implement auto auth detection and remove the public `--auth` flag
- [x] Update docs, skill refs, and the active changeset
- [x] Verify with tests, build, lint, and targeted runtime proof

## Notes

- Hard cut only. No compatibility alias for `--auth`.
- Auth detection belongs in scaffold/plugin state, not `kitcn.json`.
- Keep `--rotate`; it is a real distinct action.
