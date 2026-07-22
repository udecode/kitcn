---
description: Autonomous kitcn supervisor for sweep, clean, full, design, milestone, PRD, timed, and review-until work. Compiles a run profile, keeps evidence-backed state, decomposes local task packets, repairs its workflow, and closes through GitHub delivery.
argument-hint: <feature | source path | current tree> [sweep|clean|full|design|milestone|prd|timed <duration>|autoreview-until <P1|P2|P3|clean>]
name: auto
metadata:
  skiller:
    source: .agents/rules/auto.mdc
---

# Auto

Auto is the front door when the user wants the repository to keep choosing and
executing the next safe owner without repeated prompting.

## Core Take

Auto is a supervisor, not a larger implementation skill. It compiles the run,
records durable state, selects the next checkpoint from evidence, invokes the
real owner, verifies the result, and continues until the auditable stop
condition is true.

The loop is:

```text
request -> run profile -> vision/source intake -> readiness
-> candidate owner -> execute -> proof -> state update -> next candidate
-> review -> repository gate -> GitHub delivery -> final audit
```

Do not score the entire run up front. Score only when more than one valid next
checkpoint exists.

## Modes

| Mode | Contract |
| --- | --- |
| `sweep` | Find and complete the highest-value safe improvements in the named boundary; do not create a new PRD by default. |
| `clean` | Close the current tree through proof, sync, review, checks, and GitHub delivery; route execution to `autoclosure`. |
| `full` | Consume a named capability, source, or best relevant local PRD; decompose directly into local task packets; implement, verify, sync docs/skills, review, and complete the GitHub PR path. |
| `design` | Route through `design`, implement when requested, and prove the live surface. |
| `milestone` | Route through `to-milestone`; terminal unless another mode is also named. |
| `prd` | Route through `to-prd`; terminal unless `full` is also named. |
| `timed <duration>` | Repeat useful bounded loops until the timebox ends, preserving a safe closeout reserve. |
| `autoreview-until <threshold>` | Run fresh review rounds, repair accepted findings, and stop at the named clean/P-level threshold or a hard blocker. |

A bare feature plus `full` may use an existing local PRD when useful. If no PRD
is required to make coherent decisions, Auto writes the decisions and packets
in its goal plan instead of creating planning ceremony.

## Front-Door Routing

| Evidence | Owner |
| --- | --- |
| fuzzy failure or flaky regression | `diagnosing-bugs` |
| ordinary bounded implementation | `task` |
| architecture, migration, benchmark, or public-API proposal | `major-task` |
| hard removal | `hard-cut` |
| structural ownership cleanup | `architecture-cleanup` |
| live behavior change suited to red-green-refactor | `tdd`, then task owner |
| UI route/component design | `design` |
| doctrine contradiction or drift | `vision` / `sync-vision` |
| unclear direction | `grill-with-vision` |
| milestone map | `to-milestone` |
| implementation-ready capability source | `to-prd` |
| working tree closeout | `autoclosure` |
| final code review | `autoreview` |

Use `orchestrator` only when the user explicitly requests parallel child
thread/branch work. Auto never invents parallel delegation or worktrees.

## Run Profile Compiler

Before work, compile and record this profile in the goal plan:

| Field | Values / meaning |
| --- | --- |
| source | prompt, PRD, milestone, plan, paths, current tree |
| mode | one primary mode plus modifiers |
| target | requested outcome in one sentence |
| boundary | included paths/surfaces and explicit exclusions |
| architecture depth | ordinary, cleanup, or major |
| behavior strategy | inspect, reproduce, TDD, migrate, remove |
| proof harness | unit, integration, type/build, fixture, scenario, Browser, benchmark, exact-term audit |
| docs/generated | owners and regeneration commands |
| delivery | local-only or GitHub PR path |
| parallelism | off unless user explicitly requested it |
| review threshold | normal, P3, P2, P1, or clean |
| timebox | none or duration plus closeout reserve |
| stop condition | measurable completion or hard blocker |

Reject impossible combinations instead of silently weakening one. `full` cannot
become planning-only because a PRD was created. `clean` cannot expand into a new
feature. A timed run cannot spend its closeout reserve on new scope.

## Goal Plan Contract

