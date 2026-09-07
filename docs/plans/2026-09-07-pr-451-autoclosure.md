# PR 451 autoclosure

Objective:
Merge #451 with bucket/member reads bounded by distinct keys/documents, correct aggregate values, passing checks and zero actionable P1 findings.

Flow mode:
One-shot execution. Resume `task` for exactly #451 and
docs/plans/440-memoize-aggregate-bucket-and-member-reads.md, then autoclosure.

Requirements:
- User correction: "never ask, just go" authorizes the requested joint
  cache-lifetime repair with #454. Execute without another design approval.
  Keep #451 as the read-cache owner and #454 as the deferred-write owner.
  Runtime-only and no-lifecycle exclusions below are superseded for this repair.
  A safe cache segment ends at statement exit or arbitrary user callbacks;
  transaction-wide reuse across nested UDFs is not a supportable guarantee.
  Preserve bulk bounds inside uninterrupted statements and prove nested calls.
- User: "No walk needed . Sweep all other prs"; no walkthrough in this sweep.
- Earlier authorization permits whole-checkout commit/push, replies,
  resolutions and admin merge without approval prompts. No Version Packages
  merge; disable auto release and use `[skip release]`, verifying job skip.
- Preserve existing P2 deferral. Fix and replay every actionable P1.
- Sequential work in the original checkout; preserve unrelated changes.
- Stage (a) only: bucket/member read caching; stage (b) belongs to #454.
- No new public API, alias-schema fix, nested-mutation contract or extrema
  read optimization. No timebox. Final handoff lists proofs and residuals.

Linked plans:
- None. The original dedicated task plan remains the exact PR owner.

Goal plan:
docs/plans/2026-09-07-pr-451-autoclosure.md

Template:
docs/plans/templates/autoclosure.md

Primary template:
docs/plans/templates/autoclosure.md

Applied packs:
- agent-native (docs/plans/templates/packs/agent-native.md)

Completion threshold:
- Six reconcile read-amplification tests pass: bucket probes 1/2/1/1 and
  correct aggregate values; member probes scale with distinct documents.
- Superseding safety contract: bulk insert/update/delete retain 1/2/1 bucket
  probes; separate statements reload their rows. Nested mutation correctness,
  including calls inside hooks, is mandatory. The old cross-statement 1/0
  bucket/member bound is withdrawn because it requires stale snapshots.
- Aggregate/count/transaction memo tests, kitcn build, full check and final
  review pass; exact-head terminal receipt verified before merge.
- No new product scope. Completion requires every applicable lane below to have
  fresh evidence, `bun check` passing, review findings closed, authorized
  GitHub delivery complete, and the goal checker passing.

Verification surface:
- Fresh repair evidence: 66 focused tests and 3 write-scope failure-path unit
  tests pass; root typecheck 5/5, lint and package build pass. Intent validate
  passes and intent stale reports both packages current. Browser inspection of
  /docs/orm/queries/aggregates confirms the Write costs paragraph renders.
- Full gate attempt passed 1400 Bun, 1014 Vitest and 124 CLI tests, then found
  upstream lucide-react ^1.41.0 -> ^1.42.0 snapshot drift. Canonical fixtures:sync
  completed all 8 templates; only six fixture package.json files changed.
  Fresh full gate passes: 1403 Bun, 1014 Vitest, 124 CLI tests, all eight
  fixture comparisons and generated-app runtime lanes. P0/P1 branch review
  on b94b6634 exits 0 with no accepted/actionable findings.
- Focused reconcile suite, aggregate integration tests, count.test.ts and
  transaction-cache tests; package build, lint, full bun check, deslop,
  agent-native review and final P0/P1 branch autoreview.
- Full helper/raw feedback inventory including resolved/outdated threads;
  post-push P1 replay if any, receipt/head/ref/local equality.
- Owning cwd: /Users/zbeyens/git/better-convex.

Constraints:
- Finish the intended delta; do not invent the next feature.
- Preserve source/generated/package/docs ownership.
- Use a different diagnostic after repeated failure signatures.

