# Harden the optimistic auth identity guard

Objective:
Fix the token identity guard and optimistic gate defects still present at
#473's head (fcbd2f84): one token gate, page-wide trip, client-scoped
optimistic window; done when every listed test fails at fcbd2f84 and passes.

Goal plan:
docs/plans/2026-09-30-harden-optimistic-auth-identity-guard.md

Template:
docs/plans/templates/task.md

Primary template:
docs/plans/templates/task.md

Applied packs:
- package-api (docs/plans/templates/packs/package-api.md)
- docs (docs/plans/templates/packs/docs.md)
- agent-native (docs/plans/templates/packs/agent-native.md)

Task source:
- type: single-PR bug-fix follow-up, one package
- id / link: follow-up to https://github.com/udecode/kitcn/pull/473 (merged
  as 16e0bb46, released in 0.33.6). This PR: https://github.com/udecode/kitcn/pull/475 (#475). Branch
  `feat/optimistic-auth-hardening-v2`, based on `main` 126f3e99. The work
  was built on #473's head fcbd2f84 (branch `feat/optimistic-auth-hardening`,
  last 67119913) and carried over as its net diff; the squash differs from
  fcbd2f84 only in #473's own plan files.
- title: fix(auth): harden the optimistic auth identity guard
- acceptance criteria: every defect in the case matrix has a test that fails
  at fcbd2f84 and passes here; nothing already fixed at fcbd2f84 is redone;
  #473's own tests keep passing; props-off behaviour unchanged.
- caveat: #473 was adopted by its maintainer (commits 29f558fb, 22855d78,
  ea5e442d, fcbd2f84). This PR carries the hardening from an independent
  review of #473 (seven rounds, kept on `wip/473-hardening-rounds`, cea25963)
  that his head does not have.
- likely files: `auth-client/convex-auth-provider.tsx`,
  `auth-client/client-settlement.ts`, `react/token-gate.ts`,
  `react/identity-guard-registry.ts`, `react/auth-mutations.ts`,
  `react/context.tsx`, `auth-start/index.ts`, their tests; auth docs and the
  kitcn skill mirror.
- browser surface: none rendered.
- root-cause layer: token cache writes and hand-outs that skipped identity
  admission; trip state local to one provider; refusal memory per token.

Timed checkpoint:
- requested duration: N/A; no duration requested.
- semantics: N/A.
- initial confidence score: N/A.
- improvement loop: N/A.
- final score / loop closure: N/A.

Completion threshold:
- Every case-matrix test fails at fcbd2f84 (probe recorded below) and passes
  here; #473's tests pass unchanged.
- `bun --cwd packages/kitcn typecheck` and build, `bun lint:fix` (no source
  change), `bun check` (only the pre-existing `fixtures:check` drift) and
  `test:verify` run with exact results.
- Closure is not claimed here: push, PR creation and live compliance
  read-back are reserved by the requester, and `bun check` stops on a
  pre-existing fixture drift; each is recorded as blocked or handed-off.
- `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-09-30-harden-optimistic-auth-identity-guard.md` passes.

Verification surface:
- Probe: this branch's `convex-auth-provider.test.tsx` run against
  fcbd2f84's source (a temporary stand-in for the new trip module), then the
  same file here.
- Focused: provider, context, use-query-options, client, auth-start retry,
  auth-mutations tests.
- `bun --cwd packages/kitcn typecheck`, build, `bun lint:fix`, `bun check`,
  `bun run test:verify`, `bun run intent:validate`, `bun run intent:stale`,
  MDX compile of `client.mdx`.
- `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-09-30-harden-optimistic-auth-identity-guard.md`

Constraints:
- Keep #473's maintainer changes (ea5e442d) where they already fix a defect;
  keep his plan files untouched.
