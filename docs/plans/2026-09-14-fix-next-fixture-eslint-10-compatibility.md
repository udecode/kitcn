# Fix Next fixture ESLint 10 compatibility

Objective:
Make the generated Next.js scaffold deterministically retain ESLint 9, prove the
fresh fixture lints on the repository's CI toolchain, and ship the package fix
through one task-compliant PR so PRs #464 and #465 can close cleanly.

Goal plan:
docs/plans/2026-09-14-fix-next-fixture-eslint-10-compatibility.md

Template:
docs/plans/templates/task.md

Primary template:
docs/plans/templates/task.md

Applied packs:
- package-api (docs/plans/templates/packs/package-api.md)

Task source:
- type: internal bug discovered by exact-head required CI on PRs #464 and #465
- id / link: no standalone issue; evidence is required CI runs 34830750129 and
  34833218958, attempts 1 and 2
- title: Generated Next fixture resolves incompatible ESLint 10 on Ubuntu CI
- acceptance criteria: `kitcn init -t next` writes an exact compatible ESLint 9
  dependency; the focused template test is red before and green after; generated
  fixtures sync and verify; the Next scenario lint and package/full gates pass;
  the fix is committed, pushed, and opened as one task-compliant PR.

Timed checkpoint:
- requested duration: N/A
- semantics: no timed request
- initial confidence score: 92%
- improvement loop: red/green unit proof, generated fixture proof, then Ubuntu CI
- final score / loop closure: 98%; local source, fixture, scenario, package,
  review, and full-repo gates pass; exact-head PR CI remains the final loop

Completion threshold:
- Exact ESLint 9 ownership exists in the package Next manifest overlay, focused
  tests prove normalization, generated fixtures are current, package build and
  `bun check` pass, one changeset exists, and the task-compliant PR is green.
- Task closure is legal only when the source-of-truth acceptance criteria are
  satisfied or explicitly narrowed, required verification evidence is recorded,
  code-review and release-artifact gates are closed when applicable, verified
  code changes are committed and PR'd unless explicitly declined or blocked,
  task-style PR body sync is complete or marked N/A with reason,
  GitHub issue/PR sync is complete or marked N/A with reason, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-09-14-fix-next-fixture-eslint-10-compatibility.md` passes.

Verification surface:
- Focused Vitest for the Next manifest template; `bun run fixtures:sync`;
  `bun run fixtures:check`; prepared Next scenario lint; package build;
  `bun check`; exact-head GitHub checks and task-body audit.

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
- Source of truth: `packages/kitcn/src/cli/registry/init/next/` owns the package
  overlay after pinned shadcn generation; committed fixtures are generated proof.
- Allowed edit scope: Next package manifest overlay/tests, scenario-runner
  cleanup/tests required by the root gate, generated fixtures, one kitcn
  changeset, this task plan, and the coordinating autoclosure plan.
- Browser surface: N/A; dependency resolution and CLI lint behavior only.
- GitHub issue sync: N/A; no standalone issue exists.
- Non-goals: shadcn pin bump, eslint-config-next bump, global dependency policy,
  or changes to application lint rules.

Output budget strategy:
- Use bounded `rg`/`sed`, focused tests, and capped command output. Persist long
  proof in command logs and record only decisive lines here.

Blocked condition:
- Stop only if the package-owned overlay cannot control the generated manifest,
  required fixture infrastructure is unavailable after one environment repair,
  or GitHub access prevents required CI/PR operations.

Task state:
- task_type: bug fix / scaffold determinism
- task_complexity: standard
- current_phase: commit / PR / GitHub sync
- current_phase_status: in_progress
- next_phase: closeout
- goal_status: active

Current verdict:
- verdict: ready
- confidence: 98%
- next owner: task
- reason: repeated Ubuntu CI proves a deterministic package-overlay defect; the
  exact incompatible peer boundary and owning template are identified.

Implementation readiness:
- verdict: ready
- exact owner: Next manifest overlay in `init-next-package-json.template.ts`
- contradiction status: local macOS resolves ESLint 9 while Ubuntu CI resolves
  ESLint 10; this is resolver/platform variance that exact pinning removes.
- source-listed cases complete: yes

Pre-solution issue challenge:
- reporter claim: generated Next fixture lint is broken in required Ubuntu CI.
- suggested diagnosis or fix: normalize the loose upstream ESLint range to an
  exact compatible ESLint 9 version in the package-owned manifest overlay.
- repro ladder:
  - tests / source-level repro: CI attempts 1 and 2 on both PRs resolve ESLint
    10.10.0 and fail `react/display-name`; local exact Bun 1.3.9 resolves 9.39.5.
  - repo-owned automated browser or integration proof: fresh Next fixture CI is
    the owning integration lane; it reproduced four times.
  - Browser plugin: N/A; no browser-rendered behavior.
  - screenshot / visual proof: N/A; no visual state.
- reproduction verdict: reproduced on authoritative Ubuntu integration lane
- validity verdict: valid platform-dependent dependency-resolution defect
- best long-term fix boundary: deterministic package-owned manifest overlay
- harsh honest feedback: trusting an upstream loose range makes the scaffold
  non-deterministic; retrying CI cannot repair that.
- hard-stop decision: proceed; bug is reproduced and owner is proven.

Completion rule:
- Do not call `update_goal(status: complete)` while any required checklist item
  remains unchecked. If an item does not apply, check it and add `N/A: <reason>`.
- Do not call `update_goal(status: complete)` until every completion threshold
  above is satisfied, final handoff evidence is recorded, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-09-14-fix-next-fixture-eslint-10-compatibility.md` passes.
