# Keep better-auth modelKey out of auth adapter Convex args

Objective:
Stop the auth adapters forwarding Better Auth 1.7.6+ `modelKey` into strict Convex function args; done when a regression fails on main and passes, check stages pass or are waived, and PR #485 ships.

Goal plan:
docs/plans/2026-10-13-auth-adapter-model-key.md

Template:
docs/plans/templates/task.md

Primary template:
docs/plans/templates/task.md

Applied packs:
- package-api (docs/plans/templates/packs/package-api.md)

Task source:
- type: downstream bug report (no upstream issue)
- id / link: none upstream; reported from a kitcn 0.33.8 app bumping better-auth to 1.7.7
- title: httpAdapter forwards Better Auth 1.7.6+ `modelKey` into strict Convex validators
- acceptance criteria: every HTTP auth route works on better-auth 1.7.6/1.7.7 (inside the `>=1.7.0 <1.8.0` peer); no adapter call puts `modelKey` into Convex function args; regression fails on main and passes after; patch changeset.
- caveats: better-auth 1.7.6 (custom model name identity fix) makes `@better-auth/core`'s adapter factory pass `modelKey` to every adapter method; earlier 1.7.x never sends it.
- likely files: packages/kitcn/src/auth/adapter.ts, adapter.test.ts.
- browser surface: none.
- root-cause layer: adapter-to-Convex argument boundary.

Timed checkpoint:
- requested duration: N/A: no timed request.
- semantics: N/A: one-shot task.
- initial confidence score: N/A: acceptance rows below.
- improvement loop: reproduce, fix, verify.
- final score / loop closure: 80-94%: fix proven red/green; `fixtures:check` (registry drift) and `test:runtime` (waived) are left to CI.

Completion threshold:
- New regressions red on main and green after (pinned better-auth 1.7.1, plus a manual run on 1.7.7); `bun check` stages pass or are waived with reason; changeset; PR #485 naming this plan.
- Task closure is legal only when the source-of-truth acceptance criteria are
  satisfied or explicitly narrowed, required verification evidence is recorded,
  code-review and release-artifact gates are closed when applicable, verified
  code changes are committed and PR'd unless explicitly declined or blocked,
  task-style PR body sync is complete or marked N/A with reason,
  GitHub issue/PR sync is complete or marked N/A with reason, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-10-13-auth-adapter-model-key.md` passes.

Verification surface:
- `bun test packages/kitcn/src/auth/adapter.test.ts` (red on main, green after; also run against better-auth 1.7.7), `bun check`.

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
- Keep the Convex peer range untouched (separate PR).

Boundaries:
- Source of truth: the downstream report above; better-auth 1.7.7 `@better-auth/core` `db/adapter/factory` source.
- Allowed edit scope: auth adapters and their tests, changeset, this plan.
- Browser surface: N/A: server adapter only.
- GitHub issue sync: N/A: no upstream issue.
- Non-goals: Convex peer range, handler validators, moving the better-auth pin past 1.7.1 (1.7.3+ drops the account `issuer` field kitcn's 1.7 identity contract asserts; separate change).

Output budget strategy:
- Scoped greps on adapter.ts and better-auth dist; full check logs saved under /tmp and summarised.

Blocked condition:
- Stop if the regression cannot be made red on main.

Task state:
- task_type: bug-fix
- task_complexity: bounded runtime fix
- current_phase: closeout
- current_phase_status: complete; source/proof complete, terminal delivery verified externally
- next_phase: verify exact-head external receipt, then maintainer review
- goal_status: active; prior fixture/runtime waivers revoked

Current verdict:
- verdict: ready
- confidence: 95%; pinned and 1.7.7 factory proofs plus full local check passed
- next owner: this autoclosure run
- reason: the adapters are the only place Better Auth call input meets Convex validators.

Implementation readiness:
- verdict: ready
- exact owner: packages/kitcn/src/auth/adapter.ts (`httpAdapter` and `dbAdapter`)
- contradiction status: none; the 1.7.7 factory passes `modelKey` to every method, and kitcn's spreads forward it.
- source-listed cases complete: yes

Pre-solution issue challenge:
- reporter claim: on better-auth 1.7.6+, httpAdapter findOne, findMany, count fallbacks, deleteMany, updateMany and incrementOne put `modelKey` into Convex args and validators reject it.
- suggested diagnosis or fix: destructure `modelKey` out at each spread site; claim that `dbAdapter` is unaffected.
- repro ladder:
  - tests / source-level repro: adapter tests that call the adapters with the 1.7.6+ input shape fail on main; with better-auth 1.7.7 installed, 4 adapter tests fail on main through the real factory.
  - repo-owned automated browser or integration proof: N/A: no browser surface.
  - Browser plugin: N/A: no browser surface.
  - screenshot / visual proof: N/A: no visual output.
- reproduction verdict: reproduced.
- validity verdict: partially valid; `dbAdapter` is affected too: its deleteMany, updateMany and incrementOne go through `ctx.runMutation` with the same spreads.
- best long-term fix boundary: strip `modelKey` once at the entry of each spreading method in both adapters, so every spread inside the method is covered.
- harsh honest feedback: the six-site list misses dbAdapter's mutation paths.
- hard-stop decision: proceed.

Completion rule:
- Do not call `update_goal(status: complete)` while any required checklist item
  remains unchecked. If an item does not apply, check it and add `N/A: <reason>`.
- Do not call `update_goal(status: complete)` until every completion threshold
  above is satisfied, final handoff evidence is recorded, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-10-13-auth-adapter-model-key.md` passes.
