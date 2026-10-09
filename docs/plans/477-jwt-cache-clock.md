# Make JWT cache time app-owned under Next partial prerendering

Objective:
Make JWT cache expiry use an app-owned sync/async clock; done when regression, Next rendering proof, check, review, and one PR pass.

Flow mode:
one-shot execution.

Goal control:
`get_goal` returned null. Use this task plan; native goal creation is not authorized by the user's ordinary task request.

Linked plans:
- None.

Goal plan:
docs/plans/477-jwt-cache-clock.md

Template:
docs/plans/templates/task.md

Primary template:
docs/plans/templates/task.md

Applied packs:
- package-api (docs/plans/templates/packs/package-api.md)
- docs (docs/plans/templates/packs/docs.md)
- browser (docs/plans/templates/packs/browser.md)
- agent-native (docs/plans/templates/packs/agent-native.md); materialized after preserving inherited workflow changes and adding published setup guidance.

Task source:
- type: GitHub bug
- id / link: https://github.com/udecode/kitcn/issues/477
- title: auth-nextjs JWT cache reads Date.now in Next runtime prerendering
- acceptance criteria: app-owned sync/async Unix-seconds clock; default cache behavior preserved; documented Next connection/private-cache boundaries; rejection propagation; disabled-cache alternative.

Timed checkpoint:
- requested duration: N/A: no timed request.
- semantics: N/A: one-shot task.
- initial confidence score: N/A: use acceptance rows.
- improvement loop: reproduce, implement, verify, review, repair.
- final score / loop closure: 95-100% confidence in bounded clock contract; final review and runtime proof passed.

Completion threshold:
- All source-listed cases verified or explicitly narrowed with evidence; package build, focused tests, root check, final autoreview, docs/skill sync, dedicated PR and issue sync complete.
- Task closure is legal only when the source-of-truth acceptance criteria are
  satisfied or explicitly narrowed, required verification evidence is recorded,
  code-review and release-artifact gates are closed when applicable, verified
  code changes are committed and PR'd unless explicitly declined or blocked,
  task-style PR body sync is complete or marked N/A with reason,
  GitHub issue/PR sync is complete or marked N/A with reason, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/477-jwt-cache-clock.md` passes.

Verification surface:
- Owning repo /Users/zbeyens/git/better-convex: public createContext regression tests, token tests, package build, typecheck, lint, bun check.
- Isolated Next runtime reproduction driven through Browser; synthetic JWT avoids backend/account dependence. Record exact installed version and dev/build proof limits.
- Source audit, docs parser, published skill sync, autoreview, GitHub PR body/head/issue readback.

Constraints:
- Preserve existing user-facing behavior outside the task scope.
- Prefer the durable ownership boundary over caller-by-caller patches.
- When a GitHub PR is in scope, this plan owns exactly one PR. A coordinating
  batch plan must link a separate task plan for every PR an agent processes.
- Verified code changes must be committed and PR'd because the task skill
  requires that path unless the user explicitly says not to, the work has no
  local patch, or a real blocker is recorded.
- The absence of a separate "open a PR" sentence from the user is not a valid
  N/A reason for verified code-changing task work.
- A PR created by this task must use the PR #270 emoji task-style PR body
  contract below, not a generic summary/body from a git helper skill.
- A task-run PR body must include
  `🧭 Task plan: docs/plans/<plan>.md`; the plan must exist at the PR head and
  identify the exact PR before autoclosure.
- Do not add broad ceremony when the task is trivial or docs-only.

Boundaries:
- Source of truth: issue #477, VISION.md, docs/README.md, auth-nextjs and internal token source, installed Next runtime and official docs.
- Allowed edit scope: auth clock API/tests, matching www and published skill docs, changeset, this plan. Preserve existing dirty files and include them at shipping per repo policy; do not redesign their workflows.
- Browser surface: isolated signed-in-token Server Component under Next cacheComponents; runtime and private-cache contexts.
- GitHub issue sync: #477 after dedicated PR exists.
- Non-goals: importing Next in generic auth code, automatic connection calls, recognizing Next private internals, suppressing aborts, auth backend/scaffold changes.

Output budget strategy:
- Exact owner files and bounded rg only; exclude tmp/build/node_modules except named Next runtime source. Cap ordinary output at 2-6k tokens. Save full check logs under ignored tmp and inspect summaries. Earlier combined template read truncated; recovered relevant sections with scoped reads.

Blocked condition:
- Stop only for irreproducible claim after bounded escalation, missing required runtime proof/tool access, or check/PR blocker after safe alternatives.

Task state:
- task_type: bug-fix
- task_complexity: bounded public API/runtime change
- current_phase: closeout
- current_phase_status: complete
- next_phase: final handoff
- goal_status: complete (plan-only; no native goal)

Current verdict:
- verdict: ready
- confidence: 95-100% for bounded clock contract; real Next16.4 proof complete
- next owner: task
- reason: generic token cache cannot choose the app's Next rendering stage.

Implementation readiness:
- verdict: ready
- exact owner: packages/kitcn/src/auth/internal/token.ts and auth-nextjs/index.ts
- contradiction status: repo docs app uses Next16.1.6; isolated Next16.4 reproduced and verified the issue's exact runtime version.
- source-listed cases complete: yes; matrix below captures claim and acceptance cases.

Pre-solution issue challenge:
- reporter claim: cached JWT expiry reads Date.now after headers during runtime prerendering; private cache allows clock but rejects connection.
- suggested diagnosis or fix: optional app-owned clock callback and Next guidance. Do not introduce library-owned connection or abort swallowing.
- repro ladder:
  - tests / source-level repro: token-utils defaults to Date.now; public context clock-trap regression fails before fix.
  - repo-owned automated browser or integration proof: no existing Next16.4 stage harness; created isolated app with source imports, no backend.
  - Browser plugin: Next16.4 /dashboard shows Blocking Route Date.now at token-utils.ts after headers.
  - screenshot / visual proof: tmp/walkthrough/477/00-blocking-route-original.jpg.
- reproduction verdict: reproduced.
- validity verdict: partially valid; clock issue reproduced, but private-cache helper alone does not replace Suspense for token-blocking layouts.
- best long-term fix boundary: factory jwtCache clock injected into generic expiry reader; Next stage remains app-owned.
- harsh honest feedback: the clock diagnosis is correct; do not make the library recognize Next abort internals or create permanently pending promises.
- hard-stop decision: proceed after reproduced overlay and independent design selection.

Completion rule:
- Do not call `update_goal(status: complete)` while any required checklist item
  remains unchecked. If an item does not apply, check it and add `N/A: <reason>`.
- Do not call `update_goal(status: complete)` until every completion threshold
  above is satisfied, final handoff evidence is recorded, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/477-jwt-cache-clock.md` passes.
