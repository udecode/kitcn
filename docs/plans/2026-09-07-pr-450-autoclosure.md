# PR 450 autoclosure

Objective:
Merge #450 with one pre-image read per aggregate/rank row, preserved user-hook behavior, passing checks and zero actionable P1 findings.

Flow mode:
One-shot execution. Resume `task` for exactly PR #450 and its dedicated plan
`docs/plans/444-orm-double-pre-image-read.md`, then autoclosure.

Requirements:
- User: "No walk needed . Sweep all other prs"; no walkthrough in this sweep.
- Earlier authorization: commit, push, reply, resolve and admin merge without
  approval prompts; do not merge Version Packages. Disable auto release and
  use a `[skip release]` squash subject; verify the release job skipped.
- Keep the existing P2 deferral; fix and replay every actionable P1.
- Work sequentially in the original checkout, preserving unrelated changes.
- Recheck #430 separately; its older findings are outside this PR's fix scope.
- No timebox. Final handoff: merged/open PRs, exact proof and residual risks.

Linked plans:
- None. The original task plan remains the exact PR owner.

Goal plan:
docs/plans/2026-09-07-pr-450-autoclosure.md

Template:
docs/plans/templates/autoclosure.md

Primary template:
docs/plans/templates/autoclosure.md

Applied packs:
- agent-native (docs/plans/templates/packs/agent-native.md)

Completion threshold:
- Five-row aggregate/rank updates read five target pre-images; ordinary hooks
  and unhooked tables retain their baseline; user before-hooks retain re-reads.
- CLEARING guard runs before insert/patch/replace/delete, including gone rows.
- No new product scope. Completion requires every applicable lane below to have
  fresh evidence, `bun check` passing, review findings closed, authorized
  GitHub delivery complete, and the goal checker passing.

Verification surface:
- Focused lifecycle/read-amplification/write-barrier suites, package build,
  full `bun check`, deslop, agent-native review and final P0/P1 autoreview.
- Replay P1 source invariant: lifecycle injection uses `tableConfig.name`,
  consistent with aggregate maintenance/backfill/read owners.
- Exact-head helper/raw feedback inventories and terminal receipt read-back.
- Proof cwd: /Users/zbeyens/git/better-convex.

Constraints:
- Finish the intended delta; do not invent the next feature.
- Preserve source/generated/package/docs ownership.
- Use a different diagnostic after repeated failure signatures.

Boundaries:
- intended delta: lifecycle-local writeBarrier, read-bound tests and changeset.
- allowed repairs: those owners and both PR task/closeout plans.
- unrelated files: preserve; do not treat as blockers
- non-goals: alias-schema redesign, hook deadlock fixes, public API changes,
  additional read optimizations, release and unrelated product scope.

Output budget strategy:
- Read named source/tests and bounded diffs. Keep full-check/review logs in
  /tmp; inspect summaries and exact failure owners. No broad generated scans.

Blocked condition:
- Stop for unavailable feedback/receipt APIs, repeated proven environment
  failure after distinct repairs, or a required out-of-scope decision.

