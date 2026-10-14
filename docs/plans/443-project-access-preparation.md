# Prepare project access before read activation

Objective:
Prepare projectAccess schema, write maintenance and paged backfills while retaining canonical public reads. Deliver a verified preparation PR for dependent activation PR #452.

Goal plan:
docs/plans/443-project-access-preparation.md

Template:
docs/plans/templates/task.md

Primary template:
docs/plans/templates/task.md

Applied packs:
- none

Task source:
- type: direct user-approved PR split
- id / link: issue #443; dependent activation https://github.com/udecode/kitcn/pull/452
- title: Stage project access before read activation
- acceptance criteria: canonical public reads remain active with an empty projectAccess table; owner list and owner/member dropdown/hasAny retain visibility; real mutations maintain access; both source migrations page independently; fractional creation ordering and 1500-project dropdown pass; preparation never activates derived reads.

Timed checkpoint:
- requested duration: N/A: no timed request
- semantics: N/A: no timed request
- initial confidence score: N/A: binary source/proof gates
- improvement loop: source repair, focused proof, review, final check
- final score / loop closure: awaiting final check and GitHub delivery

Completion threshold:
- Source, regression proof, generated output, independent review, full bun check and a dedicated preparation PR are complete. Actual deployment/backfill execution and activation belong to the operator and dependent #452.
- Task closure is legal only when the source-of-truth acceptance criteria are
  satisfied or explicitly narrowed, required verification evidence is recorded,
  code-review and release-artifact gates are closed when applicable, verified
  code changes are committed and PR'd unless explicitly declined or blocked,
  task-style PR body sync is complete or marked N/A with reason,
  GitHub issue/PR sync is complete or marked N/A with reason, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/443-project-access-preparation.md` passes.

Verification surface:
- Owning cwd /Users/zbeyens/git/better-convex. Focused Vitest project access/lifecycle/existence suites; typecheck; lint; full bun check; isolated anonymous Convex static codegen; source review and exact-head GitHub inventory.

Constraints:
- Preserve existing user-facing behavior outside the task scope.
- Prefer the durable ownership boundary over caller-by-caller patches.
- When a GitHub PR is in scope, this plan owns exactly one PR. A coordinating
  batch plan must link a separate task plan for every PR an agent processes.
- Verified code changes must be committed and PR'd because the task skill
  requires that path unless the user explicitly says not to, the work has no
  local patch, or a real blocker is recorded.
- The absence of a separate "open a PR" sentence from the user is not a valid
  N/A reason for verified code-changing task work.
- A PR created by this task must use the PR #270 emoji task-style PR body
  contract below, not a generic summary/body from a git helper skill.
- A task-run PR body must include
  `🧭 Task plan: docs/plans/<plan>.md`; the plan must exist at the PR head and
  identify the exact PR before autoclosure.
- Do not add broad ceremony when the task is trivial or docs-only.

Boundaries:
- Source of truth: user approved split and archive P2 deferral on 2026-10-14; existing issue #443 and PR #452 feedback.
- Allowed edit scope: example/convex source/generated, convex integration tests, this dedicated plan, activation plan state, generated fixture snapshot convergence after main merge.
- Browser surface: N/A: no UI or rendered-output change; registered public endpoints prove retained reads. No remote deployment is authorized.
- GitHub issue sync: link preparation and activation; preparation does not claim Fixes #443.
- Non-goals: activating derived reads, remote deployment, ORM union redesign, membership cap or asynchronous archive contract.

Output budget strategy:
- Save logs under /tmp/kitcn-pr-closure-20261014; bounded file reads and summaries; independent agents own one review lens or one test file.

Blocked condition:
- Missing repository write access or required verification failure. Activation separately requires exact preparation deployment and both migration completion receipts for every target.

Task state:
- task_type: bug / staged migration preparation
- task_complexity: non-trivial
- current_phase: delivery
- current_phase_status: in_progress
- next_phase: commit, final review and PR identity
- goal_status: active

Current verdict:
- verdict: source verified; delivery in progress
- confidence: 95-100% on preparation source; no activation or remote deployment claim
- next owner: task
- reason: separate delivery boundary prevents premature activation without a compatibility reader

Implementation readiness:
- verdict: source verified; delivery in progress
- exact owner: example project access helper, public projects procedures and two migrations
- contradiction status: empty-table rollout waiver rejected; preparation retains canonical readers
- source-listed cases complete: yes; see case matrix

Pre-solution issue challenge:
- reporter claim: a single deploy activates derived reads before backfills, hiding pre-existing projects
- suggested diagnosis or fix: separate preparation and activation; user approved this delivery change
- repro ladder:
  - tests / source-level repro: source deployment order confirmed; fractional ordering and 1500-union dropdown failed before repair
  - repo-owned automated browser or integration proof: registered authenticated lifecycle proves pre-backfill visibility and write maintenance
  - Browser plugin: N/A: no rendered change
  - screenshot / visual proof: N/A: no rendered change
- reproduction verdict: valid
- validity verdict: valid
- best long-term fix boundary: two deployable source revisions, not a flag or fallback
- harsh honest feedback: green tests cannot make deploy-before-backfill safe
- hard-stop decision: preparation can ship; activation remains draft until target receipts exist

Completion rule:
- Do not call `update_goal(status: complete)` while any required checklist item
  remains unchecked. If an item does not apply, check it and add `N/A: <reason>`.
- Do not call `update_goal(status: complete)` until every completion threshold
  above is satisfied, final handoff evidence is recorded, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/443-project-access-preparation.md` passes.