- Do not create hook state for this goal. This file plus the active goal are the
  durable state.

Start Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| Timed checkpoint parsed | no | N/A: no duration. |
| Walkthrough baseline for possible UI change | yes | Captured tmp/walkthrough/477/baseline.json before first file edit. |
| Skill analysis before edits | yes | task, autogoal, poteto bug-fix, HOW, architect/arena, tdd, changeset, walkthrough, docs guidance read; final autoreview later. |
| Active goal checked or created | yes | get_goal null; task plan only under native-tool authority. |
| Source of truth read before edits | yes | Issue #477 including no comments/attachments; VISION and docs README; auth/Next source. |
| Exact per-PR task ownership | yes | Single exact PR #478 for issue #477; this plan owns it. |
| GitHub comments and attachments read | yes | No source comments or attachments. |
| Video transcript evidence required | no | N/A: no video. |
| Pre-solution issue challenge required | yes | Valid: Next16.4 Browser overlay reproduces Date.now at token-utils.ts. |
| Reproduction verdict before implementation | yes | Reproduced headers-first caller with synthetic fresh JWT on Next16.4. |
| Repro escalation ladder selected | yes | Source clock trace; existing token tests cannot model Next stages; isolated real Next + Browser overlay + saved screenshot. |
| Suggested fix reviewed against durable boundary | yes | App owns clock/render-stage policy; generic reader awaits callback outside decode catch. |
| `docs/solutions` checked for non-trivial existing-code work | yes | Bounded auth/Next solution search; related proxy/token behavior, no stage-aware clock fix. |
| TDD decision before behavior change or bug fix | yes | One public createContext regression before implementation; incremental token cases. |
| Branch decision for code-changing task | yes | codex/477-jwt-cache-clock from fresh kitcn/main; existing dirty files preserved. |
| Release artifact decision | yes | Patch changeset; changeset skill read; choose active draft after inspection. |
| Browser tool decision for browser surface | yes | @Browser on isolated localhost:3477 Next16.4. |
| Commit / PR expectation decision | yes | Task requires full-check verified checkout commit/push/PR. No merge authorization for this new PR. |
| Task-style PR body decision | yes | Task #270 emoji contract, confidence evidence-bound, preserve release block. |
| Task-plan PR body evidence | yes | PR #478 body names docs/plans/477-jwt-cache-clock.md; dedicated plan identifies #478. |
| GitHub issue sync expectation decision | yes | Pre-solution challenge and final PR #478 link/correction posted and read back. |
| Output budget strategy recorded | yes | Bounded reads/log files; recorded in Output budget strategy. |
| Package/API pack selected | yes | Published auth-nextjs clock API. |
| Public surface or package boundary identified | yes | AuthOptions.jwtCache optional clock -> GetTokenOptions.jwtCache. |
| Convex entry/import graph impact identified | yes | No new imports or Convex entry changes; Next logic stays in app callback. |
| CLI/scaffold/generated impact identified | no | N/A: no scaffold/CLI edits in this task. |
| Release artifact path selected | yes | Patch changeset; inspect existing unreleased drafts. |
| `changeset` skill loaded when `.changeset` is required | yes | Read changeset skill and rule. |
| Package build / fixture impact decision recorded | yes | Package build required; fixtures regenerated by their owner after registry freshness drift; sync/check passed. |
| Docs pack selected | yes | Supporting public Next setup/reference guidance. |
| Docs guidance loaded | yes | Published setup/doc-guidelines.md and current source docs. |
| Docs lane selected | yes | Supporting Next integration docs. |
| Target docs and nearest sibling docs read | yes | www nextjs/index and rsc; published setup/next and features/react. |
| Docs style doctrine read | yes | Current-state reference voice; source-to-skill mapping; no parity drops planned. |
| Documented source owner identified | yes | auth-nextjs options and generic token cache; official Next connection/private-cache docs. |
| Browser pack selected | yes | Next runtime error overlay is user-visible. |
| Browser route / app surface identified | yes | Synthetic JWT /dashboard on isolated Next16.4 with cacheComponents + partialPrefetching. |
| Browser tool decision recorded | yes | @Browser; native browser behavior N/A. |
| Console/network caveat policy recorded | yes | Require no post-fix error overlay/server clock diagnostics; distinguish old logs from fresh navigation. |
| UI state/accessibility matrix recorded | yes | Cached/expired/disabled states unit tests; runtime/private-cache real proof. Responsive/focus/motion N/A for server auth API. |

