---
extends: refactoring
when: Use it to audit or simplify kitcn code ownership, such as "clean up <code surface>", "simplify <package>", a cleanup of public exports, package boundaries, Convex import graphs, plugins, the CLI or scaffolds, or a structural audit that deletes, merges, inlines or splits code.
---

# Refactoring

Find, rank and, when safe, remove source-backed structural friction so the codebase is easier for humans and agents to understand: delete, merge, inline, simplify, or split only when the split earns its keep. Public call shapes and adoption go to the Verdict and Plan playbooks, bugs to the Bug fix playbook and closure to the Babysit playbook. A cleanup that removes behavior is a hard cut: it runs through the Build playbook per the architecture reference's Hard cut (`.agents/playbooks/references/architecture.md`).

- **Before** "Pin the behavior contract first": set the authority. Audit (`audit`, review, explain, plan, or a read-only delegation) inspects, ranks and routes candidates and writes only plan and evidence artifacts. Implement (implement, execute, change, fix, cleanup) applies only packets that pass the packet law. A loop or a timebox controls repetition and never grants mutation authority. A delegating supervisor keeps its plan and scope; return findings to it.
- **Replace** "Pin the behavior contract first": run the **how** skill over the affected subsystem to learn the contract. Pin behavior only where no existing test or type covers it, per `AGENTS.md`'s Tests rule, with one public-boundary test or an equivalence check that runs before any structure moves. A scaffold, template or codegen refactor pins with `bun run fixtures:check`, which must stay clean after `bun run fixtures:sync`. No snapshots.
- **Before** "Name the structure the code is missing": find and rank candidates per the Candidates section below, and record them in the candidate ledger before choosing what to move.
- **In** "Name the target shape": the split law overrides size-based split advice, including pstack's thermo-nuclear review. Do not split because a file is large. Split only when the new owner has durable behavior or proof ownership, a stable specific name, a focused proof command and lower navigation cost. A split that adds hops without clearer ownership is merged back, inlined or rejected. File count is not architecture quality. React component structure in `www` or `example` follows `component-colocation`.
- **In** "Move in small behavior-preserving steps": in implement mode, apply a cleanup only when it is behavior-neutral, changes no public API, CLI output or scaffold output, has a narrow owner and focused proof, and ends keep, revert or quarantine in the same loop. A move of shared code reads the static import graph of each Convex function entry that reaches it before and after, and a move that grows one reverts. Focused proof comes first; run the broad gate after several packets or import churn. Never leave speculative cleanup dirty.
- **After** "Confirm the change is worth keeping": stop and hand off when the next action is a public API, runtime or product architecture decision, the best cleanup needs owner review, proof needs unavailable deployment, browser or credential state, every candidate is kept, deferred or rejected with a reason, or a `VISION.md` gap blocks confident cleanup. Do not stop at the first plausible candidate.
- **Replace** "Rebase into small ordered commits": land through `node .agents/pstack/land.mjs`, which squashes the work into one commit, per `AGENTS.md`'s Delivery rule, and name the subtraction, reshape and follow-on slices in its body and the report.
- The plan's `## Close` also reports the source roots inspected, candidate count and top recommendation, decision counts, navigation-score changes, packets applied with their keep, revert or quarantine result, proof run, rejected and deferred candidates, and the next owner with its first command or file.

## Candidates

Use the repo's vocabulary: cRPC procedures, context and middleware, the React and TanStack Query client, the ORM schema, queries and relations, auth and its better-auth adapter, plugins, the CLI and its codegen, scaffold templates and fixtures, exports and package boundaries, `www` docs and the kitcn skill.

Inspect at least five candidate areas unless the prompt names a smaller scope. A candidate needs concrete friction: a concept with two owners or two public names, an export no supported entry point uses, a Convex function entry that statically imports a large graph for a narrow job, plugin, CLI, scaffold, fixture, docs and runtime shapes that disagree, generated output edited instead of its source, cross-package reach-through, a shallow wrapper or pass-through module, duplicated branching or helpers, a vague name hiding the owner, an over-broad barrel, an orphan test, tests forced through internals, aliases and compatibility paths the current API should not keep, or stale docs, skill references or tests after ownership moved. Apply `pstack:principle-subtract-before-you-add` and `pstack:principle-minimize-reader-load`, then rank each candidate on five tests:

1. **Deletion:** deleting it makes complexity disappear (shallow) or spreads it across callers (earning its keep).
2. **Navigation:** the files, owners and proof commands an agent touches to understand or fix one behavior, starting from the manifests, exports, `docs/README.md` and nearby tests.
3. **Interface depth:** callers learn less while behavior and proof become more local.
4. **Bundle:** what each Convex function entry that reaches it statically imports, before and after.
5. **VISION fit:** a cleanup outside `VISION.md`, or missing reusable taste, first records that taste in its owner; an unresolved call shape routes to the Verdict playbook.

Record candidates in the active plan or a `docs/analysis/**` artifact:

| Rank | Strength | Candidate | Files | Facts | Navigation score | Bundle impact | Recommendation | Owner | Proof | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

- Navigation score: files to read for one behavior, owners touched for one bug, proof clarity, public/private boundary clarity, and the net effect (easier, same or worse).
- Strength: `Strong` (source-backed friction, clear owner and proof, durable payoff), `Worth exploring` (real signal, shape or payoff needs a plan) or `Speculative`.
- Decision: `delete`, `merge`, `inline`, `simplify`, `split`, `keep`, `defer`, `reject` or `plan`.

Every row names files, facts, owner, proof path and action; never a menu of generic refactors. Reject a cleanup that only renames files, adds forwarding wrappers, or moves complexity without removing an owner.

## Module design

Prefer deep modules: a small public interface, meaningful behavior behind it, a clear owner, and natural tests through that interface. A module is worth keeping when callers learn less and maintainers find its behavior in one place. When a candidate changes module shape:

- Red flags: screen the shape against pstack's `architect/references/design-red-flags.md`, which covers shallow modules, pass-through methods, split ownership, two ways to do one task, importable internals and hand-synced lists.
- Adapter test: one adapter is usually hypothetical structure; two real adapters can justify an interface boundary.
- Test-boundary test: if useful tests must punch through the public interface, the module shape is probably wrong.
- Side-effect test: prefer accepting dependencies and returning results over hidden construction and ambient mutation when that makes behavior easier to test.
