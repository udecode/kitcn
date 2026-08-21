# 407 orm soft cascade linear reads

Objective:
Make a full soft cascade delete campaign read a linear number of rows instead of replaying its foreign key index range on every scheduled batch.

Goal plan:
docs/plans/407-orm-soft-cascade-linear-reads.md

Template:
docs/plans/templates/task.md

Primary template:
docs/plans/templates/task.md

Applied packs:
- package-api (docs/plans/templates/packs/package-api.md)

Task source:
- type: GitHub issue
- id / link: #407 https://github.com/udecode/kitcn/issues/407
- title: ORM: soft cascade delete re-scans every already-processed row each batch
  (quadratic reads, then a stranded CLEARING write outage)
- acceptance criteria: total reads across a full cascade campaign scale linearly
  with row count, asserted at two table sizes
- task type: bug (ORM runtime, published package)
- caveats: wasted reads are consumed by `.filter()`, so they are invisible to
  `countDocumentReads().documents`; the counter needed a scanned-row metric
- likely files: packages/kitcn/src/orm/scheduled-mutation-batch.ts,
  packages/kitcn/src/orm/mutation-utils.ts, convex/setup.testing.ts
- browser surface: none
- root-cause layer: scheduled cascade worker continuation strategy

Timed checkpoint:
- requested duration: N/A, none requested
- semantics: N/A
- initial confidence score: N/A
- improvement loop: N/A
- final score / loop closure: N/A

Completion threshold:
- A soft cascade campaign's scanned rows grow linearly with child count,
  proven at two table sizes and at stress scale, with every child soft-deleted.
- Task closure is legal only when the source-of-truth acceptance criteria are
  satisfied or explicitly narrowed, required verification evidence is recorded,
  code-review and release-artifact gates are closed when applicable, verified
  code changes are committed and PR'd unless explicitly declined or blocked,
  task-style PR body sync is complete or marked N/A with reason,
  GitHub issue/PR sync is complete or marked N/A with reason, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/407-orm-soft-cascade-linear-reads.md` passes.

Verification surface:
- packages/kitcn/src/orm/cascade-soft-delete.read-amplification.vitest.ts
- convex/orm/limits.stress.test.ts (CONVEX_LIMIT_STRESS=1, 4k descendants)
- bun typecheck, bun lint:fix, bun test, npx vitest run,
  bun run test:cli, bun run test:concave, bun run fixtures:check
- cwd for all of the above: /Users/mikey/conductor/workspaces/kitcn/surat-v1

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
- Source of truth: GitHub issue #407.
- Allowed edit scope: packages/kitcn/src/orm/**, convex/setup.testing.ts,
  convex/orm/limits.stress.test.ts, .changeset, docs/plans.
- Browser surface: N/A, no rendered output.
- GitHub issue sync: PR #422 body carries `🐛 Fixes #407`.
- Non-goals: hard cascade, `set null` / `set default` / cascade update paths;
  schema changes; the aggregate-index CLEARING repair path itself.

Output budget strategy:
- Greps scoped to packages/kitcn/src/orm and convex/orm with head caps; test
  runs piped through tail/grep; one workflow used for adversarial verification
  with structured schemas rather than free-text dumps.

Blocked condition:
- None encountered.

Task state:
- task_type: bug
- task_complexity: non-trivial
- current_phase: closeout
- current_phase_status: done
- next_phase: final response
- goal_status: complete

Current verdict:
- verdict: fixed
- confidence: 95-100%
- next owner: task
- reason: reproduced at source level, fixed at the worker's continuation
  boundary, and re-proved at two table sizes plus stress scale

Implementation readiness:
- verdict: ready
- exact owner: packages/kitcn/src/orm/scheduled-mutation-batch.ts, the cascade
  batch continuation strategy
- contradiction status: one resolved — the issue's recommended
  `_creationTime` watermark is unsound because `_creationTime` is not unique
  within a Convex table (see Decisions)
- source-listed cases complete: yes

Pre-solution issue challenge:
- reporter claim: soft cascade delete re-queries from `cursor: null` every
  batch; processed rows keep matching the index range and are re-read then
  dropped by `.filter()`, so reads grow ~N^2/batchSize.
