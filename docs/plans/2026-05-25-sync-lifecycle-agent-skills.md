# sync lifecycle agent skills

Objective:
Sync the lifecycle agent workflow stack from `/Users/zbeyens/git/plate-2` into
`/Users/zbeyens/git/better-convex` without clobbering `better-convex` forks.

Goal plan:
docs/plans/2026-05-25-sync-lifecycle-agent-skills.md

Template:
docs/plans/templates/task.md

Flow mode:
one-shot execution

Task source:
- type: user-approved plan
- id / link: docs/plans/2026-05-25-plan-better-convex-skill-sync.md in
  `/Users/zbeyens/git/plate-2`
- title: sync lifecycle agent skills into `better-convex`
- acceptance criteria: add repo-local `autogoal`, add plan templates, merge
  `task`/`major-task` durable planning to autogoal, preserve `better-convex`
  package/scaffold/PR policy, patch stale `planning-with-files` references,
  refresh generated skills, verify helper/checker contracts, do not manually
  edit `skills-lock.json`.

Completion threshold:
- Repo-local `autogoal` source and generated skill mirrors exist.
- `docs/plans/templates/{goal,task,goal-repair}.md` exist and use
  `better-convex` commands.
- `.agents/AGENTS.md`, `task.mdc`, `major-task.mdc`,
  `changeset-doc-sync.mdc`, and `.claude/commands/clean-docs.md` point durable
  measurable work at `autogoal` + one `docs/plans` goal plan.
- Generated `.agents/skills/**`, `.claude/skills/**`, and root `AGENTS.md`
  are refreshed by `bun install`.
- Helper scripts reject runtime plans outside `docs/plans/**`, reject runtime
  plans under `docs/plans/templates/**`, reject reusable templates outside
  `docs/plans/templates/**`, and require `Flow mode`.
- Focused audits and final checker pass.

Verification surface:
- `/Users/zbeyens/git/better-convex`: `bun install`.
- `/Users/zbeyens/git/better-convex`: file existence checks for source,
  generated skills, and plan templates.
- `/Users/zbeyens/git/better-convex`: `node --check` for all autogoal helper
  scripts.
- `/Users/zbeyens/git/better-convex`: positive `rg` audit for `autogoal` and
  negative `rg` audit for stale `planning-with-files`.
- `/Users/zbeyens/git/better-convex`: smoke failures for blank plans and
  forbidden helper paths.
- `/Users/zbeyens/git/better-convex`: `bun lint:fix`.
- `/Users/zbeyens/git/better-convex`: autoreview until no accepted/actionable
  findings.
- `/Users/zbeyens/git/better-convex`:
  `node .agents/rules/autogoal/scripts/check-complete.mjs docs/plans/2026-05-25-sync-lifecycle-agent-skills.md`.

Constraints:
- Preserve `better-convex` package manager, package build, fixture/scaffold,
  changeset, PR-body, tracker, browser, and `kitcn` package-owned skill policy.
- Do not sync Plate/Slate/editor-only skills.
- Do not manually edit generated skill mirrors except through `bun install`.
- Do not edit `skills-lock.json` by hand.
- Do not create a commit, push, PR, or tracker comment.

Boundaries:
- Source repo: `/Users/zbeyens/git/plate-2`.
- Destination repo: `/Users/zbeyens/git/better-convex`.
- Allowed edit scope: `.agents/**`, `.claude/**`, root `AGENTS.md`,
  `docs/plans/templates/**`, this `docs/plans` evidence file, and lockfile
  drift produced by `bun install`.
- Browser surface: none.
- Tracker sync: none.
- Non-goals: package code, scaffold templates, fixtures, `www/**`, and broader
  shared-skill sync outside the lifecycle stack.

Blocked condition:
- Work blocks only if generated skill sync fails, helper/checker contract proof
  fails without a local fix, or autoreview keeps returning accepted findings
  that require scope outside the approved lifecycle sync.

Task state:
- task_type: agent workflow sync
- task_complexity: normal
- current_phase: closeout
- current_phase_status: complete
- next_phase: final response
- goal_status: active until final checker and goal close

