# ORM lazy tables

Objective:
Build each kitcn ORM table on first use so a cold Convex call skips tables it never touches; definition errors still fail push and codegen; same public table API, one stable object per table.

Goal plan:
docs/plans/2026-11-03-orm-lazy-tables.md

PR: TBD

Template:
docs/plans/templates/major-task.md

Primary template:
docs/plans/templates/major-task.md

Applied packs:
- package-api (docs/plans/templates/packs/package-api.md)
- docs (docs/plans/templates/packs/docs.md)

Major source:
- type: single-PR task from a downstream ticket (no upstream issue)
- id / link: Linear TLS-22 (EfficiencyCorp); spike NIM-2520; prototype
  `EfficiencyCorp/kitcn@research/lazy-tables` (`d8eebd19`, Proxy based)
- title: lazy ORM table construction, so a cold Convex call skips tables it
  never touches
- decision to make: how tables defer construction without a `Proxy`, where
  definition validation and the aggregate-capability fail-closed check move,
  and which module-load walkers become per table
- decision criteria: same public API and table identity; validation still
  fails push and codegen; aggregate check never moves to the first mutation;
  ORM suites green; measured cold-start gain

Major lane:
- lane: benchmark / performance plus architecture (internal table runtime)
- output type: code change, tests, changeset, docs line, bench script
- implementation expected: yes
- affected packages / surfaces: `kitcn` (`orm/table`, `orm/relations`,
  `orm/lifecycle`, `orm/database`, `orm/schema`, `orm/rls/policies`,
  `orm/write-fanout`, `cli/codegen`)
- dominant risk: definition errors or RLS policies silently moving to runtime

Timed checkpoint:
- requested duration: N/A: no duration requested.
- semantics: N/A: one-shot task.
- initial confidence score: 60% after reading the prototype diff.
- improvement loop: full ORM vitest + bun suites after each layer; regression
  tests that fail on `upstream/main`.
- final score / loop closure: 90%; residuals in Open risks.

Completion threshold:
- `convexTable()` runs no extra config, validator or constraint work; a query
  context built from a 200-table schema builds no table until touched; a write
  builds only the table it writes; definition errors throw from
  `schema.export()`, `kitcn codegen` and `defineSchema(..., { eagerTables:
  true })`; `createOrm` without the aggregate capability still throws at
  creation; ORM integration and unit suites pass; bench shows the cold-start
  delta.
