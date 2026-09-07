# 446 relation where non-id target read amplification

Objective:
Stop a relation `where` from re-resolving a non-`_id` relation target once per
drain. Extend #420's execution-scoped memo to the `.first()` branch.

Current closeout:
- Task #448 resumed under docs/plans/2026-09-07-pr-448-autoclosure.md.
- The earlier failing full-check lane was not a merge waiver. Delivery requires
  a fresh green `bun check`, exact-head P1 replay and verified GitHub receipts.
- Merged #453's fixture refresh from main; no fixture was edited by hand here.
- Fresh `NO_PROXY=localhost,127.0.0.1 bun check` passed on the integrated
  branch: 1400 Bun tests, 990 Vitest tests (14 skipped), 124 CLI tests,
  Concave smoke, 8/8 fixtures, CLI verification and all runtime scenarios.
  Log: /tmp/kitcn-pr448-check.log. This supersedes the initial failed gate.
- Focused relation-read and isolation suites passed 12/12; package build
  passed. Implementation and local proof are complete; the closeout plan
  owns final push/review/feedback/merge receipts.
- User authorized admin merge after proof and excluded Version Packages;
  Auto release must be unchecked before this PR merges.

Goal plan:
docs/plans/446-relation-where-non-id-target-read-amplification.md

Template:
docs/plans/templates/task.md

Primary template:
docs/plans/templates/task.md

Applied packs:
- none

Task source:
- type: GitHub issue
- id / link: #446 — https://github.com/udecode/kitcn/issues/446
- title: ORM: relation `where` re-resolves a non-`_id` relation target once per drain
- acceptance criteria: a relation `where` whose `one` relation joins on a column
  other than `_id` reads each distinct target once per execution, not once per
  32-row drain. Extend
  `packages/kitcn/src/orm/query.relation-where-reads.vitest.ts` rather than
  starting a new file.
- caveats: reporter's own note says "Small." The staleness argument from #420 was
  claimed to apply verbatim; that had to be verified, not assumed.
- likely files/packages: `packages/kitcn/src/orm/query.ts`, `packages/kitcn`
- browser surface: none
- root-cause layer: ORM relation loading (`_loadOneRelation` non-`useGetById`
  branch)

Timed checkpoint:
- requested duration: N/A — no duration requested
- semantics: N/A
- initial confidence score: N/A
- improvement loop: N/A
- final score / loop closure: N/A

Completion threshold:
- A new focused vitest in
  `packages/kitcn/src/orm/query.relation-where-reads.vitest.ts` fails on the
  pre-fix tree (measured: 50 target-table `db.query` calls over a 50-row scan
  with 2 distinct targets) and passes after the fix at <= 2, with results
  unchanged and cross-execution staleness still observed.
- Task closure is legal only when the source-of-truth acceptance criteria are
  satisfied or explicitly narrowed, required verification evidence is recorded,
  code-review and release-artifact gates are closed when applicable, verified
  code changes are committed and PR'd unless explicitly declined or blocked,
  task-style PR body sync is complete or marked N/A with reason,
  GitHub issue/PR sync is complete or marked N/A with reason, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/446-relation-where-non-id-target-read-amplification.md` passes.

Verification surface:
- `bunx vitest run packages/kitcn/src/orm/query.relation-where-reads.vitest.ts`
- `bunx vitest run packages/kitcn/src/orm` (19 files)
- `bun typecheck`, `bun --cwd packages/kitcn build`, `bun run test`,
  `bun lint:fix`
- `bun check` lanes: lint, typecheck, test, test:cli, test:concave, test:verify,
  test:runtime
- autoreview `--mode local --engine claude`

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
- The user's standing preference declined the PR path for the initial run. The
  user then explicitly requested a PR, which reverses that decline. PR #448 is
  this plan's one and only PR.

Boundaries:
- Source of truth: GitHub issue #446.
- Allowed edit scope: `packages/kitcn/src/orm/query.ts`,
  `packages/kitcn/src/orm/query.relation-where-reads.vitest.ts`, `.changeset/`,
  `docs/plans/`.
- Browser surface: N/A — no UI or rendered output.
- GitHub issue sync: PR #448 body carries `🐛 Fixes #446`, which closes and
  cross-links the issue on merge. No separate issue comment was authorized.
