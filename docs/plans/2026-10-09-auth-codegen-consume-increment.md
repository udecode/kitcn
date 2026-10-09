# Auth codegen exports consumeOne and incrementOne

Objective:
Generated `generated/auth.ts` exports every auth runtime procedure, including `consumeOne` and `incrementOne`, and a codegen test pins the generated exports to the runtime contract.

Goal plan:
docs/plans/2026-10-09-auth-codegen-consume-increment.md

Template:
docs/plans/templates/task.md

Primary template:
docs/plans/templates/task.md

Applied packs:
- none: no docs, browser, agent-native or package export surface changes; generated user code is covered by the fixture rows below.

Task source:
- type: plain task text (downstream report; no GitHub issue)
- id / link: N/A: no upstream issue
- title: Auth codegen exports consumeOne and incrementOne
- acceptance criteria:
  - `AUTH_RUNTIME_PROCEDURES` lists `consumeOne` and `incrementOne` as internal mutations.
  - The emitted `export const { ... } = authRuntime` block exports both.
  - A codegen test fails when any auth runtime contract key is missing from the generated auth module.
  - Patch changeset for `kitcn`.
  - `bun install` and `bun check` pass.

Timed checkpoint:
- requested duration: N/A: none requested
- semantics: N/A: no duration
- initial confidence score: 90%
- improvement loop: N/A: single slice
- final score / loop closure: 95%

Completion threshold:
- Generated auth modules (codegen test, fixtures, example, root `convex/`) export `consumeOne` and `incrementOne`; the contract test passes; `bun check` passes.
- Task closure is legal only when the source-of-truth acceptance criteria are
  satisfied or explicitly narrowed, required verification evidence is recorded,
  code-review and release-artifact gates are closed when applicable, verified
  code changes are committed and PR'd unless explicitly declined or blocked,
  task-style PR body sync is complete or marked N/A with reason,
  GitHub issue/PR sync is complete or marked N/A with reason, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-10-09-auth-codegen-consume-increment.md` passes.

Verification surface:
- `bun test packages/kitcn/src/cli/codegen.test.ts packages/kitcn/src/auth/` from the repo root.
- `bun run fixtures:sync`, then `bun check` on the pinned bun 1.3.9.
- Local anonymous Convex push of `example/` registering `generated/auth:consumeOne` and `generated/auth:incrementOne`.
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
- Keep code comments light.

Boundaries:
- Source of truth: the task text plus `packages/kitcn/src/auth/generated-contract-disabled.ts` (`AuthRuntime`) and `generated-contract.ts` (`AUTH_RUNTIME_PROCEDURE_TYPES`).
- Allowed edit scope: `packages/kitcn/src/cli/codegen.ts`, `codegen.test.ts`, regenerated fixture, example and root generated auth files, one changeset, this plan.
- Browser surface: N/A: codegen output only.
- GitHub issue sync: N/A: no upstream issue.
- Non-goals: docs (no doc lists the generated auth exports); unrelated generated drift in `example/convex/functions/_generated/` and `procedure-names.gen.ts`.

Output budget strategy:
- Long commands write to `/tmp/kitcn-*.log` and are read with `tail` and `grep`.

Blocked condition:
- None hit. The PR opens after the caller's review; that is sequencing, not a blocker.

Task state:
- task_type: bug
- task_complexity: non-trivial (small code change; generated outputs across fixtures and example)
- current_phase: commit / PR
- current_phase_status: awaiting PR open
- next_phase: closeout
- goal_status: active

Current verdict:
- verdict: implemented and verified locally
- confidence: 95%
- next owner: task (open PR, record it here, verify body, autoreview)
- reason: code, test, fixtures and gate are green; PR held for the caller's review

Implementation readiness:
- verdict: ready
- exact owner: `packages/kitcn/src/cli/codegen.ts` (`AUTH_RUNTIME_PROCEDURES` and the emitted destructure)
- contradiction status: the runtime contract (`AuthRuntime`, `AUTH_RUNTIME_PROCEDURE_TYPES`, `AuthFunctions`) has 12 procedures; codegen had 10. Runtime owns the contract; codegen follows it.
- source-listed cases complete: yes

Pre-solution issue challenge:
- reporter claim: generated `auth.ts` omits `consumeOne` and `incrementOne`, so the adapter's `<module>:consumeOne` and `<module>:incrementOne` references point at missing Convex functions.
- suggested diagnosis or fix: add both to `AUTH_RUNTIME_PROCEDURES` and to the emitted destructure; add a drift test.
- repro ladder:
  - tests / source-level repro: the new codegen contract assertion failed before the fix (missing `consumeOne`, `incrementOne`).
  - repo-owned automated browser or integration proof: N/A for browser; fixture sync and a local Convex push cover integration.
  - Browser plugin: N/A: no UI.
  - screenshot / visual proof: N/A: no visual output.
- reproduction verdict: reproduced
- validity verdict: valid
- best long-term fix boundary: one procedure list in codegen; the emitted destructure derives from it; the test pins it to `createDisabledAuthRuntime()` keys, which TypeScript pins to `AuthRuntime`.
- harsh honest feedback: the suggested fix is right, but adding names to two hand lists keeps the drift path open, so the destructure derives from the list.
- hard-stop decision: proceed

Completion rule:
- Do not call `update_goal(status: complete)` while any required checklist item
  remains unchecked. If an item does not apply, check it and add `N/A: <reason>`.
- Do not call `update_goal(status: complete)` until every completion threshold
  above is satisfied, final handoff evidence is recorded, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-10-09-auth-codegen-consume-increment.md` passes.
