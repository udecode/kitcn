# 96 t run date serialization

Objective:
Resolve kitcn issue #96 if valid; done when repro is classified, fixed or rejected with evidence, checks pass, and PR/comment are complete.

Goal plan:
docs/plans/2026-06-15-96-t-run-date-serialization.md

Template:
docs/plans/templates/task.md

Primary template:
docs/plans/templates/task.md

Applied packs:
- none

Task source:
- type: GitHub issue
- id / link: https://github.com/udecode/kitcn/issues/96
- title: ORM-hydrated Date objects crash t.run() return serialization in convex-test
- acceptance criteria: returning ORM objects with `timestamp()` fields from
  `t.run()` does not crash in the repo test helper; the return value is
  Convex-safe; regression coverage proves the behavior; verified patch is
  committed, PR'd, and synced back to the issue.

Completion threshold:
- Issue #96 is classified with a real current-checkout repro or a hard-stop
  invalid verdict.
- If valid, one focused regression test fails before the fix and passes after
  the fix, relevant verification commands pass or blockers are recorded, and
  the fix is committed/pushed/PR'd with an issue sync comment.
- Task closure is legal only when the source-of-truth acceptance criteria are
  satisfied or explicitly narrowed, required verification evidence is recorded,
  code-review and release-artifact gates are closed when applicable, verified
  code changes are committed and PR'd unless explicitly declined or blocked,
  task-style PR body sync is complete or marked N/A with reason,
  tracker/PR sync is complete or marked N/A with reason, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-06-15-96-t-run-date-serialization.md` passes.

Verification surface:
- `gh issue view 96 --repo udecode/kitcn --json ...` for source-of-truth issue
  and comments.
- Focused Vitest command for `convex/orm/mutations.test.ts` reproducing and
  verifying the `t.run()` Date return boundary.
- `bun lint:fix`.
- `bun check` before PR unless a real blocker remains after the local-env retry
  rule.
- PR body audit with `gh pr view --json body`.
- Issue #96 comment after PR creation.

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
- Source of truth: GitHub issue #96 and current local repo behavior.
- Allowed edit scope: Convex test helper and focused ORM mutation regression
  test; plan/check artifacts and PR/issue metadata.
- Browser surface: N/A; this is a test-runtime serialization bug.
- Tracker sync: GitHub issue #96 after PR exists.
- Non-goals: no production ORM API redesign unless the focused repro proves the
  test helper boundary cannot own the fix; no docs or scaffold changes.

Output budget strategy:
- Use targeted `sed` and `rg` on `convex/setup.testing.ts`,
  `convex/orm/mutations.test.ts`, and relevant helper patterns. Cap command
  output. Do not stream broad generated, tmp, build, or dependency trees unless
  a focused type/API read requires it.

Blocked condition:
- Stop only if the issue cannot be reproduced through a focused repo test, or
  if required git/GitHub/check tooling fails after the prescribed retry path
  with no autonomous repair left.

Task state:
- task_type: public tracker bug
- task_complexity: normal
- current_phase: closeout
- current_phase_status: complete
- next_phase: final response
- goal_status: active

Current verdict:
- verdict: valid
- confidence: high
- next owner: commit / PR / tracker sync
- reason: focused regression failed before the fix with Convex rejecting
  `.createdAt` as a native `Date`; the same file passes after wrapping the
  `convexTest().run` return boundary.

Pre-solution issue challenge:
- reporter claim: ORM `timestamp()` fields hydrate to `Date`; returning those
  ORM docs from `convex-test` `t.run()` crashes because Convex return
  serialization rejects native `Date`.
- suggested diagnosis or fix: reporter suggests ORM dehydration, helper, or
  patching the `convexTest` setup wrapper.
- repro ladder:
  - tests / source-level repro: selected; add one focused Vitest regression.
  - repo-owned automated browser or integration proof: N/A; no browser surface.
  - Browser plugin: N/A; no UI/runtime browser surface.
  - screenshot / visual proof: N/A; not visual/native state.
- reproduction verdict: valid red repro from focused Vitest test
- validity verdict: valid
- best long-term fix boundary: likely `convex/setup.testing.ts` wrapper because
  the failure is specifically the repo test helper crossing the `t.run`
  serialization boundary, not production ORM reads.
- harsh honest feedback: the existing nullable timestamp test is not enough; it
  never returns the hydrated object from `t.run()`, so it dodges the reported
  crash.
- hard-stop decision: proceed; valid focused repro exists.

Completion rule:
- Do not call `update_goal(status: complete)` while any required checklist item
  remains unchecked. If an item does not apply, check it and add `N/A: <reason>`.
- Do not call `update_goal(status: complete)` until every completion threshold
  above is satisfied, final handoff evidence is recorded, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-06-15-96-t-run-date-serialization.md` passes.
