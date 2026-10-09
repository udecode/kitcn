# Auth findMany accepts select

Objective:
The generated auth `findMany` query accepts Better Auth's `select` argument and returns only the selected fields, proven by a convex-test that runs the real validator.

Goal plan:
docs/plans/2026-10-09-auth-findmany-select.md

Template:
docs/plans/templates/task.md

Primary template:
docs/plans/templates/task.md

Applied packs:
- package-api (docs/plans/templates/packs/package-api.md): the published auth runtime's `findMany` validator changes and a patch changeset ships.
- Not applied: docs (no `www/**` or skill content changed), agent-native (no `.agents/**`, `.claude/**`, `.codex/**`, skills, hooks, commands or prompts changed), browser (no route, UI or native browser behavior).

Task source:
- type: plain task text (downstream report; no GitHub issue)
- id / link: N/A: no upstream issue
- title: Auth findMany accepts select
- acceptance criteria:
  - The `findMany` args validator in `packages/kitcn/src/auth/create-api.ts` accepts `select: v.optional(v.array(v.string()))`, matching `findOne`.
  - The handler applies `select` for `findMany`; if not, the fix covers it.
  - A test proves `findMany` with `select` returns only the selected fields, red before and green after.
  - Other generated auth procedures are checked for any other Better Auth adapter argument missing from a validator; findings are reported, and this PR stays on `select` unless a sibling is the same one-line class.
  - Patch changeset for `kitcn`; `bun check` passes.

Timed checkpoint:
- requested duration: N/A: none requested
- semantics: N/A: no duration
- initial confidence score: 90%
- improvement loop: N/A: single slice
- final score / loop closure: 95%

Completion threshold:
- `findMany` accepts `select` through the Convex validator and returns only the selected fields; the new test is red before and green after; the sibling sweep is recorded; `bun check` passes.
- Task closure is legal only when the source-of-truth acceptance criteria are
  satisfied or explicitly narrowed, required verification evidence is recorded,
  code-review and release-artifact gates are closed when applicable, verified
  code changes are committed and PR'd unless explicitly declined or blocked,
  task-style PR body sync is complete or marked N/A with reason,
  GitHub issue/PR sync is complete or marked N/A with reason, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-10-09-auth-findmany-select.md` passes.

Verification surface:
- `bunx vitest run packages/kitcn/src/auth/create-api.vitest.ts` (convex-test enforces `exportArgs()` validators).
- `bun test packages/kitcn/src/auth/` and `bunx vitest run packages/kitcn/src/auth/`.
- `bun check` on the pinned bun 1.3.9.
- Local anonymous Convex push of `example/` to confirm the deployed `findMany` signature.
- PR body audit with `gh pr view --json body` once the PR exists.

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
- Separate PR from the auth codegen exports task (one PR, one task). Keep code comments light.

Boundaries:
- Source of truth: the task text plus Better Auth 1.7.1 `DBAdapter` and `CustomAdapter` method signatures (`@better-auth/core` `db/adapter/index.d.mts`).
- Allowed edit scope: `packages/kitcn/src/auth/create-api.ts`, a new `create-api.vitest.ts`, the example's `_generated/api.d.ts` `findMany` entry, one changeset, this plan.
- Browser surface: N/A: server-side auth runtime only.
- GitHub issue sync: N/A: no upstream issue.
- Non-goals: other validator changes (sweep found none missing); unrelated generated drift in `example/convex/functions/_generated/`.

Output budget strategy:
- Long commands write to `/tmp/kitcn15-*.log` and are read with `tail` and `grep`.

Blocked condition:
- None hit. Opening the PR and running autoreview are left to the maintainer side for this run; that is sequencing, not a code blocker.

Task state:
- task_type: bug
- task_complexity: non-trivial (validator change with an integration-level test)
- current_phase: commit / PR
- current_phase_status: awaiting PR open
- next_phase: closeout
- goal_status: active

Current verdict:
- verdict: implemented and verified locally
- confidence: 95%
- next owner: task (open PR, record it here, verify body, autoreview)
- reason: validator, test, changeset and gate done; PR not yet opened

Implementation readiness:
- verdict: ready
- exact owner: `createApi` `findMany` args validator in `packages/kitcn/src/auth/create-api.ts`
- contradiction status: the adapter forwards `select` to `findMany` and `paginate` applies it, but the validator rejects it. The validator is the single wrong owner.
- source-listed cases complete: yes

Pre-solution issue challenge:
- reporter claim: Better Auth passes `select` to `findMany`, and Convex rejects the call with `Unexpected field select`.
- suggested diagnosis or fix: add `select: v.optional(v.array(v.string()))` to the `findMany` args validator.
- repro ladder:
  - tests / source-level repro: convex-test call of `auth:findMany` with `select` failed with `Validator error: Unexpected field select in object`.
  - repo-owned automated browser or integration proof: N/A for browser; the convex-test run is the integration proof, plus a local Convex push.
  - Browser plugin: N/A: no UI.
  - screenshot / visual proof: N/A: no visual output.
- reproduction verdict: reproduced
- validity verdict: valid
- best long-term fix boundary: the `findMany` validator. Both adapters (`httpAdapter` via `ctx.runQuery`, `dbAdapter` via `findManyHandler`) forward `select` on the non-OR path, and `paginate` applies `selectFields` on every return path, so the handler needs no change beyond declaring `select` in its argument type.
- harsh honest feedback: the suggested fix is complete; the handler type also omitted `select`, which hid the mismatch from TypeScript.
- hard-stop decision: proceed

Completion rule:
- Do not call `update_goal(status: complete)` while any required checklist item
  remains unchecked. If an item does not apply, check it and add `N/A: <reason>`.
- Do not call `update_goal(status: complete)` until every completion threshold
  above is satisfied, final handoff evidence is recorded, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-10-09-auth-findmany-select.md` passes.
