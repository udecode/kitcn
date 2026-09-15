# Fix procedure name codegen merge conflicts

Objective:
Resolve issue #466 procedure-name lookup fragility; done when all reported cases have red-green proof, package/repo checks pass, review has 0 actionable findings, and a PR ships; plan docs/plans/466-fix-procedure-name-codegen-merge-conflicts.md.

Flow mode:
one-shot execution

Goal plan:
docs/plans/466-fix-procedure-name-codegen-merge-conflicts.md

Template:
docs/plans/templates/task.md

Primary template:
docs/plans/templates/task.md

Applied packs:
- package-api (docs/plans/templates/packs/package-api.md)

Task source:
- type: public GitHub bug report
- id / link: [udecode/kitcn#466](https://github.com/udecode/kitcn/issues/466)
- title: Codegen: `procedure-names.gen.ts` packs a whole module onto one line, so any two branches touching that module conflict — and neither side is the right answer
- task type: ordinary non-heavyweight package bug
- acceptance criteria: generated lookup entries are independently mergeable physical lines; a stale same-module callsite miss is visible during development; every source-listed case gets failing-before/passing-after focused proof; published package checks, review, PR, and issue sync close cleanly
- caveats: the report's position-free registry idea is exploratory and is not required unless source evidence proves it is the safer bounded owner
- likely files / package: `packages/kitcn/src/cli/codegen.ts`, `packages/kitcn/src/server/procedure-name.ts`, nearby tests, generated fixtures only if source ownership requires them, and one `.changeset/*.md`
- browser surface: none; this is generated TypeScript and server runtime behavior
- likely root-cause layer: CLI lookup-literal serialization plus server callsite lookup diagnostics

Timed checkpoint:
- requested duration: none
- semantics: N/A: no timed checkpoint requested
- initial confidence score: N/A: auditable case matrix and command gates are stronger
- improvement loop: reproduce each case, repair the owning boundary, rerun focused and package/repo gates, resolve review findings
- final score / loop closure: N/A: completion is binary against the threshold

Completion threshold:
- Both mandatory source cases fail before the fix and pass after it; the broader position-free alternative is explicitly accepted or rejected from source evidence; `bun --cwd packages/kitcn build`, relevant focused tests/typecheck/lint, and `bun check` pass; a changeset exists; autoreview has 0 actionable findings; the dedicated PR and QA issue sync exist.
- Task closure is legal only when the source-of-truth acceptance criteria are
  satisfied or explicitly narrowed, required verification evidence is recorded,
  code-review and release-artifact gates are closed when applicable, verified
  code changes are committed and PR'd unless explicitly declined or blocked,
  task-style PR body sync is complete or marked N/A with reason,
  GitHub issue/PR sync is complete or marked N/A with reason, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/466-fix-procedure-name-codegen-merge-conflicts.md` passes.

Verification surface:
- Focused codegen snapshot/string proof for one-entry-per-physical-line output.
- Focused procedure-name lookup/runtime proof for a visible stale same-module miss without false warnings for modules absent from the lookup.
- Package test/typecheck/build, root lint/check, changeset audit, branch autoreview, PR-body read-back, and GitHub issue comment read-back.

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
- Preserve exact-match lookup semantics for valid generated positions and avoid noisy diagnostics for callsites outside generated modules.
- Keep generated output deterministic and Convex function-entry import graphs unchanged or narrower.

Boundaries:
- Source of truth: issue #466, current `origin/main`, package source/tests, and generated-output ownership rules.
- Allowed edit scope: procedure-name codegen/lookup owners, focused tests, owned generated outputs if regeneration proves necessary, changeset, this dedicated plan, and existing checkout plan-only edits required by repo push policy.
- Browser surface: N/A: no browser-rendered or native browser behavior.
- GitHub issue sync: post a concise fixed-in-PR comment with QA steps after the PR exists and read it back.
- Non-goals: redesign the generated registry or remove positions unless the focused source/repro pass proves that broader change is necessary; no compatibility shim; no unrelated product work.

Output budget strategy:
- Read exact source/test files and bounded `rg` filename/match lists; exclude `node_modules`, `tmp`, build artifacts, and generated trees unless they are the named proof owner; cap ordinary output near 10k tokens and save broad check logs to temp artifacts when needed.

Blocked condition:
- Stop only if the behavior cannot be reproduced after focused source/tests and owned generation proof, required GitHub/package access fails repeatedly, or an unavoidable public-API decision materially exceeds issue scope.

Task state:
- task_type: bug
- task_complexity: normal non-trivial
- current_phase: commit / PR / GitHub sync
- current_phase_status: in_progress
- next_phase: closeout
- goal_status: active

Current verdict:
- verdict: valid
- confidence: 95% after both mandatory claims reproduced and passed focused fixes
- next owner: task
- reason: repo-owned generated-output and dynamic-module tests reproduced both claims; the bounded owners now pass focused proof

Implementation readiness:
- verdict: ready
- exact owner: CLI serializer for diff locality; server lookup boundary for stale-map diagnostics
- contradiction status: reporter's dev-only warning suggestion conflicts with Convex bundling, which hard-defines NODE_ENV as production; corrected to an always-on, deduplicated impossible-state warning
- source-listed cases complete: yes; two mandatory outcomes plus one design alternative row are recorded below

Pre-solution issue challenge:
- reporter claim: per-module single-line serialization causes unrelated same-module branches to conflict, and choosing either generated side leaves stale/missing entries that silently yield unnamed middleware procedure info.
- suggested diagnosis or fix: serialize one location per physical line, warn in development when a known module has no exact line match, and consider removing positions entirely.
- repro ladder:
  - tests / source-level repro: required; focused codegen and server lookup tests are the honest owning layer
  - repo-owned automated browser or integration proof: N/A unless focused source proof exposes a runtime-only gap
  - Browser plugin: N/A: no browser surface
  - screenshot / visual proof: N/A: generated source formatting is asserted as text, not visual UI
- reproduction verdict: both mandatory claims reproduced at the owning source/integration layer
- validity verdict: valid, with the dev-only gating suggestion corrected
- best long-term fix boundary: generated serializer plus lookup diagnostic owner, unless source evidence justifies the broader position-free redesign
- harsh honest feedback: taking either side of a generated conflict is operator error, but the current output maximizes that error surface and provides no runtime clue; both ergonomics and diagnosis need ownership fixes
- hard-stop decision: cleared after both claims reproduced; proceed with the bounded owner fixes

Completion rule:
- Do not call `update_goal(status: complete)` while any required checklist item
  remains unchecked. If an item does not apply, check it and add `N/A: <reason>`.
- Do not call `update_goal(status: complete)` until every completion threshold
  above is satisfied, final handoff evidence is recorded, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/466-fix-procedure-name-codegen-merge-conflicts.md` passes.
- Do not create hook state for this goal. This file plus the active goal are the
  durable state.

Start Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| Timed checkpoint parsed | no | N/A: no duration requested |
| Walkthrough baseline for possible UI change | no | N/A: generated TypeScript and server diagnostics have no rendered/UI output |
| Skill analysis before edits | yes | Loaded `task`, `autogoal`, `tdd`, and `changeset`; `autoreview` is deferred to the final diff; no browser/major-task/testing skill is warranted |
| Active goal checked or created | yes | `get_goal` returned none; created the #466 goal naming this plan |
| Source of truth read before edits | yes | `gh issue view 466 --comments` read full issue body; `VISION.md` and `docs/README.md` read |
| Exact per-PR task ownership | yes | This plan owns one not-yet-created PR for issue #466 |
| GitHub comments and attachments read | yes | Issue has zero comments and no attachments/video |
| Video transcript evidence required | no | N/A: no video or screen recording in source |
| Pre-solution issue challenge required | yes | Public bug report; falsifiable claims and case matrix recorded; verdict awaits focused repro |
| Reproduction verdict before implementation | yes | Both mandatory claims failed in focused owner tests before implementation; position-free alternative rejected from Convex source evidence |
| Repro escalation ladder selected | yes | Focused source/test proof first; browser and screenshots N/A |
| Suggested fix reviewed against durable boundary | yes | Treat one-entry lines and stale lookup diagnostics as bounded owners; position-free redesign must earn scope from evidence |
| `docs/solutions` checked for non-trivial existing-code work | yes | Bounded search found and read `docs/solutions/best-practices/middleware-logging-should-use-server-only-procedure-info-20260409.md`; it confirms callsite inference plus explicit `.name()` is the intended owner |
| TDD decision before behavior change or bug fix | yes | Use vertical focused red-green tests at codegen output and lookup behavior boundaries |
| Branch decision for code-changing task | yes | Created `codex/466-procedure-name-codegen` from current `origin/main`; carried three existing plan-only edits per repo push policy |
| Release artifact decision | yes | Published `kitcn` behavior changes require one patch changeset; reuse an active unreleased draft only if it already owns the same release slice |
| Browser tool decision for browser surface | no | N/A: no browser surface |
| Commit / PR expectation decision | yes | Commit entire checkout, push, and open one dedicated PR after `bun check` passes |
| Task-style PR body decision | yes | Use mandatory PR #270 emoji task format and verify by read-back |
| Task-plan PR body evidence | yes | Body will name this path; plan will be amended with exact PR and committed before autoclosure |
| GitHub issue sync expectation decision | yes | Post fixed-in-PR QA comment after PR creation and read back |
| Output budget strategy recorded | yes | Exact/bounded source reads and capped output recorded above |
| Package/API pack selected | yes | `package-api` materialized because published codegen/runtime behavior changes |
| Public surface or package boundary identified | yes | No public type/API signature expected; generated artifact format and runtime dev diagnostics are package-visible behavior |
| Convex entry/import graph impact identified | yes | No new runtime dependency or entrypoint export; final source audit will confirm |
| CLI/scaffold/generated impact identified | yes | CLI codegen output format changes; fixture regeneration applies only if existing ownership scripts produce committed output changes |
| Release artifact path selected | yes | `.changeset/*.md` patch for `kitcn` |
| `changeset` skill loaded when `.changeset` is required | yes | Read `.agents/skills/changeset/SKILL.md` before edits |
| Package build / fixture impact decision recorded | yes | `bun --cwd packages/kitcn build` required; fixture sync/check only if scaffold/generated fixture output changes |

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
- [ ] Final handoff shape decided: bug/feature/testing/batch/review/GitHub
      requirements, PR body sync, and issue sync when applicable.
- [ ] Commit/PR handling recorded for code-changing work: commit and PR
      completed, no local patch, user explicitly declined, or blocker recorded.
      "User did not separately ask for a PR" is not a valid blocker.
- [ ] PR body shape recorded: PR #270 emoji task-style body used, N/A reason
      recorded, or blocker recorded.
- [ ] PR task evidence recorded: body includes `🧭 Task plan: ...`, the plan
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
- [x] Package/API pack: no-artifact decisions state why the diff has no published package user-visible delta from `main`. N/A: a patch changeset is required and exists.
- [x] Package/API pack: compatibility, migration, or hard-cut decision is explicit when public shape changes. N/A: no public API/type shape changes.
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
| Named verification threshold | yes | Run the command, proof, source audit, or artifact check named in this plan | Focused red-green proof, owning suites, build, fixtures, typecheck, lint, autoreview, and full `bun check` passed |
| Exact per-PR task ownership | pending | Record the exact PR and dedicated plan, or the not-yet-created single-PR slice | pending |
| Pre-solution issue challenge verdict | pending | Record reporter claim, suggested fix, repro verdict, validity verdict, durable boundary, and hard-stop/pivot decision before implementation | pending |
| Repro escalation ladder | pending | For bug/behavior claims, record test/source-level, automated browser/integration, Browser, and screenshot/visual-proof outcomes or N/A/blocker reasons before `not reproduced` | pending |
| Bug reproduced before fix | yes | Record failing test/repro or N/A with reason | Codegen assertion failed 1 line vs 2; warning assertion failed 0 calls vs 1 |
| Targeted behavior verification | yes | Run focused test/proof for changed behavior or record N/A | Same focused tests pass; full owners pass 132/132 |
| TypeScript or typed config changed | yes | Run relevant typecheck | Standalone `bun typecheck` and the root check typecheck lane pass |
| Package exports or file layout changed | no | Run the relevant package build before final verification and keep generated updates | N/A: exports/layout unchanged; package build still passed for artifact proof |
| Package manifests, lockfile, or install graph changed | no | Run `bun install` and relevant package checks | N/A: no manifest or lockfile delta; existing install supports all checks |
| Agent rules or skills changed | no | Run `bun install` and verify generated skill sync | N/A: no agent rule/skill change |
| Workspace authority proof | yes | Run verification in the owning repo/package/app/route/tool and record cwd; do not count the wrong workspace as proof | All proof ran in `/Users/zbeyens/git/better-convex`; package build used `packages/kitcn` |
| Browser surface changed | no | Capture Browser Use proof or record explicit waiver/blocker | N/A: generated TypeScript and server runtime only |
| Browser final proof | no | Attach screenshot or exact browser verification caveat when browser proof applies | N/A: no browser behavior |
| UI walkthrough | no | If UI or rendered output changed, run `.agents/skills/walkthrough/SKILL.md` after final proof and show annotated images in the final handoff; otherwise record N/A | N/A: no UI/rendered output |
| Scaffold or fixture output changed | yes | Run `bun run fixtures:sync` and `bun run fixtures:check`, or record N/A | Sync regenerated six lookup files; check passed all eight variants |
| Package behavior or public API changed | yes | Add a changeset or record why no changeset applies | `.changeset/calm-otters-merge.md` adds a `kitcn` patch |
| Docs and kitcn skill sync changed | no | Keep `www/**` and `packages/kitcn/skills/kitcn/**` in sync, or record N/A | N/A: no current-state public guidance changed |
| Docs or content changed | no | For docs-heavy work, use `--template docs`; for incidental docs, verify source-backed claims, links, examples, and rendered output or record N/A | N/A: dedicated task plan plus carried prior plan closeout only; no product docs |
| High-risk mini gate | yes | For public API/runtime/package-boundary/browser/agent-action/command-contract changes, record realistic failure mode, proof plan, and why the chosen boundary is right; otherwise N/A | Failure modes are stale name silence and warning noise; exact stale/absent-module tests plus source audit prove serializer/lookup ownership |
| Agent-native review for agent/tooling changes | no | For `.agents/**`, `.claude/**`, `.codex/**`, skills, hooks, commands, prompts, or user-action tooling, load `.agents/skills/agent-native-reviewer/SKILL.md` and close accepted/actionable findings, or record N/A | N/A: no agent/tooling workflow files changed |
| Local install corruption suspected | no | Run `bun install` once, rerun the exact failing command, or record N/A | N/A: transient typecheck was caused by concurrent package-dist cleaning; standalone rerun passed |
| Commit created | pending | For verified code-changing work, stage the entire current checkout per repo policy and create a commit; N/A only for no local patch, explicit user decline, analytical/blocked/inconclusive work, or recorded external blocker | pending |
| PR create or update | pending | For verified code-changing work, run `check`, push, create or update the PR, and sync PR body to the task-style final handoff; N/A only for no local patch, explicit user decline, analytical/blocked/inconclusive work, or recorded external blocker | pending |
| Task-style PR body verified | pending | Verify the PR body with `gh pr view --json body`; it must preserve auto-release blocks when applicable, must not include a current-PR self-link, and must use the PR #270 emoji format: `🐛 Fixes ...`, `🟢 95-100% confidence`, `Phase / 🧪 Tests / 🌐 Browser` table, and bold emoji Outcome/Caveat/Design/Verified sections | pending |
| PR task evidence verified | pending | Verify body plan line, plan at PR head, and exact PR ownership | pending |
| PR proof image hosting | pending | If PR body needs browser proof, replace local image paths with hosted GitHub URLs or record N/A | pending |
| GitHub issue sync-back | pending | Post concise issue sync after PR exists, or record N/A/blocker | pending |
| Final handoff contract | pending | Fill the final handoff fields below with exact PR/issue/confidence/tests/browser/outcome/caveats/design/verification content or N/A reason | pending |
| Final lint | yes | Run `bun lint:fix` or scoped equivalent | `bun lint:fix` passed; root `bun check` lint lane passed |
| Output budget discipline | yes | Verify no unbounded high-volume command output was streamed, or record the accidental output and recovery | Broad `bun check` output was capped and polled; source/search reads stayed bounded |
| Timed checkpoint | no | If duration was requested, keep improving until elapsed, then finish the current loop cleanly; otherwise N/A | N/A: no duration requested |
| Autoreview for non-trivial implementation changes | yes | Load `.agents/skills/autoreview/SKILL.md`; use dirty local `--mode local`, branch/PR `--mode branch --base <base>`, or committed slice `--mode commit --commit <ref>` until no accepted/actionable findings, or record N/A for docs-only/trivial/no local patch | Dirty local review clean; no accepted/actionable findings, overall 0.99 correct |
| Goal plan complete | yes | Run `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/466-fix-procedure-name-codegen-merge-conflicts.md` | pending |
| Public API / package boundary proof | yes | Source-audit public API, exports, and package boundary impact | No export or type signature changes; only generated formatting and stale-map runtime diagnostic |
| Convex bundle/import proof | yes | Audit affected function-entry static graphs or record N/A | No imports added to `procedure-name.ts`; existing server entry graph remains unchanged |
| CLI/scaffold/generated proof | yes | Prove command contract and regenerate owned output or record N/A | Deterministic codegen test plus owner fixture sync/check passed |
| Release artifact classification | yes | Record whether the change is published package behavior/API/types/config/runtime or no published user-visible delta | Published package codegen/runtime behavior: patch |
| Published package changeset | yes | If published package users see a delta, load `changeset` and add/update one `.changeset/*.md` per package | Changeset skill loaded; `calm-otters-merge.md` targets `kitcn` patch and `changeset status` resolves 0.33.5 |
| No release artifact | no | If no artifact is needed, record the exact reason: internal-only, docs-only, agent-only, test-only, or no user-visible delta from `main` | N/A: published delta has a patch changeset |
| Package typecheck/build/test | yes | Run owning package checks or record N/A with reason | Package build, root typecheck, 132 owning tests, and `bun check` pass |
| Fixture/scaffold generation | yes | Run `bun run fixtures:sync` and `bun run fixtures:check` when scaffold output changed, otherwise N/A | Sync/check pass; six generated lookup fixtures changed |
| Docs/package skill sync | no | Synchronize current-state public guidance or record N/A | N/A: no public guidance change |

Phase / pass table:
| Phase | Status | Evidence | Next |
|-------|--------|----------|------|
| Intake and source read | complete | issue, doctrine, solution, and Convex source read; claims challenged | implementation |
| Implementation | complete | multiline serializer, deduplicated stale-map diagnostic, focused tests, generated fixtures, changeset | verification |
| Verification | complete | focused red-green proof, 132 owning tests, package build, fixture sync/check, typecheck, lint, zero slop delta, clean autoreview, full `bun check` | commit and PR |
| Commit / PR / GitHub sync | in_progress | release/diff audit clean | commit, push, PR body, issue comment |
| Closeout | pending | | final response |

Findings:
- Issue #466 has no comments, attachments, or open PR referencing it.
- Source evidence names the serializer and exact-line lookup owners; the report does not prove that a position-free registry can identify a builder call before export binding.
- `procedure-name.ts` captures the builder callsite once at definition time; generated runtime registries contain function references for callers but are not available to identify the registered function object while the builder constructs it.
- Local Convex source confirms registration returns a registered function without `Symbol.for("functionName")`; only generated/reference proxies expose that symbol. Dropping positions would therefore remove automatic name inference rather than simplify it.
- Existing builder integration tests already create real temporary modules and generated lookup registration, so they are the honest stale-line warning harness; the existing codegen integration test owns generated file text.
- Local Convex bundler source hard-defines `process.env.NODE_ENV` to `"production"` for function bundles, including local development; a NODE_ENV-gated warning would be dead code. The diagnostic must instead be always-on for the impossible/stale state and deduplicated once per module.

Decisions and tradeoffs:
- Treat the first two suggested fixes as mandatory acceptance candidates and the third as an architectural alternative -> keeps the task bounded while still challenging the best owner -> may be revised if source audit disproves the current ownership model.
- Reject the position-free redesign for this task -> the construction-time function object has no export binding or Convex function-name symbol, while the separate generated caller registry is downstream-only -> positions remain necessary until Convex or builder registration exposes stable identity.
- Use an always-on, once-per-module warning rather than a NODE_ENV gate -> Convex erases the local/production distinction at bundle time, while the warning only occurs when generated state contradicts the executing module -> deployed stale maps remain visible without log floods.

Implementation notes:
- `emitProcedureNameLookupLiteral` emits an indented entry plus trailing comma on its own physical line inside each module array.
- `inferProcedureNameFromCallsite` warns once per module when generated entries exist but none match the captured line; it still returns `undefined` and preserves explicit `.name()` / Convex symbol precedence.
- Added a patch changeset at `.changeset/calm-otters-merge.md`.

Review fixes:
- None. Dirty-local autoreview completed with no accepted/actionable findings; overall assessment `patch is correct (0.99)`.

Error attempts:
| Error / failed attempt | Count | Next different move | Resolution |
|------------------------|-------|---------------------|------------|
| Added the second stale procedure to the preceding valid fixture by matching an overly broad test-source hunk | 1 | Inspect the exact test slice and move the line into the stale fixture | Corrected; both stale-warning tests pass |
| Ran root typecheck concurrently with fixture verification, whose package rebuild temporarily cleaned `packages/kitcn/dist` | 1 | Let fixture generation finish, then rerun the exact typecheck alone | Standalone `bun typecheck` passed; no install corruption or source fault |

Verification evidence:
- 🔴 2026-09-15: focused codegen test failed as expected: two same-module procedures produced one physical entry line (`Expected length: 2`, `Received length: 1`).
- 🟢 2026-09-15: the same focused codegen test passed after multiline emission.
- 🔴 2026-09-15: focused builder integration test confirmed stale entry behavior returns `name: undefined` and emitted 0 warnings (`Expected: 1`).
- 🟢 2026-09-15: stale-entry integration passes, emits exactly one actionable warning for two missed procedures in the same module, and preserves `name: undefined`.
- 🟢 2026-09-15: an untracked module with no generated entries emits no warning.
- 🟢 2026-09-15: `bun --cwd packages/kitcn build` passed.
- 🟢 2026-09-15: `bun run fixtures:sync` regenerated exactly six procedure-name lookup fixtures; `bun run fixtures:check` passed all eight fixture variants.
- 🟢 2026-09-15: standalone `bun typecheck` passed after the invalid concurrent build/typecheck attempt completed.
- 🟢 2026-09-15: `bun lint:fix` passed and `bun run lint:slop:delta` reports zero occurrence or score changes after consolidating test setup.
- 🟢 2026-09-15: full owning suites passed: 132 tests, 0 failures, 633 assertions across `codegen.test.ts` and `builder.test.ts`.
- 🟢 2026-09-15: `.agents/skills/autoreview/scripts/autoreview --mode local` passed secret scan and reported no accepted/actionable findings; overall `patch is correct (0.99)`.
- 🟢 2026-09-15: full `bun check` passed lint, typecheck, tests, CLI/Concave lanes, all eight fresh fixture comparisons, and runtime scenarios.
- 🟢 2026-09-15: `bunx changeset status` resolves `calm-otters-merge` as a `kitcn` patch from 0.33.4 to 0.33.5.

Source-listed case matrix:
| Case | Source claim | Harness | Before | Expected after | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Merge-local generated output | Each procedure location in a module is emitted on its own physical line so unrelated additions do not rewrite/conflict with the entire module line | Focused codegen output test using multiple entries | 🔴 Focused test received 1 matching physical line instead of 2 | One entry per physical line with deterministic ordering and valid TypeScript | `bun test packages/kitcn/src/cli/codegen.test.ts --test-name-pattern 'generateMeta emits server-side procedure name lookup registration'` -> 1 pass | fixed |
| Loud stale same-module miss | A callsite in a module that has generated entries but no exact line match returns no inferred name without any signal | Focused procedure-name behavior tests with captured diagnostic | 🔴 Lookup returned `undefined` and warning spy received 0 calls | Lookup remains unresolved but emits one actionable warning once per module; absent modules do not warn | `bun test packages/kitcn/src/server/builder.test.ts --test-name-pattern 'middleware (warns when|does not warn when)'` -> 2 pass | fixed |
| Position-free redesign | Export-name registry may make positions unnecessary | Source audit of registration/callsite ownership and generated registry access | Construction-time builder lacks its eventual export binding | Explicit accept/reject decision without compatibility debris | Local Convex `registration_impl.ts` and `api.ts`; kitcn builder/registry source audit | rejected: positions remain required |

Final handoff contract:
- Commit line: pending
- PR line: pending
- Issue line: pending
- Confidence line: pending
- Flow table:
  - Reproduced: tests pending, browser pending
  - Verified: tests pending, browser pending
- Browser check: pending
- Outcome: pending
- Caveat: pending
- Design:
  - Chosen boundary: pending
  - Why not quick patch: pending
  - Why not broader change: pending
- Verified: pending
- PR body verified: pending

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
- Commit: pending
- PR: pending
- Issue: pending
- Browser proof: pending
- Caveats: pending

Timeline:
- 2026-09-15T14:40:54.312Z Task goal plan created.
- 2026-09-15T14:41Z Read issue #466, comments, task/autogoal/TDD/changeset skills, `VISION.md`, and docs ownership; created active goal and dedicated branch.

Reboot status:
| Question | Answer |
|----------|--------|
| Where am I? | Verification |
| Where am I going? | Full owning tests, autoreview, `bun check`, commit/PR/GitHub sync, closeout |
| What is the goal? | Resolve the generated lookup merge-conflict and stale-miss safety cases, verify the package/repo, review cleanly, and ship one dedicated PR |
| What have I learned? | Position lookup is still required at builder construction time; Convex hard-defines NODE_ENV to production, so the stale-state warning must be always-on and deduplicated |
| What have I done? | Implemented and proved both bounded fixes, regenerated owned fixtures, added the patch changeset, passed build/typecheck/lint, and reduced slop delta to zero |

Open risks:
- The warning is intentionally emitted in deployed bundles when a generated map contains the module but misses the callsite; once-per-module deduplication bounds noise, and absent modules stay silent.
- Final full-suite, autoreview, repo check, and GitHub delivery gates remain open.

Hard closeout guard:
- A local-only final response for verified code-changing work is invalid unless
  this plan records an explicit user decline, no local patch, analytical/
  blocked/inconclusive outcome, or a real commit/PR blocker.
