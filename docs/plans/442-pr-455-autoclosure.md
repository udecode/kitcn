# PR 455 autoclosure

Objective:
Finish PR #455 through fresh regression proof, review, check and exact-head
GitHub delivery with zero actionable P1 and no package release. Dedicated task
owner: docs/plans/442-index-union-findmany-take-bound.md. This auxiliary plan
records closure gates, not another PR or an independent product scope.

Goal plan:
docs/plans/442-pr-455-autoclosure.md

Template:
docs/plans/templates/autoclosure.md

Primary template:
docs/plans/templates/autoclosure.md

Applied packs:
- agent-native (docs/plans/templates/packs/agent-native.md)

Completion threshold:
- Prove both #442 read-bound legs and all prior feedback, including resolved
  fan-out safety and release-prose P1. Merge only after final receipt, CI and
  OID equality; verify release skipped. Never merge Version Packages.
- No new product scope. Completion requires every applicable lane below to have
  fresh evidence, `bun check` passing, review findings closed, authorized
  GitHub delivery complete, and the goal checker passing.

Verification surface:
- Root cwd: /Users/zbeyens/git/better-convex. Focused index-union tests,
  relation-target memo tests, package build, typecheck, lint, bun check,
  autoreview P0/P1, helper/raw feedback and exact-head GitHub read-back.

Constraints:
- Finish the intended delta; do not invent the next feature.
- Preserve source/generated/package/docs ownership.
- Use a different diagnostic after repeated failure signatures.

Boundaries:
- intended delta: non-paginated indexed findMany preserves its limit under RLS
  and residual filters, while retaining relation guards and ordering.
- allowed repairs: the query owner, direct tests, changeset and active plans.
- unrelated files: preserve; do not treat as blockers
- non-goals: cursor lanes, new APIs, scaffold changes, release, project access.

Output budget strategy:
- Named files only; logs in /tmp. Full feedback persisted before bounded reads.

Blocked condition:
- Missing live feedback or proof access, new contract outside #442, or a
  reproducible environment failure after different safe diagnostics.

Start Gates:
| Gate | Applies | Evidence |
| --- | --- | --- |
| Dedicated task invocation and plan for exact PR | yes | Resumed task for #455; 442-index-union-findmany-take-bound.md |
| Task evidence verified at PR head | yes | Exact single body line; file at d2aa2203 names #455 |
| Active source/plan reconstructed | yes | Full plan, code, tests and raw feedback read |
| Intended delta and exclusions recorded | yes | Boundaries above; no cursor or API expansion |
| Closure matrix classified | yes | See matrix below |
| Live PR feedback target resolved | conditional | exact compliant PR for full `resolve-pr-feedback` mode; N/A after verified noncompliant close |
| Feedback proof checkout bound to PR head | conditional | local committed `HEAD` = fetched PR ref = live `headRefOid` for a compliant PR |
| Unfiltered feedback inventory | conditional | raw top-level comments/reviews plus all resolved/unresolved inline threads compared with helper output for a compliant PR |
| GitHub delivery expectation recorded | yes | User authorized commit/push/replies/merge, no release |
| Active goal checked or created | yes | Existing batch goal externally blocked; user continuation recorded |
| Agent-native pack selected | yes | Required autoclosure pack; no agent action changes |
| Agent-facing action surface identified | no | N/A: ORM query runtime only; plans are execution records |
| Source rule versus generated mirror boundary identified | no | N/A: no rule or skill change |
| Installed-skill lock versus local-rule owner identified | no | N/A: no skill installation changes |
| `agent-native-reviewer` loaded or waiver recorded | no | N/A: no agent workflow change |