Use `autogoal` before durable Auto work. Create or resume a plan from the
`auto` template with the `agent-native` pack and any relevant `browser`,
`design`, `docs`, `package-api`, `release`, or `to-prd` pack.

The plan must contain:

- run profile and source inventory;
- completion threshold and explicit exclusions;
- state capsule;
- decision, assumption, claim, error-attempt, and packet ledgers;
- readiness and proof matrices;
- source/generated owner map;
- review, repository-check, and delivery gates;
- phase states and completion audit.

Checkpoints are receipts. Update the plan after meaningful execution, not only
at the end.

Before full closeout, run both plan validators:

```bash
node .agents/rules/auto/scripts/check-plan-placeholders.mjs <plan-path>
node .agents/skills/autogoal/scripts/check-complete.mjs <plan-path>
```

The placeholder audit fails unresolved TODO/TBD text, bare pending cells, and
unchecked items. The autogoal checker proves the resolved goal-plan structure.

## State Capsule

Keep this compact capsule current so work can resume without rereading the
world:

```text
mode:
target:
active source:
active packet:
current owner:
last proven fact:
latest changed files:
next proof:
open blocker:
decision debt:
time remaining / reserve:
```

Update after source changes, failed proof, owner changes, and packet closeout.
Never claim a state that is only planned.

## Source Intake

Read only what can change the next decision:

1. `VISION.md`, `docs/README.md`, and the named local source.
2. The active plan/PRD/milestone and unresolved decisions.
3. Exact public exports, runtime entries, package manifests, and call sites.
4. Tests/fixtures/scenarios that define the current behavior.
5. CLI/template/generated owners when scaffold output is involved.
6. Matching docs and `packages/kitcn/skills/kitcn/**` when user guidance moves.
7. Local OSS clones for unfamiliar or parity-sensitive API design.

Build a source-backed case matrix rather than reading broad directories without
a question.

## Full Mode Contract

`auto full` is terminal only when every applicable lane is proven:

1. Resolve the named source or the latest relevant unfinished local PRD.
2. Repair bounded contradictions, placeholders, missing owner decisions, and
   weak proof contracts in that source.
3. If the source is fundamentally missing, route once to `to-prd`; then return
   to the same full run.
4. Decompose directly into local task packets in the PRD or active Auto plan.
5. Execute each packet with `task`, `major-task`, `architecture-cleanup`,
   `hard-cut`, `design`, or `tdd` as its true owner.
6. Run package build, changeset, fixture, scenario, docs/package-skill, browser,
   and generated-output gates required by the changed surface.
7. Run final cleanup and reviews.
8. Run `bun lint:fix` and `bun check`.
9. Commit, push, and open/update the GitHub PR when the run includes verified
   code-changing delivery.
10. Audit the complete goal plan and close the durable goal.

Local PRDs and task packets own decomposition; the GitHub PR owns delivery and
review.

## Task Packet Ledger

Every implementation packet gets one row:

| Packet | Outcome | Owner/files | Depends on | Conflict group | Mode | Acceptance | Proof | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |

`Mode` is one of:

- `blocking`: must close before dependent packets;
- `parallel-join`: may overlap only when explicit parallel work is authorized,
  but joins before its claim is consumed;
- `detached`: useful but cannot change the requested completion claim.

Consolidate test-only, docs-only, guard-only, and refactor-only fragments into
the behavior packet they support unless ownership and acceptance are truly
independent.

## Claim Receipts

Any important final claim must have a receipt:

| Claim | Exact evidence | Freshness | Scope | Confidence | Status |
| --- | --- | --- | --- | --- | --- |

Allowed evidence includes source lines, test output, generated diffs, runtime
observations, Browser proof, benchmark results, package exports, build artifacts,
and authoritative external docs. A plan checkbox or command exit code without
relevant assertions is not enough.

For evidence-backed claims:

- `high`: direct fresh evidence covers the exact claim and boundary;
- `medium`: direct evidence plus a bounded inference;
- `low`: unverified inference, stale evidence, or incomplete boundary.

Completion claims require `high` confidence. Rewrite, narrow, or keep working
when confidence is lower.

## Hard Confidence Thresholds

These block progress regardless of candidate score:

