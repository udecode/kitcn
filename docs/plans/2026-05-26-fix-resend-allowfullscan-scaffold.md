# fix resend allowFullScan scaffold

Objective:
Fix the Resend-generated runtime failure where ORM update/delete calls over
primary id arrays threw `update/delete requires allowFullScan: true when no
index is available`.

Goal plan:
docs/plans/2026-05-26-fix-resend-allowfullscan-scaffold.md

Template:
docs/plans/templates/task.md with package-api pack.

Task source:
- type: plain user bug report
- id / link: chat report
- title: Resend generated files throw allowFullScan error
- acceptance criteria: generated Resend update/delete paths using bounded
  primary id arrays no longer require `allowFullScan`, the behavior has a
  regression test, package checks pass, and a changeset exists.

Completion threshold:
The task is complete when ORM update/delete primary-id array filters work in
sync and async scheduled-batch modes without full-scan opt-in, cross-table ids
are ignored, oversized non-paginated id arrays are rejected before reads,
targeted tests pass, package typecheck/build/lint pass, autoreview has no
accepted actionable findings, and this plan passes the autogoal checker.

Verification surface:
- `bunx vitest run packages/kitcn/src/orm/mutation-id-fast-path.vitest.ts`
- `bun --cwd packages/kitcn typecheck`
- `bun --cwd packages/kitcn build`
- `bun lint:fix`
- `.agents/skills/autoreview/scripts/autoreview --mode local --no-web-search`
- `node .agents/rules/autogoal/scripts/check-complete.mjs docs/plans/2026-05-26-fix-resend-allowfullscan-scaffold.md`

Constraints:
- Preserve ORM strict no-scan semantics.
- Do not add `allowFullScan()` to generated Resend code as a workaround.
- Keep the fix at the package behavior boundary.
- Do not create a PR or commit unless asked.

Boundaries:
- Source of truth: user-provided bug report.
- Allowed edit scope: ORM mutation builders, shared mutation helper, focused
  tests, changeset, goal plan.
- Browser surface: N/A, server/runtime package behavior only.
- Tracker sync: N/A, no tracker item was provided.
- Non-goals: no Resend API behavior changes, no scaffold regeneration, no docs
  content changes.

Blocked condition:
Autonomous work would stop only if the bug could not be reproduced locally or
the package checks failed for unrelated local environment corruption after one
install retry.

Task state:
- task_type: bug
- task_complexity: normal
- current_phase: closeout
- current_phase_status: completed
- goal_status: ready to close

Current verdict:
- verdict: fixed
- confidence: high
- next owner: user
- reason: focused repro failed before the fix, passes after the ORM change, and
  package checks plus autoreview are clean.

Start Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| Skill analysis before edits | yes | Loaded task, kitcn, autogoal, tdd, changeset, autoreview rules. |
| Active goal checked or created | yes | Created active goal for the Resend allowFullScan bug. |
| Source of truth read before edits | yes | Used the chat bug report as the source of truth. |
| Tracker comments and attachments read | no | N/A: no tracker item, comments, attachments, or video. |
| Video transcript evidence required | no | N/A: no video evidence. |
| `docs/solutions` checked for non-trivial existing-code work | no | N/A: memory pointed to the recent Resend scaffold context; local code was enough. |
| TDD decision before behavior change or bug fix | yes | Added failing regression before implementation. |
| Branch decision for code-changing task | yes | No branch or PR requested; continued in current checkout per repo policy. |
| Release artifact decision | yes | Added `.changeset/short-walls-shop.md` for published package behavior. |
| Browser tool decision for browser surface | no | N/A: no UI/browser surface. |
| PR expectation decision | yes | N/A: user did not request PR. |
| Tracker sync expectation decision | yes | N/A: no tracker item. |
| Package/API pack selected | yes | package-api pack selected because ORM package runtime behavior changed. |
| Public surface or package boundary identified | yes | `kitcn/orm` update/delete runtime behavior. |
| Release artifact path selected | yes | `.changeset/short-walls-shop.md`. |
| `changeset` skill loaded when `.changeset` is required | yes | Loaded changeset rules and wrote patch changeset. |
| Package build / fixture impact decision recorded | yes | Package build required; fixture sync N/A because scaffold output did not change. |

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
- [x] Final handoff shape decided: concise bug-fix outcome with verification.
- [x] Branch handling recorded for code-changing work: current checkout used,
      no PR/branch requested.
- [x] Local-env-rot retry policy recorded: N/A, no surprising local corruption
      failure occurred.
- [x] Workspace authority recorded: package tests/build/typecheck/lint ran in
      `/Users/zbeyens/git/better-convex`.