- Do not create hook state for this goal. This file plus the active goal are the
  durable state.

Start Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| Timed checkpoint parsed | no | N/A: no timed request |
| Walkthrough baseline for possible UI change | no | N/A: UI/rendered output unchanged |
| Skill analysis before edits | yes | task/autoclosure/autogoal, architect, testing, deslop and autoreview owners loaded |
| Active goal checked or created | yes | existing open-PR batch goal; no duplicate goal |
| Source of truth read before edits | yes | VISION, docs owner map, issue443 and all PR452 raw feedback |
| Exact per-PR task ownership | yes | not-yet-created preparation PR slice only; separate #452 activation plan |
| GitHub comments and attachments read | yes | 452-feedback-pre-review.json; 2 comments,9 reviews,6 threads,all12 thread comments |
| Video transcript evidence required | no | N/A: no videos |
| Pre-solution issue challenge required | yes | deploy-before-migrate source confirmed; alternative candidates evaluated |
| Reproduction verdict before implementation | yes | fractional order/dropdown red tests; deploy ordering source evidence |
| Repro escalation ladder selected | yes | registered endpoint integration; visual proof N/A |
| Suggested fix reviewed against durable boundary | yes | architect3 candidates; user approved staged delivery |
| `docs/solutions` checked for non-trivial existing-code work | yes | docs owner map and source owners; no dedicated rollout solution found |
| TDD decision before behavior change or bug fix | yes | red fractional/dropdown regression; actual lifecycle mutation probes |
| Branch decision for code-changing task | yes | codex/project-access-preparation |
| Release artifact decision | no | N/A: no published package source or API delta |
| Browser tool decision for browser surface | no | N/A: no rendered change; public endpoint integration owns proof |
| Commit / PR expectation decision | yes | whole checkout normal commit/push/new preparation PR authorized by user split and task |
| Task-style PR body decision | yes | emoji task body with this plan and dependent #452 |
| Task-plan PR body evidence | yes | N/A before new PR exists; final readback required |
| GitHub issue sync expectation decision | yes | link dependency, no fixes443 claim in preparation |
| Output budget strategy recorded | yes | bounded outputs; full logs under /tmp/kitcn-pr-closure-20261014 |

Work Checklist:
- [ ] If a duration was requested, it is recorded as minimum active work unless
      explicitly marked hard stop; when no better metric exists, initial and
      final confidence scores are recorded.
- [ ] Objective includes outcome, completion threshold, verification surface,
      constraints, boundaries, and blocked condition.
