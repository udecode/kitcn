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
- final score / loop closure: Record proof at closeout.

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
- current_phase: intake
- current_phase_status: in_progress
- next_phase: implementation
- goal_status: active

Current verdict:
- verdict: ready
- confidence: source confirms clock timing risk; real Next proof required
- next owner: task
- reason: generic token cache cannot choose the app's Next rendering stage.

Implementation readiness:
- verdict: ready
- exact owner: packages/kitcn/src/auth/internal/token.ts and auth-nextjs/index.ts
- contradiction status: issue says Next 16.4; installed version is 16.1.6. Verify runtime behavior rather than assume version claim.
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
- validity verdict: valid.
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
| Exact per-PR task ownership | yes | Single new PR slice #477; exact number at creation. |
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
| Task-plan PR body evidence | yes | Add docs/plans/477-jwt-cache-clock.md line and exact PR ownership after creation. |
| GitHub issue sync expectation decision | yes | Public source-backed reproduction comment posted; final link after PR. |
| Output budget strategy recorded | yes | Bounded reads/log files; recorded in Output budget strategy. |
| Package/API pack selected | yes | Published auth-nextjs clock API. |
| Public surface or package boundary identified | yes | AuthOptions.jwtCache optional clock -> GetTokenOptions.jwtCache. |
| Convex entry/import graph impact identified | yes | No new imports or Convex entry changes; Next logic stays in app callback. |
| CLI/scaffold/generated impact identified | no | N/A: no scaffold/CLI edits in this task. |
| Release artifact path selected | yes | Patch changeset; inspect existing unreleased drafts. |
| `changeset` skill loaded when `.changeset` is required | yes | Read changeset skill and rule. |
| Package build / fixture impact decision recorded | yes | Package build required; fixtures N/A because no scaffold change. |
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

Work Checklist:
- [ ] If a duration was requested, it is recorded as minimum active work unless
      explicitly marked hard stop; when no better metric exists, initial and
      final confidence scores are recorded.
- [ ] Objective includes outcome, completion threshold, verification surface,
      constraints, boundaries, and blocked condition.
- [ ] Task source classified with source type, id/link, title, task type,
      acceptance criteria, caveats, likely files/routes/packages, browser
      surface, and root-cause layer.
- [ ] Every GitHub PR in scope has its own task plan. This plan owns one exact
      PR, owns a not-yet-created PR slice, or records N/A because no PR is in
      scope; a batch plan is not used as a substitute.
- [ ] Required video or screen-recording evidence is cached/read as normalized
      `<video-transcripts>` XML, or marked N/A with reason.
- [ ] For public GitHub bug reports, behavior claims, technical diagnoses, or
      suggested fixes, reporter claims are challenged before implementation
      with a recorded verdict: `valid`, `not reproduced`, `invalid`,
      `wont-fix`, `partially valid`, or `platform limitation`. Feature, docs,
      support, or cleanup requests with no bug claim may mark reproduction
      `N/A` with reason.
- [ ] Repro escalation ladder followed for bug/behavior claims: focused
      test/source-level repro first when applicable; existing repo-owned
      automated browser or integration proof next when available and useful as
      executable coverage; the repo-approved Browser tool next when tests or
      automation cannot reproduce or cannot model the surface honestly;
      screenshot or explicit visual-proof waiver when visual/native state
      matters.
- [ ] Hard-stop rule followed for bug/behavior claims: no code when the issue
      is not reproduced, invalid, or won't-fix; partial validity pivots to the
      best long-term fix and records what was wrong or incomplete in the
      issue's proposed path.
- [ ] Nearby repo instructions and implementation patterns read before edits.
- [ ] Source-listed case matrix is complete and every contradiction has an
      owner, harness, and verdict before mutation.
- [ ] Readiness is classified `ready`, `repair-source`, `major`, `blocked`, or
      `invalid` with evidence.
- [ ] Implementation fixes the right ownership boundary, or the narrower choice
      is recorded with reason.
