# Elide post-image re-reads in ORM insert().returning() and returning({ _count })

Objective:
Stop the ORM write path re-reading documents the writer already holds: elide the
per-row `db.get` post-image in `insert().returning({...})` and the per-row
re-query in `returning({ _count })`.

Goal plan:
docs/plans/409-elide-post-image-re-reads.md

Template:
docs/plans/templates/task.md

Primary template:
docs/plans/templates/task.md

Applied packs:
- package-api (docs/plans/templates/packs/package-api.md)

Task source:
- type: GitHub issue
- id / link: #409 — https://github.com/udecode/kitcn/issues/409
- title: ORM: `insert().returning()` and `returning({ _count })` re-read rows the
  writer already holds
- task type: performance bug (read-cost), two paths, same bug class
- acceptance criteria:
  - `insert().returning({ <projection> })` performs 0 post-image `db.get` reads
    per inserted row when the table has no lifecycle hooks and the projection
    names no `_creationTime`/`createdAt` column.
  - `returning({ _count })` performs 0 re-fetch reads of the affected row on
    insert/update/delete.
  - argument-less `returning()` keeps its read (needs `_creationTime`).
  - lifecycle-hooked tables keep their read (`create.before` can rewrite the
    payload; `create.after`/`change` are drained inside `db.insert`).
  - `delete().returning({ _count })` still loads the count *before* cascade
    removes children (`convex/orm/mutations.test.ts` pins `_count: { posts: 3 }`).
- caveats: no OCC benefit; the win is read cost and per-mutation read-limit
  headroom. Bounded by `mutationMaxRows` (10,000), so a linear constant factor.
- likely files/packages: `packages/kitcn/src/orm/insert.ts`,
  `packages/kitcn/src/orm/returning-count.ts`,
  `packages/kitcn/src/orm/query.ts`, `packages/kitcn/src/orm/mutation-utils.ts`
- browser surface: none (server-side ORM read path)
- root-cause layer: ORM mutation write path

Timed checkpoint:
- requested duration: N/A — no duration requested
- semantics: N/A
- initial confidence score: N/A
- improvement loop: N/A
- final score / loop closure: N/A

Completion threshold:
- Read-count regression tests assert the exact integer drop for both paths and
  fail on the pre-fix code.
