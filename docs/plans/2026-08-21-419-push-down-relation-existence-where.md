# 419 push down relation-existence where

Objective:
Push the child predicate into the read plan for relation-existence `where`, so an existence test stops at the first matching child instead of draining the whole per-parent `defaultLimit` window.

Goal plan:
docs/plans/2026-08-21-419-push-down-relation-existence-where.md

Template:
docs/plans/templates/task.md

Primary template:
docs/plans/templates/task.md

Applied packs:
- package-api (docs/plans/templates/packs/package-api.md)

Task source:
- type: GitHub issue (local attachment)
- id / link: #419 — https://github.com/udecode/kitcn/issues/419
  (.context/attachments/github-5218230814/[GITHUB]-419.md)
- title: ORM: relation-existence `where` loads the whole per-parent child window
  instead of stopping at the first match
- acceptance criteria:
  - `where: { posts: { type: 'wanted' } }` costs the same reads as the
    hand-written `with: { posts: { where: …, limit: 1 } }` when the match sorts
    first (issue table: 62 -> 2).
  - Results stay identical; no relation-filter semantics change.
  - Multi-occurrence relation keys (OR/AND/NOT branches) are not pushed down,
    because `_mergeWithConfig` collapses them into one load.
  - The truncated filter-load must never escape onto a returned row.
- caveats: 7 named constraints in the issue (merge collapse, both-or-neither,
  error contract, chunk clamp, truncated-list leak, RLS feedback loop, depth
  accounting).
- likely files: `packages/kitcn/src/orm/query.ts`, `convex/orm/*.test.ts`
- browser surface: none (server-side ORM read planner)
- root-cause layer: ORM query lowering (`_buildFilterWithConfig`)

Timed checkpoint:
- requested duration: N/A — no duration requested
- semantics: N/A
- initial confidence score: N/A
- improvement loop: N/A
- final score / loop closure: N/A

Completion threshold:
- `convex/orm/relation-filter-pushdown.test.ts` proves the match-sorts-first
  existence `where` reads <= 2 documents (was 62) and that the truncated
  filter-load never reaches the returned row.
- The full `vitest run` ORM suite plus `bun typecheck`, `bun lint`,
  `bun --cwd packages/kitcn build` stay green.
