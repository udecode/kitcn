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
- owned PR: https://github.com/udecode/kitcn/pull/467
- title: Generated Next fixture resolves incompatible ESLint 10 on Ubuntu CI
- acceptance criteria: `kitcn init -t next` writes an exact compatible ESLint 9
  dependency for Next 15+ while preserving the ESLint 8 stack required by Next
  14; the focused template tests are red before and green after; generated
  fixtures sync and verify; the Next scenario lint and package/full gates pass;
  the fix is committed, pushed, and opened as one task-compliant PR.

Timed checkpoint:
- requested duration: N/A
- semantics: no timed request
- initial confidence score: 92%
- improvement loop: red/green unit proof, generated fixture proof, then Ubuntu CI
- final score / loop closure: 99%; local source, fixture, scenario, package,
  review, full-repo gates, and Ubuntu PR CI all pass

Completion threshold:
- Version-aware ESLint ownership exists in the package Next manifest overlay,
  focused tests prove Next 14 preservation and Next 15+ normalization, generated
  fixtures are current, package build and
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
- current_phase: exact-head delivery
- current_phase_status: in progress
- next_phase: push, close feedback, exact-head CI, receipt, and merge
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
| Exact per-PR task ownership | yes | PR #467, owned only by this plan |
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
| Named verification threshold | yes | Run the named local and GitHub proof | local threshold and Ubuntu CI run `34904489302` passed |
| Exact per-PR task ownership | yes | Record exact PR and dedicated plan | PR #467; this plan exists at head after the plan-binding push |
| Pre-solution issue challenge verdict | yes | Record claim, repro, validity, boundary, and hard-stop decision | complete above: valid, reproduced, package overlay owner |
| Repro escalation ladder | yes | Record test/integration/browser/visual outcomes | focused red and Ubuntu integration repro; browser/visual N/A |
| Bug reproduced before fix | yes | Record failing proof | exact mismatch red test plus four CI failures |
| Targeted behavior verification | yes | Run focused proof | manifest 11/11, init 59/59, and scenario runner 35/35 passed |
| TypeScript or typed config changed | yes | Run relevant typecheck | `bun typecheck` passed |
| Package exports or file layout changed | no | Build if applicable | N/A: no export/layout change; package build passed anyway |
| Package manifests, lockfile, or install graph changed | yes | Run install/fixture graph checks | fixture sync/check and prepared install passed; lockfile unchanged |
| Agent rules or skills changed | no | Sync generated skill | N/A: no agent source changed |
| Workspace authority proof | yes | Run proof in owning workspace | package, prepared scenario, and root repo commands recorded above |
| Browser surface changed | no | Capture Browser proof or waive | N/A: CLI dependency and process lifecycle only |
| Browser final proof | no | Attach browser proof or waive | N/A: no browser-rendered behavior |
| UI walkthrough | no | Run walkthrough for rendered output | N/A: no UI or rendered output |
| Scaffold or fixture output changed | yes | Run fixture sync/check | both passed |
| Package behavior or public API changed | yes | Add changeset | `.changeset/quiet-maps-lint.md` adds a `kitcn` patch |
| Docs and kitcn skill sync changed | no | Sync current-state guidance | N/A: no public guidance or skill contract changed |
| Docs or content changed | no | Verify docs | N/A: plans are execution evidence, not user docs |
| High-risk mini gate | yes | Record failure mode, proof, and boundary | resolver variance/port leak; fixture CI and runtime matrix prove owning boundaries |
| Agent-native review for agent/tooling changes | no | Run specialist review if applicable | N/A: tooling process cleanup is not an agent/user-action workflow |
| Local install corruption suspected | no | Reinstall once if suspected | N/A: failures reproduced deterministically and had source owners |
| Commit created | yes | Commit entire verified checkout | `d4c24966` |
| PR create or update | yes | Push and create task PR | PR #467 created and plan-binding commit pushed after green `bun check` |
| Task-style PR body verified | yes | Read back emoji body | `gh pr view 467 --json body` confirms required auto-release, task-plan, confidence, flow, and emoji sections |
| PR task evidence verified | yes | Verify body line, head plan, exact PR | body names this path; pushed plan names exactly PR #467 |
| PR proof image hosting | no | Host browser proof if applicable | N/A: no browser proof |
| GitHub issue sync-back | no | Sync issue if applicable | N/A: no standalone issue |
| Final handoff contract | yes | Fill exact fields | complete below; parent autoclosure owns terminal receipt and merge |
| Final lint | yes | Run lint fix | `bun lint:fix` passed before commit |
| Output budget discipline | yes | Keep broad output bounded | used capped output; one earlier CI log truncation is ledgered in parent plan |
| Timed checkpoint | no | Honor requested duration | N/A: no duration requested |
| Autoreview for non-trivial implementation changes | yes | Run final review | clean; overall correctness confidence 0.98 |
| Goal plan complete | yes | Run goal checker | run after this evidence update; result recorded in commit history/terminal handoff |
| Public API / package boundary proof | yes | Audit public/package effect | generated Next devDependency only; no exports or runtime bundle changed |
| Convex bundle/import proof | no | Audit static import graph | N/A: no Convex entry import changed |
| CLI/scaffold/generated proof | yes | Regenerate and verify | fixture sync/check and prepared Next lint passed |
| Release artifact classification | yes | Classify published delta | published `kitcn` scaffold behavior, patch release |
| Published package changeset | yes | Add package changeset | `.changeset/quiet-maps-lint.md` |
| No release artifact | no | Record no-artifact reason | N/A: published package delta has a changeset |
| Package typecheck/build/test | yes | Run owning proof | focused test, root typecheck, and package build passed |
| Fixture/scaffold generation | yes | Run fixture sync/check | both passed |
| Docs/package skill sync | no | Sync guidance if changed | N/A: no guidance changed |

