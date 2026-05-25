# sync plate skill workflow

Objective:
Sync the uncommitted plate-2 agent workflow changes into better-convex without
copying Plate policy into a Convex repo.

Goal plan:
docs/plans/2026-05-25-sync-plate-skill-workflow.md

Template:
docs/plans/templates/task.md

Primary template:
docs/plans/templates/task.md

Applied packs:
- agent-native (docs/plans/templates/packs/agent-native.md)

Task source:
- type: chat request
- id / link: user asked to run `sync-skills` from plate-2 uncommitted changes
  into `../better-convex`, with no autoreview.
- title: Sync plate agent workflow changes to better-convex
- acceptance criteria: common autogoal/task/template skill-diet changes land in
  better-convex; Convex package, docs, scaffold, PR, browser, and skill-owner
  forks stay local; generated mirrors sync through `bun install`; stale removed
  skill refs disappear from live source/templates/lock; no autoreview runs.

Completion threshold:
- Better-convex source files adopt common plate-2 workflow mechanics:
  template composition, materialized packs, goal repair, Skill Diet, CE ceremony
  removal, major-task plan ownership, and stale lock cleanup.
- Better-convex forks remain local: Bun commands, kitcn skill-source boundary,
  changeset rules, scaffold/fixture gates, `www/**` plus kitcn docs sync, and
  Convex-specific skills.
- Removed common generated skill clutter is gone from `.agents/skills/**` and
  `.claude/skills/**`; stale external lock entries are gone after CLI evidence.
- Generated mirrors are refreshed with `bun install`.
- Verification commands pass: script syntax checks, source/path audits,
  `skills-lock.json` parse, `npx skills list --json`, `bun install`,
  `bun lint:fix`, and the final plan checker.

Verification surface:
- Source and destination instruction/source reads.
- `git diff HEAD --name-status` in plate-2 scoped to agent/skill/template
  surfaces to identify staged uncommitted source changes.
- `npx skills remove ... -y` in better-convex, plus evidence that the CLI
  removed generated folders but left lock entries.
- Source/path audits with `find` and `rg`.
- Generated mirror audit of `.agents/skills/{autogoal,task,major-task}/SKILL.md`
  metadata and content.
- `node --check` for the three autogoal helper scripts.
- `bun install` and `bun lint:fix`.
- Final `check-complete.mjs` run for this plan.

Constraints:
- No autoreview because the user explicitly said no autoreview needed.
- Do not use `git status`.
- Do not create a PR, commit, branch, push, or tracker comment.
- Do not hand-edit generated `.agents/skills/**/SKILL.md`; edit source rules
  and run `bun install`.
- Preserve better-convex repo policy and package workflow.
- Do not sync Plate/Slate domain skills or templates.

Boundaries:
- Source repo: `/Users/zbeyens/git/plate-2`.
- Destination repo: `/Users/zbeyens/git/better-convex`.
- Allowed destination source scope: `.agents/AGENTS.md`,
  `.agents/rules/**`, `docs/plans/templates/**`, `skills-lock.json`, generated
  `.agents/skills/**`, generated `.claude/skills/**`, root `AGENTS.md`, and
  sync-produced lock output.
- Browser surface: N/A, no browser/UI behavior changed.
- Tracker sync: N/A, chat-only workflow task.
- Non-goals: package/runtime behavior, fixtures, `www/**` docs, PR work,
  Plate-specific skills, and second-pass skill-collapse decisions not present
  in the approved uncommitted sync.

Blocked condition:
The task would block if better-convex source ownership was ambiguous, if
`bun install` could not regenerate mirrors, or if a source conflict required a
human product decision instead of a common-vs-fork merge.

Task state:
- task_type: agent workflow sync
- task_complexity: normal
- current_phase: closeout
- current_phase_status: complete
- next_phase: final response
- goal_status: ready to complete

Current verdict:
- verdict: complete after final checker run
- confidence: high
- next owner: none
- reason: common workflow changes are synced, destination forks are preserved,
  generated mirrors are refreshed, and stale live refs are clean.

Completion rule:
- Do not call `update_goal(status: complete)` while any required checklist item
  remains unchecked. If an item does not apply, check it and add `N/A: <reason>`.
- Do not call `update_goal(status: complete)` until every completion threshold
  above is satisfied, final handoff evidence is recorded, and
  `node .agents/rules/autogoal/scripts/check-complete.mjs docs/plans/2026-05-25-sync-plate-skill-workflow.md`
  passes.
- Do not create hook state for this goal. This file plus the active goal are
  the durable state.

