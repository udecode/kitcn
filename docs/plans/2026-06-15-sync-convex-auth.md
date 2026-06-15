# sync convex auth

Objective:
Run `sync-convex-auth`: compare the fork with upstream, classify every upstream
delta, choose one actionable KitCN slice, delegate through `task`, verify, and
PR.

Goal plan:
docs/plans/2026-06-15-sync-convex-auth.md

Template:
docs/plans/templates/sync-convex-auth.md

Primary template:
docs/plans/templates/sync-convex-auth.md

Applied packs:
- none

Completion threshold:
- Fork/upstream refs, behind/ahead counts, exact commit range, upstream diff
  summary, local KitCN surface audit, docs/solutions audit, classification
  ledger, selected slice or no-action verdict, ambiguity decisions, delegated
  `task` prompt/result or N/A reason, and final evidence are recorded.
- Closure is legal only when every upstream change in the compared range is
  classified, every non-`no-op` classification has evidence and a decision, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-06-15-sync-convex-auth.md`
  passes.

Verification surface:
- `gh repo view` or fallback evidence for fork/upstream identity.
- `git -C ../convex-better-auth fetch origin --tags` and upstream fetch.
- `git -C ../convex-better-auth rev-list --count ...` for behind/ahead counts.
- `git -C ../convex-better-auth log ...` and `git diff --name-status ...`.
- Patch reads for relevant upstream files.
- Local `rg` surface audit across `packages`, `www`, `.agents`, `docs`,
  `tooling`, `fixtures`, and `example`.
- `docs/solutions` / `docs/plans` note audit.
- Delegated `task` final handoff, or no-action/blocked verdict with evidence.

Constraints:
- Use evidence, not vibes.
- Pull only upstream changes that matter to KitCN auth integration.
- Stop and ask before importing optional e2e suites, broad fixtures, examples,
  release plumbing, or dev-only test infrastructure unless they are the direct
  verification path for the selected required fix.
- Prefer deleting obsolete KitCN glue over adding more glue.
- Do not open a vanity PR when no actionable opportunity exists.
- Do not use this template as the delegated implementation task plan; delegate
  implementation through `task`.

Boundaries:
- Source of truth: `sync-convex-auth` skill, fork/upstream metadata,
  `../convex-better-auth` commits and patches, local KitCN auth surfaces, and
  institutional notes under `docs/solutions` / `docs/plans`.
- Allowed sync-audit scope: fork/upstream refs, upstream diff evidence,
  classification ledger, local surface map, selected slice, delegated `task`
  prompt, and final sync verdict.
- Delegated implementation scope: owned by the delegated `task` plan and PR.
- Browser surface: N/A unless upstream change or local KitCN impact requires
  real browser proof.
- Tracker sync: N/A unless the sync run starts from a tracker item.
- Non-goals: mirroring upstream wholesale, importing optional test/example
  infrastructure without approval, and coding inside the sync audit plan.

Output budget strategy:
- Use `rg`, `git diff --name-status`, commit summaries, and scoped patch reads
  before broad diffs.
- Cap command output or save large compare data as artifacts.
- Group large upstream ranges by subsystem before reading patches.
- Record only evidence needed to justify relevance, irrelevance, or ambiguity.

Blocked condition:
- Blocked only if upstream cannot be identified after documented fallbacks,
  required fork/upstream refs cannot be fetched, the compare is too large to
  classify without a user-selected bound, or the highest-leverage opportunity is
  ambiguous and needs user approval.

Sync refs:
- Fork: `zbeyens/convex-better-auth`
- Upstream: `get-convex/better-auth`
- Fork branch/ref: local remote `fork/main` at
  `ac48c35ce63f05e32077d0b3450ae0d447e31e1b`
- Upstream branch/ref: local remote `origin/main` at
  `c8df6790a496ab066f72139be16767c9c235df91`
- Behind count: 33
- Ahead count: 0
- Exact range: `fork/main..origin/main`

Sync verdict:
- verdict: actionable sync completed
- selected slice: Better Auth 1.6.15 compatibility plus proxy/header fixes
- class: compatibility + bugfix
- decision reason: highest leverage upstream delta touching KitCN runtime, package
  boundary, scaffold installs, and auth smoke scenarios.
- next owner: PR review

Ambiguity / approval ledger:
| Item | Why ambiguous | Decision | Evidence |
|------|---------------|----------|----------|
| Cross-domain 2FA cookie fix | Upstream owns cross-domain plugin cookie storage; KitCN only has provider OTT/session sync code. | No local patch. | Local audit found `packages/kitcn/src/auth-client/convex-auth-provider.tsx`, not upstream `src/plugins/cross-domain` cookie storage. |
| Trigger passthrough | Upstream fixed create/update trigger result propagation; KitCN has a different generated API path. | No local patch. | `packages/kitcn/src/auth/create-api.ts` refetches and returns create/update docs after hooks. |
| Release, docs, CI, example-only upstream commits | Useful upstream maintenance but not KitCN auth runtime surface. | No local patch. | `git diff --name-status fork/main..origin/main` grouped these as docs/tests/release plumbing. |

Classification ledger:
| Class | Upstream change | Evidence | KitCN surface | Decision |
|-------|-----------------|----------|---------------|----------|
| compatibility | `a969a88` updates Better Auth to `1.6.15` and minimum `1.6.11`. | Upstream package/diff and local exact install pins still at `1.6.9`. | `packages/kitcn/src/cli/supported-dependencies.ts`, `tooling/dependency-pins.ts`, `packages/kitcn/package.json`, root/example/fixtures package files. | Implemented exact install `1.6.15`, peer `>=1.6.11 <1.7.0`, Expo plugin `@better-auth/expo@1.6.15`, and example pin sync. |
| bugfix | Better Auth adapter update with empty `where` no longer throws. | Upstream adapter compatibility around empty update filters; local adapter threw `where clause not supported`. | `packages/kitcn/src/auth/adapter.ts`, `packages/kitcn/src/auth/adapter.test.ts`. | Implemented `null` return for empty `where` in HTTP and DB adapters with regression tests. |
| bugfix | `1977ce5` strips hop-by-hop headers in framework proxy handlers. | Upstream Next/Start proxy patch; local handlers still forwarded `connection` on framework proxy paths. | `packages/kitcn/src/auth-nextjs/index.ts`, `packages/kitcn/src/auth-start/server.ts`, tests. | Implemented shared strip helper in each surface and tests for `connection`, `content-length`, `transfer-encoding`. |
| bugfix | Same hop-by-hop class exposed KitCN local Concave site proxy. | Full `bun check` failed Start auth smoke with `502 Local site proxy error: fetch failed`; streaming Start requests became chunked after stripping `content-length`. | `packages/kitcn/src/cli/commands/dev.ts`, `packages/kitcn/src/cli/commands/dev.test.ts`. | Implemented `transfer-encoding` stripping in local proxy and added chunked streaming POST regression test. |
| no-op | `dacb3f2` sets correct `Host` header in `getToken`. | Upstream patch checked; KitCN already sets `host` in Next/Start auth proxy and token paths. | `packages/kitcn/src/auth-nextjs/index.ts`, `packages/kitcn/src/auth-start/server.ts`. | No separate patch beyond reusing the strip helper. |
| no-op | `f67748e` passes through trigger results from create/update. | Upstream patch checked; local create/update handlers already refetch/return updated docs. | `packages/kitcn/src/auth/create-api.ts`. | No patch. |
| no-op | `d7dd7be` preserves 2FA cookie in cross-domain plugin. | Upstream plugin-specific cookie storage not present in KitCN. | `packages/kitcn/src/auth-client/convex-auth-provider.tsx`. | No patch. |
| docs/tests/cleanup | Upstream docs, release notes, CI, e2e secret handling, examples, dependency housekeeping. | Commit and name-status audit grouped these outside KitCN runtime/package action. | Repo docs/tests/examples only. | No patch except fixture/package regeneration caused by selected version bump. |

Delegated task prompt:
```md
Use `kitcn:task`.