- Do not create hook state for this goal. This file plus the active goal are the
  durable state.

Start Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| Timed checkpoint parsed | no | N/A: no duration. |
| Walkthrough baseline for possible UI change | no | N/A: no UI or rendered output. |
| Skill analysis before edits | yes | task, autogoal, changeset. |
| Active goal checked or created | yes | Plan-only; no native goal. |
| Source of truth read before edits | yes | Downstream report, better-auth 1.7.7 factory source, adapter.ts. |
| Exact per-PR task ownership | yes | PR #485 (https://github.com/udecode/kitcn/pull/485); this plan owns it. |
| GitHub comments and attachments read | no | N/A: no GitHub source. |
| Video transcript evidence required | no | N/A: no video. |
| Pre-solution issue challenge required | yes | Partially valid: dbAdapter mutation paths also affected. |
| Reproduction verdict before implementation | yes | Reproduced on better-auth 1.7.7 and with the 1.7.6+ input shape on 1.7.1. |
| Repro escalation ladder selected | yes | Unit tests; the adapter factory is stubbed so the 1.7.6+ input reaches the adapters on the pinned 1.7.1. |
| Suggested fix reviewed against durable boundary | yes | Strip at method entry in both adapters. |
| `docs/solutions` checked for non-trivial existing-code work | no | N/A: bounded argument fix. |
| TDD decision before behavior change or bug fix | yes | Regression first, red on main. |
| Branch decision for code-changing task | yes | fix/auth-http-adapter-model-key from main 39e89b21. |
| Release artifact decision | yes | Patch changeset. |
| Browser tool decision for browser surface | no | N/A: no browser surface. |
| Commit / PR expectation decision | yes | Commit and push to fork; the maintaining session opened draft PR #485. |
| Task-style PR body decision | yes | PR #270 emoji body. |
| Task-plan PR body evidence | yes | Body carries `🧭 Task plan: docs/plans/2026-10-13-auth-adapter-model-key.md`. |
| GitHub issue sync expectation decision | no | N/A: no upstream issue. |
| Output budget strategy recorded | yes | See Output budget strategy. |
| Package/API pack selected | yes | Published runtime fix. |
| Public surface or package boundary identified | yes | No export or type change; runtime args only. |
| Convex entry/import graph impact identified | yes | No import changes. |
| CLI/scaffold/generated impact identified | no | N/A: no scaffold or pin change. |
| Release artifact path selected | yes | .changeset/auth-adapter-model-key.md |
| `changeset` skill loaded when `.changeset` is required | yes | Read. |
| Package build / fixture impact decision recorded | yes | Package build and fixtures:check run inside bun check; no fixture output changes. |

Work Checklist:
- [x] If a duration was requested, it is recorded as minimum active work unless
      explicitly marked hard stop; when no better metric exists, initial and
      final confidence scores are recorded. N/A: no duration.
- [x] Objective includes outcome, completion threshold, verification surface,
      constraints, boundaries, and blocked condition.
