# Native Convex pagination in cRPC infinite queries

Objective:
Resolve discussion #304 native Convex pagination behavior; done when the
3-of-6 case and next-page state pass focused proof and repo gates; plan
docs/plans/304-native-convex-pagination-in-crpc-infinite-queries.md.

Flow mode:
one-shot execution

Goal plan:
docs/plans/304-native-convex-pagination-in-crpc-infinite-queries.md

Template:
docs/plans/templates/task.md

Primary template:
docs/plans/templates/task.md

Applied packs:
- docs (docs/plans/templates/packs/docs.md)
- package-api (docs/plans/templates/packs/package-api.md)

Task source:
- type: public GitHub discussion / behavior report
- id / link: discussion #304,
  https://github.com/udecode/kitcn/discussions/304
- title: Partial migration to Infinite Query breaks pagination
- acceptance criteria:
  - A native Convex paginated query with six rows and limit three does not
    auto-fetch through all rows.
  - The infinite-query next-page state is true before exhaustion and false
    after exhaustion.
  - Partial migration does not require replacing native Convex schema
    validators or the native paginator with the kitcn ORM.

Timed checkpoint:
- requested duration: N/A: none requested
- semantics: N/A: no timed checkpoint
- initial confidence score: N/A: binary behavior and gate threshold
- improvement loop: reproduce, fix the owner, rerun every case and repo gates
- final score / loop closure: N/A: evidence-bounded confidence at handoff

Completion threshold:
- The native Convex 3-of-6 repro fails before the fix and passes afterward.
- Exactly two user-visible fetch steps expose 3 then 6 rows, with next-page
  state true then false.
- Partial migration remains supported without an ORM/schema rewrite.
- Focused tests, package build/typecheck/lint, changeset, autoreview, `bun
  check`, commit, push, task-style PR, discussion sync, and goal-plan check
  pass.
