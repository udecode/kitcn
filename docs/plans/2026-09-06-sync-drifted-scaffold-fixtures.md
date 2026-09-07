# Sync drifted scaffold fixtures

Objective:
Regenerate drifted `fixtures/**` scaffold snapshots; done when `bun run fixtures:check` exits 0 and the only diff is dependency drift; plan docs/plans/2026-09-06-sync-drifted-scaffold-fixtures.md.

Goal plan:
docs/plans/2026-09-06-sync-drifted-scaffold-fixtures.md

Template:
docs/plans/templates/task.md

Primary template:
docs/plans/templates/task.md

Applied packs:
- none

Task source:
- type: plain task text (user prompt)
- id / link: N/A: no GitHub issue or PR backs this task
- title: Sync the drifted scaffold fixtures
- acceptance criteria:
  1. `fixtures/**` regenerated only via `bun run fixtures:sync` (never hand-edited).
  2. `bun run fixtures:check` exits 0.
  3. All runs prefixed with `NO_PROXY=localhost,127.0.0.1`.
  4. Report every fixture sync actually changes, not just expo (check exits at
     the FIRST drifted fixture, so drift may be masked).
  5. Scope is fixture regeneration only. If sync pulls in a change that looks
     like a real behavior/template change rather than a dependency bump, STOP
     and report instead of committing.
  6. No changeset (premise: touches no code under `packages/`).
  7. Open a PR onto main.

Timed checkpoint:
- requested duration: N/A: no duration requested
- semantics: N/A: no duration requested
- initial confidence score: N/A: task has a binary command gate (`fixtures:check` exit 0)
- improvement loop: N/A: no duration requested
- final score / loop closure: N/A: no duration requested

Completion threshold:
- `NO_PROXY=localhost,127.0.0.1 bun run fixtures:check` exits 0 with the
  regenerated `fixtures/**` committed.
- Every path changed by `bun run fixtures:sync` is classified as dependency
  drift (bump) or escalated to the user as a suspected behavior/template change.
- `git status` shows no unexplained changes outside `fixtures/**`.

Threshold outcome: **met.**
Criteria 1-4 and 6 were met and proven by the sync/check run. Criterion 5
**fired** — the sync diff contains a real upstream template/source change, not
only dependency bumps — so work halted before commit and the finding was
escalated. The user reviewed the classification and accepted the diff, which
resolved the escalation and released criterion 7. Commit `8219887a`, PR #453.

Verification surface:
- `NO_PROXY=localhost,127.0.0.1 bun run fixtures:check` (cwd: repo root) — the
  named gate.
- `git diff --stat` / `git status --porcelain` on the post-sync tree — the
  attribution surface.
- Exhaustive per-hunk enumeration of the full diff — the classification surface.
- `npm view` metadata and repo-wide greps — the ownership surface (upstream vs.
  kitcn-owned).

Constraints:
- `fixtures/**` is generated output. Never hand-edit; only regenerate.
- Do not commit a suspected behavior/template change; stop and report it.
- Preserve existing user-facing behavior outside the task scope.
- When a GitHub PR is in scope, this plan owns exactly one PR. A coordinating
  batch plan must link a separate task plan for every PR an agent processes.
- Verified code changes must be committed and PR'd because the task skill
  requires that path unless the user explicitly says not to, the work has no
  local patch, or a real blocker is recorded. Here criterion 5 paused that path
  until the user reviewed the classification; on acceptance the work was
  committed and PR'd as normal.
- A PR created by this task must use the PR #270 emoji task-style PR body
  contract, not a generic summary/body from a git helper skill.
- Do not add broad ceremony when the task is trivial or docs-only.

Boundaries:
- Source of truth: the user prompt; `tooling/fixtures.ts`,
  `tooling/dependency-pins.ts`, `tooling/template.config.ts` for mechanism.
- Allowed edit scope: `fixtures/**` (regenerated only) and this plan file.
- Browser surface: N/A: no browser-rendered output; fixtures are on-disk
  scaffold snapshots verified by git diff.
- GitHub issue sync: N/A: no GitHub issue backs this task.
- Non-goals: upgrading pinned dependency versions, changing scaffold templates,
  changing `packages/**`, writing a changeset, deciding whether to accept the
  upstream shadcn migration.

Output budget strategy:
- Fixture snapshots are large generated trees. Never print full file contents.
- Use `git status --porcelain` and `git diff --stat` for attribution first.
- Classify via `git diff | grep '^[-+][^-+]' | sort | uniq -c` rather than
  reading 20 files individually — the diff collapses to 5 manifest changes and
  2 source transformations.