- [ ] Release artifact requirement recorded: active changeset, new changeset, or
      N/A with reason.
- [ ] Final handoff shape decided: bug/feature/testing/batch/review/GitHub
      requirements, PR body sync, and issue sync when applicable.
- [ ] Commit/PR handling recorded for code-changing work: commit and PR
      completed, no local patch, user explicitly declined, or blocker recorded.
      "User did not separately ask for a PR" is not a valid blocker.
- [ ] PR body shape recorded: PR #270 emoji task-style body used, N/A reason
      recorded, or blocker recorded.
- [ ] PR task evidence recorded: body includes `🧭 Task plan: ...`, the plan
      exists at the PR head, and it identifies the exact PR before autoclosure.
- [ ] Branch handling recorded for code-changing work: dedicated branch used,
      new branch needed, or N/A with reason.
- [ ] Local-env-rot retry policy recorded for any surprising repo-wide failure:
      reinstall/rerun evidence or N/A with reason.
- [ ] Workspace authority recorded: every proof command names the cwd/tool that
      owns the changed behavior.
- [ ] Output budget discipline recorded and followed: broad searches are
      scoped, capped, counted, or artifacted instead of streamed into goal
      context.
- [ ] High-risk note recorded for public API, runtime, package-boundary,
      browser behavior, agent-action, or command-contract changes, or marked
      N/A with reason.
- [ ] Review/autoreview target selected from actual diff state for non-trivial
      implementation work, or marked N/A with reason.
- [ ] Agent-native review decision recorded for `.agents/**`, `.claude/**`,
      `.codex/**`, skills, hooks, commands, prompts, or user-action tooling.
- [ ] Package/API pack: public API, package boundary, export, and release-artifact impact are recorded.
- [ ] Package/API pack: release artifact matrix is applied: `.changeset` or explicit no-artifact reason.
- [ ] Package/API pack: `.changeset` work loads `changeset` and follows its package/version/prose rules.
- [ ] Package/API pack: no-artifact decisions state why the diff has no published package user-visible delta from `main`.
- [ ] Package/API pack: compatibility, migration, or hard-cut decision is explicit when public shape changes.
- [ ] Package/API pack: affected Convex static import graphs stay narrow and
      plugin/per-module boundaries are used where appropriate.
- [ ] Package/API pack: CLI commands remain deterministic, `--json` capable,
      and non-interactive with explicit confirmation bypass when relevant.
- [ ] Package/API pack: docs and `packages/kitcn/skills/kitcn/**` stay
      current-state synchronized when public guidance changes.
- [ ] Package/API pack: package-owned typecheck/build/test proof is recorded or marked N/A with reason.
- [ ] Package/API pack: `packages/kitcn` build, fixture sync/check, or other owning package proof is recorded when required.
- [ ] Docs pack: docs lane, target docs, nearest sibling docs, and source owner are recorded.
- [ ] Docs pack: every named API, import, option, route, component, transform, demo, and preview is source-backed or marked N/A with reason.
- [ ] Docs pack: docs use current-state reference voice, not changelog voice.
- [ ] Docs pack: links, anchors, and previews target real leaf pages or are marked N/A with reason.
- [ ] Browser pack: route, interaction path, and expected visible outcome are recorded before proof.
- [ ] Browser pack: browser proof uses the repo-approved browser tool or records a blocker/waiver.
- [ ] Browser pack: console and network errors are checked or explicitly out of scope.
- [ ] Browser pack: screenshot, trace, or exact verification caveat is ready for final handoff.
- [ ] Browser pack: loading, empty, error, permission, mutation, keyboard/focus,
      reduced motion, and responsive cases are covered or N/A with reason.
- [ ] Browser pack: Browser is used first for ordinary app QA; Chrome/Computer
      own native browser/OS behavior when applicable.

