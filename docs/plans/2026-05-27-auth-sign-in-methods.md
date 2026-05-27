# auth sign-in methods

Objective:
Expand `createAuthMutations` sign-in helpers so callers can target Better Auth
plugin sign-in methods like `signIn.username`, while `signIn.email` remains the
default.

Goal plan:
docs/plans/2026-05-27-auth-sign-in-methods.md

Template:
docs/plans/templates/task.md

Primary template:
docs/plans/templates/task.md

Applied packs:
- docs (docs/plans/templates/packs/docs.md)
- package-api (docs/plans/templates/packs/package-api.md)

Task source:
- type: user prompt
- id / link: N/A
- title: Support non-email sign-in mutation methods
- acceptance criteria: `useSignInMutationOptions` can call `signIn.username`
  when requested, keeps existing email behavior by default, throws a precise
  missing-method error, and the package/docs/release artifacts reflect the
  public API.

Completion threshold:
- React and Solid auth mutation helpers support per-call sign-in method
  selection.
- Focused auth mutation tests pass for default email and plugin username flows.
- `www` docs and `packages/kitcn/skills/kitcn` docs show the current API.
- `.changeset` records the published package feature.
- `bun --cwd packages/kitcn build` succeeds.
- The code is committed, pushed, and PR'd from the current checkout.
- `node .agents/rules/autogoal/scripts/check-complete.mjs docs/plans/2026-05-27-auth-sign-in-methods.md`
  passes.

Verification surface:
- Focused tests: `packages/kitcn/src/react/auth-mutations.test.tsx`,
  `packages/kitcn/src/react/auth-mutations.types.test.ts`,
  `packages/kitcn/src/solid/auth-mutations.vitest.tsx`, and
  `packages/kitcn/src/solid/auth-mutations.types.vitest.ts`.
- Package proof: `bun --cwd packages/kitcn typecheck` and
  `bun --cwd packages/kitcn build`.
- Docs proof: `bun --cwd www build`, source-backed docs review, generated
  kitcn skill sync, `bun run intent:validate`, and `bun run intent:stale`.
- Repo proof: `bun check` rerun passed after one external GitHub clone timeout.
- PR proof: `gh pr view 275 --json url,title,body,headRefName,baseRefName`.

Constraints:
- Preserve existing user-facing behavior outside the task scope.
- Prefer the durable ownership boundary over caller-by-caller patches.
- Verified code changes must be committed and PR'd because the task skill
  requires that path.
- A PR created by this task must use the task-style PR body contract below.
- Do not add scaffold UI fields, auth setup docs, or broader auth-operation
  changes.

Boundaries:
- Source of truth: user prompt plus existing auth mutation helper behavior.
- Allowed edit scope: auth mutation helpers/tests, docs/skill reference,
  changeset, goal plan, and already-present autogoal template sync in the
  current checkout.
- Browser surface: N/A, package API only.
- Tracker sync: N/A, no tracker item.
- Non-goals: add new scaffold UI fields, add username auth setup docs, or
  change default email sign-in behavior.

Output budget strategy:
- Use focused file reads, targeted `rg`, explicit `max_output_tokens`, and
  ignored `tmp/verification/*.log` capture for high-volume `bun check` output.
- Do not stream full fixture/runtime logs into the goal context.

Blocked condition:
- The same external fixture clone timeout repeats enough times that `bun check`
  cannot be completed before PR, or Better Auth no longer exposes a callable
  plugin sign-in client method shape in current dependencies.

Task state:
- task_type: feature
- task_complexity: normal
- current_phase: closeout
- current_phase_status: complete
- next_phase: final response
- goal_status: active until this plan passes `check-complete` and the goal is
  marked complete.

Current verdict:
- verdict: valid API expansion
- confidence: high
- next owner: reviewer
- reason: Existing helper hardcoded `signIn.email`; Better Auth plugins expose
  additional sign-in methods through the same `signIn` object.

Completion rule:
- Do not call `update_goal(status: complete)` until this file passes
  `check-complete.mjs`, the PR body is verified, and the pushed branch contains
  the completed plan.