- [x] High-risk note recorded for package-boundary behavior.
- [x] Review/autoreview target selected from actual diff state.
- [x] Agent-native review decision recorded: N/A, no agent/tooling surfaces
      changed.
- [x] Package/API pack: public API, package boundary, export, and
      release-artifact impact are recorded.
- [x] Package/API pack: release artifact matrix is applied with a patch
      changeset.
- [x] Package/API pack: `.changeset` work loaded `changeset` and follows its
      package/version/prose rules.
- [x] Package/API pack: no-artifact decision is N/A because users see a runtime
      package fix.
- [x] Package/API pack: compatibility decision is explicit: no public signature
      change, only stricter correct runtime lookup behavior.
- [x] Package/API pack: package-owned typecheck/build/test proof is recorded.
- [x] Package/API pack: `packages/kitcn` build proof is recorded; fixture
      sync/check is N/A.

Completion Gates:
| Gate | Applies | Required action | Evidence |
|------|---------|-----------------|----------|
| Named verification threshold | yes | Run named commands | Targeted test, typecheck, build, lint, autoreview, and plan checker recorded. |
| Bug reproduced before fix | yes | Record failing test/repro | New regression initially failed with the reported `allowFullScan` error. |
| Targeted behavior verification | yes | Run focused test | `bunx vitest run packages/kitcn/src/orm/mutation-id-fast-path.vitest.ts` passed, 6 tests. |
| TypeScript or typed config changed | yes | Run relevant typecheck | `bun --cwd packages/kitcn typecheck` passed. |
| Package exports or file layout changed | no | Run relevant build if needed | No export/file layout change; package build still passed. |
| Package manifests, lockfile, or install graph changed | no | Run install if needed | N/A: no manifest or lockfile change. |
| Agent rules or skills changed | no | Run sync if needed | N/A: no agent rules or skills changed. |
| Workspace authority proof | yes | Verify in owning package | Commands ran in `/Users/zbeyens/git/better-convex`. |
| Browser surface changed | no | Browser proof or waiver | N/A: no browser surface. |
| Browser final proof | no | Screenshot or caveat | N/A: no browser surface. |
| Scaffold or fixture output changed | no | Run fixtures if scaffold changed | N/A: fixed ORM behavior, not scaffold templates or fixture output. |
| Package behavior or public API changed | yes | Add changeset | `.changeset/short-walls-shop.md` added. |
| Docs and kitcn skill sync changed | no | Keep docs/skill in sync | N/A: no docs or skill content changed. |
| Docs or content changed | no | Verify docs if changed | N/A: no docs content changed. |
| High-risk mini gate | yes | Record failure mode and proof | Failure mode: async generated mutations still scanning or cross-table id mutation; proof: async scheduled tests, normalizeId guard, autoreview clean. |
| Agent-native review for agent/tooling changes | no | Run agent-native review if needed | N/A: no agent/tooling changes. |
| Local install corruption suspected | no | Install retry if needed | N/A: no corruption-shaped failure. |
| Autoreview for non-trivial implementation changes | yes | Run helper until no accepted findings | Final `.agents/skills/autoreview/scripts/autoreview --mode local --no-web-search` reported clean. |
| PR create or update | no | Run check before PR | N/A: no PR requested. |
| PR proof image hosting | no | Host images if needed | N/A: no PR/browser proof. |
| Tracker sync-back | no | Post sync if tracker exists | N/A: no tracker item. |
| Final handoff contract | yes | Fill final handoff fields | Final handoff fields completed below. |
| Final lint | yes | Run lint fix | `bun lint:fix` passed. |
| Goal plan complete | yes | Run plan checker | Plan checker to run after this update. |
| Public API / package boundary proof | yes | Source-audit package behavior | `kitcn/orm` primary-id mutation path audited and tested. |
| Release artifact classification | yes | Record user-visible package delta | Patch runtime behavior fix for published package users. |
| Published package changeset | yes | Add/update changeset | `.changeset/short-walls-shop.md`. |
| No release artifact | no | Record reason | N/A: release artifact required. |
| Package typecheck/build/test | yes | Run package checks | Targeted vitest, package typecheck, and package build passed. |
| Fixture/scaffold generation | no | Run fixtures if needed | N/A: no scaffold source/output change. |

Phase / pass table:
| Phase | Status | Evidence | Next |
|-------|--------|----------|------|
| Intake and source read | completed | user report, local skill/rule reads, memory context | implementation |
| Implementation | completed | ORM primary-id lookup helper and update/delete builders changed | verification |
| Verification | completed | targeted test, lint, typecheck, build | closeout |
| Review | completed | two autoreview findings fixed; final autoreview clean | closeout |
| PR / tracker sync | skipped | N/A: no PR or tracker requested | final response |
| Closeout | completed | changeset and plan evidence recorded | final response |

