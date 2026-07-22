# Kitcn Vision

Kitcn makes Convex feel familiar to developers who already understand tRPC,
Drizzle, TanStack Query, and modern auth. It should preserve what is powerful
about Convex while removing avoidable framework-specific ceremony.

## Product Doctrine

- End-to-end type safety is the product. Inputs, outputs, errors, auth context,
  callers, queries, mutations, CLI output, and generated code should agree
  without duplicated type declarations.
- Familiar mental models win. cRPC should read like tRPC, the ORM should feel
  like Drizzle, and React data access should compose through TanStack Query.
  Deviate only when Convex semantics make the familiar behavior dishonest.
- Convex is real-time and statically bundled. Preserve subscriptions and keep
  each function entry's import graph narrow; convenience is not permission for
  monolithic registries.
- Public APIs should be small, composable, explicit, and agent-readable.
  Closed-alpha evolution defaults to hard cuts after deliberate confirmation,
  not compatibility debris.
- Plugins are the extension boundary. Core primitives stay focused; optional
  behavior should not inflate every function bundle.

## Developer Experience

- The CLI is a first-class interface for humans and agents: deterministic,
  non-interactive by default, composable, and machine-readable with `--json`.
  Mutating commands should support explicit confirmation bypass such as
  `--yes`.
- Source ownership must be obvious. Manifests, exports, nearby tests, and
  `docs/README.md` should lead directly to the canonical implementation.
- Generated output is never the design owner. Change package templates, rule
  sources, or skill sources, then regenerate fixtures, examples, and mirrors.
- Scaffolds and examples are executable product surfaces. They must be
  reproducible from source and provable through prepared scenarios.

## Architecture Doctrine

- Study proven local OSS implementations before designing a parallel concept.
  Copy the useful mental model, then adapt it to Convex constraints.
- Put behavior in the package/runtime that owns it. Root tooling may coordinate
  cross-workspace work but should not absorb package logic.
- Authorization fails closed at the real data/action owner. UI state is not a
  permission boundary.
- One concept gets one canonical owner and public name. Adapters translate at
  boundaries; they do not redefine the concept.
- Prefer deletion and direct ownership over aliases, forwarding wrappers,
  fallback parsing, and migration bridges.

## Documentation Doctrine

- User docs describe the current product as if no previous API existed. Release
  history belongs in changesets, not reference documentation.
- Changes to `www/**` and the published
  `packages/kitcn/skills/kitcn/**` guidance stay synchronized.
- Local PRDs and milestone maps own capability planning. Goal plans own active
  execution and proof. ADRs own durable technical decisions.
- Agent workflow lives in `.agents` sources and installed-skill lock state;
  generated `.agents`, `.claude`, and root guidance must be regenerated and
  audited.

## Proof Doctrine

- Claims are complete only at their owning layer: types and exports, focused
  tests, package artifacts, fixtures, prepared scenarios, browser/runtime
  behavior, or authoritative source evidence.
- Package changes require the relevant build, changeset, tests, docs/skill sync,
  and repository gate.
- Scaffold changes require source regeneration plus fixture checks; committed
  fixtures are never the manual runtime.
- UI work proves honest loading, empty, error, permission, mutation, responsive,
  keyboard, and accessibility states on the live surface.
- Review verdicts, commits, and PRs are receipts, not substitutes for behavior
  proof. Final confidence is bounded by the weakest unproven acceptance case.