- Do not create hook state for this goal. This file plus the active goal are the
  durable state.

Start Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| Timed checkpoint parsed | no | N/A: no duration requested |
| Walkthrough baseline for possible UI change | no | N/A: server-side auth runtime; no UI or rendered output |
| Skill analysis before edits | yes | `task` read; `autogoal` plan created with `--with package-api`; changeset rule read; red test first per `tdd` |
| Active goal checked or created | yes | This plan |
| Source of truth read before edits | yes | Task text, `create-api.ts`, `adapter.ts`, `adapter-utils.ts` (`paginate`, `selectFields`), Better Auth 1.7.1 adapter typings |
| Exact per-PR task ownership | yes | Not-yet-created single-PR slice on `fix/auth-findmany-select`; the PR number is recorded here once opened |
| GitHub comments and attachments read | no | N/A: no GitHub source |
| Video transcript evidence required | no | N/A: no video |
| Pre-solution issue challenge required | yes | Recorded above: valid, reproduced |
| Reproduction verdict before implementation | yes | Red convex-test before the validator edit |
| Repro escalation ladder selected | yes | convex-test integration test; local Convex push |
| Suggested fix reviewed against durable boundary | yes | Validator is the only wrong owner; handler and adapter already carry `select` |
| `docs/solutions` checked for non-trivial existing-code work | no | N/A: this repo has no `docs/solutions` directory |
| TDD decision before behavior change or bug fix | yes | Red then green on `create-api.vitest.ts` |
| Branch decision for code-changing task | yes | `fix/auth-findmany-select` off `upstream/main` adf405d1, pushed to the fork |
| Release artifact decision | yes | New patch changeset `.changeset/auth-findmany-select.md`; no unreleased draft existed |
| Browser tool decision for browser surface | no | N/A: no browser surface |
| Commit / PR expectation decision | yes | Commit and push now; the PR opens next |
| Task-style PR body decision | yes | PR #270 emoji body drafted outside the repo |
| Task-plan PR body evidence | yes | Body carries `🧭 Task plan: docs/plans/2026-10-09-auth-findmany-select.md` |
| GitHub issue sync expectation decision | no | N/A: no GitHub issue |
| Output budget strategy recorded | yes | See Output budget strategy |
| Package/API pack selected | yes | Published auth runtime validator changes and a changeset ships |
| Public surface or package boundary identified | yes | Public delta: every app's generated `generated/auth:findMany` accepts `select`. `kitcn` and `kitcn/auth` entry exports unchanged |
| Convex entry/import graph impact identified | yes | No import changes; one validator field in an existing function |
| CLI/scaffold/generated impact identified | yes | Codegen output unchanged; the Convex-generated `api.d.ts` of deploying apps gains `select` on `findMany` (example updated) |
| Release artifact path selected | yes | `.changeset`: `.changeset/auth-findmany-select.md` |
| `changeset` skill loaded when `.changeset` is required | yes | `.agents/rules/changeset.mdc` read: patch, `## Patches`, action-verb bullet |
| Package build / fixture impact decision recorded | yes | `bun --cwd packages/kitcn build` required and run; fixtures unaffected (generated fixture files hold no validators), confirmed by `fixtures:check` |