Start Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| Skill analysis before edits | yes | Loaded task, kitcn, tdd, changeset, agent-native, and autoreview guidance. |
| Active goal checked or created | yes | Goal created for auth sign-in methods before durable work. |
| Source of truth read before edits | yes | Read current React/Solid auth mutation helpers and Better Auth username client types. |
| Tracker comments and attachments read | N/A: no tracker item | User prompt is the source of truth. |
| Video transcript evidence required | N/A: no video | No recording or browser repro was referenced. |
| `docs/solutions` checked for non-trivial existing-code work | yes | Checked existing Better Auth structural wrapper guidance. |
| TDD decision before behavior change or bug fix | yes | Added failing React username dispatch test before implementation. |
| Branch decision for code-changing task | yes | Created `codex/auth-sign-in-methods` from `main`. |
| Release artifact decision | yes | Added `.changeset/auth-sign-in-methods.md`. |
| Browser tool decision for browser surface | N/A: no browser surface | Package API/docs-only visible change. |
| Commit / PR expectation decision | yes | Task skill requires commit and PR; PR #275 created. |
| Task-style PR body decision | yes | PR #275 body uses task-style sections and preserves auto-release block. |
| Tracker sync expectation decision | N/A: no tracker item | No issue or Linear item provided. |
| Output budget strategy recorded | yes | Plan records focused reads and ignored log capture. |
| Docs pack selected | yes | Docs pack applied for `www` and kitcn skill reference. |
| Docs guidance loaded | yes | Followed kitcn docs current-state reference rule and skill sync rule. |
| Docs lane selected | yes | Auth client feature/API reference lane. |
| Target docs and nearest sibling docs read | yes | Read `www/content/docs/auth/client.mdx` and auth skill reference. |
| Docs style doctrine read | yes | Used current-state docs voice; no changelog language added. |
| Documented source owner identified | yes | Package owner is `packages/kitcn/src/*/auth-mutations.ts`. |
| Package/API pack selected | yes | Public hook option changed. |
| Public surface or package boundary identified | yes | `useSignInMutationOptions` now accepts `signInMethod`. |
| Release artifact path selected | yes | `.changeset/auth-sign-in-methods.md`. |
| `changeset` skill loaded when `.changeset` is required | yes | Loaded changeset guidance before adding changeset. |
| Package build / fixture impact decision recorded | yes | Package build required; fixture sync/check covered by `bun check`. |

Work Checklist:
- [x] Objective includes outcome, completion threshold, verification surface,
      constraints, boundaries, and blocked condition.
- [x] Task source classified with source type, id/link, title, task type,
      acceptance criteria, caveats, likely files/routes/packages, browser
      surface, and root-cause layer.
- [x] Required video or screen-recording evidence is cached/read as normalized
      `<video-transcripts>` XML, or marked N/A with reason.
- [x] Nearby repo instructions and implementation patterns read before edits.
- [x] Implementation fixes the right ownership boundary, or the narrower choice
      is recorded with reason.
- [x] Release artifact requirement recorded: active changeset, new changeset, or
      N/A with reason.
- [x] Final handoff shape decided: feature/testing/PR body sync requirements.
- [x] Commit/PR handling recorded for code-changing work: commit and PR
      completed.
- [x] PR body shape recorded: task-style body used and verified with `gh pr
      view`.
- [x] Branch handling recorded for code-changing work: dedicated branch used.
- [x] Local-env-rot retry policy recorded for surprising repo-wide failure: no
      install corruption; first `bun check` failure was external GitHub clone
      timeout and rerun passed.
- [x] Workspace authority recorded: every proof command names the cwd/tool that
      owns the changed behavior.
- [x] Output budget discipline recorded and followed: broad output was captured
      to ignored `tmp/verification/*.log`.
- [x] High-risk note recorded for public API/package-boundary change.
- [x] Review/autoreview target selected from actual diff state.
- [x] Agent-native review decision recorded for `.agents/**` and skill changes.
- [x] Docs pack: docs lane, target docs, nearest sibling docs, and source owner
      are recorded.
- [x] Docs pack: every named API, import, option, route, component, transform,
      demo, and preview is source-backed or marked N/A with reason.
- [x] Docs pack: docs use current-state reference voice, not changelog voice.
- [x] Docs pack: links, anchors, and previews target real leaf pages or are
      marked N/A with reason.