| Agent-native pack selected | yes | Published setup skill docs plus inherited autoclosure workflow delta. |
| Agent-facing action surface identified | yes | Configure JWT clock; adopt recoverable PR work rather than close. |
| Source rule versus generated mirror boundary identified | yes | .agents/rules/autoclosure.mdc and published kitcn skill source; generated copies synced, never manually edited. |
| Installed-skill lock versus local-rule owner identified | no | N/A: no installed skill dependency changes; repo-owned policy/source only. |
| `agent-native-reviewer` loaded or waiver recorded | yes | Read main-agent skill; independent parity audit PASS with no accepted findings. |

Work Checklist:
- [x] Agent-native pack: source-of-truth rule files are edited instead of generated skill mirrors.
- [x] Agent-native pack: the changed agent action is discoverable from the skill/rule text.
- [x] Agent-native pack: generated mirrors are synced when `.agents/rules/**` changed, or N/A reason is recorded.
- [x] Agent-native pack: installed skills are changed only through
      `npx skills add/update/remove`; local rules/templates/helpers stay source-owned.
- [x] Agent-native pack: routing, required receipts, placeholder failure,
      completion representability, and forbidden behavior have eval/smoke rows.
- [x] Agent-native pack: accepted agent-native review findings are fixed or explicitly rejected with reason.

- [x] If a duration was requested, it is recorded as minimum active work unless
      explicitly marked hard stop; when no better metric exists, initial and
      final confidence scores are recorded.
- [x] Objective includes outcome, completion threshold, verification surface,
      constraints, boundaries, and blocked condition.
- [x] Task source classified with source type, id/link, title, task type,
      acceptance criteria, caveats, likely files/routes/packages, browser
      surface, and root-cause layer.
- [x] Every GitHub PR in scope has its own task plan. This plan owns one exact
      PR, owns a not-yet-created PR slice, or records N/A because no PR is in
      scope; a batch plan is not used as a substitute.
- [x] Required video or screen-recording evidence is cached/read as normalized
      `<video-transcripts>` XML, or marked N/A with reason.
- [x] For public GitHub bug reports, behavior claims, technical diagnoses, or
      suggested fixes, reporter claims are challenged before implementation
      with a recorded verdict: `valid`, `not reproduced`, `invalid`,
      `wont-fix`, `partially valid`, or `platform limitation`. Feature, docs,
      support, or cleanup requests with no bug claim may mark reproduction
      `N/A` with reason.
- [x] Repro escalation ladder followed for bug/behavior claims: focused
      test/source-level repro first when applicable; existing repo-owned
      automated browser or integration proof next when available and useful as
      executable coverage; the repo-approved Browser tool next when tests or
      automation cannot reproduce or cannot model the surface honestly;
      screenshot or explicit visual-proof waiver when visual/native state
      matters.
- [x] Hard-stop rule followed for bug/behavior claims: no code when the issue
      is not reproduced, invalid, or won't-fix; partial validity pivots to the
      best long-term fix and records what was wrong or incomplete in the
      issue's proposed path.
- [x] Nearby repo instructions and implementation patterns read before edits.
- [x] Source-listed case matrix is complete and every contradiction has an
      owner, harness, and verdict before mutation.
- [x] Readiness is classified `ready`, `repair-source`, `major`, `blocked`, or
      `invalid` with evidence.
- [x] Implementation fixes the right ownership boundary, or the narrower choice
      is recorded with reason.
- [x] Release artifact requirement recorded: active changeset, new changeset, or
      N/A with reason.
- [x] Final handoff shape decided: bug/feature/testing/batch/review/GitHub
      requirements, PR body sync, and issue sync when applicable.
- [x] Commit/PR handling recorded for code-changing work: commit and PR
      completed, no local patch, user explicitly declined, or blocker recorded.
      "User did not separately ask for a PR" is not a valid blocker.
- [x] PR body shape recorded: PR #270 emoji task-style body used, N/A reason
      recorded, or blocker recorded.
- [x] PR task evidence recorded: body includes `🧭 Task plan: ...`, the plan
      exists at the PR head, and it identifies the exact PR before autoclosure.
- [x] Branch handling recorded for code-changing work: dedicated branch used,
      new branch needed, or N/A with reason.
- [x] Local-env-rot retry policy recorded for any surprising repo-wide failure:
      reinstall/rerun evidence or N/A with reason.
- [x] Workspace authority recorded: every proof command names the cwd/tool that
      owns the changed behavior.
- [x] Output budget discipline recorded and followed: broad searches are
      scoped, capped, counted, or artifacted instead of streamed into goal
      context.
- [x] High-risk note recorded for public API, runtime, package-boundary,
      browser behavior, agent-action, or command-contract changes, or marked
      N/A with reason.
- [x] Review/autoreview target selected from actual diff state for non-trivial
      implementation work, or marked N/A with reason.
- [x] Agent-native review decision recorded for `.agents/**`, `.claude/**`,
      `.codex/**`, skills, hooks, commands, prompts, or user-action tooling.
- [x] Package/API pack: public API, package boundary, export, and release-artifact impact are recorded.
- [x] Package/API pack: release artifact matrix is applied: `.changeset` or explicit no-artifact reason.
- [x] Package/API pack: `.changeset` work loads `changeset` and follows its package/version/prose rules.
- [x] Package/API pack: no-artifact decisions state why the diff has no published package user-visible delta from `main`.
- [x] Package/API pack: compatibility, migration, or hard-cut decision is explicit when public shape changes.
- [x] Package/API pack: affected Convex static import graphs stay narrow and
      plugin/per-module boundaries are used where appropriate.