- [ ] Task source classified with source type, id/link, title, task type,
      acceptance criteria, caveats, likely files/routes/packages, browser
      surface, and root-cause layer.
- [ ] Every GitHub PR in scope has its own task plan. This plan owns one exact
      PR, owns a not-yet-created PR slice, or records N/A because no PR is in
      scope; a batch plan is not used as a substitute.
- [ ] Required video or screen-recording evidence is cached/read as normalized
      `<video-transcripts>` XML, or marked N/A with reason.
- [ ] For public GitHub bug reports, behavior claims, technical diagnoses, or
      suggested fixes, reporter claims are challenged before implementation
      with a recorded verdict: `valid`, `not reproduced`, `invalid`,
      `wont-fix`, `partially valid`, or `platform limitation`. Feature, docs,
      support, or cleanup requests with no bug claim may mark reproduction
      `N/A` with reason.
- [ ] Repro escalation ladder followed for bug/behavior claims: focused
      test/source-level repro first when applicable; existing repo-owned
      automated browser or integration proof next when available and useful as
      executable coverage; the repo-approved Browser tool next when tests or
      automation cannot reproduce or cannot model the surface honestly;
      screenshot or explicit visual-proof waiver when visual/native state
      matters.
- [ ] Hard-stop rule followed for bug/behavior claims: no code when the issue
      is not reproduced, invalid, or won't-fix; partial validity pivots to the
      best long-term fix and records what was wrong or incomplete in the
      issue's proposed path.
- [ ] Nearby repo instructions and implementation patterns read before edits.
- [ ] Source-listed case matrix is complete and every contradiction has an
      owner, harness, and verdict before mutation.
- [ ] Readiness is classified `ready`, `repair-source`, `major`, `blocked`, or
      `invalid` with evidence.
- [ ] Implementation fixes the right ownership boundary, or the narrower choice
      is recorded with reason.
- [ ] Release artifact requirement recorded: active changeset, new changeset, or
      N/A with reason.
- [ ] Final handoff shape decided: bug/feature/testing/batch/review/GitHub
      requirements, PR body sync, and issue sync when applicable.
- [ ] Commit/PR handling recorded for code-changing work: commit and PR
      completed, no local patch, user explicitly declined, or blocker recorded.
      "User did not separately ask for a PR" is not a valid blocker.
- [ ] PR body shape recorded: PR #270 emoji task-style body used, N/A reason
      recorded, or blocker recorded.
- [ ] PR task evidence recorded: body includes `🧭 Task plan: ...`, the plan
      exists at the PR head, and it identifies the exact PR before autoclosure.
- [ ] Branch handling recorded for code-changing work: dedicated branch used,
      new branch needed, or N/A with reason.
- [ ] Local-env-rot retry policy recorded for any surprising repo-wide failure:
      reinstall/rerun evidence or N/A with reason.
- [ ] Workspace authority recorded: every proof command names the cwd/tool that
      owns the changed behavior.
- [ ] Output budget discipline recorded and followed: broad searches are
      scoped, capped, counted, or artifacted instead of streamed into goal
      context.
- [ ] High-risk note recorded for public API, runtime, package-boundary,
      browser behavior, agent-action, or command-contract changes, or marked
      N/A with reason.
- [ ] Review/autoreview target selected from actual diff state for non-trivial
      implementation work, or marked N/A with reason.
- [ ] Agent-native review decision recorded for `.agents/**`, `.claude/**`,
      `.codex/**`, skills, hooks, commands, prompts, or user-action tooling.

