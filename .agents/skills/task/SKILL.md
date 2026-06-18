---
description: Work a task end-to-end with lean context gathering, implementation, and verification
argument-hint: '[task description | issue id/link]'
disable-model-invocation: true
name: task
metadata:
  skiller:
    source: .agents/rules/task.mdc
---

# Work Task

Handle $ARGUMENTS. Start from the source of truth, load extra skills only when
they earn their keep, and verify before calling the task done.

<task>#$ARGUMENTS</task>

## Core Rules

- Read the task source first.
- Read local repo instructions and nearby implementation patterns before
  editing.
- Search for existing patterns before inventing new ones.
- Prefer the best durable ownership fix over the smallest local patch.
- Prefer targeted tests and checks during iteration.
- Keep the user updated at milestones.
- Verify the actual result before claiming done.
- Do not default to research swarms, review swarms, browser proof, tracker
  comments, or compounding.
- For verified code-changing work, commit, push, and create or update a PR by
  default. The `task` skill is the explicit git permission. Only skip that path
  when the user explicitly says not to, the work has no local patch, the task is
  analytical/blocked/inconclusive, or a real blocker is recorded.
- Before calling a task blocked on a repo-wide gate, rule out local install
  corruption once when the failure smells wrong for the diff.

## Intake

1. Classify the input:
   - Plain task text: the user prompt is the source of truth.
   - File path or spec path: read it first.
   - GitHub issue URL: fetch it with `gh issue view` first.
   - GitHub PR URL: fetch it with `gh pr view` first.
   - Bare GitHub issue like `#555`: resolve it against the current `gh` repo
     first, then fetch it with `gh issue view`.
   - Linear issue link/id: fetch it with the Linear integration first.
2. Read the full source-of-truth context before doing anything else.
3. For tracker items, also read comments and attachments when available.
4. If tracker evidence includes video or screen recording, load
   `video-transcripts`, use or create the shared transcript cache through that
   skill, and require normalized `<video-transcripts>` XML before
   implementation. If the helper cannot produce it after a real attempt, stop
   and report the blocker.
5. Classify task shape:
   - Testing or coverage work.
   - Program or batch work.
   - Ordinary one-shot work: bug, feature, refactor, docs, review, or
     investigation.
6. Classify heavyweight work:
   - Heavyweight: architecture or public API redesign, breaking changes, major
     cross-package refactors, benchmarking, profiling strategy, scalability
     work, framework comparison, migration analysis, RFCs, proposals, or
     spec-first major changes.
   - Non-heavyweight: ordinary bugs, one-package features, docs-only edits,
     routine test work, small refactors, or normal issue execution.
7. If heavyweight, load `major-task` immediately and let it own workflow.
8. If non-heavyweight, classify complexity:
   - Non-trivial: multi-step, research-heavy, phased, or likely more than a few
     tool calls.
   - Trivial: quick question, small edit, or work that does not need persistent
     working memory.
9. If non-trivial and measurable/auditable:
   - load `autogoal` before implementation
   - create or update one `docs/plans` goal plan from the dominant-risk primary
     template plus touched-surface packs:
     - docs-dominant work: `--template docs`
     - other normal work: `--template task`
     - supporting docs touched: add `--with docs`
     - `.agents/**`, `.claude/**`, `.codex/**`, skills, hooks, commands,
       prompts, or user-action tooling touched: add `--with agent-native`
     - browser/UI route or interaction touched: add `--with browser`
     - package exports, public API, release artifacts, or package boundary
       touched: add `--with package-api`
     `node .agents/skills/autogoal/scripts/create-goal-scratchpad.mjs --template <task|docs> --with <pack> --title "<short task title>"`
   - follow local repo overrides for where planning files live
10. If testing or coverage work, load `testing` before `tdd` and choose the
    smallest honest slice.
11. If program or batch work, restate the ordered scope and finish one slice at
    a time unless the user asked for a broader sweep.
12. For any tracker source, record source type/id/title, task type, acceptance
    criteria, caveats, likely files/routes/packages, browser surface, and likely
    root-cause layer in the plan when a plan exists.
13. If code will change, decide branch handling before edits using repo policy;
    do not reuse an unrelated branch just because it is checked out. For
    verified code-changing work, this branch decision must assume commit, push,
    and PR as the default closeout path unless the user explicitly declined it
    or a real blocker is recorded.
14. If anything important is still ambiguous after the source and nearby code
    pass, ask the smallest useful clarifying question.

## Tracker Rules

Apply only when the source is a tracker item.

- Treat the tracker item as the source of truth.
- Use the native tool for fetch and sync-back: `gh` for GitHub, Linear
  integration for Linear.
