# Keep a compiled index union index-bounded on the select() pipeline path

Objective:
A compiled index-union plan must stay index-bounded on the `select()` pipeline path. Today a union declined by probe width degrades to a full table scan there while `findMany` answers the same query from its probes.

Current closeout requirements (2026-09-07):
- Dedicated resumed `task` and `autoclosure` for exactly #456, using the
  current root checkout /Users/zbeyens/git/better-convex. No worktrees, parallel
  agents, timebox, or new product scope. Historical completion claims below
  are superseded until fresh closeout gates pass.
- User goal: close #448-#456 with per-PR evidence, passing checks, zero
  actionable P1, then recheck #430. Latest "never ask, just go" authorizes
  bounded repairs; P2 may be deferred explicitly. #455 merged at a73de28b,
  release workflow 34138573524 and Release job verified skipped. Seven of nine
  PRs merged; #452 rollout remains held, not silently waived.
- Whole-checkout commit/push, PR updates, quoted replies, resolutions and admin
  merge authorized. Disable auto release, merge with `[skip release]`, verify
  release skipped; never merge Version Packages.
- Compliance passed: one exact body plan line, this full plan at refs/pr/456
  identifies #456. HEAD = fetched ref = live
  65002eebdcb4f197ed00b4d2049f93372c48f63a before source/feedback triage.
- Initial proof at that published head: 22/22 index-union pagination tests
  passed, /tmp/kitcn-pr456-initial-proof.log. Prior red cases remain in the
  source plan; fresh integration proof is still required.
- Full helper: 5 unresolved threads, 1 comment, 4 review bodies. Unfiltered:
  5 unresolved threads (1 outdated), 8 inline comments, 2 top-level comments,
  7 review bodies; all thread/nested pages exhausted. Every item read in full.
  Four P1 threads and one P2 thread received source-backed dispositions below.
- Scope owner: `_buildProbeUnionStream`, compiler promotion and internal
  `concatStreams`; preserve index order, disjointness, cursor narrowing, limits,
  RLS and relation fan-out safety. Main now includes #455's per-probe filtered
  reads; reconcile that canonical implementation with this branch's separate
  residual-union helper, rather than retain competing or dead readers.
- Package/skill/docs owners are touched: keep the published ORM reference,
  generated local copy and www pagination page synchronized. Use agent-native
  review and verify the rendered docs. User waived walkthrough only; the old
  plan's blanket no-rendered-output classification is not a waiver.
- All three changeset-prose P1s need approved action-led public outcomes,
  retained Before/After example and no private executor narrative. Fresh P1
  replay and helper/raw inventory after each material push, followed by an
  exact-head external receipt, CI and merge/read-back. No completion claim yet.
- Active batch goal remains externally blocked; execute the user continuation
  without inventing a lifecycle transition. Logs in /tmp, named source ranges
  only. Truncated plan output was repaired by reading lines 300-410 separately.

Current feedback ledger:

Integration evidence (2026-09-07, supersedes historical closeout below):
- Merged origin/main a73de28b into this task branch. The only conflict was
  the non-cursor multi-probe reader; retained #455's per-probe filterWith/take
  owner. Removed `_takeResidualProbeUnion` and its unreachable caller: its
  limit/order predicate already guarantees probeBound is defined after #455.
  No new API, configuration or relation/RLS contract introduced.
- Fresh tests: 132 passed/1 skipped across index-union pagination, pipeline,
  pagination, stream and where-filtering; 11/11 index-union-read-bound;
  29/29 compiler tests including wide raw Date ordering in both directions
  and timestamp-string overlap after normalization. Logs:
  /tmp/kitcn-pr456-integration-tests.log,
  /tmp/kitcn-pr456-bound-compiler-tests.log,
  /tmp/kitcn-pr456-compiler-tests.log.
- Typecheck, package build, lint:fix and full bun check passed: 1423 Bun,
  1047 Vitest, 124 CLI, all eight fixtures, verify and runtime. Independent
  P0/P1 autoreview of ea939a49 against origin/main passed with no findings
  (codex gpt-5.6-sol high, 0.9 confidence; /tmp/kitcn-pr456-review.*).
  Published-head replay passed at 1a5aa73d; final plan push requires another
  replay and external receipt. CI and merge are external delivery guards.
- Deslop: removed the dead competing reader and shortened temporal rationale.
  Delta scan's other query catches and insert/update/delete findings are
  unchanged from origin/main and outside this patch; no adjacent cleanup.
- Agent-native capability map: public findMany/select indexed filtering maps
  to published references/features/orm.md, discoverable from SKILL.md lines
  170/278/297/485. Docs source is pagination.mdx / Index-union filters, reached
  through docs/meta.json and orm/queries/meta.json. Classification: advanced
  resource; no parity blocks dropped and no setup/core expansion.
- Regenerated the local skill via tooling/sync-kitcn-skill.ts; cmp confirms
  exact equality. No stale setup references, legacy API examples or setup
  leakage; the only legacy-token hits are the check's own doc-guidelines.
  `bunx intent validate skills` and `bunx intent stale` both failed to launch:
  `could not determine executable to run for package intent`. Manual mapping,
  discoverability and generated-copy checks above passed; do not claim intent
  validation passed or modify workflow/dependency scope to bypass it. Further
  source-backed check: packages/kitcn/bin/intent.js invokes intent-library,
  which exposes only list/install; direct validate/stale both exit 1 with that
  usage. This is an unavailable command contract, not an unexamined retry.
- Browser loaded http://localhost:3017/docs/orm/queries/pagination, title
  Pagination. Rendered Index-union filters includes the 64-range boundary,
  index-order-only wide union and maxScan exception for cross-value sorting.
  Hosted Browser proof also passed; Vercel dpl_Hev5UXAXL3KkfxHZXXG8pGmo8w72
  is READY at exact head 1a5aa73dc9dc377492b94192427ae07ea5d47644.
