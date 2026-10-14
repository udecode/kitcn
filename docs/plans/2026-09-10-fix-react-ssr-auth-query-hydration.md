# Fix React SSR auth query hydration

Maintainer closeout (2026-09-10):
- The owner explicitly invoked `kitcn:autoclosure` for PR #459. Commit, push,
  feedback replies and delivery are authorized for this continuation; the
  contributor's earlier user-owned Git boundary below describes that earlier
  run only.
- Current closure ledger: `docs/plans/2026-09-10-pr459-autoclosure.md`.
- At e02ac1f39124e0adabb1d164ababb0e8024db312, this checkout independently passed
  all 143 React tests, the kitcn package build and this plan's checker. The
  contributor's earlier build failure does not reproduce locally.
- CI failed on generated fixture manifests. `bun run fixtures:sync` regenerated
  six manifests with lucide-react ^1.44.0; no hand edits to fixture outputs.
- Full `bun check` passes locally, including regenerated fixture checks,
  verify and runtime lanes. Independent review of the PR source found no P0/P1
  defects. The previous local-complete verdict is not a merge-ready verdict:
  Vercel fork-deployment authorization awaits the owner's confirmation, and
  fixture-repair delivery is recorded in the closure ledger.

Objective:
Stop `CRPCProvider` clearing authenticated cRPC queries when Convex confirms a
token the client already held; done when React tests, lint, release note, and
task-plan checks pass, with the known upstream build failure recorded.

Goal plan:
docs/plans/2026-09-10-fix-react-ssr-auth-query-hydration.md

Template:
docs/plans/templates/task.md

Task source:
- type: single-PR bug fix
- id / link: #459 https://github.com/udecode/kitcn/pull/459
- title: authenticated SSR cRPC hydration is cleared when Convex confirms the
  same token
- acceptance criteria: preserve hydrated authenticated queries during same-token
  confirmation; retain resets for rejection, sign-out, and identity changes;
  preserve explicit reset behavior; pass focused verification.
- caveat: commit, push, PR replies, and thread resolution are user-owned.
- likely owner: `packages/kitcn/src/react/context.tsx` and its focused test.
- browser surface: provider hydration behavior; covered at the React lifecycle
  boundary without changing rendered UI.
- root-cause layer: auth-state transition handling in `CRPCProviderInner`.

Task PR:
#459 https://github.com/udecode/kitcn/pull/459

Timed checkpoint:
- requested duration: N/A; no duration requested.
- semantics: N/A.
- initial confidence score: N/A; direct regression coverage is the threshold.
- improvement loop: N/A.
- final score / loop closure: N/A.

Completion threshold:
- The same-identity false-to-true auth confirmation leaves hydrated queries
  intact.
- Token rejection, sign-out, and identity changes still reset auth queries;
  explicit `resetAuthQueries()` remains unchanged.
- Focused React tests, lint, the release artifact, and this plan's completion
  checker pass; the package build is run and any upstream-baseline failure is
  recorded honestly.
- Review feedback has source-backed dispositions. The user explicitly owns the
  resulting commit, push, replies, and resolution.

Verification surface:
- `bun test packages/kitcn/src/react/`
- `bun --cwd packages/kitcn build`
- `bun lint:fix`
- `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-09-10-fix-react-ssr-auth-query-hydration.md`
- Source audit of the PR diff, existing unreleased changesets, and the two review
  findings supplied for PR #459.

Constraints:
- Preserve auth-query clearing for actual identity changes and rejected tokens.
- Do not replace or intercept explicit `resetAuthQueries()` calls.
- Keep the fix in the shared React provider rather than patching downstream apps.
- Reuse an existing unreleased `kitcn` changeset.
- Do not stage, commit, push, reply, resolve threads, or otherwise mutate the PR;
  the user explicitly retained those actions.

Boundaries:
- Source of truth: PR #459, the supplied review comments, current branch diff,
  `CRPCProviderInner`, and its focused React tests.
- Allowed edit scope: the task plan and existing release changeset for this
  feedback pass; the existing runtime fix and tests remain unchanged.
- Browser surface: no rendered component changed; provider state transitions are
  exercised by React tests.
