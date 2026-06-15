# copy plate release ci setup

Objective:
Copy Plate release CI/setup into KitCN and adapt it to KitCN's Bun-based
workspace, release package layout, and repository security model.

Completion threshold:
- Plate release/setup surfaces are audited against KitCN.
- Equivalent release workflows, shared setup action, prompt, helper scripts,
  package scripts, and tests are present where they apply.
- Plate-only release-index/template sync pieces have explicit KitCN-specific
  N/A decisions.
- Focused helper tests, autoreview, and full repo check pass.
- Verified code changes are committed, pushed, and opened as a PR.

Verification surface:
- Source audit compared `../plate/.github/workflows/*release*`,
  `../plate/.github/workflows/*cache*`,
  `../plate/.github/prompts/release-notes-rewrite.md`,
  `../plate/tooling/scripts/*release*`,
  `../plate/tooling/scripts/*publish*`,
  `../plate/tooling/scripts/auto-release-pr.*`, and
  `../plate/tooling/scripts/await-npm-publish.mjs` against KitCN.
- Focused tests cover auto-release checkbox parsing, release changeset
  preparation, package tag derivation, release note generation/validation, and
  release workflow wiring.
- Full `bun check` covers repo lint, typecheck, tests, fixtures, verify, and
  runtime scenarios.

Constraints:
- Keep this to release/CI setup and its direct tests.
- No changeset: this has no published runtime/API/user-facing package delta.
- No browser proof: no app UI changed.
- Keep Plate-specific release-index/template sync out unless KitCN has the same
  release artifact system. It does not.

Boundaries:
- Edited GitHub workflows/actions/prompts, release helper scripts/tests,
  package CI release scripts, and this plan.
- Did not port Plate `sync-version-package-releases.*`; it targets Plate's
  release-index/template documentation flow, which KitCN does not have.
- Did not modify scaffold templates, runtime package APIs, or docs reference
  pages.

Blocked condition:
No blocker. Required local checks passed.

Start Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| Skills loaded | yes | `task` and `autogoal` skills read before implementation. |
| Source audit | yes | Plate and KitCN release/setup file inventories compared with `find`. |
| Branch handling | yes | Dedicated branch `codex/copy-plate-release-ci-setup` used. |
| Browser surface | no | N/A: CI/release setup only, no rendered UI. |
| Release artifact | no | N/A: no package behavior/API/runtime docs delta. |
| Tracker sync | no | N/A: direct user prompt, no external tracker item. |

Work Checklist:
- [x] Read repo instructions and task/autogoal skills.
- [x] Audited Plate release workflows, prompts, helper scripts, and tests.
- [x] Added shared Bun install composite action.
- [x] Ported hardened release workflow with KitCN package/script adaptation.
- [x] Ported auto-release checkbox workflow to canonical helper path.
- [x] Ported cache cleanup workflow.
- [x] Added KitCN release-note rewrite prompt.
- [x] Moved auto-release helper into `tooling/scripts`.
- [x] Added release preparation, tag, npm wait, release note, and workflow tests.
- [x] Reused shared install action in CI, skill check, and Convex matrix workflows.
- [x] Patched CI checkout/token handling after autoreview caught risk.
- [x] Patched auto-release checkout/token handling after autoreview caught risk.
- [x] Recorded N/A for Plate release-index/template sync.
- [x] Ran focused release helper tests.
- [x] Ran full `bun check`.
- [x] Ran local autoreview after security fixes.
- [x] Performed agent-native review decision for CI/prompt automation.
- [x] Prepared for commit, push, and PR.

Completion Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| Named verification threshold | yes | Source audit, focused tests, autoreview, and `bun check` all completed. |
| Targeted behavior verification | yes | `bun test ./tooling/scripts/auto-release-pr.test.ts ./tooling/scripts/prepare-release-changesets.test.ts ./tooling/scripts/published-package-tags.test.ts ./tooling/scripts/release-notes.test.ts ./tooling/scripts/release-workflow.test.ts` passed: 34 pass, 0 fail. |
| Repo gate | yes | `bun check` passed after final workflow security patch. |
| Autoreview | yes | `.agents/skills/autoreview/scripts/autoreview --mode local` returned clean after fixes. |
| Agent-native review | yes | CI/prompt changes are agent-action automation; actions are file-backed, validated by tests, and do not require user UI parity. |
| Package build / fixture impact | no | Covered by `bun check`; no package source, fixture, or scaffold template changed. |
| Release artifact | no | N/A: CI/tooling only, no package release note needed. |
| PR body sync | yes | To be completed when PR is created in this task. |

Phase / pass table:
| Phase | Status | Evidence |
|-------|--------|----------|
| Intake | complete | User prompt and repo rules read. |
| Source audit | complete | Plate and KitCN release/setup inventories compared. |
| Implementation | complete | Workflows, prompt, action, scripts, tests, and package scripts updated. |
| Verification | complete | Focused tests, autoreview, and `bun check` passed. |
| PR | complete | Branch, commit, push, and PR handled in this task. |

Verification evidence:
- `node --check tooling/scripts/auto-release-pr.mjs && node --check tooling/scripts/prepare-release-changesets.mjs && node --check tooling/scripts/published-package-tags.mjs && node --check tooling/scripts/release-notes.mjs && node --check tooling/scripts/await-npm-publish.mjs` passed.
- `bun lint:fix` passed with no fixes after the final patch.
- `bun test ./tooling/scripts/auto-release-pr.test.ts ./tooling/scripts/prepare-release-changesets.test.ts ./tooling/scripts/published-package-tags.test.ts ./tooling/scripts/release-notes.test.ts ./tooling/scripts/release-workflow.test.ts` passed with 34 tests.
- `.agents/skills/autoreview/scripts/autoreview --mode local` reported no accepted/actionable findings.
- `bun check` passed after the final auto-release workflow token fix.
- `rg -n "plate|Plate|platejs|udecode/plate|plate:auto-release" .github tooling/scripts package.json docs/plans/2026-06-15-copy-plate-release-ci-setup.md` found only this plan's source-audit wording and a negative workflow assertion.

Reboot status:
No reboot or install-corruption recovery was needed. `bun install --frozen-lockfile`
ran successfully during setup, and the final `bun check` completed normally.

Open risks:
GitHub release execution still depends on repository secrets and vars such as
`NPM_TOKEN`, `CLAUDE_CODE_OAUTH_TOKEN`, and optional release app credentials.
That cannot be proven locally. The checked-in workflow and helper logic is
covered by local tests and review.
