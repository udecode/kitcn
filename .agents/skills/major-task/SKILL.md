---
description: Work heavyweight framework or library tasks with planning-first research, selective deep analysis, and rigorous handoff
argument-hint: '[task description | spec path | issue id/link]'
disable-model-invocation: true
name: major-task
metadata:
  skiller:
    source: .agents/rules/major-task.mdc
---

# Major Task

Handle $ARGUMENTS. Use this for architectural, comparative, benchmark, migration, or proposal-grade work where wrong framing is expensive. Be deep, not bloated. Be explicit, not ceremonial.

<task>#$ARGUMENTS</task>

## Core Rules

- Read the source of truth first.
- Plan before drifting into implementation.
- Start from repo constraints, not internet takes.
- Search for existing boundaries, patterns, and prior decisions before inventing new ones.
- Prefer the smallest heavy stack that can answer the decision.
- Usually load 2 to 4 helpers, not every possible helper.
- Separate facts, inference, and recommendation.
- Do not default to review swarms, browser proof, PR work, or compounding.
- Use external docs only when repo evidence and local clones are not enough or the task explicitly depends on third-party behavior.
- If the task turns into code-changing execution, prefer the best durable ownership fix over a local patch.

## Use This For

- Architecture or public API redesign.
- Breaking changes or major cross-package refactors.
- Framework comparison, migration, or tradeoff analysis.
- Benchmarking, profiling strategy, scalability work, or performance-at-scale decisions.
- RFC, proposal, or spec work that needs repo research plus external grounding.
- Explicit review of a serious plan, spec, or proposal.

## Do Not Use This For

- Ordinary bug fixes.
- One-package features.
- Docs-only edits.
- Routine test work.
- Small refactors.
- Normal execution work that is merely non-trivial.

## Intake

1. Classify the input:
   - Plain task text: the user prompt is the source of truth.
   - File path or spec path: read it first.
   - GitHub issue URL: fetch it with `gh issue view` first.
   - GitHub PR URL: fetch it with `gh pr view` first.
   - Bare GitHub issue like `#555`: resolve it against the current `gh` repo first, then fetch it with `gh issue view`.
2. Read the full source-of-truth context before doing anything else.
3. If the task comes from a ticket, issue, PR, or spec, also read comments and attachments when available.
4. Restate the decision to make, not just the topic.
5. Classify the major-work lane:
   - architecture or public API
   - benchmark or performance
   - framework comparison or migration
   - spec or proposal
   - document review
   - mixed
6. Decide whether the work is:
   - analytical only
   - planning only
   - planning plus later implementation
   - already code-changing execution
7. Load `autogoal` immediately and create or update one `docs/plans` goal plan
   from the major primary template plus packs:

   ```bash
   node .agents/skills/autogoal/scripts/create-goal-scratchpad.mjs \
     --template major-task \
     --title "<short major task title>"
   ```

   Add touched-surface packs as needed: `--with docs`, `--with browser`,
   `--with package-api`, or `--with agent-native`.
8. When the work needs a real implementation plan, phased rollout, or plan
   artifact, make the active `major-task` goal plan the durable planning
   surface.
9. Search `docs/research/**`, `docs/solutions/**`, ADRs, and prior plans when
   the domain has repository history worth mining.
10. For library or framework questions, inspect the local clone in `..` first per AGENTS. If missing, clone it. Only then reach for official docs.
11. Pick the smallest justified helper stack for the lane.
12. For any GitHub source, restate for yourself:

- source type
- source id
- exact title
- decision type: architecture, benchmark, migration, proposal, review, or mixed
- expected outcome
- acceptance criteria or decision criteria
- likely files, packages, or public surfaces affected
- whether there is a real browser surface to verify
- likely highest-leverage owner

13. Read repo instructions and nearby implementation patterns before editing.
14. If the task becomes code-changing work, follow the repository's current
    branch and GitHub delivery policy. Do not add branch/worktree ceremony at
    task start. Run install or setup only when the repo or task needs it.

15. If the task stays analytical, skip branch and setup noise.
16. If anything important is still ambiguous after the source-of-truth pass and nearby code reading, ask the smallest useful clarifying question.

## GitHub Source Rules

Apply this section only when the task source is a GitHub issue or PR.

- Treat the GitHub issue or PR as the source of truth.
- Use `gh` for fetch and sync-back.
- If useful, rename the thread to `<issue-number> <issue-title>`.
- If the work becomes code-changing, prefer a branch name that includes the issue number.
- If the task changed code and reached a verified meaningful outcome, create or update the PR before any issue comment unless blocked or the user said not to.
- If the task stayed analytical, only post back when the analysis itself is the deliverable and a comment would help.

