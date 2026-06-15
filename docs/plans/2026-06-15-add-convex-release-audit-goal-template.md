# add convex release audit goal template

Objective:
Add a `convex-release-audit`-specific goal template and wire the skill to use
it for durable audit plans.

Goal plan:
docs/plans/2026-06-15-add-convex-release-audit-goal-template.md

Template:
docs/plans/templates/goal-repair.md

Primary template:
docs/plans/templates/goal-repair.md

Applied packs:
- agent-native (docs/plans/templates/packs/agent-native.md)

Expectation:
- user expectation: create the same dedicated goal-template workflow for
  `convex-release-audit` that was created for `sync-convex-auth`.
- observed miss: `convex-release-audit` had detailed audit instructions but no
  project-owned durable goal template or source-rule instruction to use one.
- owning skill/template/helper: `.agents/rules/convex-release-audit.mdc`,
  generated `.agents/skills/convex-release-audit/SKILL.md`, and
  `docs/plans/templates/convex-release-audit.md`.
- repair classification: source-rule and reusable-template repair.

Completion threshold:
- `convex-release-audit` source rule points durable audit state at a dedicated
  `convex-release-audit` goal template.
- Generated skill mirror matches the source rule after `bun install`.
- The reusable template records version discovery, changelog reconciliation,
  upstream diff evidence, kitcn leverage classification, selected slice or
  no-action verdict, and delegated `task` prompt.
- Template smoke with `--with agent-native` proves generated composition
  metadata and the expected unfinished-plan failure.
- Lint, full repo check, autoreview, commit, push, PR body audit, and this goal
  checker all pass.

Verification surface:
- `bun install`
- source/generated skill diff
- `convex-release-audit` template smoke with `--with agent-native`
- expected `check-complete.mjs` failure for the unfinished smoke plan
- `bun lint:fix`
- `bun check`
- `.agents/skills/autoreview/scripts/autoreview --mode local`
- `gh pr view 288 --json url,title,baseRefName,headRefName,body`
- `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-06-15-add-convex-release-audit-goal-template.md`

Constraints:
- Repair one expectation narrowly.
- Patch source-of-truth files, not generated skill mirrors by hand.
- Do not weaken evidence safety or completion gates.
- Do not run an actual Convex release audit in this workflow repair.

Boundaries:
- Source of truth: user request for the same template repair on
  `convex-release-audit`.
- Allowed edit scope: `.agents/rules/convex-release-audit.mdc`,
  generated skill mirror from `bun install`, `docs/plans/templates/**`,
  active goal plan, and install lockfile normalization.
- Derived skill scope: `.agents/skills/convex-release-audit/SKILL.md` generated
  by `bun install`.
- Non-goals: Convex version audit, Convex upgrade, implementation slice from a
  real release audit, package API change, scaffold change.

Output budget strategy:
- Used targeted `sed`, `rg`, `diff`, smoke output snippets, and capped command
  output. Broad `bun check` output was streamed only as required long-running
  verification evidence.

Blocked condition:
- No blocker remained. A blocker would have been inability to regenerate
  skills, instantiate the template, run the final repo gate, or create the PR.

Repair state:
- repair_type: source-rule-template
- current_phase: closeout
- current_phase_status: completed
- next_phase: final response
- goal_status: ready_for_completion

Current verdict:
- verdict: complete
- confidence: high
- next owner: reviewer
- reason: PR #288 contains the repaired source rule, generated skill mirror,
  dedicated template, active plan, and verification evidence.

Completion rule:
- Do not call `update_goal(status: complete)` while any required checklist item
  remains unchecked. If an item does not apply, check it and add `N/A: <reason>`.