Phase / pass table:
| Phase | Status | Evidence | Next |
|-------|--------|----------|------|
| Intake and source read | complete | owner, repro, peer boundary, doctrine, and prior solutions read | implementation |
| Implementation | complete | package overlay and runtime cleanup owners fixed with tests | verification |
| Verification | complete | focused, fixture, scenario, package, lint/typecheck, and 333-second root check pass | delivery |
| Commit / PR / GitHub sync | complete | implementation `d4c24966`, plan binding `0f0da6c4`, PR #467, required body read-back | closeout |
| Closeout | in progress | prior Ubuntu CI passed; two final P2 review repairs require a new exact-head gate | rerun, push, receipt, merge |

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
- Pin ESLint to exact 9.39.5 only when `eslint-config-next` supports ESLint 9
  (Next 15+). Preserve the ESLint 8 stack required by supported Next 14 apps.
- Repair cleanup in the scenario process owner: spawn a detached process group
  and stop that group directly, so descendants terminate without relying on
  `lsof`, global sweeps, sleeps, or a weakened root gate.

Implementation notes:
- Added version-aware `eslint: 9.39.5` ownership to the package Next manifest
  overlay, with focused red/green normalization and Next 14 preservation tests.
- Regenerated all committed fixtures through `fixtures:sync`; current upstream
  shadcn output also refreshed its generated dependency versions.
- Added a `runScenarioTest` `finally` boundary and detached process-group
  ownership so the scenario and its child backends stop together.
- Added failure-path and process-group coverage proving cleanup still runs when
  runtime proof throws and when `lsof` is unavailable.

Review fixes:
- Autoreview ran after both behavior changes and reported no actionable
  findings (overall correctness confidence 0.98).
- Accepted live P1 `discussion_r4010211795`: treat missing `lsof` as
  best-effort cleanup instead of failing an otherwise successful scenario.
- Accepted live P2 `discussion_r4010211806`: stop only the current scenario's
  project-owned backend; do not sweep sibling prepared scenarios.
- Final dirty-local P0/P1 autoreview after both repairs is clean (overall 0.9).
- Accepted second-pass live P1 `discussion_r4010256721`: when Next adoption
  normalizes an already-present ESLint version and no baseline package is
  missing, schedule the package manager's install command so lockfile and
  installed graph match the rewritten manifest.
- Accepted late live P1 `discussion_r4010309942`: preserve ESLint 8 for
  `eslint-config-next` 14; npm peer metadata proves ESLint 9 support starts at
  `eslint-config-next` 15.
- Accepted late live P1 `discussion_r4010309951`: terminate the detached
  scenario process group directly so cleanup does not depend on `lsof`.
- Accepted final local P1: do not treat the direct process leader's exit as
  proof that its descendants exited; poll the process group itself and apply a
  bounded SIGKILL fallback when it remains alive.
- Accepted exact-head P2 `discussion_r4010526496`: install a missing managed
  ESLint from the rewritten manifest instead of passing it to production
  dependency arguments.
- Accepted exact-head P1 `discussion_r4010526499`: keep interactive
  `scenario:dev` children attached so terminal interrupts reach them; detached
  process groups remain exclusive to bounded runtime proof.
- Accepted exact-head P2 `discussion_r4010526507`: resolve
  `eslint-config-next` from both dependency sections before selecting ESLint.
- Accepted exact-head P2 `discussion_r4010627169`: when
  `eslint-config-next` uses a symbolic spec such as `latest`, `*`, or
  `catalog:`, infer supported legacy ownership from an explicit ESLint/Next
  major and otherwise normalize to the compatible ESLint 9 pin.
