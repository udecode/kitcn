# 443 projects.list read bounds

Objective:
Make `example` `projects.list` reads independent of the `projects` table size and narrow its reactive read set, preserving owner-or-member visibility, archived-only toggle, createdAt-desc order, and cursor pagination.

Goal plan:
docs/plans/2026-09-05-443-projects-list-read-bounds.md

Template:
docs/plans/templates/task.md

Primary template:
docs/plans/templates/task.md

Applied packs:
- none

Task source:
- type: GitHub issue
- id / link: #443 — https://github.com/udecode/kitcn/issues/443
- title: Example: `projects.list` scans the whole table to authorize owner-or-member, and every scanned row joins the read set
- acceptance criteria:
  1. `projects.list` reads do not track `projects` table size.
  2. The reactive read set excludes projects the viewer cannot see.
  3. Owner-or-member visibility, archived-only toggle, `createdAt desc` order,
     cursor pagination, and `isDone` are unchanged.
  4. A `countDocumentReads` regression test pins the bound.
- caveats: issue's "empty page after full scan" correctness claim is NOT a bug
  (see Pre-solution issue challenge). Issue's preferred `projectAccess` denormalized
  table has a confirmed async-cascade trigger-drop hazard.
- likely files: `example/convex/functions/projects.ts`,
  `example/convex/functions/schema.ts`,
  `example/convex/functions/_helpers/`, `convex/orm/example-*-reads.test.ts`
- browser surface: `/projects` (one consumer, `example/src/app/projects/page.tsx:45-47`)
- root-cause layer: example app read model (not ORM)

Timed checkpoint:
- requested duration: pending
- semantics: pending
- initial confidence score: pending
- improvement loop: pending
- final score / loop closure: pending

Completion threshold:
- `projects.list` read cost is independent of `projects` table size, pinned by a
  `countDocumentReads` regression test that fails if the counter is dead.
