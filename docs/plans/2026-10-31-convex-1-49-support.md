# convex 1.49 support

Objective:
Support Convex 1.47.x to 1.49.x in kitcn; done when the peer range is `>=1.42 <1.50.0`, pins and fixtures use 1.49.0, `kitcn env pull` keeps values under agents, the `function` validator kind is mapped, the dual-floor type gate and `bun check` pass (`test:runtime` waived to upstream CI), and the PR ships.

Goal plan:
docs/plans/2026-10-31-convex-1-49-support.md

Template:
docs/plans/templates/task.md

Primary template:
docs/plans/templates/task.md

Applied packs:
- package-api (docs/plans/templates/packs/package-api.md)

Task source:
- type: Convex release audit slice (support request from a downstream consumer)
- id / link: PR pending (opened by the requesting session after approval); no
  udecode/kitcn issue
- title: Support Convex 1.47 to 1.49
- acceptance criteria: kitcn and `@kitcn/resend` declare `convex >=1.42 <1.50.0`;
  scaffolds, example, fixtures and the latest type lane use Convex 1.49.0; the
  1.42 floor stays; `kitcn env pull` writes values when an agent runs it on
  Convex 1.48+; the `function` validator kind is handled by the vendored
  helpers; `typecheck:convex` passes at 1.42.3 and 1.49.0; `bun check` passes,
  with `test:runtime` waived to upstream CI; a changeset ships the delta.

Timed checkpoint:
- requested duration: N/A: no duration requested
- semantics: N/A
- initial confidence score: N/A: case matrix is the metric
- improvement loop: N/A
- final score / loop closure: N/A

Completion threshold:
- `SUPPORTED_CONVEX_VERSION = '1.49.0'`; derived peer is `>=1.42 <1.50.0` in
  `packages/kitcn` and `packages/resend`.
- Generated pin targets and the eight fixture manifests reference Convex 1.49.0.
- `pullEnv` passes `--include-values` when the Convex it runs is 1.47 or newer,
  and omits it below.
- `CONVEX_VALIDATOR_KINDS`, `validate`, `vRequired`, `VRequired`,
  `convexToZod` and `ZodFromValidatorBase` handle `function`.
- `bun run typecheck:convex` passes against `convex-min-type-test@1.42.3` and
  `convex-type-test@1.49.0`.
- `bun check` lanes pass: `check:ci` and `test:verify` locally; `test:runtime`
  not run locally (port 3210 held on the host by an unrelated backend);
  deferred to upstream CI by explicit waiver.
