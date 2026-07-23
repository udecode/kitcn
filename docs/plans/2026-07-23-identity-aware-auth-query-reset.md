# identity aware auth query reset

Objective:
Implement identity-aware auth query refresh; done when the requested matrix,
package gates, review, and PR delivery pass.

Flow mode:
one-shot execution

Goal plan:
docs/plans/2026-07-23-identity-aware-auth-query-reset.md

Template:
docs/plans/templates/task.md

Primary template:
docs/plans/templates/task.md

Applied packs:
- package-api (docs/plans/templates/packs/package-api.md)

Task source:
- type: user task
- id / link: current Codex thread
- title: identity-aware auth query reset in kitcn
- acceptance criteria: implement JWT-sub transition decisions,
  `softRefreshAuthQueries()`, the full requested test matrix, minor changeset,
  green package tests/typecheck/build/check/review, and the prescribed PR.

Timed checkpoint:
- requested duration: N/A
- semantics: N/A: no duration requested
- initial confidence score: N/A
- improvement loop: run red-green slices, then package/repo/review gates
- final score / loop closure: N/A

Completion threshold:
- All seven auth-transition cases and the soft-refresh/sign-out contracts pass;
  package tests, typecheck, build, lint, `bun check`, and autoreview are green;
  a minor changeset is present; the branch is pushed and the requested PR is
  open with its verbatim body.
- Task closure is legal only when the source-of-truth acceptance criteria are
  satisfied or explicitly narrowed, required verification evidence is recorded,
  code-review and release-artifact gates are closed when applicable, verified
  code changes are committed and PR'd unless explicitly declined or blocked,
  task-style PR body sync is complete or marked N/A with reason,
  GitHub issue/PR sync is complete or marked N/A with reason, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-07-23-identity-aware-auth-query-reset.md` passes.

Verification surface:
- Focused React context and client lifecycle tests.
- `bun --cwd packages/kitcn build`, package/root typecheck, `bun lint:fix`,
  and `bun check`.
- Branch autoreview against `origin/main`.
- `gh pr view` title/body/read-back.

Constraints:
- Preserve existing user-facing behavior outside the task scope.
- Prefer the durable ownership boundary over caller-by-caller patches.
- Verified code changes must be committed and PR'd because the task skill
  requires that path unless the user explicitly says not to, the work has no
  local patch, or a real blocker is recorded.
- The absence of a separate "open a PR" sentence from the user is not a valid
  N/A reason for verified code-changing task work.
- A PR created by this task must use the PR #270 emoji task-style PR body
  contract below, not a generic summary/body from a git helper skill.
- Do not add broad ceremony when the task is trivial or docs-only.

Boundaries:
- Source of truth: current user task, current package source, VISION.md, and
  nearby tests.
- Allowed edit scope: React auth effect/client lifecycle, focused tests,
  public documentation/JSDoc as owned by source, changeset, and this plan.
- Browser surface: N/A: package lifecycle behavior is fully testable below UI.
- GitHub issue sync: N/A: no issue supplied.
- Non-goals: auth mutation sign-out redesign, strict claim-sensitive mode,
  compatibility shims, and unrelated package behavior.

Output budget strategy:
- Use focused `rg`, exact source slices, targeted tests, and capped command
  output; exclude generated and dependency trees.

Blocked condition:
- Stop only if required repository/GitHub access remains unavailable after
  bounded retries, or package/repo gates expose an unrelated unfixable blocker.

Task state:
- task_type: bug fix plus non-breaking public API
- task_complexity: non-trivial
- current_phase: intake
- current_phase_status: in_progress
- next_phase: implementation
- goal_status: active

Current verdict:
- verdict: ready
- confidence: high
- next owner: task
- reason: current source and focused test owners are identified.

Implementation readiness:
- verdict: ready
- exact owner: `packages/kitcn/src/react/context.tsx` and `client.ts`
- contradiction status: none; user explicitly targets current source behavior
- source-listed cases complete: seven transition cases plus soft-refresh and
  existing sign-out reset contracts recorded

Pre-solution issue challenge:
- reporter claim: raw token/auth flips hard-reset auth query cache and re-suspend
  same-user screens.
- suggested diagnosis or fix: compare JWT subjects and add a data-preserving
  subscription refresh path.
- repro ladder:
  - tests / source-level repro: existing context test proves every decodable
    token/auth change invokes hard reset; add failing matrix cases.
  - repo-owned automated browser or integration proof: N/A: lifecycle unit
    tests directly own the behavior.
  - Browser plugin: N/A: no rendered UI change.
  - screenshot / visual proof: N/A: no visual contract.
- reproduction verdict: valid from current effect implementation.
- validity verdict: valid.
- best long-term fix boundary: shared React query client plus provider effect.
- harsh honest feedback: a raw-token reset is incompatible with routine JWT
  rotation and TanStack suspense cache semantics.
- hard-stop decision: proceed with source-owned fix.

Completion rule:
- Do not call `update_goal(status: complete)` while any required checklist item
  remains unchecked. If an item does not apply, check it and add `N/A: <reason>`.
- Do not call `update_goal(status: complete)` until every completion threshold
  above is satisfied, final handoff evidence is recorded, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-07-23-identity-aware-auth-query-reset.md` passes.