- [x] Package/API pack: CLI commands remain deterministic, `--json` capable,
      and non-interactive with explicit confirmation bypass when relevant.
- [x] Package/API pack: docs and `packages/kitcn/skills/kitcn/**` stay
      current-state synchronized when public guidance changes.
- [x] Package/API pack: package-owned typecheck/build/test proof is recorded or marked N/A with reason.
- [x] Package/API pack: `packages/kitcn` build, fixture sync/check, or other owning package proof is recorded when required.
- [x] Docs pack: docs lane, target docs, nearest sibling docs, and source owner are recorded.
- [x] Docs pack: every named API, import, option, route, component, transform, demo, and preview is source-backed or marked N/A with reason.
- [x] Docs pack: docs use current-state reference voice, not changelog voice.
- [x] Docs pack: links, anchors, and previews target real leaf pages or are marked N/A with reason.
- [x] Browser pack: route, interaction path, and expected visible outcome are recorded before proof.
- [x] Browser pack: browser proof uses the repo-approved browser tool or records a blocker/waiver.
- [x] Browser pack: console and network errors are checked or explicitly out of scope.
- [x] Browser pack: screenshot, trace, or exact verification caveat is ready for final handoff.
- [x] Browser pack: loading, empty, error, permission, mutation, keyboard/focus,
      reduced motion, and responsive cases are covered or N/A with reason.
- [x] Browser pack: Browser is used first for ordinary app QA; Chrome/Computer
      own native browser/OS behavior when applicable.

