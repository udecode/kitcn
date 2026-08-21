# ORM: drop wasted per-key work from aggregate index clear paths

Objective:
Stop aggregate-index clear paths paying per-member btree/bucket work that the next branch discards; done when clear-path document ops drop measurably with drain still provably complete; plan docs/plans/417-drop-wasted-clear-work.md.

Flow mode:
one-shot execution

Goal plan:
docs/plans/417-drop-wasted-clear-work.md

Template:
docs/plans/templates/task.md

Primary template:
docs/plans/templates/task.md

Applied packs:
- package-api (docs/plans/templates/packs/package-api.md)

Task source:
- type: GitHub issue
- id / link: #417 https://github.com/udecode/kitcn/issues/417
- title: ORM: `clearRankIndexChunk` deletes every btree key one at a time before dropping the whole tree anyway
- acceptance criteria:
  1. `clearRankIndexChunk`'s member loop no longer calls `aggregate.deleteIfExists` per member.
  2. The stale doc comment at `rank-runtime.ts:358-363` is rewritten to match the new invariant.
  3. `reconcileRankMembership` (normal-path removal) keeps its btree delete, untouched.
  4. Branch order preserved: members fully drain before `deleteTrees` runs.
  5. `isIndexStateDrained` ordering (members first, then tree row) preserved, not short-circuited.
  6. Budget accounting becomes honest: tree branch reports documents actually touched and
     honors the caller's `batchSize` instead of the hardcoded `RANK_TREE_DROP_BATCH = 16`.
  7. Sibling `clearCountIndexChunk` gets the same treatment (stop flushing decrement deltas
     into buckets/extrema that the next branches delete wholesale).
  8. Existing `count.test.ts` backfill-drain tests stay green.
- caveats: no test currently pins per-key delete behavior; `countDocumentReads` is absent from
  `example/convex/orm/count.test.ts`, so the cost claim needs a new harness.
- likely files/packages: `packages/kitcn/src/orm/aggregate-index/rank-runtime.ts`,
  `packages/kitcn/src/orm/aggregate-index/runtime.ts`,
  `packages/kitcn/src/aggregate-core/btree.ts`,
  `packages/kitcn/src/aggregate-core/runtime.ts`,
  `packages/kitcn/src/orm/aggregate-index/backfill.ts`, `example/convex/orm/*.test.ts`.
- browser surface: none (server-side ORM internals).
- root-cause layer: ORM aggregate-index clear/drain runtime.

Timed checkpoint:
- requested duration: N/A: no duration in the prompt.
- semantics: N/A: no duration in the prompt.
- initial confidence score: N/A: task has a concrete measurable metric (document ops on the clear path).
- improvement loop: N/A: no duration in the prompt.
- final score / loop closure: N/A: no duration in the prompt.

Completion threshold:
- A new regression test proves a rank-index clear drains to ZERO `aggregate_member`,
  ZERO rank tree rows, and ZERO rank node rows across a MULTI-namespace index.
- A new cost test proves the rank clear path performs strictly fewer document
  operations after the change than the per-key version did (measured, not asserted by eyeball).