- Do not call `update_goal(status: complete)` until every completion threshold
  above is satisfied, final repair evidence is recorded, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-06-15-add-convex-release-audit-goal-template.md` passes.
- Do not create hook state for this repair. This file plus the active goal are
  the durable state.

Start Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| Expectation restated | yes | Request was to do the same dedicated template repair for `convex-release-audit`. |
| Active goal checked | yes | Created active goal for adding the template, generated skill sync, smoke checks, lint, full check, autoreview, and PR. |
| Named plan or skill read | yes | Read `.agents/skills/convex-release-audit/SKILL.md`, `.agents/rules/convex-release-audit.mdc`, `task`, `autogoal`, `agent-native-reviewer`, and `autoreview`. |
| Owning source selected | yes | Source owner is `.agents/rules/convex-release-audit.mdc`; generated mirror is synced, not hand-owned. |
| Repair classification selected | yes | Source-rule and reusable-template repair. |
| Safety conflict checked | yes | No conflict; the release-audit template only changes future planning workflow. |
| Output budget strategy recorded | yes | Searches and reads were targeted; long `bun check` output was unavoidable verification. |
| Agent-native pack selected | yes | This touches `.agents/**` and skill instructions. |
| Agent-facing action surface identified | yes | Agent-facing surface is the `convex-release-audit` skill's durable goal creation instruction. |
| Source rule versus generated mirror boundary identified | yes | Source rule edited; generated skill mirror synced through `bun install`. |
| `agent-native-reviewer` loaded or waiver recorded | yes | Loaded and applied as a source/generated/discoverability review decision. |

Work Checklist:
- [x] Expectation and observed miss are stated with source evidence.
- [x] Primary owner selected: runtime plan, template, skill rule, or
      helper/checker.
- [x] Secondary owners are justified or marked N/A.
- [x] Patch touches source-of-truth files only.
- [x] Derived skill vs generic `autogoal` ownership decision is recorded.
- [x] Output budget discipline recorded and followed: broad searches are
      scoped, capped, counted, or artifacted instead of streamed into goal
      context.
- [x] Deliberate non-repairs are recorded.
- [x] Final response shape is recorded.
- [x] Agent-native pack: source-of-truth rule files are edited instead of
      generated skill mirrors.
- [x] Agent-native pack: the changed agent action is discoverable from the
      skill/rule text.
- [x] Agent-native pack: generated mirrors are synced when `.agents/rules/**`
      changed, or N/A reason is recorded.
- [x] Agent-native pack: accepted agent-native review findings are fixed or
      explicitly rejected with reason.

Completion Gates:
| Gate | Applies | Required action | Evidence |
|------|---------|-----------------|----------|
| Source owner patched | yes | Patch the selected source owner or record runtime-plan-only repair | `.agents/rules/convex-release-audit.mdc` now includes `## Goal Template` with `--template convex-release-audit`. |
| Generated skill sync | yes | If `.agents/rules/**` changed, run `bun install` and verify generated `SKILL.md` sync | `bun install`; source/generated `diff -u` exited 0. |
| Template smoke | yes | Instantiate the repaired template or inspect it directly when a smoke plan would create noise | Smoke plan created with `--template convex-release-audit --with agent-native`; header included `Primary template` and `Applied packs`. |
| Incomplete-plan guard | yes | Verify an unfinished generated plan still fails `check-complete.mjs`, or record N/A with reason | Smoke `check-complete.mjs` failed as expected with incomplete objective, gates, checklist, and evidence. |
| Completed-plan representability | yes | Verify the repaired expectation can be recorded in a completed plan without editing the template again, or record N/A | This completed goal-repair plan records the workflow repair without changing the reusable release-audit template. |
| Helper/checker tests | no | If scripts changed, run focused script tests; otherwise N/A | N/A: no helper/checker script changed. |
| Autoreview / review | yes | Run applicable review gate or record N/A for docs-only/source-rule-only repair | First autoreview found two issues; fixed raw changelog command and scratchpad template choice. Second autoreview exited clean. |
| Final lint | yes | Run scoped formatter/lint or record ignored-path/N/A reason | `bun lint:fix` exited 0 after review fixes. |
| Output budget discipline | yes | Verify no unbounded high-volume command output was streamed, or record the accidental output and recovery | Broad output was limited except the required long `bun check` verification stream. |
| Goal plan complete | yes | Run `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-06-15-add-convex-release-audit-goal-template.md` | This checker is run after filling the plan and before goal completion. |

Phase / pass table:
| Phase | Status | Evidence | Next |
|-------|--------|----------|------|
| Intake | completed | Skill/rule/templates read; active goal created. | target selection completed |
| Target selection | completed | Source rule plus reusable template selected; generated mirror is derived. | patch completed |
| Patch | completed | Added `docs/plans/templates/convex-release-audit.md`; patched source rule; synced skill. | verification completed |
| Verification | completed | `bun install`, sync diff, smoke, lint, `bun check`, autoreview. | closeout completed |
| Closeout | completed | Commit pushed; PR #288 created and body verified. | final response |

Findings:
- `convex-release-audit` had no dedicated durable goal template before this
  change.
- Reusable templates must not hard-code composition metadata; generated plans
  receive `Primary template` and `Applied packs`.
- The Convex changelog API command needs the raw `Accept` header.

Decisions and tradeoffs:
- Used a dedicated `convex-release-audit` template for actual release audits.
- Used the `goal-repair` template for this meta repair plan because this task
  repairs the audit workflow; it is not itself a Convex release audit.
- Kept implementation PR machinery in `task` instead of duplicating it inside
  the release-audit plan.

Repair patch notes:
- Added `docs/plans/templates/convex-release-audit.md`.
- Added a `## Goal Template` section to
  `.agents/rules/convex-release-audit.mdc`.
- Ran `bun install` to regenerate
  `.agents/skills/convex-release-audit/SKILL.md`.
- Kept `bun.lock` normalization from `bun install`.

Deliberate non-repairs:
- Did not run a real Convex release audit.
- Did not upgrade Convex.
- Did not add package changes or a changeset because no package source changed.
- Did not add fixture checks beyond `bun check`; no scaffold source changed.
- Did not add browser proof because no browser surface changed.

Error attempts:
| Error / failed attempt | Count | Next different move | Resolution |
|------------------------|-------|---------------------|------------|
| First autoreview found raw changelog command defect | 1 | Add raw `Accept` header to the reusable template | Fixed and second autoreview was clean. |
| First autoreview found misleading generic scratchpad | 1 | Replace active task scratchpad with goal-repair plan | Fixed by deleting the generic scratchpad and using this plan. |

Verification evidence:
- `bun install` exited 0 and regenerated skills.
- `diff -u <(sed '1,/^---$/d' .agents/rules/convex-release-audit.mdc) <(sed '1,/^---$/d' .agents/skills/convex-release-audit/SKILL.md)` exited 0.
- Template smoke command created
  `docs/plans/2026-06-15-convex-release-audit-template-smoke.md` with
  `Primary template` and `Applied packs`.
- Smoke `check-complete.mjs` failed as expected for an unfinished generated
  plan.
- `bun lint:fix` exited 0.
- `bun check` exited 0 after review fixes.
- `.agents/skills/autoreview/scripts/autoreview --mode local` exited clean on
  the second run.
- `gh pr view 288 --json url,title,baseRefName,headRefName,body` verified
  https://github.com/udecode/kitcn/pull/288.

Final repair handoff:
- Expectation: same dedicated goal-template workflow for
  `convex-release-audit`.
- Repaired owner: `.agents/rules/convex-release-audit.mdc` plus
  `docs/plans/templates/convex-release-audit.md`.
- Files changed: source rule, generated skill mirror, reusable template, goal
  plan, `bun.lock`.
- Verification: `bun install`, sync diff, template smoke, expected smoke
  checker failure, `bun lint:fix`, `bun check`, autoreview clean, PR body view.
- Caveat: workflow repair only; no actual Convex release audit was run.

Timeline:
- 2026-06-15 Goal created for dedicated `convex-release-audit` template repair.
- 2026-06-15 Source rule patched and reusable template added.
- 2026-06-15 `bun install` synced generated skill mirror.
- 2026-06-15 Template smoke passed composition proof and failed completion as
  expected.
- 2026-06-15 First autoreview found two issues; both were fixed.
- 2026-06-15 Final `bun check` passed.
- 2026-06-15 PR #288 opened and body verified.

Reboot status:
| Question | Answer |
|----------|--------|
| Where am I? | Closeout completed |
| Where am I going? | Final response after goal checker and amended push |
| What is the goal? | Add and wire the `convex-release-audit` goal template |
| What have I learned? | The reusable template must include the raw GitHub changelog header and the meta repair plan should use `goal-repair`. |
| What have I done? | Implemented, verified, committed, pushed, and opened PR #288. |

Open risks:
- None.