- All six changeset bullets begin with Fix, Improve or Support and describe
  public outcomes; retained the required Before/After paging example.

| URL | Priority and rationale | Current disposition |
| --- | --- | --- |
| https://github.com/udecode/kitcn/pull/456#discussion_r3942889621 | P1: promoted residual unions eagerly read a common-status population | Fixed-differently: canonical per-probe filterWith before take; 400-row bound/global-top-k/RLS/fan-out tests pass; replied and resolved |
| https://github.com/udecode/kitcn/pull/456#discussion_r3942910998 | N/A: prior implementation reply and measured claim | Verify current source, not reply alone |
| https://github.com/udecode/kitcn/pull/456#discussion_r3942889623 | P2: temporal bounds must match stored index representation | Hardening verified: raw Date ordering and normalized overlap tests pass; replied and resolved; no public failure claimed |
| https://github.com/udecode/kitcn/pull/456#discussion_r3942911517 | N/A: prior source-backed hardening reply | No independent request; verify current normalization |
| https://github.com/udecode/kitcn/pull/456#discussion_r3942920540 | P1: patch note exposes private executor details and lacks allowed verb | Fixed: six approved-verb public outcomes; published artifact audit passed; replied and resolved |
| https://github.com/udecode/kitcn/pull/456#discussion_r3942929806 | N/A: prior prose reply | Superseded by approved-verb rewrite and fresh artifact proof |
| https://github.com/udecode/kitcn/pull/456#discussion_r3942937129 | P1: breaking bullet starts A long rather than allowed action verb | Fixed: Support-led bullet, Before/After preserved; replied and resolved |
| https://github.com/udecode/kitcn/pull/456#discussion_r3942993902 | P1: remaining Keep/Require bullets violate allowed-verb contract | Fixed: both Support-led; approved-verb audit passed; replied and resolved |
| https://github.com/udecode/kitcn/pull/456#issuecomment-5556763900 | N/A: changeset status only | Verify final artifact/head |
| https://github.com/udecode/kitcn/pull/456#issuecomment-5556763958 | N/A: deployment status only | Refresh final hosted check |
| https://github.com/udecode/kitcn/pull/456#pullrequestreview-5124068617 | N/A: review wrapper | Inline findings ledgered separately |
| https://github.com/udecode/kitcn/pull/456#pullrequestreview-5124089368 | N/A: empty reply review | No independent claim |
| https://github.com/udecode/kitcn/pull/456#pullrequestreview-5124089814 | N/A: empty reply review | No independent claim |
| https://github.com/udecode/kitcn/pull/456#pullrequestreview-5124098264 | N/A: review wrapper | Inline findings ledgered separately |
| https://github.com/udecode/kitcn/pull/456#pullrequestreview-5124106907 | N/A: empty reply review | No independent claim |
| https://github.com/udecode/kitcn/pull/456#pullrequestreview-5124113819 | N/A: review wrapper | Inline findings ledgered separately |
| https://github.com/udecode/kitcn/pull/456#pullrequestreview-5124179018 | N/A: review wrapper | Inline findings ledgered separately |
| https://github.com/udecode/kitcn/pull/456#discussion_r3951208476 | N/A: fresh quoted P1 proof reply | Exact body read back; 143 published-head query tests pass |
| https://github.com/udecode/kitcn/pull/456#discussion_r3951208626 | N/A: fresh quoted P2 hardening reply | Exact body read back; 29 compiler tests pass |
| https://github.com/udecode/kitcn/pull/456#discussion_r3951208752 | N/A: fresh quoted changeset reply | Exact body read back; artifact audit passes |
| https://github.com/udecode/kitcn/pull/456#discussion_r3951208941 | N/A: fresh quoted breaking-bullet reply | Exact body read back; artifact audit passes |
| https://github.com/udecode/kitcn/pull/456#discussion_r3951209125 | N/A: fresh quoted remaining-bullets reply | Exact body read back; artifact audit passes |
| https://github.com/udecode/kitcn/pull/456#issuecomment-5573044280 | N/A: hosted review quota notice | No source finding; independent autoreview passed |
| https://github.com/udecode/kitcn/pull/456#pullrequestreview-5133758396 | N/A: empty reply review | No independent finding |
| https://github.com/udecode/kitcn/pull/456#pullrequestreview-5133758572 | N/A: empty reply review | No independent finding |
| https://github.com/udecode/kitcn/pull/456#pullrequestreview-5133758811 | N/A: empty reply review | No independent finding |
| https://github.com/udecode/kitcn/pull/456#pullrequestreview-5133758983 | N/A: empty reply review | No independent finding |
| https://github.com/udecode/kitcn/pull/456#pullrequestreview-5133759219 | N/A: empty reply review | No independent finding |
| https://github.com/udecode/kitcn/pull/456#issuecomment-5573087915 | N/A: verified first-head receipt | Exact body/OID and post-receipt inventories verified; superseded after final plan push |

Final versioned evidence snapshot:
- Exact first published head: 1a5aa73dc9dc377492b94192427ae07ea5d47644.
  Post-push 143 Vitest plus 29 Bun and all four P1 artifact/behavior checks
  passed. Five threads are resolved (three outdated), thirteen inline comments,
  four top-level comments and twelve review bodies; helper 0/3/4. Every page
  exhausted; post-receipt raw threads/reviews unchanged, only verified receipt
  added. Zero actionable P0/P1 and no deferred P2.