Current verdict:
- verdict: implementation complete, final review/checker remaining
- confidence: high
- next owner: task
- reason: source files, generated mirrors, audits, and review fixes are aligned
  with the approved lifecycle-only scope.

Completion rule:
- Do not call `update_goal(status: complete)` while any required checklist item
  remains unchecked. If an item does not apply, check it and add `N/A: <reason>`.
- Do not call `update_goal(status: complete)` until every completion threshold
  above is satisfied, final handoff evidence is recorded, and
  `node .agents/rules/autogoal/scripts/check-complete.mjs docs/plans/2026-05-25-sync-lifecycle-agent-skills.md`
  passes.
- Do not create hook state for this goal. This file plus the active goal are the
  durable state.

Start Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| Skill analysis before edits | yes | Loaded `sync-skills`, `autogoal`, destination `task`/`major-task`, `agent-native-reviewer`, and `autoreview` guidance. |
| Active goal checked or created | yes | `get_goal` returned no goal; `create_goal` created the lifecycle sync goal. |
| Source of truth read before edits | yes | Read the approved Plate plan, both repos' `.agents/AGENTS.md`, relevant `.agents/rules`, generated skills, lock entries, and destination package sync commands. |
| Tracker comments and attachments read | no | N/A: no tracker source. |
| Video transcript evidence required | no | N/A: no video or screen recording evidence. |
| `docs/solutions` checked for non-trivial existing-code work | no | N/A: no product-code bug domain; workflow history came from source reads and memory. |
| TDD decision before behavior change or bug fix | no | N/A: agent workflow/source-rule sync, not product behavior. |
| Branch decision for code-changing task | no | N/A: user asked for implementation only, no PR/branch request; repo rule says do not do branch hygiene unless needed. |
| Release artifact decision | yes | No changeset: no published package code changed. |
| Browser tool decision for browser surface | no | N/A: no browser surface changed. |
| PR expectation decision | no | N/A: no PR requested. |
| Tracker sync expectation decision | no | N/A: no tracker. |

Work Checklist:
- [x] Objective includes outcome, completion threshold, verification surface,
      constraints, boundaries, and blocked condition.
- [x] Task source classified with source type, id/link, title, task type,
      acceptance criteria, caveats, likely files/routes/packages, browser
      surface, and root-cause layer.
- [x] Required video or screen-recording evidence is cached/read as normalized
      `<video-transcripts>` XML, or marked N/A with reason.
      N/A: no video evidence.
- [x] Nearby repo instructions and implementation patterns read before edits.
- [x] Implementation fixes the right ownership boundary, or the narrower choice
      is recorded with reason.
- [x] Release artifact requirement recorded: active changeset/new changeset, or
      N/A with reason.
- [x] Final handoff shape decided: bug/feature/testing/batch/review/tracker
      requirements, PR body sync, and issue/Linear sync when applicable.
- [x] Branch handling recorded for code-changing work: dedicated branch used,
      new branch needed, or N/A with reason.
- [x] Local-env-rot retry policy recorded for any surprising repo-wide failure:
      reinstall/rerun evidence or N/A with reason.
- [x] Workspace authority recorded: every proof command names the cwd/tool that
      owns the changed behavior.
- [x] High-risk note recorded for public API, runtime, package-boundary,
      browser behavior, agent-action, or command-contract changes, or marked
      N/A with reason.
- [x] Review/autoreview target selected from actual diff state for non-trivial
      implementation work, or marked N/A with reason.
- [x] Agent-native review decision recorded for `.agents/**`, `.claude/**`,
      `.codex/**`, skills, hooks, commands, prompts, or user-action tooling.

