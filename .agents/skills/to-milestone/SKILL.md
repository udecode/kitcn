---
description: Turn kitcn vision, research, and source evidence into a pivotable local milestone map and ranked PRD ladder.
argument-hint: <theme | source paths | current milestone>
name: to-milestone
metadata:
  skiller:
    source: .agents/rules/to-milestone.mdc
---

# To Milestone

A milestone map describes a coherent product or platform outcome and the PRD
ladder likely to reach it. It stays pivotable; it is not a release promise or an
issue queue.

## Output

Write to:

```text
docs/milestones/<date>-<slug>.md
```

Update `docs/README.md` when ownership or the active map changes.

## Source Order

1. `VISION.md`.
2. Existing milestone maps and PRDs.
3. Research, ADRs, brainstorms, plans, docs, public APIs, and source evidence.
4. Local clones of proven OSS projects when their mental model is relevant.
5. Current tests, fixtures, scenarios, and shipped behavior.

## Map Shape

The milestone must include:

- thesis and why now;
- target user/developer story;
- current capability and constraints;
- required product, API, auth, data-flow, CLI, docs, and proof surfaces;
- ranked PRD ladder with dependencies and pivot points;
- concepts that must remain one PRD;
- open decisions and disconfirming evidence;
- non-goals and completion evidence.

Each PRD candidate states the outcome, why it is independently useful, what it
unlocks, likely owners, and proof boundary. Avoid tiny PRDs for tests, guards,
docs, or one internal helper when they belong to a coherent vertical outcome.

## Scope Standard

Prefer the smallest milestone that changes a real developer capability end to
end. Include package/runtime/API/CLI/docs/example work when users experience
them as one capability. Exclude attractive follow-ons that do not change the
milestone outcome.

## Relationship To PRDs

Milestones rank and contextualize PRDs. `to-prd` makes one selected rung
implementation-ready. `auto full` may consume an existing PRD but does not need
a milestone for a narrow well-specified task.

The local map and its PRDs are the planning owners.

## Review Gate

Self-grill the map against `VISION.md`, run a source-backed contradiction pass,
then `autoreview`. A map is ready when the target story is coherent, the ladder
is not oversplit, dependencies and pivots are visible, and the next recommended
`to-prd` is explicit.