- If useful, rename the thread to `<issue-number> <issue-title>`.
- Prefer PR before tracker comment for verified code-changing work unless
  blocked or the user said not to.
- For GitHub comments after a fix, write for QA: one fixed-in-PR line plus
  short verification steps. Do not mention internal files, tests, branch names,
  or staging mechanics.
- For Linear comments, keep proof local and write for QA, not developers.
- Do not require PR creation, screenshots, or comments for analytical, blocked,
  or inconclusive work.

## Public Issue Challenge Gate

For public tracker bug reports, behavior claims, technical diagnoses, or
suggested fixes, challenge the issue before implementation.

1. Restate the reporter claim in falsifiable terms.
2. Separate observed behavior from reporter interpretation and suggested fix.
3. Reproduce through the lowest honest layer first:
   - focused test/source-level repro when applicable;
   - existing repo-owned automated browser or integration proof when useful;
   - repo-approved Browser proof when tests or automation cannot model normal
     app-surface behavior honestly;
   - Chrome proof directly for native browser/profile/OS behavior such as
     downloads, print/print-preview, file picker/uploads, clipboard, browser
     dialogs/permissions, extension/profile state, or exact Chrome rendering;
   - Computer Use proof when native Chrome/OS UI must be visually confirmed;
   - screenshot or explicit visual-proof waiver only after the applicable
     Browser/Chrome/Computer path cannot inspect the visual/native state.
4. If no existing test can reproduce it, create the smallest honest repro or
   harness before fixing.
5. If the issue is not reproduced, invalid, or won't-fix, hard stop and report
   the evidence. Do not code around a claim you cannot prove.
6. If the issue is partially valid, discard the weak suggested fix and pivot to
   the best long-term ownership fix for the valid behavior.
7. Record the verdict in the task plan when one exists:
   `valid`, `not reproduced`, `invalid`, `wont-fix`, `partially valid`, or
   `platform limitation`.

## Browser Proof

1. Use the fastest honest browser surface:
   - `[@Browser](plugin://browser@openai-bundled)` first for ordinary
     browser-rendered app QA: route navigation, DOM checks, forms,
     screenshots, responsive checks, and UI visual proof.
   - `[@Chrome](plugin://chrome@openai-bundled)` directly when native
     browser/profile/OS behavior is in scope: downloads, print or print
     preview, file picker/uploads, clipboard, browser permissions/dialogs,
     extension/profile state, or exact Chrome rendering.
   - `[@Computer](plugin://computer-use@openai-bundled)` only when native
     Chrome/OS UI must be visually inspected or interacted with and Chrome
     automation cannot read it, such as print preview, save/open dialogs, or
     permission sheets.
2. Any task with visual output requires direct proof on the real affected
   surface. Browser-rendered output requires Browser proof; native
   download/print/file/browser-profile output requires Chrome proof, with
   Computer Use when the proof is in native UI. Visual output includes UI
   screens, generated PDFs, emails, screenshots, rendered docs, tables,
   formatting changes, previews, downloads, print previews, and user-visible
   browser states.
3. If Browser hits a known limitation and native proof matters, switch to
   Chrome/Computer instead of lowering confidence or asking the user to confirm
   something the agent can inspect.
4. Direct visual proof is part of the confidence score. Do not claim `95-100%`
   confidence for visual-output work unless the required visual cases were
   directly inspected in the real affected browser, inbox, or external surface,
   or the user explicitly waived that proof.
5. Do not claim the browser tool is blocked until the Browser->Chrome->Computer
   escalation has been tried when it applies.

## Load Skills Only When Justified

## Skill Diet

Default to `task` for normal work and `major-task` for heavyweight work. Load a
niche skill only when it owns a hard domain gate, command, or proof surface that
the active task would otherwise miss.

Do not keep repo-local skills for generic lifestyle, app-template, local git
ops, stale command stubs, or broad CE ceremony when `task`, `major-task`,
`autogoal`, `autoreview`, or a Convex-specific skill owns the workflow better.

If a generated skill is gone but `skills-lock.json` still references it, remove
it through `npx skills remove <skill> -y` first. If the CLI removes the agent
files but leaves stale lock entries, record that evidence before cleaning the
lock.

- `autogoal`: measurable or auditable non-trivial work. Use the dominant-risk
  primary template and touched-surface packs: docs-heavy work gets
  `--template docs`, normal work gets `--template task`, and supporting docs,
  browser, agent-native, or package/API surfaces add matching `--with <pack>`
  rows. Review expectations stay in the primary template. Do not use root
  planning files, hooks, `.planning/**`, or `docs/goals/**`.
- `major-task`: heavyweight architecture, framework, migration, benchmark, or
  proposal work.
