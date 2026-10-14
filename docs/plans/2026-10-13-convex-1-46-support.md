# convex 1.46 support

Objective:
Support Convex 1.45.x and 1.46.x in kitcn; done when the peer range is `>=1.42 <1.47.0`, pins and fixtures use 1.46.0, the dual-floor type gate and `bun check` pass (`test:runtime` waived to upstream CI), and PR #484 ships.

Goal plan:
docs/plans/2026-10-13-convex-1-46-support.md

Template:
docs/plans/templates/task.md

Primary template:
docs/plans/templates/task.md

Applied packs:
- package-api (docs/plans/templates/packs/package-api.md)

Task source:
- type: plain task text (support request from a downstream consumer)
- id / link: PR #484 (https://github.com/udecode/kitcn/pull/484); no
  udecode/kitcn issue; supersedes open PR #458
  (`chore(deps): support convex 1.45.x`, conflicting with main, no review)
- title: Support Convex 1.45 and 1.46
- acceptance criteria: kitcn and `@kitcn/resend` declare `convex >=1.42 <1.47.0`;
  scaffolds, example, fixtures and the latest type lane use Convex 1.46.0; the
  1.42 floor stays; `typecheck:convex` passes at 1.42.3 and 1.46.0; `bun check`
  passes, with `test:runtime` waived to upstream CI; a changeset ships the delta.

Timed checkpoint:
- requested duration: N/A: no duration requested
- semantics: N/A
- initial confidence score: N/A: case matrix is the metric
- improvement loop: N/A
- final score / loop closure: N/A

Completion threshold:
- `SUPPORTED_CONVEX_VERSION = '1.46.0'`; derived peer is `>=1.42 <1.47.0` in
  `packages/kitcn` and `packages/resend`.
- Generated pin targets and the eight fixture manifests reference Convex 1.46.0.
- `bun run typecheck:convex` passes against `convex-min-type-test@1.42.3` and
  `convex-type-test@1.46.0`.