Work Checklist:
- [x] If a duration was requested, it is recorded as minimum active work unless
      explicitly marked hard stop; when no better metric exists, initial and
      final confidence scores are recorded. N/A: no duration; confidence 90% to 95%.
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
      `N/A` with reason. Verdict: valid.
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
- [ ] Commit/PR handling recorded for code-changing work: commit and PR
      completed, no local patch, user explicitly declined, or blocker recorded.
      "User did not separately ask for a PR" is not a valid blocker.
- [x] PR body shape recorded: PR #270 emoji task-style body used, N/A reason
      recorded, or blocker recorded.
- [ ] PR task evidence recorded: body includes `🧭 Task plan: ...`, the plan
      exists at the PR head, and it identifies the exact PR before autoclosure.
- [x] Branch handling recorded for code-changing work: dedicated branch used,
      new branch needed, or N/A with reason.
- [x] Local-env-rot retry policy recorded for any surprising repo-wide failure:
      reinstall/rerun evidence or N/A with reason. All commands run on the pinned bun 1.3.9; the local 1.4.3 canary fails unrelated CLI tests on upstream main.
- [x] Workspace authority recorded: every proof command names the cwd/tool that
      owns the changed behavior.
- [x] Output budget discipline recorded and followed: broad searches are
      scoped, capped, counted, or artifacted instead of streamed into goal
      context.
- [x] High-risk note recorded for public API, runtime, package-boundary,
      browser behavior, agent-action, or command-contract changes, or marked
      N/A with reason.
- [ ] Review/autoreview target selected from actual diff state for non-trivial
      implementation work, or marked N/A with reason.
- [x] Agent-native review decision recorded for `.agents/**`, `.claude/**`,
      `.codex/**`, skills, hooks, commands, prompts, or user-action tooling. N/A: none touched.
- [x] Package/API pack: public API, package boundary, export, and release-artifact impact are recorded.
- [x] Package/API pack: release artifact matrix is applied: `.changeset` or explicit no-artifact reason. `.changeset`.
- [x] Package/API pack: `.changeset` work loads `changeset` and follows its package/version/prose rules.
- [x] Package/API pack: no-artifact decisions state why the diff has no published package user-visible delta from `main`. N/A: a changeset ships.
- [x] Package/API pack: compatibility, migration, or hard-cut decision is explicit when public shape changes. Additive: one optional validator field; existing calls are unaffected.
- [x] Package/API pack: affected Convex static import graphs stay narrow and
      plugin/per-module boundaries are used where appropriate. No import changes.
- [x] Package/API pack: CLI commands remain deterministic, `--json` capable,
      and non-interactive with explicit confirmation bypass when relevant. N/A: no CLI change.
- [x] Package/API pack: docs and `packages/kitcn/skills/kitcn/**` stay
      current-state synchronized when public guidance changes. N/A: no doc or skill describes the auth procedure arguments.
- [x] Package/API pack: package-owned typecheck/build/test proof is recorded or marked N/A with reason.
- [x] Package/API pack: `packages/kitcn` build, fixture sync/check, or other owning package proof is recorded when required.