- Accepted exact-head P2 `discussion_r4010627175`: when normalization is
  required, remove ESLint from production dependencies before writing the
  managed version to `devDependencies`.
- Accepted exact-head P2 `discussion_r4010720063`: a matching version in the
  wrong manifest section still requires a package-manager reconciliation so
  the lockfile updates its production/dev classification.
- Accepted exact-head P2 `discussion_r4010720066`: treat only simple anchored
  versions as installed-major evidence; wide ranges defer to a concrete Next
  major instead of using their first numeric lower bound.

Error attempts:
| Error / failed attempt | Count | Next different move | Resolution |
|------------------------|-------|---------------------|------------|
| Required CI rerun produced the same ESLint 10 failure | 2 PRs / 4 attempts | stop retrying; fix the package owner | resolved; Ubuntu CI `34904489302` passed |
| focused Bun test path omitted the required `./` prefix | 1 | rerun with the repository's accepted path form | resolved; focused suite passed |
| `bun check` runtime matrix hit port 3210 after all earlier lanes passed | 2 | reproduce owner, add finally cleanup, rerun exact gate | resolved; full runtime matrix and `bun check` passed |
| adoption reconciliation test initially still had missing baseline dependencies and therefore exercised `bun add` | 2 | make the harness represent the reported all-dependencies-present branch | resolved; red on no install, green on `bun install` |
| Next 14 compatibility test received ESLint `9.39.5` instead of `^8.57.0` | 1 | derive normalization from `eslint-config-next` major | resolved; Next 14 preserves ESLint 8 and Next 16 pins ESLint 9 |
| detached process-group test timed out because only the direct process was signalled | 1 | signal the owned process group by negative PID | resolved; SIGINT/SIGKILL group proof passes |
| `bun lint:fix` rejected an inline version regex | 1 | move the regex to module scope | resolved; lint passes |
| autoreview found direct-leader exit could hide a live descendant group | 1 | verify group existence with signal 0 before and after force-stop | resolved; leader-exits-first regression test passes |
| config-in-`dependencies`, missing-ESLint, and interactive-spawn focused tests failed | 1 each | use both manifest sections, install managed ESLint from the manifest, and separate interactive/runtime spawn modes | resolved; all three focused tests pass |
| lint rejected `delete` in the missing-ESLint test fixture | 1 | filter the dependency entries into a new record | resolved; lint passes |
| symbolic config spec and production-owned ESLint tests failed | 1 each | infer legacy compatibility from explicit majors and move normalized ESLint between manifest sections | resolved; focused manifest suite passes |
| wide config range and exact-version section-move tests failed | 1 each | distinguish anchored versions from ranges and track required dependency section during reconciliation | resolved; focused tests pass |

Verification evidence:
- Red: the new manifest-template test expected `9.39.5` and received `^9`.
- Green: focused manifest template suite passed 10/10, including Next 14,
  Next 16, symbolic config specs, and dependency-section ownership.
- `bun test ./tooling/scenarios.test.ts`: 35 tests, 104 expectations passed.
- After review fixes, the same suite passed 33 tests / 100 expectations,
  including missing-`lsof` and current-project-only cleanup coverage.
- `bun run fixtures:sync` regenerated every committed fixture from package
  owners; `bun run fixtures:check` passed every fixture and showed Next and
  Next-auth installing ESLint 9.39.5.
- `bun run scenario:prepare next`, followed by `bun run lint` from
  `tmp/scenarios/next/project`, passed with exact ESLint 9.39.5.
- `bun --cwd packages/kitcn build`, `bun typecheck`, `bun lint:fix`, and the
  final root `bun check` passed.
- The post-review-fix root `bun check` passed the full fixture and runtime
  matrix, including repeated reuse of port 3210 without sibling sweeps.
- Next adoption reconciliation test was red with no package-manager install,
  then green; missing ESLint was red with production `bun add` and green with
  manifest-driven `bun install`; the full init command suite passed 58/58.
- npm registry peer proof: `eslint-config-next@14.2.35` accepts ESLint 7/8;
  `eslint-config-next@15.0.0` adds ESLint 9 support.
- The detached process-group test was red by timeout before the owner repair,
  then green with SIGINT followed by bounded SIGKILL fallback; its final shape
  makes the leader exit on SIGINT while the group remains alive and proves the
  group still receives SIGKILL.
- Final post-reconciliation `bun check` passed in 326 seconds; TruffleHog was
  clean and final dirty-local P0/P1 autoreview was clean (overall 0.9).
- Final post-edge-case `bun check` passed in 378 seconds; TruffleHog was clean
  and P0/P1 autoreview was clean (overall 0.92).
- Final post-symbolic-spec repair `bun check` passed in 333 seconds;
  TruffleHog was clean and P0/P1 autoreview was clean (overall 0.91).
