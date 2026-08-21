# 406 ORM per-transaction memo lifetime

Objective:
Give the ORM a real per-transaction memo lifetime and stop the three named
read-amplification sites from re-issuing an identical read once per row.

Goal plan:
docs/plans/2026-08-21-406-orm-per-transaction-memo-lifetime.md

Template:
docs/plans/templates/task.md

Primary template:
docs/plans/templates/task.md

Applied packs:
- none (no docs/browser/agent-native/package-API surface: the primitive is
  internal to `packages/kitcn/src/orm`, not exported from any package entry)

Task source:
- type: GitHub issue
- id / link: https://github.com/udecode/kitcn/issues/406
- title: ORM: no per-transaction memo lifetime - FK probes, CLEARING probes, and
  relation targets re-read once per row
- acceptance criteria:
  1. A per-transaction memo lifetime exists, keyed on the stable per-transaction
     writer, never on a closure built at module scope.
  2. insert() stops issuing one `db.get(foreignId)` per row for rows sharing one
     foreign key.
  3. `assertAggregateIndexesWritable` stops re-probing the `by_table_status`
     CLEARING range once per written row.
  4. Relation target documents stop being re-resolved once per parent row.
- caveats: issue text asserts all three consumers want per-transaction lifetime.
  Two of them do not; see "Decisions and tradeoffs".
- likely files: `packages/kitcn/src/orm/{transaction-cache,insert,mutation-utils,
  query}.ts`, `packages/kitcn/src/orm/aggregate-index/runtime.ts`
- browser surface: none
- root-cause layer: ORM runtime read path
- comments/attachments: `gh issue view 406 --json comments` -> `[]` (none)

Timed checkpoint:
- requested duration: N/A - no duration requested
- semantics: N/A
- initial confidence score: N/A
- improvement loop: N/A
- final score / loop closure: N/A

Completion threshold:
- All four acceptance criteria above are satisfied by source changes, each with
  a read-count regression test that fails on `origin/main` and passes after.
