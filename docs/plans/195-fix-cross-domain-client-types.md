# fix cross domain client types

Objective:
Fix crossDomainClient Better Auth 1.6.x type compatibility; done when repro typecheck and target checks pass; plan docs/plans/195-fix-cross-domain-client-types.md.

Goal plan:
docs/plans/195-fix-cross-domain-client-types.md

Template:
docs/plans/templates/task.md

Primary template:
docs/plans/templates/task.md

Applied packs:
- package-api (docs/plans/templates/packs/package-api.md)

Task source:
- type: GitHub issue plus user transcript
- id / link: https://github.com/get-convex/better-auth/issues/195 and https://github.com/better-auth/better-auth/issues/10077
- title: crossDomainClient() type incompatibility with current Better Auth client plugin types
- acceptance criteria: `crossDomainClient()` composes with `createAuthClient({ plugins: [convexClient(), crossDomainClient(), adminClient()] })` on current supported Better Auth 1.6.x without a cast, `getCookie` remains inferred, and package checks pass in `/Users/zbeyens/git/convex-better-auth`.

Completion threshold:
- Focused type repro fails before the fix and passes after the fix in `/Users/zbeyens/git/convex-better-auth`.
- Relevant package test/typecheck/build/lint commands pass in `/Users/zbeyens/git/convex-better-auth`, or any skipped gate has a concrete blocker.
- Fix is committed, pushed to the fork, and a PR is opened or updated unless blocked.
- Task closure is legal only when the source-of-truth acceptance criteria are
  satisfied or explicitly narrowed, required verification evidence is recorded,
  code-review and release-artifact gates are closed when applicable, verified
  code changes are committed and PR'd unless explicitly declined or blocked,
  task-style PR body sync is complete or marked N/A with reason,
  tracker/PR sync is complete or marked N/A with reason, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/195-fix-cross-domain-client-types.md` passes.

Verification surface:
- Type regression test covering `crossDomainClient()` with current Better Auth plugin composition.
- Package `npm run test`, `npm run typecheck`, `npm run build`, and `npm run lint` as applicable.
- Source audit of `src/plugins/cross-domain/client.ts` and public `client/plugins` export behavior.

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
- Source of truth: user transcript, `better-auth/better-auth#10077`, and `get-convex/better-auth#195`.
- Allowed edit scope: `/Users/zbeyens/git/convex-better-auth`, focused on client plugin types/tests and minimal package metadata if required.
- Browser surface: N/A: TypeScript assignability and inference bug.
- Tracker sync: Post concise issue comment after PR if the fix reaches PR.
- Non-goals: Do not claim to fix Better Auth's broader createAuthClient OOM/type explosion; do not patch kitcn for a bug owned by `@convex-dev/better-auth`.

Output budget strategy:
- Use focused `rg`, `sed -n`, `git show`, and targeted test output. Exclude `node_modules`, `dist`, generated Convex output, docs package locks, and broad dependency logs unless a command failure requires a slice.

Blocked condition:
- Stop if the issue cannot be reproduced on current upstream main with supported Better Auth 1.6.x, if package install is corrupt after one reinstall retry, or if GitHub push/PR permissions fail.

Task state:
- task_type: package type compatibility bug
- task_complexity: non-trivial measurable
- current_phase: publish
- current_phase_status: verified locally; commit/PR/tracker sync outstanding
- next_phase: commit, push, PR, issue sync
- goal_status: ready for autogoal completion after mechanical close check

Current verdict:
- verdict: valid
- confidence: high
- next owner: task
- reason: the published 0.12.3 tarball reproduced the Better Auth 1.6.18 client-plugin assignability failure before the patch and passed after the patch.

Pre-solution issue challenge:
- reporter claim: `crossDomainClient()` from `@convex-dev/better-auth` is not assignable to Better Auth's `BetterAuthClientPlugin` in supported Better Auth versions, causing downstream app type errors and losing inferred actions such as `getCookie`.
- suggested diagnosis or fix: stale/over-specific client plugin type, not a kitcn OOM workaround.
- repro ladder:
  - tests / source-level repro: reproduced in `/tmp/convex-ba-repro-j7CbNK` using local package tarball, `better-auth@1.6.18`, `typescript@5.9.3`, and `createAuthClient({ plugins: [convexClient(), crossDomainClient({ storage }), adminClient()] })`.
  - repo-owned automated browser or integration proof: N/A: compile-time plugin contract.
  - Browser plugin: N/A: no UI/browser behavior.
  - screenshot / visual proof: N/A: no visual state.
