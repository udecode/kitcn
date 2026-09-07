# PR 456 autoclosure

Objective:
Close exactly PR #456 with dedicated task evidence, passing checks, zero
actionable P1 feedback, exact-head receipts and a verified merge without
release. Main task: docs/plans/445-index-union-bounded-on-pipeline-path.md.

Goal plan:
docs/plans/445-pr-456-autoclosure.md

Template:
docs/plans/templates/autoclosure.md

Primary template:
docs/plans/templates/autoclosure.md

Applied packs:
- agent-native (docs/plans/templates/packs/agent-native.md)

Completion threshold:
- Complete every applicable lane below for https://github.com/udecode/kitcn/pull/456.
- No new product scope. Completion requires every applicable lane below to have
  fresh evidence, `bun check` passing, review findings closed, authorized
  GitHub delivery complete, and the goal checker passing.

Verification surface:
- Index-union pagination/read-bound, pipeline, pagination, stream and
  where-filtering Vitest tests; compiler Bun tests; typecheck, lint, package
  build, skill regeneration/cmp, docs Browser proof, autoreview, bun check,
  helper/raw GitHub inventories and post-push P1 replay.

Constraints:
- Finish the intended delta; do not invent the next feature.
- Preserve source/generated/package/docs ownership.
- Use a different diagnostic after repeated failure signatures.

Boundaries:
- intended delta: wide compiled index unions retain bounded reads and index
  order; integrate merged #455's filtered per-probe read owner.
- allowed repairs: user "never ask, just go" authorizes bounded closeout repairs,
  whole-checkout commit/push, quoted replies, resolutions and merge.
- unrelated files: preserve; do not treat as blockers
- non-goals: no new public API/configuration, release, Version Packages merge,
  framework/workflow expansion, worktree or parallel agent work.

Output budget strategy:
- Named source ranges and bounded tool output; full logs under
  /tmp/kitcn-pr456-*. Do not infer success from truncated output.

Blocked condition:
- No source blocker. Full checks, publication, feedback replies and exact-head
  receipt are pending. The installed intent-library exposes list/install only,
  not validate/stale; source/mirror/discoverability checks substitute for the
  unavailable command surface without changing dependency/workflow scope.

Start Gates:
| Gate | Applies | Evidence |
| --- | --- | --- |
| Dedicated task invocation and plan for exact PR | yes | Resumed task for #456; 445-index-union-bounded-on-pipeline-path.md |
| Task evidence verified at PR head | yes | Exact body plan line and file at 65002eeb identify #456 |
| Active source/plan reconstructed | yes | query/compiler/stream owners and all changed tests read |
| Intended delta and exclusions recorded | yes | Boundaries above |
| Closure matrix classified | yes | Main task integration evidence; final gates below |
| Live PR feedback target resolved | conditional | exact compliant PR for full `resolve-pr-feedback` mode; N/A after verified noncompliant close |
| Feedback proof checkout bound to PR head | conditional | local committed `HEAD` = fetched PR ref = live `headRefOid` for a compliant PR |
| Unfiltered feedback inventory | conditional | raw top-level comments/reviews plus all resolved/unresolved inline threads compared with helper output for a compliant PR |
| GitHub delivery expectation recorded | yes | Commit/push/update/merge #456; disable auto release and verify skip |
| Active goal checked or created | yes | Batch goal externally blocked; user continuation authorizes work without lifecycle mutation |
| Agent-native pack selected | yes | Required autoclosure pack |
| Agent-facing action surface identified | yes | Published ORM pagination guidance; no executable agent action change |
| Source rule versus generated mirror boundary identified | yes | packages/kitcn/skills/kitcn source regenerated into .agents/skills/kitcn |
| Installed-skill lock versus local-rule owner identified | yes | Product-reference source edit only; no installed skill/lock/rule changes |
| `agent-native-reviewer` loaded or waiver recorded | yes | Full skill read; capability map and manual proof in main task |