- [x] Package/API pack: public API, package boundary, export, and
      release-artifact impact are recorded.
- [x] Package/API pack: release artifact matrix is applied with a changeset.
- [x] Package/API pack: `.changeset` work loads `changeset` and follows its
      package/version/prose rules.
- [x] Package/API pack: no-artifact decisions are N/A because package users see
      the new sign-in method option.
- [x] Package/API pack: compatibility decision is explicit; default email path
      preserved and plugin paths are additive.
- [x] Package/API pack: package-owned typecheck/build/test proof is recorded.
- [x] Package/API pack: `packages/kitcn` build and repo fixture checks are
      recorded.

Completion Gates:
| Gate | Applies | Required action | Evidence |
|------|---------|-----------------|----------|
| Named verification threshold | yes | Run the commands named in this plan | Focused tests, package typecheck/build, docs build, intent checks, lint, and `bun check` passed. |
| Bug reproduced before fix | yes | Record failing test/repro or N/A with reason | Red React test showed username sign-in still used email before implementation. |
| Targeted behavior verification | yes | Run focused test/proof for changed behavior | React Bun tests and Solid Vitest tests passed. |
| TypeScript or typed config changed | yes | Run relevant typecheck | `bun --cwd packages/kitcn typecheck` passed. |
| Package exports or file layout changed | yes | Run package build | `bun --cwd packages/kitcn build` passed. |
| Package manifests, lockfile, or install graph changed | N/A: no committed manifest or lockfile change | Run `bun install` if needed | `bun install` ran for agent/skill sync and left no committed lockfile diff. |
| Agent rules or skills changed | yes | Run `bun install` and verify generated skill sync | `bun install`, `bun run intent:validate`, and `bun run intent:stale` passed. |
| Workspace authority proof | yes | Run verification in owning workspace | All commands ran in `/Users/zbeyens/git/better-convex`. |
| Browser surface changed | N/A: no browser surface | Capture Browser Use proof or record waiver | Package API and docs only; no rendered app behavior changed. |
| Browser final proof | N/A: no browser surface | Attach screenshot or caveat | No browser proof required. |
| Scaffold or fixture output changed | N/A: no scaffold source changed | Run fixture commands or record N/A | `bun check` still ran fixture sync/check and passed. |
| Package behavior or public API changed | yes | Add a changeset | `.changeset/auth-sign-in-methods.md` added. |
| Docs and kitcn skill sync changed | yes | Keep `www/**` and `packages/kitcn/skills/kitcn/**` in sync | `www` docs, package skill reference, generated `.agents` mirror, and intent stale check agree. |
| Docs or content changed | yes | Verify source-backed claims and rendered output | `bun --cwd www build` passed; docs only mention `signInMethod` and Better Auth plugin sign-in methods proved by source/type tests. |
| High-risk mini gate | yes | Record failure mode, proof plan, and chosen boundary | Failure mode is dispatching wrong method or losing post-auth hydration; tests prove method dispatch and shared token/session path. |
| Agent-native review for agent/tooling changes | yes | Load agent-native guidance and close findings | `.agents` changes are generated skill mirror plus autogoal template/rule sync; manual review found no new user-action tooling contract. |
| Local install corruption suspected | N/A: no install corruption | Run reinstall/rerun if suspected | No React/module corruption; `bun install` completed cleanly. |
| Autoreview for non-trivial implementation changes | yes | Run review until no accepted/actionable findings or record blocker | First review found two P3s; fixed docs-template gate and moved Solid type fixture to Vitest. Later reviewer engines hung/died with no output; manual diff audit found no remaining accepted/actionable finding. |
| Commit created | yes | Stage entire current checkout and create commit | Commit created and amended with this completed plan. |
| PR create or update | yes | Run `check`, push, create/update PR | `bun check` rerun passed; PR #275 created from `codex/auth-sign-in-methods`. |
| Task-style PR body verified | yes | Verify PR body with `gh pr view --json body` | PR body has auto-release block, tracker/confidence line, Reproduced/Verified table, Outcome, Caveat, Design, and Verified sections. |
| PR proof image hosting | N/A: no browser proof image | Host image or record N/A | No screenshots needed. |
| Tracker sync-back | N/A: no tracker item | Post issue/Linear sync or record N/A | No tracker link provided. |
| Final handoff contract | yes | Fill final handoff fields | Final handoff fields below are complete. |
| Final lint | yes | Run `bun lint:fix` or scoped equivalent | `bun lint:fix` passed with no fixes. |
| Output budget discipline | yes | Verify bounded output handling | Full `bun check` output captured to ignored log; chat received only tails/status. |
| Goal plan complete | yes | Run `check-complete.mjs` | `node .agents/rules/autogoal/scripts/check-complete.mjs docs/plans/2026-05-27-auth-sign-in-methods.md` passed. |
| Docs source-backed claim audit | yes | Verify docs claims against source | `signInMethod` exists in React/Solid helpers and username plugin type fixtures compile. |
| Docs links / routes / previews | N/A: no links/previews added | Verify leaf links or record N/A | Docs section adds no links or previews. |
| Docs MDX/content parser | yes | Run docs build | `bun --cwd www build` passed. |
| Kitcn docs sync | yes | Update matching kitcn skill content | Package skill reference and generated `.agents` mirror updated. |
| Public API / package boundary proof | yes | Source-audit API and package boundary | React/Solid auth mutation helpers own the hook option; no export path change needed. |
| Release artifact classification | yes | Classify published delta | Published `kitcn` package feature. |
| Published package changeset | yes | Add changeset | `.changeset/auth-sign-in-methods.md` added as patch. |
| No release artifact | N/A: published package feature | Record no-artifact reason | Changeset is present. |
| Package typecheck/build/test | yes | Run owning package checks | Focused tests, `bun --cwd packages/kitcn typecheck`, and package build passed. |
| Fixture/scaffold generation | N/A: no scaffold source changed | Run fixtures when needed | Full `bun check` ran fixture sync/check and passed. |