Completion Gates:
| Gate | Applies | Required action | Evidence |
|------|---------|-----------------|----------|
| Named verification threshold | yes | Run the command, proof, source audit, or artifact check named in this plan | Full bun check exit0; 30 focused tests; strict Next16.4 dev/production Browser proof; package build; required review clean. |
| Exact per-PR task ownership | yes | Record the exact PR and dedicated plan, or the not-yet-created single-PR slice | PR #478 https://github.com/udecode/kitcn/pull/478; sole owner docs/plans/477-jwt-cache-clock.md. |
| Pre-solution issue challenge verdict | yes | Record reporter claim, suggested fix, repro verdict, validity verdict, durable boundary, and hard-stop/pivot decision before implementation | Partially valid: real clock failure reproduced; private-cache-only alternative corrected. Pre-implementation comment 6087237287. |
| Repro escalation ladder | yes | For bug/behavior claims, record test/source-level, automated browser/integration, Browser, and screenshot/visual-proof outcomes or N/A/blocker reasons before `not reproduced` | Public clock-trap red regression; no existing stage harness; actual Next16.4 Browser overlay; saved original screenshot. |
| Bug reproduced before fix | yes | Record failing test/repro or N/A with reason | Public regression failed before implementation; actual Next16.4 dev and production Date.now diagnostics. |
| Targeted behavior verification | yes | Run focused test/proof for changed behavior or record N/A | 30 focused regressions pass; built async-clock smoke passes. |
| TypeScript or typed config changed | yes | Run relevant typecheck | Owning package source-first typecheck and root five-task typecheck pass; full check repeats. |
| Package exports or file layout changed | no | Run the relevant package build before final verification and keep generated updates | N/A: exports/layout unchanged; required package build still passed and built API smoke passed. |
| Package manifests, lockfile, or install graph changed | yes | Run `bun install` and relevant package checks | bun install passed; generated fixture installs and all fixture checks passed in final bun check. |
| Agent rules or skills changed | yes | Run `bun install` and verify generated skill sync | bun install and sync-kitcn-skill passed; source/mirror parity audited. |
| Workspace authority proof | yes | Run verification in the owning repo/package/app/route/tool and record cwd; do not count the wrong workspace as proof | All package/root checks in /Users/zbeyens/git/better-convex; Browser proof on source-importing isolated Next16.4 app and owning www docs. |
| Browser surface changed | yes | Capture Browser Use proof or record explicit waiver/blocker | Browser Next16.4 /dashboard and /private pass; rendered docs /docs/nextjs#jwt-cache-and-partial-prefetching verified. |
| Browser final proof | yes | Attach screenshot or exact browser verification caveat when browser proof applies | Saved production private/request screenshots plus actual rendered docs original; synthetic JWT caveat explicit. |
| UI walkthrough | yes | If UI or rendered output changed, run `.agents/skills/walkthrough/SKILL.md` after final proof and show annotated images in the final handoff; otherwise record N/A | Baseline and diff receipt saved; actual docs screenshot annotated and compared; final response embeds annotated absolute path. |
| Scaffold or fixture output changed | yes | Run `bun run fixtures:sync` and `bun run fixtures:check`, or record N/A | Owner fixtures:sync exit0; all eight generated fixtures match fresh output in final fixtures:check. |
| Package behavior or public API changed | yes | Add a changeset or record why no changeset applies | Patch .changeset/quiet-jwt-clocks.md; additive optional sync/async finite Unix-seconds clock. |
| Docs and kitcn skill sync changed | yes | Keep `www/**` and `packages/kitcn/skills/kitcn/**` in sync, or record N/A | www Next page synchronized to published setup/next and features/react; generated mirrors equal. |
| Docs or content changed | yes | For docs-heavy work, use `--template docs`; for incidental docs, verify source-backed claims, links, examples, and rendered output or record N/A | Supporting docs pack; source claims, official Next links, parser and Browser rendered guidance verified. |
| High-risk mini gate | yes | For public API/runtime/package-boundary/browser/agent-action/command-contract changes, record realistic failure mode, proof plan, and why the chosen boundary is right; otherwise N/A | Exact callback rejection and no-fetch tests prevent abort swallowing; finite clock tests prevent invalid expiry; no Next library imports. |
| Agent-native review for agent/tooling changes | yes | For `.agents/**`, `.claude/**`, `.codex/**`, skills, hooks, commands, prompts, or user-action tooling, load `.agents/skills/agent-native-reviewer/SKILL.md` and close accepted/actionable findings, or record N/A | agent-native-reviewer PASS; no accepted findings; mirror parity and template/checker evals recorded. |
| Local install corruption suspected | no | Run `bun install` once, rerun the exact failing command, or record N/A | N/A: no corruption-shaped failure; initial install done, fixture registry drift repaired through generation owner. |
| Commit created | yes | For verified code-changing work, stage the entire current checkout per repo policy and create a commit; N/A only for no local patch, explicit user decline, analytical/blocked/inconclusive work, or recorded external blocker | c5a5e65a red regression + inherited checkout; e67cefd9 implementation; 620626cc verification; final plan-only closeout commit follows. |
| PR create or update | yes | For verified code-changing work, run `check`, push, create or update the PR, and sync PR body to the task-style final handoff; N/A only for no local patch, explicit user decline, analytical/blocked/inconclusive work, or recorded external blocker | Full bun check exit0 before creation; branch pushed; PR #478 open and attached to chat. |
| Task-style PR body verified | yes | Verify the PR body with `gh pr view --json body`; it must preserve auto-release blocks when applicable, must not include a current-PR self-link, and must use the PR #270 emoji format: `🐛 Fixes ...`, `🟢 95-100% confidence`, `Phase / 🧪 Tests / 🌐 Browser` table, and bold emoji Outcome/Caveat/Design/Verified sections | gh pr view readback confirms emoji issue/confidence, exact proof table, Outcome/Caveat/Design/Verified sections and checked auto-release block; no self-link. |
| PR task evidence verified | yes | Verify body plan line, plan at PR head, and exact PR ownership | PR body names this plan; local committed head contains plan; this closeout identifies exact PR #478 and will be read back at pushed head. |
| PR proof image hosting | no | If PR body needs browser proof, replace local image paths with hosted GitHub URLs or record N/A | N/A: PR body uses exact command/route proof, no image attachments or local image paths. Annotated local proof shown in final handoff only. |
| GitHub issue sync-back | yes | Post concise issue sync after PR exists, or record N/A/blocker | Posted and read back https://github.com/udecode/kitcn/issues/477#issuecomment-6087536486, fix link and private-cache correction. |
| Final handoff contract | yes | Fill the final handoff fields below with exact PR/issue/confidence/tests/browser/outcome/caveats/design/verification content or N/A reason | Fields below specify PR #478, issue #477, confidence, proof and synthetic-token caveat; final response includes annotated image. |
| Final lint | yes | Run `bun lint:fix` or scoped equivalent | bun lint:fix passed with no fixes; full check lint lane passed. Final plan-only lint rerun follows. |
| Output budget discipline | yes | Verify no unbounded high-volume command output was streamed, or record the accidental output and recovery | Bounded source reads/log tails; full outputs saved locally. One template read truncation recovered with scoped reads; no unbounded search output. |
| Timed checkpoint | no | If duration was requested, keep improving until elapsed, then finish the current loop cleanly; otherwise N/A | N/A: no duration requested. |
| Autoreview for non-trivial implementation changes | yes | Load `.agents/skills/autoreview/SKILL.md`; use dirty local `--mode local`, branch/PR `--mode branch --base <base>`, or committed slice `--mode commit --commit <ref>` until no accepted/actionable findings, or record N/A for docs-only/trivial/no local patch | Branch kitcn/main...e67cefd9 clean at configured P0 threshold; trufflehog clean; no accepted/actionable findings. Only plan evidence changed after review. |
| Goal plan complete | yes | Run `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/477-jwt-cache-clock.md` | check-complete.mjs run after this evidence update; success required before shipping closeout. |
| Public API / package boundary proof | yes | Source-audit public API, exports, and package boundary impact | AuthOptions derives now from GetTokenOptions; no duplicate signature owner, exports or generic transport changes; built API smoke. |
| Convex bundle/import proof | yes | Audit affected function-entry static graphs or record N/A | No new imports or function-entry graph changes; Next dependency stays entirely in app callback. |
| CLI/scaffold/generated proof | yes | Prove command contract and regenerate owned output or record N/A | N/A for CLI/scaffold source contract changes; generated fixture manifests owner-regenerated and checked. |
| Release artifact classification | yes | Record whether the change is published package behavior/API/types/config/runtime or no published user-visible delta | Published auth-nextjs option/runtime behavior; patch changeset required and present. |
| Published package changeset | yes | If published package users see a delta, load `changeset` and add/update one `.changeset/*.md` per package | Changeset skill/rule followed; quiet-jwt-clocks.md releases kitcn patch. |
| No release artifact | no | If no artifact is needed, record the exact reason: internal-only, docs-only, agent-only, test-only, or no user-visible delta from `main` | N/A: this public package change does require and includes a patch changeset. |
| Package typecheck/build/test | yes | Run owning package checks or record N/A with reason | Package build, root/source typechecks, 30 focused tests and full check all pass. |
| Fixture/scaffold generation | yes | Run `bun run fixtures:sync` and `bun run fixtures:check` when scaffold output changed, otherwise N/A | fixtures:sync exit0; final fixtures:check all eight fixtures match fresh owner output. |
| Docs/package skill sync | yes | Synchronize current-state public guidance or record N/A | www -> published setup/next and features/react -> generated copies; exact parity audited. |
| Docs source-backed claim audit | yes | Verify docs claims against current source or record N/A | Public API and token source match docs; real Next16.4 proofs establish connection/private-cache/Suspense constraints. |
| Docs links / routes / previews | yes | Verify leaf links, routes, anchors, and preview names or record N/A | Actual docs leaf route/anchor rendered; official Next connection/private-cache links verified; no invented previews. |
| Docs MDX/content parser | yes | Run the relevant `www` docs parser/build for MDX/content changes, or record N/A | bun --cwd www run postinstall MDX parser passed. |
| Kitcn docs sync | yes | If `www/**` changed, update matching `packages/kitcn/skills/kitcn/**` content or record N/A | Published setup/next and features/react updated in same implementation commit; generated mirrors synced. |
| Browser interaction proof | yes | Exercise the target route/interaction with the approved browser tool or record blocker | Approved @Browser navigated synthetic session, request-clock and private-cache routes in dev/production. |
| Browser console/network check | yes | Record console/network state or why it is not applicable | Post-fix production server log has no errors; Browser routes render cached-token success. Docs console errors/warnings empty; prior baseline errors excluded. |
| Browser state/accessibility proof | yes | Exercise applicable honest states, keyboard/focus, motion, and sizes | Token cache/expiry/disable/error states tested; request/private stage states Browser-proven. N/A responsive/motion/focus/permissions/mutations: server auth API and reference docs only. |
| Browser final proof artifact | yes | Record screenshot/trace/route proof or exact caveat | tmp/walkthrough/477/04-production-private-original.jpg, 05-production-request-original.jpg, 03-docs-clock-annotated.png; synthetic fixture explicit. |

