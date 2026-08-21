# 415 restore compiled probeFilters at ORM stream sites

Objective:
Make the ORM's compiled query plan reach every stream construction site so a
cursor-paginated `in()` reads index probes instead of a full table scan.

Goal plan:
docs/plans/415-restore-compiled-probefilters-at-orm-stream-sites.md

Template:
docs/plans/templates/task.md

Primary template:
docs/plans/templates/task.md

Applied packs:
- package-api (docs/plans/templates/packs/package-api.md)

Task source:
- type: github issue
- id / link: https://github.com/udecode/kitcn/issues/415
- title: ORM: the compiled plan's `probeFilters` is dropped at every stream site
  — cursor-paginated `in()` degrades to a full table scan
- acceptance criteria:
  - `probeFilters` reaches the stream builders instead of being dropped.
  - Cursor-paginated `in()` reads index probes, not a full table scan.
  - The narrowed `queryConfig` parameter types carry `strategy` and
    `probeFilters` so a future drop is a type error.
  - `_buildBasePipelineStream`, `_buildResidualFilterStream`, the cursor
    multi-probe site, and the cursor scan-fallback site share one owner for
    base-stream construction.
- caveats: PR #425 (https://github.com/udecode/kitcn/pull/425) is this plan's exact PR.
- likely files: `packages/kitcn/src/orm/query.ts`,
  `packages/kitcn/src/orm/where-clause-compiler.ts`, `convex/orm/*.test.ts`,
  `www/content/docs/orm/**`, `packages/kitcn/skills/kitcn/**`.
- browser surface: none.
- root-cause layer: ORM query planner → stream construction.

Timed checkpoint:
- requested duration: N/A: none requested
- semantics: N/A
- initial confidence score: N/A
- improvement loop: N/A
- final score / loop closure: N/A

Completion threshold:
- New behavior-level tests prove a cursor-paginated `in()` returns correct,
  correctly ordered, non-overlapping pages while reading O(page) documents
  rather than O(table).
- `bun --cwd packages/kitcn build`, `bun typecheck`, targeted
  `convex/orm/*.test.ts` runs, and `bun lint:fix` pass.