- Props-off behaviour unchanged (cRPC HTTP headers already route through the
  fetcher in #473).
- When a GitHub PR is in scope, this plan owns exactly one PR.
- A task-run PR body must include `🧭 Task plan: docs/plans/<plan>.md`; the
  plan must exist at the PR head and identify the exact PR before
  autoclosure.

Boundaries:
- Source of truth: the defects reproduced at fcbd2f84 (case matrix) and the
  guarantees #473 documents.
- Allowed edit scope: the files under Task source; docs and skill mirror; one
  changeset; this plan.
- Browser surface: none.
- GitHub issue sync: N/A; no issue.
- Non-goals: #473's plan files, fixture drift repair, the app-set
  `Authorization` header, the opaque-token exchange path.

Output budget strategy:
- Test and gate output goes to `/tmp/h-*.log`; only counts, failing test
  names and exit codes are read back.

Blocked condition:
- Stop if a listed test passes at fcbd2f84 (the defect is already fixed) or
  if #473's own tests fail with this change.

Task state:
- task_type: bug fix (one package)
- task_complexity: non-trivial
- current_phase: closeout
- current_phase_status: verified source; final delivery externally handed off
- next_phase: push, exact-head verification, protected approval
- goal_status: implementation and local proof complete; landing approval external

Current verdict:
- verdict: source ready after two additional behavioral repairs
- confidence: 95% after focused, built, independent and full-gate proof
- next owner: autoclosure, then protected code-owner/last-push approver
- reason: both additional defects reproduced and repaired without public API
  changes; final exact-head delivery receipts are required before landing.

Implementation readiness:
- verdict: ready
- exact owner: one admission, page trip and identity
  (`react/identity-guard-registry.ts`), store-level wrappers
  (`react/token-gate.ts`), client settlement
  (`auth-client/client-settlement.ts`), provider admission and gate
- contradiction status: reconciled with ea5e442d (see Decisions)
- source-listed cases complete: yes

Pre-solution issue challenge:
- reporter claim: independent review of #473 found tokens of another
  identity reaching the store or Convex, trips that do not hold, and refused
  tokens reopening the optimistic gate.
- suggested diagnosis or fix: one gate for every token write and hand-out; a
  page-wide trip; an optimistic window per Convex client.
- repro ladder:
  - tests / source-level repro: this branch's provider tests run against
    fcbd2f84's source: 38 fail (list under Findings); 52 pass.
  - repo-owned automated browser or integration proof: N/A; provider and
    loader harnesses own the behaviour.
  - Browser plugin: N/A; no rendered UI.
  - screenshot / visual proof: N/A.
- reproduction verdict: reproduced (38 failing tests at fcbd2f84).
- validity verdict: valid; partially already fixed upstream (close before
  callback; admission-time getter reads; retry mock isolation; exp-less
  refresh/HTTP refusal), dropped from scope.
- best long-term fix boundary: the token gate and page-level state.
- harsh honest feedback: the surface is wide; the tests are the contract.
- hard-stop decision: proceed.

Completion rule:
- Do not call `update_goal(status: complete)` while any required checklist item
  remains unchecked. If an item does not apply, check it and add `N/A: <reason>`.
- Do not call `update_goal(status: complete)` until every completion threshold
  above is satisfied, final handoff evidence is recorded, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-09-30-harden-optimistic-auth-identity-guard.md` passes.
- Do not create hook state for this goal. This file plus the active goal are the
  durable state.

Start Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| Timed checkpoint parsed | no | N/A: no duration requested |
| Walkthrough baseline for possible UI change | no | N/A: no rendered UI |
| Skill analysis before edits | yes | `task`, `autogoal` (task + package-api, docs, agent-native), `changeset`; not `major-task` (one package, bug fixes) |
| Active goal checked or created | yes | This plan; Codex goal tools unavailable (Claude Code); `check-complete.mjs` is the proof |
| Source of truth read before edits | yes | #473 head fcbd2f84 diff (ea5e442d) and review findings read |
| Exact per-PR task ownership | yes | Not-yet-created follow-up PR; PR number added when opened |
| GitHub comments and attachments read | yes | #473 adoption commits and plans read locally; no issue |
| Video transcript evidence required | no | N/A: none |
| Pre-solution issue challenge required | yes | Recorded above |
| Reproduction verdict before implementation | yes | 38 tests fail at fcbd2f84 |
| Repro escalation ladder selected | yes | Focused tests; higher rungs N/A |
| Suggested fix reviewed against durable boundary | yes | Single gate and page state owners |
| `docs/solutions` checked for non-trivial existing-code work | yes | No entry covers these owners |
| TDD decision before behavior change or bug fix | yes | Red at fcbd2f84 (probe), green here |
| Branch decision for code-changing task | yes | `feat/optimistic-auth-hardening` from fcbd2f84 |
| Release artifact decision | yes | New patch changeset `.changeset/harden-auth-identity-guard.md` (#473's draft released in 0.33.6; see Decisions) |
| Browser tool decision for browser surface | no | N/A: no browser surface |
| Commit / PR expectation decision | yes | For verified code-changing work, default is commit, push, and PR because `task` explicitly requires it; N/A only for explicit user decline, no local patch, analytical/blocked/inconclusive work, or recorded blocker. |
| Task-style PR body decision | yes | Draft in the #459 task style |
| Task-plan PR body evidence | yes | Draft has one `🧭 Task plan:` line naming this file |
| GitHub issue sync expectation decision | no | N/A: no issue |
| Output budget strategy recorded | yes | Logs to `/tmp`, summaries only |
| Package/API pack selected | yes | Runtime behaviour of public props |
| Public surface or package boundary identified | yes | No new public export; new internal modules; `AuthMutationError` code `TOKEN_IDENTITY_CHANGED` |
| Convex entry/import graph impact identified | yes | Client and loader entries only; the loader imports only dependency-free `identity-guard-registry.ts` and `client-settlement.ts` |
| CLI/scaffold/generated impact identified | no | N/A: none |
| Release artifact path selected | yes | New `.changeset/harden-auth-identity-guard.md` (patch) |
| `changeset` skill loaded when `.changeset` is required | yes | Loaded; no unreleased changeset on the base, so a new file (see Decisions) |
| Package build / fixture impact decision recorded | yes | Build run; no scaffold change |
| Docs pack selected | yes | `www/content/docs/auth/client.mdx` changed |
| Docs guidance loaded | yes | Doc guidelines and `.agents/AGENTS.md` Docs rules |
| Docs lane selected | yes | Incidental reference docs |
| Target docs and nearest sibling docs read | yes | Auth client hooks, components and #473's optimistic auth section |
| Docs style doctrine read | yes | Latest-state voice |
| Documented source owner identified | yes | Provider JSDoc and tests |
| Agent-native pack selected | yes | kitcn skill reference changed |
| Agent-facing action surface identified | yes | Configuring the provider props from the skill |
| Source rule versus generated mirror boundary identified | yes | Source `packages/kitcn/skills/kitcn/**`, mirror via `bun tooling/sync-kitcn-skill.ts` |
| Installed-skill lock versus local-rule owner identified | yes | Repo-owned skill; no lock change |
| `agent-native-reviewer` loaded or waiver recorded | yes | Loaded; PASS, no findings (route unchanged, source edited, mirror synced) |

Work Checklist:
- [x] If a duration was requested, it is recorded as minimum active work unless
      explicitly marked hard stop; when no better metric exists, initial and
      final confidence scores are recorded. N/A: no duration requested.
- [x] Objective includes outcome, completion threshold, verification surface,
      constraints, boundaries, and blocked condition.
- [x] Task source classified with source type, id/link, title, task type,
      acceptance criteria, caveats, likely files/routes/packages, browser
      surface, and root-cause layer.
- [x] Every GitHub PR in scope has its own task plan. This plan owns one exact
      PR, owns a not-yet-created PR slice, or records N/A because no PR is in
      scope; a batch plan is not used as a substitute.
- [x] Required video or screen-recording evidence is cached/read as normalized
      `<video-transcripts>` XML, or marked N/A with reason. N/A: none.
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
- [x] Package/API pack: no-artifact decisions state why the diff has no published package user-visible delta from `main`. N/A: a changeset is added.
- [x] Package/API pack: compatibility, migration, or hard-cut decision is explicit when public shape changes.
- [x] Package/API pack: affected Convex static import graphs stay narrow and
      plugin/per-module boundaries are used where appropriate.
- [x] Package/API pack: CLI commands remain deterministic, `--json` capable,
      and non-interactive with explicit confirmation bypass when relevant. N/A: no CLI.
- [x] Package/API pack: docs and `packages/kitcn/skills/kitcn/**` stay
      current-state synchronized when public guidance changes.
- [x] Package/API pack: package-owned typecheck/build/test proof is recorded or marked N/A with reason.
- [x] Package/API pack: `packages/kitcn` build, fixture sync/check, or other owning package proof is recorded when required.
- [x] Docs pack: docs lane, target docs, nearest sibling docs, and source owner are recorded.
- [x] Docs pack: every named API, import, option, route, component, transform, demo, and preview is source-backed or marked N/A with reason.
- [x] Docs pack: docs use current-state reference voice, not changelog voice.
- [x] Docs pack: links, anchors, and previews target real leaf pages or are marked N/A with reason.
- [x] Agent-native pack: source-of-truth rule files are edited instead of generated skill mirrors.
- [x] Agent-native pack: the changed agent action is discoverable from the skill/rule text.
- [x] Agent-native pack: generated mirrors are synced when `.agents/rules/**` changed, or N/A reason is recorded. N/A: no `.agents/rules/**` change.
- [x] Agent-native pack: installed skills are changed only through
      `npx skills add/update/remove`; local rules/templates/helpers stay source-owned. N/A: no installed skill changed.
- [x] Agent-native pack: routing, required receipts, placeholder failure,
      completion representability, and forbidden behavior have eval/smoke rows. N/A: reference prose only.
- [x] Agent-native pack: accepted agent-native review findings are fixed or explicitly rejected with reason.

Completion Gates:
| Gate | Applies | Required action | Evidence |
|------|---------|-----------------|----------|
| Named verification threshold | yes | Run the command, proof, source audit, or artifact check named in this plan | See Verification evidence |
| Exact per-PR task ownership | yes | Record the exact PR and dedicated plan, or the not-yet-created single-PR slice | Exact PR https://github.com/udecode/kitcn/pull/475; body names this plan and fetched head contains it |
| Pre-solution issue challenge verdict | yes | Record reporter claim, suggested fix, repro verdict, validity verdict, durable boundary, and hard-stop/pivot decision before implementation | Valid; reproduced |
| Repro escalation ladder | yes | For bug/behavior claims, record test/source-level, automated browser/integration, Browser, and screenshot/visual-proof outcomes or N/A/blocker reasons before `not reproduced` | Unit and integration tests; other rungs N/A |
| Bug reproduced before fix | yes | Record failing test/repro or N/A with reason | 38 fail at fcbd2f84 |
| Targeted behavior verification | yes | Run focused test/proof for changed behavior or record N/A | Focused suites pass (see evidence) |
| TypeScript or typed config changed | yes | Run relevant typecheck | `bun --cwd packages/kitcn typecheck` exit 0 |
| Package exports or file layout changed | yes | Run the relevant package build before final verification and keep generated updates | Build exit 0; three new internal modules, no export change |
| Package manifests, lockfile, or install graph changed | no | Run `bun install` and relevant package checks | N/A: none |
| Agent rules or skills changed | yes | Run `bun install` and verify generated skill sync | Skill source changed; mirror synced; intent validate/stale pass; no `.agents/rules/**` change |
| Workspace authority proof | yes | Run verification in the owning repo/package/app/route/tool and record cwd; do not count the wrong workspace as proof | All commands at the kitcn root on this branch |
| Browser surface changed | no | Capture Browser Use proof or record explicit waiver/blocker | N/A |
| Browser final proof | no | Attach screenshot or exact browser verification caveat when browser proof applies | N/A |
| UI walkthrough | no | If UI or rendered output changed, run `.agents/skills/walkthrough/SKILL.md` after final proof and show annotated images in the final handoff; otherwise record N/A | N/A: no rendered output |
| Scaffold or fixture output changed | no | Run `bun run fixtures:sync` and `bun run fixtures:check`, or record N/A | N/A for scaffold code: no scaffold change. Snapshots resynced in a separate commit because the upstream templates drifted after 0.33.6's CI; `fixtures:check` exit 0 |
| Package behavior or public API changed | yes | Add a changeset or record why no changeset applies | New patch changeset |
| Docs and kitcn skill sync changed | yes | Keep `www/**` and `packages/kitcn/skills/kitcn/**` in sync, or record N/A | `client.mdx` and skill `auth.md` updated and synced |
| Docs or content changed | yes | For docs-heavy work, use `--template docs`; for incidental docs, verify source-backed claims, links, examples, and rendered output or record N/A | Claims checked against source and tests; MDX compiles |
| High-risk mini gate | yes | For public API/runtime/package-boundary/browser/agent-action/command-contract changes, record realistic failure mode, proof plan, and why the chosen boundary is right; otherwise N/A | Failure mode: a legitimate token refused or a foreign one admitted; proof: the case matrix plus #473's tests; boundary: one gate every write goes through |
| Agent-native review for agent/tooling changes | yes | For `.agents/**`, `.claude/**`, `.codex/**`, skills, hooks, commands, prompts, or user-action tooling, load `.agents/skills/agent-native-reviewer/SKILL.md` and close accepted/actionable findings, or record N/A | PASS, no findings |
| Local install corruption suspected | no | Run `bun install` once, rerun the exact failing command, or record N/A | N/A: pinned Bun 1.3.9 used throughout |
| Commit created | yes | For verified code-changing work, stage the entire current checkout per repo policy and create a commit; N/A only for no local patch, explicit user decline, analytical/blocked/inconclusive work, or recorded external blocker | Runtime, docs and plan commits on this branch |
| PR create or update | handed-off | For verified code-changing work, run `check`, push, create or update the PR, and sync PR body to the task-style final handoff; N/A only for no local patch, explicit user decline, analytical/blocked/inconclusive work, or recorded external blocker | Exact PR #475 updated by autoclosure; no history rewrite; final receipts recorded externally after versioned evidence push |
| Task-style PR body verified | handed-off | Verify the PR body with `gh pr view --json body`; it must preserve auto-release blocks when applicable, must not include a current-PR self-link, and must use the PR #270 emoji format: `🐛 Fixes ...`, `🟢 95-100% confidence`, `Phase / 🧪 Tests / 🌐 Browser` table, and bold emoji Outcome/Caveat/Design/Verified sections | Pending: draft body local; `gh pr view --json body` read-back after it is applied |
| PR task evidence verified | yes | Verify body plan line, plan at PR head, and exact PR ownership | Exact PR #475 verified COMPLETE at f9016674; body names this existing plan |
| PR proof image hosting | no | If PR body needs browser proof, replace local image paths with hosted GitHub URLs or record N/A | N/A: no images |
| GitHub issue sync-back | no | Post concise issue sync after PR exists, or record N/A/blocker | N/A: no issue |
| Final handoff contract | yes | Fill the final handoff fields below with exact PR/issue/confidence/tests/browser/outcome/caveats/design/verification content or N/A reason | Filled below |
| Final lint | yes | Run `bun lint:fix` or scoped equivalent | `bun lint:fix` exit 0, no source change |
| Output budget discipline | yes | Verify no unbounded high-volume command output was streamed, or record the accidental output and recovery | Summaries only |
| Timed checkpoint | no | If duration was requested, keep improving until elapsed, then finish the current loop cleanly; otherwise N/A | N/A |
| Autoreview for non-trivial implementation changes | yes | Load `.agents/skills/autoreview/SKILL.md`; use dirty local `--mode local`, branch/PR `--mode branch --base <base>`, or committed slice `--mode commit --commit <ref>` until no accepted/actionable findings, or record N/A for docs-only/trivial/no local patch | 2026-10-01 branch review at 90a1653e vs main126f3e99: TruffleHog clean, one full bundle, exit0, no accepted/actionable P0 findings |
| Goal plan complete | yes | Run `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-09-30-harden-optimistic-auth-identity-guard.md` | `[autogoal] complete` |
| Public API / package boundary proof | yes | Source-audit public API, exports, and package boundary impact | No export change; `TOKEN_IDENTITY_CHANGED` error code on sign-in mutations after a trip |
| Convex bundle/import proof | yes | Audit affected function-entry static graphs or record N/A | Loader entry imports two dependency-free modules |
| CLI/scaffold/generated proof | no | Prove command contract and regenerate owned output or record N/A | N/A |
| Release artifact classification | yes | Record whether the change is published package behavior/API/types/config/runtime or no published user-visible delta | Published runtime behaviour |
| Published package changeset | yes | If published package users see a delta, load `changeset` and add/update one `.changeset/*.md` per package | One `kitcn` patch changeset |
| No release artifact | no | If no artifact is needed, record the exact reason: internal-only, docs-only, agent-only, test-only, or no user-visible delta from `main` | N/A: changeset added |
| Package typecheck/build/test | yes | Run owning package checks or record N/A with reason | typecheck 0, build 0, focused pass |
| Fixture/scaffold generation | no | Run `bun run fixtures:sync` and `bun run fixtures:check` when scaffold output changed, otherwise N/A | N/A: no scaffold change |
| Docs/package skill sync | yes | Synchronize current-state public guidance or record N/A | Synced; intent validate and stale pass |
| Docs source-backed claim audit | yes | Verify docs claims against current source or record N/A | Claims match provider source and tests |
| Docs links / routes / previews | no | Verify leaf links, routes, anchors, and preview names or record N/A | N/A: no new links |
| Docs MDX/content parser | yes | Run the relevant `www` docs parser/build for MDX/content changes, or record N/A | `client.mdx` compiles with `@mdx-js/mdx` |
| Kitcn docs sync | yes | If `www/**` changed, update matching `packages/kitcn/skills/kitcn/**` content or record N/A | Skill `auth.md` mirrors the page |
| Agent source / generated sync | yes | Run `bun install` when `.agents/rules/**` changed and verify generated mirrors | Mirror synced by its owner command |
| Installed lock audit | no | Verify expected lock entries and removed skills through CLI-managed state | N/A: no installed skill changed |
| Agent action discoverability | yes | Source-audit the skill/rule path an agent will read | `SKILL.md` routes to `references/features/auth.md` |
| Helper and template smoke | no | Syntax-check helpers and prove incomplete failure/completed representation when applicable | N/A: none changed |
| Agent-native review | yes | Load `.agents/skills/agent-native-reviewer/SKILL.md` and close accepted findings, or record N/A | PASS, no findings |

Phase / pass table:
| Phase | Status | Evidence | Next |
|-------|--------|----------|------|
| Intake and source read | done | #473 head and review history read | implementation |
| Implementation | done | Port of the hardening onto fcbd2f84, reconciled with ea5e442d | verification |
| Verification | done | Probe at fcbd2f84, focused suites, full gate | closeout |
| Commit / PR / GitHub sync | handed-off | Source commits plus final proof snapshot on exact #475 | post-push receipts |
| Closeout | blocked | Protected code-owner and last-push approval; no bypass | authorized reviewer |

Findings:
- Probe at fcbd2f84 (this branch's provider tests, 44 in the `identity guard
  admission` block, against #473's source; a temporary inert stand-in for
  the new trip module): 38 fail, 6 pass. Failing, by defect:
  - held SSR token not admitted: `a held SSR token of another identity never
    opens the optimistic gate and trips the guard`, `a held SSR JWT of
    another identity is withheld whatever its exp`;
  - store token opens the gate without admission: `a token seeded into the
    store opens the optimistic gate only if the guard would admit it`;
  - restore not admitted: `an opaque persisted session token is not
    restored while an identity is established`, `a persisted JWT of another
    identity is not restored`;
  - concurrent first tokens: `concurrent first tokens: the losing identity
    is never cached`;
  - identity-less JWT: `with an identity established, a JWT without one is
    refused`, `an admitted identity refuses a later JWT without one`,
    `before any identity, a JWT without one is handed out and announced
    without setting it`;
  - sign-in-returned token not admitted: `a JWT a sign-in returns for
    another identity is refused and trips the document`, `a sign-in
    returning a JWT of another identity fails whatever its exp`, `a sign-in
    fails if the document moved identity before authenticated is published`;
  - Start loader not held to the page: `the Start loader hands no token to a
    fresh client after a trip`, `the Start loader refuses a token of another
    identity than the document admitted`, `the Start loader refuses another
    identity before the provider fetches, from its baseline or held token`,
    `the Start loader refuses a JWT of another identity whatever its exp`;
  - trip does not publish unauthenticated or hold: `a trip publishes a
    terminal unauthenticated state that Convex cannot reopen`, `nothing
    writes a token back after a trip, not even the hydration fallback`;
  - trip is local to one provider: `two mounted providers sharing a client:
    tripping one quarantines the other`, `a later provider over a tripped
    client starts tripped`, `a remount with a fresh client cannot reopen the
    document after a trip`, `an in-flight fetch in an unguarded provider
    hands out nothing after a trip`, `a trip from the Start loader calls the
    mounted guarded provider once`, `a trip calls every mounted guarded
    provider once, even when one callback throws`;
  - sign-in on a tripped page succeeds: `a sign-in on a tripped document
    surfaces an error and publishes nothing`, `a trip during a sign-in,
    sign-up or social sign-in fails it before anything is published`,
    `waiting for auth after a sign-in fails at once when the document trips`;
  - refused token reopens the optimistic gate: `a token Convex refused never
    reopens the optimistic gate, even after another refusal`, `a refusal
    hidden behind the SDK's transparent retry never reopens the gate`, `a
    refused token after a prior confirmation never reopens the gate`, `no
    number of refusals lets a refused token reopen the gate`, `a remount
    over a client that already reported auth gets no optimism`;
  - settlement: `a client's auth result reported before React commits still
    ends its optimistic window`, `one provider's refusal ends the optimistic
    window of another over the same client`, `a client the Start loader
    authenticated gets no optimistic window; a fresh one does`;
  - stale publication: `a trip in a descendant effect is not overwritten by
    a stale optimistic publication`, `a settlement in a descendant effect is
    not overwritten by a stale optimistic publication`;
  - mechanism test (not a defect): `the settlement wrapper is installed only
    with optimisticAuth, once`.
  Tests that trigger the trip through the new module directly (`a trip
  during a sign-in...`, `waiting for auth...`, `a trip in a descendant
  effect...`) have public-API counterparts in the same list (`a sign-in on a
  tripped document...`, the two-provider test).
- Passing at fcbd2f84, dropped from scope as already fixed or never broken:
  `a throwing onTokenIdentityChange still closes the client` (ea5e442d closes
  before the callback; our duplicate test removed, his kept), `a JWT of
  another identity is refused whatever its exp: refresh and HTTP` (his
  admission decodes identity independent of `exp`). Controls that pass
  before and after: `a held SSR token of the baseline identity still opens
  the optimistic gate`, `a persisted JWT of the established identity is
  restored`, `losing the local session does not end a fresh client
  optimistic window`, `a JWT without exp of the established identity is
  handed out but never opens the optimistic gate`.
- Also already fixed at fcbd2f84 and kept as his: retry mock isolation
  (29f558fb, kept over our `spyOn` version), admission-time getter reads (his
  guard never reads the getter at mount; kept, and the Start loader reads a
  getter baseline only at admission), the `DecorateMutation` JSDoc and
  `ConvexOptimisticUpdateOption` `Value` typing.

Decisions and tradeoffs:
- Classification: `task`, not `major-task` (one package, bug fixes).
- Reconciliation with ea5e442d: his close-before-callback kept in spirit;
  ours is strictly stronger (a throwing callback is caught and logged, and
  one throwing subscriber cannot stop another provider's). His getter
  semantics kept (no getter read at mount; his test asserts it); the held
  SSR check reads the getter only when there is a held token to admit. His
  naming (`decodeTokenSubjectSessionIdentity`,
  `resolveTokenIdentityBaseline`, `currentDocumentIdentity`) adopted.
- Changeset: #473's draft was released in 0.33.6 (126f3e99), so per the
  `changeset` skill this PR adds a new patch changeset,
  `.changeset/harden-auth-identity-guard.md` (`## Patches`, three `Fix`
  bullets). Until the rebase the lines were appended to #473's unreleased
  draft (round H1, H8).

Implementation notes:
- Ported from `wip/473-hardening-rounds` (cea25963): `react/token-gate.ts`,
  `react/identity-guard-trip.ts`, `auth-client/client-settlement.ts`,
  provider, `react/context.tsx`, `react/auth-mutations.ts`,
  `auth-start/index.ts`, and their tests (appended to #473's provider test
  file as the `identity guard admission` block).

Review fixes:
- Earlier review rounds that produced the ported code are recorded on
  `wip/473-hardening-rounds` in `docs/plans/473-optimistic-auth-gate.md`.
- Round H1 (Codex lanes: standards, spec, adversarial on 66da0e78). Red
  logs kept outside the repo (`kitcn-1596-bodies/h1-red.log`, `h2-red.log`).
  - H1 fixed (309f876b), behavioural at the artifact level: `auth/start` is
    a separate tsdown build group from `auth/client` and `react`, so each
    bundle had its own trip, page identity and settlement state. All of it
    (plus admissions and the settlement wrapper marker) now lives in one
    `globalThis` registry under `Symbol.for('kitcn.identityGuard.v1')`
    (`react/identity-guard-registry.ts`); browser-only semantics unchanged.
    New `identity-guard.entrypoints.integration.test.tsx` imports
    `kitcn/auth/client`, `kitcn/auth/start` and `kitcn/react` from the
    build: loader settlement seen by the provider; provider page identity
    holds the loader; a provider trip stops the loader (3 red, then green).
    No other new module-level state remains.
  - H2 fixed (6346b55d), behavioural: the Start loader requires the
    recorded page identity and every getter's current answer (read at
    admission). Test `the Start loader holds a token to both the recorded
    page identity and the current getter`.
  - H3 fixed (6346b55d), behavioural: provider admission and the held SSR
    check honour the recorded page identity. Test `a sibling provider
    without a baseline cannot admit another identity after the page
    admitted one`.
  - H5 fixed (6346b55d), behavioural: the page identity is recorded in a
    layout effect (commit), before passive effects hand Convex a fetcher;
    it is never unrecorded. Test `an identity recorded in an abandoned
    render does not quarantine the page`. The render-time settlement
    wrapper install and admission registration stay, with a comment on why
    a discarded render is harmless.
  - H4 fixed (fc43523e), behavioural: auth-state publication reads the
    store's token at the write. Test `auth-state publication reads the held
    token at the write`.
  - H6 fixed (fc43523e), behavioural: `publishToken` rechecks the trip after
    admission (which runs `onTokenIdentityAdmitted`). Test `a trip inside
    onTokenIdentityAdmitted leaves no token in the store`.
  - H7 fixed (fc43523e), behavioural: only a structural JWT with a future
    `exp` opens the optimistic gate. Test `a token that is not a JWT never
    opens the optimistic gate, whatever its payload`.
  - H8 fixed (the round H1 plan commit): changeset folded (see Decisions).
  - H9 fixed (body): getter reads happen at admission, including the
    initial SSR admission.
- Round H2 (Codex lanes: adversarial and spec on 3cb36826). The remaining
  P1s shared one cause: admission was split between per-provider
  constraints and the page registry, and paths checked different subsets.
  Red logs kept outside the repo (`kitcn-1596-bodies/j-red.log`: 7 fail;
  `j-built-red.log`: 2 fail against the round H1 build).
  - J1 fixed (7d3a9d6d), structural: one `admitToken` in
    `react/identity-guard-registry.ts`, called by every path (SSR hydration,
    fetcher fresh and cached and the final hand-out, restore, hydration
    fallback, sign-in tokens and publication, `AuthStateSync`, HTTP
    headers, the Start loader); callers keep no admission logic. Order: page
    trip; opaque-token policy; identity against the page identity, the
    provider's own baseline and admitted identity, and every mounted
    getter's current answer (identity-less JWTs refused once any is bound);
    `onTokenIdentityAdmitted`; the trip again. A refused JWT trips the page.
    Mounted providers live in the registry (added in a layout effect,
    removed at unmount); held tokens are reconciled against the page when
    a guard joins it and at every admission. `identity-guard-trip.ts` is folded into the registry module.
    Tests: `a later SSR token must match both its baseline and the page
    identity`; `providers mounted together with SSR tokens of two
    identities trip the page`; `a trip inside onTokenIdentityAdmitted at a
    cached hand-out hands out nothing`; `a sibling without a getter is
    bound by another guard's current getter`; built: `a sibling in
    kitcn/auth/client is bound by another guard's current getter`, `an SSR
    token in kitcn/auth/client is reconciled against the page identity`.
    One existing test changed contract: a foreign token seeded into the
    store now trips the page at the optimistic gate instead of only keeping
    it closed (`a token seeded into the store opens the optimistic gate
    only if the guard admits it`).
  - J2 fixed (7d3a9d6d), behavioural: `pageRegistry()` returns null on the
    server and never creates the registry; trip, identity, settlement and
    getters are all read through it. Tests `a server-only loader creates,
    reads and writes no page state`; `page state left by a torn-down DOM
    does not reach a server call`.
  - J3 fixed (7d3a9d6d), behavioural: the cached-token path classifies with
    `isJwt`, so a two-segment opaque credential goes to the exchange as the
    bearer, never to Convex. Test `a cached two-segment opaque credential
    goes to the exchange, never to Convex`.
  - Net non-test `src` delta: +386 / -441 (net -55); the provider lost 129
    lines.
- Round H3 (Codex lanes: adversarial and spec on eeda2dae), one commit
  (eaefa418). Red log `kitcn-1596-bodies/k-red.log`: 8 source tests fail
  before the fix. The built cases were not shown red against a build of
  the prior source (the attempt was abandoned; see Error attempts); their
  source twins were red.
  - K1 fixed, behavioural: the HTTP token source admits after the app
    headers load (both the fetcher and the store-token branch) and marks the
    headers with a recheck that `executeHttpRequest` runs synchronously
    right before dispatch, after per-call headers load; refused, the
    `Authorization` is dropped. Tests `the store-token fallback admits after
    the app headers load`; `no kitcn token is sent when the page trips while
    per-call headers load`; built `kitcn/react HTTP sends no kitcn token once
    the page trips while per-call headers load`.
  - K2 fixed, behavioural: auth-state publication admits the held token
    (`hold`) before the optimistic window and expiry checks. Tests `a
    foreign token seeded after Convex confirmed trips and never publishes
    authenticated`; `an expired foreign token seeded into the store trips
    the page`.
  - K3 fixed, behavioural: a fixed baseline is captured on the first
    render; only a getter is read live. Test `a fixed baseline is read on
    the first render only`.
  - K4 fixed, wording: held tokens are reconciled when a guard joins the
    page and at every admission (registry JSDoc, provider comment, docs,
    skill, body, this plan). No per-commit reconciliation added.
  - K5 fixed, behavioural: `identityGuardInPlay` (guarded provider, mounted
    guarded sibling, or a bound identity) gates structural classification;
    without it cached-token routing is by `exp` exactly as at fcbd2f84.
    Tests `with no guarded provider, a cached opaque credential is handed
    out as before`; `with a guard, a cached opaque credential is exchanged,
    whatever the session state`; built `a cached opaque credential in
    kitcn/auth/client: direct with no guard, exchanged with one`.
  - K6 fixed, behavioural: key `kitcn.identityGuard.v2`, shape validated;
    another shape under it is never used (a local stand-in, a console
    warning, guarded admissions fail closed). Test `an incompatible
    registry under the key fails guarded admissions closed`.
  - K7 fixed, wording: JSDoc, `client.mdx`, skill and mirror, body state
    the unguarded scope (narrowed in round H4, L6: a page that never
    enables a guard is unchanged; an established page identity persists
    until reload, even after the guard unmounts).

- Round H4 (Codex lanes: adversarial and spec on 080f48b7), one commit
  (7b9924d6). Red logs `kitcn-1596-bodies/l-red.log` (5 source tests fail)
  and `l-built-red.log` (2 built cases fail against the round H3 build, the
  7 earlier built cases pass there); then rebuilt and green.
  - L1 fixed, behavioural: guardedness is read at every commit; a guard
    enabled after mount is seeded from its fixed baseline or held token,
    joins the page (`joinPage`) and reconciles held tokens. A fixed
    baseline value stays first-render-only. Test `a guard enabled after
    mount binds the identity the provider holds`.
  - L2 fixed, behavioural: on a page with a mounted guarded provider, the
    first identity any admission admits claims the page, the Start loader
    included. Tests `on a guarded page, the Start loader's first admitted
    JWT claims the page identity`; built `kitcn/auth/start's first JWT
    claims the identity of a page kitcn/auth/client guards`.
  - L3 fixed, behavioural: `publishAuthState` admits the current held
    token and reads the trip again after the loading write, right before
    an authenticated write. Tests `a token swapped by a loading subscriber
    is admitted before authenticated is published`; `a trip in a loading
    subscriber is seen before authenticated is published`; built `kitcn/
    auth/client admits the held token again right before publishing
    authenticated`.
  - L4 fixed, behavioural: the Start loader reads the trip after `setAuth`
    and refuses (clears both clients) if it tripped. Test `the Start loader
    refuses when its setAuth trips the page`.
  - L5 accepted and documented (registry key comment, JSDoc, `client.mdx`,
    skill and mirror, body Caveat): two kitcn versions or revisions on one
    page (dev HMR across revisions included) are unsupported; registries
    under different keys, or next to an incompatible object under the key,
    share no page identity until reload. The detecting entry keeps K6's
    fail-closed behaviour. v3-adversarial findings 4 (v1 and v2 keys split
    the identity) and 5 (per-copy stand-in) are accepted on this rationale.
  - L6 fixed, wording: a page that never enables the guard is unchanged;
    an established page identity persists until reload, binding every
    provider and the loader, even after the guard unmounts.
  - L7 fixed: the owner, import-graph and release-artifact rows name
    `identity-guard-registry.ts` and the folded changeset.

Error attempts:
| Error / failed attempt | Count | Next different move | Resolution |
|------------------------|-------|---------------------|------------|
| Built red for round H3: a chained shell command meant to stash the fix, build and restore failed on zsh word splitting; its fallback `git checkout` reverted the uncommitted registry edits and `git stash pop` applied an unrelated stash (feat/crpc-optimistic-update split-B) into this worktree | 1 | Re-applied the registry edits; no chained stash moves | Registry restored and re-verified; the popped stash's two untracked files remain in this worktree, byte-identical to dangling stash commit 7ae5df22 (restoring the stash entry and deleting the files is left to the requester) |

Verification evidence:
- 2026-10-01 autoclosure in
  `/Users/zbeyens/.codex/worktrees/pr475-autoclosure/better-convex` (Bun 1.3.12):
  - Intake head f9016674, base main 126f3e99; COMPLETE task state, preserved.
  - Late enablement regression: mounting unguarded, tripping, then enabling
    `onTokenIdentityChange` failed with 0 closes, expected 1. The repaired
    provider quarantines once independently of its one-time notification,
    and checks the terminal trip when the callback becomes enabled.
  - Post-callback baseline regression: `onTokenIdentityAdmitted` changed the
    live getter from A to B. RED observed A in token subscribers before its
    eventual refusal. Admission now re-enters without announcing after the
    callback, checking all current identities before any token publication.
  - Late-enable regression GREEN: 1 pass; source auth-client/react/auth-start: 294 pass,
    0 fail across 22 files; source-first package typecheck and build pass.
  - Final repaired-source full `bun check` exit0: Bun1556/0, Vitest1053 pass
    and14 skipped, CLI124/0, lint/typecheck, Concave, fixture freshness,
    consumer verify and runtime scenarios. Final focused suites295/0 and
    built-entrypoint integration10/0; both new regressions GREEN.
  - Typed token endpoint call replaces an unnecessary `any`; nullable results
    retain the existing no-token behavior. Internal narrative comments were
    removed while protocol, SSR and Convex ordering constraints were retained.
  - Published auth guidance updated through its source; generated mirror
    synced. Intent validation/staleness, MDX compile and mirror parity pass.
  - Independent verifier uses its own worktree; parent baseline 123/0,
    original candidate focused 192/0 plus built-entrypoint 10/0.
  - Autoreview exit0 and TruffleHog clean. Final-head replay, delivery and
    terminal feedback receipts continue externally after the versioned plan
    push, as specified in docs/plans/475-autoclosure.md; no approval bypass.
- The snapshots below are historical author evidence, not final-head proof.
- Probe (Bun 1.3.9, fcbd2f84 source, this branch's provider tests, inert
  stand-in for the trip module): 52 pass, 38 fail (Findings); log kept
  outside the repo.
- Current (Bun 1.3.9, HEAD 7b9924d6 plus this plan):
  - `bun run build` (packages/kitcn): exit 0.
  - Focused (provider 115, context 13, auth-mutations 11, use-query-options
    24, client 14, auth-start retry 1): 178 pass, 0 fail, 0 `act` warnings.
  - Built-entrypoint integration (`identity-guard.entrypoints` 9,
    `package-entrypoints` 1): 10 pass, 0 fail.
  - `bun lint:fix`: 979 files, no fixes applied; `bun lint` exit 0.
  - `bun check`: exit 1 at `fixtures:check` (the `expo` drift) after every
    earlier lane passed: lint, typecheck, `test:bun` 1554 pass / 0 fail (155
    files), `test:vitest` 1053 pass / 14 skipped, no type errors,
    `test:cli` 124 pass / 0 fail, Concave smoke.
  - `test:verify`: exit 0.
  - `client.mdx` compiles; skill mirror synced.
  - `check-complete.mjs`: `[autogoal] complete` (gates resolved or recorded
    as blocked or handed-off; not closure).
- Round H3 snapshot (Bun 1.3.9, HEAD eaefa418 plus this plan):
  - `bun run build` (packages/kitcn): exit 0.
  - Focused (provider 110, context 13, auth-mutations 11, use-query-options
    24, client 14, auth-start retry 1): 173 pass, 0 fail, 0 `act` warnings.
  - Built-entrypoint integration (`identity-guard.entrypoints` 7,
    `package-entrypoints` 1): 8 pass, 0 fail.
  - `bun lint:fix`: 979 files, no fixes applied; `bun lint` exit 0.
  - `bun check`: exit 1 at `fixtures:check` (the `expo` drift) after every
    earlier lane passed: lint, typecheck, `test:bun` 1547 pass / 0 fail (155
    files), `test:vitest` 1053 pass / 14 skipped, no type errors,
    `test:cli` 124 pass / 0 fail, Concave smoke.
  - `test:verify`: exit 0.
  - `client.mdx` compiles; skill mirror synced.
  - `check-complete.mjs`: `[autogoal] complete` (gates resolved or recorded
    as blocked or handed-off; not closure).
- Round H2 snapshot (Bun 1.3.9, HEAD 7d3a9d6d plus this plan):
  - `bun run build` (packages/kitcn): exit 0.
  - Focused (provider 104, context 11, auth-mutations 11, use-query-options
    24, client 14, auth-start retry 1): 165 pass, 0 fail, 0 `act` warnings.
  - Built-entrypoint integration (`identity-guard.entrypoints` 5,
    `package-entrypoints` 1): 6 pass, 0 fail.
  - `bun lint:fix`: exit 0, 979 files, no fixes applied, source unchanged;
    `bun lint` exit 0.
  - `bun check`: exit 1 at `fixtures:check` (the `expo` drift) after every
    earlier lane passed: lint, typecheck, `test:bun` 1537 pass / 0 fail (155
    files), `test:vitest` 1053 pass / 14 skipped, no type errors,
    `test:cli` 124 pass / 0 fail, Concave smoke.
  - `test:verify`: exit 0.
  - `intent:validate` all passed, `intent:stale` up to date; `client.mdx`
    compiles.
  - `check-complete.mjs`: `[autogoal] complete` (gates resolved or recorded
    as blocked or handed-off; not closure).
- Round H1 snapshot (Bun 1.3.9, HEAD fc43523e plus changeset and this plan):
  - `bun --cwd packages/kitcn build`: exit 0; typecheck exit 0.
  - Focused (provider 97, context 11, auth-mutations 11, use-query-options
    24, client 14, auth-start retry 1): 158 pass, 0 fail, 0 `act` warnings.
  - Built-entrypoint integration (`identity-guard.entrypoints` 3,
    `package-entrypoints` 1): 4 pass, 0 fail.
  - `bun lint:fix`: exit 0, no fixes applied, source unchanged.
  - `bun check`: exit 1 at `fixtures:check` (the `expo` drift) after every
    earlier lane passed: lint (biome 980 files, eslint), typecheck 5/5,
    `test:bun` 1528 pass / 0 fail (155 files), `test:vitest` 1053 pass / 14
    skipped, no type errors, `test:cli` 124 pass / 0 fail, Concave smoke.
  - `test:verify`: exit 0.
  - `check-complete.mjs`: `[autogoal] complete` (gates resolved or recorded
    as blocked or handed-off; not closure).
- Historical snapshot (Bun 1.3.9, HEAD 7b8f3179 plus changeset and this plan):
  - `bun --cwd packages/kitcn build`: exit 0; typecheck exit 0.
  - Focused (provider 91, context 11, auth-mutations 11, use-query-options
    24, client 14, auth-start retry 1): 152 pass, 0 fail, 0 `act` warnings.
  - `bun lint:fix`: exit 0, no fixes applied, source unchanged.
  - `bun check`: exit 1 at `fixtures:check` (the `expo` drift, pre-existing
    on `main`) after every earlier lane passed: lint, typecheck 5/5,
    `test:bun` 1519 pass / 0 fail (154 files), `test:vitest` 1053 pass / 14
    skipped, no type errors, `test:cli` 124 pass / 0 fail, Concave smoke.
  - `test:verify`: exit 0.
  - `intent:validate` "all passed", `intent:stale` "All skills up-to-date";
    `client.mdx` compiles.
  - `test:runtime`: not run locally (its `expo` scenario needs port 3210,
    held by an unrelated local backend).
  - `check-complete.mjs`: `[autogoal] complete` (gates resolved or recorded
    as blocked or handed-off; not closure).

Source-listed case matrix:
| Case | Source claim | Harness | Before (fcbd2f84) | Expected after | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Held SSR token of another identity admitted before publication | provider tests | published, gate open | withheld, trip | pass | done |
| 2 | Store token opens the gate only if admissible | provider test | opens | closed | pass | done |
| 3 | Restore admits a persisted credential | provider tests | restored | not restored | pass | done |
| 4 | Concurrent first tokens never publish the loser | provider test | published | never | pass | done |
| 5 | Identity-less JWT refused once an identity exists | provider tests | handed out | refused | pass | done |
| 6 | Sign-in-returned JWT admitted; authenticated re-admits | provider tests | published | refused, trip | pass | done |
| 7 | Start loader held to the page identity | provider tests | token handed out | refused | pass | done |
| 8 | Trip publishes unauthenticated; nothing writes back | provider tests | stays authenticated | unauthenticated | pass | done |
| 9 | Trip page-wide; each guarded provider closes and calls back once | provider tests | local only | page-wide | pass | done |
| 10 | Sign-in on a tripped page fails with `TOKEN_IDENTITY_CHANGED` | provider tests | success | error | pass | done |
| 11 | Refused token never reopens the optimistic gate | provider tests | reopens | closed | pass | done |
| 12 | Settlement recorded where Convex reports it; loader settles its client | provider tests | missed | settled | pass | done |
| 13 | Auth-state publication reads current trip and settlement | provider tests | stale `true` | never | pass | done |

- Final-head snapshot (Bun 1.3.9, base `main` 126f3e99, commit 88fb6c4f; content identical to 67119913 in `packages/kitcn/src`, `www`, skills and `.agents`):
  - `bun install` exit 0; `bun --cwd packages/kitcn build` exit 0.
  - Focused suites (provider, context, auth-mutations, use-query-options, client, auth-start retry): exit 0. Built entrypoints: exit 0.
  - `bun run check:ci`: lint (979 files, no fixes), typecheck 6/6 packages, `test:bun` 1554 pass / 0 fail (155 files), `test:vitest` 1053 pass / 14 skipped, `test:cli` 124 pass, Concave smoke passed; exit 1 only at `fixtures:check` on the `next` fixture (create-next-app `AGENTS.md` text changed upstream; no fixture or scaffold change in this PR).
  - `bun run test:verify`: exit 0.
  - `test:runtime`: not run locally (port 3210 held by an unrelated local backend).

Final handoff contract:
- Commit line: runtime, docs and plan commits on `feat/optimistic-auth-hardening`.
- PR line: https://github.com/udecode/kitcn/pull/475 (#475), follow-up to #473.
- Issue line: `🐛 Fixes ➖ N/A`
- Confidence line: `🟢 95% confidence`
- Flow table:
  - Reproduced: 38 tests fail at #473's head; browser N/A
  - Verified: focused 295 pass, built-entrypoint 10 pass, full repository/runtime gate; browser N/A
- Browser check: N/A.
- Outcome: the identity guard and optimistic gate hold their documented guarantees.
- Caveat: protected approval external; one optimism setting per client;
  mixed kitcn revisions unsupported until reload.
- Design:
  - Chosen boundary: one admission function in the registry; page-level trip and identity; client window.
  - Why not quick patch: each bypass was a separate write path.
  - Why not broader change: no API change needed.
- Verified: see Verification evidence.
- PR body verified: existing exact plan line read back; final updated proof body
  has a post-push read-back gate in docs/plans/475-autoclosure.md.

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
- Commit: 88fb6c4f (net content of `feat/optimistic-auth-hardening` 67119913 on `main` 126f3e99) plus this plan update, branch `feat/optimistic-auth-hardening-v2`.
- PR: https://github.com/udecode/kitcn/pull/475 (#475).
- Issue: N/A.
- Browser proof: N/A.
- Caveats: final protected approval belongs to another authorized reviewer.

Timeline:
- 2026-09-30 Branch from #473's head fcbd2f84; hardening ported from
  `wip/473-hardening-rounds` and reconciled with ea5e442d; probe at fcbd2f84
  (38 fail); gates run; plan closed as blocked on the pre-existing gate.
- 2026-09-30 Round H1 (309f876b, 6346b55d, fc43523e, 3cb36826).
- 2026-09-30 Round H2: one admission in the registry (7d3a9d6d).
- 2026-09-30 Round H3: admission at send and before publication, fixed
  baselines, guarded-only opaque routing, registry key v2 (eaefa418).
- 2026-09-30 Round H4: live guardedness, loader claims on guarded pages,
  admission between publication writes, loader trip after setAuth
  (7b9924d6).
- 2026-09-30 CI on #475: every lane passed except `fixtures:check`, whose
  scaffold snapshots drifted from the current upstream templates
  (create-next-app 16.3.6, TanStack Start, Vite) after 0.33.6's CI ran. A
  separate commit resyncs them with `bun run fixtures:sync` (28 files under
  `fixtures/`, no kitcn source or scaffold change); `fixtures:check` exit 0
  locally afterwards.
- 2026-09-30 Round H5 (after #475 opened; found by porting this branch into
  a consumer app whose provider remounts per route group): a trip that
  happened while no guarded provider was mounted (a token refresh finishing
  after its provider unmounted; the Start loader before any provider) never
  reached `onTokenIdentityChange`, because a provider mounting on a tripped
  page took `inheritedTrip` as already reported. Fixed, behavioural: every
  guarded provider that mounts or shows again on a tripped page runs the
  trip's close and callback once (`tripSettledRef` starts `false`). Test
  `a later provider over a tripped client starts tripped and still reports
  the trip once` (renamed from `a later provider over a tripped client
  starts tripped`; red first: 0 callbacks, expected 1), including that a
  rerender does not report it again. Provider suite 115 pass, 0 fail. Docs,
  JSDoc and both skill references updated.

Reboot status:
| Question | Answer |
|----------|--------|
| Where am I? | Repaired source verified; delivery receipts and protected approval |
| Where am I going? | Push exact #475, read back final head/body, await protected approval |
| What is the goal? | Fix the guard and gate defects still at #473's head |
| What have I learned? | See Findings |
| What have I done? | See Timeline |

Open risks:
- Autoreview and TruffleHog pass; no unresolved accepted review finding.
- Exact-head final receipts and required CI are mandatory after the final
  versioned push. Approval must satisfy code-owner and last-push rules.
- One `optimisticAuth` setting per Convex client is a documented rule.
- Accepted: two kitcn versions or revisions on one page share no page
  identity until reload (L5).

Hard closeout guard:
- A local-only final response for verified code-changing work is invalid unless
  this plan records an explicit user decline, no local patch, analytical/
  blocked/inconclusive outcome, or a real commit/PR blocker.