- Major-task closure is legal only when the decision criteria are satisfied or
  explicitly narrowed, facts/inference/recommendation are separated, required
  review or pressure passes are recorded, implementation gates are closed when
  code changed, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-11-03-orm-lazy-tables.md`
  passes.

Verification surface:
- `bun test packages/kitcn/src/orm` (incl. new `lazy-tables.test.ts`),
  `bunx vitest run` (ORM integration under `convex/orm`),
  `bun test packages/kitcn/src/cli/codegen.test.ts`, `bun lint`,
  `bun typecheck`, `bun check`, `node tooling/orm-table-bench.mjs` against a
  `upstream/main` build and this branch.

Constraints:
- No `Proxy`; memoised state on `ConvexTableImpl`.
- Comment-light; contract carried by code, tests, docs line and changeset.
- No Convex runtime change; no unrelated refactor.

Boundaries:
- Source of truth: TLS-22 scope items 1 to 6 and the build brief.
- Allowed edit scope: `packages/kitcn/src/orm/**`, `packages/kitcn/src/cli/codegen.ts`,
  `cli/utils/schema-tables.ts`, their tests, one docs line, skill mirror,
  changeset, `tooling/orm-table-bench.mjs`, this plan.
- External sources: N/A: repo source and the local `convex`/`convex-test`
  packages settle it.
- Browser surface: N/A: no UI.
- GitHub sync: PR opened by the session after review; this plan gets the number.
- Non-goals: downstream app changes, Convex runtime changes, making
  `.relations()` or schema chaining cheaper.

Output budget strategy:
- Test runs filtered to pass/fail summaries; profiles summarised by script.

Blocked condition:
- None hit. Would block on: a definition-time check that cannot be reached
  from `schema.export()`.

Major state:
- task_type: major
- task_complexity: major
- current_phase: closeout
- current_phase_status: in_progress
- next_phase: review lanes, then PR
- goal_status: active

Current verdict:
- verdict: implemented, pending external review
- confidence: 90%
- next owner: review lanes, then the session opens the PR
- reason: ORM suites green; residual risks recorded below

Completion rule:
- Do not call `update_goal(status: complete)` while any required checklist item
  remains unchecked. If an item does not apply, check it and add `N/A: <reason>`.
- Do not call `update_goal(status: complete)` until every completion threshold
  above is satisfied, final evidence is recorded, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-11-03-orm-lazy-tables.md`
  passes.
- Do not create hook state for this goal. This file plus the active goal are the
  durable state.

Start Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| Timed checkpoint parsed | no | N/A: no duration |
| Walkthrough baseline for possible UI change | no | N/A: no UI or rendered output |
| `major-task` loaded | yes | `.agents/skills/major-task/SKILL.md` read |
| Active goal checked or created | yes | this plan |
| Source of truth read before analysis | yes | TLS-22, NIM-2520 research report, prototype diff |
| Major lane selected | yes | performance + architecture |
| Decision criteria stated | yes | Major source |
| Existing repo patterns / prior decisions checked | yes | `skipRules` lazy getter in `database.ts`, `metaCache` WeakMaps, symbol metadata on tables |
| Helper stack selected | yes | autogoal plan, changeset rule |
| External research decision recorded | yes | N/A: repo + local deps |
| Implementation expectation recorded | yes | code-changing |
| Workspace authority selected | yes | worktree `feat/orm-lazy-tables` from `upstream/main` `b106267d` |
| Branch / PR expectation decided | yes | push to fork; session opens PR after review |
| Output budget strategy recorded | yes | above |
| Package/API pack selected | yes | applied |
| Public surface or package boundary identified | yes | `defineSchema` option `eagerTables`; error timing; `rlsPolicy().link()` |
| Convex entry/import graph impact identified | yes | no new imports except `rls/policies` -> `symbols` (leaf) |
| CLI/scaffold/generated impact identified | yes | codegen builds every table; generated output unchanged |
| Release artifact path selected | yes | `.changeset/orm-lazy-tables.md` |
| `changeset` skill loaded when `.changeset` is required | yes | `.agents/rules/changeset.mdc` |
| Package build / fixture impact decision recorded | yes | `bun --cwd packages/kitcn build`; no scaffold change |
| Docs pack selected | yes | applied |
| Docs guidance loaded | yes | `references/setup/doc-guidelines.md` |
| Docs lane selected | yes | one current-state line in schema options |
| Target docs and nearest sibling docs read | yes | `www/content/docs/orm/schema/index.mdx`, skill `references/features/orm.md` |
| Docs style doctrine read | yes | AGENTS docs rules |
| Documented source owner identified | yes | `orm/schema.ts` `SchemaOptions` |

Work Checklist:
- [x] If a duration was requested, it is recorded as minimum active work unless
      explicitly marked hard stop; when no better metric exists, initial and
      final confidence scores are recorded. N/A: no duration; scores recorded.
- [x] Objective includes outcome, completion threshold, verification surface,
      constraints, boundaries, and blocked condition.
- [x] Major source records source type, id/link, title, decision type, expected
      outcome, decision criteria, likely files/packages/surfaces, browser
      surface, and highest-leverage owner.
- [x] Current state is mapped before proposing a new architecture, migration,
      benchmark, or plan.
- [x] Existing repo patterns, prior decisions, and nearby implementation
      constraints are recorded before external research.
- [x] External docs or source are used only where repo evidence does not settle
      the question, or N/A reason is recorded.
- [x] Options, recommendation, tradeoffs, blast radius, and rejection reasons
      are recorded.
- [x] Facts, inference, and recommendation are separated.
- [x] Public API, service/runtime, auth/session/permission, canonical data,
      Convex graph, CLI/generated, docs/example, and proof surfaces are mapped
      or N/A with reason.
- [x] At least one happy path and one denied/failure path are traced through
      exact symbols when implementation readiness is claimed.
- [x] Review or pressure lenses are selected and completed, or marked N/A with
      reason. External review lanes run after push.
- [x] If implementation happens, touched-surface packs cover docs, browser,
      package/API, or agent-native surfaces as needed.
- [x] Workspace authority recorded: every proof command names the cwd/tool that
      owns the analyzed or changed behavior.
- [x] Output budget discipline recorded and followed: broad searches are
      scoped, capped, counted, or artifacted instead of streamed into goal
      context.
- [x] Accepted/actionable review findings are fixed or explicitly rejected with
      evidence. N/A until external review.
- [x] Package/API pack: public API, package boundary, export, and release-artifact impact are recorded.
- [x] Package/API pack: release artifact matrix is applied: `.changeset` or explicit no-artifact reason.
- [x] Package/API pack: `.changeset` work loads `changeset` and follows its package/version/prose rules.
- [x] Package/API pack: no-artifact decisions state why the diff has no published package user-visible delta from `main`. N/A: changeset added.
- [x] Package/API pack: compatibility, migration, or hard-cut decision is explicit when public shape changes.
- [x] Package/API pack: affected Convex static import graphs stay narrow and
      plugin/per-module boundaries are used where appropriate.
- [x] Package/API pack: CLI commands remain deterministic, `--json` capable,
      and non-interactive with explicit confirmation bypass when relevant.
- [x] Package/API pack: docs and `packages/kitcn/skills/kitcn/**` stay
      current-state synchronized when public guidance changes.
- [x] Package/API pack: package-owned typecheck/build/test proof is recorded or marked N/A with reason.
- [x] Package/API pack: `packages/kitcn` build, fixture sync/check, or other owning package proof is recorded when required.
- [x] Docs pack: docs lane, target docs, nearest sibling docs, and source owner are recorded.
- [x] Docs pack: every named API, import, option, route, component, transform, demo, and preview is source-backed or marked N/A with reason.
- [x] Docs pack: docs use current-state reference voice, not changelog voice.
- [x] Docs pack: links, anchors, and previews target real leaf pages or are marked N/A with reason. N/A: no links added.

Completion Gates:
| Gate | Applies | Required action | Evidence |
|------|---------|-----------------|----------|
| Named verification threshold | yes | Run the repo audit, benchmark, review, prototype, or artifact check named in this plan | Verification evidence below |
| Current-state source audit | yes | Map current owner, boundaries, constraints, and affected surfaces | Findings |
| Decision criteria closure | yes | Mark each criterion satisfied, narrowed, rejected, or blocked with evidence | Decisions and tradeoffs |
| Options / tradeoffs / rejection record | yes | Record viable options, chosen recommendation, and why alternatives lose | Decisions and tradeoffs |
| Review / pressure pass | yes | Run selected reviewer/lens or record N/A with reason | external review lanes after push |
| Review findings closure | yes | Fix or explicitly reject accepted/actionable findings and record closure proof | pending external review |
| External-source audit | no | Cite official/local clone/external sources when used, or record N/A | N/A: local `convex` and `convex-test` dist read |
| Implementation gates | yes | If code changed, close primary-template and touched-surface gates; otherwise N/A | tests, lint, typecheck, build, check steps |
| Service/API/auth/data-flow map | yes | Prove every architecture surface below or record N/A | map below |
| Final handoff contract | yes | Record recommendation, evidence, caveats, residual risk, and next owner | below |
| Final lint | yes | Run `bun lint:fix` or scoped equivalent when files changed | `bun lint` clean |
| Output budget discipline | yes | Verify no unbounded high-volume command output was streamed, or record the accidental output and recovery | filtered runs |
| Timed checkpoint | no | If duration was requested, keep improving until elapsed, then finish the current loop cleanly; otherwise N/A | N/A |
| Agent-native reviewer | no | Run when agent workflow changes or record N/A | N/A: no agent surface touched |
| UI walkthrough | no | If implementation changed UI or rendered output, run `.agents/skills/walkthrough/SKILL.md` after final proof and show annotated images in the final handoff; otherwise record N/A | N/A: no UI |
| Autoreview | yes | Run final review and close every accepted actionable finding | external review lanes after push |
| Goal plan complete | yes | Run `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-11-03-orm-lazy-tables.md` | pending PR number |
| Public API / package boundary proof | yes | Source-audit public API, exports, and package boundary impact | no export added or removed; `SchemaOptions.eagerTables` added |
| Convex bundle/import proof | yes | Audit affected function-entry static graphs or record N/A | only new static import: `rls/policies` -> `symbols` |
| CLI/scaffold/generated proof | yes | Prove command contract and regenerate owned output or record N/A | codegen test; generated output unchanged |
| Release artifact classification | yes | Record whether the change is published package behavior/API/types/config/runtime or no published user-visible delta | published runtime behavior + new option |
| Published package changeset | yes | If published package users see a delta, load `changeset` and add/update one `.changeset/*.md` per package | `.changeset/orm-lazy-tables.md` (minor) |
| No release artifact | no | If no artifact is needed, record the exact reason: internal-only, docs-only, agent-only, test-only, or no user-visible delta from `main` | N/A |
| Package typecheck/build/test | yes | Run owning package checks or record N/A with reason | see Verification evidence |
| Fixture/scaffold generation | no | Run `bun run fixtures:sync` and `bun run fixtures:check` when scaffold output changed, otherwise N/A | N/A: no scaffold change |
| Docs/package skill sync | yes | Synchronize current-state public guidance or record N/A | skill `references/features/orm.md` |
| Docs source-backed claim audit | yes | Verify docs claims against current source or record N/A | `schema.ts` `eagerTables`, `table.ts` `export()`, `cli/codegen.ts` |
| Docs links / routes / previews | no | Verify leaf links, routes, anchors, and preview names or record N/A | N/A: none added |
| Docs MDX/content parser | no | Run the relevant `www` docs parser/build for MDX/content changes, or record N/A | N/A: one prose line, no MDX syntax |
| Kitcn docs sync | yes | If `www/**` changed, update matching `packages/kitcn/skills/kitcn/**` content or record N/A | done |

Phase / pass table:
| Phase | Status | Evidence | Next |
|-------|--------|----------|------|
| Intake and source read | complete | TLS-22, research report, prototype diff | |
| Current-state map | complete | Findings | |
| Options and recommendation | complete | Decisions and tradeoffs | |
| Review / pressure pass | pending | external lanes | PR |
| Implementation or plan artifact | complete | commits on `feat/orm-lazy-tables` | |
| Verification | complete | Verification evidence | |
| Closeout | in_progress | PR number pending | PR |

Findings:
- Module-load walkers on `upstream/main`: every `convexTable()` resolved
  columns, built the `v.object` validator and ran the extra-config callback;
  `createRelationsHelper` built relation columns for every table;
  `createOrmDbLifecycle` scanned every table for aggregate/rank indexes at
  `createOrm`; `createDatabase` built one query builder per table and the
  foreign-key graph (every table's `getForeignKeys()`) on the first ORM context.
- `processRelations`, `extractRelationsConfig` and Convex `SchemaDefinition`
  touch only tables with relations, or none; unchanged.
- Readers of table internals: `stream.ts` reads `schema.tables[t].indexes`
  (Convex `TableDefinition` field shape); `convex-test` calls each table's
  `export()` at setup; mutation helpers use the `get*()` methods.
- Cross-table mutation in extra config: an `rlsPolicy(...).link(other)`
  returned from table A's extra config attached to table B only when A was
  built. Under lazy tables that order is not guaranteed, so B could be read
  without its policy.
- The lifecycle wrapper bound `get`/`query`/`normalizeId` at wrap time. With
  the aggregate capability the wrapper now always applies, so binding at wrap
  time hid later `ctx.db` patches (read-counting tests caught it).

Decisions and tradeoffs:
- Table: `ConvexTableImpl` keeps columns, system fields, `tableName`,
  `[TableName]`, `[Columns]`, `[Brand]` and `[TablePolymorphic]` eager. One
  symbol-keyed state object holds the extra-config callback and the lazily
  built definition (indexes, constraints, foreign keys, checks, RLS, delete
  config). Prototype accessors expose `validator`, the Convex
  `TableDefinition` fields and the RLS/delete symbols. A failed build caches
  its error and rethrows it. Rejected: `Proxy` (brief; ~55 ns per access in
  the spike micro-bench); a WeakMap side table (same cost, less discoverable).
- Discriminator tables resolve eagerly (`resolveTableColumns` is cheap without
  a discriminator), so `[TablePolymorphic]` stays a plain field and
  `buildRelations` needs no lazy `polymorphic` getter; the two polymorphic
  vitest cases keep asserting at `convexTable()`.
- Validation: `table.export()` builds the definition and resolves deferred
  foreign keys, so `schema.export()` (push), `convex-test` setup and codegen
  fail on any definition error. `defineSchema(..., { eagerTables: true })`
  calls every table's `export()` at define time. Rejected: an env flag or a
  test-environment switch (tests would stop exercising the lazy path).
- Codegen: `resolveSchemaMetadataForCodegen` exports every table of an ORM
  schema, so a definition error fails `kitcn codegen` as before.
- RLS links: `rlsPolicy().link(table)` registers the policy on its target at
  link time; extra config skips already-linked policies; calling `.link()`
  inside another table's extra config throws. Behaviour change: a linked
  policy applies even if no table returns it from extra config.
- Aggregate fail-closed: with the aggregate capability there is nothing to
  check, and hooks resolve per table on first write. Without it, `createOrm`
  still scans every table at creation and throws, so the push still fails.
  Tradeoff: ORMs without the aggregate capability keep building every table
  at `createOrm`. Rejected: moving the check to the first write (brief
  forbids); checking at schema export (the schema module has no view of
  `createOrm` capabilities).
- Lifecycle: trigger hooks stay eager (cheap); aggregate hooks resolve per
  table; `keys()` (id-only writes) resolves all. Wrapper passthrough reads
  delegate at call time.
- Database: per-table query builders and the foreign-key graph are memoised
  getters.

Implementation notes:
- 14 assertions in `indexes.test.ts` (13 tests) moved from `convexTable()` to
  `defineSchema({...}).export()`; the createOrm capability test is unchanged
  and still passes.

Review fixes:
- None yet.

Error attempts:
| Error / failed attempt | Count | Next different move | Resolution |
|------------------------|-------|---------------------|------------|
| Linked-policy guard threw for module-scope links during the declaring table's build | 1 | skip already-linked policies in extra config | fixed |
| `stream.ts` read the `indexes` field directly | 1 | expose Convex `TableDefinition` fields as accessors | fixed |
| Read-counting tests saw 0 reads | 1 | lifecycle wrapper delegates reads at call time | fixed |

Verification evidence:
- `bun test packages/kitcn/src/orm`: 307 pass, 0 fail (incl. 9 new in
  `lazy-tables.test.ts`; 8 of 9 fail on `upstream/main`, the 9th guards
  preserved behaviour).
- `bunx vitest run` (root config: `convex/orm` integration + package vitest):
  106 files passed, 2 skipped; 1105 tests passed, 14 skipped.
- `bun test packages/kitcn/src/cli/codegen.test.ts -t "table definition error"`:
  pass; fails with the codegen change reverted.
- `bun lint`, `tsc --noEmit -p packages/kitcn/tsconfig.json`: clean.
- `bun check`: `test:bun` reports 13 failures in CLI watcher, `dev` command,
  dry-run formatter and auth schema reconcile; the same set fails on
  `upstream/main` in this environment. Remaining steps run individually (see
  final handoff in the PR body).
- Bench: `node tooling/orm-table-bench.mjs --runs 15` (200 tables, 17 touched)
  with `--pkg` pointing at an `upstream/main` build vs this branch.

Service / API / auth / data-flow map:
| Surface | Current owner | Target decision | Evidence | Status |
| --- | --- | --- | --- | --- |
| public API/types/errors | `orm/table.ts`, `orm/schema.ts` | same exports; new `eagerTables`; errors at export | `indexes.test.ts`, `lazy-tables.test.ts` | done |
| service/runtime/lifecycle | `orm/lifecycle.ts`, `orm/database.ts` | per-table hooks; lazy builders and FK graph | `lazy-tables.test.ts`, integration suite | done |
| auth/session/permission | `orm/rls/*` | linked policies register at link time; late link throws | `lazy-tables.test.ts`, `convex/orm/rls.test.ts` | done |
| canonical data/transactions/deletion | `orm/update.ts`, `orm/delete.ts` | FK graph built on first update/delete | integration FK/cascade suites | done |
| Convex static import graph | `orm/rls/policies.ts` | one new import of leaf `symbols.ts` | diff | done |
| CLI/scaffold/generated | `cli/codegen.ts` | codegen builds every table | `codegen.test.ts` | done |
| docs/examples/package skill | `www/.../schema/index.mdx`, skill `orm.md` | one line each | diff | done |
| proof/benchmark/rollback | `tooling/orm-table-bench.mjs` | before/after cold start | bench output | done |

Happy path traced: `db.query.t.findFirst` -> `createDatabase` query getter ->
`RelationalQueryBuilder` -> query reads `table.getIndexes()` ->
`getTableDefinition` builds `t` once. Failure path traced: invalid index in
extra config -> `schema.export()` -> `ConvexTableImpl.export()` ->
`getTableDefinition` -> `applyExtraConfig` throws; the error is cached and
rethrown on the next read.

Final handoff contract:
- Recommendation: merge after review; downstream measures the per-call saving.
- Confidence: 90%
- Evidence: Verification evidence
- Tests / commands: Verification evidence
- Browser proof: N/A: no UI
- PR / GitHub issue: TBD
- Caveats: Open risks
- Next owner: review lanes, then the session opens the PR

Timeline:
- 2026-11-03T15:46:47.780Z Major-task goal plan created.
- 2026-11-03 Implementation, tests, bench, docs and changeset committed.

Reboot status:
| Question | Answer |
|----------|--------|
| Where am I? | Closeout, PR pending |
| Where am I going? | Review lanes, PR |
| What is the goal? | Lazy ORM tables with push-time validation |
| What have I learned? | See Findings |
| What have I done? | See Timeline |

Open risks:
- ORMs without the aggregate capability still build every table at
  `createOrm` (fail-closed scan kept).
- Mutations: the first update or delete builds every table in the schema
  (`buildForeignKeyGraph()` calls `getForeignKeys()` on each); reads and
  inserts stay per table.
- A missing FK target table (`Foreign key from X references missing table Y`)
  throws on the first update or delete instead of the first ORM call.
- Under context reuse the memoised definitions persist across requests; they
  derive only from the static schema.
- A column named like a Convex `TableDefinition` field (`indexes`,
  `searchIndexes`, ...) now throws on assignment instead of silently
  replacing that field.