| Agent source / generated sync | yes | Run `bun install` when `.agents/rules/**` changed and verify generated mirrors | bun install and source sync passed; autoclosure rule/generated body and root/source instructions parity verified. |
| Installed lock audit | no | Verify expected lock entries and removed skills through CLI-managed state | N/A: no installed skill additions/removals or lock edits; source-owned repo rules and published docs only. |
| Agent action discoverability | yes | Source-audit the skill/rule path an agent will read | Issue clock hook appears in www/setup/features path; inherited recoverable/absent PR routes explicitly discoverable in autoclosure rule. |
| Helper and template smoke | yes | Syntax-check helpers and prove incomplete failure/completed representation when applicable | Incomplete template rejected with 49 failures; completed in-memory representation accepted with all 70 rows preserved; unchanged checker syntax/behavior source-backed. |
| Agent-native review | yes | Load `.agents/skills/agent-native-reviewer/SKILL.md` and close accepted findings, or record N/A | Independent inherited-model agent-native audit PASS; no accepted findings; no model-diversity claim. |

Phase / pass table:
| Phase | Status | Evidence | Next |
|-------|--------|----------|------|
| Intake and source read | complete | Issue, source, real dev and production repro; challenge posted | implementation |
| Implementation | complete | Four owned files; 30 passing regressions; docs/skill sync and changeset | verification |
| Verification | complete | Full bun check exit0; tests/build/MDX/Browser/audits passed; generated fixtures sync/check passed | closeout |
| Commit / PR / GitHub sync | complete | PR #478 created, attached, body read back; issue sync posted/read back | final response |
| Closeout | complete | Plan checker, final pushed-head readback and annotated handoff | final response |

Findings:
- Real Next16.4 dev overlay and production next start logs both reproduce the reported Date.now issue. Header access alone does not leave runtime prerendering.
- Private-cache clock reads are valid, but awaiting a private helper outside Suspense still reports Blocking Route runtime data. Corrected the issue's proposed route-gate alternative in docs; both demonstrated paths use Suspense.
- Pre-solution issue challenge is partially valid: clock hook/ownership is correct; private caching alone is not an alternative to the boundary for the demonstrated layout/helper pattern.
- Repo full check passed lint, five source typecheck tasks, Bun/Vitest, CLI and Concave lanes, then found registry-driven generated Next fixture dependency drift. Regenerate fixtures through their owner, never patch snapshots manually.

Decisions and tradeoffs:
- Architect phases: Ground complete (HOW source trace); Sketch/arena complete (two independent inherited-model candidates); Agree automatic (no user checkpoint requested); Implement complete without structural deviations; Scrap N/A because ownership held.
- Candidate A wins 23/25 vs B 19/25 (read-only cross-judge agreed): factory `auth.jwtCache: boolean | { now?: () => number | Promise<number> }`, with optional matching internal clock and existing sibling tolerance. Per-context generic auth transport rejected as disproportionate. Graft B's explicit runtime/private-cache examples, not its plumbing.
- Usage: runtime factory clock awaits app-owned connection then returns Unix seconds; private factory uses default/sync clock. Internal decode-only catch, fast paths skip clock; callback errors propagate. Reject non-finite custom results so NaN cannot classify stale JWTs as fresh. No milliseconds inference or framework imports.
- Entire existing checkout is included at shipping as required. Pre-existing autoclosure workflow and package script changes are preserved, not redesigned by #477; final review/check covers them.