- reproduction verdict: valid
- validity verdict: valid; patch owned by `@convex-dev/better-auth`, not kitcn.
- best long-term fix boundary: `src/plugins/cross-domain/client.ts` return type, so generated declarations follow current Better Auth client plugin types while preserving concrete cross-domain action inference.
- harsh honest feedback: This is not an OOM fix. It removes a real type incompatibility that blocked latest-stack testing.
- hard-stop decision: Patch proceeded only after the failing latest-stack repro was captured.

Completion rule:
- Do not call `update_goal(status: complete)` until commit/PR/tracker sync is done, final handoff evidence is recorded, and `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/195-fix-cross-domain-client-types.md` passes.

Start Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| Skill analysis before edits | yes | Read `kitcn:task` and `kitcn:autogoal` before implementation; loaded `kitcn:autoreview` before closeout. |
| Active goal checked or created | yes | Created active goal `019ec254-910c-7dc2-ae32-6b0e87056091`; later `get_goal` confirmed it active. |
| Source of truth read before edits | yes | Read user transcript, `better-auth/better-auth#10077`, and `get-convex/better-auth#195`. |
| Tracker comments and attachments read | yes | `gh issue view https://github.com/get-convex/better-auth/issues/195 --comments`; no attachments. |
| Video transcript evidence required | no | N/A: no video/screen recording evidence. |
| Pre-solution issue challenge required | yes | Public bug claim challenged with a focused TypeScript repro before fixing. |
| Reproduction verdict before implementation | yes | Failing repro captured with `better-auth@1.6.18`: `crossDomainClient()` rejected as `BetterAuthClientPlugin`; `getCookie` missing. |
| Repro escalation ladder selected | yes | Source-level TypeScript fixture first; browser and visual proof N/A because this is compile-time typing. |
| Suggested fix reviewed against durable boundary | yes | Owner is `@convex-dev/better-auth` client plugin type, not kitcn templates. |
| `docs/solutions` checked for non-trivial existing-code work | no | N/A: target repo has no `docs/solutions` lane; issue source plus local source were sufficient. |
| TDD decision before behavior change or bug fix | yes | Added `src/plugins/cross-domain/client.types.test.ts` type regression before finishing the source fix. |
| Branch decision for code-changing task | yes | Fast-forwarded local clone to `origin/main`; created `codex/fix-cross-domain-client-types`. |
| Release artifact decision | yes | Target repo uses changelog/version release flow, not Changesets; no version/changelog entry for unreleased PR patch. |
| Browser tool decision for browser surface | no | N/A: compile-time package bug. |
| Commit / PR expectation decision | yes | Commit/push/PR required by task skill after verified code-changing work; still in closeout. |
| Task-style PR body decision | yes | Use concise task-style body if GitHub accepts PR creation. |
| Tracker sync expectation decision | yes | Sync back to #195 after PR if permissions allow. |
| Output budget strategy recorded | yes | Focused reads/searches; large generated/package output avoided except npm pack listing. |
| Package/API pack selected | yes | `package-api` pack applied because exported package client plugin types are touched. |
| Public surface or package boundary identified | yes | `@convex-dev/better-auth/client/plugins` exported `crossDomainClient()` type. |
| Release artifact path selected | yes | No `.changeset`; version script edits changelog during release, not PR patch. |
| `changeset` skill loaded when `.changeset` is required | no | N/A: target repo has no Changesets setup. |
| Package build / fixture impact decision recorded | yes | Run package build/typecheck/test/lint; fixtures N/A because no scaffold/generated output changed. |

