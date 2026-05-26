# require task commit pr gate

Objective:
Repair the task workflow so future goal-backed task plans force commit and PR
handling for verified code changes.

Goal plan:
docs/plans/2026-05-26-require-task-commit-pr-gate.md

Template:
docs/plans/templates/goal-repair.md

Primary template:
docs/plans/templates/goal-repair.md

Applied packs:
- none

Expectation:
- user expectation: task plans should have commit and PR handling from the
  template.
- observed miss: the previous task-template plan allowed a verified code change
  to close locally by marking PR as N/A, and it had no explicit commit gate.
- owning skill/template/helper: `.agents/rules/task.mdc` and
  `docs/plans/templates/task.md`.
- repair classification: future generated plans need recurring commit/PR gates,
  and the derived task skill needed stricter workflow wording.

Completion threshold:
- Repair is complete when task source rules require commit plus PR for verified
  code changes unless explicitly declined or blocked, the task plan template
  materializes explicit commit and PR gates, generated task skill sync is
  verified after `bun install`, source audit proves the new wording exists, a
  smoke-generated task plan contains the rows and still fails unfinished, and
  `node .agents/rules/autogoal/scripts/check-complete.mjs docs/plans/2026-05-26-require-task-commit-pr-gate.md` passes.

Verification surface:
- source audit with `rg` over `.agents/rules/task.mdc`,
  `.agents/skills/task/SKILL.md`, and `docs/plans/templates/task.md`
- `bun install` for generated skill sync
- smoke plan generated with `--template task`, audited for commit/PR rows, then
  removed
- unfinished-plan guard via `check-complete.mjs`
- `bun lint:fix`
- agent-native review by source inspection

Constraints:
- Repair one expectation narrowly.
- Patch source-of-truth files, not generated skill mirrors.
- Do not weaken evidence safety or completion gates just to reduce annoyance.
- Do not broaden the repair to unrelated skills/templates.

Boundaries:
- Source of truth: latest `autogoal repair` request.
- Allowed edit scope: `.agents/rules/task.mdc`, generated task skill via sync,
  `docs/plans/templates/task.md`, this repair plan.
- Derived skill scope: task workflow only.
- Non-goals: generic autogoal lifecycle rewrite, docs template rewrite,
  package-api/browser pack changes, or commit/PR automation scripts.

Blocked condition:
Autonomous repair would stop if the task owner was unclear after reading the
rule/template, `bun install` could not sync generated skills, or the repaired
template could not materialize commit/PR rows.

Repair state:
- repair_type: task-template workflow repair
- current_phase: closeout
- current_phase_status: completed
- next_phase: final response
- goal_status: ready to close

Current verdict:
- verdict: fixed
- confidence: high
- next owner: user
- reason: source rule, generated skill, and task template now make commit plus
  PR explicit for verified code-changing work.

Completion rule:
- Do not call `update_goal(status: complete)` while any required checklist item
  remains unchecked. If an item does not apply, check it and add `N/A: <reason>`.
- Do not call `update_goal(status: complete)` until every completion threshold
  above is satisfied, final repair evidence is recorded, and
  `node .agents/rules/autogoal/scripts/check-complete.mjs docs/plans/2026-05-26-require-task-commit-pr-gate.md` passes.
- Do not create hook state for this repair. This file plus the active goal are
  the durable state.

Start Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| Expectation restated | yes | Task plans should include commit and PR handling from the template. |
| Active goal checked | yes | No active goal existed; repair goal was created. |
| Named plan or skill read | yes | Read `autogoal` repair instructions, `.agents/rules/task.mdc`, generated task skill, and `docs/plans/templates/task.md`. |
| Owning source selected | yes | Owner is task rule plus task plan template. |
| Repair classification selected | yes | Future generated plans need recurring gates; task rule needed workflow text. |
| Safety conflict checked | yes | Repair strengthens shipping closure without weakening verification gates. |

Work Checklist:
- [x] Expectation and observed miss are stated with source evidence.
- [x] Primary owner selected: task rule and task template.
- [x] Secondary owners are justified: generated task skill is sync output from
      `.agents/rules/task.mdc`.
- [x] Patch touches source-of-truth files only; generated skill changed through
      `bun install`.
- [x] Derived skill vs generic `autogoal` ownership decision is recorded.
- [x] Deliberate non-repairs are recorded.
- [x] Final response shape is recorded.