- `testing`: tasks primarily about tests, coverage, regression gaps, or suite
  phases.
- `tdd`: bugs and feature work where behavior-level automated coverage is sane.
- `learnings-researcher`: non-trivial repeated domains with documented
  solutions.
- `video-transcripts`: tracker evidence contains a video or screen recording.
- If requirements remain ambiguous after source and local context, ask the
  smallest clarifying question or switch to a planning goal when the user wants
  planning.
- `framework-docs-researcher`: unfamiliar, version-sensitive, or unstable
  third-party APIs after checking local clones and docs per AGENTS.
- `browser-use`: real browser/UI/native browser surface needs verification;
  follow Browser Proof for Browser vs Chrome vs Computer.
- `agent-browser-issue`: browser automation is blocked by a reusable tool-side
  issue.
- `changeset`: published package work under `packages/` needs release notes.
  Prefer updating the active unreleased `.changeset/*.md` draft instead of
  creating a parallel changeset when one already exists.
- Docs/content work: use `--template docs` when docs dominate; use `--with docs`
  when docs are a supporting touched surface. For `www/**`, keep matching
  `packages/kitcn/skills/kitcn/**` content in sync.
- Git/PR shipping: when verified code should ship and repo policy permits it,
  use normal `git`/`gh` commands directly. Stage the entire current checkout
  per repo policy when creating the PR, create the commit, push, create or
  update the PR before tracker comments. The `task` skill owns the PR body:
  write the PR description from the task-style final handoff contract below.
  Do not skip this merely because the user did not type a separate "open a PR"
  sentence.
- Review skills: load only for risky, large, user-facing, or
  architecture-sensitive changes.
- Agent-native surface: when changes touch `.agents/**`, `.claude/**`,
  AI/tooling surfaces, commands, or user actions an agent should perform, use
  the autogoal agent-native pack and end with `autoreview`.

## Review And Risk Gates

Keep this lighter than a full architecture review. A normal task should not
grow a scorecard, issue ledger, or pass calendar, but risky work still needs
real closeout pressure.

- Autoreview is a hard closeout gate for non-trivial implementation changes.
  Load `.agents/skills/autoreview/SKILL.md`, pick the target from the actual
  diff state, and keep going until there are no accepted/actionable findings.
- The autogoal agent-native pack plus `autoreview` are required when the task
  changes `.agents/**`, `.claude/**`, `.codex/**`, skills, hooks, commands,
  prompts, or user-action tooling.
- Source authority is workspace-local. A check run in the planning repo cannot
  prove behavior owned by a sibling repo, package, app, browser route, or
  tracker system. Record the cwd/tool that owns each proof.
- For public API, runtime, package-boundary, browser behavior, agent-action, or
  command-contract changes, add a compact high-risk note before closeout:
  realistic failure mode, proof plan, and why the chosen boundary is still the
  right one.
- Trivial docs, wording, and no-local-patch tasks may mark these gates N/A with
  a reason.

## Execution Path

### Bug

1. Reproduce first when possible.
2. Add a behavior-level regression test when sane.
3. Fix the real ownership boundary, not every caller around it.
4. If the best fix requires an API change, make it unless task constraints rule
   it out.
5. Re-run targeted checks and browser flow only when the bug lives there.

### Feature

1. Reduce the task to the smallest slice that satisfies acceptance criteria.
2. Add behavior coverage when sane.
3. Prefer the cleanest long-term design that fits the slice.
4. Verify the user-facing outcome.

### Testing Or Coverage Work

1. Use the testing policy before choosing files or commands.
2. Pick the smallest honest hotspot or ordered slice.
3. Add or deepen focused tests instead of broad smoke coverage.
4. Verify with targeted commands first.

### Program Or Batch Work

1. Respect explicit order.
2. Define done for the current slice before implementation.
3. Complete one slice cleanly unless the user asks for a broader sweep.

### Refactor Or Chore

1. Preserve behavior.
2. Do not do fake TDD theater.
3. Improve bad APIs or abstractions when that is the real fix.
4. Run the narrowest regression checks plus relevant build, typecheck, or lint.

### Docs Or Content

1. Skip engineering ceremony.
2. Verify links, examples, formatting, and rendered output as appropriate.
3. When updating `www/**`, update corresponding `packages/kitcn/skills/kitcn/**`
   content in the same diff.

### Review Or Investigation

1. Read relevant diff, files, and surrounding context first.
2. For reviews, report findings first, ordered by severity.
3. For investigations, identify failure mode, probable cause, and next action
   before changing code.
4. Only implement changes if the user asked for them.

## Verification

Keep verification mandatory and proportional.

