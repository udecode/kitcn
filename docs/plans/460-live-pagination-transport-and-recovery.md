# 460 live pagination transport and recovery

Objective:
Fix cRPC live pagination transport and stale-cursor recovery for issue #460;
done when all three reported cases have failing-before/passing-after coverage,
package checks pass, and a dedicated PR is delivered.

Goal plan:
docs/plans/460-live-pagination-transport-and-recovery.md

Template:
docs/plans/templates/task.md

Primary template:
docs/plans/templates/task.md

Applied packs:
- package-api (docs/plans/templates/packs/package-api.md)
- docs (materialized after the public-reference sync entered scope)
- agent-native (materialized after the owned skill source regenerated
  `.agents/skills/kitcn/**`)

Task source:
- type: public GitHub bug report
- id / link: https://github.com/udecode/kitcn/issues/460
- title: cRPC pagination drops the fields needed to split live pages
- acceptance criteria: preserve `pageStatus` and `splitCursor`; pass page
  boundaries through `endCursor`; recover stale page cursors without silently
  losing previously loaded range coverage.
- owned PR: https://github.com/udecode/kitcn/pull/462

Timed checkpoint:
- requested duration: N/A: none requested
- semantics: N/A: no timed checkpoint
- initial confidence score: N/A: binary three-case matrix
- improvement loop: N/A: one-shot issue execution
- final score / loop closure: all three cases pass; delivery closeout pending

Completion threshold:
- All three issue cases fail before the fix and pass after it in public-boundary
  tests for cRPC, React, and Solid where applicable.
- Task closure is legal only when the source-of-truth acceptance criteria are
  satisfied or explicitly narrowed, required verification evidence is recorded,
  code-review and release-artifact gates are closed when applicable, verified
  code changes are committed and PR'd unless explicitly declined or blocked,
  task-style PR body sync is complete or marked N/A with reason,
  GitHub issue/PR sync is complete or marked N/A with reason, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/460-live-pagination-transport-and-recovery.md` passes.

Verification surface:
- Focused builder, React, and Solid infinite-query tests; package build and
  typecheck; lint; `bun check`; docs/skill and changeset audits; autoreview;
  exact PR head/body/check readback.

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
- Source of truth: issue #460 plus its reconnect comment; current cRPC builder,
  React/Solid hooks, Convex pagination contract, tests, and current docs.
- Allowed edit scope: `packages/kitcn` cRPC and infinite-query owners, their
  tests, synchronized pagination docs/skill sources, release draft, and plan.
- Browser surface: N/A: transport and state-machine behavior is directly
  testable without rendered output.
- GitHub issue sync: ship a dedicated PR closing #460 and comment for QA.
- Non-goals: ORM pagination redesign, compatibility aliases, visual UI work,
  or changes to unrelated pagination modes.

Output budget strategy:
- Use exact-file reads, scoped `rg`, focused test logs under `/tmp`, and capped
  tool output; exclude generated/build trees except named proof outputs.

Blocked condition:
- Stop only if the public behavior cannot be reproduced, the required package
  contract contradicts Convex source, or GitHub/package verification is
  unavailable after one environment-repair attempt.

Task state:
- task_type: bug
- task_complexity: non-trivial package/runtime/API work
- current_phase: commit / PR / GitHub sync
- current_phase_status: in_progress
- next_phase: closeout
- goal_status: active pending GitHub readback

Current verdict:
- verdict: valid and fixed locally
- confidence: all three claims reproduced red and pass green in the owning tests
- next owner: cRPC builder and React/Solid infinite-query hooks
- reason: `.paginated()` strips split metadata and rejects `endCursor`; hooks
  retain boundaries outside query args and over-request beyond the server cap.

Implementation readiness:
- verdict: ready; implementation and focused verification complete
- exact owner: cRPC `.paginated()` transport contract plus React/Solid page state
- contradiction status: docs promise reactive split/recovery but public schema
  and query args cannot carry the required fields
- source-listed cases complete: yes, three cases recorded below

Pre-solution issue challenge:
- reporter claim: cRPC infinite queries cannot execute the split path because
  `.paginated()` strips split hints and cannot carry `endCursor`; reconnect
  recovery can silently restore fewer rows than were loaded.
- suggested diagnosis or fix: extend the cRPC transport and either recover the
  full prior range or reset cleanly to page one.
- repro ladder:
  - tests / source-level repro: selected; public builder and hook harnesses
  - repo-owned automated browser or integration proof: N/A: no visual/runtime-only state
  - Browser plugin: N/A: no browser-rendered contract
  - screenshot / visual proof: N/A: no visual output
- reproduction verdict: confirmed by failing builder, React, Solid, and type tests
- validity verdict: valid
- best long-term fix boundary: builder owns the wire contract; each framework
  hook owns bounded page splitting and a clean stale-cursor reset.
- harsh honest feedback: the existing split code is dead through cRPC, and the
  oversized recovery request cannot beat the server's own cap.
- hard-stop decision: red proof reproduced every case, so implementation proceeded.

Completion rule:
- Do not call `update_goal(status: complete)` while any required checklist item
  remains unchecked. If an item does not apply, check it and add `N/A: <reason>`.
- Do not call `update_goal(status: complete)` until every completion threshold
  above is satisfied, final handoff evidence is recorded, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/460-live-pagination-transport-and-recovery.md` passes.