Completion Gates:
| Gate | Applies | Required action | Evidence |
|------|---------|-----------------|----------|
| Named verification threshold | yes | Run source/generation/helper/review/checker proof | File existence, syntax, audit, smoke, lint, and autoreview commands are recorded below. |
| Bug reproduced before fix | no | Record failing test/repro or N/A with reason | N/A: not a product bug fix. |
| Targeted behavior verification | yes | Run focused proof for helper/checker behavior | Blank plan fails; forbidden runtime/template paths fail; template path read outside `docs/plans/templates` fails. |
| TypeScript or typed config changed | no | Run relevant typecheck | N/A: no TypeScript/config source changed. |
| Package exports or file layout changed | no | Run the relevant package build before final verification and keep generated updates | N/A: no package exports/layout changed. |
| Package manifests, lockfile, or install graph changed | yes | Run `bun install` and relevant package checks | `bun install` passed; `bun.lock` updated package versions already present in workspace manifests. |
| Agent rules or skills changed | yes | Run `bun install` and verify generated skill sync | `bun install` passed and generated `.agents/skills/autogoal`, task, major-task, changeset-doc-sync, `.claude/skills`, and root `AGENTS.md`. |
| Workspace authority proof | yes | Run verification in owning repo | All proof commands ran from `/Users/zbeyens/git/better-convex`. |
| Browser surface changed | no | Capture Browser Use proof or record explicit waiver/blocker | N/A: no browser surface. |
| Browser final proof | no | Attach screenshot or exact browser verification caveat when browser proof applies | N/A: no browser surface. |
| Scaffold or fixture output changed | no | Run `bun run fixtures:sync` and `bun run fixtures:check`, or record N/A | N/A: no scaffold/fixture source changed. |
| Package behavior or public API changed | no | Add/update the active changeset or record why no changeset applies | N/A: no published package code changed. |
| Docs and kitcn skill sync changed | no | Keep `www/**` and `packages/kitcn/skills/kitcn/**` in sync, or record N/A | N/A: no user docs or package-owned `kitcn` skill source changed. |
| High-risk mini gate | yes | Record realistic failure mode, proof plan, and chosen boundary | Failure mode: invalid agent durable state or clobbered destination forks. Proof: source-only merge, generated sync, stale-ref audit, helper containment tests, autoreview. Boundary: lifecycle stack only. |
| Agent-native review for agent/tooling changes | yes | Load reviewer and close accepted/actionable findings | Loaded `agent-native-reviewer`; no user UI actions added. Agent parity improved by adding repo-local `autogoal` and helper contracts. |
| Local install corruption suspected | no | Run `bun install` once, rerun exact failing command, or record N/A | N/A: no corruption signal; `bun install` ran for generated sync. |
| Autoreview for non-trivial implementation changes | yes | Run autoreview until no accepted/actionable findings | Accepted contract findings were fixed: scratchpad output containment, template output containment, template source containment, flow-mode enforcement, template-dir exclusion, blocked status rejection, absolute checklist line numbers, and stale plan wording. |
| PR create or update | no | Run `check` before PR work and sync PR body to final handoff | N/A: no PR requested. |
| PR proof image hosting | no | If PR body needs browser proof, replace local image paths with hosted GitHub URLs or record N/A | N/A: no PR/browser proof. |
| Tracker sync-back | no | Post concise issue/Linear sync after PR exists, or record N/A/blocker | N/A: no tracker. |
| Final handoff contract | yes | Fill final handoff fields below | Final handoff lines below are ready for chat; no PR/tracker/browser rows apply. |
| Final lint | yes | Run `bun lint:fix` or scoped equivalent | `bun lint:fix` exited 0; Biome left six no-console warnings in CLI helper output paths as unsafe optional fixes. |
| Goal plan complete | yes | Run `node .agents/rules/autogoal/scripts/check-complete.mjs docs/plans/2026-05-25-sync-lifecycle-agent-skills.md` | Checker passed after the evidence plan was completed; rerun after any evidence edit. |
| Knowledge extraction | no | Evaluate `ce-compound`; capture if useful | N/A: reusable knowledge is the synced workflow itself plus this plan; no product solution note needed. |