Boundaries:
- intended delta: write-path-only aggregate bucket/member row memo with
  write-through updates and exact invalidation during clearing.
- allowed repairs: runtime.ts, transaction-cache.ts, write-cache.ts, statement
  builders, lifecycle/user-policy boundaries, owning tests, paired docs,
  changeset and both #451 task/closeout plans.
- unrelated files: preserve; do not treat as blockers
- non-goals: stage (b) batching, new lifecycle/public APIs, extrema read caching
  and release. Nested mutation correctness is part of the authorized repair.

Output budget strategy:
- Read the named owner/test files and bounded diffs; full check/review logs in
  /tmp. No broad generated or node_modules scans.

Blocked condition:
- Stop for unavailable feedback/receipt APIs, a reproducible environment
  blocker after distinct repairs, or a contract decision outside this scope.

Initial evidence:
- Compliance passed: one body task-plan line; complete original 553-line plan
  read from refs/pr/451; exact #451 owner. Issue #440 and both comments read.
- Local HEAD = fetched refs/pr/451 = live head
  925e7d90233efe85e66c0d131c207e8e499b26b4 before source/feedback review.
- Full helper: 0 threads, 1 top-level comment, 0 review bodies. Raw: 2 top-level
  comments, 0 reviews, 0 threads; all pages exhausted. No P0/P1 or deferred P2.
- Existing batch goal is externally marked blocked; latest user continuation
  is authoritative. No fake resume/completion transition was requested.

Feedback ledger:
| URL | Priority | Verdict |
| --- | --- | --- |
| https://github.com/udecode/kitcn/pull/451#issuecomment-5556268975 | N/A | Changeset package/version notice, no requested action |
| https://github.com/udecode/kitcn/pull/451#issuecomment-5556269145 | N/A | Vercel deployment status; refresh at final head |

Start Gates:
| Gate | Applies | Evidence |
| --- | --- | --- |
| Dedicated task invocation and plan for exact PR | yes | Resumed task #451; original dedicated plan read completely |
| Task evidence verified at PR head | yes | One body path, exact 925e7d90 head plan and #451 owner |
| Active source/plan reconstructed | yes | Issue #440 stage a, runtime/memo diff and all 6 regression cases |
| Intended delta and exclusions recorded | yes | Requirements/Boundaries above; stage b remains #454 |
| Closure matrix classified | yes | Applicable owners identified below |
| Live PR feedback target resolved | conditional | exact compliant PR for full `resolve-pr-feedback` mode; N/A after verified noncompliant close |
| Feedback proof checkout bound to PR head | conditional | local committed `HEAD` = fetched PR ref = live `headRefOid` for a compliant PR |
| Unfiltered feedback inventory | conditional | raw top-level comments/reviews plus all resolved/unresolved inline threads compared with helper output for a compliant PR |
| GitHub delivery expectation recorded | yes | Whole checkout push/admin merge; auto release disabled; no Version Packages |
| Active goal checked or created | yes | Existing batch goal and external status mismatch recorded |
| Agent-native pack selected | yes | Autoclosure template materialized with agent-native |
| Agent-facing action surface identified | yes | Aggregate maintenance and exact per-PR closeout |
| Source rule versus generated mirror boundary identified | yes | Runtime and transaction-cache own behavior; no rule edits |
| Installed-skill lock versus local-rule owner identified | no | N/A: no installed workflow change |
| `agent-native-reviewer` loaded or waiver recorded | yes | Action -> runtime owner -> read-count tests -> PR evidence map passes |

