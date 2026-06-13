# rank index order by

Objective:
Fix rankIndex orderBy public API; done when issue 282 repro fails before fix, passes after, package build/check gates pass, and PR is created.

Flow mode:
one-shot execution

Goal plan:
docs/plans/282-rank-index-order-by.md

Template:
docs/plans/templates/task.md

Primary template:
docs/plans/templates/task.md

Applied packs:
- package-api (docs/plans/templates/packs/package-api.md)

Task source:
- type: GitHub issue
- id / link: #282 https://github.com/udecode/kitcn/issues/282
- title: rankIndex().orderBy() type signature is unsatisfiable -- every documented call form fails typecheck (v0.15.10)
- acceptance criteria:
  - `rankIndex(...).orderBy(...)` accepts documented rank order inputs without `as never`.
  - Runtime and declaration types agree on one object shape for descending rank order.
  - Bare column order remains ascending.
  - Focused type/runtime repro fails before the fix and passes after.

Completion threshold:
- Issue #282 is fixed in `packages/kitcn`: documented rank order inputs typecheck, runtime order normalization uses the same shape, focused regression proof passes, required package checks pass, changeset exists, PR exists, PR body is verified, issue sync-back is posted, and this goal plan passes its mechanical completion check.
- Task closure is legal only when the source-of-truth acceptance criteria are
  satisfied or explicitly narrowed, required verification evidence is recorded,
  code-review and release-artifact gates are closed when applicable, verified
  code changes are committed and PR'd unless explicitly declined or blocked,
  task-style PR body sync is complete or marked N/A with reason,
  tracker/PR sync is complete or marked N/A with reason, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/282-rank-index-order-by.md` passes.

Verification surface:
- Focused failing repro through existing package test/typecheck surface.
- `bun --cwd packages/kitcn build`.
- `bun lint:fix`.
- `bun check` before PR.
- `.changeset` audit.
- `gh pr view --json body` after PR body sync.
- GitHub issue #282 sync-back after PR exists.

Constraints:
- Preserve existing user-facing behavior outside the task scope.
- Prefer the durable ownership boundary over caller-by-caller patches.
- Verified code changes must be committed and PR'd because the task skill
  requires that path unless the user explicitly says not to, the work has no
  local patch, or a real blocker is recorded.
- The absence of a separate "open a PR" sentence from the user is not a valid
  N/A reason for verified code-changing task work.
- A PR created by this task must use the PR #270 emoji task-style PR body
  contract below, not a generic summary/body from a git helper skill.
- Do not add broad ceremony when the task is trivial or docs-only.

Boundaries:
- Source of truth: GitHub issue #282 plus local `packages/kitcn` source/tests.
- Allowed edit scope: `packages/kitcn` rank-index source/tests, release artifact, this goal plan, generated/synced outputs only if required by commands.
- Browser surface: N/A: package type/runtime API bug, no app UI route.
- Tracker sync: Post concise GitHub issue comment after PR exists.
- Non-goals: no broad ORM redesign, no fixture/scaffold edits unless source changes prove required, no docs site edits unless public docs examples are found stale in the touched path.

Output budget strategy:
- Use `rg` with narrow package/type names, cap shell output, read specific files with `sed`, and avoid broad streamed build/test logs unless a failure needs diagnosis.

Blocked condition:
- Stop only if the issue repro cannot be represented against current source, required package checks are blocked after one local-env-rot retry when applicable, or GitHub auth/network prevents required PR/tracker sync after a real attempt.

Task state:
- task_type: bug / public package API type-runtime mismatch
- task_complexity: normal non-trivial
- current_phase: intake
- current_phase_status: in_progress
- next_phase: implementation
- goal_status: active

Current verdict:
- verdict: implementation needed
- confidence: high from issue source; pending local repro
- next owner: task
- reason: public `rankIndex().orderBy()` type/runtime contract is inconsistent.

Completion rule:
- Do not call `update_goal(status: complete)` while any required checklist item
  remains unchecked. If an item does not apply, check it and add `N/A: <reason>`.
- Do not call `update_goal(status: complete)` until every completion threshold
  above is satisfied, final handoff evidence is recorded, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/282-rank-index-order-by.md` passes.
- Do not create hook state for this goal. This file plus the active goal are the
  durable state.