Closure matrix:
| Lane | Applies | Owner/proof | Status |
| --- | --- | --- | --- |
| per-PR task ownership | yes | #455 and exact dedicated plan | passed |
| noncompliant close | no | N/A: valid task evidence | N/A |
| source behavior | yes | 11 initial / 27 integrated focused tests | passed |
| package/API/build | yes | Full check includes builds; typecheck 5/5 | passed |
| generated output | no | N/A: no generator/scaffold change | N/A |
| fixtures/scenarios | yes | Full check fresh regeneration and runtime | passed |
| docs/package skill | no | N/A: restores existing documented read contract | N/A |
| changeset | yes | lucky-plums-cough.md public outcomes, kitcn patch | passed |
| agent workflow | no | N/A: no workflow behavior touched | N/A |
| live PR feedback | conditional | compliant: `resolve-pr-feedback` + final P1 read-back; noncompliant: N/A with comment/CLOSED receipts | pending |
| cleanup/review | yes | Bounded comment cleanup; P0/P1 autoreview exit 0 | passed |
| repository check | yes | `bun check` exit 0 | passed |
| GitHub delivery | yes | Whole checkout commit; push/receipt/CI/merge next | pending |

Work Checklist:
- [x] Every PR has its own `task` invocation and dedicated task plan; a batch
      plan or aggregate autoclosure is not used as a substitute.
- [x] Task evidence was verified from the PR body, fetched head, and exact PR
      ownership; otherwise the required comment and `CLOSED` state were read
      back and no source review, repair, merge, or release work continued.
- [x] Intended behavior and exclusions are reconstructed from real sources.
- [ ] Each lane is proven or N/A with a concrete reason.
- [x] Generated output was changed through its owner and regenerated. N/A: no generator changes.
- [x] Package/docs/skill/fixture/scenario/changeset contracts are synchronized. Full check passed; no new scaffold guidance.
- [ ] Full `resolve-pr-feedback` ran for the exact compliant PR; every
      actionable P1-or-higher finding was fixed, proved, replied to, and
      resolved or received the required top-level reply receipt.
- [ ] For a compliant PR, local committed `HEAD`, fetched PR ref, and live
      `headRefOid` matched before proof/reply/resolution and after every push.
      For a noncompliant PR, this and all feedback gates are N/A with the
      required remediation-comment and `CLOSED` receipts.
- [x] Unfiltered top-level PR comments and review bodies were fetched through
      the GitHub API, compared by ID/URL with helper output, and every excluded
      bot/author item was ledgered; identity alone never dismissed feedback.
      Only the exact terminal receipt produced/read back by this run is exempt
      from the versioned ledger.
- [x] All inline review threads were fetched with GraphQL cursor pagination
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
- [x] Any remaining P2-or-lower item has its exact URL plus the user's explicit
      priority deferral recorded; no feedback was silently ignored.
- [x] Accepted cleanup and review findings are closed. Autoreview exit 0, no P0/P1 findings.
- [ ] PR body and check state match the final evidence.
- [ ] Residual blocker/waiver has exact evidence and next owner.
- [x] Agent-native pack: source-of-truth rule files are edited instead of generated skill mirrors. N/A: no rules changed.
- [x] Agent-native pack: the changed agent action is discoverable from the skill/rule text. N/A: no action changed.
- [x] Agent-native pack: generated mirrors are synced when `.agents/rules/**` changed, or N/A reason is recorded. N/A: no rules changed.
- [x] Agent-native pack: installed skills are changed only through
      `npx skills add/update/remove`; local rules/templates/helpers stay source-owned. N/A: no skills changed.
- [x] Agent-native pack: routing, required receipts, placeholder failure,
      completion representability, and forbidden behavior have eval/smoke rows. N/A: no workflow changes.
- [x] Agent-native pack: accepted agent-native review findings are fixed or explicitly rejected with reason. N/A: no workflow changes.

Error attempts:
| Failure signature | Count | Next different move | Resolution |
| --- | ---: | --- | --- |
| None yet | 0 | | |

