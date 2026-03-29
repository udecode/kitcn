# kitcn hard cut

## Goal

Rename the product to `kitcn` across the repo with a
true hard cut. The old brand may remain only in `README.md`.

## Phases

1. Rebrand source-of-truth metadata and public package identity.
2. Rebrand imports, commands, env vars, docs, skills, templates, and generated
   banners.
3. Rename branded code identifiers to neutral functional names.
4. Regenerate fixtures/scenarios/generated outputs.
5. Sweep leftovers and run full verification.

## High-risk surfaces

- Root/package manifests and workspace package names
- CLI command names and help text
- Import specifiers and tsconfig path aliases
- Env vars and install-spec plumbing
- Templates, fixtures, scenarios, generated comments
- Docs, skills, AGENTS, plugin metadata
- React/TS branded identifiers like `AppConvexProvider`

## Findings

- This is not a docs-only rename. The brand is embedded in package names,
  command names, env vars, tests, tooling, and scaffold output.
- The cleanest code-symbol policy is neutral PascalCase names, not branded
  PascalCase identifiers.
- `docs/solutions/patterns/critical-patterns.md` does not exist.
