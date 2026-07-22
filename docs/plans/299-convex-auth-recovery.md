# Convex auth recovery

Objective:
Ship provider-owned Convex auth recovery for issue #299; done when recovery
cases, docs, package/repo gates, review, and PR pass.

Flow mode:
one-shot execution

Goal plan:
docs/plans/299-convex-auth-recovery.md

Template:
docs/plans/templates/major-task.md

Primary template:
docs/plans/templates/major-task.md

Applied packs:
- package-api (docs/plans/templates/packs/package-api.md)
- docs (docs/plans/templates/packs/docs.md)

Major source:
- type: public GitHub issue
- id / link: #299 / https://github.com/udecode/kitcn/issues/299
- title: Proposal: first-class Convex auth recovery (rebind after AuthenticationManager reaches terminal noAuth)
- decision to make: define and ship a kitcn-owned recovery contract without
  monkey-patching `ConvexReactClient.setAuth`.
- decision criteria: recovery must work with kitcn's Better Auth provider and
  generic React auth wrapper, preserve Convex provider callbacks, deduplicate
  concurrent calls, resolve only after backend confirmation, fail cleanly on
  timeout/logout/unmount, and keep the public surface small.

Major lane:
- lane: architecture / public API plus code-changing execution
- output type: verified package implementation, current-state docs, changeset,
  and GitHub PR
- implementation expected: yes
- affected packages / surfaces: `packages/kitcn/src/react`,
  `packages/kitcn/src/auth-client`, `kitcn/react` exports, auth tests,
  `www/content/docs/auth/client.mdx`, published auth skill guidance, changeset
- dominant risk: a recovery layer that replaces Convex callbacks, reports false
  success, retries after logout/unmount, or exposes a foreign-client patch as
  public API

Timed checkpoint:
- requested duration: N/A: none requested
- semantics: N/A: completion is evidence-gated, not timed
- initial confidence score: N/A: exact case and command thresholds apply
- improvement loop: vertical red-green recovery cases, then review/check repair
- final score / loop closure: N/A: close only on the named proof gates

Completion threshold:
- A focused test reproduces terminal auth loss before the fix.
- Provider-controlled recovery passes success, concurrent dedupe, timeout,
  logout, unmount, and stale/frozen token cases without replacing or wrapping
  `client.setAuth`.
- The selected public hook/types export from `kitcn/react`, Better Auth and
  generic auth-provider paths use the same canonical recovery owner, and docs
  plus published skill guidance match the shipped API.
- Focused tests, package typecheck/build, `bun lint:fix`, `bun check`, final
  autoreview, changeset, commit/push/PR, PR read-back, and issue sync pass.