- Do not create hook state for this goal. This file plus the active goal are the
  durable state.

Start Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| Timed checkpoint parsed | no | N/A: no duration requested |
| Walkthrough baseline for possible UI change | no | N/A: no UI/rendered output can change |
| Skill analysis before edits | yes | `task`, `tdd`, `scenarios`, and `changeset` read |
| Active goal checked or created | yes | active autoclosure goal checked; this is its prerequisite slice |
| Source of truth read before edits | yes | `VISION.md`, owner template/tests, fixture tooling, and relevant solutions read |
| Exact per-PR task ownership | yes | owns one prerequisite PR slice; exact PR number is filled after creation |
| GitHub comments and attachments read | no | N/A: no issue or prerequisite PR exists yet |
| Video transcript evidence required | no | N/A: no video attached |
| Pre-solution issue challenge required | yes | valid/reproduced verdict recorded above |
| Reproduction verdict before implementation | yes | four Ubuntu CI failures; local contrast recorded |
| Repro escalation ladder selected | yes | focused test then fixture integration; browser N/A |
| Suggested fix reviewed against durable boundary | yes | package overlay is the durable owner |
| `docs/solutions` checked for non-trivial existing-code work | yes | scaffold-double and fixture-sync solutions read |
| TDD decision before behavior change or bug fix | yes | required; add failing normalization test first |
| Branch decision for code-changing task | yes | dedicated `codex/fix-next-eslint-10-fixture` branch |
| Release artifact decision | yes | patch changeset for `kitcn` |
| Browser tool decision for browser surface | no | N/A: CLI dependency/lint surface only |
| Commit / PR expectation decision | yes | commit, push, and one task-compliant PR required |
| Task-style PR body decision | yes | PR #270 emoji contract required |
| Task-plan PR body evidence | yes | update plan with exact PR after creation, then verify at head |
| GitHub issue sync expectation decision | no | N/A: no standalone issue |
| Output budget strategy recorded | yes | bounded strategy recorded above |
| Package/API pack selected | yes | package-api pack applied |
| Public surface or package boundary identified | yes | published `kitcn init -t next` scaffold output |
| Convex entry/import graph impact identified | no | N/A: manifest generation only; no Convex runtime import graph |
| CLI/scaffold/generated impact identified | yes | Next manifest template plus generated fixture |
| Release artifact path selected | yes | new `.changeset/*.md` for `kitcn` patch |
| `changeset` skill loaded when `.changeset` is required | yes | loaded before edits |
| Package build / fixture impact decision recorded | yes | package build and both fixture lanes required |

Work Checklist:
- [ ] If a duration was requested, it is recorded as minimum active work unless
      explicitly marked hard stop; when no better metric exists, initial and
      final confidence scores are recorded.