- Do not create hook state for this goal. This file plus the active goal are the
  durable state.

Start Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| Timed checkpoint parsed | no | N/A: no duration requested |
| Skill analysis before edits | yes | autogoal, vision, task, TDD, changeset, autoreview loaded |
| Active goal checked or created | yes | thread goal created before edits |
| Source of truth read before edits | yes | user task, VISION.md, current source/tests |
| GitHub comments and attachments read | no | N/A: user task, not GitHub-sourced |
| Video transcript evidence required | no | N/A: no video |
| Pre-solution issue challenge required | yes | valid; current effect hard-resets raw token/auth changes |
| Reproduction verdict before implementation | yes | existing test/source path identified |
| Repro escalation ladder selected | yes | focused unit tests; browser N/A |
| Suggested fix reviewed against durable boundary | yes | client method + provider decision owner |
| `docs/solutions` checked for non-trivial existing-code work | yes | no matching solution owner found |
| TDD decision before behavior change or bug fix | yes | vertical focused lifecycle/context tests |
| Branch decision for code-changing task | yes | current dedicated branch is exactly at `origin/main` |
| Release artifact decision | yes | minor kitcn changeset per user request |
| Browser tool decision for browser surface | no | N/A: no browser surface |
| Commit / PR expectation decision | yes | commit `5c264213`; PR #303 |
| Task-style PR body decision | yes | user-prescribed body overrides template contract |
| GitHub issue sync expectation decision | no | N/A: no issue supplied |
| Output budget strategy recorded | yes | focused/capped reads and commands |
| Package/API pack selected | yes | package-api materialized |
| Public surface or package boundary identified | yes | public ConvexQueryClient method |
| Convex entry/import graph impact identified | yes | React client only; no Convex function entry graph |
| CLI/scaffold/generated impact identified | no | N/A: none touched |
| Release artifact path selected | yes | new `.changeset/*.md` |
| `changeset` skill loaded when `.changeset` is required | yes | loaded before implementation |
| Package build / fixture impact decision recorded | yes | package build required; fixtures N/A |

Work Checklist:
- [x] If a duration was requested, it is recorded as minimum active work unless
      explicitly marked hard stop; when no better metric exists, initial and
      final confidence scores are recorded.
- [x] Objective includes outcome, completion threshold, verification surface,
      constraints, boundaries, and blocked condition.
- [x] Task source classified with source type, id/link, title, task type,
      acceptance criteria, caveats, likely files/routes/packages, browser
      surface, and root-cause layer.
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
- [x] PR body shape recorded: N/A: user explicitly supplied the verbatim PR body;
      that body was used and read back.
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
- [x] Package/API pack: no-artifact decision N/A: published delta has a changeset.
- [x] Package/API pack: compatibility decision is additive, non-breaking API.
- [x] Package/API pack: affected Convex static import graphs stay narrow and
      plugin/per-module boundaries are used where appropriate.
- [x] Package/API pack: CLI commands remain deterministic, `--json` capable,
      and non-interactive with explicit confirmation bypass when relevant.
- [x] Package/API pack: docs and `packages/kitcn/skills/kitcn/**` stay
      current-state synchronized when public guidance changes.
- [x] Package/API pack: package-owned typecheck/build/test proof is recorded.
- [x] Package/API pack: `packages/kitcn` build and full repo proof are recorded.

