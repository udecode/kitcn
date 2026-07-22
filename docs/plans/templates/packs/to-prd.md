# to-prd pack

Use when the active primary plan must create or repair an implementation-ready
local PRD before execution continues.

Start Gates:
| Gate | Applies | Evidence |
| --- | --- | --- |
| Vision/milestone/source identified | pending | pending |
| Current public/runtime owners inspected | pending | pending |
| PRD need versus plan-local decisions justified | pending | pending |

Work Checklist:
- [ ] To-PRD pack: one end-to-end capability and non-goals are explicit.
- [ ] To-PRD pack: public API, service/runtime, auth/session/permission,
      canonical data, Convex graph, plugin, CLI/scaffold/generated, docs, and
      proof decisions are settled or N/A.
- [ ] To-PRD pack: local packets have owner, dependencies, conflict group,
      mode, acceptance, proof, and exclusions.
- [ ] To-PRD pack: claims are source-backed and every readiness dimension is at
      least 4/5.
- [ ] To-PRD pack: PRD is linked from its milestone/docs owner.

Completion Gates:
| Gate | Applies | Required action | Evidence |
| --- | --- | --- | --- |
| PRD source/decision audit | yes | Resolve contradictions and owners | pending |
| Packet readiness | yes | Prove local packets are executable | pending |
| Score/self-grill | yes | Reach 4/5 and record changed decisions | pending |
| PRD review | yes | Resolve accepted findings before implementation | pending |