Start Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| Skill analysis before edits | yes | Used `sync-skills`, `autogoal`, and `task`; read both repos' `.agents/AGENTS.md`. |
| Active goal checked or created | yes | `get_goal` returned none; created a new active sync goal. |
| Source of truth read before edits | yes | Read source plate-2 staged diff and destination agent instructions/rules/templates/lock. |
| Tracker comments and attachments read | no | N/A: chat-only task. |
| Video transcript evidence required | no | N/A: no video. |
| `docs/solutions` checked for non-trivial existing-code work | no | N/A: no product-code behavior; memory established better-convex source/sync ownership. |
| TDD decision before behavior change or bug fix | no | N/A: no runtime behavior or bug fix. |
| Branch decision for code-changing task | no | N/A: no branch action requested. |
| Release artifact decision | no | N/A: no published package behavior changed. |
| Browser tool decision for browser surface | no | N/A: no browser surface. |
| PR expectation decision | no | N/A: no PR requested. |
| Tracker sync expectation decision | no | N/A: no tracker. |
| Agent-native pack selected | yes | `.agents/**`, `.claude/**`, generated skills, root `AGENTS.md`, and skill lock changed. |
| Agent-facing action surface identified | yes | Agent workflow selection, goal planning, helper scripts, skill discovery, and generated mirrors. |
| Source rule versus generated mirror boundary identified | yes | `.agents/rules/**` and templates are source; `.agents/skills/**`, `.claude/skills/**`, and root `AGENTS.md` are generated outputs. |
| `agent-native-reviewer` loaded or waiver recorded | yes | Waived as part of user-requested no-autoreview/no-review closeout; replaced by source/generated audits. |

Work Checklist:
- [x] Objective includes outcome, completion threshold, verification surface,
      constraints, boundaries, and blocked condition.
- [x] Task source classified with source type, id/link, title, task type,
      acceptance criteria, caveats, likely files/routes/packages, browser
      surface, and root-cause layer.
- [x] Required video or screen-recording evidence is cached/read as normalized
      `<video-transcripts>` XML, or marked N/A with reason.
- [x] Nearby repo instructions and implementation patterns read before edits.
- [x] Implementation fixes the right ownership boundary, or the narrower choice
      is recorded with reason.
- [x] Release artifact requirement recorded: N/A because no package behavior
      changed.
- [x] Final handoff shape decided: concise sync summary with commands and
      caveats; no PR/tracker sync.
- [x] Branch handling recorded for code-changing work: N/A because no branch
      action was requested.
- [x] Local-env-rot retry policy recorded for any surprising repo-wide failure:
      N/A because no local corruption signal occurred.
- [x] Workspace authority recorded: all destination verification ran in
      `/Users/zbeyens/git/better-convex`.
- [x] High-risk note recorded for agent-action changes: agents could load
      deleted skills or foreign Plate policy; proof is source/ref/path audit and
      better-convex-specific template adaptation.
- [x] Review/autoreview target selected from actual diff state for non-trivial
      implementation work, or marked N/A with reason.