- Task closure is legal only when the source-of-truth acceptance criteria are
  satisfied or explicitly narrowed, required verification evidence is recorded,
  code-review and release-artifact gates are closed when applicable, verified
  code changes are committed and PR'd unless explicitly declined or blocked,
  task-style PR body sync is complete or marked N/A with reason,
  GitHub issue/PR sync is complete or marked N/A with reason, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/304-native-convex-pagination-in-crpc-infinite-queries.md` passes.

Verification surface:
- Focused cRPC React infinite-query regression test at the package owner.
- `bun --cwd packages/kitcn build`, relevant typecheck, `bun lint:fix`, and
  final `bun check` in `/Users/zbeyens/git/better-convex`.
- Source audit of native Convex pagination result handling.
- Changeset, task-style PR body read-back, and discussion #304 sync.
- Browser proof is N/A unless investigation discovers a browser-only behavior.

Constraints:
- Preserve existing user-facing behavior outside the task scope.
- Prefer the durable ownership boundary over caller-by-caller patches.
- Verified code changes must be committed and PR'd because the task skill
  requires that path unless the user explicitly says not to, the work has no
  local patch, or a real blocker is recorded.
- The absence of a separate "open a PR" sentence from the user is not a valid
  N/A reason for verified code-changing task work.
- A PR created by this task must use the PR #270 emoji task-style PR body
  contract below, not a generic summary/body from a git helper skill.
- Do not add broad ceremony when the task is trivial or docs-only.
- Do not require an ORM or schema-validator migration for cRPC infinite-query
  pagination.
- Do not add compatibility parsing at callers when the cRPC adapter owns the
  native pagination-result translation.

Boundaries:
- Source of truth: GitHub discussion #304 plus current cRPC infinite-query
  implementation and migration documentation.
- Allowed edit scope: `packages/kitcn` cRPC pagination owner and focused
  React/Solid tests; matching docs only when behavior needs clarification;
  plan, changeset, generated fixture snapshots, and the stale raw Next fixture
  boundary required to restore the mandatory runtime gate.
- Browser surface: N/A: hook/runtime package behavior has an honest automated
  harness and no visual output.
- GitHub issue sync: reply to discussion #304 after the PR exists.
- Non-goals: ORM migration, schema conversion, pagination API redesign,
  unrelated query behavior, Solid changes unless the shared defect exists
  there too.

Output budget strategy:
- Use exact-symbol `rg`, bounded `sed` ranges, and focused test commands.
  Exclude `node_modules`, cap shell output, and inspect only the owning React,
  Solid, cRPC, docs, test, and local Convex source files needed to settle the
  result contract.

Blocked condition:
- Stop only if the native Convex result contract cannot be obtained from local
  source/tests after a real harness attempt, required package checks remain
  broken after the one allowed install-corruption retry, or GitHub access
  prevents mandatory shipping/sync.

Task state:
- task_type: bug / runtime compatibility
- task_complexity: normal non-trivial
- current_phase: review
- current_phase_status: complete
- next_phase: commit / PR / GitHub sync
- goal_status: active

Current verdict:
- verdict: valid
- confidence: 97%
- next owner: task
- reason: React and Solid source-level hook repros failed because a plain
  `splitCursor` created a second subscription; both pass after matching
  Convex's split predicate.

Implementation readiness:
- verdict: ready
- exact owner: shared internal cRPC pagination split policy consumed by React
  and Solid infinite-query hooks
- contradiction status: settled by Convex's local source contract: a
  `splitCursor` is only actionable with split page status or page growth over
  twice the initial item count
- source-listed cases complete: yes; three rows below

Pre-solution issue challenge:
- reporter claim: a cRPC infinite query backed by native Convex pagination
  auto-fetches a six-row result as 3, 5, then 6 rows and reports
  `hasNextPage === false` throughout.
- suggested diagnosis or fix: the reporter's agent attributes the behavior to
  `splitCursor`; no concrete fix is proposed.
- repro ladder:
  - tests / source-level repro: required; smallest honest owner
  - repo-owned automated browser or integration proof: focused React and Solid
    hook tests reproduce the package behavior directly
  - Browser plugin: N/A unless source/test harness is dishonest
  - screenshot / visual proof: N/A: no visual output
- reproduction verdict: reproduced in both framework hooks; React query count
  was 2 instead of 1 and Solid query count was 2 instead of 1
- validity verdict: valid
- best long-term fix boundary: one shared internal split predicate consumed by
  both framework hooks
- harsh honest feedback: requiring an ORM migration would be the wrong fix;
  the client ignored Convex's own `pageStatus` contract
- hard-stop decision: proceed; direct failing repro exists

Completion rule:
- Do not call `update_goal(status: complete)` while any required checklist item
  remains unchecked. If an item does not apply, check it and add `N/A: <reason>`.
- Do not call `update_goal(status: complete)` until every completion threshold
  above is satisfied, final handoff evidence is recorded, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/304-native-convex-pagination-in-crpc-infinite-queries.md` passes.
- Do not create hook state for this goal. This file plus the active goal are the
  durable state.

