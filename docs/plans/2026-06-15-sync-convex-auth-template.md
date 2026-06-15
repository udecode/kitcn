# sync convex auth template

Objective:
Add a `sync-convex-auth`-specific goal template and wire the sync skill to use
it; done when generated skill sync, smoke checks, lint, full check, review, and
PR are complete.

Goal plan:
docs/plans/2026-06-15-sync-convex-auth-template.md

Primary template:
docs/plans/templates/task.md

Applied packs:
- agent-native (docs/plans/templates/packs/agent-native.md)

Task source:
- type: chat workflow repair request
- id / link: N/A, chat-only request
- title: Create a specific template for `sync-convex-auth`
- acceptance criteria: future `sync-convex-auth` runs use a dedicated
  audit/delegation plan template instead of generic task boilerplate; source
  rule and generated skill mirror agree; template smoke and repo gates pass.

Completion threshold:
- `docs/plans/templates/sync-convex-auth.md` exists and is specific to the
  upstream fork audit, classification ledger, ambiguity decisions, selected
  slice, and delegated `task` prompt.
- `.agents/rules/sync-convex-auth.mdc` tells future runs to use the template,
  and `.agents/skills/sync-convex-auth/SKILL.md` is regenerated to match.
- Smoke instantiation proves the template resolves and unfinished sync rows
  fail `check-complete.mjs`.
- `bun install`, `bun lint:fix`, `bun check`, agent-native review, autoreview,
  PR body audit, and this plan checker are closed.

Verification surface:
- `bun install`
- `rg` source audit across sync source rule, generated skill, and template
- smoke plan generation with `--template sync-convex-auth`
- smoke plan `check-complete.mjs` failure while unfinished
- `bun lint:fix`
- `bun check`
- agent-native review
- `.agents/skills/autoreview/scripts/autoreview --mode local`
- `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-06-15-sync-convex-auth-template.md`
- PR creation and `gh pr view --json body`

Constraints:
- Do not broaden generic `task.md` again for this lane.
- Edit source rule first; generated `.agents/skills/**` mirrors come from
  `bun install`.
- Keep the sync template as audit/delegation state, not implementation state.
- Delegated implementation still uses `task`.
- No package changeset: no published package behavior changed.

Boundaries:
- Source of truth: user request, `sync-convex-auth` skill/rule,
  autogoal template instructions, prior workflow-template repair plans, and
  agent-native pack rules.
- Allowed edit scope: `.agents/rules/sync-convex-auth.mdc`,
  `.agents/skills/sync-convex-auth/SKILL.md`, `docs/plans/templates/**`,
  active plan, and generated install metadata such as `bun.lock`.
- Browser surface: N/A, no UI/browser behavior changed.
- Tracker sync: N/A, chat-only request.
- Non-goals: running an actual upstream auth sync, changing package runtime,
  changing scaffold output, and importing optional upstream auth tests.

Output budget strategy:
- Use targeted `sed` and `rg` reads for skills/templates.
- Use smoke generation instead of dumping full generated plans repeatedly.
- Summarize full `bun check` rather than preserving its full noisy output.

Blocked condition:
- Blocked only if generated skill sync fails, the new template cannot be
  resolved by `create-goal-scratchpad.mjs`, full repo `check` fails for this
  diff, or review finds an accepted issue that cannot be fixed without changing
  the workflow design.

Task state:
- task_type: workflow template repair
- task_complexity: normal, agent-facing
- current_phase: closeout
- current_phase_status: complete
- next_phase: final response
- goal_status: ready to complete

Current verdict:
- verdict: fixed, committed, pushed, and PR'd
- confidence: high
- next owner: task
- reason: new template resolves, generated skill mirror is synced, smoke guard
  fails unfinished plans, lint passes, `bun check` passes, autoreview is clean,
  and PR body is verified.

Pre-solution issue challenge:
- reporter claim: generic task template is the wrong shape for
  `sync-convex-auth`.
