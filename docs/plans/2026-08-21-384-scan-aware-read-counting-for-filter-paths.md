# 384 scan-aware read counting for filter paths

Objective:
Make `countDocumentReads` see documents Convex read and a `.filter()` rejected, so read-bound assertions fail when an index-backed plan degrades into a table scan.

Goal plan:
docs/plans/2026-08-21-384-scan-aware-read-counting-for-filter-paths.md

Template:
docs/plans/templates/task.md

Primary template:
docs/plans/templates/task.md

Applied packs:
- none

Task source:
- type: GitHub issue
- id / link: #384 — https://github.com/udecode/kitcn/issues/384
- PR: #399 — https://github.com/udecode/kitcn/pull/399
- title: Testing: `countDocumentReads` counts rows returned, not rows scanned behind `.filter()`
- acceptance criteria:
  1. A scan-counting mode exists alongside the document counter (`{ documents, scanned }`).
  2. The cross-index `OR` scan defect becomes expressible as a regression test.
  3. The `M4: Read bounds` assertions are re-seeded at a larger N so they fail if the plan degrades.
- caveats: no user-facing package change; `convex/` is repo-internal test infrastructure.
- likely files: `convex/setup.testing.ts`, `convex/orm/where-filtering.test.ts`, every `countDocumentReads` call site.
- browser surface: none.
- root-cause layer: test harness proxy.

Timed checkpoint:
- requested duration: N/A — no duration requested.

Completion threshold:
- `countDocumentReads` returns `{ documents, scanned }` and `scanned` counts rows
  a Convex `.filter()` rejected, with early stop modelled for bounded terminals.