- `bun check` lanes pass: `check:ci` and `test:verify` locally; `test:runtime` not run locally (port 3210 held on the host by an unrelated backend); deferred to upstream CI by explicit waiver.
- Task closure is legal only when the source-of-truth acceptance criteria are
  satisfied or explicitly narrowed, required verification evidence is recorded,
  code-review and release-artifact gates are closed when applicable, verified
  code changes are committed and PR'd unless explicitly declined or blocked,
  task-style PR body sync is complete or marked N/A with reason,
  GitHub issue/PR sync is complete or marked N/A with reason, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-10-13-convex-1-46-support.md` passes.

Verification surface:
- `bun test packages/kitcn/src/cli/supported-dependencies.test.ts`
- `bun run typecheck:convex` (dual floor)
- `bun run fixtures:sync`, then `bun check` (lint, typecheck, tests, CLI,
  concave, fixtures:check, test:verify, test:runtime)
- `bun install --frozen-lockfile` against the edited lockfile
- source audit of convex 1.44.0 -> 1.46.0 public `.d.ts` deltas

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
- Source of truth: the support request; `docs/plans/328-convex-compatibility-range.md`
  for the one-minor-ceiling range mechanism; PR #458 for shape.
- Allowed edit scope: `supported-dependencies.ts` and its test, pin targets
  written by `tooling/dependency-pins.ts`, `bun.lock`, fixture manifests from
  `fixtures:sync`, one changeset, this plan.
- Browser surface: N/A: no UI or rendered output.
- GitHub issue sync: N/A: no GitHub issue; PR #458 is superseded in the PR body.
- Non-goals: moving the 1.42 floor; migrating kitcn's `FuncRef['_args']` type
  reads to `FunctionArgs`; accepting `FunctionReference_future` in kitcn caller
  types; wiring `typecheck:convex` into CI.

Output budget strategy:
- Gate output written to `/tmp/kitcn-*.txt` and read with `tail`/`grep`.
- Upstream type audit scoped to `diff -rq` of `dist/esm-types` plus per-file
  non-comment diffs.
- `rg` scoped to `packages`, `example`, `test`, `fixtures`, `convex`, `www`,
  excluding `dist` and `node_modules`.

Blocked condition:
- Convex 1.46.0 unpublished, a type break at either floor that needs an API
  change, or a gate failure caused by the bump.

Task state:
- task_type: chore / dependency-support bump (public package boundary)
- task_complexity: non-trivial
- current_phase: review / PR #484 (draft)
- current_phase_status: review fix round applied
- next_phase: mark PR #484 ready, upstream CI runs `test:runtime`
- goal_status: active until PR #484 merges

Current verdict:
- verdict: valid
- confidence: 80-94% (`test:runtime` unproven locally, waived to upstream CI)
- next owner: requesting session (PR #484 ready, upstream CI)
- reason: every declared and generated surface covers 1.46.0; both type floors,
  `check:ci` and `test:verify` pass; `test:runtime` not run locally (port 3210 held on the host by an unrelated backend); deferred to upstream CI by explicit waiver.

Implementation readiness:
- verdict: ready
- exact owner: `SUPPORTED_CONVEX_VERSION` in
  `packages/kitcn/src/cli/supported-dependencies.ts`; `tooling/dependency-pins.ts`
  derives every pin and peer from it.
- contradiction status: one resolved. Test sentinels at `1.45.0` meant "above
  the supported minor"; they move to `1.47.0` to keep that meaning.
- source-listed cases complete: yes

Pre-solution issue challenge:
- reporter claim: N/A: support request, no defect claim.
- suggested diagnosis or fix: widen the peer to `<1.47.0` and check the
  `FunctionReference` slot deprecation in 1.46.
- repro ladder:
  - tests / source-level repro: new in-range cases for installed 1.45.0 and
    1.46.0 fail against the 1.44 constant (8 fail) and pass after.
  - repo-owned automated browser or integration proof: N/A: no browser surface
  - Browser plugin: N/A
  - screenshot / visual proof: N/A
- reproduction verdict: N/A: support request
- validity verdict: valid
- best long-term fix boundary: the single version constant; generated files follow.
- harsh honest feedback: PR #458 stops at `<1.46.0`, but Convex `latest` is
  1.46.0 and ecosystem components (`@convex-dev/workflow` 0.4.10,
  `convex-helpers` 0.1.128) already require it.
- hard-stop decision: none; 1.46.0 is published (`npm view convex dist-tags`
  -> latest 1.46.0).

Completion rule:
- Do not call `update_goal(status: complete)` while any required checklist item
  remains unchecked. If an item does not apply, check it and add `N/A: <reason>`.
- Do not call `update_goal(status: complete)` until every completion threshold
  above is satisfied, final handoff evidence is recorded, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-10-13-convex-1-46-support.md` passes.
- Do not create hook state for this goal. This file plus the active goal are the
  durable state.

Start Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| Timed checkpoint parsed | no | N/A: no duration requested |
| Walkthrough baseline for possible UI change | no | N/A: versions, manifests, lockfile, test and changeset only |
| Skill analysis before edits | yes | `task` + `autogoal` (`package-api` pack); `.agents/rules/changeset.mdc`; `major-task` declined (bump on an existing mechanism) |
| Active goal checked or created | yes | Goal tools not exposed; this plan is the durable state |
| Source of truth read before edits | yes | Request; PR #458 body and diff; `328-convex-compatibility-range.md`; `supported-dependencies.ts`; `tooling/dependency-pins.ts` |
| Exact per-PR task ownership | yes | PR #484, branch `chore/support-convex-1-46` |
| GitHub comments and attachments read | yes | PR #458 body read; no issue |
| Video transcript evidence required | no | N/A: no video |
| Pre-solution issue challenge required | no | N/A: support request, no bug claim |
| Reproduction verdict before implementation | no | N/A: support request |
| Repro escalation ladder selected | no | N/A: no bug claim |
| Suggested fix reviewed against durable boundary | yes | Constant bump plus `dependency-pins.ts sync`, not hand-edited manifests |
| `docs/solutions` checked for non-trivial existing-code work | yes | No Convex-bump note present |
| TDD decision before behavior change or bug fix | yes | Added installed 1.45.0 / 1.46.0 no-warn cases; red at the 1.44 constant |
| Branch decision for code-changing task | yes | `chore/support-convex-1-46` off `origin/main` 39e89b21 |
| Release artifact decision | yes | `.changeset/quiet-rivers-widen.md`, patch for `kitcn` and `@kitcn/resend` |
| Browser tool decision for browser surface | no | N/A: no browser surface |
| Commit / PR expectation decision | yes | Commit and push to the fork; PR #484 opened by the requesting session |
| Task-style PR body decision | yes | PR #270 emoji body drafted, supersedes #458 |
| Task-plan PR body evidence | yes | Body carries `🧭 Task plan: docs/plans/2026-10-13-convex-1-46-support.md` |
| GitHub issue sync expectation decision | no | N/A: no issue |
| Output budget strategy recorded | yes | See Output budget strategy |
| Package/API pack selected | yes | `--with package-api`: two published peer ranges change |
| Public surface or package boundary identified | yes | `peerDependencies.convex` in `kitcn` and `@kitcn/resend`: `>=1.42 <1.45.0` -> `>=1.42 <1.47.0` |
| Convex entry/import graph impact identified | yes | None: no import added or removed |
| CLI/scaffold/generated impact identified | yes | Scaffold pin 1.46.0; CLI warning ceiling 1.47; fixtures regenerated |
| Release artifact path selected | yes | `.changeset/quiet-rivers-widen.md` |
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
      one PR: #484.
