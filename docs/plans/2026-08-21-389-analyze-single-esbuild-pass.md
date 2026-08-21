# 389 analyze single esbuild pass

Objective:
Fix #389: collapse `kitcn analyze` hotspot mode from one esbuild build per Convex entry
to a single combined build, keeping per-entry output bytes byte-exact and moving the
Files/DepMB columns to in-bundle semantics.

Goal plan:
docs/plans/2026-08-21-389-analyze-single-esbuild-pass.md

Template:
docs/plans/templates/task.md

Primary template:
docs/plans/templates/task.md

Applied packs:
- none

Task source:
- type: GitHub issue
- id / link: #389 https://github.com/udecode/kitcn/issues/389
- PR owned by this plan: #400 https://github.com/udecode/kitcn/pull/400
- title: CLI: `kitcn analyze` runs one esbuild bundle per Convex entry, re-reading the
  shared import graph E times (2.81x measured)
- task type: performance fix in CLI analyzer (non-heavyweight, non-trivial)
- acceptance criteria: hotspot mode must stop re-parsing the shared import graph once
  per entry; the reported metric semantics must be a decision, not an accident.
- caveat carried by the issue: deriving per-entry numbers from `output.inputs` shifts
  reported file counts (-42% measured by reporter). Must be resolved before swapping.
- likely files: `packages/kitcn/src/cli/analyze.ts`, `packages/kitcn/src/cli/analyze.test.ts`,
  `www/content/docs/cli/backend.mdx`, `.changeset/`
- browser surface: none (terminal CLI)
- root-cause layer: CLI bundler-invocation layer

Timed checkpoint:
- requested duration: N/A - no duration requested
- semantics: N/A
- initial confidence score: N/A
- improvement loop: N/A
- final score / loop closure: N/A

Completion threshold:
- `kitcn analyze` (hotspot mode) issues ONE esbuild build for the whole selected entry
  set instead of one per entry, with a per-entry fallback retained only for the failure
  path so `Failed entries:` attribution and exit code 1 survive.
- Per-entry `OutMB` stays byte-identical to the previous implementation.
- `Files` / `DepMB` / `LocMB` are defined as in-bundle (contributing to that entry's
  output), documented, and consistent with the `--details` tables that already used
  `output.inputs`.
- Hotspot mode surfaces the schema-externalized approximation note instead of computing
  a flag nothing renders.
- Targeted tests cover the new attribution + fallback helpers; package build, typecheck,
  lint pass; changeset added; docs updated.