Implement the selected `sync-convex-auth` slice:
- Better Auth compatibility with upstream `1.6.15` / minimum `1.6.11`.
- Auth adapter `update` with empty `where` returns `null` instead of throwing.
- Next.js and TanStack Start auth proxy handlers strip hop-by-hop headers.
- Generated auth install pins use `better-auth@1.6.15`; Expo auth installs
  `@better-auth/expo@1.6.15`.
- Keep peer dependency broad: `better-auth >=1.6.11 <1.7.0`.

Required tests:
- Add focused red tests for empty `where` update behavior.
- Add focused proxy header tests for Next.js and Start.
- Sync dependency pins and fixtures from source, not fixture hand edits.
- Run `bun --cwd packages/kitcn build`, focused tests, fixture sync/check when
  scaffold output changes, and final `bun check`.
```

Completion rule:
- Do not call `update_goal(status: complete)` while any required checklist item
  remains unchecked. If an item does not apply, check it and add `N/A: <reason>`.
- Do not call `update_goal(status: complete)` until the named sync audit
  evidence is recorded below and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-06-15-sync-convex-auth.md`
  passes.
- Do not create hook state for this goal. This file plus the active goal are
  the durable state.

Start Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| `sync-convex-auth` skill loaded | yes | Read `.agents/skills/sync-convex-auth/SKILL.md` fully before audit commands. |
| Active goal checked or created | yes | `get_goal` returned no active goal; created goal for full sync audit, delegation, verification, and PR. |
| Source of truth read before audit | yes | User invoked `kitcn:sync-convex-auth` and provided the skill body; local generated skill was read from disk. |
| Fork/upstream discovery strategy selected | yes | Follow skill order: `gh repo view` fork metadata first, then npm/local/upstream fallbacks only if parent is missing. |
| Output budget strategy recorded | yes | Use metadata, counts, file summaries, and scoped patch reads before large diffs; cap output and group by subsystem. |
| Optional-scope approval boundary recorded | yes | Do not import optional e2e suites, broad examples, fixture rewrites, release plumbing, or dev-only infra without user approval. |
| Delegation boundary recorded | yes | Sync plan owns audit/classification/selected prompt; implementation must go through `task`. |