- Major-task closure is legal only when the decision criteria are satisfied or
  explicitly narrowed, facts/inference/recommendation are separated, required
  review or pressure passes are recorded, implementation gates are closed when
  code changed, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/299-convex-auth-recovery.md`
  passes.

Verification surface:
- Focused Bun React tests that exercise the public provider/hook contract.
- Source audit proving no `setAuth` monkey-patch or client augmentation exists.
- Package typecheck/build, root lint/check, current-state docs/skill sync audit,
  changeset, final autoreview, GitHub PR and issue read-back.

Constraints:
- Start from repo evidence before external claims.
- Keep helper stack proportional.
- Separate measured evidence, source evidence, inference, and recommendation.
- Implement in the React/provider owner; do not modify Convex source or patch a
  `ConvexReactClient` instance.
- Preserve logout fail-closed behavior, provider callback ownership, SSR auth
  behavior, React Native compatibility, and narrow client bundles.
- Hard-cut freedom is available, but no breaking change is planned unless the
  implementation proves one necessary and the user confirms it.

Boundaries:
- Source of truth: GitHub issue #299, `VISION.md`, current auth providers,
  public exports, focused tests, current Convex auth lifecycle source.
- Allowed edit scope: issue plan; package React/auth-client source and tests;
  package exports; auth docs and mirrored skill guidance; changeset.
- External sources: local installed Convex source first; official Convex docs
  or the latest npm package only when the installed source cannot settle a
  version-sensitive behavior.
- Browser surface: N/A: provider lifecycle is proved at the React integration
  boundary; no visual UI changes are requested.
- GitHub sync: task-owned commit, push, task-style PR, PR body read-back, and
  concise issue comment after verified delivery.
- Non-goals: changing Convex; client prototype monkey-patches; automatic
  platform-specific foreground/network triggers; CLI/scaffolds/fixtures;
  unrelated auth redesign.

Output budget strategy:
- Read exact auth/provider/test/docs files; use focused `rg` with generated,
  build, `tmp`, and `node_modules` excluded except when inspecting the named
  Convex lifecycle; cap command output and store long test/check logs in tool
  output rather than broad source dumps.

Blocked condition:
- Stop only if the public contract requires an unapproved breaking change, the
  real Convex lifecycle cannot be reproduced through an honest harness, or
  three different attempts expose the same external/tooling blocker with no
  safe in-scope alternative.

Major state:
- task_type: major
- task_complexity: major
- current_phase: closeout
- current_phase_status: completed
- next_phase: final response
- goal_status: active

Current verdict:
- verdict: valid problem, rejected implementation shape
- confidence: high: characterization plus Better Auth red-green proof reproduces
  the terminal loss and provider-owned recovery
- next owner: PR #301 maintainer review and merge
- reason: terminal recovery is real and kitcn must own Better Auth compatibility,
  but capturing/monkey-patching `client.setAuth` is rejected.

Completion rule:
- Do not call `update_goal(status: complete)` while any required checklist item
  remains unchecked. If an item does not apply, check it and add `N/A: <reason>`.
- Do not call `update_goal(status: complete)` until every completion threshold
  above is satisfied, final evidence is recorded, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/299-convex-auth-recovery.md`
  passes.
- Do not create hook state for this goal. This file plus the active goal are the
  durable state.

Start Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| Timed checkpoint parsed | no | No duration requested. |
| `major-task` loaded | yes | `.agents/skills/major-task/SKILL.md` read completely. |
| Active goal checked or created | yes | Goal created for this exact #299 outcome. |
| Source of truth read before analysis | yes | `gh issue view 299 --comments` plus `VISION.md` and auth source read. |
| Major lane selected | yes | Architecture/public API plus implementation. |
| Decision criteria stated | yes | `Major source` and completion rows above. |
| Existing repo patterns / prior decisions checked | yes | Current wrapper, Better Auth provider, auth docs, and doctrine inspected. |
| Helper stack selected | yes | `task` -> `major-task` + `autogoal` + `tdd`; `changeset` and final `autoreview`. |
| External research decision recorded | yes | Installed/local Convex source first; official source only for version gaps. |
| Implementation expectation recorded | yes | Verified code, docs, release artifact, and PR required. |
| Workspace authority selected | yes | `/Users/zbeyens/git/better-convex`; package tests/build own behavior proof. |
| Branch / PR expectation decided | yes | Task workflow will create/use issue branch and ship all checkout changes after `bun check`. |
| Output budget strategy recorded | yes | Focused reads/searches and capped outputs above. |
| Package/API pack selected | yes | `package-api` materialized. |
| Public surface or package boundary identified | yes | `kitcn/react` provider/hook surface in `packages/kitcn`. |
| Convex entry/import graph impact identified | no | Client-only React code; no Convex function entry is touched. |
| CLI/scaffold/generated impact identified | no | No CLI, scaffold, fixture, or generated owner in scope. |
| Release artifact path selected | yes | `.changeset` required for published `kitcn` behavior/API. |
| `changeset` skill loaded when `.changeset` is required | yes | `.agents/rules/changeset.mdc` read completely. |
| Package build / fixture impact decision recorded | yes | `packages/kitcn` tests/typecheck/build required; fixtures N/A. |
| Docs pack selected | yes | `docs` materialized. |
| Docs guidance loaded | yes | Convex docs sync contract read completely. |
| Docs lane selected | yes | `www` auth client reference plus mirrored auth feature guidance. |
| Target docs and nearest sibling docs read | yes | Provider/auth-flow and React Native sections read in both owners. |
| Docs style doctrine read | yes | `VISION.md` documentation doctrine and doc guidelines read. |
| Documented source owner identified | yes | `www/content/docs/auth/client.mdx`; skill file is compressed mirror. |