- Do not create hook state for this goal. This file plus the active goal are the
  durable state.

Start Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| Timed checkpoint parsed | no | N/A: no duration requested |
| Walkthrough baseline for possible UI change | no | N/A: codegen output only; no UI or rendered output |
| Skill analysis before edits | yes | `task` read; `autogoal` plan created; changeset rule read; red test first per `tdd` |
| Active goal checked or created | yes | This plan |
| Source of truth read before edits | yes | Task text, `codegen.ts`, `generated-contract.ts`, `generated-contract-disabled.ts`, `adapter.ts`, `create-api.ts`, PR #423 precedent |
| Exact per-PR task ownership | yes | Not-yet-created single-PR slice on `fix/auth-codegen-consume-increment`; the PR number is recorded here once opened |
| GitHub comments and attachments read | no | N/A: no GitHub source |
| Video transcript evidence required | no | N/A: no video |
| Pre-solution issue challenge required | yes | Recorded above: valid, reproduced |
| Reproduction verdict before implementation | yes | Red codegen test before the codegen edit |
| Repro escalation ladder selected | yes | Source-level test; fixture sync and local Convex push for integration |
| Suggested fix reviewed against durable boundary | yes | Destructure derives from `AUTH_RUNTIME_PROCEDURES`; the test pins the list to the runtime contract |
| `docs/solutions` checked for non-trivial existing-code work | no | N/A: this repo has no `docs/solutions` directory |
| TDD decision before behavior change or bug fix | yes | Red then green on the contract assertion |
| Branch decision for code-changing task | yes | `fix/auth-codegen-consume-increment` off `upstream/main` adf405d1, pushed to the fork |
| Release artifact decision | yes | New patch changeset `.changeset/auth-codegen-consume-increment.md`; no unreleased draft existed |
| Browser tool decision for browser surface | no | N/A: no browser surface |
| Commit / PR expectation decision | yes | Commit and push now; the PR opens after the caller's review |
| Task-style PR body decision | yes | PR #270 emoji body drafted outside the repo |
| Task-plan PR body evidence | yes | Body carries `🧭 Task plan: docs/plans/2026-10-09-auth-codegen-consume-increment.md` |
| GitHub issue sync expectation decision | no | N/A: no GitHub issue |
| Output budget strategy recorded | yes | See Output budget strategy |

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
      reinstall/rerun evidence or N/A with reason. Twelve CLI watcher/dev tests fail identically on upstream main under local bun 1.4.3 canary and pass under the pinned bun 1.3.9.
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