Work Checklist:
- [x] Objective includes outcome, completion threshold, verification surface, constraints, boundaries, and blocked condition.
- [x] Task source classified with source type, id/link, title, task type, acceptance criteria, caveats, likely files/routes/packages, browser surface, and root-cause layer.
- [x] Required video or screen-recording evidence is cached/read as normalized `<video-transcripts>` XML, or marked N/A with reason.
- [x] Public tracker bug claim challenged before implementation with verdict `valid`.
- [x] Repro escalation ladder followed: focused TypeScript repro first; browser/visual proof marked N/A.
- [x] Hard-stop rule followed: implementation happened only after reproduction succeeded.
- [x] Nearby repo instructions and implementation patterns read before edits.
- [x] Implementation fixes the right ownership boundary in `crossDomainClient()` return typing.
- [x] Release artifact requirement recorded: no Changesets; no version/changelog entry for unreleased PR patch.
- [x] Final handoff shape decided: PR body, issue sync, tests, caveat, and confidence.
- [x] Commit/PR handling recorded: verified code-changing task requires commit, push, and PR unless GitHub blocks it.
- [x] PR body shape recorded: task-style body selected.
- [x] Branch handling recorded: dedicated branch `codex/fix-cross-domain-client-types`.
- [x] Local-env-rot retry policy recorded: npm Arborist crash in example installs resolved with one `--legacy-peer-deps` retry.
- [x] Workspace authority recorded: proof commands run in `/Users/zbeyens/git/convex-better-auth` and `/tmp/convex-ba-repro-j7CbNK`.
- [x] Output budget discipline recorded and followed with scoped reads and capped command output.
- [x] High-risk note recorded: package boundary type declaration fix; realistic failure mode was losing action/server-plugin inference.
- [x] Review/autoreview target selected from dirty local diff; autoreview clean.
- [x] Agent-native review decision recorded: N/A, no `.agents/**`, `.claude/**`, `.codex/**`, skills, hooks, commands, prompts, or user-action tooling changed.
- [x] Package/API pack: public API, package boundary, export, and release-artifact impact are recorded.
- [x] Package/API pack: release artifact matrix applied with explicit no-artifact reason.
- [x] Package/API pack: `.changeset` work N/A because target repo has no `.changeset` setup.
- [x] Package/API pack: no-artifact decision recorded: source type fix for next patch release, release changelog handled by version script.
- [x] Package/API pack: compatibility decision explicit: preserve current public API, repair Better Auth 1.6.x assignability.
- [x] Package/API pack: package-owned typecheck/build/test proof recorded.
- [x] Package/API pack: `packages/kitcn` build/fixture proof N/A because this patch is in sibling `convex-better-auth`.

Completion Gates:
| Gate | Applies | Required action | Evidence |
|------|---------|-----------------|----------|
| Named verification threshold | yes | Repro plus target package checks | `npm run build`, `npm run test`, `npm run lint`, `npm run typecheck`, and `/tmp` tarball repro recorded below. |
| Pre-solution issue challenge verdict | yes | Record claim and durable boundary | Verdict valid; fix belongs in `@convex-dev/better-auth` client plugin return type. |
| Repro escalation ladder | yes | Record source/browser/visual outcomes | Source-level repro used; browser and screenshot N/A because compile-time type surface. |
| Bug reproduced before fix | yes | Capture failing test/repro | `/tmp/convex-ba-repro-j7CbNK npm run typecheck` failed before patch with `TS2322` and `TS2339`. |
| Targeted behavior verification | yes | Run focused proof | Repacked tarball passed `/tmp/convex-ba-repro-j7CbNK npm run typecheck` with `better-auth@1.6.18`. |
| TypeScript or typed config changed | yes | Run relevant typecheck | `/Users/zbeyens/git/convex-better-auth npm run typecheck` passed after example deps installed. |
| Package exports or file layout changed | yes | Run package build | `/Users/zbeyens/git/convex-better-auth npm run build` passed. |
| Package manifests, lockfile, or install graph changed | no | Install graph unchanged | N/A: no committed manifest or lockfile changes; example installs used `--no-package-lock`. |
| Agent rules or skills changed | no | N/A | No agent/rules/skills files changed in target patch. |
| Workspace authority proof | yes | Run proof in owning repo | All package gates in `/Users/zbeyens/git/convex-better-auth`; latest-stack repro in `/tmp/convex-ba-repro-j7CbNK`. |
| Browser surface changed | no | N/A | Type-only compile surface; no UI behavior. |
| Browser final proof | no | N/A | Type-only compile surface; no browser proof needed. |
| Scaffold or fixture output changed | no | N/A | No scaffold or fixture output touched. |
| Package behavior or public API changed | yes | Record release artifact decision | Public type surface fixed; no manual changelog/version entry because repo release script owns changelog. |
| Docs and kitcn skill sync changed | no | N/A | No better-convex docs or kitcn skills changed as part of target patch. |
| Docs or content changed | no | N/A | No user-facing docs changed. |
| High-risk mini gate | yes | Record failure mode and boundary | Failure mode was widening away `$InferServerPlugin` or actions; fix preserves both with explicit `CrossDomainClientPlugin`. |
| Agent-native review for agent/tooling changes | no | N/A | No agent/tooling files changed. |
| Local install corruption suspected | yes | Retry once | Example app npm install crashed in Arborist; `--legacy-peer-deps --no-package-lock` retry succeeded and root typecheck passed. |
| Autoreview for non-trivial implementation changes | yes | Run helper | `/Users/zbeyens/git/better-convex/.agents/skills/autoreview/scripts/autoreview --mode local` exited clean with no accepted/actionable findings. |
| Commit created | yes | Commit after final staging | Commit `318646f3ed4b34773a5200ae151f9f4b59ffdf6b` on `codex/fix-cross-domain-client-types`. |
| PR create or update | yes | Push branch and create PR | PR https://github.com/get-convex/better-auth/pull/391 created from `zbeyens:codex/fix-cross-domain-client-types` to `main`. |
| Task-style PR body verified | yes | Verify body with `gh pr view --json body` | `gh pr view 391 --repo get-convex/better-auth --json body,url,headRefName,baseRefName` confirmed task-style body. |
| PR proof image hosting | no | N/A | No browser image proof. |
| Tracker sync-back | yes | Comment on #195 after PR | Issue comment https://github.com/get-convex/better-auth/issues/195#issuecomment-4711604469 posted. |
| Final handoff contract | yes | Fill final fields | PR URL, issue comment, confidence, tests, browser N/A, outcome, caveat, design, and verification recorded below. |
| Final lint | yes | Run package lint | `/Users/zbeyens/git/convex-better-auth npm run lint` passed with existing React hook warnings only. |
| Output budget discipline | yes | Verify bounded output | Mostly bounded; npm pack emitted a long package listing but no unbounded scans. |
| Goal plan complete | yes | Run autogoal checker | To run after PR/tracker sync. |
| Public API / package boundary proof | yes | Source-audit public API | `crossDomainClient()` still exports same runtime API; declaration now imports `BetterAuthClientPlugin` from `better-auth/client` and preserves `$InferServerPlugin` plus actions. |
| Release artifact classification | yes | Classify delta | Published package type-surface bug fix; no manual release artifact in this repo flow. |
| Published package changeset | no | N/A | Target repo has no Changesets setup. |
| No release artifact | yes | Record exact reason | Release changelog/version entries are created by `npm version` script, not PR patch; no docs/manifest change needed. |
| Package typecheck/build/test | yes | Run owning package checks | Build, test, typecheck, lint passed. |
| Fixture/scaffold generation | no | N/A | No generated scaffold/fixture output changed. |