Closure matrix:
| Lane | Applies | Owner/proof | Status |
| --- | --- | --- | --- |
| per-PR task ownership | yes | Exact #451 body/head/plan | pass |
| noncompliant close | no | N/A: compliance passed | N/A |
| source behavior | yes | 66 focused tests plus 3 write-scope unit tests; nested mutations, hooks and RLS preserve counts | pass |
| package/API/build | yes | Build passed; entry exports unchanged | pass |
| generated output | yes | Published aggregate reference regenerated into local skill; fixture sync completed | pass |
| fixtures/scenarios | yes | All 8 fixture comparisons and runtime lanes passed | pass |
| docs/package skill | yes | Paired Write costs reference, intent validation/staleness and rendered route proof | pass |
| changeset | yes | quiet-moons-invent patch covers safe statement reuse and nested-call correctness | pass |
| agent workflow | no | N/A: no workflow behavior changed | N/A |
| live PR feedback | conditional | compliant: `resolve-pr-feedback` + final P1 read-back; noncompliant: N/A with comment/CLOSED receipts | pending |
| cleanup/review | yes | Deslop inspected; P0/P1 branch autoreview exits 0 on b94b6634 | pass |
| repository check | yes | Fresh `bun check` exits 0 after canonical fixture sync | pass |
| GitHub delivery | yes | Post-push replay, hosted gates, receipt and skip-release merge | in_progress |

Work Checklist:
- [x] Every PR has its own `task` invocation and dedicated task plan; a batch
      plan or aggregate autoclosure is not used as a substitute.
- [x] Task evidence was verified from the PR body, fetched head, and exact PR
      ownership; otherwise the required comment and `CLOSED` state were read
      back and no source review, repair, merge, or release work continued.
- [x] Intended behavior and exclusions are reconstructed from real sources.
- [ ] Each lane is proven or N/A with a concrete reason.
- [x] Generated output was changed through its owner and regenerated.
- [x] Package/docs/skill/fixture/scenario/changeset contracts are synchronized.
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

Error attempts:
| Failure signature | Count | Next different move | Resolution |
| --- | ---: | --- | --- |
| Plan patch had an unmatched context line; no edit applied | 2 | Exact source-backed mechanical replacement | Applied successfully |

Completion Gates:
| Gate | Applies | Required action | Evidence |
| --- | --- | --- | --- |
| Per-PR task ownership | yes | Record exact PR and dedicated task-plan path | Exact #451 original task plan and body/head ownership |
| Noncompliant PR disposition | no | Verify task evidence or comment then close and read back | N/A: valid per-PR task evidence |
| Targeted behavior proof | yes | Run smallest missing owning proof | Three nested-UDF red/green regressions and 69 focused cases pass |
| Source/generated audit | yes | Prove correct source and regenerated mirrors | Published aggregate reference regenerated; eight fixtures canonically synchronized |
| Package/docs/scenario closure | yes | Run every applicable local contract | Package build/full check pass; paired Write costs references and rendered route verified |
| Feedback proof checkout | conditional | Compliant PR only: require local committed `HEAD` = fetched PR ref = live `headRefOid` before proof/reply/resolution and at terminal verification | pending |
| Live PR feedback resolution | conditional | Compliant PR only: run full `resolve-pr-feedback` and close every actionable P1-or-higher finding; otherwise N/A with noncompliant stop receipts | pending |
| Feedback priority classification | yes | Compliant PR only: persist P0-P3 plus rationale for every actionable item; classify ambiguous P1-versus-lower as P1 | No actionable initial findings; both raw comments ledgered |
| Final P1 proof replay | conditional | Compliant PR only: after the final material branch push, rerun every P1-or-higher proof, including resolved/outdated items | pending |
| Final live feedback read-back | conditional | Compliant PR only: re-fetch helper plus unfiltered top-level/all-thread inventories; require zero actionable P1-or-higher and explicit P2-or-lower deferrals | pending |
| External terminal receipt | conditional | Compliant PR only: post/read exact-head receipt; require receipt/live/fetched/local OID equality and no unrecorded helper/raw URL except that verified receipt | pending |
| Deslop | yes | Run bounded cleanup or N/A | 176 -> 176 findings; zero added/worsened occurrences |
| Agent-native reviewer | yes | Run for workflow changes or N/A | Action/source/proof/PR route passes; no hidden human-only step |
| Final lint | yes | Run `bun lint:fix` | 966 files checked; pass |
| Repository check | yes | Run `bun check` | Exit 0; /tmp/kitcn-pr451-scope-check-final.log; 1403 Bun, 1014 Vitest, 124 CLI, 8 fixture comparisons and runtime lanes |
| GitHub delivery | yes | Post-push replay, hosted gates, receipt and skip-release merge | in_progress |
| Autoreview | yes | Resolve every accepted actionable finding | P0/P1 branch review on b94b6634 exits 0; /tmp/kitcn-pr451-scope-review.md and .json |
| Goal plan complete | yes | Run `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-09-07-pr-451-autoclosure.md` | pending |
| Agent source / generated sync | no | Run `bun install` when `.agents/rules/**` changed and verify generated mirrors | N/A: no rule or generated workflow source changed |
| Installed lock audit | no | Verify expected lock entries and removed skills through CLI-managed state | N/A: no installed skill changes |
| Agent action discoverability | yes | Source-audit the skill/rule path an agent will read | Aggregate API -> runtime/memo -> owning tests/build -> exact task plan |
| Helper and template smoke | no | Syntax-check helpers and prove incomplete failure/completed representation when applicable | N/A: no helper/template modification |
| Agent-native review | yes | Load `.agents/skills/agent-native-reviewer/SKILL.md` and close accepted findings, or record N/A | No accepted/actionable parity finding |

