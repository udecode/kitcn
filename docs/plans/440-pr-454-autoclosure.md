# PR 454 autoclosure

Objective:
Merge #454 with bounded aggregate writes, nested-call visibility, passing checks and zero actionable P1 findings.

Flow mode:
One-shot execution. Exact PR owner remains
docs/plans/2026-09-06-440b-statement-scoped-aggregate-bucket-writes.md.

Requirements:
- Resume task #454 only. #451 merged at 80f7609c; user "never ask, just go"
  authorizes joint cache/queue lifetime correctness repair without another
  design approval. Original no-lifecycle restrictions are superseded.
- No new public API or product scope. Preserve read-your-own-writes, RLS
  enforcement, source ownership and bulk write bounds without callbacks/reads.
- Whole-checkout commit/push, PR edits/replies/resolution and admin merge are
  authorized. Disable auto release, use `[skip release]`, verify release skip;
  never merge Version Packages. User waived walkthrough and deferred P2.
- Sequential work in the original checkout. No timebox or parallel agents.
- Existing batch goal is externally blocked; user continuation is authoritative.
  No fake lifecycle transition. Final handoff reports proofs and residuals.

Linked plans:
- None

Goal plan:
docs/plans/440-pr-454-autoclosure.md

Template:
docs/plans/templates/autoclosure.md

Primary template:
docs/plans/templates/autoclosure.md

Applied packs:
- agent-native (docs/plans/templates/packs/agent-native.md)

Completion threshold:
- For 40 same-key rows, insert/update/delete fold shared bucket/extrema writes
  to one per entry; a key migration writes two of each plus 40 memberships.
- Nested calls from change hooks see [1,2,3,4]; insert policies see [0,1,2,3].
  Existing nested-write corruption, queue serialization and exception cases pass.
- No new product scope. Completion requires every applicable lane below to have
  fresh evidence, `bun check` passing, review findings closed, authorized
  GitHub delivery complete, and the goal checker passing.

Verification surface:
- 121 focused Vitest cases, 58 Bun cases, root typecheck, lint, package build,
  full bun check, P0/P1 branch autoreview, both goal checkers and exact-head
  helper/raw/all-thread feedback inventories with final proof replay.
- Owning cwd: /Users/zbeyens/git/better-convex. Browser route:
  /docs/orm/queries/aggregates, Write costs. Published guidance is paired.

Constraints:
- Finish the intended delta; do not invent the next feature.
- Preserve source/generated/package/docs ownership.
- Use a different diagnostic after repeated failure signatures.

Boundaries:
- intended delta: deferred shared aggregate writes within safe statement scopes
- allowed repairs: ORM runtime, write-batch/cache, builders, lifecycle/RLS,
  tests, paired aggregate docs/skill, changeset and owning plans
- unrelated files: preserve; do not treat as blockers
- non-goals: new public signatures, rank batching, keyed drains, release,
  unrelated cleanup and unsupported direct internal-storage reads

Output budget strategy:
- Named ORM owners only; logs in /tmp. Source slices stay bounded. Initial
  combined plan/skill output was truncated; missing slices were reread before
  implementation. No broad generated/node_modules scans.

Blocked condition:
- Stop only for unavailable feedback/receipt APIs, external actions beyond
  authority or a reproducible environment blocker after distinct repairs.

Feedback ledger:
| URL | Priority | Verdict |
| --- | --- | --- |
| https://github.com/udecode/kitcn/pull/454#issuecomment-5556744293 | N/A | Changeset package/version notice, no requested action |
| https://github.com/udecode/kitcn/pull/454#issuecomment-5556744469 | N/A | Deployment status only; hosted state refreshed before merge |

Local finding ledger:
| Finding | Priority and rationale | Proof | Status |
| --- | --- | --- | --- |
| Hook nested UDF sees zero counts while rows exist | P1: normal read-your-own-writes outcome is wrong | nested hook regression RED [0,0,0,0], GREEN [1,2,3,4] | fixed locally; post-push replay required |