- suggested diagnosis or fix: (1) watermark on the indexed column, (2) narrow
  the index range so processed rows leave it. Reporter preferred (1).
- repro ladder:
  - tests / source-level repro: reproduced. 100 children, batchSize 10:
    1100 scanned rows before, 112 after. `documents` reads 110 either way,
    confirming the reporter's note that `documents` is blind to this.
    4000 children at stress scale: 117,177 scanned before, 8,152 after.
  - repo-owned automated browser or integration proof: N/A, no browser surface.
  - Browser plugin: N/A.
  - screenshot / visual proof: N/A, no rendered output.
- reproduction verdict: valid
- validity verdict: valid — diagnosis and impact both confirmed in source
- best long-term fix boundary: the cascade worker's continuation strategy in
  scheduled-mutation-batch.ts
- harsh honest feedback: the recommended fix (option 1, `_creationTime`
  watermark) is unsound. `_creationTime` is not unique within a Convex table,
  and `.gt('_creationTime', wm)` compiles to a byte-prefix exclusion that drops
  every tie-twin regardless of `_id`, so it can silently skip an uncascaded
  row. The issue's framing that a forwarded cursor cannot be trusted is also
  too broad: it is only true for actions that move rows out of the range, which
  soft cascade never does.
- hard-stop decision: proceed — valid bug, pivoted away from the suggested fix

Completion rule:
- Do not call `update_goal(status: complete)` while any required checklist item
  remains unchecked. If an item does not apply, check it and add `N/A: <reason>`.
