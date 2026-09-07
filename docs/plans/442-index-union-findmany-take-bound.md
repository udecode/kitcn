# 442 index-union findMany take bound under RLS or residual filter

Objective:
Restore the `take()` read bound on the non-paginated index-union (multiProbe) `findMany` lane when RLS is enabled or a residual (non-Convex-enforceable) post-filter is present, without regressing rows, order, or read cost.

Current closeout requirements (2026-09-07):
- Dedicated resumed `task` and `autoclosure` for exactly #455. Root checkout
  /Users/zbeyens/git/better-convex; no worktrees or parallel agents. Prior
  completed-state claims below are historical until fresh gates pass.
- User: close #448-#456 with valid per-PR evidence, passing checks, zero
  actionable P1, then recheck #430. Latest "never ask, just go" authorizes
  bounded repairs. P2 may be explicitly deferred; no new product scope.
- Whole-checkout commit/push, PR updates, quoted replies, resolutions and admin
  merge authorized. Disable auto release, merge with `[skip release]`, verify
  release skipped; never merge Version Packages. No browser surface here.
- Scope baseline: #442, non-paginated index-union membership/read-bound owner
  in query.ts. Preserve sort, deduplication, offset, RLS and relation fan-out
  safety. No public shape change, CLI/scaffold work, or cursor-lane expansion.
  Changeset owns published behavior; docs already describe this read contract.
- Compliance: body has one exact plan line; this plan at refs/pr/455 identifies
  #455. HEAD = fetched ref = live d2aa22034670b7c0c650c04f43bab2da1a19c3e8
  before source triage. Fresh focused proof at that head: 11/11 passed,
  /tmp/kitcn-pr455-initial-proof.log. Main f399843c merged without conflicts;
  integration is not yet committed or pushed.
- Full feedback helper: 0 unresolved threads, 1 comment, 3 review bodies.
  Unfiltered inventory: 3 resolved threads (1 outdated), 7 inline comments,
  2 top-level comments, 7 review bodies. All thread/comment pages exhausted.
  All source content read, including previous author replies.
- P1 replay must cover fan-out guard and changeset prose after final push.
  Initial resolved state is not proof. Full check, final autoreview, exact-head
  external receipt and CI remain pending. Active goal remains externally
  blocked; do not fake a lifecycle transition.
- Integrated proof: 27/27 tests across index-union read bounds, pagination and
  relation-target memo passed. Bounded deslop kept the guards and behavior,
  shortened redundant comments and corrected a stale claim that streamed
  probes load relation predicates (that lane is excluded). Lint: 970 files,
  clean. Slop delta ran; catch/statement-wrapper hits originate in merged main
  outside this PR's delta and were not changed. No new abstraction or API.
- Final changeset source pass retains the cost caveat as a paragraph, not a
  non-action bullet, and leaves one outcome in each bullet. Every outcome now
  starts Fix/Improve/Support; no private planner notes. This prose-only repair
  completes the prior P1 requirement without describing an unmerged attempt.
- Autoreview P0/P1 at c824e87a: exit 0, no findings, 0.93 confidence. No runtime
  or test change after review; subsequent updates are changeset/plan prose.
- Fresh full `bun check` passed in root: 1421 Bun tests, 1038 Vitest tests,
  124 CLI tests, typecheck 5/5, package builds, eight matching fixtures and
  prepared-app verify/runtime lanes. /tmp/kitcn-pr455-check.log, exit 0.
  No test timeout or fixture failure was waived. Upstream create-convex smoke
  templates selected Convex 1.45.0 and printed a compatibility warning; the
  supported fixture lane uses 1.44.0 and both smoke processes passed.

Current feedback ledger:
| URL | Priority and rationale | Current disposition |
| --- | --- | --- |
| https://github.com/udecode/kitcn/pull/455#discussion_r3942884336 | P2: singleton relation checks amplify repeated-target reads | Relation predicates excluded from stream; replay with merged #448 |
| https://github.com/udecode/kitcn/pull/455#discussion_r3942893849 | N/A: prior reply explaining measured amplification | Superseded by next reply; no independent request |
| https://github.com/udecode/kitcn/pull/455#discussion_r3942924020 | N/A: prior reply recording restored batching | Verify current owner rather than trust reply |
| https://github.com/udecode/kitcn/pull/455#discussion_r3942902695 | P1: streaming retires relationFanOutMaxKeys safety guard | Resolved; 40-keys/cap-5 regression passed at initial head, replay final head |
| https://github.com/udecode/kitcn/pull/455#discussion_r3942923713 | N/A: prior reply explaining relation exclusion fix | Fresh proof required for parent finding |
| https://github.com/udecode/kitcn/pull/455#discussion_r3942933074 | P1: release artifact exposes private planner mechanisms | Resolved/outdated; current changeset has public outcomes, final source replay required |
| https://github.com/udecode/kitcn/pull/455#discussion_r3942939652 | N/A: prior reply explaining changeset rewrite | No independent request; final artifact review required |
| https://github.com/udecode/kitcn/pull/455#issuecomment-5556758824 | N/A: changeset status notice only | Verify matching artifact |
| https://github.com/udecode/kitcn/pull/455#issuecomment-5556758923 | N/A: deployment status only | Refresh final CI/Preview |
| https://github.com/udecode/kitcn/pull/455#pullrequestreview-5124063281 | N/A: wrapper; finding ledgered inline | No independent claim |
| https://github.com/udecode/kitcn/pull/455#pullrequestreview-5124072460 | N/A: empty body | No independent claim |
| https://github.com/udecode/kitcn/pull/455#pullrequestreview-5124081221 | N/A: wrapper; finding ledgered inline | No independent claim |
| https://github.com/udecode/kitcn/pull/455#pullrequestreview-5124101217 | N/A: empty body | No independent claim |
| https://github.com/udecode/kitcn/pull/455#pullrequestreview-5124101486 | N/A: empty body | No independent claim |
| https://github.com/udecode/kitcn/pull/455#pullrequestreview-5124110008 | N/A: wrapper; finding ledgered inline | No independent claim |
| https://github.com/udecode/kitcn/pull/455#pullrequestreview-5124116136 | N/A: empty body | No independent claim |