- Task closure is legal only when the source-of-truth acceptance criteria are
  satisfied or explicitly narrowed, required verification evidence is recorded,
  code-review and release-artifact gates are closed when applicable, verified
  code changes are committed and PR'd unless explicitly declined or blocked,
  task-style PR body sync is complete or marked N/A with reason,
  GitHub issue/PR sync is complete or marked N/A with reason, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-10-31-convex-1-49-support.md` passes.

Verification surface:
- `bun test packages/kitcn/src/cli/supported-dependencies.test.ts packages/kitcn/src/cli/env.test.ts packages/kitcn/src/orm/builders/custom.test.ts`
- `bunx vitest run packages/kitcn/src/internal/upstream/validators.vitest.ts packages/kitcn/src/internal/upstream/server/zod4.vitest.ts`
- `bun run typecheck:convex` (dual floor)
- `bun run fixtures:sync`, then `bun check` (lint, typecheck, tests, CLI,
  concave, fixtures:check, test:verify, test:runtime)
- `bun install --frozen-lockfile` against the edited lockfile
- source audit of convex 1.46.0 -> 1.49.0 npm tarballs (parent audit plan)

Constraints:
- Preserve existing user-facing behavior outside the task scope.
- Keep `SUPPORTED_CONVEX_MIN_VERSION = '1.42'` and
  `SUPPORTED_CONVEX_MIN_TYPE_VERSION = '1.42.3'`.
- Do not hand-edit derived values; peer ranges and pins come from
  `tooling/dependency-pins.ts`, fixtures from `bun run fixtures:sync`.
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
- Source of truth: the parent audit; `docs/plans/328-convex-compatibility-range.md`
  for the one-minor-ceiling range mechanism; PR #484 for shape; PR #343 for
  adding a validator kind.
- Allowed edit scope: `supported-dependencies.ts` and its test, pin targets
  written by `tooling/dependency-pins.ts`, `bun.lock`, fixture manifests from
  `fixtures:sync`, `cli/env.ts`, `cli/convex-command.ts`, the vendored
  `validators.ts` and `zod4.ts` with tests, the ORM custom test, one
  changeset, this plan and the parent audit plan.
- Browser surface: N/A: no UI or rendered output.
- GitHub issue sync: N/A: no GitHub issue.
- Non-goals: moving the 1.42 floor; ORM `.staged()` tables (separate PR);
  reshaping `SUPPORTED_LOCAL_CONVEX_NODE_MAJORS` by Convex version; adopting
  `FunctionHandle_future` in kitcn caller types; wiring `typecheck:convex` into
  CI.

Output budget strategy:
- Gate output written to the session scratchpad and read with `tail`/`grep`.
- Upstream type audit scoped to `diff -rq` of `dist/esm-types` plus non-comment
  hunks of public `server/` and `values/` files.
- `rg` scoped to `packages`, `www`, `test`, `tooling`, excluding `dist` and
  `node_modules`.

Blocked condition:
- Convex 1.49.0 unpublished, a type break at either floor that needs an API
  change, or a gate failure caused by the bump.

Task state:
- task_type: chore / dependency-support bump with two compatibility fixes
  (public package boundary)
- task_complexity: non-trivial
- current_phase: commit; review and PR pending
- current_phase_status: local commits made, not pushed
- next_phase: session review lanes, then PR after approval; upstream CI runs
  `test:runtime`
- goal_status: active until the PR merges

Current verdict:
- verdict: valid
- confidence: 80-94% (`test:runtime` unproven locally, waived to upstream CI)
- next owner: requesting session (review lanes, PR)
- reason: every declared and generated surface covers 1.49.0; both type floors,
  `check:ci` and `test:verify` pass; `test:runtime` not run locally (port 3210
  held on the host by an unrelated backend); deferred to upstream CI by
  explicit waiver.

Implementation readiness:
- verdict: ready
- exact owner: `SUPPORTED_CONVEX_VERSION` in
  `packages/kitcn/src/cli/supported-dependencies.ts`; `pullEnv` in
  `packages/kitcn/src/cli/env.ts`; vendored validator switches.
- contradiction status: one resolved. Test sentinels at `1.47.0` meant "above
  the supported minor"; they move to `1.50.0` to keep that meaning.
- source-listed cases complete: yes

Pre-solution issue challenge:
- reporter claim: `kitcn env pull` loses values under agents on Convex 1.48+.
- suggested diagnosis or fix: pass `--include-values`, gated on Convex >= 1.47.
- repro ladder:
  - tests / source-level repro: new `pullEnv` cases for 1.47.0 and 1.49.0 and
    the updated `--out` case fail before the fix (3 fail) and pass after;
    validator cases fail before (4 fail) and pass after.
  - repo-owned automated browser or integration proof: N/A: no browser surface
  - Browser plugin: N/A
  - screenshot / visual proof: N/A
- reproduction verdict: reproduced at source level (upstream `envList` reads
  `detectAiAgent()`; kitcn writes stdout verbatim)
- validity verdict: valid
- best long-term fix boundary: the Convex version kitcn runs, read from the
  same `convex/package.json` that `runLocalConvexCommand` executes.
- harsh honest feedback: the failure is silent; Convex exits 0 and the file
  looks valid. `CONVEX_AGENT_MODE`, which kitcn's anonymous flows set, triggers
  it too.
- hard-stop decision: none; 1.49.0 is published (`npm view convex dist-tags`
  -> latest 1.49.0).

Completion rule:
- Do not call `update_goal(status: complete)` while any required checklist item
  remains unchecked. If an item does not apply, check it and add `N/A: <reason>`.
- Do not call `update_goal(status: complete)` until every completion threshold
  above is satisfied, final handoff evidence is recorded, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-10-31-convex-1-49-support.md` passes.
- Do not create hook state for this goal. This file plus the active goal are the
  durable state.