- Do not force PR creation for GitHub tasks that stayed analytical, ended
  blocked, or never changed code.
- Do not require issue comments for inconclusive investigation unless sync-back
  is useful.
- Do not force screenshots for non-browser analytical work.

## Load Skills Only When Justified

- `autogoal`
  Use by default here. Major work should not rely on short-lived memory. Keep
  the durable working state in one `docs/plans` goal plan. Use
  `--template major-task`, then add touched-surface packs for docs, browser,
  package/API, or agent-native surfaces.
- `research-wiki`
  Use when prior repo decisions, solutions, research artifacts, or repeated
  failures may matter.
- `diagnosing-bugs`
  Use when the major task is still a failure-mode investigation rather than a
  design decision.
- `deslop`
  Use after a working change when the remaining risk is code shape, simplicity,
  over-abstraction, or AI-generated sludge.
- `tdd`
  Use when package behavior changes and the next step should be a focused
  executable contract before implementation.
- `autoreview`
  Use for explicit diff review, release-readiness review, or final review of a
  risky code-changing slice. It is mandatory at final closeout.
- `agent-native-reviewer`
  Run before final `autoreview` when the work changes agent rules, skills,
  templates, prompts, commands, helpers, or generated agent surfaces.
- Agent-native surfaces
  Use the autogoal agent-native pack and `autoreview` when the change touches
  `.agents/**`, `.claude/**`, AI/tooling surfaces, commands, or user actions
  that an agent should also be able to perform.
- `agent-browser-issue`
  Use when browser automation is blocked by a likely reusable tool-side issue that deserves a separate GitHub follow-up.
- `changeset`
  Use when verified work changes a published package under `packages/` and the repo expects release notes before completion.
## Execution Paths

### Architecture Or Public API

1. Map the current boundaries, ownership, public surface, and package boundaries first.
2. Find what already exists before proposing new structure.
3. Prefer changing the ownership boundary over papering around it at each call site.
4. Call out blast radius explicitly when the recommendation changes public API or package contracts.
5. Default breaking changes to a hard cut after the required user confirmation;
   do not add compatibility aliases or migration bridges by reflex.
6. If a smaller boundary change and a broader architecture reset are both viable, say why one wins now.

### Service, API, Auth, And Data Flow

Every architecture/migration/proposal lane must map these surfaces or mark them
N/A with reason:

| Surface | Questions |
| --- | --- |
| public API | names, inputs, outputs, errors, type inference, extension points |
| service/runtime | entry points, callers, lifecycle, retry, idempotency, failure |
| auth/session | identity source, session lifetime, permission checks, denied path |
| canonical data | owner, persisted/derived state, transaction boundary, deletion |
| Convex graph | static imports per function entry, bundle impact, leaf split |
| CLI/scaffold | command contract, JSON/non-interactive behavior, generated owner |
| docs/examples | current-state user story and source synchronization |
| proof | tests, types, build, benchmark, fixture, scenario, Browser |

Trace at least one end-to-end happy path and one denied/failure path through the
actual symbols. Proposals without this map are not implementation-ready.

### Performance And Optimization

1. Define the performance question and the decision it should unlock before reading more.
2. State the workload explicitly:
   - typing or interaction latency
   - transform or normalization cost
   - render churn
   - large-structure scaling
   - bundle or startup cost
   - API or query hot paths
   - CLI or tooling latency
3. Capture repo-grounded constraints first:
   - current architecture
   - package boundaries
   - existing perf complaints
   - which surface is being stressed
   - whether the problem is runtime, rendering, bundling, I/O, or architecture
4. Set explicit criteria up front: latency, throughput, memory, render count, bundle cost, implementation cost, maintenance cost, or similar.
5. Define benchmark scenarios before implementation. No vague "seems faster" bullshit.
6. Separate:
   - measured evidence
   - benchmark plan
   - intuition
7. If the question is comparative, compare equivalent workloads, not vibes or marketing claims.
8. For framework or tooling comparisons:
   - start from an explicit candidate set
   - inspect local clones in `..` first
   - compare like-for-like workloads and surfaces
9. If no measurement exists yet, say so plainly and provide the smallest honest measurement plan.

### Framework Comparison Or Migration

1. Start with an explicit candidate set. Do not widen the field randomly.
2. Read local clone/source first, then official docs if the clone does not settle the question.
3. Read official docs before blogs or random benchmark posts.
4. Set explicit criteria up front: API ergonomics, extensibility, runtime cost, migration cost, docs quality, maintenance cost, or similar.
5. End with a recommendation, tradeoffs, and what evidence would change the recommendation.