Start Gates:
| Gate | Applies | Evidence |
| --- | --- | --- |
| Dedicated task invocation and plan for exact PR | yes | Resumed task #454 and original exact-owner plan |
| Task evidence verified at PR head | yes | One body line; complete plan at dca6efb9 identifies #454 |
| Active source/plan reconstructed | yes | Issue #440 and comments, original branch plan, main #451 and queue/cache owners |
| Intended delta and exclusions recorded | yes | Requirements/Boundaries above |
| Closure matrix classified | yes | Owners and missing final gates below |
| Live PR feedback target resolved | conditional | exact compliant PR for full `resolve-pr-feedback` mode; N/A after verified noncompliant close |
| Feedback proof checkout bound to PR head | conditional | local committed `HEAD` = fetched PR ref = live `headRefOid` for a compliant PR |
| Unfiltered feedback inventory | conditional | raw top-level comments/reviews plus all resolved/unresolved inline threads compared with helper output for a compliant PR |
| GitHub delivery expectation recorded | yes | Whole-checkout push/admin merge; no release |
| Active goal checked or created | yes | Existing batch goal; external status mismatch recorded |
| Agent-native pack selected | yes | Materialized by autoclosure helper |
| Agent-facing action surface identified | yes | Bulk ORM write/read actions and documented cost model |
| Source rule versus generated mirror boundary identified | yes | Published aggregate reference regenerated via sync-kitcn-skill |
| Installed-skill lock versus local-rule owner identified | no | N/A: no workflow or installed skill change |
| `agent-native-reviewer` loaded or waiver recorded | yes | Action -> public ORM -> queue/cache owner -> regression/build proof map passes |

Closure matrix:
| Lane | Applies | Owner/proof | Status |
| --- | --- | --- | --- |
| per-PR task ownership | yes | Exact #454 body/head/owner | pass |
| noncompliant close | no | N/A: compliance passed | N/A |
| source behavior | yes | 121 integration and 58 unit cases; nested read red/green | pass |
| package/API/build | yes | Typecheck 5/5, build 72 files, import graph tests pass | pass |
| generated output | yes | Published aggregate skill canonically regenerated | pass |
| fixtures/scenarios | yes | No scaffold change; full check owns fresh comparisons/runtime | pending |
| docs/package skill | yes | Paired Write costs, intent gates and rendered real route | pass |
| changeset | yes | tidy-pugs-shave patch describes current safe batching | pass |
| agent workflow | no | N/A: only published product guidance, no general workflow change | N/A |
| live PR feedback | conditional | compliant: `resolve-pr-feedback` + final P1 read-back; noncompliant: N/A with comment/CLOSED receipts | pending |
| cleanup/review | yes | Deslop 179 -> 179, local lenses; structured P0/P1 review next | pending |
| repository check | yes | `bun check` | pending |
| GitHub delivery | yes | Exact-head push/replay/checks/receipt then skip-release merge | pending |

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
- [ ] Any remaining P2-or-lower item has its exact URL plus the user's explicit
      priority deferral recorded; no feedback was silently ignored.
- [ ] Accepted cleanup and review findings are closed.
- [ ] PR body and check state match the final evidence.
- [ ] Residual blocker/waiver has exact evidence and next owner.
- [ ] Agent-native pack: source-of-truth rule files are edited instead of generated skill mirrors.
- [ ] Agent-native pack: the changed agent action is discoverable from the skill/rule text.
- [ ] Agent-native pack: generated mirrors are synced when `.agents/rules/**` changed, or N/A reason is recorded.
- [ ] Agent-native pack: installed skills are changed only through
      `npx skills add/update/remove`; local rules/templates/helpers stay source-owned.
- [ ] Agent-native pack: routing, required receipts, placeholder failure,
      completion representability, and forbidden behavior have eval/smoke rows.
- [ ] Agent-native pack: accepted agent-native review findings are fixed or explicitly rejected with reason.

Error attempts:
| Failure signature | Count | Next different move | Resolution |
| --- | ---: | --- | --- |
| Initial branch name absent locally | 1 | Fetch exact PR branch, then create tracking branch | Switched to dca6efb9 with local/fetched/live equality |
| Five merge conflicts with main | 1 | Source-backed combination of scopes and member write-through | 3f7f29f0; 19 integration + 27 unit tests and typecheck pass |
| Nested hook read sees [0,0,0,0] | 1 | Flush and suspend at user callback boundary | Regression and sibling RLS/exception proof pass |
| Initial docs navigation timed out during compile | 1 | Reuse existing loaded tab | AX and screenshot show both paragraphs; tab/server closed |

