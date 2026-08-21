# Bound migration status reads and make status endpoints queries

Objective:
Bound ORM migration status reads and stop status endpoints taking write slots; done when status() reads are index-bounded and both status endpoints are internal queries with green checks; plan docs/plans/408-bound-migration-status-reads.md.

Flow mode:
one-shot execution

Goal plan:
docs/plans/408-bound-migration-status-reads.md

Template:
docs/plans/templates/task.md

Primary template:
docs/plans/templates/task.md

Applied packs:
- package-api (docs/plans/templates/packs/package-api.md)
- docs (docs/plans/templates/packs/docs.md)

Owned PR:
- https://github.com/udecode/kitcn/pull/421 (`fix/bounded-migration-status-queries` -> `main`)

Task source:
- type: GitHub issue (attached as `.context/attachments/github-5217405227/[GITHUB]-408.md`, refetched via `gh issue view 408`)
- id / link: #408 — https://github.com/udecode/kitcn/issues/408
- title: ORM: `migrationStatus()` collects the entire `migration_run` history for a point lookup, and both status endpoints are mutations
- task type: bug (performance + contract), non-heavyweight, non-trivial
- acceptance criteria:
  1. `migrationStatus()` no longer performs an unbounded `.collect()` of `migration_run`; the listing is index-bounded to `limit`.
  2. The `runId` branch resolves through the existing indexed `getRunById`.
  3. The `activeRun` branch resolves through the existing indexed `getActiveRun`.
  4. `aggregateBackfillStatus` and `migrationStatus` are registered as internal
     **queries**, not internal mutations, end-to-end (orm api, codegen registry,
     generated output, CLI callers, docs).
- caveats: issue notes (3) is a contract change that "may warrant its own PR". Repo policy is closed alpha, hard-cut breaking changes preferred, so both land together.
- likely files/packages: `packages/kitcn/src/orm/migrations/{runtime,schema}.ts`, `packages/kitcn/src/orm/create-orm.ts`, `packages/kitcn/src/cli/codegen.ts`, generated mirrors under `convex/`, `example/convex/`, `fixtures/**`, docs under `www/` + `packages/kitcn/skills/kitcn/**`.
- browser surface: none (server/CLI only).
- root-cause layer: ORM runtime data access + procedure kind registration.
- comments/attachments: `gh issue view 408 --json comments` → `[]` (no comments).

Timed checkpoint:
- requested duration: N/A: no duration requested by the user.
- semantics: N/A: no duration requested.
- initial confidence score: N/A: concrete verification surface exists (tests + typecheck + build + fixtures), so no scorecard proxy is needed.
- improvement loop: N/A: no duration requested.
- final score / loop closure: N/A: no duration requested.

Completion threshold:
- Source audit: `rg "getAllRunRows" packages/kitcn/src` returns no unbounded
  full-table collect on `migration_run`; `status()` reads at most `limit` run
  rows plus at most 1 indexed active-run row.
- Source audit: `rg "migrationStatus|aggregateBackfillStatus" packages/kitcn/src`
  shows `type: 'query'` in the codegen registry and query builders in
  `create-orm.ts`; no remaining `"mutation"` for these two names in
  non-CHANGELOG source or generated output.
- Regression test: a focused test proves the bounded read (run-row document
  reads do not scale with total run history) and fails against the old code.
- Commands green: `bun --cwd packages/kitcn build`, `bun typecheck`,
  `bun run test`, `bun lint:fix`, `bun run fixtures:sync` + `fixtures:check`.