Start Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| Timed checkpoint parsed | no | N/A: none requested |
| Skill analysis before edits | yes | Requested `task`; loaded `autogoal`; `tdd`, `changeset`, and `autoreview` remain conditional gates |
| Active goal checked or created | yes | `get_goal` returned none; goal created for this exact plan |
| Source of truth read before edits | yes | `gh api graphql` read discussion #304 body before repo exploration |
| GitHub comments and attachments read | yes | GraphQL returned zero comments, no answer, and no attachments |
| Video transcript evidence required | no | N/A: discussion contains no video or recording |
| Pre-solution issue challenge required | yes | Public behavior claim; reporter claim and source cases recorded |
| Reproduction verdict before implementation | yes | React Bun test and Solid Vitest each failed with expected query count 1, received 2 |
| Repro escalation ladder selected | yes | Focused package test/source harness first; browser N/A unless that layer proves insufficient |
| Suggested fix reviewed against durable boundary | yes | `splitCursor` is a diagnosis to test, not authority; adapter ownership will be settled first |
| `docs/solutions` checked for non-trivial existing-code work | yes | Exact pagination/cRPC search found no existing solution for this hook defect |
| TDD decision before behavior change or bug fix | yes | Loaded `tdd`; React and Solid behavior repros were observed red before each fix |
| Branch decision for code-changing task | yes | Created `codex/fix-native-convex-pagination` from current `origin/main`; unrelated merged branch not reused |
| Release artifact decision | yes | Published `kitcn` runtime behavior; patch changeset required |
| Browser tool decision for browser surface | no | N/A: package hook behavior has no visual surface; reassess if repro needs runtime browser proof |
| Commit / PR expectation decision | yes | `task` requires commit, push, PR for verified code changes |
| Task-style PR body decision | yes | PR #270 emoji contract required and read-back with `gh pr view --json body` |
| GitHub issue sync expectation decision | yes | Reply to discussion #304 after PR creation |
| Output budget strategy recorded | yes | Exact-symbol bounded reads/tests; no unbounded output |
| Docs pack selected | yes | Incidental current-state migration/docs guidance may need sync |
| Docs guidance loaded | no | N/A: no public docs edit; current migration guide already shows native `ctx.db.query(...).paginate(...)` under cRPC |
| Docs lane selected | yes | Supporting docs lane, not docs-dominant |
| Target docs and nearest sibling docs read | yes | Read `www/content/docs/migrations/convex.mdx`, React infinite-query docs, and published React skill guidance |
| Docs style doctrine read | no | N/A: no `www/**` or published skill content change |
| Documented source owner identified | yes | Runtime owner is package hook/shared predicate; current docs already support partial native pagination |
| Package/API pack selected | yes | Package runtime compatibility/release behavior is in scope |
| Public surface or package boundary identified | yes | `packages/kitcn` cRPC React infinite-query adapter |
| Convex entry/import graph impact identified | yes | Client-only React/Solid hooks import one type-only/internal helper; no Convex function entry graph |
| CLI/scaffold/generated impact identified | yes | No CLI/scaffold source changed; required fixture sync refreshed six lucide package snapshots; a raw Next scenario fixture needed a client boundary for current Next |
| Release artifact path selected | yes | `.changeset/calm-pages-wait.md` |
| `changeset` skill loaded when `.changeset` is required | yes | Loaded skill and `.agents/rules/changeset.mdc` before changeset creation |
| Package build / fixture impact decision recorded | yes | `packages/kitcn` build required; fixture sync/check required after current generator drift appeared |

Work Checklist:
- [x] Timed work N/A: no duration requested; final evidence confidence is 97%.
- [x] Objective, threshold, verification, constraints, boundaries, and blocker
      are recorded.
- [x] Discussion source, acceptance cases, package owner, browser waiver, and
      root-cause layer are recorded.
- [x] Video evidence N/A: discussion has no attachment or recording.
- [x] Public behavior claim challenged and reproduced before implementation.
- [x] Repro ladder stopped at honest focused React/Solid hook harnesses; browser
      and screenshots are N/A because no visual/native state is involved.
- [x] Hard-stop rule satisfied: implementation began only after two red repros.
- [x] Root instructions, doctrine, local Convex source, hook patterns, migration
      guide, TDD, changeset, scenarios, and autoreview instructions were read.
- [x] Three source-listed cases have owner, harness, verdict, and evidence.
- [x] Readiness classified `ready` from direct source/test evidence.
- [x] Shared internal split policy is the durable owner; no caller shim.
- [x] Patch changeset added for published `kitcn` runtime behavior.
- [x] Bug handoff, task-style PR body, and discussion sync shape are recorded.
- [ ] Commit/PR completed and recorded after final autoreview.
- [ ] PR #270 task-style body created and read back after PR creation.
- [x] Dedicated `codex/fix-native-convex-pagination` branch used.
- [x] Local-env retry recorded: one `bun install`, exact `bun check` rerun;
      remaining raw fixture failure was proven on `origin/main` and repaired.
- [x] All proof ran in `/Users/zbeyens/git/better-convex` or its owning
      `packages/kitcn` workspace.
- [x] Searches used exact symbols and bounded output; one broad `rg` truncated,
      then the investigation switched to exact fixture files.
- [x] Runtime risk recorded: false splitting can exhaust pagination early;
      parity predicate plus 3-of-6 and server-recommended cases prove boundary.
- [x] Final `autoreview --mode local` completed clean with no accepted or
      actionable findings; overall 0.94.
- [x] Agent-native review N/A: no agent rules, skills, hooks, commands, or
      user-action tooling changed.
- [x] Docs lane and source owner recorded; no docs edit because current guide
      already demonstrates native pagination through cRPC.
