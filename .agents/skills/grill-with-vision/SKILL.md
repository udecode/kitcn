---
description: Pressure-test a kitcn product, API, architecture, or DX direction against VISION.md and source evidence before committing to a plan or PRD.
argument-hint: <idea | source path | current plan>
name: grill-with-vision
metadata:
  skiller:
    source: .agents/rules/grill-with-vision.mdc
---

# Grill With Vision

Use this when the direction is important enough that polite agreement would be
expensive. The output is a sharper decision, not an interview transcript.

## Read First

1. `VISION.md`.
2. `docs/README.md` and the named PRD, milestone, plan, ADR, or source.
3. Public exports, CLI commands, runtime entry points, and representative tests.
4. Local clones of proven OSS owners when the proposal copies a familiar
   mental model.

## Interview Loop

Ask one high-leverage question at a time when user input is genuinely needed.
Otherwise answer it from evidence and continue. Attack:

- the user and job being improved;
- why this belongs in kitcn rather than application code;
- the familiar tRPC/Drizzle/TanStack/better-auth mental model being preserved;
- public API, type flow, auth, data flow, and bundle consequences;
- CLI and agent DX, including deterministic/non-interactive output;
- source/generated ownership and regeneration;
- hard-cut and compatibility stance;
- proof, benchmarks, fixtures, scenarios, and failure states;
- scope that is attractive but not necessary for the outcome.

When two answers conflict, name the contradiction and force a choice. Do not
paper it over with an abstraction.

## Domain Modeling Discipline

For each noun and verb, identify:

- canonical owner and identifier;
- input, persisted state, derived state, and output;
- authorization boundary;
- package/runtime entry points;
- public name and user-facing mental model;
- lifecycle, failure, retry, and deletion behavior.

Reject a new primitive if an existing owner can express it cleanly. Reject
reuse if it corrupts the existing owner's meaning.

## Durable Notes

Write meaningful discoveries to `docs/brainstorms/<date>-<topic>.md` or the
active plan. Include decisions, rejected options with reasons, source links,
open pivots, and the recommended next owner (`to-milestone`, `to-prd`,
`major-task`, `task`, or stop).

Local doctrine and plans own this step.

## Stop Boundary

Stop when the core outcome, owner map, irreversible decisions, proof bar, and
non-goals are clear enough for the next artifact. Keep grilling if a public API
or package boundary still depends on an unstated assumption.