- GitHub issue sync: N/A; this task is PR-backed with no separate issue.
- Non-goals: redesigning auth, changing cRPC APIs, touching example scaffolds, or
  broad query-cache invalidation changes.

Output budget strategy:
- Read exact instruction, plan, changeset, provider, and test files; use capped
  diffs and focused commands rather than broad repository output.

Blocked condition:
- Stop if the requested feedback conflicts with runtime behavior, the existing
  release draft cannot represent a patch entry, or focused verification exposes
  a regression requiring product/API direction.

Task state:
- task_type: bug fix with PR-feedback repair
- task_complexity: non-trivial behavior fix; feedback repair is bounded
- current_phase: closeout
- current_phase_status: complete locally
- next_phase: user commit, push, reply, and thread resolution
- goal_status: locally complete

Current verdict:
- verdict: valid fix; both review findings accepted
- confidence: high at the provider/test boundary
- next owner: user
- reason: runtime proof and required local artifacts are complete; remote Git
  operations were explicitly declined for this assistant.

Implementation readiness:
- verdict: ready and implemented
- exact owner: `CRPCProviderInner`
- contradiction status: none
- source-listed cases complete: yes

Pre-solution issue challenge:
- reporter claim: same-token SSR auth confirmation clears hydrated authenticated
  cRPC queries.
- suggested diagnosis or fix: avoid treating the false-to-true confirmation as
  an identity transition.
- repro ladder:
  - tests / source-level repro: focused provider lifecycle test reproduces the
    transition and observes `resetAuthQueries()`.
  - repo-owned automated browser or integration proof: N/A; the React harness
    directly owns the state transition.
  - Browser plugin: N/A; no rendered UI implementation exists in this PR.
  - screenshot / visual proof: N/A; cache reset is not a visual artifact.
- reproduction verdict: reproduced at the provider boundary.
- validity verdict: valid.
- best long-term fix boundary: shared `CRPCProviderInner` transition logic.
- harsh honest feedback: resetting on every `isAuthenticated` change confused
  token validation state with reader identity.
- hard-stop decision: proceed; the claim is reproduced and the owner is known.

Completion rule:
- Close locally only after every checklist item and gate below is resolved and
  the plan checker passes. Commit/push/reply/resolve remain with the user.

Start Gates:
| Gate | Applies | Evidence |
| --- | --- | --- |
| Timed checkpoint parsed | no | No duration requested. |
| Walkthrough baseline | no | No rendered UI files changed. |
| Skill analysis before edits | yes | Root instructions, task, autogoal, PR-feedback, and changeset rules read. |
| Active goal checked or created | yes | Existing per-PR plan retained and completed. |
| Source of truth read before edits | yes | PR diff, provider, tests, plan, and changesets inspected. |
| Exact per-PR task ownership | yes | This plan owns PR #459 only. |
| GitHub comments and attachments read | yes | Two supplied inline comments were triaged; API fetch was unavailable. |
| Video transcript evidence required | no | No video supplied. |
| Pre-solution issue challenge required | yes | Behavior claim reproduced at provider boundary. |
| Reproduction verdict before implementation | yes | Existing focused test records the failing transition. |
| Repro escalation ladder selected | yes | React lifecycle harness is the smallest honest owner. |
| Suggested fix reviewed against durable boundary | yes | Shared provider fix retained; no downstream workaround. |
| `docs/solutions` checked | yes | Related timing solutions inspected; none owns this exact transition. |
| TDD decision before behavior change | yes | Provider tests cover both auth transition directions. |
| Branch decision | yes | Dedicated branch already owns PR #459. |
| Release artifact decision | yes | Reuse `.changeset/wide-index-union-stays-indexed.md`. |
| Browser tool decision | no | Provider transition is directly observable in React tests. |
| Commit / PR expectation decision | yes | User explicitly declined assistant commit/push/PR mutations. |
| Task-style PR body decision | yes | Existing PR body owns presentation; no mutation authorized. |
| Task-plan PR body evidence | yes | PR review references this plan at the PR head. |
| GitHub issue sync expectation | no | No separate issue. |
| Output budget strategy recorded | yes | Exact files and capped output used. |