- Do not create hook state for this goal. This file plus the active goal are the
  durable state.

Start Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| Skill analysis before edits | yes | Loaded `task`, `testing`, `tdd`, `autogoal`, and `autoreview`; no heavyweight skill needed. |
| Active goal checked or created | yes | `get_goal` returned none; `create_goal` created active goal for this plan. |
| Source of truth read before edits | yes | `gh issue view 96 --repo udecode/kitcn --json number,title,state,author,body,comments,labels,createdAt,updatedAt,url`. |
| Tracker comments and attachments read | yes | Issue comments read; no attachments in issue JSON. |
| Video transcript evidence required | no | N/A: issue has no video/screen recording. |
| Pre-solution issue challenge required | yes | Public bug claim; recorded above before implementation. |
| Reproduction verdict before implementation | yes | Focused regression test selected; implementation waits for red result. |
| Repro escalation ladder selected | yes | Source-level Vitest repro first; browser proof N/A. |
| Suggested fix reviewed against durable boundary | yes | Current durable boundary is `convex/setup.testing.ts` unless repro disproves it. |
| `docs/solutions` checked for non-trivial existing-code work | no | N/A: no relevant `docs/solutions` index in this repo task flow; issue-specific current repro is authoritative. |
| TDD decision before behavior change or bug fix | yes | Use `testing` then `tdd`; write failing regression first. |
| Branch decision for code-changing task | yes | Dedicated branch `codex/96-t-run-date-serialization` created from `origin/main`. |
| Release artifact decision | yes | N/A unless package source under `packages/**` changes; planned edit is test harness/regression only. |
| Browser tool decision for browser surface | no | N/A: no browser surface. |
| Commit / PR expectation decision | yes | For verified code-changing work, default is commit, push, and PR because `task` explicitly requires it; N/A only for explicit user decline, no local patch, analytical/blocked/inconclusive work, or recorded blocker. |
| Task-style PR body decision | yes | Required if PR is created; use task PR body contract from this plan. |
| Tracker sync expectation decision | yes | Post concise issue comment after PR exists. |
| Output budget strategy recorded | yes | Recorded above. |

Work Checklist:
- [x] Objective includes outcome, completion threshold, verification surface,
      constraints, boundaries, and blocked condition.
- [x] Task source classified with source type, id/link, title, task type,
      acceptance criteria, caveats, likely files/routes/packages, browser
      surface, and root-cause layer.
- [x] Required video or screen-recording evidence is cached/read as normalized
      `<video-transcripts>` XML, or marked N/A with reason.
- [x] For public tracker bug reports, behavior claims, technical diagnoses, or
      suggested fixes, reporter claims are challenged before implementation
      with a recorded verdict: `valid`, `not reproduced`, `invalid`,
      `wont-fix`, `partially valid`, or `platform limitation`. Feature, docs,
      support, or cleanup requests with no bug claim may mark reproduction
      `N/A` with reason.
- [x] Repro escalation ladder followed for bug/behavior claims: focused
      test/source-level repro first when applicable; existing repo-owned
      automated browser or integration proof next when available and useful as
      executable coverage; the repo-approved Browser tool next when tests or
      automation cannot reproduce or cannot model the surface honestly;
      screenshot or explicit visual-proof waiver when visual/native state
      matters.
- [x] Hard-stop rule followed for bug/behavior claims: no code when the issue
      is not reproduced, invalid, or won't-fix; partial validity pivots to the
      best long-term fix and records what was wrong or incomplete in the
      issue's proposed path.
- [x] Nearby repo instructions and implementation patterns read before edits.
- [x] Implementation fixes the right ownership boundary, or the narrower choice
      is recorded with reason.
- [x] Release artifact requirement recorded: active changeset, new changeset, or
      N/A with reason.
- [x] Final handoff shape decided: bug/feature/testing/batch/review/tracker
      requirements, PR body sync, and issue/Linear sync when applicable.
- [x] Commit/PR handling recorded for code-changing work: commit and PR
      completed, no local patch, user explicitly declined, or blocker recorded.
      "User did not separately ask for a PR" is not a valid blocker.
- [x] PR body shape recorded: PR #270 emoji task-style body used, N/A reason
      recorded, or blocker recorded.