Completion Gates:
| Gate | Applies | Required action | Evidence |
|------|---------|-----------------|----------|
| Named verification threshold | pending | Run the command, proof, source audit, or artifact check named in this plan | pending |
| Exact per-PR task ownership | pending | Record the exact PR and dedicated plan, or the not-yet-created single-PR slice | pending |
| Pre-solution issue challenge verdict | pending | Record reporter claim, suggested fix, repro verdict, validity verdict, durable boundary, and hard-stop/pivot decision before implementation | pending |
| Repro escalation ladder | pending | For bug/behavior claims, record test/source-level, automated browser/integration, Browser, and screenshot/visual-proof outcomes or N/A/blocker reasons before `not reproduced` | pending |
| Bug reproduced before fix | pending | Record failing test/repro or N/A with reason | pending |
| Targeted behavior verification | pending | Run focused test/proof for changed behavior or record N/A | pending |
| TypeScript or typed config changed | pending | Run relevant typecheck | pending |
| Package exports or file layout changed | pending | Run the relevant package build before final verification and keep generated updates | pending |
| Package manifests, lockfile, or install graph changed | pending | Run `bun install` and relevant package checks | pending |
| Agent rules or skills changed | pending | Run `bun install` and verify generated skill sync | pending |
| Workspace authority proof | pending | Run verification in the owning repo/package/app/route/tool and record cwd; do not count the wrong workspace as proof | pending |
| Browser surface changed | pending | Capture Browser Use proof or record explicit waiver/blocker | pending |
| Browser final proof | pending | Attach screenshot or exact browser verification caveat when browser proof applies | pending |
| UI walkthrough | pending | If UI or rendered output changed, run `.agents/skills/walkthrough/SKILL.md` after final proof and show annotated images in the final handoff; otherwise record N/A | pending |
| Scaffold or fixture output changed | pending | Run `bun run fixtures:sync` and `bun run fixtures:check`, or record N/A | pending |
| Package behavior or public API changed | pending | Add a changeset or record why no changeset applies | pending |
| Docs and kitcn skill sync changed | pending | Keep `www/**` and `packages/kitcn/skills/kitcn/**` in sync, or record N/A | pending |
| Docs or content changed | pending | For docs-heavy work, use `--template docs`; for incidental docs, verify source-backed claims, links, examples, and rendered output or record N/A | pending |
| High-risk mini gate | pending | For public API/runtime/package-boundary/browser/agent-action/command-contract changes, record realistic failure mode, proof plan, and why the chosen boundary is right; otherwise N/A | pending |
| Agent-native review for agent/tooling changes | pending | For `.agents/**`, `.claude/**`, `.codex/**`, skills, hooks, commands, prompts, or user-action tooling, load `.agents/skills/agent-native-reviewer/SKILL.md` and close accepted/actionable findings, or record N/A | pending |
| Local install corruption suspected | pending | Run `bun install` once, rerun the exact failing command, or record N/A | pending |
| Commit created | pending | For verified code-changing work, stage the entire current checkout per repo policy and create a commit; N/A only for no local patch, explicit user decline, analytical/blocked/inconclusive work, or recorded external blocker | pending |
| PR create or update | pending | For verified code-changing work, run `check`, push, create or update the PR, and sync PR body to the task-style final handoff; N/A only for no local patch, explicit user decline, analytical/blocked/inconclusive work, or recorded external blocker | pending |
| Task-style PR body verified | pending | Verify the PR body with `gh pr view --json body`; it must preserve auto-release blocks when applicable, must not include a current-PR self-link, and must use the PR #270 emoji format: `🐛 Fixes ...`, `🟢 95-100% confidence`, `Phase / 🧪 Tests / 🌐 Browser` table, and bold emoji Outcome/Caveat/Design/Verified sections | pending |
| PR task evidence verified | pending | Verify body plan line, plan at PR head, and exact PR ownership | pending |
| PR proof image hosting | pending | If PR body needs browser proof, replace local image paths with hosted GitHub URLs or record N/A | pending |
| GitHub issue sync-back | pending | Post concise issue sync after PR exists, or record N/A/blocker | pending |
| Final handoff contract | pending | Fill the final handoff fields below with exact PR/issue/confidence/tests/browser/outcome/caveats/design/verification content or N/A reason | pending |
| Final lint | pending | Run `bun lint:fix` or scoped equivalent | pending |
| Output budget discipline | pending | Verify no unbounded high-volume command output was streamed, or record the accidental output and recovery | pending |
| Timed checkpoint | pending | If duration was requested, keep improving until elapsed, then finish the current loop cleanly; otherwise N/A | pending |
| Autoreview for non-trivial implementation changes | pending | Load `.agents/skills/autoreview/SKILL.md`; use dirty local `--mode local`, branch/PR `--mode branch --base <base>`, or committed slice `--mode commit --commit <ref>` until no accepted/actionable findings, or record N/A for docs-only/trivial/no local patch | pending |
| Goal plan complete | yes | Run `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/477-jwt-cache-clock.md` | pending |
| Public API / package boundary proof | pending | Source-audit public API, exports, and package boundary impact | pending |
| Convex bundle/import proof | pending | Audit affected function-entry static graphs or record N/A | pending |
| CLI/scaffold/generated proof | pending | Prove command contract and regenerate owned output or record N/A | pending |
| Release artifact classification | pending | Record whether the change is published package behavior/API/types/config/runtime or no published user-visible delta | pending |
| Published package changeset | pending | If published package users see a delta, load `changeset` and add/update one `.changeset/*.md` per package | pending |
| No release artifact | pending | If no artifact is needed, record the exact reason: internal-only, docs-only, agent-only, test-only, or no user-visible delta from `main` | pending |
| Package typecheck/build/test | pending | Run owning package checks or record N/A with reason | pending |
| Fixture/scaffold generation | pending | Run `bun run fixtures:sync` and `bun run fixtures:check` when scaffold output changed, otherwise N/A | pending |
| Docs/package skill sync | pending | Synchronize current-state public guidance or record N/A | pending |
| Docs source-backed claim audit | pending | Verify docs claims against current source or record N/A | pending |
| Docs links / routes / previews | pending | Verify leaf links, routes, anchors, and preview names or record N/A | pending |
| Docs MDX/content parser | pending | Run the relevant `www` docs parser/build for MDX/content changes, or record N/A | pending |
| Kitcn docs sync | pending | If `www/**` changed, update matching `packages/kitcn/skills/kitcn/**` content or record N/A | pending |
| Browser interaction proof | pending | Exercise the target route/interaction with the approved browser tool or record blocker | pending |
| Browser console/network check | pending | Record console/network state or why it is not applicable | pending |
| Browser state/accessibility proof | pending | Exercise applicable honest states, keyboard/focus, motion, and sizes | pending |
| Browser final proof artifact | pending | Record screenshot/trace/route proof or exact caveat | pending |