Completion Gates:
| Gate | Applies | Required action | Evidence |
|------|---------|-----------------|----------|
| Named verification threshold | yes | Run the command, proof, source audit, or artifact check named in this plan | See Verification evidence |
| Exact per-PR task ownership | yes | Record the exact PR and dedicated plan, or the not-yet-created single-PR slice | pending |
| Pre-solution issue challenge verdict | yes | Record reporter claim, suggested fix, repro verdict, validity verdict, durable boundary, and hard-stop/pivot decision before implementation | Recorded above: valid, reproduced, proceed |
| Repro escalation ladder | yes | For bug/behavior claims, record test/source-level, automated browser/integration, Browser, and screenshot/visual-proof outcomes or N/A/blocker reasons before `not reproduced` | convex-test red; browser and visual N/A (server-side) |
| Bug reproduced before fix | yes | Record failing test/repro or N/A with reason | `Validator error: Unexpected field select in object` from convex-test |
| Targeted behavior verification | yes | Run focused test/proof for changed behavior or record N/A | `create-api.vitest.ts` 1 pass; `bun test packages/kitcn/src/auth/` 188 pass; `vitest run packages/kitcn/src/auth/` 40 pass |
| TypeScript or typed config changed | yes | Run relevant typecheck | `bun typecheck` inside `bun check`; vitest type check reports no errors |
| Package exports or file layout changed | no | Run the relevant package build before final verification and keep generated updates | N/A: no export or layout change; package build run anyway and passes |
| Package manifests, lockfile, or install graph changed | no | Run `bun install` and relevant package checks | N/A: no manifest change; `bun install` on 1.3.9 left the lockfile unchanged |
| Agent rules or skills changed | no | Run `bun install` and verify generated skill sync | N/A: none changed |
| Workspace authority proof | yes | Run verification in the owning repo/package/app/route/tool and record cwd; do not count the wrong workspace as proof | All proof from the kitcn worktree root; the example push from `example/` |
| Browser surface changed | no | Capture Browser Use proof or record explicit waiver/blocker | N/A: no browser surface |
| Browser final proof | no | Attach screenshot or exact browser verification caveat when browser proof applies | N/A: no browser surface |
| UI walkthrough | no | If UI or rendered output changed, run `.agents/skills/walkthrough/SKILL.md` after final proof and show annotated images in the final handoff; otherwise record N/A | N/A: no UI |
| Scaffold or fixture output changed | no | Run `bun run fixtures:sync` and `bun run fixtures:check`, or record N/A | N/A: scaffold output unchanged; `fixtures:check` inside `bun check` confirms |
| Package behavior or public API changed | yes | Add a changeset or record why no changeset applies | `.changeset/auth-findmany-select.md` (patch) |
| Docs and kitcn skill sync changed | no | Keep `www/**` and `packages/kitcn/skills/kitcn/**` in sync, or record N/A | N/A: no doc describes the auth procedure arguments |
| Docs or content changed | no | For docs-heavy work, use `--template docs`; for incidental docs, verify source-backed claims, links, examples, and rendered output or record N/A | N/A: no docs changed |
| High-risk mini gate | yes | For public API/runtime/package-boundary/browser/agent-action/command-contract changes, record realistic failure mode, proof plan, and why the chosen boundary is right; otherwise N/A | Failure mode: a Better Auth arg the adapter forwards is rejected by a validator. Proof: convex-test runs the real validator; sibling sweep compared every procedure against Better Auth 1.7.1 signatures. Boundary: the validator is the only owner that disagreed. |
| Agent-native review for agent/tooling changes | no | For `.agents/**`, `.claude/**`, `.codex/**`, skills, hooks, commands, prompts, or user-action tooling, load `.agents/skills/agent-native-reviewer/SKILL.md` and close accepted/actionable findings, or record N/A | N/A: none touched |
| Local install corruption suspected | no | Run `bun install` once, rerun the exact failing command, or record N/A | N/A: no corruption signal |
| Commit created | yes | For verified code-changing work, stage the entire current checkout per repo policy and create a commit; N/A only for no local patch, explicit user decline, analytical/blocked/inconclusive work, or recorded external blocker | pending |
| PR create or update | yes | For verified code-changing work, run `check`, push, create or update the PR, and sync PR body to the task-style final handoff; N/A only for no local patch, explicit user decline, analytical/blocked/inconclusive work, or recorded external blocker | pending |
| Task-style PR body verified | yes | Verify the PR body with `gh pr view --json body`; it must preserve auto-release blocks when applicable, must not include a current-PR self-link, and must use the PR #270 emoji format: `🐛 Fixes ...`, `🟢 95-100% confidence`, `Phase / 🧪 Tests / 🌐 Browser` table, and bold emoji Outcome/Caveat/Design/Verified sections | pending |
| PR task evidence verified | yes | Verify body plan line, plan at PR head, and exact PR ownership | pending |
| PR proof image hosting | no | If PR body needs browser proof, replace local image paths with hosted GitHub URLs or record N/A | N/A: no images |
| GitHub issue sync-back | no | Post concise issue sync after PR exists, or record N/A/blocker | N/A: no GitHub issue |
| Final handoff contract | yes | Fill the final handoff fields below with exact PR/issue/confidence/tests/browser/outcome/caveats/design/verification content or N/A reason | pending |
| Final lint | yes | Run `bun lint:fix` or scoped equivalent | `bun lint` clean (981 files) |
| Output budget discipline | yes | Verify no unbounded high-volume command output was streamed, or record the accidental output and recovery | Logs under `/tmp/kitcn15-*.log` |
| Timed checkpoint | no | If duration was requested, keep improving until elapsed, then finish the current loop cleanly; otherwise N/A | N/A: no duration |
| Autoreview for non-trivial implementation changes | yes | Load `.agents/skills/autoreview/SKILL.md`; use dirty local `--mode local`, branch/PR `--mode branch --base <base>`, or committed slice `--mode commit --commit <ref>` until no accepted/actionable findings, or record N/A for docs-only/trivial/no local patch | pending |
| Public API / package boundary proof | yes | Source-audit public API, exports, and package boundary impact | Entry exports unchanged; `findMany` args gain optional `select` (example `api.d.ts` entry) |
| Convex bundle/import proof | no | Audit affected function-entry static graphs or record N/A | N/A: no import changes |
| CLI/scaffold/generated proof | yes | Prove command contract and regenerate owned output or record N/A | Codegen output unchanged; example `_generated/api.d.ts` regenerated from a local Convex push, `findMany` hunk kept |
| Release artifact classification | yes | Record whether the change is published package behavior/API/types/config/runtime or no published user-visible delta | Published package runtime behavior |
| Published package changeset | yes | If published package users see a delta, load `changeset` and add/update one `.changeset/*.md` per package | `.changeset/auth-findmany-select.md` (`kitcn`: patch) |
| No release artifact | no | If no artifact is needed, record the exact reason: internal-only, docs-only, agent-only, test-only, or no user-visible delta from `main` | N/A: a changeset ships |
| Package typecheck/build/test | yes | Run owning package checks or record N/A with reason | Package build passes; focused auth suites pass; typecheck inside `bun check` |
| Fixture/scaffold generation | no | Run `bun run fixtures:sync` and `bun run fixtures:check` when scaffold output changed, otherwise N/A | N/A: scaffold output unchanged; `fixtures:check` inside `bun check` |
| Docs/package skill sync | no | Synchronize current-state public guidance or record N/A | N/A: no doc or skill describes the auth procedure arguments |
| Goal plan complete | yes | Run `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-10-09-auth-findmany-select.md` | pending |

