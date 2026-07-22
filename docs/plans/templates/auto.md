# {{TITLE}}

Objective:
TODO: Write the short create_goal objective and measurable autonomous outcome.

Goal plan:
{{PLAN_PATH}}

Template:
{{TEMPLATE_PATH}}

Run profile:
| Field | Value |
| --- | --- |
| source | pending |
| mode | pending |
| target | pending |
| boundary / exclusions | pending |
| architecture depth | pending |
| behavior strategy | pending |
| proof harness | pending |
| docs/generated owners | pending |
| delivery | pending |
| parallelism | off unless explicitly requested |
| review threshold | pending |
| timebox / reserve | pending |
| stop condition | pending |

Completion threshold:
- TODO: Define the exact all-lane done state.
- Full closure requires source readiness, local packet execution, relevant
  package/generated/docs/fixture/scenario proof, accepted review closure,
  `bun check`, GitHub delivery, all applicable lane scores at least 95, and
  `node .agents/skills/autogoal/scripts/check-complete.mjs {{PLAN_PATH}}` passing.

Verification surface:
- TODO: Name exact commands, runtime/browser proof, audits, reviews, and PR
  read-back.

Constraints:
- Preserve package, scaffold, fixture, changeset, Convex bundle, and docs/skill
  contracts.
- Decompose directly into local packets.
- Use `orchestrator` only when the user explicitly requested parallel child work.
- Do not weaken the requested mode after work starts.

Boundaries:
- allowed paths/surfaces: pending
- external authority: pending
- explicit exclusions: pending
- non-goals: pending

Output budget strategy:
- TODO: Scope/cap broad searches and preserve large outputs as artifacts.

Blocked condition:
- TODO: Name the missing authority, irreversible decision, or proven environment
  failure that stops the next safe move.

State capsule:
- mode: pending
- target: pending
- active source: pending
- active packet: pending
- current owner: pending
- last proven fact: pending
- latest changed files: pending
- next proof: pending
- open blocker: pending
- decision debt: 0
- time remaining / reserve: N/A

Start Gates:
| Gate | Applies | Evidence |
| --- | --- | --- |
| Run profile compiled | pending | pending |
| Vision/docs map read | pending | pending |
| Source intake complete | pending | pending |
| Mode and stop condition reconciled | pending | pending |
| Readiness owners named | pending | pending |
| Proof harness selected | pending | pending |
| Installed/local skill owners selected | pending | pending |
| Active goal checked or created | pending | pending |
| Output budget recorded | pending | pending |

Source and readiness:
| Lane | Owner | Ready means | Evidence | Status |
| --- | --- | --- | --- | --- |
| product/doctrine | pending | outcome/non-goals settled | pending | pending |
| public API | pending | names/types/errors/hard cut settled | pending | pending |
| runtime/data/auth | pending | entry/data/identity/denial flow mapped | pending | pending |
| generated/scaffold | pending | source and regeneration known | pending | pending |
| proof | pending | source-listed matrix and harness ready | pending | pending |
| docs/skill | pending | current-state owners mapped | pending | pending |
| delivery | auto parent | reviews/checks/GitHub path explicit | pending | pending |

Task packet ledger:
| Packet | Outcome | Owner/files | Depends on | Conflict group | Mode | Acceptance | Proof | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| pending | pending | pending | pending | pending | pending | pending | pending | pending |

Scenario and proof matrix:
| Scenario | Entry/input | Expected behavior | Harness | Evidence | Status |
| --- | --- | --- | --- | --- | --- |
| pending | pending | pending | pending | pending | pending |

Claim receipts:
| Claim | Exact evidence | Freshness | Scope | Confidence | Status |
| --- | --- | --- | --- | --- | --- |
| pending | pending | pending | pending | pending | pending |

Decision debt:
| Decision | Why unresolved | Recommended answer | Evidence needed | Deadline |
| --- | --- | --- | --- | --- |
| None | N/A | N/A | N/A | N/A |

Assumption ledger:
| Assumption | Evidence | Risk if false | Validation | Status |
| --- | --- | --- | --- | --- |
| pending | pending | pending | pending | pending |

Candidate decision:
| Candidate owner | Leverage | Vision | Unblock | Evidence | Proof | Reversible | Simplicity | Conflict | Decision |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| pending | pending | pending | pending | pending | pending | pending | pending | pending | pending |

