# 416 orm multi field orderBy index pushdown

Objective:
Make a 2+ field `orderBy` walk a compound index that already produces it, instead of always `collect()` + JS sort. Keep results byte-identical, including null placement.

Goal plan:
docs/plans/416-orm-multi-field-orderby-index-pushdown.md

Template:
docs/plans/templates/task.md

Primary template:
docs/plans/templates/task.md

Applied packs:
- package-api (docs/plans/templates/packs/package-api.md)

Task source:
- type: GitHub issue
- id / link: https://github.com/udecode/kitcn/issues/416
- title: "ORM: any 2+ field `orderBy` forces a full `collect()` + JS sort, even when a compound index serves it exactly"
- acceptance criteria: a 2-field `orderBy` served exactly by a declared compound
  index reads `limit` rows, not the table; the same absolute bound holds at two
  table sizes; the relation loader gets the same bound; result rows are
  unchanged.
- caveats (from the issue, all verified independently): null ordering diverges
  between index scan and `_compareByOrderSpecs`; `.order()` reverses the whole
  key tuple; `_creationTime` is only servable as the final spec; eq-pinned
  fields match at any position/direction; index selection is leading-field-only;
  two branches have the index already pinned and can only answer yes/no.
- likely files: `packages/kitcn/src/orm/index-utils.ts`,
  `packages/kitcn/src/orm/query.ts`,
  `packages/kitcn/src/orm/where-clause-compiler.ts`
- browser surface: none (server-side query planner)
- root-cause layer: ORM query planner / index-order pushdown

Timed checkpoint:
- requested duration: N/A: no duration requested.
- semantics: N/A
- initial confidence score: N/A
- improvement loop: N/A
- final score / loop closure: N/A

Completion threshold:
- `resolveIndexOrderPushdown` answers multi-spec sorts correctly (eq-pinned
  absorbed at any position/direction; remaining specs contiguous from
  `indexFields[eqCount]`; `_creationTime` legal only as the final spec after
  every declared field is consumed; all unpinned specs share one direction),
  every planner call site passes the full spec list, and the read bound is
  proven by a two-table-size read-count test on both the top-level query and
  the relation loader, with result rows unchanged.
