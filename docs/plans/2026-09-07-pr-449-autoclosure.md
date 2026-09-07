# PR 449 autoclosure

Objective:
Merge #449 with green checks, verified pipeline read costs, synchronized rendered docs and zero actionable P1 feedback; do not merge Version Packages.

Flow mode:
One-shot execution; resume task exactly #449 and its dedicated plan
docs/plans/447-orm-pipeline-where-index-lowering.md.

User requirements:
- Latest override: "No walk needed . Sweep all other prs". Walkthrough and
  annotation are waived across this sweep; keep completed browser proof.
- "continue all new ones": this slice owns #449 from the nine-PR batch.
- "Yes don’t ask for approve. Don’t merge version packages pr tho": commit,
  push, reply, resolve and admin merge are authorized after proof. Preserve
  the release block but uncheck Auto release before merge. Every merge must
  use an explicit subject containing `[skip release]` and a body referencing
  only the current PR. The workflow job condition skips the complete release
  job for this marker. No release-PR merge or new product scope.
- Earlier P2 deferral remains available; both P2 fixes already exist and will
  be verified, not silently skipped. Work sequentially, without child agents.
- Final handoff states exact merged/open results, proof, residuals and the
  annotated docs walkthrough. Stop only at a real authority/external blocker.
- Existing batch goal remains externally blocked from the prior approval
  pause; latest user explicitly resumes work. Do not fabricate lifecycle state.

Goal plan:
docs/plans/2026-09-07-pr-449-autoclosure.md

Template:
docs/plans/templates/autoclosure.md

Primary template:
docs/plans/templates/autoclosure.md

Applied packs:
- agent-native (docs/plans/templates/packs/agent-native.md)
- browser (docs/plans/templates/packs/browser.md)

Completion threshold:
- Pipeline suite 41/41 passes, union scanned=1 and flatMap scanned=3;
  single-resolution and pinned-range regressions survive main integration.
- Full `bun check`, package build, docs/skill mirror audit, rendered docs
  desktop/narrow proof, walkthrough, branch review and exact-head receipt pass.
- No new product scope. Completion requires every applicable lane below to have
  fresh evidence, `bun check` passing, review findings closed, authorized
  GitHub delivery complete, and the goal checker passing.

Verification surface:
- `bunx vitest run convex/orm/pipeline.test.ts`; full `bun check`; package
  build; published/mirror docs comparison; browser docs routes and screenshots;
  task checker, branch autoreview, helper/raw feedback and GitHub read-back.

Constraints:
- Finish the intended delta; do not invent the next feature.
- Preserve source/generated/package/docs ownership.
- Use a different diagnostic after repeated failure signatures.

Boundaries:
- intended delta: index-lower union/flatMap object filters while preserving
  pinned ranges, merge ordering and one resolution of each stage callback
- allowed repairs: reviewed owner code/docs, main integration, task evidence
- unrelated files: preserve; do not treat as blockers
- non-goals: chain-level where under union, relation-loader lowering, stage
  orderBy, older #430 findings, new public contracts, workflow policy, releases

Output budget strategy:
- Read named helpers and doc paragraphs; logs under /tmp; bounded outputs.
  Compare every raw/helper feedback URL. Capture only relevant docs frames.

Blocked condition:
- Unavailable feedback/receipts, unreproducible required browser proof, new
  product decision or environment failure after different repairs.

Initial feedback inventory:
Execution checkpoint (2026-09-07):
- Main integrated at local HEAD 908e2de14c36a8b453be3a4bb06f236a1c33e30a.
- Pipeline suite passed 41/41; package skill sync and package build passed.
- Full `bun check` passed, exit 0; log `/tmp/kitcn-pr449-check.log`.
- Auto release unchecked on #449 and read back after the passing check.
- Pagination rendered in Browser; clipped captures required Chrome fallback.
  Chrome verified desktop and 390x844 with document width 390 (no overflow).
  Original images are in `tmp/walkthrough/pr-449/`. Filters and API reference
  also passed desktop/narrow visual inspection, 390px page width without page
  overflow, with code blocks independently scrollable. Captured Chrome
  warnings/errors: none. Tab focus reached the next API heading link.
  Server read-back: all three routes returned HTTP 200. Full network request
  inspection is unavailable through the selected non-CDP browser surface.
- Walkthrough waived by the user after two rejected annotation attempts.
  Original captures 01 through 06 remain the browser proof. No generated image
  is accepted as evidence; no further annotation or screenshot handoff needed.
- Final plan reconciliation, autoreview, exact-head feedback proof,
  push and merge remain pending. No terminal proof or delivery claimed.