- Do not call `update_goal(status: complete)` until every completion threshold
  above is satisfied, final handoff evidence is recorded, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/407-orm-soft-cascade-linear-reads.md` passes.
- Do not create hook state for this goal. This file plus the active goal are the
  durable state.

Start Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| Timed checkpoint parsed | no | N/A: no duration requested |
| Walkthrough baseline for possible UI change | no | N/A: ORM runtime + tests only, no UI or rendered output |
| Skill analysis before edits | yes | task + autogoal + changeset loaded; testing/tdd not needed beyond the bounded regression file |
| Active goal checked or created | yes | this plan |
| Source of truth read before edits | yes | attachment file + `gh issue view 407` |
| Exact per-PR task ownership | yes | This plan owns exactly one PR: #422 |
| GitHub comments and attachments read | yes | `gh issue view 407 --json comments` returned an empty comment list |
| Video transcript evidence required | no | N/A: no video or screen recording in the source |
| Pre-solution issue challenge required | yes | recorded above; verdict valid, suggested fix rejected as unsound |
| Reproduction verdict before implementation | yes | reproduced pre-fix: 1100 scanned for 100 rows, 117,177 for 4000 |
| Repro escalation ladder selected | yes | source-level vitest repro was sufficient; browser rungs N/A |
| Suggested fix reviewed against durable boundary | yes | watermark rejected on backend-source evidence; pivoted to cursor continuation |
| `docs/solutions` checked for non-trivial existing-code work | no | N/A: no `docs/solutions` directory in this repo |
| TDD decision before behavior change or bug fix | yes | red first: new vitest file failed 2/3 with the fix stashed, then green |
| Branch decision for code-changing task | yes | renamed `issue-407` -> `fix/orm-soft-cascade-linear-reads` before first push, per the user's branch-name convention |
| Release artifact decision | yes | `.changeset/khaki-pianos-invent.md`, patch |
| Browser tool decision for browser surface | no | N/A: no browser surface |
| Commit / PR expectation decision | yes | user later prompted for a PR, superseding the standing decline; commit + push + PR #422 |
| Task-style PR body decision | yes | PR #270 emoji task-style body |
| Task-plan PR body evidence | yes | body line `🧭 Task plan: docs/plans/407-orm-soft-cascade-linear-reads.md`; plan at PR head names PR #422 |
| GitHub issue sync expectation decision | yes | `🐛 Fixes #407` in the PR body |
| Output budget strategy recorded | yes | recorded above |
| Package/API pack selected | yes | package-api pack applied |
| Public surface or package boundary identified | yes | no public export changes; `ScheduledMutationBatchArgs` shape unchanged |
| Convex entry/import graph impact identified | yes | no new imports in packages/kitcn; the earlier index-utils import was reverted |
| CLI/scaffold/generated impact identified | no | N/A: no CLI, scaffold, or generated output touched |
| Release artifact path selected | yes | `.changeset/khaki-pianos-invent.md` |
| `changeset` skill loaded when `.changeset` is required | yes | .agents/rules/changeset.mdc read; patch bump, `## Patches` section |
| Package build / fixture impact decision recorded | yes | `bun --cwd packages/kitcn build` run; fixtures unaffected but `bun run fixtures:check` run anyway and passed |

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
| Named verification threshold | yes | Run the command, proof, source audit, or artifact check named in this plan| `npx vitest run` + `CONVEX_LIMIT_STRESS=1 npx vitest run convex/orm/limits.stress.test.ts` in /Users/mikey/conductor/workspaces/kitcn/surat-v1: 857 + 12 passed |
| Exact per-PR task ownership | yes | Record the exact PR and dedicated plan, or the not-yet-created single-PR slice| PR #422 with this dedicated plan |
| Pre-solution issue challenge verdict | yes | Record reporter claim, suggested fix, repro verdict, validity verdict, durable boundary, and hard-stop/pivot decision before implementation| recorded above: valid, suggested watermark fix rejected on backend-source evidence, pivoted to cursor continuation |
| Repro escalation ladder | yes | For bug/behavior claims, record test/source-level, automated browser/integration, Browser, and screenshot/visual-proof outcomes or N/A/blocker reasons before `not reproduced`| source-level vitest repro reproduced it; browser/visual rungs N/A |
| Bug reproduced before fix | yes | Record failing test/repro or N/A with reason| fix stashed: 2/3 new tests failed and the stress case failed at 117,177 scanned |
| Targeted behavior verification | yes | Run focused test/proof for changed behavior or record N/A| packages/kitcn/src/orm/cascade-soft-delete.read-amplification.vitest.ts, 3/3 pass |
| TypeScript or typed config changed | yes | Run relevant typecheck| `bun typecheck` — 5 tasks successful |
| Package exports or file layout changed | no | Run the relevant package build before final verification and keep generated updates| N/A: no export or layout change; `bun --cwd packages/kitcn build` still run and passed |
| Package manifests, lockfile, or install graph changed | no | Run `bun install` and relevant package checks| N/A: no manifest or lockfile change |
| Agent rules or skills changed | no | Run `bun install` and verify generated skill sync| N/A: no `.agents/**` or skill change |
| Workspace authority proof | yes | Run verification in the owning repo/package/app/route/tool and record cwd; do not count the wrong workspace as proof| every command run in /Users/mikey/conductor/workspaces/kitcn/surat-v1, which owns both the package source and the convex test harness |
| Browser surface changed | no | Capture Browser Use proof or record explicit waiver/blocker| N/A: no browser surface |
| Browser final proof | no | Attach screenshot or exact browser verification caveat when browser proof applies| N/A: no browser surface |
| UI walkthrough | no | If UI or rendered output changed, run `.agents/skills/walkthrough/SKILL.md` after final proof and show annotated images in the final handoff; otherwise record N/A| N/A: no UI or rendered output changed |
| Scaffold or fixture output changed | no | Run `bun run fixtures:sync` and `bun run fixtures:check`, or record N/A| N/A: no scaffold change; `bun run fixtures:check` run anyway and passed |
| Package behavior or public API changed | yes | Add a changeset or record why no changeset applies| `.changeset/khaki-pianos-invent.md`, patch |
| Docs and kitcn skill sync changed | no | Keep `www/**` and `packages/kitcn/skills/kitcn/**` in sync, or record N/A| N/A: no `www/**` or public guidance change; cascade read behavior is not documented there |
| Docs or content changed | no | For docs-heavy work, use `--template docs`; for incidental docs, verify source-backed claims, links, examples, and rendered output or record N/A| N/A: only this plan and a changeset |
| High-risk mini gate | yes | For public API/runtime/package-boundary/browser/agent-action/command-contract changes, record realistic failure mode, proof plan, and why the chosen boundary is right; otherwise N/A| runtime behavior change. Failure mode: a forwarded cursor that is not an index-key position would truncate a campaign and strand children. Proof plan: backend-source verification of cursor semantics plus convergence assertions at 100/200/4000 rows. Boundary is right because the alternative resume keys are unsound (`_creationTime` ties) or unbounded (carried skip-ids in scheduler args), and `root-update`/`root-delete` in the same file already forward cursors across mutating batches. |
| Agent-native review for agent/tooling changes | no | For `.agents/**`, `.claude/**`, `.codex/**`, skills, hooks, commands, prompts, or user-action tooling, load `.agents/skills/agent-native-reviewer/SKILL.md` and close accepted/actionable findings, or record N/A| N/A: no `.agents/**`, `.claude/**`, `.codex/**`, skill, hook, command, or prompt change |
| Local install corruption suspected | yes | Run `bun install` once, rerun the exact failing command, or record N/A| `Cannot find package kitcn/server` on 6 suites was a stale dist; `bun --cwd packages/kitcn build` fixed it and the suites passed |
| Commit created | yes | For verified code-changing work, stage the entire current checkout per repo policy and create a commit; N/A only for no local patch, explicit user decline, analytical/blocked/inconclusive work, or recorded external blocker| one commit staged with `git add -A`, rebased onto origin/main (3bbc6bb3) |
| PR create or update | yes | For verified code-changing work, run `check`, push, create or update the PR, and sync PR body to the task-style final handoff; N/A only for no local patch, explicit user decline, analytical/blocked/inconclusive work, or recorded external blocker| `bun check` exit 0 on the rebased branch, pushed, PR #422 opened |
| Task-style PR body verified | yes | Verify the PR body with `gh pr view --json body`; it must preserve auto-release blocks when applicable, must not include a current-PR self-link, and must use the PR #270 emoji format: `🐛 Fixes ...`, `🟢 95-100% confidence`, `Phase / 🧪 Tests / 🌐 Browser` table, and bold emoji Outcome/Caveat/Design/Verified sections| verified with `gh pr view 422 --json body` |
| PR task evidence verified | yes | Verify body plan line, plan at PR head, and exact PR ownership| body names the plan, plan exists at PR head, plan names PR #422 |
| PR proof image hosting | no | If PR body needs browser proof, replace local image paths with hosted GitHub URLs or record N/A| N/A: no PR and no images |
| GitHub issue sync-back | yes | Post concise issue sync after PR exists, or record N/A/blocker| PR body carries `🐛 Fixes #407`, which links and closes it on merge |
| Final handoff contract | yes | Fill the final handoff fields below with exact PR/issue/confidence/tests/browser/outcome/caveats/design/verification content or N/A reason| filled below |
| Final lint | yes | Run `bun lint:fix` or scoped equivalent| `bun lint:fix` — clean |
| Output budget discipline | yes | Verify no unbounded high-volume command output was streamed, or record the accidental output and recovery| all test/grep output piped through tail/grep; one truncated background log re-run idle instead of dumped |
| Timed checkpoint | no | If duration was requested, keep improving until elapsed, then finish the current loop cleanly; otherwise N/A| N/A: no duration requested |
| Autoreview for non-trivial implementation changes | yes | Load `.agents/skills/autoreview/SKILL.md`; use dirty local `--mode local`, branch/PR `--mode branch --base <base>`, or committed slice `--mode commit --commit <ref>` until no accepted/actionable findings, or record N/A for docs-only/trivial/no local patch| see Review fixes |
| Goal plan complete | yes | Run `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/407-orm-soft-cascade-linear-reads.md`| see below |
| Public API / package boundary proof | yes | Source-audit public API, exports, and package boundary impact| source audit: no change to `packages/kitcn/src/orm/index.ts` exports; `ScheduledMutationBatchArgs` fields unchanged; scheduled args are validated with `v.any()` |
| Convex bundle/import proof | yes | Audit affected function-entry static graphs or record N/A| no new static imports in packages/kitcn; the transient `findIndexFields` import was reverted |
| CLI/scaffold/generated proof | no | Prove command contract and regenerate owned output or record N/A| N/A: no CLI, scaffold, or generated output touched |
| Release artifact classification | yes | Record whether the change is published package behavior/API/types/config/runtime or no published user-visible delta| published package runtime behavior change — soft cascade read cost and continuation |
| Published package changeset | yes | If published package users see a delta, load `changeset` and add/update one `.changeset/*.md` per package| `.changeset/khaki-pianos-invent.md`, `"kitcn": patch` |
| No release artifact | no | If no artifact is needed, record the exact reason: internal-only, docs-only, agent-only, test-only, or no user-visible delta from `main`| N/A: a changeset was added |
| Package typecheck/build/test | yes | Run owning package checks or record N/A with reason| `bun typecheck`, `bun --cwd packages/kitcn build`, `bun test` (1304 pass), `npx vitest run` (857 pass) |
| Fixture/scaffold generation | no | Run `bun run fixtures:sync` and `bun run fixtures:check` when scaffold output changed, otherwise N/A| N/A: no scaffold output changed; `bun run fixtures:check` run anyway and passed |
| Docs/package skill sync | no | Synchronize current-state public guidance or record N/A| N/A: no public guidance changed |

