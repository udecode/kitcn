# 444 ORM double pre-image read on aggregateIndex tables

Objective:
Stop the ORM lifecycle from reading a row's pre-image twice on every patch to a
table declaring an aggregateIndex/rankIndex. An N-row update must issue N
pre-image reads, not 2N, pinned by a read-bound vitest.

Goal plan:
docs/plans/444-orm-double-pre-image-read.md

Template:
docs/plans/templates/task.md

Primary template:
docs/plans/templates/task.md

Applied packs:
- package-api (docs/plans/templates/packs/package-api.md)

Task source:
- type: GitHub issue
- id / link: #444 (https://github.com/udecode/kitcn/issues/444)
- title: ORM: every patch on an aggregateIndex/rankIndex table reads the
  pre-image twice
- acceptance criteria:
  1. A patch on a table declaring `aggregateIndex`/`rankIndex` with no
     user-supplied `update.before` hook issues ONE pre-image `db.get`, not two.
  2. A user-supplied `update.before` that writes the row through `innerDb` still
     has its write observed by `after`/`change` hooks (invariant preserved).
  3. A read-bound vitest pins the pre-image `db.get` count at N for an N-row
     update on an aggregateIndex table.
- caveats: reporter suggests two shallow fixes (capture pre-wrap hook, or symbol
  tag). Both leave the barrier occupying a user-trigger slot. Evaluate the
  structural fix before accepting either.
- likely files/packages: `packages/kitcn/src/orm/lifecycle.ts`,
  `packages/kitcn/src/orm/triggers.ts`, new/edited read-amplification vitest.
- browser surface: none.
- root-cause layer: ORM lifecycle hook dispatch (`writerWithHooks`), not the
  aggregate runtime.

Timed checkpoint:
- requested duration: N/A: no duration requested
- semantics: one-shot execution
- initial confidence score: direct read-count reproduction
- improvement loop: scoped proof, full checks and exact-head review
- final score / loop closure: recorded in current closeout evidence

Completion threshold:
- A 5-row `orm.update()` on an `aggregateIndex` table issues 5 target-table
  `db.get` calls (was 10), matching the `change`-trigger-only baseline.
- A user `update.before` that writes through `innerDb` still yields a correct
  `newDoc` for `after`/`change`, proven by a test.
- `bun --cwd packages/kitcn build`, package vitest suite, root typecheck, and
  `bun lint:fix` all pass.
