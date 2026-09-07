# PR 448 autoclosure

Objective:
Close PR #448 after exact-head proof, green checks and zero actionable P1 findings; leave Version Packages unmerged.

Flow mode:
One-shot execution. Resume the dedicated task in
docs/plans/446-relation-where-non-id-target-read-amplification.md for exactly
https://github.com/udecode/kitcn/pull/448.

User requirements:
- "continue all new ones": this slice owns only #448 from #448-456.
- "Yes don’t ask for approve. Don’t merge version packages pr tho": admin
  override authorized after proof; uncheck auto-release before merging #448.
- Earlier P2 deferral remains available; already-fixed P2s are verified here.
- No new product work, release-PR merge, parallel agents or workflow edits.
- Final handoff: exact merged/open states, proof, remaining findings and risks.
- Existing goal is externally blocked from the earlier approval pause. The
  explicit user resumption authorizes work; no lifecycle state is fabricated.

Goal plan:
docs/plans/2026-09-07-pr-448-autoclosure.md

Template:
docs/plans/templates/autoclosure.md

Primary template:
docs/plans/templates/autoclosure.md

Applied packs:
- agent-native (docs/plans/templates/packs/agent-native.md)

Completion threshold:
- All 11 source-listed cases pass; changeset has concise outcomes; full check
  passes after integrating the merged fixture refresh; all four feedback
  threads dispositioned; exact-head terminal receipt and MERGED read-back.
- No new product scope. Completion requires every applicable lane below to have
  fresh evidence, `bun check` passing, review findings closed, authorized
  GitHub delivery complete, and the goal checker passing.

Verification surface:
- Focused relation-read/memo suites, ORM suite, package build, changeset audit,
  dedicated task checker, full `bun check`, branch autoreview, helper/raw
  feedback inventories and GitHub head/check/body/merge read-back.

Constraints:
- Finish the intended delta; do not invent the next feature.
- Preserve source/generated/package/docs ownership.
- Use a different diagnostic after repeated failure signatures.

Boundaries:
- intended delta: execution-scoped single-target relation memo and owned copies
- allowed repairs: accepted feedback, dedicated plan, main integration, checks
- unrelated files: preserve; do not treat as blockers
- non-goals: new ORM APIs, older #430 repairs, release merges, policy changes

Output budget strategy:
- Read query.ts around named helpers. Keep full check/review logs under /tmp;
  inspect tails and failures. Fetch every feedback page but summarize counts.

Blocked condition:
- Unavailable GitHub feedback/receipts, new product decision or repeatable
  environment failure after different repairs. Approval itself is authorized.