Completion Gates:
| Gate | Applies | Required action | Evidence |
|------|---------|-----------------|----------|
| Named verification threshold | pending | Run the command, proof, source audit, or artifact check named in this plan | pending |
| Exact per-PR task ownership | pending | Record the exact PR and dedicated plan, or the not-yet-created single-PR slice | pending |
| Pre-solution issue challenge verdict | pending | Record reporter claim, suggested fix, repro verdict, validity verdict, durable boundary, and hard-stop/pivot decision before implementation | pending |
| Repro escalation ladder | pending | For bug/behavior claims, record test/source-level, automated browser/integration, Browser, and screenshot/visual-proof outcomes or N/A/blocker reasons before `not reproduced` | pending |
| Bug reproduced before fix | pending | Record failing test/repro or N/A with reason | pending |
| Targeted behavior verification | pending | Run focused test/proof for changed behavior or record N/A | pending |
| TypeScript or typed config changed | pending | Run relevant typecheck | pending |
| Package exports or file layout changed | pending | Run the relevant package build before final verification and keep generated updates | pending |
| Package manifests, lockfile, or install graph changed | pending | Run `bun install` and relevant package checks | pending |
| Agent rules or skills changed | pending | Run `bun install` and verify generated skill sync | pending |
| Workspace authority proof | pending | Run verification in the owning repo/package/app/route/tool and record cwd; do not count the wrong workspace as proof | pending |
| Browser surface changed | pending | Capture Browser Use proof or record explicit waiver/blocker | pending |
| Browser final proof | pending | Attach screenshot or exact browser verification caveat when browser proof applies | pending |
| UI walkthrough | pending | If UI or rendered output changed, run `.agents/skills/walkthrough/SKILL.md` after final proof and show annotated images in the final handoff; otherwise record N/A | pending |
| Scaffold or fixture output changed | pending | Run `bun run fixtures:sync` and `bun run fixtures:check`, or record N/A | pending |
| Package behavior or public API changed | pending | Add a changeset or record why no changeset applies | pending |
| Docs and kitcn skill sync changed | pending | Keep `www/**` and `packages/kitcn/skills/kitcn/**` in sync, or record N/A | pending |
| Docs or content changed | pending | For docs-heavy work, use `--template docs`; for incidental docs, verify source-backed claims, links, examples, and rendered output or record N/A | pending |
| High-risk mini gate | pending | For public API/runtime/package-boundary/browser/agent-action/command-contract changes, record realistic failure mode, proof plan, and why the chosen boundary is right; otherwise N/A | pending |
| Agent-native review for agent/tooling changes | pending | For `.agents/**`, `.claude/**`, `.codex/**`, skills, hooks, commands, prompts, or user-action tooling, load `.agents/skills/agent-native-reviewer/SKILL.md` and close accepted/actionable findings, or record N/A | pending |
| Local install corruption suspected | pending | Run `bun install` once, rerun the exact failing command, or record N/A | pending |
| Commit created | pending | For verified code-changing work, stage the entire current checkout per repo policy and create a commit; N/A only for no local patch, explicit user decline, analytical/blocked/inconclusive work, or recorded external blocker | pending |
| PR create or update | pending | For verified code-changing work, run `check`, push, create or update the PR, and sync PR body to the task-style final handoff; N/A only for no local patch, explicit user decline, analytical/blocked/inconclusive work, or recorded external blocker | pending |
| Task-style PR body verified | pending | Verify the PR body with `gh pr view --json body`; it must preserve auto-release blocks when applicable, must not include a current-PR self-link, and must use the PR #270 emoji format: `🐛 Fixes ...`, `🟢 95-100% confidence`, `Phase / 🧪 Tests / 🌐 Browser` table, and bold emoji Outcome/Caveat/Design/Verified sections | pending |
| PR task evidence verified | pending | Verify body plan line, plan at PR head, and exact PR ownership | pending |
| PR proof image hosting | pending | If PR body needs browser proof, replace local image paths with hosted GitHub URLs or record N/A | pending |
| GitHub issue sync-back | pending | Post concise issue sync after PR exists, or record N/A/blocker | pending |
| Final handoff contract | pending | Fill the final handoff fields below with exact PR/issue/confidence/tests/browser/outcome/caveats/design/verification content or N/A reason | pending |
| Final lint | pending | Run `bun lint:fix` or scoped equivalent | pending |
| Output budget discipline | pending | Verify no unbounded high-volume command output was streamed, or record the accidental output and recovery | pending |
| Timed checkpoint | pending | If duration was requested, keep improving until elapsed, then finish the current loop cleanly; otherwise N/A | pending |
| Autoreview for non-trivial implementation changes | pending | Load `.agents/skills/autoreview/SKILL.md`; use dirty local `--mode local`, branch/PR `--mode branch --base <base>`, or committed slice `--mode commit --commit <ref>` until no accepted/actionable findings, or record N/A for docs-only/trivial/no local patch | pending |
| Goal plan complete | yes | Run `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/443-project-access-preparation.md` | pending |