Completion Gates:
| Gate | Applies | Required action | Evidence |
|------|---------|-----------------|----------|
| Named verification threshold | yes | Run the command, proof, source audit, or artifact check named in this plan | Focused tests 263 pass; on bun 1.3.9 `check:ci` (lint, typecheck, 1556 bun + 102 vitest files, CLI, Concave smoke, `fixtures:check`) and `test:verify` pass; `test:runtime` blocked locally, see Error attempts |
| Exact per-PR task ownership | yes | Record the exact PR and dedicated plan, or the not-yet-created single-PR slice | pending |
| Pre-solution issue challenge verdict | yes | Record reporter claim, suggested fix, repro verdict, validity verdict, durable boundary, and hard-stop/pivot decision before implementation | Recorded above: valid, reproduced, proceed |
| Repro escalation ladder | yes | For bug/behavior claims, record test/source-level, automated browser/integration, Browser, and screenshot/visual-proof outcomes or N/A/blocker reasons before `not reproduced` | Source-level red test; browser and visual N/A (codegen only) |
| Bug reproduced before fix | yes | Record failing test/repro or N/A with reason | Contract assertion failed: expected `consumeOne` and `incrementOne`, received neither |
| Targeted behavior verification | yes | Run focused test/proof for changed behavior or record N/A | `bun test packages/kitcn/src/cli/codegen.test.ts packages/kitcn/src/auth/`: 263 pass, 0 fail |
| TypeScript or typed config changed | yes | Run relevant typecheck | `bun typecheck` inside `bun check` passes |
| Package exports or file layout changed | yes | Run the relevant package build before final verification and keep generated updates | `bun --cwd packages/kitcn build` passes; generated outputs kept |
| Package manifests, lockfile, or install graph changed | no | Run `bun install` and relevant package checks | N/A: no manifest change; lockfile churn from local bun 1.4.3 reverted |
| Agent rules or skills changed | no | Run `bun install` and verify generated skill sync | N/A: none changed |
| Workspace authority proof | yes | Run verification in the owning repo/package/app/route/tool and record cwd; do not count the wrong workspace as proof | All proof from the kitcn worktree root; the example push from `example/` |
| Browser surface changed | no | Capture Browser Use proof or record explicit waiver/blocker | N/A: no browser surface |
| Browser final proof | no | Attach screenshot or exact browser verification caveat when browser proof applies | N/A: no browser surface |
| UI walkthrough | no | If UI or rendered output changed, run `.agents/skills/walkthrough/SKILL.md` after final proof and show annotated images in the final handoff; otherwise record N/A | N/A: no UI |
| Scaffold or fixture output changed | yes | Run `bun run fixtures:sync` and `bun run fixtures:check`, or record N/A | `fixtures:sync` updated 12 generated auth files; `fixtures:check` passes inside `bun check` |
| Package behavior or public API changed | yes | Add a changeset or record why no changeset applies | `.changeset/auth-codegen-consume-increment.md` (patch) |
| Docs and kitcn skill sync changed | no | Keep `www/**` and `packages/kitcn/skills/kitcn/**` in sync, or record N/A | N/A: no doc lists the generated auth exports |
| Docs or content changed | no | For docs-heavy work, use `--template docs`; for incidental docs, verify source-backed claims, links, examples, and rendered output or record N/A | N/A: no docs changed |
| High-risk mini gate | yes | For public API/runtime/package-boundary/browser/agent-action/command-contract changes, record realistic failure mode, proof plan, and why the chosen boundary is right; otherwise N/A | Failure mode: generated exports drift from the runtime again. Proof: the test compares the destructure with `createDisabledAuthRuntime()` keys and checks `auth.runtime.ts` entries. Boundary: codegen owns the list, runtime owns the contract. |
| Agent-native review for agent/tooling changes | no | For `.agents/**`, `.claude/**`, `.codex/**`, skills, hooks, commands, prompts, or user-action tooling, load `.agents/skills/agent-native-reviewer/SKILL.md` and close accepted/actionable findings, or record N/A | N/A: none touched |
| Local install corruption suspected | no | Run `bun install` once, rerun the exact failing command, or record N/A | N/A: the first `convex/server` resolution error was a fresh worktree without install; `bun install` fixed it |
| Commit created | yes | For verified code-changing work, stage the entire current checkout per repo policy and create a commit; N/A only for no local patch, explicit user decline, analytical/blocked/inconclusive work, or recorded external blocker | pending |
| PR create or update | yes | For verified code-changing work, run `check`, push, create or update the PR, and sync PR body to the task-style final handoff; N/A only for no local patch, explicit user decline, analytical/blocked/inconclusive work, or recorded external blocker | pending |
| Task-style PR body verified | yes | Verify the PR body with `gh pr view --json body`; it must preserve auto-release blocks when applicable, must not include a current-PR self-link, and must use the PR #270 emoji format: `🐛 Fixes ...`, `🟢 95-100% confidence`, `Phase / 🧪 Tests / 🌐 Browser` table, and bold emoji Outcome/Caveat/Design/Verified sections | pending |
| PR task evidence verified | yes | Verify body plan line, plan at PR head, and exact PR ownership | pending |
| PR proof image hosting | no | If PR body needs browser proof, replace local image paths with hosted GitHub URLs or record N/A | N/A: no images |
| GitHub issue sync-back | no | Post concise issue sync after PR exists, or record N/A/blocker | N/A: no GitHub issue |
| Final handoff contract | yes | Fill the final handoff fields below with exact PR/issue/confidence/tests/browser/outcome/caveats/design/verification content or N/A reason | pending |
| Final lint | yes | Run `bun lint:fix` or scoped equivalent | `bun lint` clean inside `bun check` |
| Output budget discipline | yes | Verify no unbounded high-volume command output was streamed, or record the accidental output and recovery | Logs under `/tmp/kitcn-*.log`; one long generated diff printed once |
| Timed checkpoint | no | If duration was requested, keep improving until elapsed, then finish the current loop cleanly; otherwise N/A | N/A: no duration |
| Autoreview for non-trivial implementation changes | yes | Load `.agents/skills/autoreview/SKILL.md`; use dirty local `--mode local`, branch/PR `--mode branch --base <base>`, or committed slice `--mode commit --commit <ref>` until no accepted/actionable findings, or record N/A for docs-only/trivial/no local patch | pending |
| Goal plan complete | yes | Run `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-10-09-auth-codegen-consume-increment.md` | pending |