Phase / pass table:
| Phase | Status | Evidence | Next |
|-------|--------|----------|------|
| Intake and source read | done | issue #407 fetched and read, comments empty, repro built | implementation |
| Implementation | done | cursor continuation on the soft cascade path; opt-in `scanned` counter; new vitest + stress cases; changeset | verification |
| Verification | done | see Verification evidence | closeout |
| Commit / PR / GitHub sync | done | rebased onto origin/main, `bun check` exit 0, pushed, PR #422 | closeout |
| Closeout | done | autoreview run, plan complete | final response |

Findings:
- `documents` in `countDocumentReads` cannot see this bug. Reads consumed by
  `.filter()` never reach the page, and `paginate` was not counted at all.
  The counter gained an opt-in `scanned` metric.
- The issue's recommended `_creationTime` watermark is unsound. Verified in the
  Convex backend source at ../convex-backend:
  - `crates/database/src/bootstrap_model/import_facing.rs:107-112` — snapshot
    import takes a caller-supplied `_creationTime` verbatim; `must_validate`
    (`crates/common/src/document.rs:451-470`) only checks positive-and-finite.
    `crates/application/src/snapshot_import/mod.rs:1515-1521` dedups `_id` and
    pointedly does not dedup `_creationTime`.
  - `crates/common/src/document.rs:104-125` — `CreationTime` is an f64 in ms,
    ULP ~244ns at the current epoch, so distinct ns timestamps collapse.
  - `crates/database/src/database.rs:1948-1950` — the per-transaction base is
    `max(latest_ts.succ(), wall clock)` with no allocator, unlike commit
    timestamps (`committer.rs:1378-1390`).
  - `crates/common/src/index.rs:100-118` — index keys end in `_id`, not
    `_creationTime`, so Convex never needed creation-time uniqueness.
  - `crates/common/src/query.rs:276-282` — `.gt` becomes `Bound::Excluded`,
    whose start key is `increment()` of the byte prefix, excluding every
    tie-twin regardless of `_id`. A skipped row is unrecoverable.
