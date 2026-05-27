# repair task pr body style

Objective:
Repair the task workflow PR-body style regression so future `task` runs use the
accepted PR #270 emoji format, and prove it by comparing the current source
against the April 2026 task rule and PR #270 body.

Goal plan:
docs/plans/2026-05-27-repair-task-pr-body-style.md

Template:
docs/plans/templates/goal-repair.md

Primary template:
docs/plans/templates/goal-repair.md

Applied packs:
- none

Expectation:
- user expectation: `task` PR bodies must look like PR #270, not the plain
  generic body used on PR #275.
- observed miss: current `task.mdc` and `docs/plans/templates/task.md` required
  task ownership of PR bodies but described a plain format, so the generated PR
  body could use `Fix:`, `Confidence:`, and `## Outcome` headings.
- owning skill/template/helper: `.agents/rules/task.mdc` and
  `docs/plans/templates/task.md`; generated `.agents/skills/task/SKILL.md`
  must be synced through `bun install`.
- repair classification: derived task rule plus task goal template repair.

Completion threshold:
- `.agents/rules/task.mdc` explicitly names PR #270 and the emoji task-style
  body markers.
- `docs/plans/templates/task.md` requires the same PR #270 format in the task
  PR body gate and contract.
- `.agents/skills/task/SKILL.md` is regenerated from the source rule.
- PR #275 body is corrected to the PR #270 emoji format and verified with
  `gh pr view`.
- Lint, source audits, generated sync audit, and `bun check` pass.
- `node .agents/rules/autogoal/scripts/check-complete.mjs docs/plans/2026-05-27-repair-task-pr-body-style.md`
  passes.

Verification surface:
- Source comparison: `gh pr view 270`, `git rev-list --before='2026-04-27
  23:59:59'`, `git show <april>:.agents/rules/task.mdc`, and current source
  reads.
- Source audit: `rg` for `PR #270`, `🐛 Fixes`, `🟢 95-100% confidence`, the
  `Phase | 🧪 Tests | 🌐 Browser` table, and bold emoji section headings across
  task rule, generated skill, and task template.
- Generated sync: diff of the `Task-Style PR Body` section between
  `.agents/rules/task.mdc` and `.agents/skills/task/SKILL.md`.
- PR proof: `gh pr view 275 --json body,url,headRefName,headRefOid`.
- Repo proof: `bun lint:fix` and `bun check`.

Constraints:
- Repair one expectation narrowly.
- Patch source-of-truth files, not generated skill mirrors by hand.
- Do not weaken evidence safety or completion gates.
- Do not broaden the repair to unrelated skills/templates.
- Preserve the auth sign-in work already in PR #275.

Boundaries:
- Source of truth: latest user correction, PR #270 body, April 2026
  `.agents/rules/task.mdc`, current task rule/template, and PR #275 body.
- Allowed edit scope: `.agents/rules/task.mdc`, generated
  `.agents/skills/task/SKILL.md` through sync, `docs/plans/templates/task.md`,
  this repair plan, and PR #275 body.
- Derived skill scope: `task`; `autogoal` only owns repair lifecycle.
- Non-goals: rewrite generic git PR helpers, change package runtime code,
  change unrelated templates, or alter the auth feature design.

Output budget strategy:
- Use focused file reads and `rg` audits only.
- Capture high-volume `bun check` output under ignored `tmp/verification`.

Blocked condition:
- Block only if PR #270 body, April task history, generated skill sync, PR #275
  body update, or `bun check` cannot be accessed/run after a real attempt. No
  blocker remained.

Repair state:
- repair_type: task PR body style contract
- current_phase: closeout
- current_phase_status: complete
- next_phase: final response
- goal_status: active until final goal completion.

Current verdict:
- verdict: regression repaired
- confidence: high
- next owner: reviewer
- reason: task rule/template now encode the concrete PR #270 body format, and
  PR #275 has been rewritten to that format.

Completion rule:
- Do not call `update_goal(status: complete)` until this plan passes
  `check-complete.mjs`, PR #275 body remains verified, and the branch is pushed.

Start Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| Expectation restated | yes | User said PR #270 is correct and current PR style is wrong. |
| Active goal checked | yes | `get_goal` returned no active goal; a repair goal was created. |
| Named plan or skill read | yes | Read `.agents/rules/task.mdc`, `docs/plans/templates/task.md`, and PR #270. |
| Owning source selected | yes | Source owner is `.agents/rules/task.mdc`; template owner is `docs/plans/templates/task.md`. |
| Repair classification selected | yes | Derived task rule/template repair. |
| Safety conflict checked | yes | No conflict: this strengthens body format proof and keeps existing evidence gates. |
| Output budget strategy recorded | yes | This plan records focused reads and ignored log capture. |

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

Completion Gates:
| Gate | Applies | Required action | Evidence |
|------|---------|-----------------|----------|
| Source owner patched | yes | Patch the selected source owner or record runtime-plan-only repair | `.agents/rules/task.mdc` now names PR #270 and exact emoji body markers. |
| Generated skill sync | yes | If `.agents/rules/**` changed, run `bun install` and verify generated `SKILL.md` sync | `bun install` ran; source/generated `Task-Style PR Body` section diff produced no output. |
| Template smoke | yes | Instantiate the repaired template or inspect it directly when a smoke plan would create noise | Direct template inspection shows PR #270 gate and contract in `docs/plans/templates/task.md`. |
| Incomplete-plan guard | N/A: checker behavior unchanged | Verify unfinished generated plan still fails or record N/A | No checker/script logic changed. |
| Completed-plan representability | yes | Verify repaired expectation can be recorded in a completed plan | This completed repair plan records the PR #270 expectation without template edits. |
| Helper/checker tests | N/A: no helper/checker changed | Run focused script tests or record N/A | No script changed. |
| Autoreview / review | N/A: source-rule-only repair with full source audit | Run applicable review gate or record N/A | Manual source audit plus `bun check`; no app code behavior changed. |
| Final lint | yes | Run scoped formatter/lint or record ignored-path/N/A reason | `bun lint:fix` passed. |
| Output budget discipline | yes | Verify no unbounded high-volume command output was streamed | `bun check` output captured to ignored log; chat only received final tail. |
| Goal plan complete | yes | Run `node .agents/rules/autogoal/scripts/check-complete.mjs docs/plans/2026-05-27-repair-task-pr-body-style.md` | `check-complete.mjs` passed. |