Start Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| Timed checkpoint parsed | no | N/A: no duration requested |
| Walkthrough baseline for possible UI change | no | N/A: versions, manifests, lockfile, CLI arg, vendored helpers, tests, changeset |
| Skill analysis before edits | yes | `convex-release-audit`, `task`, `autogoal` (`package-api` pack); `.agents/rules/changeset.mdc`; `major-task` declined (bump on an existing mechanism) |
| Active goal checked or created | yes | Goal tools not exposed; this plan is the durable state |
| Source of truth read before edits | yes | Parent audit; PR #484 plan and diff; PR #343 validator changes; `supported-dependencies.ts`; `tooling/dependency-pins.ts` |
| Exact per-PR task ownership | yes | Not-yet-created single-PR slice on branch `chore/support-convex-1-49`; PR number recorded when the session opens it |
| GitHub comments and attachments read | no | N/A: no issue or PR yet |
| Video transcript evidence required | no | N/A: no video |
| Pre-solution issue challenge required | yes | `env pull` claim reproduced at source level; see challenge above |
| Reproduction verdict before implementation | yes | Source-level repro from the upstream `envList` diff |
| Repro escalation ladder selected | yes | Tests / source-level only; no browser surface |
| Suggested fix reviewed against durable boundary | yes | Gate on the Convex kitcn runs, not on the app manifest; floor unchanged |
| `docs/solutions` checked for non-trivial existing-code work | yes | Supported-Node re-exec note read; no Convex-bump note |
| TDD decision before behavior change or bug fix | yes | `env` and validator cases red without the fix, green with it |
| Branch decision for code-changing task | yes | `chore/support-convex-1-49` off `upstream/main` 0cca0ae9 |
| Release artifact decision | yes | `.changeset/bright-handles-pull.md`, patch for `kitcn` and `@kitcn/resend` |
| Browser tool decision for browser surface | no | N/A: no browser surface |
| Commit / PR expectation decision | yes | Commit locally; the requesting session pushes and opens the PR after approval |
| Task-style PR body decision | yes | PR #270 emoji body, set by the requesting session |
| Task-plan PR body evidence | yes | Body must carry `🧭 Task plan: docs/plans/2026-10-31-convex-1-49-support.md` |
| GitHub issue sync expectation decision | no | N/A: no issue |
| Output budget strategy recorded | yes | See Output budget strategy |
| Package/API pack selected | yes | `--with package-api`: two published peer ranges change |
| Public surface or package boundary identified | yes | `peerDependencies.convex` in `kitcn` and `@kitcn/resend`: `>=1.42 <1.47.0` -> `>=1.42 <1.50.0`; `convexToZod` accepts `v.function()` |
| Convex entry/import graph impact identified | yes | None: no import added to Convex entries; `convex-command.ts` (CLI only) reads `convex/package.json` it already resolves |
| CLI/scaffold/generated impact identified | yes | Scaffold pin 1.49.0; CLI warning ceiling 1.50; `env pull` arg; fixtures regenerated |
| Release artifact path selected | yes | `.changeset/bright-handles-pull.md` |
| `changeset` skill loaded when `.changeset` is required | yes | `.agents/rules/changeset.mdc` followed (`## Patches`, action verbs) |
| Package build / fixture impact decision recorded | yes | `bun --cwd packages/kitcn build`, `bun --cwd packages/resend build`, `fixtures:sync`, `fixtures:check` |

Work Checklist:
- [x] If a duration was requested, it is recorded as minimum active work unless
      explicitly marked hard stop. N/A: no duration requested.
- [x] Objective includes outcome, completion threshold, verification surface,
      constraints, boundaries, and blocked condition.
- [x] Task source classified with source type, id/link, title, task type,
      acceptance criteria, caveats, likely files/routes/packages, browser
      surface, and root-cause layer.
- [x] Every GitHub PR in scope has its own task plan. This plan owns exactly
      one PR, not yet created; the session records its number on opening.
- [x] Required video or screen-recording evidence. N/A: none.
- [x] Reporter claims challenged: `env pull` reproduced at source level;
      validity `valid`.
- [x] Repro escalation ladder: tests / source level; no browser surface.
- [x] Hard-stop rule. N/A: claim reproduced; 1.49.0 verified published.
- [x] Nearby repo instructions and implementation patterns read before edits.
- [x] Source-listed case matrix is complete and every contradiction has an
      owner, harness, and verdict before mutation.