Phase / pass table:
| Phase | Status | Evidence | Next |
|-------|--------|----------|------|
| Intake and source read | completed | Plan created; helpers, docs, Better Auth username client types, and prior structural-wrapper guidance read | implementation |
| Implementation | completed | React/Solid helpers, tests, docs, skill reference, and changeset updated | verification |
| Verification | completed | Focused tests, package typecheck/build, docs build, intent checks, lint, and full `bun check` passed | commit / PR |
| Commit / PR / tracker sync | completed | Commit created on branch `codex/auth-sign-in-methods`, PR #275, tracker N/A | closeout |
| Closeout | completed | PR body verified; plan updated for `check-complete` | final response |

Findings:
- Better Auth plugin sign-in methods are exposed under `authClient.signIn`, so
  the hardcoded email helper was the wrong boundary.
- The post-auth path should remain shared; only method dispatch needs to vary.

Decisions and tradeoffs:
- Added `signInMethod?: string` to React because the React wrapper already uses
  structural `unknown`-oriented typing.
- Added typed Solid overloads so `signInMethod: "username"` can narrow mutation
  variables/return type when the Better Auth Solid client exposes that method.
- Did not add scaffold username UI because the request was helper/API support,
  not auth setup or generated form changes.
- Included autogoal output-budget template sync because it was already in the
  current checkout and the docs template needed the same gate.

Implementation notes:
- `packages/kitcn/src/react/auth-mutations.ts` dispatches via
  `authClient.signIn?.[signInMethod]` with email default.
- `packages/kitcn/src/solid/auth-mutations.ts` mirrors dispatch and preserves
  typed email/custom method overloads.
- Missing custom methods throw `Auth client does not expose signIn.<method>`.
- Docs show the username sign-in method call and keep setup docs out of scope.

Review fixes:
- Added output-budget gates to `docs/plans/templates/docs.md` so all goal
  templates match the autogoal rule/skill changes in the checkout.
- Moved Solid type coverage to `auth-mutations.types.vitest.ts` so it is
  collected by the Solid Vitest project.

Error attempts:
| Error / failed attempt | Count | Next different move | Resolution |
|------------------------|-------|---------------------|------------|
| First `bun check` rerun failed while `shadcn init` timed out cloning `shadcn-ui/ui.git` for a fixture | 1 | Rerun full `bun check` with output captured under ignored `tmp/verification` | Second full `bun check` passed |
| Autoreview helper hung/died silently after initial findings were fixed | 2 | Try alternate engine, then terminate and use manual diff audit plus full repo gate | No remaining accepted/actionable findings found |

