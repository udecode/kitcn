# 440a bound aggregate bucket and member reads within safe write scopes

Objective:
Issue #440 stage (a): read each aggregate bucket/member once per key/document within uninterrupted ORM statements, preserving aggregate results across statements and nested mutations.

Authorized scope correction:
- User: "never ask, just go", accepting the requested joint #451/#454 lifetime
  repair. #451 owns read reuse and #454 retains deferred-write ownership.
- The runtime-only and no-lifecycle boundaries in the original report are
  superseded for this repair. A nested UDF has a separate JS context; retaining
  write-back rows across arbitrary callbacks corrupts counts.
- Statement end, lifecycle callbacks and RLS policy callbacks expire cached
  rows. Bulk 1/2/1 bucket bounds remain; later statements reload members.
- Public signatures, eager writes and aggregate query results are unchanged.

Goal plan:
docs/plans/440-memoize-aggregate-bucket-and-member-reads.md

Template:
docs/plans/templates/task.md

Primary template:
docs/plans/templates/task.md

Applied packs:
- none

Task source:
- type: GitHub issue (public bug report with measured numbers + suggested fix)
- id / link: #440 — https://github.com/udecode/kitcn/issues/440
- title: "ORM: bulk statements reconcile aggregate buckets per document — 80 reads
  + 78 patches against one row for 40 rows"
- scope: stage **(a) only**. Stage (b) (collapsing the ~78 patches behind a
  statement boundary) is explicitly split off by the reporter and is out of scope.
- acceptance criteria:
  - reads on `aggregate_bucket` scale with distinct key tuples, not written rows
  - reads on `aggregate_member` scale with distinct docIds, not reconcile calls
  - `runtime.ts`-only; no change to `lifecycle.ts`, no trigger-contract reshape
  - eager patching preserved (read-your-own-writes inside the mutation)
  - aggregate values unchanged
- caveats: patch count is deliberately NOT fixed here (stage b)
- likely files: `packages/kitcn/src/orm/aggregate-index/runtime.ts`,
  new `*.read-amplification.vitest.ts` next to it, `.changeset/`
- browser surface: none
- root-cause layer: ORM aggregate-index runtime (Convex read amplification)

Timed checkpoint:
- requested duration: N/A — no duration was requested.
- semantics: N/A
- initial confidence score: N/A
- improvement loop: N/A
- final score / loop closure: N/A

Completion threshold:
- `packages/kitcn/src/orm/aggregate-index/reconcile.read-amplification.vitest.ts`
  is green with: bulk insert of 12 rows sharing one key tuple = 1 bucket probe
  (was 12); bulk update of 12 rows across two tuples = 2 bucket probes (was 24);
  bulk delete of 12 = 1 bucket probe (was 12); a second statement over the same
  12 documents = 2 bucket probes and 12 member probes;
  aggregate values unchanged.
