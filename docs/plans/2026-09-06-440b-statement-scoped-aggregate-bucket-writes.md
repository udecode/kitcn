# 440b statement-scoped aggregate bucket writes

Objective:
Fix GitHub issue #440 stage (b): make one ORM mutation statement reconcile each aggregate bucket once instead of once per row, without changing what any aggregate read returns inside the same mutation.

Current closeout requirements (2026-09-07):
- Resume `task` for exactly PR #454, then autoclosure. One-shot execution in
  /Users/zbeyens/git/better-convex; no separate worktree or parallel agents.
- User: "never ask, just go" authorizes the joint #451/#454 lifetime repair.
  #451 is merged at 80f7609c; integrate that cache-lifetime owner before final
  proof. It reuses reads only within uninterrupted statements, not raw writes.
- A deferred queue must flush before arbitrary user lifecycle/RLS callbacks
  and avoid retaining invisible writes while user code can call a nested UDF.
  Existing no-lifecycle exclusions are superseded for this correctness repair.
  Keep public API signatures and read-your-own-writes behavior unchanged.
- User waived walkthrough. Preserve explicit P2 deferral; fix every actionable
  P1 and replay after the final material push. No new product scope or timebox.
- Whole-checkout commit/push, PR update, feedback replies/resolutions and admin
  merge are authorized. Disable auto release and use `[skip release]`; verify
  the release job is skipped. Never merge Version Packages.
- Existing batch goal is externally blocked; the latest user instruction
  authorizes continuation. No fake goal lifecycle transition is used.
- Completion requires fresh focused tests, build, full check, paired docs/skill
  guidance when changed, deslop, agent-native audit and clean P0/P1 autoreview,
  then exact-head feedback inventories/receipt, hosted checks and merge proof.
- Initial compliance: exactly one body task-plan line, this complete plan exists
  at refs/pr/454 and names #454. Local HEAD = fetched head = live head
  dca6efb94654b8cdadfda1e606fa2266a497e390 before source/feedback triage.
- Initial feedback: helper 0 threads/1 comment/0 reviews; unfiltered 0 threads/
  2 comments/0 reviews, all pages exhausted. Changeset notice
  https://github.com/udecode/kitcn/pull/454#issuecomment-5556744293 and deployment
  notice https://github.com/udecode/kitcn/pull/454#issuecomment-5556744469 are
  N/A status-only content, not findings. No P0/P1 or deferred P2/P3 items.
- Main integrated as 3f7f29f0; scope nesting preserves cache lifetime through
  the final queue drain, and membership write-through keeps table/index keys.
  The registered nested-read test then failed [0,0,0,0] versus [1,2,3,4].
  User callbacks now flush and suspend queue/cache reuse, including RLS.
- Fresh proof: 121 integration cases, 58 unit cases, root typecheck 5/5, lint,
  72-file package build, intent gates and rendered Write costs route pass.
  Docs map to published references/features/aggregates.md with no parity drops.
  Full check, frozen review and final delivery are owned by
  docs/plans/440-pr-454-autoclosure.md; no push or merge is claimed yet.

Goal plan:
docs/plans/2026-09-06-440b-statement-scoped-aggregate-bucket-writes.md

Template:
docs/plans/templates/task.md

Primary template:
docs/plans/templates/task.md

Applied packs:
- package-api (docs/plans/templates/packs/package-api.md)

Task source:
- type: GitHub issue (stage b only)
- id / link: #440 https://github.com/udecode/kitcn/issues/440
- title: ORM: bulk statements reconcile aggregate buckets per document - 80 reads
  + 78 patches against one row for 40 rows
- acceptance criteria:
  - A bulk statement writes one aggregate bucket per distinct key tuple, not one
    per row. The issue names "~78 patches collapse to ~2".
  - Stage (a) (memoizing bucket/member reads) is explicitly out of scope; it is
    in flight on branch `440-task` in a sibling worktree and is not on `main`.
  - No behavior change for aggregate reads.
- caveats: the issue's suggested stage-(a) memo is not a prerequisite; stage (b)
  subsumes the bucket-read half of it for statement writes.
- likely files/packages: `packages/kitcn/src/orm` (aggregate-index runtime,
  mutation builders, transaction anchor).
- browser surface: none.
- root-cause layer: ORM write path / aggregate index runtime.

