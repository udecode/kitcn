# 418 bound auth adapter count

Objective:
Stop the Better Auth Convex adapter's `count()` from paginating every matching
row 200 at a time. Route countable shapes to a bounded count on both adapter
variants, and pin the read bound with a regression test.

Goal plan:
docs/plans/418-bound-auth-adapter-count.md

Template:
docs/plans/templates/task.md

Primary template:
docs/plans/templates/task.md

Applied packs:
- package-api (docs/plans/templates/packs/package-api.md)

Task source:
- type: GitHub issue
- id / link: #418 https://github.com/udecode/kitcn/issues/418
- title: Auth: `adapter.count()` walks every matching row 200 at a time; the
  dbAdapter variant accumulates them into one read set
- task type: bug (read amplification / transaction read-limit failure)
- acceptance criteria: `count()` stops being `O(matching rows)` for the shapes
  it can bound; the dbAdapter stops accumulating every matching row into one
  transaction read set; counts stay exact; unsupported shapes still work.
- caveats: 0 comments on the issue. The issue itself enumerates 7 blocking
  facts and proposes a layered fix; step 3 (emitting `aggregateIndex` from the
  auth schema generators) is explicitly optional.
- likely files: packages/kitcn/src/auth/adapter.ts,
  packages/kitcn/src/auth/create-api.ts,
  packages/kitcn/src/auth/create-client.ts,
  packages/kitcn/src/auth/adapter.test.ts, CLI auth scaffold templates,
  fixtures/**, .changeset/**
- browser surface: none (server-side read path)
- root-cause layer: Convex query read shape inside the Better Auth adapter

Timed checkpoint:
- requested duration: N/A; none requested
- semantics: N/A
- initial confidence score: 70% before investigation
- improvement loop: 13-agent source workflow, red/green read-bound test,
  autoreview, full gate
- final score / loop closure: 95-100% on the measured read-bound claim

Completion threshold:
- Both adapter variants serve every bounded-able `count()` shape without a
  per-row read, the fallback stays correct for shapes that cannot be bounded, a
  regression test pins the read bound in both directions, and package build +
  typecheck + targeted tests + `bun check` are green.
- Task closure is legal only when the source-of-truth acceptance criteria are
  satisfied or explicitly narrowed, required verification evidence is recorded,
  code-review and release-artifact gates are closed when applicable, verified
  code changes are committed and PR'd unless explicitly declined or blocked,
  task-style PR body sync is complete or marked N/A with reason,
  GitHub issue/PR sync is complete or marked N/A with reason, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/418-bound-auth-adapter-count.md` passes.

Verification surface:
- `bun test packages/kitcn/src/auth/` (adapter unit + any new read-bound test),
  `bun --cwd packages/kitcn build`, `bun typecheck`, `bun lint:fix`,
  `bun check`, plus fixtures sync/check if scaffold output changes.

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
- Source of truth: GitHub issue #418.
- Allowed edit scope: packages/kitcn/src/auth/**, packages/kitcn CLI auth
  scaffold templates, fixtures/** (regenerated only), .changeset/**,
  docs/plans/**, packages/kitcn/skills/kitcn/** + www/** if public guidance
  changes.
- Browser surface: none.
- GitHub issue sync: PR #423 closes #418 via the commit trailer.
- Non-goals: the issue's step 3 (teaching `create-schema-orm.ts` to emit
  `aggregateIndex(...)` for better-auth count shapes) unless the investigation
  proves it is required to bound the dominant caller; unrelated `findMany`
  read amplification elsewhere in the adapter.

Output budget strategy:
- The heavy source investigation ran as a 13-agent workflow returning
  schema-constrained claim lists; raw agent output stayed in the workflow
  journal. Direct greps are head-capped.

Blocked condition:
- If no honest harness can measure adapter read counts and no bounded count is
  reachable from the adapter ctx without a breaking scaffold change the user
  has not authorized, stop and report rather than shipping an unproven reroute.

Task state:
- task_type: bug (read amplification)
- task_complexity: non-trivial
- current_phase: closeout
- current_phase_status: complete
- next_phase: closeout
- goal_status: complete

Current verdict:
- verdict: valid, fixed
- confidence: 95-100% on the measured read-bound claim
- next owner: task
- reason: unfiltered count 250 reads -> 0; aggregate-indexed filtered count
  200 reads -> <= 4. Both measured red/green with convex-test.

Implementation readiness:
- verdict: ready
- exact owner: `countHandler` in packages/kitcn/src/auth/create-api.ts plus the
  `count` internal query it registers; both adapter `count` bodies delegate to
  it.
- contradiction status: one resolved. The issue asserts the httpAdapter needs
  a new function reference and the dbAdapter can call a bounded count
  directly. Verified true, and the reason matters: Better Auth's routes run in
  `httpActionGeneric` (registerRoutes.ts:133), so `isQueryCtx` is false and all
  six upstream call sites take the httpAdapter. Fixing only the dbAdapter would
  have missed every real caller.
- source-listed cases complete: yes

Pre-solution issue challenge:
- reporter claim: both adapter variants implement `count()` by walking every
  matching row 200 at a time; the dbAdapter accumulates every page into one
  transaction read set and eventually trips Convex's per-transaction read
  limit.
- suggested diagnosis or fix: layered. (1) native count for an empty `where`,
  with a new bounded count function reference for the httpAdapter; (2) opt-in
  ORM count for filtered shapes, dbAdapter only; (3) only then consider
  emitting `aggregateIndex` from the auth schema generators.
- repro ladder:
  - tests / source-level repro: packages/kitcn/src/auth/adapter.count.vitest.ts
    against convex-test. RED measured 250 document reads for an unfiltered
    count over 250 users and 200 reads for an aggregate-indexable filtered
    count over 200 matches.
  - repo-owned automated browser or integration proof: N/A, server read path.
  - Browser plugin: N/A, no rendered output.
  - screenshot / visual proof: N/A.
- reproduction verdict: valid
- validity verdict: valid
- best long-term fix boundary: one `countHandler` owner that answers "can this
  shape be bounded, and if so what is it", shared by both adapter variants.
  Returning `null` for an unboundable shape keeps the walk as the fallback and
  leaves room to bound more shapes later without touching either adapter or the
  generated surface again.
- harsh honest feedback: the issue is accurate on every checkable claim, but it
  understates its own severity in one place and overstates the cost in another.
  Understated: it frames the httpAdapter's problem as "N/200 network round
  trips", implying the dbAdapter is the broken one. In fact Better Auth serves
  its routes from `httpActionGeneric`, so all six upstream call sites take the
  httpAdapter — the "less broken" path is the only one that runs in practice,
  which makes the new function reference mandatory rather than optional.
  Overstated: step 2 is described as dbAdapter-only because the internal query
  has no `ctx.orm`. That is true of `findMany`/`findOne`, but the fix is a
  three-line `customQuery` wrap on the new function alone, so the filtered path
  reaches the httpAdapter too without widening any existing read's ctx.
- hard-stop decision: proceed

Completion rule:
- Do not call `update_goal(status: complete)` while any required checklist item
  remains unchecked. If an item does not apply, check it and add `N/A: <reason>`.
- Do not call `update_goal(status: complete)` until every completion threshold
  above is satisfied, final handoff evidence is recorded, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/418-bound-auth-adapter-count.md` passes.
- Do not create hook state for this goal. This file plus the active goal are the
  durable state.

Start Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| Timed checkpoint parsed | no | N/A: no duration requested |
| Walkthrough baseline for possible UI change | no | N/A: server read path; no UI or rendered output |
| Skill analysis before edits | yes | task + autogoal + changeset + autoreview; no niche skill needed |
| Active goal checked or created | yes | this plan |
| Source of truth read before edits | yes | attachment + `gh issue view 418` |
| Exact per-PR task ownership | yes | This plan owns exactly one PR: #423 |
| GitHub comments and attachments read | yes | issue has 0 comments; attachment read |
| Video transcript evidence required | no | N/A: no video evidence |
| Pre-solution issue challenge required | yes | recorded above; verdict valid |
| Reproduction verdict before implementation | yes | RED at 250 / 200 document reads |
| Repro escalation ladder selected | yes | source-level convex-test repro sufficed |
| Suggested fix reviewed against durable boundary | yes | steps 1 and 2 taken with a shared `countHandler` owner; step 3 deferred with reasons |
| `docs/solutions` checked for non-trivial existing-code work | no | N/A: docs/solutions does not exist in this repo |
| TDD decision before behavior change or bug fix | yes | red/green read-count vitest + unit tests for the translation layer |
| Branch decision for code-changing task | yes | renamed issue-418 -> fix/bound-auth-adapter-count before the first push, per the user's branch-name convention |
| Release artifact decision | yes | `.changeset/lucky-pugs-attack.md`, minor |
| Browser tool decision for browser surface | no | N/A: no browser surface |
| Commit / PR expectation decision | yes | User initially declined PRs by standing preference, then explicitly requested one; committed, pushed, opened #423 |
| Task-style PR body decision | yes | PR #270 emoji task-style body used |
| Task-plan PR body evidence | yes | Body line `🧭 Task plan: docs/plans/418-bound-auth-adapter-count.md`; plan present at PR head and names PR #423 |
| GitHub issue sync expectation decision | yes | `Closes #418` trailer on the commit; PR body links the issue |
| Output budget strategy recorded | yes | recorded above |
| Package/API pack selected | yes | package-api |
| Public surface or package boundary identified | yes | `AuthFunctions` gains `count`; the generated auth runtime exports a new internal query |
| Convex entry/import graph impact identified | yes | `count-plan.ts` imports only `../orm/index-utils` (a 20-line leaf plus type-only table types); no aggregate runtime is pulled into the auth entry |
| CLI/scaffold/generated impact identified | yes | codegen procedure list + emitted destructure; 12 fixture files, 3 example generated files, root `convex/generated/auth.ts` |
| Release artifact path selected | yes | `.changeset/lucky-pugs-attack.md` |
| `changeset` skill loaded when `.changeset` is required | yes | `.agents/rules/changeset.mdc` read and followed |
| Package build / fixture impact decision recorded | yes | `bun --cwd packages/kitcn build`, `bun --cwd packages/resend build`, `bun run fixtures:sync`, `bun run fixtures:check` |

Work Checklist:
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

Completion Gates:
| Gate | Applies | Required action | Evidence |
|------|---------|-----------------|----------|
| Named verification threshold | yes | Run the command, proof, source audit, or artifact check named in this plan | `bunx vitest run --project integration packages/kitcn/src/auth/adapter.count.vitest.ts` red 250/200 reads, green 0/<=4 |
| Exact per-PR task ownership | yes | Record the exact PR and dedicated plan, or the not-yet-created single-PR slice | This plan owns exactly one PR: #423 |
| Pre-solution issue challenge verdict | yes | Record reporter claim, suggested fix, repro verdict, validity verdict, durable boundary, and hard-stop/pivot decision before implementation | recorded above; verdict valid |
| Repro escalation ladder | yes | Record test/source-level, automated browser/integration, Browser, and screenshot outcomes | source-level convex-test repro reproduced it; browser/visual N/A |
| Bug reproduced before fix | yes | Record failing test/repro or N/A with reason | RED: `expected 250 to be +0` and `expected 200 to be less than or equal to 4` |
| Targeted behavior verification | yes | Run focused test/proof for changed behavior or record N/A | 4 new vitest cases, 25 new bun cases; `bun test packages/kitcn/src/auth/` 172 pass |
| TypeScript or typed config changed | yes | Run relevant typecheck | `bun typecheck` 5/5 turbo tasks successful |
| Package exports or file layout changed | yes | Run the relevant package build before final verification and keep generated updates | `bun --cwd packages/kitcn build` 72 files; `bun --cwd packages/resend build` |
| Package manifests, lockfile, or install graph changed | no | Run `bun install` and relevant package checks | N/A: no manifest or lockfile change |
| Agent rules or skills changed | no | Run `bun install` and verify generated skill sync | N/A: no `.agents/**` change |
| Workspace authority proof | yes | Run verification in the owning repo/package/app/route/tool and record cwd | all commands from repo root /Users/mikey/conductor/workspaces/kitcn/tunis-v1; example codegen from example/ via the local `packages/kitcn/dist/cli.mjs`, never `bunx kitcn` |
| Browser surface changed | no | Capture Browser Use proof or record explicit waiver/blocker | N/A: server read path |
| Browser final proof | no | Attach screenshot or exact browser verification caveat | N/A: no browser surface |
| UI walkthrough | no | Run walkthrough if UI or rendered output changed | N/A: no UI or rendered output change |
| Scaffold or fixture output changed | yes | Run `bun run fixtures:sync` and `bun run fixtures:check`, or record N/A | fixtures:sync regenerated 12 files (8 `auth.ts` + 4 `auth.runtime.ts`), diff is only the `count` addition; fixtures:check green inside `bun check` |
| Package behavior or public API changed | yes | Add a changeset or record why no changeset applies | `.changeset/lucky-pugs-attack.md`, minor, with the redeploy note |
| Docs and kitcn skill sync changed | no | Keep `www/**` and `packages/kitcn/skills/kitcn/**` in sync, or record N/A | N/A: no doc or skill file enumerates the auth runtime export list. `www/content/docs/auth/server.mdx:470` and `www/content/docs/cli/backend.mdx:157-159` name only `rotateKeys`/`getLatestJwks` as CLI commands |
| Docs or content changed | no | Verify source-backed claims, links, examples, rendered output | N/A: no docs changed |
| High-risk mini gate | yes | Record realistic failure mode, proof plan, and why the chosen boundary is right | recorded below under High-risk note |
| Agent-native review for agent/tooling changes | no | Load agent-native-reviewer for `.agents/**` etc. | N/A: no agent/tooling surface changed |
| Local install corruption suspected | no | Run `bun install` once and rerun | N/A: no corruption signals. The two `fixtures:sync` failures were a missing `packages/resend/dist` and a network reset cloning shadcn-ui/ui, both diagnosed and resolved |
| Commit created | yes | Create a commit for verified code-changing work | 1468f880 `fix(auth): bound adapter count instead of walking every row`, whole checkout staged |
| PR create or update | yes | Run `check`, push, create or update the PR | `bun check` exit 0 on this code; https://github.com/udecode/kitcn/pull/423 |
| Task-style PR body verified | yes | Verify with `gh pr view --json body` | re-read after creation; auto-release block preserved, no self-link, PR #270 emoji format |
| PR task evidence verified | yes | Verify body plan line, plan at PR head, exact PR ownership | body names the plan; plan is in the PR head commit and names #423 |
| PR proof image hosting | no | Replace local image paths with hosted URLs | N/A: no browser proof |
| GitHub issue sync-back | yes | Post concise issue sync after PR exists, or record N/A/blocker | `Closes #418` trailer links PR #423 to the issue |
| Final handoff contract | yes | Fill the final handoff fields below | filled below |
| Final lint | yes | Run `bun lint:fix` or scoped equivalent | `bun lint:fix` 949 files checked |
| Output budget discipline | yes | Verify no unbounded output was streamed | workflow output read from the journal as claim lists; greps head-capped; one 42 KB read was auto-persisted to a file and read back |
| Timed checkpoint | no | Keep improving until elapsed if a duration was requested | N/A: no duration requested |
| Autoreview for non-trivial implementation changes | yes | Load autoreview and close accepted/actionable findings | `--mode local --engine claude` clean, no accepted/actionable findings, trufflehog clean |
| Goal plan complete | yes | Run `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/418-bound-auth-adapter-count.md` | run below |
| Public API / package boundary proof | yes | Source-audit public API, exports, and package boundary impact | `AuthFunctions` gains `count`; every hand-maintained list updated: `AUTH_RUNTIME_PROCEDURE_TYPES`, `resolveAuthFunctions`, `createDisabledAuthRuntime`, `AUTH_RUNTIME_PROCEDURES`, and the emitted destructure |
| Convex bundle/import proof | yes | Audit affected function-entry static graphs or record N/A | `count-plan.ts` imports `getAggregateIndexes` from `orm/index-utils` (20-line `timestamp-mode` value import plus type-only table types). No `orm/aggregate-index` runtime import is added to the auth entry; the ORM count is reached through `ctx.orm`, which the app already carries |
| CLI/scaffold/generated proof | yes | Prove command contract and regenerate owned output | example codegen + fixtures:sync run with the locally built CLI; regenerated diffs inspected and contain only the `count` addition |
| Release artifact classification | yes | Record whether the change is published package behavior/API/types/config/runtime | published package behavior + generated-output contract change |
| Published package changeset | yes | Add/update one `.changeset/*.md` per package | `.changeset/lucky-pugs-attack.md` |
| No release artifact | no | Record the exact reason | N/A: a changeset exists |
| Package typecheck/build/test | yes | Run owning package checks | build + `bun typecheck` + `bun run test:bun` 1339 pass + `bun run test:vitest` 875 pass |
| Fixture/scaffold generation | yes | Run `bun run fixtures:sync` and `bun run fixtures:check` | both run; sync regenerated 12 files, check green inside `bun check` |
| Docs/package skill sync | no | Synchronize current-state public guidance | N/A: no public guidance enumerates the auth exports |

Phase / pass table:
| Phase | Status | Evidence | Next |
|-------|--------|----------|------|
| Intake and source read | complete | attachment + `gh issue view 418`; 13-agent source workflow | implementation |
| Implementation | complete | 7 source files changed, 3 added, 16 generated files regenerated | verification |
| Verification | complete | red/green read proof, 1339 bun + 875 vitest tests, typecheck, lint, `bun check` exit 0 | closeout |
| Commit / PR / GitHub sync | complete | 1468f880 pushed to fix/bound-auth-adapter-count; PR #423 opened with the task-style body | final response |
| Closeout | complete | autoreview + check-complete | final response |

Findings:
- Better Auth serves its routes from `httpActionGeneric`
  (packages/kitcn/src/auth/registerRoutes.ts:133). An ActionCtx has no `db`, so
  `isQueryCtx` is false and `create-client.ts:61` picks `httpAdapter`. All six
  upstream `count()` call sites therefore take the httpAdapter, which makes the
  new `AuthFunctions.count` reference mandatory rather than optional. Fixing
  only the dbAdapter would have fixed the path almost nothing takes.
- Convex's native count is `ctx.db.query(table).count()`, the `1.0/count`
  syscall. It needs no ORM, no aggregate capability, and no aggregate index, so
  it also works on a plain `defineTable` auth schema. It is internal API and
  absent from Convex's published typings, hence the probe-and-fall-back shape
  copied from `orm/query.ts:3085-3095`.
- `count()` exists only on `QueryInitializerImpl`, not on `QueryImpl`
  (node_modules/convex/dist/esm-types/server/impl/query_impl.d.ts). There is no
  `withIndex(...).count()`, so a filtered count can never use the syscall. That
  is the whole reason filtered shapes need an aggregate index.
- `createApi`'s `context` hook was wired only into `mutationBuilder`
  (create-api.ts:1095-1104); `findMany`/`findOne` use bare
  `internalQueryGeneric` and therefore have no `ctx.orm`. Wrapping only the new
  `count` with `customQuery` gives it an ORM without changing any existing
  read's ctx.
- `withOrm` is typed for `ServerQueryCtx | ServerMutationCtx`
  (example/convex/functions/generated/server.ts:54) and `wrapDB` short-circuits
  for readers (orm/lifecycle.ts:848-851), so applying it to a query is the same
  thing every cRPC query already does.
- `Object.create(db)` in `orm/database.ts:229` and
  `query: innerDb.query.bind(innerDb)` in `orm/lifecycle.ts:671` both preserve
  the real query initializer, so `ctx.db.query(t).count()` still reaches the
  syscall through an ORM-wrapped ctx.
- Aggregate index matching is exact set, not prefix
  (orm/aggregate-index/runtime.ts:987-1002 `pickAggregateIndex`), and
  `supportsMetric` returns true for `count` on any aggregate index. So a static
  field-set comparison against `getAggregateIndexes()` is an exact predicate for
  "will this count resolve".
- A declared aggregateIndex guarantees the aggregate capability is registered,
  because `createOrmDbLifecycle` fails closed otherwise
  (orm/create-orm.ts:298-300). That is what keeps the catch narrow: the
  capability error is a plain `Error` with no `COUNT_` prefix and would
  otherwise have to be swallowed by message match.
- `resolveAuthFunctions` reads `internal[moduleName]`, which is Convex's
  `anyApi` proxy, so `existing.count` is always truthy and the `??` fallback is
  dead in real apps. A stale generated `auth.ts` produces no type error, only a
  runtime missing-function error. This is why the changeset leads with the
  redeploy requirement.
- Six upstream call sites, all in better-auth 1.6.18: `countTotalUsers`
  (db/internal-adapter.mjs:141, `where` may be `undefined`), `listMembers`
  (plugins/organization/adapter.mjs:103), `countTeamMembers` (:472),
  `countMembers` (:481), the team-capacity threshold (:550), and the role count
  (plugins/organization/routes/crud-access-control.mjs:93). Zero of them set
  `connector: 'OR'`.
- `example/convex/functions/generated/procedure-names.gen.ts` carried
  pre-existing line-number drift for `organization.ts` and `todoComments.ts`.
  Confirmed unrelated by regenerating with the source edits stashed; codegen
  corrected it as a side effect.

Decisions and tradeoffs:
- Chose one `countHandler` that returns `number | null` over two adapter-local
  implementations. `null` means "no bounded shape available", which keeps the
  existing walk as the fallback and lets a future shape be bounded without
  touching either adapter, `AuthFunctions`, or the generated surface again.
- Kept the caller-driven pagination loop for the httpAdapter fallback rather
  than collapsing it into one server-side walk. Each page is its own
  transaction today, which is exactly what keeps a large table from tripping the
  per-transaction read limit; collapsing it would convert a slow answer into a
  hard failure.
- Wrapped only the new `count` query with the context hook. Wrapping
  `findMany`/`findOne` too would be more symmetric but changes the ctx of two
  hot existing reads for no gain in this task.
- Restricted the translation to equality on plain scalars. `in` and range
  operators are representable in the ORM, but each one is a chance to pass the
  static field-set pre-check and still hit `COUNT_FILTER_UNSUPPORTED` at
  runtime; equality covers every first-party filtered call site, and the walk
  answers the rest correctly.
- Left the OR branch untouched. Both adapters de-duplicate documents by id
  across OR clauses, and the ORM's finite-DNF OR sums buckets with no
  cross-branch de-duplication, so rerouting it would over-count on overlapping
  branches. No first-party caller uses OR, but user-land can.
- Treated the four `COUNT_*` errors as refusals to swallow and everything else
  as a real failure. A refusal is safe because the fallback produces the same
  number; a genuine error must not be masked as a silent perf loss.
- Did NOT emit `aggregateIndex(...)` from the auth schema generators (the
  issue's step 3). Declaring one flips codegen's `hasAggregateIndexes`, which
  adds `aggregateCapability()` to `generated/server.ts` and pulls the aggregate
  runtime into every function entry of every auth app, including apps that never
  count. It also requires a backfill before any count works, and exact-set
  matching means no fixed generated set can cover the caller-chosen filter
  fields `listMembers` and admin list-users append. Recorded as a follow-up.
- Did NOT add a try/catch fallback around the httpAdapter's `runQuery` to a
  stale deployment. That is a back-compat shim, which repo doctrine rejects, and
  it would permanently mask genuine deployment errors. The changeset carries the
  redeploy note instead.

Implementation notes:
- packages/kitcn/src/auth/count-plan.ts (new): `toOrmCountWhere` translates a
  Better Auth `Where[]` into an ORM count where object or `null`;
  `hasExactAggregateIndex` compares a field set against declared aggregate
  indexes; `isBoundedCountRefusal` classifies the four `COUNT_*` errors.
- packages/kitcn/src/auth/create-api.ts: `countHandler` (exported) plus a
  private `nativeTableCount`; a `countQueryBuilder` that applies the caller's
  context hook; `count` registered as the first entry of the returned api.
- packages/kitcn/src/auth/adapter.ts: both `count` bodies try the bounded path
  after the OR branch and fall through to the existing walk on `null`. The
  stale "count is just findMany returning a number" comment is gone.
- packages/kitcn/src/auth/create-client.ts, generated-contract.ts,
  generated-contract-disabled.ts, cli/codegen.ts: the five hand-maintained
  lists that must agree about the auth procedure set.
- Regenerated: 12 fixture files, 3 example generated files, root
  convex/generated/auth.ts. `example/convex/functions/_generated/api.d.ts` is
  Convex's own output and needs a live deployment, so its `count` entry was
  added by hand to match the registered validators.
- Tests: count-plan.test.ts (24 cases), 6 count cases in
  create-api.factory.test.ts, 2 rewritten httpAdapter dispatch cases in
  adapter.test.ts, adapter.count.vitest.ts (4 read-bound cases), one codegen
  assertion linking the two hand-maintained procedure lists.

Review fixes:
- See Verification evidence for the autoreview outcome.

Error attempts:
| Error / failed attempt | Count | Next different move | Resolution |
|------------------------|-------|---------------------|------------|
| `shape.paginate > 0` asserted the fallback ran, but `paginate` is not the terminal call the read path uses | 1 | Measure `countDocumentReads` instead of the call name | Fallback tests now assert document reads scale with matches |
| `bun run fixtures:sync` died on missing `packages/resend/dist` | 1 | Build the second workspace package too | `bun --cwd packages/resend build` |
| `fixtures:sync` network reset cloning shadcn-ui/ui | 2 | Retry; the sync is incremental per fixture | Third attempt completed all 8 fixtures |
| `bun --cwd example codegen` could not find the `kitcn` bin | 1 | Invoke `packages/kitcn/dist/cli.mjs` directly, never `bunx kitcn` | Local CLI ran codegen |

Verification evidence:
- RED (adapter rewiring stashed, everything else in place):
  `expected 250 to be +0` for the unfiltered count over 250 users, and
  `expected 200 to be less than or equal to 4` for the aggregate-indexed
  filtered count over 200 matching users.
- GREEN: unfiltered count reads 0 documents and calls the native syscall
  exactly once; the aggregate-indexed filtered count reads <= 4 documents,
  flat in the match count.
- Both fallback cases assert the exact number and that reads scale with
  matches, so a future translation bug cannot silently return a wrong bounded
  answer.
- `bunx vitest run --project integration packages/kitcn/src/auth/adapter.count.vitest.ts`
  -> 4 passed.
- `bun test packages/kitcn/src/auth/` -> 172 passed across 16 files.
- `bun test packages/kitcn/src/cli/codegen.test.ts` -> 75 passed.
- `bun run test:bun` -> 1339 passed, 0 fail.
- `bun run test:vitest` -> 875 passed, 13 skipped, no type errors.
- `bun typecheck` -> 5/5 turbo tasks successful.
- `bun lint:fix` -> 949 files checked.
- `bun check` -> exit 0 (lint, typecheck, tests, CLI tests, Concave smoke,
  fixtures:check, verify scenario, runtime scenarios).
- Fixture diff audit: `git diff fixtures/` contains only 8 `count,` lines and
  4 `"count": [...]` registry lines.

Source-listed case matrix:
| Case | Source claim | Harness | Before | Expected after | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| httpAdapter unfiltered | one runQuery per 200 rows | adapter.test.ts dispatch test | 2 runQuery calls for 205 rows | 1 bounded call, findMany never runs | handle-aware mock throws if findMany runs | done |
| httpAdapter unboundable | must stay correct | adapter.test.ts dispatch test | 205 | 205 via 1 count + 2 findMany | `toHaveBeenCalledTimes(3)` | done |
| dbAdapter unfiltered | every page in one read set | adapter.count.vitest.ts, 250 users | 250 document reads | 0 reads, 1 native count | red/green measured | done |
| dbAdapter filtered, indexed | O(matching rows) | adapter.count.vitest.ts, 200 matches | 200 document reads | <= 4 reads | red/green measured | done |
| dbAdapter filtered, unindexed | must stay exact | adapter.count.vitest.ts | 200 reads | 200 reads, exact 200 | native count never called | done |
| plain non-ORM schema | no ORM available | adapter.count.vitest.ts | 12 reads | unfiltered bounded, filtered walks | both asserted | done |
| `countTotalUsers` with `contains` | not aggregate-indexable | count-plan.test.ts | walk | walk | operator table test | done |
| OR count | de-duplicates by id | adapter.test.ts | dedupe to 1 | unchanged, bounded path never reached | `not.toHaveBeenCalledWith('count', ...)` | done |
| mixed OR/AND | must still throw | adapter.test.ts (both variants) | throws | throws | unchanged tests pass | done |
| index still backfilling | must not take auth offline | create-api.factory.test.ts | n/a | falls back | `COUNT_INDEX_BUILDING` case | done |
| genuine ORM failure | must not be masked | create-api.factory.test.ts | n/a | rethrows | `rejects.toThrow('boom')` | done |

High-risk note:
- Realistic failure mode: a user regenerates `generated/auth.ts` but does not
  redeploy. `authFunctions.count` then resolves to `generated/auth:count` on a
  backend that does not export it, and every Better Auth count fails at request
  time. TypeScript cannot catch this, because destructuring a subset of
  `authRuntime` is legal and `internal` is an `anyApi` proxy.
- Proof plan: the changeset leads with the redeploy requirement under
  `## Breaking changes` with the regenerated snippet, and the release is minor.
- Why the boundary is still right: the alternative, catching the missing
  function and falling back, is a permanent back-compat shim that would mask
  genuine deployment errors forever to save one redeploy during a closed-alpha
  upgrade.
- Second risk: the native count reads through raw `ctx.db` and so ignores RLS,
  while the ORM's filtered count refuses RLS tables outright. The two agree in
  practice because the existing walk also reads through raw `ctx.db` via
  `stream(ctx.db, schema)`, so the bounded path has exactly the visibility the
  path it replaces had. An RLS-scoped auth table makes the filtered path decline
  and fall back to that same walk.


Final handoff contract:
- Commit line: 1468f880 fix(auth): bound adapter count instead of walking every row
- PR line: https://github.com/udecode/kitcn/pull/423
- Issue line: #418, closed by the PR's `Closes #418` trailer
- Confidence line: 95-100%
- Flow table:
  - Reproduced: tests RED at 250 and 200 document reads, browser N/A
  - Verified: tests GREEN at 0 and <=4 reads, plus 1339 bun and 875 vitest, browser N/A
- Browser check: N/A - server read path, no rendered output
- Outcome: Better Auth's `count()` no longer walks every matching row. An
  unfiltered count is answered by Convex's native table count and reads no
  documents; a filtered count whose field set exactly matches a declared
  `aggregateIndex` reads a constant number of buckets. Both adapter variants
  share one owner, and every shape neither can bound still walks pages and
  returns the same number.
- Caveat: the generated auth runtime gains an internal `count` query, so
  `kitcn codegen` plus a redeploy is required before upgrading. Filtered counts
  stay linear unless the app declares a matching `aggregateIndex`; the auth
  schema generators still emit none.
- Design:
  - Chosen boundary: `countHandler` in create-api.ts, returning `number | null`,
    called in-process by the dbAdapter and through a new internal query by the
    httpAdapter.
  - Why not quick patch: rerouting inside each adapter would have duplicated the
    shape analysis, and fixing only the dbAdapter would have missed every real
    caller, because Better Auth serves its routes from `httpActionGeneric`.
  - Why not broader change: emitting `aggregateIndex` from the auth schema
    generators pulls the aggregate runtime into every function entry of every
    auth app and needs a backfill before any count works, and exact-set matching
    means it still cannot cover caller-chosen filter fields.
- Verified: red/green read proof, focused auth and codegen suites, full bun and
  vitest suites, typecheck, lint, autoreview, `bun check` exit 0.
- PR body verified: `gh pr view 423 --json body` re-read after creation

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
- Commit: 1468f880 on fix/bound-auth-adapter-count
- PR: #423
- Issue: #418, closed by the PR trailer
- Browser proof: N/A
- Caveats: requires `kitcn codegen` + redeploy; filtered counts stay linear
  without a matching `aggregateIndex`

Timeline:
- 2026-08-21T21:21:37.514Z Task goal plan created.

Reboot status:
| Question | Answer |
|----------|--------|
| Where am I? | Closeout |
| Where am I going? | Final handoff; PR #423 open |
| What is the goal? | Stop the Better Auth adapter's count() walking every matching row |
| What have I learned? | See Findings |
| What have I done? | See Timeline |

Open risks:
- A regenerated `generated/auth.ts` without a redeploy breaks every Better Auth
  count at request time, and no typecheck catches it. Covered by the changeset's
  breaking-change note.
- Filtered counts on auth tables stay linear for every app that declares no
  matching `aggregateIndex`, which today is every scaffolded app. The bounded
  path is in place and opt-in; teaching the schema generators to emit the
  indexes is the deferred follow-up.
- Follow-ups NOT taken: emitting `aggregateIndex(...)` from
  `create-schema-orm.ts` for the shapes Better Auth counts, plus the
  `hasAggregateIndexes` bundle decision that comes with it; applying the context
  hook to `findMany`/`findOne` as well; supporting `in` and range operators in
  `toOrmCountWhere`.
- `example/convex/functions/generated/procedure-names.gen.ts` picked up
  pre-existing line-number drift for `organization.ts` and `todoComments.ts`.
  Verified unrelated to this diff by regenerating with the source edits stashed.

Hard closeout guard:
- A local-only final response for verified code-changing work is invalid unless
  this plan records an explicit user decline, no local patch, analytical/
  blocked/inconclusive outcome, or a real commit/PR blocker.
- Resolved: the user's standing preference declined PRs by default, then the
  user explicitly requested one. Committed as 1468f880, pushed to
  fix/bound-auth-adapter-count, opened as PR #423.