- [x] Required video or screen-recording evidence. N/A: none.
- [x] Reporter claims challenged. N/A: support request with no bug claim;
      validity `valid`.
- [x] Repro escalation ladder. N/A: no bug claim.
- [x] Hard-stop rule. N/A: no bug claim; 1.46.0 verified published.
- [x] Nearby repo instructions and implementation patterns read before edits.
- [x] Source-listed case matrix is complete and every contradiction has an
      owner, harness, and verdict before mutation.
- [x] Readiness is classified `ready` with evidence.
- [x] Implementation fixes the right ownership boundary: the version constant.
- [x] Release artifact requirement recorded: new changeset.
- [x] Final handoff shape decided: chore handoff, PR body supersedes #458.
- [x] Commit/PR handling recorded: committed and pushed to fork branch
      `chore/support-convex-1-46`; PR #484 opened by the requesting session.
- [x] PR body shape recorded: PR #270 emoji task-style body drafted.
- [x] PR task evidence recorded: PR #484 body names this plan; plan names PR #484.
- [x] Branch handling recorded: dedicated branch `chore/support-convex-1-46`.
- [x] Local-env-rot retry policy recorded: missing `packages/kitcn/dist` and
      `packages/resend/dist` in a fresh worktree; fixed by package builds, no
      product change.
- [x] Workspace authority recorded: all gates at the repo root;
      `typecheck:convex` runs in `packages/kitcn` via the root script.
- [x] Output budget discipline recorded and followed.
- [x] High-risk note recorded (see Open risks).
- [x] Review/autoreview target selected: `--mode branch --base origin/main`,
      run by the requesting session's review lanes on PR #484.
- [x] Agent-native review decision recorded. N/A: no agent tooling changed.
- [x] Package/API pack: public API, package boundary, export, and release-artifact impact are recorded.
- [x] Package/API pack: release artifact matrix applied: `.changeset` created.
- [x] Package/API pack: `.changeset` follows `changeset.mdc` package/version/prose rules.
- [x] Package/API pack: no-artifact decisions. N/A: an artifact was created.
- [x] Package/API pack: compatibility decision explicit: range widened, floor
      kept; additive, non-breaking.
- [x] Package/API pack: Convex static import graphs unchanged.
- [x] Package/API pack: CLI commands unchanged; only the warning ceiling moves.
- [x] Package/API pack: docs and `packages/kitcn/skills/kitcn/**`. N/A: no
      Convex version pins there.
- [x] Package/API pack: package-owned typecheck/build/test proof recorded.
- [x] Package/API pack: `packages/kitcn` build and fixture sync/check recorded.