Phase / pass table:
| Phase | Status | Evidence | Next |
|-------|--------|----------|------|
| Intake and source read | done | Sources listed in Start Gates | implementation |
| Implementation | done | `create-api.ts`, `create-api.vitest.ts`, example `api.d.ts`, changeset | verification |
| Verification | done | Focused suites, build, example push, `check:ci`, `test:verify`; `test:runtime` left to CI | closeout |
| Commit / PR / GitHub sync | in_progress | Branch pushed; PR not yet opened | final response |
| Closeout | pending | Awaits PR | final response |

Findings:
- Both adapters forward `select` to `findMany` on the non-OR path (`httpAdapter` through `ctx.runQuery(authFunctions.findMany, { ...data })`, `dbAdapter` through `findManyHandler`). The OR path strips `select` before querying and applies it after merge and sort.
- `paginate` applies `selectFields(doc, args.select)` on every return path, so the handler already supports `select`; only the validator and the handler's argument type omitted it.
- Through `dbAdapter` there is no validator, so the bug shows only on the `httpAdapter` path (Better Auth HTTP routes), where Convex validates arguments.
- Sibling sweep against Better Auth 1.7.1 signatures: `count` (model, where), `create` (input, select), `findOne` (model, where, select, join), `updateOne`, `updateMany`, `deleteOne`, `deleteMany`, `consumeOne` and `incrementOne` (model, where, increment, set) all accept every argument the adapter sends. `findMany.select` was the only gap.

Decisions and tradeoffs:
- Test through convex-test with an explicit module map so the real validator runs; a direct `_handler` call would pass before the fix.
- Add `select?: string[]` to `findManyHandler`'s argument type so TypeScript describes the contract the validator now accepts.
- Keep only the `findMany` hunk of the example `_generated/api.d.ts` regeneration; the rest is pre-existing drift.