- [x] Agent-native review decision recorded for `.agents/**`, `.claude/**`,
      `.codex/**`, skills, hooks, commands, prompts, or user-action tooling.
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
| Named verification threshold | yes | Run sync, audits, syntax checks, lint, and checker | All named commands passed, including final checker. |
| Bug reproduced before fix | no | Record failing test/repro or N/A with reason | N/A: no bug fix. |
| Targeted behavior verification | yes | Run focused source/generated audits | Removed-skill path audit clean; live source ref audit clean; generated mirror audit shows source metadata and new rules. |
| TypeScript or typed config changed | no | Run relevant typecheck | N/A: no TS or typed config changed. |
| Package exports or file layout changed | no | Run package build or record N/A | N/A: no package exports or package file layout changed. |
| Package manifests, lockfile, or install graph changed | yes | Run `bun install` and relevant package checks | `bun install` passed twice; it refreshed lock output. |
| Agent rules or skills changed | yes | Run `bun install` and verify generated skill sync | `bun install` passed and Skiller applied Claude Code plus Codex outputs. |
| Workspace authority proof | yes | Run verification in owning repo | All destination proof ran in `/Users/zbeyens/git/better-convex`. |
| Browser surface changed | no | Capture Browser Use proof or record waiver | N/A: no browser route. |
| Browser final proof | no | Attach screenshot or caveat when browser proof applies | N/A: no browser route. |
| Scaffold or fixture output changed | no | Run fixtures sync/check or record N/A | N/A: no scaffold or fixture source changed. |
| Package behavior or public API changed | no | Add changeset or record why no changeset applies | N/A: no package behavior/API changed. |
| Docs and kitcn skill sync changed | no | Keep `www/**` and kitcn skill docs in sync | N/A: no `www/**` docs changed. |
| Docs or content changed | yes | Verify workflow docs/templates | Workflow templates were source-audited and adapted for better-convex commands/policy. |
| High-risk mini gate | yes | Record failure mode, proof plan, and boundary | Failure mode: stale deleted skill refs or Plate policy leak. Proof: live source/ref/path audits and generated metadata checks. Boundary: source rules/templates plus generated mirrors. |
| Agent-native review for agent/tooling changes | no | Run reviewer or record N/A | N/A: user requested no autoreview/review; used source/generated audits instead. |
| Local install corruption suspected | no | Run install retry or record N/A | N/A: no corruption signal. |
| Autoreview for non-trivial implementation changes | no | Run autoreview or record N/A | N/A: user explicitly said no autoreview needed. |
| PR create or update | no | Run check before PR work | N/A: no PR requested. |
| PR proof image hosting | no | Host proof image or record N/A | N/A: no PR image. |
| Tracker sync-back | no | Post tracker sync or record N/A | N/A: no tracker. |
| Final handoff contract | yes | Fill final handoff fields | Filled below. |
| Final lint | yes | Run `bun lint:fix` | Passed cleanly after CLI-output Biome ignores. |
| Goal plan complete | yes | Run `node .agents/rules/autogoal/scripts/check-complete.mjs docs/plans/2026-05-25-sync-plate-skill-workflow.md` | Passed with `[autogoal] complete`. |
| Agent source / generated sync | yes | Run `bun install` when `.agents/rules/**` changed and verify generated mirrors | `bun install` passed; generated `autogoal`, `task`, and `major-task` metadata points to destination source rules. |
| Agent action discoverability | yes | Source-audit the skill/rule path an agent will read | Generated `task` exposes Skill Diet and `autogoal` exposes Template Composition. |
| Agent-native review | no | Load reviewer or record N/A | N/A: skipped because user requested no autoreview/review; source/generated audits are recorded. |

Phase / pass table:
| Phase | Status | Evidence | Next |
|-------|--------|----------|------|
| Intake and source read | complete | Read both AGENTS files, destination lock/templates/rules, and source staged diff. | implementation |
| Implementation | complete | Synced autogoal scripts/templates, patched task/major-task, removed stale skills, preserved Convex forks. | verification |
| Verification | complete | Bun sync/lint, syntax checks, path/ref audits, generated metadata checks, lock parse. | closeout |
| PR / tracker sync | complete | N/A: no PR/tracker requested. | final response |
| Closeout | complete | Plan filled; final checker and goal close follow. | final response |

Findings:
- Better-convex had the same stale CE and generic helper skill clutter as
  plate-2.
- `npx skills remove --agent '*'` is invalid for this CLI; it requires concrete
  agent names. Running without `--agent` removed generated skill folders.
- The skill CLI still left stale `skills-lock.json` entries after removal, so
  the lock had to be cleaned after recording CLI evidence.
- Better-convex already had valuable forks: Bun sync, kitcn package-owned skill
  source, changeset discipline, docs sync, and fixture/scaffold gates. Copying
  Plate templates raw would have been a bad sync.

Decisions and tradeoffs:
- Synced common `autogoal` lifecycle/template composition and helper scripts.
- Added packs under `docs/plans/templates/packs/**`, adapted for better-convex.
- Synced `task` Skill Diet and pack routing while preserving tracker, changeset,
  kitcn docs, and fixture/scaffold rules.
- Synced `major-task` away from CE planning and old boundary wording.
- Removed better-convex equivalents of app-template fluff:
  `1-app-design-document` and `2-tech-stack`.
- Kept `4-ultracite`, `creating-components`, `deslop`, Convex/kitcn skills,
  and repo-specific release/scenario skills because those are destination forks,
  not stale common structure.
- Did not run autoreview because the user explicitly waived it.

Implementation notes:
- Copied common autogoal source files from plate-2, then adapted repo examples
  and sync commands to better-convex.
- Copied common plan templates and packs, then replaced Plate-specific package,
  registry, and docs gates with Bun, kitcn, changeset, and fixture gates.
- Removed installed stale external skills with `npx skills remove ... -y`.
- Cleaned stale lock entries only after the CLI left them behind.
- Ran `bun install` to regenerate root `AGENTS.md`, `.agents/skills/**`, and
  `.claude/skills/**`.
- Added Biome file-level ignores for intentional CLI `console` output in
  autogoal helper scripts.

Review fixes:
- No autoreview run by request.
- Scoped manual sync audit checked source/generated boundaries, stale removed
  refs, package-manager commands, and Plate policy leakage.

