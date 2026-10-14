# {{TITLE}}

Objective:
TODO: State the already-started work and exact clean/ship threshold.

Goal plan:
{{PLAN_PATH}}

Template:
{{TEMPLATE_PATH}}

Completion threshold:
- TODO: Define the complete closeout matrix.
- No new product scope. Completion requires every applicable lane below to have
  fresh evidence, `bun check` passing, review findings closed, authorized
  GitHub delivery complete, and the goal checker passing.

Verification surface:
- TODO: Name targeted proof, generation, reviews, `bun check`, and PR read-back.

Constraints:
- Finish the intended delta; do not invent the next feature.
- Preserve source/generated/package/docs ownership.
- Use a different diagnostic after repeated failure signatures.

Boundaries:
- intended delta: pending
- allowed repairs: pending
- unrelated files: preserve; do not treat as blockers
- non-goals: pending

Output budget strategy:
- TODO: Scope closeout audits and cap noisy commands.

Blocked condition:
- TODO: Name missing authority, external action, or proven environment blocker.

Start Gates:
| Gate | Applies | Evidence |
| --- | --- | --- |
| Immutable PR head fetched | pending | `refs/pr/<number>` = live `headRefOid` |
| Task intake classified | pending | exact-head `complete`, `recoverable`, or `absent` evidence |
| Complete task evidence verified | conditional | body path + head file + exact PR owner |
| Recoverable task state adopted | conditional | exact-PR `task` plan/body evidence repaired and read back at new head |
| Active source/plan reconstructed | pending | pending |
| Intended delta and exclusions recorded | pending | pending |
| Closure matrix classified | pending | pending |
| Live PR feedback target resolved | conditional | exact complete or recovered PR for full `resolve-pr-feedback` mode; N/A after verified absent-state close |
| Feedback proof checkout bound to PR head | conditional | local committed `HEAD` = fetched PR ref = live `headRefOid` for a complete or recovered PR |
| Unfiltered feedback inventory | conditional | raw top-level comments/reviews plus all resolved/unresolved inline threads compared with helper output for a complete or recovered PR |
| GitHub delivery expectation recorded | pending | pending |
| Active goal checked or created | pending | pending |

Closure matrix:
| Lane | Applies | Owner/proof | Status |
| --- | --- | --- | --- |
| task intake classification | pending | immutable-head `complete` / `recoverable` / `absent` evidence | pending |
| per-PR task ownership | conditional | complete evidence or recovered exact PR + dedicated task plan | pending |
| recoverable task adoption | conditional | preserve branch + exact-PR `task` + repaired evidence read-back | pending |
| absent-state close | conditional | exact missing-state comment + `CLOSED` read-back | pending |
| source behavior | pending | pending | pending |
| package/API/build | pending | pending | pending |
| generated output | pending | pending | pending |
| fixtures/scenarios | pending | pending | pending |
| docs/package skill | pending | pending | pending |
| changeset | pending | pending | pending |
| agent workflow | pending | pending | pending |
| live PR feedback | conditional | complete/recovered: `resolve-pr-feedback` + final P1 read-back; absent: N/A with comment/CLOSED receipts | pending |
| cleanup/review | pending | pending | pending |
| repository check | yes | `bun check` | pending |
| GitHub delivery | pending | pending | pending |

Work Checklist:
- [ ] Every PR has its own `task` invocation and dedicated task plan; a batch
      plan or aggregate autoclosure is not used as a substitute.
- [ ] Bounded intake classified immutable-head task state as `complete`,
      `recoverable`, or `absent` from source-backed intent plus delta coherence;
      incomplete evidence alone was not classified as absent.
- [ ] Recoverable work was preserved and adopted through `task` for the exact
      PR; its dedicated plan/body evidence was committed, pushed, and read back
      at the new head before normal closeout continued.
- [ ] Complete or recovered task evidence was verified from the PR body,
      fetched head, and exact PR ownership. Absent state instead has the exact
      missing-state comment and `CLOSED` read-back, and no full review, merge,
      or release work continued.