Start Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| Skill analysis before edits | yes | Loaded `task`, `autogoal`, `tdd`, `changeset`, and later `autoreview`; `major-task`, `testing`, `browser-use`, and `agent-native-reviewer` not needed. |
| Active goal checked or created | yes | `get_goal` returned null; `create_goal` created active goal for this plan. |
| Source of truth read before edits | yes | `gh issue view 282 --repo udecode/kitcn --comments --json ...` read issue body and comments. |
| Tracker comments and attachments read | yes | Issue comments array was empty; no attachments/video found. |
| Video transcript evidence required | no | N/A: issue has no video or screen recording evidence. |
| `docs/solutions` checked for non-trivial existing-code work | yes | Read `docs/solutions/workflow-issues/type-testing-defer-unimplemented-features-20260202.md`; type tests should cover implemented public behavior. |
| TDD decision before behavior change or bug fix | yes | Use a focused public API type/runtime regression before implementation. |
| Branch decision for code-changing task | yes | Created `codex/282-rank-index-order-by` before package code edits. |
| Release artifact decision | yes | Published package user-visible API/runtime fix requires `.changeset`. |
| Browser tool decision for browser surface | no | N/A: package API/runtime bug, no browser surface. |
| Commit / PR expectation decision | yes | Commit, push, and PR required by `task` after `bun check` passes. |
| Task-style PR body decision | yes | PR body must use task-style PR #270 format and be verified with `gh pr view --json body`. |
| Tracker sync expectation decision | yes | Post issue comment after PR exists unless blocked. |
| Output budget strategy recorded | yes | See Output budget strategy. |
| Package/API pack selected | yes | Applied `package-api` pack when plan was created. |
| Public surface or package boundary identified | yes | `kitcn/orm` rank-index builder public type/runtime API. |
| Release artifact path selected | yes | `.changeset` required. |
| `changeset` skill loaded when `.changeset` is required | yes | Read `.agents/rules/changeset.mdc`. |
| Package build / fixture impact decision recorded | yes | Run `bun --cwd packages/kitcn build`; fixture sync/check N/A unless scaffold/template output changes. |

Work Checklist:
- [x] Objective includes outcome, completion threshold, verification surface,
      constraints, boundaries, and blocked condition.
- [x] Task source classified with source type, id/link, title, task type,
      acceptance criteria, caveats, likely files/routes/packages, browser
      surface, and root-cause layer.
- [x] Required video or screen-recording evidence is cached/read as normalized
      `<video-transcripts>` XML, or marked N/A with reason.
- [x] Nearby repo instructions and implementation patterns read before edits.
- [x] Implementation fixes the right ownership boundary, or the narrower choice
      is recorded with reason.
- [x] Release artifact requirement recorded: active changeset, new changeset, or
      N/A with reason.
- [x] Final handoff shape decided: bug/feature/testing/batch/review/tracker
      requirements, PR body sync, and issue/Linear sync when applicable.
- [ ] Commit/PR handling recorded for code-changing work: commit and PR
      completed, no local patch, user explicitly declined, or blocker recorded.
      "User did not separately ask for a PR" is not a valid blocker.
- [ ] PR body shape recorded: PR #270 emoji task-style body used, N/A reason
      recorded, or blocker recorded.
- [ ] Branch handling recorded for code-changing work: dedicated branch used,
      new branch needed, or N/A with reason.
- [x] Local-env-rot retry policy recorded for any surprising repo-wide failure:
      reinstall/rerun evidence or N/A with reason.
- [x] Workspace authority recorded: every proof command names the cwd/tool that
      owns the changed behavior.
- [x] Output budget discipline recorded and followed: broad searches are
      scoped, capped, counted, or artifacted instead of streamed into goal
      context.
- [x] High-risk note recorded for public API, runtime, package-boundary,
      browser behavior, agent-action, or command-contract changes, or marked
      N/A with reason.
- [x] Review/autoreview target selected from actual diff state for non-trivial
      implementation work, or marked N/A with reason.
- [x] Agent-native review decision recorded for `.agents/**`, `.claude/**`,
      `.codex/**`, skills, hooks, commands, prompts, or user-action tooling.
