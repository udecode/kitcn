# repair lifecycle structure sync

Objective:
Repair the `plate-2 -> better-convex` lifecycle skill sync after the first pass was too conservative. Common high-level structure from Plate must replace stale destination structure, while only true `better-convex` forks stay.

Goal plan:
docs/plans/2026-05-25-repair-lifecycle-structure-sync.md

Template:
docs/plans/templates/task.md

Flow mode:
one-shot execution

Task source:
- type: user correction
- id / link: local sync against `../plate-2`
- title: delete stale common structure, keep forked details only
- acceptance criteria: `.agents/AGENTS.md` and `.agents/rules/task.mdc` in `/Users/zbeyens/git/better-convex` match Plate's common lifecycle structure, remove old Prompt Hook and planning ritual blocks, preserve `better-convex` package/scaffold/PR/tracker/docs/worktree-env forks, refresh generated mirrors, and pass focused audits.

Completion threshold:
- `.agents/AGENTS.md` and generated root `AGENTS.md` have the lean Plate-shaped lifecycle structure.
- `.agents/rules/task.mdc` and generated `.agents/skills/task/SKILL.md` remove stale common task scaffolding.
- `better-convex` fork rules remain for package work, scaffold fixtures, PR before tracker comments, QA-facing tracker comments, docs and kitcn skill sync, browser-use proof, changesets, local env rot, and worktree env copying.
- `bun install`, `bun lint:fix`, stale-reference audit, positive fork audit, helper syntax checks, autoreview, and this checker pass.
- `node .agents/rules/autogoal/scripts/check-complete.mjs docs/plans/2026-05-25-repair-lifecycle-structure-sync.md` passes.

Verification surface:
- `bun install`
- `bun lint:fix`
- `rg -n "Prompt Hook|Mandatory First Response|Skill Analysis Checklist|VERIFICATION REQUIRED|CONTEXT WIPED|planning-with-files|task_plan\.md|findings\.md|progress\.md" AGENTS.md .agents/AGENTS.md .agents/rules/task.mdc .agents/skills/task/SKILL.md .claude/skills/task/SKILL.md .agents/rules/changeset-doc-sync.mdc .agents/skills/changeset-doc-sync/SKILL.md .claude/commands/clean-docs.md`
- `rg -n "Worktree env|example/convex/.env|autogoal|Goal plans|bundle size|fixtures:sync|packages/kitcn build|video-transcripts|PR before tracker|changeset|browser-use" AGENTS.md .agents/AGENTS.md .agents/rules/task.mdc .agents/skills/task/SKILL.md`
- `node --check .agents/rules/autogoal/scripts/check-complete.mjs`
- `node --check .agents/rules/autogoal/scripts/create-goal-scratchpad.mjs`
- `node --check .agents/rules/autogoal/scripts/create-goal-template.mjs`
- `.agents/skills/autoreview/scripts/autoreview --mode local --prompt "..."`

Constraints:
- Preserve destination-specific domain rules.
- Delete stale common structure instead of merging it forever.
- Do not manually edit generated skill mirrors as source.
- Do not create PRs, commits, pushes, tracker comments, or fixture output for this local sync task.

Boundaries:
- Source of truth: `../plate-2/.agents/AGENTS.md`, `../plate-2/.agents/rules/task.mdc`, and `better-convex` fork rules already present in `.agents/AGENTS.md` / `.agents/rules/task.mdc`.
- Allowed edit scope: `better-convex` agent/rule generated mirrors, autogoal helper source, goal templates, and this evidence plan.
- Browser surface: N/A: no runtime UI changed.
- Tracker sync: N/A: no issue or Linear task was provided.
- Non-goals: package runtime changes, fixture regeneration, PR creation, `skills-lock.json` manual edits.

Blocked condition:
Only blocked if Plate source rules or `better-convex` fork intent cannot be read locally, or if the generated Skiller sync fails in a way that changes the source-of-truth contract.