- Task closure is legal only when the source-of-truth acceptance criteria are
  satisfied or explicitly narrowed, required verification evidence is recorded,
  code-review and release-artifact gates are closed when applicable, verified
  code changes are committed and PR'd unless explicitly declined or blocked,
  task-style PR body sync is complete or marked N/A with reason,
  GitHub issue/PR sync is complete or marked N/A with reason, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-08-21-389-analyze-single-esbuild-pass.md` passes.

Verification surface:
- `bun test packages/kitcn/src/cli/analyze.test.ts` (cwd: repo root)
- `bun --cwd packages/kitcn build` then real CLI run in `example/`:
  `node ../packages/kitcn/dist/cli.mjs analyze --width 200` diffed against the captured
  pre-change baseline (`/tmp/analyze-baseline.txt`).
- `bun typecheck`, `bun lint:fix`
- esbuild A/B harness proving byte-exact per-entry outputs across 6 entry subsets.

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
- Source of truth: GitHub issue #389 plus measured esbuild behavior in this repo.
- Allowed edit scope: `packages/kitcn/src/cli/analyze.ts`, its test, `www/content/docs/cli/backend.mdx`,
  `.changeset/`, this plan.
- Browser surface: N/A - terminal CLI only.
- GitHub issue sync: N/A unless the user asks; the user explicitly forbade PR creation.
- Non-goals: changing `--deploy` mode, changing entry selection, changing thresholds/flags.

Output budget strategy:
- Analyzer output captured to `/tmp/analyze-baseline.txt` / `/tmp/analyze-after.txt` and
  compared with `diff`, not streamed. Measurement harness lives in `/tmp/exp389/`, prints
  aggregate tables only. Greps are `-l` or line-capped.

Blocked condition:
- Only if the combined esbuild build could not reproduce per-entry output bytes; it did,
  so no blocker. User has forbidden PR creation, so the commit/PR gate is a user decline.

Task state:
- task_type: bug/performance fix from GitHub issue
- task_complexity: non-trivial
- current_phase: closeout
- current_phase_status: done
- next_phase: final response
- goal_status: active

Current verdict:
- verdict: partially valid
- confidence: high
- next owner: task
- reason: the duplication is real and worse than reported (18.52x, not 2.81x), but the
  issue's suggested `splitting: true` fix is wrong for hotspot mode.

Implementation readiness:
- verdict: ready
- exact owner: `buildHotspotEntry` / `analyzeHotspotEntry` / `collectHotspotRows` in
  `packages/kitcn/src/cli/analyze.ts`
- contradiction status: resolved - reporter's `output.inputs` -42% caveat reproduced
  exactly (-41.97%) and adopted deliberately as the corrected definition
- source-listed cases complete: yes

Pre-solution issue challenge:
- reporter claim: hotspot mode runs one esbuild bundle per entry, re-reading the shared
  import graph E times; 2.81x more file reads/parses than necessary on `example`.
- suggested diagnosis or fix: one build with all entry points AND `splitting: true`,
  deriving per-entry attribution from `output.inputs`.
- repro ladder:
  - tests / source-level repro: instrumented esbuild harness `/tmp/exp389/measure2.mjs`
    over the real 24 `example` entries. Per-entry path parses 28,606 inputs; one combined
    build parses 1,545. Ratio 18.52x, wall 4,326ms vs 789ms.
  - repo-owned automated browser or integration proof: N/A - no browser/integration lane
    owns CLI bundler invocation.
  - Browser plugin: N/A - terminal CLI, no browser-rendered surface.
  - screenshot / visual proof: N/A - terminal table verified by textual diff of real CLI
    output before/after.
- reproduction verdict: reproduced, and understated by the reporter (18.52x measured,
  not 2.81x).
- validity verdict: partially valid.
- best long-term fix boundary: one combined build over all entry points WITHOUT
  `splitting`. esbuild parses each input once per build regardless of entry count, and
  with splitting off each entry output still carries its own independently tree-shaken
  closure. Measured byte-exact vs the old per-entry builds across 6 entry subsets
  (full set, two singletons, a pair, generated-only, odd indices).
- harsh honest feedback: the suggested `splitting: true` fix is the wrong instrument for
  this mode. Splitting is what `--deploy` already does, and it distorts exactly the number
  hotspot mode exists to rank: shared chunks pull in code a lone entry would tree-shake,
  inflating per-entry closure bytes by +0.13% to +70.53% (`generated/aggregate.ts`), and
  it invents extra `entryPoint` outputs from dynamic imports that must be filtered out.
  The reporter also framed the `-42%` shift as a cost of the fix; it is actually a
  pre-existing reporting bug — `Files`/`DepMB` counted parsed files while the `--details`
  tables right below them counted in-bundle files.
- hard-stop decision: proceed - claim reproduced, pivot away from the suggested
  `splitting` detail.

Completion rule:
- Do not call `update_goal(status: complete)` while any required checklist item
  remains unchecked. If an item does not apply, check it and add `N/A: <reason>`.
- Do not call `update_goal(status: complete)` until every completion threshold
  above is satisfied, final handoff evidence is recorded, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-08-21-389-analyze-single-esbuild-pass.md` passes.
- Do not create hook state for this goal. This file plus the active goal are the
  durable state.