- Existing ORM mutation/relation-count/RLS suites stay green.
- `packages/kitcn` builds; repo typecheck and lint pass.
- A changeset records the published behavior delta.
- Task closure is legal only when the source-of-truth acceptance criteria are
  satisfied or explicitly narrowed, required verification evidence is recorded,
  code-review and release-artifact gates are closed when applicable, verified
  code changes are committed and PR'd unless explicitly declined or blocked,
  task-style PR body sync is complete or marked N/A with reason,
  GitHub issue/PR sync is complete or marked N/A with reason, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/409-elide-post-image-re-reads.md` passes.

Verification surface:
- `packages/kitcn/src/orm/insert.read-amplification.vitest.ts` (new) and
  `packages/kitcn/src/orm/returning-count.read-amplification.vitest.ts` (new),
  both using the counting-`db` proxy already established by
  `update.read-amplification.vitest.ts`.
- `packages/kitcn/src/orm/returning-count.test.ts` for the gate predicate.
- Existing `convex/orm/**` suites, notably `mutations.test.ts`,
  `relation-count.test.ts`, `rls.test.ts`, `foreign-key-actions.test.ts`.
- `bun --cwd packages/kitcn build`, `bun typecheck`, `bun lint:fix`.
- `.changeset/nervous-plums-drum.md`.

Note: the counting-`db` proxy is used instead of
`countDocumentReads(ctx)` from `convex/setup.testing.ts`, which patches
`ctx.db.get`/`ctx.db.query` in place. The lifecycle writer binds those methods
at wrap time, so on a hooked schema an in-place patch installed after the ORM is
built silently reports 0. The proxy sits under the ORM in every case.

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
- Source of truth: GitHub issue #409.
- Allowed edit scope: `packages/kitcn/src/orm/**`, `.changeset/`, this plan.
- Browser surface: N/A — server-side ORM read path, no rendered output.
- GitHub issue sync: `Fixes #409` in PR #414.
- Non-goals: argument-less `returning()`; asymptotic read-cost redesign; new
  read-counting infrastructure; docs restructuring.

Output budget strategy:
- Targeted `grep -n` with `| head` caps instead of whole-file dumps for
  `query.ts` (8,978 lines). Parallel read-only subagent probes return
  structured findings rather than raw file contents.
- Test runs scoped to single files during iteration; repo-wide gates run once
  at closeout.

Blocked condition:
- Blocked if the derived post-image cannot be made faithful without new
  infrastructure, or if the relation-count loader cannot skip the root fetch
  without changing RLS visibility semantics for the root row.

Task state:
- task_type: bug (performance / read cost)
- task_complexity: non-trivial
- current_phase: closeout
- current_phase_status: in_progress
- next_phase: final response
- goal_status: active

Current verdict:
- verdict: fixed
- confidence: 95-100%
- next owner: task
- reason: both reported paths reproduced by exact integer read counts, fixed at
  the owning boundary, and pinned by tests that are red on the pre-fix tree.

Implementation readiness:
- verdict: ready
- exact owner: `packages/kitcn/src/orm/insert.ts` (post-image derivation) and
  `packages/kitcn/src/orm/query.ts` + `returning-count.ts` (count from a held
  row).
- contradiction status: one found and resolved — the issue's two halves were
  each safe only while the other stayed unshipped (see Findings).
- source-listed cases complete: yes, see the case matrix.

Pre-solution issue challenge:
- reporter claim: `insert().returning(...)` spends one `db.get` per row and
  `returning({ _count })` re-queries each affected row by id.
- suggested diagnosis or fix: derive from `{ ...preparedValue, _id: id }` when
  the projection names no `_creationTime` and `hasLifecycleHooks` is false;
  pass the held row into the count loader "which only needs `row._id`".
- repro ladder:
  - tests / source-level repro: measured with a counting `db` proxy —
    `insert(3 rows).returning({ id, name })` = 3 gets, `returning({ name })` on
    a single insert = 1, `onConflictDoUpdate().returning()` = 1,
    `update().returning({ _count })` = control + 1, same for `delete()`,
    `insert().returning({ id, _count })` = 2.
  - repo-owned automated browser or integration proof: N/A — server-side ORM.
  - Browser plugin: N/A — no browser-rendered surface.
  - screenshot / visual proof: N/A — no visual output.
- reproduction verdict: valid
- validity verdict: partially valid
- best long-term fix boundary: as filed for `insert.ts`; for the count loader
  the durable owner is `GelRelationalQuery` itself, not `returning-count.ts` —
  the root read, the select-plan assertion and the RLS select filter all live
  inside the query, so the seam has to be there or the semantics drift.
- harsh honest feedback: the issue's claim that "the `_count` loader only needs
  `row._id`" is wrong. `_countRelationForRow` reads every counted edge's
  `sourceFields` off the parent, which is usually but not always `_id`. That
  error is what makes the two halves unsafe to compose naively: an edge keyed on
  `createdAt` resolves to `_creationTime`, which a derived insert post-image can
  never carry, and a missing source value counts zero without raising. The issue
  also omits that the count query applies an RLS select filter to the root row
  and that `_loadRelationCounts` mutates the rows it is handed.
- hard-stop decision: proceed — reproduced at the lowest layer, fixed with the
  extra gate and the extra copy the issue did not account for.

Completion rule:
- Do not call `update_goal(status: complete)` while any required checklist item
  remains unchecked. If an item does not apply, check it and add `N/A: <reason>`.
- Do not call `update_goal(status: complete)` until every completion threshold
  above is satisfied, final handoff evidence is recorded, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/409-elide-post-image-re-reads.md` passes.
- Do not create hook state for this goal. This file plus the active goal are the
  durable state.

Start Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| Timed checkpoint parsed | no | N/A: no duration requested |
| Walkthrough baseline for possible UI change | no | N/A: server-side ORM read path, no UI or rendered output |
| Skill analysis before edits | yes | `task` + `autogoal`; `tdd` skipped (see TDD row), `major-task` not needed (no API redesign) |
| Active goal checked or created | yes | this plan |
| Source of truth read before edits | yes | `gh issue view 409` and the attached issue file |
| Exact per-PR task ownership | yes | This plan owns exactly one PR: #414 |
| GitHub comments and attachments read | yes | `gh issue view 409 --json comments` → `[]` |
| Video transcript evidence required | no | N/A: no video or recording in the source |
| Pre-solution issue challenge required | yes | recorded above; verdict `partially valid` |
| Reproduction verdict before implementation | yes | exact integer read counts measured pre-fix |
| Repro escalation ladder selected | yes | source-level test repro; browser/visual rungs N/A |
| Suggested fix reviewed against durable boundary | yes | issue's `returning-count.ts`-only fix rejected; the seam belongs on `GelRelationalQuery` |
| `docs/solutions` checked for non-trivial existing-code work | yes | no `docs/solutions` directory in this repo |
| TDD decision before behavior change or bug fix | yes | read-count assertions written against measured pre-fix integers and proved red via `git stash` |
| Branch decision for code-changing task | yes | dedicated branch, renamed `issue-409` -> `fix/orm-elide-post-image-re-reads` before the first push per user branch-naming preference |
| Release artifact decision | yes | `.changeset/nervous-plums-drum.md` (patch) |
| Browser tool decision for browser surface | no | N/A: no browser surface |
| Commit / PR expectation decision | yes | Commit, push and PR all completed. The user's standing no-PR preference was lifted by an explicit later request. |
| Task-style PR body decision | yes | PR #270 emoji format used |
| Task-plan PR body evidence | yes | Body line `🧭 Task plan: docs/plans/409-elide-post-image-re-reads.md`; plan present at PR head; names PR #414 |
| GitHub issue sync expectation decision | yes | `Fixes #409` in the PR body |
| Output budget strategy recorded | yes | recorded above |
| Package/API pack selected | yes | package-api |
| Public surface or package boundary identified | yes | no export added to `kitcn/orm`; the new count seam is a `static` on `GelRelationalQuery`, so it never lands on the instance type users hold |
| Convex entry/import graph impact identified | yes | `insert.ts` gains `write-fanout` (already in the graph via `mutation-utils`) and `returning-count` gains a type-only `extractRelationsConfig` import plus two constants from `timestamp-mode`; no new runtime module edges |
| CLI/scaffold/generated impact identified | no | N/A: no CLI, scaffold or generated output touched |
| Release artifact path selected | yes | `.changeset` |
| `changeset` skill loaded when `.changeset` is required | yes | `.agents/rules/changeset.mdc` read and followed |
| Package build / fixture impact decision recorded | yes | `bun --cwd packages/kitcn build` run; fixtures N/A (no `init -t` template or scaffold source changed) |

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
| Named verification threshold | yes | Run the command, proof, source audit, or artifact check named in this plan | Both new read-amplification suites green (12 tests); proved red on the pre-fix tree via `git stash push -- packages/kitcn/src` |
| Exact per-PR task ownership | yes | Record the exact PR and dedicated plan, or the not-yet-created single-PR slice | This plan owns exactly one PR: #414 |
| Pre-solution issue challenge verdict | yes | Record reporter claim, suggested fix, repro verdict, validity verdict, durable boundary, and hard-stop/pivot decision before implementation | Recorded above; verdict `partially valid`, pivoted the count fix to `GelRelationalQuery` |
| Repro escalation ladder | yes | For bug/behavior claims, record test/source-level, automated browser/integration, Browser, and screenshot/visual-proof outcomes or N/A/blocker reasons before `not reproduced` | Source-level test repro sufficed; browser/visual rungs N/A |
| Bug reproduced before fix | yes | Record failing test/repro or N/A with reason | Pre-fix read counts: 3/1/1/2 and control+1; see case matrix |
| Targeted behavior verification | yes | Run focused test/proof for changed behavior or record N/A | `bunx vitest run --project integration convex/orm packages/kitcn/src/orm` -> 47 files, 589 passed |
| TypeScript or typed config changed | yes | Run relevant typecheck | `bun typecheck` -> 5/5 tasks successful, exit 0 |
| Package exports or file layout changed | yes | Run the relevant package build before final verification and keep generated updates | `bun --cwd packages/kitcn build` -> 71 files, build complete |
| Package manifests, lockfile, or install graph changed | no | Run `bun install` and relevant package checks | N/A: no manifest or lockfile change |
| Agent rules or skills changed | no | Run `bun install` and verify generated skill sync | N/A: no `.agents/**` change |
| Workspace authority proof | yes | Run verification in the owning repo/package/app/route/tool and record cwd; do not count the wrong workspace as proof | All commands run from repo root `/Users/mikey/conductor/workspaces/kitcn/semarang-v2`, which owns both the package source and its tests |
| Browser surface changed | no | Capture Browser Use proof or record explicit waiver/blocker | N/A: server-side ORM read path |
| Browser final proof | no | Attach screenshot or exact browser verification caveat when browser proof applies | N/A: no browser surface |
| UI walkthrough | no | If UI or rendered output changed, run `.agents/skills/walkthrough/SKILL.md` after final proof and show annotated images in the final handoff; otherwise record N/A | N/A: no UI or rendered output changed |
| Scaffold or fixture output changed | no | Run `bun run fixtures:sync` and `bun run fixtures:check`, or record N/A | N/A: no `init -t` template or scaffold source touched |
| Package behavior or public API changed | yes | Add a changeset or record why no changeset applies | `.changeset/nervous-plums-drum.md` (patch) |
| Docs and kitcn skill sync changed | no | Keep `www/**` and `packages/kitcn/skills/kitcn/**` in sync, or record N/A | N/A: returned values are byte-identical; only read cost changed, and no doc states a read cost |
| Docs or content changed | no | For docs-heavy work, use `--template docs`; for incidental docs, verify source-backed claims, links, examples, and rendered output or record N/A | N/A: no docs touched |
| High-risk mini gate | yes | For public API/runtime/package-boundary/browser/agent-action/command-contract changes, record realistic failure mode, proof plan, and why the chosen boundary is right; otherwise N/A | See Open risks |
| Agent-native review for agent/tooling changes | no | For `.agents/**`, `.claude/**`, `.codex/**`, skills, hooks, commands, prompts, or user-action tooling, load `.agents/skills/agent-native-reviewer/SKILL.md` and close accepted/actionable findings, or record N/A | N/A: no agent/tooling surface touched |
| Local install corruption suspected | yes | Run `bun install` once, rerun the exact failing command, or record N/A | 6 vitest files failed on `kitcn/server` resolution; root cause was unbuilt `packages/kitcn/dist`, fixed by the required package build, not a reinstall |
| Commit created | yes | For verified code-changing work, stage the entire current checkout per repo policy and create a commit; N/A only for no local patch, explicit user decline, analytical/blocked/inconclusive work, or recorded external blocker | Committed on branch `fix/orm-elide-post-image-re-reads` |
| PR create or update | yes | For verified code-changing work, run `check`, push, create or update the PR, and sync PR body to the task-style final handoff; N/A only for no local patch, explicit user decline, analytical/blocked/inconclusive work, or recorded external blocker | `bun check` exit 0; branch renamed to `fix/orm-elide-post-image-re-reads` before push; PR #414 opened |
| Task-style PR body verified | yes | Verify the PR body with `gh pr view --json body`; it must preserve auto-release blocks when applicable, must not include a current-PR self-link, and must use the PR #270 emoji format: `🐛 Fixes ...`, `🟢 95-100% confidence`, `Phase / 🧪 Tests / 🌐 Browser` table, and bold emoji Outcome/Caveat/Design/Verified sections | `gh pr view 414 --json body` confirms auto-release block, `🐛 Fixes #409`, plan line, `🟢 95-100% confidence`, the exact table header, all four bold emoji sections, and no self-link |
| PR task evidence verified | yes | Verify body plan line, plan at PR head, and exact PR ownership | Body names `docs/plans/409-elide-post-image-re-reads.md`; that file is at the PR head and names PR #414 |
| PR proof image hosting | no | If PR body needs browser proof, replace local image paths with hosted GitHub URLs or record N/A | N/A: no browser proof in the body |
| GitHub issue sync-back | yes | Post concise issue sync after PR exists, or record N/A/blocker | PR #414 body carries `Fixes #409`, which closes and links the issue on merge |
| Final handoff contract | yes | Fill the final handoff fields below with exact PR/issue/confidence/tests/browser/outcome/caveats/design/verification content or N/A reason | Filled below |
| Final lint | yes | Run `bun lint:fix` or scoped equivalent | `bun lint:fix` -> 942 files checked, no fixes applied |
| Output budget discipline | yes | Verify no unbounded high-volume command output was streamed, or record the accidental output and recovery | Greps capped with `| head`; full-suite logs written to /tmp and grepped rather than streamed |
| Timed checkpoint | no | If duration was requested, keep improving until elapsed, then finish the current loop cleanly; otherwise N/A | N/A: no duration requested |
| Autoreview for non-trivial implementation changes | yes | Load `.agents/skills/autoreview/SKILL.md`; use dirty local `--mode local`, branch/PR `--mode branch --base <base>`, or committed slice `--mode commit --commit <ref>` until no accepted/actionable findings, or record N/A for docs-only/trivial/no local patch | PENDING_AUTOREVIEW |
| Goal plan complete | yes | Run `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/409-elide-post-image-re-reads.md` | see check output below |
| Public API / package boundary proof | yes | Source-audit public API, exports, and package boundary impact | No new export from `kitcn/orm`; the count seam is a `static` member, so it never appears on the `GelRelationalQuery` instance type returned by the public query builders |
| Convex bundle/import proof | yes | Audit affected function-entry static graphs or record N/A | No new runtime module edges: `write-fanout` already reached `insert.ts` transitively via `mutation-utils`; the `EdgeMetadata` import is type-only |
| CLI/scaffold/generated proof | no | Prove command contract and regenerate owned output or record N/A | N/A: no CLI, scaffold or generated output touched |
| Release artifact classification | yes | Record whether the change is published package behavior/API/types/config/runtime or no published user-visible delta | Published runtime behavior change (read cost); returned values unchanged |
| Published package changeset | yes | If published package users see a delta, load `changeset` and add/update one `.changeset/*.md` per package | `.changeset/nervous-plums-drum.md`, kitcn patch |
| No release artifact | no | If no artifact is needed, record the exact reason: internal-only, docs-only, agent-only, test-only, or no user-visible delta from `main` | N/A: a changeset was added |
| Package typecheck/build/test | yes | Run owning package checks or record N/A with reason | `bun --cwd packages/kitcn typecheck` and `build` both clean |
| Fixture/scaffold generation | no | Run `bun run fixtures:sync` and `bun run fixtures:check` when scaffold output changed, otherwise N/A | N/A: no scaffold output changed |
| Docs/package skill sync | no | Synchronize current-state public guidance or record N/A | N/A: no public guidance changed |

Phase / pass table:
| Phase | Status | Evidence | Next |
|-------|--------|----------|------|
| Intake and source read | done | `gh issue view 409`, attached issue file, plan created | implementation |
| Investigation | done | 4 parallel source probes + 3 adversarial refutation lenses; composition hole found | implementation |
| Implementation | done | `insert.ts`, `query.ts`, `returning-count.ts`, `mutation-utils.ts`, `update.ts` | verification |
| Verification | done | 12 new tests green and proved red pre-fix; 589 ORM tests green; typecheck, build, lint clean | closeout |
| Commit / PR / GitHub sync | done | `bun check` exit 0; pushed `fix/orm-elide-post-image-re-reads`; PR #414 opened with `Fixes #409` | final response |
| Closeout | done | autoreview run; plan completed | final response |

Findings:
- The issue's two halves are each safe only while the other stays unshipped.
  The insert half is fine with `_count` "because the count loader re-reads the
  row"; the count half is fine "because insert hands it a freshly read
  document". Ship both and neither premise holds: the derived post-image goes
  straight into the count engine.
- The count engine does not only need `row._id`. `_getRelationCountParentKey`
  (`query.ts`) and both `_countRelationForRow` branches read every counted
  edge's `sourceFields` off the parent, and a missing value returns 0 without
  raising. `defineRelations` exposes `createdAt` as a relation source, which
  resolves to `_creationTime` — precisely the one field a derived insert
  post-image can never carry.
- `_loadRelationCounts` mutates the rows it is handed (`row._count ??= {}`).
  `delete()` passes its live document straight on to the cascade and the
  soft/hard delete, so counting against the caller's object would have stamped
  `_count` onto a row headed for a write.
- `execute()`'s primary-id fast path also runs the root row through
  `_applyRlsSelectFilter`, which insert/update/delete never do themselves. Any
  replacement seam has to keep that filter or RLS visibility silently changes.
- The RLS delta is not a data-leak risk: `ensureCountAllowedForRls` throws for
  any RLS-enabled count target, so counted child tables are always ones the
  caller can already read freely.
- `GelRelationalQuery` is not re-exported from `kitcn/orm`, but it is the
  declared return type of the public query builders, so a new *instance* method
  would land in user autocomplete. A `static` member does not.
- `convex/setup.testing.ts`'s `countDocumentReads` patches `ctx.db` in place,
  and the lifecycle writer binds `get`/`query` at wrap time — so on a hooked
  schema an in-place patch installed after the ORM is built reports 0.

Decisions and tradeoffs:
- Gate the insert fast path on four terms, not the two the issue proposed:
  projection form, no lifecycle hooks, no selected column resolving to
  `_creationTime`, and — when `_count` is selected — no edge on the table keyed
  on `_creationTime`. The fourth term is what makes the two halves safe to
  compose.
- Ask the fourth question of every edge leaving the table rather than only the
  counted ones. The count selection varies per statement, the schema does not,
  and the conservative answer costs one read on a schema shape that is already
  pathological.
- Put the count seam on `GelRelationalQuery` as a private method plus a
  `static` accessor, not on `returning-count.ts`. The root read, the
  select-plan assertion and the RLS select filter all live inside the query;
  reimplementing them outside would drift. `static` keeps it off the instance
  type users hold.
- Keep constructing one `GelRelationalQuery` per row in the count loader even
  though it now issues no read. The instance carries `_rlsPolicyResolution`,
  which the class documents as unsafe to outlive one execution because a
  resolved policy can embed state the next row's write invalidates.
- Include the `onConflictDoUpdate()` post-image read. It is the same bug class
  in the same method, `existing` is a full stored document (so argument-less
  `returning()` works there too), and nothing between the conflict probe and
  the patch writes. Its gate is simpler than `update()`'s because `insert()`
  runs no cascades.
- Dedupe `update()`'s inline `derivePostImage` closure into shared
  `unsetFieldsOf` / `stripUnsetFields` helpers rather than writing a second
  copy for the conflict path. The hoisted `unsetFields` computation that keeps
  `update()`'s loop cheap is preserved.
- Match `update()`'s existing shallow derivation exactly rather than deep-
  stripping nested `undefined` or deep-cloning. Convex drops nested `undefined`
  on write and a derived row keeps it, and a projected object column is the
  caller's own reference — but both are already true of the shipped `update()`
  derivation, so diverging here would be worse than the gap. See Open risks.
- Use the counting-`db` proxy from `update.read-amplification.vitest.ts`
  instead of `countDocumentReads`, which cannot see through the lifecycle
  writer on a hooked schema.

Implementation notes:
- `packages/kitcn/src/orm/insert.ts`: hoists `tableName` out of the values
  loop, computes `canDerivePostImage` once per statement, derives
  `{ ...preparedValue, _id: id }` for the plain path, and derives
  `{ ...existing, ...writeSet }` minus unset keys for `onConflictDoUpdate`.
- `packages/kitcn/src/orm/query.ts`: adds private
  `_countRelationsForHeldRow` plus the `static countRelationsForHeldRow` seam.
- `packages/kitcn/src/orm/returning-count.ts`: `load()` now calls the seam
  instead of `execute()`, and the file gains the
  `countedEdgesReadCreationTime` predicate.
- `packages/kitcn/src/orm/mutation-utils.ts`: adds
  `returningSelectionReadsCreationTime`, `unsetFieldsOf`, `stripUnsetFields`.
- `packages/kitcn/src/orm/update.ts`: switched to the shared helpers; behavior
  unchanged.

Review fixes:
- Autoreview pass 1 was clean but flagged three sub-P0 residuals. Two were
  verified as non-issues by reading the code: nested `undefined` date fields
  reach `hydrateTemporalReadValue` as `undefined` on both the derived and the
  read path, and `filterSelectRows` (`rls/evaluator.ts:399-428`) pushes the
  rows it was given rather than copies, so the seam's carrier is the object
  `_count` lands on.
- The third was real and fixed: the count seam evaluates a user-authored RLS
  select policy against the row, and a policy expression can name any column
  including `createdAt`. Edge source fields are inspectable, a policy is not,
  so `_count` on an RLS-enabled table now keeps the read. Pinned by
  "keeps its read so the select policy sees a whole row", proved non-vacuous by
  stubbing the gate term to `true` (`expected +0 to be 1`).
- Autoreview pass 2 on the amended diff: clean, exit 0. Its remaining residual
  (row-reference preservation through `_applyRlsSelectFilter`) is now asserted
  directly rather than left to inspection: the RLS test checks
  `_count === { revisions: 2 }`.

Error attempts:
| Error / failed attempt | Count | Next different move | Resolution |
|------------------------|-------|---------------------|------------|
| None yet | 0 | | |

Verification evidence:
All commands run from `/Users/mikey/conductor/workspaces/kitcn/semarang-v2`.
- `bunx vitest run --project integration packages/kitcn/src/orm/insert.read-amplification.vitest.ts` -> 8 passed.
- `bunx vitest run --project integration packages/kitcn/src/orm/returning-count.read-amplification.vitest.ts` -> 4 passed.
- `bun test packages/kitcn/src/orm/returning-count.test.ts` -> 5 passed.
- Red-before-green: with `git stash push -- packages/kitcn/src` applied, the
  same two suites report 3 and 4 failures respectively, every one an exact
  integer read count (`expected 3 to be +0`, `expected 1 to be +0`,
  `expected 2 to be +0`, `expected 2 to be 1`).
- `bunx vitest run --project integration convex/orm packages/kitcn/src/orm`
  -> 47 files, 589 passed, 13 skipped.
- `bun --cwd packages/kitcn build` -> 71 files, build complete.
- `bun typecheck` -> 5/5 tasks successful, exit 0.
- `bun lint:fix` -> 942 files checked, no fixes applied.
- `bun run test` (`test:bun`) -> 1302 passed, 3 failed. All three reproduce
  with the diff stashed: `package intent metadata` and
  `@kitcn/resend packaging` are `npm pack` subprocess timeouts, and
  `packages/kitcn/src/react` fails 1 with the diff and 2 without it.
- `bunx vitest run` (full) -> 853-856 passed, 9-12 failed across two runs with
  a *different* failing set each time. 11 of 12 are `Test timed out in
  5000ms/15000ms` and the twelfth is a wall-clock assertion in
  `ratelimit.vitest.ts`. Every failing file passes when re-run scoped:
  `count.test.ts` + `example-invite-member-reads` + `example-tag-merge-reads` +
  `ratelimit.vitest.ts` -> 85 passed; `btree.vitest.ts` -> 18 passed;
  `--project solid` -> 141 passed. Machine load, not the diff.

Source-listed case matrix:
| Case | Source claim | Harness | Before | Expected after | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `insert().returning({ id, name })`, 3 rows | 1 `db.get` per inserted row | `insert.read-amplification.vitest.ts` "a projected returning() reads nothing back" | 3 gets | 0 gets | pre-fix `expected 3 to be +0` | fixed |
| `insert().returning({ name, region })`, column absent from `values()` | not in source; derived-row fidelity | same file, "a column left out of values() projects as undefined" | 1 get | 0 gets, `{ name, region: undefined }` | pre-fix `expected 1 to be +0` | fixed |
| projected `returning()` value fidelity | not in source | same file, "matches a fresh read of the stored row" | equal | equal | green both before and after | held |
| argument-less `returning()` | must keep its read for `_creationTime` | same file, "argument-less returning() keeps its read" | 3 gets | 3 gets, `createdAt` a real number | green both before and after | held |
| projection naming `createdAt` | source says leave it alone | same file, "a projection naming createdAt keeps its read" | 3 gets | 3 gets | green both before and after | held |
| lifecycle-hooked table | `create.before` can rewrite the payload | same file, "reflects a payload rewritten by create.before" | 2 gets, hooked values | 2 gets, hooked values | green both before and after | held |
| `onConflictDoUpdate().returning()` | not in source; same bug class | same file, "the conflict post-image matches a fresh read" | 1 get | 0 gets, identical row | pre-fix `expected 1 to be +0` | fixed |
| `onConflictDoUpdate()` + `unsetToken` | not in source | same file, "an unset column is absent" | key absent | key absent | green both before and after | held |
| `update().returning({ _count })` | N extra reads for N rows | `returning-count.read-amplification.vitest.ts` "update() does not re-read" | control+1 gets | control gets, `_count.posts === 2` | pre-fix `expected 1 to be +0` | fixed |
| `delete().returning({ _count })` | must stay pre-cascade | same file, "counts children before the row and its children are gone" | control+1 gets | control gets, `_count.posts === 3` | pre-fix `expected 1 to be +0` | fixed |
| `insert().returning({ id, _count })` over a `handle`-keyed edge | composition of both halves | same file, "counts from the derived post-image" | 2 gets | 0 gets, `_count.posts === 3` | pre-fix `expected 2 to be +0` | fixed |
| `insert().returning({ id, _count })` over a `createdAt`-keyed edge | not in source; found by refutation | same file, "keeps its read because the derived post-image has no _creationTime" | 2 gets | 1 get (gate holds) | pre-fix `expected 2 to be 1` | fixed |
| `insert().returning({ id, _count })` on an RLS table | not in source; found by autoreview | same file, "keeps its read so the select policy sees a whole row" | 2 gets | 1 get (gate holds), `_count.revisions === 2` | gate stubbed to `true` -> `expected +0 to be 1` | fixed |
| `countedEdgesReadCreationTime` predicate | not in source | `returning-count.test.ts` (3 cases) | n/a | true only for `_creationTime`/`createdAt` source fields on the named table | 5 pass | new |

Final handoff contract:
- Commit line: `6f6f9627` (+ plan sync) on branch `fix/orm-elide-post-image-re-reads`, pushed
- PR line: https://github.com/udecode/kitcn/pull/414
- Issue line: #409, closed by PR #414 via `Fixes #409`
- Confidence line: 95-100%
- Flow table:
  - Reproduced: tests red on the pre-fix tree with exact integer read counts, browser N/A
  - Verified: 12 new tests green, 589 ORM tests green, typecheck/build/lint clean, browser N/A
- Browser check: N/A - server-side ORM read path, no rendered output
- Outcome: `insert().returning({ ... })`, `insert().onConflictDoUpdate().returning()`
  and `returning({ _count })` on insert/update/delete no longer re-read rows the
  writer is already holding. Returned values are byte-identical; only the read
  count changes.
- Caveat: argument-less `returning()`, tables with triggers/`aggregateIndex`/
  `rankIndex`, projections naming `createdAt`, and `_count` over an edge keyed
  on `createdAt` all deliberately keep their read.
- Design:
  - Chosen boundary: derivation where the payload is written (`insert.ts`), and
    a count seam inside `GelRelationalQuery`, which owns the RLS select filter
    and the select-plan assertion the old re-read went through.
  - Why not quick patch: passing the held row into `returning-count.ts` as the
    issue proposed would have dropped the RLS filter and stamped `_count` onto
    a live document headed for a write, and its gate would have missed
    `_creationTime`-keyed counted edges entirely.
  - Why not broader change: nested-`undefined` stripping and object-reference
    aliasing are pre-existing properties of `update()`'s shipped derivation;
    changing them here would split insert and update semantics.
- Verified: see Verification evidence
- PR body verified: `gh pr view 414 --json body` - PR #270 emoji format with auto-release block, task plan line, and no self-link

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
- Commit: `6f6f9627` (+ plan sync) on `fix/orm-elide-post-image-re-reads`, pushed
- PR: #414 https://github.com/udecode/kitcn/pull/414
- Issue: #409 referenced by `Fixes #409` in PR #414
- Browser proof: N/A
- Caveats: see Open risks

Timeline:
- 2026-08-21T19:24:07.938Z Task goal plan created.

Reboot status:
| Question | Answer |
|----------|--------|
| Where am I? | Closeout |
| Where am I going? | Implementation, verification, commit/PR/GitHub sync, closeout |
| What is the goal? | Stop the ORM write path re-reading rows the writer already holds |
| What have I learned? | See Findings |
| What have I done? | See Timeline |

Open risks:
- High-risk note (runtime behavior, published package). Realistic failure mode:
  a derived post-image diverges from the stored document and a projection
  returns a stale or missing value. Proof plan: value-fidelity tests compare
  the projected row against a fresh `db.get` on both the plain and conflict
  paths, and the three divergence sources (`_creationTime`, lifecycle hooks,
  `_creationTime`-keyed counted edges) each have a dedicated test that pins the
  read *staying*. Why this boundary is right: the derivation lives where the
  payload is written, and the count seam lives inside the query that owns the
  RLS and plan semantics — no caller has to know anything new.
- Pre-existing and unchanged: a projected object-typed column is returned by
  reference from the caller's `values()` / `set()` object, and nested
  `undefined` keys inside it survive where a real read would have dropped them.
  This is already the shipped behavior of `update().returning()`'s derivation;
  insert now matches it. Fixing it belongs to both paths at once, not here.
- `returning({ _count })` on an RLS-enabled table whose select policy hides a
  row it just wrote now returns real counts instead of `{}`. Not a leak
  (`ensureCountAllowedForRls` refuses to count RLS-enabled targets), and it
  removes an incoherence — the same statement already returned that row's
  columns. No test pinned the old `{}` behavior in either direction.

Hard closeout guard:
- A local-only final response for verified code-changing work is invalid unless
  this plan records an explicit user decline, no local patch, analytical/
  blocked/inconclusive outcome, or a real commit/PR blocker.