- `convex/orm/count.test.ts` and the aggregate vitest suites stay green.
- Task closure is legal only when the source-of-truth acceptance criteria are
  satisfied or explicitly narrowed, required verification evidence is recorded,
  code-review and release-artifact gates are closed when applicable, verified
  code changes are committed and PR'd unless explicitly declined or blocked,
  task-style PR body sync is complete or marked N/A with reason,
  GitHub issue/PR sync is complete or marked N/A with reason, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/440-memoize-aggregate-bucket-and-member-reads.md` passes.

Verification surface:
- `npx vitest run packages/kitcn/src/orm/aggregate-index/` (cwd: repo root)
- `npx vitest run convex/orm/count.test.ts` (cwd: repo root)
- `bun typecheck`, `bun lint:fix`, `bun --cwd packages/kitcn build`
- changeset under `.changeset/`
- adversarial design audit workflow over the memo's staleness hazards

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
- Source of truth: GitHub issue #440, stage (a) section.
- Allowed edit scope: `packages/kitcn/src/orm/aggregate-index/runtime.ts`, a new
  sibling `*.read-amplification.vitest.ts`, `.changeset/`, this plan.
- Browser surface: none (Convex ORM runtime).
- GitHub issue sync: this plan owns exactly one PR — https://github.com/udecode/kitcn/pull/451.
- Non-goals: stage (b) patch collapsing; `lifecycle.ts`; the trigger contract;
  `clearCountIndexChunk`'s raw deletes (#424).

Output budget strategy:
- Greps are scoped to `packages/kitcn/src/orm` and `convex/`; test runs are
  filtered to the touched files; audit fan-out returns schema-validated
  findings, not raw file dumps.

Blocked condition:
- A memo staleness hazard survives adversarial verification with no bounded fix
  inside `runtime.ts`, i.e. stage (a) cannot be landed without the stage (b)
  statement boundary.

Task state:
- task_type: bug (performance / read amplification)
- task_complexity: non-trivial
- current_phase: autoclosure verification
- current_phase_status: in_progress
- next_phase: final proof and review
- goal_status: active

Current verdict:
- verdict: valid
- confidence: high — reproduced at the exact ratio the issue reports
- next owner: task
- reason: a 12-row bulk update issues 24 `aggregate_bucket` index probes against
  2 documents; 12 inserts issue 12 probes against 1 document.

Implementation readiness:
- verdict: ready
- exact owner: the two point lookups in
  `packages/kitcn/src/orm/aggregate-index/runtime.ts`, given transaction
  lifetime on the `createOrmTransactionMemo` anchor shipped by #420, through
  write-path-only wrappers so the aggregate query path keeps reading the store.
- contradiction status: none — issue text, source, and repro agree.
- source-listed cases complete: yes (see case matrix)

Pre-solution issue challenge:
- reporter claim: bulk ORM statements reconcile aggregate buckets per document,
  producing 80 reads + 78 patches against one `aggregate_bucket` row for 40 rows,
  because `reconcileAggregateMembership` calls the multi-delta fold with a
  single-element array.
- suggested diagnosis or fix: stage (a) write-through memoize `getBucketByKey` /
  `getMemberByDoc` on the `createOrmTransactionMemo` anchor; stage (b) buffer the
  patches behind a statement boundary.
- repro ladder:
  - tests / source-level repro: NEW
    `packages/kitcn/src/orm/aggregate-index/reconcile.read-amplification.vitest.ts`
    counts `aggregate_bucket by_table_index_hash` and
    `aggregate_member by_kind_table_index_doc` index opens. RED bucket probes
    12 / 24 / 12 / 24, GREEN 1 / 2 / 1 / 1.
  - repo-owned automated browser or integration proof: N/A — no browser surface.
  - Browser plugin: N/A — Convex ORM runtime, no rendered output.
  - screenshot / visual proof: N/A — no visual output.
- reproduction verdict: reproduced
- validity verdict: valid (read half). The *read* claim reproduces exactly; the
  *patch* claim is real too but explicitly deferred by the reporter to stage (b).
- best long-term fix boundary: the two point lookups, not their callers. Both
  write-path callers — the live `change` hook and the backfill chunk — benefit
  without learning about caching, and the query path keeps its unmemoized read
  so an aggregate query can never clobber a write-through entry.
- harsh honest feedback: the issue's framing that the single-element array is the
  "root cause" is only half right for stage (a). Folding the deltas would not
  remove a single read on the live path, because each document is reconciled in
  its own `change` hook invocation; there is nothing to fold within one call.
  The read amplification is fixed by giving the lookups transaction lifetime,
  which is what stage (a) actually asks for. The `[delta]` wrapping matters for
  stage (b) (patch collapsing), not here.
- hard-stop decision: proceed — reproduced and valid.

Completion rule:
- Do not call `update_goal(status: complete)` while any required checklist item
  remains unchecked. If an item does not apply, check it and add `N/A: <reason>`.
- Do not call `update_goal(status: complete)` until every completion threshold
  above is satisfied, final handoff evidence is recorded, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/440-memoize-aggregate-bucket-and-member-reads.md` passes.
- Do not create hook state for this goal. This file plus the active goal are the
  durable state.