Phase / pass table:
| Phase | Status | Evidence | Next |
| --- | --- | --- | --- |
| Inventory | complete | Exact PR/source/raw feedback audited | proof |
| Repair | complete | Statement/callback cache lifetime fixes nested mutation corruption; 69 focused cases pass | review |
| Review/checks | complete | Full check exits 0; frozen P0/P1 branch review clean | delivery |
| Delivery | pending | | final audit |
| Closeout | pending | | final |

Verification evidence:
- Current repair: /tmp/kitcn-pr451-scope-check-final.log exits 0, 1403 Bun,
  1014 Vitest, 124 CLI, eight fixture comparisons and all runtime lanes.
  /tmp/kitcn-pr451-scope-review.md and .json report zero accepted/actionable
  P0/P1 findings on b94b6634. First review was invalidated by concurrent plan
  edits; no clean result was claimed from it. Replacement checkout stayed frozen.
- 56 aggregate/count integration tests and 8 transaction memo tests passed.
- Package build passed before and after the comment-only source cleanup;
  /tmp/kitcn-pr451-build.log. bun install generated no remaining delta.
- All metric bucket/member writers are in applyBucketDelta, membership flush
  and clearCountIndexChunk; writes update/retire memo entries. Rank writes are
  isolated by kind. Query reads retain getBucketByKey rather than memo wrappers.
- Deslop: zero occurrence changes. Agent-native review passes: aggregate
  action -> runtime/memo owner -> six read-bound cases and count suite -> PR.
- Full check: /tmp/kitcn-pr451-check.log, exit 0. 1400 Bun, 1011 Vitest,
  124 CLI tests; 8 fixture comparisons and runtime smoke lanes passed.

Timeline:
- 2026-09-07: User authorized joint lifetime repair. Using major-task, vision
  and TDD; existing plan retained rather than replaced after durable work.
  Fresh nested-mutation red proof returns 2 instead of 3. Goal control remains
  externally blocked; latest instruction authorizes execution without faking
  a goal-state transition. No Version Packages merge authorized.
  Oversized combined skill read was truncated; required omitted instructions
  reread by bounded slices. Subsequent source reads are capped by owner.
  Architecture map: public ORM signatures unchanged; builders own scope;
  lifecycle/user callbacks end reusable segments; aggregate runtime owns row
  snapshots; canonical data remains Convex tables. Auth identity unchanged,
  policy callbacks must suspend caching. New helper stays dependency-light.
  CLI/scaffolds N/A. Package tests/build/check and paired docs own proof.
- 2026-09-07T09:04:48.264Z Autoclosure plan created.

