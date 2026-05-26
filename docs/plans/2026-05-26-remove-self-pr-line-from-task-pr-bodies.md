# remove self pr line from task pr bodies

Objective:
Repair the task PR-body contract so a task-style PR description never includes
a current-PR self-link such as `PR #272` or the current PR URL.

Goal plan:
docs/plans/2026-05-26-remove-self-pr-line-from-task-pr-bodies.md

Template:
docs/plans/templates/goal-repair.md

Primary template:
docs/plans/templates/goal-repair.md

Applied packs:
- none

Expectation:
- user expectation: `"PR #272" should not be part of PR desc.`
- observed miss: task rule/template allowed "PR line when useful", and PR 272
  used that as a self-link inside its own description.
- owning skill/template/helper: `.agents/rules/task.mdc` plus
  `docs/plans/templates/task.md`.
- repair classification: derived task workflow rule/template repair.

Completion threshold:
- Task PR descriptions preserve task-style evidence while forbidding a
  current-PR self-link; PR 272 body is updated and verified with `gh pr view`.
- Repair closure is legal only when the source owner is patched, generated
  skills are synced when `.agents/rules/**` changed, a source audit proves the
  repair text exists, the repaired template or rule is smoke-checked, deliberate
  non-repairs are recorded, and
  `node .agents/rules/autogoal/scripts/check-complete.mjs docs/plans/2026-05-26-remove-self-pr-line-from-task-pr-bodies.md` passes.

Verification surface:
- Source audit for `.agents/rules/task.mdc`,
  `.agents/skills/task/SKILL.md`, and `docs/plans/templates/task.md`;
  `bun install` generated sync; PR 272 body readback; review/lint/check gates;
  plan checker.

Constraints:
- Repair one expectation narrowly.
- Patch source-of-truth files, not generated skill mirrors.
- Do not weaken evidence safety or completion gates just to reduce annoyance.
- Do not broaden the repair to unrelated skills/templates.

Boundaries:
- Source of truth: latest `autogoal repair <expectation>` request.
- Allowed edit scope: task rule, task template, generated sync output through
  `bun install`, repair plans, and PR 272 body.
- Derived skill scope: task only.
- Non-goals: generic `autogoal`, git helper PR prose outside task runs, runtime
  package behavior.

Blocked condition:
- Stop only if PR 272 cannot be updated/read back through `gh`, generated skill
  sync fails, or repo check fails with a real blocker.

Repair state:
- repair_type: task PR body contract
- current_phase: closeout
- current_phase_status: complete
- next_phase: final response
- goal_status: active

Current verdict:
- verdict: repaired
- confidence: high
- next owner: final commit/push
- reason: source rule, task template, generated skill, and PR 272 body now all
  reject the current-PR self-link shape.

Completion rule:
- Do not call `update_goal(status: complete)` while any required checklist item
  remains unchecked. If an item does not apply, check it and add `N/A: <reason>`.
- Do not call `update_goal(status: complete)` until every completion threshold
  above is satisfied, final repair evidence is recorded, and
  `node .agents/rules/autogoal/scripts/check-complete.mjs docs/plans/2026-05-26-remove-self-pr-line-from-task-pr-bodies.md` passes.
- Do not create hook state for this repair. This file plus the active goal are
  the durable state.

Start Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| Expectation restated | yes | Current PR self-link must not appear in task PR descriptions. |
| Active goal checked | yes | `get_goal` returned no active goal; created this repair goal. |
| Named plan or skill read | yes | Read `autogoal`, `task`, `agent-native-reviewer`, task rule, task template, and PR 272 body. |
| Owning source selected | yes | Primary owner: `.agents/rules/task.mdc`; secondary: `docs/plans/templates/task.md`. |
| Repair classification selected | yes | Derived task workflow repair. |
| Safety conflict checked | yes | No evidence-safety conflict; this removes an irrelevant self-link while preserving task proof fields. |

Work Checklist:
- [x] Expectation and observed miss are stated with source evidence.
- [x] Primary owner selected: runtime plan, template, skill rule, or
      helper/checker.
- [x] Secondary owners are justified or marked N/A.
- [x] Patch touches source-of-truth files only.
- [x] Derived skill vs generic `autogoal` ownership decision is recorded.
- [x] Deliberate non-repairs are recorded.
- [x] Final response shape is recorded.

Completion Gates:
| Gate | Applies | Required action | Evidence |
|------|---------|-----------------|----------|
| Source owner patched | yes | Patch the selected source owner or record runtime-plan-only repair | `.agents/rules/task.mdc` now says task PR bodies use issue/tracker/fix lines and never link to the current PR itself. |
| Generated skill sync | yes | If `.agents/rules/**` changed, run `bun install` and verify generated `SKILL.md` sync | `bun install` passed and `.agents/skills/task/SKILL.md` contains the same current-PR self-link ban. |
| Template smoke | yes | Instantiate the repaired template or inspect it directly when a smoke plan would create noise | Inspected `docs/plans/templates/task.md`; the task PR-body gate and contract forbid current-PR self-links and require issue/tracker/fix lines only when applicable. |
| Incomplete-plan guard | yes | Verify an unfinished generated plan still fails `check-complete.mjs`, or record N/A with reason | `node .agents/rules/autogoal/scripts/check-complete.mjs docs/plans/2026-05-26-remove-self-pr-line-from-task-pr-bodies.md` failed while this plan still had pending gates. |
| Completed-plan representability | yes | Verify the repaired expectation can be recorded in a completed plan without editing the template again, or record N/A | This plan records source repair, generated sync, PR readback, review, and check evidence without another template edit. |
| Helper/checker tests | no | No helper/checker scripts changed. | N/A. |
| Autoreview / review | yes | Run applicable review gate or record N/A for docs-only/source-rule-only repair | `.agents/skills/autoreview/scripts/autoreview --mode local --no-web-search` found incomplete-plan and future-checker-proof defects; both findings were accepted and fixed. Final rerun was clean. |
| Final lint | yes | Run scoped formatter/lint or record ignored-path/N/A reason | `bun lint:fix` passed with no fixes. |
| Goal plan complete | yes | Run `node .agents/rules/autogoal/scripts/check-complete.mjs docs/plans/2026-05-26-remove-self-pr-line-from-task-pr-bodies.md` | Passed after closure update. |