Task state:
- task_type: agent lifecycle sync
- task_complexity: medium
- current_phase: closeout
- current_phase_status: complete
- next_phase: final response
- goal_status: ready to close

Current verdict:
- verdict: complete
- confidence: high
- next owner: user
- reason: stale common structure is removed from active files, forked `better-convex` details are retained, generated mirrors are refreshed, review is clean.

Completion rule:
- `update_goal(status: complete)` is allowed only after this file passes the autogoal checker.

Start Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| Skill analysis before edits | yes | Used `sync-skills` and `autogoal`; loaded `autoreview` and `agent-native-reviewer` for closeout. |
| Active goal checked or created | yes | Active goal created for repair lifecycle structure sync. |
| Source of truth read before edits | yes | Compared against `../plate-2/.agents/AGENTS.md` and `../plate-2/.agents/rules/task.mdc`; inspected current `better-convex` files. |
| Tracker comments and attachments read | no | N/A: user correction came from chat, no tracker item. |
| Video transcript evidence required | no | N/A: no video or screen recording evidence. |
| `docs/solutions` checked for non-trivial existing-code work | no | N/A: agent-rule sync, not package implementation behavior. |
| TDD decision before behavior change or bug fix | no | N/A: no runtime behavior or package code. |
| Branch decision for code-changing task | yes | Stayed in current checkout; no commit or PR requested. |
| Release artifact decision | yes | N/A: no published package behavior changed. |
| Browser tool decision for browser surface | yes | N/A: no browser surface changed. |
| PR expectation decision | yes | No PR requested for this correction. |
| Tracker sync expectation decision | yes | N/A: no tracker source. |

Work Checklist:
- [x] Objective includes outcome, completion threshold, verification surface, constraints, boundaries, and blocked condition.
- [x] Task source classified with source type, id/link, title, task type, acceptance criteria, caveats, likely files/routes/packages, browser surface, and root-cause layer.
- [x] Required video or screen-recording evidence is cached/read as normalized `<video-transcripts>` XML, or marked N/A with reason.
- [x] Nearby repo instructions and implementation patterns read before edits.
- [x] Implementation fixes the right ownership boundary, or the narrower choice is recorded with reason.
- [x] Release artifact requirement recorded: active changeset/new changeset, or N/A with reason.
- [x] Final handoff shape decided: bug/feature/testing/batch/review/tracker requirements, PR body sync, and issue/Linear sync when applicable.
- [x] Branch handling recorded for code-changing work: dedicated branch used, new branch needed, or N/A with reason.
- [x] Local-env-rot retry policy recorded for any surprising repo-wide failure: reinstall/rerun evidence or N/A with reason.
- [x] Workspace authority recorded: every proof command names the cwd/tool that owns the changed behavior.
- [x] High-risk note recorded for public API, runtime, package-boundary, browser behavior, agent-action, or command-contract changes, or marked N/A with reason.
- [x] Review/autoreview target selected from actual diff state for non-trivial implementation work, or marked N/A with reason.
- [x] Agent-native review decision recorded for `.agents/**`, `.claude/**`, `.codex/**`, skills, hooks, commands, prompts, or user-action tooling.