Phase / pass table:
| Phase | Status | Evidence | Next |
|-------|--------|----------|------|
| Intake and source read | done | Sources listed in Start Gates | implementation |
| Implementation | done | `codegen.ts`, `codegen.test.ts`, regenerated outputs, changeset | verification |
| Verification | done | Focused tests, build, fixtures sync, `check:ci`, `test:verify`, example push; `test:runtime` left to CI | closeout |
| Commit / PR / GitHub sync | in_progress | Branch pushed; PR held for the caller's review | final response |
| Closeout | pending | Awaits PR | final response |

Findings:
- The runtime contract has 12 procedures (`AUTH_RUNTIME_PROCEDURE_TYPES`, `AuthFunctions`, `createDisabledAuthRuntime`); codegen listed 10 in two hand lists.
- The adapter calls `authFunctions.consumeOne` and `authFunctions.incrementOne`, which resolve to `<module>:consumeOne` and `<module>:incrementOne`; without the exports those Convex functions do not exist.
- Codegen tests run from the repo root; from `packages/kitcn` five unrelated tests fail on upstream main too.
- Local bun 1.4.3 canary fails 12 CLI watcher/dev tests on upstream main; the pinned bun 1.3.9 passes them.

Decisions and tradeoffs:
- Derive the emitted destructure from `AUTH_RUNTIME_PROCEDURES`, so codegen has one list. Cost: `updateMany` and `updateOne` move below `rotateKeys` in generated files.
- Anchor the test on `createDisabledAuthRuntime()` keys: TypeScript forces that object to match `AuthRuntime`, and it is already exported, so no new public export.
- Keep only the two auth hunks of the example `_generated/api.d.ts` regeneration; the rest is pre-existing drift.

Implementation notes:
- `packages/kitcn/src/cli/codegen.ts`: add `consumeOne` and `incrementOne` to `AUTH_RUNTIME_PROCEDURES`; add `AUTH_RUNTIME_EXPORTS`; emit the destructure from it.
- `packages/kitcn/src/cli/codegen.test.ts`: the generated destructure equals `createDisabledAuthRuntime()` keys; `auth.runtime.ts` lists every procedure key.

Review fixes:
- None yet.

