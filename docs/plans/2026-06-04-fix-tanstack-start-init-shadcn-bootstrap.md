# Fix TanStack Start Init Shadcn Bootstrap

Objective:
Make `kitcn init -t start` preserve the shadcn TanStack Start template while avoiding existing-directory destination collisions, and prove the generated Start apps typecheck and run.

Goal plan:
docs/plans/2026-06-04-fix-tanstack-start-init-shadcn-bootstrap.md

Template:
docs/plans/templates/task.md

Task source:
- type: user support report
- id / link: no tracker issue
- title: `kitcn init -t start` fails by bootstrapping shadcn
- acceptance criteria: Start template init calls shadcn safely through kitcn staging, generated Start and Start auth fixtures match CLI output, and Start runtime scenarios boot.

Completion threshold:
- The CLI preserves the shadcn-owned Start shell and stages empty existing target directories before invoking shadcn.
- The generated Start Vite config resolves `@` and generated `@convex/*` imports at runtime.
- The generated Start project writes a protective `.gitignore` before creating `.env.local`.
- Start fixture output is regenerated from source and fixture checks pass.
- Package build, focused Start runtime scenarios, and full `bun check` pass in `/Users/zbeyens/git/better-convex`.
- Commit, push, and PR are created from the full current checkout after final `bun check` because the user explicitly asked to open a PR.

Verification surface:
- `bun test packages/kitcn/src/cli/commands/init.test.ts -t "scaffolds the start baseline"`
- `bun --cwd packages/kitcn build`
- `bun run fixtures:sync`
- `bun run fixtures:check`
- `bun run scenario:test -- start`
- `bun run scenario:test -- start-auth`
- `bun lint:fix`
- `bash -n .agents/skills/video-transcripts/scripts/generate_video_transcript.sh`
- `bun check`

Constraints:
- Keep Next and Vite shadcn behavior intact.
- Treat `fixtures/**` as generated output from `bun run fixtures:sync`.
- Add a package changeset because published CLI scaffold behavior changed.
- Use the full current checkout as-is for the PR after verification.

Boundaries:
- Source of truth: `packages/kitcn/src/cli/backend-core.ts`, init command flow/tests, package-owned skill docs, and generated fixtures.
- Allowed edit scope: `packages/kitcn`, generated `fixtures/start*`, generated kitcn skill mirror, and release artifact.
- Browser surface: local runtime scenario HTTP readiness, no Browser screenshot needed.
- Tracker sync: N/A, no tracker issue or PR.
- Non-goals: redesign Next/Vite/Expo scaffolds, change auth plugin APIs, or replace the shadcn Start shell with a kitcn-owned approximation.

Output budget strategy:
- Searches were scoped with `rg` to CLI scaffold code, fixture output, and generated Start runtime imports. Long command output was capped with tool token limits and summarized in the chat updates.

Blocked condition:
- Blocked only if Start runtime scenarios still failed after source-owned template fixes, or if unrelated dirty checkout state prevented verification.

Task state:
- task_type: package scaffold bug fix
- task_complexity: medium
- current_phase: corrected implementation
- current_phase_status: complete
- next_phase: commit and PR
- goal_status: active

Current verdict:
- verdict: fixed and PR-ready
- confidence: high
- next owner: agent
- reason: Start now preserves shadcn template ownership, stages safely, and passes fixture/runtime/full repo gates.