Work Checklist:
- [x] Objective, threshold, verification surface, constraints, boundaries, and
      blocked condition are filled from the active sync goal.
- [x] Fork, upstream, branches/refs, behind count, ahead count, and exact range
      are recorded.
- [x] Local clone exists or is created, origin/upstream remotes are correct, and
      origin/upstream refs are fetched.
- [x] Upstream commit list and file summary are read.
- [x] Relevant upstream patches are read; large compares are grouped before
      deep patch review.
- [x] Local KitCN auth surfaces are searched and relevant hits are read.
- [x] `docs/solutions` and `docs/plans` institutional notes are searched and
      relevant hits are read.
- [x] Every upstream change or file group is classified as `security`,
      `compatibility`, `bugfix`, `feature`, `cleanup`, `docs`, `tests`, or
      `no-op`.
- [x] Every non-`no-op` item records commit evidence, diff evidence, local KitCN
      files affected, expected implementation surface, verification command(s),
      confidence, and decision.
- [x] Optional or ambiguous additions are either explicitly approved, rejected,
      or recorded as a blocker before implementation.
- [x] Highest-leverage slice is selected using the skill priority order, or a
      no-action verdict is recorded with evidence.
- [x] Delegated `task` prompt is recorded exactly enough for implementation, or
      N/A reason is recorded because no actionable opportunity exists.
- [x] Final sync output matches the skill output contract before delegation or
      no-action closeout.
- [x] Workspace authority recorded: each proof names the repo/tool that owns the
      evidence.
- [x] Output budget discipline recorded and followed.
- [x] Autoreview decision recorded for any local implementation patch, or N/A
      reason recorded for audit-only/no-local-patch work.