Closure matrix:
| Lane | Applies | Owner/proof | Status |
| --- | --- | --- | --- |
| per-PR task ownership | yes | exact #456 + dedicated 445 task plan | passed |
| noncompliant close | no | PR has verified task evidence | N/A |
| source behavior | yes | 132+11 Vitest, 29 Bun focused tests | passed |
| package/API/build | yes | typecheck/build; concatStreams stays internal | passed |
| generated output | yes | sync-kitcn-skill.ts plus cmp | passed |
| fixtures/scenarios | yes | eight fixtures plus verify and full runtime lane passed | passed |
| docs/package skill | yes | pagination Index-union filters mapped to ORM resource; Browser render | passed |
| changeset | yes | six approved-verb public outcomes; paging example | passed |
| agent workflow | no | product guidance only; no rule/helper/lock/action changes | N/A |
| live PR feedback | conditional | compliant: `resolve-pr-feedback` + final P1 read-back; noncompliant: N/A with comment/CLOSED receipts | pending |
| cleanup/review | yes | dead owner removed; delta scan triaged; agent-native map; clean P0/P1 autoreview | passed |
| repository check | yes | `bun check`: 1423 Bun, 1047 Vitest, 124 CLI, all fixtures/verify/runtime | passed |
| GitHub delivery | yes | commit ea939a49; push/feedback/CI/receipt/merge pending | in_progress |

Work Checklist:
- [x] Every PR has its own `task` invocation and dedicated task plan; a batch
      plan or aggregate autoclosure is not used as a substitute.
- [x] Task evidence was verified from the PR body, fetched head, and exact PR
      ownership; otherwise the required comment and `CLOSED` state were read
      back and no source review, repair, merge, or release work continued.
- [x] Intended behavior and exclusions are reconstructed from real sources.
- [ ] Each lane is proven or N/A with a concrete reason.
- [x] Generated output was changed through its owner and regenerated.
- [ ] Package/docs/skill/fixture/scenario/changeset contracts are synchronized.
- [ ] Full `resolve-pr-feedback` ran for the exact compliant PR; every
      actionable P1-or-higher finding was fixed, proved, replied to, and
      resolved or received the required top-level reply receipt.
- [ ] For a compliant PR, local committed `HEAD`, fetched PR ref, and live
      `headRefOid` matched before proof/reply/resolution and after every push.
      For a noncompliant PR, this and all feedback gates are N/A with the
      required remediation-comment and `CLOSED` receipts.
- [ ] Unfiltered top-level PR comments and review bodies were fetched through
      the GitHub API, compared by ID/URL with helper output, and every excluded
      bot/author item was ledgered; identity alone never dismissed feedback.
      Only the exact terminal receipt produced/read back by this run is exempt
      from the versioned ledger.
- [ ] All inline review threads were fetched with GraphQL cursor pagination
      without filtering resolved/outdated items; every thread has priority,
      rationale, relocation, and proof state in the ledger.
- [x] Every actionable feedback item has a persisted P0-P3 priority and
      one-sentence rationale from the autoclosure rubric; ambiguous P1-versus-
      lower items fail closed as P1.
- [ ] Every P1-or-higher proof reran after the final material branch push,
      regardless of file type, including resolved or outdated threads that
      disappear from the helper's unresolved-thread output.
- [ ] Feedback was re-fetched after the last push/reply/resolution and shows
      zero unresolved actionable P1-or-higher findings.
- [ ] After all versioned plan/source updates were pushed, the exact-head P1
      proof/read-back receipt was posted to the PR and read back; no terminal
      receipt-only branch push was created. A post-comment `headRefOid` fetch
      matches the OID recorded in that receipt, and a post-comment helper/raw
      feedback fetch still shows zero actionable P1-or-higher items and no new
      URL lacking a verdict or explicit deferral, except the verified receipt.
- [ ] Any remaining P2-or-lower item has its exact URL plus the user's explicit
      priority deferral recorded; no feedback was silently ignored.
- [x] Accepted cleanup and review findings are closed.
- [ ] PR body and check state match the final evidence.
- [ ] Residual blocker/waiver has exact evidence and next owner.
- [x] Agent-native pack: source-of-truth rule files are edited instead of generated skill mirrors.
- [x] Agent-native pack: the changed agent action is discoverable from the skill/rule text.
- [x] Agent-native pack: generated mirrors are synced when `.agents/rules/**` changed, or N/A reason is recorded.
- [x] Agent-native pack: installed skills are changed only through
      `npx skills add/update/remove`; local rules/templates/helpers stay source-owned.
- [x] Agent-native pack: routing, required receipts, placeholder failure,
      completion representability, and forbidden behavior have eval/smoke rows.
- [x] Agent-native pack: accepted agent-native review findings are fixed or explicitly rejected with reason.
      Product-reference edit only: routing uses existing SKILL.md pointers;
      helper/receipt/placeholder/forbidden-action evals are N/A because none of
      those executable or workflow surfaces changed. Manual reference/mirror
      review found no missing behavior or permission expansion.