Completion Gates:
| Gate | Applies | Required action | Evidence |
| --- | --- | --- | --- |
| Per-PR task ownership | yes | Record exact PR and dedicated task-plan path | #455; original task plan verified at head |
| Noncompliant PR disposition | no | N/A: valid task evidence | No closure comment required |
| Targeted behavior proof | yes | Run smallest missing owning proof | 11 initial, 27 integrated tests passed |
| Source/generated audit | no | N/A: no generated source changed | Query runtime and tests only |
| Package/docs/scenario closure | yes | Run every applicable local contract | Full check, package builds and all 8 fixtures passed; docs unchanged |
| Feedback proof checkout | conditional | Compliant PR only: require local committed `HEAD` = fetched PR ref = live `headRefOid` before proof/reply/resolution and at terminal verification | pending |
| Live PR feedback resolution | conditional | Compliant PR only: run full `resolve-pr-feedback` and close every actionable P1-or-higher finding; otherwise N/A with noncompliant stop receipts | pending |
| Feedback priority classification | yes | Persist P0-P3 plus rationale | Original task ledger: two P1, one P2, all resolved |
| Final P1 proof replay | conditional | Compliant PR only: after the final material branch push, rerun every P1-or-higher proof, including resolved/outdated items | pending |
| Final live feedback read-back | conditional | Compliant PR only: re-fetch helper plus unfiltered top-level/all-thread inventories; require zero actionable P1-or-higher and explicit P2-or-lower deferrals | pending |
| External terminal receipt | conditional | Compliant PR only: post/read exact-head receipt; require receipt/live/fetched/local OID equality and no unrecorded helper/raw URL except that verified receipt | pending |
| Deslop | yes | Run bounded cleanup | Slop delta + local lenses; redundant/stale comments shortened |
| Agent-native reviewer | no | N/A: no workflow behavior changes | Agent-native pack classified above |
| Final lint | yes | Run `bun lint:fix` | 970 files clean |
| Repository check | yes | Run `bun check` | Exit 0: 1421 Bun, 1038 Vitest, 124 CLI, 8 fixtures, verify/runtime |
| GitHub delivery | pending | Commit/push/open or update PR and read back | pending |
| Autoreview | yes | Resolve every accepted actionable finding | Branch review against origin/main at c824e87a, exit 0, no P0/P1 findings, confidence 0.93 |
| Goal plan complete | yes | Run `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/442-pr-455-autoclosure.md` | pending |
| Agent source / generated sync | no | N/A: no agent source changes | No generated skill edits |
| Installed lock audit | no | N/A: no skill installation changes | Lock untouched |
| Agent action discoverability | no | N/A: no agent action changes | Product query runtime only |
| Helper and template smoke | no | N/A: no helper/template behavior changes | Plans are execution records |
| Agent-native review | no | N/A: no agent workflow changes | Scope audit complete |

Phase / pass table:
| Phase | Status | Evidence | Next |
| --- | --- | --- | --- |
| Inventory | complete | exact-head compliance and full raw inventory | proof |
| Repair | complete | main integrated; comments only, no new behavior | review |
| Review/checks | complete | review clean; full check passed | delivery |
| Delivery | pending | | final audit |
| Closeout | pending | | final |

Verification evidence:
- /tmp/kitcn-pr455-initial-proof.log: 11 passed at published d2aa2203.
- /tmp/kitcn-pr455-integrated-proof.log: 27 passed with main integrated.
- /tmp/kitcn-pr455-slop.log: merged-main hits outside this PR were excluded;
  no unrelated package cleanup. Local three-lens source audit complete.
- /tmp/kitcn-pr455-lint.log: 970 files clean.
- /tmp/kitcn-pr455-review.log, review.md, review.json: Codex review, P0/P1,
  source head c824e87a, exit 0, no findings. Do not rerun without code changes.
- /tmp/kitcn-pr455-check.log: full repository gate passed, exit 0. Typecheck
  5/5; 1421 Bun, 1038 Vitest, 124 CLI; builds, 8 fixtures and verify/runtime.
- Changeset prose pass: three approved action-led public outcomes, no private
  planner terms, explicit cost caveat. No runtime edits after autoreview.

Timeline:
- 2026-09-07T15:03:54.646Z Autoclosure plan created.

Reboot status:
| Question | Answer |
| --- | --- |
| Where am I? | Inventory |
| Where am I going? | Repair, review/checks, delivery, final audit |
| What is the goal? | Verified #455 merge with no release |
| What have I learned? | See closure matrix |
| What have I done? | See timeline |

Open risks:
- No accepted source-review blocker; final repository/GitHub gates outstanding.