Completion Gates:
| Gate | Applies | Required action | Evidence |
|------|---------|-----------------|----------|
| Named verification threshold | yes | Run source audits, generated sync, lint, syntax checks, review, and goal checker. | Evidence recorded below. |
| Bug reproduced before fix | no | Record N/A. | N/A: workflow sync correction, not runtime bug. |
| Targeted behavior verification | yes | Audit active rule files for removed stale structure and preserved fork details. | Negative stale audit had no matches; positive fork audit found required terms. |
| TypeScript or typed config changed | no | Record N/A. | N/A: no TypeScript or typed config. |
| Package exports or file layout changed | no | Record N/A. | N/A: no package file layout change. |
| Package manifests, lockfile, or install graph changed | yes | Run `bun install`. | `bun install` refreshed Skiller output and saved lockfile with no dependency changes. |
| Agent rules or skills changed | yes | Run `bun install` and verify generated skill sync. | `bun install` applied Claude Code and Codex rules; root `AGENTS.md` and generated task skill reflect source. |
| Workspace authority proof | yes | Run checks in `/Users/zbeyens/git/better-convex`. | Every command in Verification evidence ran from `better-convex`. |
| Browser surface changed | no | Record N/A. | N/A: no UI or browser route changed. |
| Browser final proof | no | Record N/A. | N/A: no browser surface. |
| Scaffold or fixture output changed | no | Record N/A. | N/A: no scaffold source or fixture output changed. |
| Package behavior or public API changed | no | Record N/A. | N/A: agent workflow docs/scripts only. |
| Docs and kitcn skill sync changed | no | Record N/A. | N/A: no `www/**` or `packages/kitcn/skills/kitcn/**` edit. |
| High-risk mini gate | yes | Record realistic failure mode and proof plan. | Failure mode: deleting repo fork rules. Proof: autoreview caught worktree env deletion; rule restored; rerun review clean. |
| Agent-native review for agent/tooling changes | yes | Load `agent-native-reviewer` and close actionable findings. | Loaded skill; command/tooling action remains available via scripts and generated skill docs; autoreview found no remaining agent-tooling defects. |
| Local install corruption suspected | no | Record N/A. | N/A: no corruption signal. |
| Autoreview for non-trivial implementation changes | yes | Run local autoreview until clean. | First run found dropped worktree env rule; fixed; second run clean. |
| PR create or update | no | Record N/A. | N/A: no PR requested. |
| PR proof image hosting | no | Record N/A. | N/A: no PR or image proof. |
| Tracker sync-back | no | Record N/A. | N/A: no tracker item. |
| Final handoff contract | yes | Fill final handoff fields. | Filled below. |
| Final lint | yes | Run `bun lint:fix`. | Passed, no fixes applied. |
| Goal plan complete | yes | Run `node .agents/rules/autogoal/scripts/check-complete.mjs docs/plans/2026-05-25-repair-lifecycle-structure-sync.md`. | To run after this update. |
| Knowledge extraction | no | Record N/A. | N/A: no reusable product/code pattern beyond this plan. |

Phase / pass table:
| Phase | Status | Evidence | Next |
|-------|--------|----------|------|
| Intake and source read | complete | Read Plate and better-convex source rules. | implementation |
| Implementation | complete | Replaced stale structure and restored worktree env fork. | verification |
| Verification | complete | Sync, lint, audits, syntax checks, review. | closeout |
| PR / tracker sync | skipped | N/A: no PR or tracker requested. | final response |
| Closeout | complete | This plan and checker. | final response |

Findings:
- Old `better-convex` `AGENTS.md` kept a giant Prompt Hook block that was common lifecycle scaffolding, not a destination fork.
- Old `task.mdc` kept verbose common task rituals: planning-file refs, final-handoff ceremony, huge video cache protocol, and PR/tracker prose that Plate already replaced with a leaner structure.
- True destination forks are package/scaffold/tracker/docs/worktree-env rules. Those stay.
- Autoreview caught one over-delete: the nested worktree env copy rule. Restored it as a concise `**/.env` / `**/.env.local` rule.

Decisions and tradeoffs:
- Deleted stale common structure instead of carrying it as destination flavor.
- Kept concise `better-convex` forks only where they affect real workflows: packages, fixtures, PR/tracker order, QA-facing comments, kitcn docs sync, browser-use, local env rot, and worktree env files.
- Did not touch `skills-lock.json`; skill add/remove remains owned by `npx skills`.
- Did not run package builds or fixture sync because no package/scaffold behavior changed.