Phase / pass table:
| Phase | Status | Evidence | Next |
|-------|--------|----------|------|
| Intake and source read | in_progress | created plan | implementation |
| Implementation | pending | | verification |
| Verification | pending | | closeout |
| Commit / PR / GitHub sync | pending | | final response |
| Closeout | pending | | final response |

Findings:
- None yet.

Decisions and tradeoffs:
- Architect phases: Ground complete (HOW source trace); Sketch/arena complete (two independent inherited-model candidates); Agree automatic (no user checkpoint requested); Implement next; Scrap only if ownership proves wrong.
- Candidate A wins 23/25 vs B 19/25 (read-only cross-judge agreed): factory `auth.jwtCache: boolean | { now?: () => number | Promise<number> }`, with optional matching internal clock and existing sibling tolerance. Per-context generic auth transport rejected as disproportionate. Graft B's explicit runtime/private-cache examples, not its plumbing.
- Usage: runtime factory clock awaits app-owned connection then returns Unix seconds; private factory uses default/sync clock. Internal decode-only catch, fast paths skip clock; callback errors propagate. Reject non-finite custom results so NaN cannot classify stale JWTs as fresh. No milliseconds inference or framework imports.
- Entire existing checkout is included at shipping as required. Pre-existing autoclosure workflow and package script changes are preserved, not redesigned by #477; final review/check covers them.