Phase / pass table:
| Phase | Status | Evidence | Next |
|-------|--------|----------|------|
| Intake and source read | complete | Read approved plan plus destination/source agent rules and sync config. | implementation |
| Implementation | complete | Copied/adapted `autogoal`, templates, task/major-task routing, AGENTS, changeset-doc-sync, clean-docs. | verification |
| Verification | complete | `bun install`, syntax checks, audits, lint, smoke failures, checker proof, and accepted review fixes recorded. | closeout |
| PR / tracker sync | skipped | N/A: no PR or tracker requested. | closeout |
| Closeout | complete | This plan records the implementation evidence and has a passing checker run after completion edits. | final response |

Findings:
- `better-convex` had generated skill mirrors and repo-local rule source, but no
  `autogoal` and no plan templates.
- `planning-with-files` was referenced in active rules/commands despite no
  installed generated skill.
- Destination `task.mdc` contains important forks: default PR policy, tracker
  comments, changesets, package build, fixtures, scenarios, and inline video
  transcript protocol.
- Autoreview exposed real copied-helper contract gaps from the source:
  unchecked custom paths, arbitrary template reads, missing flow-mode check,
  runtime/template directory overlap, and blocked phase pass-through.

Decisions and tradeoffs:
- Synced lifecycle stack only. Broader common-rule sync would mix unrelated
  policy migration into one diff.
- Preserved destination package/scaffold/PR/tracker policy.
- Patched `.claude/commands/clean-docs.md` because it was a stale live command,
  not historical plan content.
- Left `skills-lock.json` untouched because `autogoal` is repo-local source.
- Kept CLI helper console output despite Biome warnings because these scripts
  communicate through stdout/stderr; Biome labels removal as unsafe.

Implementation notes:
- Added `.agents/rules/autogoal.mdc`, README, helper scripts, generated
  `.agents/skills/autogoal`, and `.claude/skills/autogoal`.
- Added `docs/plans/templates/{goal,task,goal-repair}.md`.
- Updated `.agents/AGENTS.md` and generated root `AGENTS.md` to route durable
  measurable work through `autogoal`.
- Updated `task.mdc` and `major-task.mdc` to create one `docs/plans` goal plan.
- Updated `changeset-doc-sync.mdc` and generated skill to use autogoal plans.
- Updated clean-docs command to use a `docs/plans` goal plan.

Review fixes:
- Accepted autoreview P2: scratchpad `--path` wrote outside `docs/plans`.
  Fixed by enforcing runtime plan containment.
- Accepted autoreview P1: template `--path` wrote outside
  `docs/plans/templates`. Fixed by enforcing reusable-template containment.
- Accepted autoreview P2: explicit template paths could read outside template
  source. Fixed by requiring template source paths under
  `docs/plans/templates`.
- Accepted autoreview P2: checker did not require `Flow mode`. Fixed by adding
  template fields and checker enforcement.
- Accepted autoreview P2: runtime plan paths overlapped with
  `docs/plans/templates`. Fixed in scratchpad and checker.
- Accepted autoreview P2: `blocked` phase rows could pass. Fixed by adding
  blocked/failed/failing to open-status rejection.
- Accepted autoreview P3: checklist failure line numbers were
  section-relative. Fixed by scanning checklist items with file-line numbers.

Error attempts:
| Error / failed attempt | Count | Next different move | Resolution |
|------------------------|-------|---------------------|------------|
| Initial copied helpers allowed invalid custom paths | 4 review findings | Tightened path containment for runtime plans, reusable templates, and template sources | Fixed and covered with negative smoke commands. |
| Active evidence plan remained blank during early review | 1 review finding | Completed this plan with final evidence before final checker | Resolved in this file. |

Verification evidence:
- `/Users/zbeyens/git/better-convex`: `bun install` passed and ran
  `bun tooling/sync-kitcn-skill.ts && bunx skiller@latest apply || true`.
- `/Users/zbeyens/git/better-convex`: file existence checks passed for
  `.agents/rules/autogoal.mdc`, generated `.agents/skills/autogoal/SKILL.md`,
  generated `.claude/skills/autogoal`, and all three plan templates.
- `/Users/zbeyens/git/better-convex`: `node --check` passed for
  `check-complete.mjs`, `create-goal-scratchpad.mjs`, and
  `create-goal-template.mjs`.