- Non-goals: batching the residual membership predicate, changing the fan-out
  cap, syncing the unrelated Expo fixture drift, and rekeying the relation
  loaders' own per-batch `JSON.stringify(values)` maps (a separate pre-existing
  aliasing bug that needs its own change).
- Scope widened once, deliberately: the `_ownedCopy` fix also lands on the `_id`
  memo from #420. Splitting it would have left twin helpers with different
  isolation semantics, which is the exact asymmetry this change set out to
  remove.

Output budget strategy:
- Read `query.ts` in bounded windows around grep hits rather than whole-file.
- Broad review delegated to one Workflow run whose subagents return structured
  findings only; raw agent transcripts were never streamed into this context.
- `bun check` output tailed to the last 35 lines; `test:runtime` redirected to
  `/tmp/runtime.log` and tailed.

Blocked condition:
- Would be blocked if the reported amplification could not be reproduced, or if
  the execution-scope guarantee for the new memo turned out to be weaker than
  `_documentByNormalizedId`'s. Neither occurred.

Task state:
- task_type: bug
- task_complexity: non-trivial
- current_phase: closeout
- current_phase_status: complete
- next_phase: exact-head feedback closeout and merge
- goal_status: complete

Current verdict:
- verdict: valid
- confidence: 95-100%
- next owner: autoclosure for PR #448
- reason: reproduced at the exact reported boundary, fixed at the owning
  boundary, proven by a test that fails pre-fix and passes post-fix, with the
  full repo gate passed after integrating the fixture owner fix; final
  external closeout is explicitly tracked separately.

Implementation readiness:
- verdict: ready
- exact owner: `GelRelationalQuery` single-target resolution —
  `_getById` covers the `_id` join, and nothing covered the non-`_id` join.
- contradiction status: none. Source, tests and runtime agreed.
- source-listed cases complete: yes

Pre-solution issue challenge:
- reporter claim: `_loadOneRelation`'s `else` branch at `query.ts:8429-8435`
  issues `_queryByFields(...).first()` with no cross-drain memo, so the 32-row
  chunk drain re-reads the same target once per batch. `r.one.x({ to: x.id })`
  is covered by #420; `r.one.x({ to: x.someOtherColumn })` is not.
- suggested diagnosis or fix: give the non-id branch an execution-scoped memo
  keyed on `(targetTable, targetFields, values)`.
- repro ladder:
  - tests / source-level repro: DONE. Added a `teamBySlug` relation joined on an
    indexed `slug` column to the existing suite. Pre-fix:
    `counts.queryByTable.rw_teams` = **50** for the non-matching case over a
    50-row scan with 2 distinct targets, and **19** for the matching case.
    `counts.get` = 0, so the measurement isolates the non-`_id` branch exactly.
  - repo-owned automated browser or integration proof: N/A — ORM read-count
    behavior has no browser or integration surface.
  - Browser plugin: N/A — no browser-rendered output.
  - screenshot / visual proof: N/A — no visual output.
- reproduction verdict: reproduced
- validity verdict: valid
- best long-term fix boundary: the reporter's suggested boundary was right but
  named only one of three call sites. The durable owner is a private
  `_firstByFields(tableName, fields, values, indexName)` sibling of `_getById`,
  so that "resolve ONE target document" has exactly two implementations — by id
  and by eq-pinned key — and both are execution-memoized. All three
  single-target `.first()` sites were routed through it.
- harsh honest feedback: the issue's read of the drain site was slightly off —
  `:9221` is `_loadManyRelation`'s stream, whereas the shape in the issue's own
  existing tests goes through `matchesPostFetchMembership` ->
  `_applyRelationsFilterToRows([row], ...)`, a batch of one. The amplification
  and the fix are the same either way, so the conclusion held. The issue also
  scoped the fix to one call site; two more had the identical shape.
- hard-stop decision: none — proceeded after reproduction.

Completion rule:
- Do not call `update_goal(status: complete)` while any required checklist item
  remains unchecked. If an item does not apply, check it and add `N/A: <reason>`.