- Deslop: `bun run lint:slop:delta --base-ref kitcn/main` reports zero net
  finding/score change and no worsened findings. Thirteen added and thirteen
  resolved occurrences are relocated existing code; wrapper and catch paths
  preserve async/error contracts. No cleanup patch warranted.
- Final branch autoreview against `kitcn/main`, P0/P1: exit 0, no findings.
  `/tmp/kitcn-pr449-review.md` and `.json` contain the result. A prior review
  was invalidated by plan edits and not counted.
- `bun lint:fix` made no changes; original task-plan checker passed; docs and
  package skill mirror compare equal. A redundant full-check rerun was
  intentionally stopped after its shadcn template git clone stalled. The
  accepted full check is `/tmp/kitcn-pr449-check.log`, exit 0 at code HEAD
  908e2de14c36a8b453be3a4bb06f236a1c33e30a. Only internal plan notes changed
  afterward; no failed code gate was waived.
- Agent-native review: PASS. Pipeline query action -> public docs and published
  ORM skill -> query/stream owner -> 41-case pipeline suite. Published skill
  and generated local mirror agree. No workflow or installed-lock changes.

- local HEAD = fetched refs/pr/449 = live head c07eb7b6ce1c3df4e1b8bfaeb745870565d41a5e.
- Helper: two unresolved threads, one top-level comment, two review bodies.
  Raw: two unresolved/zero resolved threads with four inline comments, two
  top-level comments and four reviews; every pagination boundary exhausted.
- Two explicit P2 findings, zero P0/P1; no deferred defect.