Error attempts:
| Failure signature | Count | Next different move | Resolution |
| --- | ---: | --- | --- |
| Query-reader merge conflict | 1 | Preserve canonical #455 reader and remove unreachable helper | Focused tests/typecheck passed |
| intent validate/stale unavailable | 1 | Inspect package bin and call directly | Bundled intent-library exposes list/install only; manual mapping checks passed |

Completion Gates:
| Gate | Applies | Required action | Evidence |
| --- | --- | --- | --- |
| Per-PR task ownership | pending | Record exact PR and dedicated task-plan path | pending |
| Noncompliant PR disposition | pending | Verify task evidence or comment then close and read back | pending |
| Targeted behavior proof | pending | Run smallest missing owning proof | pending |
| Source/generated audit | pending | Prove correct source and regenerated mirrors | pending |
| Package/docs/scenario closure | pending | Run every applicable local contract | pending |
| Feedback proof checkout | conditional | Compliant PR only: require local committed `HEAD` = fetched PR ref = live `headRefOid` before proof/reply/resolution and at terminal verification | pending |
| Live PR feedback resolution | conditional | Compliant PR only: run full `resolve-pr-feedback` and close every actionable P1-or-higher finding; otherwise N/A with noncompliant stop receipts | pending |
| Feedback priority classification | conditional | Compliant PR only: persist P0-P3 plus rationale for every actionable item; classify ambiguous P1-versus-lower as P1 | pending |
| Final P1 proof replay | conditional | Compliant PR only: after the final material branch push, rerun every P1-or-higher proof, including resolved/outdated items | pending |
| Final live feedback read-back | conditional | Compliant PR only: re-fetch helper plus unfiltered top-level/all-thread inventories; require zero actionable P1-or-higher and explicit P2-or-lower deferrals | pending |
| External terminal receipt | conditional | Compliant PR only: post/read exact-head receipt; require receipt/live/fetched/local OID equality and no unrecorded helper/raw URL except that verified receipt | pending |
| Deslop | pending | Run bounded cleanup or N/A | pending |
| Agent-native reviewer | pending | Run for workflow changes or N/A | pending |
| Final lint | yes | Run `bun lint:fix` | pending |
| Repository check | yes | Run `bun check` | pending |
| GitHub delivery | pending | Commit/push/open or update PR and read back | pending |
| Autoreview | yes | Resolve every accepted actionable finding | pending |
| Goal plan complete | yes | Run `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/445-pr-456-autoclosure.md` | pending |
| Agent source / generated sync | pending | Run `bun install` when `.agents/rules/**` changed and verify generated mirrors | pending |
| Installed lock audit | pending | Verify expected lock entries and removed skills through CLI-managed state | pending |
| Agent action discoverability | pending | Source-audit the skill/rule path an agent will read | pending |
| Helper and template smoke | pending | Syntax-check helpers and prove incomplete failure/completed representation when applicable | pending |
| Agent-native review | pending | Load `.agents/skills/agent-native-reviewer/SKILL.md` and close accepted findings, or record N/A | pending |

Phase / pass table:
| Phase | Status | Evidence | Next |
| --- | --- | --- | --- |
| Inventory | in_progress | plan created | missing proof |
| Repair | pending | | review |
| Review/checks | pending | | delivery |
| Delivery | pending | | final audit |
| Closeout | pending | | final |

Verification evidence:
- Integration commit ea939a49. Independent autoreview branch/origin-main,
  codex gpt-5.6-sol high, max P1: exit 0, no actionable findings, 0.9 confidence.
  /tmp/kitcn-pr456-review.log and .md/.json. No runtime edits after review.
- Focused: 132 Vitest passed/1 skipped; 11 read-bound passed; 29 compiler
  passed. Typecheck, lint, build, generated cmp and local rendered docs passed.
  Full repository gate passed with 1423 Bun, 1047 Vitest and 124 CLI tests,
  all eight fixtures, verify and runtime. External receipt remains pending.

Timeline:
- 2026-09-07T15:44:07.942Z Autoclosure plan created.

Reboot status:
| Question | Answer |
| --- | --- |
| Where am I? | Inventory |
| Where am I going? | Repair, review/checks, delivery, final audit |
| What is the goal? | TODO |
| What have I learned? | See closure matrix |
| What have I done? | See timeline |

Open risks:
- Pending.