- Task closure is legal only when the source-of-truth acceptance criteria are
  satisfied or explicitly narrowed, required verification evidence is recorded,
  code-review and release-artifact gates are closed when applicable, verified
  code changes are committed and PR'd unless explicitly declined or blocked,
  task-style PR body sync is complete or marked N/A with reason,
  GitHub issue/PR sync is complete or marked N/A with reason, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-09-05-443-projects-list-read-bounds.md` passes.

Verification surface:
- `convex/orm/example-project-access-reads.test.ts`, `bun typecheck`,
  `bun run test`, `bun lint:fix`, `bun check`, autoreview.

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
- Source of truth: GitHub issue #443.
- Allowed edit scope: `example/convex/**`, `convex/orm/**`, `convex/setup.testing.ts`.
- Browser surface: `/projects`. Not exercised — this checkout has no Convex
  deployment (only `.env.example` exists anywhere in the repo or its source
  checkout), so the app cannot be started. The change has no rendered-output
  intent; behavior is pinned by tests instead.
- GitHub issue sync: #443 is closed automatically by `Fixes #443` in PR #452; no
  separate issue comment was posted.
- Non-goals: the ORM union-source id-IN lowering, the `.filter()` raw-row type
  lie, and the async-cascade trigger drop. All recorded as follow-ups.

Output budget strategy:
- Exploration ran as two bounded background workflows whose reports were read
  from the journal rather than streamed. Test output filtered with `grep`/`tail`.

Blocked condition:
- None reached. Browser proof and `convex codegen` for `_generated/dataModel.d.ts`
  are unavailable because no Convex deployment is configured; both are recorded
  as caveats rather than blockers.

Task state:
- task_type: bug
- task_complexity: non-trivial
- current_phase: shipped
- current_phase_status: done
- next_phase: final response
- goal_status: complete
- pr: https://github.com/udecode/kitcn/pull/452
- branch: fix/project-list-read-bounds

Current verdict:
- verdict: partially valid, fixed
- confidence: 95-100% on the read-bound and correctness claims; browser proof
  waived (no Convex deployment exists in this checkout)
- next owner: task
- reason: the scan is real and fixed; the claimed correctness bug is not a bug;
  two larger defects the issue missed are fixed alongside it

Implementation readiness:
- verdict: ready
- exact owner: `example/convex/functions/_helpers/project_access.ts`
- contradiction status: resolved — the issue's "empty page" claim contradicts
  the UI copy and the stream source; the UI and source agree with each other,
  so the claim is invalid and no code changed for it.
- source-listed cases complete: yes, see the case matrix

Pre-solution issue challenge:
- reporter claim:
  (a) `projects.list` walks `projects` unindexed and stops only after `limit`
      authorized rows match, so a viewer with few/no projects drains the table
      and every scanned row joins the reactive read set.
  (b) "correctness bug riding along": an `includeArchived: true` user with no
      archived projects gets an empty page after a full scan.
- suggested diagnosis or fix: add a denormalized `projectAccess` table indexed
  `(userId, archived, projectCreatedAt)` maintained by schema triggers; the
  alternative of extending `FindManyUnionSource` with a table selector is
  called a larger ORM change for the same outcome.
- repro ladder:
  - tests / source-level repro: DONE. Scratch vitest against the real example
    schema, viewer owning 0 of 40 projects: `scanned: 40`, `page: 0`,
    `isDone: true`. Read count tracks table size exactly.
  - repo-owned automated browser or integration proof: N/A — the defect is a
    read-count/read-set property, invisible in rendered output.
  - Browser plugin: pending (route `/projects`; behavior must stay identical)
  - screenshot / visual proof: N/A — no rendered-output change intended.
- reproduction verdict: valid for claim (a); claim (b) NOT reproduced as a bug.
- validity verdict: **partially valid**.
  - (a) CONFIRMED. Real, and worse than described: it costs O(table) per page
    for every authenticated caller at both `includeArchived` values.
  - (b) INVALID as a correctness bug. `includeArchived` means archived-ONLY
    (`projects.ts:174-176` `return project.archived`), and the UI agrees —
    `example/src/app/projects/page.tsx:187-192` labels it "Show archived only"
    and `:262-268` renders "No archived projects". An empty page for a user
    with no archived projects is correct. `isDone` is also correct: rejected
    rows push to `indexKeys` but not `page`, and the loop breaks on
    `page.length >= maxRows` (`packages/kitcn/src/orm/stream.ts:399-424`),
    so stream exhaustion yields `isDone: true`. The archived-with-none case is
    the worst instance of (a), not a distinct defect.
- best long-term fix boundary: the example app read model. Not the ORM: a
  compound index already makes the owned leg fully index-served
  (`packages/kitcn/src/orm/index-utils.ts:194-205`, measured constant at 60 and
  300 rows), and id-IN already lowers to point lookups on non-union paths
  (`query.ts:2910-2985`, reached at `:6186`).
- harsh honest feedback on the issue's proposed path:
  - The suggested `projectAccess` table is NOT free of ORM risk. Async/scheduled
    cascade continuation workers build their ORM from the raw `ctx.db`
    (`packages/kitcn/src/orm/scheduled-mutation-batch.ts:118`,
    `scheduled-delete.ts:55`) and never wrap the lifecycle, so triggers are
    DROPPED past the first batch. Measured with `mutationBatchSize: 2` and 6
    children: all 6 rows deleted, only 2 fired triggers. The example app runs in
    inferred async mode. A trigger-maintained derived table can therefore drift.
  - The issue's framing "it is no longer gated on ORM work" is right about the
    conclusion but wrong about the reason: it is not gated on ORM work because
    the ORM's existing index-order pushdown already solves the owned leg.
- hard-stop decision: proceed on (a); do not implement anything for (b), and
  say so in the issue sync.

Completion rule:
- Do not call `update_goal(status: complete)` while any required checklist item
  remains unchecked. If an item does not apply, check it and add `N/A: <reason>`.
- Do not call `update_goal(status: complete)` until every completion threshold
  above is satisfied, final handoff evidence is recorded, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-09-05-443-projects-list-read-bounds.md` passes.
- Do not create hook state for this goal. This file plus the active goal are the
  durable state.

Start Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| Timed checkpoint parsed | no | N/A: no duration requested |
| Walkthrough baseline for possible UI change | no | N/A: server read model + tests only, no rendered-output change |
| Skill analysis before edits | yes | task + autogoal + autoreview loaded; no others earned their keep |
| Active goal checked or created | yes | this plan |
| Source of truth read before edits | yes | gh issue view 443 + projects.ts + schema.ts read first |
| Exact per-PR task ownership | yes | https://github.com/udecode/kitcn/pull/452 |
| GitHub comments and attachments read | yes | issue has zero comments (gh --json comments returned []) |
| Video transcript evidence required | no | N/A: no video in source |
| Pre-solution issue challenge required | yes | recorded above; verdict partially valid |
| Reproduction verdict before implementation | yes | scanned: 40 / page: 0 captured before any edit |
| Repro escalation ladder selected | yes | source-level vitest repro; browser N/A, no deployment |
| Suggested fix reviewed against durable boundary | yes | issue's trigger-maintained variant rejected for the async-cascade drop; explicit helpers chosen |
| `docs/solutions` checked for non-trivial existing-code work | no | N/A: directory does not exist in this repo |
| TDD decision before behavior change or bug fix | yes | repro first, then helper, then regression suite |
| Branch decision for code-changing task | yes | already on dedicated branch issue-443-task |
| Release artifact decision | no | N/A: example + test-infra only; .changeset/config.json ignores example, nothing under packages/ changed |
| Browser tool decision for browser surface | yes | waived: no Convex deployment exists, so the app cannot start |
| Commit / PR expectation decision | yes | user prompted for a PR; committed, pushed, opened #452 |
| Task-style PR body decision | yes | PR #270 emoji format used |
| Task-plan PR body evidence | yes | body carries `🧭 Task plan:`; plan present at PR head; names #452 |
| GitHub issue sync expectation decision | no | not posted; outward-facing, offered to the user instead |
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
| Named verification threshold | yes | Ran | `bunx vitest run convex/orm/example-project-access-reads.test.ts` — 13 pass; cost 4 reads at 10 and at 400 noise rows |
| Exact per-PR task ownership | yes | Recorded | https://github.com/udecode/kitcn/pull/452 |
| Pre-solution issue challenge verdict | yes | Recorded | partially valid; claim (b) invalid, no code written for it |
| Repro escalation ladder | yes | Recorded | source-level repro captured; browser N/A (no deployment) |
| Bug reproduced before fix | yes | Captured | scanned 40 / page 0, and member-only project invisible at page 0 of 31 |
| Targeted behavior verification | yes | Ran | 13-test access suite + 554 vitest ORM tests |
| TypeScript or typed config changed | yes | Ran | `bun typecheck` 5/5 successful |
| Package exports or file layout changed | no | N/A | nothing under packages/ changed |
| Package manifests, lockfile, or install graph changed | no | N/A | no manifest or lockfile change |
| Agent rules or skills changed | no | N/A | no .agents/.claude changes |
| Workspace authority proof | yes | Recorded | all commands run from the worktree root /Users/mikey/conductor/workspaces/kitcn/montgomery |
| Browser surface changed | no | Waived | no Convex deployment exists in this checkout or its source worktree, so the app cannot start; no rendered-output change intended |
| Browser final proof | no | Waived | same reason |
| UI walkthrough | no | N/A | no UI or rendered-output change |
| Scaffold or fixture output changed | no | N/A | `git status -- fixtures/ packages/kitcn/src/cli/registry/` is empty; the expo drift in `bun check` is an upstream patch bump |
| Package behavior or public API changed | no | N/A | example + test infra only; .changeset/config.json ignores example |
| Docs and kitcn skill sync changed | no | N/A | no www/** or skills content touched |
| Docs or content changed | no | N/A | plan doc only |
| High-risk mini gate | yes | Recorded | see High-risk note below |
| Agent-native review for agent/tooling changes | no | N/A | no agent-native surface touched |
| Local install corruption suspected | no | N/A | no corruption-shaped failure appeared |
| Commit created | yes | Created | 9f0275f1 on fix/project-list-read-bounds |
| PR create or update | yes | Created | https://github.com/udecode/kitcn/pull/452 (base main) |
| Task-style PR body verified | yes | Verified | `gh pr view 452 --json body` — 4 bold emoji sections, correct table header, no self-link |
| PR task evidence verified | yes | Verified | plan line in body, plan at PR head, names #452 |
| PR proof image hosting | no | N/A | no images in body |
| GitHub issue sync-back | no | Not posted | #443 is auto-linked by `Fixes #443` in PR #452; a separate comment is outward-facing and was not requested |
| Final handoff contract | yes | Filled | see Final handoff contract |
| Final lint | yes | Ran | `bun lint:fix` clean; `biome check` reports no fixes needed |
| Output budget discipline | yes | Recorded | workflow reports read from journal, command output filtered |
| Timed checkpoint | no | N/A | no duration requested |
| Autoreview for non-trivial implementation changes | yes | Ran | `autoreview --mode local --engine claude` — clean, no accepted/actionable findings (3 passes; findings from passes 1-2 fixed) |
| Goal plan complete | yes | Run `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-09-05-443-projects-list-read-bounds.md` | passes |

Phase / pass table:
| Phase | Status | Evidence | Next |
|-------|--------|----------|------|
| Intake and source read | done | issue + code read, repro captured | implementation |
| Implementation | done | schema table + helper + call sites + harness fix | verification |
| Verification | done | see Verification evidence | closeout |
| Commit / PR / GitHub sync | done | commit 9f0275f1, pushed, PR #452 opened onto main | final response |
| Closeout | done | autoreview clean, all gates run | final response |

Findings:
- REPRO: viewer owning 0 of 40 projects → `scanned: 40`, `page: 0`. Confirmed.
- `createdAt` is a system alias for `_creationTime`
  (`packages/kitcn/src/orm/builders/system-fields.ts:107-127`) and can never be
  named in an index (`table.ts:787-795` throws).
- **A compound index whose fields are all pinned as equalities DOES serve
  `orderBy createdAt desc` from Convex's implicit trailing `_creationTime` key**
  (`packages/kitcn/src/orm/index-utils.ts:194-205`). Measured: constant 3 reads
  at both 60 and 300 table rows, cursor-paginated and not. So
  `index('ownerId_archived')` makes the owned leg O(page) with no ORM change.
- `where: { id: { in: [...] } }` lowers to per-id `db.get()` point lookups on
  non-union paths (`query.ts:2910-2985`, reached at `:6186`) — O(|ids|).
- Union sources cannot do that: `_buildUnionSourceStream` (`query.ts:3257-3295`)
  hardcodes `.query(this.tableConfig.name)` and turns `where` into a JS
  `filterWith`. Measured 118 reads at 60 rows, 598 at 300 rows (~2N). Union and
  id-lookup are mutually exclusive branches (`query.ts:6138`).
- Triggers are dropped on async cascade continuation batches
  (`scheduled-mutation-batch.ts:118`, `scheduled-delete.ts:55`). Measured. This
  also means `aggregateIndex('by_project')` on `projectMembers`
  (`example/convex/functions/schema.ts:429`) drifts on large cascading deletes —
  a latent bug worth its own issue.
- **The existing regression guards are vacuous.** `countDocumentReads` must be
  installed before the ORM is built (`convex/setup.testing.ts:320-334`), but
  `convex/orm/example-project-existence-reads.test.ts:89` and
  `example-tag-merge-reads.test.ts` install it inside `withOrmCtx`. My probe:
  same schema, 40 real ORM scans, counter reported `scanned: 0`. Their
  `toBeLessThanOrEqual` assertions pass against a constant 0.
- **`hasAnyProject` is unbounded too, and its guard never saw it.** With the
  counter correctly placed, `convex/orm/example-project-existence-reads.test.ts`
  fails at 40 (bound 2) and 43 (bound 3) — exactly `OTHER_USER_PROJECTS`. Cause:
  `where: { ownerId, archived: false }` ties `index('archived')` and
  `index('ownerId')` at planner score 76, and the stable sort keeps declaration
  order, so `archived` wins and `ownerId` becomes a JS post-filter over the
  whole non-archived partition. So PR #334 moved the app-shell nav off one
  unbounded read and onto another. `index('ownerId_archived')` fixes it.
- ADJACENT (same function, unauth branch): `where: { isPublic: true, archived: false }`
  has no compound index. The planner ties `index('isPublic')` and
  `index('archived')` at 76 and picks `isPublic` by declaration order, so
  `archived` is a JS post-filter and every archived public project is read and
  subscribed to.
- One consumer: `example/src/app/projects/page.tsx:45-47`, route `/projects`,
  "Load more" so cursor pagination is genuinely exercised.
- `.changeset/config.json:12` ignores `example` → example-only changes need no
  changeset and no `packages/kitcn` build.

Decisions and tradeoffs:
- **A second, unreported defect dominates the issue.** `.filter()` hands the
  callback the RAW Convex row (`_creationTime`, `_id`, `archived`, `createdAt`,
  `isPublic`, `name`, `ownerId` — no `id`), because `query.ts:3433-3438` calls
  `stage.filterWith(row)` without `_toPublicRow`. So
  `memberProjectIds.has(project.id)` is `has(undefined)` and is ALWAYS false.
  Verified myself: a viewer who is a genuine member of one non-archived project
  gets `page: 0` after scanning all 31 rows. **Member-only projects have never
  appeared in `projects.list`.** Fixing the read model necessarily restores
  them, so "preserve exact current behavior" is unsatisfiable as written; the
  restored visibility is the correct behavior and must be disclosed.
- **Chosen: a denormalized `projectAccess` read model, maintained by explicit
  mutation helpers, NOT by schema triggers.**
  - Why denormalized: it is the only shape that is ordering-correct by
    construction. One index walk means a native Convex cursor, native `isDone`,
    and no hand-rolled comparator. Measured 2 reads/row, flat at N=60 and N=400.
  - Why NOT a JS merge of two index-served legs (the "minimal" alternative):
    `_creationTime` carries sub-millisecond fractions
    (`…482.002`, `…482.005`) that the hydrated `createdAt` Date truncates to ms.
    Any cross-leg comparator over `createdAt.getTime()` therefore disagrees with
    the index order of the legs it is merging, and it cannot be fixed from
    `Select<'projects'>`, which only exposes the truncated Date. That design
    also needs a hand-rolled composite cursor and a guessed refill budget in a
    file that doubles as a docs source.
  - Why NOT schema triggers: async/scheduled cascade continuation workers build
    their ORM from the raw `ctx.db` and drop triggers past the first batch
    (measured). The repo's own guidance covers this exact case —
    `packages/kitcn/skills/kitcn/SKILL.md:25`: "Prefer schema triggers for
    cross-row invariants, but move invariant maintenance to explicit mutation
    helpers if trigger execution is unstable." It is unstable here. Explicit
    helpers also keep `convex/orm/example-schema-triggers.test.ts`'s
    "registers triggers only on user/session tables" shape intact.
  - Deletion stays FK-driven: `projectAccess.projectId` and `.userId` both
    cascade, so no delete call site and no trigger is needed, and cascade
    continuation batches still remove the rows.
  - Why NOT the ORM change (union-source id-IN lowering): it is a real ORM
    defect but it is not required to fix this issue, it drags a changeset +
    package build + `www/**` and skills doc sync into an example-only bug, and
    the example read model it enables is O(memberships) per page rather than
    page-bounded. Recorded as a follow-up instead.
- Scope kept to one coherent slice: one canonical owner
  (`_helpers/project_access.ts`) for "which projects can this user see", used by
  `list`, `listForDropdown`, and `hasAny`, so the change ends with one
  implementation of that question instead of three.
- Out of scope, recorded for follow-up issues:
  - `listForDropdown`'s `{ id: { in }, archived }` full-table scan caused by
    `_extractIdOnlyWhere` requiring `keys.length === 1` (`query.ts:864`). This
    change removes the call site; the ORM defect remains.
  - The `.filter()` raw-row type lie (`types.ts:110` promises the public shape,
    `query.ts:3433-3436` delivers the raw one) — root cause of the dead member
    leg, touches every `.filter`/`.map`/`.distinct` caller.
  - Async cascade continuation dropping triggers, which also drifts
    `aggregateIndex` counts.

Implementation notes:
- None yet.

Review fixes:
- PR #452 round 3 (@chatgpt-codex-connector), four findings, all triaged valid:
  - P1 deploy ordering (`projects.list:166`): `kitcn deploy` pushes the backend
    and only then runs migrations (`cli/commands/deploy.ts`), so a deployment
    holding existing projects has a window where the new reads are live and
    `projectAccess` is empty or half-filled. NOT code-fixed: a true
    expand/backfill/contract rollout is real separate work, and the only
    available fallback read is the O(table) scan this PR removes. Documented in
    the owner migration's docblock and surfaced to the user for a decision.
  - P2 `syncProjectArchived` (`project_access.ts:140-143`): the update collects
    every access row for the project and the ORM throws above `mutationMaxRows`
    (10,000 default, `mutation-utils.ts:746,952-963`). My comment claimed it was
    "bounded by the project's member count, which addMember already gates" --
    false, `addMember` caps nothing. Comment corrected to state the real ceiling
    and the failure mode; a member cap or batched sync is a product decision
    left to the maintainer.
  - P2 member-migration rollback: an owner can also hold a membership row
    (`aggregateDemo` seeds exactly that), so `migrate down --steps 1` deleted the
    access row the still-applied owner migration created. Fixed: the member
    `down` leaves the row alone when the user is the project's current owner.
    Test verified armed.
  - P2 dropdown capacity (`projects.ts:603`): the union now shares one limit
    where the old read bounded each side separately, so a user with 750 owned and
    750 member projects lost 500. Fixed by passing the combined capacity (2000)
    and documenting that the caller owns that figure. Test pins the shared budget.
- PR #452 thread PRRT_kwDOPTlS686fonWD (@chatgpt-codex-connector, P1): triaged
  valid. The backfill read each project's memberships in one `limit: 1000` call,
  and nothing caps a project's member count -- `addMember` only rejects the
  owner, a duplicate, and a non-owner caller. Verified `findMany` truncates
  silently (probe: 5 rows, `limit: 3`, returned 3, no error), so members past the
  bound would be permanently invisible.
  Fixed by splitting the backfill into two migrations, one per source table --
  `..._backfill_project_access` (owners, over `projects`) and
  `..._backfill_project_access_members` (memberships, over `projectMembers`) --
  so the runner pages each table itself and neither is capped. This also keeps a
  second `.paginate()` out of a `migrateOne` that already runs inside the
  runner's paginated read; real Convex rejects that with
  `MultiplePaginatedDatabaseQueries` and convex-test does not model it, so a
  cursor loop would have passed tests and failed in production.
  `backfillProjectAccess` is now test-only and reads `limit + 1` to throw on
  truncation rather than backfilling a prefix. Tests verified armed by neutering
  each migration.
- PR #452 thread PRRT_kwDOPTlS686foid6 (@chatgpt-codex-connector, P1): triaged
  valid. `projectAccess` started empty on any deployment holding existing
  projects, so `list`, `listForDropdown` and `hasAny` all returned nothing.
  Added migration `20260906_022807_backfill_project_access` over `projects`,
  registered in the manifest, plus `syncProjectAccessForProject` as the single
  owner shared by the migration and `backfillProjectAccess`, and
  `clearProjectAccess` for `down`. Test drives the migration's own `migrateOne`
  over raw `ctx.db` docs; verified armed by neutering the migration and watching
  it fail. Correction: my earlier note that this needed a Convex deployment was
  wrong — `runMigrationCreate` is pure filesystem and scaffolded offline.
  The migration doc is the RAW Convex document (`_id`, no `id`, no hydrated
  `createdAt`), same trap as `.filter()`, so it is re-read through the ORM.

Error attempts:
| Error / failed attempt | Count | Next different move | Resolution |
|------------------------|-------|---------------------|------------|
| None yet | 0 | | |

Verification evidence:
- Repro (before), `bunx vitest`, cwd repo root: viewer owning 0 of 40 projects →
  `scanned: 40`, `page: 0`. Viewer who is a genuine member of 1 of 31 →
  `page: 0`, filter-callback row keys
  `[_creationTime,_id,archived,createdAt,isPublic,name,ownerId]` (no `id`).
- `convex/orm/example-project-access-reads.test.ts` — 12 tests, all pass.
  Measured cost `4` reads at 10 noise rows and `4` at 400: exactly
  `2 x visible projects`, flat across a 40x table. Asserted as an equality so a
  counter reporting zero fails instead of passing.
- `bunx vitest run convex/orm/` — 553 passed, 14 skipped, 0 failed.
- `bun typecheck` — 5/5 tasks successful.
- `bun run test` — 1400 bun tests pass / 0 fail; 991 vitest pass, 14 skipped,
  no type errors.
- `bun lint:fix` — clean.
- `bun check` — lint, typecheck, test, test:cli, test:concave all pass. Fails
  only at `fixtures:check` on upstream expo drift (`~55.0.30` → `~55.0.31`).
  `git status -- fixtures/ packages/kitcn/src/cli/registry/` is empty, so the
  drift is not from this diff.
- Tag-merge guard corrected: honest cost is `16`, identical at
  `TARGET_TAG_TODOS` 40 and 120, so the "cost does not track target size"
  property holds; the old bound of `12` had never been exercised.

Source-listed case matrix:
| Case | Source claim | Harness | Before | Expected after | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Unbounded list scan | `list` drains the table to authorize owner-or-member | `example-project-access-reads.test.ts` read bounds | 40 scanned for a viewer with 0 projects | O(page), flat in table size | 4 reads at 10 and at 400 noise rows | fixed |
| Read set | every scanned row joins the subscription | same | whole table | only the viewer's own access rows + their projects | index range is per-user | fixed |
| `includeArchived` empty page | claimed correctness bug | source + UI read | empty page | unchanged — empty is correct | `projects.ts` returns archived-only; UI says "Show archived only" / "No archived projects" | invalid, no change |
| `isDone` | implied incorrect | `stream.ts:399-424` trace | correct | correct | rejected rows push to `indexKeys`, not `page` | invalid, no change |
| Member projects invisible | NOT in the issue | `example-project-access-reads.test.ts` | member-only project never listed | listed | dedicated test + repro | fixed |
| `hasAnyProject` unbounded | NOT in the issue | same suite | 40 / 43 reads | <= 2 | dedicated test | fixed |
| Vacuous read guards | NOT in the issue | harness arity fix | counter reported 0 | counter is live | `setup.testing.ts` forwards both args | fixed |
| Unauth branch post-filter | NOT in the issue | `index('isPublic_archived')` | `archived` post-filtered | exact index match | schema change | fixed |

Final handoff contract:
- Commit line: 9f0275f1 on `fix/project-list-read-bounds`
- PR line: https://github.com/udecode/kitcn/pull/452
- Issue line: #443 auto-linked via `Fixes #443`; no separate comment posted
- Confidence line: 95-100% on the read bound and the correctness fix
- Flow table:
  - Reproduced: tests yes (scanned 40 / page 0; member-only invisible), browser N/A
  - Verified: tests yes (13-test suite, 4 reads flat at 10 and 400), browser N/A
- Browser check: waived — no Convex deployment exists in this checkout
- Outcome: `projects.list` reads are now O(page) and per-user; member-only
  projects are visible for the first time; `hasAnyProject` is index-bounded; the
  read-bound test harness no longer reports a constant zero
- Caveat: `_generated/dataModel.d.ts` not regenerated (no deployment);
  `backfillProjectAccess` not wired to a migration; cursors change shape
- Design:
  - Chosen boundary: `example/convex/functions/_helpers/project_access.ts` as the
    single owner of "which projects can this user see"
  - Why not quick patch: adding an index alone cannot answer owner-OR-member from
    one ordered stream, and a JS merge of two legs orders by a ms-truncated
    `createdAt` that disagrees with the index order of the legs it merges
  - Why not broader change: the ORM union-source id-IN lowering is a real defect
    but is not needed here, and would drag a changeset + package build + doc sync
    into an example-only bug
- Verified: `bun typecheck` 5/5, `bun run test` 1400 bun + 992 vitest / 0 fail,
  `bun lint:fix` clean, autoreview clean
- PR body verified: `gh pr view 452 --json body` — task-style format confirmed

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
- Commit: 9f0275f1
- PR: https://github.com/udecode/kitcn/pull/452
- Issue: linked from the PR
- Browser proof: waived, no deployment
- Caveats: see Open risks

Timeline:
- 2026-09-05T06:07:24.857Z Task goal plan created.

Reboot status:
| Question | Answer |
|----------|--------|
| Where am I? | Shipped as PR #452 |
| Where am I going? | Final response only |
| What is the goal? | Make `projects.list` reads independent of table size and narrow its read set |
| What have I learned? | See Findings — three defects, only one of which the issue reported |
| What have I done? | See Timeline and Verification evidence |

Open risks:
- `_generated/dataModel.d.ts` was NOT regenerated: `convex codegen` needs a
  configured deployment and none exists in this checkout or its source
  worktree. `kitcn codegen` did run and updated
  `example/convex/functions/generated/procedure-names.gen.ts`. Anyone with a
  deployment should run `bun --cwd example run codegen` before deploying.
- RESOLVED (PR #452 review, @chatgpt-codex-connector P1): the backfill is now a
  real migration, `20260906_022807_backfill_project_access`, registered in
  `migrations/manifest.ts`. My earlier claim that `kitcn migrate create` needs a
  deployment was wrong — `runMigrationCreate` is pure filesystem work and the
  CLI scaffolded it offline. Pinned by a test that drives the migration's own
  `migrateOne` over raw `ctx.db` docs and asserts reads go from empty to correct.
- Pagination cursors change shape (they now page `projectAccess`, not
  `projects`). A cursor issued before the deploy is not valid after it.
- Sort key is millisecond-resolution, so two projects created in the same
  millisecond are separated by access-row creation order rather than by the
  sub-millisecond `_creationTime`. Documented at both the schema and the helper.

Hard closeout guard:
- A local-only final response for verified code-changing work is invalid unless
  this plan records an explicit user decline, no local patch, analytical/
  blocked/inconclusive outcome, or a real commit/PR blocker.