### Spec Or Proposal

1. Pressure-test completeness directly against source, current constraints,
   acceptance criteria, rollout, and verification.
2. Define constraints, acceptance criteria, rollout, verification, and open questions before implementation.
3. If the task is still mushy product framing rather than implementation
   strategy, stop for focused clarification or switch to collaborative planning.
4. If the spec will be a real decision artifact, run the conditional document-review pass before calling it done.

### Document Review

1. Use this path only for explicit plan, RFC, proposal, or spec review.
2. Review with one compact pass:
   - coherence: does the proposal contradict itself?
   - feasibility: can the repo implement and verify it?
   - scope: are abstractions, rollout, and proof proportional?
   - product fit: does it solve the right problem for this repo?
   - adversarial pass: what would make this plan fail?
3. Use `autoreview` only when there is an actual diff or final review target.
4. Keep this pass selective. Most docs should not need another skill.

### Mixed Major Work

1. Split the work into ordered passes:
   - decision
   - plan
   - review
   - implementation
2. Do not collapse the whole thing into one blob.
3. Make the current pass explicit before doing the next one.

### Code-Changing Major Work

1. Once the decision is made, reduce execution to the smallest meaningful slice that proves the ownership boundary.
2. Prefer the cleanest long-term design that fits the slice, not the quickest bolt-on.
3. If existing patterns are weak, improve the pattern or API instead of copying it blindly.
4. Use targeted tests and checks during iteration.
5. Use browser verification only if the work actually hits a browser surface.

### Review Or Investigation

1. Read the relevant diff, files, specs, and surrounding context first.
2. For review tasks, report findings first, ordered by severity, with concrete file references.
3. For investigation tasks, identify the failure mode, probable cause, and next action before changing code.
4. Only implement changes if the user actually asked for them.

## Verification

Keep verification mandatory but proportional.

- Verify claims with repo evidence, official docs, or targeted measurements.
- Benchmark claims need measured scenarios or an explicit measurement plan.
- Comparison claims need criteria-backed reasoning, not vibes.
- For analytical tasks, show where the recommendation came from and what remains uncertain.
- Run targeted tests for changed behavior when code changed.
- Run package or app build and typecheck when relevant to the touched area.
- Run lint when code changed and the repo expects it.
- Run browser verification only for browser or UI tasks.
- Run broader repo-wide gates only when repo instructions require them or the change scope justifies them.
- If verified work changed code, create or update the PR before GitHub issue
  sync-back unless the user explicitly said not to.
- If the task came from a GitHub issue and reached a meaningful outcome, sync
  back unless the user said not to.
- If UI changed, capture proof from the real browser surface.
- Do not hardcode screenshots or issue comments for every task.
- Run final `autoreview` for every completed major-task artifact or diff. When
  agent-native surfaces changed, run `agent-native-reviewer` first and resolve
  every accepted actionable finding.

## Final Handoff

- Recommendation first.
- Keep facts, inferences, and open questions clearly separated.
- If this stayed analytical, skip ship theater.
- If this became code-changing work, follow the same terse final handoff contract as `task.mdc`:
  - same leading tables
  - same verification reporting
  - same browser-proof rules when applicable
  - same PR and GitHub issue sync expectations when applicable
- If this stayed analytical, the handoff must still say:
  - what decision was made
  - what evidence supported it
  - what would change the recommendation
  - what remains open by design

## Post Back To GitHub

Apply this section only when the task came from a GitHub item and reached a
meaningful outcome.

- If the work changed code, follow the same PR and issue sync contract as
  `task.mdc`.
- If the work stayed analytical, comment back only when the analysis itself is
  useful to the issue owner.
- Keep comments user-facing and outcome-focused.
- Do not dump research process into issue comments.

## Success Criteria

- Source-of-truth context was read first.
- Relevant local instructions and nearby patterns were read before editing.
- Major-work lane was classified explicitly.
- `autogoal` was loaded and the `docs/plans` goal plan existed before the work
  sprawled.
- Framework or tooling comparison stayed bounded by an explicit candidate set when relevant.
- Local clones/source were checked before external docs when third-party behavior mattered.
- Only the necessary helpers were loaded.
- Document-review personas were conditional, not ceremonial.
- Verification matched whether the work was analytical, planning, or code-changing.
- Service/API/auth/data-flow surfaces were mapped or explicitly N/A.
- Final `autoreview` passed; agent-native changes also passed
  `agent-native-reviewer` first.
- Final handoff made the recommendation and the evidence easy to scan.