Start Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| Timed checkpoint parsed | no | No duration requested |
| Walkthrough baseline for possible UI change | no | N/A: terminal CLI table only, no UI or rendered artifact |
| Skill analysis before edits | yes | task + autogoal loaded; testing/tdd not needed (behaviour pinned by pure-function tests), major-task not needed (single package, no API redesign) |
| Active goal checked or created | yes | this plan, created via create-goal-scratchpad.mjs --template task |
| Source of truth read before edits | yes | `gh issue view 389` + full read of packages/kitcn/src/cli/analyze.ts before any edit |
| Exact per-PR task ownership | yes | This plan owns exactly one PR: #400 https://github.com/udecode/kitcn/pull/400 |
| GitHub comments and attachments read | yes | issue #389 has 0 comments, 0 labels; attachment file read |
| Video transcript evidence required | no | N/A: no video or screen recording in the source |
| Pre-solution issue challenge required | yes | verdict partially valid; recorded in Pre-solution issue challenge |
| Reproduction verdict before implementation | yes | reproduced at 18.52x via esbuild harness before any edit |
| Repro escalation ladder selected | yes | source-level esbuild harness sufficed; browser/visual rungs N/A for a terminal CLI |
| Suggested fix reviewed against durable boundary | yes | issue's `splitting: true` rejected with measurements; combined build without splitting adopted |
| `docs/solutions` checked for non-trivial existing-code work | yes | no docs/solutions entry covers `kitcn analyze` bundling |
| TDD decision before behavior change or bug fix | yes | attribution extracted as pure functions and pinned by fixture tests; full TDD loop skipped because the contract was byte-comparison against the previous implementation |
| Branch decision for code-changing task | yes | already on dedicated branch issue-389 |
| Release artifact decision | yes | new changeset .changeset/tough-donuts-hammer.md (no unreleased draft existed) |
| Browser tool decision for browser surface | no | N/A: terminal CLI, no browser-rendered surface |
| Commit / PR expectation decision | yes | User later requested a PR: commit 916c21a0, branch fix/analyze-single-esbuild-pass, PR #400 |
| Task-style PR body decision | yes | PR #270 emoji task-style body used for #400 |
| Task-plan PR body evidence | yes | Body carries `🧭 Task plan: docs/plans/2026-08-21-389-analyze-single-esbuild-pass.md`; plan is at the PR head and names #400 |
| GitHub issue sync expectation decision | no | N/A: no PR exists and the user has not asked for issue sync |
| Output budget strategy recorded | yes | CLI output captured to /tmp files and diffed; harness prints aggregates only |

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