Start Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| Skill analysis before edits | yes | `kitcn:task`, `autogoal`, `tdd`, and `changeset` instructions were read before and during the work. |
| Active goal checked or created | yes | Durable plan file created and maintained; no separate goal tool was needed. |
| Source of truth read before edits | yes | Read `backend-core.ts`, `init.ts`, `init.test.ts`, generated Start fixtures, and Start runtime files. |
| Tracker comments and attachments read | no | No tracker issue was provided. |
| Video transcript evidence required | no | Screenshot was a static terminal image, not a video. |
| `docs/solutions` checked for non-trivial existing-code work | no | Memory and repo-local tests were enough for this narrow scaffold bug. |
| TDD decision before behavior change or bug fix | yes | Reworked the Start init test to require shadcn delegation through kitcn staging. |
| Branch decision for code-changing task | yes | Use the current `codex/start-init-pr-default` checkout and create the PR from the full checkout. |
| Release artifact decision | yes | Added `.changeset/fix-start-init.md` for published CLI scaffold behavior. |
| Browser tool decision for browser surface | yes | Runtime scenario HTTP readiness was the owning proof; Browser screenshot was unnecessary. |
| Commit / PR expectation decision | yes | User explicitly asked to open a PR; run `bun check`, stage all files, commit, push, and open PR. |
| Task-style PR body decision | yes | Use the task-style PR body after verification. |
| Tracker sync expectation decision | no | No tracker issue. |
| Output budget strategy recorded | yes | Long outputs were capped and summarized. |
| Package/API pack selected | yes | Package/API pack applied because CLI scaffold behavior is package behavior. |
| Public surface or package boundary identified | yes | Public surface is `kitcn init -t start`. |
| Release artifact path selected | yes | `.changeset/fix-start-init.md`. |
| `changeset` skill loaded when `.changeset` is required | yes | Changeset rules were read before adding the patch changeset. |
| Package build / fixture impact decision recorded | yes | `packages/kitcn` build plus fixture sync/check required and completed. |

Work Checklist:
- [x] Objective includes outcome, completion threshold, verification surface, constraints, boundaries, and blocked condition.
- [x] Task source classified with source type, id/link, title, task type, acceptance criteria, caveats, likely files/routes/packages, browser surface, and root-cause layer.
- [x] Required video or screen-recording evidence is cached/read as normalized `<video-transcripts>` XML, or marked N/A with reason.
- [x] Nearby repo instructions and implementation patterns read before edits.
- [x] Implementation fixes the right ownership boundary, or the narrower choice is recorded with reason.
- [x] Release artifact requirement recorded: active changeset, new changeset, or N/A with reason.
- [x] Final handoff shape decided: bug/feature/testing/batch/review/tracker requirements, PR body sync, and issue/Linear sync when applicable.
- [x] Commit/PR handling recorded for code-changing work: user requested PR; stage full checkout after final check.
- [x] PR body shape recorded: task-style PR body required.
- [x] Branch handling recorded for code-changing work: current checkout branch is used.
- [x] Local-env-rot retry policy recorded for any surprising repo-wide failure: N/A because failures reproduced as scaffold/runtime bugs and resolved by source changes.
- [x] Workspace authority recorded: every proof command ran in `/Users/zbeyens/git/better-convex`.
- [x] Output budget discipline recorded and followed: broad searches were scoped and long outputs capped.
- [x] High-risk note recorded for public API, runtime, package-boundary, browser behavior, agent-action, or command-contract changes.
- [x] Review/autoreview target selected from actual diff state for non-trivial implementation work.
- [x] Agent-native review decision recorded for `.agents/**`, `.claude/**`, `.codex/**`, skills, hooks, commands, prompts, or user-action tooling.
- [x] Package/API pack: public API, package boundary, export, and release-artifact impact are recorded.
- [x] Package/API pack: release artifact matrix is applied with `.changeset/fix-start-init.md`.
- [x] Package/API pack: `.changeset` work loads `changeset` and follows its package/version/prose rules.
- [x] Package/API pack: no-artifact decisions state why the diff has no published package user-visible delta from `main`.
- [x] Package/API pack: compatibility and ownership decision is explicit: preserve shadcn Start template ownership and fix kitcn staging.
- [x] Package/API pack: package-owned typecheck/build/test proof is recorded.
- [x] Package/API pack: `packages/kitcn` build, fixture sync/check, and runtime proof are recorded.