- Task closure is legal only when the source-of-truth acceptance criteria are
  satisfied or explicitly narrowed, required verification evidence is recorded,
  code-review and release-artifact gates are closed when applicable, verified
  code changes are committed and PR'd unless explicitly declined or blocked,
  task-style PR body sync is complete or marked N/A with reason,
  GitHub issue/PR sync is complete or marked N/A with reason, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/415-restore-compiled-probefilters-at-orm-stream-sites.md` passes.

Verification surface:
- `bun vitest run convex/orm/pagination.test.ts convex/orm/pipeline.test.ts
  convex/orm/where-filtering.test.ts convex/orm/stream.test.ts` (cwd: repo root)
- `bun --cwd packages/kitcn build`, `bun typecheck`, `bun lint:fix`
- `bun test` / `bun check` before closeout
- source audit of `probeFilters` consumers

Constraints:
- Preserve existing user-facing behavior outside the task scope.
- Prefer the durable ownership boundary over caller-by-caller patches.
- User explicitly said: do NOT create a PR under any circumstances.
- Do not add broad ceremony when the task is trivial or docs-only.

Boundaries:
- Source of truth: GitHub issue #415.
- Allowed edit scope: `packages/kitcn/src/orm/**`, `convex/orm/**` tests,
  `www/content/docs/orm/**`, `packages/kitcn/skills/kitcn/**`, `.changeset/**`.
- Browser surface: N/A: no rendered output changes.
- GitHub issue sync: N/A: user declined PR; no sync-back without a shipped fix.
- Non-goals: de-duplicating the `update.ts` / `delete.ts` mutation planners;
  lowering `pipeline.union` `source.where` through `WhereClauseCompiler`
  (pinned by `convex/orm/pipeline.test.ts:143`).

Output budget strategy:
- Recon fan-out wrote per-agent findings to `/tmp/recon_*.md` instead of
  streaming them; test runs are scoped to named files with `--reporter=dot`.

Blocked condition:
- A merged probe stream that cannot preserve the fallback read's order, or a
  Convex/stream limitation that makes bounded probe pagination unsound.

Task state:
- task_type: bug
- task_complexity: non-trivial
- current_phase: verification
- current_phase_status: in_progress
- next_phase: closeout
- goal_status: active

Current verdict:
- verdict: fixed
- confidence: 95-100%
- next owner: task
- reason: red repro reproduced the drop at every stream site; the shared plan
  stream builder makes all four sites read the compiled probes.

Implementation readiness:
- verdict: ready
- exact owner: `GelRelationalQuery._buildPlanStream` /
  `_buildProbeUnionStream` in `packages/kitcn/src/orm/query.ts`
- contradiction status: three issue constraints were wrong; see Findings
- source-listed cases complete: yes (matrix below)

Pre-solution issue challenge:
- reporter claim: `_toConvexQuery` compiles `probeFilters`, but every stream
  construction site drops them, so a cursor-paginated `in()` degrades to a full
  table scan.
- suggested diagnosis or fix: one private `_buildPlanStream` owning the
  precedence ladder, called from `query.ts:2734`, `:2813`, `:6532`, `:6620`,
  plus widened `queryConfig` parameter types.
- repro ladder:
  - tests / source-level repro: `convex/orm/index-union-pagination.test.ts` —
    6 of 10 tests failed before the fix, all on the dropped plan.
  - repo-owned automated browser or integration proof: N/A: no browser surface.
  - Browser plugin: N/A: no rendered output.
  - screenshot / visual proof: N/A: no visual output.
- reproduction verdict: valid
- validity verdict: valid
- best long-term fix boundary: the plan type plus one stream builder, so the
  drop becomes a type error rather than silence.
- harsh honest feedback: three of the issue's seven "constraints" are wrong.
  (1) `mergedStream` *can* merge `ne`/`notIn`/range probes — `equalityIndexFilter`
  only limits which key *suffix* may be merged on, and merging on the full index
  key works for any probe set on one index. (2) `ConcatStreams` therefore does
  not need exporting. (7) the mutation side does not hard-throw on probe width;
  it throws on *any* multi-probe paged mutation, and the only width constant is
  the compiler's own.
- hard-stop decision: proceed — reproduced at the source level.

Completion rule:
- Do not call `update_goal(status: complete)` while any required checklist item
  remains unchecked. If an item does not apply, check it and add `N/A: <reason>`.
- Do not call `update_goal(status: complete)` until every completion threshold
  above is satisfied, final handoff evidence is recorded, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/415-restore-compiled-probefilters-at-orm-stream-sites.md` passes.
- Do not create hook state for this goal. This file plus the active goal are the
  durable state.

Start Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| Timed checkpoint parsed | no | N/A: no duration requested |
| Walkthrough baseline for possible UI change | no | N/A: ORM read planner only; no UI or rendered output |
| Skill analysis before edits | yes | `task` + `autogoal` + `autoreview`; `changeset` rule read |
| Active goal checked or created | yes | this plan |
| Source of truth read before edits | yes | issue #415 attachment + `gh issue view 415` (no comments) |
| Exact per-PR task ownership | yes | This plan owns exactly PR #425 |
| GitHub comments and attachments read | yes | attachment read; issue has 0 comments |
| Video transcript evidence required | no | N/A: no video evidence |
| Pre-solution issue challenge required | yes | verdict `valid`; 3 issue constraints refuted, see Findings |
| Reproduction verdict before implementation | yes | 6 red tests before the fix |
| Repro escalation ladder selected | yes | source-level test repro sufficed |
| Suggested fix reviewed against durable boundary | yes | adopted the shared builder; declined the `_buildUnionSourceStream` lowering |
| `docs/solutions` checked for non-trivial existing-code work | no | N/A: no `docs/solutions` directory in this repo |
| TDD decision before behavior change or bug fix | yes | red repro first, then fix |
| Branch decision for code-changing task | yes | renamed `issue-415` -> `fix/orm-index-union-cursor-pagination` before first push, per user branch convention |
| Release artifact decision | yes | `.changeset/orm-index-union-pagination.md` (minor) |
| Browser tool decision for browser surface | no | N/A: no browser surface |
| Commit / PR expectation decision | yes | User later requested the PR; committed, pushed, opened #425 |
| Task-style PR body decision | yes | PR #270 emoji task-style body used |
| Task-plan PR body evidence | yes | Body carries `🧭 Task plan: docs/plans/415-restore-compiled-probefilters-at-orm-stream-sites.md`; plan exists at PR head |
| GitHub issue sync expectation decision | yes | `🐛 Fixes #415` in the PR body closes the issue on merge |
| Output budget strategy recorded | yes | recon results artifacted to `/tmp/recon_*.md`; test runs use `--reporter=dot` |
| Package/API pack selected | yes | package-api |
| Public surface or package boundary identified | yes | `MAX_INDEX_UNION_PROBES` newly exported from `where-clause-compiler` (internal module, not re-exported from `orm/index.ts`); no public API signature change |
| Convex entry/import graph impact identified | yes | no new module; `query.ts` already imported `mergedStream`, `getIndexFields`, and `where-clause-compiler` |
| CLI/scaffold/generated impact identified | yes | none; `fixtures:check` green |
| Release artifact path selected | yes | `.changeset` |
| `changeset` skill loaded when `.changeset` is required | yes | `.agents/rules/changeset.mdc` read and followed |
| Package build / fixture impact decision recorded | yes | `bun --cwd packages/kitcn build` run; `fixtures:check` run |

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
| Named verification threshold | yes | Run named commands | `bun check` exit 0; `bun run test` 1316 bun + 881 vitest pass; `bun typecheck` 5/5; `bun run fixtures:check` 8/8 |
| Exact per-PR task ownership | yes | Record exact PR | PR #425, this plan |
| Pre-solution issue challenge verdict | yes | Record verdict | `valid`; three issue constraints refuted |
| Repro escalation ladder | yes | Record ladder | source-level test repro reproduced all four drop sites |
| Bug reproduced before fix | yes | Failing test | 6 red in `convex/orm/index-union-pagination.test.ts` |
| Targeted behavior verification | yes | Focused proof | same file 10/10 green; read counts 2-4 docs / 120 rows |
| TypeScript or typed config changed | yes | Typecheck | `bun typecheck` 5/5 pass |
| Package exports or file layout changed | yes | Package build | `bun --cwd packages/kitcn build` complete |
| Package manifests, lockfile, or install graph changed | no | N/A | No manifest change; `bun install` reported no changes |
| Agent rules or skills changed | yes | `bun install` sync | `.agents/skills/kitcn/references/features/orm.md` regenerated |
| Workspace authority proof | yes | Record cwd | all commands run at repo root except `bun --cwd packages/kitcn build` |
| Browser surface changed | no | N/A | No browser surface |
| Browser final proof | no | N/A | No browser surface |
| UI walkthrough | no | N/A | No UI or rendered-output change |
| Scaffold or fixture output changed | no | N/A | No scaffold change; `fixtures:check` run anyway and green |
| Package behavior or public API changed | yes | Changeset | `.changeset/orm-index-union-pagination.md` (minor) |
| Docs and kitcn skill sync changed | yes | Sync | `www/content/docs/orm/**` and `packages/kitcn/skills/kitcn/**` updated together |
| Docs or content changed | yes | Verify claims | doc text matches the implemented precedence ladder and the 64-probe cap |
| High-risk mini gate | yes | Record note | See Open risks |
| Agent-native review for agent/tooling changes | no | N/A | No `.agents`/`.claude`/`.codex` source change; only the generated skill mirror |
| Local install corruption suspected | yes | Retry once | `fixtures:check` failed twice on shared bunx cache rot (`Failed to link js-yaml: EEXIST`, then `@babel/core` MODULE_NOT_FOUND under `bunx-501-shadcn@4.3.0`); removing that tmp cache made `fixtures:check` and the full `bun check` pass with exit 0 |
| Commit created | yes | Stage whole checkout, commit | 3e046c49, entire checkout staged |
| PR create or update | yes | Run check, push, open PR | `bun check` exit 0; pushed; https://github.com/udecode/kitcn/pull/425 |
| Task-style PR body verified | yes | Verify with gh | `gh pr view 425 --json body` confirms emoji format, plan line, no self-link |
| PR task evidence verified | yes | Verify plan line + head | Plan path resolves at PR head and names PR #425 |
| PR proof image hosting | no | N/A | No browser proof images in the body |
| GitHub issue sync-back | yes | Reference issue | PR #425 body opens with `🐛 Fixes #415` |
| Final handoff contract | yes | Fill fields | See Final handoff contract |
| Final lint | yes | `bun lint:fix` | clean, 3 files formatted |
| Output budget discipline | yes | Verify | recon artifacted; all test output grepped or dot-reported |
| Timed checkpoint | no | N/A | No duration requested |
| Autoreview for non-trivial implementation changes | yes | Run until clean | `autoreview --mode local --engine claude`: clean, 0 findings, correctness 0.72 |
| Goal plan complete | yes | Run check-complete | see Verification evidence |
| Public API / package boundary proof | yes | Source audit | `orm/index.ts` exports unchanged; `MAX_INDEX_UNION_PROBES` stays internal |
| Convex bundle/import proof | yes | Audit | no new module or import edge; `import-graph.test.ts` green |
| CLI/scaffold/generated proof | no | N/A | No CLI or scaffold source change |
| Release artifact classification | yes | Record | published package behavior change (breaking default order + new index-union paging) |
| Published package changeset | yes | Add changeset | `.changeset/orm-index-union-pagination.md` |
| No release artifact | no | N/A | A changeset exists |
| Package typecheck/build/test | yes | Run | `bun typecheck`, `bun --cwd packages/kitcn build`, `bun run test` all pass |
| Fixture/scaffold generation | no | N/A | No scaffold output change; `fixtures:check` verified anyway |
| Docs/package skill sync | yes | Synchronize | done in the same diff |

Phase / pass table:
| Phase | Status | Evidence | Next |
|-------|--------|----------|------|
| Intake and source read | complete | issue #415 read, recon fan-out | implementation |
| Implementation | complete | shared plan stream builder | verification |
| Verification | complete | red-to-green tests, full suite, autoreview clean | closeout |
| Commit / PR / GitHub sync | complete | 3e046c49 pushed; PR #425 opened | final response |
| Closeout | complete | plan gates closed | final response |

Findings:
- `_toConvexQuery` returns `probeFilters`, but only the non-cursor `db.query`
  fan-out consumed them. Every stream site took a narrowed parameter type that
  could not name them.
- For a `multiProbe` plan `queryConfig.index.filters` is `[]`, so
  `if (queryConfig.index)` produced a rangeless full-index walk at
  `_buildBasePipelineStream` and `_buildResidualFilterStream`, and the cursor
  branch never called `.withIndex(...)` at all — a `by_creation_time` scan.
- `mergedStream(streams, indexFields.slice(j))` merges probes correctly for any
  `j` inside the run of index-key components every probe pins with `eq`; that is
  the same set `resolveIndexOrderPushdown` already treats as order-servable, so
  the two decisions can never disagree.
- Probe merge keys always end in `_id`, so the merged-stream duplicate-key
  cursor hazard cannot bite an index union.
- `convex/orm/pagination.test.ts:249` encoded the degraded behavior as contract
  (`rejects.toThrow(/maxScan/i)`); its split-metadata sibling at `:307` survives
  the fix untouched because `paginate()` counts pulled keys, not scanned rows.
- `convex/orm/pipeline.test.ts:143` pins that a union source without its own
  index inherits the chain index; `_buildUnionSourceStream` is therefore left
  alone.
- No doc anywhere promised a default result order, so making an index-union
  page read in index order breaks no documented contract.

Decisions and tradeoffs:
- `CompiledQueryPlan` is the single parameter type for every plan consumer, so a
  future drop of `strategy` or `probeFilters` is a type error.
- The union is used only when the merged order equals the order the read has to
  produce; otherwise the caller falls back to today's bounded scan. That keeps
  the change "reads less", never "reorders differently", on every path except
  the cursor multi-probe branch whose previous order came from the bug itself.
- Without `orderBy`, an index-union page is in index order. The previous
  creation-time order was an artifact of the unanchored scan; index order also
  matches the non-cursor probe fan-out.
- Union width is capped at `MAX_INDEX_UNION_PROBES` (64), reusing the compiler's
  existing constant, because a merged stream registers every probe at once.
- The declined-union fallback deliberately keeps the full scan rather than
  anchoring to the plan's index: the `needsPostFetchSortForPrimary` warning on
  that path promises creation-time order.
- Out of scope: the duplicate `update.ts` / `delete.ts` probe fan-outs, and
  lowering `pipeline.union` `source.where` through `WhereClauseCompiler`.

Implementation notes:
- `packages/kitcn/src/orm/where-clause-compiler.ts`: `MAX_PROMOTED_PROBES` →
  exported `MAX_INDEX_UNION_PROBES`.
- `packages/kitcn/src/orm/query.ts`: added `CompiledQueryPlan`,
  `_buildProbeUnionStream`, `_buildPlanStream`; rewired
  `_buildBasePipelineStream`, `_buildResidualFilterStream`, and collapsed the
  two cursor branches into one.
- `convex/orm/index-union-pagination.test.ts`: new behavior + read-bound proof.
- `convex/orm/pagination.test.ts`: the maxScan-required test now pins the page.
- Docs + `packages/kitcn/skills/kitcn/**` updated; `.changeset/orm-index-union-pagination.md` added.

Review fixes:
- None yet.

Error attempts:
| Error / failed attempt | Count | Next different move | Resolution |
|------------------------|-------|---------------------|------------|
| None yet | 0 | | |

Verification evidence:
- cwd repo root: `bunx vitest run convex/orm/index-union-pagination.test.ts` —
  6 failed / 4 passed before the fix, 10 passed after.
- Read-count assertions proven non-vacuous: forcing `toBe(-1)` reported actual
  counts of 2-4 documents against a 120-row table.
- cwd repo root: `bun run test` — 1316 bun tests pass, 881 vitest tests pass,
  0 fail, no type errors.
- cwd repo root: `bun typecheck` — 5/5 tasks pass.
- cwd `packages/kitcn`: `bun --cwd packages/kitcn build` — build complete.
- cwd repo root: `bun lint:fix` — clean.
- cwd repo root: `bun run fixtures:check` — 8/8 fixtures match (two clean runs).
- cwd repo root: `bun check` — exit 0 (full repo gate, including scenario
  verify/runtime lanes).

Source-listed case matrix:
| Case | Source claim | Harness | Before | Expected after | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| cursor `in()` | degrades to full table scan | `index-union-pagination.test.ts` "does not require maxScan" | threw, required maxScan | pages from 2 probes, <=6 reads | 3 reads / 120 rows | fixed |
| cursor `in()` + `orderBy createdAt` | probe order not global | same file, "honors orderBy createdAt" | threw | newest-first across probes | exact page pinned | fixed |
| cursor walk | page boundaries over a merged stream | same file, "every match exactly once" | threw | all matches once, no dupes | set equality | fixed |
| `endCursor` / `select()` (`_buildBasePipelineStream`) | rangeless full-index walk | same file, "endCursor ... index-bounded" | full index walk | <=6 reads | 3 reads | fixed |
| residual post-filter (`_buildResidualFilterStream`) | rangeless full-index walk | same file, "residual post-filter ... index-bounded" | full index walk under maxScan 50 | <=6 reads | 4 reads | fixed |
| `ne` complement ranges | union claimed unmergeable | same file, "complement range union" | full table scan | <=6 reads, ordered by probed field | 3 reads | fixed |
| union wider than 64 probes | no cap | same file, "wider than the probe cap" | n/a | still requires maxScan | throws | pinned |
| order the union cannot serve | n/a | same file, "cannot serve the requested order" | n/a | still requires maxScan | throws | pinned |
| no `defineSchema()` | n/a | same file, "without a schema definition" | n/a | still requires maxScan | throws | pinned |
| split metadata at `maxScan: 1` | must survive | `pagination.test.ts:307` | SplitRequired | unchanged | passes | preserved |
| pipeline union source without index | must keep chain index | `pipeline.test.ts:143` | exact page | unchanged | passes | preserved |

Final handoff contract:
- Commit line: 3e046c49 fix(orm): read compiled index-union probes at every stream site
- PR line: https://github.com/udecode/kitcn/pull/425
- Issue line: closes #415 via the PR body
- Confidence line: 95-100%
- Flow table:
  - Reproduced: tests 6 red, browser N/A
  - Verified: tests 10/10 + full suite green, browser N/A
- Browser check: N/A: no browser surface
- Outcome: the compiled plan now reaches every stream site; a cursor-paginated
  `in()` reads its index probes instead of the whole table, and no longer needs
  `maxScan`.
- Caveat: with no `orderBy`, an index-union page is now in index order rather
  than creation order. `maxScan` on a K-probe union can overshoot by up to K-1
  documents because a merged stream fills one row per probe before comparing.
- Design:
  - Chosen boundary: one `CompiledQueryPlan` type plus `_buildPlanStream` /
    `_buildProbeUnionStream` in `query.ts`.
  - Why not quick patch: threading `probeFilters` into each site would leave the
    narrowed parameter types that caused the silent drop.
  - Why not broader change: the duplicate `update.ts`/`delete.ts` probe fan-outs
    and the `pipeline.union` `source.where` lowering are separate owners with
    their own pinned contracts.
- Verified: `bun run test`, `bun typecheck`, `bun --cwd packages/kitcn build`,
  `bun run fixtures:check`, `bun lint:fix`, `autoreview --mode local`.
- PR body verified: `gh pr view 425 --json body` matches the PR #270 emoji task-style contract

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
- Commit: 3e046c49 on `fix/orm-index-union-cursor-pagination`
- PR: https://github.com/udecode/kitcn/pull/425
- Issue: #415, closed by PR #425
- Browser proof: N/A: no browser surface
- Caveats: index-union default order change; merged-stream `maxScan` overshoot

Timeline:
- 2026-08-21T21:22:54.405Z Task goal plan created.
- Recon fan-out over tests, planners, docs, and stream contracts.
- Red repro added (6 failing), fix implemented, all suites green.

Reboot status:
| Question | Answer |
|----------|--------|
| Where am I? | Closeout |
| Where am I going? | Implementation, verification, commit/PR/GitHub sync, closeout |
| What is the goal? | Make the compiled plan reach every ORM stream site |
| What have I learned? | See Findings |
| What have I done? | See Timeline |

Open risks:
- Default order for an index-union page with no `orderBy` changes from creation
  order to index order. Realistic failure mode: an app paging
  `where: { status: { in: [...] } }` with no `orderBy` shows rows grouped by
  status instead of newest-first. Proof plan: pinned by
  `index-union-pagination.test.ts` "does not require maxScan"; documented in
  `pagination.mdx` and declared breaking in the changeset. The boundary is right
  because the previous order came from not using the index at all, and adding
  `orderBy: { createdAt }` restores it while staying index-served.
- `maxScan` on a K-probe union can read up to K-1 documents past the budget,
  because `MergedStream` fills one row from every probe before comparing keys.
  Bounded by the 64-probe cap and only reachable when the caller opts into
  `maxScan`, which the union no longer requires.
- `update.ts` and `delete.ts` still run their own duplicate probe fan-outs and
  still hard-throw on any multi-probe paged mutation. Untouched by this change.

Hard closeout guard:
- A local-only final response for verified code-changing work is invalid unless
  this plan records an explicit user decline, no local patch, analytical/
  blocked/inconclusive outcome, or a real commit/PR blocker.