Feedback ledger (URLs are https://github.com/udecode/kitcn/pull/448 plus fragment):
| URL | Priority | Verdict and rationale | Proof / next |
| --- | --- | --- | --- |
| #discussion_r3942627813 | P2 | fixed in head: lossless Convex encoding avoids distinct join-value collisions; explicit reviewer priority retained | bytes and special-float tests |
| #discussion_r3942726712 | P2 | prior fix reply; verify claimed encoding against source | same tests |
| #discussion_r3942733727 | P1 | fixed in head: changeset now has two concise observable outcomes; explicit contract priority retained | changeset source audit |
| #discussion_r3942888979 | P1 | prior changeset reply matches current two bullets | changeset source audit |
| #discussion_r3942733729 | P2 | fixed in head: both memo consumers receive an owned copy | both isolation regressions |
| #discussion_r3942888872 | P2 | prior isolation reply; source and tests must prove it survived | same tests |
| #discussion_r3942896059 | P1 | valid: full check was not green despite completed plan; integrate merged #453 and correct current evidence | full bun check and task checker |
| #issuecomment-5556110210 | N/A | changeset notice, no extra finding; patch artifact exists | inspect changeset |
| #issuecomment-5556110337 | N/A | Vercel deployment ready, no actionable prose | final status refresh |
| #pullrequestreview-5123742068 | N/A | review wrapper; encoding finding ledgered above | no separate action |
| #pullrequestreview-5123848198 | N/A | empty review | no action |
| #pullrequestreview-5123854701 | N/A | wrapper; changeset/isolation findings ledgered above | no separate action |
| #pullrequestreview-5124067911 | N/A | empty review | no action |
| #pullrequestreview-5124068004 | N/A | empty review | no action |
| #pullrequestreview-5124074661 | N/A | wrapper; full-check finding ledgered above | no separate action |

Initial inventory:
- local HEAD = refs/pr/448 = live head 05d3b2d8a077d1a4a799097911b152e64998e8ac.
- Helper: 4 threads, 1 comment, 3 review bodies. Raw: 4 unresolved / 0
  resolved threads, 7 inline comments, 2 top-level comments, 6 review bodies;
  all pageInfo exhausted. Two P1 and two P2 findings; no deferred defect.
- #453 merged at 8e205dcaae2a89f9a6fae32f49b32775fe9135fc; its fixture refresh
  is the existing repair owner for #448's failing full-check lane.
- Release workflow automatically merges Version Packages when source PR's
  Auto release is checked; preserve the block but uncheck it per user.

Start Gates:
| Gate | Applies | Evidence |
| --- | --- | --- |
| Dedicated task invocation and plan for exact PR | yes | Resumed task for #448 and its 446-prefixed plan |
| Task evidence verified at PR head | yes | One body line; file exists at 05d3b2d8; ownership names #448 |
| Active source/plan reconstructed | yes | Full dedicated plan, issue #446, diff and both focused test files read |
| Intended delta and exclusions recorded | yes | Single-target memo, no public API change; no release merge |
| Closure matrix classified | yes | Runtime/package/checks apply; no new scaffold or workflow source |
| Live PR feedback target resolved | conditional | exact compliant PR for full `resolve-pr-feedback` mode; N/A after verified noncompliant close |
| Feedback proof checkout bound to PR head | conditional | local committed `HEAD` = fetched PR ref = live `headRefOid` for a compliant PR |
| Unfiltered feedback inventory | conditional | raw top-level comments/reviews plus all resolved/unresolved inline threads compared with helper output for a compliant PR |
| GitHub delivery expectation recorded | yes | Commit/push/reply/resolve/merge authorized; admin allowed; no release merge |
| Active goal checked or created | yes | Existing batch goal externally blocked; user explicitly resumed |
| Agent-native pack selected | yes | Materialized with autoclosure template |
| Agent-facing action surface identified | yes | PR body to exact task plan to focused/check commands |
| Source rule versus generated mirror boundary identified | no | N/A: no rule or installed skill edits |
| Installed-skill lock versus local-rule owner identified | no | N/A: lock and installed skills unchanged |
| `agent-native-reviewer` loaded or waiver recorded | yes | Loaded; source/route/proof parity inspected |

Closure matrix:
| Lane | Applies | Owner/proof | Status |
| --- | --- | --- | --- |
| per-PR task ownership | yes | exact #448 + dedicated 446 plan | complete |
| noncompliant close | no | N/A: compliant PR | complete |
| source behavior | yes | Two focused suites: 12 passed, including collision/isolation/read cost | complete |
| package/API/build | yes | kitcn build passed; 72 files; no new public API | complete |
| generated output | no | No source template edits; existing #453 integrated from main | complete |
| fixtures/scenarios | yes | Full check passed 8/8 fixtures, verify and runtime | complete |
| docs/package skill | no | N/A: no user docs or published guidance changed | complete |
| changeset | yes | rotten-donkeys-shave.md: patch; two concise observable outcomes | complete |
| agent workflow | no | N/A: no workflow policy or executable helper edits | complete |
| live PR feedback | conditional | compliant: `resolve-pr-feedback` + final P1 read-back; noncompliant: N/A with comment/CLOSED receipts | pending |
| cleanup/review | yes | Deslop delta and local lenses complete; branch autoreview next | running |
| repository check | yes | `bun check` passed; post-push P1 replay still required | complete |
| GitHub delivery | yes | Exact-head proof, unchecked auto-release, admin merge | pending |

Work Checklist:
- [x] Every PR has its own `task` invocation and dedicated task plan; a batch
      plan or aggregate autoclosure is not used as a substitute.
- [x] Task evidence was verified from the PR body, fetched head, and exact PR
      ownership; otherwise the required comment and `CLOSED` state were read
      back and no source review, repair, merge, or release work continued.
- [x] Intended behavior and exclusions are reconstructed from real sources.
- [ ] Each lane is proven or N/A with a concrete reason. Local lanes complete;
      external receipt/merge lanes remain below.
- [x] Generated output was changed through its owner and regenerated. N/A:
      no new generated edits; integrated the already-verified #453 commit.
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
- [x] Any remaining P2-or-lower item has its exact URL plus the user's explicit
      priority deferral recorded; no feedback was silently ignored.
- [ ] Accepted cleanup and review findings are closed.
- [ ] PR body and check state match the final evidence.
- [ ] Residual blocker/waiver has exact evidence and next owner.
- [x] Agent-native pack: source-of-truth rule files are edited instead of generated skill mirrors. N/A: neither changed.
- [x] Agent-native pack: the changed agent action is discoverable from the skill/rule text. PR body names the task plan and proof.
- [x] Agent-native pack: generated mirrors are synced when `.agents/rules/**` changed, or N/A reason is recorded. N/A: rules unchanged.
- [x] Agent-native pack: installed skills are changed only through
      `npx skills add/update/remove`; local rules/templates/helpers stay source-owned. N/A: no installed skill changes.
- [x] Agent-native pack: routing, required receipts, placeholder failure,
      completion representability, and forbidden behavior have eval/smoke rows. N/A: no helper/template behavior change; checker still used for active plans.
- [x] Agent-native pack: accepted agent-native review findings are fixed or explicitly rejected with reason. No route/owner/proof gap found.

Error attempts:
| Failure signature | Count | Next different move | Resolution |
| --- | ---: | --- | --- |
| Slop delta used stale origin/main by default | 1 | Rerun with --base-ref kitcn/main | Same findings; correct base 8e205dca |

Completion Gates:
| Gate | Applies | Required action | Evidence |
| --- | --- | --- | --- |
| Per-PR task ownership | yes | Record exact PR and dedicated task-plan path | #448; exact-head 446 plan verified |
| Noncompliant PR disposition | no | Verify task evidence or comment then close and read back | N/A: compliant PR |
| Targeted behavior proof | yes | Run smallest missing owning proof | 12/12 focused and 990 Vitest passed |
| Source/generated audit | yes | Prove correct source and regenerated mirrors | No new generated edits; #453 integrated; 8/8 fixture check |
| Package/docs/scenario closure | yes | Run every applicable local contract | kitcn build, full check, runtime; no docs/API change |
| Feedback proof checkout | conditional | Compliant PR only: require local committed `HEAD` = fetched PR ref = live `headRefOid` before proof/reply/resolution and at terminal verification | pending |
| Live PR feedback resolution | conditional | Compliant PR only: run full `resolve-pr-feedback` and close every actionable P1-or-higher finding; otherwise N/A with noncompliant stop receipts | pending |
| Feedback priority classification | yes | Compliant PR only: persist P0-P3 plus rationale for every actionable item; classify ambiguous P1-versus-lower as P1 | Ledger has 2 P1 and 2 P2 findings with source-backed verdicts |
| Final P1 proof replay | conditional | Compliant PR only: after the final material branch push, rerun every P1-or-higher proof, including resolved/outdated items | pending |
| Final live feedback read-back | conditional | Compliant PR only: re-fetch helper plus unfiltered top-level/all-thread inventories; require zero actionable P1-or-higher and explicit P2-or-lower deferrals | pending |
| External terminal receipt | conditional | Compliant PR only: post/read exact-head receipt; require receipt/live/fetched/local OID equality and no unrecorded helper/raw URL except that verified receipt | pending |
| Deslop | yes | Run bounded cleanup or N/A | Delta passed; three local lenses found no useful source cleanup |
| Agent-native reviewer | yes | Run for workflow changes or N/A | PR-to-plan-to-proof route inspected; no gap |
| Final lint | yes | Run `bun lint:fix` | pending |
| Repository check | yes | Run `bun check` | Exit 0; /tmp/kitcn-pr448-check.log; final post-push replay required |
| GitHub delivery | pending | Commit/push/open or update PR and read back | pending |
| Autoreview | yes | Resolve every accepted actionable finding | pending |
| Goal plan complete | yes | Run `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-09-07-pr-448-autoclosure.md` | pending |
| Agent source / generated sync | no | Run `bun install` when `.agents/rules/**` changed and verify generated mirrors | N/A: rules/skills unchanged |
| Installed lock audit | no | Verify expected lock entries and removed skills through CLI-managed state | N/A: installed skills and lock unchanged |
| Agent action discoverability | yes | Source-audit the skill/rule path an agent will read | PR body -> dedicated task -> commands -> closeout receipt |
| Helper and template smoke | no | Syntax-check helpers and prove incomplete failure/completed representation when applicable | N/A: no helper/template behavior changed |
| Agent-native review | yes | Load `.agents/skills/agent-native-reviewer/SKILL.md` and close accepted findings, or record N/A | No missing action/owner/proof route |

Phase / pass table:
| Phase | Status | Evidence | Next |
| --- | --- | --- | --- |
| Inventory | complete | All raw/helper feedback ledgered at matching head | missing proof |
| Repair | complete | Integrated #453 and corrected dedicated plan's current gate evidence | review |
| Review/checks | in_progress | Full check passed; frozen branch autoreview next | delivery |
| Delivery | pending | | final audit |
| Closeout | pending | | final |

Verification evidence:
- `NO_PROXY=localhost,127.0.0.1 bun check`: exit 0 after main integration;
  /tmp/kitcn-pr448-check.log. 1400 Bun pass, 990 Vitest pass (14 skipped),
  124 CLI pass, Concave smoke, eight fixture comparisons, verify and runtime.
  Runtime scaffolder warns about its upstream Convex 1.45.0 selection; all
  prepared scenarios still passed, with package support range unchanged.
- `NO_PROXY=localhost,127.0.0.1 bunx vitest run packages/kitcn/src/orm/query.relation-where-reads.vitest.ts packages/kitcn/src/orm/query.relation-target-memo.vitest.ts`: 12/12 passed.
- `bun --cwd packages/kitcn build`: exit 0, 72 artifacts; /tmp/kitcn-pr448-build.log.
- Source audit: `_forExecution` constructs a new query without copying either
  document memo; both consumers call `_ownedCopy`; key encodes values through
  convexToJson; three single-target paths call `_firstByFields`.
- Changeset audit: patch frontmatter, Patches heading, two observable bullets;
  no measurements, staleness proof or private algorithm narration remains.
- Deslop: `bun run lint:slop:delta --base-ref kitcn/main` passed; 177 -> 176
  findings, net score -1.20. Reviewed rules/types/simplification locally.
  Unchanged catches at query.ts:2266/3480 are unrelated attribution noise;
  the new encoding catch safely declines memoization, and the new test file
  is a meaningful behavior owner, not a fan-out defect. No source edit needed.
- Agent-native parity: inspect PR -> task plan -> exact commands -> GitHub
  receipt. Routes exist; no workflow/policy/lock changes or missing capability.

Timeline:
- 2026-09-07T06:24:09.405Z Autoclosure plan created.
- Integrated kitcn/main 8e205dca in local merge 1cca3890; no source conflict.
- Focused/build/full-check passed; dedicated plan refreshed with current
  evidence. Source behavior unchanged from the previously reviewed fixes.

Reboot status:
| Question | Answer |
| --- | --- |
| Where am I? | #448 source/feedback inventory complete; main integration next |
| Where am I going? | Repair, review/checks, delivery, final audit |
| What is the goal? | Merge #448 with green proof, no unresolved P1 and no release merge |
| What have I learned? | See closure matrix |
| What have I done? | See timeline |

Open risks:
- Floating fixture dependencies can drift again. Do not bypass failed checks.
- PR auto-release must remain unchecked through merge; verify live body.