- [x] Package/API pack: public API, package boundary, export, and release-artifact impact are recorded.
- [x] Package/API pack: release artifact matrix is applied: `.changeset` or explicit no-artifact reason.
- [x] Package/API pack: `.changeset` work loads `changeset` and follows its package/version/prose rules.
- [x] Package/API pack: no-artifact decisions state why the diff has no published package user-visible delta from `main`.
- [x] Package/API pack: compatibility, migration, or hard-cut decision is explicit when public shape changes.
- [x] Package/API pack: package-owned typecheck/build/test proof is recorded or marked N/A with reason.
- [x] Package/API pack: `packages/kitcn` build, fixture sync/check, or other owning package proof is recorded when required.

Completion Gates:
| Gate | Applies | Required action | Evidence |
|------|---------|-----------------|----------|
| Named verification threshold | pending | Run the command, proof, source audit, or artifact check named in this plan | Targeted tests/build/review pass; full `bun check`, PR, issue sync pending. |
| Bug reproduced before fix | yes | Record failing test/repro or N/A with reason | Runtime RED: `bun test packages/kitcn/src/orm/indexes.test.ts -t "rankIndex orderBy accepts documented direction objects"` failed with `rankIndex orderBy() expected a column builder.` Type RED: `bun --cwd packages/kitcn typecheck` failed with TS2345 in `rank-index-order.types.ts`. |
| Targeted behavior verification | yes | Run focused test/proof for changed behavior or record N/A | `bun test packages/kitcn/src/orm/indexes.test.ts` passed 19 tests. |
| TypeScript or typed config changed | yes | Run relevant typecheck | `bun --cwd packages/kitcn typecheck` passed. |
| Package exports or file layout changed | no | Run the relevant package build before final verification and keep generated updates | N/A: no export/file-layout change, but package build still run for package code. |
| Package manifests, lockfile, or install graph changed | pending | Run `bun install` and relevant package checks | pending |
| Agent rules or skills changed | pending | Run `bun install` and verify generated skill sync | pending |
| Workspace authority proof | yes | Run verification in the owning repo/package/app/route/tool and record cwd; do not count the wrong workspace as proof | Commands run from `/Users/zbeyens/git/better-convex`; owning package checks run against `packages/kitcn`. |
| Browser surface changed | no | Capture Browser Use proof or record explicit waiver/blocker | N/A: no browser/UI surface. |
| Browser final proof | no | Attach screenshot or exact browser verification caveat when browser proof applies | N/A: no browser/UI surface. |
| Scaffold or fixture output changed | no | Run `bun run fixtures:sync` and `bun run fixtures:check`, or record N/A | N/A: no init template/scaffold source changed. |
| Package behavior or public API changed | yes | Add a changeset or record why no changeset applies | Updated `.changeset/fix-start-init.md`. |
| Docs and kitcn skill sync changed | no | Keep `www/**` and `packages/kitcn/skills/kitcn/**` in sync, or record N/A | N/A: no docs changed; existing packaged skill docs already use documented rank order shape. |
| Docs or content changed | no | For docs-heavy work, use `--template docs`; for incidental docs, verify source-backed claims, links, examples, and rendered output or record N/A | N/A: no docs/content edits. |
| High-risk mini gate | yes | For public API/runtime/package-boundary/browser/agent-action/command-contract changes, record realistic failure mode, proof plan, and why the chosen boundary is right; otherwise N/A | Failure mode: published declarations/runtime drift again. Proof plan: type repro, runtime metadata test, package build, root check. Boundary: `indexes.ts` owns rank order normalization and builder typing. |
| Agent-native review for agent/tooling changes | no | For `.agents/**`, `.claude/**`, `.codex/**`, skills, hooks, commands, prompts, or user-action tooling, load `.agents/skills/agent-native-reviewer/SKILL.md` and close accepted/actionable findings, or record N/A | N/A: no agent/tooling files changed. |
| Local install corruption suspected | no | Run `bun install` once, rerun the exact failing command, or record N/A | N/A: failures matched the diff/repro and then passed after fix. |
| Autoreview for non-trivial implementation changes | yes | Load `.agents/skills/autoreview/SKILL.md`; use dirty local `--mode local`, branch/PR `--mode branch --base <base>`, or committed slice `--mode commit --commit <ref>` until no accepted/actionable findings, or record N/A for docs-only/trivial/no local patch | `.agents/skills/autoreview/scripts/autoreview --mode local --parallel-tests "bun test packages/kitcn/src/orm/indexes.test.ts && bun --cwd packages/kitcn typecheck"` exited clean; no accepted/actionable findings. |
| Commit created | pending | For verified code-changing work, stage the entire current checkout per repo policy and create a commit; N/A only for no local patch, explicit user decline, analytical/blocked/inconclusive work, or recorded external blocker | pending |
| PR create or update | pending | For verified code-changing work, run `check`, push, create or update the PR, and sync PR body to the task-style final handoff; N/A only for no local patch, explicit user decline, analytical/blocked/inconclusive work, or recorded external blocker | pending |
| Task-style PR body verified | pending | Verify the PR body with `gh pr view --json body`; it must preserve auto-release blocks when applicable, must not include a current-PR self-link, and must use the PR #270 emoji format: `🐛 Fixes ...`, `🟢 95-100% confidence`, `Phase / 🧪 Tests / 🌐 Browser` table, and bold emoji Outcome/Caveat/Design/Verified sections | pending |
| PR proof image hosting | pending | If PR body needs browser proof, replace local image paths with hosted GitHub URLs or record N/A | pending |
| Tracker sync-back | pending | Post concise issue/Linear sync after PR exists, or record N/A/blocker | pending |
| Final handoff contract | pending | Fill the final handoff fields below with exact PR/issue/confidence/tests/browser/outcome/caveats/design/verification content or N/A reason | pending |
| Final lint | yes | Run `bun lint:fix` or scoped equivalent | `bun lint:fix` passed; no fixes applied. |
| Output budget discipline | pending | Verify no unbounded high-volume command output was streamed, or record the accidental output and recovery | pending |
| Goal plan complete | yes | Run `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/282-rank-index-order-by.md` | pending |
| Public API / package boundary proof | yes | Source-audit public API, exports, and package boundary impact | `packages/kitcn/src/orm/indexes.ts` owns `rankIndex` builder typing/runtime; `packages/kitcn/src/orm/index.ts` already exports `rankIndex` and builder types. |
| Release artifact classification | yes | Record whether the change is published package behavior/API/types/config/runtime or no published user-visible delta | Published `kitcn/orm` type/runtime API patch. |
| Published package changeset | yes | If published package users see a delta, load `changeset` and add/update one `.changeset/*.md` per package | Updated `.changeset/fix-start-init.md` with a patch bullet. |
| No release artifact | no | If no artifact is needed, record the exact reason: internal-only, docs-only, agent-only, test-only, or no user-visible delta from `main` | N/A: release artifact required and updated. |
| Package typecheck/build/test | yes | Run owning package checks or record N/A with reason | `bun test packages/kitcn/src/orm/indexes.test.ts`, `bun --cwd packages/kitcn typecheck`, and `bun --cwd packages/kitcn build` passed. |
| Fixture/scaffold generation | no | Run `bun run fixtures:sync` and `bun run fixtures:check` when scaffold output changed, otherwise N/A | N/A: no scaffold/template output changed. |