- Do not call `update_goal(status: complete)` until every completion threshold
  above is satisfied, final handoff evidence is recorded, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/446-relation-where-non-id-target-read-amplification.md` passes.
- Do not create hook state for this goal. This file plus the active goal are the
  durable state.

Start Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| Timed checkpoint parsed | no | N/A: no duration requested |
| Walkthrough baseline for possible UI change | no | N/A: ORM read-count change; no UI or rendered output can change |
| Skill analysis before edits | yes | `task` loaded; `autogoal` loaded for measurable work; `changeset` rule read; `autoreview` loaded for closeout. `testing`/`tdd` not loaded — the issue named the exact existing test file to extend, so the test slice was already scoped |
| Active goal checked or created | yes | This plan, created by `create-goal-scratchpad.mjs --template task` |
| Source of truth read before edits | yes | `gh issue view 446` read in full before any file was opened; issue has 0 comments |
| Exact per-PR task ownership | yes | This plan owns exactly one PR: #448 — https://github.com/udecode/kitcn/pull/448 |
| GitHub comments and attachments read | yes | `gh issue view 446 --json comments` returned `[]` |
| Video transcript evidence required | no | N/A: no video or screen recording in the source |
| Pre-solution issue challenge required | yes | Recorded above; verdict `valid` |
| Reproduction verdict before implementation | yes | Reproduced at 50 target reads before any source edit |
| Repro escalation ladder selected | yes | Stopped at the lowest honest rung: source-level vitest |
| Suggested fix reviewed against durable boundary | yes | Suggested fix accepted in mechanism, widened from 1 to 3 call sites |
| `docs/solutions` checked for non-trivial existing-code work | no | N/A: no `docs/solutions` directory in this repo |
| TDD decision before behavior change or bug fix | yes | Red-first: failing test written and run (50 / 19) before the fix |
| Branch decision for code-changing task | yes | Already on `issue-446-task`, a dedicated non-`main` branch |
| Release artifact decision | yes | No unreleased changeset existed; created `.changeset/rotten-donkeys-shave.md` as `patch` |
| Browser tool decision for browser surface | no | N/A: no browser surface |
| Commit / PR expectation decision | yes | Commit, push, and PR all done. Initial run honored the standing "no PR" preference; the user then explicitly requested the PR |
| Task-style PR body decision | yes | PR #448 uses the PR #270 emoji task-style body, verified with `gh pr view --json body` |
| Task-plan PR body evidence | yes | Body line `🧭 Task plan: docs/plans/446-relation-where-non-id-target-read-amplification.md`; the plan exists at the PR head and names PR #448 |
| GitHub issue sync expectation decision | yes | `🐛 Fixes #446` in the PR body is the sync-back; no separate issue comment was authorized |
| Output budget strategy recorded | yes | Recorded above |

Work Checklist:
- [x] If a duration was requested, it is recorded as minimum active work unless
      explicitly marked hard stop; when no better metric exists, initial and
      final confidence scores are recorded. N/A: no duration requested.
- [x] Objective includes outcome, completion threshold, verification surface,
      constraints, boundaries, and blocked condition.
- [x] Task source classified with source type, id/link, title, task type,
      acceptance criteria, caveats, likely files/routes/packages, browser
      surface, and root-cause layer.
- [x] Every GitHub PR in scope has its own task plan. This plan owns exactly
      one PR, #448; no batch plan was used as a substitute.
- [x] Required video or screen-recording evidence is cached/read as normalized
      `<video-transcripts>` XML. N/A: no video in the source.
- [x] For public GitHub bug reports, behavior claims, technical diagnoses, or
      suggested fixes, reporter claims are challenged before implementation
      with a recorded verdict. Verdict: `valid`.
- [x] Repro escalation ladder followed for bug/behavior claims.
- [x] Hard-stop rule followed for bug/behavior claims: reproduced, so no hard
      stop; the suggested fix was widened at the same boundary.
- [x] Nearby repo instructions and implementation patterns read before edits:
      `CLAUDE.md`, `.agents/AGENTS.md`, `.agents/rules/changeset.mdc`, the
      `_documentByNormalizedId` doc comment, and the existing suite's counting
      proxy pattern.
