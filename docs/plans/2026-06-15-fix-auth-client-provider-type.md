# fix auth client provider type

Objective:
Fix ConvexAuthProvider authClient typing for plugin-rich Better Auth clients;
done when the type regression and package build pass.

Goal plan:
docs/plans/2026-06-15-fix-auth-client-provider-type.md

Template:
docs/plans/templates/task.md

Primary template:
docs/plans/templates/task.md

Applied packs:
- package-api (docs/plans/templates/packs/package-api.md)

Task source:
- type: user bug report / package API fix
- id / link: chat report, no tracker URL
- title: `ConvexAuthProvider` rejects Better Auth clients with organization and
  additional-field plugins
- acceptance criteria: a Better Auth React client using `convexClient()`,
  `inferAdditionalFields()`, `adminClient()`, `organizationClient()`, and
  `usernameClient()` is assignable to `ConvexAuthProvider` without app-side
  casts; existing provider runtime behavior stays intact; `kitcn` has a
  changeset and owning package proof.

Completion threshold:
- Type-level regression exists for the reported provider shape. Exact pasted
  error did not reproduce against this checkout before the fix, but the tests
  cover the plugin-rich Better Auth client and structural provider boundary.
- `packages/kitcn` owns the fix at the auth-client boundary instead of making
  app code cast.
- Focused regression, package build, final lint, `bun check`, autoreview,
  changeset, commit, PR, and plan completeness are closed or a blocker is
  recorded.