Phase / pass table:
| Phase | Status | Evidence | Next |
|-------|--------|----------|------|
| Intake | complete | Read request, skills, source rule/template, prior repair plan, and PR 272 body. | target selection |
| Target selection | complete | Selected task rule/template; not generic `autogoal`. | patch |
| Patch | complete | Source rule/template patched; generated skill synced through `bun install`. | verification |
| Verification | complete | Source audit and PR readback prove no current-PR self-link path remains; failed runtime check lane passed on rerun. | closeout |
| Closeout | complete | Plan closure, final autoreview, commit, push, and PR readback are the remaining final-response inputs. | final response |

Findings:
- The phrase "PR line when useful" was ambiguous enough to put a self-link in
  the PR description.
- The task template completion gate explicitly required a PR/tracker line, which
  made the wrong line look valid even when no issue/tracker target existed.

Decisions and tradeoffs:
- Keep the task-style body structure, but replace current-PR self-link language
  with issue/tracker/fix-line language.
- Patch the task rule and task template; generated skill is updated only through
  `bun install`.

Repair patch notes:
- `.agents/rules/task.mdc` now forbids current-PR self-links in PR bodies.
- `docs/plans/templates/task.md` now requires no current-PR self-link in the PR
  body gate and contract.

Deliberate non-repairs:
- No generic `autogoal` change; the miss is task PR-body specific.
- No git helper rewrite; task runs own their PR-body content after transport.

Error attempts:
| Error / failed attempt | Count | Next different move | Resolution |
|------------------------|-------|---------------------|------------|
| Autoreview found the new repair plan unfinished | 1 | Fill completion gates and rerun autoreview | Fixed in this plan closure. |
| Autoreview found future wording for the plan checker proof | 1 | Replace with the actual checker result | Fixed; checker passed after closure update. |
| `bun check` failed late in `test:runtime` on registry `ConnectionRefused` during scenario dependency install | 1 | Rerun the exact failed runtime lane | `bun run test:runtime` passed. |

Verification evidence:
- `bun install`
- `rg -n "current PR|current-PR|Issue, tracker|issue, tracker|Task-Style PR Body|Task-style PR body|PR line when useful|include PR/tracker line" .agents/rules/task.mdc .agents/skills/task/SKILL.md docs/plans/templates/task.md docs/plans/2026-05-26-remove-self-pr-line-from-task-pr-bodies.md`
- `gh pr view 272 --repo udecode/kitcn --json body -q '.body | contains("pull/272") or contains("PR #272") or contains("🔀 PR")'` returned `false`.
- `node .agents/rules/autogoal/scripts/check-complete.mjs docs/plans/2026-05-26-remove-self-pr-line-from-task-pr-bodies.md` failed before closure while required gates were still pending.
- `node .agents/rules/autogoal/scripts/check-complete.mjs docs/plans/2026-05-26-remove-self-pr-line-from-task-pr-bodies.md` passed after closure.
- `bun lint:fix`
- `.agents/skills/autoreview/scripts/autoreview --mode local --no-web-search` accepted findings: unfinished repair plan and future checker proof wording.
- `.agents/skills/autoreview/scripts/autoreview --mode local --no-web-search` final rerun was clean: no accepted/actionable findings.
- `bun check` ran; all earlier lanes and much of `test:runtime` passed, then temp scenario dependency install failed with registry `ConnectionRefused`.
- `bun run test:runtime` reran the failed lane and passed.
- Final closeout includes clean autoreview before commit.

Final repair handoff:
- Expectation: task PR bodies must not include a current-PR self-link.
- Repaired owner: task rule/template.
- Files changed: task rule, task template, generated task skill after sync,
  repair plans.
- Verification: source audit, generated sync, PR 272 body readback, lint,
  runtime lane rerun, plan checker, and autoreview closeout.
- Caveat: full `bun check` hit a transient registry `ConnectionRefused`; the
  exact failed `test:runtime` lane passed on rerun.

Timeline:
- 2026-05-26T13:01:50.347Z Goal repair plan created.

Reboot status:
| Question | Answer |
|----------|--------|
| Where am I? | Closeout |
| Where am I going? | Plan checker, final autoreview, commit, push, PR readback |
| What is the goal? | Remove current-PR self-links from task PR bodies. |
| What have I learned? | See Findings |
| What have I done? | Patched task rule/template, synced generated skill, updated PR 272 body, and reran the failed runtime lane. |

Open risks:
- Commit/push still needs to happen.