Reboot status:
| Question | Answer |
| --- | --- |
| Where am I? | Authorized repair passes full check and P1 review; push and exact-head delivery next |
| Where am I going? | Repair, review/checks, delivery, final audit |
| What is the goal? | Merge #451 with bounded reads, correct values and zero actionable P1 |
| What have I learned? | See closure matrix |
| What have I done? | See timeline |

Open risks:
- Local scope repair passes 9 reconciliation cases, including three nested-UDF
  regressions: between statements, change hook and RLS insert policy. Each
  regression was observed returning 2 for 3 writes before its boundary fix.
  First hook harness used an unsupported createOrm option; an explicit callback
  assertion caught that, then schema.triggers supplied the valid red proof.
  Broader focused proof, full check and final P0/P1 branch review pass.
- Docs sync: queries/aggregates.mdx Write costs -> published
  references/features/aggregates.md Write costs; resource section, no parity
  drops, no new setup/core copy. Canonical skill regenerated with its helper.
- Agent parity: bulk/nested ORM writes -> public ORM API -> write-cache,
  builders, lifecycle and evaluator -> nested public count regressions -> PR.
  No new agent-only or human-only interface. No general workflow change.
- Deslop: source inspected under rules/type/simplicity lenses; scope wrappers
  own finally cleanup rather than merely forwarding. Directory hotspot and
  unchanged branch-baseline hits do not justify unrelated edits.
- Final branch autoreview on b78a79d7 found one accepted P1 at runtime.ts:2005:
  nested ctx.runMutation writes can stale caller row snapshots and corrupt
  later maintenance. This blocks merge; documenting it is insufficient.
  Diagnosis/TDD will first reproduce the actual nested mutation call and then
  determine whether the existing runtime/cache owner can fix it without a
  new public contract or losing the promised read bounds.
- Earlier raw nested runMutation corruption is fixed locally by statement and
  callback boundaries; hosted gates and independent review remain required.
- Extrema reads and eager patch counts remain outside stage a.
- Hosted gates, final feedback receipt and merge are not yet complete.

Historical blocking evidence (superseded by authorized scope repair):
- `NO_PROXY=localhost,127.0.0.1 bunx vitest run
  packages/kitcn/src/orm/aggregate-index/reconcile.read-amplification.vitest.ts
  -t 'nested mutation writes'`: deterministic failure `expected 2 to be 3`.
  The test uses real `ctx.runMutation` through registered Convex test modules:
  outer insert, nested insert, outer insert, then an indexed public count.
- First harness used unfiltered count and passed because that path did not
  exercise the affected aggregate index; the final harness filters orgId and
  directly catches the persisted aggregate corruption. No production fix made.
- Installed Convex database.ts:378 exposes only vars.commitTs, a commit-time
  placeholder, not a shared mutable cache or revision. Database writer calls
  do not expose a transaction revision for safe snapshot validation.
- Local Convex backend source confirms fresh JS contexts for nested UDFs:
  crates/isolate/src/environment/udf/mod.rs:390 passes None to run_nested;
  :604-608 creates a fresh v8::Context. A module-global invalidation counter
  could fool the in-process test but would not prove real nested-call safety.
- Returning to uncached reads fixes correctness but removes stage a's promised
  read bounds. Cache lifetime around controlled statements/hooks would cross
  this plan's runtime-only/no-lifecycle boundary and interacts with #454.
- Diagnostic cache bypass confirmed the trade-off: nested-mutation regression
  passed, but four existing read-bound cases failed (12 vs 1, 24 vs 2,
  12 vs 1, 24 vs 1 reads). All seven cases: 4 failed, 3 passed. An earlier
  attempt restored the source before execution and is excluded as invalid.
  Both cache reads were restored; runtime.ts has no uncommitted diff.
- Required decision: authorize a joint lifetime redesign with #454, or narrow
  the stage-a contract. No silent deferral or downgrade of this P1 is allowed.
- Keep the regression and blocker evidence locally. Do not push the failing
  branch or merge #451. Other remaining PRs are not claimed closed.