| Gate | Minimum | If below |
| --- | --- | --- |
| public API/type contract | exact source and compile/test proof | inspect or redesign |
| auth/session/permission flow | owner and denied-path proof | stop implementation claim |
| Convex entry import graph | exact static graph for changed entry | split imports/owner |
| generated ownership | source + regeneration + representative diff | repair owner |
| package behavior | focused tests + package build | fix before broader check |
| scaffold/fixture behavior | source regeneration + fixture check | regenerate/repair |
| docs/package skill | paired current-state audit | synchronize |
| UI behavior | state matrix + Browser proof | implement/prove |
| GitHub delivery | commit/PR/check state read-back | keep delivery open |

## Decision Debt Cap

Decision debt is an unresolved choice that can change public behavior, owner
boundaries, security, data lifecycle, or proof. Keep at most three active items
and none on the critical path to the active packet.

| Decision | Why unresolved | Recommended answer | Evidence needed | Deadline |
| --- | --- | --- | --- | --- |

If the cap is exceeded, stop implementation and resolve the highest-impact
decision. Cosmetic preferences do not count.

## Assumption Ledger

| Assumption | Evidence | Risk if false | Validation | Status |
| --- | --- | --- | --- | --- |

Validate high-impact assumptions before code. Low-impact reversible assumptions
may proceed if they are explicit and tested before closeout.

## Readiness Ownership

One owner signs each readiness lane:

| Lane | Owner | Ready means |
| --- | --- | --- |
| product/doctrine | vision/PRD | outcome and non-goals are settled |
| public API | package owner | names/types/errors/hard cut are settled |
| runtime/data/auth | implementation owner | entry, data, identity, and denial flow are mapped |
| generated/scaffold | source owner | regeneration and representative output are known |
| proof | task owner | case matrix and harness can prove acceptance |
| docs/skill | docs owner | current-state docs and package skill have matching scope |
| delivery | Auto parent | reviews/checks/GitHub path are explicit |

Do not let multiple scorecards create fake rigor. Use readiness ownership to
answer who must act next.

## Scenario And Proof Matrix

Create a row for every source-listed behavior and failure class:

| Scenario | Entry/input | Expected behavior | Harness | Evidence | Status |
| --- | --- | --- | --- | --- | --- |

Include, when applicable:

- happy path and empty/missing input;
- auth/session/permission denial;
- validation and typed error behavior;
- retry/idempotency/concurrency;
- live subscription and non-live cache behavior;
- package export and consumer type flow;
- CLI interactive, `--yes`, and `--json` behavior;
- scaffold regeneration and fixture diff;
- Convex bundle/import boundary;
- UI loading, error, permission, responsive, and keyboard behavior;
- deletion/absence of superseded APIs for a hard cut.

Every row is pass, blocked with evidence, or N/A with reason.

## Harness Selection

Choose the smallest harness that can disprove the claim:

| Need | Harness |
| --- | --- |
| pure behavior | focused unit test |
| cross-module contract | integration test |
| public types/exports | source-first typecheck and package build |
| generated template | generator + fixture check |
| end-to-end example | prepared scenario, never committed fixture in place |
| UI/runtime | dev server + Browser |
| performance/size | repeatable benchmark or bundle graph |
| agent workflow | helper smoke, source/mirror audit, placeholder gate |

Record command, cwd, prerequisites, expected signal, actual result, and artifact.

## Error-Attempt Ledger And Self-Repair

For any repeated failure record:

| Attempt | Failure signature | Hypothesis | Different move | Result |
| --- | --- | --- | --- | --- |

After two attempts with the same signature, stop repeating the command. Change
the diagnostic layer: reduce the repro, inspect ownership, refresh dependencies
once when the failure shape indicates environment rot, switch harness, or route
to `diagnosing-bugs`.

Trigger workflow self-repair when:

- the run repeatedly chooses the wrong skill;
- a required receipt cannot be represented in the plan;
- generated sources drift after the documented command;
- a stop rule permits false completion;
- an error recurs because the workflow gives no next-different move.

Repair the smallest source-owned rule/template/helper, add a smoke or eval case,
regenerate mirrors, and run `agent-native-reviewer` plus `autoreview`. Do not
rewrite the workflow merely because one task was awkward.

## Skill Evaluation

For every changed skill keep at least one evaluation row:

| Prompt/case | Expected route | Required receipts | Forbidden behavior | Result |
| --- | --- | --- | --- | --- |

Evaluate routing, placeholder failure, completion pass, source/generated
ownership, and omitted workflows. A description that reads well is not proof
that the skill routes correctly.

## Candidate Scoring

When more than one safe next checkpoint exists, score `0-5`:

- user/developer leverage;
- vision fit;
- unblock value;
- evidence strength;
- proof availability;
- reversibility;
- deletion/complexity reduction;
- conflict risk (reverse scored).

Record the top candidates, selected owner, and rejected high-scoring candidate
with reason. If one owner is obvious, write `no score needed`.

## Self-Grilling

Before an irreversible design or before full closeout, ask:

- Does this preserve kitcn's familiar mental models?
- Is the type path end to end or locally simulated?
- Is the Convex function bundle as narrow as the operation?
- Is the public surface smaller and clearer than the alternatives?
- Are CLI and generated ownership deterministic for agents?
- Does auth fail closed at the real owner?
- Are docs written for the current state?
- Can every acceptance claim be disproved by the selected harness?
- What attractive extra scope should be cut?

Record answers and changed decisions, not rhetorical questions.

## Timed Loops

For `timed <duration>`:

1. Reserve at least 20% of the timebox for proof, review, and handoff.
2. Select packets small enough to finish before that reserve.
3. At each checkpoint update time remaining, active packet, and safe stop.
4. When reserve begins, stop opening scope and enter `autoclosure`.
5. A timebox ending is not completion; report proven work and the exact next
   packet or blocker.

Waits are work only when an external process is expected to change. While a
safe independent packet exists, do it rather than polling.

## Review-Until

Each review round must be fresh and independent:

1. Snapshot the intended delta and proof.
2. Run the selected reviewer without priming it with the prior verdict.
3. Classify findings: accept, reject with source evidence, or duplicate.
4. Fix accepted findings and rerun targeted proof.
5. Continue until the named threshold is met or the capped rounds expose a hard
   unresolved risk.

Never weaken `full` because the requested review threshold is lower. Final
`autoreview` is still mandatory.

## All-Lane Closeout

Before completion score each applicable lane `0-100` with evidence:

| Lane | Applies | Score | Evidence | Next owner if below 95 |
| --- | --- | --- | --- | --- |
| source/decision readiness | yes/no | | | |
| implementation/public API | yes/no | | | |
| data/auth/bundle ownership | yes/no | | | |
| tests/fixtures/scenarios | yes/no | | | |
| docs/package skill/generated | yes/no | | | |
| UI/runtime proof | yes/no | | | |
| cleanup/review | yes/no | | | |
| checks/GitHub delivery | yes/no | | | |
| goal audit | yes | | | |

No applicable lane below `95` may be called complete. Use N/A only with a
specific boundary reason. The score points to the next owner; it never replaces
the receipt.

## Command Discipline

- Use repository scripts and exact working directories.
- Prefer focused proof before broad gates.
- Do not run committed fixtures in place; prepare scenarios under `tmp`.
- Run `bun install` once when the task or dependency state requires it.
- Keep package behavior source-first; build for artifacts/exports or packages
  that intentionally require it.
- Edit `.agents` and package skill sources, never generated mirrors.
- Manage installed skills only through `npx skills add/update/remove`.
- Run `bun install` after source/lock changes to regenerate agent output.
- For authorized GitHub delivery, follow repository branch/check/whole-checkout
  rules exactly.

## Stop Rules

Stop only when:

- the measurable target and all applicable lanes are proven;
- a missing user/external authority action blocks the next safe move;
- an irreversible decision outside the source contract requires direction;
- repeated different diagnostics prove an environment blocker;
- the timed closeout boundary is reached with a truthful partial handoff.

Do not stop because a plan, PRD, packet list, code diff, test pass, reviewer
verdict, commit, or PR exists. None alone proves the full run.

## Final Handoff

Report outcome first, then:

- source and packets completed;
- key behavior/public API decisions;
- proof and repository gates;
- generated/docs/package-skill sync;
- review findings resolved or rejected with evidence;
- GitHub PR/check state;
- residual risks, waivers, or exact blocker;
- final goal-plan audit and durable goal status.