Completion Gates:
| Gate | Applies | Required action | Evidence |
|------|---------|-----------------|----------|
| Named verification threshold | yes | Run the command, proof, source audit, or artifact check named in this plan | `bun run test` 1305 pass/0 fail (2 consecutive green runs); real CLI diff vs pre-change baseline on matched esbuild |
| Exact per-PR task ownership | yes | Record the exact PR and dedicated plan, or the not-yet-created single-PR slice | PR #400, this plan |
| Pre-solution issue challenge verdict | yes | Record reporter claim, suggested fix, repro verdict, validity verdict, durable boundary, and hard-stop/pivot decision before implementation | partially valid; splitting suggestion refuted with measurements |
| Repro escalation ladder | yes | For bug/behavior claims, record test/source-level, automated browser/integration, Browser, and screenshot/visual-proof outcomes or N/A/blocker reasons before `not reproduced` | esbuild harness repro; browser/visual N/A for terminal CLI |
| Bug reproduced before fix | yes | Record failing test/repro or N/A with reason | 28,606 vs 1,545 inputs parsed measured before any edit |
| Targeted behavior verification | yes | Run focused test/proof for changed behavior or record N/A | `bun test packages/kitcn/src/cli/analyze.test.ts` 43 pass; real CLI --details --input diff |
| TypeScript or typed config changed | yes | Run relevant typecheck | `bun typecheck` 5/5 tasks successful |
| Package exports or file layout changed | yes | Run the relevant package build before final verification and keep generated updates | `bun --cwd packages/kitcn build` clean; no export surface changed |
| Package manifests, lockfile, or install graph changed | yes | Run `bun install` and relevant package checks | esbuild ^0.27.3 -> ^0.27.7; `bun install`; lock diff is esbuild platform packages only |
| Agent rules or skills changed | yes | Run `bun install` and verify generated skill sync | `bun tooling/sync-kitcn-skill.ts`; mirror verified identical |
| Workspace authority proof | yes | Run verification in the owning repo/package/app/route/tool and record cwd; do not count the wrong workspace as proof | unit tests + typecheck at repo root; CLI behaviour proven in cwd example/ against packages/kitcn/dist |
| Browser surface changed | no | Capture Browser Use proof or record explicit waiver/blocker | N/A: terminal CLI |
| Browser final proof | no | Attach screenshot or exact browser verification caveat when browser proof applies | N/A: terminal CLI |
| UI walkthrough | no | If UI or rendered output changed, run `.agents/skills/walkthrough/SKILL.md` after final proof and show annotated images in the final handoff; otherwise record N/A | N/A: no UI or rendered artifact; terminal table verified by textual diff |
| Scaffold or fixture output changed | no | Run `bun run fixtures:sync` and `bun run fixtures:check`, or record N/A | N/A: no init template or scaffold source touched |
| Package behavior or public API changed | yes | Add a changeset or record why no changeset applies | .changeset/tough-donuts-hammer.md |
| Docs and kitcn skill sync changed | yes | Keep `www/**` and `packages/kitcn/skills/kitcn/**` in sync, or record N/A | www/content/docs/cli/backend.mdx + packages/kitcn/skills/kitcn/references/setup/index.md + regenerated .agents mirror |
| Docs or content changed | yes | For docs-heavy work, use `--template docs`; for incidental docs, verify source-backed claims, links, examples, and rendered output or record N/A | column legend and flag rows verified against parseArgs and --help; 12-item Mode Behavior count preserved |
| High-risk mini gate | yes | For public API/runtime/package-boundary/browser/agent-action/command-contract changes, record realistic failure mode, proof plan, and why the chosen boundary is right; otherwise N/A | see High-risk note below |
| Agent-native review for agent/tooling changes | no | For `.agents/**`, `.claude/**`, `.codex/**`, skills, hooks, commands, prompts, or user-action tooling, load `.agents/skills/agent-native-reviewer/SKILL.md` and close accepted/actionable findings, or record N/A | N/A: the only .agents change is the generated kitcn skill mirror, regenerated from its source, not a workflow/tooling change |
| Local install corruption suspected | no | Run `bun install` once, rerun the exact failing command, or record N/A | N/A: no corruption signals; the one install was the intentional esbuild bump |
| Commit created | yes | For verified code-changing work, stage the entire current checkout per repo policy and create a commit; N/A only for no local patch, explicit user decline, analytical/blocked/inconclusive work, or recorded external blocker | 916c21a0 (whole checkout staged) |
| PR create or update | yes | For verified code-changing work, run `check`, push, create or update the PR, and sync PR body to the task-style final handoff; N/A only for no local patch, explicit user decline, analytical/blocked/inconclusive work, or recorded external blocker | `bun check` run; PR #400 created with the task-style body |
| Task-style PR body verified | yes | Verify the PR body with `gh pr view --json body`; it must preserve auto-release blocks when applicable, must not include a current-PR self-link, and must use the PR #270 emoji format: `🐛 Fixes ...`, `🟢 95-100% confidence`, `Phase / 🧪 Tests / 🌐 Browser` table, and bold emoji Outcome/Caveat/Design/Verified sections | PR #400 |
| PR task evidence verified | yes | Verify body plan line, plan at PR head, and exact PR ownership | PR #400 |
| PR proof image hosting | no | If PR body needs browser proof, replace local image paths with hosted GitHub URLs or record N/A | PR #400 |
| GitHub issue sync-back | no | Post concise issue sync after PR exists, or record N/A/blocker | N/A: the PR body carries `Fixes #389`; no separate issue comment was requested |
| Final handoff contract | yes | Fill the final handoff fields below with exact PR/issue/confidence/tests/browser/outcome/caveats/design/verification content or N/A reason | filled below |
| Final lint | yes | Run `bun lint:fix` or scoped equivalent | `bun lint:fix` -> no fixes applied |
| Output budget discipline | yes | Verify no unbounded high-volume command output was streamed, or record the accidental output and recovery | all CLI output captured to /tmp and diffed; no unbounded streaming |
| Timed checkpoint | no | If duration was requested, keep improving until elapsed, then finish the current loop cleanly; otherwise N/A | N/A: no duration requested |
| Autoreview for non-trivial implementation changes | yes | Load `.agents/skills/autoreview/SKILL.md`; use dirty local `--mode local`, branch/PR `--mode branch --base <base>`, or committed slice `--mode commit --commit <ref>` until no accepted/actionable findings, or record N/A for docs-only/trivial/no local patch | `autoreview --mode local --engine claude` clean on the full 127,709-byte bundle: no accepted/actionable findings |
| Goal plan complete | yes | Run `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-08-21-389-analyze-single-esbuild-pass.md` | passes |