Verification evidence:
- `bun test packages/kitcn/src/react/auth-mutations.test.tsx packages/kitcn/src/react/auth-mutations.types.test.ts`
  passed: 12 tests.
- `bunx vitest run packages/kitcn/src/solid/auth-mutations.vitest.tsx packages/kitcn/src/solid/auth-mutations.types.vitest.ts`
  passed: 2 files, 11 tests.
- `bun --cwd packages/kitcn typecheck` passed.
- `bun --cwd packages/kitcn build` passed.
- `bun --cwd www build` passed.
- `bun install` passed and synced generated skill content.
- `bun run intent:validate` passed.
- `bun run intent:stale` passed.
- `bun lint:fix` passed with no fixes.
- `bun check` first rerun failed on external GitHub clone timeout during shadcn
  fixture setup; second full rerun exited 0.
- `gh pr view 275 --json url,title,body,headRefName,baseRefName` verified PR
  URL `https://github.com/udecode/kitcn/pull/275`.
- `node .agents/rules/autogoal/scripts/check-complete.mjs docs/plans/2026-05-27-auth-sign-in-methods.md`
  passed.

Final handoff contract:
- Commit line: `feat: support auth sign-in methods`, amended after PR evidence
  is recorded.
- PR line: https://github.com/udecode/kitcn/pull/275
- Issue / tracker line: N/A, no tracker item.
- Confidence line: high.
- Flow table:
  - Reproduced: React red test proved username sign-in still used the email
    path before the implementation.
  - Verified: focused React/Solid tests, type fixtures, package typecheck/build,
    docs build, intent checks, lint, and full `bun check`.
- Browser check: N/A, package API/docs change only.
- Outcome: `useSignInMutationOptions({ signInMethod: "username" })` dispatches
  to `authClient.signIn.username`; default remains email.
- Caveat: Generated auth UI still uses email by default.
- Design:
  - Chosen boundary: method selection inside `createAuthMutations`.
  - Why not quick patch: callers should not duplicate token/session/query-reset
    logic.
  - Why not broader change: only sign-in dispatch was requested and verified.
- Verified: see verification evidence above.
- PR body verified: `gh pr view` confirmed auto-release block plus task-style
  tracker/confidence, table, Outcome, Caveat, Design, and Verified sections.

Task-style PR body contract:
- Existing `<!-- auto-release:start -->` block is preserved by GitHub/changeset
  automation.
- Body includes tracker/confidence, Reproduced/Verified table, Outcome, Caveat,
  Design, and Verified sections.
- Body does not link to the current PR itself.
- Proof is `gh pr view 275 --json url,title,body,headRefName,baseRefName`.

Final handoff / sync:
- Commit: `feat: support auth sign-in methods`, amended with completed plan
  evidence.
- PR: https://github.com/udecode/kitcn/pull/275
- Issue / tracker: N/A.
- Browser proof: N/A.
- Caveats: Reviewer wrapper was flaky after initial actionable findings were
  fixed; manual diff audit plus full repo gate were used for closeout.

Timeline:
- 2026-05-27T08:00:19.930Z Task goal plan created.
- Added red React username dispatch test.
- Implemented React and Solid `signInMethod` dispatch.
- Added runtime and type coverage for React/Solid username sign-in.
- Updated `www` docs, kitcn skill reference, generated skill mirror, and
  changeset.
- Fixed output-budget docs template gap surfaced by initial autoreview.
- Ran focused tests, package build/typecheck, docs build, skill sync checks,
  lint, and full `bun check`.
- Created branch `codex/auth-sign-in-methods`, committed the checkout, and
  opened PR #275.

Reboot status:
| Question | Answer |
|----------|--------|
| Where am I? | Closeout after PR creation |
| Where am I going? | Run `check-complete`, amend/push completed plan, mark goal complete |
| What is the goal? | Support plugin sign-in methods such as username while preserving default email sign-in |
| What have I learned? | The durable boundary is method dispatch inside shared auth mutation helpers |
| What have I done? | Implemented, tested, documented, built, checked, committed, pushed, and opened PR #275 |

Open risks:
- None beyond normal reviewer/CI follow-up on PR #275.