Implementation notes:
- `AuthOptions.jwtCache` derives its optional clock via Pick of internal cache options; no duplicated clock signature or extra generic caller transport.
- `getToken` isolates decode catch, skips absent expiry, awaits/validates app clock outside recovery, then uses the existing seconds/tolerance comparator. No Next imports, stage detection, abort swallowing or clock-unit inference.
- TDD in isolated writer worktree: cached-token 1 fail -> pass; rejection identities 3 fail -> pass; missing-expiry 1 fail -> pass; non-finite 3 fail -> pass. Parent inspected and applied only four owned files, then reran 30 tests in owning checkout.
- Docs source mapping: www/content/docs/nextjs/index.mdx -> published references/setup/next.md (full kitcn clock/rendering deltas); references/features/react.md links to setup. No dropped parity sections; generated mirrors synced.
- High-risk note: a swallowed rendering abort would fetch unexpectedly; non-finite time could admit stale cache. Exact rejection/no-fetch tests, finite validation and real Next stages prove the chosen generic clock boundary.
- Deslop scope: changed code/docs only, 30-test behavior lock. Local lenses checked doctrine, single clock type owner, and minimal flow. No speculative abstractions or unrelated cleanup accepted.

Review fixes:
- Autoreview branch kitcn/main...e67cefd9 passed: configured P0 threshold, no accepted/actionable findings, trufflehog clean, confidence 0.98. Outputs /tmp/kitcn-pr477-review.igDo5E/review.txt and review.json. Initial in-repo output path rejected; retried with external output as required.
- Final review target: frozen committed branch kitcn/main...HEAD; production implementation is 33 additions/11 deletions across two files. Includes inherited workflow repair and owner-regenerated fixture manifests per checkout shipping policy. No semantic edits while autoreview runs.
- Agent-native reviewer PASS: source/mirror equality, recoverable/absent routes and authority explicit; unfilled template rejected (49 failures), completed representation accepted with 70 rows retained. No accepted findings.
- Runtime proof corrected docs: a private helper outside Suspense still produces Blocking Route runtime-data error. Both verified examples now use Suspense; no automatic blocking-route opt-out introduced.
- Deslop against kitcn/main: 186 -> 185 findings; score 557.21 -> 554.21; 0 added/worsened, one error-swallowing finding resolved. Initial default-base report included unrelated historical files; reran with exact kitcn/main and discarded that noise.

Error attempts:
| Error / failed attempt | Count | Next different move | Resolution |
|------------------------|-------|---------------------|------------|
| Public regression harness defects | 2 | Return a real boundary response and assert context.token, not proxy-containing context | Correct assertion failed before implementation, then passed |
| Isolated Next typecheck used generated ES2017/non-strict defaults | 1 | Match owning package ES2022/strict/strictFunctionTypes flags | Next production build passed without skipping types |
| Bun next start CommonJS wrapper bug | 1 | Use supported Node v24.14.1 runtime | Production baseline and final server proof succeeded |
| Browser blocked port 3478 | 2 | Inspect server failure, use Node production server on explicit port 3481/3482 | Browser production proof succeeded |
| Full check generated fixture registry drift | 1 | Run fixtures:sync owner and repeat full check | Six generated fixture manifests refreshed; full check exit0 |

Verification evidence:
- Built dist/auth/nextjs API smoke passed: actual convexBetterAuth async clock returns cached synthetic JWT with zero fetches.
- Walkthrough diff receipt producedFileDiff true; rendered www docs included. Original and annotated image compared: same content/layout/state, one clock-ownership callout only. Final handoff embeds tmp/walkthrough/477/03-docs-clock-annotated.png.
- Public createContext tracer regression: 1 failed, 2 passed before implementation; expected cached JWT but got refreshed-token. Log tmp/pr477-red.log. Early mock return/matcher defects repaired before accepting red evidence.
- Browser Next16.4 localhost:3477/dashboard: documented headers-first context with fresh synthetic cookie reports Blocking Route Date.now at token-utils.ts; screenshot saved. Public challenge posted at https://github.com/udecode/kitcn/issues/477#issuecomment-6087237287.
- Parent focused Vitest: 2 files, 30 passed, 0 failed; log tmp/pr477-focused.log. Writer package source-first typecheck passed; parent root typecheck five tasks passed.
- Package build passed (tmp/pr477-build.log); lint:fix passed with no changes; git diff --check passed. Intent validate/stale passed; MDX parser www postinstall passed; docs /docs/nextjs rendered with no console errors.
- Next16.4 production BEFORE: Node next start /dashboard returned HTTP200 but logged Blocking Route Date.now (tmp/pr477-next-start-node-before.log). AFTER: strict production build passes; Browser localhost:3482/dashboard and /private show cached JWT available; final server log has no errors (tmp/pr477-next-start-after.log). Synthetic JWT only, no live auth-backend sign-in claimed.
- Docs source mapping and generated equality verified. Walkthrough original tmp/walkthrough/477/03-docs-clock-original.jpg shows actual rendered clock example; annotation complete and compared to original.
- Full check first run: Bun1556/0, Vitest1081/0 (14 skipped), CLI124/0, typecheck/lint/Concave passed; stopped on generated fixture dependency drift. Owner fixtures:sync passed and refreshed only six fixture package.json files. Final full bun check exited0 after all lanes, including fixture checks, verify and runtime scenarios.
- Behavioral-validator skill unavailable in configured local/installed skill set. Use explicit behavior contract, public API tests and real dev/production Browser proof; do not represent source review as behavior proof.

