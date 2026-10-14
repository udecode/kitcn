# Autoclose PR 475

Objective:
Finish https://github.com/udecode/kitcn/pull/475 without widening auth scope.
Preserve the existing implementation and its dedicated task plan. Prove token
admission, runtime checks, built entrypoints, reviews, and exact-head feedback;
merge only with required checks and protected approval satisfied.

Goal plan:
docs/plans/475-autoclosure.md

Template:
docs/plans/templates/autoclosure.md

Primary template:
docs/plans/templates/autoclosure.md

Applied packs:
- agent-native (docs/plans/templates/packs/agent-native.md)

Completion threshold:
- Dedicated task: docs/plans/2026-09-30-harden-optimistic-auth-identity-guard.md.
- All 13 source-backed identity/settlement case groups must pass, including
  separately built auth/client, react, HTTP, and Start entrypoints.
- Required runtime and repository gates pass; exact-head independent review
  and feedback have no accepted unresolved findings.
- No new product scope. Completion requires every applicable lane below to have
  fresh evidence, `bun check` passing, review findings closed, authorized
  GitHub delivery complete, and the goal checker passing.

Verification surface:
- Focused Bun auth-client/react/auth-start suites; package build and built
  entrypoint integration; fixture check; `bun check`; independent shipping
  verifier; agent-native source/mirror audit; final autoreview; raw GitHub
  comments, reviews, threads, required checks, protections and head read-back.

Constraints:
- Finish the intended delta; do not invent the next feature.
- Preserve source/generated/package/docs ownership.
- Use a different diagnostic after repeated failure signatures.

Boundaries:
- intended delta: page-wide guarded token admission and client auth settlement.
- allowed repairs: bugs in that contract, its existing tests/docs, stale task
  evidence, generated ownership, and missing verification.
- unrelated files: preserve; do not treat as blockers
- non-goals: new auth features, unrelated PRs, bypassing protections, changing
  Vercel team membership, or closing usable work for incomplete evidence.

Output budget strategy:
- Audit changed files and their direct owners; save full command output under
  /tmp/pr475-*.log and report bounded summaries. Delegate read-only grounding,
  comment audit and independent verification with exclusive worktrees.

Blocked condition:
- Another authorized reviewer must satisfy protected code-owner/last-push
  approval. Runtime port conflicts are diagnosed without killing unrelated
  processes. Never infer native-goal creation authority from this task.

Start Gates:
| Gate | Applies | Evidence |
| --- | --- | --- |
| Dedicated task invocation and plan for exact PR | yes | Resume task for exact PR #475; existing dedicated plan |
| Task evidence verified at PR head | yes | Body names plan; fetched f9016674 contains plan naming #475: COMPLETE |
| Active source/plan reconstructed | yes | Existing 13 case groups; package registry/provider/HTTP/Start source |
| Intended delta and exclusions recorded | yes | Boundaries above |
| Closure matrix classified | yes | Applicable lanes below; absent-state close is N/A |
| Live PR feedback target resolved | yes | Full resolve-pr-feedback #475; no actionable GitHub findings |
| Feedback proof checkout bound to PR head | yes | Intake local HEAD = fetched refs/pr/475 = live f9016674; final equality is an external delivery gate |
| Unfiltered feedback inventory | yes | Raw 3 comments, 0 reviews, 0 threads; helper 2 comments, omitted Vercel item explicitly ledgered below |
| GitHub delivery expectation recorded | yes | Update same PR; guarded merge only when ready |
| Active goal checked or created | yes | Native get_goal returned null; creation not authorized; this plan tracks closeout |
| Agent-native pack selected | yes | Published auth guidance and generated mirror changed |
| Agent-facing action surface identified | yes | Auth identity guard setup and proof through public package entrypoints |
| Source rule versus generated mirror boundary identified | yes | packages/kitcn/skills/kitcn/references/features/auth.md owns .agents mirror |
| Installed-skill lock versus local-rule owner identified | yes | No installed workflow or lock changes; published package reference only |
| `agent-native-reviewer` loaded or waiver recorded | yes | Loaded; parity audit required before closeout |