- [ ] Objective includes outcome, completion threshold, verification surface,
      constraints, boundaries, and blocked condition.
- [ ] Task source classified with source type, id/link, title, task type,
      acceptance criteria, caveats, likely files/routes/packages, browser
      surface, and root-cause layer.
- [ ] Every GitHub PR in scope has its own task plan. This plan owns one exact
      PR, owns a not-yet-created PR slice, or records N/A because no PR is in
      scope; a batch plan is not used as a substitute.
- [ ] Required video or screen-recording evidence is cached/read as normalized
      `<video-transcripts>` XML, or marked N/A with reason.
- [ ] For public GitHub bug reports, behavior claims, technical diagnoses, or
      suggested fixes, reporter claims are challenged before implementation
      with a recorded verdict: `valid`, `not reproduced`, `invalid`,
      `wont-fix`, `partially valid`, or `platform limitation`. Feature, docs,
      support, or cleanup requests with no bug claim may mark reproduction
      `N/A` with reason.
- [ ] Repro escalation ladder followed for bug/behavior claims: focused
      test/source-level repro first when applicable; existing repo-owned
      automated browser or integration proof next when available and useful as
      executable coverage; the repo-approved Browser tool next when tests or
      automation cannot reproduce or cannot model the surface honestly;
      screenshot or explicit visual-proof waiver when visual/native state
      matters.
- [ ] Hard-stop rule followed for bug/behavior claims: no code when the issue
      is not reproduced, invalid, or won't-fix; partial validity pivots to the
      best long-term fix and records what was wrong or incomplete in the
      issue's proposed path.
- [ ] Nearby repo instructions and implementation patterns read before edits.
- [ ] Source-listed case matrix is complete and every contradiction has an
      owner, harness, and verdict before mutation.
- [ ] Readiness is classified `ready`, `repair-source`, `major`, `blocked`, or
      `invalid` with evidence.
- [ ] Implementation fixes the right ownership boundary, or the narrower choice
      is recorded with reason.
- [ ] Release artifact requirement recorded: active changeset, new changeset, or
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
- [ ] Branch handling recorded for code-changing work: dedicated branch used,
      new branch needed, or N/A with reason.
- [ ] Local-env-rot retry policy recorded for any surprising repo-wide failure:
      reinstall/rerun evidence or N/A with reason.
- [ ] Workspace authority recorded: every proof command names the cwd/tool that
      owns the changed behavior.
- [ ] Output budget discipline recorded and followed: broad searches are
      scoped, capped, counted, or artifacted instead of streamed into goal
      context.
- [ ] High-risk note recorded for public API, runtime, package-boundary,
      browser behavior, agent-action, or command-contract changes, or marked
      N/A with reason.
- [ ] Review/autoreview target selected from actual diff state for non-trivial
      implementation work, or marked N/A with reason.
- [ ] Agent-native review decision recorded for `.agents/**`, `.claude/**`,
      `.codex/**`, skills, hooks, commands, prompts, or user-action tooling.
- [ ] Package/API pack: public API, package boundary, export, and release-artifact impact are recorded.
- [ ] Package/API pack: release artifact matrix is applied: `.changeset` or explicit no-artifact reason.
- [ ] Package/API pack: `.changeset` work loads `changeset` and follows its package/version/prose rules.
- [ ] Package/API pack: no-artifact decisions state why the diff has no published package user-visible delta from `main`.
- [ ] Package/API pack: compatibility, migration, or hard-cut decision is explicit when public shape changes.
- [ ] Package/API pack: affected Convex static import graphs stay narrow and
      plugin/per-module boundaries are used where appropriate.
- [ ] Package/API pack: CLI commands remain deterministic, `--json` capable,
      and non-interactive with explicit confirmation bypass when relevant.
- [ ] Package/API pack: docs and `packages/kitcn/skills/kitcn/**` stay
      current-state synchronized when public guidance changes.
- [ ] Package/API pack: package-owned typecheck/build/test proof is recorded or marked N/A with reason.
- [ ] Package/API pack: `packages/kitcn` build, fixture sync/check, or other owning package proof is recorded when required.