- This plan update records actual proof, not a merge claim. Before merge:
  push all final plan changes, rerun every P1 proof, bind local/fetched/live
  OIDs, post and read a superseding exact-head external receipt, repeat full
  helper/raw inventory, require final-head CI success, then squash with
  [skip release] and verify merge/release-job state. No receipt-only plan push.

Goal plan:
docs/plans/445-index-union-bounded-on-pipeline-path.md

Template:
docs/plans/templates/task.md

Primary template:
docs/plans/templates/task.md

Applied packs:
- package-api (docs/plans/templates/packs/package-api.md)

Task source:
- type: GitHub issue
- id / link: #445 — https://github.com/zbeyens/kitcn/issues/445
- title: ORM: declined index-union on the non-cursor `select()` path anchors no
  index, with no guard and no available bound
- acceptance criteria: a `select()` pipeline read whose `where` compiles to an
  index union must not walk the whole table; its read cost must track the probe
  ranges the way `findMany` already does.
- task type: bug (ORM query planner / read bounds)
- likely files: `packages/kitcn/src/orm/query.ts`,
  `packages/kitcn/src/orm/stream.ts`,
  `packages/kitcn/src/orm/where-clause-compiler.ts`
- browser surface: none (server-side ORM read planning)
- root-cause layer: query executor — the pipeline path has one union executor
  (`mergedStream`) and no fallback when it declines.

Timed checkpoint:
- requested duration: N/A — no duration requested.
- semantics: N/A
- initial confidence score: N/A
- improvement loop: N/A
- final score / loop closure: N/A

Completion threshold:
- A non-cursor `select()` pipeline read over a compiled index union of any
  probe width reads O(matches + non-empty probes) documents, not O(table), and
  a regression test asserts that with `countDocumentReads(...).scanned`.