- [x] Branch handling recorded for code-changing work: dedicated branch used,
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

Completion Gates:
| Gate | Applies | Required action | Evidence |
|------|---------|-----------------|----------|
| Named verification threshold | yes | Run the command, proof, source audit, or artifact check named in this plan | Red repro, focused tests, full mutation file, `bun typecheck`, `bun lint:fix`, autoreview, PR body audit, issue comment, and `bun check` completed. |
| Pre-solution issue challenge verdict | yes | Record reporter claim, suggested fix, repro verdict, validity verdict, durable boundary, and hard-stop/pivot decision before implementation | Verdict `valid`; reporter claim and durable boundary recorded before implementation. |
| Repro escalation ladder | yes | For bug/behavior claims, record test/source-level, automated browser/integration, Browser, and screenshot/visual-proof outcomes or N/A/blocker reasons before `not reproduced` | Source-level Vitest repro used; browser and screenshot proof N/A because this is not UI/visual behavior. |
| Bug reproduced before fix | yes | Record failing test/repro or N/A with reason | Focused test failed before fix with Convex rejecting `.createdAt` `Date`. |
| Targeted behavior verification | yes | Run focused test/proof for changed behavior or record N/A | Focused Date-return test and 3-test timestamp/class slice passed after fix. |
| TypeScript or typed config changed | yes | Run relevant typecheck | `bun typecheck` passed. |
| Package exports or file layout changed | yes | Run the relevant package build before final verification and keep generated updates | `bun check` passed and included package builds; no package exports changed. |
| Package manifests, lockfile, or install graph changed | yes | Run `bun install` and relevant package checks | Unrelated `.tmp/better-auth-oom-latest` package files staged per repo policy; `bun check` passed. |
| Agent rules or skills changed | no | Run `bun install` and verify generated skill sync | N/A: no `.agents/**` source changed. |
| Workspace authority proof | yes | Run verification in the owning repo/package/app/route/tool and record cwd; do not count the wrong workspace as proof | Commands ran in `/Users/zbeyens/git/better-convex`, the repo owning `convex/setup.testing.ts`. |
| Browser surface changed | no | Capture Browser Use proof or record explicit waiver/blocker | N/A: no browser/UI surface. |
| Browser final proof | no | Attach screenshot or exact browser verification caveat when browser proof applies | N/A: no browser/UI surface. |
| Scaffold or fixture output changed | no | Run `bun run fixtures:sync` and `bun run fixtures:check`, or record N/A | N/A: no scaffold source or committed fixture output changed; `bun check` included fixture checks anyway. |
| Package behavior or public API changed | no | Add a changeset or record why no changeset applies | N/A: changed repo test helper and tests, not published package source/API. |
| Docs and kitcn skill sync changed | no | Keep `www/**` and `packages/kitcn/skills/kitcn/**` in sync, or record N/A | N/A: no `www/**` or kitcn skill docs changed. |
| Docs or content changed | no | For docs-heavy work, use `--template docs`; for incidental docs, verify source-backed claims, links, examples, and rendered output or record N/A | N/A: only runtime goal plan changed, not user docs/content. |
| High-risk mini gate | yes | For public API/runtime/package-boundary/browser/agent-action/command-contract changes, record realistic failure mode, proof plan, and why the chosen boundary is right; otherwise N/A | Failure mode: test helper could over-accept unsupported values; proof: unsupported class regression; boundary remains `convexTest().run` return serialization. |
| Agent-native review for agent/tooling changes | no | For `.agents/**`, `.claude/**`, `.codex/**`, skills, hooks, commands, prompts, or user-action tooling, load `.agents/skills/agent-native-reviewer/SKILL.md` and close accepted/actionable findings, or record N/A | N/A: no agent/tooling files changed. |
| Local install corruption suspected | no | Run `bun install` once, rerun the exact failing command, or record N/A | N/A: no local-corruption-shaped failure. |
| Autoreview for non-trivial implementation changes | yes | Load `.agents/skills/autoreview/SKILL.md`; use dirty local `--mode local`, branch/PR `--mode branch --base <base>`, or committed slice `--mode commit --commit <ref>` until no accepted/actionable findings, or record N/A for docs-only/trivial/no local patch | Autoreview P2 accepted/fixed; P3 `.tmp` rejected due explicit repo staging policy. |
| Commit created | yes | For verified code-changing work, stage the entire current checkout per repo policy and create a commit; N/A only for no local patch, explicit user decline, analytical/blocked/inconclusive work, or recorded external blocker | Commit `2db28a50` created; this closeout plan update follows as a second commit. |
| PR create or update | yes | For verified code-changing work, run `check`, push, create or update the PR, and sync PR body to the task-style final handoff; N/A only for no local patch, explicit user decline, analytical/blocked/inconclusive work, or recorded external blocker | PR #291 created after `bun check` passed. |
| Task-style PR body verified | yes | Verify the PR body with `gh pr view --json body`; it must preserve auto-release blocks when applicable, must not include a current-PR self-link, and must use the PR #270 emoji format: `🐛 Fixes ...`, `🟢 95-100% confidence`, `Phase / 🧪 Tests / 🌐 Browser` table, and bold emoji Outcome/Caveat/Design/Verified sections | `gh pr view 291 --repo udecode/kitcn --json url,body,title,headRefName,baseRefName,state` confirmed required shape. |
| PR proof image hosting | no | If PR body needs browser proof, replace local image paths with hosted GitHub URLs or record N/A | N/A: no browser proof/image. |
| Tracker sync-back | yes | Post concise issue/Linear sync after PR exists, or record N/A/blocker | Issue comment posted: https://github.com/udecode/kitcn/issues/96#issuecomment-4710393084. |
| Final handoff contract | yes | Fill the final handoff fields below with exact PR/issue/confidence/tests/browser/outcome/caveats/design/verification content or N/A reason | Filled below. |
| Final lint | yes | Run `bun lint:fix` or scoped equivalent | `bun lint:fix` passed before final `bun check`; `bun check` lint phase also passed. |
| Output budget discipline | yes | Verify no unbounded high-volume command output was streamed, or record the accidental output and recovery | Large `bun check`, commit, and staged diff output was streamed; recorded as an execution miss. Subsequent reads were scoped. |
| Goal plan complete | yes | Run `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-06-15-96-t-run-date-serialization.md` | Passed. |

