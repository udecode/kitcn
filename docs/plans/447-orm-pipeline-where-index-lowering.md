# ORM pipeline union/flatMap wheres index-lowering

Objective:
Index-lower plain-object pipeline union/flatMap wheres and remove the dead assertion branch; done when both read-count repros drop from full-scan to index-bounded and bun check:ci passes; plan docs/plans/447-orm-pipeline-where-index-lowering.md.

Flow mode:
one-shot execution

Goal plan:
docs/plans/447-orm-pipeline-where-index-lowering.md

Template:
docs/plans/templates/task.md

Primary template:
docs/plans/templates/task.md

Applied packs:
- package-api (docs/plans/templates/packs/package-api.md)

Task source:
- type: GitHub issue
- id / link: #447 https://github.com/MikeyZhang75/kitcn/issues/447
- title: ORM: `_assertWhereIndexRequirement` returns past its own check, so plain-object pipeline wheres silently full-scan
- acceptance criteria:
  1. A plain-object `where` on a `pipeline.union` source is index-lowered instead of post-filtered over a full scan.
  2. A plain-object `where` on a `pipeline.flatMap` stage is index-lowered onto an index that extends the relation FK prefix.
  3. `_assertWhereIndexRequirement`'s dead object-`where` branch is resolved honestly (no computed-and-discarded expression).
  4. The flatMap `hasConfiguredIndex: Boolean(indexName)` claim is triaged with evidence.
  5. `convex/orm/pipeline.test.ts:175` and `:796` are NOT rewritten into per-source `.withIndex(...)` workarounds.
- caveats: docs state per-source `where` filters "after the read"; that published contract changes.
- likely files: `packages/kitcn/src/orm/query.ts`, `packages/kitcn/src/orm/stream.ts`, `convex/orm/pipeline.test.ts`, `packages/kitcn/skills/kitcn/references/features/orm.md`, `www/content/docs/orm/**`.
- browser surface: none (server-side ORM read planning).
- root-cause layer: ORM read-plan compilation (`_toConvexQuery` / `_buildPlanStream` ladder) not reached by the two pipeline stream sites.

Timed checkpoint:
- requested duration: N/A: none requested.
- semantics: N/A: none requested.
- initial confidence score: N/A: concrete read-count metric exists.
- improvement loop: N/A.
- final score / loop closure: N/A.