- Existing index-union, pipeline, and pagination suites stay green.
- Task closure is legal only when the source-of-truth acceptance criteria are
  satisfied or explicitly narrowed, required verification evidence is recorded,
  code-review and release-artifact gates are closed when applicable, verified
  code changes are committed and PR'd unless explicitly declined or blocked,
  task-style PR body sync is complete or marked N/A with reason,
  GitHub issue/PR sync is complete or marked N/A with reason, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/445-index-union-bounded-on-pipeline-path.md` passes.

Verification surface:
- `bunx vitest run convex/orm/index-union-pagination.test.ts convex/orm/pipeline.test.ts convex/orm/pagination.test.ts convex/orm/stream.test.ts convex/orm/where-filtering.test.ts` (cwd: repo root)
- `bun typecheck`, `bun lint:fix`, `bun --cwd packages/kitcn build`
- `bun run test` for the broader suite
- `.changeset/*.md` entry for the published `kitcn` behavior change

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
- Source of truth: GitHub issue #445 plus the ORM source it names.
- Allowed edit scope: `packages/kitcn/src/orm/**`, `convex/orm/**` tests,
  `.changeset/**`, this plan, and `www/**` + `packages/kitcn/skills/kitcn/**`
  only if public guidance changes.
- Browser surface: N/A — no rendered output.
- GitHub issue sync: PR #456 (https://github.com/udecode/kitcn/pull/456)
  closes #445 via `Fixes #445`, so the issue syncs on merge.
- Non-goals: reworking pipeline `orderBy` semantics (documented as
  "stream-backed index order"); adding a non-cursor `maxScan` public API;
  changing `MAX_INDEX_UNION_PROBES` itself.

Output budget strategy:
- Read the two named ORM files by targeted range instead of whole-file dumps.
- Run vitest per test file, piping through `tail`.
- Delegate broad adversarial design review to a Workflow that returns a
  structured verdict list, not raw transcripts.

Blocked condition:
- A design objection that shows the concatenated union can emit duplicate or
  mis-ordered rows and cannot be proven safe would stop implementation and
  force the narrower guard-only fix.

Task state:
- task_type: bug
- task_complexity: non-trivial
- current_phase: closeout
- current_phase_status: in_progress
- next_phase: final response
- goal_status: active

Current verdict:
- verdict: valid — reproduced at the source level
- confidence: 95-100%
- next owner: task
- reason: the read-cost gap reproduces on the `scanned` counter, the fix is
  implemented at the executor boundary, and the full suite is green.

Implementation readiness:
- verdict: ready
- exact owner: `_buildProbeUnionStream` in `packages/kitcn/src/orm/query.ts` —
  the single place that decides how a compiled union is executed as a stream.
- contradiction status: one resolved. The issue says a declined union should
  "fall through to the ordinary index rungs"; the source shows every multiProbe
  compiler emits `indexFilters: []`, so that rung is a rangeless full index
  scan and bounds nothing. The suggested fix was discarded.
- source-listed cases complete: yes — see the case matrix.

Pre-solution issue challenge:
- reporter claim: a non-cursor `select()` read over a 65-value `in` reads 120
  documents where the equivalent `findMany` reads 1, because `_buildPlanStream`
  anchors no index when the index union is declined; there is no strict guard
  and `maxScan` is unreachable on that path.
- suggested diagnosis or fix: let the declined case fall through to the
  ordinary index rungs, then either extend the `rejectedProbeUnion` guard to
  the non-cursor path or make `maxScan` reachable there.
- repro ladder:
  - tests / source-level repro: reproduced. A scratch vitest against the real
    ORM measured `scanned = 120` for the pipeline read and `scanned = 1` for
    the `findMany` read on a 120-row table with one match.
  - repo-owned automated browser or integration proof: N/A — server-side read
    planning has no browser surface.
  - Browser plugin: N/A.
  - screenshot / visual proof: N/A — no rendered output.
- reproduction verdict: reproduced
- validity verdict: partially valid
- best long-term fix boundary: the union **executor**, not the fallback rungs.
  The pipeline path had exactly one way to run a compiled union (a merged
  stream that holds every probe open at once, hence the 64-probe cap) while
  `findMany` has a second, uncapped way (independent per-probe reads). Giving
  the stream path a second executor — a *concatenated* union over probes proven
  to be disjoint ordered ranges on the index's leading field — removes the
  decline instead of decorating it.
- harsh honest feedback: three parts of the issue do not survive the source.
  (1) The suggested fall-through bounds nothing: a multiProbe plan carries no
  index filters, so anchoring its index is a rangeless full index scan that
  costs the same as the creation-time scan and silently changes row order.
  (2) `maxScan` is cursor-only by design; non-cursor reads are sized by
  `limit`/`defaultLimit`, not by a scan budget, so "make `maxScan` reachable"
  would invent a new public knob to paper over a planner gap.
  (3) The 120-vs-1 headline undersells the bug: it is not a pipeline-only
  quirk, it is the executor asymmetry, and the same gap makes wide unions fail
  outright on the cursor path with a `maxScan` demand.
- hard-stop decision: proceed — reproduced and valid, with the suggested fix
  replaced by the executor fix.

Completion rule:
- Do not call `update_goal(status: complete)` while any required checklist item
  remains unchecked. If an item does not apply, check it and add `N/A: <reason>`.
- Do not call `update_goal(status: complete)` until every completion threshold
  above is satisfied, final handoff evidence is recorded, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/445-index-union-bounded-on-pipeline-path.md` passes.
- Do not create hook state for this goal. This file plus the active goal are the
  durable state.

Start Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| Timed checkpoint parsed | no | N/A: no duration requested |
| Walkthrough baseline for possible UI change | no | N/A: server-side ORM read planning, no UI or rendered output |
| Skill analysis before edits | yes | task + autogoal (task template, package-api pack) + changeset + autoreview; testing/tdd folded into task since the repro was a focused vitest |
| Active goal checked or created | yes | this plan |
| Source of truth read before edits | yes | `gh issue view 445` read in full before any file was touched |
| Exact per-PR task ownership | yes | This plan owns exactly one PR: #456 |
| GitHub comments and attachments read | yes | issue has zero comments and no attachments |
| Video transcript evidence required | no | N/A: no video or screen recording in the source |
| Pre-solution issue challenge required | yes | recorded above; verdict `partially valid` |
| Reproduction verdict before implementation | yes | reproduced at `scanned` 120 vs 1 before any source edit |
| Repro escalation ladder selected | yes | source-level vitest was sufficient; browser/native rungs N/A |
| Suggested fix reviewed against durable boundary | yes | suggested fall-through discarded; executor chosen |
| `docs/solutions` checked for non-trivial existing-code work | no | N/A: no `docs/solutions` directory in this repo |
| TDD decision before behavior change or bug fix | yes | four discriminating tests written red first |
| Branch decision for code-changing task | yes | already on `task-issue-445`, a dedicated non-main branch |
| Release artifact decision | yes | `.changeset/wide-index-union-stays-indexed.md`, minor |
| Browser tool decision for browser surface | no | N/A: no browser surface |
| Commit / PR expectation decision | yes | User later requested a PR explicitly; committed `c6dd8d24`, pushed, opened #456 |
| Task-style PR body decision | yes | PR #270 emoji task-style body used for #456 |
| Task-plan PR body evidence | yes | Body carries `🧭 Task plan: docs/plans/445-index-union-bounded-on-pipeline-path.md`; this file is at the PR head and names PR #456 |
| GitHub issue sync expectation decision | yes | `Fixes #445` in the PR body closes the issue on merge; no separate comment needed |
| Output budget strategy recorded | yes | recorded above and followed |
| Package/API pack selected | yes | package-api |
| Public surface or package boundary identified | yes | `concatStreams` added to the internal `orm/stream` module; no new public export. User-visible surface is index-union read behavior and ordering |
| Convex entry/import graph impact identified | yes | no new imports beyond `concatStreams` from a module `query.ts` already imports; import graph unchanged |
| CLI/scaffold/generated impact identified | no | N/A: no CLI, scaffold, template, or generated file touched |
| Release artifact path selected | yes | `.changeset/wide-index-union-stays-indexed.md` |
| `changeset` skill loaded when `.changeset` is required | yes | `.agents/rules/changeset.mdc` read before writing |
| Package build / fixture impact decision recorded | yes | `bun --cwd packages/kitcn build` run; fixtures untouched |

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
      Recorded: this plan owns exactly one PR, #456.
      PR, owns a not-yet-created PR slice, or records N/A because no PR is in
      scope; a batch plan is not used as a substitute.
- [x] Required video or screen-recording evidence is cached/read as normalized
      N/A: the source has no video or screen recording.
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
      Recorded: new `.changeset/wide-index-union-stays-indexed.md`, minor.
      N/A with reason.
- [x] Final handoff shape decided: bug/feature/testing/batch/review/GitHub
      requirements, PR body sync, and issue sync when applicable.
- [x] Commit/PR handling recorded for code-changing work: commit and PR
      Recorded: commit `c6dd8d24`, pushed, PR #456 opened.
      completed, no local patch, user explicitly declined, or blocker recorded.
      "User did not separately ask for a PR" is not a valid blocker.
- [x] PR body shape recorded: PR #270 emoji task-style body used, N/A reason
      Recorded against PR #456.
      recorded, or blocker recorded.
- [x] PR task evidence recorded: body includes `🧭 Task plan: ...`, the plan
      Recorded against PR #456.
      exists at the PR head, and it identifies the exact PR before autoclosure.
- [x] Branch handling recorded for code-changing work: dedicated branch used,
      Recorded: dedicated branch `task-issue-445`, already checked out.
      new branch needed, or N/A with reason.
- [x] Local-env-rot retry policy recorded for any surprising repo-wide failure:
      Recorded: `kitcn/server` resolution failures were a missing `packages/kitcn/dist`; the package build fixed them.
      reinstall/rerun evidence or N/A with reason.
- [x] Workspace authority recorded: every proof command names the cwd/tool that
      owns the changed behavior.
- [x] Output budget discipline recorded and followed: broad searches are
      scoped, capped, counted, or artifacted instead of streamed into goal
      context.
- [x] High-risk note recorded for public API, runtime, package-boundary,
      Recorded in the high-risk note below.
      browser behavior, agent-action, or command-contract changes, or marked
      N/A with reason.
- [x] Review/autoreview target selected from actual diff state for non-trivial
      Recorded: `autoreview --mode local --engine claude`, clean.
      implementation work, or marked N/A with reason.
- [x] Agent-native review decision recorded for `.agents/**`, `.claude/**`,
      N/A: no skill, hook, command, prompt, or user-action tooling behavior changed.
      `.codex/**`, skills, hooks, commands, prompts, or user-action tooling.
- [x] Package/API pack: public API, package boundary, export, and release-artifact impact are recorded.
- [x] Package/API pack: release artifact matrix is applied: `.changeset` or explicit no-artifact reason.
- [x] Package/API pack: `.changeset` work loads `changeset` and follows its package/version/prose rules.
- [x] Package/API pack: no-artifact decisions state why the diff has no published package user-visible delta from `main`.
      N/A: an artifact was required and written.
- [x] Package/API pack: compatibility, migration, or hard-cut decision is explicit when public shape changes.
- [x] Package/API pack: affected Convex static import graphs stay narrow and
      plugin/per-module boundaries are used where appropriate.
- [x] Package/API pack: CLI commands remain deterministic, `--json` capable,
      N/A: no CLI surface touched.
      and non-interactive with explicit confirmation bypass when relevant.
- [x] Package/API pack: docs and `packages/kitcn/skills/kitcn/**` stay
      current-state synchronized when public guidance changes.
- [x] Package/API pack: package-owned typecheck/build/test proof is recorded or marked N/A with reason.
- [x] Package/API pack: `packages/kitcn` build, fixture sync/check, or other owning package proof is recorded when required.
      Recorded: `bun --cwd packages/kitcn build` run; no fixture or scaffold output changed.

Completion Gates:
| Gate | Applies | Required action | Evidence |
|------|---------|-----------------|----------|
| Named verification threshold | yes | Run the command, proof, source audit, or artifact check named in this plan | `bunx vitest run convex/orm/index-union-pagination.test.ts` 20 passed; wide-union reads `scanned` <= 8 where the table is 120 rows |
| Exact per-PR task ownership | yes | Record the exact PR and dedicated plan, or the not-yet-created single-PR slice | PR #456, this plan |
| Pre-solution issue challenge verdict | yes | Record reporter claim, suggested fix, repro verdict, validity verdict, durable boundary, and hard-stop/pivot decision before implementation | `partially valid`; recorded above with the discarded suggested fix |
| Repro escalation ladder | yes | For bug/behavior claims, record test/source-level, automated browser/integration, Browser, and screenshot/visual-proof outcomes or N/A/blocker reasons before `not reproduced` | source-level vitest reproduced it; other rungs N/A |
| Bug reproduced before fix | yes | Record failing test/repro or N/A with reason | `scanned` 120 pipeline vs 1 findMany, before any source edit |
| Targeted behavior verification | yes | Run focused test/proof for changed behavior or record N/A | `bunx vitest run convex/orm/` 554 passed, 0 failed |
| TypeScript or typed config changed | yes | Run relevant typecheck | `bun typecheck` 5 tasks successful |
| Package exports or file layout changed | yes | Run the relevant package build before final verification and keep generated updates | `bun --cwd packages/kitcn build` complete, 72 files |
| Package manifests, lockfile, or install graph changed | no | Run `bun install` and relevant package checks | N/A: no manifest or lockfile change |
| Agent rules or skills changed | yes | Run `bun install` and verify generated skill sync | `packages/kitcn/skills/kitcn/references/features/orm.md` updated in the same diff as the matching `www/` doc |
| Workspace authority proof | yes | Run verification in the owning repo/package/app/route/tool and record cwd; do not count the wrong workspace as proof | every command run from the repo root `/Users/mikey/conductor/workspaces/kitcn/tehran-v3`, which owns both the ORM source and the convex-test suite |
| Browser surface changed | no | Capture Browser Use proof or record explicit waiver/blocker | N/A: no browser surface |
| Browser final proof | no | Attach screenshot or exact browser verification caveat when browser proof applies | N/A: no browser surface |
| UI walkthrough | no | If UI or rendered output changed, run `.agents/skills/walkthrough/SKILL.md` after final proof and show annotated images in the final handoff; otherwise record N/A | N/A: no UI or rendered output changed |
| Scaffold or fixture output changed | no | Run `bun run fixtures:sync` and `bun run fixtures:check`, or record N/A | N/A: no scaffold or template touched. `fixtures:check` drift is an upstream `expo` patch bump unrelated to this diff |
| Package behavior or public API changed | yes | Add a changeset or record why no changeset applies | `.changeset/wide-index-union-stays-indexed.md`, minor, with a Before/After snippet |
| Docs and kitcn skill sync changed | yes | Keep `www/**` and `packages/kitcn/skills/kitcn/**` in sync, or record N/A | `www/content/docs/orm/queries/pagination.mdx` and `packages/kitcn/skills/kitcn/references/features/orm.md` updated together |
| Docs or content changed | yes | For docs-heavy work, use `--template docs`; for incidental docs, verify source-backed claims, links, examples, and rendered output or record N/A | current-state wording only, no changelog voice; claims checked against the implemented decline conditions |
| High-risk mini gate | yes | For public API/runtime/package-boundary/browser/agent-action/command-contract changes, record realistic failure mode, proof plan, and why the chosen boundary is right; otherwise N/A | see the high-risk note below |
| Agent-native review for agent/tooling changes | no | For `.agents/**`, `.claude/**`, `.codex/**`, skills, hooks, commands, prompts, or user-action tooling, load `.agents/skills/agent-native-reviewer/SKILL.md` and close accepted/actionable findings, or record N/A | N/A: the only `.agents`-adjacent file is this plan; no skill, hook, command, or prompt behavior changed |
| Local install corruption suspected | yes | Run `bun install` once, rerun the exact failing command, or record N/A | `kitcn/server` module-resolution failures were a missing `packages/kitcn/dist`; `bun --cwd packages/kitcn build` fixed them, no reinstall needed |
| Commit created | yes | For verified code-changing work, stage the entire current checkout per repo policy and create a commit | `c6dd8d24`, whole checkout staged |
| PR create or update | yes | For verified code-changing work, run `check`, push, create or update the PR, and sync PR body to the task-style final handoff | #456 opened on `fix/wide-index-union-stays-indexed`; `check` green except unrelated `fixtures:check` upstream drift, recorded as a caveat in the PR body |
| Task-style PR body verified | yes | Verify the PR body with `gh pr view --json body` | Verified on #456: auto-release block preserved, no self-link, emoji format intact |
| PR task evidence verified | yes | Verify body plan line, plan at PR head, and exact PR ownership | All three verified for #456 |
| PR proof image hosting | no | If PR body needs browser proof, replace local image paths with hosted GitHub URLs or record N/A | N/A: no images in the body |
| GitHub issue sync-back | yes | Post concise issue sync after PR exists, or record N/A/blocker | `Fixes #445` in the PR body closes the issue on merge |
| Final handoff contract | yes | Fill the final handoff fields below with exact PR/issue/confidence/tests/browser/outcome/caveats/design/verification content or N/A reason | filled below |
| Final lint | yes | Run `bun lint:fix` or scoped equivalent | `bun lint:fix` clean, no fixes applied |
| Output budget discipline | yes | Verify no unbounded high-volume command output was streamed, or record the accidental output and recovery | all command output piped through `tail`/`grep`; the adversarial review returned a structured verdict list rather than transcripts |
| Timed checkpoint | no | If duration was requested, keep improving until elapsed, then finish the current loop cleanly; otherwise N/A | N/A: no duration requested |
| Autoreview for non-trivial implementation changes | yes | Load `.agents/skills/autoreview/SKILL.md`; use dirty local `--mode local`, branch/PR `--mode branch --base <base>`, or committed slice `--mode commit --commit <ref>` until no accepted/actionable findings, or record N/A for docs-only/trivial/no local patch | `autoreview --mode local --engine claude`: clean, no accepted/actionable findings, `overall: patch is correct` |
| Goal plan complete | yes | Run `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/445-index-union-bounded-on-pipeline-path.md` | passes |
| Public API / package boundary proof | yes | Source-audit public API, exports, and package boundary impact | `concatStreams` is internal to `orm/stream`; no package entry point or export map changed |
| Convex bundle/import proof | yes | Audit affected function-entry static graphs or record N/A | no new module edge; `query.ts` already imported `./stream` |
| CLI/scaffold/generated proof | no | Prove command contract and regenerate owned output or record N/A | N/A: nothing CLI, scaffold, or generated |
| Release artifact classification | yes | Record whether the change is published package behavior/API/types/config/runtime or no published user-visible delta | published package behavior change: read plan and emitted order for wide index unions |
| Published package changeset | yes | If published package users see a delta, load `changeset` and add/update one `.changeset/*.md` per package | `.changeset/wide-index-union-stays-indexed.md` |
| No release artifact | no | If no artifact is needed, record the exact reason: internal-only, docs-only, agent-only, test-only, or no user-visible delta from `main` | N/A: an artifact was required and written |
| Package typecheck/build/test | yes | Run owning package checks or record N/A with reason | `bun typecheck`, `bun --cwd packages/kitcn build`, `bun run test` (988 vitest + 1400 bun, 0 failed) |
| Fixture/scaffold generation | no | Run `bun run fixtures:sync` and `bun run fixtures:check` when scaffold output changed, otherwise N/A | N/A: no scaffold output changed |
| Docs/package skill sync | yes | Synchronize current-state public guidance or record N/A | both docs updated in this diff |

Phase / pass table:
| Phase | Status | Evidence | Next |
|-------|--------|----------|------|
| Intake and source read | complete | issue #445 fetched and challenged; repro measured | implementation |
| Implementation | complete | concat executor + compiler cap removal | verification |
| Verification | complete | full suite, typecheck, lint, build, autoreview | closeout |
| Commit / PR / GitHub sync | complete | commit `c6dd8d24`, branch `fix/wide-index-union-stays-indexed`, PR #456 | final response |
| Closeout | complete | this plan | final response |

Findings:
- The pipeline path had exactly one union executor. `_buildProbeUnionStream`
  built a `mergedStream` and returned null past `MAX_INDEX_UNION_PROBES`; every
  fallback rung in `_buildPlanStream` is gated on `!hasProbeUnionPlan`, so the
  read anchored no index and walked `by_creation_time`.
- The non-cursor `findMany` path never had that problem: it runs the probes
  directly as per-probe `withIndex(...).take(bound)` reads with no width cap.
  The bug is an executor asymmetry, not a missing guard.
- Measured with the cap temporarily raised to 4096: the pipeline read costs
  `scanned = 1` at widths 2, 16, 64, 65, 128, 512 and 1024. An empty index range
  costs zero document reads, so width alone is not what makes a union expensive.
- `MergedStream.iterWithKeys` does `Promise.all(iterators.map(it => it.next()))`
  on the first pull, so K dense probes cost K reads to emit one row. That is the
  real cost the cap refuses, and it is genuine — the cap stays.
- `ConcatStreams` (already live behind `streamIndexRange`) opens sub-stream `i`
  only once `i - 1` is exhausted. It is the executor the wide case wanted.
- At `mergeOffset === 0` the `OrderByStream` that `mergedStream` wraps each probe
  in is an identity: `slice(0, len - len)` makes its static filter empty. So a
  merged and a concatenated union agree on `getIndexFields()`,
  `getEqualityIndexFilter()` and emitted keys — which is what makes them
  interchangeable for cursors and `narrow()`.
- A second enforcement site for the same constant: `tryCompileAndInArray`
  refused to compile a union at all past 64 values, so
  `where: { status: { in: [...65] }, name: { contains: 'x' } }` fell to a table
  scan on *every* path. Measured 1 read at width 64, 120 at width 65.
- Out of scope, worth its own issue: `tryCompileInArray` and
  `tryCompileOrEquality` de-duplicate with `new Set(...)`, which is
  SameValueZero, not Convex index-value equality. `in [1, 1n]` or two
  structurally equal objects therefore produce duplicate probes, and a merged
  union below the cap would emit the row twice. `_orderDisjointProbes` declines
  on exactly that input, so the concatenated path is unaffected.
- Out of scope: `_buildUnionSourceStream` (pipeline `.union()` sources) builds
  its own stream and never consults the compiled plan, so a `where` on a union
  source is applied as `filterWith`, not as probes.

Decisions and tradeoffs:
- Chose a second executor over the issue's suggested fall-through. A multiProbe
  plan carries `indexFilters: []`, so anchoring its index is a rangeless full
  index scan: it bounds nothing and silently reorders the result.
- Kept `MAX_INDEX_UNION_PROBES = 64` and kept `mergedStream` below it. The cap
  now selects fan-out versus sequential, which its own rationale supports; what
  it must never select is index versus table scan.
- Restricted concatenation to `mergeOffset === 0`. At `mergeOffset > 0` the
  merge is interleaving probes by a key none of them pins, which reading them in
  sequence cannot reproduce. Those reads keep the scan budget they have today.
- Proved disjointness and order from the filters rather than trusting the
  compiler. `ConcatStreams` throws on a backwards key, so an unproven probe set
  would be a runtime error instead of a fallback.
- Did not add a non-cursor `maxScan`. Non-cursor reads are sized by
  `limit`/`defaultLimit`, not by a scan budget; a new public knob would have
  papered over the planner gap instead of closing it.
- Accepted trade-off: a concatenated union costs one serialized round trip per
  probe. It never reads more than the scan it replaces, and callers who want the
  parallel fan-out are still under the cap.

Implementation notes:
- `concatStreams()` exported from `stream.ts`, mirroring `mergedStream()`.
- `_buildProbeUnionStream` picks merged (<= cap) or concatenated (> cap).
- `_orderDisjointProbes` reduces each probe to a bound pair on the leading index
  field, sorts by lower bound, and rejects any adjacent overlap. Adjacent checks
  are sufficient for pairwise disjointness given lower-bound sortedness.
- `tryCompileAndInArray` no longer refuses on width; the constant's docstring now
  says the executor owns that decision alone.

Review fixes:
- Adversarial design review (6 lenses, judged) upheld two objections. One was the
  second cap enforcement site, fixed here. The other was against the issue's
  suggested fall-through, which was already discarded; the reviewers
  independently reached "ship the executor fix alone".
- `autoreview --mode local --engine claude`: clean, no accepted/actionable
  findings. It independently verified the disjointness proof, including that
  adjacent-pair checks imply full pairwise disjointness.

Error attempts:
| Error / failed attempt | Count | Next different move | Resolution |
|------------------------|-------|---------------------|------------|
| None yet | 0 | | |

Verification evidence:
All commands run from the repo root, `/Users/mikey/conductor/workspaces/kitcn/tehran-v3`.
- `bunx vitest run convex/orm/index-union-pagination.test.ts` — 20 passed. Four
  of those tests were red before the fix on discriminating assertions.
- `bunx vitest run convex/orm/` — 554 passed, 14 skipped, 0 failed.
- `bun run test` — vitest 988 passed / 0 failed; bun 1400 passed / 0 failed.
- `bun typecheck` — 5 tasks successful.
- `bun lint:fix` — no fixes applied, clean.
- `bun --cwd packages/kitcn build` — build complete, 72 files.
- `bun check` — every lane green except `fixtures:check`, which reports upstream
  Expo dependency drift (`expo ~55.0.30` -> `~55.0.31`) in a fixture this diff
  does not touch. No scaffold, template, or fixture file is in the diff.
- `.agents/skills/autoreview/scripts/autoreview --mode local --engine claude` —
  clean, `overall: patch is correct`.

Source-listed case matrix:
| Case | Source claim | Harness | Before | Expected after | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `select().where({status:{in:[65]}}).map().limit(1)` reads 120 documents | scratch vitest on a 120-row table, one match | `scanned` 120 | tracks the probes, not the table | `scanned` 1, equal to `findMany` | fixed |
| 2 | the same query through `findMany` reads 1 | same harness | `scanned` 1 | unchanged | `scanned` 1 | unchanged |
| 3 | `_buildPlanStream` anchors no index when the union is declined | source read of `query.ts:3122-3143` | true | union is no longer declined on width, so the rungs are not reached | `index-union-pagination.test.ts` wide-union tests | fixed at the executor |
| 4 | the `rejectedProbeUnion` guard covers only cursor reads | source read of `query.ts:6202` | true | still true, and no longer load-bearing for width | 'a wide index union whose order needs a merge keeps its scan budget' | accepted as designed |
| 5 | `maxScan` is unreachable on the non-cursor pipeline path | source read of `query-builder.ts:304`, `query.ts:5911` | true | unchanged; not the right fix | non-cursor reads are sized by `limit`, not a scan budget | won't-fix, with reason |
| 6 | no test exercises the non-cursor `select()` pipeline with a declined union | `index-union-pagination.test.ts` | true | covered | 6 new tests, 4 red before the fix | fixed |
| 7 | not in the issue: crossing the cap changed emitted row order | 'crossing the merge cap does not change the order rows come out in' | width 64 and 65 disagreed | identical sequences | test passes | fixed |
| 8 | not in the issue: a wide `in` beside another AND term scanned on every path | 'a wide `in` beside a residual filter still compiles to its probes' | `scanned` 120 at width 65, 1 at 64 | flat across widths | `scanned` <= 8 | fixed |

Final handoff contract:
- Commit line: `c6dd8d24` on `fix/wide-index-union-stays-indexed`.
- PR line: #456 — https://github.com/udecode/kitcn/pull/456
- Issue line: #445, closed by the PR's `Fixes #445`.
- Confidence line: 95-100%.
- Flow table:
  - Reproduced: tests 🟢 (`scanned` 120 vs 1), browser ➖ N/A
  - Verified: tests 🟢 (988 vitest + 1400 bun, 0 failed), browser ➖ N/A
- Browser check: N/A — server-side read planning, no rendered output.
- Outcome: a compiled index union stays index-bounded at any probe width, on the
  `select()` pipeline path, the cursor path, and beside another AND term. The
  issue's exact repro drops from 120 document reads to 1, matching `findMany`.
- Caveat: a union past 64 probes is read one range after another, so it trades a
  serialized round trip per probe for the table scan it replaces; reads are never
  worse. An `orderBy` that sorts across values, such as `createdAt`, still needs
  the merge and so still asks for `maxScan` past 64 probes.
- Design:
  - Chosen boundary: `_buildProbeUnionStream`, the one place that decides how a
    compiled union is executed as a stream. It gained a second executor.
  - Why not quick patch: the issue's suggested fall-through anchors a rangeless
    index, which bounds nothing and silently reorders rows.
  - Why not broader change: `MAX_INDEX_UNION_PROBES` stays at 64 and
    `mergedStream` still serves every union under it, because the fan-out cost
    the cap refuses is real and measured.
- PR body verified: `gh pr view 456 --json body`, PR #270 emoji task-style shape.

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
- Commit: `c6dd8d24`.
- PR: #456 — https://github.com/udecode/kitcn/pull/456
- Issue: #445, closed by the PR.
- Browser proof: N/A.
- Caveats: see the Caveat line above; `bun check`'s `fixtures:check` lane reports
  upstream `expo` dependency drift unrelated to this diff.

High-risk note (public runtime behavior change):
- Realistic failure mode: a concatenated union emits a row twice, or emits index
  keys out of order and throws `ConcatStreams in wrong order` mid-page.
- Proof plan: `_orderDisjointProbes` proves pairwise disjointness and index order
  from the filters before concatenating, and declines otherwise; a cap-boundary
  test asserts widths 64 and 65 produce identical sequences; a cursor walk
  asserts every match appears exactly once.
- Why the boundary is right: at `mergeOffset === 0` the `OrderByStream` wrapper a
  merged union applies is an identity, so merged and concatenated unions agree on
  index fields, equality filter, and emitted keys. That is what makes them
  interchangeable for cursors and `narrow()`, and it is why concatenation is
  restricted to that case.

Timeline:
- 2026-09-06T02:12:04.123Z Task goal plan created.
- Issue #445 read, challenged, and reproduced at the source level.
- Cost of a wide merged union measured with the cap temporarily raised, then the
  cap restored; the measurement ruled out simply raising it.
- Four discriminating regression tests written red, then made green.
- Adversarial design review run across six lenses; the upheld objection (second
  cap enforcement site) fixed.
- Full suite, typecheck, lint, package build, and autoreview run clean.

Reboot status:
| Question | Answer |
|----------|--------|
| Where am I? | Closeout |
| Where am I going? | Final response |
| What is the goal? | Keep a compiled index union index-bounded on the `select()` pipeline path |
| What have I learned? | See Findings |
| What have I done? | See Timeline |

Open risks:
- A concatenated union issues one serialized round trip per probe, so a very long
  `in` list trades wall-clock latency for the table scan it replaces. Reads are
  never worse. Callers who want the parallel fan-out stay under the cap.
- `_orderDisjointProbes` has no reachable rejecting input from today's compiler:
  every probe set it sees past the cap is already disjoint. It is kept because it
  also supplies the ordering `ConcatStreams` requires, which no compiler-side tag
  could, and because it fails closed rather than throwing if a future probe shape
  is not disjoint.
- The `new Set(...)` probe de-duplication bug noted in Findings is untouched and
  still reachable below the cap. It predates this change and deserves its own
  issue.

Hard closeout guard:
- A local-only final response for verified code-changing work is invalid unless
  this plan records an explicit user decline, no local patch, analytical/
  blocked/inconclusive outcome, or a real commit/PR blocker.