- [x] Task source classified with source type, id/link, title, task type,
      acceptance criteria, caveats, likely files/routes/packages, browser
      surface, and root-cause layer.
- [x] Every GitHub PR in scope has its own task plan. This plan owns one exact
      PR, owns a not-yet-created PR slice, or records N/A because no PR is in
      scope; a batch plan is not used as a substitute.
- [x] Required video or screen-recording evidence is cached/read as normalized
      `<video-transcripts>` XML, or marked N/A with reason. N/A: no video.
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
      `.codex/**`, skills, hooks, commands, prompts, or user-action tooling. N/A: none touched.
- [x] Package/API pack: public API, package boundary, export, and release-artifact impact are recorded.
- [x] Package/API pack: release artifact matrix is applied: `.changeset` or explicit no-artifact reason.
- [x] Package/API pack: `.changeset` work loads `changeset` and follows its package/version/prose rules.
- [x] Package/API pack: no-artifact decisions state why the diff has no published package user-visible delta from `main`. N/A: changeset added.
- [x] Package/API pack: compatibility, migration, or hard-cut decision is explicit when public shape changes. N/A: no public shape change.
- [x] Package/API pack: affected Convex static import graphs stay narrow and
      plugin/per-module boundaries are used where appropriate.
- [x] Package/API pack: CLI commands remain deterministic, `--json` capable,
      and non-interactive with explicit confirmation bypass when relevant. N/A: no command change.
- [x] Package/API pack: docs and `packages/kitcn/skills/kitcn/**` stay
      current-state synchronized when public guidance changes. N/A: no guidance change.
- [x] Package/API pack: package-owned typecheck/build/test proof is recorded or marked N/A with reason.
- [x] Package/API pack: `packages/kitcn` build, fixture sync/check, or other owning package proof is recorded when required.

