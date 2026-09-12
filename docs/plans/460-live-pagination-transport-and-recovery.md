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
- final score / loop closure: 98%; all three cases and delivery gates pass

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
- current_phase: closeout
- current_phase_status: complete
- next_phase: final response
- goal_status: complete

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
| Release artifact decision | yes | add `.changeset/calm-cursors-split.md` after the release consumed the prior draft |
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
| Release artifact path selected | yes | `.changeset/calm-cursors-split.md` |
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
| Named verification threshold | yes | Run named proof | three-case matrix, focused lanes, package proof, full gate, CI pass |
| Exact per-PR task ownership | yes | Record exact PR | #462 and this dedicated plan |
| Pre-solution issue challenge verdict | yes | Record challenge | valid; source and red tests confirmed all three claims |
| Repro escalation ladder | yes | Apply selected ladder | source/tests pass; browser and screenshots N/A |
| Bug reproduced before fix | yes | Preserve red evidence | builder, hook boundary, reconnect, and type reds recorded |
| Targeted behavior verification | yes | Run focused proof | 73 Bun + 13 Solid tests pass |
| TypeScript or typed config changed | yes | Typecheck | package and direct type-contract checks pass |
| Package exports or file layout changed | yes | Build | 72-file package build passes |
| Package manifests, lockfile, or install graph changed | yes | Install/check | `bun install` and final package proof pass |
| Agent rules or skills changed | yes | Sync and compare | owned skill sync plus three exact mirror comparisons pass |
| Workspace authority proof | yes | Use owning workspace | all proof ran from repository root/package owner |
| Browser surface changed | no | N/A | transport/state machine has direct tests |
| Browser final proof | no | N/A | no rendered behavior |
| UI walkthrough | no | N/A | no UI/output change |
| Scaffold or fixture output changed | yes | Sync/check | all eight generated fixtures pass |
| Package behavior or public API changed | yes | Changeset | `.changeset/calm-cursors-split.md` |
| Docs and kitcn skill sync changed | yes | Synchronize | current-state docs and skill mirrors match |
| Docs or content changed | yes | Source audit | examples forward `endCursor`; links unchanged |
| High-risk mini gate | yes | Record risk and proof | split loss/truncation covered at builder and both hooks |
| Agent-native review for agent/tooling changes | yes | Run parity review | capability map passes; no findings |
| Local install corruption suspected | no | N/A | no install corruption; only external Git transport/registry churn |
| Commit created | yes | Commit checkout | `0ac9e65e` plus task-evidence commit `bc883234` |
| PR create or update | yes | Push verified branch | #462 updated against current `main` |
| Task-style PR body verified | yes | Read body | required emoji format and auto-release block verified |
| PR task evidence verified | yes | Read plan/body/head | body names plan; plan names #462; source head `bc883234`; this closeout commit keeps the plan at PR head |
| PR proof image hosting | no | N/A | no browser images |
| GitHub issue sync-back | yes | Comment for QA | issue comment 5645764699 verified |
| Final handoff contract | yes | Fill exact evidence | section below complete |
| Final lint | yes | Run lint | `bun lint:fix` and full `bun check` pass |
| Output budget discipline | yes | Keep logs bounded | high-volume proof artifacted under `/tmp`; accidental broad diff was truncated once |
| Timed checkpoint | no | N/A | none requested |
| Autoreview for non-trivial implementation changes | yes | Clean final review | branch review against `origin/main` clean at 0.98 |
| Goal plan complete | yes | Run mechanical checker | command updated to this exact plan path |
| Public API / package boundary proof | yes | Audit transport/types | emitted declarations preserve fields and hide hook-owned input |
| Convex bundle/import proof | no | N/A | no new deployed static import graph |
| CLI/scaffold/generated proof | yes | Regenerate owned output | skill/fixture generators and exact checks pass |
| Release artifact classification | yes | Classify delta | published kitcn runtime/API fix |
| Published package changeset | yes | Add patch entry | fresh patch changeset after release consumed prior draft |
| No release artifact | no | N/A | published delta has changeset |
| Package typecheck/build/test | yes | Run package proof | all pass on rebased head |
| Fixture/scaffold generation | yes | Sync/check | generated manifests refreshed and all comparisons pass |
| Docs/package skill sync | yes | Synchronize | source/generated/public guidance aligned |

Phase / pass table:
| Phase | Status | Evidence | Next |
|-------|--------|----------|------|
| Intake and source read | complete | issue/comment, doctrine, Convex contract, and owners read | implementation |
| Implementation | complete | builder transport plus React/Solid split and reset owners changed | verification |
| Verification | complete | focused tests, typecheck, build, artifact audit, lint, skill sync, clean autoreview, and `bun check` | commit / PR |
| Commit / PR / GitHub sync | complete | rebased PR #462, verified issue comment, and all GitHub checks passed | closeout |
| Closeout | complete | every checklist and evidence gate is closed | final response |

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
- Commit line: `0ac9e65e` implementation; `bc883234` task evidence
- PR line: https://github.com/udecode/kitcn/pull/462
- Issue line: https://github.com/udecode/kitcn/issues/460 with verified QA comment
- Confidence line: 98%; local/full/CI proof and clean autoreview
- Flow table:
  - Reproduced: red builder, React/Solid boundary/reset, and type-contract tests; browser N/A
  - Verified: green focused/package/full/CI proof; browser N/A
- Browser check: N/A: no rendered surface
- Outcome: live split metadata and adjacent bounds preserved; stale invalid cursors reset cleanly
- Caveat: generated fixture manifests track the registry versions required by the final gate
- Design:
  - Chosen boundary: cRPC builder wire schema plus shared React/Solid page-state invariant
  - Why not quick patch: caller-side hints cannot survive a schema that strips them
  - Why not broader change: ORM/search pagination and UI presentation are different owners
- Verified: focused tests, type contract, package typecheck/build, artifact/skill sync, `bun check`, CI, Vercel, autoreview
- PR body verified: exact task format, plan line, changeset checkbox, and no self-link

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
- Commit: `0ac9e65e`, `bc883234`
- PR: https://github.com/udecode/kitcn/pull/462; mergeable; all checks pass
- Issue: QA comment https://github.com/udecode/kitcn/issues/460#issuecomment-5645764699
- Browser proof: N/A: package-only transport/state behavior
- Caveats: fixture manifests contain current generated dependency versions

Timeline:
- 2026-09-12T10:44:41.304Z Task goal plan created.
- 2026-09-12T12:07:13Z PR #462 rebased onto current `main` and checks started.
- 2026-09-12T12:13Z CI, Vercel, review, issue sync, and package proof complete.

Reboot status:
| Question | Answer |
|----------|--------|
| Where am I? | PR #462 delivered, mergeable, and green |
| Where am I going? | Final response |
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
