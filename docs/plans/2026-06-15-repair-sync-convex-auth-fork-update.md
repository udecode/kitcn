# repair sync convex auth fork update

Objective:
Repair `sync-convex-auth` so future runs sync `zbeyens/convex-better-auth`
itself before KitCN delegation.

Goal plan:
docs/plans/2026-06-15-repair-sync-convex-auth-fork-update.md

Template:
docs/plans/templates/goal-repair.md

Primary template:
docs/plans/templates/goal-repair.md

Applied packs:
- none

Expectation:
- user expectation: `sync-convex-auth` includes syncing
  `zbeyens/convex-better-auth`, not only auditing it for KitCN work.
- observed miss: `.agents/skills/sync-convex-auth/SKILL.md` compared the fork
  with upstream and delegated KitCN work, but did not require fast-forwarding or
  PR'ing the fork update.
- owning skill/template/helper: `.agents/rules/sync-convex-auth.mdc` and
  `docs/plans/templates/sync-convex-auth.md`.
- repair classification: derived skill rule plus project template repair.

Completion threshold:
- Future `sync-convex-auth` runs must snapshot the pre-sync compare range, sync
  `zbeyens/convex-better-auth` by safe fast-forward push or fork PR, record the
  post-sync ref/PR, and stop instead of force-pushing if the fork diverged.
- Repair closure is legal only when the source owner is patched, generated
  skills are synced when `.agents/rules/**` changed, a source audit proves the
  repair text exists, the repaired template or rule is smoke-checked, deliberate
  non-repairs are recorded, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-06-15-repair-sync-convex-auth-fork-update.md` passes.

Verification surface:
- Source audit across `.agents/rules/sync-convex-auth.mdc`,
  `.agents/skills/sync-convex-auth/SKILL.md`, and
  `docs/plans/templates/sync-convex-auth.md`.
- `bun install` generated skill sync.
- `cd packages/kitcn && ./node_modules/.bin/intent validate skills`.
- `bun run intent:stale`.
- `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/templates/sync-convex-auth.md`
  proves unfinished generated sync plans still fail.
- `bun lint:fix`.

Constraints:
- Repair one expectation narrowly.
- Patch source-of-truth files, not generated skill mirrors.
- Do not weaken evidence safety or completion gates just to reduce annoyance.
- Do not broaden the repair to unrelated skills/templates.

Boundaries:
- Source of truth: latest user request to repair `sync-convex-auth` so it also
  syncs `zbeyens/convex-better-auth`.
- Allowed edit scope: `.agents/rules/sync-convex-auth.mdc`,
  `docs/plans/templates/sync-convex-auth.md`, generated skill mirror from
  `bun install`, and this repair plan.
- Derived skill scope: lane-specific fork-sync behavior only.
- Non-goals: running the full sync workflow again, syncing the fork in this
  repair turn, changing generic `autogoal`, or touching package runtime code.

Output budget strategy:
- Use exact file reads and focused `rg` patterns for `sync-convex-auth`,
  `Fork sync`, `fast-forward`, `pre-sync`, and stale `origin/upstream` wording.

Blocked condition:
- Blocked only if source ownership cannot be identified, generated skill sync
  fails, or validation exposes a required broader rewrite.

Repair state:
- repair_type: derived skill and template repair
- current_phase: closeout
- current_phase_status: complete
- next_phase: final response
- goal_status: active

Current verdict:
- verdict: repaired
- confidence: high
- next owner: reviewer
- reason: source rule, generated skill, and sync template now require fork sync.

Completion rule:
- Do not call `update_goal(status: complete)` while any required checklist item
  remains unchecked. If an item does not apply, check it and add `N/A: <reason>`.
- Do not call `update_goal(status: complete)` until every completion threshold
  above is satisfied, final repair evidence is recorded, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-06-15-repair-sync-convex-auth-fork-update.md` passes.
- Do not create hook state for this repair. This file plus the active goal are
  the durable state.

Start Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| Expectation restated | yes | User asked whether the skill includes syncing `zbeyens/convex-better-auth`; repair target is making that mandatory. |
| Active goal checked | yes | `get_goal` returned no active goal before creating this repair goal. |
| Named plan or skill read | yes | Read `.agents/skills/sync-convex-auth/SKILL.md`, `.agents/rules/sync-convex-auth.mdc`, and `docs/plans/templates/sync-convex-auth.md`. |
| Owning source selected | yes | Source owner is `.agents/rules/sync-convex-auth.mdc`; template owner is `docs/plans/templates/sync-convex-auth.md`. |
| Repair classification selected | yes | Derived skill rule plus template repair. |
| Safety conflict checked | yes | Repair explicitly forbids force-pushing diverged fork history. |
| Output budget strategy recorded | yes | Exact file reads and focused `rg`; no broad repo scans. |

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
| Source owner patched | yes | Patch the selected source owner or record runtime-plan-only repair | `.agents/rules/sync-convex-auth.mdc` patched with required fork-sync phase. |
| Generated skill sync | yes | If `.agents/rules/**` changed, run `bun install` and verify generated `SKILL.md` sync | `bun install` exited 0; generated `.agents/skills/sync-convex-auth/SKILL.md` contains `## 2. Sync The Fork`. |
| Template smoke | yes | Instantiate the repaired template or inspect it directly when a smoke plan would create noise | Direct template inspection shows fork-sync threshold, checklist rows, completion gates, and phase row. |
| Incomplete-plan guard | yes | Verify an unfinished generated plan still fails `check-complete.mjs`, or record N/A with reason | `check-complete.mjs docs/plans/templates/sync-convex-auth.md` failed as expected with unresolved fork-sync gates and other pending rows. |
| Completed-plan representability | yes | Verify the repaired expectation can be recorded in a completed plan without editing the template again, or record N/A | Template now has `Fork sync status`, `Post-sync fork ref or PR`, `Fork sync`, and `Post-sync fork proof` fields/gates. |
| Helper/checker tests | no | If scripts changed, run focused script tests; otherwise N/A | N/A: no helper/checker scripts changed. |
| Autoreview / review | yes | Run applicable review gate or record N/A for docs-only/source-rule-only repair | Agent-native review completed: no parity gap; source/generator boundary is explicit and generated skill mirrors source. |
| Final lint | yes | Run scoped formatter/lint or record ignored-path/N/A reason | `bun lint:fix` exited 0, no fixes applied. |
| Output budget discipline | yes | Verify no unbounded high-volume command output was streamed, or record the accidental output and recovery | Used exact reads and focused `rg`; no unbounded high-volume output. |
| Goal plan complete | yes | Run `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-06-15-repair-sync-convex-auth-fork-update.md` | First run reported only this final gate and Closeout status as incomplete; rerun after recording this row is the final mechanical gate. |