Initial feedback ledger (all fragments under https://github.com/udecode/kitcn/pull/450):
| URL | Priority | Verdict and proof |
| --- | --- | --- |
| #discussion_r3942653297 | P1 | Current source uses tableConfig.name; replay invariant and barrier suites after final push, then resolve. |
| #discussion_r3942721480 | P1 | Existing substantive fix reply matches current table-key owner; verify again before resolution. |
| #issuecomment-5556170348 | N/A | Changeset package/version notice; no requested action. |
| #issuecomment-5556170464 | N/A | Vercel deployment status; final refresh required. |
| #pullrequestreview-5123778040 | N/A | Wrapper for the P1 table-key finding. |
| #pullrequestreview-5123843304 | N/A | Empty review body. |

Initial equality: local HEAD = refs/pr/450 = live head
fe15c7d734d7ac102f134dbac320159bb973b01f. Helper 1 unresolved thread,
1 top-level item, 1 review body; raw 2 top-level items, 2 reviews, 1 unresolved
outdated thread with 2 comments. All pages exhausted. No deferred P2 yet.
Task compliance: one body path, complete head plan read, exact PR #450 owner.
Goal control remains externally blocked from the earlier run; latest user
instruction authorizes continuation, without inventing a resume transition.

Start Gates:
| Gate | Applies | Evidence |
| --- | --- | --- |
| Dedicated task invocation and plan for exact PR | yes | Resumed task #450; original dedicated plan read completely |
| Task evidence verified at PR head | yes | Body path + fe15c7d7 plan + exact PR #450 owner |
| Active source/plan reconstructed | yes | Issue #444, lifecycle writers/injection, both new test files |
| Intended delta and exclusions recorded | yes | Requirements and Boundaries above |
| Closure matrix classified | yes | Matrix below identifies applicable owners |
| Live PR feedback target resolved | conditional | exact compliant PR for full `resolve-pr-feedback` mode; N/A after verified noncompliant close |
| Feedback proof checkout bound to PR head | conditional | local committed `HEAD` = fetched PR ref = live `headRefOid` for a compliant PR |
| Unfiltered feedback inventory | conditional | raw top-level comments/reviews plus all resolved/unresolved inline threads compared with helper output for a compliant PR |
| GitHub delivery expectation recorded | yes | Commit/push/admin merge authorized; no Version Packages merge |
| Active goal checked or created | yes | Existing batch goal; external blocked status documented above |
| Agent-native pack selected | yes | Materialized with autoclosure template |
| Agent-facing action surface identified | yes | ORM update action and per-PR maintainer closeout |
| Source rule versus generated mirror boundary identified | yes | No rules changed; lifecycle.ts owns behavior |
| Installed-skill lock versus local-rule owner identified | no | N/A: no installed workflow change |
| `agent-native-reviewer` loaded or waiver recorded | yes | Action -> ORM owner -> read-bound tests/build -> PR evidence is discoverable; no missing route |

Closure matrix:
| Lane | Applies | Owner/proof | Status |
| --- | --- | --- | --- |
| per-PR task ownership | yes | Exact #450 body/head/plan | pass |
| noncompliant close | no | N/A: valid task evidence | N/A |
| source behavior | yes | 9 integration + 22 lifecycle tests | pass |
| package/API/build | yes | kitcn build; no public shape/import changes | pass |
| generated output | no | N/A: no generated owner changed; install sync clean | N/A |
| fixtures/scenarios | yes | Full check after integrating main fixture fixes | pass |
| docs/package skill | no | N/A: no public guidance change | N/A |
| changeset | yes | olive-donkeys-invite patch; two user-facing outcomes | pass |
| agent workflow | no | N/A: no workflow behavior changed | N/A |
| live PR feedback | conditional | compliant: `resolve-pr-feedback` + final P1 read-back; noncompliant: N/A with comment/CLOSED receipts | pending |
| cleanup/review | yes | Deslop and final P0/P1 branch autoreview passed | pass |
| repository check | yes | `bun check` | pass |
| GitHub delivery | yes | Final-head replay/receipt then skip-release admin merge | in_progress |

Current proof:
- `bun install`: pass, no remaining lock/generated delta.
- `bun --cwd packages/kitcn build`: exit 0; /tmp/kitcn-pr450-build.log.
- Focused Vitest: 9/9 across lifecycle.read-amplification, write-barrier and
  write-barrier.read-amplification; no type errors.
- `bun test packages/kitcn/src/orm/lifecycle.test.ts`: 22/22.
- P1 static replay: injection uses `tableConfig.name`; get/set and aggregate
  calls share that local owner; exactly four writer barrier call sites.
- Deslop: 176 -> 176 findings; score +0.05 solely from ORM directory fan-out
  after adding read-bound tests. Kept tests beside their source; moving them
  solely to satisfy a directory-size warning would worsen navigation.
- Kept cleanup: changeset uses two concise current outcomes; original plan
  no longer claims an alias fix, alias regression test or backfill requirement.
- Agent-native review PASS: ORM update -> lifecycle writer/barrier -> focused
  tests and package build -> dedicated task plan/PR. No hidden human action,
  canonical-source drift, generated workflow edit or missing proof route.

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
- [ ] Accepted cleanup and review findings are closed.
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
| None yet | 0 | | |

Completion Gates:
| Gate | Applies | Required action | Evidence |
| --- | --- | --- | --- |
| Per-PR task ownership | yes | Record exact PR and dedicated task-plan path | Exact PR #450; docs/plans/444-orm-double-pre-image-read.md verified at initial head |
| Noncompliant PR disposition | no | Verify task evidence or comment then close and read back | N/A: task compliance passed |
| Targeted behavior proof | yes | Run smallest missing owning proof | 9 integration + 22 lifecycle tests passed |
| Source/generated audit | yes | Prove correct source and regenerated mirrors | Lifecycle owner only; bun install synchronized mirrors with no delta |
| Package/docs/scenario closure | yes | Run every applicable local contract | Package build and full check passed; no docs or scaffold owner change |
| Feedback proof checkout | conditional | Compliant PR only: require local committed `HEAD` = fetched PR ref = live `headRefOid` before proof/reply/resolution and at terminal verification | pending |
| Live PR feedback resolution | conditional | Compliant PR only: run full `resolve-pr-feedback` and close every actionable P1-or-higher finding; otherwise N/A with noncompliant stop receipts | pending |
| Feedback priority classification | yes | Compliant PR only: persist P0-P3 plus rationale for every actionable item; classify ambiguous P1-versus-lower as P1 | One P1 finding plus prior fix reply; all six raw items ledgered |
| Final P1 proof replay | conditional | Compliant PR only: after the final material branch push, rerun every P1-or-higher proof, including resolved/outdated items | pending |
| Final live feedback read-back | conditional | Compliant PR only: re-fetch helper plus unfiltered top-level/all-thread inventories; require zero actionable P1-or-higher and explicit P2-or-lower deferrals | pending |
| External terminal receipt | conditional | Compliant PR only: post/read exact-head receipt; require receipt/live/fetched/local OID equality and no unrecorded helper/raw URL except that verified receipt | pending |
| Deslop | yes | Run bounded cleanup or N/A | No added findings; +0.05 directory fan-out warning retained for adjacent tests |
| Agent-native reviewer | yes | Run for workflow changes or N/A | Action/owner/proof map passes; no workflow behavior change |
| Final lint | yes | Run `bun lint:fix` | bun lint:fix: 963 files; no changes |
| Repository check | yes | Run `bun check` | bun check exit 0; /tmp/kitcn-pr450-check.log; 1400 Bun, 1005 Vitest, 124 CLI, 8 fixtures and runtime checks |
| GitHub delivery | pending | Commit/push/open or update PR and read back | pending |
| Autoreview | yes | Resolve every accepted actionable finding | Exit 0 on f2d422eb against kitcn/main; no P0/P1 finding; /tmp/kitcn-pr450-review.md and .json |
| Goal plan complete | yes | Run `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-09-07-pr-450-autoclosure.md` | pending |
| Agent source / generated sync | no | Run `bun install` when `.agents/rules/**` changed and verify generated mirrors | N/A: no rule source changed; install mirror sync clean |
| Installed lock audit | no | Verify expected lock entries and removed skills through CLI-managed state | N/A: no installed skill or lock change |
| Agent action discoverability | yes | Source-audit the skill/rule path an agent will read | ORM update and closeout routes point to source tests and exact PR plan |
| Helper and template smoke | no | Syntax-check helpers and prove incomplete failure/completed representation when applicable | N/A: no helper or template changed |
| Agent-native review | yes | Load `.agents/skills/agent-native-reviewer/SKILL.md` and close accepted findings, or record N/A | Source ownership and repeatable command proof verified; no accepted gap |

Phase / pass table:
| Phase | Status | Evidence | Next |
| --- | --- | --- | --- |
| Inventory | complete | Issue, head plan and all raw feedback audited | proof |
| Repair | complete | Plan false claims removed; changeset clarified; lifecycle source unchanged | review |
| Review/checks | complete | Full check and P0/P1 branch review passed | delivery |
| Delivery | pending | | final audit |
| Closeout | pending | | final |

Verification evidence:
- Full `bun check` exit 0 on 2026-09-07, /tmp/kitcn-pr450-check.log: 1400 Bun,
  1005 Vitest, 124 CLI tests; all 8 fixture comparisons and runtime smoke lanes.
- Package build, 9 focused integration tests, 22 lifecycle tests, source P1
  invariant and lint passed. Final branch review passed on f2d422eb; only
  internal result/status notes changed afterward and were directly checked.
  Post-push replay and hosted gates remain required.

Timeline:
- 2026-09-07T08:45:06.432Z Autoclosure plan created.

Reboot status:
| Question | Answer |
| --- | --- |
| Where am I? | Full local checks and final branch review passed; push next |
| Where am I going? | Repair, review/checks, delivery, final audit |
| What is the goal? | Merge #450 with zero actionable P1 and no release |
| What have I learned? | See closure matrix |
| What have I done? | See timeline |

Open risks:
- User before-hooks still cost two reads. Aliased schemas and nested hook
  mutation behavior are unchanged, outside this fix. No release authorized.
- Final push, hosted CI/review, P1 resolution/replay and terminal receipt are
  not yet complete; pending external rows are not a completion claim.