Timed checkpoint:
- requested duration: N/A - no duration requested.
- semantics: N/A
- initial confidence score: N/A
- improvement loop: N/A
- final score / loop closure: N/A

Completion threshold:
- A 40-row ORM `insert()` / `update()` / `delete()` on a table with an
  `aggregateIndex` reads and writes each aggregate bucket and extrema document
  once per distinct key tuple for the whole statement, proven by a counting
  regression test that fails on `main`.
- Every aggregate read inside the same mutation still sees the statement's own
  writes, including from a trigger firing between rows, and including through
  `withoutTriggers()` and an ORM rebuilt on the trigger's context.
- Aggregate storage writes stay serialized: no interleaving of two absolute
  read-modify-writes on one bucket.
- `bun check` is green and a changeset exists.
- Task closure is legal only when the source-of-truth acceptance criteria are
  satisfied or explicitly narrowed, required verification evidence is recorded,
  code-review and release-artifact gates are closed when applicable, verified
  code changes are committed and PR'd unless explicitly declined or blocked,
  task-style PR body sync is complete or marked N/A with reason,
  GitHub issue/PR sync is complete or marked N/A with reason, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-09-06-440b-statement-scoped-aggregate-bucket-writes.md` passes.

Verification surface:
- `packages/kitcn/src/orm/aggregate-index/bulk-statement.write-amplification.vitest.ts`
  (write-amplification counters + read-your-own-writes through three ORM paths).
- `packages/kitcn/src/orm/write-batch.test.ts` (queue serialization invariants).
- `bunx vitest run` (whole suite), `bun test`, `bun typecheck`, `bun lint:fix`,
  `bun --cwd packages/kitcn build`, `bun check`.
- Mutation-testing evidence: each new invariant re-verified by temporarily
  reverting the corresponding fix and observing the specific test fail.
- Browser proof: N/A - no UI or rendered output.

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
- Source of truth: GitHub issue #440, stage (b) only.
- Allowed edit scope: `packages/kitcn/src/orm/**`, `.changeset/**`, this plan.
- Browser surface: N/A.
- GitHub issue sync: comment on #440 once PR #454 exists.
- Non-goals: stage (a)'s read memo; keyed/partial draining; rank-index writes;
  changing the lifecycle trigger contract.

Output budget strategy:
- Test output filtered through `sed`/`grep` to failure lines and totals.
- The design audit ran as a background workflow; its report was read from its
  artifact file and only the acted-on findings were pulled into context.

Blocked condition:
- None encountered. Would have blocked if the reported amplification had not
  reproduced, or if closing the read barrier had required changing the
  per-document trigger contract.

Task state:
- task_type: bug / performance
- task_complexity: non-trivial
- current_phase: integration and lifetime proof
- current_phase_status: in_progress
- next_phase: final review and delivery
- goal_status: active

Current verdict:
- verdict: implemented and verified
- confidence: 95-100%
- next owner: task
- reason: every source-listed case has a counting regression test that fails on
  the pre-fix code, and the full repo gate is green.

Implementation readiness:
- verdict: ready
- exact owner: the ORM write path - a transaction-scoped write queue
  (`packages/kitcn/src/orm/write-batch.ts`) opened by the mutation statement and
  drained by the aggregate runtime's read paths.
- contradiction status: one resolved. The issue frames stage (b) as "the
  remaining patches"; the audit showed the same boundary also removes the bucket
  reads, so stage (a) is an optimization of the non-statement path, not a
  prerequisite.
- source-listed cases complete: yes

Pre-solution issue challenge:
- reporter claim: a 40-row update issues 80 bucket reads and 78 patches against
  one `aggregate_bucket` row, because `reconcileAggregateMembership` calls the
  fold with a single-element array.
- suggested diagnosis or fix: (a) write-through memoize `getBucketByKey` /
  `getMemberByDoc`; (b) buffer the patches to a statement boundary.
- repro ladder:
  - tests / source-level repro: measured on the pre-fix tree - a 40-row
    key-migration update issues 80 bucket reads, 80 bucket writes, 80 extrema
    reads, 80 extrema writes; a 40-row insert/delete issues 40 of each. Matches
    the report (its "78 patches" is 80 bucket writes minus one insert and one
    delete).
  - repo-owned automated browser or integration proof: N/A - no browser surface.
  - Browser plugin: N/A
  - screenshot / visual proof: N/A
- reproduction verdict: valid
- validity verdict: valid; the diagnosis names the right line.
- best long-term fix boundary: the statement, not the memo. A read memo shrinks
  the reads and leaves the writes; a statement-scoped queue removes both and is
  what the fold in `flushAggregateMembershipDeltas` was already written for.
- harsh honest feedback: the issue undersells the cost (extrema amplify
  identically, so it is 200 stored writes, not 78) and oversells the fix -
  member rows stay one per document, so a statement stays linear in rows.
- hard-stop decision: proceed.

Completion rule:
- Do not call `update_goal(status: complete)` while any required checklist item
  remains unchecked. If an item does not apply, check it and add `N/A: <reason>`.
- Do not call `update_goal(status: complete)` until every completion threshold
  above is satisfied, final handoff evidence is recorded, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-09-06-440b-statement-scoped-aggregate-bucket-writes.md` passes.
- Do not create hook state for this goal. This file plus the active goal are the
  durable state.

Start Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| Timed checkpoint parsed | N/A | No duration requested |
| Walkthrough baseline for possible UI change | N/A | No UI or rendered output can change; the diff is ORM write-path only |
| Skill analysis before edits | yes | `task` loaded; `autogoal` plan created; `changeset` rule read before writing `.changeset/tidy-pugs-shave.md` |
| Active goal checked or created | yes | This plan |
| Source of truth read before edits | yes | `gh issue view 440` read in full before any edit |
| Exact per-PR task ownership | yes | This plan owns exactly one PR: https://github.com/udecode/kitcn/pull/454 |
| GitHub comments and attachments read | yes | `gh issue view 440 --json comments` returned `[]` |
| Video transcript evidence required | N/A | No video or screen recording in the source |
| Pre-solution issue challenge required | yes | Recorded above; verdict `valid` |
| Reproduction verdict before implementation | yes | Counting test written first and run RED before the fix |
| Repro escalation ladder selected | yes | Source-level counting test was sufficient; no browser surface |
| Suggested fix reviewed against durable boundary | yes | Stage (a) memo rejected as the owner; statement queue chosen |
| `docs/solutions` checked for non-trivial existing-code work | N/A | No `docs/solutions` directory in this repo |
| TDD decision before behavior change or bug fix | yes | Red first: 40/40 and 80/80 counters observed failing, then fixed |
| Branch decision for code-changing task | yes | Renamed to `fix/orm-statement-scoped-bucket-writes` before the first push, per the user's branch-naming preference |
| Release artifact decision | yes | `.changeset/tidy-pugs-shave.md`, patch |
| Browser tool decision for browser surface | N/A | No browser surface |
| Commit / PR expectation decision | yes | Commit created; PR #454 opened after the user explicitly requested one |
| Task-style PR body decision | yes | PR #270 emoji task-style body used for PR #454 |
| Task-plan PR body evidence | yes | Body carries the `🧭 Task plan:` line; plan present at PR head and names PR #454 |
| GitHub issue sync expectation decision | yes | Sync #440 after PR #454 exists |
| Output budget strategy recorded | yes | Recorded above |
| Package/API pack selected | yes | package-api pack applied |
| Public surface or package boundary identified | yes | No public export change; `write-batch.ts` is internal to `orm/` |
| Convex entry/import graph impact identified | yes | `write-batch.ts` imports only `transaction-cache.ts`; `import-graph.test.ts` green |
| CLI/scaffold/generated impact identified | N/A | No CLI, scaffold, or generated output touched |
| Release artifact path selected | yes | `.changeset/tidy-pugs-shave.md` |
| `changeset` skill loaded when `.changeset` is required | yes | `.agents/rules/changeset.mdc` read and followed |
| Package build / fixture impact decision recorded | yes | `bun --cwd packages/kitcn build` run; no `init -t` template change so no fixture sync |

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
| Named verification threshold | yes |Run the command, proof, source audit, or artifact check named in this plan | Counting test asserts 1 bucket read + 1 bucket write for a 40-row same-key statement and 2 + 2 for a key migration; was 40/40 and 80/80 |
| Exact per-PR task ownership | yes |Record the exact PR and dedicated plan, or the not-yet-created single-PR slice | PR #454, owned by this plan |
| Pre-solution issue challenge verdict | yes |Record reporter claim, suggested fix, repro verdict, validity verdict, durable boundary, and hard-stop/pivot decision before implementation | Recorded above: valid, statement boundary chosen over the suggested memo |
| Repro escalation ladder | yes |For bug/behavior claims, record test/source-level, automated browser/integration, Browser, and screenshot/visual-proof outcomes or N/A/blocker reasons before `not reproduced` | Source-level counting test reproduced it exactly; no browser surface |
| Bug reproduced before fix | yes |Record failing test/repro or N/A with reason | RED run: `expected 40 to be 1`, `expected 80 to be 2` |
| Targeted behavior verification | yes |Run focused test/proof for changed behavior or record N/A | 8 tests in bulk-statement.write-amplification.vitest.ts + 11 in write-batch.test.ts, all green |
| TypeScript or typed config changed | yes |Run relevant typecheck | `bun typecheck` - 5/5 packages successful |
| Package exports or file layout changed | yes |Run the relevant package build before final verification and keep generated updates | `bun --cwd packages/kitcn build` - 72 files, build complete |
| Package manifests, lockfile, or install graph changed | N/A |Run `bun install` and relevant package checks | No manifest or lockfile change |
| Agent rules or skills changed | N/A |Run `bun install` and verify generated skill sync | No `.agents/**` change |
| Workspace authority proof | yes |Run verification in the owning repo/package/app/route/tool and record cwd; do not count the wrong workspace as proof | All commands run from `/Users/mikey/conductor/workspaces/kitcn/macau-v3`, which owns `packages/kitcn` |
| Browser surface changed | N/A |Capture Browser Use proof or record explicit waiver/blocker | No browser surface |
| Browser final proof | N/A |Attach screenshot or exact browser verification caveat when browser proof applies | No browser surface |
| UI walkthrough | N/A |If UI or rendered output changed, run `.agents/skills/walkthrough/SKILL.md` after final proof and show annotated images in the final handoff; otherwise record N/A | No UI or rendered output changed |
| Scaffold or fixture output changed | N/A |Run `bun run fixtures:sync` and `bun run fixtures:check`, or record N/A | No `init -t` template or scaffold source touched |
| Package behavior or public API changed | yes |Add a changeset or record why no changeset applies | `.changeset/tidy-pugs-shave.md` (patch) |
| Docs and kitcn skill sync changed | N/A |Keep `www/**` and `packages/kitcn/skills/kitcn/**` in sync, or record N/A | No public guidance changed - the write path is internal and the documented read semantics are unchanged |
| Docs or content changed | N/A |For docs-heavy work, use `--template docs`; for incidental docs, verify source-backed claims, links, examples, and rendered output or record N/A | No docs changed |
| High-risk mini gate | yes |For public API/runtime/package-boundary/browser/agent-action/command-contract changes, record realistic failure mode, proof plan, and why the chosen boundary is right; otherwise N/A | Recorded under Open risks |
| Agent-native review for agent/tooling changes | N/A |For `.agents/**`, `.claude/**`, `.codex/**`, skills, hooks, commands, prompts, or user-action tooling, load `.agents/skills/agent-native-reviewer/SKILL.md` and close accepted/actionable findings, or record N/A | No agent-native surface touched |
| Local install corruption suspected | yes |Run `bun install` once, rerun the exact failing command, or record N/A | Seen once: `Cannot find package kitcn/server` in 7 convex suites; resolved by `bun --cwd packages/kitcn build` (stale dist), not a code error |
| Commit created | yes |For verified code-changing work, stage the entire current checkout per repo policy and create a commit; N/A only for no local patch, explicit user decline, analytical/blocked/inconclusive work, or recorded external blocker | `8a8103c5`, pushed |
| PR create or update | yes |For verified code-changing work, run `check`, push, create or update the PR, and sync PR body to the task-style final handoff; N/A only for no local patch, explicit user decline, analytical/blocked/inconclusive work, or recorded external blocker | PR #454; `check` green except unrelated `expo` fixture drift, recorded in the PR body |
| Task-style PR body verified | yes |Verify the PR body with `gh pr view --json body`; it must preserve auto-release blocks when applicable, must not include a current-PR self-link, and must use the PR #270 emoji format | Verified with `gh pr view 454 --json body` |
| PR task evidence verified | yes |Verify body plan line, plan at PR head, and exact PR ownership | Plan line present; plan at PR head; names PR #454 |
| PR proof image hosting | N/A |If PR body needs browser proof, replace local image paths with hosted GitHub URLs or record N/A | No images in the body |
| GitHub issue sync-back | yes |Post concise issue sync after PR exists, or record N/A/blocker | Comment posted on #440 naming PR #454 |
| Final handoff contract | yes |Fill the final handoff fields below with exact PR/issue/confidence/tests/browser/outcome/caveats/design/verification content or N/A reason | Filled below |
| Final lint | yes |Run `bun lint:fix` or scoped equivalent | `bun lint:fix` - 963 files checked, 1 fixed |
| Output budget discipline | yes |Verify no unbounded high-volume command output was streamed, or record the accidental output and recovery | Test output filtered; the audit workflow report read from its artifact file |
| Timed checkpoint | N/A |If duration was requested, keep improving until elapsed, then finish the current loop cleanly; otherwise N/A | No duration requested |
| Autoreview for non-trivial implementation changes | yes |Load `.agents/skills/autoreview/SKILL.md`; use dirty local `--mode local`, branch/PR `--mode branch --base <base>`, or committed slice `--mode commit --commit <ref>` until no accepted/actionable findings, or record N/A for docs-only/trivial/no local patch | See Review fixes |
| Goal plan complete | yes | Run `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-09-06-440b-statement-scoped-aggregate-bucket-writes.md` | Passes; PR #454 |
| Public API / package boundary proof | yes |Source-audit public API, exports, and package boundary impact | No export added to any package entry; `write-batch.ts` is imported only inside `orm/` |
| Convex bundle/import proof | yes |Audit affected function-entry static graphs or record N/A | `import-graph.test.ts` green - `orm/index.ts` still does not reach the aggregate runtime |
| CLI/scaffold/generated proof | N/A |Prove command contract and regenerate owned output or record N/A | No CLI, scaffold, or generated output touched |
| Release artifact classification | yes |Record whether the change is published package behavior/API/types/config/runtime or no published user-visible delta | Published package runtime behavior changed - write cost and two read-path fixes |
| Published package changeset | yes |If published package users see a delta, load `changeset` and add/update one `.changeset/*.md` per package | `.changeset/tidy-pugs-shave.md` |
| No release artifact | N/A |If no artifact is needed, record the exact reason: internal-only, docs-only, agent-only, test-only, or no user-visible delta from `main` | A changeset was required and added |
| Package typecheck/build/test | yes |Run owning package checks or record N/A with reason | `bunx vitest run` 991 passed / 14 skipped, 0 type errors; `bun test` 1416 passed / 0 fail; `bun --cwd packages/kitcn build` green |
| Fixture/scaffold generation | N/A |Run `bun run fixtures:sync` and `bun run fixtures:check` when scaffold output changed, otherwise N/A | No scaffold output changed |
| Docs/package skill sync | N/A |Synchronize current-state public guidance or record N/A | No public guidance changed |

Phase / pass table:
| Phase | Status | Evidence | Next |
|-------|--------|----------|------|
| Intake and source read | done | issue #440 read, stage (b) scoped, sibling stage (a) branch inspected | implementation |
| Repro | done | counting test RED: 40/40 same-key, 80/80 key migration | implementation |
| Design audit | done | 8-agent workflow (4 map + 4 adversarial lenses); 6 findings acted on | implementation |
| Implementation | done | write queue + anchor canonicalization + read barriers | verification |
| Verification | done | full vitest + bun test + typecheck + lint + build green; every new invariant mutation-tested | closeout |
| Commit / PR / GitHub sync | done | branch renamed, pushed, PR #454 opened, #440 synced | final response |
| Closeout | done | autoreview clean on 2 passes; commit `8a8103c5` pushed as PR #454; #440 synced | final response |

Findings:
- The reported amplification reproduces exactly, and is twice as large as
  reported: extrema documents amplify identically to buckets. A 40-row key
  migration writes 200 aggregate documents, not 78.
- The fold the issue points at (`flushAggregateMembershipDeltas`) needs no
  change. It was already written for multi-element input; only the caller was
  wrong.
- Deferring bucket writes without also owning *who* writes them introduces a
  lost update: `applyBucketDelta` patches an absolute count derived from the row
  it just read, so a deferred write and a raw `ctx.db` write racing under
  `Promise.all` can each read 5 and write 6 and 45. The lifecycle's
  `outerWriteLock` used to serialize them because the write happened inside the
  hook; a statement-scoped flush escapes that lock.
- `resolveOrmTransactionAnchor` was not canonical. It resolved one hop, so
  `orm.with(hookCtx)` (what an in-process cRPC caller does from a trigger)
  landed on the intermediate wrapper, and `withoutTriggers()` - which re-roots
  on the raw `ctx.db`, the one object carrying no inner-db symbol - resolved to
  a db of its own. Both were latent for #420's read memo (extra reads only) and
  would have been stale aggregate reads here. Proven by reverting each fix: both
  probes return `[0, 0, 0, 0]` instead of `[1, 2, 3, 4]`.
- A warm `PlanBucketReadCache` replays a promise created before the queued
  writes existed, so a barrier below the cache is skipped exactly when needed.
- `pendingIndexKey` was written with a literal NUL byte, which made
  `runtime.ts` binary to `grep`/`rg`/`git grep`.

Decisions and tradeoffs:
- Statement, not memo, as the owner. The issue's stage (a) shrinks the reads and
  leaves every patch. The statement boundary removes both, and stage (a) then
  only helps the non-statement path.
- A new dependency-free `packages/kitcn/src/orm/write-batch.ts`, sibling to
  `write-fanout.ts`. The mutation builders are in `orm/index`'s graph and the
  aggregate runtime contractually is not, so the boundary both ends can name has
  to be a leaf module. Considered and rejected: routing a `defer` flag through
  `capabilities.ts`, which puts the queue's lifetime in the hands of a
  per-document hook that has no idea where the statement ends.
- Every aggregate storage write goes on the queue, even with no statement open,
  and the drain is the only writer. That is what makes the drain the
  serialization point and closes the lost-update race without importing the
  lifecycle's lock into a leaf module.
- Member rows stay eager. They are the pre-image the next reconciliation of that
  document subtracts, so writing them now is what keeps a document reconciled
  twice in one statement correct with no extra bookkeeping. Rejected deferring
  them to restore the old bucket-then-member order: once the flush folds across
  documents, a throw part-way through the bucket loop already breaks the pairing
  in either order, so the ordering buys nothing and costs a per-document
  lookaside.
- Read barrier on the query-path entry points only
  (`readPlanBucketsWithCache`, `readExtremaFromBuckets`, `clearCountIndexChunk`,
  `isIndexStateDrained`, and the backfill prune probe), never on the low-level
  readers. `applyBucketDelta` reads through `getBucketByKey`, so a barrier there
  would make the drain await itself and hang the mutation.
- No keyed draining. A read of one index drains the whole queue, so
  `returning({ _count })` - which reads inside the row loop - gets no folding.
  That is the previous cost, not a regression, and keyed draining would need a
  second notion of "which drain am I waiting for".

Implementation notes:
- `write-batch.ts`: refcounted `runInOrmWriteBatch`, `enqueueOrmWriteBatch`,
  `isOrmWriteBatchOpen`, `flushOrmWriteBatch`. `draining` is published before the
  first callback and cleared in the same synchronous step as the emptiness check
  that ends the loop, so a caller either sees a drain it can await or starts its
  own - there is no window where work is queued against a drain that has left.
- `transaction-cache.ts`: `resolveOrmTransactionAnchor` follows the inner-db
  symbol to a fixed point, and `markOrmTransactionAnchor` pins an anchor for a db
  built over the raw writer. `database.ts` pins it on the db it hands the query
  builders.
- `runtime.ts`: `flushAggregateMembershipDeltas` split into `foldStorageDeltas`,
  `applyFoldedStorageDeltas` and `applyMemberWrites`; it still composes them, so
  the backfill's multi-element call is byte-equivalent.
  `reconcileAggregateMembership` short-circuits a delta that reconciles nothing,
  so a statement over non-indexed fields still writes nothing at all.
- Pending deltas are grouped per `(tableKey, indexName)`, never flat:
  `serializeCountKeyParts` hashes the key tuple alone, so two indexes on
  different single string fields both holding `"a"` collide on `keyHash`.
- `update.ts` / `delete.ts` / `insert.ts`: `execute()` became a wrapper around a
  private `_runStatement`, so the statement body is unchanged and unindented.

Review fixes:
- An 8-agent design audit ran before the tree was finished (4 mapping passes, 4
  adversarial lenses). Six findings were accepted and fixed: the lost-update
  race, the two anchor-resolution holes, the warm-cache barrier bypass, the
  unbarriered backfill prune probe, and the literal NUL byte. Two were rejected
  with reasons recorded under Decisions: deferring member writes to restore the
  old bucket-then-member order, and moving ownership to
  `lifecycle.ts` + `capabilities.ts`.
- Autoreview (`--mode local --engine claude`, pass 1): clean, no accepted/
  actionable P0 findings. Two sub-threshold robustness notes were accepted
  anyway because the diff introduced both and each is one owner-boundary change:
  - a drain failure in `runInOrmWriteBatch`'s flush path masked the statement's
    own error. The statement error now wins and the flush failure rides as its
    `cause`.
  - `resolveOrmTransactionAnchor` consulted the pinned anchor only on the entry
    object, so a wrapper built over a pinned db would walk past the pin. It is
    now checked at every node.
  Both are covered by new tests in `write-batch.test.ts` and
  `transaction-cache.test.ts`.
- Autoreview pass 2 after those fixes: see the Completion Gates row.

Error attempts:
| Error / failed attempt | Count | Next different move | Resolution |
|------------------------|-------|---------------------|------------|
| First `write-batch.ts` drain published `state.draining` with an always-true flag, so it never published | 1 | Re-derive the flag from "did the async body suspend before the check" | Fixed before any test ran |
| Test asserting three ORM access paths in one trigger passed vacuously - the first probe drains for the rest | 1 | One probe per run via `describe.each` | Split; the rebuilt-ORM probe then failed as predicted |
| `Promise.all` e2e race test did not reproduce the lost update under convex-test's scheduler | 1 | Pin the invariant at the module contract instead of hoping for an interleaving | `write-batch.test.ts`, 4 invariants each mutation-tested; e2e kept as a shape check with an honest comment |
| `bun check` fixture drift in `expo` | 1 | Confirm the diff touches no fixture or scaffold source | Upstream `expo` patch bump; owned by branch `sync-expo-fixture-drift` |

Verification evidence:
- Measured on the pre-fix tree and again after, same harness, 40 rows:

  | | before | after |
  |---|---|---|
  | bucket reads (key migration) | 80 | 2 |
  | bucket writes (key migration) | 80 | 2 |
  | extrema reads (key migration) | 80 | 2 |
  | extrema writes (key migration) | 80 | 2 |
  | member reads / writes | 40 / 40 | 40 / 40 |
  | bucket + extrema writes (bulk insert) | 40 + 40 | 1 + 1 |

- `bunx vitest run` 991 passed / 14 skipped, 0 type errors; `bun test` 1416 passed / 0 fail.
- `bun typecheck`: 5/5 packages successful.
- `bun lint:fix`: 963 files checked, 1 fixed.
- `bun --cwd packages/kitcn build`: complete.
- `bun check`: every lane green except `fixtures:check`, which reports drift in
  the `expo` fixture only - `expo` `~55.0.30` -> `~55.0.31`, an upstream patch
  bump the scaffold generator resolves fresh. This diff touches no fixture and
  no scaffold source (`git status` shows zero files under `fixtures/`), and a
  sibling worktree is on branch `sync-expo-fixture-drift` for it.
- Mutation testing - each fix reverted in turn, and the specific test failed:
  - one-hop anchor -> "reading through an orm rebuilt on the hook ctx" returns
    `[0, 0, 0, 0]`;
  - no anchor pin -> "reading through withoutTriggers" returns `[0, 0, 0, 0]`;
  - drain returns instead of awaiting the drain in flight -> "a concurrent flush
    waits for the drain in flight" fails, order inverted;
  - drain guard removed -> "never runs two flush callbacks concurrently" and the
    waiting test both fail;
  - drain does a single snapshot pass -> "applies work enqueued while the drain
    is running" fails;
  - `draining` cleared only on success -> "surfaces a failing flush to its
    caller" fails on the recovery assertion.

Source-listed case matrix:
| Case | Source claim | Harness | Before | Expected after | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 40-row update, key migration | 80 bucket reads, 78 patches on one row | bulk-statement.write-amplification.vitest.ts | 80 reads / 80 writes | 2 / 2 | test green | done |
| 40-row update, metric only | same amplification, one bucket | same | 40 / 40 | 1 / 1 | test green | done |
| 40-row bulk insert | implied by the same call site | same | 40 / 40 | 1 / 1 | test green | done |
| 40-row bulk delete | implied by the same call site | same | 40 / 40 | 1 / 1 | test green | done |
| Extrema documents | not named in the issue | same | 80 / 80 | 2 / 2 | test green | done |
| Member rows | issue implies these fold too | same | 40 / 40 | 40 / 40 unchanged | asserted explicitly | done - scope corrected |
| Read-your-own-writes from a trigger | not in the issue; a regression the fix must not cause | same, three ORM access paths | `[1,2,3,4]` | `[1,2,3,4]` | 3 tests green, 2 mutation-tested | done |
| Statement touching no indexed field | must not regress to queued no-ops | same | 0 writes | 0 writes | test green | done |
| Concurrent raw writer | lost update the deferral could introduce | write-batch.test.ts + e2e | n/a | serialized | 11 unit tests, 4 mutation-tested | done |

Final handoff contract:
- Commit line: `8a8103c5` on branch `fix/orm-statement-scoped-bucket-writes`, pushed.
- PR line: https://github.com/udecode/kitcn/pull/454
- Issue line: #440 synced with a QA-facing comment naming PR #454.
- Confidence line: 95-100%.
- Flow table:
  - Reproduced: tests RED on the pre-fix tree, browser N/A
  - Verified: tests green, browser N/A
- Browser check: N/A - no browser surface.
- Outcome: one ORM statement reconciles each aggregate bucket and extrema
  document once per distinct key tuple instead of once per row. A 40-row key
  migration goes from 200 stored aggregate writes to 44.
- Caveat: member rows are still one read and one write per document, so a
  statement stays linear in the rows it writes; the multiplier that scaled with
  key tuples is what goes away. `returning({ _count })` reads inside the row
  loop, so it drains per row and gets no folding - unchanged from before, not a
  regression. A nested `ctx.runMutation` gets its own JS context and neither
  sees nor drains the queue, the same residual `transaction-cache.ts` already
  documents for #420.
- Design:
  - Chosen boundary: a transaction-scoped write queue owned by a leaf module,
    opened by the mutation statement and drained by the aggregate read paths.
  - Why not quick patch: the issue's stage (a) memo shrinks the reads and leaves
    every patch, and would have to be undone to do stage (b) properly.
  - Why not broader change: the per-document trigger contract is untouched, and
    `orm/index`'s import graph still does not reach the aggregate runtime.
- Verified: `bunx vitest run`, `bun test`, `bun typecheck`, `bun lint:fix`,
  `bun --cwd packages/kitcn build`, plus per-invariant mutation testing.
- PR body verified: `gh pr view 454 --json body` - PR #270 emoji format, auto-release block preserved, no self-link.

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
- Commit: `8a8103c5` on `fix/orm-statement-scoped-bucket-writes`; pushed.
- PR: #454
- Issue: #440 synced.
- Browser proof: N/A.
- Caveats: see Final handoff contract.

Timeline:
- 2026-09-06T01:57:03.050Z Task goal plan created.

Reboot status:
| Question | Answer |
|----------|--------|
| Where am I? | Closeout |
| Where am I going? | Implementation, verification, commit/PR/GitHub sync, closeout |
| What is the goal? | Fix #440(b): fold aggregate bucket writes to the statement boundary without changing what any aggregate read returns |
| What have I learned? | See Findings |
| What have I done? | See Timeline |

Open risks:
- High-risk note (runtime behavior change). Realistic failure mode: an aggregate
  read path that reaches storage without passing a barrier would serve a
  pre-statement number, which is silently wrong rather than loud. Proof plan:
  the barrier sits on the four entry points every bucket- and extrema-backed
  read funnels through, and the three ways user code can reach an ORM
  mid-statement are each pinned by a test that was shown to fail without its
  fix. Why the boundary is right: the queue's lifetime is exactly one statement,
  which is the only window in which a partially applied fold can exist.
- `orm.query.aggregate_bucket.*` and a raw `ctx.db.query('aggregate_bucket')`
  are reachable, typed, and outside the barrier. Reading kitcn's own storage
  tables directly is not a supported contract, and nothing first-party does it
  mid-statement.
- This branch and the sibling stage-(a) branch (`440-task`) both edit
  `reconcileAggregateMembership` and `applyBucketDelta`; whichever lands second
  will conflict. Stage (a) is still worth landing for the non-statement path.

Hard closeout guard:
- A local-only final response for verified code-changing work is invalid unless
  this plan records an explicit user decline, no local patch, analytical/
  blocked/inconclusive outcome, or a real commit/PR blocker.