Phase / pass table:
| Phase | Status | Evidence | Next |
|-------|--------|----------|------|
| Intake | complete | Read user correction, PR #270, current task rule/template, and April task rule. | target selection |
| Target selection | complete | Selected task rule/template, not generic autogoal or git helper. | patch |
| Patch | complete | Patched `.agents/rules/task.mdc` and `docs/plans/templates/task.md`; synced generated task skill. | verification |
| Verification | complete | Source audit, generated sync diff, PR body audit, lint, and `bun check` passed. | closeout |
| Closeout | complete | PR #275 body corrected; plan ready for checker, commit, push, final response. | final response |

Findings:
- PR #270 uses the expected body: auto-release block, `🐛 Fixes ...`, `🟢
  95-100% confidence`, `Phase | 🧪 Tests | 🌐 Browser`, and bold emoji
  sections.
- Current task rule/template had regressed to describing the body generically,
  which allowed the wrong plain PR #275 style.
- April 2026 task history did not contain the newer concrete PR-body gate, so
  the repair needs to keep the modern gate but restore the accepted visual
  style from PR #270.

Decisions and tradeoffs:
- Patch `task`, not generic `autogoal`: this is a task-run PR-body contract, not
  a universal goal lifecycle rule.
- Keep `git-commit-push-pr` as transport only; `task` owns PR body content.
- Use PR #270 as the concrete source of truth instead of inventing another
  “cleaner” body format.

Repair patch notes:
- `.agents/rules/task.mdc` now bans plain `Fix:`, plain `Confidence:`,
  `## Outcome`, `## Verified`, and generic Summary/Verification bodies for
  task-run PRs.
- `docs/plans/templates/task.md` now requires the PR #270 body markers in the
  task-style PR body completion gate and contract.
- `.agents/skills/task/SKILL.md` was regenerated by `bun install`.
- PR #275 body was rewritten to the PR #270 emoji format.

Deliberate non-repairs:
- Did not edit generic git PR helpers; non-task PR workflows can stay adaptive.
- Did not change package runtime or auth implementation.
- Did not add checker/script enforcement; the source/template contract is now
  concrete enough and this repair is narrow.

Error attempts:
| Error / failed attempt | Count | Next different move | Resolution |
|------------------------|-------|---------------------|------------|
| None | 0 | N/A | N/A |

Verification evidence:
- `gh pr view 270 --json title,body,headRefName,baseRefName,url --jq ...`
  showed the accepted PR #270 body format.
- `git rev-list -n 1 --before='2026-04-27 23:59:59' HEAD -- .agents/rules/task.mdc`
  selected April commit `3a95ffbf86872dbd29dbe806c1a48a10189ce611`.
- `git show <april>:.agents/rules/task.mdc` was inspected for last-month task
  workflow shape.
- `rg -n 'PR #270|🐛 Fixes|🟢 95-100% confidence|Phase \| 🧪 Tests \| 🌐 Browser|✅ Outcome|⚠️ Caveat|🏗️ Design|🧪 Verified' .agents/rules/task.mdc .agents/skills/task/SKILL.md docs/plans/templates/task.md`
  found the repaired body markers in all owners.
- Source/generated `Task-Style PR Body` section diff produced no output.
- `bun install` passed.
- `bun lint:fix` passed.
- `bun check` exited 0; exit code recorded in
  `tmp/verification/bun-check-task-pr-style.exit`.
- `gh pr view 275 --json body,url,headRefName,headRefOid` verified PR #275 body
  uses the PR #270 emoji format.
- `node .agents/rules/autogoal/scripts/check-complete.mjs docs/plans/2026-05-27-repair-task-pr-body-style.md`
  passed.

Final repair handoff:
- Expectation: PR bodies created by `task` must use the accepted PR #270 emoji
  task-style format.
- Repaired owner: `.agents/rules/task.mdc` and `docs/plans/templates/task.md`;
  generated `.agents/skills/task/SKILL.md` synced.
- Files changed: task rule, generated task skill, task template, repair plan.
- Verification: source audit, generated sync diff, PR body audit, `bun
  lint:fix`, and `bun check`.
- Caveat: PR #275 now also includes this workflow repair because the wrong body
  was caught on that PR.

Timeline:
- 2026-05-27T09:20:08.824Z Goal repair plan created.
- Fetched PR #270 body and identified the expected emoji style.
- Compared current task rule/template with April 2026 task rule.
- Patched task source rule and task goal template.
- Ran `bun install` to sync generated task skill.
- Audited repaired body markers across source, generated skill, and template.
- Ran `bun lint:fix` and full `bun check`.
- Rewrote PR #275 body to PR #270 style and verified with `gh pr view`.

Reboot status:
| Question | Answer |
|----------|--------|
| Where am I? | Closeout |
| Where am I going? | Run plan checker, commit, push, mark goal complete |
| What is the goal? | Repair task PR-body style regression using PR #270 as source |
| What have I learned? | Yesterday’s repair fixed ownership but not the required visual format |
| What have I done? | Patched rule/template, synced generated skill, verified, and corrected PR #275 body |

Open risks:
- None.