- `root-update` and `root-delete` in the same worker file already forward
  `page.continueCursor` across scheduled batches while mutating rows, so cursor
  continuation is the file's established pattern rather than a new risk.

Decisions and tradeoffs:
- Continuation is a forwarded pagination cursor, taken only on the soft cascade
  path. Convex cursors are index-key positions that include `_id`, so they are
  exact under `_creationTime` ties, and they do not care about the shape of the
  foreign key index. Rejected the `_creationTime` watermark (unsound under ties)
  and a `gte` watermark plus carried skip-ids (unbounded scheduler args and a
  tie-group larger than `batchSize` deadlocks).
- The old comment claimed forwarded cursors can skip rows after cascade
  mutations. True for hard delete, `set null`, `set default`, and cascade
  update, which rewrite the indexed foreign key columns or remove the row — and
  those actions drop processed rows out of the range, so re-querying from null
  is already linear for them. They keep the old path unchanged. Soft cascade
  moves nothing, because `deletionTime` is not indexed.
- The `.filter()` on `deletionTime` is dropped, not kept alongside the cursor.
  Convex pays for those rows either way; filtering them out of the page would
  strand the cursor on a row the query no longer returns, and can return an
  empty page with work remaining. Already-stamped rows are skipped in JS.
- A byte-truncated batch stops short of `paged.continueCursor`, so it
  re-paginates with the count it actually consumed to get an exact cursor. One
  extra bounded read, only on the truncation path.