- [x] Named docs/API claims were checked against source.
- [x] Docs voice/links/previews N/A: no public content changed.
- [x] Package boundary and release impact recorded; no public export changed.
- [x] Release matrix applied with `.changeset/calm-pages-wait.md`.
- [x] Changeset skill/rule loaded and patch prose follows required format.
- [x] No-artifact path N/A: published `kitcn` runtime behavior changed.
- [x] Compatibility decision: preserve native Convex result semantics without
      changing the hook API or requiring migration.
- [x] Convex static entry graphs stay unchanged; helper is client-only and its
      Convex import is type-only.
- [x] CLI contract N/A: no CLI command changed.
- [x] Docs/skill sync N/A: public guidance was already correct.
- [x] Package tests, typecheck, build, lint, fixtures, and full gate are recorded.
- [x] `packages/kitcn` build and `fixtures:sync`/`fixtures:check` passed.

Completion Gates:
| Gate | Applies | Required action | Evidence |
|------|---------|-----------------|----------|
| Named verification threshold | yes | Run named proof and gates | Focused React 6/6, Solid 5/5, package build/typecheck, fixture sync/check, scenario repair proof, and `bun check` passed |
| Pre-solution issue challenge verdict | yes | Record challenge | Valid; direct red repros; shared split predicate is durable owner |
| Repro escalation ladder | yes | Record ladder | Focused hook integration tests were honest and sufficient; browser/visual N/A |
| Bug reproduced before fix | yes | Record red proof | React and Solid each expected one subscription but received two |
| Targeted behavior verification | yes | Run focused proof | React 6 pass/29 assertions; Solid 5 pass |
| TypeScript or typed config changed | yes | Run typecheck | `bun --cwd packages/kitcn typecheck` and root `bun check` typecheck passed |
| Package exports or file layout changed | yes | Run build | New internal helper; `bun --cwd packages/kitcn build` passed |
| Package manifests, lockfile, or install graph changed | yes | Install/check | Six generated fixture manifests refreshed; `bun install` and `bun check` passed; root lockfile unchanged |
| Agent rules or skills changed | no | N/A | No agent-owned source changed; postinstall sync produced no diff |
| Workspace authority proof | yes | Verify in owner | All commands ran in repo root or `packages/kitcn` |
| Browser surface changed | no | N/A | Hook has no visual surface |
| Browser final proof | no | N/A | Automated hook/runtime harness is the honest proof |
| Scaffold or fixture output changed | yes | Sync/check | `fixtures:sync` refreshed six lucide snapshots; `fixtures:check` and `bun check` passed |
| Package behavior or public API changed | yes | Add changeset | Patch changeset added for runtime fix |
| Docs and kitcn skill sync changed | no | N/A | No guidance changed; existing migration guide is correct |
| Docs or content changed | no | N/A | Only this goal plan changed |
| High-risk mini gate | yes | Record risk/proof | Risk is premature exhaustion; 3-of-6 plus split-recommended tests cover both sides |
| Agent-native review for agent/tooling changes | no | N/A | No agent/tooling contract changed |
| Local install corruption suspected | yes | Retry once | `bun install` rerun did not hide product failure; stale mainline raw fixture then repaired and proved |
| Commit created | pending | For verified code-changing work, stage the entire current checkout per repo policy and create a commit; N/A only for no local patch, explicit user decline, analytical/blocked/inconclusive work, or recorded external blocker | pending |
| PR create or update | pending | For verified code-changing work, run `check`, push, create or update the PR, and sync PR body to the task-style final handoff; N/A only for no local patch, explicit user decline, analytical/blocked/inconclusive work, or recorded external blocker | pending |
| Task-style PR body verified | pending | Verify the PR body with `gh pr view --json body`; it must preserve auto-release blocks when applicable, must not include a current-PR self-link, and must use the PR #270 emoji format: `🐛 Fixes ...`, `🟢 95-100% confidence`, `Phase / 🧪 Tests / 🌐 Browser` table, and bold emoji Outcome/Caveat/Design/Verified sections | pending |
| PR proof image hosting | no | N/A | No browser image applies |
| GitHub issue sync-back | pending | Post concise issue sync after PR exists, or record N/A/blocker | pending |
| Final handoff contract | pending | Fill the final handoff fields below with exact PR/issue/confidence/tests/browser/outcome/caveats/design/verification content or N/A reason | pending |
| Final lint | yes | Run lint | `bun lint:fix` and final `bun check` lint passed |
| Output budget discipline | yes | Record recovery | One broad `rg` truncated; subsequent reads were exact and bounded |
| Timed checkpoint | no | N/A | No duration requested |
| Autoreview for non-trivial implementation changes | yes | Run required review | Final local autoreview clean; no accepted/actionable findings; overall 0.94 |
| Goal plan complete | yes | Run `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/304-native-convex-pagination-in-crpc-infinite-queries.md` | pending |
| Docs source-backed claim audit | yes | Audit existing claims | Migration guide already shows native `paginate()` through cRPC |
| Docs links / routes / previews | no | N/A | No docs content changed |
| Docs MDX/content parser | no | N/A | No MDX/content changed |
| Kitcn docs sync | no | N/A | No `www/**` change |
| Public API / package boundary proof | yes | Audit boundary | Public exports/signatures unchanged; internal predicate shared by React/Solid |
| Convex bundle/import proof | yes | Audit graph | No Convex function entry changed; Convex import is type-only |
| CLI/scaffold/generated proof | yes | Regenerate/check | CLI source unchanged; required fixture sync/check passed |
| Release artifact classification | yes | Classify delta | Published `kitcn` runtime bug fix |
| Published package changeset | yes | Add changeset | `.changeset/calm-pages-wait.md` |
| No release artifact | no | N/A | Published behavior changed |
| Package typecheck/build/test | yes | Run owning checks | Focused suites, typecheck, build, and full `bun check` passed |
| Fixture/scaffold generation | yes | Sync/check | Both commands passed; six package snapshots refreshed |
| Docs/package skill sync | no | N/A | No public guidance changed |