- Do not create hook state for this goal. This file plus the active goal are the
  durable state.

Start Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| Timed checkpoint parsed | no | N/A: none requested |
| Walkthrough baseline for possible UI change | no | N/A: no UI or rendered output can change |
| Skill analysis before edits | yes | `task`, `autogoal`, `vision`, `react-query`, `testing`, `tdd`, and `changeset`; `agent-native-reviewer` and `autoreview` applied at closeout |
| Active goal checked or created | yes | unrelated PR #459 goal is blocked; user explicitly started #460, so this plan records degraded control state |
| Source of truth read before edits | yes | issue #460 and its one comment read in full |
| Exact per-PR task ownership | yes | this plan owns https://github.com/udecode/kitcn/pull/462 for issue #460 |
| GitHub comments and attachments read | yes | one comment read; no attachments |
| Video transcript evidence required | no | N/A: no video or recording |
| Pre-solution issue challenge required | yes | three falsifiable cases and durable owners recorded |
| Reproduction verdict before implementation | yes | builder stripped metadata, `endCursor` was rejected, split args were unbounded, and reconnect recovery over-requested |
| Repro escalation ladder selected | yes | public builder and React/Solid hook tests; browser layers N/A |
| Suggested fix reviewed against durable boundary | yes | builder transports Convex fields; hooks own split/reset state |
| `docs/solutions` checked for non-trivial existing-code work | yes | no matching live-pagination solution; existing auth pagination and parse-time pagination notes are adjacent only |
| TDD decision before behavior change or bug fix | yes | vertical red/green tests for transport, boundaries, then stale reset |
| Branch decision for code-changing task | yes | dedicated `codex/460-live-pagination` from current `origin/main` |
| Release artifact decision | yes | update existing `.changeset/wide-index-union-stays-indexed.md` patch section |
| Browser tool decision for browser surface | no | N/A: package transport/state machine has direct automated proof |
| Commit / PR expectation decision | yes | commit whole checkout, push branch, create dedicated PR |
| Task-style PR body decision | yes | use required emoji task format and preserve auto-release block |
| Task-plan PR body evidence | yes | PR #462 body names this plan; this update puts the exact PR in the plan at head |
| GitHub issue sync expectation decision | yes | PR closes #460; issue QA comment after verified delivery |
| Output budget strategy recorded | yes | exact reads/scoped searches; logs saved under `/tmp` |
| Package/API pack selected | yes | package-api pack materialized in this plan |
| Public surface or package boundary identified | yes | cRPC `.paginated()` input/output and framework infinite-query page args |
| Convex entry/import graph impact identified | no | N/A: schema/state changes add no imports or deployed bundle owner |
| CLI/scaffold/generated impact identified | no | N/A: no templates, CLI, scaffold, or generated output |
| Release artifact path selected | yes | existing `.changeset/wide-index-union-stays-indexed.md` |
| `changeset` skill loaded when `.changeset` is required | yes | read before package mutation |
| Package build / fixture impact decision recorded | yes | package build/typecheck/tests required; fixture sync/check N/A |

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
| Goal plan complete | yes | Run `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-09-12-460-live-pagination-transport-and-recovery.md` | pending |
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
| Intake and source read | complete | issue/comment, doctrine, Convex contract, and owners read | implementation |
| Implementation | complete | builder transport plus React/Solid split and reset owners changed | verification |
| Verification | complete | focused tests, typecheck, build, artifact audit, lint, skill sync, clean autoreview, and `bun check` | commit / PR |
| Commit / PR / GitHub sync | pending | | final response |
| Closeout | pending | | final response |