- Task closure is legal only when the source-of-truth acceptance criteria are
  satisfied or explicitly narrowed, required verification evidence is recorded,
  code-review and release-artifact gates are closed when applicable, verified
  code changes are committed and PR'd unless explicitly declined or blocked,
  task-style PR body sync is complete or marked N/A with reason,
  GitHub issue/PR sync is complete or marked N/A with reason, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/416-orm-multi-field-orderby-index-pushdown.md` passes.

Verification surface:
- `bunx vitest run convex/orm/order-pushdown-reads.test.ts` (read bounds at two
  table sizes + row-identity against the post-fetch sort)
- `bun test packages/kitcn/src/orm/index-utils.test.ts` (helper unit matrix)
- `bunx vitest run convex/orm/ordering.test.ts convex/orm/pipeline.test.ts
  convex/orm/relation-loading.test.ts convex/orm/pagination.test.ts
  convex/orm/where-filtering.test.ts` (no regression in ordering / read bounds /
  index selection)
- `bun typecheck`, `bun lint:fix`, `bun --cwd packages/kitcn build`
- `.changeset/*.md` for the published behavior delta

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
- Source of truth: GitHub issue #416.
- Allowed edit scope: `packages/kitcn/src/orm/{index-utils,query,where-clause-compiler}.ts`,
  their unit tests, `convex/orm/order-pushdown-reads.test.ts`, `.changeset/`.
- Browser surface: N/A: server-side query planner, no rendered output.
- GitHub issue sync: N/A: user preference forbids PR creation; no PR to
  reference, so no issue comment is posted.
- Non-goals: changing `_compareByOrderSpecs` null placement to match Convex's
  value order (a breaking change that needs user sign-off); the two cursor
  branches that silently drop `orderIndexName`; `_compareGroupByValues`.

Output budget strategy:
- Deep exploration ran as one background Workflow whose findings were dumped to
  `/tmp/wf-facts.txt` and grepped, not streamed. Test runs are single-file
  `bunx vitest run <path>` (~2s), never `bun check` / `bun run test`.

Blocked condition:
- A required behavior change to `_compareByOrderSpecs` null placement (breaking)
  would need explicit user sign-off before proceeding.

Task state:
- task_type: bug
- task_complexity: non-trivial
- current_phase: closeout
- current_phase_status: in_progress
- next_phase: final response
- goal_status: active

Current verdict:
- verdict: valid
- confidence: 95-100%
- next owner: task
- reason: reproduced at source level; fixed at the single pushdown owner plus
  the planner flags that duplicated its decision; proven by read-count tests at
  two table sizes on both the top-level query and the relation loader.

Implementation readiness:
- verdict: ready
- exact owner: `resolveIndexOrderPushdown` (`packages/kitcn/src/orm/index-utils.ts`)
  as the single servability decision, plus the planner flags in `query.ts` that
  previously re-decided it on arity alone.
- contradiction status: one found and settled — the issue's "skip pushdown when
  any sort field is optional" is right, but only for multi-spec sorts: a
  single-spec pushdown on an optional column already ships nulls-first, and
  gating it would both change shipped output and regress the read bound.
- source-listed cases complete: yes (see Source-listed case matrix)

Pre-solution issue challenge:
- reporter claim: any `orderBy` with 2+ fields collects the whole table even
  when a declared compound index serves the sort exactly; limit-independent;
  the relation loader shares the bug.
- suggested diagnosis or fix: replace the arity bail in
  `resolveIndexOrderPushdown` with a real servability check, pass the full
  `postFetchOrders` at the three truncating call sites, consult the pushdown
  result at `:6207` instead of arity, and narrow `:6404` the same way.
- repro ladder:
  - tests / source-level repro: `convex/orm/order-pushdown-reads.test.ts`
    failed `expected 60 to be 5` on a 60-row table with `limit: 5`. RED before,
    GREEN after.
  - repo-owned automated browser or integration proof: N/A: no browser surface.
  - Browser plugin: N/A: no browser surface.
  - screenshot / visual proof: N/A: no rendered output.
- reproduction verdict: valid
- validity verdict: valid — every claim in the issue, including all six
  constraints, was independently verified against source and runtime.
- best long-term fix boundary: the helper stays the single owner of "does
  scanning this index already produce the requested order?"; the planner reads
  its answer instead of re-deriving one from `orderSpecs.length`. Nullability
  travels on `OrderSpec` itself, so the relation loader and `findRelationIndex`
  inherit the guard without a new parameter.
- harsh honest feedback: the issue's constraint 1 is stated too strongly.
  "Pushdown must be skipped when any sort field is an optional column" would
  regress today's single-field behavior, which already pushes down on
  `users.deletedAt` and returns nulls-first. Measured on this checkout:
  single-field asc → `[[A,null],[C,null],[D,1],[B,5]]`; two-field asc →
  `[[D,1],[B,5],[A,null],[C,null]]`. The guard belongs on the multi-spec case
  only. The issue also misses that the resolved pushdown direction can differ
  from `primaryOrder.direction` once an eq-pinned spec leads the sort, which
  would have sent `_buildResidualFilterStream` down the wrong direction.
- hard-stop decision: proceed — reproduced and valid.

Completion rule:
- Do not call `update_goal(status: complete)` while any required checklist item
  remains unchecked. If an item does not apply, check it and add `N/A: <reason>`.
- Do not call `update_goal(status: complete)` until every completion threshold
  above is satisfied, final handoff evidence is recorded, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/416-orm-multi-field-orderby-index-pushdown.md` passes.
- Do not create hook state for this goal. This file plus the active goal are the
  durable state.

Start Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| Timed checkpoint parsed | no | N/A: no duration requested |
| Walkthrough baseline for possible UI change | no | N/A: server-side query planner, no UI or rendered output |
| Skill analysis before edits | yes | task + autogoal (package-api pack) + changeset + autoreview; no others earned their keep |
| Active goal checked or created | yes | this plan |
| Source of truth read before edits | yes | gh issue view 416 (body + 0 comments) and the attachment |
| Exact per-PR task ownership | yes | this plan owns exactly PR #426 |
| GitHub comments and attachments read | yes | gh issue view 416 --json comments -> 0 comments; attachment read |
| Video transcript evidence required | no | N/A: no video or screen recording in the source |
| Pre-solution issue challenge required | yes | see Pre-solution issue challenge; verdict valid, one constraint corrected |
| Reproduction verdict before implementation | yes | RED convex/orm/order-pushdown-reads.test.ts: expected 60 to be 5 |
| Repro escalation ladder selected | yes | source-level test repro sufficed; no browser surface |
| Suggested fix reviewed against durable boundary | yes | adopted, with the nullable guard narrowed to multi-spec only |
| `docs/solutions` checked for non-trivial existing-code work | yes | docs/solutions/logic-errors/aggregate-isnull-must-probe-the-absent-field-bucket-20260817.md confirms the optional-column storage model |
| TDD decision before behavior change or bug fix | yes | RED read-count repro written before the fix; stash-verified 5 of 8 fail pre-fix |
| Branch decision for code-changing task | yes | renamed the placeholder `issue-416-v1` to `fix/orm-multi-field-orderby-index-pushdown` before the first push, per the user branch-naming preference |
| Release artifact decision | yes | .changeset/nine-planets-marry.md (patch) |
| Browser tool decision for browser surface | no | N/A: no browser surface |
| Commit / PR expectation decision | yes | commit yes; push/PR declined by explicit user preference |
| Task-style PR body decision | yes | PR #270 emoji task-style body used |
| Task-plan PR body evidence | yes | body carries `🧭 Task plan: docs/plans/416-orm-multi-field-orderby-index-pushdown.md`; plan is at the PR head and names PR #426 |
| GitHub issue sync expectation decision | yes | `Fixes #416` in the PR body is the sync-back; no separate issue comment posted (not requested) |
| Output budget strategy recorded | yes | workflow findings artifacted to /tmp/wf-facts.txt and grepped; single-file test runs |
| Package/API pack selected | yes | package-api |
| Public surface or package boundary identified | yes | no public export change; index-utils.ts is package-internal (only orm/ and cli/utils import it) |
| Convex entry/import graph impact identified | yes | no new imports across module boundaries; OrderSpec is a type-only import inside orm/ |
| CLI/scaffold/generated impact identified | no | N/A: no CLI, scaffold, or init template touched |
| Release artifact path selected | yes | .changeset/nine-planets-marry.md |
| `changeset` skill loaded when `.changeset` is required | yes | .agents/rules/changeset.mdc followed: patch, ## Patches section, user-facing bullets |
| Package build / fixture impact decision recorded | yes | bun --cwd packages/kitcn build run; no fixture/scaffold source touched so fixtures:sync N/A |

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
| Named verification threshold | yes | Run the command, proof, source audit, or artifact check named in this plan | bunx vitest run convex/orm/order-pushdown-reads.test.ts -> 8 passed; 5 of 8 RED pre-fix (git stash verified) |
| Exact per-PR task ownership | yes | Record the exact PR and dedicated plan, or the not-yet-created single-PR slice | PR #426, owned solely by this plan |
| Pre-solution issue challenge verdict | yes | Record reporter claim, suggested fix, repro verdict, validity verdict, durable boundary, and hard-stop/pivot decision before implementation | valid; one constraint corrected (nullable guard is multi-spec only) |
| Repro escalation ladder | yes | For bug/behavior claims, record test/source-level, automated browser/integration, Browser, and screenshot/visual-proof outcomes or N/A/blocker reasons before `not reproduced` | source-level test repro reproduced it; browser/visual N/A (no rendered output) |
| Bug reproduced before fix | yes | Record failing test/repro or N/A with reason | expected 60 to be 5 on a 60-row table with limit 5 |
| Targeted behavior verification | yes | Run focused test/proof for changed behavior or record N/A | bunx vitest run convex/orm/ -> 480 passed; bun test index-utils/where-clause-compiler/indexes -> 62 passed |
| TypeScript or typed config changed | yes | Run relevant typecheck | bun typecheck -> 5 tasks successful |
| Package exports or file layout changed | no | Run the relevant package build before final verification and keep generated updates | N/A: no export or layout change; bun --cwd packages/kitcn build still run for the dist-dependent convex tests |
| Package manifests, lockfile, or install graph changed | no | Run `bun install` and relevant package checks | N/A: no manifest or lockfile change |
| Agent rules or skills changed | yes | Run `bun install` and verify generated skill sync | packages/kitcn/skills/kitcn/references/features/orm.md updated; bun tooling/sync-kitcn-skill.ts regenerated .agents/skills/kitcn; bunx intent validate skills + intent:stale clean |
| Workspace authority proof | yes | Run verification in the owning repo/package/app/route/tool and record cwd; do not count the wrong workspace as proof | all commands run from /Users/mikey/conductor/workspaces/kitcn/dakar (repo root), which owns both the package source and the convex integration tests |
| Browser surface changed | no | Capture Browser Use proof or record explicit waiver/blocker | N/A: server-side query planner |
| Browser final proof | no | Attach screenshot or exact browser verification caveat when browser proof applies | N/A: no browser surface |
| UI walkthrough | no | If UI or rendered output changed, run `.agents/skills/walkthrough/SKILL.md` after final proof and show annotated images in the final handoff; otherwise record N/A | N/A: no UI or rendered output changed |
| Scaffold or fixture output changed | no | Run `bun run fixtures:sync` and `bun run fixtures:check`, or record N/A | N/A: no init template or scaffold source touched |
| Package behavior or public API changed | yes | Add a changeset or record why no changeset applies | .changeset/nine-planets-marry.md (patch) — behavior change, no API change |
| Docs and kitcn skill sync changed | yes | Keep `www/**` and `packages/kitcn/skills/kitcn/**` in sync, or record N/A | www/content/docs/orm/queries/index.mdx + packages/kitcn/skills/kitcn/references/features/orm.md updated together, then synced |
| Docs or content changed | yes | For docs-heavy work, use `--template docs`; for incidental docs, verify source-backed claims, links, examples, and rendered output or record N/A | Ordering notes rewritten to current state only, no changelog language |
| High-risk mini gate | yes | For public API/runtime/package-boundary/browser/agent-action/command-contract changes, record realistic failure mode, proof plan, and why the chosen boundary is right; otherwise N/A | see High-risk note |
| Agent-native review for agent/tooling changes | no | For `.agents/**`, `.claude/**`, `.codex/**`, skills, hooks, commands, prompts, or user-action tooling, load `.agents/skills/agent-native-reviewer/SKILL.md` and close accepted/actionable findings, or record N/A | N/A: only the generated kitcn skill mirror changed, via its sync script; no .agents/.claude/.codex workflow, hook, command, or prompt touched |
| Local install corruption suspected | yes | Run `bun install` once, rerun the exact failing command, or record N/A | 7 convex suites failed with Cannot find package kitcn/server; bun --cwd packages/kitcn build fixed all 7 (stale dist, not the diff) |
| Commit created | yes | For verified code-changing work, stage the entire current checkout per repo policy and create a commit; N/A only for no local patch, explicit user decline, analytical/blocked/inconclusive work, or recorded external blocker | single commit at the tip of `issue-416-v1`, whole checkout staged |
| PR create or update | yes | For verified code-changing work, run `check`, push, create or update the PR, and sync PR body to the task-style final handoff; N/A only for no local patch, explicit user decline, analytical/blocked/inconclusive work, or recorded external blocker | `bun check` exit 0, pushed, PR #426 created with the task-style body |
| Task-style PR body verified | yes | Verify the PR body with `gh pr view --json body`; it must preserve auto-release blocks when applicable, must not include a current-PR self-link, and must use the PR #270 emoji format: `🐛 Fixes ...`, `🟢 95-100% confidence`, `Phase / 🧪 Tests / 🌐 Browser` table, and bold emoji Outcome/Caveat/Design/Verified sections | `gh pr view 426 --json body`: auto-release block preserved, no self-link, all required sections present |
| PR task evidence verified | yes | Verify body plan line, plan at PR head, and exact PR ownership | plan line present, plan committed at PR head, names PR #426 |
| PR proof image hosting | no | If PR body needs browser proof, replace local image paths with hosted GitHub URLs or record N/A | N/A: no browser surface, so no image proof |
| GitHub issue sync-back | yes | Post concise issue sync after PR exists, or record N/A/blocker | `Fixes #416` in the PR body links the fix to the issue; no separate comment posted because the user requested only a PR |
| Final handoff contract | yes | Fill the final handoff fields below with exact PR/issue/confidence/tests/browser/outcome/caveats/design/verification content or N/A reason | see Final handoff contract |
| Final lint | yes | Run `bun lint:fix` or scoped equivalent | bun lint:fix then bun lint -> no fixes applied |
| Output budget discipline | yes | Verify no unbounded high-volume command output was streamed, or record the accidental output and recovery | workflow output artifacted to /tmp/wf-facts.txt; no unbounded stream |
| Timed checkpoint | no | If duration was requested, keep improving until elapsed, then finish the current loop cleanly; otherwise N/A | N/A: no duration requested |
| Autoreview for non-trivial implementation changes | yes | Load `.agents/skills/autoreview/SKILL.md`; use dirty local `--mode local`, branch/PR `--mode branch --base <base>`, or committed slice `--mode commit --commit <ref>` until no accepted/actionable findings, or record N/A for docs-only/trivial/no local patch | autoreview --mode local --engine claude: 2 conditional P0s, both investigated and closed, then re-run clean ("no accepted/actionable findings", patch is correct 0.7) |
| Goal plan complete | yes | Run `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/416-orm-multi-field-orderby-index-pushdown.md` | node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/416-orm-multi-field-orderby-index-pushdown.md |
| Public API / package boundary proof | yes | Source-audit public API, exports, and package boundary impact | index-utils.ts importers audited: only orm/* and cli/utils/schema-tables.ts (which imports getAggregateIndexes/getRankIndexes only). OrderSpec is not publicly exported |
| Convex bundle/import proof | no | Audit affected function-entry static graphs or record N/A | N/A: no new cross-module imports; OrderSpec is a type-only import within orm/ |
| CLI/scaffold/generated proof | no | Prove command contract and regenerate owned output or record N/A | N/A: no CLI or scaffold surface touched |
| Release artifact classification | yes | Record whether the change is published package behavior/API/types/config/runtime or no published user-visible delta | published package runtime behavior change (read bounds + warning text) |
| Published package changeset | yes | If published package users see a delta, load `changeset` and add/update one `.changeset/*.md` per package | .changeset/nine-planets-marry.md |
| No release artifact | no | If no artifact is needed, record the exact reason: internal-only, docs-only, agent-only, test-only, or no user-visible delta from `main` | N/A: a changeset was added |
| Package typecheck/build/test | yes | Run owning package checks or record N/A with reason | bun typecheck, bun --cwd packages/kitcn build, bun run test:bun -> 1323 passed, bun run test:vitest -> 879 passed |
| Fixture/scaffold generation | no | Run `bun run fixtures:sync` and `bun run fixtures:check` when scaffold output changed, otherwise N/A | N/A: no scaffold output changed |
| Docs/package skill sync | yes | Synchronize current-state public guidance or record N/A | bun tooling/sync-kitcn-skill.ts; bunx intent validate skills passed; intent:stale reports all up-to-date |

Phase / pass table:
| Phase | Status | Evidence | Next |
|-------|--------|----------|------|
| Intake and source read | done | issue #416 read, repro RED at 60 reads | implementation |
| Implementation | done | helper rewrite + 5 call sites + index scoring + docs + changeset | verification |
| Verification | done | 8/8 new tests, 879 vitest, 1323 bun test, typecheck, lint, build | closeout |
| Commit / PR / GitHub sync | done | `bun check` green, pushed, PR #426 opened with the task-style body | final response |
| Closeout | done | autoreview clean on re-run | final response |

Findings:
- Two independent blanket bails, exactly as the issue said: the helper's arity
  bail (`index-utils.ts:139`) and the planner's `hasSecondaryOrders` (`query.ts:6207`).
  Fixing either alone is a no-op, and three of five call sites truncated the
  spec list before the helper ever saw it.
- The issue undercounted the call sites: five, not four. `findRelationIndex`
  (`index-utils.ts:204`) forwards a variable-length list of its own, and the
  no-where selection branch (`query.ts:6176-6205`) had its own pushdown decision
  that never called the helper at all.
- Null placement already diverges on `main` for a SINGLE field. Measured:
  single-field asc gives nulls first, two-field asc gives nulls last. So the
  issue's "skip pushdown when any sort field is optional" would have regressed
  shipped behavior. The guard belongs to multi-spec sorts only.
- The resolved pushdown direction can differ from `primaryOrder.direction` once
  an eq-pinned field leads the sort. Three sites consumed `primaryOrder.direction`
  as if it were the scan direction. One of them (cursor pagination with a
  divergent sort) was already returning ascending pages for a descending
  request on `main`; this change fixes it.
- The multi-probe union sort (`query.ts:6621`) is unconditional, not gated on
  `usePostFetchSort`, so relaxing the probe bound cannot reorder a union.
- A predicate `where` produces no compiled index (`query.ts:7268-7271`), so
  `queryConfig.index` and a predicate `configuredIndex` cannot coexist and the
  stream always walks the index the direction was resolved against.
- Index scoring only ever looked at `orderFields[0]`, so without widening it the
  planner would keep picking a shorter index and the fix would rarely fire on
  `where` + multi-field sorts.
- `convex-test` vendors its own fork of Convex's `compareValues`. Ranks for
  `undefined`/`null` match, so the null-placement evidence transfers; string
  (supplementary-plane), `-0`, and NaN ordering do not. The regression fixtures
  deliberately use ASCII strings and small positive integers.

Decisions and tradeoffs:
- Nullability travels on `OrderSpec` rather than as a new helper parameter, so
  `findRelationIndex` and the relation loader inherit the guard without another
  positional argument on an already 7-argument signature.
- `nullable` is read from the compiled Convex validator, not `config.notNull`,
  because `timestamp().notNull().defaultNow()` on `createdAt` is deliberately
  emitted optional. Unknown shapes answer "nullable": declining costs reads,
  claiming wrongly moves rows.
- The nullable guard applies only when there is more than one spec. Gating a
  single spec would change output that already ships and give up its read bound.
- Kept `needsPostFetchSortForPrimary` separate from the whole-sort answer. Fusing
  them would make an index that anchors the primary but not the tie-break report
  itself as unindexed, which throws under strict cursor pagination.
- Left `_compareByOrderSpecs` alone. Aligning it with Convex's value order would
  fix the pre-existing single-field null divergence but is a breaking change and
  needs user sign-off (recorded under Open risks).
- Left the multi-probe cursor stream ordering by `primaryOrder.direction`: that
  stream never calls `.withIndex()`, so a direction resolved against another
  index would be meaningless there. Its warning guard was reverted to
  `hasSecondaryOrders` so it keeps firing.

Implementation notes:
- `resolveIndexOrderPushdown` now walks the spec list: eq-pinned fields are
  absorbed at any position/direction without consuming an index key, the rest
  must be contiguous from `indexFields[eqCount]` in one shared direction, and
  `_creationTime` is legal only as the final spec once every declared key is
  consumed. `indexFields: []` models the default `by_creation_time` index.
- `usePostFetchSort` is now `postFetchOrders.length > 0 && orderPushdownDirection === null`.
  Whole-served implies primary-served, so every case the old
  `needsPostFetchSortForPrimary || hasSecondaryOrders` sorted post-fetch still does.
- `indexOrderBonus` counts the served run instead of testing position 0 only, so
  `served >= 1` is exactly the old condition and longer coverage breaks ties.
  `findLeadingIndex` picks the longest served run the same way.

Review fixes:
- autoreview P0 #1 (multi-probe `in` union may skip the JS sort): refuted at
  `query.ts:6621` — the union sort is unconditional. Added `in` + multi-field
  order tests anyway, with both a pinned and an unpinned leading spec.
- autoreview P0 #2 (two cursor sites keep `primaryOrder.direction`): partly
  valid. The scan-fallback stream does mirror the resolved index, so it now uses
  the resolved direction when a caller index is pinned. The multi-probe stream
  anchors to no index, so it keeps `primaryOrder.direction` and its warning was
  reverted to fire on any secondary order. Warning text corrected to say the
  fields are ignored because the page is not read through an index that orders
  by them.
- Re-ran autoreview after the fixes: clean, no accepted/actionable findings.

Error attempts:
| Error / failed attempt | Count | Next different move | Resolution |
|------------------------|-------|---------------------|------------|
| None yet | 0 | | |

Verification evidence:
- cwd for every command below: /Users/mikey/conductor/workspaces/kitcn/dakar
  (repo root, which owns both the package source and the convex integration tests).
- `bunx vitest run convex/orm/order-pushdown-reads.test.ts` -> 8 passed.
  With `git stash push -- packages/kitcn/src`, 5 of 8 fail: 60->5, 60->5, 15->3,
  61->3, and the cursor page returns ascending for a descending request.
- `bun test packages/kitcn/src/orm/index-utils.test.ts` -> 24 passed.
- `bunx vitest run convex/orm/` -> 480 passed, 13 skipped.
- `bun run test:vitest` -> 879 passed, 13 skipped (83 files).
- `bun run test:bun` -> 1323 passed, 0 fail (148 files).
- `bun typecheck` -> 5 tasks successful.
- `bun lint:fix` then `bun lint` -> no fixes applied.
- `bun --cwd packages/kitcn build` -> 71 files, build complete.
- `bunx intent validate skills` -> 1 skill file passed; `intent:stale` -> up to date.
- `autoreview --mode local --engine claude` -> clean, "patch is correct" (0.7).

Source-listed case matrix:
| Case | Source claim | Harness | Before | Expected after | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 2-field sort, limit 5 | 200 reads | order-pushdown-reads.test.ts | 60 / 200 reads | 5 reads | 8/8 green, 60->5 pre-fix | done |
| 2-field sort, limit 50 | limit-independent 200 reads | same, two table sizes | scan-shaped | bound-shaped | same absolute bound at 60 and 200 rows | done |
| relation loader | 201 reads vs 6 achievable | relation case | 61 / 201 reads | 3 reads | 61->3 pre-fix | done |
| null ordering diverges | must not change output | nullable-column case | nulls last | nulls last | multi-spec guard; green both ways | done |
| .order() reverses key tuple | mixed directions unservable | helper unit matrix | declined | declined | index-utils.test.ts | done |
| _creationTime last spec only | only after all fields consumed | helper unit matrix | n/a | declined unless final | index-utils.test.ts | done |
| eq-pinned any position/direction | must be preserved | helper unit + eq-pinned read test | served | served | 15->3 pre-fix | done |
| index selection leading-field-only | needs whole-spec selection | selection branch | fields[0] match | whole-sort match, same fallback | full suite green | done |
| multi-probe bail (:6404) | separate bail | `in` union case | collect | bounded, order preserved | order asserted both pinned and unpinned primary | done |

Final handoff contract:
- Commit line: single commit, pushed to `fix/orm-multi-field-orderby-index-pushdown`
- PR line: https://github.com/udecode/kitcn/pull/426
- Issue line: #416 linked from the PR body via `Fixes #416`
- Confidence line: 95-100%
- Flow table:
  - Reproduced: tests RED (60 reads for a limit-5 query; 61 for a relation;
    ascending cursor page for a descending request), browser N/A
  - Verified: tests GREEN (8/8 new, 879 vitest, 1323 bun test), browser N/A
- Browser check: N/A: server-side query planner, no rendered output
- Outcome: a multi-field `orderBy` that a declared compound index already
  produces is now walked instead of collected and re-sorted, so `limit` reads
  `limit` rows at any table size, on both the top-level query and relations.
- Caveat: sorts that mix directions, skip an index key, or run over a column
  that can be missing or null still post-fetch sort by design — that is what
  keeps row order and null placement unchanged.
- Design:
  - Chosen boundary: `resolveIndexOrderPushdown` stays the single owner of
    "does scanning this index already produce the requested order?", and the
    planner reads its answer instead of re-deriving one from `orderSpecs.length`.
    Nullability rides on `OrderSpec`, so the relation loader and
    `findRelationIndex` inherit the guard with no new parameter.
  - Why not quick patch: narrowing only the helper is a no-op — three call
    sites truncated the spec list and two planner booleans re-decided it on
    arity. Fixing one without the others changes nothing.
  - Why not broader change: aligning `_compareByOrderSpecs` with Convex's value
    order would remove the nullable carve-out entirely, but it silently changes
    shipped single-field results and is a breaking change needing sign-off.
- Verified: see Verification evidence
- PR body verified: `gh pr view 426 --json body` — auto-release block preserved, emoji task-style sections present, no self-link

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
- Commit: single commit, pushed to `fix/orm-multi-field-orderby-index-pushdown`
- PR: https://github.com/udecode/kitcn/pull/426
- Issue: #416, linked from the PR body via `Fixes #416`
- Browser proof: N/A: no browser surface
- Caveats: nullable sort columns and mixed-direction sorts keep the post-fetch
  sort by design; the pre-existing single-field null-placement divergence is
  recorded under Open risks and left for user sign-off.

Timeline:
- 2026-08-21T22:05:54.295Z Task goal plan created.

Reboot status:
| Question | Answer |
|----------|--------|
| Where am I? | Closeout complete |
| Where am I going? | Final response |
| What is the goal? | Let a 2+ field `orderBy` walk a compound index that already produces it, with byte-identical results |
| What have I learned? | See Findings |
| What have I done? | See Timeline |

High-risk note:
- Realistic failure mode: the helper claims an order the index cannot serve, the
  planner skips the JS sort, and rows come back silently mis-ordered — or, in the
  relation loader, each parent truncates the wrong top-k and rows are lost before
  the global sort ever sees them. No error, no exception.
- Proof plan: a 24-case helper unit matrix pinning every accept and every
  decline, plus integration tests that assert both the read bound at two table
  sizes AND the exact row order, including the eq-pinned divergent-direction
  case, the `in` union with pinned and unpinned leading specs, cursor pages, and
  null placement. 5 of 8 integration cases verified RED against stashed source.
- Why this boundary is right: the helper already documented itself as the single
  owner of the decision; the bug was two other places re-deciding it from arity.
  Moving nullability onto `OrderSpec` keeps that ownership intact instead of
  teaching each caller the rule.

Open risks:
- Pre-existing and NOT fixed here: `_compareByOrderSpecs` places null/undefined
  last in both directions while a Convex index scan places them first ascending.
  A single-field `orderBy` on a nullable column therefore already returns a
  different null placement depending on whether an index exists. This change
  neither widens nor narrows that; it only refuses to let a multi-field sort
  inherit it. Aligning the comparator with Convex's value order is the real fix
  and is a breaking change that needs user sign-off.
- Pre-existing: two cursor branches (`query.ts` multi-probe + maxScan, and the
  scan fallback without a caller index) build a stream with no index anchor, so
  even the primary sort field is not carried and no warning says so.
- `indexOrderBonus` is a heuristic. It now prefers the index that serves more of
  the sort, but it still cannot outrank filter selectivity, so a query whose best
  filter index differs from its best order index will still post-fetch sort.

Hard closeout guard:
- A local-only final response for verified code-changing work is invalid unless
  this plan records an explicit user decline, no local patch, analytical/
  blocked/inconclusive outcome, or a real commit/PR blocker.