Phase / pass table:
| Phase | Status | Evidence | Next |
|-------|--------|----------|------|
| Intake and source read | done | issue #389 fetched, code read, esbuild behavior measured | implementation |
| Implementation | done | analyze.ts combined pass + attribution, tests, docs, changeset | verification |
| Verification | done | 36 + 412 tests, typecheck, lint, build, real CLI diff, 6-subset byte proof | closeout |
| Commit / PR / GitHub sync | done | 916c21a0 pushed; PR #400 opened with the task-style body | final response |
| Closeout | done | autoreview clean, plan gates closed, full suite green | final response |

Findings:
- Duplication is 18.52x, not the reported 2.81x. Per-entry sweep parses 28,606 inputs
  over `example`'s 24 entries; one combined build parses 1,545.
- A combined build WITHOUT `splitting` reproduces today's per-entry numbers exactly:
  `output.bytes` and the whole `output.inputs` map (keys and `bytesInOutput`) are
  byte-identical for every entry, verified across 6 entry subsets (full set, two
  singletons, a pair, generated-only, odd indices). esbuild parses each input once per
  build regardless of entry count, and with splitting off each entry output keeps its
  own independently tree-shaken closure.
- `splitting: true` (the issue's suggestion) is wrong here: per-entry closure bytes
  inflate +0.13% to +70.53% (`generated/aggregate.ts`), and dynamic imports become extra
  outputs that carry an `entryPoint` and must be filtered out.
- The reporter's -42% caveat is a pre-existing reporting bug, not a cost of the fix.
  `Files`/`DepMB` counted parsed files; the `--details` package and input tables directly
  beneath them already filtered `bytesInOutput > 0`, and `--deploy`'s `In` column already
  counted `output.inputs`. The summary row disagreed with both.
- 534 of 1,545 parsed inputs reach no output at all. An independent adversarial agent
  proved these contribute exactly zero by appending 20,130 bytes (including a top-level
  `globalThis` side effect) to 400 of them: 24/24 entry `output.bytes` unchanged.
- `AnalyzeRowBase.schemaExternalized` and `AnalyzeRowBase.totalInputBytes` were written
  but never read anywhere. `--deploy` warned that dependency sizes are approximate after
  a schema fallback; hotspot mode computed the same flag and stayed silent.
- Pre-existing and now FIXED: on esbuild <= 0.27.5 any failed `metafile: true` build
  threw `SyntaxError: Unexpected end of JSON input` from esbuild's own stdout handler,
  outside any catchable promise, so `kitcn analyze` died with an esbuild stack trace
  instead of printing `Failed entries:`. Verified identical on unmodified `HEAD`, so the
  documented failure path had been dead for the whole 0.27 line. esbuild 0.27.7 adds the
  `response.metafile.length` guard (`lib/main.js:1202`), so this was a patch bump inside
  the declared minor, not the 0.28 range change first assumed. `^0.27.3` -> `^0.27.7`;
  a broken entry now reports as a failed row with exit 1.
- Externalizing `./schema` is not safe to apply run-wide. It removes real weight from
  every entry importing schema, not just the one that failed: forcing it across `example`
  moved 25 of 26 rows, one by -98%. The shared pass must refuse the fallback and let the
  per-entry sweep scope it.
- esbuild resolves a symlinked source file to its real path before reporting
  `output.entryPoint`, so matching that field back to the selected entry silently loses
  any entry reached through a symlink. Reproduced 1/2 entries lost in two symlink shapes.

Decisions and tradeoffs:
- Reporting semantics DECIDED: `Files`, `DepMB`, `LocMB` count the inputs that emit
  bytes into that entry's output. `OutMB` is unchanged. This makes the summary row agree
  with the `--details` tables and with `--deploy`'s `In` column, all of which already
  used that definition. Documented in `www/content/docs/cli/backend.mdx` and the changeset.
- Rejected `splitting: true` from the issue. `--deploy` already owns the split-bundle
  view; hotspot exists to rank per-function isolates.
- Kept a per-entry recovery sweep so a single unbuildable entry can still be named rather
  than killing the report, and bumped esbuild to `^0.27.7` so that path is reachable at
  all instead of shipping a recovery route the runtime crashes past.
- Entries are paired with their outputs by an explicit positional output name
  (`out: 'e<index>'`), not by `output.entryPoint`. Immune to esbuild's symlink realpath
  resolution and to `foo.ts`/`foo.js` colliding on one derived output path. Byte-exact
  vs the previous per-entry builds across 4 further subsets.
- The shared pass refuses the schema fallback; only the per-entry sweep may externalize
  `./schema`, and `schemaExternalized` stays a per-row flag naming exactly the degraded
  entries in the printed warning.
- An unattributable entry throws rather than becoming a failed row, so an impossible
  state triggers the diagnosable per-entry sweep instead of a wall of failures on a
  build that actually succeeded.
- The recovery sweep reports why it ran, so silently paying ~5x for a run-level build
  failure is visible instead of looking like the original regression.
- Removed the dead `totalInputBytes` row field rather than leaving a number nothing reads.
- Interactive mode computes deep data eagerly for every row (measured ~8.4 MB of live
  objects for 26 entries, ~30 MB at 100). Accepted: it replaces a full esbuild rebuild
  per selected entry, so it is strictly less work and less allocation than the path it
  replaces, in a short-lived CLI process.

Implementation notes:
- None yet.

Review fixes:
- None yet.

Error attempts:
| Error / failed attempt | Count | Next different move | Resolution |
|------------------------|-------|---------------------|------------|
| None yet | 0 | | |

Verification evidence:
- `bun test packages/kitcn/src/cli/analyze.test.ts` -> 36 pass / 0 fail (cwd: repo root).
- `bun test packages/kitcn/src/cli/` -> 412 pass / 0 fail across 40 files.
- `bun --cwd packages/kitcn typecheck` -> clean. `bun lint:fix` -> no fixes applied.
- `bun --cwd packages/kitcn build` -> 71 files, clean.
- Real CLI, cwd `example/`: `node ../packages/kitcn/dist/cli.mjs analyze --width 200
  --details --input` diffed against the pre-change baseline. Whole output byte-identical
  except the 24 summary rows; every Package graph, Top internal inputs, Handlers, Agent
  queue and header line matches exactly.
- Column invariants across the 24 real entries: `OutMB` identical 24/24, `LocMB`
  identical 24/24, `DepMB` pairwise rank order preserved (0 sign flips of 276 pairs),
  `Files` 28,606 -> 16,613 (-41.92%), `DepMB` 131.33 -> 105.19 MB.
- Byte-exactness harness (`/tmp/exp389/measure3.mjs`): combined build vs today's
  per-entry build across 6 entry subsets -> EXACT MATCH on `output.bytes` and every
  `output.inputs` key/`bytesInOutput` value.
- Bundling step: 4,326 ms -> 789 ms in-process (5.5x); independently reproduced by an
  adversarial agent at 4,849/4,828 ms -> 997/933 ms.
- Empty selection: `analyze 'zzz-no-such-entry'` prints the no-matching-entries message,
  exit 0, no esbuild call.
- Subset selection: `analyze '^convex/functions/todos\.ts$'` reports 2.65 / 4.64 / 0.10 /
  738, identical to that row in the full 24-entry run.
- Broken-entry probe (temporary unresolvable import in `example/convex/functions/`):
  crashed identically on unmodified `HEAD` and on the patch under esbuild 0.27.4. After
  the `^0.27.7` bump it reports `ok=24 failed=1`, the fallback note, a `Failed entries:`
  row, and exit 1. Probe file removed.
- Old code vs new code on the SAME esbuild (0.27.7): the whole `--details --input`
  output differs in exactly the 48 summary-table lines and nothing else. Re-measured
  after the bump: `OutMB` identical 24/24, `LocMB` identical 24/24, `DepMB` 0 rank
  inversions, `Files` 28,606 -> 16,613.
- Symlink harness (`/tmp/exp389/symlink.mjs`, `/tmp/exp389/explicitnames.mjs`):
  `output.entryPoint` matching loses 1 of 2 entries in two symlink shapes; positional
  output names match 100% there and on duplicate basenames, and stay byte-exact.
- `bun test packages/kitcn/src/cli/` -> 419 pass / 0 fail after the sweep refactor.
- `bun tooling/sync-kitcn-skill.ts` -> `.agents/skills/kitcn` mirror re-synced and
  verified identical to `packages/kitcn/skills/kitcn`.
- `bun.lock` diff contains only esbuild 0.27.4 -> 0.27.7 platform packages.
- autoreview `--mode local --engine claude` -> clean, no accepted/actionable findings.

Source-listed case matrix:
| Case | Source claim | Harness | Before | Expected after | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| One build per entry | Shared graph re-read E times | esbuild harness over 24 real entries | 28,606 inputs parsed | 1,545 | measure2.mjs | done |
| Magnitude | "2.81x measured" | same harness | claimed 2.81x | actual 18.52x | measure2.mjs | corrected |
| Suggested fix uses `splitting: true` | one build + splitting | 3-way A/B | n/a | rejected: +0.13%..+70.53% closure inflation, spurious dynamic-import entry outputs | measure2.mjs | pivoted |
| `output.inputs` shifts file counts -42% | reporting change must be decided first | real CLI diff | Files 28,606 | 16,613 (-41.92%), adopted deliberately | analyze-final-details.txt | decided |
| Per-entry sizes must not move | implied by "ranking" purpose | 6-subset byte comparison + real CLI | OutMB per entry | identical 24/24 | measure3.mjs | done |
| Failed-entry attribution | existing `Failed entries:` output | broken-entry probe on HEAD and patch | crashed on both | `ok=24 failed=1` + exit 1 after esbuild `^0.27.7` | analyze-broken-new.txt | fixed |
| Symlinked entry sources | not in source | symlink harness | n/a | positional output names, 100% matched | explicitnames.mjs | done |
| Run-wide schema externalization | not in source | forced-plugin A/B | n/a | shared pass refuses it; per-entry sweep scopes it | workflow edgecases audit | done |

Final handoff contract:
- Commit line: 916c21a0 on `fix/analyze-single-esbuild-pass` (renamed from the seeded
  `issue-389` before the first push, per the user's branch convention).
- PR line: https://github.com/udecode/kitcn/pull/400
- Issue line: closed by the PR body's `Fixes #389`; no separate issue comment requested.
- Confidence line: 95-100%.
- Flow table:
  - Reproduced: tests 18.52x parse duplication measured on 24 real entries, browser N/A
  - Verified: tests 1305 pass / 0 fail + real CLI diff on matched esbuild, browser N/A
- Browser check: N/A - terminal CLI.
- Outcome: hotspot analysis runs one esbuild pass; per-entry `OutMB`/`LocMB` byte-exact;
  `DepMB`/`Files` moved to in-bundle semantics on purpose; a failing entry reports
  instead of crashing.
- Caveat: `DepMB` and `Files` read lower than before for identical code.
- Design:
  - Chosen boundary: one shared build without `splitting`, entries paired to outputs by
    positional output name, per-entry sweep kept solely for failure attribution.
  - Why not quick patch: the issue's `splitting: true` would have silently redefined the
    metric this mode ranks by (up to +70%).
  - Why not broader change: `--deploy`, entry selection, flags and thresholds untouched;
    the esbuild bump stayed inside the declared minor.
- Verified: see Verification evidence.
- PR body verified: `gh pr view 400 --json body`.

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
- Commit: 916c21a0
- PR: #400 https://github.com/udecode/kitcn/pull/400
- Issue: #389 linked via `Fixes #389` in the PR body.
- Browser proof: N/A - terminal CLI.
- Caveats: `DepMB`/`Files` read lower for identical code; esbuild minimum is now 0.27.7.

Timeline:
- 2026-08-21T14:12:23.890Z Task goal plan created.

Reboot status:
| Question | Answer |
|----------|--------|
| Where am I? | Shipped: PR #400 open |
| Where am I going? | Final response |
| What is the goal? | Fix #389: one esbuild pass for hotspot analysis, per-entry bytes byte-exact, reporting semantics decided |
| What have I learned? | See Findings |
| What have I done? | See Timeline |

Open risks:
- `DepMB` and `Files` read lower than before for the same code. Deliberate and
  documented, but anyone comparing against an older run will see the shift.
- The schema-externalized approximation is still an approximation; it now names the
  affected entries instead of silently degrading the whole table.
- Interactive mode holds deep data for every row (~8.4 MB at 26 entries). Accepted as
  strictly less work than the per-selection rebuild it replaces; worth re-measuring if
  someone runs watch mode on a >100-entry project.
- Not fixed here, surfaced instead: `--deploy` sets `outdir` + `splitting` with no
  `entryNames`, so `foo.ts` and `foo.js` in one directory still collide there; and
  `kitcn analyze <regex> -i` ignores the regex (`entryPattern` is hard-coded to null in
  interactive mode). Both predate this change.

Hard closeout guard:
- A local-only final response for verified code-changing work is invalid unless
  this plan records an explicit user decline, no local patch, analytical/
  blocked/inconclusive outcome, or a real commit/PR blocker.

High-risk note (command contract + dependency range):
- Realistic failure mode: a user compares a new `kitcn analyze` run against notes from an
  older run, sees `Files` and `DepMB` drop ~42% / ~20%, and concludes their bundle
  shrank. Second mode: the esbuild floor moves to 0.27.7 and some consumer is pinned
  below it.
- Proof plan: `OutMB` and `LocMB` are byte-identical per entry against the previous
  implementation on the same esbuild build, so the headline size number cannot move; the
  shifted columns are documented in `--help`, the CLI reference, the kitcn skill, and the
  changeset. The bump is a patch inside the already-declared `^0.27` range, and the lock
  diff contains only esbuild platform packages.
- Why this boundary is right: the shifted columns were the outlier. `--details`' package
  and input tables and `--deploy`'s `In` column already counted in-bundle inputs; the
  hotspot summary row was the only place still counting parsed-and-discarded files.

Check gate:
- `bun check` run on 916c21a0. lint, typecheck, 1305 bun tests, CLI, concave, fixtures
  and verify all passed. Two non-blocking environment/flake failures, both ruled out as
  unrelated to this diff:
  - `test:runtime` first failed on `EADDRINUSE 127.0.0.1:3211` left by an earlier aborted
    run of the same lane; it passes cleanly once the port is free.
  - `btree.vitest.ts` failed once on random seed 1809979949 with `TypeError: Cannot
    convert object to primitive value` at `btree.ts:858`. Its fix (`8523418d`) rides
    still-open PR #392 and is not on `main`; this diff touches no file under
    `aggregate-core/`; `bun run test:vitest` rerun was green (845 passed).