Completion Gates:
| Gate | Applies | Required action | Evidence |
|------|---------|-----------------|----------|
| Named verification threshold | yes | Run the named commands | See Verification evidence |
| Exact per-PR task ownership | yes | Record the exact PR and dedicated plan, or the not-yet-created single-PR slice | PR #484, owned solely by this plan |
| Pre-solution issue challenge verdict | no | Record verdict | N/A: support request; validity `valid` |
| Repro escalation ladder | no | Record ladder | N/A: no bug claim |
| Bug reproduced before fix | no | Record failing repro | N/A: no bug; new tests red at the 1.44 constant (8 fail) |
| Targeted behavior verification | yes | Focused test | `bun test packages/kitcn/src/cli/supported-dependencies.test.ts` -> 13 pass / 0 fail |
| TypeScript or typed config changed | yes | Run typecheck | `bun run typecheck:convex` exit 0 at 1.42.3 and 1.46.0; `bun typecheck` in `check:ci` |
| Package exports or file layout changed | no | Run package build | N/A: no export change; `bun --cwd packages/kitcn build` run anyway (72 files) |
| Package manifests, lockfile, or install graph changed | yes | Run `bun install` | `bun install --frozen-lockfile` passes on the 7-line lockfile edit |
| Agent rules or skills changed | no | Verify skill sync | N/A: none changed |
| Workspace authority proof | yes | Record cwd | Repo root of the kitcn worktree |
| Browser surface changed | no | Browser proof | N/A: no browser surface |
| Browser final proof | no | Screenshot | N/A: no browser surface |
| UI walkthrough | no | Walkthrough | N/A: no UI or rendered output |
| Scaffold or fixture output changed | yes | `fixtures:sync` + `fixtures:check` | sync exit 0 (separate commit); `fixtures:check` passes inside `check:ci` |
| Package behavior or public API changed | yes | Add a changeset | `.changeset/quiet-rivers-widen.md` |
| Docs and kitcn skill sync changed | no | Sync docs | N/A: no Convex version pins in docs or the kitcn skill |
| Docs or content changed | no | Verify docs | N/A: no docs changed |
| High-risk mini gate | yes | Failure mode, proof, boundary | See Open risks |
| Agent-native review for agent/tooling changes | no | Agent-native review | N/A: no agent tooling changed |
| Local install corruption suspected | yes | Reinstall and rerun | Missing `dist` in a fresh worktree; package builds fixed it |
| Commit created | yes | Commit | `chore(deps): support convex 1.45 and 1.46` plus `chore(fixtures): sync convex 1.46.0` |
| PR create or update | yes | Run `check`, push, open PR | `check:ci` and `test:verify` pass; `test:runtime` not run locally (port 3210 held on the host by an unrelated backend); deferred to upstream CI by explicit waiver; pushed to fork; PR #484 opened by the requesting session |
| Task-style PR body verified | yes | Verify with `gh pr view --json body` | PR #484 body in PR #270 format, set by the requesting session |
| PR task evidence verified | yes | Verify body plan line, plan at head, exact PR | PR #484 body plan line; plan at head names PR #484 |
| PR proof image hosting | no | Host images | N/A: no images |
| GitHub issue sync-back | no | Post issue sync | N/A: no issue |
| Final handoff contract | yes | Fill handoff | See Final handoff contract |
| Final lint | yes | `bun lint` | `biome check && eslint` clean inside `check:ci` |
| Output budget discipline | yes | No unbounded output | Gate output in `/tmp/kitcn-*.txt` |
| Timed checkpoint | no | Improve until elapsed | N/A: no duration requested |
| Autoreview for non-trivial implementation changes | yes | Review until no accepted findings | Sol review of PR #484: spec no findings; one standards finding (plan overstated `bun check`), fixed in this commit |
| Goal plan complete | yes | Run `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-10-13-convex-1-46-support.md` | See Verification evidence |
| Public API / package boundary proof | yes | Source-audit boundary | Only `peerDependencies.convex` widens; no export or type-surface change |
| Convex bundle/import proof | yes | Audit static graphs | No import change |
| CLI/scaffold/generated proof | yes | Prove command contract | `test:cli` (in `check:ci`) and `test:verify` pass; fixtures regenerated |
| Release artifact classification | yes | Classify | Published package delta: wider Convex peer, scaffolded Convex 1.46.0 |
| Published package changeset | yes | One changeset | `.changeset/quiet-rivers-widen.md` covers `kitcn` and `@kitcn/resend` |
| No release artifact | no | Reason | N/A: artifact created |
| Package typecheck/build/test | yes | Owning package checks | `typecheck:convex` both floors; kitcn and resend builds clean |
| Fixture/scaffold generation | yes | `fixtures:sync` + `fixtures:check` | Both pass |
| Docs/package skill sync | no | Sync guidance | N/A: no version-pinned guidance |