Start Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| Timed checkpoint parsed | no | N/A: no duration requested |
| Walkthrough baseline for possible UI change | no | N/A: ORM runtime only, no UI or rendered output can change |
| Skill analysis before edits | yes | `task` + `autogoal` (task template, no packs) + `autoreview`; no niche skill owned this gate |
| Active goal checked or created | yes | This plan created from `create-goal-scratchpad.mjs --template task`, renamed to the issue-number convention |
| Source of truth read before edits | yes | `gh issue view 440` read in full before any file was opened |
| Exact per-PR task ownership | yes | This plan owns exactly one PR: #451 |
| GitHub comments and attachments read | yes | `comments: []` — issue has none |
| Video transcript evidence required | no | N/A: no video or screen recording in the source |
| Pre-solution issue challenge required | yes | Recorded above; verdict `valid` for the read half, `deferred` for the patch half |
| Reproduction verdict before implementation | yes | RED baseline captured before the fix: bucket probes 12 / 24 / 12 / 24 |
| Repro escalation ladder selected | yes | Stopped at the lowest honest rung: source-level vitest repro |
| Suggested fix reviewed against durable boundary | yes | Adopted the two-lookup boundary; rejected the issue's `[delta]` framing and its implied generation stamp |
| `docs/solutions` checked for non-trivial existing-code work | no | N/A: no `docs/solutions` directory in this repo |
| TDD decision before behavior change or bug fix | yes | Failing-first read-amplification suite written and run RED before the runtime change |
| Branch decision for code-changing task | yes | Already on `440-task`, a dedicated non-main branch for this issue |
| Release artifact decision | yes | New changeset required (published package code changed) |
| Browser tool decision for browser surface | no | N/A: no browser surface |
| Commit / PR expectation decision | yes | User explicitly requested the PR, lifting the standing decline; commit + push + PR completed |
| Task-style PR body decision | yes | PR #270 emoji task-style body used |
| Task-plan PR body evidence | yes | Body carries `🧭 Task plan: docs/plans/440-memoize-aggregate-bucket-and-member-reads.md`; the plan is committed at the PR head and names PR #451 |
| GitHub issue sync expectation decision | yes | Sync #440 with a QA-facing comment after the PR exists |
| Output budget strategy recorded | yes | Recorded above and followed |

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
      scope; a batch plan is not used as a substitute. This plan owns exactly #451.
- [x] Required video or screen-recording evidence is cached/read as normalized
      `<video-transcripts>` XML, or marked N/A with reason. N/A: the issue has
      no video or screen recording.
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
      N/A with reason. New changeset `.changeset/quiet-moons-invent.md` (patch);
      `.changeset/` held no unreleased draft to update.
- [x] Final handoff shape decided: bug/feature/testing/batch/review/GitHub
      requirements, PR body sync, and issue sync when applicable.
- [x] Commit/PR handling recorded for code-changing work: commit and PR
      completed, no local patch, user explicitly declined, or blocker recorded.
      "User did not separately ask for a PR" is not a valid blocker.
      PR #451 exists; the current sweep authorizes commit/push/admin merge.
      Version Packages is excluded; auto release must remain disabled.
- [x] PR body shape recorded: PR #270 emoji task-style body used, N/A reason
      recorded, or blocker recorded. PR #451 uses the task-style format.
- [x] PR task evidence recorded: body includes `🧭 Task plan: ...`, the plan
      exists at the PR head, and it identifies the exact PR before autoclosure.
      PR #451 names this committed plan and identifies exact ownership.
- [x] Branch handling recorded for code-changing work: dedicated branch used,
      new branch needed, or N/A with reason. Dedicated branch `440-task` in the
      `vienna-v3` worktree; never touched `main`.
- [x] Local-env-rot retry policy recorded for any surprising repo-wide failure:
      reinstall/rerun evidence or N/A with reason. `npx vitest run` first failed
      8 files on `Cannot find module 'kitcn/...'` / `../dist/...`. That is stale
      `dist`, not install rot: `bun --cwd packages/kitcn build` (required by repo
      policy anyway) cleared all 8. No reinstall was needed.
- [x] Workspace authority recorded: every proof command names the cwd/tool that
      owns the changed behavior.
- [x] Output budget discipline recorded and followed: broad searches are
      scoped, capped, counted, or artifacted instead of streamed into goal
      context.
- [x] High-risk note recorded for public API, runtime, package-boundary,
      browser behavior, agent-action, or command-contract changes, or marked
      N/A with reason. Runtime change — see High-risk note below.
- [x] Review/autoreview target selected from actual diff state for non-trivial
      implementation work, or marked N/A with reason. `--mode local` (the diff
      is uncommitted), `--engine claude`.