- Reverted an earlier change that made `findIndexForColumns` prefer an
  exact-field-match index. It only existed to widen the watermark's
  applicability; the cursor works on any index shape, so it was dropped rather
  than shipped as unrelated risk.
- Accepted: resuming means a row inserted behind the cursor mid-campaign is not
  picked up. Inherent to not re-reading the range — every design that satisfies
  the issue's linear-reads criterion has it — and the race was never settled.
- A byte-truncated batch re-pages from the same cursor with the size that fit
  rather than deriving a prefix cursor. Convex permits one paginated query per
  function execution, so the batch cannot ask for a second cursor. Considered
  and rejected `PaginationOptions.maximumBytesRead`: it would let Convex bound
  the page itself, but it also bounds reads the current design never bounded,
  brings `pageStatus: 'SplitRequired'` handling with it, and convex-test ignores
  it — so the byte path would lose its only executable proof. Left as a
  separate improvement.

Implementation notes:
- `packages/kitcn/src/orm/scheduled-mutation-batch.ts` — soft cascade batches
  forward `args.cursor`, drop the `deletionTime` filter, skip already-stamped
  rows in JS, and take an exact cursor when the byte budget truncates the page.
- `convex/setup.testing.ts` — `countDocumentReads(ctx, { scanned: true })` adds
  a scanned-row metric by replaying the unfiltered half of each chain. Opt-in
  via a TypeScript overload so existing callers pay nothing and cannot read a
  `scanned` field that was never measured. `paginate` now also feeds
  `documents`, which it previously did not.
- `packages/kitcn/src/orm/cascade-soft-delete.read-amplification.vitest.ts` —
  new. Linear scaling at two table sizes, byte-truncation convergence, a
  prefix-only foreign key index, and a per-invocation `.paginate()` call guard
  for the single-paginated-query limit convex-test does not model.
- `convex/orm/limits.stress.test.ts` — new env-gated 4k-descendant soft cascade
  case asserting both convergence and the read bound.

Review fixes:
- Cycle 1 (`autoreview --mode local --engine claude`), 2 P0s, both accepted:
  - `packages/kitcn/src/orm/zzrefute.vitest.ts` and `PROBE_PAGINATE` /
    `PROBE_FILTERED_CURSOR` `console.error` calls in `convex/setup.testing.ts`
    were debugging leftovers written into the worktree by the adversarial
    refute agents, not by the fix. Deleted the file, removed the probes,
    re-audited the tree for other agent artifacts.
- Cycle 2, 1 P0, accepted after source verification:
  - The byte-truncation path called `.paginate()` a second time in the same
    execution to derive an exact resume cursor. Convex allows one paginated
    query per function execution and throws `MultiplePaginatedDatabaseQueries`
    (`../convex-backend/crates/isolate/src/environment/udf/async_syscall.rs:1830-1832`).
    convex-test does not model that limit, so the suite could not catch it.
  - The reviewer's suggested repair — reschedule with the unchanged
    `args.cursor` — was rejected: the same page comes back, the byte budget
    truncates it at the same point, and every consumed row is already stamped,
    so the batch makes no progress and re-queues forever. Stamping
    `deletionTime` only grows the rows, which moves the truncation point
    earlier, never later.
  - Landed repair: reschedule with the unchanged `args.cursor` AND
    `batchSize: consumedRows.length`. A truncated page is strictly shorter than
    the one requested and `takeRowsWithinByteBudget` always keeps one row, so
    the size strictly decreases and settles, after which the page cursor is
    exact and the rest of the campaign never truncates. It also made the byte
    path cheaper: 60 children went from 626 scanned rows to 82.
  - Added a regression guard for the constraint convex-test cannot enforce:
    the campaign harness counts `.paginate()` calls per worker invocation and
    fails above one. Verified non-vacuous by reintroducing a second paginate
    (`batch 1 ran 2 paginated queries`).