- Task closure is legal only when the source-of-truth acceptance criteria are
  satisfied or explicitly narrowed, required verification evidence is recorded,
  code-review and release-artifact gates are closed when applicable, verified
  code changes are committed and PR'd unless explicitly declined or blocked,
  task-style PR body sync is complete or marked N/A with reason,
  tracker/PR sync is complete or marked N/A with reason, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-06-15-fix-auth-client-provider-type.md` passes.

Verification surface:
- `bun test packages/kitcn/src/auth-client/convex-auth-provider.types.test.ts`
- `bun --cwd packages/kitcn build`
- `bun lint:fix`
- `bun check` before PR
- autoreview of the final diff
- `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-06-15-fix-auth-client-provider-type.md`

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

Boundaries:
- Source of truth: user-provided TypeScript error, local Better Auth typings,
  existing KitCN auth docs, and `docs/solutions` compatibility note.
- Allowed edit scope: `packages/kitcn/src/auth-client/**`,
  `packages/kitcn/src/solid/**` for the mirrored provider boundary, type tests,
  `.changeset/**`, and this plan.
- Browser surface: N/A, this is assignability-only package typing.
- Tracker sync: N/A, no issue/Linear source was provided.
- Non-goals: changing Better Auth runtime behavior, changing generated scaffold
  output, or adding app-side casts.

Output budget strategy:
- Use `rg`/`sed` with targeted paths and capped `max_output_tokens`; run focused
  tests before broad gates; summarize only failing diagnostics that matter.

Blocked condition:
- Blocked only if the reported client shape cannot be represented structurally
  without weakening provider calls to unusable types, or if required package
  gates fail for unrelated repo state that remains after one local-env retry.

Task state:
- task_type: bug fix / package type boundary
- task_complexity: small but public API sensitive
- current_phase: closeout
- current_phase_status: complete
- next_phase: final response
- goal_status: active

Current verdict:
- verdict: fixed, committed, pushed, and PR'd
- confidence: high
- next owner: reviewer / maintainer
- reason: provider prop now uses a structural runtime contract while exported
  full Better Auth client utility types keep plugin-specific APIs.

Completion rule:
- Do not call `update_goal(status: complete)` while any required checklist item
  remains unchecked. If an item does not apply, check it and add `N/A: <reason>`.
- Do not call `update_goal(status: complete)` until every completion threshold
  above is satisfied, final handoff evidence is recorded, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-06-15-fix-auth-client-provider-type.md` passes.
- Do not create hook state for this goal. This file plus the active goal are the
  durable state.

Start Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| Skill analysis before edits | yes | loaded `task`, `autogoal`, `tdd`, and `changeset` |
| Active goal checked or created | yes | active goal created for this task and linked to this plan |
| Source of truth read before edits | yes | user error, `types.ts`, provider source, Better Auth typings, auth org docs |
| Tracker comments and attachments read | N/A | no tracker source |
| Video transcript evidence required | N/A | no video/screen recording source |
| `docs/solutions` checked for non-trivial existing-code work | yes | read Better Auth 1.6 structural wrapper note |
| TDD decision before behavior change or bug fix | yes | add focused type regression before implementation |
| Branch decision for code-changing task | yes | defer branch check until verified closeout; no start-state git check per repo rule |
| Release artifact decision | yes | published package type behavior changes, add `.changeset` |
| Browser tool decision for browser surface | N/A | no browser-visible surface |
| Commit / PR expectation decision | yes | commit/push/PR required after final verification because `task` explicitly requires it |
| Task-style PR body decision | yes | use task-style PR body if PR is created |
| Tracker sync expectation decision | N/A | no tracker source |
| Output budget strategy recorded | yes | targeted reads/tests with capped output |
| Package/API pack selected | yes | public package type boundary |
| Public surface or package boundary identified | yes | `kitcn/auth/client` `AuthClient` provider prop type |
| Release artifact path selected | yes | `.changeset` |
| `changeset` skill loaded when `.changeset` is required | yes | loaded before code changes |
| Package build / fixture impact decision recorded | yes | run `bun --cwd packages/kitcn build`; fixtures N/A unless scaffold output changes |

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
- [x] Final handoff shape decided: bug/feature/testing/batch/review/tracker
      requirements, PR body sync, and issue/Linear sync when applicable.
- [x] Commit/PR handling recorded for code-changing work: commit and PR
      completed, no local patch, user explicitly declined, or blocker recorded.
      "User did not separately ask for a PR" is not a valid blocker.
- [x] PR body shape recorded: PR #270 emoji task-style body used, N/A reason
      recorded, or blocker recorded.
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
- [x] Package/API pack: package-owned typecheck/build/test proof is recorded or marked N/A with reason.
- [x] Package/API pack: `packages/kitcn` build, fixture sync/check, or other owning package proof is recorded when required.

Completion Gates:
| Gate | Applies | Required action | Evidence |
|------|---------|-----------------|----------|
| Named verification threshold | yes | Run the command, proof, source audit, or artifact check named in this plan | focused React/Solid type tests, `bun --cwd packages/kitcn build`, `bun lint:fix`, autoreview, and final `bun check` passed in `/Users/zbeyens/git/better-convex` |
| Bug reproduced before fix | N/A | Record failing test/repro or N/A with reason | exact pasted error did not reproduce against current checkout; initial source/dist fixtures accepted the simplified client, so regression covers reported plugin-rich shape and provider boundary instead |
| Targeted behavior verification | yes | Run focused test/proof for changed behavior or record N/A | `bun test packages/kitcn/src/auth-client/convex-auth-provider.types.test.ts`; `bunx vitest run packages/kitcn/src/solid/convex-auth-provider.types.vitest.ts --project solid` |
| TypeScript or typed config changed | yes | Run relevant typecheck | final `bun check` includes `turbo typecheck`; focused `ts.createProgram()` type tests passed |
| Package exports or file layout changed | yes | Run the relevant package build before final verification and keep generated updates | `bun --cwd packages/kitcn build` passed; final `bun check` rebuilt package during fixture/runtime gates |
| Package manifests, lockfile, or install graph changed | N/A | Run `bun install` and relevant package checks | no package manifests or lockfiles changed |
| Agent rules or skills changed | N/A | Run `bun install` and verify generated skill sync | no `.agents/**`, `.claude/**`, `.codex/**`, skill, hook, command, or prompt changes |
| Workspace authority proof | yes | Run verification in the owning repo/package/app/route/tool and record cwd; do not count the wrong workspace as proof | all proof ran from `/Users/zbeyens/git/better-convex`; package build ran with `--cwd packages/kitcn` |
| Browser surface changed | N/A | Capture Browser Use proof or record explicit waiver/blocker | type-only provider boundary; no rendered browser UI changed |
| Browser final proof | N/A | Attach screenshot or exact browser verification caveat when browser proof applies | no browser surface |
| Scaffold or fixture output changed | N/A | Run `bun run fixtures:sync` and `bun run fixtures:check`, or record N/A | no scaffold source changed; final `bun check` included fixture checks/runtime scenarios anyway |
| Package behavior or public API changed | yes | Add a changeset or record why no changeset applies | added `.changeset/fix-auth-provider-client-types.md` |
| Docs and kitcn skill sync changed | N/A | Keep `www/**` and `packages/kitcn/skills/kitcn/**` in sync, or record N/A | no docs or KitCN skill docs changed |
| Docs or content changed | N/A | For docs-heavy work, use `--template docs`; for incidental docs, verify source-backed claims, links, examples, and rendered output or record N/A | only plan and changeset text changed |
| High-risk mini gate | yes | For public API/runtime/package-boundary/browser/agent-action/command-contract changes, record realistic failure mode, proof plan, and why the chosen boundary is right; otherwise N/A | failure mode was over-wide provider clients missing `convex.token`; autoreview caught it and fix now requires typed `convex.token` on provider client while preserving full Better Auth plugin API types |
| Agent-native review for agent/tooling changes | N/A | For `.agents/**`, `.claude/**`, `.codex/**`, skills, hooks, commands, prompts, or user-action tooling, load `.agents/skills/agent-native-reviewer/SKILL.md` and close accepted/actionable findings, or record N/A | no agent/tooling files changed |
| Local install corruption suspected | N/A | Run `bun install` once, rerun the exact failing command, or record N/A | no local install corruption suspected |
| Autoreview for non-trivial implementation changes | yes | Load `.agents/skills/autoreview/SKILL.md`; use dirty local `--mode local`, branch/PR `--mode branch --base <base>`, or committed slice `--mode commit --commit <ref>` until no accepted/actionable findings, or record N/A for docs-only/trivial/no local patch | `.agents/skills/autoreview/scripts/autoreview --mode local` clean after two accepted fixes |
| Commit created | yes | For verified code-changing work, stage the entire current checkout per repo policy and create a commit; N/A only for no local patch, explicit user decline, analytical/blocked/inconclusive work, or recorded external blocker | branch commit created and amended with final plan/test state |
| PR create or update | yes | For verified code-changing work, run `check`, push, create or update the PR, and sync PR body to the task-style final handoff; N/A only for no local patch, explicit user decline, analytical/blocked/inconclusive work, or recorded external blocker | pushed `codex/fix-auth-provider-client-types`; opened PR https://github.com/udecode/kitcn/pull/285 after final `bun check` |
| Task-style PR body verified | yes | Verify the PR body with `gh pr view --json body`; it must preserve auto-release blocks when applicable, must not include a current-PR self-link, and must use the PR #270 emoji format: `🐛 Fixes ...`, `🟢 95-100% confidence`, `Phase / 🧪 Tests / 🌐 Browser` table, and bold emoji Outcome/Caveat/Design/Verified sections | `gh pr view 285 --json url,title,body,baseRefName,headRefName` showed auto-release block preserved and required task-style sections present |
| PR proof image hosting | N/A | If PR body needs browser proof, replace local image paths with hosted GitHub URLs or record N/A | no browser proof image needed |
| Tracker sync-back | N/A | Post concise issue/Linear sync after PR exists, or record N/A/blocker | no tracker source |
| Final handoff contract | yes | Fill the final handoff fields below with exact PR/issue/confidence/tests/browser/outcome/caveats/design/verification content or N/A reason | final handoff fields filled below |
| Final lint | yes | Run `bun lint:fix` or scoped equivalent | `bun lint:fix` passed with no fixes |
| Output budget discipline | yes | Verify no unbounded high-volume command output was streamed, or record the accidental output and recovery | broad commands used capped output; final `bun check` streamed long but required full gate |
| Goal plan complete | yes | Run `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-06-15-fix-auth-client-provider-type.md` | passed after final plan update |
| Public API / package boundary proof | yes | Source-audit public API, exports, and package boundary impact | `ConvexAuthProviderClient` exported for provider prop; `AuthClientWithPlugins` keeps Better Auth `createAuthClient<{ plugins }>` return type |
| Release artifact classification | yes | Record whether the change is published package behavior/API/types/config/runtime or no published user-visible delta | published package type/API behavior for `kitcn/auth/client` and `kitcn/solid` |
| Published package changeset | yes | If published package users see a delta, load `changeset` and add/update one `.changeset/*.md` per package | `.changeset/fix-auth-provider-client-types.md` |
| No release artifact | N/A | If no artifact is needed, record the exact reason: internal-only, docs-only, agent-only, test-only, or no user-visible delta from `main` | package-visible type change has changeset |
| Package typecheck/build/test | yes | Run owning package checks or record N/A with reason | `bun --cwd packages/kitcn build`, focused type tests, and final `bun check` passed |
| Fixture/scaffold generation | N/A | Run `bun run fixtures:sync` and `bun run fixtures:check` when scaffold output changed, otherwise N/A | no scaffold source changed; final `bun check` still covered fixtures/runtime |

Phase / pass table:
| Phase | Status | Evidence | Next |
|-------|--------|----------|------|
| Intake and source read | complete | read user error, Better Auth typings, provider code, auth docs, and `docs/solutions` note | implementation |
| Implementation | complete | provider prop split to structural client; full Better Auth utility types preserved | verification |
| Verification | complete | focused type tests, package build, lint, autoreview, final `bun check` passed | commit / PR |
| Commit / PR / tracker sync | complete | branch commit pushed, PR #285 opened and body verified; tracker N/A | final response |
| Closeout | complete | goal plan completed and checked | final response |

Findings:
- Exact pasted TypeScript error did not reproduce in this checkout, but the
  old provider prop type was still the wrong ownership boundary: it coupled
  provider assignability to Better Auth's plugin generic internals.
- The clean boundary is a provider-specific structural client type requiring
  the runtime surface the provider actually consumes, including `convex.token`.

Decisions and tradeoffs:
- Keep exported `AuthClientWithPlugins` / `AuthClient` as full Better Auth
  client return types, using `createAuthClient<{ plugins }>` so plugin APIs
  like `organization`, `admin`, `$Infer`, and `$fetch` remain typed.
- Use `ConvexAuthProviderClient` / `SolidAuthProviderClient` only for provider
  props. This fixes app assignment without making app code cast or erasing
  plugin-specific client APIs for consumers who use the exported utility types.
- Fix Solid in the same patch because it had the same generic boundary smell.

Implementation notes:
- React provider prop now accepts `ConvexAuthProviderClient`; Solid provider
  prop accepts `SolidAuthProviderClient`.
- `getSession` and session atom interaction stay locally cast at KitCN-owned
  call sites because Better Auth method parameter variance is not the provider
  contract.
- Type regressions cover plugin-rich Better Auth clients and structural
  provider clients that include the required Convex token action.

Review fixes:
- Accepted autoreview P2: initial structural type accepted clients without
  `convex.token`; fixed by requiring a typed promise-returning token action.
- Accepted autoreview P2: initial `AuthClientWithPlugins` erased plugin APIs;
  fixed by preserving full Better Auth return type and splitting provider-only
  structural client types.

Error attempts:
| Error / failed attempt | Count | Next different move | Resolution |
|------------------------|-------|---------------------|------------|
| None yet | 0 | | |

Verification evidence:
- `bun test packages/kitcn/src/auth-client/convex-auth-provider.types.test.ts`
  passed.
- `bunx vitest run packages/kitcn/src/solid/convex-auth-provider.types.vitest.ts --project solid`
  passed.
- `bun --cwd packages/kitcn build` passed.
- `bun lint:fix` passed with no fixes.
- `.agents/skills/autoreview/scripts/autoreview --mode local` final run was
  clean: no accepted/actionable findings.
- `bun check` passed, including typecheck, tests, fixture checks, verify, and
  runtime scenarios.

Final handoff contract:
- Commit line: `fix auth provider client typing` on PR branch
- PR line: https://github.com/udecode/kitcn/pull/285
- Issue / tracker line: N/A, chat-only bug report
- Confidence line: high; final `bun check` and autoreview passed
- Flow table:
  - Reproduced: exact pasted error N/A in current checkout; type regression covers reported plugin-rich client and provider boundary
  - Verified: focused React/Solid type tests, package build, lint, autoreview, full `bun check`; browser N/A
- Browser check: N/A, type-only package boundary
- Outcome: React and Solid providers accept plugin-rich Better Auth clients without app-side casts while full exported auth client utility types keep plugin APIs.
- Caveat: exact downstream error did not reproduce locally, so the fix is based on the package boundary root cause and regression coverage rather than a red copy of the pasted app error.
- Design:
  - Chosen boundary: provider-specific structural types (`ConvexAuthProviderClient`, `SolidAuthProviderClient`) plus corrected full Better Auth client utility generics.
  - Why not quick patch: app-side casts hide the framework type debt and still leave users with brittle provider props.
  - Why not broader change: no runtime auth behavior or scaffold output needed to change; public type split is enough.
- Verified: `bun test packages/kitcn/src/auth-client/convex-auth-provider.types.test.ts`; `bunx vitest run packages/kitcn/src/solid/convex-auth-provider.types.vitest.ts --project solid`; `bun --cwd packages/kitcn build`; `bun lint:fix`; autoreview clean; `bun check`.
- PR body verified: `gh pr view 285 --json url,title,body,baseRefName,headRefName`

Task-style PR body contract:
- Preserve any existing `<!-- auto-release:start -->` block. If a changeset is
  part of the diff and repo policy expects auto release, include that block.
- Use the accepted PR #270 visual format. The body starts with an emoji
  issue/tracker/fix line, for example `🐛 Fixes #123` or `🐛 Fixes ➖ N/A`, then
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
- Commit: `fix auth provider client typing` on PR branch
- PR: https://github.com/udecode/kitcn/pull/285
- Issue / tracker: N/A, chat-only bug report
- Browser proof: N/A, type-only package boundary
- Caveats: exact pasted downstream error did not reproduce locally; regression
  covers the reported plugin-rich client shape and provider contract.

Timeline:
- 2026-06-15T07:52:43.258Z Task goal plan created.

Reboot status:
| Question | Answer |
|----------|--------|
| Where am I? | Closeout complete; final plan check and final response remain. |
| Where am I going? | Amend the final plan update into the commit, force-push, mark the active goal complete, then hand off. |
| What is the goal? | Fix `ConvexAuthProvider` / Solid auth provider client typing for plugin-rich Better Auth clients without app-side casts. |
| What have I learned? | The provider prop needed a structural runtime contract, while exported auth client utility types must preserve full Better Auth plugin APIs. |
| What have I done? | Added provider-specific structural types, fixed Better Auth client generics, added React/Solid type regressions, added a changeset, ran verification, committed, pushed, and opened PR #285. |

Open risks:
- None.

Hard closeout guard:
- A local-only final response for verified code-changing work is invalid unless
  this plan records an explicit user decline, no local patch, analytical/
  blocked/inconclusive outcome, or a real commit/PR blocker.