Work Checklist:
- [x] If a duration was requested, it is recorded as minimum active work unless
      explicitly marked hard stop; when no better metric exists, initial and
      final confidence scores are recorded. N/A: no duration requested.
- [x] Objective includes outcome, completion threshold, verification surface,
      constraints, boundaries, and blocked condition.
- [x] Major source records source type, id/link, title, decision type, expected
      outcome, decision criteria, likely files/packages/surfaces, browser
      surface, and highest-leverage owner.
- [x] Current state is mapped before proposing a new architecture, migration,
      benchmark, or plan.
- [x] Existing repo patterns, prior decisions, and nearby implementation
      constraints are recorded before external research.
- [x] External docs or source are used only where repo evidence does not settle
      the question, or N/A reason is recorded.
- [x] Options, recommendation, tradeoffs, blast radius, and rejection reasons
      are recorded.
- [x] Facts, inference, and recommendation are separated.
- [x] Public API, service/runtime, auth/session/permission, canonical data,
      Convex graph, CLI/generated, docs/example, and proof surfaces are mapped
      or N/A with reason.
- [x] At least one happy path and one denied/failure path are traced through
      exact symbols when implementation readiness is claimed.
- [x] Review or pressure lenses are selected and completed, or marked N/A with
      reason.
- [x] If implementation happens, touched-surface packs cover docs, browser,
      package/API, or agent-native surfaces as needed.
- [x] Workspace authority recorded: every proof command names the cwd/tool that
      owns the analyzed or changed behavior.
- [x] Output budget discipline recorded and followed: broad searches are
      scoped, capped, counted, or artifacted instead of streamed into goal
      context.
- [x] Accepted/actionable review findings are fixed or explicitly rejected with
      evidence.
- [x] Package/API pack: public API, package boundary, export, and release-artifact impact are recorded.
- [x] Package/API pack: release artifact matrix is applied: `.changeset` or explicit no-artifact reason.
- [x] Package/API pack: `.changeset` work loads `changeset` and follows its package/version/prose rules.
- [x] Package/API pack: no-artifact decisions state why the diff has no published package user-visible delta from `main`. N/A: published `kitcn` users receive an additive API/runtime delta.
- [x] Package/API pack: compatibility, migration, or hard-cut decision is explicit when public shape changes.
- [x] Package/API pack: affected Convex static import graphs stay narrow and
      plugin/per-module boundaries are used where appropriate.
- [x] Package/API pack: CLI commands remain deterministic, `--json` capable,
      and non-interactive with explicit confirmation bypass when relevant. N/A:
      no CLI contract changed.
- [x] Package/API pack: docs and `packages/kitcn/skills/kitcn/**` stay
      current-state synchronized when public guidance changes.
- [x] Package/API pack: package-owned typecheck/build/test proof is recorded or marked N/A with reason.
- [x] Package/API pack: `packages/kitcn` build, fixture sync/check, or other owning package proof is recorded when required.
- [x] Docs pack: docs lane, target docs, nearest sibling docs, and source owner are recorded.
- [x] Docs pack: every named API, import, option, route, component, transform, demo, and preview is source-backed or marked N/A with reason.
- [x] Docs pack: docs use current-state reference voice, not changelog voice.
- [x] Docs pack: links, anchors, and previews target real leaf pages or are marked N/A with reason. N/A: no links, routes, anchors, or previews added.