- Cycle 3: clean, no accepted or actionable findings. The reviewer noted it
  could not verify the truncation loop's termination because
  `takeRowsWithinByteBudget` was outside its bundle. Verified directly at
  `packages/kitcn/src/orm/mutation-utils.ts:819-841`: `hitLimit: true` only
  returns from inside the loop, where `selected.length > 0` and the current row
  was not pushed, so `consumedRows.length` is strictly in
  `[1, args.batchSize - 1]` — the rescheduled size strictly decreases with a
  floor of 1. At size 1 the `selected.length > 0` guard short-circuits on the
  first row, so `hitLimit` is false and the page cursor is used. The size also
  stays a positive integer, satisfying the worker's own `batchSize` validation.

Error attempts:
| Error / failed attempt | Count | Next different move | Resolution |
|------------------------|-------|---------------------|------------|
| None yet | 0 | | |

Verification evidence:
- All commands run in cwd /Users/mikey/conductor/workspaces/kitcn/surat-v1,
  which owns both the package source and the convex test harness.
- `npx vitest run` — 857 passed, 14 skipped, no type errors.
- `bun test` — 1304 pass, 0 fail.
- `CONVEX_LIMIT_STRESS=1 npx vitest run convex/orm/limits.stress.test.ts` —
  12 passed.
- `bun typecheck` — 5 tasks successful.
- `bun lint:fix` — clean.
- `bun run test:cli` — 124 pass. `bun run test:concave` — smoke passed.
- `bun run fixtures:check` — fixtures match fresh scaffold output.
- `bun --cwd packages/kitcn build` — build complete.
- Red proof: with the fix stashed, the new vitest file failed 2/3
  (`expected 1100 to be less than or equal to 200`,
  `expected 4214 to be less than or equal to 720`) and the stress case failed
  (`expected 117177 to be less than 16000`).
- An earlier full `npx vitest run` reported 9 failures while three review
  agents were saturating the machine (1161s vs 8.5s wall clock). Re-run idle:
  all green. Load flake, not the diff.

Final evidence, run after the last code change (cwd
/Users/mikey/conductor/workspaces/kitcn/surat-v1):
- `npx vitest run` — 80 files passed, 2 skipped; 856 tests passed, 14 skipped;
  no type errors.
- `bun test` — 1304 pass, 0 fail, 4008 expect() calls across 147 files.
- `CONVEX_LIMIT_STRESS=1 npx vitest run convex/orm/limits.stress.test.ts` —
  12 passed.
- `bun typecheck` — 5 tasks successful.
- `bun --cwd packages/kitcn build` — 71 files, build complete.
- `bun lint` — biome + eslint clean, no fixes applied.
- `bun run test:cli` — 124 pass, 0 fail.
- `bun run test:concave` — Concave smoke passed.
- `bun run fixtures:check` — fixtures/vite-auth matches fresh scaffold output.
- `.claude/skills/autoreview/scripts/autoreview --mode local --engine claude` —
  "autoreview clean: no accepted/actionable findings reported".
- Byte-truncation path after the review repair: 60 children, 82 scanned rows,
  62 batches, 0 pending.

Source-listed case matrix:
| Case | Source claim | Harness | Before | Expected after | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Quadratic reads | batch k re-reads (k-1)*batchSize processed rows | cascade-soft-delete.read-amplification.vitest.ts, 100 and 200 children at batchSize 10 | 1100 scanned at N=100 | linear in N, ratio < 2.5 across 2x | 112 and ~212 scanned, ratio < 2.5 | pass |
| Invisible to `documents` | wasted reads are consumed by `.filter()` | same harness | documents=110 with and without the bug | scanned must be the metric | added opt-in `scanned` to countDocumentReads | pass |
| Read-limit blowout at scale | campaign dies mid-flight past Convex's read limit | limits.stress.test.ts, 4000 descendants | 117,177 scanned | linear, campaign drains | 8,152 scanned, all 4000 stamped | pass |
| Byte-budget truncation | not in the source; found while fixing | same vitest file, budget fits ~1 row of 10 | 4214 scanned pre-fix | no row skipped, no page replayed, page size settles | 82 scanned, 0 pending over 62 batches | pass |
| One paginated query per execution | not in the source; found in review | paginate-call counter per worker invocation in the same vitest file | 2 calls on a truncated batch | at most 1 | guard fails at 2, passes at 1 | pass |
| Prefix-only FK index | not in the source; found while fixing | same vitest file, index on (parentId, rank) | n/a | same linear bound | 100 children, <=200 scanned, 0 pending | pass |
| Hard cascade unaffected | issue states hard mode is fine | limits.stress.test.ts existing cases C/D | passing | still passing | 12/12 stress cases pass | pass |