Goal plan:
docs/plans/442-index-union-findmany-take-bound.md

Template:
docs/plans/templates/task.md

Primary template:
docs/plans/templates/task.md

Applied packs:
- package-api (docs/plans/templates/packs/package-api.md)

Task source:
- type: GitHub issue
- id / link: #442 https://github.com/udecode/kitcn/issues/442
- title: ORM: index-union `findMany` drops its `take()` bound entirely under RLS or a residual filter
- task type: bug (ORM read-bound regression)
- root-cause layer: `packages/kitcn/src/orm/query.ts` non-paginated multiProbe branch (~:6835-6968)
- likely files: `packages/kitcn/src/orm/query.ts`, `convex/orm/index-union-pagination.test.ts`, `.changeset/*`
- browser surface: none
- acceptance criteria:
  1. RLS + `in()` + `limit` holds an absolute read bound at two table sizes.
  2. Residual filter (`contains`) + `in()` + `limit` holds an absolute read bound at two table sizes.
  3. Returned rows and order are unchanged for every existing index-union case.
  4. No case reads MORE than it does today.
- comments: none on the issue.

Timed checkpoint:
- N/A: no duration requested.

Completion threshold:
- The two read-bound cases from the issue pass at two table sizes with a constant
  absolute bound, the full `convex/orm` vitest suite is green, `packages/kitcn`
  builds, `bun typecheck` and `bun lint` pass, a changeset exists, and autoreview
  reports no accepted findings.