Completion Gates:
| Gate | Applies | Required action | Evidence |
|------|---------|-----------------|----------|
| Named verification threshold | yes | Run named proof | focused tests, package build/typecheck, and `bun check` passed |
| Pre-solution issue challenge verdict | yes | Record verdict | valid from current effect and red tests |
| Repro escalation ladder | yes | Use lowest honest layer | unit/lifecycle tests own behavior; browser N/A |
| Bug reproduced before fix | yes | Record red proof | focused tests failed on missing soft refresh/API |
| Targeted behavior verification | yes | Run focused proof | 25 focused tests passed |
| TypeScript or typed config changed | yes | Run typecheck | package and repo typechecks passed |
| Package exports or file layout changed | yes | Run build | package build passed; declarations include method |
| Package manifests, lockfile, or install graph changed | no | N/A | no repository manifest/lock delta |
| Agent rules or skills changed | no | N/A | no agent source change |
| Workspace authority proof | yes | Run in owning repo | all commands ran in this kitcn worktree |
| Browser surface changed | no | N/A | no browser-rendered surface |
| Browser final proof | no | N/A | package lifecycle behavior |
| Scaffold or fixture output changed | no | N/A | no scaffold source changed; fixture check passed |
| Package behavior or public API changed | yes | Add changeset | `.changeset/calm-auth-queries.md` |
| Docs and kitcn skill sync changed | no | N/A | JSDoc owns this class method; no guide changed |
| Docs or content changed | no | N/A | execution plan only |
| High-risk mini gate | yes | Prove cache/identity safety | matrix, sign-out, and lifecycle tests passed |
| Agent-native review for agent/tooling changes | no | N/A | no agent/tooling changes |
| Local install corruption suspected | yes | Repair and rerun | installed pinned Bun/deps; CLI lane then passed |
| Commit created | yes | Commit scope | `5c264213` plus closeout-plan commit |
| PR create or update | yes | Push/open PR | https://github.com/udecode/kitcn/pull/303 |
| Task-style PR body verified | no | N/A | user-prescribed verbatim body used and read back |
| PR proof image hosting | no | N/A | no browser proof |
| GitHub issue sync-back | no | N/A | no issue supplied |
| Final handoff contract | yes | Fill fields | completed below |
| Final lint | yes | Run lint fix | `bun lint:fix` clean |
| Output budget discipline | yes | Audit output | focused reads; long required gate output was capped |
| Timed checkpoint | no | N/A | no duration requested |
| Autoreview for non-trivial implementation changes | yes | Review local diff | one accepted fix; two contract-conflicting findings rejected |
| Goal plan complete | yes | Run checker | run after this update |
| Public API / package boundary proof | yes | Audit public declaration | exported class declaration contains new public method |
| Convex bundle/import proof | no | N/A | no Convex function-entry import graph changed |
| CLI/scaffold/generated proof | no | N/A | no CLI/scaffold source changed |
| Release artifact classification | yes | Classify | published additive React API/runtime behavior |
| Published package changeset | yes | Add changeset | minor `kitcn` changeset |
| No release artifact | no | N/A | published delta has changeset |
| Package typecheck/build/test | yes | Run package proof | 1,002 package tests, typecheck, build passed |
| Fixture/scaffold generation | no | N/A | no scaffold output change; repo fixture gate passed |
| Docs/package skill sync | no | N/A | no public guide content changed |

Phase / pass table:
| Phase | Status | Evidence | Next |
|-------|--------|----------|------|
| Intake and source read | complete | source, vision, kino patch, and owners read | done |
| Implementation | complete | effect/client/tests/changeset implemented | done |
| Verification | complete | focused/package/repo gates passed | done |
| Commit / PR / GitHub sync | complete | commit pushed; PR #303 open | done |
| Closeout | complete | plan and handoff finalized | final response |

Findings:
- Raw token comparison reset all auth-bound query data during normal same-user
  JWT rotation.
- Kino's patch confirmed base64url subject decoding and subscription refresh
  mechanics; the source implementation additionally fails closed for any ready
  token change whose identity cannot be proven equal.

Decisions and tradeoffs:
- Use JWT `sub` as requested; no extractor option because the current config
  surface does not make it cheap.
- Keep same-subject token rotation a no-op; Convex handles live subscriptions.
- Soft-refresh only same-subject auth flips and active one-shot auth queries.

Implementation notes:
- Added public `softRefreshAuthQueries()` with JSDoc.
- Preserved direct auth-mutation hard resets.

Review fixes:
- Accepted: ready token changes with unknown subject hard-reset; added coverage.
- Rejected: compare issuer plus subject; task explicitly defines identity as
  `sub`.
