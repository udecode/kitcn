# Documentation Ownership

This map points to canonical documentation owners. Update it when a durable
owner moves; do not use it as a changelog.

| Surface | Owner | Purpose |
| --- | --- | --- |
| durable product/API/DX doctrine | `VISION.md` | decision filter and long-term direction |
| active implementation and proof | `docs/plans/**` | plans, their decision logs and the plan pages they render |
| capability requirements | `docs/prds/**` | older PRDs and task packets; new work writes a plan |
| outcome sequencing | `docs/milestones/**` | older milestone maps; new work writes a plan |
| architecture decisions | `docs/adr/**` | accepted technical decisions |
| architecture investigation | `docs/analysis/**` | source-backed analysis before a decision |
| product/API pressure tests | `docs/brainstorms/**` | grill receipts and open pivots |
| ORM doctrine | `docs/orm/**` | ORM-specific design and evidence |
| external/source research | `docs/research/**` | bounded research inputs and findings |
| reusable resolved problems | `docs/solutions/**` | repository-specific failure and solution records |
| vision drift state | `docs/sync/vision/**` | older vision drift runs |
| user documentation | `www/**` | current-state reference and guides |
| published agent guidance | `packages/kitcn/skills/kitcn/**` | end-user kitcn skill synchronized with docs |
| repository workflow | root `AGENTS.md`, `.agents/rules/**`, `.agents/playbooks/**`, `.agents/pstack/**` | agent rules, playbooks, pstack helpers and local skills |
| agent workflow guide | `docs/development/agent-skills.md` | what to type and which file owns each process |
| generated agent output | `.agents/skills/**`, `.claude/skills/**` | regenerated mirrors; never edit directly |

The pstack block in `AGENTS.md`, `.agents/pstack.json`, `.agents/pstack/**` and
its rule files come from the `sync-pstack` skill in `udecode/dotai`.