Findings:
- `.paginated()` accepted only `cursor`/`limit` and its output validator removed
  Convex split metadata before hooks could see it.
- React and Solid stored split boundaries outside the query args, leaving both
  replacement subscriptions unbounded.
- reconnect recovery requested more items, but the server cap could silently
  truncate that request; a clean first-page reset is the only honest recovery.

Decisions and tradeoffs:
- Preserve native Convex split metadata and `endCursor` at the cRPC wire owner.
- Keep pagination transport hook-owned by omitting `endCursor` from consumer
  infinite-query input types.
- Reset the entire cursor chain only for a proven Convex `InvalidCursor`; keep
  unrelated page errors visible.
- Browser and walkthrough proof are N/A because the changed contract is a
  package transport/state machine with direct automated coverage.

Implementation notes:
- Builder input/output schemas preserve `endCursor`, `pageStatus`, and
  `splitCursor`.
- React and Solid replace one live page with two adjacent bounded queries:
  `[cursor, splitCursor]` and `[splitCursor, priorEndCursor]`.
- Public docs and package skill examples forward `input.endCursor`; the owned
  source was regenerated into `.agents/skills/kitcn/**`.

Review fixes:
- Agent-native map is complete: public guidance is owned by
  `packages/kitcn/skills/kitcn/**`, generated via
  `bun tooling/sync-kitcn-skill.ts`, and byte-identical to its `.agents` mirror.
- `.agents/skills/autoreview/scripts/autoreview --mode local
  --stream-engine-output` reported no accepted/actionable findings (0.98).

Agent-native review:
- Verdict: pass; no accepted/actionable parity findings.
- Capability map:

| User action | Agent route | Source owner | Generated/config/doc | Proof | Verdict |
| --- | --- | --- | --- | --- | --- |
| Implement cRPC live pagination | `kitcn` skill plus package API | `packages/kitcn/src/**` and `packages/kitcn/skills/kitcn/**` | `.agents/skills/kitcn/**` and `www/**` | tests, build, sync command, byte comparison | pass |
| Configure a paginated procedure | `kitcn` examples | package skill and public docs | generated skill mirror | compile/type tests and exact mirror comparison | pass |

- Accepted / rejected: none.
- Verification: `bun tooling/sync-kitcn-skill.ts`; three `cmp -s` checks for
  the generated skill and affected references; package build/typecheck/tests.
- Needs attention: none.