Final handoff contract:
- Commit line: `fix(orm): resume soft cascade delete instead of replaying its range`
- PR line: https://github.com/udecode/kitcn/pull/422
- Issue line: 🐛 Fixes #407, closed by the PR on merge
- Confidence line: 95-100%
- Flow table:
  - Reproduced: tests red before the fix (1100 scanned at N=100; 117,177 at
    N=4000), browser N/A
  - Verified: tests green (857 vitest, 1304 bun, 12 stress), browser N/A
- Browser check: N/A, no browser or rendered surface
- Outcome: a full soft cascade delete campaign now reads a linear number of
  rows. 4000 descendants dropped from 117,177 scanned to 8,152, and every child
  is still soft-deleted.
- Caveat: a child inserted behind the cursor mid-campaign is not picked up.
  Inherent to resuming rather than replaying the range, and the race was never
  settled. The new `scanned` counter is opt-in and under-counts a `for await`
  over a filtered query that breaks early.
- Design:
  - Chosen boundary: the cascade worker's continuation strategy. Soft cascade
    forwards the pagination cursor; every other action keeps re-querying from
    null, which is already linear because processed rows leave the range.
  - Why not quick patch: the issue's recommended `_creationTime` watermark is
    unsound. `_creationTime` is not unique within a Convex table, and `.gt`
    excludes every tie-twin regardless of `_id`, so it can silently drop an
    uncascaded row.
  - Why not broader change: option 2 in the issue (put the soft-delete marker
    in the index) needs a schema change on every user table with a soft cascade
    edge. The cursor fixes it with no schema surface and no public API change.
- Verified: see Verification evidence
- PR body verified: `gh pr view 422 --json body`, PR #270 emoji task-style format

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
- Commit: `fix(orm): resume soft cascade delete instead of replaying its range`
  on branch `fix/orm-soft-cascade-linear-reads`, rebased onto `origin/main`
  (`3bbc6bb3`). The branch was renamed from `issue-407` before its first push.
- PR: https://github.com/udecode/kitcn/pull/422
- Issue: #407, linked by the PR body's `🐛 Fixes #407` line.
- Browser proof: N/A, no browser or rendered surface.
- Caveats: a row inserted behind the cursor mid-campaign is not picked up; the
  scanned counter is opt-in and under-counts an early-broken `for await` over a
  filtered query.

Timeline:
- 2026-08-21T19:29:28.675Z Task goal plan created.

Reboot status:
| Question | Answer |
|----------|--------|
| Where am I? | Intake and source read |
| Where am I going? | Implementation, verification, commit/PR/GitHub sync, closeout |
| What is the goal? | Linear reads for a full soft cascade delete campaign |
| What have I learned? | See Findings |
| What have I done? | See Timeline |

Open risks:
- Cursor continuation across scheduled batches relies on Convex cursors being
  index-key positions. Verified in the backend source and already relied on by
  `root-update` / `root-delete` in the same file, but it is the assumption to
  revisit first if a campaign ever truncates early.
- convex-test resolves a cursor by scanning for its `_id` in the query result,
  so a test where the cursor's row is hard-deleted by unrelated work would end
  the campaign silently. Real Convex is unaffected. Not reachable in the soft
  cascade path, which never hard-deletes.

Hard closeout guard:
- A local-only final response for verified code-changing work is invalid unless
  this plan records an explicit user decline, no local patch, analytical/
  blocked/inconclusive outcome, or a real commit/PR blocker.