- [x] Readiness is classified `ready` with evidence.
- [x] Implementation fixes the right ownership boundary: the version constant,
      the Convex kitcn runs, and the vendored switches.
- [x] Release artifact requirement recorded: new changeset.
- [x] Final handoff shape decided: chore handoff, task-style PR body.
- [x] Commit/PR handling recorded: committed locally on
      `chore/support-convex-1-49`; push and PR by the requesting session.
- [x] PR body shape recorded: PR #270 emoji task-style body.
- [x] PR task evidence recorded: body names this plan; plan PR line pending
      until the PR exists.
- [x] Branch handling recorded: dedicated branch `chore/support-convex-1-49`.
- [x] Local-env-rot retry policy recorded: missing `packages/kitcn/dist` in a
      fresh worktree broke the minimum type lane; fixed by the package build,
      no product change.
- [x] Workspace authority recorded: all gates at the repo root;
      `typecheck:convex` runs in `packages/kitcn` via the root script.
- [x] Output budget discipline recorded and followed.
- [x] High-risk note recorded (see Open risks).
- [x] Review/autoreview target selected: `--mode branch --base upstream/main`,
      run by the requesting session's review lanes.
- [x] Agent-native review decision recorded. N/A: no agent tooling changed.
- [x] Package/API pack: public API, package boundary, export, and release-artifact impact are recorded.
- [x] Package/API pack: release artifact matrix applied: `.changeset` created.
- [x] Package/API pack: `.changeset` follows `changeset.mdc` package/version/prose rules.
- [x] Package/API pack: no-artifact decisions. N/A: an artifact was created.
- [x] Package/API pack: compatibility decision explicit: range widened, floor
      kept; additive, non-breaking.
- [x] Package/API pack: Convex static import graphs unchanged.
- [x] Package/API pack: CLI commands unchanged; `env pull` adds one Convex arg
      on 1.47+, the warning ceiling moves.
- [x] Package/API pack: docs and `packages/kitcn/skills/kitcn/**`. N/A: no
      Convex version or Node pins there; `env pull` docs stay accurate.
- [x] Package/API pack: package-owned typecheck/build/test proof recorded.
- [x] Package/API pack: `packages/kitcn` build and fixture sync/check recorded.