Phase / pass table:
| Phase | Status | Evidence | Next |
|-------|--------|----------|------|
| Intake and source read | complete | issue fetched, task/autogoal/tdd/changeset rules read, plan created | implementation |
| Implementation | complete | runtime/type fix, runtime test, type repro, changeset | verification |
| Verification | in_progress | targeted tests/typecheck/build/lint/autoreview passed; `bun check` pending | closeout |
| Commit / PR / tracker sync | pending | | final response |
| Closeout | pending | | final response |

Findings:
- GitHub issue #282 reports all public rank `orderBy` forms fail TS2345 because the rest parameter intersects `ConvexRankIndexOrderSpec` with `ConvexRankOrderByInput`.
- Issue evidence says runtime currently reads `entry.column?.builder`, so the documented `{ column: t.updatedAt, direction: "desc" }` shape would throw even if types allowed it.
- No issue comments or video evidence.
- Local runtime RED confirmed the documented shape threw `rankIndex orderBy() expected a column builder.`
- Chained rank `orderBy()` also overwrote previous order columns; packaged skill docs show chained rank order calls, so runtime now appends order columns.

Decisions and tradeoffs:
- Standardize on the documented object shape `{ column: builder, direction }`, keep bare builder as ascending, and do not preserve the undocumented wrapped `{ column: { builder } }` shape unless local source proves it is already documented elsewhere.
- Use a focused public API regression test instead of a broad fixture/scaffold run unless template/scaffold source changes.
- Do not add rank-specific `asc()`/`desc()` helper support in this patch; local rank docs document object direction specs, and this issue can be fixed cleanly at that public shape.