Source-listed case matrix:
| Case | Source claim | Harness | Before | Expected after | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Cached JWT after headers | Next runtime Date.now fails | Next16.4 Browser | Blocking Route | Async app clock after connection succeeds under Suspense | Red regression + dev overlay; post-fix dev/production cached token | verified |
| Private cache | Clock allowed, connection forbidden | Next16.4 Browser | Private clock valid; helper without Suspense blocks | Default/sync clock succeeds without connection | Browser /private cached token in dev/production under Suspense | verified |
| Sync/async clock + tolerance | Proposed now hook | Public context + token tests | No hook | Unix seconds decide reuse/refresh, including equality | 30 focused regressions pass | verified |
| Defaults/true/empty/false | Preserve existing API | Public context + token tests | Boolean supported | Default cache preserved; false fetches | 30 focused regressions pass | verified |
| Fast paths | No unnecessary clock | Token tests | Unconditional expiry clock when decoded | Disabled/force/missing/malformed/missing-exp skip hook | 30 focused regressions pass | verified |
| Callback rejection/Next abort | App controls lifecycle | Public context + token tests | Clock errors swallowed as decode failure | Exact errors propagate; no log/fetch fallback | 30 focused regressions pass | verified |
| Non-finite clock | New hook must not treat NaN as unexpired | Token tests | No injected clock | Reject non-finite values without refresh | 30 focused regressions pass | verified |
| Auth route gate | Deferred token requires boundary | Next Browser + docs | Unbounded route read blocks | Suspense request path or private-cache path | Docs Browser rendering and both Next16.4 production routes pass | verified |
| TanStack secondary clock | Failed queries record Date.now | Source + docs | Query core owns error timestamp | App owns abort policy; no generic swallowing | Not claimed as library fix | narrowed |

Final handoff contract:
- Commit line: c5a5e65a, e67cefd9, 620626cc; final plan-only closeout recorded in Git.
- PR line: https://github.com/udecode/kitcn/pull/478 (open; not merged).
- Issue line: #477; sync comment 6087536486 read back.
- Confidence line: 95-100% for bounded clock ownership contract; synthetic fixture limitation remains explicit.
- Flow table:
  - Reproduced: public clock-trap test red; Next16.4 dev and production Blocking Route Date.now.
  - Verified: 30 focused tests/full check green; Next16.4 request/private production routes and docs green.
- Browser check: approved Browser; cached JWT success without clock diagnostics; docs no console errors/warnings.
- Outcome: optional app-owned sync/async finite Unix-seconds JWT cache clock; bool/default behavior preserved.
- Caveat: synthetic fresh JWT, no live backend sign-in; Next stages/abort policy app-owned; Suspense required in demonstrated patterns.
- Design:
  - Chosen boundary: public auth factory forwards clock to generic expiry reader.
  - Why not quick patch: library cannot choose an app's runtime/private-cache stage.
  - Why not broader change: no per-context transport generic, Next imports or internal-abort recognition needed.
- Verified: build/built API, tests, full check, docs/parser/sync, agent-native audit and configured P0 autoreview.
- PR body verified: gh pr view confirms exact task-style body, plan line, release block and no self-link.

Task-style PR body contract:
- Preserve any existing `<!-- auto-release:start -->` block. If a changeset is
  part of the diff and repo policy expects auto release, include that block.
- Use the accepted PR #270 visual format. The body starts with an emoji
  issue/fix line, for example `🐛 Fixes #123` or `🐛 Fixes ➖ N/A`, then
  `🧭 Task plan: docs/plans/<plan>.md`, then an emoji confidence line like
  `🟢 95-100% confidence`.
- Use this exact table header: `| Phase | 🧪 Tests | 🌐 Browser |`.
- Use `Reproduced` and `Verified` rows. Mark passing proof with `🟢`, repro or
  failing proof with `🔴`, and non-applicable cells with `➖ N/A`.
- Use bold emoji section headings: `**✅ Outcome**`, `**⚠️ Caveat**`,
  `**🏗️ Design**`, and `**🧪 Verified**`.
- Never include a line that links to the current PR itself. The current PR URL
  belongs in the final response, not in its own description.
- Do not replace this with a generic `Summary` / `Verification` PR body, an
  adaptive prose body from a git helper skill, plain `## Outcome` sections, or
  an unrelated generated badge footer unless the caller or repo template
  explicitly asks for it.
- Proof is `gh pr view --json body` output or a concise source-backed summary
  of that output.

Final handoff / sync:
- Commit: implementation e67cefd9; subsequent commits only record evidence.
- PR: #478 https://github.com/udecode/kitcn/pull/478; attached, open, not merged.
- Issue: #477 final comment 6087536486 read back.
- Browser proof: Next16.4 request/private dev and production; real rendered docs annotated.
- Caveats: synthetic JWT only; configured P0 review threshold; inherited workflow and generated fixture manifests included per policy.

Timeline:
- 2026-10-09T18:49:59.678Z Task goal plan created.
- 2026-10-09 Final full check passed; PR #478 created and issue synced. Isolated runtime servers stopped; implementation worktree archived recoverably.

Reboot status:
| Question | Answer |
|----------|--------|
| Where am I? | Verified and delivered as PR #478 |
| Where am I going? | Final handoff; wait for user merge decision |
| What is the goal? | App-owned JWT cache time with default behavior preserved, verified and PR-delivered |
| What have I learned? | See Findings |
| What have I done? | See Timeline |

Open risks:
- Synthetic JWT runtime proof does not claim a live backend sign-in flow. App owns render abort policy. Required autoreview is P0-only; 30 focused tests and real Next proof cover the bounded behavior. No remaining implementation blocker.

Hard closeout guard:
- A local-only final response for verified code-changing work is invalid unless
  this plan records an explicit user decline, no local patch, analytical/
  blocked/inconclusive outcome, or a real commit/PR blocker.