Implementation notes:
- None yet.

Review fixes:
- None yet.

Error attempts:
| Error / failed attempt | Count | Next different move | Resolution |
|------------------------|-------|---------------------|------------|
| None yet | 0 | | |

Verification evidence:
- Public createContext tracer regression: 1 failed, 2 passed before implementation; expected cached JWT but got refreshed-token. Log tmp/pr477-red.log. Early mock return/matcher defects repaired before accepting red evidence.
- Browser Next16.4 localhost:3477/dashboard: documented headers-first context with fresh synthetic cookie reports Blocking Route Date.now at token-utils.ts; screenshot saved. Public challenge posted at https://github.com/udecode/kitcn/issues/477#issuecomment-6087237287.

Source-listed case matrix:
| Case | Source claim | Harness | Before | Expected after | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Cached JWT after headers | Next runtime Date.now fails | Next16.4 Browser | Blocking Route | Async app clock after connection succeeds under Suspense | Saved pre-fix screenshot | reproduced |
| Private cache | Clock allowed, connection forbidden | Next16.4 Browser | Source confirms exemption | Default/sync clock succeeds without connection | Real route proof required | planned |
| Sync/async clock + tolerance | Proposed now hook | Public context + token tests | No hook | Unix seconds decide reuse/refresh, including equality | Focused tests required | planned |
| Defaults/true/empty/false | Preserve existing API | Public context + token tests | Boolean supported | Default cache preserved; false fetches | Focused tests required | planned |
| Fast paths | No unnecessary clock | Token tests | Unconditional expiry clock when decoded | Disabled/force/missing/malformed/missing-exp skip hook | Focused tests required | planned |
| Callback rejection/Next abort | App controls lifecycle | Public context + token tests | Clock errors swallowed as decode failure | Exact errors propagate; no log/fetch fallback | Focused tests required | planned |
| Non-finite clock | New hook must not treat NaN as unexpired | Token tests | No injected clock | Reject non-finite values without refresh | Focused tests required | planned |
| Auth route gate | Deferred token requires boundary | Next Browser + docs | Unbounded route read blocks | Suspense request path or private-cache path | Docs and route proof required | planned |
| TanStack secondary clock | Failed queries record Date.now | Source + docs | Query core owns error timestamp | App owns abort policy; no generic swallowing | Not claimed as library fix | narrowed |

Final handoff contract:
- Commit line: pending
- PR line: pending
- Issue line: pending
- Confidence line: pending
- Flow table:
  - Reproduced: tests pending, browser pending
  - Verified: tests pending, browser pending
- Browser check: pending
- Outcome: pending
- Caveat: pending
- Design:
  - Chosen boundary: pending
  - Why not quick patch: pending
  - Why not broader change: pending
- Verified: pending
- PR body verified: pending

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
- Commit: pending
- PR: pending
- Issue: pending
- Browser proof: pending
- Caveats: pending

Timeline:
- 2026-10-09T18:49:59.678Z Task goal plan created.

Reboot status:
| Question | Answer |
|----------|--------|
| Where am I? | Intake and source read |
| Where am I going? | Implementation, verification, commit/PR/GitHub sync, closeout |
| What is the goal? | TODO: Fill from Objective |
| What have I learned? | See Findings |
| What have I done? | See Timeline |

Open risks:
- Pending.

Hard closeout guard:
- A local-only final response for verified code-changing work is invalid unless
  this plan records an explicit user decline, no local patch, analytical/
  blocked/inconclusive outcome, or a real commit/PR blocker.