Completion Gates:
| Gate | Applies | Required action | Evidence |
|------|---------|-----------------|----------|
| Named verification threshold | pending | Run the command, proof, source audit, or artifact check named in this plan | pending |
| Exact per-PR task ownership | pending | Record the exact PR and dedicated plan, or the not-yet-created single-PR slice | pending |
| Pre-solution issue challenge verdict | pending | Record reporter claim, suggested fix, repro verdict, validity verdict, durable boundary, and hard-stop/pivot decision before implementation | pending |
| Repro escalation ladder | pending | For bug/behavior claims, record test/source-level, automated browser/integration, Browser, and screenshot/visual-proof outcomes or N/A/blocker reasons before `not reproduced` | pending |
| Bug reproduced before fix | pending | Record failing test/repro or N/A with reason | pending |
| Targeted behavior verification | pending | Run focused test/proof for changed behavior or record N/A | pending |
| TypeScript or typed config changed | pending | Run relevant typecheck | pending |
| Package exports or file layout changed | pending | Run the relevant package build before final verification and keep generated updates | pending |
| Package manifests, lockfile, or install graph changed | pending | Run `bun install` and relevant package checks | pending |
| Agent rules or skills changed | pending | Run `bun install` and verify generated skill sync | pending |
| Workspace authority proof | pending | Run verification in the owning repo/package/app/route/tool and record cwd; do not count the wrong workspace as proof | pending |
| Browser surface changed | pending | Capture Browser Use proof or record explicit waiver/blocker | pending |
| Browser final proof | pending | Attach screenshot or exact browser verification caveat when browser proof applies | pending |
| UI walkthrough | pending | If UI or rendered output changed, run `.agents/skills/walkthrough/SKILL.md` after final proof and show annotated images in the final handoff; otherwise record N/A | pending |
| Scaffold or fixture output changed | pending | Run `bun run fixtures:sync` and `bun run fixtures:check`, or record N/A | pending |
| Package behavior or public API changed | pending | Add a changeset or record why no changeset applies | pending |
| Docs and kitcn skill sync changed | pending | Keep `www/**` and `packages/kitcn/skills/kitcn/**` in sync, or record N/A | pending |
| Docs or content changed | pending | For docs-heavy work, use `--template docs`; for incidental docs, verify source-backed claims, links, examples, and rendered output or record N/A | pending |
| High-risk mini gate | pending | For public API/runtime/package-boundary/browser/agent-action/command-contract changes, record realistic failure mode, proof plan, and why the chosen boundary is right; otherwise N/A | pending |
| Agent-native review for agent/tooling changes | pending | For `.agents/**`, `.claude/**`, `.codex/**`, skills, hooks, commands, prompts, or user-action tooling, load `.agents/skills/agent-native-reviewer/SKILL.md` and close accepted/actionable findings, or record N/A | pending |
| Local install corruption suspected | pending | Run `bun install` once, rerun the exact failing command, or record N/A | pending |
| Commit created | pending | For verified code-changing work, stage the entire current checkout per repo policy and create a commit; N/A only for no local patch, explicit user decline, analytical/blocked/inconclusive work, or recorded external blocker | pending |
| PR create or update | pending | For verified code-changing work, run `check`, push, create or update the PR, and sync PR body to the task-style final handoff; N/A only for no local patch, explicit user decline, analytical/blocked/inconclusive work, or recorded external blocker | pending |
| Task-style PR body verified | pending | Verify the PR body with `gh pr view --json body`; it must preserve auto-release blocks when applicable, must not include a current-PR self-link, and must use the PR #270 emoji format: `🐛 Fixes ...`, `🟢 95-100% confidence`, `Phase / 🧪 Tests / 🌐 Browser` table, and bold emoji Outcome/Caveat/Design/Verified sections | pending |
| PR task evidence verified | pending | Verify body plan line, plan at PR head, and exact PR ownership | pending |
| PR proof image hosting | pending | If PR body needs browser proof, replace local image paths with hosted GitHub URLs or record N/A | pending |
| GitHub issue sync-back | pending | Post concise issue sync after PR exists, or record N/A/blocker | pending |
| Final handoff contract | pending | Fill the final handoff fields below with exact PR/issue/confidence/tests/browser/outcome/caveats/design/verification content or N/A reason | pending |
| Final lint | pending | Run `bun lint:fix` or scoped equivalent | pending |
| Output budget discipline | pending | Verify no unbounded high-volume command output was streamed, or record the accidental output and recovery | pending |
| Timed checkpoint | pending | If duration was requested, keep improving until elapsed, then finish the current loop cleanly; otherwise N/A | pending |
| Autoreview for non-trivial implementation changes | pending | Load `.agents/skills/autoreview/SKILL.md`; use dirty local `--mode local`, branch/PR `--mode branch --base <base>`, or committed slice `--mode commit --commit <ref>` until no accepted/actionable findings, or record N/A for docs-only/trivial/no local patch | pending |
| Goal plan complete | yes | Run `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-09-14-fix-next-fixture-eslint-10-compatibility.md` | pending |
| Public API / package boundary proof | pending | Source-audit public API, exports, and package boundary impact | pending |
| Convex bundle/import proof | pending | Audit affected function-entry static graphs or record N/A | pending |
| CLI/scaffold/generated proof | pending | Prove command contract and regenerate owned output or record N/A | pending |
| Release artifact classification | pending | Record whether the change is published package behavior/API/types/config/runtime or no published user-visible delta | pending |
| Published package changeset | pending | If published package users see a delta, load `changeset` and add/update one `.changeset/*.md` per package | pending |
| No release artifact | pending | If no artifact is needed, record the exact reason: internal-only, docs-only, agent-only, test-only, or no user-visible delta from `main` | pending |
| Package typecheck/build/test | pending | Run owning package checks or record N/A with reason | pending |
| Fixture/scaffold generation | pending | Run `bun run fixtures:sync` and `bun run fixtures:check` when scaffold output changed, otherwise N/A | pending |
| Docs/package skill sync | pending | Synchronize current-state public guidance or record N/A | pending |