- [x] Source-listed case matrix is complete and every contradiction has an
      owner, harness, and verdict before mutation.
- [x] Readiness is classified: `ready`.
- [x] Implementation fixes the right ownership boundary: a private sibling of
      `_getById`, applied to all three single-target `.first()` sites.
- [x] Release artifact requirement recorded: new changeset
      `.changeset/rotten-donkeys-shave.md` (`patch`).
- [x] Final handoff shape decided: task-style PR body, exact proof and merge
      state; issue #446 closes through the PR body on merge.
- [x] Commit/PR handling recorded: committed, pushed to
      `fix/orm-non-id-relation-target-memo`, and opened as PR #448.
- [x] PR body shape recorded: PR #270 emoji task-style body used on #448.
- [x] PR task evidence recorded: body plan line present, plan at PR head,
      exact PR named.
- [x] Branch handling recorded: dedicated branch `issue-446-task`.
- [x] Local-env-rot retry policy recorded: `bun typecheck` first failed with
      `TS2307: Cannot find module 'kitcn/auth/generated'` in `test-convex`.
      That is stale `dist`, not a code error. `bun --cwd packages/kitcn build`
      then `bun typecheck` -> 5/5 tasks green. No reinstall was needed.
- [x] Workspace authority recorded: every command below was run from
      `/Users/mikey/conductor/workspaces/kitcn/phoenix`, the worktree that owns
      `packages/kitcn`.
- [x] Output budget discipline recorded and followed.
- [x] High-risk note recorded (see below).
- [x] Review/autoreview target selected from actual diff state: `--mode local`,
      matching the dirty working tree at review time.
- [x] Agent-native review decision recorded. N/A: the diff touches no
      `.agents/**`, `.claude/**`, `.codex/**`, skill, hook, command, prompt, or
      user-action tooling.

High-risk note (runtime / package-behavior change):
- Realistic failure mode: the memo serves a stale target document after an
  intervening write, silently changing query results.
- Proof plan: (1) source-trace `_forExecution()` and confirm it does not copy
  the new map, so every `execute()` gets a fresh memo; (2) a test that reads,
  patches the target, then reads again in the same `t.run` and asserts the new
  value is observed — `'a non-\`_id\` target updated between two reads is not
  remembered'`; (3) a test that reads two distinct targets in one execution and
  asserts each row gets its own — `'two non-\`_id\` targets are told apart'`.
  All three closed.
- Why the boundary is right: `_getById` and `_firstByFields` are now the only
  two ways a single target document is resolved, and both carry the identical
  execution-scoped guarantee. Leaving the `else` branch unmemoized kept two
  sibling branches of the same `if` with different cost characteristics for no
  reason a caller could see.

Phase / pass table:
| Phase | Status | Evidence | Next |
|-------|--------|----------|------|
| Intake and source read | complete | `gh issue view 446`, 0 comments; read `query.ts` 8362-8509, 7617-7748, 625-694, 5784-5801, 2355-2390, 9000-9259 | implementation |
| Reproduction | complete | New tests red at 50 and 19 target-table queries | implementation |
| Implementation | complete | `_firstDocumentByFieldKey` + `_firstByFields`; 3 call sites rerouted | verification |
| Verification | complete | See Verification evidence | closeout |
| Commit / PR / GitHub sync | complete | Committed; branch renamed to `fix/orm-non-id-relation-target-memo` and pushed; PR #448 opened with the task-style body | closeout |
| Closeout | complete | Local full check passed; final external delivery receipts belong to the closeout plan | verified delivery |

Findings:
- The issue's `:9221` pointer names `_loadManyRelation`'s stream drain. The
  shape its own existing tests exercise reaches the same amplification through
  `matchesPostFetchMembership` (`query.ts:6970`), which calls
  `_applyRelationsFilterToRows([row], ...)` — a batch of one, so every
  per-batch dedup map inside the relation loaders is a no-op. Same defect,
  slightly different entry point. The fix covers both.
