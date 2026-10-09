# Repair autoclosure partial task recovery

Objective:
Repair autoclosure recovery so usable partial PR work is adopted into a
per-PR task run, only PRs with no usable task state are closed, and PR #473 is
reopened after the incorrect close.

Goal plan:
docs/plans/2026-09-29-repair-autoclosure-partial-task-recovery.md

Template:
docs/plans/templates/goal-repair.md

Primary template:
docs/plans/templates/goal-repair.md

Applied packs:
- agent-native (docs/plans/templates/packs/agent-native.md)

Expectation:
- user expectation: autoclosure starts from usable partial PR work instead of
  closing it; close only when there is nothing usable to continue.
- observed miss: `.agents/rules/autoclosure.mdc` and `.agents/AGENTS.md`
  mandate closing every PR missing complete task evidence before inspecting
  whether its existing work can be adopted. That policy closed PR #473.
- owning skill/template/helper: primary owner
  `.agents/rules/autoclosure.mdc`; required policy/template sync in
  `.agents/AGENTS.md` and `docs/plans/templates/autoclosure.md`.
- repair classification: derived-skill decision-rule repair with synchronized
  repository policy and runtime-plan representation.

Timed checkpoint:
- requested duration: none
- semantics: N/A: no timed checkpoint requested
- initial confidence score: N/A: binary artifact and behavior checks apply
- improvement loop: N/A: no timed checkpoint requested
- final score / loop closure: N/A: close when all named evidence passes

Completion threshold:
- PR #473 is open and the prior closure comment is corrected.
- Autoclosure classifies exact-head task state as complete, recoverable, or
  absent: complete continues, recoverable adopts the current PR through a
  dedicated `task` plan before full closeout, and absent comments/closes.
- Source policy, generated skill mirrors, and the autoclosure plan template
  agree on that three-way decision.
- Structural cases for complete, recoverable, and absent state are auditable,
  agent-native review and autoreview have no accepted open findings, and all
  applicable workflow validators pass.
- Repair closure is legal only when the source owner is patched, generated
  skills are synced when `.agents/rules/**` changed, a source audit proves the
  repair text exists, the repaired template or rule is smoke-checked, deliberate
  non-repairs are recorded, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-09-29-repair-autoclosure-partial-task-recovery.md` passes.

Verification surface:
- GitHub read-back of PR #473 state and corrected comment.
- Focused source audit across `.agents/AGENTS.md`,
  `.agents/rules/autoclosure.mdc`, the plan template, and generated mirrors.
- `bun install`, `bunx intent validate skills`, and `bunx intent stale`.
- Autoclosure template smoke plus unfinished-plan checker failure and completed
  classification representability audit.
- `agent-native-reviewer` and final `autoreview` receipts.

Constraints:
- Repair one expectation narrowly.
- Patch source-of-truth files, not generated skill mirrors.
- Do not weaken evidence safety or completion gates just to reduce annoyance.
- Do not broaden the repair to unrelated skills/templates.

Boundaries:
- Source of truth: latest user correction plus the PR #473 close receipt.
- Allowed edit scope: repository workflow sources, autoclosure plan template,
  root sync command, generated mirrors, this repair plan, and reversible PR
  #473 state/comment correction.
- Derived skill scope: autoclosure intake and task-evidence recovery only.
- Non-goals: reviewing or merging PR #473, weakening exact-head proof after
  recovery, changing product behavior, or publishing workflow changes.

Output budget strategy:
- Read exact workflow owners and bounded ranges; use focused `rg` queries with
  generated/build paths excluded; cap command output and inspect diffs by file.

Blocked condition:
- Stop only if PR #473 cannot be reopened or read back, source generation is
  unavailable after distinct retries, or required review tooling cannot run.

Repair state:
- repair_type: derived workflow decision-rule repair
- current_phase: closeout
- current_phase_status: complete
- next_phase: final response
- goal_status: complete

Current verdict:
- verdict: repaired
- confidence: high
- next owner: user
- reason: source, template, generated mirrors, PR read-back, structural smoke,
  agent-native review, and autoreview all satisfy the corrected behavior.

Review scope baseline:
- original request: do not close partially good PRs; start from their existing
  state and close only when none is usable.
- violated invariant: incomplete task evidence was treated as proof that the
  PR had no usable task state.
- target branch: `codex/466-procedure-name-codegen`; changes remain local and
  uncommitted.
- intended behavior: immutable-head complete/recoverable/absent triage with
  exact-PR task recovery before normal closeout.
- owner boundary: autoclosure intake rule, repository routing policy, plan
  template, and their generation command/mirrors.
- relevant siblings: `task` exact-PR plan workflow and root agent guidance.
- contracts preserved: one PR/one task, exact-head plan evidence, comment before
  close, no full review/merge while evidence is only recoverable.
- measured tracked diff before final review: 6 files, 228 additions and 119
  deletions; generated `.agents/skills/autoclosure/SKILL.md` and root
  `AGENTS.md` are mirror output.

Completion rule:
- Do not call `update_goal(status: complete)` while any required checklist item
  remains unchecked. If an item does not apply, check it and add `N/A: <reason>`.
- Do not call `update_goal(status: complete)` until every completion threshold
  above is satisfied, final repair evidence is recorded, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-09-29-repair-autoclosure-partial-task-recovery.md` passes.