- Final post-section-reconciliation repair `bun check` passed in 357 seconds;
  TruffleHog was clean and P0/P1 autoreview was clean (overall 0.91).
- TruffleHog found no secrets; final P0/P1 autoreview found no actionable issue.

Source-listed case matrix:
| Case | Source claim | Harness | Before | Expected after | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| upstream loose range | shadcn output may contain `eslint: ^9` | manifest template unit test | preserved unchanged | exact `9.39.5` | red mismatch, then 5/5 green | passed |
| generated fixture | committed Next fixture represents CLI output | fixture sync/check + scenario lint | CI can resolve 10.10.0 | deterministic ESLint 9 and clean lint | fixture check, prepared Next lint, and Ubuntu CI `34904489302` pass | passed |
| runtime cleanup | runtime scenarios own local Convex backend lifecycle | scenario runner unit test + root runtime matrix | failure path left port 3210 occupied | cleanup on success and failure | focused 32/32 and full `bun check` runtime matrix | passed |
| existing Next adoption | manifest rewrite must reconcile lockfile/node_modules | init command integration test | no install when every package name existed | package-manager install after ESLint normalization | focused red/green and full init suite 57/57 | passed |
| supported Next 14 adoption | `eslint-config-next@14` requires ESLint 7/8 | manifest template unit test + npm peer metadata | unconditional pin wrote ESLint 9 | preserve existing ESLint 8 | red mismatch, peer proof, then green | passed |
| cleanup without `lsof` | scenario descendants must terminate on every supported runner | process-group unit test | direct parent signal left descendants alive | terminate the owned detached group | red timeout, then SIGINT/SIGKILL green | passed |
| config in `dependencies` | Next apps may place tooling in either manifest section | manifest template test | loose ESLint range preserved | resolve config from either section | red mismatch, then green | passed |
| missing managed ESLint | template writes ESLint to `devDependencies` | init integration test | generic `bun add` made it a production dependency | reconcile from rewritten manifest | red command mismatch, then green | passed |
| interactive interrupt | terminal Ctrl+C must reach all `scenario:dev` children | spawn-mode unit test | children detached from terminal group | keep interactive children attached | red missing mode owner, then green | passed |
| symbolic config spec | package managers may use `latest`, `*`, or `catalog:` | manifest template unit tests | no numeric major meant no normalization | preserve explicit legacy stacks; otherwise pin ESLint 9 | red current-spec mismatch, then 10/10 green | passed |
| production-owned ESLint | lint tooling belongs in `devDependencies` | manifest template unit test | normalization duplicated ESLint across sections | remove production entry and write managed dev entry | red duplicate, then green | passed |
| wide config range | a range lower bound is not the installed config major | manifest template unit test | `>=14` short-circuited as Next 14 | use concrete Next 16 to pin ESLint 9 | red preserved `latest`, then green | passed |
| dependency section reconciliation | lockfile records production/dev classification | init integration test | exact version hid a production-to-dev move | run package-manager install after section move | red missing install, then green | passed |

Final handoff contract:
- Commit line: `d4c24966` (`fix next scaffold eslint resolution`)
- PR line: https://github.com/udecode/kitcn/pull/467
- Issue line: N/A; no standalone issue
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
  typecheck/lint, final 357-second `bun check`, secrets scan, and 0.91
  autoreview
- PR body verified: `gh pr view 467 --json body` confirms the task-style body;
  Codesmith appended only its standard footer

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
- Commit: `d4c24966`
- PR: https://github.com/udecode/kitcn/pull/467
- Issue: N/A; prerequisite discovered from PR CI, no standalone issue
- Browser proof: N/A; no rendered/browser behavior
- Caveats: the final material push requires one terminal exact-head CI,
  feedback read-back, and receipt in parent autoclosure before merge

Timeline:
- 2026-09-14T21:55:07.341Z Task goal plan created.

Reboot status:
| Question | Answer |
|----------|--------|
| Where am I? | Final review repair and verification |
| Where am I going? | Rerun the full gate, push the exact repair head, close review, merge #467, then unblock #464/#465 |
| What is the goal? | Deterministically pin compatible ESLint 9 in generated Next scaffolds and ship the prerequisite PR |
| What have I learned? | The loose upstream range behaves differently on Ubuntu CI and violates the plugin peer range |
| What have I done? | Reproduced four CI failures, implemented the owner fixes, closed prior review cycles, and added green proof for the final two P2 edge cases |

Open risks:
- GitHub Ubuntu resolution may expose a second install-order issue after the
  exact pin; the prerequisite PR CI is the authoritative final proof.

Hard closeout guard:
- A local-only final response for verified code-changing work is invalid unless
  this plan records an explicit user decline, no local patch, analytical/
  blocked/inconclusive outcome, or a real commit/PR blocker.