- Two more call sites had the identical single-target `.first()` shape and the
  same missing memo: `fetchThroughTargets` inside `_loadManyRelation` and
  `resolveTargetMatch` in the relation `_count` through path.
- `convex/orm/relation-loading.test.ts:1856` already defines a `through`
  relation joined on a non-`_id` column (`slug`), so call site 2 has existing
  coverage; it stayed green.
- CORRECTED after PR review. The first version of the memo keyed on
  `JSON.stringify(values)`, defended on the grounds that the same call already
  happens upstream at `query.ts:8201`, `:8439`, `:8746`, `:9192`. That defense
  was wrong. Those upstream maps are per-batch, and in the residual relation
  `where` the batch is ONE row, so a map of one never compares two join values
  and cannot alias. The execution-wide memo spans every row, which made it the
  sole discriminator — and `JSON.stringify` renders every `ArrayBuffer` as `{}`
  and `NaN`/`Infinity`/`-Infinity` as `null`, and throws on `int64`. So the
  memo introduced a new collision class in exactly the path this change
  targets. Measured: `where: { teamByToken: { name: 'Alpha' } }` returned all
  50 members instead of Alpha's 25.

Decisions and tradeoffs:
- Memo, not batching. #420 already established the execution-scoped memo as the
  owner for this defect class. Batching the residual membership predicate would
  be a much larger change to the streaming contract and was not needed.
- Widened from the issue's 1 call site to all 3. Leaving two behind would have
  recreated the same asymmetry the issue is about.
- `indexName` is in the memo key even though the three call sites resolve it
  deterministically per relation. It is what decides which row `.first()`
  returns, so keying on it makes the memo correct by construction rather than
  by an invariant a future edit could break.
- The memo key encodes join values with `convexToJson` — the same wire
  encoding `packages/kitcn/src/internal/query-key.ts:41` already uses for query
  keys — so every Convex value round-trips distinctly. Key construction is
  wrapped in try/catch: a value `convexToJson` rejects is not a Convex value,
  and the read then runs unmemoized rather than sharing an entry. Fail-safe by
  construction — the worst case is a missed dedup, never a wrong answer.
- Did not sync the unrelated Expo fixture drift. It is upstream churn, not this
  task's scope, and committing it would put an unrelated dependency bump in a
  bug-fix diff.

Implementation notes:
- `packages/kitcn/src/orm/query.ts`
  - Added `_firstDocumentByFieldKey: Map<string, Promise<any | null>>` beside
    `_documentByNormalizedId`, with a doc comment stating the same execution
    scope and staleness argument.
  - Added `_firstByFields(tableName, fields, values, indexName)`: the pending
    promise is stored before it settles so concurrent loaders share one
    in-flight read; the entry is evicted on rejection so a failure is never
    cached — identical shape to `_getById`.
  - Added `_firstByFieldsMemoKey(...)`, which builds
    `JSON.stringify([tableName, indexName, fields, values.map(convexToJson)])`
    and returns `null` when encoding throws. `_firstByFields` treats `null` as
    "read, do not memoize".
  - Rerouted `_loadOneRelation`'s non-`useGetById` branch,
    `fetchThroughTargets`, and `resolveTargetMatch`.
- `packages/kitcn/src/orm/query.relation-where-reads.vitest.ts`
  - `rw_teams` gained `slug` + `rw_teams_by_slug`; `rw_members` gained
    `teamSlug`; new `teamBySlug` relation joined on `slug`.
  - The counting proxy now also splits `query` calls by table
    (`queryByTable`), so a target read is separable from the parent scan.
  - `rw_teams` also gained `token: bytes()` and `score: integer()` with
    indexes, `rw_members` the matching `teamToken`/`teamScore`, and two more
    relations joined on them.
  - Six new tests: read count, result correctness, cross-execution staleness,
    target distinctness, and two memo-key aliasing cases — a `bytes()` join
    value and NaN-vs-Infinity.