Completion Gates:
| Gate | Applies | Required action | Evidence |
|------|---------|-----------------|----------|
| Named verification threshold | yes | Run the named commands | See Verification evidence |
| Exact per-PR task ownership | yes | Record the exact PR and dedicated plan, or the not-yet-created single-PR slice | Not-yet-created single-PR slice; owned solely by this plan |
| Pre-solution issue challenge verdict | yes | Record verdict | `valid` |
| Repro escalation ladder | yes | Record ladder | Tests / source level |
| Bug reproduced before fix | yes | Record failing repro | `env.test.ts` 3 fail without the fix; validator tests 4 fail without the fix |
| Targeted behavior verification | yes | Focused test | supported-dependencies 16/0, env 14/0, ORM custom 10/0, vitest validators + zod4 11/0 |
| TypeScript or typed config changed | yes | Run typecheck | `bun run typecheck:convex` exit 0 at 1.49.0 and 1.42.3; `bun typecheck` in `check:ci` |
| Package exports or file layout changed | no | Run package build | N/A: no export change; `bun --cwd packages/kitcn build` run anyway (72 files) |
| Package manifests, lockfile, or install graph changed | yes | Run `bun install` | `bun install --frozen-lockfile` passes on the 7-line lockfile edit |
| Agent rules or skills changed | no | Verify skill sync | N/A: none changed |
| Workspace authority proof | yes | Record cwd | Repo root of the kitcn worktree |
| Browser surface changed | no | Browser proof | N/A: no browser surface |
| Browser final proof | no | Screenshot | N/A: no browser surface |
| UI walkthrough | no | Walkthrough | N/A: no UI or rendered output |
| Scaffold or fixture output changed | yes | `fixtures:sync` + `fixtures:check` | sync exit 0 (separate commit); `fixtures:check` passes inside `check:ci` |
| Package behavior or public API changed | yes | Add a changeset | `.changeset/bright-handles-pull.md` |
| Docs and kitcn skill sync changed | no | Sync docs | N/A: no version-pinned guidance |
| Docs or content changed | no | Verify docs | N/A: no docs changed |
| High-risk mini gate | yes | Failure mode, proof, boundary | See Open risks |
| Agent-native review for agent/tooling changes | no | Agent-native review | N/A: no agent tooling changed |
| Local install corruption suspected | yes | Reinstall and rerun | Missing `dist` in a fresh worktree; package builds fixed it |
| Commit created | yes | Commit | `chore(deps): support convex 1.47 to 1.49` plus `chore(fixtures): sync convex 1.49.0` |
| PR create or update | yes | Run `check`, push, open PR | `check:ci` and `test:verify` pass; `test:runtime` not run locally (port 3210 held on the host by an unrelated backend); deferred to upstream CI by explicit waiver; push and PR by the requesting session after approval |
| Task-style PR body verified | yes | Verify with `gh pr view --json body` | Requesting session sets and reads back the body |
| PR task evidence verified | yes | Verify body plan line, plan at head, exact PR | Requesting session fills the PR number here and reads it back |
| PR proof image hosting | no | Host images | N/A: no images |
| GitHub issue sync-back | no | Post issue sync | N/A: no issue |
| Final handoff contract | yes | Fill handoff | See Final handoff contract |
| Final lint | yes | `bun lint` | `biome check && eslint` clean (985 files) inside `check:ci` |
| Output budget discipline | yes | No unbounded output | Gate output in the session scratchpad |
| Timed checkpoint | no | Improve until elapsed | N/A: no duration requested |
| Autoreview for non-trivial implementation changes | yes | Review until no accepted findings | Requesting session's read-only review lanes on the branch before the PR |
| Goal plan complete | yes | Run `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-10-31-convex-1-49-support.md` | See Verification evidence |
| Public API / package boundary proof | yes | Source-audit boundary | `peerDependencies.convex` widens; `convexToZod` and ORM columns accept `v.function()`; no export change |
| Convex bundle/import proof | yes | Audit static graphs | No import change in Convex entries |
| CLI/scaffold/generated proof | yes | Prove command contract | `test:cli` (in `check:ci`) and `test:verify` pass; fixtures regenerated |
| Release artifact classification | yes | Classify | Published package delta: wider Convex peer, scaffolded Convex 1.49.0, `env pull` fix, `function` validator support |
| Published package changeset | yes | One changeset | `.changeset/bright-handles-pull.md` covers `kitcn` and `@kitcn/resend` |
| No release artifact | no | Reason | N/A: artifact created |
| Package typecheck/build/test | yes | Owning package checks | `typecheck:convex` both floors; kitcn and resend builds clean |
| Fixture/scaffold generation | yes | `fixtures:sync` + `fixtures:check` | Both pass |
| Docs/package skill sync | no | Sync guidance | N/A: no version-pinned guidance |

Phase / pass table:
| Phase | Status | Evidence | Next |
|-------|--------|----------|------|
| Intake and source read | complete | 1.49.0 published; parent audit; PR #484 and #343 read | implementation |
| Implementation | complete | Constant to 1.49.0; pins synced; lockfile convex entries only; `env pull` gate; `function` kind; tests; changeset | verification |
| Verification | partial, `test:runtime` waived | Dual-floor typecheck, focused tests, fixtures sync, `check:ci`, `test:verify` pass; `test:runtime` not run locally (port 3210 held on the host by an unrelated backend); deferred to upstream CI by explicit waiver | commit |
| Commit / PR / GitHub sync | partial | Local commits on `chore/support-convex-1-49`; push and PR by the requesting session after approval | closeout |
| Closeout | partial | Plan filled; PR line set when the PR opens | final response |

Findings:
- npm: `convex` dist-tag `latest` is 1.49.0; 1.47.0, 1.48.0 and 1.49.0
  published.
- Convex 1.48 `env list` prints names only when `detectAiAgent()` fires
  (agent env vars or `CONVEX_AGENT_MODE`); `--include-values` exists from 1.47.
  `pullEnv` now passes it when the Convex kitcn runs is 1.47+.
- Convex 1.49 adds `VFunction` (`kind: "function"`) to the `Validator` union.
  The latest-lane guard `CONVEX_VALIDATOR_KINDS` failed until `function` was
  added. `vRequired` and `convexToZod` threw on it.