Completion Gates:
| Gate | Applies | Required action | Evidence |
|------|---------|-----------------|----------|
| Named verification threshold | yes | Run the command, proof, source audit, or artifact check named in this plan | Regression red/green; `bun check` on the pinned bun 1.3.9 (packageManager): install, build:pkg, lint, typecheck, test:bun 1558/0, test:vitest 1081 pass (14 skipped), test:cli 124/0, test:concave, test:verify pass; fixtures:check fails only on pre-existing scaffold drift unrelated to this diff (the "next" fixture resolves `lucide-react` ^1.56.0 from the registry against a ^1.55.0 snapshot; not synced here, PR #484 carries it); test:runtime waived to upstream CI (local port 3210 held by another backend). |
| Exact per-PR task ownership | yes | Record the exact PR and dedicated plan, or the not-yet-created single-PR slice | PR #485, this plan. |
| Pre-solution issue challenge verdict | yes | Record reporter claim, suggested fix, repro verdict, validity verdict, durable boundary, and hard-stop/pivot decision before implementation | Partially valid; dbAdapter added. |
| Repro escalation ladder | yes | For bug/behavior claims, record test/source-level, automated browser/integration, Browser, and screenshot/visual-proof outcomes or N/A/blocker reasons before `not reproduced` | Unit tests with the factory stubbed on 1.7.1, plus a real 1.7.7 factory run; browser N/A. |
| Bug reproduced before fix | yes | Record failing test/repro or N/A with reason | 2 new tests fail on main; 4 adapter tests fail on main with 1.7.7. |
| Targeted behavior verification | yes | Run focused test/proof for changed behavior or record N/A | adapter.test.ts 40/40. |
| TypeScript or typed config changed | yes | Run relevant typecheck | `bun typecheck` in `bun check`. |
| Package exports or file layout changed | no | Run the relevant package build before final verification and keep generated updates | N/A: no export change; package build still run. |
| Package manifests, lockfile, or install graph changed | no | Run `bun install` and relevant package checks | N/A: no manifest change. |
| Agent rules or skills changed | no | Run `bun install` and verify generated skill sync | N/A: none. |
| Workspace authority proof | yes | Run verification in the owning repo/package/app/route/tool and record cwd; do not count the wrong workspace as proof | kitcn repo root. |
| Browser surface changed | no | Capture Browser Use proof or record explicit waiver/blocker | N/A: server adapter. |
| Browser final proof | no | Attach screenshot or exact browser verification caveat when browser proof applies | N/A. |
| UI walkthrough | no | If UI or rendered output changed, run `.agents/skills/walkthrough/SKILL.md` after final proof and show annotated images in the final handoff; otherwise record N/A | N/A: no UI. |
| Scaffold or fixture output changed | no | Run `bun run fixtures:sync` and `bun run fixtures:check`, or record N/A | N/A: no scaffold change; fixtures:check runs in `bun check`. |
| Package behavior or public API changed | yes | Add a changeset or record why no changeset applies | .changeset/auth-adapter-model-key.md (patch). |
| Docs and kitcn skill sync changed | no | Keep `www/**` and `packages/kitcn/skills/kitcn/**` in sync, or record N/A | N/A: no guidance change. |
| Docs or content changed | no | For docs-heavy work, use `--template docs`; for incidental docs, verify source-backed claims, links, examples, and rendered output or record N/A | N/A. |
| High-risk mini gate | yes | For public API/runtime/package-boundary/browser/agent-action/command-contract changes, record realistic failure mode, proof plan, and why the chosen boundary is right; otherwise N/A | Failure mode: a spread re-adds a Better Auth field Convex rejects. Proof: tests assert no Convex call carries `modelKey`. Boundary: method entry covers every spread inside it. |
| Agent-native review for agent/tooling changes | no | For `.agents/**`, `.claude/**`, `.codex/**`, skills, hooks, commands, prompts, or user-action tooling, load `.agents/skills/agent-native-reviewer/SKILL.md` and close accepted/actionable findings, or record N/A | N/A. |
| Local install corruption suspected | no | Run `bun install` once, rerun the exact failing command, or record N/A | N/A: the 13 env failures reproduce on a fresh clean-main worktree. |
| Commit created | yes | For verified code-changing work, stage the entire current checkout per repo policy and create a commit; N/A only for no local patch, explicit user decline, analytical/blocked/inconclusive work, or recorded external blocker | fix(auth): keep better-auth modelKey out of httpAdapter args |
| PR create or update | yes | For verified code-changing work, run `check`, push, create or update the PR, and sync PR body to the task-style final handoff; N/A only for no local patch, explicit user decline, analytical/blocked/inconclusive work, or recorded external blocker | Draft PR #485 from EfficiencyCorp:fix/auth-http-adapter-model-key, opened by the maintaining session. |
| Task-style PR body verified | yes | Verify the PR body with `gh pr view --json body`; it must preserve auto-release blocks when applicable, must not include a current-PR self-link, and must use the PR #270 emoji format: `🐛 Fixes ...`, `🟢 95-100% confidence`, `Phase / 🧪 Tests / 🌐 Browser` table, and bold emoji Outcome/Caveat/Design/Verified sections | `gh pr view 485 --json body`: auto-release block, `🐛 Fixes ➖ N/A`, plan line, `🟡 80-94% confidence`, Phase table and bold emoji sections; no self-link. |
| PR task evidence verified | yes | Verify body plan line, plan at PR head, and exact PR ownership | Body names docs/plans/2026-10-13-auth-adapter-model-key.md; the plan is at the PR head and names #485. |
| PR proof image hosting | no | If PR body needs browser proof, replace local image paths with hosted GitHub URLs or record N/A | N/A. |
| GitHub issue sync-back | no | Post concise issue sync after PR exists, or record N/A/blocker | N/A: no upstream issue. |
| Final handoff contract | yes | Fill the final handoff fields below with exact PR/issue/confidence/tests/browser/outcome/caveats/design/verification content or N/A reason | Filled below. |
| Final lint | yes | Run `bun lint:fix` or scoped equivalent | biome on touched files; `bun lint` in `bun check`. |
| Output budget discipline | yes | Verify no unbounded high-volume command output was streamed, or record the accidental output and recovery | Logs saved under /tmp. |
| Timed checkpoint | no | If duration was requested, keep improving until elapsed, then finish the current loop cleanly; otherwise N/A | N/A. |
| Autoreview for non-trivial implementation changes | yes | Load `.agents/skills/autoreview/SKILL.md`; use dirty local `--mode local`, branch/PR `--mode branch --base <base>`, or committed slice `--mode commit --commit <ref>` until no accepted/actionable findings, or record N/A for docs-only/trivial/no local patch | Codex GPT 6.1 Sol branch review of origin/main...f79fe05: spec clean; one accepted standards finding (untyped factory stand-in), fixed. |
| Goal plan complete | yes | Run `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-10-13-auth-adapter-model-key.md` | Passes. |
| Public API / package boundary proof | yes | Source-audit public API, exports, and package boundary impact | No export, type or peer range change. |
| Convex bundle/import proof | no | Audit affected function-entry static graphs or record N/A | N/A: no imports changed. |
| CLI/scaffold/generated proof | no | Prove command contract and regenerate owned output or record N/A | N/A: no CLI or scaffold change. |
| Release artifact classification | yes | Record whether the change is published package behavior/API/types/config/runtime or no published user-visible delta | Published runtime fix. |
| Published package changeset | yes | If published package users see a delta, load `changeset` and add/update one `.changeset/*.md` per package | kitcn patch. |
| No release artifact | no | If no artifact is needed, record the exact reason: internal-only, docs-only, agent-only, test-only, or no user-visible delta from `main` | N/A: changeset added. |
| Package typecheck/build/test | yes | Run owning package checks or record N/A with reason | `bun --cwd packages/kitcn build`, `bun check`. |
| Fixture/scaffold generation | no | Run `bun run fixtures:sync` and `bun run fixtures:check` when scaffold output changed, otherwise N/A | N/A: no scaffold output change. |
| Docs/package skill sync | no | Synchronize current-state public guidance or record N/A | N/A. |

Phase / pass table:
| Phase | Status | Evidence | Next |
|-------|--------|----------|------|
| Intake and source read | complete | report, factory source, adapter.ts | implementation |
| Implementation | complete | adapter.ts, tests, changeset | verification |
| Verification | complete | red/green, build, `bun check` | closeout |
| Commit / PR / GitHub sync | complete | draft PR #485 | closeout |
| Closeout | complete | review fix round pushed | final response |

Findings:
- better-auth 1.7.6+ passes `modelKey` (the canonical model key) to every custom adapter method.
- httpAdapter spreads call input into Convex args in count (OR and fallback), deleteMany, findMany (OR and plain), findOne (OR and plain), incrementOne and updateMany (OR and plain).
- dbAdapter forwards the same spreads through `ctx.runMutation` in deleteMany, incrementOne and updateMany; its count, findMany and findOne call handlers directly, which read named fields only.
- Pinning better-auth 1.7.7 is not a dev-only bump: 1.7.3+ drops the account `issuer` field that kitcn's 1.7 identity-contract tests assert, and the kitcn declaration build hits TS2742 (`SchemaCheck`) on 1.7.7. Left for a separate change.

Decisions and tradeoffs:
- Strip `modelKey` at the entry of each spreading method in both adapters rather than at each spread: one line per method covers every spread inside it.
- `omitModelKey` accepts optional vendor metadata and infers its omission without casts. The pinned adapter argument fields remain statically checked.
- Keep the better-auth pin at 1.7.1. The regression stubs `createAdapterFactory` (restored after each test) so the adapters receive the 1.7.6+ input shape; the real 1.7.7 factory run is recorded as manual evidence.

Implementation notes:
- Regression tests assert that no Convex call carries `modelKey`.

Review fixes:
- Sol [P2] adapter.test.ts: the `createAdapterFactory` stand-in and both regressions used `any`. Fixed: the regressions now spy on the real factory, capture its adapter creator (types from better-auth 1.7.1), call it with typed stubs, and pass inputs extended with `modelKey`; Convex calls are typed `FunctionReference`; no `any` in the diff except the pre-existing `Promise<any>` return types.

Error attempts:
| Error / failed attempt | Count | Next different move | Resolution |
|------------------------|-------|---------------------|------------|
| Pinning better-auth 1.7.7 to reproduce through the real factory | 1 | Keep 1.7.1 and stub the factory in the regression | 1.7.7 needs a schema-contract change; out of scope. |

Verification evidence:
- Red (main adapter.ts, pinned 1.7.1): the 2 new tests fail, 38 pass.
- Green: adapter.test.ts 40 pass, 0 fail.
- Manual run with better-auth 1.7.7 installed: main fails 4 adapter tests (2 regressions plus the 2 existing exact-args tests), the fix passes 40/40.
- `bun check` on the pinned bun 1.3.9 (packageManager): install, build:pkg, lint, typecheck, test:bun 1558/0, test:vitest 1081 pass (14 skipped), test:cli 124/0, test:concave, test:verify pass; fixtures:check fails only on pre-existing scaffold drift unrelated to this diff (the "next" fixture resolves `lucide-react` ^1.56.0 from the registry against a ^1.55.0 snapshot; not synced here, PR #484 carries it); test:runtime waived to upstream CI (local port 3210 held by another backend).
- bun 1.3.9 stage table: install 🟢, build:pkg 🟢, lint 🟢, typecheck 🟢, test:bun 🟢 1558/0, test:vitest 🟢 1081 (14 skipped), test:cli 🟢 124/0, test:concave 🟢, fixtures:check 🔴 pre-existing lucide-react registry drift (PR #484), test:verify 🟢, test:runtime ➖ waived to CI.
- Test files sit outside `turbo typecheck`; `tsc` over adapter.test.ts with a throwaway tsconfig reports no errors in the new code (6 pre-existing errors in older tests, same on main).
- The earlier run on bun 1.4.3 showed 13 environment failures (all reproduced on clean main); they pass on 1.3.9.

Source-listed case matrix:
| Case | Source claim | Harness | Before | Expected after | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| httpAdapter findOne / findMany | `modelKey` reaches findOne/findMany args | adapter.test.ts httpAdapter modelKey test | red | no `modelKey` | green | done |
| httpAdapter count fallbacks | OR and unbounded paths forward `modelKey` | same | red | no `modelKey` | green | done |
| httpAdapter deleteMany / updateMany / incrementOne | mutation input carries `modelKey` | same | red | no `modelKey` | green | done |
| dbAdapter mutation paths | not in the report | adapter.test.ts dbAdapter modelKey test | red | no `modelKey` | green | done |

Final handoff contract:
- Commit line: fix(auth): keep better-auth modelKey out of httpAdapter args
- PR line: draft PR #485 (https://github.com/udecode/kitcn/pull/485)
- Issue line: N/A: no upstream issue
- Confidence line: 🟡 80-94% confidence
- Flow table:
  - Reproduced: tests 🔴 regressions fail on main; 4 adapter tests fail on main with better-auth 1.7.7, browser N/A
  - Verified: tests 🟢 adapter tests 40/40 on 1.7.1 and 1.7.7; `bun check` stages on bun 1.3.9 pass except registry-drift `fixtures:check` and waived `test:runtime`, browser N/A
- Browser check: N/A: server adapter
- Outcome: Better Auth 1.7.6+ auth routes no longer fail on `Unexpected field 'modelKey'`.
- Caveat: kitcn's dev pin (1.7.1) predates `modelKey`, so the 1.7.7 red/green (4 fail on main, 40/40 fixed) was a manual run; the account `issuer` drift at better-auth 1.7.3+ is a separate maintainer follow-up, not fixed here.
- Design:
  - Chosen boundary: method entry in both adapters.
  - Why not quick patch: patching only the six reported spreads misses dbAdapter's mutation paths.
  - Why not broader change: loosening the Convex validators would accept any stray field.
- Verified: see Verification evidence.
- PR body verified: `gh pr view 485 --json body` read back.

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
- Commit: fix(auth): keep better-auth modelKey out of httpAdapter args
- PR: #485 (draft)
- Issue: N/A
- Browser proof: N/A
- Caveats: manual 1.7.7 run; `issuer` drift at 1.7.3+ left as a follow-up.

Timeline:
- 2026-10-13T20:04:59.252Z Task goal plan created.
- 2026-10-13 Reproduced on better-auth 1.7.7 and with the 1.7.6+ input shape; fixed both adapters; kept the 1.7.1 pin; pushed to fork.
- 2026-10-13 Draft PR #485 opened by the maintaining session; Sol review fix round typed the regression stand-in; bun 1.3.9 `bun check` recorded.

Reboot status:
| Question | Answer |
|----------|--------|
| Where am I? | Closeout |
| Where am I going? | Maintainer review of PR #485 |
| What is the goal? | Keep Better Auth `modelKey` out of Convex function args |
| What have I learned? | See Findings |
| What have I done? | See Timeline |

Open risks:
- None known.

Hard closeout guard:
- A local-only final response for verified code-changing work is invalid unless
  this plan records an explicit user decline, no local patch, analytical/
  blocked/inconclusive outcome, or a real commit/PR blocker.


## Autoclosure audit — 2026-10-14

Intake complete at immutable head `28e2e22f2f679502e96692d5df097d9ec0eac3da`: body plan path exists at that head and names PR #485. This is the resumed dedicated task for PR #485. Main merged normally; fork history retained.

Three independent source/deslop lenses reviewed every HTTP and database adapter argument spread. All six affected HTTP methods and database mutation delegates strip top-level metadata at the adapter boundary. Create, consume, delete-one and update-one construct named-field payloads and already exclude it. No runtime defect was found. The cast-based `T -> T` helper overstated its return shape; cleanup now accepts optional unknown metadata and infers omission without casts. The regression also proves a nested application field named `modelKey` survives.

Fresh red/green proof uses Better Auth 1.7.7's published adapter factory in an isolated Bun preload. Its source confirms the added modelKey argument. An isolated source copy with current-main adapter code fails both metadata regressions with the expected leaked Convex-call list (not a setup exception). The fixed adapter passes all 40 tests / 99 assertions against the pinned 1.7.1 factory and the actual 1.7.7 factory. The repository dependency pin and lock are unchanged by that isolated vendor probe. This verifies this metadata boundary; the pre-existing account issuer/declaration drift is outside the task's stated non-goals and is not claimed fixed.

Hosted CI failed only fixture comparison: `Fixture drift detected in "next"`. Main dependency updates were adopted, snapshots regenerated from source, and all required local gates rerun. The original fixture/runtime waivers are revoked.

Feedback ledger:

| URL | Priority / rationale | Verdict / proof |
| --- | --- | --- |
| https://github.com/udecode/kitcn/pull/485#issuecomment-6154388395 | External preview authorization; no source finding | Vercel team owner can authorize; required CI is separate |
| https://github.com/udecode/kitcn/pull/485#issuecomment-6154393085 | Informational release coverage | Patch changeset retained and package build verified |
| https://github.com/udecode/kitcn/pull/485#issuecomment-6155209861 | Review quota notice contains no code finding | Independent wider source review and final autoreview run locally |

Fresh raw inventory: 3 comments, 0 reviews, 0 threads; helper 0 threads / 2 comments / 0 review bodies. No actionable item or deferred P2/P3 feedback. Post-push inventory and exact-head terminal receipt remain required.

Ownership and closure matrix:
- Package: adapter source owns metadata omission; existing patch changeset covers it; types/build and focused suites required.
- Generated output: no template behavior changed; main merge's dependency snapshots regenerated through fixtures:sync/check.
- Agent-native: N/A, server-only adapter repair changes no agent tooling or user action route.
- Docs/published skill: N/A, no setup/config/API change.
- UI/walkthrough: N/A, no rendered output.
- Slop delta: no occurrence-level additions or regressions.
- Review: independent source/type/simplification lenses clean after cast removal; final autoreview supplements, not replaces, those reviews.
- Final gate/delivery: full bun check including verify/runtime, normal fork push, accurate body, exact-head proof replay and external receipt.

Proof setup recovery: first isolated-main copy lacked the package-local remeda resolution; linked its dependencies to the package workspace and reran. The retained red proof is then the expected modelKey call-list assertion, not that setup failure. A stale wording claim of a known P0 from one reviewer was explicitly corrected; no P0 finding existed.


Final local receipts:
- `bun install`, package types/build, fixture regeneration, lint and full `bun check` passed, including all eight fixture comparisons, actual CLI verify and runtime scenarios. No fixture/runtime waiver remains.
- Pinned and actual Better Auth 1.7.7 factory runs: 40 tests / 99 assertions pass; current-main isolated adapter: both metadata tests fail with leaked function-call lists.
- The initial dirty-tree autoreview exited without a verdict; do not treat it as clean. Final frozen branch autoreview is required before push. Evidence under `/tmp/kitcn-pr-closure-20261014/485-*`.
- Package changeset and task-style body retain the original task scope. Normal push and external terminal receipt bind the final immutable head, full feedback inventory and post-push proof replay.