Phase / pass table:
| Phase | Status | Evidence | Next |
|-------|--------|----------|------|
| Intake and source read | done | Read issue/user sources and created plan | implementation |
| Implementation | done | Patched `src/plugins/cross-domain/client.ts`; added type regression test | verification |
| Verification | done | Repro and package gates passed; autoreview clean | publish |
| Commit / PR / tracker sync | done | Commit `318646f3`, pushed branch, opened PR #391, commented on issue #195 | final response |
| Closeout | done | PR checks inspected: Vercel requires deploy authorization; CodeRabbit review in progress | final response |

Findings:
- `convex-better-auth` local clone was stale at 0.11.4; fast-forwarded to upstream `main` with 0.12.3 and Better Auth 1.6.x peer range before reproducing.
- Before fix, packed `@convex-dev/better-auth@0.12.3` plus `better-auth@1.6.18` failed TypeScript with `crossDomainClient()` not assignable to `BetterAuthClientPlugin` and `authClient.getCookie` missing.
- After fix, the same tarball repro typechecked in 0.42s using 210459K reported TypeScript memory.
- `get-convex/better-auth#195` matches the `crossDomainClient()` assignability bug. Upstream comments say older Better Auth 1.4.7 was outside peer range, but the user transcript reports the same shape on 1.6.18 inside the current peer range.

Decisions and tradeoffs:
- Keep the fix in `convex-better-auth`: KitCN should not cast around a stale third-party plugin type.
- Do not claim OOM fixed: Better Auth's broader type explosion remains upstream; this task covers the earlier compatibility failure that blocks latest-stack testing.

Implementation notes:
- Changed `crossDomainClient()` to import the current client plugin contract from `better-auth/client`.
- Added `CrossDomainClientPlugin` so emitted declarations use current `getActions` parameters while preserving `$InferServerPlugin: ReturnType<typeof crossDomain>` and concrete actions `getCookie`, `updateSession`, and `getSessionData`.
- Added `src/plugins/cross-domain/client.types.test.ts` to prove composition with `convexClient()`, `crossDomainClient({ storage })`, and `adminClient()`.
- Updated cross-domain unit test helper calls to Better Auth's current three-argument `getActions` shape.

Review fixes:
- None. Autoreview reported no accepted/actionable findings.