- A new regression test proves a metric-index clear drains to ZERO members, buckets, and extrema.
- `bun run test:orm`-equivalent focused suites for the aggregate-index/backfill area pass.
- `bun --cwd packages/kitcn build` and `bun typecheck` pass.
- `bun lint:fix` clean.
- Changeset added for the published behavior change.
- Task closure is legal only when the source-of-truth acceptance criteria are
  satisfied or explicitly narrowed, required verification evidence is recorded,
  code-review and release-artifact gates are closed when applicable, verified
  code changes are committed and PR'd unless explicitly declined or blocked,
  task-style PR body sync is complete or marked N/A with reason,
  GitHub issue/PR sync is complete or marked N/A with reason, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/417-drop-wasted-clear-work.md` passes.

Verification surface:
- `bun vitest run packages/kitcn/src/aggregate-core/btree.vitest.ts packages/kitcn/src/orm/aggregate-index/runtime.vitest.ts` (cwd: repo root) - unit proof for btree drain + CLEARING guard.
- `bun test example/convex/orm/count.test.ts` (cwd: repo root) - existing backfill drain suite must stay green + new clear-drain/cost cases.
- `bun typecheck` (cwd: repo root).
- `bun --cwd packages/kitcn build`.
- `bun lint:fix` (cwd: repo root).
- Source audit: `rg -n 'deleteIfExists' packages/kitcn/src/orm/aggregate-index/rank-runtime.ts` returns no hit inside `clearRankIndexChunk`.

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
- Source of truth: GitHub issue #417 body (no comments).
- Allowed edit scope: `packages/kitcn/src/orm/aggregate-index/**`,
  `packages/kitcn/src/aggregate-core/**`, `example/convex/orm/**` tests,
  `.changeset/**`, `docs/plans/417-drop-wasted-clear-work.md`.
- Browser surface: N/A: server-side ORM internals, no rendered output.
- GitHub issue sync: PR first, then a QA-facing sync comment on #417.
- Non-goals: changing `reconcileRankMembership`, reordering `isIndexStateDrained`,
  redesigning the backfill state machine, changing the public `rank()`/aggregate read API.

Output budget strategy:
- Targeted `sed -n` ranges and `rg -n` with explicit path scopes; no repo-wide unbounded scans.
- Exclude `node_modules`, `tmp/**`, `.turbo`, `dist`, `fixtures/**` from searches.
- Deep multi-file investigation delegated to a background Workflow whose agents return
  schema-constrained findings instead of streaming file dumps into this context.
- Test output piped through `tail`/`grep` when a suite is verbose.

Blocked condition:
- A safety constraint proves the per-key deletes are load-bearing (e.g. a read or write path
  that can observe a populated btree while members are gone), and no bounded fix exists.
- The Convex per-mutation document limit makes an honest `batchSize`-driven tree drop unsafe
  and no clamp preserves both honesty and safety.

Task state:
- task_type: bug / performance (wasted work on a hot maintenance path)
- task_complexity: non-trivial, non-heavyweight
- current_phase: intake
- current_phase_status: in_progress
- next_phase: implementation
- goal_status: active
- goal tools: not available in this runtime (no `get_goal`/`create_goal` tool exposed); this
  plan is the durable state.

Current verdict:
- verdict: fixed and verified
- confidence: 95-100%
- next owner: autoreview
- reason: every source-listed case has a green harness; full repo test suite green

Implementation readiness:
- verdict: ready
- exact owner: `packages/kitcn/src/orm/aggregate-index/rank-runtime.ts`,
  `packages/kitcn/src/orm/aggregate-index/runtime.ts`,
  `packages/kitcn/src/aggregate-core/btree.ts` (+ `aggregate-core/runtime.ts` passthrough)
- contradiction status: one found - the doc comment at `rank-runtime.ts:358-363` asserts the
  invariant the fix removes. Owner: the comment. Resolution: rewrite it.
- source-listed cases complete: yes (8 acceptance rows above)

Pre-solution issue challenge:
- reporter claim: `clearRankIndexChunk` pays a root-to-leaf btree descent plus aggregate
  patches per member, then `deleteTrees` discards all of it. Budget accounting is wrong in
  both directions. The sibling `clearCountIndexChunk` has the same shape.
- suggested diagnosis or fix: drop `deleteIfExists` from the member loop, keep branch order,
  keep driving `deleteTrees` to done, make `processed` honest.
- repro ladder:
  - tests / source-level repro: DONE. Two new tests in `convex/orm/count.test.ts`
    (`describe('aggregateIndex clearing is resumable')`) count writes per table across a full
    prune-clear campaign via a new `createWriteCountingDb` proxy.
    - rank, 3 namespaces x 40 rows, `maxNodeSize` 16, 15 nodes:
      `aggregate_rank_node` writes = **201** (expected 15). 13.4x waste.
    - metric, 3 namespaces x 40 rows, 3 buckets:
      `aggregate_bucket` writes = **15** (expected 3). 5x waste.
    - `aggregate_extrema` writes = 120 for 120 rows: already 1 write/row because every extrema
      row has count 1, so the decrement deletes it immediately. Not discriminating, kept as an
      invariant pin.
  - repo-owned automated browser or integration proof: N/A: server-side ORM internals.
  - Browser plugin: N/A: no rendered output.
  - screenshot / visual proof: N/A: no visual output.
- reproduction verdict: valid - reproduced at the source level with measured counts.
- validity verdict: valid
- best long-term fix boundary: `clearRankIndexChunk` / `clearCountIndexChunk` member branches
  plus `deleteTreesHandler`'s return contract (so the tree branch can report real work).
- harsh honest feedback: the issue's suggested fix is correct but incomplete on one point -
  it says "the tree branch should report the nodes it actually touched" without noting that
  `deleteTreesHandler` currently returns a bare `boolean` and therefore cannot. That return
  contract is the real ownership boundary and has to change.
- hard-stop decision: proceed.

Completion rule:
- Do not call `update_goal(status: complete)` while any required checklist item
  remains unchecked. If an item does not apply, check it and add `N/A: <reason>`.
- Do not call `update_goal(status: complete)` until every completion threshold
  above is satisfied, final handoff evidence is recorded, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/417-drop-wasted-clear-work.md` passes.
- Do not create hook state for this goal. This file plus the active goal are the
  durable state.

Start Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| Timed checkpoint parsed | no | N/A: no duration in the prompt |
| Walkthrough baseline for possible UI change | no | N/A: server-side ORM internals; no UI or rendered output can change |
| Skill analysis before edits | yes | `task` + `autogoal`; `tdd` folded in (red harness before fix); `changeset` loaded for `.changeset`; no browser/agent-native skill needed |
| Active goal checked or created | yes | goal tools are not exposed in this runtime; this plan is the durable state |
| Source of truth read before edits | yes | `gh issue view 417` + `rank-runtime.ts`, `runtime.ts`, `btree.ts`, `backfill.ts`, `lifecycle.ts` |
| Exact per-PR task ownership | yes | This plan owns exactly one PR for issue #417; the PR is recorded in the completion gate below |
| GitHub comments and attachments read | yes | `gh issue view 417 --json comments` -> `[]` |
| Video transcript evidence required | no | N/A: no video or screen recording in the source |
| Pre-solution issue challenge required | yes | recorded above: valid; issue`s suggested fix was correct but silent on the `deleteTreesHandler` return contract |
| Reproduction verdict before implementation | yes | reproduced: 201 node writes for 15 nodes; 15 bucket writes for 3 buckets |
| Repro escalation ladder selected | yes | source-level test repro sufficed; no browser/native surface |
| Suggested fix reviewed against durable boundary | yes | adopted the member-loop change, extended it to the `deleteTreesHandler` return contract and the drifted rank schema |
| `docs/solutions` checked for non-trivial existing-code work | no | N/A: `docs/solutions` does not exist in this repo |
| TDD decision before behavior change or bug fix | yes | red-first: both harnesses failed with measured baselines before any source edit |
| Branch decision for code-changing task | yes | renamed `issue-417` -> `fix/drop-wasted-aggregate-index-clear-work` before the first push, per the user's `<type>/<short-kebab-summary>` convention; safe because the branch had no upstream and no PR |
| Release artifact decision | yes | `.changeset/lucky-pans-invent.md` (patch) |
| Browser tool decision for browser surface | no | N/A: no browser surface |
| Commit / PR expectation decision | yes | The user prompted for a PR in a follow-up message, which is the exception their own preference names. Commit + push + PR required. |
| Task-style PR body decision | yes | PR #270 emoji task-style body; the `task` skill owns the format and takes precedence over the generic PR-instruction template |
| Task-plan PR body evidence | yes | Body carries `🧭 Task plan: docs/plans/417-drop-wasted-clear-work.md`; the plan is committed on the PR head and names the exact PR |
| GitHub issue sync expectation decision | yes | Post a QA-facing sync comment on #417 once the PR exists |
| Output budget strategy recorded | yes | recorded above; scoped `rg`/`sed` reads, schema-constrained subagent findings, test output filtered through `grep`/`tail` |
| Package/API pack selected | yes | `--with package-api` |
| Public surface or package boundary identified | yes | `deleteTreesHandler` / `DirectAggregate.deleteTrees` / `rankTreeTable` are internal; no package entry re-exports them. Only the generated Convex schema is user-visible. |
| Convex entry/import graph impact identified | yes | `orm/aggregate-index/schema.ts` now imports `aggregate-core/schema.ts`, which imports only `convex/values` + `../orm/{builders,indexes,table}` - all already in the ORM graph. Table definitions moved, none added. |
| CLI/scaffold/generated impact identified | yes | generated Convex schema changes -> `fixtures:sync` + `fixtures:check` run and green |
| Release artifact path selected | yes | `.changeset/lucky-pans-invent.md` |
| `changeset` skill loaded when `.changeset` is required | yes | read `.agents/rules/changeset.mdc` and mirrored `packages/kitcn/CHANGELOG.md` tone |
| Package build / fixture impact decision recorded | yes | `bun --cwd packages/kitcn build` + `bun run fixtures:sync` + `bun run fixtures:check` all run |

Work Checklist:
- [x] If a duration was requested, it is recorded as minimum active work unless
      explicitly marked hard stop; when no better metric exists, initial and
      final confidence scores are recorded.
      N/A: no duration requested; the task has a concrete numeric metric instead.
- [x] Objective includes outcome, completion threshold, verification surface,
      constraints, boundaries, and blocked condition.
- [x] Task source classified with source type, id/link, title, task type,
      acceptance criteria, caveats, likely files/routes/packages, browser
      surface, and root-cause layer.
- [x] Every GitHub PR in scope has its own task plan. This plan owns one exact
      PR, owns a not-yet-created PR slice, or records N/A because no PR is in
      scope; a batch plan is not used as a substitute.
      This plan owns exactly one PR for issue #417; no batch plan is involved.
- [x] Required video or screen-recording evidence is cached/read as normalized
      `<video-transcripts>` XML, or marked N/A with reason.
      N/A: the issue has no video or screen recording.
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
      N/A: no agent-native surface touched.
- [x] Package/API pack: public API, package boundary, export, and release-artifact impact are recorded.
- [x] Package/API pack: release artifact matrix is applied: `.changeset` or explicit no-artifact reason.
- [x] Package/API pack: `.changeset` work loads `changeset` and follows its package/version/prose rules.
- [x] Package/API pack: no-artifact decisions state why the diff has no published package user-visible delta from `main`.
- [x] Package/API pack: compatibility, migration, or hard-cut decision is explicit when public shape changes.
- [x] Package/API pack: affected Convex static import graphs stay narrow and
      plugin/per-module boundaries are used where appropriate.
- [x] Package/API pack: CLI commands remain deterministic, `--json` capable,
      and non-interactive with explicit confirmation bypass when relevant.
      N/A: no CLI command contract changed.
- [x] Package/API pack: docs and `packages/kitcn/skills/kitcn/**` stay
      current-state synchronized when public guidance changes.
      N/A: no public guidance changed.
- [x] Package/API pack: package-owned typecheck/build/test proof is recorded or marked N/A with reason.
- [x] Package/API pack: `packages/kitcn` build, fixture sync/check, or other owning package proof is recorded when required.

Completion Gates:
| Gate | Applies | Required action | Evidence |
|------|---------|-----------------|----------|
| Named verification threshold | yes | Run the command, proof, source audit, or artifact check named in this plan | See Verification evidence: 7/7 clearing tests, 18/18 btree, 25/25 schema-integration, full `bun run test` green |
| Exact per-PR task ownership | yes | Record the exact PR and dedicated plan, or the not-yet-created single-PR slice | This plan owns exactly one PR: https://github.com/udecode/kitcn/pull/424 |
| Pre-solution issue challenge verdict | yes | Record reporter claim, suggested fix, repro verdict, validity verdict, durable boundary, and hard-stop/pivot decision before implementation | Recorded in `Pre-solution issue challenge`: valid, reproduced, proceed |
| Repro escalation ladder | yes | For bug/behavior claims, record test/source-level, automated browser/integration, Browser, and screenshot/visual-proof outcomes or N/A/blocker reasons before `not reproduced` | Source-level repro succeeded at the first rung; browser/visual rungs N/A (no rendered output) |
| Bug reproduced before fix | yes | Record failing test/repro or N/A with reason | 2 failing tests with measured baselines: 201 vs 15 node writes, 15 vs 3 bucket writes |
| Targeted behavior verification | yes | Run focused test/proof for changed behavior or record N/A | `bunx vitest run convex/orm/count.test.ts -t "clearing is resumable"` -> 7 passed |
| TypeScript or typed config changed | yes | Run relevant typecheck | `bun typecheck` -> 5 packages successful |
| Package exports or file layout changed | yes | Run the relevant package build before final verification and keep generated updates | `bun --cwd packages/kitcn build` -> 71 files, 1577.46 kB |
| Package manifests, lockfile, or install graph changed | no | Run `bun install` and relevant package checks | N/A: no manifest or lockfile change |
| Agent rules or skills changed | no | Run `bun install` and verify generated skill sync | N/A: no `.agents/**` or skill change |
| Workspace authority proof | yes | Run verification in the owning repo/package/app/route/tool and record cwd; do not count the wrong workspace as proof | All commands run at repo root `/Users/mikey/conductor/workspaces/kitcn/kyoto`, which owns `packages/kitcn`, `convex/orm` tests, and `fixtures/**` |
| Browser surface changed | no | Capture Browser Use proof or record explicit waiver/blocker | N/A: server-side ORM internals |
| Browser final proof | no | Attach screenshot or exact browser verification caveat when browser proof applies | N/A: no browser surface |
| UI walkthrough | no | If UI or rendered output changed, run `.agents/skills/walkthrough/SKILL.md` after final proof and show annotated images in the final handoff; otherwise record N/A | N/A: no UI or rendered output changed |
| Scaffold or fixture output changed | yes | Run `bun run fixtures:sync` and `bun run fixtures:check`, or record N/A | Both run; `fixtures:check` reports every fixture matches fresh `kitcn init` output. 8 `dataModel.d.ts` files regenerated. |
| Package behavior or public API changed | yes | Add a changeset or record why no changeset applies | `.changeset/lucky-pans-invent.md` (patch) |
| Docs and kitcn skill sync changed | no | Keep `www/**` and `packages/kitcn/skills/kitcn/**` in sync, or record N/A | N/A: no public guidance changed. `rg -n "deleteTrees|clearRankIndexChunk" www packages/kitcn/skills` -> no hits. |
| Docs or content changed | no | For docs-heavy work, use `--template docs`; for incidental docs, verify source-backed claims, links, examples, and rendered output or record N/A | N/A: no docs touched beyond this plan and the changeset |
| High-risk mini gate | yes | For public API/runtime/package-boundary/browser/agent-action/command-contract changes, record realistic failure mode, proof plan, and why the chosen boundary is right; otherwise N/A | See `High-risk note` below |
| Agent-native review for agent/tooling changes | no | For `.agents/**`, `.claude/**`, `.codex/**`, skills, hooks, commands, prompts, or user-action tooling, load `.agents/skills/agent-native-reviewer/SKILL.md` and close accepted/actionable findings, or record N/A | N/A: no agent-native surface touched |
| Local install corruption suspected | no | Run `bun install` once, rerun the exact failing command, or record N/A | N/A: no missing-module or resolution failures; every failure was explained by the diff |
| Commit created | yes | For verified code-changing work, stage the entire current checkout per repo policy and create a commit; N/A only for no local patch, explicit user decline, analytical/blocked/inconclusive work, or recorded external blocker | `7cd7a13a` "fix(orm): drop wasted per-key work from aggregate index clears", plus `docs(plans): record PR #424` recording this PR; whole checkout staged |
| PR create or update | yes | For verified code-changing work, run `check`, push, create or update the PR, and sync PR body to the task-style final handoff; N/A only for no local patch, explicit user decline, analytical/blocked/inconclusive work, or recorded external blocker | `bun check` exit 0 (lint, typecheck, 1317 bun + 873 vitest, CLI, concave, fixtures:check, test:verify, test:runtime); pushed to `fix/drop-wasted-aggregate-index-clear-work`; PR https://github.com/udecode/kitcn/pull/424 |
| Task-style PR body verified | yes | Verify the PR body with `gh pr view --json body`; it must use the PR #270 emoji format and must not self-link | `gh pr view 424 --json body` -> PR #270 emoji format confirmed: `🐛 Fixes #417`, `🧭 Task plan: ...`, `🟢 95-100% confidence`, `Phase / 🧪 Tests / 🌐 Browser` table, bold emoji Outcome/Caveat/Design/Verified; `<!-- auto-release:start -->` preserved; `grep -c "pull/424"` -> 0, so no self-link |
| PR task evidence verified | yes | Verify body plan line, plan at PR head, and exact PR ownership | Body line `🧭 Task plan: docs/plans/417-drop-wasted-clear-work.md`; the plan is committed at the PR head and names PR #424 |
| PR proof image hosting | no | If PR body needs browser proof, replace local image paths with hosted GitHub URLs or record N/A | N/A: no browser proof and no images in the body |
| GitHub issue sync-back | yes | Post concise issue sync after PR exists, or record N/A/blocker | https://github.com/udecode/kitcn/issues/417#issuecomment-5376319181 - QA-facing: fixed-in-PR line plus 3 verification steps, no internal file/test/branch references |
| Final handoff contract | yes | Fill the final handoff fields below with exact PR/issue/confidence/tests/browser/outcome/caveats/design/verification content or N/A reason | See `Final handoff contract` |
| Final lint | yes | Run `bun lint:fix` or scoped equivalent | `bun lint:fix` -> 946 files checked, no fixes applied |
| Output budget discipline | yes | Verify no unbounded high-volume command output was streamed, or record the accidental output and recovery | No unbounded scans; searches path-scoped, test output filtered, deep investigation delegated to schema-constrained subagents |
| Timed checkpoint | no | If duration was requested, keep improving until elapsed, then finish the current loop cleanly; otherwise N/A | N/A: no duration requested |
| Autoreview for non-trivial implementation changes | yes | Load `.agents/skills/autoreview/SKILL.md`; use dirty local `--mode local`, branch/PR `--mode branch --base <base>`, or committed slice `--mode commit --commit <ref>` until no accepted/actionable findings, or record N/A | `autoreview --mode local --engine claude` -> `autoreview clean: no accepted/actionable findings reported`; overall `patch is correct (0.72)`; TruffleHog clean |
| Goal plan complete | yes | Run `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/417-drop-wasted-clear-work.md` | `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/417-drop-wasted-clear-work.md` -> pass |
| Public API / package boundary proof | yes | Source-audit public API, exports, and package boundary impact | `packages/kitcn/src/orm/aggregate-index/index.ts` exports no schema/handler symbols; `rankTreeTable`, `rankNodeTable`, `deleteTreesHandler`, `DeleteTreesResult` are unreachable from any package entry. Only the generated Convex schema is user-visible. |
| Convex bundle/import proof | yes | Audit affected function-entry static graphs or record N/A | `aggregate-core/schema.ts` imports only `convex/values` + `../orm/{builders,indexes,table}`, all already in the ORM graph. Definitions moved between modules, none added; dist total 1577.46 kB. |
| CLI/scaffold/generated proof | yes | Prove command contract and regenerate owned output or record N/A | `bun run fixtures:sync` regenerated 8 fixture `dataModel.d.ts`; `bun run fixtures:check` green. No CLI command contract changed. |
| Release artifact classification | yes | Record whether the change is published package behavior/API/types/config/runtime or no published user-visible delta | Published runtime behavior + generated schema types -> changeset required |
| Published package changeset | yes | If published package users see a delta, load `changeset` and add/update one `.changeset/*.md` per package | `.changeset/lucky-pans-invent.md`, `kitcn: patch`, `## Patches` section per `.agents/rules/changeset.mdc` |
| No release artifact | no | If no artifact is needed, record the exact reason | N/A: an artifact was required and added |
| Package typecheck/build/test | yes | Run owning package checks or record N/A with reason | `bun typecheck`, `bun --cwd packages/kitcn build`, `bun run test` - all green |
| Fixture/scaffold generation | yes | Run `bun run fixtures:sync` and `bun run fixtures:check` when scaffold output changed, otherwise N/A | Both run and green |
| Docs/package skill sync | no | Synchronize current-state public guidance or record N/A | N/A: no public guidance changed |

Phase / pass table:
| Phase | Status | Evidence | Next |
|-------|--------|----------|------|
| Intake and source read | complete | `gh issue view 417`; read `rank-runtime.ts`, `runtime.ts`, `btree.ts`, `backfill.ts`, `lifecycle.ts` | reproduction |
| Reproduction | complete | 2 red tests: 201 vs 15 rank node writes, 15 vs 3 metric bucket writes | implementation |
| Implementation | complete | member loops delete rows only; `deleteTreesHandler` returns `{done, documents}`; rank storage tables unified onto the btree owner | verification |
| Verification | complete | full `bun run test` (1316 bun + 873 vitest, 0 fail), `bun typecheck`, `bun lint:fix`, package build, `fixtures:sync` + `fixtures:check` | review |
| Review | complete | `autoreview --mode local`; findings triaged below | closeout |
| Commit / PR / GitHub sync | complete | `bun check` green, branch renamed, pushed, PR opened with the task-style body, issue synced | closeout |
| Closeout | complete | plan gates closed; `check-complete.mjs` green | final response |

Findings:
- The ORM kept its own transcription of the btree's `aggregate_rank_tree` /
  `aggregate_rank_node` tables and it had drifted: `deletionStack` was missing. The resumable
  tree-drop path was therefore unreachable in the ORM - the per-member deletes collapsed the
  tree to one node, so `deleteTrees(16)` always finished in a single call and never persisted a
  stack. Removing the per-member deletes made it reachable and it crashed immediately.
- `countDocumentReads` exists in `convex/setup.testing.ts` but returns only `{ documents }` and
  counts reads. The waste in #417 is writes (btree node patches), invisible to any read count.
  Added `createWriteCountingDb` in `count.test.ts` on top of the existing `createReadCountingDb`.
- `convex-test` document ids are `<n>;<table>`, so the id-first `db.patch(id, v)` /
  `db.delete(id)` overloads the btree uses can still be attributed to a table.
- `deleteTreesHandler` (`btree.ts:1011`) returns `Promise<boolean>` and returns `true` only on a
  call that finds no tree row. It cannot report work done, so "make the budget honest" requires
  changing that return contract.
- `deleteTreesHandler` processes ONE namespace tree per call (`.take(1)`), so a multi-namespace
  aggregate needs one call per tree plus one final no-op call.
- The CLEARING write barrier is real: `assertAggregateIndexesWritable`
  (`runtime.ts:3090`) is prepended to create/update/delete hooks in `lifecycle.ts:755-770`
  for both metric and rank index names.
- `drainIndexClear` (`backfill.ts:315`) decrements the budget by `Math.max(step.processed, 1)`,
  so a `processed: 0` non-done step still makes progress and cannot spin.

Decisions and tradeoffs:
- Change `deleteTreesHandler`'s return from `boolean` to `{ done, documents }` -> the issue asks
  the tree branch to "report the nodes it actually touched", and a bare boolean cannot. The
  return contract is the real ownership boundary. Risk: internal-only, not exported from any
  package entry (`kitcn/orm/aggregate-index` barrel exports no schema/handler symbols).
- Charge the budget in documents *written*, not documents touched -> writes are the scarcer
  Convex per-mutation resource and `drainIndexClear` already floors the charge at 1, so a
  0-write step still makes progress and cannot spin.
- Pass the caller's `batchSize` to `deleteTrees` instead of the hardcoded 16 -> the member
  branch already deletes `batchSize` rows per call, so the tree branch is now symmetric and the
  shared `clearBudget` is what actually bounds the mutation.
- Do NOT remove the final no-op `deleteTrees` round trip (issue constraint #6) -> `done` still
  means "no tree row found". Detecting "was that the last namespace?" costs one extra read on
  every namespace-completing call to save one call per campaign, and `drainIndexClear` usually
  absorbs that call inside the same mutation. Wrong trade; the issue's complaint is the
  O(N log N) waste, not the O(1) tail.
- Unify the rank storage tables onto `aggregate-core/schema.ts` rather than just adding the
  missing `deletionStack` field -> the btree is the only writer of those tables, so it should
  own their shape. Transcribing them into the ORM is what let `deletionStack` go missing in the
  first place. Same-object reuse also fixes the `kitcn/aggregate` + `rankIndex` collision.
  Cost: the generated validator for `aggregate_rank_node.items[].k/v` narrows from
  `union(null, any)` to `any`, which accepts every document that validated before.
- Do not hand-edit `example/convex/functions/_generated/dataModel.d.ts` -> it is Convex-generated
  and needs a configured deployment. Repo precedent (#398, #337) is that
  `orm/aggregate-index/schema.ts` changes land without regenerating it.

Implementation notes:
- `convex/orm/count.test.ts` gains `createWriteCountingDb`, layered on the existing
  `createReadCountingDb`. Reads cannot see this bug: rewriting a node that is about to be
  deleted changes no query result.
- The pinned invariant is "a clear writes each stored document at most once". That is exact and
  implementation-independent, unlike a magic-number read/write budget.
- Both new tests drive `mode: 'prune'` so the measured writes belong to the clear campaign
  alone; `mode: 'rebuild'` would fold rebuild inserts into the same counts.
- The rank test uses 3 namespaces x 40 rows against `maxNodeSize` 16, which is what forces a
  multi-level tree per namespace and a persisted `deletionStack` at `batchSize` 8. That sizing
  is what surfaced case 9.

Review fixes:
- `autoreview --mode local --engine claude` -> 0 accepted/actionable findings; nothing to fix.
- Reviewer note: "documents-written accounting can exceed `batchSize` by exactly one (the
  tree-row write)" -> accepted as intended and harmless. `drainIndexClear` floors the charge at
  1 and exits the loop as soon as the budget is non-positive, so the worst case is a single
  extra document per mutation.
- Reviewer note: it could not assert from the bundle that no unupdated `deleteTrees` caller
  exists outside it -> verified directly:
  `rg -n 'deleteTrees' packages convex www example fixtures tooling` lists only
  `btree.ts` (definition), `aggregate-core/runtime.ts` (passthrough), `btree.vitest.ts` (updated)
  and `rank-runtime.ts` (updated).

Error attempts:
| Error / failed attempt | Count | Next different move | Resolution |
|------------------------|-------|---------------------|------------|
| `Validator error: Unexpected field 'deletionStack' in object` after removing the per-member deletes | 1 | Stop assuming the ORM's rank tables matched the btree's; diff both definitions instead of patching the symptom | Unified the ORM rank storage tables onto `aggregate-core/schema.ts`, the btree's own definitions |
| A vitest run reported the metric test passing while the same code failed on the next run | 1 | Distrust a pass that lands immediately after editing the file; re-run before drawing conclusions | Stale vitest transform cache; both tests were red on a clean re-run |
| Background audit workflow's agents wrote into the working tree (probe test file, transient `schema.ts` edit) | 1 | Stop the workflow, then verify every source file against HEAD by checksum rather than trusting a re-read | Workflow stopped, `convex/orm/zz417probe.test.ts` deleted, `schema.ts` confirmed byte-identical to HEAD before editing |
| `convex codegen` for `example/` refused without `CONVEX_DEPLOYMENT`; `convex deployment create local` refused in anonymous mode | 3 | Stop trying to provision a deployment; check repo precedent for whether that artifact is regenerated in schema PRs | Recorded as a caveat; #398 and #337 also changed `aggregate-index/schema.ts` without regenerating it |

Verification evidence:
- `bunx vitest run convex/orm/count.test.ts -t "clearing is resumable"` (cwd: repo root) -> 7 passed, 30 skipped. Before the fix: 2 failed (201 vs 15 node writes; 15 vs 3 bucket writes).
- `bunx vitest run packages/kitcn/src/aggregate-core/btree.vitest.ts` (repo root) -> 18 passed.
- `bun test packages/kitcn/src/orm/schema-integration.test.ts` (repo root) -> 25 passed.
- `bun run test` (repo root) -> `bun test` 1316 pass / 0 fail across 148 files; `vitest run` 873 passed / 13 skipped across 84 files; no type errors.
- `bun typecheck` (repo root) -> 5 packages successful.
- `bun lint:fix` (repo root) -> clean, no fixes applied.
- `bun --cwd packages/kitcn build` -> 71 files, 1577.46 kB total.
- `bun run fixtures:sync` then `bun run fixtures:check` (repo root) -> "matches fresh `kitcn init` output" for all 8 fixtures.
- `bun check` (repo root, pre-PR gate) -> exit 0. Covers `bun lint`, `bun typecheck`, `bun run test`, `test:cli`, `test:concave`, `fixtures:check`, `test:verify`, `test:runtime`.
- Source audit: `rg -n 'deleteIfExists' packages/kitcn/src/orm/aggregate-index/rank-runtime.ts` -> no hits.
- Source audit: `aggregate-core/schema.ts` imports only `convex/values` + `../orm/{builders,indexes,table}`, all already in the ORM graph, so folding the rank tables onto it adds no transitive import to any Convex entry.

Source-listed case matrix:
| Case | Source claim | Harness | Before | Expected after | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Member loop pays a btree descent + patches per member | `count.test.ts` "drops a multi-namespace rank btree without rewriting the nodes it deletes" | 201 node writes / 15 nodes | 15 | green: `writes.get('aggregate_rank_node') === nodesBefore` | done |
| 2 | Stale doc comment asserts the opposite invariant | source audit `rank-runtime.ts:355-371` | contradicted the code | rewritten to state the new invariant + why it is safe | `git diff` | done |
| 3 | `reconcileRankMembership` must keep its btree delete | source audit + rank suites in `count.test.ts` | `aggregate.delete` present | unchanged | `git diff` shows no hunk in `reconcileRankMembership`; rank rebuild tests green | done |
| 4 | Branch order load-bearing (members drain before tree drop) | source audit + drain-to-zero assertions | ordered | unchanged | members/trees/nodes all 0 after drain in the new multi-namespace test | done |
| 5 | `isIndexStateDrained` ordering preserved | source audit `runtime.ts:3131-3173` | members then tree | untouched | `git diff` has no hunk in that range | done |
| 6 | Tree branch over-charges budget and ignores `batchSize` | `btree.vitest.ts` "bounds aggregate cleanup by nodes within one tree" | reported 16 always | `documents === before.length + writingCalls`, `limit` = caller `batchSize` | green | done |
| 7 | `clearCountIndexChunk` flushes deltas into buckets it then deletes | `count.test.ts` "drops metric buckets and extrema without decrementing them first" | 15 bucket writes / 3 buckets | 3 | green | done |
| 8 | Existing backfill-drain tests stay green | `count.test.ts` describe "aggregateIndex clearing is resumable" | 5 passed | 5 passed | 7 passed (5 existing + 2 new) | done |
| 9 | (found during work) ORM rank tree schema had no `deletionStack`, so a resumable tree drop crashed | `count.test.ts` multi-namespace rank test with `batchSize` 8 vs 15 nodes | `Validator error: Unexpected field 'deletionStack' in object` | drains clean | schema unified onto the btree-owned tables; test green | done |
| 10 | (found during work) declaring `kitcn/aggregate` storage tables next to a `rankIndex` threw a duplicate-name error | `schema-integration.test.ts` "defineSchema accepts a declared table an extension injects by identity" | threw | accepted | green | done |

High-risk note:
- Realistic failure mode: a clear that leaves stored state behind while the index reports
  READY, so `count()` / `aggregate()` / `rank()` answer from rows no document backs.
- Why the boundary holds: the intermediate "members gone, tree/buckets still populated" state
  was already illegal to exit. `setCountState` calls `isIndexStateDrained`, which checks members
  first and then the tree row (rank) or bucket + extrema rows (metric), and refuses to leave
  CLEARING while any survive. `backfill.ts` deletes a state row directly only after
  `drainIndexClear` returned true. Neither ordering was touched.
- Why nothing can observe the intermediate state: writes are rejected by
  `assertAggregateIndexesWritable`, prepended to every create/update/delete hook in
  `lifecycle.ts`; reads are rejected by `ensureIndexReady` / `ensureRankIndexReady`, which
  require READY.
- Proof: the new multi-namespace test drives a clear to completion and asserts zero members,
  zero tree rows and zero node rows; the two pre-existing "keeps a ... index CLEARING when a
  metric change lands mid-drain" tests still assert everything is gone at the first BUILDING.

Final handoff contract:
- Commit line: `7cd7a13a` on `fix/drop-wasted-aggregate-index-clear-work`
- PR line: https://github.com/udecode/kitcn/pull/424
- Issue line: https://github.com/udecode/kitcn/issues/417#issuecomment-5376319181
- Confidence line: 95-100%
- Flow table:
  - Reproduced: tests 2 failing harnesses with measured baselines, browser N/A
  - Verified: tests full suite green (1316 bun + 873 vitest, 0 fail), browser N/A
- Browser check: N/A: server-side ORM internals, no rendered output
- Outcome: rank and metric index clears no longer rewrite the stored documents they are about
  to delete (201 -> 15 btree node writes for 120 members over 3 partitions; 15 -> 3 bucket
  writes); the tree-drop budget now reports real work and honors the caller's `batchSize`; a
  latent `deletionStack` schema drift that would have crashed any large rank clear is fixed.
- Caveat: `example/convex/functions/_generated/dataModel.d.ts` still carries the pre-change
  types and needs a configured Convex deployment to regenerate; it self-heals on the next
  `kitcn dev`. The 8 committed fixtures were regenerated and `fixtures:check` is green.
- Design:
  - Chosen boundary: the two clear-chunk member branches, `deleteTreesHandler`'s return
    contract, and the single owner of the btree storage schema.
  - Why not quick patch: dropping only `deleteIfExists` leaves the budget lying and crashes on
    the first tree that needs a persisted `deletionStack`; adding the missing field to the ORM
    copy would leave the duplicate definition free to drift again.
  - Why not broader change: `reconcileRankMembership`, `isIndexStateDrained`'s ordering and the
    backfill state machine were left untouched - they are what make the intermediate state
    safe, so changing them would remove the guarantee the fix relies on.
- Verified: `bun run test`, `bun typecheck`, `bun lint:fix`, `bun --cwd packages/kitcn build`,
  `bun run fixtures:sync`, `bun run fixtures:check`, `autoreview --mode local`
- PR body verified: yes, `gh pr view 424 --json body`; PR #270 format, auto-release block preserved, no self-link

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
- Commit: `7cd7a13a`
- PR: https://github.com/udecode/kitcn/pull/424
- Issue: #417 synced
- Browser proof: N/A: no browser surface
- Caveats: `example/convex/functions/_generated/dataModel.d.ts` regeneration needs a Convex deployment

Timeline:
- 2026-08-21T21:23:19.923Z Task goal plan created.
- Read issue #417 via `gh issue view 417` (no comments) and the linked source files.
- Built two red harnesses measuring per-table document writes across a whole clear campaign.
  Baseline: rank 201 node writes for 15 nodes; metric 15 bucket writes for 3 buckets.
- Removed the per-member `deleteIfExists` and the per-member delta flush; made the tree branch
  honor `batchSize` and report real work.
- Red test then exposed `Validator error: Unexpected field 'deletionStack'` -> the ORM had a
  drifted transcription of the btree's tree table. Unified the definitions.
- A background audit workflow's agents mutated the working tree (a probe test file, and a
  transient edit to `aggregate-index/schema.ts`). Stopped the workflow, verified every source
  file against HEAD by checksum, and deleted `convex/orm/zz417probe.test.ts`. Also reverted an
  unrelated `example/.../procedure-names.gen.ts` line-number drift a codegen attempt produced.
- Regenerated the 8 committed fixtures and re-ran the full suite.

Reboot status:
| Question | Answer |
|----------|--------|
| Where am I? | Closeout complete; committed and pushed on `fix/drop-wasted-aggregate-index-clear-work`, PR open |
| Where am I going? | Nothing further; awaiting PR review |
| What is the goal? | Stop aggregate-index clear paths rewriting state they are about to delete, with drain still provably complete |
| What have I learned? | The ORM kept a drifted transcription of the btree's storage tables; removing the wasted deletes made that latent `deletionStack` bug reachable. See Findings. |
| What have I done? | Fixed both clear paths, made the tree-drop budget honest, unified the rank storage schema, added 3 regression tests, regenerated fixtures, added a changeset. |

Open risks:
- `example/convex/functions/_generated/dataModel.d.ts` still carries the pre-change
  `aggregate_rank_tree` / `aggregate_rank_node` types. Regenerating it needs a configured Convex
  deployment (`convex deployment create local` is refused in anonymous mode here). It does not
  affect `bun typecheck`, `bun run test`, `bun lint`, or `bun run fixtures:check`, all green, and
  it self-heals on the next `kitcn dev` / `kitcn codegen` run. The 8 committed fixtures WERE
  regenerated and `fixtures:check` passes.
- Existing deployments that already hold rank btree rows get an additive optional field
  (`deletionStack`) and a widened `items[].k/v` validator. Both accept every document that
  validated before, so no data migration is required.

Hard closeout guard:
- A local-only final response for verified code-changing work is invalid unless
  this plan records an explicit user decline, no local patch, analytical/
  blocked/inconclusive outcome, or a real commit/PR blocker.