- [x] Agent-native review decision recorded for `.agents/**`, `.claude/**`,
      `.codex/**`, skills, hooks, commands, prompts, or user-action tooling.
      N/A: the diff touches none of those paths.

Completion Gates:
| Gate | Applies | Required action | Evidence |
|------|---------|-----------------|----------|
| Named verification threshold | yes | Run the named suites | `npx vitest run packages/kitcn/src/orm/aggregate-index/reconcile.read-amplification.vitest.ts` -> 6 passed; bucket probes 1 / 2 / 1 / 1 against a RED baseline of 12 / 24 / 12 / 24 |
| Exact per-PR task ownership | yes | Record the exact PR | PR #451, this plan, one-to-one |
| Pre-solution issue challenge verdict | yes | Record claim, repro, validity, boundary | Recorded above: reproduced, `valid` for the read half, `deferred` for the patch half, boundary = the two point lookups |
| Repro escalation ladder | yes | Record each rung | Source-level vitest repro reproduced it at rung 1; browser/visual rungs N/A (no browser surface) |
| Bug reproduced before fix | yes | Record the failing repro | RED run with the runtime change reverted: 4 failed / 2 passed, bucket probes 12 / 24 / 12 / 24 |
| Targeted behavior verification | yes | Run focused proof | `npx vitest run packages/kitcn/src/orm/aggregate-index/` -> 4 files, 18 passed; `npx vitest run convex/orm/count.test.ts` -> 37 passed |
| TypeScript or typed config changed | yes | Run typecheck | `bun typecheck` -> 5/5 packages successful; `npx vitest run` reports "Type Errors: no errors" |
| Package exports or file layout changed | yes | Build the package | `bun --cwd packages/kitcn build` -> 72 files, complete. `kitcn/orm/aggregate-index` still exports only the two plan types it exported before |
| Package manifests, lockfile, or install graph changed | no | — | N/A: no manifest or lockfile change |
| Agent rules or skills changed | no | — | N/A: no `.agents/**` change |
| Workspace authority proof | yes | Record cwd | Every command ran from the repo root `/Users/mikey/conductor/workspaces/kitcn/vienna-v3`, the workspace that owns `packages/kitcn` and `convex/` |
| Browser surface changed | no | — | N/A: ORM runtime, no browser surface |
| Browser final proof | no | — | N/A |
| UI walkthrough | no | — | N/A: no UI or rendered output changed |
| Scaffold or fixture output changed | no | — | N/A: no `kitcn init -t` template or scaffold source touched |
| Package behavior or public API changed | yes | Add a changeset | `.changeset/quiet-moons-invent.md` (patch), written to the `changeset.mdc` structure |
| Docs and kitcn skill sync changed | no | — | N/A: no `www/**` change |
| Docs or content changed | no | — | N/A: the only prose is this plan and the changeset |
| High-risk mini gate | yes | Record failure mode, proof, boundary | High-risk note recorded below |
| Agent-native review for agent/tooling changes | no | — | N/A: diff touches no agent-native path |
| Local install corruption suspected | yes | Reinstall/rerun or record N/A | Not install rot: 8 vitest files failed on stale `dist`, cleared by the required `bun --cwd packages/kitcn build`. No `bun install` needed |
| Commit created | yes | Stage the checkout and commit | `0521b3c2 fix(orm): read each aggregate bucket once per key tuple per transaction`, whole checkout staged |
| PR create or update | yes | Run check, push, open PR | PR #451 exists; current sweep requires a fresh passing full check before final push/body update |
| Task-style PR body verified | yes | Verify with `gh pr view --json body` | Verified: `🐛 Fixes #440`, `🧭 Task plan:`, `🟢 95-100% confidence`, the `Phase / 🧪 Tests / 🌐 Browser` table with Reproduced and Verified rows, and bold emoji Outcome/Design/Caveat/Verified sections. No self-link |
| PR task evidence verified | yes | Verify plan line, plan at head, exact PR | All three confirmed against PR #451 |
| PR proof image hosting | no | — | N/A: no images in the PR body |
| GitHub issue sync-back | yes | Post a concise QA-facing comment | Comment posted on #440 naming the PR and the verification steps |
| Final handoff contract | yes | Fill the handoff fields | Filled below |
| Final lint | yes | Run lint | `bun lint:fix` (fixed one formatting nit) then `bun lint` -> clean, 961 files |
| Output budget discipline | yes | Verify scoping | All searches scoped to `packages/kitcn/src/orm` and `convex/`; the 9.5M-token audit fan-out returned schema-validated findings and was read from disk in filtered slices, never streamed whole |
| Timed checkpoint | no | — | N/A: no duration requested |
| Autoreview for non-trivial implementation changes | yes | Run until no accepted findings | `.agents/skills/autoreview/scripts/autoreview --mode local --engine claude`, run three times as the tree settled, clean each time. Final run over the exact final tree: "autoreview clean: no accepted/actionable findings", overall "patch is correct (0.72)" |
| Goal plan complete | yes | Run check-complete.mjs | `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/440-memoize-aggregate-bucket-and-member-reads.md` passes |