- suggested diagnosis or fix: create a sync-specific template.
- repro ladder:
  - tests / source-level repro: source audit showed the skill had no goal
    template instruction and only delegated to generic `task`.
  - repo-owned automated browser or integration proof: N/A, no browser surface.
  - Browser plugin: N/A, no browser surface.
  - screenshot / visual proof: N/A, no visual surface.
- reproduction verdict: valid workflow gap.
- validity verdict: valid.
- best long-term fix boundary: project-owned template plus source rule update,
  not another generic task template expansion.
- harsh honest feedback: stuffing sync audit requirements into `task.md` would
  make the generic task template worse.
- hard-stop decision: proceed with a lane-specific template.

Completion rule:
- Do not call `update_goal(status: complete)` while any required checklist item
  remains unchecked. If an item does not apply, check it and add `N/A: <reason>`.
- Do not call `update_goal(status: complete)` until every completion threshold
  above is satisfied, final handoff evidence is recorded, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-06-15-sync-convex-auth-template.md` passes.

Start Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| Skill analysis before edits | yes | Read `task`, `autogoal`, `sync-convex-auth`, `agent-native-reviewer`, and `autoreview` skills. |
| Active goal checked or created | yes | `get_goal` returned none; created active goal for this template repair. |
| Source of truth read before edits | yes | Read user request, source sync rule, generated sync skill, autogoal template instructions, and current generic task template. |
| Tracker comments and attachments read | no | N/A: no tracker source. |
| Video transcript evidence required | no | N/A: no video source. |
| Pre-solution issue challenge required | yes | Recorded valid workflow gap above. |
| Reproduction verdict before implementation | yes | Source audit showed sync skill lacked a dedicated template instruction. |
| Repro escalation ladder selected | yes | Source-level workflow audit was the honest layer; browser N/A. |
| Suggested fix reviewed against durable boundary | yes | Dedicated template plus source rule update selected; generic task expansion rejected. |
| `docs/solutions` checked for non-trivial existing-code work | yes | Searched `docs/solutions` and `docs/plans`; read closest prior workflow-template repair plans. |
| TDD decision before behavior change or bug fix | yes | N/A: workflow template repair; smoke generation/checker proof is the right test. |
| Branch decision for code-changing task | yes | Created `codex/sync-convex-auth-template` from clean `main`. |
| Release artifact decision | yes | N/A: no published package behavior. |
| Browser tool decision for browser surface | no | N/A: no browser surface. |
| Commit / PR expectation decision | yes | `task` requires commit/push/PR for verified code-changing work. |
| Task-style PR body decision | yes | Use PR #270 task-style body. |
| Tracker sync expectation decision | no | N/A: chat-only request. |
| Output budget strategy recorded | yes | Targeted reads/audits and summarized full check output. |
| Agent-native pack selected | yes | `.agents/**` skill/rule surfaces changed. |
| Agent-facing action surface identified | yes | Future `sync-convex-auth` runs now discover the dedicated template. |
| Source rule versus generated mirror boundary identified | yes | `.agents/rules/sync-convex-auth.mdc` is source; `.agents/skills/sync-convex-auth/SKILL.md` is generated by `bun install`. |
| `agent-native-reviewer` loaded or waiver recorded | yes | Loaded reviewer; manual agent-native review recorded below. |

Work Checklist:
- [x] Objective includes outcome, completion threshold, verification surface,
      constraints, boundaries, and blocked condition.
- [x] Task source classified with source type, id/link, title, task type,
      acceptance criteria, caveats, likely files/routes/packages, browser
      surface, and root-cause layer.
- [x] Required video or screen-recording evidence is cached/read as normalized
      `<video-transcripts>` XML, or marked N/A with reason.
- [x] For public tracker bug reports, behavior claims, technical diagnoses, or
      suggested fixes, reporter claims are challenged before implementation
      with a recorded verdict.
- [x] Repro escalation ladder followed for bug/behavior claims, or marked N/A
      with reason.
- [x] Hard-stop rule followed for invalid/not-reproduced claims, or marked N/A
      with reason.
- [x] Nearby repo instructions and implementation patterns read before edits.
- [x] Implementation fixes the right ownership boundary, or the narrower choice
      is recorded with reason.
- [x] Release artifact requirement recorded.
- [x] Final handoff shape decided: PR, no tracker, no browser proof.
- [x] Commit/PR handling recorded for code-changing work.
- [x] PR body shape recorded.
- [x] Branch handling recorded for code-changing work.
- [x] Local-env-rot retry policy recorded as N/A; no corruption signal.
- [x] Workspace authority recorded for every proof command.
- [x] Output budget discipline recorded and followed.
- [x] High-risk note recorded for agent-action/command-contract change.
- [x] Review/autoreview target selected from actual diff state.
- [x] Agent-native review decision recorded.
- [x] Agent-native pack: source-of-truth rule files are edited instead of generated skill mirrors.
- [x] Agent-native pack: the changed agent action is discoverable from the skill/rule text.
- [x] Agent-native pack: generated mirrors are synced when `.agents/rules/**` changed.
- [x] Agent-native pack: accepted agent-native review findings are fixed or explicitly rejected with reason.

Completion Gates:
| Gate | Applies | Required action | Evidence |
|------|---------|-----------------|----------|
| Named verification threshold | yes | Run named smoke/source/lint/check/review/PR proof | Template smoke, `bun install`, source audit, `bun lint:fix`, `bun check`, autoreview, PR creation, and PR body audit passed. |
| Pre-solution issue challenge verdict | yes | Record claim/repro/verdict/boundary | Valid workflow gap; dedicated template is the durable boundary. |
| Repro escalation ladder | yes | Record source-level/browser outcomes | Source audit only; browser N/A. |
| Bug reproduced before fix | no | Record N/A | N/A: workflow template repair, not product runtime bug. |
| Targeted behavior verification | yes | Smoke template resolution and unfinished guard | Smoke plan generated with `--template sync-convex-auth --with agent-native`; composition metadata showed the pack; unfinished smoke failed `check-complete.mjs` with unresolved sync rows. |
| TypeScript or typed config changed | no | Run relevant typecheck | N/A: no TS/config edit; full `bun check` still passed. |
| Package exports or file layout changed | no | Run package build if needed | N/A: no package export/layout edit; full `bun check` still built package. |
| Package manifests, lockfile, or install graph changed | yes | Run `bun install` and relevant checks | `bun install` passed; `bun.lock` updated workspace package versions to 0.15.12. |
| Agent rules or skills changed | yes | Run `bun install` and verify generated sync | `bun install` regenerated `.agents/skills/sync-convex-auth/SKILL.md`; source/generated body diff is empty after frontmatter removal. |
| Workspace authority proof | yes | Run proof in owning repo | All proof ran from `/Users/zbeyens/git/better-convex`. |
| Browser surface changed | no | Capture Browser proof or waiver | N/A: no browser surface. |
| Browser final proof | no | Attach browser proof if applicable | N/A: no browser surface. |
| Scaffold or fixture output changed | no | Run fixtures if scaffold changed | N/A: no scaffold source changed; full `bun check` still ran fixtures/scenarios. |
| Package behavior or public API changed | no | Add changeset or N/A | N/A: no package-visible behavior. |
| Docs and kitcn skill sync changed | no | Sync `www` and package skill docs if touched | N/A: no `www/**` or `packages/kitcn/skills/kitcn/**` change. |
| Docs or content changed | yes | Verify source-backed workflow docs | Source audit, smoke generation, lint, and full `bun check` passed. |
| High-risk mini gate | yes | Record failure mode/proof/boundary | Failure mode: future sync runs keep using generic task plans and lose upstream classification evidence. Proof: source/generated audit and smoke template. Boundary: source sync rule plus project-owned template. |
| Agent-native review for agent/tooling changes | yes | Load reviewer and close findings | Manual review: no UI/action parity issue; agent capability improves because sync skill now exposes the correct planning primitive. |
| Local install corruption suspected | no | Reinstall retry or N/A | N/A: no corruption signal. |
| Autoreview for non-trivial implementation changes | yes | Run autoreview until clean | First run accepted pack-provenance finding; second run clean with no accepted/actionable findings. |
| Commit created | yes | Create commit after final verification | Commit created on `codex/sync-convex-auth-template`; final plan evidence amended after PR. |
| PR create or update | yes | Push and open PR after `check` | PR #287 opened after `bun check`: https://github.com/udecode/kitcn/pull/287 |
| Task-style PR body verified | yes | Verify `gh pr view --json body` | `gh pr view 287 --json url,title,baseRefName,headRefName,body` showed required task-style body and no current-PR self-link. |
| PR proof image hosting | no | N/A | N/A: no browser proof image. |
| Tracker sync-back | no | N/A | N/A: chat-only request. |
| Final handoff contract | yes | Fill final fields | Filled below; PR URL to add after creation. |
| Final lint | yes | Run `bun lint:fix` | Passed; no fixes applied. |
| Output budget discipline | yes | Record output handling | Full `bun check` was long but required; response will summarize. |
| Goal plan complete | yes | Run checker | `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-06-15-sync-convex-auth-template.md` passed. |
| Agent source / generated sync | yes | Run `bun install` and verify mirrors | `bun install` passed; source/generated body audit passed. |
| Agent action discoverability | yes | Source-audit skill/rule path | `rg` found Goal Template section in source rule and generated skill. |
| Agent-native review | yes | Load reviewer and close findings | Manual review found no action parity regression. |

Phase / pass table:
| Phase | Status | Evidence | Next |
|-------|--------|----------|------|
| Intake and source read | complete | Read user request, skills, source rule, template guidance, and prior repair plans. | implementation |
| Implementation | complete | Added sync template; updated source rule; regenerated skill mirror. | verification |
| Verification | complete | `bun install`, source audit, smoke generation/checker failure, lint, and `bun check` passed. | review |
| Review | complete | First autoreview finding fixed; second autoreview run clean. | commit / PR |
| Commit / PR / tracker sync | complete | Commit created, branch pushed, PR #287 opened, PR body verified; tracker N/A. | closeout |
| Closeout | complete | Final plan evidence updated and checker passed. | final response |

Findings:
- `sync-convex-auth` already had a strong audit/delegation workflow, but no
  durable goal template for that workflow.
- Generic `task` plans include implementation PR machinery that belongs to the
  delegated task, not to the sync audit.
- Prior workflow repairs confirm the source/mirror pattern: edit
  `.agents/rules/**`, run `bun install`, audit `.agents/skills/**`.

Decisions and tradeoffs:
- Added `docs/plans/templates/sync-convex-auth.md` instead of expanding
  `docs/plans/templates/task.md`.
- Kept delegated implementation on `task`; the sync plan owns only upstream
  audit, classification, ambiguity, and delegation evidence.
- Did not add a changeset because no package behavior changed.
- Kept `bun.lock` because `bun install` is required after source rule changes
  and updated workspace package versions to 0.15.12.

Implementation notes:
- `docs/plans/templates/sync-convex-auth.md` defines sync refs, verdict,
  ambiguity ledger, classification ledger, delegated task prompt, sync-specific
  start gates, checklist rows, completion gates, and phase table.
- `.agents/rules/sync-convex-auth.mdc` now tells future durable sync runs to
  create plans with `--template sync-convex-auth`.
- `.agents/skills/sync-convex-auth/SKILL.md` was regenerated by `bun install`.

Review fixes:
- Accepted autoreview P3: `docs/plans/templates/sync-convex-auth.md` hard-coded
  `Primary template` / `Applied packs`, which prevented
  `create-goal-scratchpad.mjs` from recording pack provenance correctly. Fixed
  by using the standard `Template: {{TEMPLATE_PATH}}` placeholder and letting
  the generator insert composition metadata.

Error attempts:
| Error / failed attempt | Count | Next different move | Resolution |
|------------------------|-------|---------------------|------------|
| Smoke sync plan failed `check-complete.mjs` | 2 | Treat as expected unfinished guard, then delete smoke artifact | Expected; checker caught unresolved sync rows; second smoke also proved agent-native pack provenance. |

Verification evidence:
- `bun install` passed and regenerated the sync skill mirror.
- `diff -u <source body> <generated body>` produced no body diff.
- `rg` found the new Goal Template section in source rule and generated skill.
- `node .agents/skills/autogoal/scripts/create-goal-scratchpad.mjs --template sync-convex-auth --with agent-native --title "sync convex auth smoke" --path docs/plans/2026-06-15-sync-convex-auth-template-smoke.md --force` created a smoke plan with correct `Applied packs` provenance.
- `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-06-15-sync-convex-auth-template-smoke.md` failed as expected on unresolved sync and agent-native rows.
- Smoke artifact was deleted.
- `bun lint:fix` passed with no fixes.
- `bun check` passed, including typecheck, tests, fixtures, verify, and runtime scenarios.
- `.agents/skills/autoreview/scripts/autoreview --mode local` first found one
  accepted P3 pack-provenance issue.
- `.agents/skills/autoreview/scripts/autoreview --mode local` second run was
  clean: no accepted/actionable findings.

Final handoff contract:
- Commit line: to be filled after commit.
- PR line: https://github.com/udecode/kitcn/pull/287
- Issue / tracker line: N/A, chat-only request.
- Confidence line: high; full check and autoreview passed.
- Flow table:
  - Reproduced: source-level workflow gap valid; browser N/A.
  - Verified: template smoke, generated skill sync, lint, full `bun check`; browser N/A.
- Browser check: N/A, no browser surface.
- Outcome: `sync-convex-auth` now has a dedicated goal template and the skill points future durable sync runs at it.
- Caveat: this repairs the sync workflow only; it does not run an actual upstream auth sync.
- Design:
  - Chosen boundary: project-owned sync template plus source sync rule.
  - Why not quick patch: telling the agent ad hoc in chat would not repair future runs.
  - Why not broader change: generic `task` should stay generic; delegated implementation already owns PR mechanics.
- Verified: `bun install`; source/generated audit; sync template smoke with agent-native pack; expected unfinished checker failure; `bun lint:fix`; `bun check`; autoreview clean.
- PR body verified: `gh pr view 287 --json url,title,baseRefName,headRefName,body`

Final handoff / sync:
- Commit: `add sync convex auth goal template` on `codex/sync-convex-auth-template`
- PR: https://github.com/udecode/kitcn/pull/287
- Issue / tracker: N/A, chat-only request.
- Browser proof: N/A, no browser surface.
- Caveats: workflow repair only; no upstream auth sync was run.

Timeline:
- 2026-06-15T12:49:04.341Z Task goal plan created.
- Created branch `codex/sync-convex-auth-template`.
- Created `docs/plans/templates/sync-convex-auth.md`.
- Patched `.agents/rules/sync-convex-auth.mdc`.
- Ran `bun install` to regenerate `.agents/skills/sync-convex-auth/SKILL.md`.
- Smoke-generated sync plans and confirmed unfinished rows fail the checker.
- Fixed accepted autoreview pack-provenance finding.
- Ran `bun lint:fix`.
- Ran `bun check`.
- Ran autoreview, fixed accepted pack-provenance finding, reran autoreview clean.
- Committed `add sync convex auth goal template`.
- Pushed `codex/sync-convex-auth-template`.
- Opened and verified PR #287.

Reboot status:
| Question | Answer |
|----------|--------|
| Where am I? | Implementation, verification, autoreview, commit, push, and PR are complete. |
| Where am I going? | Amend final plan evidence into the commit, push final commit, complete goal, final response. |
| What is the goal? | Add a dedicated sync-convex-auth goal template and wire the sync skill to use it. |
| What have I learned? | The clean boundary is a sync audit/delegation template, not more generic task template bulk. |
| What have I done? | Added the template, updated source rule, regenerated skill mirror, smoke-tested template resolution, linted, and ran full check. |

Open risks:
- None.
