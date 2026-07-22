# Sync repo skills

Objective:
Sync maximum relevant Ellie/Informed skills into better-convex; done when local
rules, templates, locks, and mirrors are kitcn-native, Linear-free, reviewed,
`bun check` passes, and the GitHub PR is open.

Flow mode:
one-shot execution

Goal plan:
docs/plans/2026-07-22-sync-repo-skills.md

Template:
docs/plans/templates/major-task.md

Primary template:
docs/plans/templates/major-task.md

Applied packs:
- agent-native (docs/plans/templates/packs/agent-native.md)

Major source:
- type: accepted implementation plan plus sibling repository source rules
- id / link: current user request; `../ellie`; `../informed-fe-v3`
- title: Maximum Relevant Skills Sync for better-convex
- decision to make: implement the accepted skill topology without importing
  Linear or incompatible product/runtime doctrine
- decision criteria: every approved local and installed skill action is
  completed, kitcn contracts remain authoritative, generated mirrors match,
  exact audits and reviews close, `bun check` passes, and a GitHub PR is open

Major lane:
- lane: workflow migration and agent-native architecture
- output type: implemented repo-local skill/rule/template/docs topology
- implementation expected: yes
- affected packages / surfaces: `.agents/AGENTS.md`, `.agents/rules/**`,
  `docs/plans/templates/**`, root doctrine/docs maps, `skills-lock.json`, and
  generated agent mirrors; published `packages/kitcn/skills/kitcn/**` excluded
- dominant risk: foreign product/tracker rules overriding kitcn package,
  scaffold, fixture, changeset, bundling, docs, and GitHub delivery contracts

Timed checkpoint:
- requested duration: N/A: no duration requested
- semantics: N/A: threshold-driven execution
- initial confidence score: N/A: binary inventory and command gates apply
- improvement loop: fix every accepted review finding and failing named gate
- final score / loop closure: all inventory rows, audits, reviews, checks, and
  PR gates closed

Completion threshold:
- All 12 approved local skills exist as kitcn-owned sources; all 5 existing
  merge targets contain the accepted generic donor improvements; the 7
  installed additions, 7 retained updates, and `linear-backlog` removal are
  reflected through the Skills CLI; required templates/doctrine/helpers exist;
  no destination-owned Linear routing remains; generated mirrors match source;
  helper smoke checks, exact audits, agent-native review, autoreview,
  `bun lint:fix`, and `bun check` pass; commit is pushed and GitHub PR is open.