- [ ] Intended behavior and exclusions are reconstructed from real sources.
- [ ] Each lane is proven or N/A with a concrete reason.
- [ ] Generated output was changed through its owner and regenerated.
- [ ] Package/docs/skill/fixture/scenario/changeset contracts are synchronized.
- [ ] Full `resolve-pr-feedback` ran for the exact complete or recovered PR;
      every
      actionable P1-or-higher finding was fixed, proved, replied to, and
      resolved or received the required top-level reply receipt.
- [ ] For a complete or recovered PR, local committed `HEAD`, fetched PR ref,
      and live `headRefOid` matched before proof/reply/resolution and after
      every push.
      For an absent-state PR, this and all feedback gates are N/A with the exact
      missing-state comment and `CLOSED` receipts.
- [ ] Unfiltered top-level PR comments and review bodies were fetched through
      the GitHub API, compared by ID/URL with helper output, and every excluded
      bot/author item was ledgered; identity alone never dismissed feedback.
      Only the exact terminal receipt produced/read back by this run is exempt
      from the versioned ledger.
- [ ] All inline review threads were fetched with GraphQL cursor pagination
      without filtering resolved/outdated items; every thread has priority,
      rationale, relocation, and proof state in the ledger.
- [ ] Every actionable feedback item has a persisted P0-P3 priority and
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
- [ ] Accepted cleanup and review findings are closed.
- [ ] PR body and check state match the final evidence.
- [ ] Residual blocker/waiver has exact evidence and next owner.

Error attempts:
| Failure signature | Count | Next different move | Resolution |
| --- | ---: | --- | --- |
| None yet | 0 | | |

Completion Gates:
| Gate | Applies | Required action | Evidence |
| --- | --- | --- | --- |
| Task intake classification | pending | Record immutable-head `complete`, `recoverable`, or `absent` sources and rationale | pending |
| Per-PR task ownership | pending | Record exact PR and complete or recovered task-plan path | pending |
| Recoverable task adoption | conditional | Preserve current work, run exact-PR `task`, repair plan/body evidence, and read back at new head | pending |
| Absent-state disposition | conditional | Name the missing usable state, comment, close, and read back | pending |
| Targeted behavior proof | pending | Run smallest missing owning proof | pending |
| Source/generated audit | pending | Prove correct source and regenerated mirrors | pending |
| Package/docs/scenario closure | pending | Run every applicable local contract | pending |
| Feedback proof checkout | conditional | Complete or recovered PR only: require local committed `HEAD` = fetched PR ref = live `headRefOid` before proof/reply/resolution and at terminal verification | pending |
| Live PR feedback resolution | conditional | Complete or recovered PR only: run full `resolve-pr-feedback` and close every actionable P1-or-higher finding; otherwise N/A with absent-state stop receipts | pending |
| Feedback priority classification | conditional | Complete or recovered PR only: persist P0-P3 plus rationale for every actionable item; classify ambiguous P1-versus-lower as P1 | pending |
| Final P1 proof replay | conditional | Complete or recovered PR only: after the final material branch push, rerun every P1-or-higher proof, including resolved/outdated items | pending |
| Final live feedback read-back | conditional | Complete or recovered PR only: re-fetch helper plus unfiltered top-level/all-thread inventories; require zero actionable P1-or-higher and explicit P2-or-lower deferrals | pending |
| External terminal receipt | conditional | Complete or recovered PR only: post/read exact-head receipt; require receipt/live/fetched/local OID equality and no unrecorded helper/raw URL except that verified receipt | pending |
| Deslop | pending | Run bounded cleanup or N/A | pending |
| Agent-native reviewer | pending | Run for workflow changes or N/A | pending |
| Final lint | yes | Run `bun lint:fix` | pending |
| Repository check | yes | Run `bun check` | pending |
| GitHub delivery | pending | Commit/push/open or update PR and read back | pending |
| Autoreview | yes | Resolve every accepted actionable finding | pending |
| Goal plan complete | yes | Run `node .agents/skills/autogoal/scripts/check-complete.mjs {{PLAN_PATH}}` | pending |

Phase / pass table:
| Phase | Status | Evidence | Next |
| --- | --- | --- | --- |
| Inventory | in_progress | plan created | missing proof |
| Repair | pending | | review |
| Review/checks | pending | | delivery |
| Delivery | pending | | final audit |
| Closeout | pending | | final |

Verification evidence:
- Pending.

Timeline:
- {{CREATED_AT}} Autoclosure plan created.

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