Phase / pass table:
| Phase | Status | Evidence | Next |
|-------|--------|----------|------|
| Intake and source read | complete | Discussion, Convex source, hooks, tests, and migration docs read | source-level repro |
| Implementation | complete | React and Solid red-green tests; shared split predicate; patch changeset | verification |
| Verification | complete | Focused tests, package checks, fixtures, repaired raw scenario, and full `bun check` passed | review |
| Commit / PR / GitHub sync | pending | | final response |
| Closeout | pending | | final response |

Findings:
- Discussion #304 has no comments, answer, attachment, or video.
- The observed case is native Convex pagination through a partially migrated
  cRPC query; an ORM/schema migration is not a valid prerequisite.
- Convex returns `splitCursor` as a possible split point, not a command.
  Convex's clients split only for `SplitRecommended`, `SplitRequired`, or page
  growth beyond twice the initial item count.
- Kitcn's React and Solid hooks treated every `splitCursor` as a command,
  causing the 3 -> 5 -> 6 automatic accumulation.
- Current fixture generation refreshed lucide-react from `^1.25.0` to
  `^1.26.0` in six committed snapshots.
- The full runtime gate exposed a pre-existing raw Next fixture without the
  client boundary required by current Next; `origin/main` had the same source.

Decisions and tradeoffs:
- Centralize the predicate under `packages/kitcn/src/internal/pagination.ts`
  -> React and Solid share Convex parity -> avoids a future framework drift.
- Do not edit migration docs -> they already state incremental coexistence and
  show cRPC returning native `ctx.db.query(...).paginate(...)` -> runtime was
  wrong, not guidance.

Implementation notes:
- A plain native page with three items, `isDone: false`, `continueCursor`, and
  `splitCursor` remains one subscription until explicit `fetchNextPage()`.
- Server-requested and oversized-page splitting remain enabled by the shared
  Convex predicate.

Review fixes:
- Added `limit` to the React split effect dependencies after lint caught the
  missing dependency.
- Added `'use client'` to the raw Next/shadcn fixture button after the current
  Next runtime rejected Radix `createContext` from a server component.
- Final autoreview: clean, no accepted/actionable findings, overall 0.94.