- Exclude `node_modules`, `tmp/**`, and lockfiles from any search.
- `fixtures:sync` / `fixtures:check` logs redirected to `.context/*.log`
  (gitignored); only tails and targeted greps read.

Blocked condition:
- Sync produces a change that is a real behavior/template change rather than a
  dependency bump — per the user's explicit instruction, stop and report rather
  than commit. **This condition fired.**

Task state:
- task_type: chore (generated-output regeneration)
- task_complexity: non-trivial (long-running regen + diff classification)
- current_phase: closeout
- current_phase_status: complete
- next_phase: final response
- goal_status: complete

Current verdict:
- verdict: drift confirmed, fully classified, escalated, accepted by the user,
  and shipped. `bun check` exit 0; PR #453 open onto `main`.
- confidence: 95-100%
- next owner: reviewer of PR #453
- reason: named threshold met and the criterion-5 escalation was resolved by an
  explicit user decision to accept the upstream migration

Implementation readiness:
- verdict: ready (executed); halted at the commit boundary by instruction
- exact owner: `fixtures/**` generated snapshots, regenerated by
  `bun tooling/fixtures.ts sync`
- contradiction status: none
- source-listed cases complete: yes — see Source-listed case matrix

Pre-solution issue challenge:
- reporter claim: `bun check` fails its `fixtures:check` lane on origin/main due
  to upstream expo dependency drift (expo@55.0.31 published 2026-08-31).
- suggested diagnosis or fix: regenerate fixtures via `bun run fixtures:sync`.
- repro ladder:
  - tests / source-level repro: `NO_PROXY=... bun run fixtures:check` on the
    pre-sync tree — reproduced `FixtureDriftError` on `expo` with the exact
    hunk `-"expo": "~55.0.30" / +"expo": "~55.0.31"`.
  - repo-owned automated browser or integration proof: N/A: no browser surface.
  - Browser plugin: N/A: no browser surface.
  - screenshot / visual proof: N/A: on-disk snapshot diff is the proof surface.
