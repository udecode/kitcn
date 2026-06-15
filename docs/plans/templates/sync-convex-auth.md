# {{TITLE}}

Objective:
TODO: Write the short create_goal objective, under 240 characters. This plan is
for the sync audit and delegation decision, not for the delegated
implementation task.

Goal plan:
{{PLAN_PATH}}

Template:
{{TEMPLATE_PATH}}

Completion threshold:
- Fork/upstream refs, behind/ahead counts, exact commit range, upstream diff
  summary, local KitCN surface audit, docs/solutions audit, classification
  ledger, selected slice or no-action verdict, ambiguity decisions, delegated
  `task` prompt/result or N/A reason, and final evidence are recorded.
- Closure is legal only when every upstream change in the compared range is
  classified, every non-`no-op` classification has evidence and a decision, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs {{PLAN_PATH}}`
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
- Fork: pending
- Upstream: pending
- Fork branch/ref: pending
- Upstream branch/ref: pending
- Behind count: pending
- Ahead count: pending
- Exact range: pending

Sync verdict:
- verdict: pending
- selected slice: pending
- class: pending
- decision reason: pending
- next owner: sync audit

Ambiguity / approval ledger:
| Item | Why ambiguous | Decision | Evidence |
|------|---------------|----------|----------|
| None yet | N/A | N/A | N/A |

Classification ledger:
| Class | Upstream change | Evidence | KitCN surface | Decision |
|-------|-----------------|----------|---------------|----------|
| pending | pending | pending | pending | pending |

Delegated task prompt:
```md
Pending.
```

Completion rule:
- Do not call `update_goal(status: complete)` while any required checklist item
  remains unchecked. If an item does not apply, check it and add `N/A: <reason>`.
- Do not call `update_goal(status: complete)` until the named sync audit
  evidence is recorded below and
  `node .agents/skills/autogoal/scripts/check-complete.mjs {{PLAN_PATH}}`
  passes.
- Do not create hook state for this goal. This file plus the active goal are
  the durable state.

Start Gates:
| Gate | Applies | Evidence |
|------|---------|----------|
| `sync-convex-auth` skill loaded | pending | pending |
| Active goal checked or created | pending | pending |
| Source of truth read before audit | pending | pending |
| Fork/upstream discovery strategy selected | pending | pending |
| Output budget strategy recorded | pending | pending |
| Optional-scope approval boundary recorded | pending | pending |
| Delegation boundary recorded | pending | pending |

Work Checklist:
- [ ] Objective, threshold, verification surface, constraints, boundaries, and
      blocked condition are filled from the active sync goal.
- [ ] Fork, upstream, branches/refs, behind count, ahead count, and exact range
      are recorded.
- [ ] Local clone exists or is created, origin/upstream remotes are correct, and
      origin/upstream refs are fetched.
- [ ] Upstream commit list and file summary are read.
- [ ] Relevant upstream patches are read; large compares are grouped before
      deep patch review.
- [ ] Local KitCN auth surfaces are searched and relevant hits are read.
- [ ] `docs/solutions` and `docs/plans` institutional notes are searched and
      relevant hits are read.
- [ ] Every upstream change or file group is classified as `security`,
      `compatibility`, `bugfix`, `feature`, `cleanup`, `docs`, `tests`, or
      `no-op`.
- [ ] Every non-`no-op` item records commit evidence, diff evidence, local KitCN
      files affected, expected implementation surface, verification command(s),
      confidence, and decision.
- [ ] Optional or ambiguous additions are either explicitly approved, rejected,
      or recorded as a blocker before implementation.
- [ ] Highest-leverage slice is selected using the skill priority order, or a
      no-action verdict is recorded with evidence.
- [ ] Delegated `task` prompt is recorded exactly enough for implementation, or
      N/A reason is recorded because no actionable opportunity exists.
- [ ] Final sync output matches the skill output contract before delegation or
      no-action closeout.
- [ ] Workspace authority recorded: each proof names the repo/tool that owns the
      evidence.
- [ ] Output budget discipline recorded and followed.
- [ ] Autoreview decision recorded for any local implementation patch, or N/A
      reason recorded for audit-only/no-local-patch work.

Completion Gates:
| Gate | Applies | Required action | Evidence |
|------|---------|-----------------|----------|
| Fork/upstream identity | pending | Record `gh repo view` or fallback evidence | pending |
| Ref fetch | pending | Fetch fork and upstream refs/tags in `../convex-better-auth` | pending |
| Behind/ahead counts | pending | Record `rev-list --count` results | pending |
| Commit range | pending | Record exact compared range and commit summary | pending |
| Upstream diff summary | pending | Record `diff --name-status` and relevant patch evidence | pending |
| Local KitCN surface audit | pending | Run/read scoped `rg` across KitCN integration points | pending |
| Institutional note audit | pending | Search/read relevant `docs/solutions` and `docs/plans` notes | pending |
| Classification ledger complete | pending | Every upstream change or file group has class/evidence/decision | pending |
| Ambiguous optional scope | pending | Ask one pointed question or record explicit N/A | pending |
| Selected slice or no-action verdict | pending | Record priority choice, evidence, and confidence | pending |
| Delegated task handoff | pending | Record exact delegated `task` prompt and final handoff, or N/A reason | pending |
| Browser surface changed | pending | Capture Browser proof or record N/A | pending |
| Package/scaffold/docs gates delegated | pending | Ensure delegated prompt includes package build, fixture, docs, or skills checks when applicable | pending |
| Workspace authority proof | pending | Record cwd/tool for every proof surface | pending |
| Autoreview for local implementation patch | pending | Run autoreview if this sync plan itself changes implementation code; otherwise N/A | pending |
| Final output contract | pending | Record terse audit table and delegation/no-action result | pending |
| Output budget discipline | pending | Verify no unbounded high-volume output was streamed, or record recovery | pending |
| Goal plan complete | yes | Run `node .agents/skills/autogoal/scripts/check-complete.mjs {{PLAN_PATH}}` | pending |

Phase / pass table:
| Phase | Status | Evidence | Next |
|-------|--------|----------|------|
| Setup refs | in_progress | created plan | upstream diff |
| Upstream diff audit | pending | | local impact audit |
| Local KitCN impact audit | pending | | classification |
| Classification and decision | pending | | delegation or no-action closeout |
| Delegation / closeout | pending | | final response |

Findings:
- None yet.

Decisions and tradeoffs:
- None yet.

Error attempts:
| Error / failed attempt | Count | Next different move | Resolution |
|------------------------|-------|---------------------|------------|
| None yet | 0 | | |

Timeline:
- {{CREATED_AT}} Sync audit plan created.

Verification evidence:
- Pending.

Final handoff / sync:
- Fork/upstream: pending
- Range: pending
- Decision: pending
- Delegated PR: pending
- Caveats: pending

Reboot status:
| Question | Answer |
|----------|--------|
| Where am I? | Setup refs |
| Where am I going? | Upstream diff, local impact audit, classification, delegation or no-action closeout |
| What is the goal? | TODO: Fill from Objective |
| What have I learned? | See Findings |
| What have I done? | See Timeline |

Open risks:
- Pending.