Implementation notes:
- `.agents/AGENTS.md` is lean and generated into root `AGENTS.md`.
- `.agents/rules/task.mdc` is Plate-shaped and generated into `.agents/skills/task/SKILL.md`.
- Autogoal helper scripts use `process.stdout.write` for CLI output to satisfy repo lint.

Review fixes:
- Accepted autoreview P2: dropped worktree env-copy fork.
- Fix: added concise `Worktree env` rule to `.agents/AGENTS.md`, then ran `bun install` and reran review.

Error attempts:
| Error / failed attempt | Count | Next different move | Resolution |
|------------------------|-------|---------------------|------------|
| First sync kept too much old common structure | 1 | Replace common structure from Plate, preserve only forks | Fixed. |
| Autoreview found dropped worktree env rule | 1 | Restore as concise generalized fork | Fixed and clean on rerun. |

Verification evidence:
- `bun install` passed and ran `bun tooling/sync-kitcn-skill.ts && bunx skiller@latest apply || true`; Skiller applied for Claude Code and Codex.
- `bun lint:fix` passed: `Checked 856 files ... No fixes applied.`
- Stale-reference audit over active files returned no matches for Prompt Hook, old planning file refs, or context wipe markers.
- Positive fork audit found `Worktree env`, `example/convex/.env`, `autogoal`, `Goal plans`, bundle size, `fixtures:sync`, `packages/kitcn build`, `video-transcripts`, PR before tracker, changeset, and browser-use in source/generated files.
- `node --check .agents/rules/autogoal/scripts/check-complete.mjs` passed.
- `node --check .agents/rules/autogoal/scripts/create-goal-scratchpad.mjs` passed.
- `node --check .agents/rules/autogoal/scripts/create-goal-template.mjs` passed.
- Autoreview first run found dropped worktree env rule; rerun after fix: `autoreview clean: no accepted/actionable findings reported`.

Final handoff contract:
- PR line: N/A: no PR requested.
- Issue / tracker line: N/A: no tracker source.
- Confidence line: high; review clean after accepted fix.
- Flow table:
  - Reproduced: source diff and stale-reference audit.
  - Verified: `bun install`, `bun lint:fix`, source audits, syntax checks, autoreview.
- Browser check: N/A: no browser surface.
- Outcome: stale common structure deleted; forked `better-convex` details preserved.
- Caveat: package/scaffold runtime gates were not run because no package/scaffold runtime changed.
- Design:
  - Chosen boundary: source rules and generated mirrors.
  - Why not quick patch: the issue was common lifecycle drift, not one missing line.
  - Why not broader change: package/runtime behavior and fixtures were out of scope.
- Verified: yes.

Final handoff / sync:
- PR: N/A.
- Issue / tracker: N/A.
- Browser proof: N/A.
- Caveats: no runtime package proof needed.

Timeline:
- 2026-05-25T09:03:35.325Z Task goal plan created.
- 2026-05-25: Replaced stale `AGENTS.md` and `task.mdc` structure with Plate-shaped common lifecycle structure.
- 2026-05-25: Ran `bun install` to refresh generated mirrors.
- 2026-05-25: Ran lint, stale audits, positive fork audit, helper syntax checks.
- 2026-05-25: Accepted autoreview finding for worktree env fork, restored rule, reran sync/lint/audits/review.

Reboot status:
| Question | Answer |
|----------|--------|
| Where am I? | Closeout |
| Where am I going? | Final response after autogoal checker |
| What is the goal? | Delete stale common lifecycle structure while preserving true `better-convex` forks |
| What have I learned? | Prompt Hook/task ritual were stale common structure; worktree env is a real destination fork |
| What have I done? | Rewrote source rules, refreshed generated files, restored over-deleted fork, verified |

Open risks:
- Low: future sync still depends on human judgment to classify forked repo details versus common lifecycle structure. The new `sync-skills` skill should make that explicit.