Phase / pass table:
| Phase | Status | Evidence | Next |
|-------|--------|----------|------|
| Intake and source read | complete | Issue #96 and comments read with `gh issue view`; plan created and filled. | implementation |
| Implementation | complete | Added Date-return regression and `convex/setup.testing.ts` wrapper. | verification |
| Verification | complete | Red repro, focused tests, full mutation file, typecheck, lint, autoreview, and `bun check` completed; see evidence. | commit / PR / tracker sync |
| Commit / PR / tracker sync | complete | Commit `2db28a50`, PR #291, PR body audit, and issue comment complete. | final response |
| Closeout | complete | This closeout update records final PR, issue, verification evidence, and passing goal-plan check. | final response |

Findings:
- Issue #96 is valid in the current checkout. Existing nullable timestamp
  coverage did not return the ORM object from `t.run()`, so it missed the
  Convex serialization boundary.
- Current `convexTest` wrapper returned `baseConvexTest(schema, modules)`
  directly, leaving Date objects for `convex-test`/`convexToJson` to reject.
- `convex-test` rejects unsupported class instances via Convex simple-object
  checks. The Date walker must recurse only through arrays and simple/plain
  objects, not arbitrary class instances.

Decisions and tradeoffs:
- Fix boundary: wrap the repo `convexTest().run` callback result before
  `convex-test` serializes it. This is narrower and more honest than changing
  production ORM hydration for a test-only return boundary.
- Date encoding: `Date -> number` milliseconds, matching Convex timestamp
  storage and existing auth/server Convex-safe serializers.
- Unsupported objects: preserve Convex serializer behavior by leaving
  non-simple objects untouched.
- Autoreview P3 `.tmp` finding rejected because repository AGENTS policy says
  PRs must stage all modified and untracked files, even unrelated. This is
  ugly, but it is explicit local policy.

Implementation notes:
- `serializeDatesForConvexTest` deep-serializes Dates through arrays and
  simple/plain objects.
- `wrapConvexTestDateReturns` wraps `run` and `withIdentity().run` so
  authenticated test contexts keep the same return-boundary behavior.

Review fixes:
- Accepted P2 autoreview finding: original walker recursed through arbitrary
  objects and could flatten class instances into plain objects. Fixed by
  checking the Convex simple-object boundary and added an unsupported-class
  regression.
- Rejected P3 autoreview finding: untracked `.tmp/better-auth-oom-latest` is
  unrelated but local repo policy requires staging untracked files for PRs.