- No existing ORM test regresses (`vitest run` over the orm + convex lanes).
- Task closure is legal only when the source-of-truth acceptance criteria are
  satisfied or explicitly narrowed, required verification evidence is recorded,
  code-review and release-artifact gates are closed when applicable, verified
  code changes are committed and PR'd unless explicitly declined or blocked,
  task-style PR body sync is complete or marked N/A with reason,
  GitHub issue/PR sync is complete or marked N/A with reason, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-08-21-406-orm-per-transaction-memo-lifetime.md` passes.

Verification surface:
- `bun check` (final repo gate before PR)
- `bunx vitest run packages/kitcn/src/orm/<new>.vitest.ts` (read-count bounds)
- `bunx vitest run packages/kitcn/src/orm convex/orm` (no regressions)
- `bun --cwd packages/kitcn build`
- `bun typecheck`, `bun lint:fix`
- changeset under `.changeset/`

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
- Source of truth: GitHub issue #406 (read in full, no comments).
- Allowed edit scope: `packages/kitcn/src/orm/**`, its tests, `.changeset/`,
  `docs/plans/`.
- Browser surface: N/A - no UI or rendered output changes.
- GitHub issue sync: PR #420 references the issue with `Fixes #406`, which is
  the sync-back for this task.
- Non-goals: refactoring update()'s existing per-statement FK memo; changing the
  `matchesPostFetchMembership` one-row batching itself (only its read cost);
  re-arming the two unrelated unarmed read-bound tests in `convex/orm/`.

Output budget strategy:
- Recon fanned out through one background Workflow whose findings were persisted
  to a tool-results artifact and read in bounded pages, not streamed inline.
- Source reads are line-ranged (`sed -n`) against an 8978-line `query.ts`.
- Test runs are scoped to single files or single directories, never `bun check`
  unless a repo-wide gate is genuinely required.

Blocked condition:
- Only if a read-count regression test cannot be made to fail on `origin/main`,
  which would mean the reported amplification is not reproducible.

Task state:
- task_type: bug / performance defect (read amplification)
- task_complexity: non-trivial
- current_phase: closeout
- current_phase_status: complete
- next_phase: final response
- goal_status: complete

Current verdict:
- verdict: partially valid
- confidence: high on all four measured behaviours
- next owner: task
- reason: the amplification is real at all three sites, but only consumer 2
  wants per-transaction lifetime. Per-transaction would be a correctness
  regression for consumers 1 and 3.

Implementation readiness:
- verdict: ready
- exact owner: `packages/kitcn/src/orm` runtime read path
- contradiction status: one resolved - see "Decisions and tradeoffs" D2/D4
- source-listed cases complete: yes (4 cases, see case matrix)

Pre-solution issue challenge:
- reporter claim: three ORM sites re-issue an identical read once per row; all
  three are blocked on a missing per-transaction memo lifetime.
- suggested diagnosis or fix: one `WeakMap<innerDb, TxnCache>` keyed via
  `getOrmLifecycleInnerDb`, shared by all three consumers.
- repro ladder:
  - tests / source-level repro: yes - read-count vitest per consumer
  - repo-owned automated browser or integration proof: N/A - no browser surface
  - Browser plugin: N/A
  - screenshot / visual proof: N/A - no visual output
- reproduction verdict: valid (all three amplifications reproduce)
- validity verdict: partially valid
- best long-term fix boundary: one per-transaction primitive for the consumer
  that provably needs it, and the correct narrower lifetime for the other two.
- harsh honest feedback:
  1. `getOrmLifecycleInnerDb` returns `undefined` for every reader ctx
     (`lifecycle.ts:849` refuses to wrap non-writers) and for every schema with
     no triggers and no aggregate/rank indexes (`lifecycle.ts:840`). The
     proposed anchor is absent in the majority of cases, including 100% of the
     queries consumer 3 lives in. A `?? db` fallback is mandatory.
  2. Per-transaction is unsound for consumer 1: `insert(children)` ->
     `delete(parent)` -> `insert(children)` in one transaction would write a
     dangling foreign key with no hook, no warning, and no existing test.
  3. Consumer 3 is misdiagnosed. `relationDefinition.where` is a synchronous
     column-only predicate (`query.ts:7975`, `relations.ts:664`) and issues zero
     reads. The amplification is `matchesPostFetchMembership` handing
     `_applyRelationsFilterToRows` a one-row array (`query.ts:6470`), which
     starves every downstream de-duplication map.
- hard-stop decision: proceed - reproduced and valid, pivoting the two
  misdiagnosed lifetimes.

Completion rule:
- Do not call `update_goal(status: complete)` while any required checklist item
  remains unchecked. If an item does not apply, check it and add `N/A: <reason>`.
- Do not call `update_goal(status: complete)` until every completion threshold
  above is satisfied, final handoff evidence is recorded, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-08-21-406-orm-per-transaction-memo-lifetime.md` passes.
- Do not create hook state for this goal. This file plus the active goal are the
  durable state.

Start Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| Timed checkpoint parsed | no | N/A: no duration requested |
| Walkthrough baseline for possible UI change | no | N/A: ORM runtime only, no UI or rendered output can change |
| Skill analysis before edits | yes | task + autogoal loaded; testing/tdd not needed (behaviour tests written inline); no browser/docs/agent-native surface |
| Active goal checked or created | yes | this plan |
| Source of truth read before edits | yes | issue #406 body read in full via attachment and `gh issue view 406` |
| Exact per-PR task ownership | yes | PR #420, this plan owns exactly that PR |
| GitHub comments and attachments read | yes | `gh issue view 406 --json comments` -> `[]` |
| Video transcript evidence required | no | N/A: no video or screen recording in source |
| Pre-solution issue challenge required | yes | recorded above: partially valid |
| Reproduction verdict before implementation | yes | valid; each consumer reproduced by a failing read-count bound |
| Repro escalation ladder selected | yes | source-level vitest sufficed; browser rungs N/A |
| Suggested fix reviewed against durable boundary | yes | see Decisions D1-D6 |
| `docs/solutions` checked for non-trivial existing-code work | no | N/A: `docs/solutions` does not exist in this repo |
| TDD decision before behavior change or bug fix | yes | read-count bounds written and proven failing before the fix was kept |
| Branch decision for code-changing task | yes | renamed placeholder `issue-406` to `fix/orm-per-transaction-memo-lifetime` before the first push |
| Release artifact decision | yes | new changeset `.changeset/tricky-pots-shake.md` (no unreleased draft existed) |
| Browser tool decision for browser surface | no | N/A: no browser surface |
| Commit / PR expectation decision | yes | user later requested a PR, which supersedes the standing decline; committed, pushed, PR #420 |
| Task-style PR body decision | yes | PR #270 emoji task-style body used |
| Task-plan PR body evidence | yes | body line `🧭 Task plan: docs/plans/2026-08-21-406-orm-per-transaction-memo-lifetime.md`; plan present at PR head; identifies PR #420 |
| GitHub issue sync expectation decision | no | N/A: no PR exists to reference in a QA sync comment |
| Output budget strategy recorded | yes | see Output budget strategy |

Work Checklist:
- [x] If a duration was requested, it is recorded as minimum active work unless
      explicitly marked hard stop; when no better metric exists, initial and
      final confidence scores are recorded. N/A: no duration requested.
- [x] Objective includes outcome, completion threshold, verification surface,
      constraints, boundaries, and blocked condition.
- [x] Task source classified with source type, id/link, title, task type,
      acceptance criteria, caveats, likely files/routes/packages, browser
      surface, and root-cause layer.
- [x] Every GitHub PR in scope has its own task plan. This plan owns one exact
      PR, owns a not-yet-created PR slice, or records N/A because no PR is in
      scope; a batch plan is not used as a substitute. This plan owns exactly
      one PR: #420.
- [x] Required video or screen-recording evidence is cached/read as normalized
      `<video-transcripts>` XML, or marked N/A with reason. N/A: source is a
      text-only GitHub issue.
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
      Recorded: commit `4f6761c7` and PR #420 completed after the user
      requested a PR.
- [x] PR body shape recorded: PR #270 emoji task-style body used, N/A reason
      recorded, or blocker recorded. PR #270 emoji body used on #420.
- [x] PR task evidence recorded: body includes `🧭 Task plan: ...`, the plan
      exists at the PR head, and it identifies the exact PR before autoclosure.
      All three hold for #420.
- [x] Branch handling recorded for code-changing work: dedicated branch used,
      new branch needed, or N/A with reason. Recorded: renamed the placeholder
      `issue-406` to `fix/orm-per-transaction-memo-lifetime` before the first
      push, per the user's branch-naming preference.
- [x] Local-env-rot retry policy recorded for any surprising repo-wide failure:
      reinstall/rerun evidence or N/A with reason. N/A: no surprising
      repo-wide failure occurred.
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

Completion Gates:
| Gate | Applies | Required action | Evidence |
|------|---------|-----------------|----------|
| Named verification threshold | yes | Run the command, proof, source audit, or artifact check named in this plan | all four read-count bounds pass; see Verification evidence |
| Exact per-PR task ownership | yes | Record the exact PR and dedicated plan, or the not-yet-created single-PR slice | PR #420; this plan owns exactly that PR |
| Pre-solution issue challenge verdict | yes | Record reporter claim, suggested fix, repro verdict, validity verdict, durable boundary, and hard-stop/pivot decision before implementation | partially valid; pivoted consumers 1 and 3 |
| Repro escalation ladder | yes | For bug/behavior claims, record test/source-level, automated browser/integration, Browser, and screenshot/visual-proof outcomes or N/A/blocker reasons before `not reproduced` | source-level repro reproduced every case; browser rungs N/A |
| Bug reproduced before fix | yes | Record failing test/repro or N/A with reason | each bound re-run with only its source file stashed |
| Targeted behavior verification | yes | Run focused test/proof for changed behavior or record N/A | 4 new test files, 19 assertions across them, all pass |
| TypeScript or typed config changed | yes | Run relevant typecheck | `bun typecheck` 5/5 successful |
| Package exports or file layout changed | yes | Run the relevant package build before final verification and keep generated updates | `bun --cwd packages/kitcn build` complete; `orm/import-graph.test.ts` still green |
| Package manifests, lockfile, or install graph changed | no | Run `bun install` and relevant package checks | N/A: no manifest or lockfile change |
| Agent rules or skills changed | no | Run `bun install` and verify generated skill sync | N/A: no `.agents/**` change |
| Workspace authority proof | yes | Run verification in the owning repo/package/app/route/tool and record cwd; do not count the wrong workspace as proof | every command run from the repo root that owns `packages/kitcn` |
| Browser surface changed | no | Capture Browser Use proof or record explicit waiver/blocker | N/A: ORM runtime only |
| Browser final proof | no | Attach screenshot or exact browser verification caveat when browser proof applies | N/A: no browser surface |
| UI walkthrough | no | If UI or rendered output changed, run `.agents/skills/walkthrough/SKILL.md` after final proof and show annotated images in the final handoff; otherwise record N/A | N/A: no UI or rendered output changed |
| Scaffold or fixture output changed | no | Run `bun run fixtures:sync` and `bun run fixtures:check`, or record N/A | N/A: no `init -t` template or scaffold source touched |
| Package behavior or public API changed | yes | Add a changeset or record why no changeset applies | changeset `.changeset/tricky-pots-shake.md` |
| Docs and kitcn skill sync changed | no | Keep `www/**` and `packages/kitcn/skills/kitcn/**` in sync, or record N/A | N/A: no `www/**` or `packages/kitcn/skills/kitcn/**` change |
| Docs or content changed | no | For docs-heavy work, use `--template docs`; for incidental docs, verify source-backed claims, links, examples, and rendered output or record N/A | N/A: only the task plan and a changeset |
| High-risk mini gate | yes | For public API/runtime/package-boundary/browser/agent-action/command-contract changes, record realistic failure mode, proof plan, and why the chosen boundary is right; otherwise N/A | recorded under Verification evidence |
| Agent-native review for agent/tooling changes | no | For `.agents/**`, `.claude/**`, `.codex/**`, skills, hooks, commands, prompts, or user-action tooling, load `.agents/skills/agent-native-reviewer/SKILL.md` and close accepted/actionable findings, or record N/A | N/A: no agent/tooling surface touched |
| Local install corruption suspected | no | Run `bun install` once, rerun the exact failing command, or record N/A | N/A: no surprising repo-wide failure |
| Commit created | yes | For verified code-changing work, stage the entire current checkout per repo policy and create a commit; N/A only for no local patch, explicit user decline, analytical/blocked/inconclusive work, or recorded external blocker | `4f6761c7`, entire checkout staged per repo policy |
| PR create or update | yes | For verified code-changing work, run `check`, push, create or update the PR, and sync PR body to the task-style final handoff; N/A only for no local patch, explicit user decline, analytical/blocked/inconclusive work, or recorded external blocker | `bun check` green, pushed, PR #420 created with the task-style body |
| Task-style PR body verified | yes | Verify the PR body with `gh pr view --json body`; it must preserve auto-release blocks when applicable, must not include a current-PR self-link, and must use the PR #270 emoji format: `🐛 Fixes ...`, `🟢 95-100% confidence`, `Phase / 🧪 Tests / 🌐 Browser` table, and bold emoji Outcome/Caveat/Design/Verified sections | `gh pr view 420 --json body` matches the PR #270 emoji format |
| PR task evidence verified | yes | Verify body plan line, plan at PR head, and exact PR ownership | body plan line present, plan at PR head, plan names PR #420 |
| PR proof image hosting | no | If PR body needs browser proof, replace local image paths with hosted GitHub URLs or record N/A | N/A: no PR and no images |
| GitHub issue sync-back | yes | Post concise issue sync after PR exists, or record N/A/blocker | PR #420 body carries `🐛 Fixes #406`, which closes the issue on merge |
| Final handoff contract | yes | Fill the final handoff fields below with exact PR/issue/confidence/tests/browser/outcome/caveats/design/verification content or N/A reason | filled above |
| Final lint | yes | Run `bun lint:fix` or scoped equivalent | `bun lint:fix` -> no fixes applied |
| Output budget discipline | yes | Verify no unbounded high-volume command output was streamed, or record the accidental output and recovery | workflow findings artifacted and paged; source reads line-ranged |
| Timed checkpoint | no | If duration was requested, keep improving until elapsed, then finish the current loop cleanly; otherwise N/A | N/A: no duration requested |
| Autoreview for non-trivial implementation changes | yes | Load `.agents/skills/autoreview/SKILL.md`; use dirty local `--mode local`, branch/PR `--mode branch --base <base>`, or committed slice `--mode commit --commit <ref>` until no accepted/actionable findings, or record N/A for docs-only/trivial/no local patch | `--mode local --engine claude` -> exit 0, `autoreview clean: no accepted/actionable findings reported`, `patch is correct (0.72)`; rerun after the one review-triggered fix |
| Goal plan complete | yes | Run `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-08-21-406-orm-per-transaction-memo-lifetime.md` | passes |

Phase / pass table:
| Phase | Status | Evidence | Next |
|-------|--------|----------|------|
| Intake and source read | complete | issue #406 read in full, no comments | implementation |
| Implementation | complete | 4 source files changed, 1 added, 4 tests added | verification |
| Verification | complete | see Verification evidence | closeout |
| Commit / PR / GitHub sync | complete | commit `4f6761c7`, PR https://github.com/udecode/kitcn/pull/420 | closeout |
| Closeout | complete | autoreview clean, all gates closed | final response |

Findings:
- F1 Anchor: raw `ctx.db` is a fresh object literal per UDF invocation
  (`convex/dist/cjs/server/impl/registration_impl.js:48-49` builds
  `db: setupWriter()` inside `invokeMutation`; `database_impl.js:122-147`
  returns a fresh literal). convex-test routes `t.run` through the same
  `invokeMutation`. So `db` identity is per-invocation, a subset of
  per-transaction: the failure mode is extra reads, never stale reads.
- F2 Anchor formula: `getOrmLifecycleInnerDb(db) ?? db` converges on the same
  raw writer across the main scope, `skipRules`, `withoutTriggers`
  (`database.ts:319-328`) and the scheduled workers, and still yields a key for
  readers and for no-trigger schemas where the wrapper does not exist.
- F3 Trap confirmed: `prependWriteBarrier` (`lifecycle.ts:754`) is built inside
  `createOrmDbLifecycle`, called from `createOrm` at module scope
  (`create-orm.ts:301`). A closure flag there has isolate lifetime and would
  permanently disable the CLEARING barrier. `ctx.db` at that site is a fresh
  wrapper per hook invocation (`lifecycle.ts:132-140`), so only
  `getOrmLifecycleInnerDb(ctx.db)` is a stable key.
- F4 Consumer 1: `insert.ts:225` calls `enforceForeignKeys` per row with
  `changedFields = every key`, so the `changedFields` short-circuit
  (`mutation-utils.ts:1336`) never fires. Unlike update(), each row can carry a
  different foreign id (`applyDefaults` re-runs `defaultFn()` per row), so a
  boolean latch would skip genuinely new values. The memo must be value-keyed.
  Only the positive outcome is reachable past the probe, so it can never serve
  a stale negative.
- F5 Consumer 2: the probe is one fully-bound `by_table_status` range scan on
  `(tableKey, status)`, so `(anchor, tableName)` is the exact key; the
  index-name filter stays in memory per call. Every `COUNT_STATUS_CLEARING`
  write lives in `aggregate-index/backfill.ts` mutations invoked with a raw ctx.
- F6 Consumer 3: `relationDefinition.where` issues zero reads. The 1050-reads
  shape is `matchesPostFetchMembership` (`query.ts:6468`) running once per
  scanned row of a residual `filterWith` stream, each call passing `[row]` to
  `_applyRelationsFilterToRows` and bottoming out at `_getById`
  (`query.ts:7280`). A reader ctx never has an inner writer, so the
  per-transaction primitive is unreachable there by construction.
- F7 Placement: `import-graph.test.ts:92-107` forbids `orm/index.ts` from
  reaching `orm/aggregate-index/runtime.ts`. The primitive must therefore be a
  dependency-free module, exactly like `write-fanout.ts:1-8`, which already
  re-declares its own `Symbol.for` to avoid closing a cycle through
  `aggregate-index/runtime`.

Decisions and tradeoffs:
- D1 Primitive: new dependency-free `orm/transaction-cache.ts` owning a
  module-level `WeakMap<object, Map<string, TValue>>` plus a typed
  `createOrmTransactionMemo<T>()` accessor. It re-declares
  `Symbol.for('kitcn:OrmLifecycleInnerDB')` locally rather than importing
  `lifecycle`, following the `write-fanout.ts` precedent. It does not mutate the
  db object, honouring `database.ts:228`.
- D2 Consumer 1 gets per-STATEMENT lifetime, not per-transaction. Per-transaction
  would let `insert -> delete parent -> insert` write a dangling foreign key.
  Per-statement fully covers the issue's own measurement ("8 reads for 8 rows
  sharing one FK"), which is a single statement.
- D3 Consumer 1 is restricted to the single-column `_id` branch and guarded by
  `hasLifecycleHooks(this.db, tableName)`, mirroring update.ts:696-707. The
  indexed branch is excluded because a patch to the foreign table's indexed
  columns can invalidate a hit without any delete.
- D4 Consumer 3 gets per-EXECUTION lifetime via a `_getById` memo on the query
  instance. `_forExecution` (`query.ts:5390`) hands each execution its own
  instance, so this is the "once per page" lifetime the issue asks for, and it
  sits beside `_rlsPolicyResolution`, which documents the same scope rule.
- D5 Consumer 2 memoizes only the CLEAN (empty range) outcome. The blocking
  outcome throws and therefore never loops, and not caching it keeps
  `convex/orm/count.test.ts:2282-2327` honest, where a direct `aggregate_state`
  mutation happens between two ORM writes inside one `t.run`.
- D6 Accepted residual: a mutation that calls `ctx.runMutation(aggregateBackfill)`
  mid-transaction and then keeps writing to the same table can observe a stale
  clean memo. The nested mutation gets its own ctx.db, so no invalidation hook
  reaches the outer memo. The barrier is already best-effort; documented in the
  code rather than papered over.

Implementation notes:
- New `orm/transaction-cache.ts`: dependency-free module owning
  `createOrmTransactionMemo<T>()`, a `WeakMap` keyed on
  `getOrmLifecycleInnerDb(db) ?? db`.
- `orm/aggregate-index/runtime.ts`: `assertAggregateIndexesWritable` memoizes
  the empty CLEARING range per (transaction, table); `setCountState` bumps an
  isolate-level generation counter that retires every cached clean answer. The
  counter only ever invalidates, so it cannot re-introduce the closure trap,
  and it closes the `ctx.runMutation(aggregateBackfill)` hole that no
  transaction-scoped invalidation could reach.
- `orm/mutation-utils.ts`: `enforceForeignKeys` takes an optional `probed` set
  and skips the `_id` existence probe for an id already proven present.
- `orm/insert.ts`: creates one probe memo per `execute()`, disabled when
  `hasLifecycleHooks(this.db, tableName)`; passed to both the main and the
  `onConflict` foreign-key checks.
- `orm/query.ts`: `_getById` memoizes the in-flight read per normalized id on
  the execution-scoped instance, evicting on rejection.

Review fixes:
- Autoreview (claude engine) returned no accepted/actionable findings but noted
  a sub-P0 TOCTOU: `assertAggregateIndexesWritable` sampled
  `aggregateStateGeneration` after awaiting the range read, so a
  `setCountState` landing mid-read would have stamped a pre-CLEARING answer as
  current. Taken anyway because the docblock already claimed the memo stores
  "the generation that read was valid at" and the code did not. Fixed by
  sampling the generation before the read.
- Codex engine could not run here (`codex engine failed (1)` on
  `gpt-5.6-sol`, a known local gateway failure). Fell back to the skill's
  supported `--engine claude`.

Error attempts:
| Error / failed attempt | Count | Next different move | Resolution |
|------------------------|-------|---------------------|------------|
| First trigger regression test never fired its hook | 1 | Read `lifecycle.test.ts`: `createOrm` takes triggers off the schema (`getSchemaTriggers`), not a `triggers` config key | Switched to `defineSchema({...}).triggers({...})`; hook fires and the FK violation is raised |
| `vitest packages/kitcn/src/orm convex/orm` reported 6 failures and 4 import errors | 1 | Noticed 1044s vs 4s wall clock and 46/50 files loaded, i.e. the concurrent autoreview subprocess starving the runner, not the 2-line diff | Reran on an idle machine: 48 passed, 2 skipped, 588 tests passed in 4.4s |

Verification evidence:
All commands run from `/Users/mikey/conductor/workspaces/kitcn/bangkok`, the
workspace that owns `packages/kitcn`.
- `bunx vitest run packages/kitcn/src/orm convex/orm --project integration`
  -> 48 files passed, 2 skipped; 588 tests passed, 13 skipped.
- `bunx vitest run` -> 82 files passed, 2 skipped; 864 tests passed. No type
  errors.
- `bun test` -> 1312 pass, 0 fail across 148 files (includes
  `orm/import-graph.test.ts`, which enforces that `orm/index.ts` still cannot
  reach `orm/aggregate-index/runtime.ts`, and the new
  `orm/transaction-cache.test.ts`).
- `bun typecheck` -> 5/5 turbo tasks successful.
- `bun --cwd packages/kitcn build` -> build complete, 71 files.
- `bun lint:fix` -> `Checked 945 files. No fixes applied.`
- Before/after proof: each read-count test was re-run with only its source file
  stashed (`git stash push <file>`), reproducing the amplification, then
  restored.

High-risk note (runtime behaviour change, no public API change):
- Realistic failure mode: a memo serving a fact a later write invalidated -
  a dangling foreign key, a write let through a CLEARING barrier, or a stale
  relation target.
- Proof plan: every memo has a paired negative test that asserts the
  invalidating write is still observed (deleted parent between statements,
  trigger deleting the parent mid-statement, `setCountState` flipping CLEARING
  mid-transaction, a target patched between two reads).
- Why this boundary: the per-transaction primitive is the only scope a
  module-scope hook closure can reach, and each other consumer got the
  narrowest scope its own invalidation surface allows.

Source-listed case matrix:
| Case | Source claim | Harness | Before | Expected after | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| C0 primitive | per-transaction lifetime absent | `orm/transaction-cache.test.ts` | no lifetime | one entry per transaction, resolved through wrappers and carriers | 8/8 pass (`bun test`) | done |
| C1 insert FK | 8 rows, 1 shared FK = 8 `db.get` | `orm/insert.read-amplification.vitest.ts` | 8 | 1 | before `expected 8 to be 1`; after 1 | done |
| C1b distinct FKs | not in source; latch would be unsound | same file | 4 | 2 | before `expected 4 to be 2`; after 2 | done |
| C2 CLEARING | 12 rows = 12 `by_table_status` probes | `orm/aggregate-index/write-barrier.read-amplification.vitest.ts` | 12 | 1 | before `expected 12 to be 1`; after 1 | done |
| C3 relation target | 1050 `db.get` for 2 distinct targets | `orm/query.relation-where-reads.vitest.ts` | 50 (rows scanned) | 2 (distinct targets) | before `expected 50 to be <= 2` and `expected 19 to be <= 2`; after <= 2 | done |

Final handoff contract:
- Commit line: `4f6761c7 fix(orm): stop re-reading per row in FK, CLEARING, and relation probes`
- PR line: https://github.com/udecode/kitcn/pull/420 (base `main`, head
  `fix/orm-per-transaction-memo-lifetime`)
- Issue line: #406 closed by the PR's `Fixes #406` line.
- Confidence line: 95-100%
- Flow table:
  - Reproduced: tests yes (each read-count bound fails with only its source
    file stashed), browser N/A
  - Verified: tests yes (vitest, bun test, typecheck, build, lint), browser N/A
- Browser check: N/A - ORM runtime change, no rendered output
- Outcome: per-transaction memo lifetime added; three per-row read
  amplifications removed at the correct scope for each.
- Caveat: the issue's premise that all three consumers want per-transaction
  lifetime is wrong for two of them; both were given the narrower sound scope.
- Design:
  - Chosen boundary: one dependency-free per-transaction primitive for the
    consumer that cannot reach any narrower scope, plus per-statement and
    per-execution memos for the two that can.
  - Why not quick patch: a closure flag in the write barrier has isolate
    lifetime and would permanently disable the barrier.
  - Why not broader change: routing all three through the per-transaction memo
    would let `insert -> delete -> insert` write a dangling foreign key, and
    would not work at all in a query context, where no inner writer exists.
- Verified: see Verification evidence.
- PR body verified: `gh pr view 420 --json body` - PR #270 emoji format with
  auto-release block, `🐛 Fixes #406`, `🧭 Task plan: ...`, confidence line,
  `| Phase | 🧪 Tests | 🌐 Browser |` table, and the four bold emoji sections.

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
- Commit: `4f6761c7` on `fix/orm-per-transaction-memo-lifetime`.
- PR: https://github.com/udecode/kitcn/pull/420
- Issue: #406, closed by the PR.
- Browser proof: N/A - no browser surface.
- Caveats: consumers 1 and 3 deliberately do not use the per-transaction
  primitive; see Decisions D2/D4.

Timeline:
- 2026-08-21T19:21:21.985Z Task goal plan created.

Reboot status:
| Question | Answer |
|----------|--------|
| Where am I? | Closeout complete |
| Where am I going? | Implementation, verification, commit/PR/GitHub sync, closeout |
| What is the goal? | Add a per-transaction memo lifetime and remove the three per-row read amplifications |
| What have I learned? | See Findings |
| What have I done? | See Timeline |

Open risks:
- A raw `ctx.db` write that sets `aggregate_state.status = 'CLEARING'` without
  going through `setCountState` would not retire a cached clean probe. Nothing
  in kitcn writes that table any other way.
- The `_getById` memo retains documents already read for the rest of one query
  execution. Retention is bounded by Convex's per-transaction read limits and by
  documents the query read anyway.

Hard closeout guard:
- A local-only final response for verified code-changing work is invalid unless
  this plan records an explicit user decline, no local patch, analytical/
  blocked/inconclusive outcome, or a real commit/PR blocker.