- `packages/kitcn/src/orm/query.ts` (second review round)
  - Added `_ownedCopy`, applied to every consumer of both
    `_documentByNormalizedId` and `_firstDocumentByFieldKey`, including the
    entry's creator. Relation loading writes nested `with` results and `extras`
    onto the target it is handed and `hydrateDateFieldsForRead` copies every own
    key, so a shared entry leaked fields between relations. The writes are all
    top-level, so a shallow copy is exactly enough isolation.
- `packages/kitcn/src/orm/query.relation-target-memo.vitest.ts` (new)
  - Three tests over aliased duplicate relation pairs that resolve the same
    target through the same memo key, one pair per memo. Each asserts the shared
    read happened (1 read for 2 relations) before asserting isolation, so the
    isolation claim cannot pass vacuously.

Review fixes:
- Pre-PR: adversarial workflow and autoreview both came back with nothing to
  fix. The workflow's memo-key lens did raise the NaN/Infinity collision, but
  its refuters killed it as "pre-existing", and autoreview rated it below its
  P0 threshold. Both were wrong, for the reason recorded under Findings.
- On PR #448, `@chatgpt-codex-connector` filed a P2 on `query.ts:7791-7793`:
  "Encode Convex values losslessly in memo keys". Accepted and fixed — the
  claim was reproducible and produced wrong rows, not just extra reads. Two
  regression tests added; discussion r3942627813 replied to.
- Post-fix autoreview on the full branch: clean, 0.88.
- Second review round on #448 filed two more findings, both accepted:
  - P1 on `.changeset/rotten-donkeys-shave.md`: the bullet carried
    algorithm/proof narration (the 50-row measurement, the cross-await
    staleness sentence) against `.agents/rules/changeset.mdc`. Condensed to two
    user-facing outcomes.
  - P2 on `query.ts:7831-7833`: a memo entry is one object shared by every read
    of that key, and relation loading mutates the target it is handed, so one
    relation could publish fields another relation requested. Reproduced
    deterministically, fixed with `_ownedCopy` on both memo twins.
- Third autoreview on the full branch after both fixes: clean, 0.82.

Error attempts:
| Error / failed attempt | Count | Next different move | Resolution |
|------------------------|-------|---------------------|------------|
| `bun typecheck` -> `TS2307: Cannot find module 'kitcn/auth/generated'` in `test-convex` | 1 | Build the package instead of reinstalling — this is stale `dist`, not code | `bun --cwd packages/kitcn build` then `bun typecheck` -> 5/5 green |
| `bun check` -> `fixtures:check` fixture drift in `expo` | 1 | Prove provenance before touching it | `expo@55.0.31` published 2026-08-31, five days after base commit `14bab503` (2026-08-26); fixture pins `~55.0.30`. Pre-existing on `origin/main`, unrelated to this diff. Not fixed here. |

Verification evidence:
The following initial-run commands were run from
`/Users/mikey/conductor/workspaces/kitcn/phoenix`; they are historical evidence,
not a waiver for the final check. Fresh closeout runs use
`/Users/zbeyens/git/better-convex` and the linked closeout plan.
- `bunx vitest run packages/kitcn/src/orm/query.relation-where-reads.vitest.ts`
  - pre-fix: 2 failed / 5 passed — `expected 50 to be less than or equal to 2`
    and `expected 19 to be less than or equal to 2`
  - post-fix: **9 passed** (includes the two memo-key aliasing regressions,
    each of which failed at "expected 50 to have a length of 25" before the
    lossless-key fix)
- `bunx vitest run packages/kitcn/src/orm/query.relation-target-memo.vitest.ts`
  — **3 passed**; with `_ownedCopy` reduced to an identity function, 2 of the 3
  fail, which is the red-first proof. The third (sibling relations under one
  `Promise.all`) passes either way because sibling order is a race; it is
  labelled in-file as a shape lock, not the regression proof.
- `bunx vitest run packages/kitcn/src/orm` — **20 files, 162 tests passed**
- `bun --cwd packages/kitcn build` — 72 files, complete
- `bun typecheck` — 5/5 tasks green
- `bun run test` — **1400 bun tests passed (150 files)** + **990 vitest passed,
  14 skipped (93 files)**