Feedback ledger (all fragments are under https://github.com/udecode/kitcn/pull/449):
| URL | Priority | Verdict and rationale | Proof |
| --- | --- | --- | --- |
| #discussion_r3942648278 | P2 | fixed in head: resolved expression shared by bound and predicate; reviewer priority retained | two single-resolution pipeline tests |
| #discussion_r3942719072 | P2 | prior fix reply matches current helper boundary | same tests and source audit |
| #discussion_r3942726187 | P2 | fixed in head: pagination guide describes all three pinned/unpinned cases | docs/mirror audit and pipeline tests |
| #discussion_r3942872747 | P2 | prior docs reply requires current rendered proof | three docs routes and tests |
| #issuecomment-5556155294 | N/A | changeset notice; minor artifact covers ordering/cursor consequence | inspect changeset |
| #issuecomment-5556155481 | N/A | Vercel ready status, no actionable prose | final status refresh |
| #pullrequestreview-5123773358 | N/A | wrapper for single-resolution finding | covered above |
| #pullrequestreview-5123841055 | N/A | empty review | no action |
| #pullrequestreview-5123847688 | N/A | wrapper for docs finding | covered above |
| #pullrequestreview-5124052604 | N/A | empty review | no action |

Browser contract:
- Public docs: /docs/orm/queries/filters, /docs/orm/queries/pagination,
  /docs/orm/api-reference. Verify the changed paragraphs and examples render.
- Browser first, desktop and narrow viewport; no native OS interaction.
- Loading means route settles; error means no error overlay; public docs have
  no empty-data, permission or mutation states. Keyboard navigation and readable
  wrapping apply. No motion behavior changed. Record console/network limits.
- Baseline captured before plan creation at tmp/walkthrough/pr-449/baseline.json;
  PR source delta reconstructed against the original base for docs applicability.
- Annotated final images explain the real docs; never recreate their content.

Start Gates:
| Gate | Applies | Evidence |
| --- | --- | --- |
| Dedicated task invocation and plan for exact PR | pending | pending |
| Task evidence verified at PR head | pending | body path + head file + exact PR owner |
| Active source/plan reconstructed | pending | pending |
| Intended delta and exclusions recorded | pending | pending |
| Closure matrix classified | pending | pending |
| Live PR feedback target resolved | conditional | exact compliant PR for full `resolve-pr-feedback` mode; N/A after verified noncompliant close |
| Feedback proof checkout bound to PR head | conditional | local committed `HEAD` = fetched PR ref = live `headRefOid` for a compliant PR |
| Unfiltered feedback inventory | conditional | raw top-level comments/reviews plus all resolved/unresolved inline threads compared with helper output for a compliant PR |
| GitHub delivery expectation recorded | pending | pending |
| Active goal checked or created | pending | pending |
| Agent-native pack selected | pending | pending |
| Agent-facing action surface identified | pending | pending |
| Source rule versus generated mirror boundary identified | pending | pending |
| Installed-skill lock versus local-rule owner identified | pending | pending |
| `agent-native-reviewer` loaded or waiver recorded | pending | pending |
| Browser pack selected | pending | pending |
| Browser route / app surface identified | pending | pending |
| Browser tool decision recorded | pending | pending |
| Console/network caveat policy recorded | pending | pending |
| UI state/accessibility matrix recorded | pending | pending |

Closure matrix:
| Lane | Applies | Owner/proof | Status |
| --- | --- | --- | --- |
| per-PR task ownership | pending | exact PR + dedicated task plan | pending |
| noncompliant close | pending | required comment + `CLOSED` read-back | pending |
| source behavior | pending | pending | pending |
| package/API/build | pending | pending | pending |
| generated output | pending | pending | pending |
| fixtures/scenarios | pending | pending | pending |
| docs/package skill | pending | pending | pending |
| changeset | pending | pending | pending |
| agent workflow | pending | pending | pending |
| live PR feedback | conditional | compliant: `resolve-pr-feedback` + final P1 read-back; noncompliant: N/A with comment/CLOSED receipts | pending |
| cleanup/review | pending | pending | pending |
| repository check | yes | `bun check` | pending |
| GitHub delivery | pending | pending | pending |

Work Checklist:
- [ ] Every PR has its own `task` invocation and dedicated task plan; a batch
      plan or aggregate autoclosure is not used as a substitute.
- [ ] Task evidence was verified from the PR body, fetched head, and exact PR
      ownership; otherwise the required comment and `CLOSED` state were read
      back and no source review, repair, merge, or release work continued.
- [ ] Intended behavior and exclusions are reconstructed from real sources.
- [ ] Each lane is proven or N/A with a concrete reason.
- [ ] Generated output was changed through its owner and regenerated.
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
- [ ] Agent-native pack: source-of-truth rule files are edited instead of generated skill mirrors.
- [ ] Agent-native pack: the changed agent action is discoverable from the skill/rule text.
- [ ] Agent-native pack: generated mirrors are synced when `.agents/rules/**` changed, or N/A reason is recorded.
- [ ] Agent-native pack: installed skills are changed only through
      `npx skills add/update/remove`; local rules/templates/helpers stay source-owned.
- [ ] Agent-native pack: routing, required receipts, placeholder failure,
      completion representability, and forbidden behavior have eval/smoke rows.
- [ ] Agent-native pack: accepted agent-native review findings are fixed or explicitly rejected with reason.
- [ ] Browser pack: route, interaction path, and expected visible outcome are recorded before proof.
- [ ] Browser pack: browser proof uses the repo-approved browser tool or records a blocker/waiver.
- [ ] Browser pack: console and network errors are checked or explicitly out of scope.
- [ ] Browser pack: screenshot, trace, or exact verification caveat is ready for final handoff.
- [ ] Browser pack: loading, empty, error, permission, mutation, keyboard/focus,
      reduced motion, and responsive cases are covered or N/A with reason.
- [ ] Browser pack: Browser is used first for ordinary app QA; Chrome/Computer
      own native browser/OS behavior when applicable.

Error attempts:
| Failure signature | Count | Next different move | Resolution |
| --- | ---: | --- | --- |
| None yet | 0 | | |

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
| Goal plan complete | yes | Run `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-09-07-pr-449-autoclosure.md` | pending |
| Agent source / generated sync | pending | Run `bun install` when `.agents/rules/**` changed and verify generated mirrors | pending |
| Installed lock audit | pending | Verify expected lock entries and removed skills through CLI-managed state | pending |
| Agent action discoverability | pending | Source-audit the skill/rule path an agent will read | pending |
| Helper and template smoke | pending | Syntax-check helpers and prove incomplete failure/completed representation when applicable | pending |
| Agent-native review | pending | Load `.agents/skills/agent-native-reviewer/SKILL.md` and close accepted findings, or record N/A | pending |
| Browser interaction proof | pending | Exercise the target route/interaction with the approved browser tool or record blocker | pending |
| Browser console/network check | pending | Record console/network state or why it is not applicable | pending |
| Browser state/accessibility proof | pending | Exercise applicable honest states, keyboard/focus, motion, and sizes | pending |
| Browser final proof artifact | pending | Record screenshot/trace/route proof or exact caveat | pending |

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
- 2026-09-07T06:49:25.920Z Autoclosure plan created.

Reboot status:
| Question | Answer |
| --- | --- |
| Where am I? | Inventory |
| Where am I going? | Repair, review/checks, delivery, final audit |
| What is the goal? | Merge #449 after pipeline/docs/check proof, without release |
| What have I learned? | See closure matrix |
| What have I done? | See timeline |

Open risks:
- Existing flatMap ordering/cursor change is covered by the minor changeset;
  this closeout does not introduce another breaking contract.
- Floating scaffold inputs can drift; never waive a failing full check.
- Auto release must remain unchecked through merge.