Work Checklist:
- [x] No duration was requested; timed work is N/A.
- [x] Objective, threshold, verification, constraints, boundaries, and blocker
      are concrete.
- [x] Task source records PR, acceptance cases, owner, and browser surface.
- [x] This plan owns exactly PR #459.
- [x] Video evidence is N/A because none was supplied.
- [x] The public behavior claim was challenged and reproduced.
- [x] The repro ladder stops at the owning React lifecycle harness.
- [x] The valid bug proceeded only after its owner was identified.
- [x] Nearby instructions, implementation, tests, solutions, and release rules
      were read.
- [x] Every source-listed behavior case has an owner and proof row.
- [x] Readiness is `ready` with no unresolved contradiction.
- [x] The shared provider owns the fix; no downstream workaround was added.
- [x] The release note reuses an existing unreleased changeset.
- [x] Final handoff separates local edits from user-owned Git/PR actions.
- [x] Commit and push are N/A because the user explicitly declined them.
- [x] PR body mutation is N/A because the user retained remote actions.
- [x] The plan exists at the PR head and identifies PR #459.
- [x] The dedicated branch remains unchanged.
- [x] Local install corruption was not indicated; reinstall is N/A.
- [x] Verification runs in `/Users/tim/Repositories/kitcn`, the owning repo.
- [x] Output remained scoped to exact files and capped diffs.
- [x] High-risk note recorded: a false negative could retain another identity's
      cache; identity-change and rejection tests guard that boundary.
- [x] Additional autoreview is N/A for this feedback-only docs/release repair;
      the runtime diff was already reviewed.
- [x] Agent-native review is N/A; no agent workflow files changed.

Completion Gates:
| Gate | Applies | Required action | Evidence |
| --- | --- | --- | --- |
| Named verification threshold | yes | Run focused tests, package build, lint, and plan checker. | 143 tests pass; lint and checker pass; build reaches documented upstream dependency gate. |
| Exact per-PR task ownership | yes | Name one PR and plan. | PR #459 and this plan. |
| Pre-solution issue challenge verdict | yes | Record claim, repro, validity, and boundary. | Valid; reproduced in provider harness. |
| Repro escalation ladder | yes | Record each applicable layer. | React harness applies; browser/visual layers are N/A. |
| Bug reproduced before fix | yes | Exercise same-token false-to-true transition. | Focused test covers it. |
| Targeted behavior verification | yes | Run React suite. | 143 pass, 0 fail. |
| TypeScript changed | yes | Run focused tests and package build. | Tests pass; build reaches known `better-call`/`rou3` gate. |
| Package exports or file layout changed | no | N/A. | Neither changed. |
| Package manifests or install graph changed | yes | Regenerate fixture manifests through the CLI and verify the generated applications. | Six next/start/vite fixture manifests, with and without auth, use lucide-react ^1.44.0; fixtures:sync and all eight fixtures:check comparisons pass within full bun check. |
| Agent rules or skills changed | no | N/A. | None changed. |
| Workspace authority proof | yes | Run commands in kitcn repo/package. | Tests and lint ran at root; build ran in `packages/kitcn`. |
| Browser surface changed | no | N/A. | No rendered UI changed. |
| Browser final proof | no | N/A. | Provider lifecycle is directly tested. |
| UI walkthrough | no | N/A. | No UI output changed. |
| Scaffold or fixture output changed | yes | Run fixtures:sync and fixtures:check; never hand-edit generated output. | CLI regeneration changed six fixture manifests; all eight fixture comparisons and runtime lanes pass. Scaffold source remains unchanged. |
| Package behavior or public API changed | yes | Reuse active changeset. | Existing draft updated; new duplicate removed. |
| Docs and kitcn skill sync changed | no | N/A. | User docs and published skill docs unchanged. |
| Docs or content changed | yes | Validate plan and release copy. | Plan checker passes; lint checks 970 files with no fixes. |
| High-risk mini gate | yes | Guard identity isolation and rejection behavior. | Tests cover identity change, sign-out, and rejection. |
| Agent-native reviewer | no | N/A. | No agent/tooling changes. |
| Local install corruption suspected | no | N/A. | No corruption-shaped failure. |
| Commit created | no | N/A. | User explicitly said not to commit. |
| PR create or update | no | N/A. | PR exists; user owns push and update. |
| Task-style PR body verified | no | N/A. | Remote read-back is outside this feedback pass. |
| PR task evidence verified | yes | Plan identifies exact PR. | This file names #459. |
| PR proof image hosting | no | N/A. | No proof image needed. |
| GitHub issue sync-back | no | N/A. | No separate issue. |
| Final handoff contract | yes | Record local result and user-owned next action. | Filled below. |
| Final lint | yes | Run `bun lint:fix`. | 970 files checked; no fixes applied. |
| Output budget discipline | yes | Keep reads and output bounded. | Exact-file reads used; one broad read was replaced with slices. |
| Timed checkpoint | no | N/A. | No duration requested. |
| Autoreview | no | N/A. | Feedback repair changes only plan and release metadata. |
| Goal plan complete | yes | Run the mechanical checker. | `[autogoal] complete`. |