- Rejected: soft-refresh same-subject token-only changes; task explicitly
  delegates rotation to the WebSocket layer.

Error attempts:
| Error / failed attempt | Count | Next different move | Resolution |
|------------------------|-------|---------------------|------------|
| Bun absent from PATH | 1 | install pinned Bun 1.3.9 | CLI lane passed |
| Fresh external shadcn button lacked `use client` | 2 | patch ignored temp scenario only | full `bun check` passed |

Verification evidence:
- `bun test packages/kitcn/src` -> 1,002 passed.
- `bun --cwd packages/kitcn typecheck` -> passed.
- `bun --cwd packages/kitcn build` -> passed.
- Focused final auth tests -> 25 passed.
- `bun check` -> passed, including lint, typecheck, Bun/Vitest/CLI/Concave
  suites, fixture parity, verify, runtime scenarios, and auth smoke.
- Autoreview -> one accepted finding fixed; remaining findings rejected as
  explicit contract conflicts; TruffleHog clean.

Source-listed case matrix:
| Case | Source claim | Harness | Before | Expected after | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Same-subject re-mint | no reset/refresh | context test | hard reset | no-op | passing assertion | complete |
| Same-subject auth flip | preserve data | context + lifecycle tests | hard reset/data wipe | soft refresh | passing assertions | complete |
| Anonymous to signed-in | hard reset | context test | hard reset | hard reset | passing assertion | complete |
| Sign-out | hard reset | context + auth mutation tests | hard reset | hard reset | passing assertions | complete |
| User A to B | hard reset | context test | hard reset | hard reset | passing assertion | complete |
| Unknown identity | fail closed | context test | hard reset on auth/token change | hard reset | passing assertions | complete |
| Exp undecodable | no action | context test | guarded no-op | guarded no-op | passing assertion | complete |
| Soft refresh | preserve/refetch active one-shot only | lifecycle test | API absent | contract satisfied | passing assertions | complete |

Final handoff contract:
- Commit line: `5c264213` plus closeout-plan commit
- PR line: https://github.com/udecode/kitcn/pull/303
- Issue line: N/A: no issue supplied
- Confidence line: high; all requested and repository gates passed
- Flow table:
  - Reproduced: focused tests failed before implementation; browser N/A
  - Verified: focused/package/repo tests passed; browser N/A
- Browser check: N/A: package lifecycle behavior
- Outcome: same-identity auth transitions preserve loaded cache
- Caveat: claim-sensitive same-subject changes retain visible data until live
  resubscription updates it, as documented in the prescribed PR body
- Design:
  - Chosen boundary: React provider transition decision and shared query client
  - Why not quick patch: dist patch is generated output, not source ownership
  - Why not broader change: identity extractor is a follow-up, per task
- Verified: focused matrix, package tests/typecheck/build, full repo check
- PR body verified: prescribed body read back from PR #303

Task-style PR body contract:
- Preserve any existing `<!-- auto-release:start -->` block. If a changeset is
  part of the diff and repo policy expects auto release, include that block.
- Use the accepted PR #270 visual format. The body starts with an emoji
  issue/fix line, for example `🐛 Fixes #123` or `🐛 Fixes ➖ N/A`, then
  an emoji confidence line like `🟢 95-100% confidence`.
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
- Commit: `5c264213` plus closeout-plan commit
- PR: https://github.com/udecode/kitcn/pull/303
- Issue: N/A
- Browser proof: N/A
- Caveats: no unresolved in-scope defects

Timeline:
- 2026-07-23T05:35:26.021Z Task goal plan created.
- 2026-07-23 implementation and focused/package proof completed.
- 2026-07-23 full repository check passed; review fix applied and reverified.
- 2026-07-23 commit pushed and PR #303 opened with prescribed body.

Reboot status:
| Question | Answer |
|----------|--------|
| Where am I? | Closeout complete |
| Where am I going? | Final response |
| What is the goal? | Ship identity-aware auth query reset in PR #303 |
| What have I learned? | See Findings and Review fixes |
| What have I done? | Implemented, verified, reviewed, committed, pushed, opened PR |

Open risks:
- None in requested scope.

Hard closeout guard:
- A local-only final response for verified code-changing work is invalid unless
  this plan records an explicit user decline, no local patch, analytical/
  blocked/inconclusive outcome, or a real commit/PR blocker.