Phase / pass table:
| Phase | Status | Evidence | Next |
|-------|--------|----------|------|
| Intake and source read | complete | 1.46.0 published; PR #458, #328 doctrine, constant and pins tooling read | implementation |
| Implementation | complete | Constant to 1.46.0; pins synced; lockfile convex entries only; test sentinels to 1.47.0 plus two in-range cases; changeset | verification |
| Verification | partial, `test:runtime` waived | Dual-floor typecheck, focused test, fixtures sync, `check:ci`, `test:verify` pass; `test:runtime` not run locally (port 3210 held on the host by an unrelated backend); deferred to upstream CI by explicit waiver | commit |
| Commit / PR / GitHub sync | complete | Commits pushed to fork; draft PR #484 opened | closeout |
| Closeout | complete | Plan filled | final response |

Findings:
- npm: `convex` dist-tag `latest` is 1.46.0; 1.45.0 and 1.46.0 published.
- Convex 1.46 adds `FunctionReference_future` and an optional `_fn` slot on
  `FunctionReference`, and marks `_args` / `_returnType` `@deprecated`. The
  slots remain, so kitcn's `Fn['_args']` reads in `server/caller.ts`,
  `server/caller-factory.ts`, `server/procedure-caller.ts` and `server/infer.ts`
  compile unchanged at both floors. No kitcn code reads `_returnType`.
- `ctx.runQuery/runMutation/runAction` and scheduler accept
  `FunctionReference | FunctionReference_future` in 1.46; `FunctionArgs` /
  `FunctionReturnType` resolve through a conditional `ExtractSignature`.
  Generated `api` still emits `FunctionReference`, so kitcn callers see no
  change.
- Other public `.d.ts` deltas 1.44.0 -> 1.46.0: `optional()` doc comments and
  overload declarations on validators (validator kind set unchanged), a private
  `stagedValidator` field on schema, `version` constant. All additive.
- Convex 1.45.0+ declares `engines.node >=20`.
- `bun install` in a fresh worktree also re-resolved unrelated ranges (radix,
  msw removal, `@types/bun`); the committed lockfile edits only the seven convex
  lines and passes `bun install --frozen-lockfile`.
- `fixtures:sync` also picked up `lucide-react ^1.56.0` from the shadcn
  scaffold in six fixtures; generated output, kept in the fixtures commit.

Decisions and tradeoffs:
- Ceiling advances two minors (`<1.47.0`), one constant bump, honouring the
  #328 rule of no unbounded range; #458's `<1.46.0` would already be stale.
- `_args` reads stay: migrating to `FunctionArgs` changes generic inference
  through a conditional type and is not needed while the slot exists. Follow-up
  when Convex removes the slot.
- Lockfile edited surgically rather than committing a full re-resolve.

Implementation notes:
- `bun tooling/dependency-pins.ts sync --skip-validate` wrote every pin target.

Review fixes:
- Sol standards [P2]: the plan marked verification complete although `bun check`
  did not exit 0. Fixed: every `bun check` claim now names `check:ci` and
  `test:verify` and records the `test:runtime` waiver.

Error attempts:
| Error / failed attempt | Count | Next different move | Resolution |
|------------------------|-------|---------------------|------------|
| `typecheck:convex` minimum lane: missing `../dist/orm/index.js` | 1 | Build `packages/kitcn` | Resolved |
| `fixtures:sync`: missing `packages/resend/dist` | 1 | Build `packages/resend` | Resolved |

Verification evidence:
- `bun test packages/kitcn/src/cli/supported-dependencies.test.ts`: 13 pass, 0 fail; with the 1.44 constant: 5 pass, 8 fail.
- `bun run typecheck:convex`: exit 0 (1.46.0 lane, then 1.42.3 minimum lane).
- `bun install --frozen-lockfile`: exit 0.
- `bun run fixtures:sync`: exit 0.
- `bun check` on the pinned `bun@1.3.9`: `check:ci` passed (lint 980 files
  clean; typecheck 5/5; `bun test` 1558 pass / 0 fail; vitest 1081 pass, 14
  skipped; `test:cli` 124 pass; `test:concave`; `fixtures:check`), then
  `test:verify` passed. `bun check` exit 1: `test:runtime` could not start;
  its first scenario (`expo`) needs port 3210, held on the host by an
  unrelated Docker Convex backend. Waiver: not run locally, deferred to
  upstream CI on PR #484 (requesting session's ruling).