- Major-task closure is legal only when the decision criteria are satisfied or
  explicitly narrowed, facts/inference/recommendation are separated, required
  review or pressure passes are recorded, implementation gates are closed when
  code changed, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-07-22-sync-repo-skills.md`
  passes.

Verification surface:
- source and generated exact-term audits with scoped `rg`
- `node --check` and status/smoke execution for copied helpers
- Skills CLI list/lock/generated-directory read-back
- `bun install`, `bun lint:fix`, and `bun check` in repository root
- `agent-native-reviewer` and `autoreview` with zero accepted actionable findings
- GitHub commit, push, and PR read-back

Constraints:
- Start from repo evidence before external claims.
- Keep helper stack proportional.
- Separate measured evidence, source evidence, inference, and recommendation.
- Implement the user-approved plan without another approval stop.
- Preserve kitcn package/scaffold/fixture/scenario/changeset/Convex bundle/docs
  contracts and the package-owned `packages/kitcn/skills/kitcn/**` source.
- Keep GitHub issue/commit/PR/review behavior; remove destination-owned Linear
  routing; do not add `to-issues` or a replacement slicing skill.
- Manage external skills and `skills-lock.json` only through the Skills CLI.
- Edit source rules/templates, never generated skill mirrors directly.

Boundaries:
- Source of truth: accepted plan, destination `.agents/AGENTS.md` and local
  rules/templates, then Ellie newest generic mechanics and Informed's simpler
  variants
- Allowed edit scope: repository agent sources, project plan templates,
  doctrine/docs ownership files, Skills CLI lock/output, generated mirrors,
  required execution plan
- External sources: N/A: sibling repository and installed skill sources settle
  the work
- Browser surface: N/A: no runtime or rendered UI behavior changes
- Tracker sync: GitHub PR only; no Linear operations
- Non-goals: runtime/package API changes, changesets, Intent scaffold, package
  skill changes, product-specific donor skills, and dedicated issue slicing

Output budget strategy:
- Read exact source files and bounded sections; inventory by filenames, hashes,
  headings, and focused terms before full reads; exclude generated/build/temp
  trees from broad audits; cap command output and inspect only actionable slices.

Blocked condition:
- Stop only if required source ownership cannot be resolved, Skills CLI cannot
  install/remove the approved inventory after repair attempts, required checks
  reveal an unrelated environment failure that survives one install repair, or
  GitHub authentication/policy prevents the required push or PR.

Major state:
- task_type: major
- task_complexity: major
- current_phase: closeout
- current_phase_status: in_progress
- next_phase: GitHub delivery
- goal_status: active

Current verdict:
- verdict: approved topology implemented and verified; publish the PR
- confidence: high; source, generated, review, audit, and repository gates pass
- next owner: GitHub delivery, then maintainer review
- reason: only branch, commit, push, PR read-back, and final goal closure remain

Completion rule:
- Do not call `update_goal(status: complete)` while any required checklist item
  remains unchecked. If an item does not apply, check it and add `N/A: <reason>`.
- Do not call `update_goal(status: complete)` until every completion threshold
  above is satisfied, final evidence is recorded, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-07-22-sync-repo-skills.md`
  passes.
- Do not create hook state for this goal. This file plus the active goal are the
  durable state.

Start Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| Timed checkpoint parsed | no | N/A: no duration requested |
| `major-task` loaded | yes | Destination `.agents/rules/major-task.mdc` read before execution |
| Active goal checked or created | yes | `get_goal` returned none; `create_goal` started the matching thread goal after this shell was filled |
| Source of truth read before analysis | yes | Accepted plan plus destination and both sibling source trees audited |
| Major lane selected | yes | Agent-native workflow migration |
| Decision criteria stated | yes | Binary inventory, audit, review, check, and PR threshold above |
| Existing repo patterns / prior decisions checked | yes | Destination AGENTS, rules, templates, lock, scripts, docs map, and package-skill owner audited |
| Helper stack selected | yes | `sync-skills`, `major-task`, `autogoal`, agent-native pack; later `agent-native-reviewer` and `autoreview` |
| External research decision recorded | no | N/A: local sibling and installed sources are authoritative |
| Implementation expectation recorded | yes | User explicitly requested implementation of the accepted plan |
| Workspace authority selected | yes | `/Users/zbeyens/git/better-convex` owns all edits and verification |
| Branch / PR expectation decided | yes | Keep GitHub delivery; commit, push, and open/update PR after `bun check` |
| Output budget strategy recorded | yes | Exact-file bounded reads and scoped audits recorded above |
| Agent-native pack selected | yes | Materialized by autogoal helper in this plan |
| Agent-facing action surface identified | yes | Local rules, AGENTS routing, templates, helper scripts, installed skills, and mirrors |
| Source rule versus generated mirror boundary identified | yes | Edit `.agents/AGENTS.md` and `.agents/rules/**`; regenerate root/mirrors with `bun install` |
| `agent-native-reviewer` loaded or waiver recorded | yes | Required for final review after installed-skill refresh |

Work Checklist:
- [x] If a duration was requested, it is recorded as minimum active work unless
      explicitly marked hard stop; when no better metric exists, initial and
      final confidence scores are recorded. N/A: no duration requested.
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
      the question, or N/A reason is recorded. N/A: local sources settle it.
- [x] Options, recommendation, tradeoffs, blast radius, and rejection reasons
      are recorded in the accepted plan and decisions below.
- [x] Facts, inference, and recommendation are separated in findings/decisions.
- [x] Review or pressure lenses are selected and completed, or marked N/A with
      reason.
- [x] If implementation happens, touched-surface packs cover docs, browser,
      package/API, or agent-native surfaces as needed. Agent-native applies;
      docs are part of the dominant major artifact; browser/package API are N/A.
- [x] Workspace authority recorded: every proof command names the cwd/tool that
      owns the analyzed or changed behavior.
- [x] Output budget discipline recorded and followed: broad searches are
      scoped, capped, counted, or artifacted instead of streamed into goal
      context.
- [x] Accepted/actionable review findings are fixed or explicitly rejected with
      evidence.
- [x] Agent-native pack: source-of-truth rule files are edited instead of generated skill mirrors.
- [x] Agent-native pack: the changed agent action is discoverable from the skill/rule text.
- [x] Agent-native pack: generated mirrors are synced when `.agents/rules/**` changed, or N/A reason is recorded.
- [x] Agent-native pack: accepted agent-native review findings are fixed or explicitly rejected with reason.
- [x] Add all 12 approved kitcn-local rules and their required helpers.
- [x] Deep-merge `task`, `major-task`, `testing`, `agent-browser-issue`, and `hard-cut` while preserving kitcn contracts.
- [x] Add/update/remove the approved external skill inventory only through the Skills CLI.
- [x] Add VISION/docs ownership and every approved plan template/pack; add no issue template or slicing skill.
- [x] Remove destination-owned Linear routing while retaining GitHub issue/PR/review behavior.
- [x] Regenerate and prove root, `.agents`, and `.claude` mirrors from source.
- [ ] Close helper, template, exact-term, lint, repo-check, review, goal-check, and GitHub PR gates. All pre-PR gates pass; GitHub delivery and goal-check remain.

Completion Gates:
| Gate | Applies | Required action | Evidence |
|------|---------|-----------------|----------|
| Named verification threshold | complete | Run the repo audit, benchmark, review, prototype, or artifact check named in this plan | 12/12 local and 14/14 installed targets mirrored; exact audit and `bun check` pass |
| Current-state source audit | complete | Map current owner, boundaries, constraints, and affected surfaces | Destination, donor, package-skill, lock, and generated ownership mapped before edits |
| Decision criteria closure | complete | Mark each criterion satisfied, narrowed, rejected, or blocked with evidence | All pre-PR criteria pass; GitHub delivery is the remaining mechanical gate |
| Options / tradeoffs / rejection record | complete | Record viable options, chosen recommendation, and why alternatives lose | Maximum relevant copy chosen; incompatible tracker/product/framework doctrine rejected |
| Review / pressure pass | complete | Run selected reviewer/lens or record N/A with reason | Agent-native capability audit plus full four-pass autoreview completed |
| Review findings closure | complete | Fix or explicitly reject accepted/actionable findings and record closure proof | Every accepted finding repaired and regression-tested; three rejections recorded below |
| External-source audit | complete | Cite official/local clone/external sources when used, or record N/A | N/A: sibling repository and installed local sources were authoritative |
| Implementation gates | complete | If code changed, close primary-template and touched-surface gates; otherwise N/A | Agent-native pack, source/generated sync, helper smoke, lint, and full check pass |
| Final handoff contract | pending | Record recommendation, evidence, caveats, residual risk, and next owner | Pre-PR contract recorded below; add PR URL/read-back after creation |
| Final lint | complete | Run `bun lint:fix` or scoped equivalent when files changed | `bun lint:fix`: 870 files checked, no fixes required |
| Output budget discipline | complete | Verify no unbounded high-volume command output was streamed, or record the accidental output and recovery | One Skills CLI clone and one full check exceeded preview caps; later audits were scoped and the full gate completed normally |
| Timed checkpoint | complete | If duration was requested, keep improving until elapsed, then finish the current loop cleanly; otherwise N/A | N/A: no duration requested |
| Goal plan complete | yes | Run `node .agents/skills/autogoal/scripts/check-complete.mjs docs/plans/2026-07-22-sync-repo-skills.md` | pending |
| Agent source / generated sync | complete | Run `bun install` when `.agents/rules/**` changed and verify generated mirrors | `bun install`; 12 local and 14 installed targets exist under both `.agents` and `.claude` |
| Agent action discoverability | complete | Source-audit the skill/rule path an agent will read | 17 changed local owners expose names, triggers, actions, templates, and helper paths |
| Agent-native review | complete | Load `.agents/skills/agent-native-reviewer/SKILL.md` and close accepted findings, or record N/A | Capability audit passed after correcting one React Query example |

Phase / pass table:
| Phase | Status | Evidence | Next |
|-------|--------|----------|------|
| Intake and source read | complete | accepted plan, source inventory, required skills read | implementation |
| Current-state map | complete | destination/donor/installed ownership inventory recorded | implementation |
| Options and recommendation | complete | user-approved topology and exclusions | implementation |
| Review / pressure pass | complete | agent-native capability audit and four-pass autoreview; all accepted findings closed | GitHub delivery |
| Implementation or plan artifact | complete | local rules, templates, doctrine, lock, and generated output landed | verification |
| Verification | complete | helper/status/smoke, exact audits, lint, hardening suite, fixtures, `bun check` all pass | GitHub delivery |
| Closeout | in_progress | pre-PR handoff complete | branch, commit, push, PR, goal check |

Findings:
- Destination owns 21 local rule names, 8 installed skills, 11 primary/packs
  templates, and no root `VISION.md` or vision-sync state.
- Ellie carries the newest generic `auto` and task/template mechanics; Informed
  provides shorter variants that make product-specific clauses easier to
  identify and remove.
- Destination package skill is separately owned by
  `packages/kitcn/skills/kitcn/**` and must remain untouched.

Decisions and tradeoffs:
- Keep GitHub PR delivery and GitHub issue/review helpers; hard-cut Linear from
  destination-owned routing and remove `linear-backlog`.
- Omit `to-issues` and do not rename it; `auto` decomposes directly to task
  packets recorded in the active plan.
- Maximize relevant copied behavior, but reject donor skills whose runtime,
  tracker, framework, or product assumptions conflict with kitcn.
- Keep dormant optional upstream support inside retained external utilities;
  destination-owned routing never invokes Linear.

Implementation notes:
- Edit only source rules/templates/docs; let the Skills CLI and `bun install`
  own lock and generated changes.
- Skills CLI removed `linear-backlog`, updated seven retained skills, and added
  seven approved skills. `bun install` regenerated root/agent/Claude outputs.
- Skiller correctly left the removed generated directory unmanaged; its two
  stale files and Claude symlink were deleted after lock/source absence was
  proven.
- Both copied helpers pass `node --check`; vision `--status` reports the
  initialized baseline and current working-tree candidates. Generated Auto and
  Task plans fail both validators while incomplete; a concrete resolved fixture
  passes both.

Review fixes:
- Agent-native review found one cRPC/React Query example that obscured ownership;
  the example now makes reactive query and bounded invalidation behavior explicit.
- Autogoal repairs cover linked-plan aliases, invalid entries, symlink escape,
  empty required sections, labeled pending text, empty checkboxes, and terminal
  table cells without a trailing pipe.
- Vision sync is read-only in preview/status mode, validates advancement before
  state changes, keeps a file-sensitive pending state, excludes its status file,
  resolves symbolic targets, and handles multiple roots deterministically.
- Video transcript routing now anchors supported hosts, keeps authentication in
  mode-0600 curl config, avoids HLS child-name collisions, resolves child-specific
  base URLs, and constrains Screencastify paths.
- Autoreview now rejects Windows snapshot traversal and non-UTF path failures,
  batches long path sets, deduplicates secret spans, validates cursor isolation,
  emits UTF-8, detects Codex config conflicts, validates Droid help, protects
  sensitive type-change literals, and includes TypeScript regression fixtures.
- Rejected with evidence: fail-closed binary/oversized review input behavior is
  intentional; `display_escape` stringifies object input internally; optional
  Linear wording inside an externally installed utility is dormant and does not
  create destination-owned routing.

Error attempts:
| Error / failed attempt | Count | Next different move | Resolution |
|------------------------|-------|---------------------|------------|
| Skills CLI rejected `--agent '*'` for removal | 1 | Name `claude-code codex` explicitly | Retrying with the CLI's reported valid agent names |
| `next-dev-loop` install emitted long clone progress | 1 | Keep later CLI output capped and avoid further broad streaming | Install succeeded; subsequent commands stay narrowly scoped |
| `npx skills check --project` refreshed installed files and displaced local integration annotations | 1 | Reapply reviewed integration repairs and stop invoking update/check mutations | Repairs restored and covered by the hardening suite |
| TruffleHog was absent for autoreview preflight | 1 | Install the required scanner and rerun preflight | Homebrew TruffleHog 3.95.9 installed; scan passes |
| Synthetic URI credential fixtures triggered TruffleHog | 1 | Use official inline ignores on the four exact synthetic lines | Preflight passes without weakening repository scanning |
| Binary skill assets exceeded text review input | 1 | Hold them outside the text bundle, inspect/hash them separately, then restore | Visual/type audit complete; SHA-256 values recorded below |
| Codex reviewer quota was exhausted until July 28 | 1 | Use autoreview's local Claude fallback for the same four-pass contract | Full review completed; accepted findings repaired and tested |
| Python compilation created a temporary `__pycache__` that polluted the review bundle | 1 | Remove the exact generated cache and use direct syntax/test commands | Cache removed; final audit finds none |
| Broad donor vocabulary and capability audits included irrelevant trees or omitted `.mdc` | 2 | Restrict to changed owner lanes and include source extensions explicitly | Final exact-term and discoverability audits pass |
| First `bun check` found generated fixture drift from upstream `@latest` scaffolds | 1 | Regenerate every owned fixture, then replay every template | Eight fixture package snapshots refreshed; `fixtures:check` and full `bun check` pass |
| Signed commit could not reach locked 1Password agent | 2 | Preserve staged state and retry only after the Mac/1Password is unlocked | Both attempts failed before writing a commit; all 130 paths remain staged |

Verification evidence:
- `node --check` passes for both copied helper scripts; vision `--status` reports
  the initialized baseline without mutating state.
- Generated incomplete Auto/Task plans fail placeholder/completion validation;
  a fully evidenced temporary fixture passes both validators.
- `bun install` regenerated root `AGENTS.md` plus agent/Claude mirrors; exact
  read-back proves 12 local and 14 installed targets in both mirror roots.
- `linear-backlog` is absent from lock and mirrors. Exact scoped search finds no
  Linear routing in destination AGENTS, local rules, templates, or root AGENTS;
  GitHub/PR routing remains present.
- Added lanes contain no Ellie, Informed, PCC, healthcare, Sentry, Inngest, or
  Unleash vocabulary. `packages/kitcn/skills/kitcn/**` remains diff-clean.
- Avoid-feature-creep binary assets: large PNG
  `3d75d4d6d48c2585e68a4669d31fba98b63c731ffde0a0c0c62f32ec48679820`;
  small SVG `b601e3ea18f73c8f7e46e097a9f931e74841ec10be7950fd7c27a1687fcbc0b5`.
- Autoreview hardening: 259 tests pass, one platform-specific skip; TruffleHog
  preflight clean. Agent-native review has zero unresolved accepted findings.
- `bun run fixtures:sync --backend concave` and `bun run fixtures:check` pass for
  Expo, Next, Start, and Vite with and without auth.
- `bun lint:fix` passes. Final `bun check` passes lint, typecheck, unit, CLI,
  Concave, fixture replay, verification, and runtime/auth scenario lanes.
- `git diff --check` passes; no generated Python cache remains.

Final handoff contract:
- Recommendation: ship the implemented maximum relevant sync.
- Confidence: high; source ownership, generated mirrors, exact routing audits,
  specialized reviews, fixture replay, and the full repository gate agree.
- Evidence: 12 local rules, 14 installed add/update targets, no destination-owned
  Linear route, package skill unchanged, reviews closed, full check green.
- Tests / commands: helper syntax/status/smoke; mirror and vocabulary audits;
  259-test autoreview hardening suite; fixture sync/check; `bun lint:fix`;
  `bun check`; `git diff --check`.
- Browser proof: N/A: no rendered UI or runtime product behavior changed; runtime
  and auth scenario smoke tests ran inside `bun check`.
- PR / tracker: GitHub PR authorized and pending creation; no tracker issue work.
- Caveats: fixture package snapshots moved with current upstream `@latest`
  scaffolds. Reviewed integration hardening lives inside installed skill files
  and can be overwritten by a future upstream skill update unless retained there.
- Next owner: create/read back the GitHub PR, run final plan validators, then
  hand off to maintainer review.

Timeline:
- 2026-07-22T09:11:47.217Z Major-task goal plan created.
- 2026-07-22T09:13:10Z Matching durable goal created after objective,
  threshold, verification, constraints, boundaries, and blocked condition were
  recorded.
- 2026-07-22 Local rule, helper, template, doctrine, and docs ownership sources
  implemented; installed-skill CLI actions completed.
- 2026-07-22 `bun install` regenerated root, `.agents`, and `.claude`; 12/12
  local sources and 14/14 installed add/update targets have both agent mirrors.
- 2026-07-22 Helper syntax/status and incomplete/final plan smoke checks passed.
- 2026-07-22 Agent-native review and four-pass autoreview completed; every
  accepted finding repaired and regression-tested.
- 2026-07-22 Upstream fixture snapshots refreshed and replayed; final
  `bun lint:fix`, `bun check`, exact routing/ownership audit, and diff check pass.
- 2026-07-22 Signed commit attempted twice; 1Password rejected both while the
  Mac remained locked. Branch and staged checkout are preserved for retry.

Reboot status:
| Question | Answer |
|----------|--------|
| Where am I? | Closeout after all local verification and review gates passed |
| Where am I going? | Branch, commit, push, PR read-back, plan/goal closure |
| What is the goal? | Maximum relevant kitcn-native skill sync with no destination-owned Linear routing |
| What have I learned? | Maximum copying works when destination ownership and fail-closed helper behavior stay explicit |
| What have I done? | Implemented, generated, reviewed, repaired, audited, refreshed fixtures, and passed the complete repo gate |

Open risks:
- Future Skills CLI updates may overwrite the reviewed local integration repairs
  inside installed skill files; preserve or upstream those repairs during the
  next refresh.