Completion Gates:
| Gate | Applies | Required action | Evidence |
| --- | --- | --- | --- |
| Per-PR task ownership | yes | Record exact PR and dedicated task-plan path | #454 original 2026-09-06-440b plan at dca6efb9 |
| Noncompliant PR disposition | no | Verify task evidence or close | N/A: compliance passed |
| Targeted behavior proof | yes | Focused public outcomes and queue invariants | 121 Vitest and 58 Bun cases pass |
| Source/generated audit | yes | Prove correct source and regenerated mirrors | Package owns behavior/reference; canonical mirror sync passed |
| Package/docs/scenario closure | yes | Run every applicable local contract | Types/build/docs pass; full fixture/runtime gate still required |
| Feedback proof checkout | conditional | Compliant PR only: require local committed `HEAD` = fetched PR ref = live `headRefOid` before proof/reply/resolution and at terminal verification | pending |
| Live PR feedback resolution | conditional | Compliant PR only: run full `resolve-pr-feedback` and close every actionable P1-or-higher finding; otherwise N/A with noncompliant stop receipts | pending |
| Feedback priority classification | conditional | Compliant PR only: persist P0-P3 plus rationale for every actionable item; classify ambiguous P1-versus-lower as P1 | pending |
| Final P1 proof replay | conditional | Compliant PR only: after the final material branch push, rerun every P1-or-higher proof, including resolved/outdated items | pending |
| Final live feedback read-back | conditional | Compliant PR only: re-fetch helper plus unfiltered top-level/all-thread inventories; require zero actionable P1-or-higher and explicit P2-or-lower deferrals | pending |
| External terminal receipt | conditional | Compliant PR only: post/read exact-head receipt; require receipt/live/fetched/local OID equality and no unrecorded helper/raw URL except that verified receipt | pending |
| Deslop | yes | Run bounded cleanup | 179 -> 179, 4 added/4 resolved signal locations; async scope wrappers and error preservation remain necessary |
| Agent-native reviewer | yes | Source/route/proof map | Public bulk/nested ORM API -> write-batch/cache -> paired reference -> tests/build; no hidden human-only step |
| Final lint | yes | Run `bun lint:fix` | pending |
| Repository check | yes | Run `bun check` | pending |
| GitHub delivery | yes | Commit/push/update PR and read back | pending |
| Autoreview | yes | Resolve every accepted actionable finding | pending |
| Goal plan complete | yes | Run `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/440-pr-454-autoclosure.md` | pending |
| Agent source / generated sync | no | Workflow source changes only | N/A: no rule/workflow changes; published product reference regenerated separately |
| Installed lock audit | no | Installed-skill changes only | N/A: no installed skill or lock changes |
| Agent action discoverability | yes | Source-audit agent route | Core skill points to aggregate resource; current Write costs preserved |
| Helper and template smoke | no | Executable workflow changes only | N/A: no helper/template changes |
| Agent-native review | yes | Close parity gaps | Local action/source/proof map passes; no accepted finding |

Phase / pass table:
| Phase | Status | Evidence | Next |
| --- | --- | --- | --- |
| Inventory | complete | Exact compliant #454 and raw/helper inventories | proof |
| Repair | complete | Main integration plus nested-read callback boundary | review |
| Review/checks | in_progress | Focused proof/docs/build pass | full gate and frozen review |
| Delivery | pending | | final audit |
| Closeout | pending | | final |

Verification evidence:
- /tmp/kitcn-pr454-nested-read-red.log: real registered nested mutation sees
  [0,0,0,0] from four change hooks. Green log sees [1,2,3,4]. Insert policy
  nested reads see [0,1,2,3]. Callback failure/pre-flush failure paths pass.
- /tmp/kitcn-pr454-focused.log: 121 Vitest cases across 12 files pass.
  /tmp/kitcn-pr454-unit.log: 58 Bun cases across six files pass. Root
  typecheck 5/5, lint and build pass; build emits 72 files.
- Docs coverage: queries/aggregates.mdx Write costs -> published
  references/features/aggregates.md Write costs -> generated local mirror.
  Resource-only delta; no parity drops or setup/core changes. Intent validation
  passes; both packages current. Browser real route AX and screenshot verified
  heading plus both paragraphs. Walkthrough waived; no responsive claim.
- Architecture: public API unchanged; builders own statement lifetime; user
  lifecycle/RLS callbacks flush queues and suspend batching/cache reuse;
  aggregate runtime owns eager memberships and folded bucket/extrema writes;
  transaction anchor canonicalizes wrappers. RLS denies/failures retain their
  owner. Import-graph tests pass; CLI/scaffolds N/A, no runtime-wide registry.

Timeline:
- 2026-09-07T14:01:11.398Z Autoclosure plan created.

Reboot status:
| Question | Answer |
| --- | --- |
| Where am I? | Source repair and focused proof complete; full check/review next |
| Where am I going? | Repair, review/checks, delivery, final audit |
| What is the goal? | Merge #454 with bounded writes and correct nested reads |
| What have I learned? | See closure matrix |
| What have I done? | See timeline |

Open risks:
- Full check, frozen P0/P1 review, hosted gates and final receipt are not yet
  complete. Callback-heavy writes can flush per row; preserving nested reads
  wins over batching across arbitrary user code. No new public signatures.