Phase / pass table:
| Phase | Status | Evidence | Next |
|-------|--------|----------|------|
| Intake and source read | complete | owner, repro, peer boundary, doctrine, and prior solutions read | implementation |
| Implementation | pending | | verification |
| Verification | pending | | closeout |
| Commit / PR / GitHub sync | pending | | final response |
| Closeout | pending | | final response |

Findings:
- `eslint-plugin-react@7.37.5` declares ESLint support through `^9.7`, while
  `eslint-config-next@16.3.4` depends on `eslint-plugin-react@^7.37.0`.
- The generated manifest currently preserves shadcn's loose `eslint: ^9` range.
- Ubuntu CI repeatedly executes ESLint 10.10.0 and crashes while loading
  `react/display-name`; macOS with Bun 1.3.9 resolves ESLint 9.39.5 and passes.
- The root `bun check` runtime matrix deterministically leaves a local Convex
  backend alive after its first runtime scenario, then fails when the later
  Concave scenario claims the same port. The runner owns backend cleanup but
  only performs it for check-mode scenarios, not runtime-mode scenarios.

Decisions and tradeoffs:
- Pin only ESLint to exact 9.39.5 in the package overlay. Do not change shadcn or
  eslint-config-next: their current versions work when the peer-compatible major
  is deterministic.
- Repair cleanup in `runScenarioTest` itself so every runtime scenario releases
  project-owned local backends on success or failure; do not add sleeps or
  weaken the root gate.

Implementation notes:
- Added exact `eslint: 9.39.5` ownership to the package Next manifest overlay,
  with a focused red/green normalization test.
- Regenerated all committed fixtures through `fixtures:sync`; current upstream
  shadcn output also refreshed its generated dependency versions.
- Added a `runScenarioTest` `finally` boundary that stops both the scenario's
  project-owned local Convex backend and any remaining scenario backends.
- Added failure-path coverage proving cleanup still runs when runtime proof
  throws.

Review fixes:
- Autoreview ran after both behavior changes and reported no actionable
  findings (overall correctness confidence 0.98).

