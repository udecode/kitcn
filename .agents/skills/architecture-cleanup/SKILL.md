---
description: Find and execute bounded architecture cleanup across public exports, package ownership, Convex bundle graphs, plugins, CLI/scaffolds, generated files, docs, and agent navigation.
argument-hint: <surface | package | current tree> [plan|execute]
name: architecture-cleanup
metadata:
  skiller:
    source: .agents/rules/architecture-cleanup.mdc
---

# Architecture Cleanup

Use this for structural cleanup whose value comes from removing ownership
confusion, duplicate concepts, leaky public APIs, expensive import graphs, or
generated-source mistakes. It is not a prettier-file pass.

## Use When

- a concept has multiple owners or multiple public names;
- package boundaries and exports no longer describe runtime ownership;
- a Convex function imports a large graph for a narrow operation;
- plugin, CLI, scaffold, fixture, docs, and runtime shapes disagree;
- generated files are being edited instead of their source;
- agents repeatedly need broad searches to locate one responsibility;
- an old path should be removed with a hard cut.

Use `task` for a narrow implementation and `major-task` for a new framework,
migration, benchmark, or public-API proposal.

## Read Order

1. `VISION.md` and `docs/README.md`.
2. The active goal plan or named source.
3. Root/package manifests, exports, `turbo.json`, and build scripts.
4. Runtime entry points and their static import graphs.
5. CLI/template source, regeneration commands, fixtures, and scenarios.
6. User docs and matching `packages/kitcn/skills/kitcn/**` content.
7. Tests and proof commands that guard the current contract.

## Goal Contract

Create a goal plan from the `architecture-cleanup` template with the
`agent-native` pack. Add `package-api` when a package export or public API is in
scope and `docs` when user docs move.

The plan must state:

- current and target owner maps;
- public names being kept, added, or deleted;
- import-graph and bundle-size consequences;
- source/generated ownership and regeneration commands;
- docs and package-skill synchronization;
- fixtures, scenarios, compatibility stance, and proof gates;
- deletion receipts and a rollback or safe-stop boundary.

## Core Laws

### One semantic owner

Each durable concept gets one canonical implementation owner. Adapters may
translate at a boundary, but they do not redefine the concept.

### Public API is deliberate

- Trace every public export to a real supported entry point.
- Remove dead aliases and compatibility shims unless explicitly required.
- Prefer a small composable API over a monolithic global.
- A hard cut deletes old exports, docs, tests, examples, and scaffold output.

### Convex bundles stay narrow

Convex statically bundles each function entry. Never solve convenience by
pulling a monolithic registry, every plugin, or browser-only code into a narrow
entry. Prefer per-module callers, plugins, and leaf imports. Prove the relevant
entry graph when moving shared code.

### Generated output has an owner

Do not patch fixtures, example plugin files, generated skills, or generated
root guidance directly. Change the source and regenerate. Record the source,
command, and representative generated diff.

### Agent navigation is architecture

A good structure lets an agent find the owner from manifests, exports,
`docs/README.md`, and nearby tests. Penalize duplicated naming, hidden runtime
registration, cross-package reach-through, and docs that point to stale paths.

## Candidate Method

Inventory concrete candidates before editing:

| Candidate | Current owner | Target owner | Public impact | Bundle impact | Generated impact | Evidence |
| --- | --- | --- | --- | --- | --- | --- |

Score only when choosing between valid candidates:

- correctness and owner clarity;
- deleted surface and reduced navigation cost;
- bundle/import-graph improvement;
- DX and API coherence;
- proof availability;
- conflict and migration risk.

Reject cleanup that merely renames files, adds forwarding wrappers, or moves
complexity without reducing an owner.

## Implementation Packet

Each packet names:

- one owner and exact files;
- acceptance behavior;
- public API and import-graph deltas;
- generated files and regeneration command;
- tests, fixtures, scenarios, docs, and skill sync;
- deletions and forbidden fallback paths;
- proof required before the next packet.

Use bounded TDD for changed live behavior. Do not write tests whose only purpose
is asserting that dead code remains dead.

## Closeout

Before completion:

1. Prove the target owner map from source and exports.
2. Search for old names, aliases, reach-through imports, and stale docs.
3. Regenerate every owned artifact and prove no hand-edited drift remains.
4. Run package build, focused tests, fixtures/scenarios, docs/skill sync, and
   repository checks required by the changed surface.
5. Run `deslop` after behavior works.
6. Run `agent-native-reviewer`, then `autoreview`.
7. Record deletion receipts, residual risks, and the next owner if incomplete.

Stop rather than inventing a compatibility layer, changing an unrelated public
contract, or editing generated output without its owner.