Completion Gates:
| Gate | Applies | Required action | Evidence |
|------|---------|-----------------|----------|
| Fork/upstream identity | yes | Record `gh repo view` or fallback evidence | `gh repo view` found no parent; npm and local remotes identify `get-convex/better-auth`. |
| Ref fetch | yes | Fetch fork and upstream refs/tags in `../convex-better-auth` | `git -C ../convex-better-auth fetch fork --tags` and `fetch origin --tags` exited 0. |
| Behind/ahead counts | yes | Record `rev-list --count` results | Behind 33, ahead 0. |
| Commit range | yes | Record exact compared range and commit summary | `fork/main..origin/main`, fork `ac48c35`, upstream `c8df679`. |
| Upstream diff summary | yes | Record `diff --name-status` and relevant patch evidence | Commit/file audit grouped runtime, proxy, adapter, plugin, docs/tests/release changes. |
| Local KitCN surface audit | yes | Run/read scoped `rg` across KitCN integration points | Read auth adapter, Next/Start helpers, auth client/provider, create-api, CLI dependency pins, fixtures, example. |
| Institutional note audit | yes | Search/read relevant `docs/solutions` and `docs/plans` notes | No blocking prior note; memory hit only confirmed source-rule/template sync conventions. |
| Classification ledger complete | yes | Every upstream change or file group has class/evidence/decision | See ledger above. |
| Ambiguous optional scope | yes | Ask one pointed question or record explicit N/A | No optional e2e/import scope selected; ambiguous items rejected with evidence. |
| Selected slice or no-action verdict | yes | Record priority choice, evidence, and confidence | Selected compatibility/bugfix slice. Confidence high after `bun check`. |
| Delegated task handoff | yes | Record exact delegated `task` prompt and final handoff, or N/A reason | Prompt above; local implementation completed in this thread using `task`. |
| Browser surface changed | no | Capture Browser proof or record N/A | N/A: auth backend/package/scaffold behavior changed; proof is CLI/runtime auth smoke, not browser UI. |
| Package/scaffold/docs gates delegated | yes | Ensure delegated prompt includes package build, fixture, docs, or skills checks when applicable | Build, fixture sync/check, scenario runtime, and final `bun check` executed. |
| Workspace authority proof | yes | Record cwd/tool for every proof surface | All local proof ran in `/Users/zbeyens/git/better-convex`; upstream proof ran in `../convex-better-auth`. |
| Autoreview for local implementation patch | yes | Run autoreview if this sync plan itself changes implementation code; otherwise N/A | Autoreview ran clean after two accepted findings were fixed: Start proxy body streaming and Better Auth peer-range derivation. |
| Final output contract | yes | Record terse audit table and delegation/no-action result | Final handoff below. |
| Output budget discipline | yes | Verify no unbounded high-volume output was streamed, or record recovery | One broad local auth `rg` was capped after truncation; subsequent reads were scoped. |
| Goal plan complete | yes | Run `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-06-15-sync-convex-auth.md` | Closeout command recorded in final verification. |

Phase / pass table:
| Phase | Status | Evidence | Next |
|-------|--------|----------|------|
| Setup refs | complete | fork/upstream refs and counts recorded | done |
| Upstream diff audit | complete | 33 upstream commits grouped and relevant patches read | done |
| Local KitCN impact audit | complete | auth, framework, CLI, fixture, and example surfaces read | done |
| Classification and decision | complete | selected compatibility/bugfix slice | done |
| Delegation / closeout | complete | implementation, gates, and PR path complete | final response |

Findings:
- `gh repo view zbeyens/convex-better-auth` returned no parent, but npm
  metadata and the local clone remotes both identify `get-convex/better-auth`
  as upstream.
- Local clone remotes are named `fork` for `zbeyens/convex-better-auth` and
  `origin` for `get-convex/better-auth`, so this audit compares
  `fork/main..origin/main`.
- Upstream has 33 commits ahead and 0 commits behind the fork.
- Relevant-looking upstream runtime changes include getToken Host header,
  cross-domain 2FA cookie preservation, trigger return passthrough, framework
  proxy hop-by-hop header stripping, Better Auth minimum `>=1.6.11`, and
  adapter handling for empty update where clauses / table-qualified db APIs.
- KitCN already had Host forwarding and trigger-result behavior covered.
- KitCN did need Better Auth version sync, empty update filter compatibility,
  framework proxy header stripping, and local Concave site proxy transfer
  encoding stripping.
- First full `bun check` caught a real Start auth smoke failure caused by the
  local site proxy forwarding `transfer-encoding`; the final patch fixes that
  ownership boundary instead of papering over the scenario.

Decisions and tradeoffs:
- Selected one compatibility/bugfix slice instead of importing upstream e2e,
  examples, release scripts, or docs churn.
- Kept install pins exact for generated apps and package peer broad for users:
  exact `1.6.15`, peer `>=1.6.11 <1.7.0`.
- Did not touch upstream cross-domain cookie behavior because KitCN does not
  own that plugin storage path.
- Did not add browser e2e because the changed surface is package/runtime and is
  already covered by CLI auth smoke scenarios.