Implementation notes:
- `packages/kitcn/src/auth/create-api.ts`: `select: v.optional(v.array(v.string()))` in `findMany` args; `select?: string[]` in `findManyHandler` args.
- `packages/kitcn/src/auth/create-api.vitest.ts`: `auth:findMany` with `select: ['email']` returns `[{ email }]`.

Review fixes:
- None yet.

Error attempts:
| Error / failed attempt | Count | Next different move | Resolution |
|------------------------|-------|---------------------|------------|
| Example `convex dev` needs env on a fresh anonymous deployment | 1 | Set dummy env values and push again | Push passed; scratch files removed |
| `test:runtime` expo scenario not ready at `127.0.0.1:3210` | 1 | Port 3210 belongs to an unrelated Docker backend on the host; not stopped | Left to PR CI |

Verification evidence:
- Red: `create-api.vitest.ts` failed with `Validator error: Unexpected field select in object`.
- Green: `bunx vitest run packages/kitcn/src/auth/create-api.vitest.ts`: 1 pass.
- `bun test packages/kitcn/src/auth/`: 188 pass, 0 fail. `bunx vitest run packages/kitcn/src/auth/`: 7 files, 40 tests pass, no type errors.
- `bun --cwd packages/kitcn build`: pass. `bun lint`: clean.
- Example local Convex push: functions ready; `internal.generated.auth.findMany` args include `select?: Array<string>`.
- `bun check` (root, bun 1.3.9): `check:ci` passes (lint 981 files; typecheck; 1556 Bun tests; 103 Vitest files; 124 CLI tests; Concave smoke; 8 of 8 fixtures match fresh scaffolds) and `test:verify` passes. `test:runtime` blocked locally: the expo scenario waits on fixed port 3210, held on this host by an unrelated Docker Convex backend. PR CI runs it.

Source-listed case matrix:
| Case | Source claim | Harness | Before | Expected after | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `findMany` validator rejects `select` | convex-test `auth:findMany` call | `Unexpected field select` | accepted | red then green | done |
| 2 | Handler applies `select` | same test asserts `[{ email }]` | n/a (blocked by validator) | only selected fields | green | done |
| 3 | Other procedures may miss adapter args | source sweep against Better Auth 1.7.1 signatures | unknown | none missing | Findings | done |

Final handoff contract:
- Commit line: pending
- PR line: pending
- Issue line: N/A: no GitHub issue
- Confidence line: 🟢 95% confidence
- Flow table:
  - Reproduced: tests 🔴 `findMany` with `select` rejected by the validator; browser ➖ N/A
  - Verified: tests 🟢 convex-test, focused auth suites, `check:ci` and `test:verify`; browser ➖ N/A
- Browser check: N/A: server-side auth runtime
- Outcome: Better Auth `findMany` calls with `select` succeed and return only the selected fields
- Caveat: apps redeploy to pick up the validator
- Design:
  - Chosen boundary: the `findMany` validator, the only owner that disagreed with adapter and handler
  - Why not quick patch: it is the quick patch, and the right one
  - Why not broader change: the sweep found no other missing argument
- Verified: see Verification evidence
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
- Issue: N/A: no GitHub issue
- Browser proof: N/A: no browser surface
- Caveats: apps redeploy to pick up the validator

Timeline:
- 2026-10-09 Task goal plan created with the package-api pack.
- 2026-10-09 Red convex-test; validator and handler type fix; example `api.d.ts` regenerated; changeset; focused suites, `check:ci` and `test:verify` green on bun 1.3.9; `test:runtime` blocked by a host port.

Reboot status:
| Question | Answer |
|----------|--------|
| Where am I? | Commit / PR: branch pushed, PR not yet opened |
| Where am I going? | Open the PR, record its number here, verify the body, autoreview, closeout |
| What is the goal? | Generated auth `findMany` accepts `select` and returns only the selected fields |
| What have I learned? | See Findings |
| What have I done? | See Timeline |

Open risks:
- None beyond redeploying; the change only widens an argument validator.

Hard closeout guard:
- A local-only final response for verified code-changing work is invalid unless
  this plan records an explicit user decline, no local patch, analytical/
  blocked/inconclusive outcome, or a real commit/PR blocker.