Phase / pass table:
| Phase | Status | Evidence | Next |
| --- | --- | --- | --- |
| Intake and source read | complete | PR diff, instructions, plan, changesets, and comments inspected. | implementation |
| Implementation | complete | Shared provider fix and tests present; review artifacts corrected locally. | verification |
| Verification | complete | Focused commands recorded below. | closeout |
| Commit / PR / GitHub sync | complete | Delegated to user; assistant made no Git or remote mutations. | user action |
| Closeout | complete | Local diff and remaining user action reported. | user commit/push |

## Problem

`CRPCProviderInner` reset every auth-bound query when either the token identity
or `isAuthenticated` changed. The flag reports whether Convex has accepted the
current token, not who holds it, so it turns from false to true on every
server-rendered page once Convex validates the token that arrived in the HTML.
The reset erased the queries the same render hydrated.

## Canonical reproduction path

`example/src/components/providers.tsx` prefetches
`crpc.user.getCurrentUser.queryOptions(undefined, { skipUnauth: true })` and
wraps the tree in `HydrateClient`.
`example/src/lib/convex/convex-provider.tsx` passes that request's token to
`ConvexAuthProvider` and mounts `CRPCProvider` under it. A client reading that
query used to lose the hydrated result on load.

## Fix

`packages/kitcn/src/react/context.tsx` compares the token-derived identity and
the direction of settled authentication changes. `resolveAuthIdentity` already
collapses a JWT to its non-volatile claims, so routine rotation stays a no-op.
Signing out, switching accounts, an opaque token becoming a JWT, and changing
another identity claim still produce a different identity. Convex confirming
the same SSR token from false to true preserves hydrated data; Convex rejecting
an accepted token from true to false clears auth-bound queries even when the
token remains cached. Explicit `resetAuthQueries()` calls are untouched.

## Tests

`packages/kitcn/src/react/context.test.tsx` covers both directions explicitly: a
JWT present on the first render survives initial false-to-true confirmation,
while a previously accepted token moving true to false resets auth-bound
queries. Existing account-switch, claim-change, opaque-to-JWT, sign-out,
explicit-reset, and rotation cases remain.

Findings:
- The new release-note file violated the repository rule because multiple
  unreleased `kitcn` drafts already exist.
- The initial plan described the bug and fix but omitted the task template's
  completion and evidence surfaces.
- Related solution notes cover auth/query-client wiring and loader timing, not
  this false-to-true provider transition.

Decisions and tradeoffs:
- Ignore same-identity false-to-true confirmation only; clearing on rejection
  and identity change protects cache isolation.
- Update the current minor release draft's `## Patches` section rather than
  retaining a second patch changeset.
- Keep browser proof N/A because the React provider harness directly exercises
  the transition without a rendered UI change.

Implementation notes:
- Runtime behavior and tests were not changed during feedback repair.
- `.changeset/lucky-cups-shine.md` was removed and its user-facing patch bullet
  moved to `.changeset/wide-index-union-stays-indexed.md`.
- The per-PR plan now records the complete task contract and evidence.

Review fixes:
- “Complete the task plan before treating it as PR evidence” -> accepted ->
  completed threshold, verification, constraints, boundaries, blocker,
  checklists, phases, evidence, and handoff state.