Error attempts:
| Error / failed attempt | Count | Next different move | Resolution |
|------------------------|-------|---------------------|------------|
| First focused React/Solid repro | 2 | Implement shared Convex parity predicate | Both framework suites green |
| First `fixtures:sync` stalled in external sparse clone | 1 | Stop stalled process and retry once | Retry completed; fixture check passed |
| First `bun check` found missing React effect dependency and fixture drift | 1 | Fix dependency; run owned fixture sync | Lint and fixtures passed |
| Runtime scenario resolved mixed/stale React state | 1 | Run the single allowed `bun install`; rerun exact gate | Install completed; exact gate exposed same raw fixture defect |
| Raw Next fixture returned 500 on current Next | 2 | Compare with `origin/main`, add required client boundary, run focused scenario then full gate | Focused scenario returned 200; full `bun check` passed |

Verification evidence:
- RED: `bun test packages/kitcn/src/react/use-infinite-query.test.tsx` -> 4
  pass, 1 fail; expected one query, received two.
- RED: `bunx vitest run
  packages/kitcn/src/solid/use-infinite-query.vitest.tsx` -> 4 pass, 1 fail;
  expected one query, received two.
- GREEN after refactor: same React command -> 5 pass; same Solid command -> 5
  pass.
- FINAL focused React: 6 pass, 29 assertions, including plain split cursor and
  Convex-recommended split cases; Solid: 5 pass.
- `bun --cwd packages/kitcn typecheck`, `bun --cwd packages/kitcn build`, and
  `bun lint:fix` passed.
- `bun run fixtures:sync` and `bun run fixtures:check` passed; six package
  snapshots now match current generator output.
- `bun run scenario:test -- create-convex-nextjs-shadcn` passed with HTTP 200.
- Final `bun check` passed: lint, root typecheck, Bun/Vitest/CLI/Concave tests,
  fixtures, verify lane, all runtime and auth smoke scenarios.

Source-listed case matrix:
| Case | Source claim | Harness | Before | Expected after | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Page accumulation | Six rows with limit three appear as 3, 5, then 6 because the hook auto-fetches | Focused React infinite-query test with native Convex page results | Query count became two before `fetchNextPage()` | Exactly 3 after first request and 6 only after one explicit next-page request | React focused test: 6 pass, 29 assertions | fixed |
| Next-page state | `hasNextPage` is always false | Same focused hook test | Plain split cursor forced aggregation toward exhaustion | true after first 3-row page; false after second/exhausted page | React focused test asserts true then false | fixed |
| Partial migration | Native Convex schema/paginator cannot easily be replaced with ORM | React and Solid native `PaginationResult` hook harnesses plus migration source audit | Both hooks created a split subscription from native result metadata | Native Convex paginator works without ORM/schema conversion | Both framework tests pass; migration guide already uses native paginator | fixed |

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
  an emoji confidence line like `🟢 95-100% confidence`.
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
- 2026-07-23T17:39:30.782Z Task goal plan created.
- 2026-07-23T17:44Z React repro failed 1/5 at expected one query,
  received two; predicate fix passed 5/5.
- 2026-07-23T17:45Z Solid repro failed 1/5 at expected one query,
  received two; predicate fix passed 5/5.
- 2026-07-23T17:45Z Shared predicate refactor passed both focused suites.
- 2026-07-23T20:22Z Current Next rejected the stale raw fixture server/client
  boundary; focused scenario passed after the one-line fixture repair.
- 2026-07-23T20:28Z Final `bun check` passed every repo and runtime gate.

Reboot status:
| Question | Answer |
|----------|--------|
| Where am I? | Final review |
| Where am I going? | Autoreview, commit/PR/discussion sync, closeout |
| What is the goal? | Fix and ship discussion #304 with direct 3-of-6 pagination proof |
| What have I learned? | Plain `splitCursor` is metadata; page status/size owns splitting |
| What have I done? | Reproduced/fixed both hooks, added changeset, restored stale runtime fixture, passed `bun check` |

Open risks:
- The shared predicate must retain both ordinary and server-recommended split
  paths; focused tests cover both.
- Fixture snapshot version refresh is generated collateral, not pagination
  behavior; `fixtures:check` proves the committed snapshots match the owner.

Hard closeout guard:
- A local-only final response for verified code-changing work is invalid unless
  this plan records an explicit user decline, no local patch, analytical/
  blocked/inconclusive outcome, or a real commit/PR blocker.