- A harness contract suite proves it, and fails against the old harness.
- `M4: Read bounds` asserts on `scanned` at N=300.
- Every pre-existing `countDocumentReads` assertion still passes.
- Task closure is legal only when the source-of-truth acceptance criteria are
  satisfied or explicitly narrowed, required verification evidence is recorded,
  code-review and release-artifact gates are closed when applicable, verified
  code changes are committed and PR'd unless explicitly declined or blocked,
  task-style PR body sync is complete or marked N/A with reason,
  GitHub issue/PR sync is complete or marked N/A with reason, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-08-21-384-scan-aware-read-counting-for-filter-paths.md` passes.

Verification surface:
- `npx vitest run --project integration` (full integration suite, cwd repo root).
- `npx vitest run convex/orm/read-counting.test.ts --project integration`.
- Red-proof: same suite with `convex/setup.testing.ts` stashed to HEAD.
- `bun run test:bun`, `bun typecheck`, `bun lint`.

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
- Source of truth: GitHub issue #384.
- Allowed edit scope: `convex/setup.testing.ts`, `convex/orm/*.test.ts`, this plan.
- Branch: `test/scan-aware-read-counting` (renamed from `issue-384` before first push).
- Browser surface: N/A — no rendered output.
- GitHub issue sync: PR #399 opened; `Fixes #384` in the body links it.
- Non-goals: fixing the cross-index `OR` plan itself (this task makes it
  measurable); renaming `documents` across 30 call sites; touching `packages/`.

Output budget strategy:
- Test output filtered through `grep -E "Tests |Test Files|×|AssertionError"`.
- Source reads scoped with `sed -n` ranges and targeted `grep -n`, never whole
  8976-line files.

Blocked condition:
- None encountered.

Task state:
- task_type: testing / harness bug
- task_complexity: non-trivial
- current_phase: closeout
- current_phase_status: complete
- next_phase: final response
- goal_status: complete

Current verdict:
- verdict: complete
- confidence: 95-100%
- next owner: task
- reason: every source-listed case has direct proof at the owning layer, and the
  new suite is red against the old harness.

Implementation readiness:
- verdict: ready
- exact owner: `countDocumentReads` in `convex/setup.testing.ts`
- contradiction status: none
- source-listed cases complete: yes

Pre-solution issue challenge:
- reporter claim: `countDocumentReads` reports 2 for a cross-index `OR` that
  walks 302 documents.
- suggested diagnosis or fix: (a) wrap `.filter()` and count predicate
  invocations, exposing `{ documents, scanned }`, or (b) assert plan shape.
- repro ladder:
  - tests / source-level repro: reproduced exactly. A scratch test seeded 302
    rows, ran `findMany({ where: { OR: [{status:'zmatch'},{age:99}] } })`, got
    2 rows and `{"documents":2}`.
  - repo-owned automated integration proof: `convex/orm/read-counting.test.ts`.
  - Browser plugin: N/A — no browser surface.
  - screenshot / visual proof: N/A.
- reproduction verdict: valid
- validity verdict: partially valid — the defect is real and exactly as
  described, but the suggested mechanism (a) is not implementable.
- what was wrong in the proposed path: `.filter()`'s callback is invoked
  **once per query**, not once per document
  (`convex/dist/esm/server/impl/query_impl.js:168` calls
  `predicate(filterBuilderImpl)` to build a serialized expression). Counting
  predicate invocations would count 1, always. Option (b) is also already
  available: `where-clause-compiler.test.ts` asserts `result.strategy` in 19
  places today, so it was never the missing capability.
- best long-term fix boundary: read the serialized plan off
  `QueryImpl.state.query` before the terminal consumes it, replay the same
  source with no operators, and count the walk. This uses the engine for both
  passes rather than re-implementing `evaluateFilter`, so the filtered result is
  always a subsequence of the scan sequence.
- hard-stop decision: proceed — reproduced at the source layer before any edit.

Completion rule:
- Do not call `update_goal(status: complete)` while any required checklist item
  remains unchecked. If an item does not apply, check it and add `N/A: <reason>`.
- Do not call `update_goal(status: complete)` until every completion threshold
  above is satisfied, final handoff evidence is recorded, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-08-21-384-scan-aware-read-counting-for-filter-paths.md` passes.
- Do not create hook state for this goal. This file plus the active goal are the
  durable state.

Start Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| Timed checkpoint parsed | no | No duration requested |
| Walkthrough baseline for possible UI change | no | N/A: test harness only, no UI or rendered output |
| Skill analysis before edits | yes | task + autogoal; testing policy applied inline, no extra skills earned their keep |
| Active goal checked or created | yes | this plan |
| Source of truth read before edits | yes | gh issue view 384 + attachment read first |
| Exact per-PR task ownership | yes | PR #399 — this plan owns exactly that PR |
| GitHub comments and attachments read | yes | issue has 0 comments; attachment read |
| Video transcript evidence required | no | N/A: no video evidence |
| Pre-solution issue challenge required | yes | recorded above: partially valid |
| Reproduction verdict before implementation | yes | valid; scratch probe reported documents 2 over 302 rows |
| Repro escalation ladder selected | yes | source-level repro sufficed; browser N/A |
| Suggested fix reviewed against durable boundary | yes | issue option (a) disproven, option (b) already present |
| `docs/solutions` checked for non-trivial existing-code work | no | N/A: no docs/solutions directory in repo |
| TDD decision before behavior change or bug fix | yes | red-proof captured by stashing the harness to HEAD |
| Branch decision for code-changing task | yes | already on issue-384, dedicated to this issue |
| Release artifact decision | no | N/A: root package is private, packages/ untouched |
| Browser tool decision for browser surface | no | N/A: no browser surface |
| Commit / PR expectation decision | yes | user requested the PR in a follow-up turn |
| Task-style PR body decision | yes | PR #270 emoji task-style body |
| Task-plan PR body evidence | yes | plan line in body; plan at head names PR #399 |
| GitHub issue sync expectation decision | yes | `Fixes #384` in PR body |
| Output budget strategy recorded | yes | recorded above |

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

Completion Gates:
| Gate | Applies | Required action | Evidence |
|------|---------|-----------------|----------|
| Named verification threshold | yes | Run the command, proof, source audit, or artifact check named in this plan | vitest integration suite + bun test + typecheck + lint, all recorded |
| Exact per-PR task ownership | yes | This plan owns exactly PR #399 | PR #399 |
| Pre-solution issue challenge verdict | yes | Record reporter claim, suggested fix, repro verdict, validity verdict, durable boundary, and hard-stop/pivot decision before implementation | partially valid; recorded with the disproof of option (a) |
| Repro escalation ladder | yes | For bug/behavior claims, record test/source-level, automated browser/integration, Browser, and screenshot/visual-proof outcomes or N/A/blocker reasons before `not reproduced` | source-level repro reproduced it; browser N/A |
| Bug reproduced before fix | yes | Record failing test/repro or N/A with reason | scratch probe: documents 2 over 302 rows, before any edit |
| Targeted behavior verification | yes | Run focused test/proof for changed behavior or record N/A | 14/14 read-counting.test.ts; 15 red at HEAD |
| TypeScript or typed config changed | yes | Run relevant typecheck | bun typecheck: 5 tasks successful |
| Package exports or file layout changed | no | Run the relevant package build before final verification and keep generated updates | N/A: packages/ untouched |
| Package manifests, lockfile, or install graph changed | no | Run `bun install` and relevant package checks | N/A: no manifest change |
| Agent rules or skills changed | no | Run `bun install` and verify generated skill sync | N/A: .agents untouched |
| Workspace authority proof | yes | Run verification in the owning repo/package/app/route/tool and record cwd; do not count the wrong workspace as proof | all commands run in /Users/mikey/conductor/workspaces/kitcn/moab, which owns convex/ |
| Browser surface changed | no | Capture Browser Use proof or record explicit waiver/blocker | N/A: no browser surface |
| Browser final proof | no | Attach screenshot or exact browser verification caveat when browser proof applies | N/A: no browser surface |
| UI walkthrough | no | If UI or rendered output changed, run `.agents/skills/walkthrough/SKILL.md` after final proof and show annotated images in the final handoff; otherwise record N/A | N/A: no UI or rendered output changed |
| Scaffold or fixture output changed | no | Run `bun run fixtures:sync` and `bun run fixtures:check`, or record N/A | N/A: no init -t template or scaffold source touched |
| Package behavior or public API changed | no | Add a changeset or record why no changeset applies | N/A: root package private, packages/ untouched, no changeset needed |
| Docs and kitcn skill sync changed | no | Keep `www/**` and `packages/kitcn/skills/kitcn/**` in sync, or record N/A | N/A: no www/ or skills docs touched |
| Docs or content changed | no | For docs-heavy work, use `--template docs`; for incidental docs, verify source-backed claims, links, examples, and rendered output or record N/A | N/A: only this plan |
| High-risk mini gate | yes | For public API/runtime/package-boundary/browser/agent-action/command-contract changes, record realistic failure mode, proof plan, and why the chosen boundary is right; otherwise N/A | see Open risks: internal convex shape read, loud throw on drift |
| Agent-native review for agent/tooling changes | no | For `.agents/**`, `.claude/**`, `.codex/**`, skills, hooks, commands, prompts, or user-action tooling, load `.agents/skills/agent-native-reviewer/SKILL.md` and close accepted/actionable findings, or record N/A | N/A: no .agents/.claude/.codex/skill/hook/command change |
| Local install corruption suspected | no | Run `bun install` once, rerun the exact failing command, or record N/A | N/A: no corruption signals |
| Commit created | yes | For verified code-changing work, stage the entire current checkout per repo policy and create a commit; N/A only for no local patch, explicit user decline, analytical/blocked/inconclusive work, or recorded external blocker | feb68240, whole checkout staged |
| PR create or update | yes | For verified code-changing work, run `check`, push, create or update the PR, and sync PR body to the task-style final handoff; N/A only for no local patch, explicit user decline, analytical/blocked/inconclusive work, or recorded external blocker | PR #399 opened; `check:ci` exit 0; `test:runtime` blocked by fixed-port contention |
| Task-style PR body verified | yes | Verify the PR body with `gh pr view --json body`; it must preserve auto-release blocks when applicable, must not include a current-PR self-link, and must use the PR #270 emoji format: `🐛 Fixes ...`, `🟢 95-100% confidence`, `Phase / 🧪 Tests / 🌐 Browser` table, and bold emoji Outcome/Caveat/Design/Verified sections | `gh pr view --json body`, PR #270 emoji format, no self-link |
| PR task evidence verified | yes | Verify body plan line, plan at PR head, and exact PR ownership | body names this plan; plan at PR head names PR #399 |
| PR proof image hosting | no | If PR body needs browser proof, replace local image paths with hosted GitHub URLs or record N/A | N/A: no browser proof in body |
| GitHub issue sync-back | yes | Post concise issue sync after PR exists, or record N/A/blocker | `Fixes #384` in PR #399 body |
| Final handoff contract | yes | Fill the final handoff fields below with exact PR/issue/confidence/tests/browser/outcome/caveats/design/verification content or N/A reason | filled above |
| Final lint | yes | Run `bun lint:fix` or scoped equivalent | bun lint: no fixes applied |
| Output budget discipline | yes | Verify no unbounded high-volume command output was streamed, or record the accidental output and recovery | all test output grep-filtered; source reads range-scoped |
| Timed checkpoint | no | If duration was requested, keep improving until elapsed, then finish the current loop cleanly; otherwise N/A | N/A: no duration requested |
| Autoreview for non-trivial implementation changes | yes | Load `.agents/skills/autoreview/SKILL.md`; use dirty local `--mode local`, branch/PR `--mode branch --base <base>`, or committed slice `--mode commit --commit <ref>` until no accepted/actionable findings, or record N/A for docs-only/trivial/no local patch | autoreview --mode local, no accepted findings |
| Goal plan complete | yes | Run `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-08-21-384-scan-aware-read-counting-for-filter-paths.md` | see below |

Phase / pass table:
| Phase | Status | Evidence | Next |
|-------|--------|----------|------|
| Intake and source read | complete | issue #384 fetched, convex-test + query_impl read | implementation |
| Implementation | complete | scan counting + 13-case suite + M4 re-seed | verification |
| Verification | complete | 13/13 new, 174 pre-existing, 1288 bun, typecheck, lint | closeout |
| Commit / PR / GitHub sync | complete | feb68240 pushed; PR #399 opened and bound to this plan | closeout |
| Closeout | complete | autoreview + check-complete | final response |

Findings:
- `take`, `first`, and `unique` are all `limit(n).collect()` over the async
  iterator (`query_impl.js:236-255`), so one accounting rule covers them.
- convex-test's `_evaluateQuery` applies source -> `.filter()` -> sort -> limit
  (`convex-test/dist/index.js:271-343`). The sort key is the index fields plus
  `_creationTime` and `_id`, and `_creationTime` is strictly increasing
  (`index.js:81`), so a filtered run is always a subsequence of an unfiltered
  one. That is what makes the replay comparison sound.
- convex-test applies `limit` *after* a full scan and sort, so the emulator
  cannot model early stop on its own; the replay does it explicitly.
- Every existing `countDocumentReads` assertion already held on `scanned`, so
  no ORM plan was actually degraded at those seeds; the assertions were just
  unable to prove it.
- `btree.vitest.ts` fails on roughly 1 run in 8 on a random fast-check seed
  (measured: 1 of 8 runs). It has zero references to `countDocumentReads`.

Decisions and tradeoffs:
- Kept `documents` rather than renaming it, so all 30 call sites stayed
  readable, and pointed the JSDoc at the trap instead. Every read-bound
  assertion was moved to `scanned`, which is the metric they always meant.
- Modelled early stop for `take`/`first`/paginate instead of charging the whole
  range. Overstating a bound would fail plans that real Convex would not bill.
- Chose an explicit throw over a silent fallback when the plan shape is
  unrecognized: silently under-reporting reads is precisely the defect in #384.
- Re-seeded only the `M4: Read bounds` block that the issue named.
  `ordering.test.ts` has the same shape at N=60, but at a 7.5x margin on
  `scanned` it is already non-vacuous, and widening it is scope the issue did
  not ask for.

Implementation notes:
- `convex/setup.testing.ts`: `countDocumentReads` now returns
  `DocumentReadCounts { documents, scanned }`. Added `readQueryPlan`,
  `planHasFilter`, `planLimit`, `scanSequence`, `positionOfId`, `accountRows`,
  `accountPage`, `wrapIterator`, and `paginate` interception.
- The wrapped iterator now forwards `return()`, so breaking out of a
  `for await` closes the underlying query exactly as it would unproxied.
- Scan replay only runs when the plan carries a Convex `.filter()`, so stream
  paths and unfiltered ranges cost nothing extra.

Review fixes:
- `autoreview --mode local --engine claude` pass 1: clean, no accepted findings
  ("patch is correct", 0.75). Sub-threshold note accepted anyway: the wrapped
  iterator's `done` branch charged the whole remaining range even when a
  serialized `limit` operator was what ended iteration, while `collect()`
  already honored `planLimit`. Fixed by tracking `matched` and draining only
  when `matched < limit`, which is the same rule `accountRows` uses. Pinned by
  a 14th case; without the guard it reports `expected 300 to be 3`.
- `autoreview --mode local --engine claude` pass 2 after the fix: clean,
  "No landing blockers found" (0.72).

Error attempts:
| Error / failed attempt | Count | Next different move | Resolution |
|------------------------|-------|---------------------|------------|
| None yet | 0 | | |

Verification evidence:
- cwd for all commands: `/Users/mikey/conductor/workspaces/kitcn/moab`.
- `npx vitest run convex/orm/read-counting.test.ts --project integration`
  -> 14 passed.
- `npx vitest run --project integration` -> 716 passed, 13 skipped, 1 failed
  (`btree.vitest.ts`, pre-existing seed flake; 7 of 8 standalone reruns pass,
  0 references to `countDocumentReads`).
- Red-proof with `convex/setup.testing.ts` stashed to HEAD -> 15 failed
  (13 new + 2 re-seeded M4), including `expected undefined to be 302`.
- The 7 pre-existing `countDocumentReads` suites -> 174 passed, 1 skipped,
  both before and after switching every assertion to `scanned`.
- `bun run test:bun` -> 1285 pass, 1 fail (`package-intent.test.ts`,
  pre-existing `npm pack` hook timeout; fails at HEAD with the tree stashed,
  0 references to `countDocumentReads`). Earlier run in this session: 1288
  pass, 0 fail.
- `npx vitest run --project integration` after the review fix -> 718 passed,
  13 skipped, 0 failed.
- `bun typecheck` -> 5 tasks successful.
- `bun lint` -> no fixes applied.
- `bun run check:ci` -> exit 0 (lint, typecheck, test, test:cli, test:concave,
  fixtures:check). `fixtures:check` needed one retry after a bun link `EEXIST`
  race, then passed.
- `bun run test:runtime` -> blocked, not failed: `EADDRINUSE 127.0.0.1:3211`
  across four attempts, from parallel Conductor workspaces holding that fixed
  port. Unreachable from this diff: the commit touches zero files under
  `packages/`, and `tooling/scenarios.ts` never references `setup.testing` or
  `convex/orm`. Closed by CI: PR #399 CI passed in 6m21s, covering that lane.

Source-listed case matrix:
| Case | Source claim | Harness | Before | Expected after | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Cross-index `OR` scan is invisible | walks 302 to return 2, harness reports 2 | `read-counting.test.ts` "an OR across two indexed fields" | `{documents:2}` | `documents:2, scanned:302` | passes; red at HEAD | done |
| `.filter()` paths are blind | rows rejected never surface | 7 filter cases in `read-counting.test.ts` | no `scanned` field | `scanned` charges rejects | 13/13 pass | done |
| Serialized `limit` ends iteration | (autoreview) | "a filtered iterator run to done stops on a satisfied limit" | charged 300 | `scanned: 3` | passes; 300 without the guard | done |
| Stream paths are already fine | `filterWith` pulls every scanned row | "a JavaScript stream filter is already fully visible" | 300 | `scanned == documents == 300` | passes | done |
| `M4: Read bounds` overstates coverage | bucket is 3 rows, would pass under a scan | `where-filtering.test.ts` M4 block | `documents <= 6` at N=60 | `scanned <= 6` at N=300 | passes | done |
| Existing invariants must not regress | — | 7 suites, 30 assertions | 174 pass | 174 pass on `scanned` | passes | done |

Final handoff contract:
- Commit line: `feb68240 test(orm): count documents scanned behind .filter()`.
- PR line: https://github.com/udecode/kitcn/pull/399 (base `main`, head `test/scan-aware-read-counting`).
- Issue line: #384, closed by `Fixes #384` in the PR body.
- Confidence line: 95-100%.
- Flow table:
  - Reproduced: tests red at HEAD (15 failures), browser N/A
  - Verified: tests green (14 new + 174 pre-existing + 1288 bun), browser N/A
- Browser check: N/A — test harness change, no rendered output.
- Outcome: `countDocumentReads` now reports `{ documents, scanned }`; `scanned`
  charges for rows a Convex `.filter()` read and rejected, with early stop
  modelled for bounded terminals.
- Caveat: `btree.vitest.ts` (random seed) and `package-intent.test.ts`
  (`npm pack` hook timeout) are pre-existing flakes unrelated to this diff. The cross-index `OR` plan itself is unchanged — this task makes it
  measurable, and it now deserves its own issue.
- Design:
  - Chosen boundary: the harness proxy in `convex/setup.testing.ts`, replaying
    the serialized plan without its operators.
  - Why not quick patch: the issue's own suggestion (count `.filter()` predicate
    invocations) is impossible — the callback runs once per query.
  - Why not broader change: plan-shape assertions already exist in
    `where-clause-compiler.test.ts`, and renaming `documents` would churn 30
    call sites for no additional proof.
- Verified: see Verification evidence.
- PR body verified: N/A — no PR.

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
- Commit: feb68240 (plus a follow-up binding this plan to PR #399).
- PR: #399.
- Issue: #384 linked via `Fixes #384`.
- Browser proof: N/A.
- Caveats: pre-existing `btree.vitest.ts` seed flake.

Timeline:
- 2026-08-21T14:11:24.460Z Task goal plan created.
- 2026-08-21 Defect reproduced at source layer: documents 2, table 302.
- 2026-08-21 `{ documents, scanned }` implemented; harness suite green.
- 2026-08-21 autoreview x2 clean; limit-aware iterator fix + 14th case added.
- 2026-08-22 branch renamed to test/scan-aware-read-counting; PR #399 opened; CI green.
- 2026-08-21 Red-proof at HEAD: 15 failures. Full gates green except known flake.

Reboot status:
| Question | Answer |
|----------|--------|
| Where am I? | Intake and source read |
| Where am I going? | Implementation, verification, commit/PR/GitHub sync, closeout |
| What is the goal? | Make read bounds able to see rows a `.filter()` rejected |
| What have I learned? | See Findings |
| What have I done? | See Timeline |

Open risks:
- Scan replay reads `QueryImpl.state.query` and `target.constructor`, which are
  internal to the pinned `convex` version. A shape change throws a named error
  rather than under-reporting, so the failure is loud.
- The cross-index `OR` full scan is now measurable but still unfixed.

Hard closeout guard:
- A local-only final response for verified code-changing work is invalid unless
  this plan records an explicit user decline, no local patch, analytical/
  blocked/inconclusive outcome, or a real commit/PR blocker.