Error attempts:
| Error / failed attempt | Count | Next different move | Resolution |
|------------------------|-------|---------------------|------------|
| Broad local auth `rg` streamed a huge truncated result | 1 | Use `rg --files-with-matches`, exact files, and capped `sed` slices | Switched to targeted reads for KitCN auth surfaces. |
| First full `bun check` failed `start-auth` smoke with `502 Local site proxy error: fetch failed` | 1 | Reproduce `scenario:test -- start-auth`, inspect proxy boundaries, add focused chunked request regression | Fixed local site proxy to strip `transfer-encoding`; focused and full scenario proof passed. |
| Initial dev proxy regression helper used manual `http.request` transfer header and hit Node parser behavior | 1 | Use streaming `Bun.fetch` and pin proxy internals to server fetch in the test | Regression test now exercises the real Start/Undici streaming path. |

Timeline:
- 2026-06-15T14:37:34.724Z Sync audit plan created.
- 2026-06-15T15:04Z Selected Better Auth compatibility/proxy slice.
- 2026-06-15T16:07Z First full `bun check` exposed Start auth local proxy failure.
- 2026-06-15T16:13Z `scenario:test -- start-auth` passed after local proxy fix.
- 2026-06-15T17:31Z First post-fix full `bun check` exited 0.
- 2026-06-15T17:52+0200 Final post-autoreview `bun check` exited 0.

Verification evidence:
- `gh repo view zbeyens/convex-better-auth --json nameWithOwner,parent,defaultBranchRef` returned fork `zbeyens/convex-better-auth`, branch `main`, parent `null`.
- `npm view @convex-dev/better-auth repository homepage --json` returned repository `git+https://github.com/get-convex/better-auth.git`.
- `git -C ../convex-better-auth remote -v` showed `fork` as `zbeyens/convex-better-auth` and `origin` as `get-convex/better-auth`.
- `git -C ../convex-better-auth fetch fork --tags` and `git -C ../convex-better-auth fetch origin --tags` exited 0.
- `git -C ../convex-better-auth rev-list --count fork/main..origin/main` -> `33`; reverse -> `0`.
- `git -C ../convex-better-auth diff --name-status fork/main..origin/main` showed runtime files under `src/client`, `src/nextjs`, `src/react-start`, `src/plugins/cross-domain`, and `src/utils`.
- `bun test packages/kitcn/src/auth/adapter.test.ts packages/kitcn/src/auth-nextjs/index.test.ts packages/kitcn/src/auth-start/index.test.ts packages/kitcn/src/cli/commands/dev.test.ts` passed 61 tests.
- `bun test ./tooling/dependency-pins.test.ts` passed 4 tests.
- `bun test packages/kitcn/src/auth/adapter.test.ts packages/kitcn/src/auth-nextjs/index.test.ts packages/kitcn/src/auth-start/index.test.ts packages/kitcn/src/cli/commands/dev.test.ts ./tooling/dependency-pins.test.ts` passed 65 tests.
- `bun tooling/dependency-pins.ts sync` updated pins, lockfile, package metadata, and fixtures; its first run exposed example Better Auth core skew, fixed by syncing example pins to `1.6.15`.
- `bun run scenario:test -- start-auth` passed after local proxy fix.
- `bun --cwd packages/kitcn build` exited 0.
- `bun typecheck` exited 0.
- `bun lint:fix` exited 0 after moving a test assertion out of a helper.
- `.agents/skills/autoreview/scripts/autoreview --mode local` exited clean:
  no accepted/actionable findings; overall patch correct confidence `0.82`.
- `bun check` exited 0 after autoreview fixes: lint, typecheck, Bun tests,
  Vitest, CLI tests, Concave smoke, fixture checks, and runtime scenarios
  passed.

Final handoff / sync:
- Fork/upstream: `zbeyens/convex-better-auth` fork compared to
  `get-convex/better-auth`.
- Range: `fork/main..origin/main`, 33 behind / 0 ahead.
- Decision: selected and implemented Better Auth 1.6.15 compatibility plus
  proxy/header bugfixes.
- Delegated PR: create PR from `codex/sync-convex-auth-compat`.
- Caveats: no cross-domain 2FA cookie local patch; KitCN does not own that
  upstream plugin storage path.

Reboot status:
| Question | Answer |
|----------|--------|
| Where am I? | Closeout |
| Where am I going? | Commit, push, PR, goal complete |
| What is the goal? | Compare upstream `convex-better-auth`, classify all deltas, select/delegate one KitCN sync slice, verify and PR if actionable. |
| What have I learned? | See Findings |
| What have I done? | Audited upstream, implemented the selected slice, ran focused tests and full `bun check`. |

Open risks:
- No open implementation risk found after full gate and clean autoreview.