Completion Gates:
| Gate | Applies | Required action | Evidence |
|------|---------|-----------------|----------|
| Named verification threshold | yes | Run the named package/repo checks and issue lifecycle cases | 44 focused tests, package/docs builds, Intent checks, clean autoreview, and `bun check` exit 0. |
| Current-state source audit | yes | Map current owner, boundaries, constraints, and affected surfaces | Findings and service/API/auth map identify stock Convex lifecycle, kitcn wrapper, Better Auth owner, docs, and release boundary. |
| Decision criteria closure | yes | Mark each criterion satisfied, narrowed, rejected, or blocked with evidence | Same canonical owner, exact promise dedupe, binding correlation, confirmation, typed failure, docs, and proof all satisfied. |
| Options / tradeoffs / rejection record | yes | Record viable options, chosen recommendation, and why alternatives lose | Patch, remount, Better Auth-only, and automatic-policy alternatives rejected above. |
| Review / pressure pass | yes | Run selected reviewer/lens or record N/A with reason | Three repair passes plus final post-lint autoreview; final result clean at 0.91 confidence. |
| Review findings closure | yes | Fix or explicitly reject accepted/actionable findings and record closure proof | Both P2 retry races reproduced, fixed, tested, and accepted by clean final review. |
| External-source audit | yes | Cite official/local clone/external sources when used, or record N/A | GitHub issue #299 and installed Convex 1.38 source were inspected; no additional web claim required. |
| Implementation gates | yes | If code changed, close primary-template and touched-surface gates; otherwise N/A | Package/API and docs packs closed with source, tests, build, docs, changeset, and review. |
| Service/API/auth/data-flow map | yes | Prove every architecture surface below or record N/A | Every row below is implemented, proved, or explicitly N/A. |
| Final handoff contract | yes | Record recommendation, evidence, caveats, residual risk, and next owner | Contract below names recommendation, proof, caveat, PR/issue links, and maintainer owner. |
| Final lint | yes | Run `bun lint:fix` or scoped equivalent when files changed | `bun lint:fix` and final `bun lint` passed. |
| Output budget discipline | yes | Verify no unbounded high-volume command output was streamed, or record the accidental output and recovery | Searches were scoped/capped; noisy full gate was rerun into a temporary log with only its tail emitted. |
| Timed checkpoint | no | If duration was requested, keep improving until elapsed, then finish the current loop cleanly; otherwise N/A | N/A: no duration requested. |
| Agent-native reviewer | no | Run when agent workflow changes or record N/A | N/A: no agent workflow, skill, hook, command, or prompt changed. |
| Autoreview | yes | Run final review and close every accepted actionable finding | Final post-lint helper run clean: no accepted/actionable findings, patch correct at 0.91. |
| Goal plan complete | yes | Run `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/299-convex-auth-recovery.md` | Final invocation follows this GitHub closeout record before goal completion. |
| Public API / package boundary proof | yes | Source-audit public API, exports, and package boundary impact | `kitcn/react` export test plus generated `dist/react/index.d.ts` include hook, options, status, and error types. |
| Convex bundle/import proof | no | Audit affected function-entry static graphs or record N/A | N/A: only client React/auth-client entries changed; no Convex function import graph touched. |
| CLI/scaffold/generated proof | no | Prove command contract and regenerate owned output or record N/A | N/A: no CLI, scaffold, fixture, or generated source changed. |
| Release artifact classification | yes | Record whether the change is published package behavior/API/types/config/runtime or no published user-visible delta | Additive public `kitcn/react` API and client runtime behavior require a patch release. |
| Published package changeset | yes | If published package users see a delta, load `changeset` and add/update one `.changeset/*.md` per package | `.changeset/brave-cats-recover.md` declares `kitcn: patch` with current behavior. |
| No release artifact | no | If no artifact is needed, record the exact reason | N/A: published package users receive a public API/runtime delta. |
| Package typecheck/build/test | yes | Run owning package checks or record N/A with reason | 44 focused tests, root typecheck, repeated `packages/kitcn` build, and `bun check` passed. |
| Fixture/scaffold generation | no | Run fixture sync/check when scaffold output changed, otherwise N/A | N/A: no scaffold output changed; full fixture check still passed inside `bun check`. |
| Docs/package skill sync | yes | Synchronize current-state public guidance or record N/A | `www` client auth reference and published auth skill document the same hook/errors. |
| Docs source-backed claim audit | yes | Verify docs claims against current source or record N/A | Names, status, timeout, dedupe, failure codes, and provider support match source/tests. |
| Docs links / routes / previews | no | Verify leaf links, routes, anchors, and preview names or record N/A | N/A: no links, routes, anchors, or previews added. |
| Docs MDX/content parser | yes | Run the relevant `www` docs parser/build for MDX/content changes, or record N/A | `bun --cwd www build` compiled MDX and generated all 189 static pages. |
| Kitcn docs sync | yes | If `www/**` changed, update matching published skill content | Matching `packages/kitcn/skills/kitcn/references/features/auth.md` updated; Intent validate/stale passed. |

