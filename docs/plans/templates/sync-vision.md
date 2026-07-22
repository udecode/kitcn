# {{TITLE}}

Objective:
TODO: Audit doctrine drift since baseline, update canonical owners, and advance
the reviewed baseline only after proof.

Goal plan:
{{PLAN_PATH}}

Template:
{{TEMPLATE_PATH}}

Baseline:
- status path: `docs/sync/vision/status.json`
- base commit: pending
- target commit: pending
- working-tree overlay: pending
- candidate run: pending

Completion threshold:
- Every candidate classified, contradictions resolved, canonical owners updated
  or explicitly unchanged, generated mirrors synced when needed, reviews/checks
  passing, baseline advanced truthfully, and goal checker passing.

Verification surface:
- `collect-vision-diff.mjs --status/--preview`, source audit, mirror audit,
  review, and exact baseline read-back.

Constraints:
- Vision owns reusable doctrine, not implementation details or backlog.
- Never advance merely to silence candidates.
- Working-tree changes are visible but not represented as committed baseline.

Boundaries:
- candidate paths: pending
- canonical owners: pending
- intentional exclusions: pending

Output budget strategy:
- Store candidate runs under `docs/sync/vision/runs/**`; summarize counts rather
  than streaming every hit.

Blocked condition:
- Unresolved doctrine contradiction, missing owner evidence, or invalid baseline.

Start Gates:
| Gate | Applies | Evidence |
| --- | --- | --- |
| Status/preview run | pending | pending |
| Vision/docs map read | pending | pending |
| Candidate owners read | pending | pending |
| Active goal checked or created | pending | pending |

Candidate classification:
| Candidate | Evidence | Class | Canonical owner | Action/no-change reason | Status |
| --- | --- | --- | --- | --- | --- |
| pending | pending | pending | pending | pending | pending |

Contradictions:
| Conflict | Owners | Decision | Evidence | Status |
| --- | --- | --- | --- | --- |
| None | N/A | N/A | N/A | resolved |

Work Checklist:
- [ ] Old/new commit ids and working overlay are recorded.
- [ ] Every candidate is classified as doctrine, plan/map, ADR/analysis,
      workflow, implementation detail, rejected/superseded, or contradiction.
- [ ] Reusable doctrine is updated only in the smallest canonical owner.
- [ ] Workflow source changes are regenerated and audited.
- [ ] No-change and rejected candidates have source-backed reasons.
- [ ] Baseline is advanced only after committed range closure.

Completion Gates:
| Gate | Applies | Required action | Evidence |
| --- | --- | --- | --- |
| Helper syntax/status | yes | Run `node --check` and `--status` | pending |
| Candidate classification | yes | Account for every candidate | pending |
| Contradiction closure | yes | Resolve or block advancement | pending |
| Canonical owner audit | yes | Prove doctrine lives in correct owner | pending |
| Generated mirror sync | pending | Run `bun install` and audit mirrors or N/A | pending |
| Baseline advancement | yes | Advance with this plan and read back status | pending |
| Agent-native reviewer | pending | Run for workflow changes or N/A | pending |
| Final lint/check | pending | Run relevant repository gates | pending |
| Autoreview | yes | Resolve every accepted actionable finding | pending |
| Goal plan complete | yes | Run `node .agents/skills/autogoal/scripts/check-complete.mjs {{PLAN_PATH}}` | pending |

Phase / pass table:
| Phase | Status | Evidence | Next |
| --- | --- | --- | --- |
| Intake/status | in_progress | plan created | classification |
| Classification | pending | | owner updates |
| Owner updates | pending | | validation |
| Validation/review | pending | | advance |
| Advance/closeout | pending | | final |

Decisions and tradeoffs:
- None yet.

Verification evidence:
- Pending.

Timeline:
- {{CREATED_AT}} Vision sync plan created.

Reboot status:
| Question | Answer |
| --- | --- |
| Where am I? | Intake/status |
| Where am I going? | Classification, owner updates, validation, advance |
| What is the goal? | TODO |
| What have I learned? | See classification |
| What have I done? | See timeline |

Open risks:
- Pending.