Closure matrix:
| Lane | Applies | Owner/proof | Status |
| --- | --- | --- | --- |
| per-PR task ownership | yes | Existing exact #475 plan and body line | done |
| noncompliant close | no | N/A: complete task state; preserve usable work | done |
| source behavior | yes | 295/0 focused; both new regressions RED then GREEN | done |
| package/API/build | yes | Source-first typecheck; fresh build; built entrypoints 10/0 | done |
| generated output | yes | Owner sync and byte-identical auth skill mirror | done |
| fixtures/scenarios | yes | Final repaired-source bun check exit0, including fixture and runtime lanes | done |
| docs/package skill | yes | Current-state matching references; intent validate/stale and MDX compile | done |
| changeset | yes | Existing kitcn patch updated; no duplicate changeset | done |
| agent workflow | no | N/A: published auth guidance only, no workflow/helper change | done |
| live PR feedback | yes | Inventory below; final replay and external receipt after versioned push | handed-off |
| cleanup/review | yes | Comment audit, bounded deslop, parity audit, autoreview clean | done |
| repository check | yes | Final repaired-source bun check exit0 | done |
| GitHub delivery | yes | Same contributor branch, no force push; approval cannot be bypassed | handed-off |

Work Checklist:
- [x] Every PR has its own `task` invocation and dedicated task plan; a batch
      plan or aggregate autoclosure is not used as a substitute.
- [x] Task evidence was verified from the PR body, fetched head, and exact PR
      ownership; otherwise the required comment and `CLOSED` state were read
      back and no source review, repair, merge, or release work continued.
- [x] Intended behavior and exclusions are reconstructed from real sources.
- [x] Each lane is proven or N/A with a concrete reason.
- [x] Generated output was changed through its owner and regenerated.
- [x] Package/docs/skill/fixture/scenario/changeset contracts are synchronized.
- [x] Full `resolve-pr-feedback` ran for the exact compliant PR; every
      actionable P1-or-higher finding was fixed, proved, replied to, and
      resolved or received the required top-level reply receipt.
- [x] Feedback checkout handoff is recorded: intake local/fetched/live OIDs
      matched; final committed HEAD must match fetched and live head after
      the versioned push, before any proof/reply/resolution receipt.
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
- [x] Final replay handoff requires both P1 regressions and the focused suite
      after the final material push, including any resolved/outdated threads
      newly discovered by the unfiltered final inventory.
- [x] Final feedback handoff requires a fresh helper/raw inventory after all
      pushes/replies/resolutions and zero unresolved actionable P1 findings.
- [x] External receipt handoff requires post/read-back of the final exact-head
      P1 proof only after all versioned updates are pushed. No receipt-only
      branch push; receipt/live/fetched/local OIDs must match, and the final
      raw/helper inventory must contain no unclassified URL beyond that receipt.
- [x] Any remaining P2-or-lower item has its exact URL plus the user's explicit
      priority deferral recorded; no feedback was silently ignored.
- [x] Accepted cleanup and review findings are closed.
- [x] PR body/check handoff requires publishing the prepared final proof body,
      preserving auto-release, reading it back, and observing required CI at
      the final head. No earlier check authorizes landing the new head.
- [x] Residual blocker/waiver has exact evidence and next owner.
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
| Vitest found no focused .test files | 1 | Read owning test config | Correct lane is Bun; focused suites pass |
| Typed token endpoint result includes undefined | 1 | Use declared return type and optional data | Typecheck and focused types pass |
| Recursive admission return inference TS7023 | 1 | Explicit boolean return contract | Typecheck and focused types pass |
| MDX module not directly linked at root/www | 2 | Resolve installed MDX package path | MDX compiler passes; no install/code change |