Phase / pass table:
| Phase | Status | Evidence | Next |
|-------|--------|----------|------|
| Intake and source read | completed | issue, doctrine, wrapper, Better Auth provider, local Convex lifecycle read | current-state map |
| Current-state map | completed | stable provider callback leaves terminal `noAuth` bound; characterization test passes | options |
| Options and recommendation | completed | provider-owned callback identity chosen; patch/remount/BA-only alternatives rejected | implementation |
| Review / pressure pass | completed | autoreview accepted two P2 races; both reproduced and fixed; final pass clean | verification |
| Implementation or plan artifact | completed | public hook/error contract, generic/Better Auth owner, tests, docs mirror, changeset added | verification |
| Verification | completed | focused tests, typecheck, package/docs build, lint, Intent checks, autoreview, and `bun check` exit 0 | closeout |
| Closeout | completed | commit `de71b7a9`, push, PR #301/body read-back, issue comment/read-back complete | final plan check and response |

Findings:
- Fact: issue #299 has no comments and requests recovery after Convex reaches
  terminal `noAuth` while the outer auth session remains valid.
- Fact: the generic `kitcn/react` wrapper currently delegates token fetching to
  Convex and only adds `ConvexAuthBridge`.
- Fact: the Better Auth provider owns a stable `fetchAccessToken`; transient
  token exchange failure can return `null`, while the stable callback prevents
  Convex's provider effect from rebinding.
- Fact: the installed Convex provider calls `client.setAuth` from an effect
  keyed by the supplied auth-hook identity; changing provider-owned callback
  identity triggers the supported cleanup/rebind lifecycle.
- Fact: a focused Better Auth test now executes `token -> null -> noAuth ->
  recover -> token -> authenticated` through the real kitcn token fetcher.
- Inference: kitcn must own a recovery adapter because Better Auth compatibility
  is a kitcn product promise and upstream acceptance is not assumed.
- Recommendation: rebind through provider-controlled callback identity and
  confirmation state, never by replacing `client.setAuth`.

Decisions and tradeoffs:
- Reject client monkey-patching and client augmentation -> foreign lifecycle and
  callback ownership would leak into public API -> provider callback identity
  can trigger the supported Convex effect instead.
- Reject key/remount recovery -> it would discard descendant React state -> the
  provider-owned binding version updates the callback without remounting
  children.
- Reject Better Auth-only recovery -> generic `ConvexProviderWithAuth` users
  have the same terminal-state risk -> one `kitcn/react` owner serves both.
- Reject automatic foreground/network policy -> kitcn cannot distinguish a
  transient backend loss from intentional app policy -> expose a typed manual
  hook and leave trigger policy to the caller.
- Scope first-class recovery to kitcn provider surfaces -> kitcn owns Better
  Auth compatibility and its generic wrapper -> automatic platform triggers
  remain caller policy.