Completion Gates:
| Gate | Applies | Required action | Evidence |
|------|---------|-----------------|----------|
| Source owner patched | yes | Patch selected source owner | `.agents/rules/task.mdc` and `docs/plans/templates/task.md` patched. |
| Generated skill sync | yes | Run `bun install` and verify generated `SKILL.md` sync | `bun install` passed; `rg` confirmed generated `.agents/skills/task/SKILL.md` has new commit/PR wording. |
| Template smoke | yes | Instantiate or inspect repaired template | Smoke task plan contained `Commit / PR expectation decision`, `Commit created`, stricter `PR create or update`, and `Commit line`. |
| Incomplete-plan guard | yes | Verify unfinished generated plan fails checker | Smoke task plan failed `check-complete.mjs` with unresolved commit/PR rows among other pending rows. |
| Completed-plan representability | yes | Verify expectation can be recorded in a completed plan | Template now has dedicated start gate, completion gate, phase row, and final handoff fields for commit/PR evidence. |
| Helper/checker tests | no | If scripts changed, run focused script tests | N/A: no helper/checker scripts changed. |
| Autoreview / review | yes | Run applicable review gate or record N/A | Agent-native review by source inspection: PASS, repair improves agent workflow parity and does not remove user controls. |
| Final lint | yes | Run scoped formatter/lint | `bun lint:fix` passed. |
| Goal plan complete | yes | Run checker | Plan checker to run after this update. |

Phase / pass table:
| Phase | Status | Evidence | Next |
|-------|--------|----------|------|
| Intake | completed | user repair request and autogoal repair instructions read | target selection |
| Target selection | completed | task rule and task template selected | patch |
| Patch | completed | source rule/template patched; generated skill synced | verification |
| Verification | completed | source audit, smoke plan, unfinished guard, lint, review | closeout |
| Closeout | completed | repair plan updated | final response |

Findings:
- `docs/plans/templates/task.md` already had a PR row, but no explicit commit
  row.
- The PR row was too easy to mark N/A because it did not state that verified
  code-changing task work requires PR unless explicitly declined or blocked.
- `.agents/rules/task.mdc` already said verified code should ship as a PR, but
  it did not make commit explicit in the closeout rule.

Decisions and tradeoffs:
- Repaired `task`, not generic `autogoal`, because the expectation is
  code-changing task execution, not universal lifecycle mechanics.
- Did not add checker script enforcement because the existing markdown gate
  checker already fails unresolved template rows.
- Did not patch package-api/browser/docs packs because this applies to the
  primary task workflow.

Repair patch notes:
- `.agents/rules/task.mdc`: verified code now explicitly ships as commit and
  PR unless user declines, there is no patch, or work is analytical/blocked.
- `docs/plans/templates/task.md`: added commit/PR expectation start gate,
  commit handling checklist item, `Commit created` gate, stricter PR gate,
  commit/PR phase row, and commit final handoff fields.
- `.agents/skills/task/SKILL.md`: regenerated by `bun install`.

Deliberate non-repairs:
- No autogoal generic template change; not every goal is code-changing task
  work.
- No script-level checker change; unresolved gate rows already fail.
- No goal-repair template commit/PR gate; this repair request targeted the
  task template miss.

Error attempts:
| Error / failed attempt | Count | Next different move | Resolution |
|------------------------|-------|---------------------|------------|
| Repair plan initially failed checker while incomplete | 1 | Fill repair evidence and rerun checker | Expected incomplete-plan guard. |
| Smoke task plan failed checker while incomplete | 1 | Audit rows, then delete smoke artifact | Expected unfinished-plan guard. |

Verification evidence:
- `bun install` passed and regenerated `.agents/skills/task/SKILL.md`.
- `rg` confirmed new commit/PR wording in `.agents/rules/task.mdc`,
  `.agents/skills/task/SKILL.md`, and `docs/plans/templates/task.md`.
- Smoke task plan generated from `docs/plans/templates/task.md` contained the
  new commit/PR start gate, completion gates, phase row, and final handoff
  fields.
- Smoke task plan failed `check-complete.mjs` while unfinished, including
  unresolved commit/PR rows.
- `bun lint:fix` passed.

Final repair handoff:
- Expectation: task plans should include commit and PR handling from the
  template.
- Repaired owner: `.agents/rules/task.mdc` and `docs/plans/templates/task.md`.
- Files changed: task rule, generated task skill, task template, repair plan.
- Verification: source audit, generated skill sync, smoke task plan, unfinished
  checker guard, lint.
- Caveat: this repaired future task workflow closure; it did not create a PR
  for this repair.

Timeline:
- 2026-05-26T10:52:34.956Z Goal repair plan created.
- 2026-05-26 Read task rule and task template.
- 2026-05-26 Patched task rule and task template.
- 2026-05-26 Ran `bun install` to regenerate task skill.
- 2026-05-26 Smoke-generated task plan and verified commit/PR rows.
- 2026-05-26 Ran `bun lint:fix`.

Reboot status:
| Question | Answer |
|----------|--------|
| Where am I? | Closeout complete. |
| Where am I going? | Final response after plan checker and goal close. |
| What is the goal? | Repair task plans so commit/PR cannot be missed for verified code changes. |
| What have I learned? | The miss belongs to the task rule/template, not generic autogoal. |
| What have I done? | Patched the source rule/template, synced generated skill, smoke-checked rows, and recorded evidence. |

Open risks:
None.