Findings:
- Resend generated code uses bounded primary id arrays for update/delete paths.
- ORM query already special-cased primary id lists; ORM update/delete only
  special-cased single-id equality.
- Async scheduled mutation mode re-enters update/delete through pagination, so
  the primary-id array path needs deterministic cursor support.

Decisions and tradeoffs:
- Fixed ORM mutation behavior instead of adding `allowFullScan()` to Resend
  templates because primary id arrays are bounded direct lookups, not scans.
- Used a tagged offset cursor for scheduled primary-id batches because the same
  serialized where clause is available to the scheduled worker.
- Normalized ids against the target table before reading so cross-table ids are
  ignored.

Implementation notes:
- Added `extractPrimaryIdLookup` and `windowPrimaryIdLookup`.
- Update/delete primary-id paths use `db.normalizeId(tableName, id)` then
  `db.get(id)`.
- Non-paginated primary-id lists are rejected before reads when they exceed
  `mutationMaxRows`.

Review fixes:
- Fixed autoreview finding: async primary-id arrays were skipped in paginated
  mode.
- Fixed autoreview finding: cross-table ids could be read and mutated.
- Fixed autoreview finding: oversized id arrays were read before max-row guard.

Error attempts:
| Error / failed attempt | Count | Next different move | Resolution |
|------------------------|-------|---------------------|------------|
| Initial focused test failed with reported allowFullScan error | 1 | Add ORM primary-id mutation fast path | Resolved. |
| Autoreview found async pagination gap | 1 | Add tagged primary-id cursor windowing and async tests | Resolved. |
| Autoreview found cross-table and max-row gaps | 1 | Normalize ids by table and guard before reads | Resolved. |
| Autoreview no-output exit | 2 | Retry final review with same Codex engine and web search off | Resolved with clean review output. |

Verification evidence:
- `bunx vitest run packages/kitcn/src/orm/mutation-id-fast-path.vitest.ts`
  passed with 6 tests.
- `bun lint:fix` passed.
- `bun --cwd packages/kitcn typecheck` passed.
- `bun --cwd packages/kitcn build` passed.
- `.agents/skills/autoreview/scripts/autoreview --mode local --no-web-search`
  passed with `autoreview clean: no accepted/actionable findings reported`.

Final handoff contract:
- PR line: N/A, no PR requested.
- Issue / tracker line: N/A, no tracker item.
- Confidence line: high.
- Flow table:
  - Reproduced: targeted regression failed with the reported allowFullScan
    error before implementation.
  - Verified: targeted regression, package typecheck, package build, lint, and
    autoreview passed.
- Browser check: N/A.
- Outcome: ORM update/delete primary-id array filters work without full-scan
  opt-in in sync and async scheduled modes.
- Caveat: final autoreview used `--no-web-search` after two no-output exits;
  local code inspection was sufficient for this diff.
- Design:
  - Chosen boundary: `kitcn/orm` mutation builder primary-id lookup.
  - Why not quick patch: adding `allowFullScan()` to Resend would bless a scan
    for a bounded id lookup and leave the ORM bug alive.
  - Why not broader change: no public API signature or scaffold template change
    was needed.
- Verified: commands listed above passed in `/Users/zbeyens/git/better-convex`.

Final handoff / sync:
- PR: N/A.
- Issue / tracker: N/A.
- Browser proof: N/A.
- Caveats: autoreview clean only with web search off after helper no-output
  retries.

Timeline:
- 2026-05-26T09:44:30.123Z Task goal plan created.
- 2026-05-26 Reproduced the allowFullScan failure with targeted ORM tests.
- 2026-05-26 Implemented sync primary-id update/delete fast path.
- 2026-05-26 Fixed async scheduled-batch primary-id continuation after review.
- 2026-05-26 Added table normalization and max-row pre-read guard after review.
- 2026-05-26 Verified tests, lint, typecheck, build, and autoreview.

Reboot status:
| Question | Answer |
|----------|--------|
| Where am I? | Closeout complete. |
| Where am I going? | Final response after plan checker and goal close. |
| What is the goal? | Fix Resend-generated allowFullScan runtime failure by correcting ORM primary-id mutations. |
| What have I learned? | The root cause was ORM update/delete treating `_id IN (...)` as an unindexed scan, including async scheduled mutation mode. |
| What have I done? | Implemented bounded table-normalized primary-id mutation lookup, tests, changeset, and verification. |

Open risks:
None.