- Ship an additive public contract from `kitcn/react`:
  `useConvexAuthRecovery()` returns `{ recover, status, error }`; `recover`
  deduplicates concurrent calls, defaults to a 10-second timeout, and resolves
  only after Convex backend confirmation.
- Compatibility: additive non-breaking API; no old surface, migration, shim, or
  Convex peer-version callback is required.

Implementation notes:
- `ConvexAuthBinding` owns a versioned `fetchAccessToken` callback passed into
  the stock Convex provider. Recovery increments only that version.
- `ConvexAuthRecoverySync` observes public `useConvexAuth` state inside the
  provider and settles only after a loading transition followed by confirmed
  authenticated/unauthenticated state.
- Better Auth imports the canonical kitcn wrapper; generic and Better Auth
  paths therefore share the exact recovery state machine.
- Public errors cover provider loading/logout, backend denial, timeout, and
  unmount cancellation. Pending calls share the exact same promise.
- Release artifact: `.changeset/brave-cats-recover.md` patches `kitcn`.
- CLI/scaffold/generated impact: N/A; no command, template, fixture, or
  generated file changes.
- Convex function import graph: N/A; all changes are client-only React/auth
  entry code and do not enter a Convex function bundle.

Review fixes:
- Scope baseline frozen before autoreview: issue #299 on current branch
  `codex/sync-repo-skills`; owner boundary is `kitcn/react` plus the Better Auth
  provider; changed bundle is nine files (two source, three tests/export proof,
  two docs owners, one changeset, one goal plan); production source delta is
  327 added lines before review. No client patch, remount, automatic trigger,
  CLI, scaffold, or server bundle work may enter review fixes.
- Accepted P2: a timeout can leave Convex in `loading`; a retry initialized
  `sawLoading=false`, so it ignored a later successful confirmation. Added a
  red retry-after-timeout test, then initialized the new attempt from the latest
  Convex snapshot. Focused retry test passes.
- Accepted follow-on P2: the old binding could settle a retry in the same React
  batch before its effect cleanup. Reproduced the race, then correlated each
  pending attempt to its versioned binding's token-fetch invocation. Old
  callbacks cannot settle the replacement promise; all 44 focused tests pass.
- Final autoreview: clean, no accepted/actionable findings; patch judged correct
  at 0.90 confidence after the two accepted race fixes.

Error attempts:
| Error / failed attempt | Count | Next different move | Resolution |
|------------------------|-------|---------------------|------------|
| Large plan patch missed final template context | 1 | Split into bounded sections | Plan populated successfully. |
| Docs patch assumed a hook table in the long MDX page | 1 | Read exact section and insert beside `useAuthGuard` | Docs and skill mirror updated. |
| Timeout test observed state before React committed it | 1 | Await rejection inside `act` | Typed timeout and failed status pass without warnings. |
| Root `bunx intent` resolved an unrelated package without an executable | 1 | Use the repo script and run stale from `packages/kitcn` | Skill validation and stale checks pass. |
| Retry after timeout ignored successful confirmation | 1 | Track current Convex snapshot and seed the retry state | New red test failed, then passed after the state-machine fix. |

Verification evidence:
- `/Users/zbeyens/git/better-convex`: 41 focused tests across auth store,
  Better Auth provider, and public React exports passed before the final two
  provider-precondition cases were added.
- `/Users/zbeyens/git/better-convex`: `bun typecheck` passed all five owning
  workspaces after implementation.
- Characterization: stable binding remains `noAuth` and does not call
  `client.setAuth` again until explicit recovery.
- Recovery proof: happy path, exact concurrent promise dedupe, latest fetcher,
  backend denial, preserved child state, timeout, correlated retry, logout, and
  unmount passed (44 tests, 140 assertions).
- Better Auth proof: first real token exchange returns `null`; recovery rebinds,
  second exchange returns a JWT, then Convex confirms auth.