Error attempts:
| Error / failed attempt | Count | Next different move | Resolution |
|------------------------|-------|---------------------|------------|
| `fixtures:sync` ENOENT `packages/resend/dist` | 1 | Build `@kitcn/resend` | Built; sync passed |
| `bun check` lint `useTopLevelRegex` | 1 | Hoist the regex to module scope | Lint clean |
| `bun check` 13 CLI test failures on bun 1.4.3 canary | 1 | Same files on upstream main, then pinned bun 1.3.9 | Identical failures on main; all pass on 1.3.9 |
| Example `convex dev` needs a deployment and env | 2 | Anonymous local deployment with dummy env values | Push passed; scratch files removed |
| `test:runtime` expo scenario not ready at `127.0.0.1:3210` | 1 | Port 3210 belongs to an unrelated Docker backend on the host; not stopped | Left to PR CI |

Verification evidence:
- Red: the contract assertion failed before the codegen edit (missing `consumeOne`, `incrementOne`).
- `bun test packages/kitcn/src/cli/codegen.test.ts packages/kitcn/src/auth/` (root): 263 pass, 0 fail.
- `bun --cwd packages/kitcn build`: pass.
- `bun run fixtures:sync`: 12 generated auth files updated, nothing else.
- Example local Convex push: functions ready; `internal.generated.auth.consumeOne` and `incrementOne` appear in `api.d.ts`.
- `bun check` (root, bun 1.3.9): `check:ci` and `test:verify` pass; `test:runtime` blocked locally because host port 3210 is held by another Docker Convex backend and Concave scenarios use that fixed port. CI runs it on the PR.

Source-listed case matrix:
| Case | Source claim | Harness | Before | Expected after | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `AUTH_RUNTIME_PROCEDURES` omits both | `auth.runtime.ts` procedure entries in the codegen test | absent | present as internal mutations | test pass; fixture `auth.runtime.ts` diffs | done |
| 2 | Emitted destructure omits both | destructure vs `createDisabledAuthRuntime()` keys | 2 keys missing | equal | red then green | done |
| 3 | Adapter references point at missing functions | example push to a local Convex backend | functions absent | `generated/auth:consumeOne` and `:incrementOne` registered | `api.d.ts` hunks | done |
| 4 | Lists must not drift again | destructure derived from the list; contract test | two hand lists | one list plus test | code and test | done |

Final handoff contract:
- Commit line: pending
- PR line: pending
- Issue line: N/A: no GitHub issue
- Confidence line: 🟢 95% confidence
- Flow table:
  - Reproduced: tests 🔴 generated auth exports missed `consumeOne` and `incrementOne`; browser ➖ N/A
  - Verified: tests 🟢 focused codegen and auth tests, fixtures sync, `check:ci` and `test:verify`; browser ➖ N/A
- Browser check: N/A: codegen output only
- Outcome: generated auth modules export `consumeOne` and `incrementOne`
- Caveat: apps rerun `kitcn codegen` and redeploy
- Design:
  - Chosen boundary: codegen's single procedure list, pinned to the runtime contract by a test
  - Why not quick patch: two hand lists would drift again
  - Why not broader change: importing the runtime contract into the CLI would pull auth runtime code into codegen
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
- Caveats: apps rerun `kitcn codegen` and redeploy

Timeline:
- 2026-10-09T20:20:31.395Z Task goal plan created.
- 2026-10-09 Red contract test; codegen fix; fixtures, example and root regenerated; changeset; `check:ci` and `test:verify` green on bun 1.3.9; `test:runtime` blocked by a host port.

Reboot status:
| Question | Answer |
|----------|--------|
| Where am I? | Commit / PR: branch pushed, PR held for the caller's review |
| Where am I going? | Open the PR, record its number here, verify the body, autoreview, closeout |
| What is the goal? | Generated auth modules export every auth runtime procedure, pinned by a test |
| What have I learned? | See Findings |
| What have I done? | See Timeline |

Open risks:
- Deployments running kitcn auth gain two internal functions on their next push; nothing is removed.

Hard closeout guard:
- A local-only final response for verified code-changing work is invalid unless
  this plan records an explicit user decline, no local patch, analytical/
  blocked/inconclusive outcome, or a real commit/PR blocker.