Error attempts:
| Error / failed attempt | Count | Next different move | Resolution |
|------------------------|-------|---------------------|------------|
| Required CI rerun produced the same ESLint 10 failure | 2 PRs / 4 attempts | stop retrying; fix the package owner | resolved locally by the exact manifest overlay pin; PR CI pending |
| focused Bun test path omitted the required `./` prefix | 1 | rerun with the repository's accepted path form | resolved; focused suite passed |
| `bun check` runtime matrix hit port 3210 after all earlier lanes passed | 2 | reproduce owner, add finally cleanup, rerun exact gate | resolved; full runtime matrix and `bun check` passed |

Verification evidence:
- Red: the new manifest-template test expected `9.39.5` and received `^9`.
- Green: focused manifest template suite passed 5/5.
- `bun test ./tooling/scenarios.test.ts`: 32 tests, 99 expectations passed.
- `bun run fixtures:sync` regenerated every committed fixture from package
  owners; `bun run fixtures:check` passed every fixture and showed Next and
  Next-auth installing ESLint 9.39.5.
- `bun run scenario:prepare next`, followed by `bun run lint` from
  `tmp/scenarios/next/project`, passed with exact ESLint 9.39.5.
- `bun --cwd packages/kitcn build`, `bun typecheck`, `bun lint:fix`, and the
  final root `bun check` passed.
- TruffleHog found no secrets; final autoreview found no actionable issue.

Source-listed case matrix:
| Case | Source claim | Harness | Before | Expected after | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| upstream loose range | shadcn output may contain `eslint: ^9` | manifest template unit test | preserved unchanged | exact `9.39.5` | red mismatch, then 5/5 green | passed |
| generated fixture | committed Next fixture represents CLI output | fixture sync/check + scenario lint | CI can resolve 10.10.0 | deterministic ESLint 9 and clean lint | fixture check and prepared Next lint install 9.39.5 and pass | passed locally; PR CI pending |
| runtime cleanup | runtime scenarios own local Convex backend lifecycle | scenario runner unit test + root runtime matrix | failure path left port 3210 occupied | cleanup on success and failure | focused 32/32 and full `bun check` runtime matrix | passed |

Final handoff contract:
- Commit line: exact commit recorded after creation
- PR line: exact PR recorded after creation
- Issue line: pending
- Confidence line: 98%
- Flow table:
  - Reproduced: red normalization test plus repeated Ubuntu ESLint 10 crash;
    browser N/A
  - Verified: focused tests, generated fixture lanes, prepared Next lint,
    package build, root `bun check`; browser N/A
- Browser check: N/A; dependency/scenario infrastructure only
- Outcome: deterministic compatible Next lint dependency and reliable scenario
  backend cleanup
- Caveat: generated fixture manifests include current upstream shadcn dependency
  refreshes
- Design:
  - Chosen boundary: package manifest overlay plus scenario lifecycle owner
  - Why not quick patch: editing generated fixtures would be overwritten
  - Why not broader change: no need to bump shadcn, Next, or lint rules
- Verified: focused red/green, fixture sync/check, scenario lint, package build,
  typecheck/lint, full `bun check`, secrets scan, and autoreview
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
- Issue: N/A; prerequisite discovered from PR CI, no standalone issue
- Browser proof: N/A; no rendered/browser behavior
- Caveats: exact-head GitHub CI and PR body read-back pending

Timeline:
- 2026-09-14T21:55:07.341Z Task goal plan created.

Reboot status:
| Question | Answer |
|----------|--------|
| Where am I? | Commit / PR / GitHub sync |
| Where am I going? | Create the prerequisite PR, bind this plan to it, verify exact-head CI, then unblock #464/#465 |
| What is the goal? | Deterministically pin compatible ESLint 9 in generated Next scaffolds and ship the prerequisite PR |
| What have I learned? | The loose upstream range behaves differently on Ubuntu CI and violates the plugin peer range |
| What have I done? | Reproduced four CI failures, implemented both owner fixes, regenerated fixtures, and passed focused/package/full-repo proof |

Open risks:
- GitHub Ubuntu resolution may expose a second install-order issue after the
  exact pin; the prerequisite PR CI is the authoritative final proof.

Hard closeout guard:
- A local-only final response for verified code-changing work is invalid unless
  this plan records an explicit user decline, no local patch, analytical/
  blocked/inconclusive outcome, or a real commit/PR blocker.