Error attempts:
| Error / failed attempt | Count | Next different move | Resolution |
|------------------------|-------|---------------------|------------|
| Large tool output streamed from `bun check`, `git diff --cached --stat`, and commit output | 1 | Use focused output caps and summaries after required noisy commands | Recorded in output-budget gate; no behavioral blocker. |

Verification evidence:
- `bun run vitest run convex/orm/mutations.test.ts -t "should allow returning hydrated Date values from t.run in convex-test"` failed before the fix with `Date "...Z" is not a supported Convex type (present at path .createdAt...)`.
- `bun run vitest run convex/orm/mutations.test.ts -t "should allow returning hydrated Date values from t.run in convex-test"` passed after the fix.
- `bun run vitest run convex/orm/mutations.test.ts -t "hydrated Date values|unsupported class returns|nullable timestamp columns"` passed: 3 tests.
- `bun run vitest run convex/orm/mutations.test.ts` passed: 38 tests.
- `bun lint:fix` passed.
- `bun typecheck` passed.
- `.agents/skills/autoreview/scripts/autoreview --mode local --parallel-tests "bun run vitest run convex/orm/mutations.test.ts"` first run found P2 class-instance flattening; fixed.
- `.agents/skills/autoreview/scripts/autoreview --mode local --parallel-tests "bun run vitest run convex/orm/mutations.test.ts"` second run found P3 unrelated `.tmp` bundle issue; rejected due repo staging policy.
- `bun check` passed.

Final handoff contract:
- Commit line: Commit `2db28a50` created; closeout plan update is committed after PR creation.
- PR line: https://github.com/udecode/kitcn/pull/291
- Issue / tracker line: Issue #96 synced at https://github.com/udecode/kitcn/issues/96#issuecomment-4710393084
- Confidence line: 95-100% confidence.
- Flow table:
  - Reproduced: 🔴 focused Vitest Date-return repro failed before fix; browser N/A.
  - Verified: 🟢 focused tests, full mutation file, typecheck, lint, autoreview, `bun check`; browser N/A.
- Browser check: N/A; no browser surface.
- Outcome: `convexTest().run()` can return ORM-hydrated timestamp docs; Dates cross as Convex-safe millisecond numbers.
- Caveat: PR includes unrelated `.tmp/better-auth-oom-latest` because repo policy requires staging all untracked files.
- Design:
  - Chosen boundary: repo `convexTest` wrapper return boundary.
  - Why not quick patch: caller-by-caller conversion keeps the reported boilerplate problem alive.
  - Why not broader change: production ORM hydration is correct; the crash is specific to `convex-test` result serialization.
- Verified: See verification evidence list.
- PR body verified: `gh pr view 291 --repo udecode/kitcn --json url,body,title,headRefName,baseRefName,state`.

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
- Commit: `2db28a50` plus this closeout plan update.
- PR: https://github.com/udecode/kitcn/pull/291
- Issue / tracker: https://github.com/udecode/kitcn/issues/96#issuecomment-4710393084
- Browser proof: N/A; no browser surface.
- Caveats: PR includes unrelated `.tmp/better-auth-oom-latest` per repo staging policy.

Timeline:
- 2026-06-15T16:46:55.417Z Task goal plan created.
- 2026-06-15 Issue #96 fetched and classified as valid after focused red repro.
- 2026-06-15 Added Date-return regression and `convexTest().run` return wrapper.
- 2026-06-15 Focused/full mutation tests, `bun typecheck`, `bun lint:fix`,
  autoreview, and `bun check` passed.
- 2026-06-15 Commit `2db28a50` created and pushed to
  `codex/96-t-run-date-serialization`.
- 2026-06-15 PR #291 created and PR body verified.
- 2026-06-15 Issue #96 sync comment posted.

Reboot status:
| Question | Answer |
|----------|--------|
| Where am I? | Closeout |
| Where am I going? | Run goal-plan checker, commit/push closeout update, complete goal. |
| What is the goal? | Resolve issue #96 if valid with repro, fix, checks, PR, and tracker sync. |
| What have I learned? | The bug is a test-helper return serialization boundary, not production ORM hydration. |
| What have I done? | Reproduced, fixed, verified, reviewed, checked, committed, pushed, opened PR, commented on the issue, and passed the goal-plan checker. |

Open risks:
- PR contains unrelated `.tmp/better-auth-oom-latest` scratch app due explicit
  repo staging policy.

Hard closeout guard:
- A local-only final response for verified code-changing work is invalid unless
  this plan records an explicit user decline, no local patch, analytical/
  blocked/inconclusive outcome, or a real commit/PR blocker.