- “Reuse an existing unreleased changeset” -> accepted -> merged the patch entry
  into the active release draft and removed the duplicate file.

Error attempts:
| Error / failed attempt | Count | Next different move | Resolution |
| --- | --- | --- | --- |
| GitHub helper could not resolve fork as upstream repo | 1 | Use supplied comments | Supplied comments became the bounded feedback inventory. |
| GitHub API unavailable in sandbox | 1 | Use local PR diff and screenshot | No remote mutations attempted. |
| Initial broad instruction read was truncated | 1 | Read exact slices | Relevant instructions were read in bounded chunks. |

Verification evidence:
- `bun test packages/kitcn/src/react/` in `/Users/tim/Repositories/kitcn` ->
  143 pass, 0 fail, 420 expectations.
- `bun --cwd packages/kitcn build` -> React, Solid, and CLI bundles build; the
  remaining entry stops at the documented upstream-main `better-call`/`rou3`
  `inlineOnly` gate. The original task run reproduced the same failure on
  pristine `5b0bd5a1`; this feedback pass does not alter package code.
- `bun lint:fix` -> 970 files checked, no fixes applied.
- `git diff --check` -> clean.
- Plan checker -> `[autogoal] complete`.

Source-listed case matrix:
| Case | Source claim | Harness | Before | Expected after | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| SSR confirmation | Same-token false-to-true clears hydrated queries. | React provider test | reset called | no reset | focused React suite | covered |
| Token rejection | True-to-false with retained token must clear. | React provider test | reset called | reset called | focused React suite | covered |
| Sign-out | Removing the token must clear. | Existing provider test | reset called | reset called | focused React suite | covered |
| Identity change | Account or stable claim change must clear. | Existing provider tests | reset called | reset called | focused React suite | covered |
| Token rotation | Volatile JWT claims alone must not clear. | Existing provider test | no reset | no reset | focused React suite | covered |
| Explicit reset | Direct reset remains effective. | Existing query-client behavior | effective | effective | method remains untouched | covered |

Final handoff contract:
- Commit line: N/A; user explicitly retained commit authority.
- PR line: PR #459 exists; user owns pushing this local feedback repair.
- Issue line: N/A; no separate issue.
- Confidence line: high for the bounded local repair and provider behavior.
- Flow table:
  - Reproduced: React lifecycle tests; browser N/A.
  - Verified: focused suite, lint, plan checker, and documented package-build
    baseline failure.
- Browser check: N/A; no rendered UI change in this repository.
- Outcome: hydrated auth queries survive same-token confirmation while real auth
  boundary changes still clear them.
- Caveat: GitHub replies and thread resolution wait for the user's commit/push.
- Design:
  - Chosen boundary: shared `CRPCProviderInner` transition logic.
  - Why not quick patch: downstream apps cannot safely own provider cache rules.
  - Why not broader change: token identity normalization and explicit resets
    already behave correctly.
- Verified: see evidence section.
- PR body verified: N/A for this local-only feedback pass.

Final handoff / sync:
- Commit: user-owned; no assistant commit.
- PR: #459; no assistant push, reply, or resolution.
- Issue: N/A.
- Browser proof: N/A; provider lifecycle tests own proof.
- Caveats: remote feedback remains open until the user performs remote steps.

Timeline:
- 2026-09-10: Task plan created for PR #459.
- 2026-09-10: Runtime fix and provider regression tests implemented.
- 2026-09-10: Review feedback accepted; plan completed and release note folded
  into the existing unreleased draft.
- 2026-09-10: Focused verification rerun after feedback edits.

Reboot status:
| Question | Answer |
| --- | --- |
| Where am I? | Local feedback repair complete. |
| Where am I going? | User reviews, commits, pushes, replies, and resolves PR threads. |
| What is the goal? | Preserve SSR-hydrated auth queries during same-token confirmation. |
| What have I learned? | Auth confirmation is validation state, not identity change. |
| What have I done? | Corrected release metadata and completed per-PR evidence. |

Open risks:
- The local feedback corrections are uncommitted and the two GitHub threads
  remain unresolved until the user performs the remote steps.

Hard closeout guard:
- Satisfied locally because the user explicitly declined assistant commit, push,
  reply, and resolution authority.
