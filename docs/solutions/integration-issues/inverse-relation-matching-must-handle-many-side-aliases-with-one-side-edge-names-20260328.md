---
title: Inverse relation matching must handle many-side aliases with one-side edge names
category: integration-issues
tags:
  - orm
  - relations
  - auth
  - codegen
  - example
symptoms:
  - `kitcn codegen` fails in `example` with `Multiple relations found from "organization" to "user". Add alias to disambiguate.`
  - auth organization helper relations are already named and aliased sensibly, but the extractor still treats them as ambiguous
  - generated files such as `convex/shared/api.ts` and `generated/plugins/resend.runtime.ts` cannot be recovered until relation extraction succeeds
module: orm-relations
resolved: 2026-03-28
---

# Inverse relation matching must handle many-side aliases with one-side edge names

## Problem

The auth organization helper pattern creates two relations between
`organization` and `user`:

- `organization.usersAsLastActiveOrganization` with alias
  `lastActiveOrganization`
- `organization.usersAsPersonalOrganization` with alias
  `personalOrganization`

The inverse `user` relations are named:

- `user.lastActiveOrganization`
- `user.personalOrganization`

That is a valid and readable schema shape. But the inverse matcher rejected it
as ambiguous, which blocked codegen in `example`.

## Root Cause

Inverse matching only understood two cases:

1. alias-to-alias
2. no-alias-to-no-alias

It did not understand the mixed case where:

- the `many()` side uses an alias for disambiguation
- the inverse `one()` side uses the same string as its edge name instead of
  repeating the alias field

So when the extractor walked from `user.lastActiveOrganization` back to
`organization`, it saw two candidate reverse relations and treated both as
matches.

## Solution

Teach inverse matching one more valid pairing rule:

- alias on one side can match the inverse edge name on the other side

The fixed matcher now accepts all of these:

1. alias-to-alias
2. alias-to-edge-name
3. edge-name-to-alias
4. no-alias-to-no-alias

It also now always requires the candidate reverse edge to point back to the
original source table, even in aliased cases.

## Verification

- `bun test packages/kitcn/src/orm/relations.test.ts`
- `bun --cwd packages/kitcn typecheck`
- `bun --cwd packages/kitcn build`
- `bun lint:fix`
- live recovery:
  - `cd example && bun run codegen`
  - `cd example && bun run typecheck`
  - `cd example && bun run check`

## Prevention

1. Inverse matching logic must model the schema patterns the generator itself
   emits for auth helpers.
2. Relation tests need at least one real auth-style multi-edge case, not just
   toy `author` / `editor` alias examples.
3. If codegen fails on a relation ambiguity, check the extractor before blaming
   the schema text.