Phase / pass table:
| Phase | Status | Evidence | Next |
|-------|--------|----------|------|
| Intake | complete | skill and template miss identified | target selection |
| Target selection | complete | source rule plus sync template selected | patch |
| Patch | complete | source rule and template patched; generated skill synced | verification |
| Verification | complete | source audits, intent stale, local intent validate, incomplete template guard, lint | closeout |
| Closeout | complete | first `check-complete` found only final gate/status bookkeeping; final rerun next | final response |

Findings:
- Generated skill previously audited `zbeyens/convex-better-auth` but only
  produced KitCN work; it did not require updating the fork itself.
- `origin` could be upstream in a local clone, so the repaired rule tells future
  runs to identify fork/upstream remotes by URL.

Decisions and tradeoffs:
- Required fork sync happens after recording the pre-sync compare range; this
  preserves the KitCN audit range while still updating the fork.
- Fast-forward push is allowed when safe. Direct push failure falls back to a
  fork PR. Divergence stops for user input. No force push.

Repair patch notes:
- `.agents/rules/sync-convex-auth.mdc`: added mandatory `Sync The Fork` phase,
  remote-name caution, fast-forward push commands, fork PR fallback, divergence
  blocker, and fork sync handoff fields.
- `docs/plans/templates/sync-convex-auth.md`: added fork-sync threshold,
  verification surface, constraints, checklist rows, completion gates, phase
  row, and final handoff row.
- `.agents/skills/sync-convex-auth/SKILL.md`: regenerated by `bun install`.

Deliberate non-repairs:
- Did not edit `.agents/skills/sync-convex-auth/SKILL.md` by hand.
- Did not run the full `sync-convex-auth` workflow again or mutate
  `zbeyens/convex-better-auth` during this repair.
- Did not repair generic `autogoal`; this is lane-specific.

Error attempts:
| Error / failed attempt | Count | Next different move | Resolution |
|------------------------|-------|---------------------|------------|
| `bunx intent validate skills` failed because npm package `intent` has no executable for Bun to run | 1 | Use local package binary under `packages/kitcn/node_modules/.bin/intent` | `cd packages/kitcn && ./node_modules/.bin/intent validate skills` passed. |

Verification evidence:
- `bun install` exited 0 and regenerated `.agents/skills/sync-convex-auth/SKILL.md`.
- `rg -n "Sync The Fork|Fork sync|fast-forward|Never force push|pre-sync" .agents/skills/sync-convex-auth/SKILL.md .agents/rules/sync-convex-auth.mdc docs/plans/templates/sync-convex-auth.md` found the required rule, generated skill, and template entries.
- `rg -n "origin/<|upstream/<|origin/upstream|fetch origin|Setup refs \\|.*upstream diff" ...` found no stale remote assumptions.
- `cd packages/kitcn && ./node_modules/.bin/intent validate skills` passed.
- `bun run intent:stale` passed: dotenv and kitcn skills up-to-date.
- `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/templates/sync-convex-auth.md` failed as expected for unfinished template rows, including fork-sync gates.
- `bun lint:fix` passed with no fixes applied.
- `bun check` exited 0.

Final repair handoff:
- Expectation: future `sync-convex-auth` runs sync
  `zbeyens/convex-better-auth` itself.
- Repaired owner: `.agents/rules/sync-convex-auth.mdc` and
  `docs/plans/templates/sync-convex-auth.md`.
- Files changed: source rule, generated skill mirror, sync template, repair plan.
- Verification: `bun install`, local `intent validate skills`, `intent:stale`,
  focused source audits, unfinished-template guard, `bun lint:fix`, and
  `bun check`.
- Caveat: root `bunx intent validate skills` is currently broken; local package
  intent binary passed.

Timeline:
- 2026-06-15T16:02:06.480Z Goal repair plan created.
- 2026-06-15T16:07Z Source rule, template, generated skill, and validation
  proof recorded.
- 2026-06-15T16:19Z `bun check` exited 0.

Reboot status:
| Question | Answer |
|----------|--------|
| Where am I? | Closeout |
| Where am I going? | Run final `check-complete`, then commit/PR if required by task workflow |
| What is the goal? | Repair `sync-convex-auth` so future runs sync the fork itself before KitCN delegation. |
| What have I learned? | See Findings |
| What have I done? | See Timeline |

Open risks:
- Root `bunx intent validate skills` is broken in this checkout, but the local
  package intent binary passed the same validation.
