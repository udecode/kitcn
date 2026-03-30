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
---

# Hard-cut package rebrands must hit packed tarballs, scaffolds, and generated output together

## Problem

A repo-wide hard-cut rename can look done far too early.

The obvious greps may already be clean while prepared scenarios, packed local
install specs, generated comments, or scaffolded plugin files still emit stale
names. That produces the worst kind of bug: the source tree looks correct, but
the shipped surface is lying.

## Root Cause

The brand did not live in one place. It was spread across:

- workspace package names and bin metadata
- local packed tarball install specs
- scaffold templates and fixture generators
- generated file banners and comments
- scenario preparation and plugin adoption flows

A string replace in source files is not enough when the real product is the
packed package plus the generated app it produces.

## Solution

Treat a hard-cut rebrand as a shipped-surface migration, not a text edit.

Update the package identity, install specs, templates, scenario tooling, and
generated output sources together. Then regenerate fixtures and prove the
result through real prepared apps, not just repo searches.

In practice, the honest gate was:

1. rename the package and CLI surface
2. rename internal import paths and neutralize branded code identifiers
3. update scaffold/template sources instead of patching generated apps by hand
4. rebuild the package and any plugin packages
5. regenerate fixtures and run scenario validation against packed installs

## Verification

- `rg` outside `README.md` returned no dead-brand matches
- `bun --cwd packages/kitcn build`
- `bun --cwd packages/resend build`
- `bun run fixtures:sync`
- `bun run fixtures:check`
- `bun run scenario:check -- convex-next-all`
- `bun check`

## Prevention

1. For hard-cut renames, grep is only the first gate. Packed installs and
   scaffolded apps are the real contract.
2. Never hand-patch generated example/plugin output first. Fix the template or
   generator, then regenerate.
3. If a rebrand touches package names, always verify through local tarball
   installs and prepared scenarios.
4. Generated comments and banners count as shipped surface. Kill stale names
   there too.