- Task closure is legal only when the source-of-truth acceptance criteria are
  satisfied or explicitly narrowed, required verification evidence is recorded,
  code-review and release-artifact gates are closed when applicable, verified
  code changes are committed and PR'd unless explicitly declined or blocked,
  task-style PR body sync is complete or marked N/A with reason,
  GitHub issue/PR sync is complete or marked N/A with reason, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/442-index-union-findmany-take-bound.md` passes.

Verification surface:
- `npx vitest run convex/orm/` (owning workspace: repo root; `convex/` workspace owns ORM behavior tests)
- `bun --cwd packages/kitcn build`
- `bun typecheck`, `bun lint:fix`
- `.changeset/*.md`
- autoreview (`--mode local`)

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
- Source of truth: GitHub issue #442.
- Allowed edit scope: `packages/kitcn/src/orm/**`, `convex/orm/**` tests, `.changeset/**`, this plan.
- Browser surface: N/A (no UI or rendered output).
- GitHub issue sync: N/A until/unless a PR exists; user explicitly declined PR creation.
- Non-goals: cursor-paginated lanes (#425 already rewired them), the `orderBy`
  pushdown leg (#426), and any unrelated ORM read-bound work.

Output budget strategy:
- All `sed`/`grep` reads are line-ranged or `head`-capped. Test runs are filtered
  through `grep`/`tail`. Broad multi-file investigation was delegated to a
  Workflow whose findings return as structured digests, not raw file dumps.

Blocked condition:
- Only if the merged probe-union stream cannot preserve rows/order for a shape
  the current fan-out serves, and no guard can distinguish that shape.

Task state:
- task_type: bug
- task_complexity: non-trivial
- current_phase: verification
- current_phase_status: complete
- next_phase: closeout
- goal_status: active

Current verdict:
- verdict: fixed and verified
- confidence: 95-100%
- next owner: task
- reason: both source-listed legs now hold a constant 6-row bound at 200 and 500
  rows; the four read-bound assertions go red against unpatched `query.ts` and
  green with it; full repo suites pass.

Implementation readiness:
- verdict: ready
- exact owner: `packages/kitcn/src/orm/query.ts` non-paginated multiProbe branch (~:6835)
- contradiction status: none — source, tests, and runtime agree the bound is dropped.
- source-listed cases complete: yes (2 read-bound cases x 2 table sizes, plus a
  no-RLS/no-residual control).

Pre-solution issue challenge:
- reporter claim (falsifiable): `findMany({where:{f:{in:[a,b]}}, limit:3})` over a
  multiProbe plan reads O(table) documents when RLS is on, or when any post-filter
  is not Convex-enforceable, instead of O(limit).
- suggested diagnosis: `probeHasPostFetchMembership` / `probeHasResidualFilter`
  null `probeBound`, forcing `.collect()` per probe.
- suggested fix: route the branch through `_buildResidualFilterStream`.
- repro ladder:
  - tests / source-level repro: DONE. Scratch vitest harness with
    `countDocumentReads(...).scanned` measured 200/200 and 500/500 on the RLS leg and
    200/200 and 500/500 on the residual leg. Control (no RLS, no residual) is ~6.
  - repo-owned automated browser or integration proof: N/A (no browser surface).
  - Browser plugin: N/A.
  - screenshot / visual proof: N/A.
- reproduction verdict: reproduced
- validity verdict: valid
- best long-term fix boundary: the non-paginated multiProbe branch must size its
  read by surviving matches, through the same merged probe-union stream the
  cursor lane and single-index residual lane already use — with an explicit guard
  so a rejected union never silently degrades to an unanchored full-table scan.
- harsh honest feedback on the issue's proposed path: `_buildResidualFilterStream`
  discards `_buildPlanStream`'s `probeUnion` flag, and `_buildPlanStream` falls
  through to an UNANCHORED FULL TABLE SCAN when a probe plan's union is rejected
  (`query.ts:3116-3143`, every `withIndex` rung is gated on `!hasProbeUnionPlan`).
  Following the suggestion literally would turn a bounded 20-row probe fan-out
  into a whole-table scan whenever the union is rejected. Separately, the merged
  stream does not dedupe (`stream.ts:1075` `MergedStream`), while the current
  branch dedupes by `_id` (`query.ts:6921`) — `tryCompileOrRangeComplement`
  (`where-clause-compiler.ts:592`) can emit overlapping probes.
- hard-stop decision: proceed (valid, reproduced), with the two guards above.

Completion rule:
- Do not call `update_goal(status: complete)` while any required checklist item
  remains unchecked. If an item does not apply, check it and add `N/A: <reason>`.
- Do not call `update_goal(status: complete)` until every completion threshold
  above is satisfied, final handoff evidence is recorded, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/442-index-union-findmany-take-bound.md` passes.
- Do not create hook state for this goal. This file plus the active goal are the
  durable state.

Start Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| Timed checkpoint parsed | no | N/A: no duration requested |
| Walkthrough baseline for possible UI change | no | Before the first mutation, capture `.agents/skills/walkthrough/scripts/diff-baseline.mjs` or record N/A because UI/rendered output cannot change |
| Skill analysis before edits | yes | Loaded `task` + `autogoal`. `testing`/`tdd` not loaded: the harness is one focused read-bound test file, not a suite-design problem. `major-task` not loaded: one branch in one package, no public API change. |
| Active goal checked or created | yes | This plan |
| Source of truth read before edits | yes | `gh issue view 442` before any edit; no comments on the issue |
| Exact per-PR task ownership | yes | This plan owns exactly one PR: https://github.com/udecode/kitcn/pull/455 |
| GitHub comments and attachments read | yes | `comments: []` — none |
| Video transcript evidence required | no | N/A: issue is text only |
| Pre-solution issue challenge required | yes | See Pre-solution issue challenge; the suggested fix was tested and rejected |
| Reproduction verdict before implementation | yes | reproduced (200/200, 500/500) before any source edit |
| Repro escalation ladder selected | yes | Source-level vitest repro sufficed; no browser/native surface |
| Suggested fix reviewed against durable boundary | yes | Rejected with measured counterexamples; see Decisions and tradeoffs |
| `docs/solutions` checked for non-trivial existing-code work | no | N/A: no `docs/solutions` directory in this repo |
| TDD decision before behavior change or bug fix | yes | Red repro first, then the named regression file, then the fix; red proof re-run by stashing `query.ts` |
| Branch decision for code-changing task | yes | Renamed to `fix/orm-index-union-limit-read-bound` per user branch-naming preference while unpushed and PR-free, then pushed |
| Release artifact decision | yes | `.changeset/lucky-plums-cough.md`, patch |
| Browser tool decision for browser surface | no | N/A: ORM read path, no rendered output |
| Commit / PR expectation decision | no | N/A: explicit user decline — session user preference reads "Do not create PR under any circumstances, unless user prompts to." Verified patch left in the working tree. |
| Task-style PR body decision | yes | PR #270 emoji task-style body used |
| Task-plan PR body evidence | yes | Body line `🧭 Task plan: docs/plans/442-index-union-findmany-take-bound.md`; the plan is committed at the PR head in `d9f7b96`; it names PR #455 |
| GitHub issue sync expectation decision | yes | Sync back to issue #442 after the PR exists |
| Output budget strategy recorded | yes | See Output budget strategy |
| Package/API pack selected | yes | package-api |
| Public surface or package boundary identified | yes | `findMany` read path in `kitcn/orm`; no exported symbol, signature, or type changed |
| Convex entry/import graph impact identified | yes | None: `stream` was already imported by `query.ts`; no new module in the graph |
| CLI/scaffold/generated impact identified | no | N/A: no CLI, scaffold, or generated file touched |
| Release artifact path selected | yes | `.changeset/lucky-plums-cough.md` |
| `changeset` skill loaded when `.changeset` is required | yes | Followed `.agents/rules/changeset.mdc`: patch, `## Patches` only, user-facing bullets, no file paths |
| Package build / fixture impact decision recorded | yes | `bun --cwd packages/kitcn build` run; no `init -t` template or scaffold source touched, so `fixtures:sync` is not owed |

Work Checklist:
- [x] If a duration was requested, it is recorded as minimum active work unless N/A: no duration requested.
      explicitly marked hard stop; when no better metric exists, initial and
      final confidence scores are recorded.
- [x] Objective includes outcome, completion threshold, verification surface,
      constraints, boundaries, and blocked condition.
- [x] Task source classified with source type, id/link, title, task type,
      acceptance criteria, caveats, likely files/routes/packages, browser
      surface, and root-cause layer.
- [x] Every GitHub PR in scope has its own task plan. This plan owns one exact N/A: no PR is in scope; the user explicitly declined PR creation.
      PR, owns a not-yet-created PR slice, or records N/A because no PR is in
      scope; a batch plan is not used as a substitute.
- [x] Required video or screen-recording evidence is cached/read as normalized N/A: the issue is text only.
      `<video-transcripts>` XML, or marked N/A with reason.
- [x] For public GitHub bug reports, behavior claims, technical diagnoses, or
      suggested fixes, reporter claims are challenged before implementation
      with a recorded verdict: `valid`, `not reproduced`, `invalid`,
      `wont-fix`, `partially valid`, or `platform limitation`. Feature, docs,
      support, or cleanup requests with no bug claim may mark reproduction
      `N/A` with reason.
- [x] Repro escalation ladder followed for bug/behavior claims: focused Source-level repro reproduced it; browser/automation/visual rungs N/A (no browser surface).
      test/source-level repro first when applicable; existing repo-owned
      automated browser or integration proof next when available and useful as
      executable coverage; the repo-approved Browser tool next when tests or
      automation cannot reproduce or cannot model the surface honestly;
      screenshot or explicit visual-proof waiver when visual/native state
      matters.
- [x] Hard-stop rule followed for bug/behavior claims: no code when the issue Verdict `valid`; the issue's suggested fix was tested, disproven, and replaced with the durable boundary.
      is not reproduced, invalid, or won't-fix; partial validity pivots to the
      best long-term fix and records what was wrong or incomplete in the
      issue's proposed path.
- [x] Nearby repo instructions and implementation patterns read before edits.
- [x] Source-listed case matrix is complete and every contradiction has an
      owner, harness, and verdict before mutation.
- [x] Readiness is classified `ready`, `repair-source`, `major`, `blocked`, or `ready`.
      `invalid` with evidence.
- [x] Implementation fixes the right ownership boundary, or the narrower choice
      is recorded with reason.
- [x] Release artifact requirement recorded: active changeset, new changeset, or
      N/A with reason.
- [x] Final handoff shape decided: bug/feature/testing/batch/review/GitHub
      requirements, PR body sync, and issue sync when applicable.
- [x] Commit/PR handling recorded for code-changing work: commit and PR Explicit user decline recorded.
      completed, no local patch, user explicitly declined, or blocker recorded.
      "User did not separately ask for a PR" is not a valid blocker.
- [x] PR body shape recorded: PR #270 emoji task-style body used, N/A reason N/A: no PR created (explicit user decline).
      recorded, or blocker recorded.
- [x] PR task evidence recorded: body includes `🧭 Task plan: ...`, the plan N/A: no PR created (explicit user decline).
      exists at the PR head, and it identifies the exact PR before autoclosure.
- [x] Branch handling recorded for code-changing work: dedicated branch used, Dedicated worktree branch `fix-issue-442`; no commit made.
      new branch needed, or N/A with reason.
- [x] Local-env-rot retry policy recorded for any surprising repo-wide failure: N/A: no missing-module or resolution failure appeared.
      reinstall/rerun evidence or N/A with reason.
- [x] Workspace authority recorded: every proof command names the cwd/tool that
      owns the changed behavior.
- [x] Output budget discipline recorded and followed: broad searches are
      scoped, capped, counted, or artifacted instead of streamed into goal
      context.
- [x] High-risk note recorded for public API, runtime, package-boundary, See High-risk note.
      browser behavior, agent-action, or command-contract changes, or marked
      N/A with reason.
- [x] Review/autoreview target selected from actual diff state for non-trivial `--mode local`, run three times, clean.
      implementation work, or marked N/A with reason.
- [x] Agent-native review decision recorded for `.agents/**`, `.claude/**`, N/A: no agent-native surface touched.
      `.codex/**`, skills, hooks, commands, prompts, or user-action tooling.
- [x] Package/API pack: public API, package boundary, export, and release-artifact impact are recorded.
- [x] Package/API pack: release artifact matrix is applied: `.changeset` or explicit no-artifact reason.
- [x] Package/API pack: `.changeset` work loads `changeset` and follows its package/version/prose rules.
- [x] Package/API pack: no-artifact decisions state why the diff has no published package user-visible delta from `main`. N/A: a changeset was added.
- [x] Package/API pack: compatibility, migration, or hard-cut decision is explicit when public shape changes. N/A: no public shape changed.
- [x] Package/API pack: affected Convex static import graphs stay narrow and
      plugin/per-module boundaries are used where appropriate.
- [x] Package/API pack: CLI commands remain deterministic, `--json` capable, N/A: no CLI touched.
      and non-interactive with explicit confirmation bypass when relevant.
- [x] Package/API pack: docs and `packages/kitcn/skills/kitcn/**` stay N/A: no public guidance changed.
      current-state synchronized when public guidance changes.
- [x] Package/API pack: package-owned typecheck/build/test proof is recorded or marked N/A with reason.
- [x] Package/API pack: `packages/kitcn` build, fixture sync/check, or other owning package proof is recorded when required. `bun --cwd packages/kitcn build` run; fixture sync not owed (no scaffold source touched).

Completion Gates:
| Gate | Applies | Required action | Evidence |
|------|---------|-----------------|----------|
| Named verification threshold | yes | Run the command, proof, source audit, or artifact check named in this plan | All commands in Verification evidence run and recorded |
| Exact per-PR task ownership | yes | Recorded | One plan, one PR: #455 |
| Pre-solution issue challenge verdict | yes | Recorded | valid / reproduced; suggested fix rejected with measured counterexamples |
| Repro escalation ladder | yes | Recorded | Source-level repro reproduced it; browser/visual rungs N/A |
| Bug reproduced before fix | yes | Failing repro recorded | 200/200 and 500/500 scanned before any edit; 4 named tests red against unpatched `query.ts` |
| Targeted behavior verification | yes | Ran | `npx vitest run convex/orm/index-union-read-bound.test.ts` 10/10 |
| TypeScript or typed config changed | yes | Ran | `bun typecheck` 5/5 |
| Package exports or file layout changed | no | N/A | No export or layout change; `bun --cwd packages/kitcn build` run anyway per repo rule |
| Package manifests, lockfile, or install graph changed | no | N/A | No manifest or lockfile change |
| Agent rules or skills changed | no | N/A | No `.agents/**` or skill change |
| Workspace authority proof | yes | Recorded | All commands run from the repo root of this worktree; ORM behavior is owned by `convex/` tests and `packages/kitcn` build |
| Browser surface changed | no | N/A | ORM read path, no browser surface |
| Browser final proof | no | N/A | No browser surface |
| UI walkthrough | no | N/A | No UI or rendered output changed |
| Scaffold or fixture output changed | no | N/A | No `init -t` template or scaffold source touched. `fixtures:check` red on upstream expo drift already owned by `origin/chore/sync-drifted-scaffold-fixtures` (same `~55.0.30 -> ~55.0.31` hunk), so it is not this PR's to sync |
| Package behavior or public API changed | yes | Changeset added | `.changeset/lucky-plums-cough.md` |
| Docs and kitcn skill sync changed | no | N/A | No `www/**` doc changed; the fix restores a documented read bound rather than changing guidance |
| Docs or content changed | no | N/A | Only this plan and a changeset |
| High-risk mini gate | yes | Recorded below in High-risk note | Runtime read-path change in a published package |
| Agent-native review for agent/tooling changes | no | N/A | No agent-native surface touched |
| Local install corruption suspected | no | N/A | No missing-module or resolution failures; the only red gate is a real upstream fixture drift |
| Commit created | yes | Staged whole checkout and committed | `d9f7b96` fix(orm): bound each index-union probe by matches, not scanned rows |
| PR create or update | yes | `bun check` run, pushed, PR opened | PR #455. `check` red only on the pre-existing expo fixture drift already owned by `origin/chore/sync-drifted-scaffold-fixtures`; `test:verify` and `test:runtime` run separately and green |
| Task-style PR body verified | yes | `gh pr view 455 --json body` | Emoji issue line, task-plan line, confidence line, `Phase / 🧪 Tests / 🌐 Browser` table, bold emoji Outcome/Design/Caveat/Verified, no self-link |
| PR task evidence verified | yes | Verified | Plan line present, plan committed at PR head, plan names PR #455 |
| PR proof image hosting | no | N/A | No browser proof, no images |
| GitHub issue sync-back | yes | Comment posted on #442 | QA-facing fixed-in-PR note with verification steps |
| Final handoff contract | yes | Filled | See Final handoff contract |
| Final lint | yes | Ran | `bun lint:fix` then `bun lint` clean |
| Output budget discipline | yes | Held | All reads line-ranged or head-capped; the one 50KB workflow dump was persisted to a file and read once |
| Timed checkpoint | no | N/A | No duration requested |
| Autoreview for non-trivial implementation changes | yes | Run in `--mode local` | See Review fixes |
| Goal plan complete | yes | Run `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/442-index-union-findmany-take-bound.md` | Run at closeout; exits clean |
| Public API / package boundary proof | yes | Audited | No exported symbol, signature, type, or option changed; the diff is entirely inside one private branch of `GelRelationalQuery` |
| Convex bundle/import proof | yes | Audited | `stream` and `GenericDatabaseReader` were already imported by `query.ts`; no new static import added |
| CLI/scaffold/generated proof | no | N/A | No CLI, scaffold, or generated output touched |
| Release artifact classification | yes | Classified | Published package runtime behavior: a read bound users can observe |
| Published package changeset | yes | Added | `.changeset/lucky-plums-cough.md`, `kitcn: patch` |
| No release artifact | no | N/A | A changeset was added |
| Package typecheck/build/test | yes | Ran | `bun --cwd packages/kitcn build`; `bun test packages/kitcn/src/orm` 274/0 |
| Fixture/scaffold generation | no | N/A | No scaffold output changed; the `fixtures:check` red is upstream expo drift |
| Docs/package skill sync | no | N/A | No public guidance changed |

Phase / pass table:
| Phase | Status | Evidence | Next |
|-------|--------|----------|------|
| Intake and source read | complete | issue #442 fetched, repro measured 200/200 and 500/500 | implementation |
| Implementation | complete | query.ts +102/-41; new `convex/orm/index-union-read-bound.test.ts` | verification |
| Verification | complete | see Verification evidence | closeout |
| Commit / PR / GitHub sync | complete | User later prompted for a PR. Branch renamed `fix-issue-442` -> `fix/orm-index-union-limit-read-bound` before first push; commit `d9f7b96`; PR https://github.com/udecode/kitcn/pull/455 | final response |
| Closeout | complete | autoreview clean x3 (engine `claude`); plan gates closed | final response |

Findings:
- MergedStream (`packages/kitcn/src/orm/stream.ts:1075`) does not dedupe; it merges
  by index key only. `tryCompileOrRangeComplement`
  (`packages/kitcn/src/orm/where-clause-compiler.ts:592`) is the one compiler path
  that can emit overlapping probes (`or(lt(f,x), gt(f,y))` with `x > y`). All other
  probe shapes (`inArray`, `ne`, `notInArray`, same-field-eq `OR`) are disjoint by
  construction. The existing dedupe Map at `query.ts:6921` is therefore load-bearing.
- `_buildPlanStream` (`query.ts:3088`) gates every `withIndex` rung on
  `!hasProbeUnionPlan`, so a probe plan whose union is rejected returns an
  unanchored full-table-scan stream. Any stream routing must check the
  `probeUnion` flag, which `_buildResidualFilterStream` currently discards.
- `MAX_INDEX_UNION_PROBES = 64` (`where-clause-compiler.ts:98`).
- The sibling path `/Users/mikey/conductor/workspaces/kitcn/fix-issue-442` is a
  symlink to this same workspace, not a parallel agent's checkout.

Decisions and tradeoffs:
- REJECTED the issue's suggested fix (route the branch through
  `_buildResidualFilterStream`). Three independent judges, each of whom applied
  and measured it, showed it imports two live bugs from the merged probe-union
  stream:
  1. The merged stream commits to ONE global direction, so
     `orderBy: [asc(probedField), desc(suffix)]` returns `a10,a20,a30,b1` where
     the fan-out returns the correct `a30,a20,a10,b3`.
  2. `MergedStream` never dedupes, so overlapping `or(lt, gt)` probes return the
     same document twice and short-fill the page.
  It also leaves #442 live for `in` with 65+ values, where the union is declined
  and the code falls back to the unchanged `.collect()`.
- CHOSEN boundary: keep the per-probe fan-out, the `_id` dedupe, the JS sort and
  the offset/limit slice; replace only the per-probe `.collect()` with a per-probe
  STREAM whose `filterWith` makes `take()` size by survivors.
  Soundness: truncating a probe needs order only WITHIN that probe, which
  `orderPushdownDirection !== null` already proves, and the global top-k is
  contained in the union of the per-probe top-k. The merged stream needs the
  strictly stronger global-order property, which is why it is the wrong
  mechanism for a non-paginated `limit` (cursor pagination genuinely needs it,
  because a Convex cursor IS a serialized index key).
- Split `probeBound` (is a bound legal at all — order only) from
  `probeBoundedTake` (may a plain scanned-row `take()` carry it). A residual
  filter or a post-fetch membership pass no longer cancels the bound; it moves
  the read onto a stream.
- Kept `_applyRlsSelectFilter(rows, ...)` unconditional. It is idempotent over
  the memoized policy resolution and is the only call reaching the
  policy-configuration assertion, which must fire on an empty result too.
- Skipped the batch `_applyRelationsFilterToRows` when the stream ran, mirroring
  `if (!residualLimitStream)` in the single-index lane: the first pass already
  stripped the filter-only relations, so a second pass reloads one index query
  per relation per surviving row.
- Deliberately did NOT bundle four adjacent defects the analysis surfaced. Each
  is on a different lane with a different blast radius and needs its own PR:
  (a) `_buildResidualFilterStream` discards `_buildPlanStream`'s `probeUnion`
      flag (query.ts:3243), the only member of that family to do so;
  (b) the non-paginated pipeline lane computes `rejectedProbeUnion` under
      `isCursorPaginated &&` (query.ts:6203) but assigns the stream
      unconditionally (query.ts:6217), so a wide `in` already takes an
      unanchored table scan today;
  (c) the cursor lane returns duplicate rows for overlapping `or(lt, gt)`
      probes on `main` today — fixable in `tryCompileOrRangeComplement`, which
      has `compareIndexValues` in hand and should decline non-disjoint bounds;
  (d) the single-index residual lane misses the empty-result RLS
      policy-configuration assertion.
  This change touches no shared helper and removes no path, so all four stay
  exactly as reachable and as fixable afterwards.

Implementation notes:
- `packages/kitcn/src/orm/query.ts`, 102 insertions / 41 deletions, one branch.
  1. Hoisted `matchesPostFetchMembership` above the multiProbe branch. Mandatory,
     not cosmetic: it was declared after the branch closes, in the same function
     body, so referencing it from inside would be a TDZ `ReferenceError`.
  2. `probeBound` now cancels only on an unservable order.
  3. Added `probeBoundedTake` (plain scanned-row `take()`) and `probeStreamed`
     (per-probe stream), plus a `probeSchemaDefinition` guard so a project
     without `defineSchema()` keeps today's `.collect()`.
  4. Streamed arm reads the same index, same range, same direction, with all
     `postFilters` and `matchesPostFetchMembership` in `filterWith`.
  5. `if (whereFilter && !probeStreamed)` on the batch relation pass.
- Accepted, not introduced (identical in the single-index lane, so the two stay
  symmetric): the streamed arm trades the Convex `.filter()` pushdown for JS
  `filterWith` (same document reads, more CPU on non-matching rows); per-row
  membership cannot trip `relationFanOutMaxKeys` and loses batch dedupe for
  `one` relations whose target is not `_id`.

Review fixes:
- PR #455 review, `@chatgpt-codex-connector` P2 "Batch relation membership checks
  before streaming" (`query.ts:6963`, thread `PRRT_kwDOPTlS686fo_Vz`).
  VERDICT: real, narrower than reported, already owned by open PR #448 — replied,
  not patched here.
  - Triage: per-row `matchesPostFetchMembership` defeats `_loadOneRelation`'s
    `sourceKeyMap` dedupe only on the `_queryByFields(...).first()` path
    (`query.ts:8490-8497`). A `one` relation targeting `_id` takes `_getById` ->
    `_documentByNormalizedId` (`query.ts:670`, `7788-7811`), an execution-scoped
    memo whose docstring says it exists for exactly this per-row membership case.
  - Measured, one shared group failing the relation filter, `limit: 3`, two probes,
    `reads.scanned`:
    | relation target | rows | main | this PR | this PR + #448 |
    | --- | --- | --- | --- | --- |
    | non-`_id` | 60 | 61 | 120 | 61 |
    | non-`_id` | 120 | 121 | 240 | 121 |
    | `_id` | 60 | 61 | 61 | 61 |
    | `_id` | 120 | 121 | 121 | 121 |
  - Not fixed here: PR #448 "memoize non-`_id` relation target reads per
    execution" already fixes it at the owner boundary. Verified by merging
    `origin/fix/orm-non-id-relation-target-memo` onto this branch in a scratch
    branch: auto-merge with no conflict in `_loadOneRelation`, combined
    measurement 61/121, and all 24 index-union tests still pass. Duplicating the
    memo would mean two copies of one policy and a guaranteed conflict.
  - SUPERSEDED by the P1 fix below: the relation leg no longer streams at all, so
    the batch is restored and the #448 merge-order dependency is gone. Re-measured
    61/121 on both targets. Thread resolved.
- PR #455 review, `@chatgpt-codex-connector` P1 "Preserve the relation fan-out cap
  while streaming" (`query.ts:6963`, thread `PRRT_kwDOPTlS686fpCTE`).
  VERDICT: real, and a removed safety check rather than a cost regression.
  ACCEPTED and FIXED in `b32ee75`.
  - Triage: `_enforceRelationFanOutKeyCap` (`query.ts:7837-7861`) returns early on
    `keyCount <= cap`, and a per-row `_applyRelationsFilterToRows` always passes
    `keyCount` 1, so the guard can never fire. Correctly noted as NOT covered by
    #448's memo: the keys are all distinct.
  - Measured, `relationFanOutMaxKeys: 5`, 40 distinct non-matching owners,
    `limit: 3`, two probes:
    | | outcome | scanned |
    | --- | --- | --- |
    | main | throws `... source lookup keys (40) exceed relationFanOutMaxKeys (5)` | 40 |
    | this PR before the fix | no throw, 0 rows | 80 |
  - Fix chosen: exclude a relation `where` from `probeStreamed` via
    `!probeHasRelationMembership`, rather than rebuilding the cap in this branch.
    Rationale: the cap and `_loadOneRelation`'s key dedupe are properties of the
    relation loader, and the identical per-row shape already exists on the
    single-index residual lane (`query.ts:7344-7355`), so an execution-scoped key
    ledger belongs there where it fixes both callers. Rebuilding it here would be
    a second copy of the policy. It also returns the PR to exactly the two legs
    #442 reports.
  - Pinned: `an index union filtered by a relation keeps the batch relation pass`
    asserts the 40-keys-against-cap-5 case still throws. Verified it goes red when
    the `!probeHasRelationMembership` term is removed.
  - Changeset and PR body updated: the relation leg is now listed as deliberately
    unaffected, not as fixed. Thread resolved.
- PR #455 review, `@chatgpt-codex-connector` P1 "Replace internal planner notes
  with a release outcome" (`.changeset/lucky-plums-cough.md:18-20`, thread
  `PRRT_kwDOPTlS686fpHPK`). VERDICT: valid. ACCEPTED and FIXED in `6648607`,
  applied to all four bullets because the same `.agents/rules/changeset.mdc` §4
  rules were broken throughout, not only on the flagged lines.
  - Action-verb starts: `Keep`/`Size`/`The bound also holds` -> `Fix`/`Improve`/`Support`.
  - Private planner detail removed: `64-probe merge cap` -> "an `in` list of any
    length"; the per-probe assembly and "rows the scan touched" clauses dropped.
    Kept the observable query shape and the document counts, which match the
    shipped 0.32.1 tone ("2 document reads instead of 62").
  - One outcome per bullet: the flagged bullet was split from its mechanism clause.
  - Caught a factual error while rewriting: the old second bullet implied the
    previous behavior returned an empty page. Measured — 80 rows hidden by RLS in
    front of the matches, `limit: 3`: main returns 3 rows scanning 200, this PR
    returns 3 rows scanning 86. The bullet now states that correctly.
  - Deliberate deviation recorded: the closing "unchanged" bullet keeps no action
    verb, mirroring the shipped 0.32.1 entry's own closing caveat bullet, per rule
    §0 "always mirror `packages/kitcn/CHANGELOG.md` tone and structure". Offered to
    reword in the reply. Thread resolved.
- autoreview (`--mode local`, engine `claude`, model `claude-fable-5`) run twice.
  First run: `autoreview clean: no accepted/actionable findings`, overall
  `patch is correct (0.72)`. The default Codex engine failed to start in this
  environment (`codex engine failed (1)`), which is a known local account/gateway
  issue, so the review ran on the Claude engine.
- ACCEPTED a sub-threshold note from the first run: no test exercised the
  relation-`where` leg of `probeHasPostFetchMembership`, which is the third
  condition the change re-routes. Added "an index union filtered by a relation
  keeps its limit bound" and a `bound_docs.owner` / `bound_open_docs.owner`
  relation to the test schema.
- Honest scope note on that leg: the bound is constant when the relation
  predicate matches inside every probe. A probe in which nothing matches is
  still drained to prove it is empty, which is inherent to the predicate rather
  than to this change; before the fix every probe was collected regardless.
- Second run after the test addition: `autoreview clean: no accepted/actionable
  findings`, overall `patch is correct (0.72)`.

Error attempts:
| Error / failed attempt | Count | Next different move | Resolution |
|------------------------|-------|---------------------|------------|
| None yet | 0 | | |

Verification evidence:
- cwd for every command below: `/Users/mikey/conductor/workspaces/kitcn/minnetonka`
  (repo root). The `convex/` workspace owns ORM behavior tests.
- `npx vitest run convex/orm/index-union-read-bound.test.ts` -> 11 passed (after
  the review fix; the relation case is now an exclusion pin, not a bound claim).
- RED PROOF: with `packages/kitcn/src/orm/query.ts` stashed back to `main`, the
  same file reports 4 failed / 6 passed — the RLS leg, the residual leg, the
  match-counted bound, and the >64-probe bound. The order, dedupe, offset,
  no-schema and control tests pass on both sides, which is what makes them
  behavior-preservation guards rather than new behavior.
- `npx vitest run convex/orm` -> 39 files, 554 passed, 14 skipped, 0 failed.
- `npx vitest run` (full) -> 93 files, 992 passed, 14 skipped, 0 failed.
- `bun test packages/kitcn/src/orm` -> 274 pass / 0 fail. Run explicitly because
  `convex-filter-depth.test.ts` runs under `bun test`, not vitest, and drives this
  branch through a stub db with no `stream()` support.
- `bun check` -> `bun lint` clean, `bun typecheck` 5/5, `bun test` 1400 pass / 0
  fail, `vitest` 991 pass, `test:cli` 124 pass / 0 fail, `test:concave` pass.
  `fixtures:check` FAILED on upstream drift only: the expo fixture pins
  `expo ~55.0.30` and the resolver produced `~55.0.31`. Not reachable from this
  diff, which touches `packages/kitcn/src/orm/query.ts`, one `convex/orm` test,
  a changeset and this plan — none of which feed an Expo dependency pin. Proven
  pre-existing and already owned: `git diff origin/main...origin/chore/sync-drifted-scaffold-fixtures`
  contains the identical `-"expo": "~55.0.30" / +"expo": "~55.0.31"` hunk.
- `bun run test:verify` -> exit 0 (scaffolds `create-convex-bare`, `kitcn verify`).
- `bun run test:runtime` -> exit 0 (`create-convex-react-vite-shadcn` scenario).
- `bun --cwd packages/kitcn build` -> 74 files, build complete.
- `bun typecheck` -> 5/5 successful.
- `bun lint:fix` then `bun lint` -> clean.

Source-listed case matrix:
| Case | Source claim | Harness | Before | Expected after | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| RLS + `in` + `limit`, 200 rows | scanned 500 (table-sized) | `index-union-read-bound.test.ts` "an index union under RLS keeps its limit bound as the table grows" | scanned 200 | constant bound | scanned 6 | fixed |
| RLS + `in` + `limit`, 500 rows | same | same test | scanned 500 | same constant | scanned 6 | fixed |
| residual `contains` + `in` + `limit`, 200 rows | scanned 500 | "an index union with a residual filter keeps its limit bound as the table grows" | scanned 200 | constant bound | scanned 6 | fixed |
| residual `contains` + `in` + `limit`, 500 rows | same | same test | scanned 500 | same constant | scanned 6 | fixed |
| control: no RLS, no residual | scanned 6 | "an index union with no post-fetch pass keeps its plain take bound" | 6 | 6 | 6 | unchanged |
| bound counts matches, not scans | not in issue; required by the fix | "the bound counts visible matches, not scanned rows" | 200 scanned, page fills | <=90 scanned, page fills | 3 rows, bounded | new guard |
| >64 probes under RLS | not in issue; the union-decline case | "an index union wider than the probe cap stays bounded under RLS" | 390 scanned | <=130 | bounded | fixed |
| cross-probe order `[asc(ownerId), desc(score)]` | not in issue | "an index union under RLS assembles its page across probes" | `a30,a20,a10,b3` | unchanged | unchanged | preserved |
| order no index serves | not in issue | "an index union with an order no index serves reads unbounded but correct" | first three by label | unchanged | unchanged | preserved |
| overlapping `or(lt,gt)` probes | not in issue | "overlapping range probes under RLS return distinct rows" | 8 distinct | unchanged | 8 distinct | preserved |
| offset under RLS | not in issue | "offset over an index union skips visible matches" | counts visible matches | unchanged | unchanged | preserved |
| no `defineSchema()` | not in issue | "an index union without a schema definition still returns the right page" | collect fallback | unchanged | unchanged | preserved |
| relation `where` + `in` + `limit` | not in issue | "an index union filtered by a relation keeps the batch relation pass" | collect + batch pass, fan-out cap fires | unchanged | 40 keys vs cap 5 still throws; non-`_id` target 61/121 same as main | deliberately unchanged |

High-risk note (runtime / published package):
- Realistic failure mode: a probe truncated in an order it does not actually read
  in, returning a wrong page silently. Guarded by keeping the order condition on
  `probeBound` verbatim, and pinned by three order tests that assert the exact
  pages a globally-ordered read cannot produce.
- Second failure mode: a project without `defineSchema()` losing its only working
  multiProbe execution. Guarded by `probeSchemaDefinition` and pinned by
  "an index union without a schema definition still returns the right page".
- Why this boundary is right: the branch already owned this decision; the bug was
  that one variable conflated "is a bound legal" with "can a plain scanned-row
  `take()` carry it". Splitting those two is the smallest change that makes the
  invariant explicit, and it strictly widens the set of shapes that hold a bound.

Final handoff contract:
- Commit line: `d9f7b96` on `fix/orm-index-union-limit-read-bound`.
- PR line: https://github.com/udecode/kitcn/pull/455
- Issue line: synced back to #442 with a QA-facing fixed-in-PR note.
- Confidence line: 95-100%
- Flow table:
  - Reproduced: tests 🔴 (4 read-bound assertions red against unpatched query.ts), browser ➖ N/A
  - Verified: tests 🟢 (10/10 new; 991 vitest; 1400 bun; 274 package), browser ➖ N/A
- Browser check: N/A — ORM read path, no rendered output.
- Outcome: the non-paginated index-union `findMany` keeps its `take()` bound
  under RLS and under a residual filter — 6 scanned at 200 and 500 rows, was
  200 and 500 — and now also holds a bound for unions wider than the 64-probe
  merge cap.
- Caveat: `ne`/`notIn`/`isNotNull` with an `orderBy` no index can serve still
  collect their whole complement range; that is the opposite cost regime and
  needs its own decision. `fixtures:check` is red on upstream expo drift.
- Design:
  - Chosen boundary: keep the per-probe fan-out and read each probe as a bounded
    stream, so `take()` counts survivors instead of scanned rows.
  - Why not quick patch: the issue's suggested `_buildResidualFilterStream`
    route was implemented and measured; it returns wrong pages on mixed-direction
    sorts, duplicate rows on overlapping probes, and leaves #442 live above 64
    probes.
  - Why not broader change: the four adjacent defects it exposed each live on a
    different lane; bundling them would turn a bounded change into an untested
    rewrite of the plan-stream family.
- Verified: see Verification evidence.
- PR body verified: `gh pr view 455 --json body` — PR #270 emoji task-style shape confirmed.

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
- Commit: `d9f7b96`
- PR: https://github.com/udecode/kitcn/pull/455
- Issue: #442 synced
- Browser proof: N/A (no browser surface)
- Caveats: complement shapes uncovered; `fixtures:check` red on upstream expo drift

Timeline:
- 2026-09-06T01:59:36.146Z Task goal plan created.

Reboot status:
| Question | Answer |
|----------|--------|
| Where am I? | Verification complete, closeout |
| Where am I going? | Implementation, verification, commit/PR/GitHub sync, closeout |
| What is the goal? | Restore the non-paginated index-union `findMany` read bound under RLS and residual filters |
| What have I learned? | See Findings |
| What have I done? | See Timeline |

Open risks:
- A `where` that filters through a relation is NOT covered, deliberately: both
  guards that bound a relation load (`_enforceRelationFanOutKeyCap` and
  `_loadOneRelation`'s source-key dedupe) are batch-scoped, and a per-row caller
  neutralizes them. Restoring them needs an execution-scoped key ledger inside the
  relation loader, which would also repair the single-index residual lane. Filed
  as a follow-up, not bundled.
- `ne` / `notIn` / `isNotNull` combined with an `orderBy` no index can serve are
  NOT covered: `buildComplementProbeFilters` emits only `lt`/`gt` ranges, so the
  eq-prefix is 0, `orderPushdownDirection` is null, and the order guard correctly
  keeps them on `.collect()`. `{status: {ne: 'archived'}}, orderBy: {createdAt},
  limit: 20` on a 200k-row table still collects ~199k. That is the opposite cost
  regime (a filtered scan would read ~20) and needs its own decision. Stated in
  the changeset so it is not mistaken for covered.
- `fixtures:check` is red on upstream expo drift, independent of this diff.

Hard closeout guard:
- A local-only final response for verified code-changing work is invalid unless
  this plan records an explicit user decline, no local patch, analytical/
  blocked/inconclusive outcome, or a real commit/PR blocker.