Error attempts:
| Error / failed attempt | Count | Next different move | Resolution |
|------------------------|-------|---------------------|------------|
| Root `npm run typecheck` initially stopped in `src/plugins/cross-domain/client.test.ts` after the production type fix | 1 | Update test helpers to current Better Auth `getActions` arity and optional `fetchPlugins` typing | Fixed and reran checks. |
| Example app installs crashed in npm Arborist with `Cannot read properties of null (reading 'matches')` | 1 | Retry example installs with `--legacy-peer-deps --no-package-lock` | Retry succeeded; root typecheck passed. |

Verification evidence:
- `/tmp/convex-ba-repro-j7CbNK npm run typecheck` before patch: failed with `TS2322` for `crossDomainClient()` not assignable to `BetterAuthClientPlugin` and `TS2339` for missing `getCookie`.
- `/Users/zbeyens/git/convex-better-auth npm run build`: passed.
- `/Users/zbeyens/git/convex-better-auth npx vitest run --typecheck src/plugins/cross-domain/client.types.test.ts src/plugins/cross-domain/client.test.ts`: passed, 2 files, 26 tests, no type errors.
- `/tmp/convex-ba-repro-j7CbNK npm run typecheck` after patch with repacked tarball, `better-auth@1.6.18`, `typescript@5.9.3`: passed; 70880 instantiations, 210459K memory, 0.42s total.
- `/Users/zbeyens/git/convex-better-auth npm run test`: passed, 9 files, 181 passed, 31 skipped, no type errors.
- `/Users/zbeyens/git/convex-better-auth npm run lint`: passed with existing React hook warnings in `src/react/index.tsx`.
- `/Users/zbeyens/git/convex-better-auth npm run typecheck`: passed after installing example app deps with `--no-package-lock` and retrying npm Arborist crashes with `--legacy-peer-deps`.
- `/Users/zbeyens/git/better-convex/.agents/skills/autoreview/scripts/autoreview --mode local` from `/Users/zbeyens/git/convex-better-auth`: clean, no accepted/actionable findings.

Final handoff contract:
- Commit line: `318646f3ed4b34773a5200ae151f9f4b59ffdf6b` on `codex/fix-cross-domain-client-types`.
- PR line: https://github.com/get-convex/better-auth/pull/391.
- Issue / tracker line: https://github.com/get-convex/better-auth/issues/195#issuecomment-4711604469.
- Confidence line: high; latest-stack repro and package gates passed.
- Flow table:
  - Reproduced: tests failed before patch, browser N/A.
  - Verified: tests passed after patch, browser N/A.
- Browser check: N/A: compile-time type bug.
- Outcome: `crossDomainClient()` composes with Better Auth 1.6.18 client plugins and `getCookie` inference is retained.
- Caveat: This does not fix Better Auth's broader `createAuthClient()` type explosion/OOM class.
- Design:
  - Chosen boundary: `crossDomainClient()` exported return type.
  - Why not quick patch: caller casts would keep the package peer range lying.
  - Why not broader change: no runtime API or kitcn template change needed.
- Verified: package gates plus 1.6.18 tarball repro.
- PR body verified: `gh pr view 391 --repo get-convex/better-auth --json body,url,headRefName,baseRefName`.

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
- Commit: `318646f3ed4b34773a5200ae151f9f4b59ffdf6b`.
- PR: https://github.com/get-convex/better-auth/pull/391.
- Issue / tracker: https://github.com/get-convex/better-auth/issues/195#issuecomment-4711604469.
- Browser proof: N/A.
- Caveats: not an OOM fix; broader Better Auth type explosion remains upstream.
- External checks: `gh pr checks 391 --repo get-convex/better-auth` reported Vercel failing because deployment authorization is required and CodeRabbit review in progress.

Timeline:
- 2026-06-15T19:10:32.363Z Task goal plan created.

Reboot status:
| Question | Answer |
|----------|--------|
| Where am I? | Verified local patch; publishing branch/PR next |
| Where am I going? | Commit, push, create PR, sync issue #195, run autogoal close check |
| What is the goal? | Fix `crossDomainClient()` Better Auth 1.6.x type compatibility without claiming an OOM fix |
| What have I learned? | The issue is valid against Better Auth 1.6.18; preserving `$InferServerPlugin` is necessary to keep `authClient.crossDomain` typed |
| What have I done? | Added type regression, patched return type, reran package gates and autoreview |

Open risks:
- Low residual risk: this is a type declaration boundary change; runtime object shape is unchanged. Broader Better Auth inferred-client type complexity remains outside this patch.

Hard closeout guard:
- A local-only final response for verified code-changing work is invalid unless
  this plan records an explicit user decline, no local patch, analytical/
  blocked/inconclusive outcome, or a real commit/PR blocker.