Implementation notes:
- Likely files: rank-index builder/type declarations under `packages/kitcn`; exact ownership pending local source read.

Review fixes:
- None yet.

Error attempts:
| Error / failed attempt | Count | Next different move | Resolution |
|------------------------|-------|---------------------|------------|
| None yet | 0 | | |

Verification evidence:
- RED runtime: `bun test packages/kitcn/src/orm/indexes.test.ts -t "rankIndex orderBy accepts documented direction objects"` failed with `rankIndex orderBy() expected a column builder.`
- RED type: `bun --cwd packages/kitcn typecheck` failed with TS2345 in `src/orm/rank-index-order.types.ts`.
- GREEN runtime: `bun test packages/kitcn/src/orm/indexes.test.ts` passed 19 tests.
- GREEN type: `bun --cwd packages/kitcn typecheck` passed.
- Package build: `bun --cwd packages/kitcn build` passed.
- Lint: `bun lint:fix` passed, no fixes applied.
- Autoreview: `.agents/skills/autoreview/scripts/autoreview --mode local --parallel-tests "bun test packages/kitcn/src/orm/indexes.test.ts && bun --cwd packages/kitcn typecheck"` clean, no accepted/actionable findings.

Final handoff contract:
- Commit line: pending
- PR line: pending
- Issue / tracker line: pending
- Confidence line: pending
- Flow table:
  - Reproduced: tests pending, browser pending
  - Verified: tests pending, browser pending
- Browser check: pending
- Outcome: pending
- Caveat: pending
- Design:
  - Chosen boundary: pending
  - Why not quick patch: pending
  - Why not broader change: pending
- Verified: pending
- PR body verified: pending

Task-style PR body contract:
- Preserve any existing `<!-- auto-release:start -->` block. If a changeset is
  part of the diff and repo policy expects auto release, include that block.
- Use the accepted PR #270 visual format. The body starts with an emoji
  issue/tracker/fix line, for example `🐛 Fixes #123` or `🐛 Fixes ➖ N/A`, then
  an emoji confidence line like `🟢 95-100% confidence`.
- Use this exact table header: `| Phase | 🧪 Tests | 🌐 Browser |`.
- Use `Reproduced` and `Verified` rows. Mark passing proof with `🟢`, repro or
  failing proof with `🔴`, and non-applicable cells with `➖ N/A`.
- Use bold emoji section headings: `**✅ Outcome**`, `**⚠️ Caveat**`,
  `**🏗️ Design**`, and `**🧪 Verified**`.
- Never include a line that links to the current PR itself. The current PR URL
  belongs in the final response, not in its own description.
- Do not replace this with a generic `Summary` / `Verification` PR body, an
  adaptive prose body from a git helper skill, plain `## Outcome` sections, or
  an unrelated generated badge footer unless the caller or repo template
  explicitly asks for it.
- Proof is `gh pr view --json body` output or a concise source-backed summary
  of that output.

Final handoff / sync:
- Commit: pending
- PR: pending
- Issue / tracker: pending
- Browser proof: pending
- Caveats: pending

Timeline:
- 2026-06-13T08:40:32.525Z Task goal plan created.

Reboot status:
| Question | Answer |
|----------|--------|
| Where am I? | Intake and source read |
| Where am I going? | Implementation, verification, commit/PR/tracker sync, closeout |
| What is the goal? | Fix #282 so rankIndex orderBy types and runtime accept the documented public shape, with tests, changeset, PR, issue sync, and plan completion. |
| What have I learned? | The issue repro was valid; the runtime had the same shape mismatch, and chained rank order needed append semantics to match packaged docs. |
| What have I done? | Fetched issue, loaded required skills/rules, created goal/plan/branch, added failing runtime/type repros, fixed rank `orderBy`, updated changeset, ran targeted checks/build/lint/autoreview. |

Open risks:
- Public API/runtime boundary: fixing documented shape may break only the undocumented wrapped workaround; project policy prefers hard cuts in alpha, so no compatibility shim unless local evidence demands it.

Hard closeout guard:
- A local-only final response for verified code-changing work is invalid unless
  this plan records an explicit user decline, no local patch, analytical/
  blocked/inconclusive outcome, or a real commit/PR blocker.