- `bun lint:fix` — 960 files checked, no fixes applied
- `bun check` — `lint`, `typecheck`, `test`, `test:cli`, `test:concave` all
  green; `fixtures:check` **fails on pre-existing upstream Expo drift**
  (see Error attempts); `test:verify` exit 0; `test:runtime` exit 0
- Adversarial review Workflow — 5 lenses (staleness, memo key, call sites,
  resource use, tests) x 3 refuters per finding, 29 agents: **0 findings
  survived**; every raised finding was killed as pre-existing/accepted for
  `_documentByNormalizedId` or as unreachable
- `.agents/skills/autoreview/scripts/autoreview --mode local --engine claude` —
  clean, 0.88 (pre-PR)
- `.agents/skills/autoreview/scripts/autoreview --mode branch --base origin/main
  --engine claude` — clean, 0.88 (after the lossless-key fix), then clean, 0.82
  (after the `_ownedCopy` isolation fix)

Source-listed case matrix:
| Case | Source claim | Harness | Before | Expected after | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Non-`_id` `one` relation in a relation `where`, non-matching | re-resolves the target once per drain | `'a non-matching relation \`where\` on a non-\`_id\` join reads each target once'` | 50 `db.query('rw_teams')` over a 50-row scan | <= 2 | vitest, `counts.queryByTable.rw_teams` | passed |
| Same, matching | results must not change | `'a matching relation \`where\` on a non-\`_id\` join still returns the right rows'` | 19 queries, 10 correct rows | <= 2 queries, same 10 rows | vitest | passed |
| `r.one.x({ to: x.id })` still covered by #420 | already fixed, must not regress | 3 pre-existing tests in the same file | `counts.get <= 2` | unchanged | vitest | passed |
| Staleness across executions | #420's argument must apply verbatim | `'a non-\`_id\` target updated between two reads is not remembered'` | N/A (new) | intervening write observed | vitest | passed |
| Two distinct non-`_id` targets in one execution | memo must not alias them | `'two non-\`_id\` targets are told apart'` | N/A (new) | each row gets its own target | vitest | passed |
| `through` relation target, non-`_id` | same shape, not named in the issue | `convex/orm/relation-loading.test.ts:1856` (pre-existing) | N/A | unchanged | `bun run test` | passed |
| `_count` through target, non-`_id` | same shape, not named in the issue | `returning-count.read-amplification.vitest.ts` (pre-existing) | N/A | unchanged | `bunx vitest run packages/kitcn/src/orm` | passed |
| `bytes()` join value | PR #448 review: `JSON.stringify` renders every ArrayBuffer as `{}` | `'a bytes join value is not confused with a different bytes join value'` | 50 rows returned (both teams) | 25 rows, Alpha only | vitest | passed |
| NaN vs Infinity join value | PR #448 review: both render as `null` | `'NaN and Infinity join values are not confused with each other'` | 50 rows returned (both teams) | 25 rows, Alpha only | vitest | passed |
| Shared memo entry, non-`_id` | PR #448 review: cached object is mutated by relation loading | `'...does not leak onto a `with` sharing its `_firstByFields` entry'` | `teamBySlugAlt` carried `membersBySlug` | only requested fields | vitest | passed |
| Shared memo entry, `_id` (pre-existing from #420) | same class on the untouched `_getById` path | `'...does not leak onto a `with` sharing its `_getById` entry'` | `teamByIdAlt` carried `membersById` | only requested fields | vitest | passed |

Final handoff contract:
- Commit line: `fix(orm): memoize non-_id relation target reads per execution` on branch `fix/orm-non-id-relation-target-memo`
- PR line: https://github.com/udecode/kitcn/pull/448
- Issue line: closed by `🐛 Fixes #446` in the PR #448 body; no separate
  issue comment was authorized.
- Confidence line: 🟢 95-100% confidence
- Flow table:
  - Reproduced: tests 🔴 (50 and 19 target reads), browser ➖ N/A
  - Verified: tests 🟢 (12/12 focused, 1400 Bun + 990 Vitest, full check), browser ➖ N/A
- Browser check: N/A — no browser-rendered or native output.
- Outcome: a relation `where` on a `one` relation joined on a non-`_id` column
  now reads each distinct target once per execution instead of once per drain.
- Caveat: floating upstream fixtures can drift again; all eight matched in
  the fresh full check. Auto release stays unchecked by user instruction.
- Design:
  - Chosen boundary: `_firstByFields`, a private execution-memoized sibling of
    `_getById`, used by all three single-target `.first()` resolutions.
  - Why not quick patch: memoizing only `_loadOneRelation`'s `else` branch, as
    the issue proposed, would leave two structurally identical call sites with
    the same defect.
  - Why not broader change: batching the one-row-at-a-time residual membership
    predicate would rewrite the streaming contract; #420 already settled the
    memo as this defect class's owner.
- Verified: see Verification evidence.
- PR body verified: `gh pr view 448 --json body` — auto-release block
  preserved, `🐛 Fixes #446`, task plan line, `🟢 95-100% confidence`,
  `| Phase | 🧪 Tests | 🌐 Browser |` with Reproduced/Verified rows, and bold
  emoji Outcome/Caveat/Design/Verified sections. No self-link to #448.

Task-style PR body contract:
- Satisfied on PR #448. The body preserves the `<!-- auto-release:start -->`
  block (a changeset is in the diff), then `🐛 Fixes #446`, `🧭 Task plan:
  docs/plans/446-relation-where-non-id-target-read-amplification.md`,
  `🟢 95-100% confidence`, the `| Phase | 🧪 Tests | 🌐 Browser |` table with
  `Reproduced` / `Verified` rows, and bold emoji `**✅ Outcome**`,
  `**⚠️ Caveat**`, `**🏗️ Design**`, `**🧪 Verified**` sections. It contains no
  self-link to #448.

Final handoff / sync:
- Commit: HEAD of `fix/orm-non-id-relation-target-memo` — `fix(orm): memoize non-_id relation target reads per execution`
- PR: #448 — https://github.com/udecode/kitcn/pull/448
- Issue: #446 closed on merge via `🐛 Fixes #446`
- Browser proof: N/A
- Caveats: floating fixture dependencies; Version Packages is excluded.

Timeline:
- 2026-09-05T06:07:37.683Z Task goal plan created.
- 2026-09-05T06:09Z Reproduced: 50 target-table reads over a 50-row scan.
- 2026-09-05T06:10Z Fix landed; focused suite green (7/7).
- 2026-09-05T06:13Z Full repo test suite green (1400 + 985).
- 2026-09-05T06:33Z Adversarial review workflow: 0 findings survived.
- 2026-09-05T06:38Z autoreview clean.
- 2026-09-05T06:55Z `bun check` lanes recorded; Expo drift proven pre-existing.
- 2026-09-05T09:36Z User requested a PR, reversing the standing decline.
  Branch renamed `issue-446-task` -> `fix/orm-non-id-relation-target-memo`,
  pushed, and opened as PR #448.
- 2026-09-05T10:1xZ PR review P2 accepted: memo key aliased bytes and special
  floats and returned wrong rows. Reproduced, fixed with `convexToJson`, two
  regression tests added, branch autoreview clean.
- 2026-09-05T12:0xZ Second review round: P1 changeset narration condensed; P2
  shared-memo-object leak reproduced on BOTH memos and fixed with `_ownedCopy`.
  The `_id` half is pre-existing from #420 and its regression test fails on
  main. Branch autoreview clean again.

Reboot status:
| Question | Answer |
|----------|--------|
| Where am I? | Implementation and local full check complete; external merge closeout in progress |
| Where am I going? | Exact-head review/feedback replay and merge without release |
| What is the goal? | Stop a relation `where` from re-resolving a non-`_id` relation target once per drain |
| What have I learned? | See Findings |
| What have I done? | See Timeline |

Open risks:
- No known unresolved product defect in this change. #453 repaired the
  initial fixture drift and fresh check passed. Upstream fixtures can move
  again; final exact-head proof and release exclusion remain closeout gates.

Hard closeout guard:
- Satisfied: this is not a local-only handoff. The verified change is committed
  on `fix/orm-non-id-relation-target-memo`, pushed to `origin`, and opened as
  PR #448 with the task-style body and this plan at the PR head.
