# Document the complete request-time token boundary

Objective:
Clarify the complete request-time token boundary; done when bypass paths, session guard, query wiring, app abort policy and private-cache limits are documented, rendered and shipped.

Goal plan:
docs/plans/477-token-read-boundary.md

Template:
docs/plans/templates/docs.md

Primary template:
docs/plans/templates/docs.md

Applied packs:
- agent-native (docs/plans/templates/packs/agent-native.md)
- browser (docs/plans/templates/packs/browser.md)

Flow mode:
one-shot execution.

Goal control:
get_goal returned null; no explicit native-goal request, so this dedicated task plan owns execution state.

Docs source:
- type: GitHub follow-up docs correction
- id / link: https://github.com/udecode/kitcn/issues/477#issuecomment-6089906144
- title: JWT clock hook does not gate token-fetch paths
- acceptance criteria: document connection before the complete token read after session-cookie check; distinguish expiry clock from request boundary; apply same helper to TanStack/provider; preserve app-owned abort policy and private-cache restrictions.

Docs lane:
- lane: guide/system
- target docs: www/content/docs/nextjs/index.mdx JWT Cache and Partial Prefetching
- documented source owner: auth/internal/token.ts and caller factory; app owns Next connection and abort policy.
- nearest sibling docs: www/content/docs/nextjs/rsc.mdx; published setup/next.md
- kitcn skill mirror: packages/kitcn/skills/kitcn/references/setup/next.md -> generated .agents copy

Timed checkpoint:
- requested duration: N/A: no duration.
- semantics: N/A: one-shot docs follow-up.
- initial confidence score: source-proven bypass; not claiming reporter wrapper reproduction.
- improvement loop: source audit, docs edit, executable example probe, parser/render proof, review, ship.
- final score / loop closure: 90% for the bounded docs correction; reporter-specific TanStack abort wrapper is not independently reproduced.