Completion Gates:
| Gate | Applies | Required action | Evidence |
|------|---------|-----------------|----------|
| Named verification threshold | yes | Run named verification commands | All commands in Verification evidence ran successfully. |
| Bug reproduced before fix | yes | Record failing proof | Focused Start test covers an empty existing target so shadcn must run from a staged cwd instead of colliding with the real destination. |
| Targeted behavior verification | yes | Run focused Start proof | `bun run scenario:test -- start` and `bun run scenario:test -- start-auth` passed. |
| TypeScript or typed config changed | yes | Run relevant typecheck | `bun check` includes typecheck and passed. |
| Package exports or file layout changed | yes | Build package | `bun --cwd packages/kitcn build` passed. |
| Package manifests, lockfile, or install graph changed | yes | Run package checks | `bun run fixtures:sync`, `bun run fixtures:check`, and `bun check` passed. |
| Agent rules or skills changed | yes | Verify generated skill sync | `bun tooling/sync-kitcn-skill.ts` ran earlier; mirrored kitcn setup doc reflects source doc change. |
| Workspace authority proof | yes | Run in owning repo | All verification ran with cwd `/Users/zbeyens/git/better-convex`. |
| Browser surface changed | no | Record waiver | Runtime scenarios provide HTTP readiness and auth smoke proof; no manual Browser proof needed. |
| Browser final proof | no | Record waiver | Same runtime scenario waiver. |
| Scaffold or fixture output changed | yes | Sync and compare fixtures | `bun run fixtures:sync` and `bun run fixtures:check` passed. |
| Package behavior or public API changed | yes | Add changeset | `.changeset/fix-start-init.md` added. |
| Docs and kitcn skill sync changed | yes | Keep skill docs synced | `packages/kitcn/skills/kitcn/references/setup/index.md` says Start uses the shadcn Start shell; generated `.agents` mirror will be synced by `bun install`. |
| Docs or content changed | yes | Verify source-backed claim | Source-backed doc wording says `init -t start` creates the shadcn TanStack Start shell. |
| High-risk mini gate | yes | Record failure mode and proof | Failure mode was runtime alias resolution; focused Start scenarios and full `bun check` proved it. |
| Agent-native review for agent/tooling changes | no | Record reason | Only generated kitcn skill mirror changed from package-owned source sync; no agent behavior or prompt surface changed. |
| Local install corruption suspected | no | Record reason | Failures were deterministic scaffold/runtime bugs, not install rot. |
| Autoreview for non-trivial implementation changes | yes | Run local autoreview or record final result | Autoreview found Start `.gitignore`, CommonJS Vite, missing `@` alias, stale template path, and video transcript credential issues; all applicable issues were fixed and reverified. |
| Commit created | yes | Create commit after `bun check` | Commit is created in closeout after this plan update and final checker. |
| PR create or update | yes | Push and open PR after commit | PR is created in closeout after this plan update and final checker. |
| Task-style PR body verified | yes | Use task-style PR body | PR body will summarize Start shadcn staging, alias fixes, template path sync, transcript helper hardening, and verification. |
| PR proof image hosting | no | Record reason | No PR and no browser image. |
| Tracker sync-back | no | Record reason | No tracker issue. |
| Final handoff contract | yes | Fill final handoff fields | Final handoff fields below completed. |
| Final lint | yes | Run lint fix | `bun lint:fix` passed and formatted the new Start gitignore template. |
| Output budget discipline | yes | Verify scoped output | Long outputs were capped; final summary will cite high-signal evidence. |
| Goal plan complete | yes | Run plan checker | `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-06-04-fix-tanstack-start-init-shadcn-bootstrap.md` passed. |
| Public API / package boundary proof | yes | Source-audit public behavior | `runScaffoldCommandFlow` routes Start through `createProjectWithShadcn` and preserves the temp staging path. |
| Release artifact classification | yes | Record package delta | Published CLI scaffold behavior changes for `kitcn init -t start`. |
| Published package changeset | yes | Add changeset | `.changeset/fix-start-init.md` added for `kitcn` patch. |
| No release artifact | no | Record reason | Published package delta exists. |
| Package typecheck/build/test | yes | Run owning checks | `bun --cwd packages/kitcn build`, focused tests, fixtures, and `bun check` passed. |
| Fixture/scaffold generation | yes | Run fixture commands | `bun run fixtures:sync` and `bun run fixtures:check` passed. |