- `MutationAuth` (`signJwt`) and mutation `ctx.storage.get/store` are widened
  supertypes; kitcn compiles unchanged at both floors.
- Convex 1.49 declares `engines.node >=22` and its CLI exits on Node < 22.
  `convex@1.42.3` still runs on Node 18 (hard minimum 16, engines `>=18`).
- `bun install` re-resolved only the seven convex lockfile lines.
- `fixtures:sync` also picked up upstream scaffold drift (`lucide-react`,
  `cn`, `prettier`, `react`, `next`, `expo`, `@tanstack/router-cli`, and
  `"bundler": "vite"` in the TanStack Start `.cta.json`); generated output,
  kept in the fixtures commit.

Decisions and tradeoffs:
- Ceiling advances three minors (`<1.50.0`), one constant bump.
- Gate `--include-values` on the Convex package kitcn executes (the same
  `convex/package.json` `runLocalConvexCommand` resolves), injectable through
  `PullEnvDeps.convexVersion` for tests. The floor stays 1.42.
- `function` follows the PR #343 `commitTs` shape: structural type branches so
  the 1.42.3 floor still compiles; `validate` checks for a string;
  `convexToZod` maps to `z.string()` because handles are strings and Convex
  does not check `args` / `returns` at runtime.
- Node: as PR 484 did for Node 20, a changeset line only.
  `SUPPORTED_LOCAL_CONVEX_NODE_MAJORS` stays `{18, 20, 22, 24}` because it is
  version-independent and the 1.42 floor still runs on 18 and 20.
- Lockfile edited by `bun install` with no unrelated re-resolve.

Implementation notes:
- `bun tooling/dependency-pins.ts sync --skip-validate` wrote every pin target.

Review fixes:
- None yet.

Error attempts:
| Error / failed attempt | Count | Next different move | Resolution |
|------------------------|-------|---------------------|------------|
| `typecheck:convex` latest lane: `convex-latest.test-d.ts(14,3)` `false` not `true` | 1 | Add `function` to `CONVEX_VALIDATOR_KINDS` and the switches | Resolved |
| `typecheck:convex` minimum lane: missing `../dist/orm/index.js` | 1 | Build `packages/kitcn` | Resolved |

Verification evidence:
- `bun test packages/kitcn/src/cli/supported-dependencies.test.ts`: 16 pass, 0 fail.
- `bun test packages/kitcn/src/cli/env.test.ts`: 14 pass, 0 fail; with
  `env.ts` and `convex-command.ts` reverted: 11 pass, 3 fail.
- `bun test packages/kitcn/src/orm/builders/custom.test.ts`: 10 pass, 0 fail;
  `bunx vitest run .../validators.vitest.ts .../zod4.vitest.ts`: 11 pass; with
  `validators.ts` and `zod4.ts` reverted: 4 fail (3 vitest, 1 bun).
- `bun run typecheck:convex`: exit 0 (1.49.0 lane, then 1.42.3 minimum lane).
- `bun install --frozen-lockfile`: exit 0.
- `bun run fixtures:sync`: exit 0.
- `bun --cwd packages/kitcn build`: 72 files; `bun --cwd packages/resend build`:
  exit 0.
- `bun check` lanes on the pinned `bun@1.3.9`: `check:ci` exit 0 (lint 985
  files clean; typecheck 5/5; `bun test` 1583 pass / 0 fail; vitest 1105 pass,
  14 skipped; `test:cli` 124 pass; concave smoke passed; `fixtures:check` all
  eight fixtures match), then `test:verify` exit 0 (Convex 1.49.0 local
  backend on port 3212, Node 22.23.4). `test:runtime` not run: its scenarios
  probe `http://127.0.0.1:3210`, held on the host by an unrelated OrbStack
  backend. Waiver: deferred to upstream CI on the PR.

