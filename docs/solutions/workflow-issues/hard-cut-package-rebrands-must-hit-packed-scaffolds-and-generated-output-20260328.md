---
title: Hard-cut package rebrands must hit packed tarballs, scaffolds, and generated output together
category: workflow-issues
tags:
  - rebrand
  - packaging
  - scaffolds
  - codegen
  - scenarios
  - verification
symptoms:
  - repo grep looks clean but generated apps still emit the dead package name
  - prepared scenarios install the new package name but old comments, imports, or local install specs still leak through
  - template or plugin verification passes in-source while the packed tarball or scaffold output still points at stale names
module: tooling
resolved: 2026-03-28
last_updated: 2026-03-31
---

# Hard-cut package rebrands must hit packed tarballs, scaffolds, and generated output together

## Problem

A repo-wide hard-cut rename can look done far too early.

The obvious greps may already be clean while prepared scenarios, packed local
install specs, generated comments, scaffolded plugin files, or config readers
and writers still emit stale names. That produces the worst kind of bug: the
source tree looks correct, but the shipped surface is lying.

## Root Cause

The brand did not live in one place. It was spread across:

- workspace package names and bin metadata
- config default discovery and validation
- config writers used by init and follow-up mutation flows
- local packed tarball install specs
- scaffold templates and fixture generators
- generated file banners and comments
- docs, skills, and active release notes
- scenario preparation and plugin adoption flows

A string replace in source files is not enough when the real product is the
packed package plus the generated app it produces.

## Solution

Treat a hard-cut rebrand as a shipped-surface migration, not a text edit.

Update the package identity, install specs, templates, scenario tooling, and
generated output sources together. If the rename touches a config surface,
update the default reader, explicit validation path, config writers, fixtures,
docs, skills, and unreleased changesets in the same pass. Then regenerate
fixtures and prove the result through real prepared apps, not just repo
searches.

In practice, the honest gate was:

1. rename the package and CLI surface
2. rename default config discovery and delete legacy config parsing
3. update config writers and mutation flows so they emit the new surface
4. rename internal import paths and neutralize branded code identifiers
5. update scaffold/template sources instead of patching generated apps by hand
6. rebuild the package and any plugin packages
7. regenerate fixtures and run scenario validation against packed installs
8. sweep docs, skill references, and the active changeset for stale names or
   stale behavior claims

## Verification

- `rg` outside `README.md` returned no dead-brand matches
- `bun --cwd packages/kitcn build`
- `bun --cwd packages/resend build`
- `bun run fixtures:sync`
- `bun run fixtures:check`
- `bun run scenario:check -- convex-next-all`
- `bun check`
- targeted CLI tests covered default config discovery, explicit config paths,
  legacy-config failure, and config-writing flows

## Prevention

1. For hard-cut renames, grep is only the first gate. Packed installs and
   scaffolded apps are the real contract.
2. If the rename touches config, reader and writer symmetry matters. A loader
   rename without writer updates is still broken.
3. Never hand-patch generated example/plugin output first. Fix the template or
   generator, then regenerate.
4. If a rebrand touches package names, always verify through local tarball
   installs and prepared scenarios.
5. Docs, bundled skills, and the unreleased changeset count as shipped
   surface. Kill stale names and stale behavior claims there too.
6. Generated comments and banners count as shipped surface. Kill stale names
   there too.