- A `.changeset` records the published behavior delta.
- Task closure is legal only when the source-of-truth acceptance criteria are
  satisfied or explicitly narrowed, required verification evidence is recorded,
  code-review and release-artifact gates are closed when applicable, verified
  code changes are committed and PR'd unless explicitly declined or blocked,
  task-style PR body sync is complete or marked N/A with reason,
  GitHub issue/PR sync is complete or marked N/A with reason, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/444-orm-double-pre-image-read.md` passes.

Verification surface:
- New read-bound vitest counting target-table `db.get` on an N-row update
  (aggregateIndex vs change-only vs unhooked).
- Behavior test: user `update.before` writing through `innerDb`.
- `packages/kitcn/src/orm/lifecycle.test.ts` and the aggregate-index vitest
  suite (`runtime.vitest.ts`, `rank-runtime.vitest.ts`,
  `write-barrier.read-amplification.vitest.ts`).
- `bun --cwd packages/kitcn build`, `bun typecheck`, `bun lint:fix`.
- cwd for all of the above: repo root `/Users/mikey/conductor/workspaces/kitcn/cheyenne`.

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
- Source of truth: GitHub issue #444.
- Allowed edit scope: `packages/kitcn/src/orm/**` (lifecycle + triggers +
  tests), `.changeset/`, `docs/plans/444-orm-double-pre-image-read.md`.
- Browser surface: N/A — no UI or rendered output.
- GitHub issue sync: post a concise QA-facing comment once verified.
- Non-goals: reworking `replace`'s missing re-read into a new read; redesigning
  aggregate/rank index maintenance; touching the CLEARING probe memo.

Output budget strategy:
- Repo-wide greps piped through `head`/`grep -c`. Full-file reads limited to
  `lifecycle.ts` and `triggers.ts`. Test runs scoped to single vitest files
  until the final suite pass. Broad mapping delegated to a workflow whose
  agents return structured findings rather than raw file dumps.

Blocked condition:
- Blocked only if the pre-image re-read turns out to protect a real invariant
  that cannot be preserved without it, i.e. if the injected barrier can write
  the guarded row. Disproving that is a Map-phase gate.

Task state:
- task_type: bug
- task_complexity: non-trivial
- current_phase: closeout
- current_phase_status: in_progress
- next_phase: exact-head feedback closure and merge
- goal_status: active

Current verdict:
- verdict: valid, fixed
- confidence: 95-100%
- next owner: task
- reason: measured 10 vs 5 vs 0 target-table `db.get` calls for a 5-row update,
  exactly matching the reported table.

Implementation readiness:
- verdict: ready
- exact owner: `packages/kitcn/src/orm/lifecycle.ts` hook dispatch
- contradiction status: none — source, tests, and runtime agree.
- source-listed cases complete: yes (see case matrix)

Pre-solution issue challenge:
- reporter claim: on any table declaring `aggregateIndex`/`rankIndex`, every
  `db.patch` reads the target document twice, because the auto-injected write
  barrier occupies the `update.before` slot and the re-read is gated on that
  slot being non-empty.
- suggested diagnosis or fix: (A) capture `existing.update?.before` before
  wrapping and gate on it, or (B) symbol-tag the barrier-only wrapper.
- repro ladder:
  - tests / source-level repro: DONE — dedicated vitest counting target-table
    `db.get` across three schemas. Measured AGG=10, CHANGE=5, PLAIN=0 for a
    5-row `orm.update()`, matching the issue exactly.
  - repo-owned automated browser or integration proof: N/A — no browser surface.
  - Browser plugin: N/A — no browser surface.
  - screenshot / visual proof: N/A — read counts are not rendered output.
- reproduction verdict: reproduced
- validity verdict: valid
- best long-term fix boundary: a dedicated internal `writeBarrier` slot on the
  lifecycle hook map, run at the top of every write path. Both reporter
  suggestions leave the barrier squatting in a user-trigger slot and only teach
  one gate to see through the costume; the slot makes
  `tableHooks.update?.before` mean exactly "user before hook" by construction,
  so the other four `before` read sites cannot drift.
- harsh honest feedback: the issue's diagnosis is correct and well-evidenced.
  Its suggested fixes treat the symptom (the gate) rather than the cause (the
  barrier being modelled as a user `before` trigger).
- hard-stop decision: proceed — reproduced and valid.

Completion rule:
- Do not call `update_goal(status: complete)` while any required checklist item
  remains unchecked. If an item does not apply, check it and add `N/A: <reason>`.
- Do not call `update_goal(status: complete)` until every completion threshold
  above is satisfied, final handoff evidence is recorded, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/444-orm-double-pre-image-read.md` passes.
- Do not create hook state for this goal. This file plus the active goal are the
  durable state.

Start Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| Timed checkpoint parsed | no | N/A: no duration requested |
| Walkthrough baseline for possible UI change | no | N/A: ORM read-count fix, no UI or rendered output |
| Skill analysis before edits | yes | task + autogoal (task template + package-api pack) + changeset + autoreview; testing/tdd folded into task |
| Active goal checked or created | yes | docs/plans/444-orm-double-pre-image-read.md |
| Source of truth read before edits | yes | `gh issue view 444 --json ...` before any file read |
| Exact per-PR task ownership | yes | this plan owns exactly PR #450 |
| GitHub comments and attachments read | yes | issue has 0 comments, 0 labels; verified in the same gh call |
| Video transcript evidence required | no | N/A: no video or screen recording in the source |
| Pre-solution issue challenge required | yes | see Pre-solution issue challenge; verdict valid |
| Reproduction verdict before implementation | yes | reproduced AGG=10 / CHANGE=5 / PLAIN=0 before any edit |
| Repro escalation ladder selected | yes | source-level vitest repro sufficed; browser/visual rungs N/A |
| Suggested fix reviewed against durable boundary | yes | both reporter suggestions rejected; see Decisions |
| `docs/solutions` checked for non-trivial existing-code work | no | N/A: no docs/solutions directory in this repo |
| TDD decision before behavior change or bug fix | yes | repro-first, then tests proven red on the stock file before landing |
| Branch decision for code-changing task | yes | already on dedicated non-main branch task-issue-444 |
| Release artifact decision | yes | .changeset/olive-donkeys-invite.md, patch |
| Browser tool decision for browser surface | no | N/A: no browser surface |
| Commit / PR expectation decision | yes | PR #450 closeout is authorized, including whole-checkout commit/push and admin merge; Version Packages excluded |
| Task-style PR body decision | yes | PR #270 emoji task-style body used for PR #450 |
| Task-plan PR body evidence | yes | body has `🧭 Task plan: docs/plans/444-orm-double-pre-image-read.md`; plan exists at PR head and names PR #450 |
| GitHub issue sync expectation decision | yes | PR body carries `🐛 Fixes #444`, which closes the issue on merge |
| Output budget strategy recorded | yes | see Output budget strategy |
| Package/API pack selected | yes | package-api pack applied |
| Public surface or package boundary identified | yes | no public surface change; writeBarrier is lifecycle-local |
| Convex entry/import graph impact identified | yes | no new imports in lifecycle.ts; import graph unchanged |
| CLI/scaffold/generated impact identified | no | N/A: no CLI, scaffold, template or generated output touched |
| Release artifact path selected | yes | .changeset |
| `changeset` skill loaded when `.changeset` is required | yes | read .agents/rules/changeset.mdc; used Patches section, patch bump |
| Package build / fixture impact decision recorded | yes | ran bun --cwd packages/kitcn build; fixtures untouched |

Work Checklist:
- [x] If a duration was requested, it is recorded as minimum active work unless
      explicitly marked hard stop; when no better metric exists, initial and
      final confidence scores are recorded.
- [x] Objective includes outcome, completion threshold, verification surface,
      constraints, boundaries, and blocked condition.
- [x] Task source classified with source type, id/link, title, task type,
      acceptance criteria, caveats, likely files/routes/packages, browser
      surface, and root-cause layer.
- [x] Every GitHub PR in scope has its own task plan. This plan owns one exact
      PR, owns a not-yet-created PR slice, or records N/A because no PR is in
      scope; a batch plan is not used as a substitute.
- [x] Required video or screen-recording evidence is cached/read as normalized
      `<video-transcripts>` XML, or marked N/A with reason.
- [x] For public GitHub bug reports, behavior claims, technical diagnoses, or
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
- [x] Source-listed case matrix is complete and every contradiction has an
      owner, harness, and verdict before mutation.
- [x] Readiness is classified `ready`, `repair-source`, `major`, `blocked`, or
      `invalid` with evidence.
- [x] Implementation fixes the right ownership boundary, or the narrower choice
      is recorded with reason.
- [x] Release artifact requirement recorded: active changeset, new changeset, or
      N/A with reason.
- [x] Final handoff shape decided: bug/feature/testing/batch/review/GitHub
      requirements, PR body sync, and issue sync when applicable.
- [x] Commit/PR handling recorded for code-changing work: commit and PR
      completed, no local patch, user explicitly declined, or blocker recorded.
      "User did not separately ask for a PR" is not a valid blocker.
- [x] PR body shape recorded: PR #270 emoji task-style body used, N/A reason
      recorded, or blocker recorded.
- [x] PR task evidence recorded: body includes `🧭 Task plan: ...`, the plan
      exists at the PR head, and it identifies the exact PR before autoclosure.
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
- [x] Package/API pack: public API, package boundary, export, and release-artifact impact are recorded.
- [x] Package/API pack: release artifact matrix is applied: `.changeset` or explicit no-artifact reason.
- [x] Package/API pack: `.changeset` work loads `changeset` and follows its package/version/prose rules.
- [x] Package/API pack: no-artifact decisions state why the diff has no published package user-visible delta from `main`.
- [x] Package/API pack: compatibility, migration, or hard-cut decision is explicit when public shape changes.
- [x] Package/API pack: affected Convex static import graphs stay narrow and
      plugin/per-module boundaries are used where appropriate.
- [x] Package/API pack: CLI commands remain deterministic, `--json` capable,
      and non-interactive with explicit confirmation bypass when relevant.
- [x] Package/API pack: docs and `packages/kitcn/skills/kitcn/**` stay
      current-state synchronized when public guidance changes.
- [x] Package/API pack: package-owned typecheck/build/test proof is recorded or marked N/A with reason.
- [x] Package/API pack: `packages/kitcn` build, fixture sync/check, or other owning package proof is recorded when required.

Completion Gates:
| Gate | Applies | Required action | Evidence |
|------|---------|-----------------|----------|
| Named verification threshold | yes | Run the command, proof, source audit, or artifact check named in this plan | AGG 10->5 with CHANGE=5 baseline; see Verification evidence |
| Exact per-PR task ownership | yes | Record the exact PR and dedicated plan, or the not-yet-created single-PR slice | This plan owns exactly https://github.com/udecode/kitcn/pull/450 |
| Pre-solution issue challenge verdict | yes | Record reporter claim, suggested fix, repro verdict, validity verdict, durable boundary, and hard-stop/pivot decision before implementation | valid; recorded before implementation |
| Repro escalation ladder | yes | For bug/behavior claims, record test/source-level, automated browser/integration, Browser, and screenshot/visual-proof outcomes or N/A/blocker reasons before `not reproduced` | source-level repro reproduced it; higher rungs N/A |
| Bug reproduced before fix | yes | Record failing test/repro or N/A with reason | AGG=10 vs CHANGE=5 vs PLAIN=0 |
| Targeted behavior verification | yes | Run focused test/proof for changed behavior or record N/A | Current closeout: 9/9 integration tests across read-amplification and both barrier suites; 22/22 lifecycle Bun tests |
| TypeScript or typed config changed | yes | Run relevant typecheck | bun typecheck 5/5 packages |
| Package exports or file layout changed | yes | Run the relevant package build before final verification and keep generated updates | bun --cwd packages/kitcn build, 72 files |
| Package manifests, lockfile, or install graph changed | no | Run `bun install` and relevant package checks | N/A: no manifest or lockfile change |
| Agent rules or skills changed | no | Run `bun install` and verify generated skill sync | N/A: no .agents/.claude/.codex change |
| Workspace authority proof | yes | Run verification in the owning repo/package/app/route/tool and record cwd; do not count the wrong workspace as proof | every command run from repo root /Users/mikey/conductor/workspaces/kitcn/cheyenne, which owns packages/kitcn |
| Browser surface changed | no | Capture Browser Use proof or record explicit waiver/blocker | N/A: no browser surface |
| Browser final proof | no | Attach screenshot or exact browser verification caveat when browser proof applies | N/A: no browser surface |
| UI walkthrough | no | If UI or rendered output changed, run `.agents/skills/walkthrough/SKILL.md` after final proof and show annotated images in the final handoff; otherwise record N/A | N/A: no UI or rendered output changed |
| Scaffold or fixture output changed | no | Run `bun run fixtures:sync` and `bun run fixtures:check`, or record N/A | N/A: PR does not change scaffold owners; current full check validates fixtures integrated from main |
| Package behavior or public API changed | yes | Add a changeset or record why no changeset applies | .changeset/olive-donkeys-invite.md |
| Docs and kitcn skill sync changed | no | Keep `www/**` and `packages/kitcn/skills/kitcn/**` in sync, or record N/A | N/A: no www/ docs changed; no public guidance changed |
| Docs or content changed | no | For docs-heavy work, use `--template docs`; for incidental docs, verify source-backed claims, links, examples, and rendered output or record N/A | N/A: no docs changed |
| High-risk mini gate | yes | For public API/runtime/package-boundary/browser/agent-action/command-contract changes, record realistic failure mode, proof plan, and why the chosen boundary is right; otherwise N/A | see High-risk note |
| Agent-native review for agent/tooling changes | no | For `.agents/**`, `.claude/**`, `.codex/**`, skills, hooks, commands, prompts, or user-action tooling, load `.agents/skills/agent-native-reviewer/SKILL.md` and close accepted/actionable findings, or record N/A | N/A: no agent/tooling surface touched |
| Local install corruption suspected | no | Run `bun install` once, rerun the exact failing command, or record N/A | No corruption-shaped failure; bun install completed after main integration |
| Commit created | yes | For verified code-changing work, stage the entire current checkout per repo policy and create a commit; N/A only for no local patch, explicit user decline, analytical/blocked/inconclusive work, or recorded external blocker | 87d37a4f, whole checkout staged |
| PR create or update | yes | For verified code-changing work, run `check`, push, create or update the PR, and sync PR body to the task-style final handoff | PR #450; current closeout requires fresh passing check before final update/push |
| Task-style PR body verified | yes | Verify the PR body with `gh pr view --json body` | verified: auto-release block preserved, no self-link, PR #270 emoji format |
| PR task evidence verified | yes | Verify body plan line, plan at PR head, and exact PR ownership | verified after the follow-up push |
| PR proof image hosting | no | If PR body needs browser proof, replace local image paths with hosted GitHub URLs or record N/A | N/A: no browser proof, no images |
| GitHub issue sync-back | yes | Post concise issue sync after PR exists, or record N/A/blocker | PR body `🐛 Fixes #444` links and closes the issue on merge |
| Final handoff contract | yes | Fill the final handoff fields below with exact PR/issue/confidence/tests/browser/outcome/caveats/design/verification content or N/A reason | see Final handoff contract |
| Final lint | yes | Run `bun lint:fix` or scoped equivalent | bun lint:fix, 962 files checked |
| Output budget discipline | yes | Verify no unbounded high-volume command output was streamed, or record the accidental output and recovery | greps capped with head/grep -c; workflow returned structured findings; large tool output persisted to files |
| Timed checkpoint | no | If duration was requested, keep improving until elapsed, then finish the current loop cleanly; otherwise N/A | N/A: no duration requested |
| Autoreview for non-trivial implementation changes | yes | Load `.agents/skills/autoreview/SKILL.md`; use dirty local `--mode local`, branch/PR `--mode branch --base <base>`, or committed slice `--mode commit --commit <ref>` until no accepted/actionable findings, or record N/A for docs-only/trivial/no local patch | autoreview --mode local --engine claude, exit 0, no accepted findings, "patch is correct" |
| Goal plan complete | yes | Run `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/444-orm-double-pre-image-read.md` | passes |
| Public API / package boundary proof | yes | Source-audit public API, exports, and package boundary impact | NormalizedOrmTableTriggers untouched; writeBarrier lives on lifecycle-local LifecycleTableHooks; no export change |
| Convex bundle/import proof | yes | Audit affected function-entry static graphs or record N/A | no import added or removed in lifecycle.ts |
| CLI/scaffold/generated proof | no | Prove command contract and regenerate owned output or record N/A | N/A: none touched |
| Release artifact classification | yes | Record whether the change is published package behavior/API/types/config/runtime or no published user-visible delta | published package runtime behavior change -> patch changeset |
| Published package changeset | yes | If published package users see a delta, load `changeset` and add/update one `.changeset/*.md` per package | .changeset/olive-donkeys-invite.md |
| No release artifact | no | If no artifact is needed, record the exact reason: internal-only, docs-only, agent-only, test-only, or no user-visible delta from `main` | N/A: a changeset was added |
| Package typecheck/build/test | yes | Run owning package checks or record N/A with reason | bun typecheck, bun --cwd packages/kitcn build, bun run test all green |
| Fixture/scaffold generation | no | Run `bun run fixtures:sync` and `bun run fixtures:check` when scaffold output changed, otherwise N/A | N/A: no scaffold output changed |
| Docs/package skill sync | no | Synchronize current-state public guidance or record N/A | N/A: no public guidance changed |

Phase / pass table:
| Phase | Status | Evidence | Next |
|-------|--------|----------|------|
| Intake and source read | complete | `gh issue view 444`; no comments/labels | implementation |
| Repro | complete | AGG=10 / CHANGE=5 / PLAIN=0, matching the issue | implementation |
| Design + adversarial review | complete | 21-agent workflow: 46 mapped constraints, 4 designs, 12 attacks; option D killed by 5 grounded blockers | implementation |
| Implementation | complete | `lifecycle.ts` +49/-37, two new vitest files | verification |
| Verification | complete | 1400 bun + 988 vitest pass; typecheck 5/5; build ok; new tests proven red on stock file | closeout |
| Autoreview | complete | `--mode local --engine claude`, exit 0, no accepted findings, "patch is correct" | closeout |
| Commit / PR / GitHub sync | complete | commit 87d37a4f, branch `fix/orm-double-pre-image-read`, PR #450 | final response |
| PR review round 1 | complete | @chatgpt-codex-connector P1 on the alias hunk accepted and reverted; probe evidence recorded | final response |
| Closeout | in_progress | Fresh local/hosted proof and exact-head feedback receipt required | merge |

High-risk note:
- Surface: ORM runtime write path. Every insert/patch/replace/delete on a
  hooked table now runs through a new `writeBarrier` call site.
- Realistic failure mode: the barrier silently stops running, re-opening the
  fail-open hole this change closed, and aggregate/rank indexes accept writes
  while CLEARING. Before this change nothing in the repo would have caught
  that — barrier coverage was insert-only.
- Proof plan: `aggregate-index/write-barrier.vitest.ts` exercises the
  CLEARING guard on insert, patch, replace, delete and delete-of-a-gone-row.
  Aliased schemas are outside this PR's fix and proof claims.
- Why this boundary is right: the barrier is a precondition, not a trigger.
  Modelling it as a user `before` hook is what made `update.before` mean two
  things and forced the re-read. A dedicated slot makes the existing gate
  correct by construction instead of teaching one call site to see through a
  disguise, so the other four `before` read sites cannot drift back.

Follow-ups (deliberately out of scope):
- `hookedTableNames` is table-granular, so a barrier-only table still suppresses
  post-image derivation in `insert.ts`/`update.ts`. Same root cause, now
  addressable because a barrier-only table is distinguishable.
- A `before` hook writing through `ctx.db` deadlocks on the non-reentrant
  `innerWriteLock`, while `www/content/docs/orm/schema/triggers.mdx:201`
  advertises `ctx.db` as usable in every hook.
- Fixture drift was integrated from main; current full-check proof follows.
- Aliased schemas (`defineSchema({ key: convexTable('other', ...) })`) are
  incoherent: Convex registers the object key, the ORM data path writes the
  `convexTable` name, and the aggregate subsystem keys on the object key. Needs
  its own issue — most likely the ORM should reject the mismatch outright.

Findings:
- Repro matched the issue exactly: 5-row `orm.update()` issued 10 target-table
  `db.get` calls on an `aggregateIndex` table, 5 on a `change`-only table, 0 on
  an unhooked table.
- The injected barrier is provably read-only. `assertAggregateIndexesWritable`
  (`aggregate-index/runtime.ts:3115-3159`) has no `insert`/`patch`/`replace`/
  `delete`/`scheduler`/`storage` call on any path; its only DB access is one
  indexed read of `aggregate_state`, and its only mutation is a JS-heap WeakMap
  memo. So it can never invalidate the pre-image it was forcing a re-read of.
- The re-read is guarded by exactly one test repo-wide:
  `lifecycle.test.ts` "update hooks include same-document writes from before
  hooks". Nothing pinned the read count.
- A user `before` hook can only write the row through `ctx.innerDb`. Writing
  via `ctx.db` deadlocks on the non-reentrant `innerWriteLock`, so the re-read
  protects exactly one narrow capability.
- WITHDRAWN (was "second bug"): I briefly changed barrier injection to resolve
  the table object's own `convexTable(name)` instead of `tableConfig.name`.
  @chatgpt-codex-connector flagged it P1 on PR #450 and was right. Probe of
  `defineSchema({ zz_object_key: convexTable('zz_physical_name', ...) })`:
  `defineConvexSchema` receives the object map unchanged, so Convex registers
  `zz_object_key`; but the ORM data path writes to `zz_physical_name`, and
  every aggregate site — backfill targets (`backfill.ts:156`), `count()`
  (`runtime.ts:1520`), `rank()` (`rank-runtime.ts:290`), index enumeration
  (`runtime.ts:3457`) — keys on `tableConfig.name`. So an aliased schema is
  incoherent in BOTH directions and neither keying is right; my change merely
  moved the incoherence somewhere worse, misaligning maintenance writes from
  the backfill and every read. Reverted; recorded as its own follow-up.
- THIRD BUG, not in the issue: `delete`'s `if (!oldDoc)` early return preceded
  `mergeBeforeData`, so deleting an already-deleted row never reached the
  barrier and surfaced Convex's `Delete on non-existent doc` instead of the
  transient index state.
- Barrier coverage was insert-only before this change; nothing exercised it on
  patch, replace or delete.

Decisions and tradeoffs:
- CHOSE option C (dedicated `writeBarrier` slot) over the issue's two
  suggestions. Suggestion A is not independently implementable: `writerWithHooks`
  only ever sees the hook map, so "capture the pre-wrap hook" needs a side
  channel, which collapses into B or C. Suggestion B (symbol/WeakSet tag) works
  but leaves four other `before` read sites keyed on a slot that means two
  things, enforced only by a comment.
- REJECTED option D (move the pre-image read after the before hook, deleting the
  first read instead of the second). It reads better on paper and would have cut
  reads to N even for tables with a user `update.before`, but adversarial review
  produced five grounded blockers: it redefines `change.oldDoc` from the
  statement-entry image to the post-hook image, and `TableAggregate.trigger`
  (a public export) derives the btree key to REMOVE from `oldDoc`. Under D the
  key it deletes was never inserted, so `_replace` throws on the strict path and
  silently double-counts on the idempotent path. D also could not touch `delete`
  (whose `before` hook is handed the pre-image), so `change.oldDoc` would have
  meant two different things depending on the operation.
- KEPT `oldDoc` as the statement-entry image. `newDoc` still derives from the
  re-read when a user `update.before` exists. The old/new asymmetry that creates
  is pre-existing and load-bearing for change-stream consumers; the stale
  comment claiming the re-read served both was corrected instead.
- Placed `writeBarrier` on a lifecycle-local `LifecycleTableHooks` type rather
  than on `NormalizedOrmTableTriggers`, so the user-trigger normalization module
  stays free of an injected internal concept.
- Chained rather than assigned the barrier, so a schema with two keys resolving
  to one table name composes instead of dropping a guard.
- FIXED the delete-early-return bug in the same change: it lives in the exact
  code being restructured, it is fail-open on the very guard this issue is
  about, and it is three lines.
- REVERTED the aliased-table-name change after PR #450 review. Scope discipline:
  aliased schemas are broken independently of #444 and picking either key makes
  some path wrong. `tableName` is now a local alias for `tableConfig.name`, so
  the injection loop is semantically identical to `main`.
- OUT OF SCOPE, recorded as follow-ups: (1) `hookedTableNames` is table-granular,
  so a barrier-only table still suppresses post-image derivation in
  `insert.ts`/`update.ts` — a second amplification with the same root cause,
  newly addressable now that a barrier-only table is distinguishable;
  (2) `ctx.db` writes from a `before` hook deadlock, and
  `www/content/docs/orm/schema/triggers.mdx:201` advertises them as supported;
  (3) removing the second read makes `change.oldDoc`/`newDoc` share nested
  object references on aggregate tables — this already happens for every
  plain change-hook table, so the fix converges onto existing behavior rather
  than introducing new aliasing.

Implementation notes:
- Dedicated lifecycle-local writeBarrier runs before user hooks on all writers.

Review fixes:
- P1 table-key finding: injection and maintenance use `tableConfig.name`.
  Current closeout removes stale alias-fix/backfill claims from this plan.

Error attempts:
| Error / failed attempt | Count | Next different move | Resolution |
|------------------------|-------|---------------------|------------|
| None yet | 0 | | |

Verification evidence:
- cwd for every command below: `/Users/mikey/conductor/workspaces/kitcn/cheyenne`.
- Repro before fix: AGG=10, CHANGE=5, PLAIN=0 for a 5-row `orm.update()`.
- Repro after fix: AGG=5, CHANGE=5, PLAIN=0.
- Aliased-schema behavior is unchanged and is not verification for this PR.
- New tests proven to fail on stock `lifecycle.ts` (reverted the file, re-ran,
  restored): 3/5 read-amplification tests fail `expected 10 to be 5`; the
  current write-barrier contract catches `'Delete on non-existent doc'`.
- `npx vitest run --project integration`: 77 files, 845 passed, 14 skipped.
- `bun run test`: 1400 bun tests across 150 files, 0 fail; vitest 988 passed,
  14 skipped, no type errors.
- `bun typecheck`: 5/5 packages pass.
- `bun --cwd packages/kitcn build`: 72 files, build complete.
- `bun lint:fix`: 962 files checked, 2 formatted.
- `bun check`: every lane green through `test:cli` and `test:concave`; fails
  only at `fixtures:check` with `expo ~55.0.30 -> ~55.0.31`. Proven upstream:
  the fixture was last synced in #400 and `npm view expo@'~55.0.30' version`
  now resolves to 55.0.31. The diff touches no fixture, template or scaffold
  source.

Source-listed case matrix:
| Case | Source claim | Harness | Before | Expected after | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| aggregateIndex table | 10 `db.get` for a 5-row `orm.update()` | read-bound vitest, target-table `db.get` counter proxy installed under the ORM | 10 | 5 | repro run: `AGG: 10` | reproduced |
| `change` trigger only | 5 `db.get` | same | 5 | 5 (unchanged) | repro run: `CHANGE: 5` | reproduced |
| unhooked table | 0 `db.get` | same | 0 | 0 (unchanged) | repro run: `PLAIN: 0` | reproduced |
| rankIndex table | issue names rankIndex too | same harness with `rankIndex` | 10 | 5 | `lifecycle.read-amplification.vitest.ts` "a rankIndex table reads the pre-image once per row" | fixed |
| user `update.before` writes the row via `innerDb` | not in issue; the invariant the re-read protects | behavior test asserting `change.newDoc` observes the hook's write | 2N reads, correct newDoc | 2N reads, correct newDoc (unchanged) | same file, "a user update.before still forces a fresh pre-image read" | preserved |
| aliased schema key (`{ people: convexTable('users', ...) }`) | NOT in issue; chased during the fix | CLEARING barrier + write attempt | inconsistent (see below) | left unchanged | reverted after PR #450 review | withdrawn — separate bug |
| delete of an already-deleted row while CLEARING | NOT in issue; found during the fix | CLEARING barrier + delete of a gone id | `Delete on non-existent doc` | `AGGREGATE_INDEX_BUILDING` | same file | fixed |

Final handoff contract:
- Commit line: 87d37a4f `fix(orm): give the aggregate write barrier its own
  lifecycle slot` on branch `fix/orm-double-pre-image-read`.
- PR line: https://github.com/udecode/kitcn/pull/450 (base `main`).
- Issue line: #444 is closed by the PR's `Fixes #444` line; no separate comment
  posted.
- Confidence line: 95-100%.
- Flow table:
  - Reproduced: tests 🟢 (AGG=10 vs CHANGE=5 vs PLAIN=0), browser ➖ N/A
  - Verified: tests 🟢 (1400 bun + 988 vitest), browser ➖ N/A
- Browser check: N/A — no UI or rendered output.
- Outcome: a patch on an aggregateIndex/rankIndex table reads its pre-image
  once per row instead of twice; CLEARING checks precede gone-row deletes.
- Caveat: tables with a user update.before hook retain two pre-image reads;
  aliased schemas are not repaired by this PR.
- Design:
  - Chosen boundary: a dedicated internal `writeBarrier` slot on the lifecycle
    hook map, run at the top of every write path.
  - Why not quick patch: the issue's suggestion A cannot be built standalone,
    and suggestion B leaves four other `before` read sites keyed on a slot that
    means two things, enforced only by a comment.
  - Why not broader change: option D (move the read after the hook) would cut
    reads further but redefines `change.oldDoc`, which `TableAggregate.trigger`
    — a public export — uses to derive the btree key to remove.
- PR body: #450 exists and names this exact plan; final proof update required.

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
- Commit: original 87d37a4f plus table-key correction fe15c7d7; current closeout in progress
- PR: https://github.com/udecode/kitcn/pull/450
- Issue: #444, linked through Fixes in the PR body
- Browser proof: N/A: no UI or rendered-output change
- Caveats: user update.before preserves two reads; aliased schemas remain out of scope

Timeline:
- 2026-09-05T06:08:34.309Z Task goal plan created.
- Branch renamed task-issue-444 -> fix/orm-double-pre-image-read before push.
- Commit 87d37a4f pushed; PR #450 opened against main.
- Repro confirmed the reported 2x pre-image read exactly.
- 21-agent design/attack workflow ran; option D rejected on 5 blockers.
- Dedicated writeBarrier implemented; gone-row delete respects CLEARING.
- Full verification green; autoreview clean.

Reboot status:
| Question | Answer |
|----------|--------|
| Where am I? | PR #450 exact-head closeout in progress |
| Where am I going? | Fresh checks, review, push, feedback replay and merge |
| What is the goal? | Make an N-row patch on an aggregateIndex/rankIndex table cost N pre-image reads instead of 2N, pinned by a read-bound vitest |
| What have I learned? | See Findings and Decisions and tradeoffs |
| What have I done? | See Timeline and Verification evidence |

Open risks:
- Removing the second read makes `change.oldDoc` and `change.newDoc` share
  nested object references on aggregate tables, so an `update.after` hook that
  mutates the post-image in place would now also mutate the pre-image the
  `change` hook reads. This already holds for every plain change-hook table, so
  the change converges aggregate tables onto shipped behavior rather than
  introducing new aliasing. Not pinned by a test either way.
- Aliased schemas are not repaired here; no backfill or migration claim is
  made for them. Lifecycle uses the same tableConfig.name owner as main.

Current closeout (2026-09-07):
- User authorized the sequential sweep with no walkthrough and no Version
  Packages merge. Auto release must remain disabled; use `[skip release]`.
- This exact task was resumed after PR #449 merged. Main b8df2da4 integrated
  without conflicts. No lifecycle source change needed during closeout.
- Owning checkout: /Users/zbeyens/git/better-convex.
- Fresh focused proof: 9/9 integration tests, 22/22 lifecycle Bun tests.
- Full `bun check` passed, exit 0: 1400 Bun tests, 1005 Vitest tests, 124 CLI
  tests, all 8 fixture comparisons and runtime smoke lanes. Log:
  /tmp/kitcn-pr450-check.log. Package build and lint also passed.
- Deslop retained only the test-directory fan-out warning; no source cleanup
  warranted. Agent-native source/route/proof review passed.
- Final branch review and delivery receipts remain in progress; older
  verification elsewhere in this plan does not substitute for these gates.

Hard closeout guard:
- A local-only final response for verified code-changing work is invalid unless
  this plan records an explicit user decline, no local patch, analytical/
  blocked/inconclusive outcome, or a real commit/PR blocker.