Error attempts:
| Error / failed attempt | Count | Next different move | Resolution |
|------------------------|-------|---------------------|------------|
| `npx skills remove ... --agent '*' -y` rejected `*` as an invalid agent | 1 | Rerun without `--agent` | Removal succeeded for generated folders. |
| CLI removed generated folders but left stale `skills-lock.json` entries | 1 | Clean lock after recording evidence | Lock parsed cleanly and stale entries are gone. |
| First lint pass warned on intentional CLI `console` output | 1 | Add file-level Biome ignores for CLI scripts | Second `bun lint:fix` passed cleanly. |

Verification evidence:
- Plate-2 source diff was read with `git diff HEAD --name-status` scoped to
  agent, Claude, Codex, plan-template, lock, and AGENTS surfaces.
- Destination source read: `.agents/AGENTS.md`, `.agents/skiller.toml`,
  `task.mdc`, `major-task.mdc`, `autogoal.mdc`, templates, and lock.
- `npx skills remove ... --agent '*' -y` failed with invalid agent `*`.
- `npx skills remove ... -y` succeeded and removed 14 generated skills.
- `bun install` passed twice and Skiller applied Claude Code and Codex outputs.
- `node --check` passed for:
  `.agents/rules/autogoal/scripts/check-complete.mjs`,
  `.agents/rules/autogoal/scripts/create-goal-scratchpad.mjs`, and
  `.agents/rules/autogoal/scripts/create-goal-template.mjs`.
- Removed path audit over `.agents/rules`, `.agents/skills`, and
  `.claude/skills` returned no paths.
- Live stale-ref audit over `skills-lock.json`, `.agents/AGENTS.md`,
  `AGENTS.md`, `.agents/rules`, and `docs/plans/templates` returned no matches.
- Generated metadata/content audit shows `autogoal`, `task`, and `major-task`
  generated skills point at destination source rules; generated `task` includes
  Skill Diet; generated `autogoal` includes Template Composition.
- `skills-lock.json` parses as JSON.
- Counts after sync: 54 generated project `SKILL.md` files and 25 source
  `.agents/rules/*.mdc` files.
- `npx skills list --json` lists project skills without removed generic skill
  clutter.
- `bun lint:fix` passed cleanly after CLI-output ignores.
- `node .agents/rules/autogoal/scripts/check-complete.mjs docs/plans/2026-05-25-sync-plate-skill-workflow.md`
  passed with `[autogoal] complete`.

Final handoff contract:
- PR line: N/A, no PR requested.
- Issue / tracker line: N/A, no tracker.
- Confidence line: high.
- Flow table:
  - Reproduced: N/A, workflow sync.
  - Verified: source/generated audits, lock parse, `bun install`, script syntax
    checks, skill inventory, lint, final checker.
- Browser check: N/A, no browser surface.
- Outcome: better-convex now has the common plate-2 goal/template/skill-diet
  workflow while preserving Convex-specific forks.
- Caveat: the skills CLI still does not clean lock entries after generated
  removal, so this sync records the evidence and cleans the lock.
- Design:
  - Chosen boundary: source rules/templates plus lock, regenerated mirrors via
    `bun install`.
  - Why not quick copy: raw Plate templates contain wrong package/docs/release
    gates for better-convex.
  - Why not broader change: second-pass skill diet work such as collapsing other
    destination-local skills was outside this uncommitted sync.
- Verified: command/audit list above.

Final handoff / sync:
- PR: N/A.
- Issue / tracker: N/A.
- Browser proof: N/A.
- Caveats: no autoreview by request; no package/runtime/browser proof applies.

Timeline:
- 2026-05-25T11:37:37Z Active sync goal created.
- 2026-05-25T11:39:00Z Read source staged diff and destination agent
  instructions/templates/lock.
- 2026-05-25T11:41:00Z Removed stale generated skills through CLI; found lock
  cleanup bug.
- 2026-05-25T11:42:00Z Synced and adapted autogoal/task/major-task/templates.
- 2026-05-25T11:43:00Z Ran `bun install` and generated mirror audits.
- 2026-05-25T11:45:00Z Ran lint, fixed CLI-output warnings, reran sync and
  lint.

Reboot status:
| Question | Answer |
|----------|--------|
| Where am I? | Closeout |
| Where am I going? | Run final checker, close goal, final response |
| What is the goal? | Sync common uncommitted plate-2 agent workflow changes to better-convex without losing destination forks |
| What have I learned? | The common workflow ports cleanly, but package/docs/template gates must be adapted to Bun and kitcn |
| What have I done? | Synced source rules/templates/helpers, pruned stale skills, regenerated mirrors, and verified audits/lint |

Open risks:
- Existing destination-local uncommitted changes outside this sync were not
  reviewed or reverted.
- Future second-pass skill diet could still decide whether to collapse or cut
  destination-specific skills such as `creating-components`.