Work Checklist:
- [ ] Run profile, source, threshold, exclusions, harness, delivery, and stop
      condition are coherent.
- [ ] Full mode repaired bounded source gaps or routed once to a PRD, then
      returned to implementation.
- [ ] Packets are vertical, locally owned, acceptance-bound, and not oversplit.
- [ ] Every source-listed case appears in the proof matrix.
- [ ] Public API, auth/data, Convex graph, generated ownership, docs/skill, and
      package gates are explicit or N/A with reason.
- [ ] State capsule, decisions, assumptions, claims, packets, and error attempts
      reflect actual work.
- [ ] Repeated failures use a next-different move and trigger workflow repair
      when the owner itself is wrong.
- [ ] Changed skills have eval rows for routing, receipts, and forbidden behavior.
- [ ] Timed mode preserved at least 20% for closeout, or N/A.
- [ ] Self-grill decisions and cut scope are recorded.
- [ ] Final confidence is bounded by exact fresh evidence.

Skill evaluation:
| Prompt/case | Expected route | Required receipts | Forbidden behavior | Result |
| --- | --- | --- | --- | --- |
| pending | pending | pending | pending | pending |

Error attempts:
| Failure signature | Count | Hypothesis | Next different move | Resolution |
| --- | ---: | --- | --- | --- |
| None yet | 0 | | | |

All-lane closeout:
| Lane | Applies | Score | Evidence | Next owner if below 95 |
| --- | --- | ---: | --- | --- |
| source/decision readiness | pending | pending | pending | pending |
| implementation/public API | pending | pending | pending | pending |
| data/auth/bundle ownership | pending | pending | pending | pending |
| tests/fixtures/scenarios | pending | pending | pending | pending |
| docs/package skill/generated | pending | pending | pending | pending |
| UI/runtime proof | pending | pending | pending | pending |
| cleanup/review | pending | pending | pending | pending |
| checks/GitHub delivery | pending | pending | pending | pending |
| goal audit | yes | pending | pending | pending |

Completion Gates:
| Gate | Applies | Required action | Evidence |
| --- | --- | --- | --- |
| Source readiness | pending | Resolve every blocking source/decision row | pending |
| Packet execution | pending | Complete or truthfully block every completion packet | pending |
| Claim/proof matrix | pending | Prove every applicable scenario and completion claim | pending |
| Package/API/build | pending | Run package-owned types/build/tests/changeset or N/A | pending |
| Generated/fixture/scenario | pending | Regenerate and prove representative output or N/A | pending |
| Docs/package skill | pending | Synchronize current-state guidance or N/A | pending |
| Browser/runtime | pending | Prove live UI/runtime surface or N/A | pending |
| Skill eval/helper smoke | pending | Run routing/helper/placeholder checks or N/A | pending |
| Agent-native reviewer | pending | Run for workflow changes or N/A | pending |
| Deslop | pending | Run bounded cleanup or N/A | pending |
| Final lint | yes | Run `bun lint:fix` | pending |
| Repository check | yes | Run `bun check` | pending |
| GitHub delivery | pending | Commit/push/open or update PR and read back | pending |
| All-lane score | yes | Every applicable lane at least 95 | pending |
| Autoreview | yes | Resolve every accepted actionable finding | pending |
| Goal plan complete | yes | Run `node .agents/skills/autogoal/scripts/check-complete.mjs {{PLAN_PATH}}` | pending |

Phase / pass table:
| Phase | Status | Evidence | Next |
| --- | --- | --- | --- |
| Intake/profile | in_progress | plan created | readiness |
| Source/readiness | pending | | packets |
| Packet execution | pending | | proof |
| Proof/sync | pending | | review |
| Review/checks | pending | | delivery |
| GitHub delivery | pending | | final audit |
| Closeout | pending | | final |

Findings:
- None yet.

Decisions and tradeoffs:
- None yet.

Self-grill receipt:
- Pending.

Verification evidence:
- Pending.

Timeline:
- {{CREATED_AT}} Auto goal plan created.

Reboot status:
| Question | Answer |
| --- | --- |
| Where am I? | Intake/profile |
| Where am I going? | Readiness, packets, proof, review, delivery, audit |
| What is the goal? | TODO |
| What have I learned? | See findings/ledgers |
| What have I done? | See timeline |

Open risks:
- Pending.