Phase / pass table:
| Phase | Status | Evidence | Next |
|-------|--------|----------|------|
| Intake and source read | complete | `gh issue view 440` read in full; plan created and classified | implementation |
| Implementation | complete | RED repro, then `runtime.ts` memo with write-through + exact invalidation | verification |
| Verification | complete | targeted suites, full vitest, bun test, typecheck, build, lint | closeout |
| Commit / PR / GitHub sync | complete | Commit `0521b3c2`, branch `fix/orm-memoize-aggregate-bucket-reads`, PR #451, issue #440 synced | closeout |
| Closeout | blocked | Confirmed P1: nested mutation leaves stale row snapshots | user scope decision |

Findings:
- The issue's stated root cause is only half right. Wrapping the single delta in
  `[delta]` is not what costs the reads: every document is reconciled in its own
  `change` hook, so there is nothing to fold inside one call. `executeThenDrainHooks`
  fires per `db.patch`, so `lifecycle.ts` has no statement boundary at all today.
  What removes the reads is giving the two point lookups transaction lifetime.
  The `[delta]` wrapping is stage (b)'s problem, not stage (a)'s.
- An adversarial design audit (7 hazard lenses, each finding refuted from two
  independent angles) surfaced four defects in the issue's proposed shape:
  1. BLOCKER — `AggregateMemberWrite` carries no `docId` on its `patch` and
     `delete` variants, so member write-through as specified is not
     implementable: the memo would keep serving the pre-write row and
     permanently corrupt bucket counts on the third write of a document.
     Fixed by threading `docId` (and the member post-image) through
     `AggregateMembershipDelta`.
  2. BLOCKER — memoizing inside `getBucketByKey` would also cover
     `readPlanBuckets`, whose 25-way `mapWithConcurrency` fan-out can store a
     pre-write row on top of a write-through entry. The read path contributes
     none of the measured amplification, so the memo is confined to the write
     path and `getBucketByKey` is left untouched.
  3. MAJOR — a bucket patch write-through that stored the patch payload would
     drop `keyHash`, which the extrema reads take off the bucket. Fixed by
     merging onto the whole prior row.
  4. MAJOR — the `aggregateStateGeneration` stamp the issue implies would not
     cover `clearCountIndexChunk`: it deletes bucket and member rows without
     bumping, and the bump its callers do always lands after the deletes.
     Fixed by invalidating exactly where the deletes happen, and by not
     claiming a guarantee the stamp cannot give.
- `serializeCountKeyParts` is `serializeStable`, and `deepEquals` is defined as
  equality of `serializeStable`, so `keyHash` is injective with respect to the
  code's own equality and is a sound memo key.
- Residual, documented in source and in the changeset: a raw `ctx.runMutation`
  opens a sub-transaction with its own `ctx.db` and its own JS context, so
  aggregate writes it makes are invisible to the caller's memo. kitcn's own
  rule (`SKILL.md` items 7 and 21) is to compose modules through
  `create<Module>Handler(ctx)`, which passes the caller's `ctx` straight
  through and therefore shares the memo.

Decisions and tradeoffs:
- Memo confined to the write path rather than added inside `getBucketByKey`.
  Costs nothing (the query path contributes none of the amplification) and
  removes the read/write interleaving hazard outright.
- Exact invalidation in `clearCountIndexChunk` instead of a generation stamp.
  The stamp would have documented a guarantee it does not provide, and the
  audit's own verdict was that a comment claiming it is the thing that rots.