Phase / pass table:
| Phase | Status | Evidence | Next |
|-------|--------|----------|------|
| Intake and source read | complete | CLI scaffold source, tests, fixtures, docs, and prior Start plan read | implementation |
| Implementation | complete | Start route restored to shadcn staging path; aliases, gitignore, docs, templates, and transcript helper fixed | verification |
| Verification | complete | Focused tests, build, fixtures, runtime scenarios, lint, script syntax, and `bun check` passed | closeout |
| Commit / PR / tracker sync | ready | User asked to open PR; branch is `codex/start-init-pr-default` | PR creation |
| Closeout | ready | Plan checker and git actions remain | final response |

Findings:
- Existing Start init delegated to `npx shadcn init --template start` in a way that could collide with an existing target directory.
- The Start app still needs kitcn patches after shadcn output: providers, `@convex` wiring, runtime aliases, env files, and generated Convex files.

Decisions and tradeoffs:
- Start keeps the shadcn-owned shell; kitcn owns staging and integration patches around it.
- The fix avoids a homegrown Start template because the prior Start template plan explicitly required shadcn's own template.

Implementation notes:
- Removed the custom Start project writer from the first pass.
- Preserved shadcn delegation for Next, Start, and Vite.
- Added Start-owned `.gitignore` generation for env files, dependencies, TanStack/Vinxi output, TypeScript build info, and Convex runtime dirs.
- Start fixtures were regenerated from source and matched fresh CLI output.

Review fixes:
- Runtime alias gaps found by the first pass are fixed with explicit `@` and `@convex` Vite aliases.
- Autoreview found that Start wrote `.env.local` without a generated `.gitignore`; Start now patches one onto shadcn output.
- Autoreview found CommonJS Vite configs would receive ESM-only alias code; CommonJS configs now use `require('node:path').resolve(...)` and have a regression test.
- Autoreview found configs with `@convex` but missing `@` would skip alias repair; the patch now exits early only when both required aliases exist.
- Autoreview found project plan templates pointed at the deleted `.agents/rules/autogoal` checker; project templates now use `.agents/skills/autogoal/scripts/check-complete.mjs`.
- Autoreview found credential handling risks in the new video transcript helper; it now validates exact tracker hosts, keeps secrets in 0600 curl config files, removes Gemini API keys from URLs, and does not forward tracker auth headers across redirects.

Error attempts:
| Error / failed attempt | Count | Next different move | Resolution |
|------------------------|-------|---------------------|------------|
| Start runtime could not resolve `@/components/providers` | 1 | Add explicit Vite `@` alias | Fixed in generated Start `vite.config.ts`. |
| Start runtime could not resolve `@convex/api` | 1 | Add explicit Vite `@convex` alias | Fixed in generated Start `vite.config.ts`. |

Verification evidence:
- `bun test packages/kitcn/src/cli/commands/init.test.ts -t "scaffolds the start baseline"` passed.
- `bun --cwd packages/kitcn build` passed.
- `bun run fixtures:sync` passed.
- `bun run fixtures:check` passed.
- `bun run scenario:test -- start` passed.
- `bun run scenario:test -- start-auth` passed.
- `bun lint:fix` passed and formatted the new Start gitignore template.
- `bun test packages/kitcn/src/cli/commands/init.test.ts -t "vite @ alias|CommonJS vite aliases"` passed.
- `bash -n .agents/skills/video-transcripts/scripts/generate_video_transcript.sh` passed.
- `bun check` passed.
- `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-06-04-fix-tanstack-start-init-shadcn-bootstrap.md` passed.

Reboot status:
- No reboot or environment repair needed; failures were source-owned and resolved.

Open risks:
- shadcn Start template drift can still affect generated output; fixtures/scenarios are the guardrail.

Final handoff contract:
- Commit line: create `fix start init shadcn staging` in closeout.
- PR line: open a ready PR from `codex/start-init-pr-default`.
- Confidence: high.
- Tests: focused init tests, package build, fixtures sync/check, Start and Start auth runtime scenarios, lint, script syntax, and full `bun check`.
- Outcome: Start init preserves shadcn Start shell, avoids target collisions, repairs runtime aliases, and keeps generated project/template helper surfaces valid.
- Caveat: unrelated dirty files exist in the checkout and were not reverted.