- A `.changeset` records the published read-cost/behavior delta.
- Task closure is legal only when the source-of-truth acceptance criteria are
  satisfied or explicitly narrowed, required verification evidence is recorded,
  code-review and release-artifact gates are closed when applicable, verified
  code changes are committed and PR'd unless explicitly declined or blocked,
  task-style PR body sync is complete or marked N/A with reason,
  GitHub issue/PR sync is complete or marked N/A with reason, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-08-21-419-push-down-relation-existence-where.md` passes.

Verification surface:
- `npx vitest run convex/orm --project integration` (cwd: repo root)
- `npx vitest run --project integration` (full integration suite)
- `bun typecheck`, `bun lint`, `bun --cwd packages/kitcn build`
- Source audit of the 7 issue constraints (workflow `orm-419-constraint-audit`)
- Browser proof: N/A — server-side read planner, no rendered output.

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
- Source of truth: issue #419 attachment + `packages/kitcn/src/orm/query.ts`.
- Allowed edit scope: `packages/kitcn/src/orm/query.ts`, `convex/orm/*.test.ts`,
  `.changeset/`, this plan.
- Browser surface: N/A.
- GitHub issue sync: N/A — user preference forbids GitHub writes this run.
- Non-goals: rewriting the relation loader, changing `with` semantics, changing
  `one`-relation lowering, or touching the aggregate `_count` path.

Output budget strategy:
- Reads of `query.ts` (9016 lines) are windowed by line range, never whole-file.
- Broad greps are piped through `head`.
- Deep constraint analysis is delegated to a background Workflow so its
  file-dump output stays out of this context.

Blocked condition:
- A proven-unsound filter shape with no sound eligibility predicate, or an
  unavoidable regression in an existing ORM test that cannot be explained as an
  intended behavior change.

Task state:
- task_type: bug (read-cost regression)
- task_complexity: non-trivial
- current_phase: closeout
- current_phase_status: done
- next_phase: final response
- goal_status: complete

Current verdict:
- verdict: fixed
- confidence: 95-100%
- next owner: reviewer of PR #427
- reason: 62 -> 2 reads reproduced and closed; 740 integration + 1316 bun tests
  green; typecheck, lint, package build green; every new read-count test proven
  red on pristine source and every semantics guard proven red under mutation.

Implementation readiness:
- verdict: ready
- exact owner: `_buildFilterWithConfig` lowering + `_loadManyRelation` read plan
  in `packages/kitcn/src/orm/query.ts`
- contradiction status: one — the issue's suggested fix (`{ where, limit: 1 }`)
  is incomplete; see Findings. Resolved by also emitting the existing `with`
  lowering and by keeping the scan window.
- source-listed cases complete: yes (case matrix below)

Pre-solution issue challenge:
- reporter claim: a relation-existence `where` lowers to a `with` entry carrying
  no `where` and no `limit`, so it reads the whole per-parent child window
  (62 reads) where the hand-written form reads 2.
- suggested diagnosis or fix: emit `{ where: <child filter>, limit: 1 }` for a
  `many` relation whose key occurs exactly once; leave `one` at `true`; skip
  pushdown when the key is also in `requestedWith`.
- repro ladder:
  - tests / source-level repro: `convex/orm/relation-filter-pushdown.test.ts`
    reproduced `expected 62 to be less than or equal to 2` on `3bbc6bb3`.
  - repo-owned automated browser or integration proof: N/A — the vitest
    integration lane is the owning surface.
  - Browser plugin: N/A — server-side read planner, no rendered output.
  - screenshot / visual proof: N/A — same reason.
- reproduction verdict: valid — reproduced at exactly the reported numbers.
- validity verdict: valid (diagnosis), partially valid (suggested fix).
- best long-term fix boundary: the lowering owns *what* may stop early; the
  relation loader owns *how far* it may read. Splitting it that way keeps
  `_evaluateRelationsFilter` and the public `with` type untouched.
- harsh honest feedback: the issue's own suggested patch is unsound. Dropping
  the `{ with: nested }` emission in favour of `{ where, limit: 1 }` makes the
  bounded filter load strip the child's own relation keys, and the outer
  `_evaluateRelationsFilter` then re-reads them and drops every parent. It also
  reads `limit: 1` as free: without a scan cap the load walks past
  `defaultLimit`, which changes results and unbounds the read.
- hard-stop decision: proceed — reproduced, valid, and the durable boundary is
  clear.

Completion rule:
- Do not call `update_goal(status: complete)` while any required checklist item
  remains unchecked. If an item does not apply, check it and add `N/A: <reason>`.
- Do not call `update_goal(status: complete)` until every completion threshold
  above is satisfied, final handoff evidence is recorded, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-08-21-419-push-down-relation-existence-where.md` passes.
- Do not create hook state for this goal. This file plus the active goal are the
  durable state.

Start Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| Timed checkpoint parsed | no | N/A: no duration requested |
| Walkthrough baseline for possible UI change | no | N/A: server-side ORM read planner, no UI or rendered output |
| Skill analysis before edits | yes | task + autogoal (task template, package-api pack); no niche skill owned this route |
| Active goal checked or created | yes | this plan |
| Source of truth read before edits | yes | .context/attachments/github-5218230814/[GITHUB]-419.md read in full first |
| Exact per-PR task ownership | yes | This plan owns exactly one PR: #427 |
| GitHub comments and attachments read | yes | issue supplied as a local attachment; no separate comments available |
| Video transcript evidence required | no | N/A: no video evidence |
| Pre-solution issue challenge required | yes | recorded above; verdict partially valid |
| Reproduction verdict before implementation | yes | 62 reads reproduced before the first source edit |
| Repro escalation ladder selected | yes | source-level vitest repro; browser/visual N/A |
| Suggested fix reviewed against durable boundary | yes | issue's fix found unsound; pivoted, see Findings |
| `docs/solutions` checked for non-trivial existing-code work | yes | grepped; no relation-filter entry |
| TDD decision before behavior change or bug fix | yes | red repro test written before the source change |
| Branch decision for code-changing task | yes | renamed the placeholder `issue-419` to `fix/orm-relation-existence-read-bound` before the first push |
| Release artifact decision | yes | .changeset/wild-bottles-judge.md (patch) |
| Browser tool decision for browser surface | no | N/A: no browser surface |
| Commit / PR expectation decision | yes | User explicitly requested the PR; commit, push and PR completed |
| Task-style PR body decision | yes | PR #270 emoji task-style body used |
| Task-plan PR body evidence | yes | Body carries `🧭 Task plan: docs/plans/2026-08-21-419-push-down-relation-existence-where.md`; plan is at the PR head and names PR #427 |
| GitHub issue sync expectation decision | yes | `Fixes #419` in the PR body is the sync |
| Output budget strategy recorded | yes | windowed reads, piped greps, audit delegated to a background workflow |
| Package/API pack selected | yes | package-api |
| Public surface or package boundary identified | yes | none changed; the bound rides a module-private Symbol |
| Convex entry/import graph impact identified | yes | no new imports in query.ts |
| CLI/scaffold/generated impact identified | no | N/A: no CLI, scaffold or generated output touched |
| Release artifact path selected | yes | .changeset |
| `changeset` skill loaded when `.changeset` is required | yes | .agents/rules/changeset.mdc read before writing |
| Package build / fixture impact decision recorded | yes | bun --cwd packages/kitcn build run; fixtures N/A (no template change) |

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
| Named verification threshold | yes | Run the command, proof, source audit, or artifact check named in this plan | 12/12 in relation-filter-pushdown.test.ts; 740 integration; 1316 bun |
| Exact per-PR task ownership | yes | Record the exact PR and dedicated plan, or the not-yet-created single-PR slice | PR #427, this plan |
| Pre-solution issue challenge verdict | yes | Record reporter claim, suggested fix, repro verdict, validity verdict, durable boundary, and hard-stop/pivot decision before implementation | recorded: valid diagnosis, partially valid fix, pivoted |
| Repro escalation ladder | yes | For bug/behavior claims, record test/source-level, automated browser/integration, Browser, and screenshot/visual-proof outcomes or N/A/blocker reasons before `not reproduced` | source-level repro sufficient; browser/visual N/A |
| Bug reproduced before fix | yes | Record failing test/repro or N/A with reason | expected 62 to be less than or equal to 2 on pristine source |
| Targeted behavior verification | yes | Run focused test/proof for changed behavior or record N/A | 12 focused tests, each proven non-vacuous |
| TypeScript or typed config changed | yes | Run relevant typecheck | bun typecheck 5/5 successful |
| Package exports or file layout changed | no | Run the relevant package build before final verification and keep generated updates | N/A: no export or layout change; package build still run and green |
| Package manifests, lockfile, or install graph changed | no | Run `bun install` and relevant package checks | N/A: none touched |
| Agent rules or skills changed | no | Run `bun install` and verify generated skill sync | N/A: none touched |
| Workspace authority proof | yes | Run verification in the owning repo/package/app/route/tool and record cwd; do not count the wrong workspace as proof | all commands run from the repo root, which owns query.ts and convex/orm |
| Browser surface changed | no | Capture Browser Use proof or record explicit waiver/blocker | N/A: no browser surface |
| Browser final proof | no | Attach screenshot or exact browser verification caveat when browser proof applies | N/A: no browser surface |
| UI walkthrough | no | If UI or rendered output changed, run `.agents/skills/walkthrough/SKILL.md` after final proof and show annotated images in the final handoff; otherwise record N/A | N/A: no UI or rendered output changed |
| Scaffold or fixture output changed | no | Run `bun run fixtures:sync` and `bun run fixtures:check`, or record N/A | N/A: no init -t template or scaffold source touched |
| Package behavior or public API changed | yes | Add a changeset or record why no changeset applies | .changeset/wild-bottles-judge.md |
| Docs and kitcn skill sync changed | no | Keep `www/**` and `packages/kitcn/skills/kitcn/**` in sync, or record N/A | N/A: no public guidance changed; docs make no read-cost claim |
| Docs or content changed | no | For docs-heavy work, use `--template docs`; for incidental docs, verify source-backed claims, links, examples, and rendered output or record N/A | N/A: no docs edited |
| High-risk mini gate | yes | For public API/runtime/package-boundary/browser/agent-action/command-contract changes, record realistic failure mode, proof plan, and why the chosen boundary is right; otherwise N/A | see High-risk note below |
| Agent-native review for agent/tooling changes | no | For `.agents/**`, `.claude/**`, `.codex/**`, skills, hooks, commands, prompts, or user-action tooling, load `.agents/skills/agent-native-reviewer/SKILL.md` and close accepted/actionable findings, or record N/A | N/A: no .agents/.claude/.codex/skill/hook/command change |
| Local install corruption suspected | no | Run `bun install` once, rerun the exact failing command, or record N/A | N/A: no install-shaped failure |
| Commit created | yes | For verified code-changing work, stage the entire current checkout per repo policy and create a commit; N/A only for no local patch, explicit user decline, analytical/blocked/inconclusive work, or recorded external blocker | `git add -A` then `0f91b428` |
| PR create or update | yes | For verified code-changing work, run `check`, push, create or update the PR, and sync PR body to the task-style final handoff; N/A only for no local patch, explicit user decline, analytical/blocked/inconclusive work, or recorded external blocker | `bun check` exit 0, pushed, PR #427 |
| Task-style PR body verified | no | Verify the PR body with `gh pr view --json body`; it must preserve auto-release blocks when applicable, must not include a current-PR self-link, and must use the PR #270 emoji format: `🐛 Fixes ...`, `🟢 95-100% confidence`, `Phase / 🧪 Tests / 🌐 Browser` table, and bold emoji Outcome/Caveat/Design/Verified sections | N/A: no PR |
| PR task evidence verified | no | Verify body plan line, plan at PR head, and exact PR ownership | N/A: no PR |
| PR proof image hosting | no | If PR body needs browser proof, replace local image paths with hosted GitHub URLs or record N/A | N/A: no browser proof in the body |
| GitHub issue sync-back | yes | Post concise issue sync after PR exists, or record N/A/blocker | `Fixes #419` links the PR to the issue |
| Final handoff contract | yes | Fill the final handoff fields below with exact PR/issue/confidence/tests/browser/outcome/caveats/design/verification content or N/A reason | filled above |
| Final lint | yes | Run `bun lint:fix` or scoped equivalent | bun lint:fix then bun lint clean |
| Output budget discipline | yes | Verify no unbounded high-volume command output was streamed, or record the accidental output and recovery | no unbounded output streamed; audit ran in a background workflow |
| Timed checkpoint | no | If duration was requested, keep improving until elapsed, then finish the current loop cleanly; otherwise N/A | N/A: no duration requested |
| Autoreview for non-trivial implementation changes | yes | Load `.agents/skills/autoreview/SKILL.md`; use dirty local `--mode local`, branch/PR `--mode branch --base <base>`, or committed slice `--mode commit --commit <ref>` until no accepted/actionable findings, or record N/A for docs-only/trivial/no local patch | `--mode local --engine claude`: 3 P0 findings, all fixed; rerun clean |
| Goal plan complete | yes | Run `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-08-21-419-push-down-relation-existence-where.md` | check-complete.mjs run at closeout |
| Public API / package boundary proof | yes | Source-audit public API, exports, and package boundary impact | no public type or export changed; bound carried on a module-private Symbol |
| Convex bundle/import proof | no | Audit affected function-entry static graphs or record N/A | N/A: no import added to query.ts |
| CLI/scaffold/generated proof | no | Prove command contract and regenerate owned output or record N/A | N/A: nothing generated changed |
| Release artifact classification | yes | Record whether the change is published package behavior/API/types/config/runtime or no published user-visible delta | published package runtime read-cost delta -> patch changeset |
| Published package changeset | yes | If published package users see a delta, load `changeset` and add/update one `.changeset/*.md` per package | .changeset/wild-bottles-judge.md |
| No release artifact | no | If no artifact is needed, record the exact reason: internal-only, docs-only, agent-only, test-only, or no user-visible delta from `main` | N/A: a changeset was added |
| Package typecheck/build/test | yes | Run owning package checks or record N/A with reason | bun typecheck, bun --cwd packages/kitcn build, bun test all green |
| Fixture/scaffold generation | no | Run `bun run fixtures:sync` and `bun run fixtures:check` when scaffold output changed, otherwise N/A | N/A: no scaffold output changed |
| Docs/package skill sync | no | Synchronize current-state public guidance or record N/A | N/A: no public guidance changed |

Phase / pass table:
| Phase | Status | Evidence | Next |
|-------|--------|----------|------|
| Intake and source read | done | issue attachment + `query.ts` read; constraint audit workflow | implementation |
| Implementation | done | `packages/kitcn/src/orm/query.ts` (+152/-19) | verification |
| Verification | done | see Verification evidence | closeout |
| Commit / PR / GitHub sync | done | commit `0f91b428`, branch `fix/orm-relation-existence-read-bound`, PR #427 | final response |
| Closeout | done | autoreview + plan gates | final response |

Findings:
- Reproduced on `3bbc6bb3` at the issue's exact numbers: 62 reads for
  `where: { posts: { type: 'wanted' } }`, 2 for the hand-written
  `with: { posts: { where, limit: 1 } }`.
- The issue's suggested fix is unsound for a nested child filter. Emitting
  `{ where: F, limit: 1 }` *instead of* `{ with: nested }` means
  `_loadManyRelation` runs `_applyRelationsFilterToRows` with
  `requestedWith === undefined`, `_stripFilterRelations` deletes the child's own
  relation keys, and the outer `_evaluateRelationsFilter` then sees `undefined`
  where it expects an array and drops every parent. Pinned by
  `a nested relation-existence where still evaluates the child predicate`;
  proven non-vacuous by disabling the `with` emission (test goes red).
- The issue treats `limit: 1` as pure cost. It is not: the streaming loop breaks
  only on surviving rows, so without a scan cap the load walks the parent's whole
  child range and finds matches past `defaultLimit` that the previous
  `take(defaultLimit)` never saw. That changes results and removes the read
  bound. Pinned by `the existence probe never looks past the default-limit
  window`; proven non-vacuous by removing the cap (result flips 0 -> 1 row).
- Constraint 3 (error contract) does not change after all. Keeping the limit
  resolution untouched and carrying the bound on a symbol means
  `Relation "X.y" requires limit, allowFullScan: true, ...` still fires exactly
  where it did.
- Constraint 7 (depth accounting) does not change. Old lowering spends a level in
  `_loadRelations`; new lowering spends it in `_applyRelationsFilterToRows` at
  `depth + 1`. Both reach `depth >= maxDepth` at the same nesting level;
  `convex/orm/relation-depth.test.ts` is green.
- Constraint 4 (chunk clamp collapsing to 1) is inherited, not introduced: a
  caller writing `with: { rel: { where, limit: 1 } }` already gets chunk 1. Left
  as is, so the lowered form and the hand-written form cost the same.
- Pre-existing, unrelated: `findMany({ where: { NOT: ... } })` does not typecheck
  in the object filter form — overload resolution falls through to
  `KeyPageConfig` and reports `Property 'pageByKey' is missing`. Reproduces
  identically on pristine `3bbc6bb3` for `NOT: { status: 'a' }`, so it is not
  caused by this change. `.withIndex(...).findMany(...)` is the working form and
  is what the NOT test uses. Not fixed here — out of scope for #419.

Decisions and tradeoffs:
- Carry the bound on a module-private `Symbol`, not a config field. The lowered
  object is handed to the same relation loader that serves a caller's `with`, so
  a string key would be a new public surface a caller could set.
- Emit `where` + the existing `with` lowering together, not `where` alone. `with`
  is what keeps the loaded child readable for the outer predicate re-run. Cost is
  one extra bounded read per surviving parent.
- Keep the scan window (`probeScanLimit`) so the change is cost-only. Rejected
  the alternative of letting the probe scan past `defaultLimit`: it reads better
  on paper but silently changes which parents match and unbounds the read.
- Skip the cap when an ambient filter (target RLS, or the relation's own `where`)
  was already streaming the whole partition — there is no narrower window to
  preserve, and capping there would newly hide matches.
- Eligibility is "relation key occurs exactly once at this table level",
  counting boolean occurrences. `_mergeWithConfig` collapses branches into one
  load per key, and its record/record branch merges only `.with`, so a second
  occurrence would silently inherit the first's bound.
- `one` relations stay `true`: a single row has nothing to stop early at.
- Did not fix the pre-existing `NOT` overload-resolution gap. Real bug, wrong
  task.

Implementation notes:
- `packages/kitcn/src/orm/query.ts` only.
- `RELATION_EXISTENCE_PROBE` symbol marks a filter-only relation config.
- `_collectSingleOccurrenceRelations` counts relation keys across OR/AND/NOT at
  one table level, without descending into relation values.
- `_buildFilterWithConfig` keeps its signature and delegates to
  `_buildFilterWithConfigForLevel`, which threads the eligible set through the
  logical-operator recursion.
- `_loadManyRelation` splits target filtering into `applyAmbientTargetFilters`
  (RLS + the relation's own `where`) and `applyConfigTargetFilter`, derives
  `probeFetchLimit` (1), `probeScanLimit` (the window, counted in ambient
  survivors) and `canBoundPerParentRead`, and applies them to the `take` path,
  the streaming path and `_readBoundedThroughLinks`.
- `_readBoundedThroughLinks` takes the two filter stages plus an optional
  `scanLimit`, and tracks per-cursor ambient-surviving links against it.
- `NO_PROBE_RELATIONS` lowers an ineligible key's whole subtree without probes,
  because `_mergeWithConfig` folds sibling branches' nested configs together.

High-risk note (public API / runtime / package boundary):
- Realistic failure mode: the lowered relation config is fed to the same loader
  that serves a caller's `with`. If the existence bound were reachable from user
  input, a caller could silently truncate their own relation page to one row.
- Proof plan: the bound is a module-private `Symbol` that is never exported and
  never written by any path other than `_buildFilterWithConfigForLevel`; a caller
  cannot spell it. `relation-existence where still returns the full requested
  relation` pins that a requested `with` is unaffected.
- Why this boundary is right: the alternative — reading the bound off a string
  field — would add a public `with` option with no meaning to callers, and
  threading it through `_loadRelations` as a parameter would push filter-only
  semantics into a signature that six other call paths share.

Review fixes:
- Autoreview (`--mode local --engine claude`) rejected the first cut with three
  P0 findings. All three were verified against source and were real:
  1. **Ambient-filter window.** `probeScanLimit` was skipped when the target
     table has RLS or the relation carries its own `where`, on the false premise
     that such a load already drained the partition. It does not: the pre-patch
     stream breaks at `visibleTargets.length >= fetchLimit`, so it decided from
     the first `defaultLimit` *ambient-surviving* children. Fixed by splitting
     `applyPostFetchTargetFilters` into an ambient stage and a config stage and
     capping on ambient survivors, which collapses to the raw-row cap when no
     ambient filter exists. One rule now covers both.
  2. **Through-relation window.** The probe replaced
     `_readBoundedThroughLinks`' `fetchLimit` with 1 and passed no window, so the
     helper walked junction links until a full match. Fixed with a `scanLimit`
     parameter plus a per-cursor ambient-surviving-link counter.
  3. **Nested probes under a repeated key.** Eligibility was computed per
     relation value, but `_mergeWithConfig` folds sibling branches' nested
     configs together, so `OR: [{ posts: { comments: { text: 'a' } } },
     { posts: { comments: { text: 'b' } } }]` bounded the shared `comments` load
     by branch A's predicate and branch B then evaluated against it. Fixed by
     lowering an ineligible key's whole subtree with `NO_PROBE_RELATIONS`.
- Six tests added for these, each proven red by mutating its fix back out.
- Autoreview rerun after the fixes: `autoreview clean: no accepted/actionable
  findings reported` / `overall: patch is correct (0.72)`.

Error attempts:
| Error / failed attempt | Count | Next different move | Resolution |
|------------------------|-------|---------------------|------------|
| First cut widened the decision window on the ambient, through and repeated-key paths | 1 | Split ambient from config filtering, bound on ambient survivors, disable probes under a repeated key | Fixed; six mutation-proven tests added |
| `findMany({ where: { NOT: ... } })` does not typecheck | 1 | Confirmed pre-existing on pristine `3bbc6bb3`; used `.withIndex(...)` in the test | Out of scope, recorded in Findings |
| `bun test` reported 1 fail on one run, collecting 1314 of 1316 tests | 1 | Reran; clean at 1316 on three other runs | Load flake, not the diff |

Verification evidence:
- cwd for every command below: `/Users/mikey/conductor/workspaces/kitcn/sun-valley-v1`.
- `npx vitest run convex/orm/relation-filter-pushdown.test.ts --project integration`
  -> 12 passed.
- Same file against pristine `packages/kitcn/src/orm/query.ts` (`git stash`)
  -> 4 failed, 8 passed. The four read-count tests are the reproduction.
- Mutation checks, each restoring the source afterwards:
  - `with: nested` emission disabled -> `a nested relation-existence where still
    evaluates the child predicate` fails.
  - exactly-once gate widened to `count >= 1` -> `a relation key used by two
    branches keeps the unbounded load` fails.
  - `probeScanLimit` forced to `undefined` -> `the existence probe never looks
    past the default-limit window` fails with
    `expected [ { name: 'Windowed' } ] to have a length of +0 but got 1`.
- `npx vitest run --project integration` -> 66 files, 746 passed, 13 skipped,
  no type errors (after the autoreview fixes; 740 before the six added tests).
- Mutation checks for the autoreview fixes, each restoring the source afterwards:
  - nested lowering forced back to always collecting eligibility -> `a repeated
    relation key disables the bound for its whole subtree` fails.
  - `probeScanLimit` re-gated on `!hasAmbientTargetFilter` -> `a
    relation-filtered probe never looks past its own default-limit window` fails.
  - `scanLimit` dropped from the `_readBoundedThroughLinks` call -> `a
    through-relation probe never looks past the default-limit window` fails.
- `bun test` -> 1316 pass, 0 fail across 148 files (4 runs; one run reported
  `1313 pass / 1 fail` while collecting only 1314 tests, i.e. a file that did not
  finish under load, and the runs before and after it were clean at 1316).
- `bun typecheck` -> 5/5 tasks successful.
- `bun lint` -> clean (`bun lint:fix` reformatted one continuation line).
- `bun --cwd packages/kitcn build` -> `Build complete`, 71 files.
- `bun check` -> `EXIT=0` (full gate: `check:ci` + `test:verify` + `test:runtime`).
  A first attempt failed inside `test:verify` with
  `401 Unauthorized: BadAdminKey` against `http://127.0.0.1:3210` -- a parallel
  Conductor workspace's local Convex backend answering on the shared port, not
  this diff. `lsof` showed 3210/3211 free afterwards and the rerun was clean.
- `bun run fixtures:check` ran as part of `bun check:ci` and passed, though no
  `init -t` template or scaffold source changed.
- Not run: `test:e2e` / `test:auth` (auth lane untouched), Browser proof (no
  rendered output).

Source-listed case matrix:
| Case | Source claim | Harness | Before | Expected after | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Match sorts first | 62 reads | `relation-existence where stops at the first matching child` | 62 | <= 2 | red on pristine, green after | fixed |
| Hand-written floor | 2 reads | `hand-written with: { where, limit: 1 } is the read floor` | 2 | <= 2 | green both sides | parity held |
| Match sorts last | 62 reads, still found | `a match that sorts last is still found` | 1 row | 1 row | green both sides | unchanged |
| Boolean existence | root cause cites the `true` branch | `boolean relation existence reads one child` | 62 | <= 2 | red on pristine | fixed |
| Existence under NOT | constraint: `.some` semantics | `NOT over a relation existence filter reads one child` | 63 | <= 4 | red on pristine | fixed |
| Through relation | issue: `_readBoundedThroughLinks` gets the same | `a through-relation existence where stops at the first matching link` | 51 | <= 4 | red on pristine | fixed |
| Nested child filter | issue: "nested levels recurse and get the same treatment" | `a nested relation-existence where still evaluates the child predicate` | 1 row | 1 row | red under mutation | guarded |
| Through match not first | issue: through gets the same treatment | `a through-relation match beyond the first link is still found` | 1 row | 1 row | green both sides | guarded |
| Ambient-filter window (autoreview) | n/a — found in review | `a relation-filtered probe never looks past its own default-limit window` (+ inside-window twin) | 0 rows | 0 rows, <= 5 reads | red under mutation | guarded |
| Through window (autoreview) | n/a — found in review | `a through-relation probe never looks past the default-limit window` (+ inside-window twin) | 0 rows | 0 rows, <= 7 reads | red under mutation | guarded |
| Nested key under a repeated parent (autoreview) | n/a — found in review | `a repeated relation key disables the bound for its whole subtree` | 1 row | 1 row | red under mutation | guarded |
| Constraint 1 merge collapse | only exactly-once keys are eligible | `a relation key used by two branches keeps the unbounded load` | 1 row | 1 row | red under mutation | guarded |
| Constraint 5 truncated-list leak | must not survive on the row | `drops the filter-loaded children` + `still returns the full requested relation` | absent / 61 | absent / 61 | green both sides | guarded |
| Read window (not in issue) | n/a — found during audit | `the existence probe never looks past the default-limit window` (+ inside-window twin) | 0 rows | 0 rows, <= 4 reads | red under mutation | guarded |

Final handoff contract:
- Commit line: `0f91b428 fix(orm): stop relation-existence where at the first
  matching child` on `fix/orm-relation-existence-read-bound`.
- PR line: https://github.com/udecode/kitcn/pull/427
- Issue line: #419 — closed by the PR's `Fixes #419` line; no separate comment
  posted.
- Confidence line: 95-100%
- Flow table:
  - Reproduced: tests 62 -> expected <= 2 (red), browser N/A
  - Verified: tests 740 integration + 1316 bun green, browser N/A
- Browser check: N/A — server-side ORM read planner, no rendered output.
- Outcome: a relation-existence `where` stops at the first matching child.
- Caveat: a relation named by more than one branch of the same `where` keeps the
  previous unbounded load, by design.
- Design:
  - Chosen boundary: the lowering decides *what* may stop early; the relation
    loader decides *how far* it may read.
  - Why not quick patch: the issue's `{ where, limit: 1 }` breaks nested filters
    and silently widens the read window.
  - Why not broader change: `_evaluateRelationsFilter`, the public `with` type
    and the relation-limit error contract are all untouched.
- Verified: see Verification evidence.
- PR body verified: `gh pr view 427 --json body` — PR #270 emoji task-style
  format, plan line present, no self-link.

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
- Commit: `0f91b428`.
- PR: https://github.com/udecode/kitcn/pull/427
- Issue: #419, linked from the PR body.
- Browser proof: N/A — no rendered output.
- Caveats: multi-branch relation keys keep the previous load; the pre-existing
  `NOT` overload-resolution typing gap is untouched.

Timeline:
- 2026-08-21T21:21:27.214Z Task goal plan created.
- Reproduced #419 at 62 reads on pristine `3bbc6bb3`.
- Ran a 10-agent constraint audit over the issue's 7 named constraints; it
  surfaced the nested-strip hazard the issue's suggested fix misses.
- Implemented the existence probe in `packages/kitcn/src/orm/query.ts`.
- Added `convex/orm/relation-filter-pushdown.test.ts` and proved every test
  non-vacuous by mutation or by running against pristine source.
- Autoreview rejected the first cut with three real P0 window defects; fixed all
  three, added six more mutation-proven tests, reran every lane.
- Full verification lanes green; changeset written.
- User requested a PR, superseding the earlier no-PR preference. Renamed the
  placeholder branch, ran `bun check` to exit 0, committed `0f91b428`, pushed,
  and opened PR #427.

Reboot status:
| Question | Answer |
|----------|--------|
| Where am I? | Closeout |
| Where am I going? | Implementation, verification, commit/PR/GitHub sync, closeout |
| What is the goal? | Push relation-existence `where` into the read plan so it stops at the first matching child |
| What have I learned? | See Findings |
| What have I done? | Reproduced 62 reads, pushed the predicate into the read plan, kept the window, proved every guard |

Open risks:
- With `limit: 1` the stream chunk clamps to 1, so a nested child filter is
  evaluated one child at a time while scanning. Read counts are unchanged; the
  round trips serialize. This is the same tradeoff a hand-written
  `with: { rel: { where, limit: 1 } }` already makes.
- On the through path the probe buffers one junction link per round instead of a
  whole window, so a parent that has to walk its full window to prove a miss now
  does so in more sequential rounds. Reads stay bounded by the same window.

Hard closeout guard:
- A local-only final response for verified code-changing work is invalid unless
  this plan records an explicit user decline, no local patch, analytical/
  blocked/inconclusive outcome, or a real commit/PR blocker.