Error attempts:
| Error / failed attempt | Count | Next different move | Resolution |
|------------------------|-------|---------------------|------------|
| Guessed removed `packages/kitcn/src/crpc/procedure-builder.ts` owner | 1 | Search the actual cRPC symbols | Found `.paginated()` in `server/builder.ts` |
| Vitest typecheck-only did not surface the new `.test-d.ts` diagnostic | 1 | Run the file with its owning TypeScript compiler contract | Direct `bunx tsc --noEmit ... pagination.test-d.ts` reproduced red and passed green |
| First `bun check` found current-registry version drift in generated fixture manifests | 1 | Regenerate through the owning fixture command, then rerun the exact gate | `bun run fixtures:sync` refreshed the generated package snapshots |
| Full-gate rerun wedged for five minutes in external `shadcn init` GitHub clone at 0% CPU | 1 | Stop the environment-stalled process and use a scoped Git HTTP/1.1 transport override | Public `ls-remote`, fixture sync/check, and final `bun check` pass with HTTP/1.1 |
| Registry releases changed generated Next/Start/Vite package versions between fixture runs | 3 | Regenerate only the named owning fixtures, verify each, then run the whole gate | Eight fixture comparisons and final `bun check` pass against the settled registry |

Verification evidence:
- RED: builder output removed `pageStatus`/`splitCursor`; handler input saw no
  `endCursor`; React/Solid split query keys lacked adjacent boundaries; stale
  recovery retained an error/oversized replacement path; type contract exposed
  `endCursor`.
- GREEN: 73 Bun focused tests, 13 Solid focused tests, direct pagination type
  contract, `packages/kitcn` typecheck, and `packages/kitcn` build all pass.
- Artifact audit confirms emitted declarations expose the three transport
  fields and hide hook-owned `endCursor` from consumer input.
- `bun lint:fix`, generated skill byte-comparison, and `git diff --check` pass.
- Fixture sync refreshed six generated package snapshots after the first full
  gate exposed registry drift; scoped resyncs followed live Next/Start/Vite
  releases without hand-editing generated output.
- Final `GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=http.version
  GIT_CONFIG_VALUE_0=HTTP/1.1 bun check` exits 0: 1,429 Bun tests, 1,050
  Vitest tests, 124 CLI tests, all eight fixture comparisons, two auth runtime
  smokes, lint, typecheck, and Concave smoke pass.
- Final autoreview on the complete 98,810-byte bundle reports no
  accepted/actionable findings and 0.98 overall confidence.

Source-listed case matrix:
| Case | Source claim | Harness | Before | Expected after | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| split metadata | `.paginated()` strips `pageStatus`/`splitCursor` | public builder handler output test | fields rejected/removed | fields preserved | 73-test Bun focused lane | pass |
| page boundary | hook cannot send `endCursor` through cRPC | builder input test plus React/Solid split query args | absent/rejected | both split halves carry exact boundaries | Bun + 13-test Solid lanes | pass |
| reconnect | oversized recovery is clamped and loses loaded range | React/Solid stale-error state harness | one capped replacement treated complete | clean reset to first page | Bun + Solid stale-cursor tests | pass |

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
- 2026-09-12T10:44:41.304Z Task goal plan created.

Reboot status:
| Question | Answer |
|----------|--------|
| Where am I? | Three-case implementation and focused proof complete; full gate running |
| Where am I going? | Commit/PR/GitHub sync and closeout |
| What is the goal? | Fix #460 and ship one verified PR |
| What have I learned? | Builder strips hints/rejects endCursor; both hooks keep boundaries outside args; recovery over-requests past server cap |
| What have I done? | Reproduced and fixed all cases, synchronized docs/skill, built the package, and closed review gates |

Open risks:
- Split replacement reuses the existing eager query-state swap; the fix makes
  its boundaries exact but does not redesign loading presentation.
- The app goal remains blocked on unrelated PR #459; the user explicitly
  started #460 next, so this plan is the authoritative degraded-control ledger.

Hard closeout guard:
- A local-only final response for verified code-changing work is invalid unless
  this plan records an explicit user decline, no local patch, analytical/
  blocked/inconclusive outcome, or a real commit/PR blocker.