- Run targeted tests for changed behavior.
- Run package/app build and typecheck when relevant.
- Run lint when code changed and repo policy expects it.
- Run Browser verification only for normal browser-rendered app/UI tasks. Use
  Chrome directly for native downloads, print/print-preview, file
  picker/uploads, clipboard, browser dialogs/permissions, extension/profile
  state, or exact Chrome rendering. Use Computer Use when native Chrome/OS UI
  must be visually confirmed.
- Run broader repo-wide gates only when repo instructions or change scope
  justify them.
- Run verification in the workspace, package, app, route, or external system
  that owns the changed behavior; record the cwd when that is not obvious.
- If `bun test`, `bun check`, or `bun typecheck` fails with local-corruption
  signals unrelated to the diff, run `bun install` once and rerun the exact
  failing command before declaring the task blocked.
- If verified work changes published package code under `packages/`, update or
  create a changeset before PR/final handoff.
- If verified work changes package code under `packages/kitcn`, run
  `bun --cwd packages/kitcn build`.
- If work changes `kitcn init -t` templates or scaffold sources, run
  `bun run fixtures:sync` and `bun run fixtures:check`.
- If verified work changed code, commit it and create or update the PR before
  tracker sync-back and final handoff unless the user explicitly said not to.
  Do not mark commit/PR gates N/A merely because the user did not ask for a PR;
  the task skill requires shipping verified code. If commit or PR creation is
  impossible after real attempts, record the blocker and stop instead of
  silently handing off a local-only patch.
- A final response that says "No commit/PR created because you did not ask" is
  wrong for verified code-changing `task` work. Either create/update the PR or
  name the explicit decline/blocker.
- If the task came from a tracker item and reached a meaningful outcome, sync
  back unless the user said not to.

## Final Handoff

- Be extremely concise.
- Report PR, issue/tracker, confidence, tests, browser proof, outcome, caveats,
  design choice, and verification only when applicable.
- For non-trivial task goals, close every relevant task-template gate before the
  final response.
- If a PR exists, keep the PR description synced to the final handoff.
- For tracker comments, write for QA or the issue owner, not internal
  implementation history.
- For browser work, include the exact route and human verification steps.

## Task-Style PR Body

When a `task` run creates or updates a PR, the PR description must mirror the
task final handoff. Do not use a generic `Summary` / `Verification` PR body,
generic git-helper prose, or a generated badge footer unless the caller or repo
template explicitly asks for it.

Use the accepted task PR format from PR #270. The shape is not optional:

1. Preserve any existing `<!-- auto-release:start -->` block. If a changeset is
   part of the diff and repo policy expects auto release, include that block.
2. Use an emoji-prefixed issue/tracker/fix line, for example
   `🐛 Fixes #123` or `🐛 Fixes ➖ N/A`. Never include a line that links to the
   current PR itself; the current PR URL belongs in the final response, not in
   its own description.
3. Use an emoji confidence line, for example `🟢 95-100% confidence`.
4. Use this exact table header:
   `| Phase | 🧪 Tests | 🌐 Browser |`
5. Use `Reproduced` and `Verified` rows. Mark passing proof with `🟢`, repro or
   failing proof with `🔴`, and non-applicable browser/test cells with `➖ N/A`.
6. Use bold emoji section headings exactly in this family:
   `**✅ Outcome**`, `**⚠️ Caveat**`, `**🏗️ Design**`, and
   `**🧪 Verified**`.

The body should tell QA/reviewers what was fixed, how it was reproduced, how it
was verified, and why the chosen ownership boundary is right. It must not use
plain `Fix:`, plain `Confidence:`, `## Outcome`, `## Verified`, or a generic
`Summary` / `Verification` shape for task-run PRs. After editing, verify it
with `gh pr view --json body` before final handoff.

## Success Criteria

- Source-of-truth context was read first.
- Relevant repo instructions and patterns were read before editing.
- Tracker items were fetched and summarized correctly when provided.
- Video evidence used `video-transcripts` before implementation when required.
- Bare GitHub issues like `#555` were resolved against the current repo.
- The chosen fix addressed the highest-leverage ownership boundary available.
- Non-trivial measurable work loaded `autogoal` and used the right primary
  template plus touched-surface packs.
- Testing work loaded the testing policy before implementation.
- Only necessary skills were loaded.
- Batch work did not sprawl without explicit instruction.
- Verification matched change scope.
- Verified code-changing work was committed and PR'd, or the user explicitly
  declined that path, the work had no local patch, or a real blocker was
  recorded.
- PR descriptions created by task runs used the PR #270 emoji task-style body
  and were verified with `gh pr view --json body`.
- Final handoff matched the task type and any task-template gate evidence.