Completion Gates:
| Gate | Applies | Required action | Evidence |
| --- | --- | --- | --- |
| Per-PR task ownership | yes | Record exact PR and dedicated task-plan path | Exact #475 dedicated task plan verified at intake and retained |
| Noncompliant PR disposition | no | Verify task evidence or comment then close and read back | N/A: COMPLETE task state, no closure permitted |
| Targeted behavior proof | yes | Run smallest missing owning proof | 295/0 source suites, both P1 RED→GREEN regressions, 10/0 fresh built entrypoints |
| Source/generated audit | yes | Prove correct source and regenerated mirrors | Published auth reference source synced; byte-identical generated mirror |
| Package/docs/scenario closure | yes | Run every applicable local contract | Package typecheck/build, MDX compile, intent validate/stale; final runtime gate recorded below |
| Feedback proof checkout | handed-off | Compliant PR only: require local committed `HEAD` = fetched PR ref = live `headRefOid` before proof/reply/resolution and at terminal verification | Intake equality f9016674; final live/fetched/local equality is required after versioned push |
| Live PR feedback resolution | yes | Compliant PR only: run full `resolve-pr-feedback` and close every actionable P1-or-higher finding; otherwise N/A with noncompliant stop receipts | Full helper and raw inventory: zero actionable items; all three URLs classified below |
| Feedback priority classification | yes | Compliant PR only: persist P0-P3 plus rationale for every actionable item; classify ambiguous P1-versus-lower as P1 | Two local P1 defects fixed; no actionable GitHub findings and no lower-priority deferrals |
| Final P1 proof replay | handed-off | Compliant PR only: after the final material branch push, rerun every P1-or-higher proof, including resolved/outdated items | After final versioned push, replay both named regressions and 295/0 focused suite; external receipt binds final OID |
| Final live feedback read-back | handed-off | Compliant PR only: re-fetch helper plus unfiltered top-level/all-thread inventories; require zero actionable P1-or-higher and explicit P2-or-lower deferrals | After push/verifier comment, refetch helper, raw paginated comments/reviews and all GraphQL threads |
| External terminal receipt | handed-off | Compliant PR only: post/read exact-head receipt; require receipt/live/fetched/local OID equality and no unrecorded helper/raw URL except that verified receipt | Post/read exact-head receipt only after final plan push; four-way OID equality; no receipt-only branch push |
| Deslop | yes | Run bounded cleanup or N/A | Bounded comment cleanup and typed token call; intentional scanner findings source-checked |
| Agent-native reviewer | yes | Run for workflow changes or N/A | PASS source/mirror/discoverability/proof audit; no accepted findings |
| Final lint | yes | Run `bun lint:fix` | bun lint:fix exit0, 979 files, no formatter changes |
| Repository check | yes | Run `bun check` | Final repaired-source bun check exit0; Bun1556/0, Vitest1053/14 skipped, CLI124/0, fixture/verify/runtime pass |
| GitHub delivery | handed-off | Commit/push/open or update PR and read back | Push same PR without force; body and exact head read back; protected approval belongs to another authorized reviewer |
| Autoreview | yes | Resolve every accepted actionable finding | Branch vs actual main base: TruffleHog clean, structured review exit0, no accepted/actionable findings |
| Goal plan complete | yes | Run `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/475-autoclosure.md` | Checker rejects original incomplete template; final resolved or explicitly external-blocked gate representation checked before handoff |
| Agent source / generated sync | yes | Run `bun install` when `.agents/rules/**` changed and verify generated mirrors | tooling/sync-kitcn-skill.ts run; cmp auth source/mirror exit0; rules unchanged |
| Installed lock audit | no | Verify expected lock entries and removed skills through CLI-managed state | N/A: no installed workflow skills or lock changes |
| Agent action discoverability | yes | Source-audit the skill/rule path an agent will read | Published SKILL.md routes to references/features/auth.md; matching docs claim audit |
| Helper and template smoke | no | Syntax-check helpers and prove incomplete failure/completed representation when applicable | N/A: no workflow/helper/template behavior changed; incomplete plan checker smoke fails as expected |
| Agent-native review | yes | Load `.agents/skills/agent-native-reviewer/SKILL.md` and close accepted findings, or record N/A | PASS: auth setup route, source owner, generated mirror and runnable tests remain available |

Phase / pass table:
| Phase | Status | Evidence | Next |
| --- | --- | --- | --- |
| Inventory | done | Exact task/head/source and raw feedback | repair |
| Repair | done | Two source-backed P1 bugs, red-green proof | final checks |
| Review/checks | done | Final source fullcheck exit0, review clean, 295/0 focused, 10/0 built | delivery |
| Delivery | handed-off | Same-PR push/body/read-back protocol below | exact-head replay |
| Closeout | blocked | Protected code-owner/last-push approval required | authorized reviewer |

Verification evidence:
- This is the versioned proof snapshot. Checked delivery-handoff rows record
  the required protocol and owner, not a claim that future GitHub mutations
  already happened. External exact-head receipts must prove those gates after
  this snapshot is pushed; they are not stored by a receipt-only branch commit.