Phase / pass table:
| Phase | Status | Evidence | Next |
|-------|--------|----------|------|
| Intake and source read | in_progress | created plan | implementation |
| Implementation | pending | | verification |
| Verification | pending | | closeout |
| Commit / PR / GitHub sync | pending | | final response |
| Closeout | pending | | final response |

Findings:
- See rollout contract and verification evidence below.

Decisions and tradeoffs:
- See rollout contract and verification evidence below.

Implementation notes:
- See rollout contract and verification evidence below.

Review fixes:
- See rollout contract and verification evidence below.

Error attempts:
| Error / failed attempt | Count | Next different move | Resolution |
|------------------------|-------|---------------------|------------|
| None yet | 0 | | |

Verification evidence:
- Focused24 tests in four suites passed. Full bun check passed on2026-10-14, including lint, typecheck, all tests, eight fixture checks, verify and runtime scenarios. Logs /tmp/kitcn-pr-closure-20261014/preparation-check.log and preparation-focused.log.
- Source codegen ran on isolated anonymous Convex ports3235/3236; generated API/data model and procedure-name locations retained. Fixtures regenerated through CLI, six lucide snapshot pins converged.
- Three independent cleanup lenses completed; only accepted P3 deletions applied. Frozen committed-branch autoreview remains before push.

Source-listed case matrix:
| Case | Source claim | Harness | Before | Expected after | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Existing projects before backfill | rollout P1 | registered endpoints | hidden by activation head | canonical reads retained | lifecycle suite | in_progress |
| Actual write wiring | helper-test gap | registered mutations + access row assertions | helper-only proof | grants/revokes/archive/transfer/cascades maintained | lifecycle suite | in_progress |
| Large membership migration | resolved P1 | access suite source-table paging | old 1000 truncation | every membership paged | access suite | in_progress |
| Ordering | preserve createdAt desc | reversed access grants with fractional times | wrong project first | raw creation key retained | access suite | passed |
| Dropdown capacity | P2 | 750 owned + 750 shared | relation fanout exception | 1500 unique rows | access suite | passed |

Final handoff contract:
- Commit line: pending
- PR line: pending
- Issue line: pending
- Confidence line: pending
- Flow table:
  - Reproduced: red fractional timestamp/dropdown/lifecycle wiring probes; browser N/A
  - Verified: focused suites passed; final check in progress; browser N/A
- Browser check: N/A: no rendered output change
- Outcome: schema/writes/paged backfills ready without activating derived reads
- Caveat: archive >10000 P2 explicitly deferred; activation requires per-target preparation/backfill receipts
- Design:
  - Chosen boundary: deployable preparation and activation revisions
  - Why not quick patch: same-head deployment activates reads before migration completion
  - Why not broader change: no compatibility reader, ORM union redesign or new archive contract
- Verified: pending
- PR body verified: pending

Task-style PR body contract:
- Preserve any existing `<!-- auto-release:start -->` block. If a changeset is
  part of the diff and repo policy expects auto release, include that block.
- Use the accepted PR #270 visual format. The body starts with an emoji
  issue/fix line, for example `🐛 Fixes #123` or `🐛 Fixes ➖ N/A`, then
  `🧭 Task plan: docs/plans/<plan>.md`, then an emoji confidence line like
  `🟢 95-100% confidence`.
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
- Issue: pending
- Browser proof: N/A: no rendered output change
- Caveats: activation receipts absent; no remote deployment performed

Timeline:
- 2026-10-14T12:46:52.056Z Task goal plan created.