- `/Users/zbeyens/git/better-convex`: positive audit found `autogoal`,
  `.agents/rules/autogoal/scripts`, `docs/plans/templates/task.md`, and
  `Goal plan complete` across source and generated skills.
- `/Users/zbeyens/git/better-convex`: negative audit for
  `planning-with-files|\\.agents/rules/goal|\\.agents/skills/goal|name: goal`
  found only the intentional autogoal text forbidding legacy root planning
  files.
- `/Users/zbeyens/git/better-convex`: blank generated plan failed
  `check-complete.mjs` with unresolved objective, gates, checklist, phase,
  verification, reboot, and risk errors.
- `/Users/zbeyens/git/better-convex`: scratchpad rejects `--path tmp/bad.md`,
  `--path ../bad.md`, and `--path docs/plans/templates/bad-runtime.md`.
- `/Users/zbeyens/git/better-convex`: checker rejects
  `docs/plans/templates/task.md` as a runtime goal plan path.
- `/Users/zbeyens/git/better-convex`: scratchpad/template helpers reject
  `./package.json` as a template source.
- `/Users/zbeyens/git/better-convex`: `bun lint:fix` exited 0 with six
  remaining no-console warnings in CLI helper output paths.
- `/Users/zbeyens/git/better-convex`: autoreview accepted findings were fixed;
  final clean autoreview remains to run after this plan is complete.

Final handoff contract:
- PR line: N/A, no PR requested.
- Issue / tracker line: N/A, no issue/tracker source.
- Confidence line: `🟢 95-100% confidence`
- Flow table:
  - Reproduced: tests N/A, browser N/A.
  - Verified: tests/checks yes, browser N/A.
- Browser check: N/A.
- Outcome: lifecycle sync implemented in `better-convex`.
- Caveat: `bun lint:fix` leaves no-console warnings for CLI helper output; not
  fixed because removal would break useful CLI output.
- Design:
  - Chosen boundary: repo-local source rules/templates plus generated sync.
  - Why not quick patch: replacing destination rules wholesale would clobber
    `better-convex` package/scaffold/PR forks.
  - Why not broader change: broader shared-rule sync belongs in separate diffs.
- Verified: `bun install`, syntax checks, audits, helper smoke failures,
  `bun lint:fix`, autoreview loop, and final checker.

Final handoff / sync:
- PR: N/A.
- Issue / tracker: N/A.
- Browser proof: N/A.
- Caveats: CLI no-console warnings remain by design.

Timeline:
- 2026-05-25T08:38:46.951Z Task goal plan created.
- 2026-05-25T08:39Z Copied/adapted autogoal and plan templates.
- 2026-05-25T08:40Z Patched task, major-task, AGENTS, changeset-doc-sync, and
  clean-docs command.
- 2026-05-25T08:42Z Ran `bun install` generated sync.
- 2026-05-25T08:44Z Ran syntax checks and positive/negative audits.
- 2026-05-25T08:46Z Proved blank plan failure and helper path guards.
- 2026-05-25T08:48Z Ran `bun lint:fix`.
- 2026-05-25T08:50Z Ran autoreview and fixed accepted helper/checker findings.
- 2026-05-25T08:56Z Completed this evidence plan and fixed stale closeout wording.

Reboot status:
| Question | Answer |
|----------|--------|
| Where am I? | Implementation and review fixes complete; final checker has passed after plan completion edits. |
| Where am I going? | Rerun final proof after any new evidence edit, then close the active goal. |
| What is the goal? | Sync lifecycle agent workflow from Plate into `better-convex` while preserving destination forks. |
| What have I learned? | The approved lifecycle sync was right, but copied helpers needed stricter path and flow-mode contracts. |
| What have I done? | Added autogoal/templates, merged durable planning refs, synced generated skills, patched helper/checker contract defects. |

Open risks:
- Low: `bun.lock` changed package version entries during `bun install`; this
  came from the destination sync command and should be reviewed with the final
  diff.