Source-listed case matrix:
| Case | Source claim | Harness | Before | Expected after | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Peer covers 1.47 to 1.49 | supported-dependencies test, manifests | `<1.47.0` | `>=1.42 <1.50.0` | test + `packages/*/package.json` | done |
| 2 | Installed 1.47.0 / 1.48.0 / 1.49.0 not warned | `test.each` | warned | no warning | 16/0 | done |
| 3 | 1.50 still warned | moved sentinels | n/a | warns | 16/0 | done |
| 4 | 1.42 floor kept | test `minimum`, `minimumType` | `>=1.42`, 1.42.3 | unchanged | test | done |
| 5 | `env pull` keeps values on 1.48+ | `env.test.ts` `test.each` | `env list` | `env list --include-values` on 1.47+, unchanged below | 14/0 | done |
| 6 | `function` validator handled | validators, zod4, ORM custom tests; latest type guard | throws / guard fails | mapped | tests + `typecheck:convex` | done |
| 7 | Types hold at 1.49 | `typecheck:convex` | n/a | exit 0 both floors | Verification evidence | done |
| 8 | Scaffolds and fixtures on 1.49.0 | pins sync, `fixtures:sync` | 1.46.0 | 1.49.0 | diff | done |

Final handoff contract:
- Commit line: `chore(deps): support convex 1.47 to 1.49`; `chore(fixtures): sync convex 1.49.0`
- PR line: PR pending (opened by the requesting session after approval)
- Issue line: 🐛 Fixes ➖ N/A
- Confidence line: 🟡 80-94% confidence (`test:runtime` waived to upstream CI)
- Flow table:
  - Reproduced: tests 🔴 `env` 3 fail and validator 4 fail before the fix; browser ➖ N/A
  - Verified: tests 🟢 dual-floor `typecheck:convex`, `check:ci` and `test:verify`; `test:runtime` waived to upstream CI; browser ➖ N/A
- Browser check: N/A: no browser surface
- Outcome: kitcn supports Convex 1.47.x to 1.49.x; scaffolds use 1.49.0;
  `kitcn env pull` keeps values under agents; `v.function()` works in ORM
  columns and `convexToZod`.
- Caveat: Convex 1.49 needs Node 22; `test:runtime` not run locally (port 3210
  held on the host by an unrelated backend); deferred to upstream CI by
  explicit waiver.
- Design:
  - Chosen boundary: `SUPPORTED_CONVEX_VERSION`; the Convex package kitcn runs;
    the vendored validator switches
  - Why not quick patch: manifests are derived and revert on the next pins
    sync; always passing `--include-values` breaks the 1.42 to 1.46 range
  - Why not broader change: raising the floor or version-aware Node selection
    is not needed for 1.49 support
- Verified: see Verification evidence
- PR body verified: set by the requesting session

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
- Commit: two commits on `chore/support-convex-1-49`
- PR: pending
- Issue: N/A: no issue
- Browser proof: N/A: no browser surface
- Caveats: Node 22 floor from Convex 1.49; `test:runtime` waived to upstream CI

Timeline:
- 2026-10-31T06:57Z Constant bumped, pins synced, lockfile edited.
- 2026-10-31T07:00Z Latest type lane failed on `function`; vendored switches
  and `env pull` gate added with red-then-green tests; changeset added.
- 2026-10-31T07:05Z Dual-floor typecheck, fixtures sync, `check:ci` and
  `test:verify` passed; `test:runtime` waived (host port 3210).

Reboot status:
| Question | Answer |
|----------|--------|
| Where am I? | Local commits on `chore/support-convex-1-49`; review and PR pending |
| Where am I going? | Session review lanes, PR after approval, upstream CI runs `test:runtime` |
| What is the goal? | Support Convex 1.47.x to 1.49.x with the 1.42 floor kept |
| What have I learned? | See Findings |
| What have I done? | See Timeline |

Open risks:
- Failure mode: a user on Node 20 with Convex 1.49 installed; kitcn treats 20
  as supported and does not re-exec, so Convex prints its own Node 22 error.
  Proof: upstream `src/cli/index.ts` hard minimum. Follow-up if wanted: pick
  the Node set from the installed Convex.
- `LOCAL_CONVEX_VERSION` reads the Convex package kitcn resolves; a hoisting
  layout where it differs from the app's Convex already affects every kitcn
  Convex command, not only `env pull`.
- `typecheck:convex` is outside `bun check`; run manually here.
- `test:runtime` not run locally (port 3210 held on the host by an unrelated
  backend); deferred to upstream CI by explicit waiver; a runtime regression
  would surface only there.