Reboot status:
| Question | Answer |
|----------|--------|
| Where am I? | Intake and source read |
| Where am I going? | Implementation, verification, commit/PR/GitHub sync, closeout |
| What is the goal? | Prepare access while retaining canonical reads |
| What have I learned? | See Findings |
| What have I done? | See Timeline |

Open risks:
- Archive >10000 P2 deferred by user. No remote prep deployment/backfill receipts yet; those block activation #452, not preparation source delivery.

Hard closeout guard:
- A local-only final response for verified code-changing work is invalid unless
  this plan records an explicit user decline, no local patch, analytical/
  blocked/inconclusive outcome, or a real commit/PR blocker.

Authorized requirements and scope baseline:
- User requested review and cleanup pushes for all open PRs; explicitly approved separate preparation/activation PRs and deferral of the archive >10,000 access-row P2.
- This plan owns only the not-yet-created preparation PR. PR #452 has its own activation plan.
- Preserve all canonical public reads until completed preparation deployment/backfills. No force push, merge or real remote deploy authorized.
- Live archive finding remains open at https://github.com/udecode/kitcn/pull/452#discussion_r3942887895 with explicit user deferral.
- Package source/API unchanged; no changeset required. Build package only to run codegen. Generated Convex files come from an isolated anonymous local backend, never hand edits.
- High-risk failure: activating this revision must leave pre-existing data visible even with no projectAccess rows. Production-handler lifecycle pins that case and materialized writes.
- Architect explored staged delivery, canonical membership union and readiness/fallback. User approved staged delivery. No transition API or global ORM limit increase.
- Maintain whole checkout commits, dedicated PR body/plan, exact-head review/readbacks.

Preparation boundary:
- Main projects.list has the already-recorded raw-row .filter id mismatch for shared projects. Preparation preserves the canonical implementation; activation #452 replaces it. The preparation test proves owner list plus owner/member dropdown and hasAny with empty access storage, and directly verifies real mutation access rows. It does not claim the unchanged main member-list defect is repaired before activation.

Deslop synthesis:
- How did we do? Ownership and type/source lenses clean. Simplification identified only P3 duplicate test infrastructure.
- Feedback kept: remove test-only bounded backfill and exported clear helper; drive actual migrations; share tag suite env helper; remove redundant test row type/any.
- Feedback ignored: slop tool reports mock setup similarity with unchanged sibling tests. The sole syscall mock is required for unsupported convex-test metadata and is restored in finally. No extraction across unrelated suites.
- Plan of attack: accepted deletions applied; focused24 tests passed before a final typecheck caught leftover removed-type annotations. Annotations removed; full check restarted.
- Three independent reviewers read source before cleanup. No accepted runtime findings remain in preparation. Final autoreview still required.
- Error corrections: isolated codegen first lacked example dependencies, then backend env defaults. Corrected package-local resolution and anonymous backend defaults; real CLI generated types successfully. The large-dropdown test first spent >5s in unrelated ORM seeding; switched to raw fixture insertion with the same real dropdown query and unchanged 5000ms timeout.

Operator rollout contract (not executed):
1. Deploy the exact preparation commit to each explicitly selected target while canonical reads remain active. kitcn deploy defaults to waiting for migrations and strict failure handling.
2. Capture `generated/server:migrationStatus` through kitcn migrate status for that same target. Require both20260906_022807_backfill_project_access and20260906_035251_backfill_project_access_members to have applied=true and status=completed, no active failed/running run, and record target URL/name plus preparation OID.
3. Only after every target has those receipts, authorize activation #452. A clean test run or two commits in one PR does not substitute.
- Agent-native parity audit: existing CLI deployment and migration-status commands expose each operation and its JSON status. No new helper, hook, skill or agent integration introduced. Deployment target/approval remains an explicit operator boundary.
- Prove It Works drove actual authenticated handler and real local codegen proof. Fix Root Causes drove the staged revision boundary rather than a readiness flag. Model the Domain keeps canonical entitlement writes in one helper and deletion in FK cascades.