- Task closure is legal only when the source-of-truth acceptance criteria are
  satisfied or explicitly narrowed, required verification evidence is recorded,
  code-review and release-artifact gates are closed when applicable, verified
  code changes are committed and PR'd unless explicitly declined or blocked,
  task-style PR body sync is complete or marked N/A with reason,
  GitHub issue/PR sync is complete or marked N/A with reason, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/408-bound-migration-status-reads.md` passes.

Verification surface:
- Focused regression test for bounded `migration_run` reads (owning workspace:
  repo root `convex/orm/**` or `packages/kitcn/src/orm/**`, decided after the
  surface map returns).
- `bun --cwd packages/kitcn build` (package artifact proof).
- `bun typecheck` (root, source-first).
- `bun run test` (default suite: codegen/procedure-caller/migrate/cli tests that
  assert procedure kind).
- `bun run fixtures:sync` + `bun run fixtures:check` (generated scaffold output).
- `bun lint:fix`.
- Source audit via `rg` for residual `"mutation"` kind on the two status names.
- `.changeset/*.md` release artifact for the published package delta.

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
- Source of truth: GitHub issue #408 + the repo source it cites.
- Allowed edit scope: `packages/kitcn/src/orm/**`, `packages/kitcn/src/cli/**`,
  `packages/kitcn/src/server/**` (only if procedure-kind dispatch requires it),
  their tests, repo-root `convex/**` tests, `.changeset/`, `docs/plans/`,
  `www/content/docs/**` + mirrored `packages/kitcn/skills/kitcn/**`, and
  regenerated output under `convex/generated/**`, `example/convex/**`,
  `fixtures/**` (regenerated by command, never hand-edited).
- Browser surface: N/A: server-side ORM + CLI only, no rendered output.
- GitHub issue sync: PR #421 body carries `🐛 Fixes #408`, which links and closes
  the issue on merge. No separate issue comment was requested.
- Non-goals: rewriting the migration runner, changing `migration_state` reads
  (bounded by authored migration count), adding backward-compat shims for the
  old mutation contract (repo policy is hard cut).

Output budget strategy:
- Broad discovery was delegated to a background Workflow whose agents return
  structured JSON findings rather than streaming file dumps into this context.
- `rg`/`grep` in this thread is scoped with `--include` filters and piped
  through `head`, and excludes `node_modules` and `dist`.
- Generated mirrors (`fixtures/**`, `example/convex/functions/generated/**`,
  `convex/generated/**`) are regenerated by command and verified by counts, not
  read in full.
- Full-file reads are limited to the handful of owning source files
  (`runtime.ts`, `schema.ts`, `create-orm.ts`, `codegen.ts`, `backfill.ts`).

Blocked condition:
- Convex/`convex-test` cannot express an index-bounded descending scan on
  `migration_run` without a schema capability the ORM does not have, and adding
  it would require a public ORM index-DSL change beyond this task's boundary.
- Or: flipping the procedure kind breaks a CLI/runtime caller that has no
  in-repo fix (e.g. `convex run` cannot invoke internal queries), making the
  contract change impossible without upstream change.

Task state:
- task_type: bug (performance + public contract)
- task_complexity: non-trivial, non-heavyweight
- current_phase: verification
- current_phase_status: in_progress
- next_phase: closeout
- goal_status: active

Current verdict:
- verdict: valid, fixed at the ORM ownership boundary
- confidence: 95-100% on the server/package claim (red-then-green focused tests,
  full repo suite, typecheck, lint, concave smoke, fixture sync + check, clean
  autoreview); 80-94% on the `example` `/migrations` page, which has typecheck
  and lint proof but no render.
- next owner: reviewers on PR #421
- reason: both reported defects reproduced at source level, fixed at the owning
  boundary, and every repo gate is green

Implementation readiness:
- verdict: ready
- exact owner: `packages/kitcn/src/orm/migrations/runtime.ts` (read shape) +
  `packages/kitcn/src/orm/create-orm.ts` and `packages/kitcn/src/cli/codegen.ts`
  (procedure kind)
- contradiction status: none. Source, tests, and the checked-in
  `migrationDemo.ts` comment all agreed the status path was a mutation doing a
  full-table read.
- source-listed cases complete: yes, see the case matrix below

Pre-solution issue challenge:
- reporter claim: (1) `migrationStatus()` collects the whole `migration_run`
  table for a bounded listing and re-derives the active run in JS even though
  indexed lookups exist; (2) both status endpoints are mutations, so polling
  takes an OCC write slot on the tables it measures.
- suggested diagnosis or fix: add `by_started_at` + `.order('desc').take(limit)`;
  route `runId` through `getRunById` and `activeRun` through `getActiveRun`;
  convert both endpoints to queries; possibly split (3) into its own PR.
- repro ladder:
  - tests / source-level repro: yes — `runtime.vitest.ts` seeded 40 run rows and
    `countDocumentReads` recorded 30-40 document reads for a `limit: 3` call
    (`expected 30 to be less than or equal to 2`).
  - repo-owned automated browser or integration proof: N/A: no browser surface
    in the reported behavior.
  - Browser plugin: N/A: server/CLI path.
  - screenshot / visual proof: N/A: no rendered output in the reported defect.
- reproduction verdict: valid
- validity verdict: valid, with an incomplete suggested fix
- best long-term fix boundary: the ORM migration runtime owns the read shape and
  `create-orm` + `codegen` jointly own the procedure kind. Fixing callers instead
  would have left the unbounded read in the package.
- harsh honest feedback: the issue's fix list is incomplete in two ways it does
  not acknowledge. `.take(limit)` does not bound anything while `limit` is an
  unclamped caller argument and the repo's own example passes `200`. And part
  (3) is described as a small registration change when `createOrm` has no query
  builder at all — it needs a new public config option plus both codegen
  emitters, or scaffolded apps silently drop the app's Convex builder. The
  issue's "may warrant its own PR" split is also wrong here: shipping (3) first
  would turn an unbounded read into a live subscription that re-runs that
  unbounded read on every chunk write.
- hard-stop decision: proceed — the claim reproduced at the lowest honest layer.

Completion rule:
- Do not call `update_goal(status: complete)` while any required checklist item
  remains unchecked. If an item does not apply, check it and add `N/A: <reason>`.
- Do not call `update_goal(status: complete)` until every completion threshold
  above is satisfied, final handoff evidence is recorded, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/408-bound-migration-status-reads.md` passes.
- Do not create hook state for this goal. This file plus the active goal are the
  durable state.

Start Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| Timed checkpoint parsed | no | N/A: no duration in the request |
| Walkthrough baseline for possible UI change | no | N/A: at intake the scope was package-only. The `example/src/app/migrations/page.tsx` change surfaced later and is unrenderable here (no `example/.env.local`, no Convex deployment), so no baseline could be captured either way. |
| Skill analysis before edits | yes | Loaded `task`, `autogoal`, `changeset` rule. Declined `major-task` (not architecture/benchmark work), `testing` (behavior fix, not a coverage program), `find-skills` (nothing missing). |
| Active goal checked or created | yes | Goal tools (`get_goal`/`create_goal`) are not exposed in this runtime; this plan is the durable state per the degraded-control fallback. |
| Source of truth read before edits | yes | `.context/attachments/github-5217405227/[GITHUB]-408.md` read in full; refetched with `gh issue view 408` |
| Exact per-PR task ownership | yes | This plan owns exactly one PR: #421 |
| GitHub comments and attachments read | yes | `gh issue view 408 --json comments` -> `[]` |
| Video transcript evidence required | no | N/A: no video or screen recording in the source |
| Pre-solution issue challenge required | yes | See `Pre-solution issue challenge` above |
| Reproduction verdict before implementation | yes | Red test run at `runtime.vitest.ts`: 3 failures (`expected 30 to be less than or equal to 2`, read-bound, clamp) before the fix |
| Repro escalation ladder selected | yes | Source-level vitest repro was sufficient; no browser/native layer involved |
| Suggested fix reviewed against durable boundary | yes | Adopted the index + indexed-lookup suggestions; added the `limit` clamp the issue omitted; rejected bounding `getAllStateRows` |
| `docs/solutions` checked for non-trivial existing-code work | yes | `docs/solutions/integration-issues/concave-internal-runtime-calls-20260322.md` found and corrected |
| TDD decision before behavior change or bug fix | yes | Red-first: 11 tests added to `runtime.vitest.ts`, 3 red before the fix, all green after |
| Branch decision for code-changing task | yes | Started on `issue-408`; renamed to `fix/bounded-migration-status-queries` per the user's branch-naming preference before any push, then rebased onto `origin/main` |
| Release artifact decision | yes | `.changeset/olive-pumpkins-shave.md` (minor: breaking procedure-kind + config change) |
| Browser tool decision for browser surface | no | N/A: `example/` has no `.env.local` and no Convex deployment, so the migrations page cannot be rendered here |
| Commit / PR expectation decision | yes | Initially declined under the standing "do not create PR" preference; the user then explicitly requested a PR, so the work was committed, rebased onto `origin/main`, pushed, and opened as #421 |
| Task-style PR body decision | yes | PR #270 emoji task-style body used for #421 |
| Task-plan PR body evidence | yes | Body line `🧭 Task plan: docs/plans/408-bound-migration-status-reads.md`; file present at PR head; plan records `Owned PR: .../pull/421` |
| GitHub issue sync expectation decision | yes | `🐛 Fixes #408` in the PR body is the sync; no separate issue comment requested |
| Output budget strategy recorded | yes | See `Output budget strategy` above |
| Package/API pack selected | yes | `--with package-api`: `createOrm` config, `orm.api()` result types, and two procedure kinds are public surface |
| Public surface or package boundary identified | yes | `CreateOrmConfigBase.internalQuery`, `OrmApiResult.{migrationStatus,aggregateBackfillStatus}`, `MAX_STATUS_RUN_LIMIT` export, `migration_run.by_started_at` index |
| Convex entry/import graph impact identified | yes | `internalQueryGeneric` is added to `create-orm.ts`, which already imports `internalMutationGeneric`/`internalActionGeneric` from `convex/server`; no new module enters any function entry's graph |
| CLI/scaffold/generated impact identified | yes | `codegen.ts` registry + both emitted `createOrm` templates; regenerated root `convex/`, `example/`, and all 8 fixtures |
| Release artifact path selected | yes | `.changeset/olive-pumpkins-shave.md` |
| `changeset` skill loaded when `.changeset` is required | yes | `.agents/rules/changeset.mdc` read; CHANGELOG tone mirrored |
| Package build / fixture impact decision recorded | yes | `bun --cwd packages/kitcn build` + `bun run fixtures:sync` + `fixtures:check` required because scaffold templates changed |
| Docs pack selected | yes | `--with docs`: the new `limit` cap and the query contract are user-facing |
| Docs guidance loaded | yes | `packages/kitcn/skills/kitcn/references/setup/doc-guidelines.md` conventions applied: current-state voice, no changelog language |
| Docs lane selected | yes | Supporting docs only; the deliverable is the package fix |
| Target docs and nearest sibling docs read | yes | `www/content/docs/orm/migrations.mdx`, `www/content/docs/cli/backend.mdx`, `www/content/docs/orm/queries/aggregates.mdx`, and their `packages/kitcn/skills/kitcn/**` mirrors |
| Docs style doctrine read | yes | Current-state reference voice used; no "now a query" / migration-note phrasing in `www/**` |
| Documented source owner identified | yes | `packages/kitcn/src/orm/migrations/runtime.ts` owns the `limit` cap and status contract |

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
      N/A: issue #408 is text-only, no attachments.
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
      User explicitly declined: standing preference "Do not create PR under any
      circumstances, unless user prompts to." Work stays uncommitted in the
      working tree on branch `issue-408`.
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
- [x] Docs pack: docs lane, target docs, nearest sibling docs, and source owner are recorded.
- [x] Docs pack: every named API, import, option, route, component, transform, demo, and preview is source-backed or marked N/A with reason.
- [x] Docs pack: docs use current-state reference voice, not changelog voice.
- [x] Docs pack: links, anchors, and previews target real leaf pages or are marked N/A with reason.

Completion Gates:
| Gate | Applies | Required action | Evidence |
|------|---------|-----------------|----------|
| Named verification threshold | yes | Run the command, proof, source audit, or artifact check named in this plan | All met: `rg getAllRunRows` empty, kind flipped in every regenerated registry, 11 focused tests green, full suite green |
| Exact per-PR task ownership | yes | Record the exact PR and dedicated plan, or the not-yet-created single-PR slice | PR #421, owned solely by this plan |
| Pre-solution issue challenge verdict | yes | Record reporter claim, suggested fix, repro verdict, validity verdict, durable boundary, and hard-stop/pivot decision before implementation | See `Pre-solution issue challenge`: valid, suggested fix incomplete, pivoted to add the clamp and the `internalQuery` seam |
| Repro escalation ladder | yes | For bug/behavior claims, record test/source-level, automated browser/integration, Browser, and screenshot/visual-proof outcomes or N/A/blocker reasons before `not reproduced` | Source-level vitest repro sufficient; browser/native layers N/A for a server read path |
| Bug reproduced before fix | yes | Record failing test/repro or N/A with reason | 3 red tests, incl. `expected 30 to be less than or equal to 2` |
| Targeted behavior verification | yes | Run focused test/proof for changed behavior or record N/A | `npx vitest run packages/kitcn/src/orm/migrations/runtime.vitest.ts --project integration` -> 11 passed |
| TypeScript or typed config changed | yes | Run relevant typecheck | `bun typecheck` -> 5/5 successful |
| Package exports or file layout changed | yes | Run the relevant package build before final verification and keep generated updates | `bun --cwd packages/kitcn build` -> Build complete; `MAX_STATUS_RUN_LIMIT` exported from `kitcn/orm/migrations` |
| Package manifests, lockfile, or install graph changed | no | Run `bun install` and relevant package checks | N/A: no manifest or lockfile change |
| Agent rules or skills changed | yes | Run `bun install` and verify generated skill sync | `bun tooling/sync-kitcn-skill.ts` -> "Synced packages/kitcn/skills/kitcn to .agents/skills/kitcn"; mirror diff matches source |
| Workspace authority proof | yes | Run verification in the owning repo/package/app/route/tool and record cwd; do not count the wrong workspace as proof | All commands run from repo root except example codegen (`cd example`), recorded in Verification evidence |
| Browser surface changed | yes | Capture Browser Use proof or record explicit waiver/blocker | Blocker: `example/` has no `.env.local` and `example/convex/` no `.env`, so no Convex deployment exists to render `/migrations` against |
| Browser final proof | no | Attach screenshot or exact browser verification caveat when browser proof applies | N/A: blocked as above; QA steps recorded in Open risks |
| UI walkthrough | no | If UI or rendered output changed, run `.agents/skills/walkthrough/SKILL.md` after final proof and show annotated images in the final handoff; otherwise record N/A | N/A: the page cannot be rendered without a deployment, so there are no real final-state screenshots to annotate |
| Scaffold or fixture output changed | yes | Run `bun run fixtures:sync` and `bun run fixtures:check`, or record N/A | `fixtures:sync` exit 0, all 8 apps regenerated; `fixtures:check` exit 0 |
| Package behavior or public API changed | yes | Add a changeset or record why no changeset applies | `.changeset/olive-pumpkins-shave.md` (minor) |
| Docs and kitcn skill sync changed | yes | Keep `www/**` and `packages/kitcn/skills/kitcn/**` in sync, or record N/A | `migrations.mdx` <-> `references/features/migrations.md`; `aggregates.mdx` <-> `references/features/aggregates.md`; mirror re-synced |
| Docs or content changed | yes | For docs-heavy work, use `--template docs`; for incidental docs, verify source-backed claims, links, examples, and rendered output or record N/A | Incidental docs; every claim source-backed against `runtime.ts` (`DEFAULT_STATUS_RUN_LIMIT`, `MAX_STATUS_RUN_LIMIT`, `getActiveRun`) |
| High-risk mini gate | yes | For public API/runtime/package-boundary/browser/agent-action/command-contract changes, record realistic failure mode, proof plan, and why the chosen boundary is right; otherwise N/A | See `High-risk note` below |
| Agent-native review for agent/tooling changes | no | For `.agents/**`, `.claude/**`, `.codex/**`, skills, hooks, commands, prompts, or user-action tooling, load `.agents/skills/agent-native-reviewer/SKILL.md` and close accepted/actionable findings, or record N/A | N/A: `.agents/skills/kitcn/**` changed only as the generated mirror of `packages/kitcn/skills/kitcn/**` content edits; no agent behavior, hook, command, or tool contract changed |
| Local install corruption suspected | no | Run `bun install` once, rerun the exact failing command, or record N/A | N/A: the one resolution failure (`Cannot find package 'kitcn/server'`) was a known missing-dist condition, fixed by `bun --cwd packages/kitcn build`, not install rot |
| Commit created | yes | For verified code-changing work, stage the entire current checkout per repo policy and create a commit | Whole checkout staged; commit `fix(orm): bound migration status reads, make status endpoints queries` on `fix/bounded-migration-status-queries`, rebased onto `origin/main` |
| PR create or update | yes | For verified code-changing work, run `check`, push, create or update the PR, and sync PR body to the task-style final handoff | `bun check` -> `EXIT=0`; pushed; https://github.com/udecode/kitcn/pull/421 |
| Task-style PR body verified | yes | Verify the PR body with `gh pr view --json body` | Verified: auto-release block, `🐛 Fixes #408`, `🧭 Task plan:`, `🟢 95-100% confidence`, `\| Phase \| 🧪 Tests \| 🌐 Browser \|` table, bold emoji Outcome/Caveat/Design/Verified, no self-link |
| PR task evidence verified | yes | Verify body plan line, plan at PR head, and exact PR ownership | Body names `docs/plans/408-bound-migration-status-reads.md`; that file is at the PR head and records `Owned PR: .../pull/421` |
| PR proof image hosting | no | If PR body needs browser proof, replace local image paths with hosted GitHub URLs or record N/A | N/A: no browser proof in the body |
| GitHub issue sync-back | no | Post concise issue sync after PR exists, or record N/A/blocker | N/A: PR body already carries `🐛 Fixes #408`, which links and closes the issue; no separate comment requested |
| Final handoff contract | yes | Fill the final handoff fields below with exact PR/issue/confidence/tests/browser/outcome/caveats/design/verification content or N/A reason | See `Final handoff contract` below |
| Final lint | yes | Run `bun lint:fix` or scoped equivalent | `bun lint:fix` -> fixed 5 files; `bun lint` -> 940 files, no fixes applied |
| Output budget discipline | yes | Verify no unbounded high-volume command output was streamed, or record the accidental output and recovery | One oversized read (42.7KB workflow result) was auto-persisted to a tool-results file and inspected by `grep`, not re-streamed |
| Timed checkpoint | no | If duration was requested, keep improving until elapsed, then finish the current loop cleanly; otherwise N/A | N/A: no duration requested |
| Autoreview for non-trivial implementation changes | yes | Load `.agents/skills/autoreview/SKILL.md`; use dirty local `--mode local`, branch/PR `--mode branch --base <base>`, or committed slice `--mode commit --commit <ref>` until no accepted/actionable findings | `.claude/skills/autoreview/scripts/autoreview --mode local --engine claude` (`claude-fable-5`) -> `trufflehog: clean`, `bundle: 220910 bytes; review passes: 1`, **`autoreview clean: no accepted/actionable findings reported`**, `overall: patch is correct (0.85)`, no P0 defects |
| Goal plan complete | yes | Run `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/408-bound-migration-status-reads.md` | `[autogoal] complete: docs/plans/408-bound-migration-status-reads.md` |
| Public API / package boundary proof | yes | Source-audit public API, exports, and package boundary impact | New: `CreateOrmConfigBase.internalQuery` (optional, defaults to `internalQueryGeneric`), `MAX_STATUS_RUN_LIMIT`. Changed: two `OrmApiResult` field types, two procedure kinds, `migration_run` index set. No export removed. |
| Convex bundle/import proof | yes | Audit affected function-entry static graphs or record N/A | `internalQueryGeneric` comes from `convex/server`, already imported by `create-orm.ts` for `internalMutationGeneric`/`internalActionGeneric`; no new module joins any entry graph |
| CLI/scaffold/generated proof | yes | Prove command contract and regenerate owned output or record N/A | CLI contract unchanged (`<backend> run <path> <json>` is kind-agnostic; all 17 `cli.commands.ts` path assertions and the `migrate`/`dev` stubs pass untouched). Regenerated root `convex/`, `example/`, all 8 fixtures. |
| Release artifact classification | yes | Record whether the change is published package behavior/API/types/config/runtime or no published user-visible delta | Published package behavior + API + types + generated scaffold output |
| Published package changeset | yes | If published package users see a delta, load `changeset` and add/update one `.changeset/*.md` per package | `.changeset/olive-pumpkins-shave.md`, `kitcn: minor`, sections Breaking changes / Patches with before-after snippets |
| No release artifact | no | If no artifact is needed, record the exact reason | N/A: a changeset was added |
| Package typecheck/build/test | yes | Run owning package checks or record N/A with reason | `bun --cwd packages/kitcn build`, `bun typecheck`, `bun run test`, `bun run test:cli` all green |
| Fixture/scaffold generation | yes | Run `bun run fixtures:sync` and `bun run fixtures:check` when scaffold output changed, otherwise N/A | `fixtures:sync` exit 0; `fixtures:check` exit 0 |
| Docs/package skill sync | yes | Synchronize current-state public guidance or record N/A | `packages/kitcn/skills/kitcn/references/features/{migrations,aggregates}.md` updated and mirrored to `.agents/skills/kitcn/**` |
| Docs source-backed claim audit | yes | Verify docs claims against current source or record N/A | `25` / `100` match `DEFAULT_STATUS_RUN_LIMIT` / `MAX_STATUS_RUN_LIMIT`; `MAX_STATUS_RUN_LIMIT` import path verified against `packages/kitcn/src/orm/migrations/index.ts` |
| Docs links / routes / previews | no | Verify leaf links, routes, anchors, and preview names or record N/A | N/A: no new links, routes, anchors, or component previews were added |
| Docs MDX/content parser | yes | Run the relevant `www` docs parser/build for MDX/content changes, or record N/A | `bun lint` covers the MDX; no `www` build task exists in `turbo typecheck` scope |
| Kitcn docs sync | yes | If `www/**` changed, update matching `packages/kitcn/skills/kitcn/**` content or record N/A | Done for both migrations and aggregates |

High-risk note:
- Realistic failure mode: the emitted registry kind and the registered Convex
  builder are cross-checked at **runtime**, not compile time
  (`procedure-caller.ts` throws `Procedure type mismatch`). A consumer who
  upgrades `kitcn` without re-running `kitcn codegen` keeps a `"mutation"` tuple
  pointing at a function that is now a query, and every status call throws —
  including the CLI's own deploy/dev wait loop.
- Proof plan: every in-repo generated mirror was regenerated and diffed (root
  `convex/`, `example/`, 8 fixtures); `fixtures:check` re-scaffolds from the
  templates and fails on drift; the changeset is `minor` and documents the
  contract change so the version bump signals it.
- Why this boundary is right: the kind must live in exactly one place per
  consumer, and codegen already owns that emission. Adding a compatibility
  shim (accepting either kind) would defeat the point of the change — the whole
  benefit is that Convex classifies the call as a read.

Phase / pass table:
| Phase | Status | Evidence | Next |
|-------|--------|----------|------|
| Intake and source read | complete | Issue #408 read + refetched; 5-agent surface map + 3 adversarial verifiers over `runtime.ts`, `schema.ts`, `create-orm.ts`, `codegen.ts`, `backfill.ts`, CLI, tests, fixtures, docs | implementation |
| Implementation | complete | Red-first tests; bounded indexed read + clamp; `internalQuery` seam; codegen registry + both emitters; example flip; regenerated root/example/8 fixtures; docs + changeset | verification |
| Verification | complete | 11 focused tests; `bun run test` 1304+860 pass; `test:cli` 124 pass; `test:concave` passed; `bun typecheck` 5/5; `bun lint` clean; `fixtures:sync` exit 0; `fixtures:check` recorded below | closeout |
| Commit / PR / GitHub sync | complete | Rebased onto `origin/main`, `bun check` -> `EXIT=0`, pushed, PR #421 opened with the task-style body | closeout |
| Closeout | complete | Autoreview run, plan closed, `check-complete.mjs` green | final response |

Findings:
- `status()` is genuinely read-only on every path (`runtime.ts:491-544`): two reads
  (`getAllStateRows:501`, `getAllRunRows:502`), then pure JS
  (`toAppliedStateMap`, `detectMigrationDrift`, `buildMigrationPlan`). No
  `insert`/`patch`/`delete`/`scheduler`.
- `migration_run.startedAt` is **write-once**. `run():193-204` is the only insert
  and sets `startedAt: now`. All six patch sites (`:401-410`, `:445-451`,
  `:573-579`, `markRunCompleted:754-763`, `markRunCanceled:771-779`,
  `markRunFailed:802-810`) never touch `startedAt`.
- At most one `migration_run` row can be `status: 'running'`: `run():183-189`
  refuses to insert while `getActiveRun()` returns a row. So the current
  "newest running run" JS scan and the indexed `getActiveRun()` return the same
  document. Routing through `getActiveRun()` additionally makes `status()` agree
  with `cancel():556`, which already targets `getActiveRun()` — today they can
  disagree in a degenerate multi-running state.
- `activeRun` is computed **globally**, independent of the `runId` filter, and
  the CLI depends on that: `backend-core.ts:6310-6316` reads
  `activeRun?.status ?? runs?.[0]?.status`. Keep it global.
- `limit` has no upper clamp (`parseOptionalPositiveInteger:632-643`) and
  `example/convex/functions/migrationDemo.ts:38` already passes `limit: 200`.
  `.take(limit)` alone therefore leaves the unbounded read reachable through the
  args surface — the issue does not mention this.
- `aggregate-index/backfill.ts:938-999` `status` is already read-only and already
  typed `GenericDatabaseReader | GenericDatabaseWriter`. Zero handler change; the
  aggregate half is a pure registration flip.
- `create-orm.ts` has **no query builder at all**: `:124` `internalMutation?` is
  the only builder option and `:337` is the only resolution line.
- `codegen.ts` emitters (`:1241/:1254/:1272` server, `:1310/:1329` aggregate)
  import and forward only `internalMutation` into the emitted `createOrm({...})`.
  Both must also forward `internalQuery`, or scaffolded apps silently fall back
  to raw `internalQueryGeneric` and lose their Convex-bound builder.
- Registry kind is checked at **runtime**, not compile time:
  `procedure-caller.ts:597-602` throws `Procedure type mismatch` if the emitted
  registry tuple and the registered function disagree, and `:681` picks
  `ctx.runQuery` vs `ctx.runMutation` from that tuple. The builder flip and the
  codegen kind flip must land together with every generated mirror regenerated.
- Convex's real builders expose `._handler`, **not** `.handler`
  (`node_modules/convex/dist/cjs/server/impl/registration_impl.js:194-204`). The
  15 test call sites that do `api.aggregateBackfillStatus.handler(...)` pass only
  `internalMutation: passthroughInternalMutation`; without a matching
  `internalQuery` passthrough they break with "not a function".
- CLI is kind-agnostic: `runBackendFunction:5712-5738` shells
  `<backend> run <path> <json>` with no udf-type flag, and `convex run` /
  `@concavejs/cli` infer the kind from `isQuery`/`isMutation`. Zero CLI risk.
- `example/convex/functions/migrationDemo.ts:24-35` carries a checked-in comment
  naming this exact defect and its cost, gated on "until that registration moves
  to the query registry". `example/src/app/migrations/page.tsx:24-35` carries the
  matching client-side comment plus a manual 2s poll (`ACTIVE_RUN_POLL_MS`) and a
  `useState` status cache that exist only because status is a mutation.
- `example/` has no `.env.local` and `example/convex/` has no `.env`, so the
  example app cannot be run against a live Convex deployment in this workspace.
- Pre-existing, out of scope: `runtime.ts:328` calls `getOrCreateStateRow`
  *outside* the `try` opened at `:336`, so a throw there strands a run row at
  `status: 'running'` with no `markRunFailed`, blocking every future `run()`.
- Pre-existing, out of scope: `backfill.ts:942` collects all of `aggregate_state`
  even when `args.tableName`/`args.indexName` narrow the request. Bounded by
  schema (one row per aggregate index), not by history, so it is not the
  grows-forever class this issue is about.

Decisions and tradeoffs:
- Add `index('by_started_at').on(t.startedAt)` (issue's option) rather than
  reusing the implicit `by_creation_time` index -> the ordering contract becomes
  explicit and survives a future mutable `startedAt`; risk: one more index built
  at deploy on a table that holds one row per migration run (negligible). The
  usual argument against (regenerating 8 fixture apps + example `_generated`) is
  moot here because the `codegen.ts` emitter change already forces a full
  `fixtures:sync`.
- Clamp `limit` to a named maximum before `.take(limit)` -> without it the
  headline fix closes while the unbounded read stays reachable via args; risk:
  a caller asking for more than the cap silently receives the cap.
- Land part (1)+(2) and part (3) together instead of splitting per the issue's
  hint -> repo policy is closed alpha with hard-cut breaking changes, and the
  `example/` payoff is only observable once both land; risk: a larger diff.
- Flip `migrationDemo.getStatus` to `authQuery.query` and convert
  `migrations/page.tsx` to a live `useQuery` subscription -> the two checked-in
  comments are falsified by the package change, and `mutationOptions` stops
  existing on a query procedure so the page change is forced, not optional;
  risk: UI change with no runnable browser proof in this workspace.
- Do not touch `getAllStateRows` -> the full `migration_state` list is part of
  the `status()` return contract (`migrations`, `drift`, `pending`); bounding it
  would silently truncate the payload.

Implementation notes:
- `status()` selection is now: `runId` -> `getRunsById` (`by_run_id`, mapped
  `run ? [run] : []`); otherwise `getRecentRuns` (`by_started_at`, `.order('desc')`,
  `.take(limit)`); `activeRun` always `getActiveRun` (`by_status`), never derived
  from the selected set.
- `getAllRunRows` is deleted. `getAllStateRows`, `getRecentRuns`, `getRunsById`,
  `getRunById`, and `getActiveRun` take a `MigrationReadDb` reader union;
  `getOrCreateStateRow` and the `markRun*` helpers stay writer-typed.
- `createOrm` gained `internalQuery?: typeof internalQueryGeneric`, resolved as
  `config.internalQuery ?? internalQueryGeneric` beside the existing mutation
  line. Both codegen templates now import `internalQuery` and forward it; the
  no-ORM server template branch was deliberately left untouched since it never
  calls `createOrm`.
- Regeneration trap worth remembering: the repo root has no `kitcn` dependency,
  so `bunx kitcn codegen` silently downloads the published CLI and regenerates
  against the old registry. Use `bun packages/kitcn/dist/cli.mjs codegen`. Also
  do not use `--scope orm` at the root: it deletes `convex/shared/api.ts` and
  `convex/generated/auth.ts` because scoped generation does not own them.

Review fixes:
Findings from three independent adversarial verifiers run against the surface
map before and during implementation.

- `startedAt` tie-break inverts: `.collect()` + stable JS sort resolves ties
  oldest-created-first, while `withIndex(...).order('desc')` applies the desc
  multiplier to `_creationTime` too and resolves newest-created-first. Ties are
  reachable because `startedAt` is `Date.now()` and a run can complete inline in
  one transaction. -> **accepted** -> kept the new behavior (newest-first is the
  correct reading of a newest-first listing, and the old order was a stable-sort
  artifact), pinned it with the "breaks startedAt ties newest-created first"
  test, and called it out in the changeset.
- `getRunById` picks the min-`_creationTime` match while the old code picked the
  max-`startedAt` match, and `by_run_id` is not a uniqueness constraint. ->
  **accepted as understood, no code change** -> `runId` is
  `mr_${Date.now()}_${random8}` and `chunk()`/`cancel()` already resolve through
  `getRunById`, so `status()` now agrees with them instead of disagreeing.
- Nothing-matches case must map null to `[]`, never `[run]`. -> **accepted** ->
  `getRunsById` returns `run ? [run] : []`; covered by the "unknown runId" test.
- `getActiveRun` returns the oldest running run; reshape `by_status` to
  `(status, startedAt)` to return the newest. -> **rejected** -> at most one row
  can be `running` (`run()` guards on `getActiveRun()` under Convex OCC), so the
  reshape buys nothing reachable through the API while changing what `run()` and
  `cancel()` target in a degenerate state.
- `.take(limit)` does not bound the read while `limit` is unclamped and the
  example passes `200`. -> **accepted** -> added `MAX_STATUS_RUN_LIMIT`, a clamp,
  a regression test, an export, and docs.
- `status()` is still unbounded because `getAllStateRows` collects
  `migration_state`. -> **rejected** -> the issue explicitly scopes that out, the
  table is bounded by authored migrations rather than run history, and the full
  set is required by the `migrations`/`pending`/`drift` payload.
- 15 test call sites use `.handler`, but real Convex builders expose `_handler`,
  so they break the moment a real query builder is used. -> **accepted** -> added
  `internalQuery` passthroughs at all 58 `createOrm` sites across six
  `convex/orm/*.test.ts` files.
- `page.tsx` uses `mutationOptions`, which stops existing once `getStatus` is a
  query. -> **accepted** -> converted the page to `useQuery` + `queryOptions`.
- Landing the query flip before the read fix would make a live subscription
  re-run an unbounded scan on every chunk write. -> **accepted** -> shipped both
  parts together and dropped the example's explicit `limit` to the default page
  size to keep the subscription read set small.
- `createServerCaller` runs the callee in the caller's own transaction, so the
  OCC saving is at the top-level invocations (CLI poll loop, example
  `getStatus`), not at the nested call. -> **accepted as understood** -> claim
  scoped accordingly in the changeset.
- `MAX_STATUS_RUN_LIMIT` was not re-exported from `kitcn/orm/migrations`. ->
  **accepted** -> exported.
- The clamp was undocumented. -> **accepted** -> documented in
  `www/content/docs/orm/migrations.mdx` and the kitcn skill mirror.
- `authQuery` carries no ratelimit middleware while `authMutation` does, so the
  example flip removes rate limiting from `getStatus`. -> **accepted as
  understood, no code change** -> every other read in the example app is an
  unratelimited `authQuery`; the ratelimit only ever applied because the read was
  misclassified as a mutation.
- Stale `example/convex/functions/_generated/api.d.ts` kinds are cosmetic, not a
  type/runtime split. -> **confirmed** -> `bun typecheck` passes with the stale
  file; it regenerates on the next `convex dev`.

Error attempts:
| Error / failed attempt | Count | Next different move | Resolution |
|------------------------|-------|---------------------|------------|
| Post-rebase `bun check` failed: 8 vitest failures with `is not a function` in files I never touched | 1 | Audit every `createOrm` site repo-wide for `internalMutation`/`internalQuery` asymmetry instead of only the files in my diff | The rebase pulled in two new upstream test files (`relation-depth.test.ts`, `example-comment-tree-reads.test.ts`) plus one new `createOrm` helper in `count.test.ts`, all needing the `internalQuery` passthrough. Patched all three; a symmetry audit (`internalMutation:` count == `internalQuery:` count per file) now passes for every `createOrm` site. |
| `bunx kitcn codegen` at repo root regenerated nothing (files byte-identical, still `"mutation"`) | 1 | Check whether the root actually links the workspace package | Root `package.json` has no `kitcn` dependency, so `bunx` downloaded the published CLI. Switched to `bun packages/kitcn/dist/cli.mjs codegen`. |
| `bunx kitcn codegen --scope orm` deleted `convex/shared/api.ts` and `convex/generated/auth.ts` | 1 | Do not use a scoped run at the root; it does not own the auth/cRPC outputs | `git checkout --` restored both; re-ran full-scope codegen with the local CLI, which regenerated them identically. |
| `Cannot find package 'kitcn/server'` in `convex/orm/*.test.ts` under vitest | 1 | Check whether the integration project's alias list covers the subpath before suspecting install rot | Pre-existing: the `integration` project aliases only `kitcn/orm*` and `kitcn/aggregate`, so `kitcn/server` resolves from `dist`. Fixed by `bun --cwd packages/kitcn build`, not by reinstalling. |
| `bun run fixtures:sync` appeared stalled for ~13 min at 5 of 8 fixtures | 1 | Inspect the process tree before killing anything | Child `kitcn` CLI processes were still being spawned (fresh `etime`), so it was slow, not wedged. Waited; exited 0 with all 8 apps regenerated. |

Verification evidence:
All commands run from the repo root
`/Users/mikey/conductor/workspaces/kitcn/port-of-spain` unless noted, prefixed
with `NO_PROXY=localhost,127.0.0.1` (local proxy breaks Convex/concave probes).

- `npx vitest run packages/kitcn/src/orm/migrations/runtime.vitest.ts --project integration`
  BEFORE the fix -> 3 failed / 7 passed. Key red:
  `AssertionError: expected 30 to be less than or equal to 2` (runId branch) and
  the 40-run read-bound case.
- Same command AFTER the fix -> **11 passed**, no type errors.
- `bun --cwd packages/kitcn build` -> `Build complete`, 71 files.
- `bun typecheck` (turbo, 6 packages incl. `example` and `test-convex`) ->
  **5 successful, 5 total**.
- `bun lint` (`biome check && eslint`) -> **940 files, no fixes applied**.
- `bun run test` -> `bun test`: **1304 pass, 0 fail** (147 files);
  `vitest run`: **860 pass, 13 skipped, 0 fail**, no type errors.
- `bun run test:cli` -> **124 pass, 0 fail**.
- `bun run test:concave` -> **Concave smoke passed.**
- `bun run fixtures:sync` -> exit 0; all 8 fixture apps regenerated.
- `bun run fixtures:check` -> **exit 0** (re-scaffolds all 8 apps from the
  templates and fails on drift).
- After rebasing onto `origin/main` (8 upstream commits), `bun check` -> **`EXIT=0`**
  end to end: lint, typecheck, `test`, `test:cli`, `test:concave`,
  `fixtures:check`, `test:verify`, and `test:runtime`.
- Codegen regeneration used the LOCAL build, not `bunx` (the repo root has no
  `kitcn` dependency, so `bunx kitcn` silently downloads the published CLI and
  regenerates against the old registry):
  - root: `bun packages/kitcn/dist/cli.mjs codegen`
  - example: `cd example && bun ../packages/kitcn/dist/cli.mjs codegen`
  Both end with `No CONVEX_DEPLOYMENT set`, which is the trailing `convex codegen`
  step only; every kitcn-owned file is written before it.
- Source audit — procedure kind flipped end to end:
  - `convex/generated/server.runtime.ts` `"migrationStatus": ["query", ...]`
  - `convex/generated/aggregate.runtime.ts` `"aggregateBackfillStatus": ["query", ...]`
  - `example/convex/shared/api.ts` `getStatus: createApiLeaf<"query", ...> { type: "query" }`
  - `example/convex/functions/generated/migrationDemo.runtime.ts` `"getStatus": ["query", ...]`
- Source audit — index reached generated data models:
  `fixtures/expo/convex/functions/_generated/dataModel.d.ts` gains
  `"by_started_at": ["startedAt"]` under `migration_run`.
- Source audit — `getAllRunRows` is gone:
  `rg "getAllRunRows" packages/kitcn/src` returns nothing.
- Source audit — the only residual `"mutation"` for the two names anywhere in
  non-CHANGELOG source or generated output is
  `example/convex/functions/_generated/api.d.ts:921,1064` (Convex codegen,
  needs a deployment). Fixture `_generated/api.d.ts` files never name them.
- `.claude/skills/autoreview/scripts/autoreview --mode local --engine claude`
  -> `autoreview clean: no accepted/actionable findings reported`,
  `overall: patch is correct (0.85)`, TruffleHog clean, single review pass.
- Incidental correction found while verifying the review's one cosmetic note:
  `example/convex/functions/generated/procedure-names.gen.ts` was already stale
  on `main` for `organization.ts`. That file is unmodified by this change
  (`git diff --stat` empty), yet the committed coordinates pointed at
  `.output(...)`/`});` lines while the regenerated ones land on the real
  terminal `.mutation(...)` calls (e.g. `cancelInvitation` is defined at :978
  and its `.mutation(` is at :981, not the committed :997). Regeneration fixed
  pre-existing drift rather than introducing any.

Source-listed case matrix:
| Case | Source claim | Harness | Before | Expected after | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1. Unbounded run listing | `.collect()`s every `migration_run` row to return at most `limit` | `runtime.vitest.ts` "reads at most limit run rows regardless of run history size" (40 seeded runs, `countDocumentReads`) | 40 document reads for `limit: 3` | <= limit + 1 | red then green; 11/11 pass | done |
| 2. `runId` branch re-derived in JS | filters the full sorted history instead of using `by_run_id` | "runId selects that run through the by_run_id index only" (30 seeded runs) | 30 reads | <= 2 | red (`expected 30 to be less than or equal to 2`) then green | done |
| 3. `activeRun` re-derived in JS | scans the sorted array although `getActiveRun` exists | "activeRun stays global and is not narrowed by the runId filter" | global scan | indexed `by_status` probe, still global | green | done |
| 4. Ordering preserved | listing must stay newest-first by `startedAt` | "lists runs newest-first by startedAt and honors limit" (scrambled `startedAt` vs insertion order) | passes | passes | green both before and after; guards the rewrite | done |
| 5. `startedAt` tie-break | not in the source; found by adversarial review | "breaks startedAt ties newest-created first" | stable JS sort -> oldest-created first | index desc -> newest-created first | green; deliberate change, in the changeset | done |
| 6. Caller-supplied unbounded limit | not in the source; `limit` has no cap and the example passed `200` | "clamps limit so callers cannot request an unbounded read" | `limit: 1_000_000` reads everything | clamped to `MAX_STATUS_RUN_LIMIT` | red then green | done |
| 7. Unknown `runId` | must keep returning `[]` | "unknown runId returns no runs" | `[]` | `[]` | green | done |
| 8. `migrationStatus` is a mutation | polling takes an OCC write slot | `codegen.test.ts` emitted-registry assertion + regenerated `convex/generated/server.runtime.ts` | `["mutation", ...]` | `["query", ...]` | diff verified | done |
| 9. `aggregateBackfillStatus` is a mutation | same | `codegen.test.ts` + regenerated `convex/generated/aggregate.runtime.ts` | `["mutation", ...]` | `["query", ...]` | diff verified | done |
| 10. End-to-end payoff | `migrationDemo.getStatus` was a mutation only because of (8) | regenerated `example/convex/shared/api.ts` | `type: "mutation"` | `type: "query"` | diff verified; page converted to a live subscription | done |

Final handoff contract:
- Commit line: `fix(orm): bound migration status reads, make status endpoints queries`
  on `fix/bounded-migration-status-queries` (rebased onto `origin/main`).
- PR line: https://github.com/udecode/kitcn/pull/421
- Issue line: 🐛 Fixes #408
- Confidence line: 🟢 95-100% on the server/package claim; the example
  `/migrations` page change is 80-94% (typecheck + lint only, no render).
- Flow table:
  - Reproduced: tests 🔴 (3 red in `runtime.vitest.ts`), browser ➖ N/A
  - Verified: tests 🟢 (11 focused + 1304 bun + 860 vitest + 124 CLI + concave
    smoke), browser ➖ N/A
- Browser check: blocked — `example/` has no `.env.local` and `example/convex/`
  has no `.env`, so there is no Convex deployment to render `/migrations`
  against. QA: sign in, open `/migrations`, click **Run Up**, confirm the
  `migration_run` / `migration_state` boxes update live with no Refresh button.
- Outcome: `migrationStatus` reads at most `limit` run rows off a new
  `by_started_at` index instead of collecting the whole `migration_run` history;
  `runId` and `activeRun` resolve through their existing indexes; `limit` is
  clamped at `MAX_STATUS_RUN_LIMIT`; and both status endpoints are internal
  queries, so polling no longer takes an OCC write slot on the tables it
  reports on.
- Caveat: `example/convex/functions/_generated/api.d.ts` still declares the two
  procedures as `"mutation"`. That file is Convex's own codegen and needs a live
  deployment to regenerate; `bun typecheck` passes with it stale because
  `createGeneratedFunctionReference` does not link the kind param to the export.
- Design:
  - Chosen boundary: the ORM migration runtime owns the read shape;
    `create-orm` + `codegen` jointly own the procedure kind. A new optional
    `internalQuery` config option threads the app's own Convex builder through
    both emitted templates.
  - Why not quick patch: bounding only the `.take(limit)` call would leave the
    read unbounded through the caller-supplied `limit`, and flipping only the
    registry kind without the builder would throw `Procedure type mismatch` at
    runtime.
  - Why not broader change: left `getAllStateRows` collecting `migration_state`
    (bounded by authored migrations and required whole by the payload), left
    `by_status` un-reshaped (at most one running row is reachable), and left the
    pre-existing stranded-`running`-row and `aggregate_state` collect issues
    alone.
- Verified: red-then-green focused tests, full repo suite, typecheck, lint,
  concave smoke, fixture sync + check, plus source audits proving the kind
  flipped in every regenerated registry and `getAllRunRows` is gone.
- PR body verified: `gh pr view 421 --json body` confirms the PR #270 emoji format.

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
- Commit: `fix(orm): bound migration status reads, make status endpoints queries`
  on `fix/bounded-migration-status-queries`, rebased onto `origin/main`.
- PR: https://github.com/udecode/kitcn/pull/421
- Issue: `🐛 Fixes #408` in the PR body links and closes the issue on merge.
- Browser proof: N/A: blocked, no `example` env / Convex deployment.
- Caveats: stale `example/convex/functions/_generated/api.d.ts` kinds
  (Convex codegen, needs a deployment); no rendered proof for the
  `/migrations` page.

Timeline:
- 2026-08-21T19:22:27.196Z Task goal plan created.
- Issue #408 read and refetched (`gh issue view 408`); no comments.
- 5-agent surface map + 3 adversarial verifiers run over runtime, schema,
  create-orm, codegen, backfill, CLI, tests, fixtures, and docs.
- Red: 3 failing tests added to `runtime.vitest.ts` against current code.
- Implemented `by_started_at` index, bounded indexed read, `limit` clamp,
  reader ctx widening, `internalQuery` seam, codegen registry + emitters.
- Green: 11 focused tests.
- Adversarial review pass: accepted the tie-break, clamp, `internalQuery`
  passthrough, export, and docs findings; rejected the `by_status` reshape and
  the `getAllStateRows` bounding.
- Regenerated root `convex/`, `example/`, and all 8 fixtures with the local CLI.
- Full gates: lint, typecheck, `test`, `test:cli`, `test:concave`,
  `fixtures:sync`, `fixtures:check` all green.

Reboot status:
| Question | Answer |
|----------|--------|
| Where am I? | Closeout, after all repo gates passed |
| Where am I going? | Autoreview, `check-complete.mjs`, final handoff. No commit/PR (user declined). |
| What is the goal? | Bound ORM migration status reads and make both status endpoints internal queries |
| What have I learned? | See Findings and Review fixes — notably that `.take(limit)` does not bound anything while `limit` is unclamped, that `createOrm` had no query builder at all, and that root `bunx kitcn` runs the published CLI |
| What have I done? | See Timeline and Verification evidence |

Open risks:
- No browser proof for `example/src/app/migrations/page.tsx`. `example/` has no
  `.env.local` and `example/convex/` has no `.env`, so the page cannot be
  rendered against a Convex deployment in this workspace. Covered by
  `bun typecheck` (root + `example` + `convex/functions` project) and lint only.
  QA steps: sign in, open `/migrations`, click **Run Up**, confirm the run/state
  JSON boxes update live with no Refresh button and no polling.
- `example/convex/functions/_generated/api.d.ts` and
  `_generated/dataModel.d.ts` still carry the pre-change kinds and index list.
  These are Convex's own codegen and need a deployment (`convex dev`) to
  regenerate. Verified cosmetic: `bun typecheck` passes because
  `createGeneratedFunctionReference<TType, TVisibility, TExport>` places no
  constraint linking `TType` to `TExport`. The 8 fixtures regenerate correctly
  through `fixtures:sync`, which runs a real local backend.
- Adding `by_started_at` builds eagerly at `convex deploy`; the ORM index DSL
  exposes no staging. Negligible here — `migration_run` holds one row per
  migration run.
- Any future upstream `createOrm` call site that reaches `orm.api()` and invokes
  `.handler` must also pass `internalQuery`, or it fails with
  `is not a function`. Audit command:
  `for f in $(grep -rl "internalMutation:" convex/ --include="*.ts"); do [ "$(grep -c 'internalMutation:' $f)" = "$(grep -c 'internalQuery:' $f)" ] || echo $f; done`
- Pre-existing and untouched: `runtime.ts` calls `getOrCreateStateRow` outside
  the `try` block that wraps chunk execution, so a throw there can strand a run
  row at `status: 'running'` and block every future `run()`. Out of scope for
  #408; worth its own issue.
- Pre-existing and untouched: `aggregate-index/backfill.ts` collects all of
  `aggregate_state` even when the caller narrows to one `{tableName, indexName}`.
  Bounded by schema rather than history, so not the grows-forever class this
  issue targets.

Hard closeout guard:
- A local-only final response for verified code-changing work is invalid unless
  this plan records an explicit user decline, no local patch, analytical/
  blocked/inconclusive outcome, or a real commit/PR blocker.
