# Documentation Ownership

This map points to canonical documentation owners. Update it when a durable
owner moves; do not use it as a changelog.

| Surface | Owner | Purpose |
| --- | --- | --- |
| durable product/API/DX doctrine | `VISION.md` | decision filter and long-term direction |
| active implementation and proof | `docs/plans/**` | autogoal execution state |
| capability requirements | `docs/prds/**` | implementation-ready local PRDs and packets |
| outcome sequencing | `docs/milestones/**` | pivotable milestone maps and PRD ladders |
| architecture decisions | `docs/adr/**` | accepted technical decisions |
| architecture investigation | `docs/analysis/**` | source-backed analysis before a decision |
| product/API pressure tests | `docs/brainstorms/**` | grill receipts and open pivots |
| ORM doctrine | `docs/orm/**` | ORM-specific design and evidence |
| external/source research | `docs/research/**` | bounded research inputs and findings |
| reusable resolved problems | `docs/solutions/**` | repository-specific failure and solution records |
| vision drift state | `docs/sync/vision/**` | reviewed baseline and generated candidate runs |
| user documentation | `www/**` | current-state reference and guides |
| published agent guidance | `packages/kitcn/skills/kitcn/**` | end-user kitcn skill synchronized with docs |
| repository workflow | `.agents/AGENTS.md`, `.agents/rules/**` | agent rules, helpers, and local skills |
| generated agent output | root `AGENTS.md`, `.agents/skills/**`, `.claude/skills/**` | regenerated mirrors; never edit directly |

Planning artifacts stay local. A milestone selects PRD candidates, a PRD
settles one capability and its task packets, and the active goal plan records
execution and proof.