Completion threshold:
- Every source-listed case explained accurately; docs and skill mirror synchronized; snippet/API audit, MDX parser, Browser walkthrough, root check, agent-native audit and autoreview pass; one dedicated PR and issue reply read back.
- Docs closure is legal only when the page teaches the fastest correct path,
  every claim is source-backed, docs-lane shape is satisfied, required MDX/link/
  preview checks are recorded, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/477-token-read-boundary.md`
  passes.

Verification surface:
- Owning repo source and focused token tests; actual docs MDX/Browser rendering; isolated Next16.4 wrapper probes; root bun check; generated parity; review; GitHub readback.

Constraints:
- Follow `packages/kitcn/skills/kitcn/references/setup/doc-guidelines.md` for
  docs style and workflow when `www/**` changes.
- Write current-state docs only. No changelog voice.
- Keep code examples repo-backed and copy-pasteable.
- Do not invent APIs, routes, demos, imports, components, transforms, or options.
- Do not add docs ceremony for tiny typo/copy edits.

Boundaries:
- Source of truth: exact follow-up comment, token.ts, caller factory, Next16.4 installed source and public connection docs.
- Allowed edit scope: www Next guide, matching published/generated setup guidance, dedicated plan. No library runtime/API changes. Required fixtures:check repair regenerates six fixture dependency manifests through fixtures:sync; no handwritten fixture changes.
- Browser surface: real rendered /docs/nextjs token section; isolated Next proof as supporting evidence only.
- GitHub sync: create one new docs PR, reply on #477 with QA steps; do not reopen/merge unless asked.
- Non-goals: universal Next abort detector, permanent-promise library policy, auth API redesign, claiming live reporter app reproduction.

Output budget strategy:
- Exact files and bounded ranges; exclude tmp/node_modules except named Next proof app. Save long check logs and inspect summaries. Combined output truncation recovered by smaller reads.

Blocked condition:
- Stop only for missing required render/check/PR authority after safe alternatives; do not expand into framework abort internals.

Docs state:
- task_type: docs
- task_complexity: bounded docs correction with executable examples
- current_phase: delivery
- current_phase_status: in_progress
- next_phase: PR readback and issue reply
- goal_status: active

Current verdict:
- verdict: ready
- confidence: source-proven docs gap; actual reporter wrapper secondary error not independently reproduced.
- next owner: docs
- reason: jwtCache.now owns expiry comparison, not complete token-read timing.

Completion rule:
- Do not call `update_goal(status: complete)` while any required checklist item
  remains unchecked. If an item does not apply, check it and add `N/A: <reason>`.
- Do not call `update_goal(status: complete)` until every completion threshold
  above is satisfied, final evidence is recorded, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/477-token-read-boundary.md`
  passes.
- Do not create hook state for this goal. This file plus the active goal are the
  durable state.

Start Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| Timed checkpoint parsed | no | N/A: no duration requested. |
| Walkthrough baseline for possible rendered change | yes | tmp/walkthrough/477-followup/baseline.json captured before plan creation. |
| Docs guidance loaded | yes | Published setup/doc-guidelines.md read fully. |
| Active goal checked or created | yes | get_goal null; plan-only task state. Native goal creation requires explicit user request. |
| Docs lane selected | yes | guide/system, bounded Next token timing correction. |
| Target docs read | yes | www/content/docs/nextjs/index.mdx JWT section and RSC setup. |
| Nearest sibling docs read | yes | Published setup/next.md and www nextjs/rsc.mdx before writing. |
| Docs style doctrine read | yes | Current-state prose; source-owned docs -> published setup -> generated copy. |
| Documented source code read | yes | token.ts and auth-nextjs/index.ts; cached/bypass paths explicit. |
| Ownership map drafted | yes | Package token mechanism; app Next stage/abort policy; www reference; published setup agent route. |
| Output budget strategy recorded | yes | Exact bounded reads and local logs; noisy trees excluded. |
| Kitcn skill sync decision | yes | Update published setup/next.md and regenerate generated mirror. |
| Browser/render proof decision | yes | @Browser real docs render and walkthrough; synthetic Next probes supporting only. |
| PR/GitHub expectation decision | yes | task authorizes dedicated branch/PR; no merge; post QA-facing follow-up. |
| Agent-native pack selected | yes | Published setup action guidance changes. |
| Agent-facing action surface identified | yes | Wire one complete request-time token helper to provider/query client. |
| Source rule versus generated mirror boundary identified | yes | Edit published packages/kitcn/skills/kitcn source; sync .agents output only. |
| Installed-skill lock versus local-rule owner identified | no | N/A: no installed skill or workflow edits. |
| `agent-native-reviewer` loaded or waiver recorded | yes | Main read skill fully; parity audit after final docs. |
| Browser pack selected | yes | Rendered docs output changes. |
| Browser route / app surface identified | yes | localhost docs /docs/nextjs JWT section; synthetic Next fixture route if needed. |
| Browser tool decision recorded | yes | @Browser for rendered guide; native OS proof N/A. |
| Console/network caveat policy recorded | yes | Check final docs console; no live auth/backend claims. |
| UI state/accessibility matrix recorded | yes | Reference docs code/text; auth missing/cached/expired source tests. N/A focus/mutation/responsive interaction changes. |

Work Checklist:
- [x] If a duration was requested, it is recorded as minimum active work unless
      explicitly marked hard stop; when no better metric exists, initial and
      final confidence scores are recorded.
- [x] Objective includes outcome, completion threshold, verification surface,
      constraints, boundaries, and blocked condition.
- [x] Docs lane is classified as install, guide/system, plugin/feature,
      serialization/conversion, workflow/AI, API reference, or spec/law.
- [x] Target docs and nearest sibling docs were read before writing.
- [x] Docs style doctrine in the kitcn doc guidelines was read before writing,
      or marked N/A for non-`www/**` docs.
- [x] Documented behavior or API was verified against current source.
- [x] Ownership map records package, kitcn skill, app-local, and docs-site
      ownership where relevant.
- [x] Fastest success path appears before deeper mechanics or API reference.
- [x] Opening is three sentences or fewer and avoids generic fluff.
- [x] Named APIs, options, transforms, components, imports, routes, and package
      specifiers are exact and current.
- [x] Plugin docs, if applicable, satisfy kitcn plugin guidance and package
      ownership.
- [x] Serialization docs, if applicable, split directions and state environment
      constraints before examples.
- [x] API reference docs, if applicable, use exact contracts and avoid tutorial
      filler.
- [x] Spec/law docs, if applicable, record owner map, evidence, and explicit
      gaps.
- [x] Demos/previews/examples are real source-backed surfaces or marked N/A
      with reason.
- [x] Links target real leaf pages and do not reinforce pages being displaced.
- [x] Anti-slop audit passed: no changelog voice, no fake APIs, no placeholder
      comments, no TODOs, no dead anchors, no redundant summary section.
- [x] Workspace authority recorded: every proof command names the cwd/tool that
      owns the changed docs.
- [x] Output budget discipline recorded and followed: broad searches are
      scoped, capped, counted, or artifacted instead of streamed into goal
      context.
- [x] Review/autoreview target selected for non-trivial docs work, or marked
      N/A with reason.
- [x] Agent-native pack: source-of-truth rule files are edited instead of generated skill mirrors.
- [x] Agent-native pack: the changed agent action is discoverable from the skill/rule text.
- [x] Agent-native pack: generated mirrors are synced when `.agents/rules/**` changed, or N/A reason is recorded.
- [x] Agent-native pack: installed skills are changed only through
      `npx skills add/update/remove`; local rules/templates/helpers stay source-owned.
- [x] Agent-native pack: routing, required receipts, placeholder failure,
      completion representability, and forbidden behavior have eval/smoke rows.
- [x] Agent-native pack: accepted agent-native review findings are fixed or explicitly rejected with reason.
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
| Named verification threshold | yes | Run the source audit, parser/build, link/demo check, or review named in this plan | Source audit, 30 focused tests, MDX parser, Browser docs/dev proof, strict example build, sync/intent/lint, full bun check and autoreview pass. |
| Docs lane shape satisfied | yes | Check the lane-specific structure against kitcn docs guidance or record N/A | Guide/system begins with complete success path; optional mechanism below. Other lanes N/A. |
| Source-backed claim audit | yes | Verify every named API/option/transform/component/import/route against source | token.ts, caller factory, Next installed source; 30 focused tests and strict example build. |
| Ownership map verified | yes | Confirm package/layer/kit/app-local ownership claims against source | App owns connection/abort policy; package owns expiry; published/generated guides match website. |
| MDX/content parser | yes | Run the relevant `www` docs parser/build for MDX/content changes, or record N/A | www cwd bun run postinstall passes. |
| Links/routes/previews verified | yes | Check leaf links, routes, anchors, and `<ComponentPreview>` names or record N/A | Real docs heading rendered; RSC and official Next leaf links retained. Preview N/A. |
| Kitcn docs sync | yes | If `www/**` changed, update matching `packages/kitcn/skills/kitcn/**` content or record N/A | Source guide updated and tooling/sync-kitcn-skill.ts regenerated byte-identical mirror. |
| Browser/render surface changed | yes | Capture Browser Use proof or record explicit waiver/blocker | Actual guide inspected; original screenshot and annotated copy saved. |
| Package/API behavior changed | no | Add changeset or record N/A | N/A: published docs and generated fixture manifests only, no released runtime/API change. |
| Agent rules or skills changed | yes | Run `bun install` and verify generated skill sync | Published user reference only; source sync command and intent checks pass. bun install N/A: no source rules or installed-skill changes. |
| Final lint | yes | Run `bun lint:fix` or scoped equivalent | Pass; tmp/pr477-followup-lint.log. |
| Output budget discipline | yes | Verify no unbounded high-volume command output was streamed, or record the accidental output and recovery | Saved check logs; bounded reads. Browser emitted oversized encoded error page; stopped failed probe and retained caveat. |
| Timed checkpoint | no | If duration was requested, keep improving until elapsed, then finish the current loop cleanly; otherwise N/A | N/A: no duration; bounded confidence 90%. |
| Agent-native reviewer | yes | Run for agent workflow docs or record N/A | Read-only parity/action audit PASS; no accepted findings. |
| UI walkthrough | yes | If docs changed a rendered UI or visual output, run `.agents/skills/walkthrough/SKILL.md` after final proof and show annotated images in the final handoff; otherwise record N/A | tmp/walkthrough/477-followup original, annotated image and diff receipt; final handoff embeds annotated image. |
| Autoreview for non-trivial docs changes | yes | Load `.agents/skills/autoreview/SKILL.md` and run the right target, or record N/A for tiny/no-local-patch work | Local helper exits 0; findings empty; /tmp/kitcn-477-followup-review.R5XhBj/review.json. Stop after clean review. |
| Goal plan complete | yes | Run `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/477-token-read-boundary.md` | pending |
| Agent source / generated sync | yes | Run `bun install` when `.agents/rules/**` changed and verify generated mirrors | Exact mirror parity; install N/A because no rules edited. |
| Installed lock audit | no | Verify expected lock entries and removed skills through CLI-managed state | N/A: no installed skills added, removed or changed. |
| Agent action discoverability | yes | Source-audit the skill/rule path an agent will read | Published setup 8.A.4 names complete helper and query/provider wiring. |
| Helper and template smoke | no | Syntax-check helpers and prove incomplete failure/completed representation when applicable | N/A: no helper, workflow receipt contract or template changes; action smoke cases recorded below. |
| Agent-native review | yes | Load `.agents/skills/agent-native-reviewer/SKILL.md` and close accepted findings, or record N/A | PASS; no accepted findings or comments to delete. |
| Browser interaction proof | yes | Exercise the target route/interaction with the approved browser tool or record blocker | @Browser docs anchor/text and dev synthetic token states; no native OS behavior. |
| Browser console/network check | yes | Record console/network state or why it is not applicable | Docs warnings/errors empty; dev auth fetch 200 and no clock error. Production stream failure recorded, no live backend claim. |
| Browser state/accessibility proof | yes | Exercise applicable honest states, keyboard/focus, motion, and sizes | Readable code/text and existing Suspense guidance. Focus, mutation, permission, motion, responsive behavior N/A: prose only, no component/layout change. |
| Browser final proof artifact | yes | Record screenshot/trace/route proof or exact caveat | 01-complete-boundary-annotated.png; production/soft-navigation limits recorded. |

Phase / pass table:
| Phase | Status | Evidence | Next |
|-------|--------|----------|------|
| Intake and source read | complete | Comment and source establish a docs gap, not a new library regression. | writing |
| Writing | complete | Complete-token helper first; expiry-clock and private-cache limits separate; published/generated guide synchronized. | verification |
| Verification | complete | Focused tests, parser, rendered docs/dev probe, strict example build, full bun check and clean autoreview pass. | closeout |
| PR / GitHub sync | pending | | final response |
| Closeout | pending | | final response |

Source-listed case matrix:
| Case | Source-backed verdict | Proof |
| --- | --- | --- |
| Session cookie without JWT | valid: fetch bypasses now | token.ts missing branch + existing focused tests |
| Decoded expired JWT | now runs, then fetches | tolerance regression/source |
| Disabled/forced/malformed/no-exp | fetch can bypass now | existing regression cases |
| Next dev abort into TanStack | reporter-observed; not a universal library claim | docs place existing app policy around whole boundary |
| Private cache | connection forbidden | keep separate factory/default clock and Suspense guidance |
| Soft/hard/push/prod | reporter-tested wrapper not rerun | Synthetic dev hard reload passes; soft click deadline and production Browser stream fail; production build passes; router.push unprobed. |

Throughput checkpoint:
One bounded HOW source audit and one parity/comment/agent-native audit; parent owns docs and all mutations. Both results consumed. No separate design panel because no runtime or API choice changes.

Playbook steps:
1. Reproduce it yourself on the matching surface via the driver skill. Docs gap is directly source-proven; exact reporter app is unavailable.
2. Binary-search the cause. Clock bypass versus query failure separated by source/tests; why skipped because no new runtime regression is being fixed.
3. Plan the fix. Docs only; no function signature or runtime boundary change. Parent writes source-owned guide; HOW delegate audits it.
4. Verify on the same surface. Render actual docs and probe example behavior; do not claim reporter wrapper coverage.
5. Stage the commits so the failing repro lands before the fix in git history. N/A: no library behavior change; existing bypass tests are the intended contract.
6. Run Opening a PR. Dedicated plan and task-style body.

Findings:
- Source confirms missing JWT bypasses clock; expired decoded JWT with exp calls now then fetches. Do not conflate these paths.

Decisions and tradeoffs:
- Boundary Discipline keeps Next request timing and render-abort handling app-owned. The generic library clock remains framework-independent.
- Recommend one session-guarded helper for provider and query reads. Put the full boundary before the read rather than only inside the expiry clock.
- Do not invent a public abort predicate or copy private Next error internals. The documented plain connection example does not suppress aborts.
- Regenerate fixture manifests because the required root gate detects current registry dependency drift; no package source or release change.

Implementation notes:
- Website guide is the rendered owner; packages/kitcn/skills/kitcn/references/setup/next.md is the published agent reference; tooling/sync-kitcn-skill.ts regenerates the .agents copy.
- Changeset N/A: docs guidance and owner-generated fixture dependency refresh only; no released package behavior or API change.
- No TDD behavior change: existing missing/malformed/disabled clock-bypass tests describe intended behavior and stay unchanged.
- No Maintain Workflow: published consumer setup reference changes, not agent workflow/rules/helper design.

Review fixes:
- Agent-native and parity audit PASS; no accepted findings. Website/published/generated instructions agree on session guard, complete boundary, query/provider wiring, abort ownership and private cache.
- Comment review found zero MUST KILL comments; no added code comments, none deleted.
- Deslop delta versus kitcn/main reports zero added/worsened findings (185 to 185); no cleanup edits required.

Autoreview scope baseline:
- Request: resolve #477 comment 6089906144 by correcting incomplete Next token timing guidance.
- Invariant: the guide must not present an expiry-clock hook as a complete request-time token boundary.
- Branch/base: codex/477-token-read-docs from kitcn/main adf405d15d26.
- Owner/siblings: www Next guide; published setup guide and generated mirror. Six registry-owned fixture manifests accompany the required check repair.
- Contracts: no runtime, public API, auth security or universal abort-policy changes. No inherited dirty files.
- Measured tracked diff before review: nine files, 166 additions and 49 deletions, all prose/examples/generated manifests; dedicated plan is additionally untracked. Production implementation LOC changed: zero.
- Review target: local dirty bundle, default Codex P0 helper; report artifacts outside checkout at /tmp/kitcn-477-followup-review.R5XhBj.

Error attempts:
| Error / failed attempt | Count | Next different move | Resolution |
|------------------------|-------|---------------------|------------|
| Bun cwd invocation printed usage | 2 | Use exec workdir with bun run script. | MDX parser and docs server rerun successfully; usage exits not counted as proof. |
| Root check failed fixture dependency drift | 1 | Regenerate via bun run fixtures:sync. | Sync passed; six manifests refreshed, package build and full root check pass. |
| Dev soft-navigation click deadline | 1 | Inspect state and retain narrow proof. | Hard reload and four token states pass; no soft-navigation or router.push claim. |
| Production Browser incomplete streamed response | 2 | Inspect server log and HTTP diagnostic. | Build passed and diagnostic HTTP 200; no production Browser runtime claim. No product patch inferred. |

Verification evidence:
- Repository cwd unless stated otherwise. Focused Vitest auth/internal/token.vitest.ts and auth-nextjs/index.vitest.ts pass: 30 tests, two files, no type errors. Log tmp/pr477-followup-focused.log.
- www cwd: bun run postinstall passes content/MDX parser. Actual /docs/nextjs#gate-the-complete-token-read renders in @Browser; full text, helper, query wiring and private-cache guidance inspected. Final docs console has no warnings/errors.
- Synthetic app tmp/pr477-next uses actual package source and Next 16.4.0 with cacheComponents/partialPrefetching. Dev missing/cached/expired JWT cases show Token available; signed-out shows Signed out. Missing JWT hard reload passes. These are synthetic token endpoint checks, not the reporter's TanStack wrapper or live backend.
- Synthetic app strict Next production build passes. Browser production response fails with incomplete chunked encoding despite HTTP 200 diagnostic, so production runtime is explicitly unverified.
- bun run fixtures:sync passes, including package artifact build (72 files); six fixture manifests are regenerated, not manually edited. Full bun check exits 0; tmp/pr477-followup-check-final.log. Bun 1556 pass/0 fail; Vitest 1081 pass/14 skipped; CLI 124 pass/0 fail; all fixture comparisons, verify and runtime smoke pass. Fresh create-convex scenarios warn about upstream convex 1.46.0 outside the supported range but pass; no range/API change inferred.
- Generated setup mirror byte-identical to published source. intent:validate passes one published skill; intent:stale reports both skills up to date.
- Final bun lint:fix passes; tmp/pr477-followup-lint-final.log. Deslop has no delta findings; tmp/pr477-followup-slop.log. Agent-native/parity/comment audit passes without accepted findings.
- Walkthrough original and annotated image saved under tmp/walkthrough/477-followup. Annotation explains the complete token read without changing rendered content. Final handoff must embed annotated image. PR image hosting N/A: no repository upload requirement; route and steps supplied instead.
- Autoreview local helper exits 0 with empty findings; /tmp/kitcn-477-followup-review.R5XhBj/review.json. No further review required for closeout bookkeeping. Dedicated PR/readback and issue reply remain open.

Agent action smoke matrix:
| Action / boundary | Receipt |
| --- | --- |
| Discover full request-time helper | Published setup 8.A.4 matches rendered guide. |
| Missing JWT with session cookie | Source bypass and actual dev Token available after complete boundary. |
| Cached/expired JWT | Dev Token available; focused tests preserve expiry-clock behavior. |
| Signed out | Dev Signed out; guard precedes connection/token retrieval. |
| Forbidden private-cache connection | Both guide owners explicitly exclude request-time helper/clock. |
| Abort handling | Both guides say app-owned policy; no universal AbortError suppression or fake helper. |
| Receipt/placeholder/workflow enforcement | N/A: no workflow/helper/template contract changed. |

Final handoff contract:
- PR line: pending
- Issue line: pending
- Confidence line: 90% for bounded docs clarification, not universal abort suppression.
- Docs lane: guide/system; fastest complete request-time helper precedes clock mechanics.
- Source-backed claims: token.ts bypasses now except decoded JWT with exp; caller/provider/query helper contracts checked against source.
- Content build / parser: www postinstall MDX parser passes; synthetic strict production build passes.
- Links / demos / previews: Existing RSC setup/helpers and official Next leaf links retained; new heading rendered. No ComponentPreview added.
- Browser check: actual docs render and dev token states pass; production streamed response and soft-navigation caveats recorded.
- Outcome: teach one full request-time token boundary for provider and query reads.
- Caveat: existing verified app abort policy belongs around connection; plain example does not suppress aborts. No reporter wrapper/live-backend validation.
- Verified: focused 30 tests, parser/render/dev, generated parity, intent, lint, package build, full root check and clean autoreview.

Final handoff / sync:
- PR: pending
- Issue: pending
- Browser proof: tmp/walkthrough/477-followup/01-complete-boundary-annotated.png; actual docs route and synthetic dev states above.
- Caveats: No universal abort detection; no fresh reporter TanStack, router.push or production runtime proof.

Timeline:
- 2026-10-11 (client date): source read, baseline and dedicated task plan created; docs and mirrored guidance changed; focused/render/dev proof pass; fixture gate drift regenerated; final root check and review pass; delivery follows.

Reboot status:
| Question | Answer |
|----------|--------|
| Where am I? | Verified, ready for dedicated PR |
| Where am I going? | PR and issue reply readback |
| What is the goal? | Correct complete token-read timing docs and synchronized published guidance |
| What have I learned? | See Findings |
| What have I done? | See Timeline |

Open risks:
- Exact reporter TanStack abort wrapper unavailable; documentation explicitly delegates that policy to the app and states plain await connection does not suppress aborts.
- Synthetic production Browser stream failed; strict production build passes, but runtime coverage is not claimed.
- Registry-driven fixture refresh broadens generated manifest delta only; fresh fixtures:check and full root check pass.