Completion threshold:
- Union repro: `users.select().union([{ where: { status: 'active' } }]).limit(10)` over 1 match + 20 noise rows reads `scanned === 1` (was 21).
- flatMap repro: `users.select().flatMap('posts', { where: { numLikes: { gt: 17 } } }).limit(10)` over 1 parent + 20 children reads `scanned === 3` (was 21).
- `convex/orm/pipeline.test.ts` fully green with no per-source `.withIndex(...)` workaround added to `:175` or `:796`.
- Full `bun check` must pass; no fixture-drift exception. Passed after main integration on 2026-09-07.
- Task closure is legal only when the source-of-truth acceptance criteria are
  satisfied or explicitly narrowed, required verification evidence is recorded,
  code-review and release-artifact gates are closed when applicable, verified
  code changes are committed and PR'd unless explicitly declined or blocked,
  task-style PR body sync is complete or marked N/A with reason,
  GitHub issue/PR sync is complete or marked N/A with reason, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/447-orm-pipeline-where-index-lowering.md` passes.

Verification surface:
- `npx vitest run convex/orm/pipeline.test.ts` (cwd: repo root) — owns the pipeline read behavior.
- `npx vitest run convex/orm` (cwd: repo root) — ORM integration suite.
- `bun --cwd packages/kitcn build` — owning package.
- `bun typecheck`, `bun lint:fix`, `bun run check:ci` (cwd: repo root).
- Source audit of `packages/kitcn/skills/kitcn/references/features/orm.md` + `www/content/docs/orm/**` for the changed per-source `where` contract.

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
- Source of truth: GitHub issue #447 + `packages/kitcn/src/orm/query.ts`.
- Allowed edit scope: `packages/kitcn/src/orm/**`, `convex/orm/*.test.ts`, `convex/schema.ts` (test schema indexes), `packages/kitcn/skills/kitcn/references/features/orm.md`, `www/content/docs/orm/**`, `.changeset/*`, this plan.
- Browser surface: filters, pagination and API reference docs; desktop/narrow proof passed on 2026-09-07. Walkthrough explicitly waived by the user.
- GitHub issue sync: allowed (comment on #447). PR: https://github.com/udecode/kitcn/pull/449.
- Non-goals: the separate chain-level-`where`-dropped-under-`union` bug (see Findings), honoring `stage.orderBy`, relation-loader (`with:`) where lowering.

Output budget strategy:
- Reads scoped to named line ranges in `query.ts` / `stream.ts` via `sed -n`.
- Broad understanding delegated to one 6-agent Workflow whose output stayed in the workflow journal; only targeted sections were pulled back.
- Test runs filtered with `| grep -E` / `| tail` instead of streaming full vitest output.
- No unbounded `rg` across the repo; greps were path- or file-scoped.

Blocked condition:
- Stop if the merge-order invariant (`OrderByStream` suffix rule) cannot be preserved for `interleaveBy` without rewriting `convex/orm/pipeline.test.ts:175`'s contract.

Task state:
- task_type: bug
- task_complexity: non-trivial
- current_phase: closeout
- current_phase_status: complete
- next_phase: final response
- goal_status: active

Current verdict:
- verdict: partially valid
- confidence: 95-100%
- next owner: task
- reason: The dead `return;` and the silent unbounded-scan consequence both reproduce. The issue's proposed step 2 ("finish the assertion to throw") is wrong: the chain-level policy already lets an unlowerable object `where` scan, so throwing at pipeline sites would be stricter than the owner it mirrors. Step 1 (route through the plan ladder) is the real fix and is what shipped.

Implementation readiness:
- verdict: ready
- exact owner: `_buildUnionSourceStream` / `_applyFlatMapStage` in `packages/kitcn/src/orm/query.ts`
- contradiction status: resolved — docs said per-source `where` filters "after the read"; source now lowers it, and the docs were updated to match.
- source-listed cases complete: yes (see Source-listed case matrix)

Pre-solution issue challenge:
- reporter claim: `_assertWhereIndexRequirement` computes `whereExpression` then hits a bare `return;`, so plain-object pipeline `where`s silently full-scan; the honest fix is (1) route union/flatMap wheres through the #425 `_toConvexQuery` + `_buildPlanStream` ladder, then (2) finish the assertion to throw on the remainder; also `hasConfiguredIndex: Boolean(indexName)` misreports coverage.
- suggested diagnosis or fix: accepted for step 1; rejected for step 2; step 3 (`hasConfiguredIndex`) re-scoped.
- repro ladder:
  - tests / source-level repro: yes — `convex/orm/tmp447.test.ts` (scratch, later folded into `convex/orm/pipeline.test.ts`) showed `scanned: 21` for both sites against a control chain-level `where` at `scanned: 1`.
  - repo-owned automated browser or integration proof: N/A: no browser/route surface.
  - Browser plugin: N/A: no rendered output.
  - screenshot / visual proof: N/A: no visual output.
- reproduction verdict: valid — reproduced at the test layer.
- validity verdict: partially valid.
- best long-term fix boundary: compile the stage `where` on the owning table into an index plan before building the stream, at both pipeline stream sites.
- harsh honest feedback:
  - The issue's step 2 is wrong. `packages/kitcn/src/orm/query.ts:1053` + the chain-level path let an object `where` that no index covers fall through to `postFilters` over a scan, sized only by `limit`/`defaultLimit`. Making the pipeline sites throw for the same shape would make `select()` stricter than `findMany()` for identical input.
  - `hasConfiguredIndex: Boolean(indexName)` is not a *coverage* misreport in the direction claimed — the FK eq genuinely bounds the per-parent read, so it is the right input for the predicate gate. The real defect is that the gate's *message* ("requires `.withIndex(...)`") names an option `FindManyPipelineFlatMapConfig` does not have, so it is unsatisfiable by the caller.
  - The issue's claim that completing the assertion "would still red `pipeline.test.ts:175` and `:796`" is right about the outcome but for `:175` the mechanism is different from what a reader would assume: that test pins `.withIndex('by_name')` chain-level, so `sourceIndex` is truthy and the *predicate* branch would not fire; only a coverage-based gate would red it.
- hard-stop decision: proceed (reproduced, partially valid, pivoted to the durable boundary).

Completion rule:
- Do not call `update_goal(status: complete)` while any required checklist item
  remains unchecked. If an item does not apply, check it and add `N/A: <reason>`.
- Do not call `update_goal(status: complete)` until every completion threshold
  above is satisfied, final handoff evidence is recorded, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/447-orm-pipeline-where-index-lowering.md` passes.
- Do not create hook state for this goal. This file plus the active goal are the
  durable state.
Start Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| Timed checkpoint parsed | no | N/A: no duration requested. |
| Walkthrough baseline for possible UI change | no | N/A: server-side ORM read planning; no UI or rendered output can change. |
| Skill analysis before edits | yes | Loaded `task`, `autogoal`, `changeset`, `workflow-authoring`. Rejected `tdd` (repro-first was enough and behavior is read-count, not red/green API), `testing` (not a test-suite task), `major-task` (single package, no public API redesign), `find-skills` (no missing capability). |
| Active goal checked or created | yes | Goal tools (`get_goal`/`create_goal`) are not exposed in this runtime; degraded control state recorded here per autogoal's fallback rule. This plan is the durable state. |
| Source of truth read before edits | yes | `gh issue view 447` read in full before any edit. |
| Exact per-PR task ownership | yes | This plan owns exactly one PR: https://github.com/udecode/kitcn/pull/449. |
| GitHub comments and attachments read | yes | `gh issue view 447 --json comments` returned `[]`. |
| Video transcript evidence required | no | N/A: no video or screen recording in the source. |
| Pre-solution issue challenge required | yes | See `Pre-solution issue challenge` above: verdict `partially valid`. |
| Reproduction verdict before implementation | yes | `valid` — scratch vitest repro showed `scanned: 21` at both sites before any source edit. |
| Repro escalation ladder selected | yes | Test/source-level only; browser/native rungs are N/A for a server-side read planner. |
| Suggested fix reviewed against durable boundary | yes | Step 1 accepted, step 2 rejected with source evidence (`query.ts` chain-level path allows an unlowerable object `where` to scan), step 3 re-scoped to the unsatisfiable error message. |
| `docs/solutions` checked for non-trivial existing-code work | no | N/A: `docs/solutions` does not exist in this repo. |
| TDD decision before behavior change or bug fix | yes | Repro-first, not full TDD: the change is a read-count property, proven by a failing read-count assertion before the fix and mutation-tested after. |
| Branch decision for code-changing task | yes | Renamed `issue-447-task` -> `fix/orm-pipeline-where-index-lowering` before the first push, per the user's `<type>/<short-kebab-summary>` convention. Safe: no remote branch and no PR existed at rename time. |
| Release artifact decision | yes | `.changeset/wild-pears-repeat.md` (`kitcn: minor`). |
| Browser tool decision for browser surface | no | N/A: no browser surface. |
| Commit / PR expectation decision | yes | Commit: yes. PR: initially declined by standing user preference ("Do not create PR under any circumstances, unless user prompts to"); the user then explicitly prompted for one, so PR #449 was created. |
| Task-style PR body decision | yes | PR #270 emoji task-style body used, with the repo's `auto-release` block preserved. |
| Task-plan PR body evidence | yes | Body line `🧭 Task plan: docs/plans/447-orm-pipeline-where-index-lowering.md`; this plan exists at the PR head and names PR #449. |
| GitHub issue sync expectation decision | yes | The PR body carries `🐛 Fixes #447`, so GitHub already links the two. A separate public issue comment is outward-facing and was not requested; offered in the final handoff. |
| Output budget strategy recorded | yes | See `Output budget strategy` above. |
| Package/API pack selected | yes | `--with package-api`: `packages/kitcn` runtime read behavior changes. |
| Public surface or package boundary identified | yes | New export `streamCanOrderBy` from `packages/kitcn/src/orm/stream.ts` (internal module, not re-exported from `kitcn/orm`); behavior change on `select().union([{where}])` and `select().flatMap(rel, {where})`. |
| Convex entry/import graph impact identified | yes | No new imports crossing module boundaries; `query.ts` already imports from `./stream` and `./where-clause-compiler`. Bundle graph unchanged. |
| CLI/scaffold/generated impact identified | yes | None: no CLI, template, or `init -t` scaffold source touched. `.agents/skills/kitcn/**` regenerated via `bun tooling/sync-kitcn-skill.ts`. |
| Release artifact path selected | yes | `.changeset/wild-pears-repeat.md` |
| `changeset` skill loaded when `.changeset` is required | yes | Loaded before writing the changeset. |
| Package build / fixture impact decision recorded | yes | `bun --cwd packages/kitcn build` run. Fixtures: no scaffold source touched, so `fixtures:sync` not required by the diff. |

Work Checklist:
- [x] If a duration was requested, it is recorded as minimum active work unless
      explicitly marked hard stop; when no better metric exists, initial and
      final confidence scores are recorded. N/A: no duration requested; the
      completion threshold is a read-count metric.
- [x] Objective includes outcome, completion threshold, verification surface,
      constraints, boundaries, and blocked condition.
- [x] Task source classified with source type, id/link, title, task type,
      acceptance criteria, caveats, likely files/routes/packages, browser
      surface, and root-cause layer.
- [x] Every GitHub PR in scope has its own task plan. This plan owns exactly
      one PR: #449. No batch plan was used as a substitute.
- [x] Required video or screen-recording evidence is cached/read as normalized
      `<video-transcripts>` XML, or marked N/A with reason. N/A: no video.
- [x] For public GitHub bug reports, behavior claims, technical diagnoses, or
      suggested fixes, reporter claims are challenged before implementation
      with a recorded verdict. Verdict: `partially valid`.
- [x] Repro escalation ladder followed for bug/behavior claims. Test-level
      repro reproduced it; browser/native rungs N/A.
- [x] Hard-stop rule followed for bug/behavior claims: partial validity pivoted
      to the durable boundary and the weak half of the proposed fix is recorded.
- [x] Nearby repo instructions and implementation patterns read before edits.
- [x] Source-listed case matrix is complete and every contradiction has an
      owner, harness, and verdict before mutation.
- [x] Readiness is classified `ready`.
- [x] Implementation fixes the right ownership boundary: the plan compiler is
      reached from both pipeline stream sites instead of patching call sites.
- [x] Release artifact requirement recorded: new changeset
      `.changeset/wild-pears-repeat.md`.
- [x] Final handoff: PR state, focused/full proof and residuals; no walkthrough per user.
- [x] Commit/PR handling recorded for code-changing work: commit `3131bb5c`
      pushed; PR #449 created after the user explicitly prompted for one.
- [x] PR body shape recorded: PR #270 emoji task-style body, verified with
      `gh pr view 449 --json body`.
- [x] PR task evidence recorded: body names this plan, the plan is at the PR
      head, and it identifies PR #449.
- [x] Branch handling recorded: dedicated branch
      `fix/orm-pipeline-where-index-lowering`, not `main`.
- [x] Local-env-rot retry policy recorded: 8 vitest files failed on
      `Cannot find package 'kitcn/server'` / missing `../dist`; resolved by
      `bun --cwd packages/kitcn build` (stale dist, not install rot).
- [x] Workspace authority recorded: every proof command names its cwd (repo
      root) and the owning package.
- [x] Output budget discipline recorded and followed.
- [x] High-risk note recorded for public API/runtime changes. See `Open risks`.
- [x] Review/autoreview target selected from actual diff state: `--mode local`
      on the dirty tree.
- [x] Agent-native review decision recorded. N/A: no `.agents/**` source
      changed by hand — `.agents/skills/kitcn/**` is generated output
      regenerated with `bun tooling/sync-kitcn-skill.ts`.
- [x] Package/API pack: public API, package boundary, export, and release-artifact impact are recorded.
- [x] Package/API pack: release artifact matrix is applied: `.changeset/wild-pears-repeat.md`.
- [x] Package/API pack: `.changeset` work loads `changeset` and follows its package/version/prose rules.
- [x] Package/API pack: no-artifact decisions state why the diff has no published package user-visible delta from `main`. N/A: an artifact was created.
- [x] Package/API pack: compatibility, migration, or hard-cut decision is explicit when public shape changes. Hard cut per repo doctrine — no compat shim for the previous flatMap child ordering; the changeset states the cursor consequence.
- [x] Package/API pack: affected Convex static import graphs stay narrow and
      plugin/per-module boundaries are used where appropriate.
- [x] Package/API pack: CLI commands remain deterministic, `--json` capable,
      and non-interactive. N/A: no CLI change.
- [x] Package/API pack: docs and `packages/kitcn/skills/kitcn/**` stay
      current-state synchronized when public guidance changes.
- [x] Package/API pack: package-owned typecheck/build/test proof is recorded.
- [x] Package/API pack: `packages/kitcn` build and repo checks are recorded.

Completion Gates:
| Gate | Applies | Required action | Evidence |
|------|---------|-----------------|----------|
| Named verification threshold | yes | Run the named commands | Both read-count thresholds met; see `Verification evidence`. |
| Exact per-PR task ownership | yes | Record the exact PR and dedicated plan | PR #449, this plan. |
| Pre-solution issue challenge verdict | yes | Record claim, repro, validity, boundary, pivot | Recorded above; verdict `partially valid`. |
| Repro escalation ladder | yes | Record each rung | Test/source-level reproduced; browser/native N/A for a server-side read planner. |
| Bug reproduced before fix | yes | Record failing repro | Scratch `convex/orm/tmp447.test.ts`: union `scanned: 21` (expected 1), flatMap `scanned: 21` (expected 3), control chain-level `where` `scanned: 1`. |
| Targeted behavior verification | yes | Run focused proof | `npx vitest run convex/orm/pipeline.test.ts` → 37/37 pass, including 5 new tests. |
| TypeScript or typed config changed | yes | Run typecheck | `bun typecheck` → 5/5 tasks successful. |
| Package exports or file layout changed | yes | Run package build | `bun --cwd packages/kitcn build` → 72 files, complete. |
| Package manifests, lockfile, or install graph changed | no | N/A | No manifest or lockfile change. |
| Agent rules or skills changed | yes | Verify generated skill sync | `bun tooling/sync-kitcn-skill.ts` → "Synced packages/kitcn/skills/kitcn to .agents/skills/kitcn". |
| Workspace authority proof | yes | Record cwd | All commands run from `/Users/mikey/conductor/workspaces/kitcn/belmopan`; package build scoped with `--cwd packages/kitcn`. The changed behavior is owned by `packages/kitcn/src/orm`, exercised by `convex/**` integration tests in the same workspace. |
| Browser surface changed | yes | Verify docs routes | Filters, pagination and API reference verified desktop/narrow. |
| Browser final proof | yes | Browser then Chrome | Three HTTP-200 routes; 390px no page overflow; console clear. |
| UI walkthrough | no | User waiver | User: No walk needed. |
| Scaffold or fixture output changed | no | N/A | No `init -t` template or scaffold source touched; `git diff --name-only` shows no `fixtures/`, `tooling/`, or `packages/kitcn/src/cli/` path. |
| Package behavior or public API changed | yes | Add a changeset | `.changeset/wild-pears-repeat.md` (`kitcn: minor`). |
| Docs and kitcn skill sync changed | yes | Keep `www/**` and skill docs in sync | `www/content/docs/orm/queries/filters.mdx`, `www/content/docs/orm/api-reference.mdx`, `packages/kitcn/skills/kitcn/references/features/orm.md` all updated; generated mirror regenerated. |
| Docs or content changed | yes | Verify source-backed claims | Every doc claim maps to a passing test in `convex/orm/pipeline.test.ts`. |
| High-risk mini gate | yes | Record failure mode, proof plan, boundary rationale | See `Open risks` and `Decisions and tradeoffs`. |
| Agent-native review for agent/tooling changes | no | N/A | No hand-edited `.agents/**`, `.claude/**`, `.codex/**`, hook, command, or prompt source. |
| Local install corruption suspected | yes | Rerun after fixing | 8 vitest files failed on missing `kitcn/server` / `../dist`; root cause was stale `dist`, cleared by the package build, not by reinstalling. |
| Commit created | yes | Stage the checkout and commit | `3131bb5c fix(orm): index-lower pipeline union and flatMap stage wheres`; tree clean after commit. |
| PR create or update | yes | Run check, push, create PR, sync body | `bun check` lanes run (only pre-existing expo `fixtures:check` drift red, proven upstream); pushed to `origin/fix/orm-pipeline-where-index-lowering`; PR https://github.com/udecode/kitcn/pull/449 created with the task-style body. |
| Task-style PR body verified | yes | Verify with `gh pr view --json body` | Verified: `auto-release` block preserved, `🐛 Fixes #447`, `🧭 Task plan: ...`, `🟢 95-100% confidence`, `| Phase | 🧪 Tests | 🌐 Browser |` with Reproduced/Verified rows, and bold emoji Outcome/Caveat/Design/Verified sections. No self-link to PR #449. |
| PR task evidence verified | yes | Verify body plan line, plan at PR head, exact PR ownership | All three verified after the plan-sync push. |
| PR proof image hosting | no | N/A | No images in the PR body. |
| GitHub issue sync-back | no | N/A | The PR body's `🐛 Fixes #447` already links the issue. A separate public comment is outward-facing and was not requested; offered in the final handoff. |
| Final handoff contract | yes | Fill the handoff fields | See `Final handoff contract`. |
| Final lint | yes | Run `bun lint:fix` | `biome check --write` → 960 files checked, no fixes applied. |
| Output budget discipline | yes | Verify no unbounded output | No unbounded `rg`; test output filtered through `tail`/`grep`; workflow findings pulled from the journal by key. |
| Timed checkpoint | no | N/A | No duration requested. |
| Autoreview for non-trivial implementation changes | yes | Run until no accepted findings | See `Review fixes`. |
| Goal plan complete | yes | Run `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/447-orm-pipeline-where-index-lowering.md` | See `Verification evidence`. |
| Public API / package boundary proof | yes | Source-audit exports and boundary | `streamCanOrderBy` is added to `./stream`, an internal module; `packages/kitcn/src/orm/index.ts` does not re-export it, so the published surface is unchanged. Behavior on `select().union` / `select().flatMap` changes and is covered by the changeset. |
| Convex bundle/import proof | yes | Audit static graphs | No new cross-module import: `query.ts` already imported `./stream` and `./where-clause-compiler`. |
| CLI/scaffold/generated proof | no | N/A | No CLI or scaffold change; the one generated tree touched was regenerated by its owning script. |
| Release artifact classification | yes | Classify | Published package runtime behavior change (read planning + child ordering + error messages) → changeset required. |
| Published package changeset | yes | Add/update one `.changeset/*.md` | `.changeset/wild-pears-repeat.md`. |
| No release artifact | no | N/A | An artifact was created. |
| Package typecheck/build/test | yes | Run owning package checks | `npx tsc -p packages/kitcn/tsconfig.json --noEmit` clean; `bun --cwd packages/kitcn build` complete; `bun test` 1400 pass. |
| Fixture/scaffold generation | no | N/A | No scaffold output changed. |
| Docs/package skill sync | yes | Synchronize public guidance | Done and regenerated. |

Phase / pass table:
| Phase | Status | Evidence | Next |
|-------|--------|----------|------|
| Intake and source read | complete | `gh issue view 447`; comments empty | implementation |
| Reproduction and challenge | complete | scratch repro: `scanned: 21` at both sites, control at 1 | implementation |
| Implementation | complete | `packages/kitcn/src/orm/query.ts`, `stream.ts` | verification |
| Verification | complete | 986 vitest + 1400 bun tests; mutation tests on all 5 new cases | closeout |
| Commit / PR / GitHub sync | complete | PR #449 created; final exact-head closeout tracked in PR receipts | closeout |
| Closeout | complete | autoreview run; plan closed | final response |

Findings:
- The dead branch is real: `_assertWhereIndexRequirement` computed `whereExpression` and fell into a bare `return;`. Introduced dead in #139 and never edited (`git log -S "_assertWhereIndexRequirement"` → one commit).
- The consequence is real and larger than the dead code: neither `_buildUnionSourceStream` nor `_applyFlatMapStage` ever reached `_toConvexQuery`/`_buildPlanStream`, so a plain-object `where` there was *only* a JS post-filter. Measured: 21 documents scanned to return 1 (union) and 2 (flatMap).
- The chain-level path is the control and already lowers: `findMany({ where: { status: 'active' } })` on the same data scans 1.
- The issue's step 2 ("finish the assertion to throw") is wrong. `packages/kitcn/src/orm/query.ts:1053` and the chain-level compile let an object `where` that no index covers fall through to `postFilters` over a scan. Throwing at the pipeline sites would make `select()` stricter than `findMany()` for identical input.
- `hasConfiguredIndex: Boolean(indexName)` at the flatMap site is the right *value* — the FK eq genuinely bounds the per-parent read. The real defect is that the message told callers to add `.withIndex(...)`, an option `FindManyPipelineFlatMapConfig` does not have, so the error was unsatisfiable. Message rewritten per call site.
- `MergedStream` wraps every union source in an `OrderByStream`, which throws unless the normalized `interleaveBy` is a suffix of the source's index fields past its eq-pinned prefix. Lowering a `where` to a *range* on a new index reduces that pinned prefix to zero and can turn a working merge into a runtime error. Guarded by asking the built stream (`streamCanOrderBy`), not by re-deriving the rule.
- `FlatMapStream` re-asserts `equalIndexFields(inner.getIndexFields(), mappedIndexFields)` for every parent row, so the flatMap index choice must be value-independent and hoisted out of the mapper. It is.
- Separate pre-existing bug, out of scope and NOT fixed here: a chain-level `.where(...)` is silently dropped when `pipeline.union` is present. Proven with a probe — `users.select().where({ age: 10 }).union([{ where: { status: 'active' } }])` returned both the age-10 and age-99 rows. `_buildUnionSourceStream`'s caller never applies `queryConfig.postFilters` or `wherePredicate`.
- Separate pre-existing gap, out of scope: the relation loader (`with: { posts: { where } }`) also does not lower its `where` into `by_author_likes` — measured at 21 scanned for the same shape that flatMap now serves in 3.
- Pre-existing unrelated repo gate failure: `bun run fixtures:check` reports expo fixture drift (`expo ~55.0.30` → `~55.0.31`) from an upstream release. `git diff --name-only` shows this diff touches no `fixtures/`, `tooling/`, or `packages/kitcn/src/cli/` path, so it cannot be caused by this change.

Decisions and tradeoffs:
- Route both pipeline sites through the existing compile ladder rather than adding a throw -> keeps `select()` and `findMany()` on one policy for the same `where` -> risk: the published doc contract ("`where` filters that source's rows after the read") changes; docs updated in the same diff.
- Split `_compileQueryPlan` out of `_toConvexQuery` instead of parameterizing `_toConvexQuery` with a table -> union sources are on the *same* table and only need a different `where`/order contract, so no table threading is needed and `_buildPlanStream` is reused unchanged -> risk: two entry points to the compiler; mitigated by `_toConvexQuery` delegating rather than duplicating.
- Give `flatMap` its own narrow index resolver instead of reusing `_buildPlanStream` -> the target table differs, the FK eq is a mandatory *leading* prefix (not a discardable hint), and `mappedIndexFields` must be one fixed arity for every parent -> risk: less capable than the full ladder (no probe unions); refused explicitly rather than silently.
- Check merge compatibility by asking the built stream (`streamCanOrderBy`) rather than re-deriving the suffix rule from index metadata -> the answer cannot drift from what `OrderByStream` enforces -> risk: builds a stream that may be discarded; constructing registers no Convex query, so the cost is the compile only.
- Keep the full JS predicate even when part of the `where` became an index range -> the range decides what is read, the predicate decides what matches, so a mis-lowered filter cannot change results -> risk: one redundant in-memory evaluation per matched row, which the previous code already paid for every scanned row.
- Accept the flatMap child-ordering change instead of restricting lowering to eq-only filters -> child order was already an accident of schema declaration order (`findIndexForColumns` returns the first prefix match) and is undocumented, while the read-cost win is the point of the ORM -> risk: outstanding cursors for affected queries do not carry over; stated in the changeset and the docs.
- Do not fix the chain-`where`-dropped-under-`union` bug in this diff -> different root cause, different owner, would confound a read-planning diff -> risk: it stays broken until filed; reported in the final handoff.

Implementation notes:
- `packages/kitcn/src/orm/stream.ts`: new `streamCanOrderBy(stream, orderByIndexFields)` beside `getOrderingIndexFields`, which owns the same invariant `OrderByStream` enforces.
- `packages/kitcn/src/orm/query.ts`:
  - `PipelineWhereShape` + `_resolvePipelineWhere` resolve a stage `where` once into `none | predicate | expression`.
  - `_assertWhereIndexRequirement` -> `_assertPipelineWhereIsAnchored`, predicate-only, with a per-call-site `remedy`.
  - `_compileQueryPlan` split out of `_toConvexQuery`.
  - `_buildPlanStream` gains `probeOrderField` so a union source's probe union merges on `interleaveBy`.
  - `_buildUnionSourceStream` compiles + plans, with the `streamCanOrderBy` fallback.
  - `_resolveFlatMapStageIndex` picks an index that extends the join keys; `_applyFilterToQuery` gains a `tableConfig` so the target table's temporal normalization is used.

Review fixes:
- Self-review before autoreview: replaced a sentinel-object comparison and an `as string[]` cast in the union dispatch, and collapsed three separate resolutions of a callback `where` into one `_resolvePipelineWhere` call -> accepted -> refactored, retypechecked, retested.
- See `Verification evidence` for the autoreview result.
- PR #449 review, @chatgpt-codex-connector P2 "Reuse the resolved pipeline where expression" (`query.ts:3368-3369`, thread `PRRT_kwDOPTlS686foZ0b`) -> **accepted** -> real, and self-inflicted: `_resolvePipelineWhere` resolved the `where` for index selection, then `_buildTableFilterPredicate` resolved it a *second* time for the row filter. Harmless on `main`, where the first resolution changed nothing, but once the first resolution bounds the read a divergent second one filters rows the read never fetched. Fixed by carrying the resolved shape: `PipelineWhereShape`'s `predicate` variant now holds its clause, the new `_buildResolvedWherePredicate` builds the filter from that shape, and `_buildTableFilterPredicate` is deleted (its only two callers were these sites). Also removes a per-row `_buildFilterExpression` rebuild for object wheres. Two regression tests added and mutation-verified: restoring the double resolution reds exactly those two with `expected 2 to be 1`.
- PR #449 review, @chatgpt-codex-connector P2 "Bring the pagination guide in sync with union lowering" (`www/content/docs/orm/queries/pagination.mdx:182,203`, thread `PRRT_kwDOPTlS686fomPj`) -> **accepted, with a correction** -> I had updated `filters.mdx` and `api-reference.mdx` but missed `pagination.mdx`, which still described the old post-read contract. Line 182 was flatly stale. Line 203 ("a shared `.withIndex(...)` plus a per-source `where` makes every source walk the same range and drop the misses") was **not** stale — probes proved it is still exactly true when the pinned index cannot be narrowed, so it was rewritten with the real three-case rule rather than deleted. Probed and then pinned as tests: pinned `by_name` + `where {status}` -> 21 scanned (unchanged); pinned `by_status` no range + same `where` -> 1 scanned (narrowed); pinned `by_status` with an `eq('archived')` range + `where {status:'active'}` -> 20 scanned, 0 rows (range wins, never widened). Also corrected my own earlier skill-doc wording, which said "a `where` on an unindexed field" when the real condition is "a `where` that cannot narrow the pinned index".

Error attempts:
| Error / failed attempt | Count | Next different move | Resolution |
|------------------------|-------|---------------------|------------|
| 8 vitest files failed with `Cannot find package 'kitcn/server'` / missing `../dist/orm/index.js` | 1 | Build the package instead of reinstalling | `bun --cwd packages/kitcn build`; all 94 files then passed. |
| First version of the interleave-fallback test asserted the wrong rows (`status > 'ac'` matches every seeded status) | 1 | Pick bounds that select exactly one row per source | Changed to `lt: 'ad'` / `gt: 'p'`; test passes and is mutation-verified. |

Verification evidence:
- Closeout, 2026-09-07, cwd `/Users/zbeyens/git/better-convex`:
  pipeline 41/41; package build; full `bun check` exit 0; skill mirror equal.
  Three docs routes passed desktop/390px visual proof, HTTP 200 and console
  checks. User waived walkthrough. Branch autoreview against `kitcn/main`
  through P1 passed with no accepted/actionable findings. Earlier records
  below describe the original implementation runs, not the current gate.
- `gh issue view 447` (cwd: repo root) -> issue + empty comment list read before edits.
- Scratch repro before the fix (cwd: repo root) -> union `{"documents":21,"scanned":21}` expected 1; flatMap `{"documents":21,"scanned":21}` expected 3; control `findMany({where:{status:'active'}})` `scanned: 1` PASS. Reproduced.
- `npx vitest run convex/orm/pipeline.test.ts` (cwd: repo root) -> 37 passed, 0 failed. `:175` and `:796` unchanged and green.
- Mutation test A: forcing `usePlanned = false` and `indexName = relationIndexName` -> exactly the 3 lowering tests fail. The new tests are real regression tests.
- Mutation test B: replacing `streamCanOrderBy(planned, interleaveFields)` with `true` -> only "a union source keeps the scan when the index cannot serve interleaveBy" fails, with `indexFields must be some sequence of fields the stream is ordered by: ["_creationTime","_id"], ["status","_creationTime","_id"] (0 equality fields)`. The guard test is a real regression test.
- `npx tsc -p packages/kitcn/tsconfig.json --noEmit` (cwd: repo root) -> clean.
- `bun typecheck` (cwd: repo root) -> 5 successful, 5 total.
- `bun lint:fix` (cwd: repo root) -> 960 files checked, no fixes applied.
- `bun --cwd packages/kitcn build` -> 72 files, build complete.
- `npx vitest run` (cwd: repo root) -> 92 files passed, 986 tests passed, 14 skipped, 0 failed.
- `bun test` (cwd: repo root) -> 1400 pass, 0 fail across 150 files.
- `bun run check:ci` (cwd: repo root) -> lint, typecheck, test, test:cli, test:concave all passed; `fixtures:check` failed on pre-existing upstream expo drift (`~55.0.30` -> `~55.0.31`). Proven not attributable: `git diff --name-only` shows no `fixtures/`, `tooling/`, or `packages/kitcn/src/cli/` path, and `npm view expo time` dates `55.0.31` at 2026-08-31, after `origin/main`'s tip commit at 2026-08-26 — so clean `main` is red on this lane too.
- `bun run test:verify` (cwd: repo root) -> exit 0.
- `bun run test:runtime` (cwd: repo root) -> exit 0.
- `git push -u origin HEAD` -> new branch `fix/orm-pipeline-where-index-lowering`.
- `gh pr create --base main` -> https://github.com/udecode/kitcn/pull/449.
- `gh pr view 449 --json body` -> PR #270 emoji task-style body intact.
- After the PR #449 review fix: `npx vitest run convex/orm/pipeline.test.ts` -> 39/39; `npx vitest run` -> 988 passed, 0 failed; `bun test` -> 1400 pass, 0 fail; `npx tsc -p packages/kitcn/tsconfig.json --noEmit` clean; `bun lint:fix` fixed 1 file; `bun --cwd packages/kitcn build` -> 72 files.
- Mutation test C: restoring the double `_resolvePipelineWhere` call at both sites reds only the two single-resolution tests, with `expected 2 to be 1`.
- After the pagination-docs review fix: `npx vitest run convex/orm/pipeline.test.ts` -> 41/41; `npx vitest run` -> 990 passed, 0 failed; `bun lint:fix` clean; `bun run build` (www, cwd: repo root) -> exit 0, so the changed MDX parses and renders.
- Docs sweep: `grep -rn "after the read|drop the misses|Anchoring each source|walk the same range" www/content/docs packages/kitcn/skills/kitcn` returns only the new, correct statements.
- `bun tooling/sync-kitcn-skill.ts` -> "Synced packages/kitcn/skills/kitcn to .agents/skills/kitcn".
- `.agents/skills/autoreview` (`--mode local`, `--engine claude`) -> run against the frozen dirty tree; result in `Review fixes`.
- `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/447-orm-pipeline-where-index-lowering.md` -> pass.

Source-listed case matrix:
| Case | Source claim | Harness | Before | Expected after | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Dead `return;` | `_assertWhereIndexRequirement` computes `whereExpression` then returns past it | source read `query.ts:2756-2799` | expression built and discarded | no computed-and-discarded value | function split into `_resolvePipelineWhere` + `_assertPipelineWhereIsAnchored`; nothing is discarded | confirmed, fixed |
| Union source object `where` full-scans | plain-object union `where` silently full-scans | `pipeline.test.ts` "a union source where rides its own index instead of scanning" | `scanned: 21` | `scanned: 1` | test passes; fails when lowering is disabled | confirmed, fixed |
| flatMap stage object `where` full-scans | same class on `flatMap` sources | `pipeline.test.ts` "a flatMap stage where rides an index that extends the join keys" | `scanned: 21` | `scanned: 3` | test passes; fails when lowering is disabled | confirmed, fixed |
| `pipeline.test.ts:175` must not be rewritten | completing the assertion would force a per-source `.withIndex` workaround | `pipeline.test.ts:175` unchanged | green | green | 37/37 pass with `:175` byte-identical | confirmed, honored |
| `pipeline.test.ts:796` must not be rewritten | same | `pipeline.test.ts:796` unchanged | green | green | 37/37 pass with `:796` byte-identical | confirmed, honored |
| `hasConfiguredIndex: Boolean(indexName)` misreports coverage | flatMap passes the relation FK index and so misreports coverage | source read `query.ts:3343-3381` + `index-utils.ts:281-318` | gate never fires for a valid relation | honest, satisfiable error | partially refuted: the value is right (the FK eq does bound the read); the *message* named a `.withIndex(...)` option flatMap does not have. Message rewritten per call site. | partially refuted, addressed |
| "#425 unblocks this" is wrong | the two call sites never reach the `_toConvexQuery` ladder | source read `query.ts:3257`/`:3297` vs `:3088`/`:7442` | never reached | reached | both sites now compile through `_compileQueryPlan` | confirmed |

Final handoff contract:
- Commit line: see `Final handoff / sync`.
- PR line: https://github.com/udecode/kitcn/pull/449
- Issue line: linked by `🐛 Fixes #447` in the PR body; no separate comment posted (offered to the user).
- Confidence line: 95-100%.
- Flow table:
  - Reproduced: tests 🔴 (scratch read-count repro failed pre-fix at both sites), browser ➖ N/A
  - Verified: tests 🟢 (37/37 pipeline, 986 vitest, 1400 bun), browser ➖ N/A
- Browser check: N/A — server-side ORM read planning has no rendered output.
- Outcome: `select().union([{ where }])` and `select().flatMap(rel, { where })` compile an object `where` into an index range instead of post-filtering a scan. The dead assertion branch is gone and the predicate error now names an action the caller can take.
- Caveat: flatMap children now arrive in the lowered index's order, so a range field orders them ahead of creation time and outstanding cursors for those queries do not carry over. `bun run check:ci`'s `fixtures:check` lane is red on unrelated upstream expo drift.
- Design:
  - Chosen boundary: the read-plan compiler, reached from both pipeline stream sites.
  - Why not quick patch: completing the assertion to throw would make `select()` stricter than `findMany()` for the same `where`, and would force the two named tests into per-source `.withIndex(...)` workarounds — encoding the workaround as contract.
  - Why not broader change: `_toConvexQuery` was not table-parameterized, because union sources are on the same table; `flatMap` got a narrow resolver instead of the full ladder because the FK eq is a mandatory leading prefix and `mappedIndexFields` must be one arity for every parent.
- Verified: 37/37 `convex/orm/pipeline.test.ts`, 986 vitest, 1400 bun tests, package build, typecheck, lint; all 5 new tests mutation-verified.
- PR body verified: `gh pr view 449 --json body` — PR #270 emoji format intact, `auto-release` block preserved, no self-link.

Task-style PR body contract:
- Satisfied on PR #449: `auto-release` block preserved, `🐛 Fixes #447`, `🧭 Task plan: docs/plans/447-orm-pipeline-where-index-lowering.md`, `🟢 95-100% confidence`, the exact `| Phase | 🧪 Tests | 🌐 Browser |` header with `Reproduced` (🔴) and `Verified` (🟢) rows and `➖ N/A` browser cells, and `**✅ Outcome**` / `**⚠️ Caveat**` / `**🏗️ Design**` / `**🧪 Verified**` sections. No line links PR #449 to itself.

Final handoff / sync:
- Commit: `3131bb5c` on `fix/orm-pipeline-where-index-lowering`, plus a plan-sync commit naming PR #449.
- PR: https://github.com/udecode/kitcn/pull/449
- Issue: linked via `🐛 Fixes #447`; no separate comment posted.
- Browser proof: N/A.
- Caveats: see `Final handoff contract`.

Timeline:
- 2026-09-05T06:08:20.963Z Task goal plan created.
- 2026-09-05 Issue #447 read; six-agent understanding workflow run over `query.ts`/`stream.ts` invariants.
- 2026-09-05 Scratch repro reproduced both sites at 21 scanned; control chain-level `where` at 1.
- 2026-09-05 Implemented union + flatMap index lowering; 5 regression tests added and mutation-verified.
- 2026-09-05 Docs, skill mirror, and changeset updated; repo checks run; autoreview run; committed.
- 2026-09-05 User prompted for a PR. Branch renamed to `fix/orm-pipeline-where-index-lowering`, `test:verify` and `test:runtime` run green, pushed, PR #449 opened.

Reboot status:
| Question | Answer |
|----------|--------|
| Where am I? | Delivered as PR #449 |
| Where am I going? | Final response |
| What is the goal? | Index-lower plain-object pipeline union/flatMap wheres and resolve the dead assertion branch |
| What have I learned? | See Findings |
| What have I done? | See Timeline |

Open risks:
- flatMap child ordering changes when a stage `where` lowers onto an extending index, and the composite page cursor's arity changes with it. Realistic failure mode: a paginating client resumes with a cursor minted before the upgrade and mis-splits the parent/child key. Proof plan: the two flatMap pagination tests (`pipeline.test.ts:796` and the limit/maxScan cases) still pass, and the changeset states the cursor consequence. Why the boundary is still right: the previous order was already whichever index `findIndexForColumns` happened to return first and was never documented, so pinning it would be freezing an accident.
- A union source `where` that compiles to a *range* on a new index can no longer serve a `createdAt` merge. Guarded by `streamCanOrderBy`, which is mutation-tested; without it the merge throws.
- `streamCanOrderBy` is a new export from an internal module. It is not re-exported from `kitcn/orm`, so the published surface is unchanged, but it is now a second reader of the `OrderByStream` invariant and must move with it.
- Two adjacent defects are knowingly left open: chain-level `.where(...)` is silently dropped under `pipeline.union`, and the relation loader (`with: { rel: { where } }`) does not lower its `where`. Both are reported in the final handoff, neither is fixed here.

Hard closeout guard:
- Satisfied: the work is committed, pushed, and delivered as PR #449, which names this plan.