- Source candidate 90a1653eb2788324d6c1cf9e85bf6f588e7b3570; main base
  126f3e992110b6ded7d7c9a7d8ce178b6ede61f8. Subsequent versioned edits are
  evidence-only; final head and stable patch-id are bound in external receipts.
- Both P1 regressions ran RED before source fixes, then GREEN. Full focused
  auth-client/react/auth-start 295 pass, 0 fail; fresh built integration 10/0;
  source-first package typecheck and both package builds exit 0.
- Final repaired-source `bun check` exit0: lint; workspace typecheck; Bun
  1556/0; Vitest1053 pass,14 skipped; CLI124/0; Concave smoke; fixture freshness;
  consumer verify; all selected runtime scenarios. No unrelated process killed.
- Independent verifier, own worktree, original parent 123/0, original head
  192/0 plus built integration 10/0; repaired candidate 295/0 and built 10/0.
  Its callback probe now refuses, trips, and announces exactly once.
- Autoreview branch against refs/remotes/kitcn/main: TruffleHog clean,
  one full 264038-byte pass, exit 0, no accepted/actionable P0 findings.
  Lower-priority coverage is the source review and independent verifier;
  this is not a claim that the helper reviewed every priority.
- Agent-native review PASS: auth setup -> published auth feature reference ->
  provider/registry owner -> focused and built-entrypoint proof -> same-PR
  handoff. Source/mirror parity, intent validation/staleness and MDX compile
  pass. No workflow/helper/installed lock changes; their smoke lanes are N/A.
- Bounded deslop accepted internal narration deletion and typed token call;
  preserved external protocol and browser/SSR/Convex constraints. Slop scanner
  catches for malformed JWT decoding and independent trip-listener delivery
  are intentional boundary behavior, covered by tests, not error hiding.
  Settlement installation is intentionally client-wide idempotent bookkeeping,
  not a provider render-state publication; no unrelated lifecycle rewrite.
  Pre-existing OTT casts are outside the changed auth-admission invariant.
- Final delivery protocol: commit all source/plan evidence, validate pending
  merge cancellation and contributor ref, push without rewriting history,
  read body/head back, replay both P1 proofs at that committed live head,
  independent verifier posts exact-head/base/patch-id verdict, then post and
  read the terminal feedback receipt. No receipt-only branch commit.
- Required main rules: one approving review, code-owner approval and approval
  by someone other than last pusher; only CI is a required status check.
  Vercel preview authorization is not a required check. No admin/auto merge.

Feedback ledger:
| URL | Classification | Rationale / proof |
| --- | --- | --- |
| https://github.com/udecode/kitcn/pull/475#issuecomment-5916047277 | informational, not actionable | Changeset bot detects patch release metadata; existing changeset verified |
| https://github.com/udecode/kitcn/pull/475#issuecomment-5916047348 | informational, not actionable in this task | Contributor preview requires Vercel team authorization; live main rules require CI, not Vercel |
| https://github.com/udecode/kitcn/pull/475#issuecomment-5916047404 | informational, not actionable code feedback | Hosted review quota notice; independent source proof and successful local autoreview cover review |

Local review findings:
| Finding | Priority | Rationale | Proof |
| --- | --- | --- | --- |
| Late guard after page trip never closes/notifies | P1 | Breaks terminal reload notification contract | New late-enable provider regression, RED then GREEN |
| Baseline changes in admission callback publish stale token | P1 | Token subscribers see a token current identity disallows | New post-callback publication regression, RED then GREEN |
No actionable GitHub P0-P3 findings; no implicit P2/P3 deferral.

Timeline:
- 2026-10-01T08:50:02.238Z Autoclosure plan created.
- 2026-10-01 Both new behavioral defects reproduced and repaired; source
  checks, independent proof, full runtime and autoreview pass. Final versioned
  snapshot hands exact-head replay/body/receipt gates to external delivery.

Reboot status:
| Question | Answer |
| --- | --- |
| Where am I? | Source repairs verified; final gate and delivery |
| Where am I going? | Exact-head delivery, external receipt, protected approval |
| What is the goal? | Verify and land PR #475 if protected readiness permits |
| What have I learned? | See closure matrix |
| What have I done? | See timeline |

Open risks:
- Protected approval requires another authorized reviewer after our push.
- One optimisticAuth setting per client and unsupported mixed kitcn revisions
  remain documented constraints; neither fix changes the public API.