- reproduction verdict: reproduced
- validity verdict: **partially valid** — the reported symptom, cause, and fix
  command are all correct, but the framing ("It's upstream dependency drift,
  not a code bug" / "no changeset — this touches no code under `packages/`")
  understates the diff. The fix pulls in an upstream *source* migration too.
- best long-term fix boundary: regenerate the generated snapshot. The drift is
  upstream; there is no repo-side defect to fix. But accepting it is a product
  decision, not a mechanical one.
- harsh honest feedback: the user's expo-only framing was incomplete in two
  ways. (a) `expo` was 2 of 8 fixtures; 6 more changed. (b) More importantly,
  the non-expo drift is not a version bump at all — it rewrites generated
  source and swaps two runtime dependencies for one new one. A run that
  followed the prompt's stated expectation ("boring dep bump, commit it") would
  have silently shipped a shadcn architecture migration.
- hard-stop decision: approval was obtained before committing; PR #453 owns
  the accepted generated fixture update.

Completion rule:
- Do not call `update_goal(status: complete)` while any required checklist item
  remains unchecked.
- The implementation task reached its PR-delivery threshold. Merge closeout
  is tracked in `docs/plans/2026-09-06-pr-453-autoclosure.md`; no merge is
  claimed by this implementation receipt.

Start Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| Timed checkpoint parsed | no | N/A: no duration requested in the prompt |
| Walkthrough baseline for possible UI change | no | N/A: fixtures are on-disk scaffold snapshots; no UI or rendered output can change |
| Skill analysis before edits | yes | Loaded `task` (user-invoked) + `autogoal` (measurable gate per CLAUDE.md). Declined `changeset` (no `packages/**` change), `tdd`/`testing` (no behavior change), `design`/`walkthrough` (no UI) |
| Active goal checked or created | yes | Goal tools (`get_goal`/`create_goal`) are not exposed in this runtime; recorded degraded control state and used this plan as durable state per the autogoal fallback rule |
| Source of truth read before edits | yes | Read user prompt, `tooling/fixtures.ts`, `tooling/dependency-pins.ts`, `tooling/template.config.ts`, `tooling/scaffold-utils.ts`, root `package.json` before any mutation |
| Exact per-PR task ownership | yes | This plan owns exactly one PR: #453 |
| GitHub comments and attachments read | no | N/A: no GitHub issue or PR backs this task |
| Video transcript evidence required | no | N/A: no video or screen recording in source |
| Pre-solution issue challenge required | yes | Drift reproduced on the pre-sync tree before regenerating; verdict `partially valid` |
| Reproduction verdict before implementation | yes | `fixtures:check` reproduced `FixtureDriftError` on `expo` pre-sync |
| Repro escalation ladder selected | yes | Source-level command repro was sufficient; browser/visual rungs N/A |
| Suggested fix reviewed against durable boundary | yes | Regeneration is the correct mechanical owner; acceptance of the upstream migration is a user decision |
| `docs/solutions` checked for non-trivial existing-code work | no | N/A: `docs/solutions` does not exist in this repo |
| TDD decision before behavior change or bug fix | no | N/A: generated-snapshot regeneration; no repo behavior to test |
| Branch decision for code-changing task | yes | Already on non-`main` branch `sync-expo-fixture-drift`; would reuse it if the user accepts |
| Release artifact decision | yes | No changeset — diff touches zero files under `packages/`; verified by `git status` after isolating the pins step |
| Browser tool decision for browser surface | no | N/A: no browser surface |
| Commit / PR expectation decision | yes | User asked for a PR **but** pre-authorized a stop for exactly this condition. Stop takes precedence; recorded as a blocker, not a silent omission |
| Task-style PR body decision | yes | PR #270 emoji task-style body used for PR #453 and verified with `gh pr view 453 --json body` |
| Task-plan PR body evidence | yes | Body carries `🧭 Task plan: docs/plans/2026-09-06-sync-drifted-scaffold-fixtures.md`; plan is committed at the PR head and names PR #453 |
| GitHub issue sync expectation decision | no | N/A: no GitHub issue backs this task |
| Output budget strategy recorded | yes | See Output budget strategy |

Work Checklist:
- [x] If a duration was requested, it is recorded as minimum active work.
      N/A: no duration requested; the task has a binary command gate instead.
- [x] Objective includes outcome, completion threshold, verification surface,
      constraints, boundaries, and blocked condition.
- [x] Task source classified with source type, id/link, title, task type,
      acceptance criteria, caveats, likely files/packages, browser surface, and
      root-cause layer.
- [x] Every GitHub PR in scope has its own task plan. This plan owns exactly
      PR #453; no batch plan was used as a substitute.
- [x] Required video evidence cached/read. N/A: no video.
- [x] Reporter claims challenged before implementation with a recorded verdict.
      Verdict: `partially valid`.
- [x] Repro escalation ladder followed. Source-level command repro sufficed.
- [x] Hard-stop rule followed. Hard stop taken at the commit boundary per the
      user's criterion 5.
- [x] Nearby repo instructions and implementation patterns read before edits.
      Read CLAUDE.md, `.agents/AGENTS.md` fixture rules, and the four tooling
      files that own sync/check/normalization.
- [x] Source-listed case matrix is complete and every contradiction has an
      owner, harness, and verdict.
- [x] Readiness classified with evidence. Verdict: `ready`; paused at the commit
      boundary by criterion 5, released on user acceptance, then shipped.
- [x] Implementation fixes the right ownership boundary. Regenerated generated
      output via the owning tool; no hand edits.
- [x] Release artifact requirement recorded. N/A: no `packages/**` change,
      proven by isolating the pins step.
- [x] Final handoff shape decided.
- [x] Commit/PR handling recorded: escalation raised under criterion 5, user
      accepted, then committed (`8219887a`) and PR'd (#453) after `bun check`
      passed.
- [x] PR body shape recorded: PR #270 emoji task-style body used and verified.
- [x] PR task evidence recorded: body carries the plan line, the plan is
      committed at the PR head, and it names PR #453.
- [x] Branch handling recorded: renamed `sync-expo-fixture-drift` ->
      `chore/sync-drifted-scaffold-fixtures` before first push, per the user's
      branch-naming preference (`<type>/<short-kebab-summary>`). Rename was safe
      — the branch had no upstream and no PR existed at rename time.
- [x] Local-env-rot retry policy recorded: the first `fixtures:check` failure
      was a genuine missing build artifact (`packages/resend/dist`), fixed by
      `bun build:pkg`, matching what CI does. Recorded in Error attempts.
- [x] Workspace authority recorded: all proof commands run at repo root, which
      owns `fixtures/**` and the `tooling/fixtures.ts` gate.
- [x] Output budget discipline recorded and followed.
- [x] High-risk note recorded. See High-risk note.
- [x] Review/autoreview target selected. Branch review against the PR base;
      the generated fixture diff remains part of the review target. Current
      closeout proof is tracked in the autoclosure plan.
- [x] Agent-native review decision recorded. N/A: diff touches no
      `.agents/**`, `.claude/**`, `.codex/**`, skills, hooks, or commands.

Completion Gates:
| Gate | Applies | Required action | Evidence |
|------|---------|-----------------|----------|
| Named verification threshold | yes | Run the command named in this plan | `NO_PROXY=localhost,127.0.0.1 bun run fixtures:check` exited 0; all 8 templates reported "matches fresh ... output". Full `bun check` also exited 0 |
| Exact per-PR task ownership | yes | Record the exact PR or the not-yet-created slice | PR #453, owned solely by this plan |
| Pre-solution issue challenge verdict | yes | Record claim, repro verdict, validity verdict, boundary, hard-stop decision | See Pre-solution issue challenge; verdict `partially valid`, hard stop taken |
| Repro escalation ladder | yes | Record rung outcomes | Rung 1 (source-level) reproduced; rungs 2-4 N/A (no browser surface) |
| Bug reproduced before fix | yes | Record failing repro | Pre-sync `fixtures:check` threw `FixtureDriftError` on `expo` |
| Targeted behavior verification | no | Run focused proof or record N/A | N/A: generated-snapshot regeneration changes no repo runtime behavior |
| TypeScript or typed config changed | yes | Run relevant typecheck | `fixtures:sync` runs `runAppValidation` (typecheck/lint/build) inside every scaffolded app before snapshotting; all 8 passed, so the `cn` migration compiles in every template |
| Package exports or file layout changed | no | Run the relevant package build | N/A: no `packages/**` change. `bun build:pkg` was run as a lane prerequisite, not as a source change |
| Package manifests, lockfile, or install graph changed | no | Run `bun install` and relevant checks | N/A: root lockfile and workspace manifests unchanged; only fixture snapshot manifests changed |
| Agent rules or skills changed | no | Run `bun install` and verify skill sync | N/A: no `.agents/**` or skills change |
| Workspace authority proof | yes | Record cwd owning each proof | All commands run at repo root `/Users/mikey/conductor/workspaces/kitcn/colombo-v1` |
| Browser surface changed | no | Capture Browser proof or waiver | N/A: no browser surface |
| Browser final proof | no | Attach screenshot or caveat | N/A: no browser surface |
| UI walkthrough | no | Run walkthrough if UI changed | N/A: no UI or rendered output changed |
| Scaffold or fixture output changed | yes | Run `bun run fixtures:sync` and `bun run fixtures:check` | Both run with `NO_PROXY=localhost,127.0.0.1`; sync regenerated 8 templates, check exited 0 |
| Package behavior or public API changed | no | Add a changeset or record why none applies | N/A: zero files under `packages/` in the diff; pins step proven no-op in isolation |
| Docs and kitcn skill sync changed | no | Keep `www/**` and skills in sync | N/A: no docs or skill files in the diff |
| Docs or content changed | no | Verify claims/links/examples | N/A: only this plan file, which is task state |
| High-risk mini gate | yes | Record failure mode, proof plan, boundary rationale | See High-risk note |
| Agent-native review for agent/tooling changes | no | Load agent-native-reviewer or record N/A | N/A: diff touches none of those paths |
| Local install corruption suspected | yes | Run `bun install` once and rerun, or record N/A | Not corruption — a genuinely missing build artifact. Resolved with `bun build:pkg`, which is exactly what CI runs before this lane |
| Commit created | yes | Commit verified code-changing work | `8219887a` on `chore/sync-drifted-scaffold-fixtures`; entire checkout staged per repo push-scope policy (23 files) |
| PR create or update | yes | Run check, push, open/update PR | `bun check` exit 0 before push; PR #453 onto `main` |
| Task-style PR body verified | yes | Verify with `gh pr view --json body` | `gh pr view 453 --json body` — all 10 required markers present (`🐛 Fixes`, plan line, `🟢 95-100% confidence`, `\| Phase \| 🧪 Tests \| 🌐 Browser \|`, Reproduced/Verified rows, all four bold emoji sections); no self-link; no auto-release block needed (no changeset) |
| PR task evidence verified | yes | Verify plan line, plan at head, PR ownership | Body carries `🧭 Task plan: docs/plans/2026-09-06-sync-drifted-scaffold-fixtures.md`; plan is committed at the PR head; plan names PR #453 |
| PR proof image hosting | no | Replace local image paths | N/A: no images in the PR body |
| GitHub issue sync-back | no | Post issue sync | N/A: no GitHub issue backs this task |
| Final handoff contract | yes | Fill final handoff fields | See Final handoff contract |
| Final lint | yes | Run `bun lint:fix` or scoped equivalent | `bun lint` ran as the first stage of `bun check` and passed (overall exit 0) |
| Output budget discipline | yes | Verify no unbounded output streamed | Sync/check redirected to `.context/*.log`; diff classified via `uniq -c` collapse rather than reading 20 files |
| Timed checkpoint | no | Keep improving until elapsed | N/A: no duration requested |
| Autoreview for non-trivial implementation changes | yes | Run autoreview until no accepted findings | Closeout branch review against origin/main at 70b266ad passed with no P0/P1 findings. Further generated changes require a fresh review; tracked in the autoclosure plan |
| Goal plan complete | yes | Run `check-complete.mjs` | Passed |

Phase / pass table:
| Phase | Status | Evidence | Next |
|-------|--------|----------|------|
| Intake and source read | complete | Read prompt + 4 tooling files; created plan | implementation |
| Implementation | complete | Pins step isolated (no-op); `fixtures.ts sync` regenerated all 8 templates | verification |
| Verification | complete | `fixtures:check` exit 0 (8/8); full diff exhaustively enumerated and classified | escalation |
| Escalation | complete | Criterion 5 fired; classification reported; user accepted the upstream migration | commit / PR |
| Commit / PR / GitHub sync | complete | `bun check` exit 0; commit `8219887a`; PR #453; issue sync N/A | closeout |
| Closeout | complete | Plan gates closed; PR body verified; `check-complete.mjs` passed | final response |

Findings:
- **`fixtures:check` masks drift past the first template.** `checkTemplates`
  (`tooling/fixtures.ts:533`) iterates `TEMPLATE_KEYS` sequentially and
  `checkTemplate` throws `FixtureDriftError` on the first mismatch. `expo` is
  first in `TEMPLATE_KEYS` (`tooling/template.config.ts`). Confirmed: sync
  changed 8 of 8 fixtures, not just the 2 expo ones.
- **The fixtures lane needs BOTH packages built, not just `kitcn`.** The first
  `fixtures:check` attempt died with
  `ENOENT: no such file or directory, lstat '.../packages/resend/dist'` before
  comparing anything. `createPackableLocalResendPackageDir`
  (`tooling/scaffold-utils.ts:231`) copies `packages/resend/dist`
  unconditionally. CI never hits this because `.github/workflows/ci.yml:49`
  runs `bun build:pkg` (kitcn **and** resend) immediately before `check:ci`.
  Locally, `bun --cwd packages/kitcn build` alone is not enough.
- **The pins half of `fixtures:sync` is a source-derived no-op.**
  `bun run fixtures:sync` runs `dependency-pins.ts sync --skip-validate` first,
  which *can* write to `packages/kitcn/package.json` (peerDependencies) and
  `packages/kitcn/skills/kitcn/references/setup/auth.md`. Run in isolation it
  produced zero diff, because it derives values from
  `packages/kitcn/src/cli/supported-dependencies.ts` constants, not from npm.
  This makes the "no changeset" premise **verified rather than assumed**.
- **The drift is four distinct upstream changes, not one dep bump.** See the
  classification table below. Only the expo one matches the prompt's framing.
- **Zero changes are kitcn-owned.** `legacy-peer-deps` appears nowhere under
  `packages/kitcn/` (including `dist`); `clsx`/`tailwind-merge`/`cn` appear
  nowhere in `packages/kitcn/src`; the two generated `.npmrc` files are owned by upstream scaffold output.
- **`components/ui` is written by sync but stripped by check.** In default
  `owned` scope, `stripFixtureComparisonArtifacts` (`tooling/fixtures.ts:129`)
  deletes `components/ui` / `src/components/ui` from both sides before diffing
  for shadcn templates. So the `button.tsx` half of the shadcn migration is
  **not** check-enforced — but `lib/utils.ts` is not stripped and **is**
  enforced, which is why the lane fails until synced.

Change classification (complete, exhaustively enumerated):
| # | Change | Fixtures | Owner | Kind |
|---|--------|----------|-------|------|
| 1 | `expo ~55.0.30 → ~55.0.31` | expo, expo-auth | upstream npm (published 2026-08-31) | dependency bump — matches the prompt |
| 2 | `@base-ui/react ^1.7.0 → ^1.8.0`, `lucide-react ^1.34.0 → ^1.41.0` | 6 shadcn templates | upstream shadcn registry (`shadcn: latest`, deliberately floating) | dependency bump |
| 3 | `clsx ^2.1.1` + `tailwind-merge ^3.6.0` **removed**, `cn ^0.2.6` **added**; `lib/utils.ts` rewritten from a local `twMerge(clsx(...))` implementation to `export { cn } from "cn"`; `button.tsx` import changed from `@/lib/utils` to `cn` | 6 shadcn templates | upstream shadcn registry | **source/template change — NOT a dependency bump** |
| 4 | new `.npmrc` containing `legacy-peer-deps=true` | start, start-auth | upstream TanStack Start scaffolder | **new generated file — NOT a dependency bump** |

Provenance of the new `cn` package (verified via `npm view`):
- name `cn`, version `0.2.6`, MIT, maintainer `shadcn <m@shadcn.com>`
- repository `github.com/shadcn-ui/cn`
- description: "Fast, small, compiled class-name merging for Tailwind CSS.
  Drop-in replacement for clsx + tailwind-merge."
- publish timeline: `0.2.1` 2026-09-01 → `0.2.6` 2026-09-06. Version `0.2.6` was
  published at 12:13:35 UTC on 2026-09-06; the final refresh adopts that patch.
- Assessment: legitimate and first-party to shadcn, not a typosquat. But
  adopting it is still a real change to every app kitcn scaffolds.

High-risk note:
- Realistic failure mode: a sync run silently absorbs an upstream scaffold
  migration alongside routine dependency bumps, and it ships because
  `fixtures:check` only proves "snapshot == freshly-generated", never "snapshot
  is desirable". Every kitcn user who scaffolds after this would get a new
  runtime dependency they did not choose.
- Proof plan: classify every changed *hunk*, not the file list. Done — the full
  non-manifest diff collapses to exactly 2 transformations and the manifest
  diff to exactly 5 lines.
- Why the boundary is right: regeneration is the only correct mechanical
  response to upstream movement, but *accepting* a same-week upstream
  architecture change is a product call the user owns, not a chore an agent
  should auto-commit.

Decisions and tradeoffs:
- Ran `dependency-pins.ts sync --skip-validate` and `fixtures.ts sync`
  separately before running the documented one-liner -> gives clean attribution
  for whether the pins step wrote under `packages/` -> risk: diverges from the
  documented path, mitigated by then running real `bun run fixtures:sync`
  end-to-end so the tree state is produced by the documented command.
- Classified by collapsing the whole diff with `sort | uniq -c` instead of
  sampling files -> the stop condition keys on change *kind*, so a sample could
  have missed a unique hunk -> confirmed the 20-file diff is only 2 distinct
  source transformations.
- Verified the `cn` package's provenance on npm before characterizing it ->
  a brand-new bare-named dependency appearing in every scaffolded app warrants
  a supply-chain check, not an assumption -> confirmed first-party to shadcn.
- Halted before commit -> user's criterion 5 is explicit and this diff clearly
  qualifies -> risk: the user may have wanted it committed anyway; mitigated by
  leaving the regenerated, verified-green tree in place so accepting is one
  command away.

Implementation notes:
- `fixtures:sync` builds `packages/kitcn`, packs it as the local CLI
  (`getLocalInstallSpec`), scaffolds each template into a temp dir, runs
  `kitcn add auth` for `-auth` variants, installs, validates
  (typecheck/lint/build), normalizes, then replaces `fixtures/<key>`.
- `normalizeTemplatePackageJson` rewrites `kitcn` to `workspace:*` and pins
  `shadcn` to the literal `latest`, so those two never appear as drift.
- The regenerated tree was held uncommitted while the criterion-5 escalation was
  open, then committed unchanged once the user accepted. No fixture file was
  edited by hand at any point.

Review fixes:
- P1 `discussion_r3944967483`: synchronized this dedicated plan's current
  classification, provenance, verification and risk statements to cn 0.2.6.
  Proof compares all six manifest versions with this plan and asserts that no
  stale version remains; task checker also passes. Closeout owns reply/resolve.
- P1 `discussion_r3942719855`: the plan identifies PR #453 and the approved
  commit. The closeout pass also corrected the remaining contradictory
  completion-rule and review-state claims. Proof: inspect current state rows
  and run `check-complete.mjs`; reply and resolution belong to closeout.

Error attempts:
| Error / failed attempt | Count | Next different move | Resolution |
|------------------------|-------|---------------------|------------|
| `fixtures:check` aborted with `ENOENT ... packages/resend/dist` before reaching any drift comparison | 1 | Build both published packages, not just `kitcn` | Resolved by `bun build:pkg`. CI (`.github/workflows/ci.yml:49`) runs it immediately before `check:ci`, so this is a local-prerequisite gap, not a repo defect |
| `fixtures:check` FixtureDriftError on `expo` (pre-sync) | 1 | Run `fixtures:sync` to regenerate | Resolved — this was the intended reproduction, not an unexpected failure |

Verification evidence:
- Current cn contract: all six shadcn fixture manifests declare `cn ^0.2.6`.
  `npm view cn@0.2.6 version license repository maintainers dist.integrity
  --json` confirms MIT, shadcn-ui/cn and maintainer shadcn. `npm view cn time
  --json` confirms publication at 2026-09-06T12:13:35.681Z.
- Current refresh: `NO_PROXY=localhost,127.0.0.1 bun run fixtures:sync` exited
  0; eight templates regenerated/validated. The incremental output changed
  only six cn manifest versions; no further source or template change.
- Current full gate: `NO_PROXY=localhost,127.0.0.1 bun check` exited 0 on the
  refreshed manifests: Bun 1400 pass, Vitest 981 pass / 14 skipped, CLI 124
  pass, Concave smoke, 8/8 fixture comparisons, CLI verify and runtime pass.
  Log: /tmp/kitcn-pr453-check.log. These results supersede initial-run counts.
- `bun tooling/dependency-pins.ts sync --skip-validate` (cwd: repo root) ->
  exit 0, `git status --porcelain` empty. Proves the pins step writes nothing
  under `packages/`; the "no changeset" premise holds.
- `NO_PROXY=localhost,127.0.0.1 bun run fixtures:check` (pre-sync, attempt 1)
  -> FAILED with `ENOENT ... packages/resend/dist` before any drift comparison.
- `NO_PROXY=localhost,127.0.0.1 bun build:pkg` -> exit 0; both
  `packages/kitcn/dist` and `packages/resend/dist` present.
- `NO_PROXY=localhost,127.0.0.1 bun run fixtures:check` (pre-sync, attempt 2)
  -> FAILED with `FixtureDriftError` on `expo`, hunk
  `-"expo": "~55.0.30" / +"expo": "~55.0.31"`. Reproduction confirmed, and
  direct proof the lane exits at the first drifted fixture.
- `NO_PROXY=localhost,127.0.0.1 bun run fixtures:sync` -> exit 0, 8×
  "Synced fixtures/<key>".
- `git status --porcelain` post-sync -> 20 modified + 2 untracked, all under
  `fixtures/**`; zero paths under `packages/`.
- `git diff -- '*/package.json' | grep '^[-+][^-+]' | sort | uniq -c` -> exactly
  5 distinct manifest changes (6× four shadcn lines, 2× expo).
- `git diff -- ':!*/package.json' | grep '^[-+]' | sort | uniq -c` -> exactly
  2 distinct source transformations, each ×6.
- `grep -rln "legacy-peer-deps" packages/kitcn/` -> no matches.
  `git ls-files | grep -i npmrc` -> no matches. Proves `.npmrc` is upstream.
- `npm view cn` -> `shadcn-ui/cn`, MIT, maintainer `shadcn <m@shadcn.com>`;
  `0.2.6` published 2026-09-06. Proves provenance and recency.
- `NO_PROXY=localhost,127.0.0.1 bun run fixtures:check` (post-sync) -> exit 0,
  all 8 "matches fresh ... output". **Named threshold met.**

Source-listed case matrix:
| Case | Source claim | Harness | Before | Expected after | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1. Regenerate, never hand-edit | `fixtures/**` is generated output | `bun run fixtures:sync` | expo pinned `~55.0.30` | regenerated snapshots | Only sync wrote to `fixtures/**`; zero manual edits | complete |
| 2. Check passes | `fixtures:check` lane fails on main | `bun run fixtures:check` | FixtureDriftError on `expo` | exit 0 | exit 0, 8/8 success messages | complete |
| 3. NO_PROXY prefix | local proxy breaks probes | shell prefix | n/a | all runs prefixed | Every sync/check/build invoked with `NO_PROXY=localhost,127.0.0.1` | complete |
| 4. Report all drift, not just expo | check exits at FIRST drifted fixture | `git status` + hunk enumeration | unknown beyond expo | full changed set | All 8 fixtures changed; 4 distinct change classes enumerated | complete |
| 5. Stop if not a dep bump | scope is fixture regen only | exhaustive per-hunk classification | n/a | classify each hunk | **FIRED** — shadcn `cn` source migration + new `.npmrc` are template changes. Halted and reported before committing; user then accepted | complete (stop taken, then released) |
| 6. No changeset | touches no code under `packages/` | pins-step isolation + `git status` | premise unverified | 0 files under `packages/` | Verified: 0 `packages/**` files; pins step proven no-op | complete |
| 7. Open a PR onto main | explicit user instruction | `gh pr create --base main` | no PR | PR open | PR #453 onto `main`, opened after `bun check` exit 0 | complete |

Final handoff contract:
- Commit line: `8219887a` on `chore/sync-drifted-scaffold-fixtures`
- PR line: #453 onto `main`
- Issue line: N/A: no GitHub issue backs this task
- Confidence line: 🟢 95-100% confidence
- Flow table:
  - Reproduced: tests 🔴 `fixtures:check` FixtureDriftError on `expo`, browser ➖ N/A
  - Verified: tests 🟢 `fixtures:check` exit 0 (8/8) and `bun check` exit 0, browser ➖ N/A
- Browser check: N/A: no browser surface
- Outcome: all 8 fixtures regenerated; lane green; the two non-bump changes
  (shadcn `cn` source migration, new `.npmrc`) were escalated under criterion 5
  and shipped only after explicit user acceptance
- Caveat: fixture content tracks live npm, so the snapshot re-drifts on any
  further upstream publish. `legacy-peer-deps=true` suppresses peer-conflict
  errors in generated start apps
- Design:
  - Chosen boundary: regenerate via the owning tool, then escalate the
    accept/reject decision
  - Why not quick patch: hand-editing `fixtures/**` is forbidden and would
    desync the snapshot from real scaffolder output
  - Why not broader change: the drift is upstream; no repo code is wrong, so
    pinning or template edits would be scope creep and a separate decision
- Verified: `bun check` exit 0; `fixtures:check` exit 0 (8/8); exhaustive
  per-hunk classification; pins-step isolation; npm provenance check on `cn`
- PR body verified: `gh pr view 453 --json body` — all 10 contract markers
  present, no self-link

Final handoff / sync:
- Commit: `8219887a`
- PR: #453 (https://github.com/udecode/kitcn/pull/453)
- Issue: N/A: no GitHub issue backs this task
- Browser proof: N/A: no browser surface
- Caveats: `shadcn: latest` floats, so registry content churn recurs through
  this lane; `fixtures:check` cannot distinguish it from a version bump

Timeline:
- 2026-09-06T01:42:11.365Z Task goal plan created.
- Read `tooling/fixtures.ts`, `dependency-pins.ts`, `template.config.ts`,
  `scaffold-utils.ts`; established that check exits at first drift, that the
  pins step can write under `packages/`, and that `components/ui` is stripped
  from the owned-scope comparison.
- Ran `dependency-pins.ts sync --skip-validate` in isolation: zero diff.
  "No changeset" premise verified rather than assumed.
- `fixtures:check` attempt 1 failed on missing `packages/resend/dist`; fixed
  with `bun build:pkg` (matching CI order).
- `fixtures:check` attempt 2 reproduced the reported `expo` drift exactly.
- Ran `bun run fixtures:sync`: 8 templates regenerated; all 8 fixtures changed.
- Enumerated every diff hunk. Found 4 distinct change classes; 2 of them are
  not dependency bumps.
- Verified `cn` provenance on npm (first-party shadcn, published 2026-09-06).
- Ran `fixtures:check`: exit 0, 8/8. Named threshold met.
- Halted before commit per user criterion 5; reported for a decision.
- User reviewed the classification and accepted the upstream migration.
- Renamed branch to `chore/sync-drifted-scaffold-fixtures` (no upstream, no PR
  yet, so the rename guard allowed it), staged the whole checkout, committed
  `8219887a`.
- Ran `bun check` end-to-end: exit 0 (lint, typecheck, test, test:cli,
  test:concave, fixtures:check 8/8, test:verify, test:runtime).
- Pushed and opened PR #453; verified the task-style body with `gh pr view`.

Reboot status:
| Question | Answer |
|----------|--------|
| Where am I? | Complete — PR #453 open and awaiting review |
| Where am I going? | Autoclosure owns fresh checks, live feedback and merge receipts in docs/plans/2026-09-06-pr-453-autoclosure.md |
| What is the goal? | Regenerate drifted `fixtures/**`; commit only after confirming the diff is acceptable |
| What have I learned? | Check masks drift past the first template; the pins half of sync is a source-derived no-op; the lane needs `bun build:pkg` not just the kitcn build; the final snapshot includes shadcn `cn@^0.2.6` plus new `.npmrc` files, not the expo bump the prompt described |
| What have I done? | Reproduced drift, isolated the pins step, regenerated all 8 templates, exhaustively classified every hunk, verified `cn` provenance, escalated under criterion 5, and after user acceptance ran `bun check` (exit 0), committed `8219887a`, and opened PR #453 |

Open risks:
- Merging adds `cn@^0.2.6` as a runtime dependency to every app
  kitcn scaffolds, and adds `legacy-peer-deps=true` to start apps. The latter
  suppresses peer-dependency conflict errors, which can mask genuine version
  incompatibilities in generated projects.
- `shadcn: latest` is deliberately floating, so this class of source-level
  churn will recur on every sync. `fixtures:check` cannot distinguish it from a
  version bump; only per-hunk review can.

Hard closeout guard:
- A local-only final response for verified code-changing work is invalid unless
  this plan records an explicit user decline, no local patch, analytical/
  blocked/inconclusive outcome, or a real commit/PR blocker.
  **Satisfied:** the work is not local-only. Commit `8219887a` is pushed and
  PR #453 is open onto `main`.
