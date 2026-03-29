# 2026-03-24 Watch Local Convex Env Sync

## Goal

Make `kitcn dev` watch `convex/.env` on backend `convex` and auto-run
auth-aware env sync after local edits.

## Learnings

- `docs/solutions/integration-issues/auth-env-push-must-be-auth-aware-and-dev-bootstrap-must-stay-two-phase-20260324.md`
  proves auth env sync is two-phase, but local dev should hide that split.
- `docs/solutions/integration-issues/dev-prerun-must-use-native-convex-dev-run-20260324.md`
  proves local Convex bootstrap sequencing must stay inside the real dev lifecycle.

## Plan

- [x] Add failing tests for local `convex/.env` watch sync in `dev`
- [x] Implement debounced `convex/.env` watcher for backend `convex`
- [x] Avoid self-trigger loops from generated `BETTER_AUTH_SECRET` writes
- [x] Update docs, skill refs, and active changeset
- [x] Verify with tests, build, lint, and targeted runtime proof

## Notes

- Local Convex only. No Concave generic fallback.
- `env push` stays for `--prod`, `--rotate`, and explicit repair.
- Broad root `bun typecheck` is still blocked by pre-existing `example/`
  generated runtime/type errors, not this dev watcher work.