- Local `bun@1.4.3` fails the same 13 `bun test` cases on unmodified
  `origin/main` (1543 pass / 13 fail there, 1545 / 13 here); all 13 pass on
  `bun@1.3.9`. Runtime drift, not this diff.

Source-listed case matrix:
| Case | Source claim | Harness | Before | Expected after | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Peer covers 1.45 and 1.46 | supported-dependencies test, manifests | `<1.45.0` | `>=1.42 <1.47.0` | test + `packages/*/package.json` | done |
| 2 | Installed 1.45.0 / 1.46.0 not warned | new `test.each` | warned | no warning | 13/0 | done |
| 3 | 1.47 still warned | moved sentinels | n/a | warns | 13/0 | done |
| 4 | 1.42 floor kept | test `minimum`, `minimumType` | `>=1.42`, 1.42.3 | unchanged | test | done |
| 5 | Types hold at 1.46 | `typecheck:convex` | n/a | exit 0 both floors | Verification evidence | done |
| 6 | Scaffolds and fixtures on 1.46.0 | pins sync, `fixtures:sync` | 1.44.0 | 1.46.0 | diff | done |

Final handoff contract:
- Commit line: `chore(deps): support convex 1.45 and 1.46`; `chore(fixtures): sync convex 1.46.0`
- PR line: PR #484 (draft); supersedes #458
- Issue line: 🐛 Fixes ➖ N/A
- Confidence line: 🟡 80-94% confidence (`test:runtime` waived to upstream CI)
- Flow table:
  - Reproduced: tests ➖ N/A support request, browser ➖ N/A
  - Verified: tests 🟢 dual-floor `typecheck:convex`, `check:ci` and `test:verify`; `test:runtime` waived to upstream CI; browser ➖ N/A
- Browser check: N/A: no browser surface
- Outcome: kitcn supports Convex 1.45.x and 1.46.x; scaffolds use 1.46.0.
- Caveat: Convex 1.45+ needs Node 20; `_args` slot deprecated upstream; `test:runtime` not run locally (port 3210 held on the host by an unrelated backend); deferred to upstream CI by explicit waiver.
- Design:
  - Chosen boundary: `SUPPORTED_CONVEX_VERSION`
  - Why not quick patch: manifests are derived and revert on the next pins sync
  - Why not broader change: `_args` migration is not needed while the slot exists
- Verified: see Verification evidence
- PR body verified: PR #484 body set by the requesting session

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
- Commit: two commits on `chore/support-convex-1-46`
- PR: #484 (draft)
- Issue: N/A: no issue
- Browser proof: N/A: no browser surface
- Caveats: Node 20 floor from Convex 1.45; `_args` deprecation follow-up;
  `test:runtime` waived to upstream CI

Timeline:
- 2026-10-13T19:43:12.494Z Task goal plan created.
- 2026-10-13 Constant bumped, pins synced, lockfile edited, tests updated, changeset added.
- 2026-10-13 Dual-floor typecheck, fixtures sync, `check:ci` and `test:verify`
  passed; `test:runtime` blocked by host port 3210.
- 2026-10-13 Draft PR #484 opened; Sol review fix round: `test:runtime`
  recorded as waived to upstream CI.

Reboot status:
| Question | Answer |
|----------|--------|
| Where am I? | Review fix round on draft PR #484 |
| Where am I going? | PR #484 ready; upstream CI runs `test:runtime` |
| What is the goal? | Support Convex 1.45.x and 1.46.x with the 1.42 floor kept |
| What have I learned? | See Findings |
| What have I done? | See Timeline |

Open risks:
- Failure mode: an app on Convex 1.46 passes a `FunctionReference_future` to a
  kitcn caller; kitcn types take `FunctionReference`, so it is rejected at
  compile time. Generated `api` never emits that type, so only hand-typed
  references hit it. Proof: `typecheck:convex` at both floors.
- Convex 1.45+ requires Node 20; kitcn declares no `engines.node`.
- `typecheck:convex` is outside `bun check`; run manually here.
- `test:runtime` not run locally (port 3210 held on the host by an unrelated backend); deferred to upstream CI by explicit waiver; a runtime regression would surface only there.