- Memo entries are shallow clones. Convex's test backend hands out the stored
  document itself, so an entry would otherwise mean something different
  depending on the backend.
- `aggregate_extrema` reads are left alone. They are the same shape of
  amplification for `min()`/`max()` indexes, but the issue scopes stage (a) to
  buckets and members, and widening the write-through blast radius is not worth
  it in the same change.
- Member probes still scale with distinct documents. That is the honest floor:
  a document's member row is per document, and a brand new document has nothing
  to memoize. The tests assert that residual explicitly so it cannot be mistaken
  for an unfixed regression.

Implementation notes:
- `packages/kitcn/src/orm/aggregate-index/runtime.ts`
  - two `createOrmTransactionMemo` namespaces, one per storage table, read
    through `readBucketForWrite` / `readMemberForWrite` (write path only)
  - `applyBucketDelta` writes through on insert, patch and delete
  - `AggregateMembershipDelta` gains `docId`; the `patch` member write gains
    `post`, and the `insert` write's `doc` is typed as the row it inserts
  - `flushAggregateMembershipDeltas` writes the member memo through
  - `clearCountIndexChunk` retires entries for every row it deletes
  - `CountMemberRow` is exported so the delta can name the post-image; the
    package entry `kitcn/orm/aggregate-index` still exports only the two plan
    types it exported before.
- New `packages/kitcn/src/orm/aggregate-index/reconcile.read-amplification.vitest.ts`,
  modelled on the neighbouring `write-barrier.read-amplification.vitest.ts`.
- `.changeset/quiet-moons-invent.md`.
- One-sentence durable note added to `packages/kitcn/src/orm/transaction-cache.ts`:
  its docblock said a nested `ctx.runMutation` "only costs extra reads", which
  holds for the emptiness memo it was written for but not for a row memo. Left
  as-is it would have been a trap for the next author.

Review fixes:
- None yet.

Error attempts:
| Error / failed attempt | Count | Next different move | Resolution |
|------------------------|-------|---------------------|------------|
| None yet | 0 | | |

Verification evidence:
- cwd for every command below: repo root
  `/Users/mikey/conductor/workspaces/kitcn/vienna-v3`, the workspace that owns
  `packages/kitcn` and `convex/`.
- RED baseline, fix reverted, same tests:
  `npx vitest run packages/kitcn/src/orm/aggregate-index/reconcile.read-amplification.vitest.ts`
  -> 4 failed / 2 passed. Bucket probes 12 (insert), 24 (cold update),
  12 (delete), 24 (second statement in the same transaction).
- GREEN, fix applied: same command -> 6 passed. Bucket probes 1 / 2 / 1 / 1;
  member probes 12 / 12 / 12 / 0.
- `npx vitest run packages/kitcn/src/orm/aggregate-index/` -> 4 files, 18 passed.
- `npx vitest run convex/orm/count.test.ts` -> 37 passed.
- `npx vitest run` -> 93 files, 987 passed, 2 skipped, no type errors.
- `bun test` -> 1400 passed, 0 failed, 150 files.
- `bun typecheck` -> 5/5 packages successful.
- `bun --cwd packages/kitcn build` -> 72 files, build complete.
- `bun lint` -> clean (`bun lint:fix` fixed one formatting nit first).
- `bun test packages/kitcn/src/orm/transaction-cache.test.ts` -> 8 passed.
- Autoreview `--mode local --engine claude` over the final tree -> clean.
- `bun run test:cli` -> 124 passed. `bun run test:concave` -> smoke passed.
- `bun run test:verify` -> exit 0. `bun run test:runtime` -> exit 0.
- `bun check` -> blocked only at `fixtures:check` on upstream drift
  (`expo ~55.0.30` -> `~55.0.31`). No fixture or scaffold source is in this
  diff, and no other lane fails; recorded as a caveat in the PR body rather
  than pulling an unrelated dependency bump into a focused ORM change.