Service / API / auth / data-flow map:
| Surface | Current owner | Target decision | Evidence | Status |
| --- | --- | --- | --- | --- |
| public API/types/errors | `packages/kitcn/src/react/auth-store.tsx` | additive hook, status, options, typed errors exported via `kitcn/react` | public export test and typecheck | implemented |
| service/runtime/lifecycle | stock Convex provider effect plus kitcn wrapper | version provider-owned fetch callback; observe public auth state | focused lifecycle tests | implemented |
| auth/session/permission | Better Auth `sessionRef`, token store, Convex backend confirmation | permit recovery only while provider session is authenticated and settled | success/loading/logout/backend-denial tests | implemented |
| canonical data/transactions/deletion | Better Auth session and token store remain canonical | N/A: no data model, transaction, or deletion change | source audit | N/A |
| Convex static import graph | no server function entry touched | keep change in client-only React/auth-client entries | changed-file source map | N/A |
| CLI/scaffold/generated | no owner touched | N/A: no command or generated output | changed-file source map | N/A |
| docs/examples/package skill | client auth MDX plus published auth reference | current-state hook contract mirrored in both owners | source-backed claim audit pending | implemented |
| proof/benchmark/rollback | Bun React harnesses and package gates | regression tests plus normal code revert; no migration | focused tests passed; final gates pending | in_progress |

Final handoff contract:
- Recommendation: merge PR #301; kitcn owns recovery at its provider boundary,
  not through a Convex client patch.
- Confidence: 95%: exact Better Auth and generic lifecycle proof, two race
  regressions, full repo gate, and clean structured review.
- Evidence: provider-owned versioned binding, typed public hook/errors, current
  docs/skill mirror, patch changeset, 44 focused tests / 140 assertions.
- Tests / commands: focused Bun tests; `bun lint:fix`; `bun typecheck`;
  `bun --cwd packages/kitcn build`; `bun --cwd www build`; Intent validate and
  stale checks; final `bun check` with explicit `EXIT_CODE=0`; final autoreview
  clean at 0.91 confidence.
- Browser proof: N/A: no rendered UI change; React/provider lifecycle is the
  owning proof boundary.
- PR / GitHub issue: https://github.com/udecode/kitcn/pull/301 open with body
  verified; https://github.com/udecode/kitcn/issues/299 remains open and has the
  QA-focused #301 comment verified by read-back.
- Caveats: recovery is explicit by design; apps own trigger policy and must not
  invoke it for intentional sign-out. Convex private callbacks remain untouched.
- Next owner: maintainer reviews/merges #301, then QA forces one terminal token
  refresh failure and confirms queries resume after backend confirmation.

Timeline:
- 2026-07-22T18:45:17.493Z Major-task goal plan created.
- 2026-07-22 Provider-owned callback rebind selected after source and option audit.
- 2026-07-22 TDD lifecycle, Better Auth, public export, docs mirror, and changeset implemented; focused tests and root typecheck green.
- 2026-07-22 Full repo gate exited 0; PR #301 opened/read back; issue #299 QA comment posted/read back.

Reboot status:
| Question | Answer |
|----------|--------|
| Where am I? | GitHub delivery complete; final goal-plan audit |
| Where am I going? | Mark goal complete and hand PR #301 to maintainers |
| What is the goal? | Ship provider-owned Convex auth recovery for #299 with full package and GitHub proof. |
| What have I learned? | Failure is real; provider callback identity drives the stock lifecycle, and Better Auth can recover on the next token exchange without patching the client. |
| What have I done? | Implemented, documented, reviewed, fully verified, committed, pushed, opened PR #301, and synchronized issue #299. |

Open risks:
- Current repo pins Convex 1.38 while issue references the newer
  `onRefreshChange` callback; the implementation must remain structurally
  compatible with supported Convex peer versions without depending on that
  callback.
- The generic auth wrapper receives an arbitrary `useAuth` hook; the selected
  recovery context must not violate React hook ordering or freeze closures.
  Latest-fetcher, binding-correlation, typecheck, and final autoreview proof are
  green; residual risk is limited to real-app trigger policy and maintainer QA.
