# Concave alpha.12

## Goal
- Upgrade repo Concave deps to the first installable release carrying the alpha.12 feature batch.
- Update Concave-specific docs/skills for alpha.12 facts that affect kitcn.
- Verify Concave smoke and template lanes still pass.

## Scope
- Root `package.json` Concave devDeps
- Concave skill docs (`.claude`, `.codex`)
- Existing unreleased changeset if user-visible notes need it

## Plan
1. Inspect current Concave version pins and stale docs.
2. Bump deps to alpha.12 and install.
3. Update Concave docs/skills for alpha.12 deltas that matter here.
4. Run Concave/template verification.
5. Update changeset if needed.

## Findings
- Current pins are `0.0.1-alpha.11` in root `package.json`.
- Concave skill still says components unsupported; the alpha.12 feature batch contradicts that.
- `@concavejs/cli@0.0.1-alpha.12` and `@concavejs/runtime-bun@0.0.1-alpha.12` were published with broken `workspace:*` deps, so Bun cannot install them.
- `0.0.1-alpha.13` is the first installable publish carrying that feature batch.

## Progress
- [x] Inspect pins and docs
- [x] Bump deps
- [x] Update docs/skills
- [x] Verify
- [x] Changeset sync