Source-listed case matrix:
| Case | Source claim | Harness | Before | Expected after | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Bulk insert, one key tuple | reads scale 1:1 with rows | `reconcile.read-amplification.vitest.ts` "a bulk insert probes one bucket per distinct key tuple" | 12 bucket probes | 1 | RED 12, GREEN 1 | done |
| Bulk update across two tuples | 2:1 on key change (issue's 80 reads / 40 rows) | same file, "a bulk update probes each key tuple once, not twice per row", cold memo seeded in its own transaction | 24 bucket probes | 2 | RED 24, GREEN 2 | done |
| Bulk delete | reads scale 1:1 with rows | same file, "a bulk delete probes one bucket per distinct key tuple" | 12 bucket probes | 1 | RED 12, GREEN 1 | done |
| Later statement over the same documents | snapshots must expire between statements | same file, later-statement regression | stale snapshots across nested calls | 2 bucket / 12 member probes | Authorized safe-scope contract passes | done |
| Read-your-own-writes preserved | eager patching must survive | same file, "reconciliation still serves the transaction its own writes" | passed | passed | count() correct after insert, update and delete in one transaction | done |
| Cleared index leaves no stale entry | not in the issue; found by the audit | same file, "a cleared index does not leave memoized rows behind" | crashed with "Patch on non-existent document" before exact invalidation | passes | GREEN | done |
| ~78 patches against one row | issue's stage (b) | N/A | 78 | unchanged | out of scope by the reporter's own split | deferred |

Final handoff contract:
- Commit line: `0521b3c2 fix(orm): read each aggregate bucket once per key tuple
  per transaction` on `fix/orm-memoize-aggregate-bucket-reads`.
- PR line: https://github.com/udecode/kitcn/pull/451
- Issue line: #440 synced with a QA-facing comment.
- Confidence line: 95-100%.
- Flow table:
  - Reproduced: tests RED (bucket probes 12 / 24 / 12 / 24), browser N/A
  - Verified: tests GREEN (1 / 2 / 1 / 1), browser N/A
- Browser check: N/A — Convex ORM runtime, no browser-rendered output.
- Outcome: a bulk statement now reads each `aggregate_bucket` row once per
  distinct key tuple and each `aggregate_member` row once per document, for the
  whole transaction, instead of once per written row.
- Caveat: the ~78 patches are untouched — that is the reporter's stage (b).
  `aggregate_extrema` still reads per row for `min()`/`max()` indexes. Writes
  made by a raw `ctx.runMutation` are invisible to the caller's memo.
- Design:
  - Chosen boundary: the two point lookups, wrapped for the write path only.
  - Why not quick patch: folding the single-element delta array (the issue's
    stated root cause) removes no read at all, because each document is
    reconciled in its own hook.
  - Why not broader change: memoizing inside `getBucketByKey` would also cover
    the concurrent aggregate query fan-out, where a read started before a write
    can clobber a write-through entry, for no measured gain.
- Verified: RED baseline then GREEN on the new suite; `bun typecheck`,
  `bun test` (1400), `npx vitest run` (987), `bun --cwd packages/kitcn build`,
  `bun lint`; autoreview clean.
- PR body verified: `gh pr view 451 --json body` — PR #270 emoji task-style
  format confirmed, no self-link.

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
- Commit: `0521b3c2`
- PR: https://github.com/udecode/kitcn/pull/451
- Issue: #440 synced
- Browser proof: N/A
- Caveats: stage (b) patch collapsing and `aggregate_extrema` reads remain; a
  raw `ctx.runMutation` sub-transaction bypasses the memo

Timeline:
- 2026-09-05T06:09:42.990Z Task goal plan created.
- Issue #440 read; read amplification reproduced RED at the ratio it reports.
- Adversarial design audit over 7 hazard lenses; 4 defects in the issue's
  proposed shape fixed before implementation.
- Memo implemented, suites green, package built, lint clean.
- Autoreview `--mode local --engine claude`: clean, no accepted findings.
- User lifted the standing PR decline and requested a PR. Branch renamed
  `440-task` -> `fix/orm-memoize-aggregate-bucket-reads` before the first push.
  Commit `0521b3c2`, PR #451, issue #440 synced.

Reboot status:
| Question | Answer |
|----------|--------|
| Where am I? | PR #451 current-head verification after main integration |
| Where am I going? | Full check, branch review, exact-head receipt and merge |
| What is the goal? | Issue #440 stage (a): bounded reads within uninterrupted statements, with correct counts across nested calls |
| What have I learned? | See Findings — the issue's `[delta]` root cause is only half right, and four defects in its proposed shape had to be fixed |
| What have I done? | See Timeline and Verification evidence |

High-risk note (runtime / package-internal change):
- Realistic failure mode: a memo entry that outlives the row it describes would
  make `applyBucketDelta` patch a deleted document, or compound a delta onto a
  stale absolute count — a silently wrong stored aggregate that nothing
  downstream can detect.
- Proof plan: every writer of the two tables is enumerated in the source comment
  and covered — write-through in `applyBucketDelta` and
  `flushAggregateMembershipDeltas`, exact invalidation in
  `clearCountIndexChunk`. The clear path has a dedicated test that fails with
  "Patch on non-existent document" without the invalidation. Values are asserted
  after every amplification case, and `convex/orm/count.test.ts` (37 tests,
  including insert/update/delete across three aggregate indexes in one
  transaction) is unchanged and green.
- Why this boundary is right: the alternative — memoizing inside
  `getBucketByKey` — would also cover the 25-way concurrent query fan-out, where
  a read that started before a write can store its pre-write row afterwards. The
  query path contributes none of the reported amplification, so confining the
  memo to the write path costs nothing and removes that hazard outright.

Open risks:
- Read reuse ends at statement exit and user lifecycle/RLS callbacks. Callback-
  heavy writes can perform more reads; correctness takes precedence over reuse.
- Final-head hosted checks and superseding exact-head receipt remain external
  merge gates; local P0/P1 review passed on b94b6634.
- `aggregate_extrema` still reads once per row for `min()`/`max()` indexes.

Hard closeout guard:
- A local-only final response for verified code-changing work is invalid unless
  this plan records an explicit user decline, no local patch, analytical/
  blocked/inconclusive outcome, or a real commit/PR blocker.

Current closeout (2026-09-07):
- Separate task invocation for exactly #451; initial head 925e7d90 passed
  body/head/plan compliance and complete unfiltered feedback inventory.
- Main 781af65c integrated without conflicts. Owning checkout:
  /Users/zbeyens/git/better-convex. No runtime behavior change during closeout.
- Fresh focused proof: 56 aggregate/count integration tests and 8 transaction
  memo tests passed. Package build and lint passed. Full bun check exited 0:
  1400 Bun, 1011 Vitest, 124 CLI tests, all 8 fixture comparisons and runtime
  smoke lanes; /tmp/kitcn-pr451-check.log.
- Source audit enumerated all metric bucket/member writes: delta writes update
  the memo, clearing retires entries, and rank membership uses a separate kind.
- Deslop found zero added/worsened occurrences. Corrected a stale barrier name
  in a comment and clarified the changeset's nested-mutation warning.
- User authorized joint #451/#454 lifetime repair with "never ask, just go".
  #451 keeps eager writes and owns statement/callback read-cache boundaries.
  #454 remains the deferred-write owner. Public signatures remain unchanged.
- Three nested-UDF regressions (between statements, lifecycle change hook and
  insert RLS policy) each reproduced indexed count 2 for 3 writes before their
  boundary repair. All pass with cache expiration/suspension. Bulk 1/2/1 bucket
  probes remain; later statements reload 2 buckets and 12 members.
- 66 focused cases and 3 failure-path unit tests pass. Root typecheck 5/5,
  lint, package build, intent validation/staleness and rendered docs route pass.
  Published aggregate guidance and its generated mirror are synchronized.
- Canonical fixture sync completed all 8 templates after upstream lucide-react
  drift; six generated manifests changed. Full check exits 0: 1403 Bun,
  1014 Vitest, 124 CLI tests, eight fixture comparisons and runtime lanes.
  Frozen P0/P1 branch review on b94b6634 reports no actionable findings.
- Head 1f777a5e was pushed and bound to local HEAD/live/fetched ref. Post-push
  replay passes 9 reconciliation and 11 memo/scope cases. Exact-head receipt
  issuecomment-5571461564 was read back and inventories repeated: zero P0/P1.
  This final versioned evidence push requires another external replay/receipt
  and exact-head hosted checks before merge; no merge is claimed in this plan.
- User waived walkthrough. Version Packages merge and release are excluded.
  Hosted gates and exact-head delivery remain required.