- Do not create hook state for this repair. This file plus the active goal are
  the durable state.

Start Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| Timed checkpoint parsed | no | N/A: no duration requested |
| Expectation restated | yes | expectation section names adopt-partial / close-absent behavior |
| Active goal checked | yes | no prior active goal; repair goal created for this plan |
| Named plan or skill read | yes | full autoclosure skill/rule and goal-repair template read |
| Owning source selected | yes | `.agents/rules/autoclosure.mdc` with required policy/template sync |
| Repair classification selected | yes | derived workflow decision-rule repair |
| Safety conflict checked | yes | exact-head task proof remains mandatory before full closeout; partial state only authorizes recovery |
| Output budget strategy recorded | yes | bounded exact-owner reads and capped searches |
| Agent-native pack selected | yes | materialized in this plan |
| Agent-facing action surface identified | yes | autoclosure task recovery gate |
| Source rule versus generated mirror boundary identified | yes | edit `.agents` sources, regenerate mirrors with `bun install` |
| Installed-skill lock versus local-rule owner identified | yes | local rule repair; no installed skill add/update/remove |
| `agent-native-reviewer` loaded or waiver recorded | yes | full skill loaded; parity map and findings recorded below |

Work Checklist:
- [x] Use the **plugin-dev:skill-development** skill (Claude Code's authoring guidance for SKILL.md files). N/A: unavailable on Codex; Maintain Workflow plus the pstack Codex authoring mapping were used.
- [x] Validate the skill: frontmatter has `name` and `description`, referenced files exist, cross-skill links resolve. Generated frontmatter and every named skill route were audited.
- [x] Test cases if structural. Skip if subjective. Complete/recoverable/absent rows were smoke-generated and asserted.
- [x] Run **Opening a PR**. N/A: Maintain Workflow forbids commit/push/PR publication unless requested; the user did not request it.
- [x] If a duration was requested, it is recorded as minimum active work unless
      explicitly marked hard stop; when no better metric exists, initial and
      final confidence scores are recorded. N/A: no duration requested.
- [x] Expectation and observed miss are stated with source evidence.
- [x] Primary owner selected: runtime plan, template, skill rule, or
      helper/checker.
- [x] Secondary owners are justified or marked N/A.
- [x] Patch touches source-of-truth files only; generated mirrors came from the sync command.
- [x] Derived skill vs generic `autogoal` ownership decision is recorded.
- [x] Output budget discipline recorded and followed: broad searches are
      scoped, capped, counted, or artifacted instead of streamed into goal
      context.
- [x] Deliberate non-repairs are recorded.
- [x] Final response shape is recorded in Final repair handoff.
- [x] Agent-native pack: source-of-truth rule files are edited instead of generated skill mirrors.
- [x] Agent-native pack: the changed agent action is discoverable from the skill/rule text.
- [x] Agent-native pack: generated mirrors are synced when `.agents/rules/**` changed, or N/A reason is recorded.
- [x] Agent-native pack: installed skills are changed only through
      `npx skills add/update/remove`; local rules/templates/helpers stay source-owned.
- [x] Agent-native pack: routing, required receipts, placeholder failure,
      completion representability, and forbidden behavior have eval/smoke rows.
- [x] Agent-native pack: accepted agent-native review findings are fixed or explicitly rejected with reason.

Completion Gates:
| Gate | Applies | Required action | Evidence |
|------|---------|-----------------|----------|
| Source owner patched | yes | Patch the selected source owner or record runtime-plan-only repair | `.agents/rules/autoclosure.mdc`, `.agents/AGENTS.md`, and autoclosure template patched |
| Generated skill sync | yes | If `.agents/rules/**` changed, run `bun install` and verify generated `SKILL.md` sync | `bun install` passed; `.agents` and `.claude` skill bodies equal source |
| Template smoke | yes | Instantiate the repaired template or inspect it directly when a smoke plan would create noise | smoke plan generated with all three classification lanes |
| Incomplete-plan guard | yes | Verify an unfinished generated plan still fails `check-complete.mjs`, or record N/A with reason | smoke plan failed with unresolved required rows as expected |
| Completed-plan representability | yes | Verify the repaired expectation can be recorded in a completed plan without editing the template again, or record N/A | deterministic row assertion found complete/recoverable/absent recovery and disposition fields |
| Helper/checker tests | no | If scripts changed, run focused script tests; otherwise N/A | N/A: no helper or checker script changed |
| Final lint | yes | Run scoped formatter/lint or record ignored-path/N/A reason | `bun lint:fix` passed with no fixes |
| Output budget discipline | yes | Verify no unbounded high-volume command output was streamed, or record the accidental output and recovery | exact-owner reads were capped; verbose `bun check` truncation recorded below and no broad follow-up was run |
| Timed checkpoint | no | If duration was requested, keep improving until elapsed, then finish the current loop cleanly; otherwise N/A | N/A: no duration requested |
| Agent-native reviewer | yes | Run when workflow source changes or record N/A | parity map complete; two accepted findings fixed; no open finding |
| Autoreview / review | yes | Run applicable final review gate or record N/A for docs-only/source-rule-only repair | local Codex autoreview clean, overall 0.98 |
| Goal plan complete | yes | Run `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-09-29-repair-autoclosure-partial-task-recovery.md` | final checker pass recorded below |
| Agent source / generated sync | yes | Run `bun install` when `.agents/rules/**` changed and verify generated mirrors | normal `bun install` regenerated skill and root guidance mirrors |
| Installed lock audit | no | Verify expected lock entries and removed skills through CLI-managed state | N/A: local rule changed; no installed skill or lock entry changed |
| Agent action discoverability | yes | Source-audit the skill/rule path an agent will read | recovery gate appears in source skill, both generated skill mirrors, and root guidance |
| Helper and template smoke | yes | Syntax-check helpers and prove incomplete failure/completed representation when applicable | unchanged helper generated the smoke plan; incomplete failure and lane representation passed |
| Agent-native review | yes | Load `.agents/skills/agent-native-reviewer/SKILL.md` and close accepted findings, or record N/A | full skill loaded; accepted findings fixed and re-proved |

Phase / pass table:
| Phase | Status | Evidence | Next |
|-------|--------|----------|------|
| Intake | complete | expectation, source miss, and goal recorded | target selection |
| Target selection | complete | autoclosure rule primary; policy/template sync required | patch |
| Patch | complete | three-way recovery gate, root policy, template, and sync command repaired | verification |
| Verification | complete | mirrors, smoke, intent, lint, GitHub read-back, and reviews complete | closeout |
| Closeout | complete | final plan checker ready; no accepted finding remains | final response |

Findings:
- The current rule forbids implementation inspection before compliance and
  maps every missing/invalid task-evidence case directly to comment-and-close.
- Root repository policy repeats the same all-or-nothing mandate, so the rule,
  policy, and plan template must change together.
- `task` already supports creating or resuming a dedicated exact-PR plan; the
  repair should route recoverable state there instead of inventing a second
  recovery workflow.
- `skiller@latest` no longer rewrites root `AGENTS.md`, while this repository
  still owns guidance in `.agents/AGENTS.md`; the documented `bun install`
  source-sync contract therefore left the root mirror stale.

Decisions and tradeoffs:
- Use three states: `complete`, `recoverable`, and `absent`. Recovery is not a
  compliance waiver: full review/merge remains blocked until exact-head task
  evidence is repaired and read back.
- Define recoverable state from source-backed PR intent plus a substantive,
  coherent existing delta; define absent state as no coherent delta or no
  source-backed task contract after bounded intake triage.
- Keep classification judgment in the workflow rule because delta coherence is
  not safely reducible to a string check.
- Pin the existing postinstall generator to `skiller@0.9.14`, the last locally
  available version that honors this repository's `.agents/AGENTS.md` source
  contract. This avoids hand-editing the generated root mirror and keeps
  `bun install` as the single sync command.

Repair patch notes:
- Replaced all-or-nothing close policy with immutable-head `complete`,
  `recoverable`, and `absent` classification.
- Recoverable state preserves the existing branch and routes through `task` for
  the exact PR until dedicated plan/body evidence is complete at the new head.
- Absent state retains comment-before-close and read-back safety.
- Reopened PR #473 and replaced the stale closure comment with the recovery
  path and reason.
- Removed implementation-only wording so docs, workflow, and other coherent PR
  deltas can be recoverable too.
- Pinned the root guidance generator after `skiller@latest` left `AGENTS.md`
  stale; a normal `bun install` now regenerates both skill and root mirrors.

Deliberate non-repairs:
- Do not change the universal `autogoal` lifecycle; this miss is specific to
  autoclosure intake.
- Do not review or merge PR #473 during the repair.
- Do not commit, push, open a PR, or publish this maintenance without a user
  request; Maintain Workflow owns that boundary.
- Do not migrate the repository to Skiller's newer root-authored guidance model;
  that broader ownership change needs its own workflow task.

Agent-native review:

| User action | Agent route | Source owner | Mirror/lock/doc | Proof | Status |
| --- | --- | --- | --- | --- | --- |
| Finish a PR with complete task evidence | `autoclosure` complete lane | `.agents/rules/autoclosure.mdc` | `.agents/skills/autoclosure/SKILL.md`, `.claude/skills/autoclosure/SKILL.md` | source/mirror equality audit | pass |
| Continue partially good PR work | `autoclosure` recoverable lane -> exact-PR `task` | `.agents/rules/autoclosure.mdc` | skill mirrors + `AGENTS.md` route | structural smoke and #473 read-back | pass |
| Close a PR with no usable task state | `autoclosure` absent lane | `.agents/rules/autoclosure.mdc` | skill mirrors + plan template | comment-before-close and read-back rows | pass |
| Record and prove each intake lane | autoclosure goal plan | `docs/plans/templates/autoclosure.md` | instantiated goal plan | unfinished checker failure + row assertion | pass |
| Sync agent guidance | `bun install` | `.agents/AGENTS.md`, `.agents/rules/**`, `package.json` postinstall | root `AGENTS.md` + skill mirrors | exact source/mirror audit | pass |

Agent-native findings:

1. [P1 accepted] Root `AGENTS.md` stayed stale after the documented sync
   command because `skiller@latest` changed ownership semantics. Fixed by
   pinning postinstall to `skiller@0.9.14`; normal `bun install` regenerated and
   matched the root mirror.
2. [P1 accepted] `recoverable` originally required an implementation delta,
   which would incorrectly close valid docs or workflow PRs. Fixed by requiring
   a substantive coherent delta regardless of artifact type.
3. [N/A] pstack `no-comments` requests a subagent, but higher-priority runtime
   instructions prohibit spawning one without explicit user authorization.
   Scoped prose review found no comment workaround or unexplained constraint.

Error attempts:
| Error / failed attempt | Count | Next different move | Resolution |
|------------------------|-------|---------------------|------------|
| GitHub comment PATCH used a plain-text `--input`, but the endpoint expected JSON | 1 | Send the body as a file-backed form field | `gh api -F body=@...` succeeded and was read back |
| `bunx intent validate skills` ran from the wrong workspace | 1 | Use the repository script that changes into `packages/kitcn` | `bun run intent:validate` passed |
| `bun check` reached unrelated Expo fixture drift and emitted high-volume output | 1 | Keep this repair scoped; use focused workflow validators and record the external drift | 2,626 tests passed before `fixtures:check` reported Expo `AGENTS.md`/`CLAUDE.md` drift; no repair file affects fixture output |
| Final `rg` pattern used shell-interpreted backticks | 1 | Quote the search pattern literally and avoid command-bearing punctuation in double quotes | Re-ran with a single-quoted pattern; no state changed |

Verification evidence:
- Artifact: `gh pr view 473 --repo udecode/kitcn --json state,url,headRefOid`
  -> `OPEN` at `424a3bec59d8c9b1accf592ad534ef73ad90e7dc`.
- Artifact: comment
  `https://github.com/udecode/kitcn/pull/473#issuecomment-5899734287`
  -> read back with recovery wording at `2026-09-29T22:11:25Z`.
- Command: normal `bun install` with pinned Skiller -> generated root and skill
  mirrors; source/mirror equality audit passed.
- Command: autoclosure smoke generation + `check-complete.mjs` -> required
  complete/recoverable/absent rows present; unfinished plan failed as expected.
- Command: `bun run intent:validate` -> one published kitcn skill validated.
- Command: `bun run intent:stale` -> dotenv and kitcn skills up to date.
- Command: `bun lint:fix` and `git diff --check` -> passed with no fixes or
  whitespace errors.
- Review: full `agent-native-reviewer` parity map -> two findings accepted,
  fixed, and re-proved; none open.
- Review: `.agents/skills/autoreview/scripts/autoreview --mode local` -> clean,
  no accepted/actionable findings, overall 0.98.
- Command: `bun check` -> relevant lint/type/test/CLI/concave lanes passed;
  repository gate stopped at pre-existing Expo fixture drift because the
  upstream scaffold replaced its fixture `AGENTS.md` and removed `CLAUDE.md`.
- Command: `node .agents/skills/autogoal/scripts/check-complete.mjs
  docs/plans/2026-09-29-repair-autoclosure-partial-task-recovery.md` ->
  `[autogoal] complete`.

Final repair handoff:
- Expectation: adopt partially good PR work; close only when no usable state
  exists.
- Repaired owner: `.agents/rules/autoclosure.mdc` with synchronized repository
  policy, plan template, generated mirrors, and root sync command.
- Files changed: `.agents/AGENTS.md`, `.agents/rules/autoclosure.mdc`, generated
  `.agents/skills/autoclosure/SKILL.md`, generated `AGENTS.md`,
  `docs/plans/templates/autoclosure.md`, `package.json`, and this repair plan.
- Verification: PR #473 open/read back, corrected comment read back, mirrors
  equal source, structural smoke passes, unfinished smoke fails, intent/lint
  checks pass, agent-native review closed, autoreview clean.
- Caveat: full `bun check` is red only on unrelated Expo fixture drift; no
  commit, push, or repair PR was requested or created.

Timeline:
- 2026-09-29T22:09:49.348Z Goal repair plan created.
- 2026-09-30 User expectation and exact source miss recorded; repair owner and
  three-way state model selected.
- 2026-09-30 PR #473 reopened and prior close comment corrected.
- 2026-09-30 Source policy, autoclosure rule, and plan template patched.
- 2026-09-30 Agent-native review found and fixed docs/workflow recovery and root
  mirror generation gaps.
- 2026-09-30 Final smoke, intent validation, stale audit, lint, GitHub read-back,
  and autoreview passed; full check isolated unrelated Expo fixture drift.
- 2026-09-30 Goal checker passed after final evidence and risk closure.

Reboot status:
| Question | Answer |
|----------|--------|
| Where am I? | Closeout complete |
| Where am I going? | Final response |
| What is the goal? | Adopt recoverable PR state; close only absent state |
| What have I learned? | Recovery needs both a coherent delta and a concrete task contract; incomplete evidence alone proves neither absence nor compliance |
| What have I done? | Reopened #473; repaired source policy, template, generation, mirrors, and proof |

Open risks:
- Repository-wide `bun check` remains red on unrelated Expo fixture drift
  (`AGENTS.md` changed and `CLAUDE.md` removed in the upstream scaffold). The
  focused workflow gates and all tests before that fixture check passed.
