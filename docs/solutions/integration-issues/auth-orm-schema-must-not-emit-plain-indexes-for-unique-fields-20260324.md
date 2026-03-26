---
title: Auth ORM schema must not emit plain indexes for unique fields
problem_type: integration_issue
component: authentication
root_cause: logic_error
tags:
  - auth
  - orm
  - schema
  - indexes
  - convex
severity: high
symptoms:
  - local Convex push fails with `IndexNotUnique`
  - auth scaffold generates both `token` and `session_token_unique` indexes
  - bootstrap-heavy auth scenarios fail while evaluating schema
---

# Auth ORM schema must not emit plain indexes for unique fields

## Problem

The Better Auth ORM schema generator emitted a normal index for fields that were
already declared with `.unique()`.

For the session table that produced both:

- `session_token_unique`
- `token`

Convex rejects that because both indexes cover the same field set.

## Root cause

The ORM generator reused the generic Better Auth "special fields" index logic
from the raw Convex schema generator.

That logic is fine for plain `defineTable(...)` output, where `unique` does not
materialize an index for you. It is wrong for ORM output, where `.unique()`
already creates the unique backing index.

## Fix

Skip auto-generated plain indexes for unique fields in
`createSchemaOrm(...)`.

Keep manual indexes and non-unique sortable/reference indexes. Only the
redundant unique-field mirror index gets dropped.

## Verification

- targeted `create-schema-orm` test proving `session.token` keeps `.unique()`
  but does not also emit `index("token").on(sessionTable.token)`
- live `bun run scenario:test -- convex-vite-auth-bootstrap`

## Takeaways

1. Raw Convex schema generation and ORM schema generation look similar, but
   they do not share the same index semantics.
2. If a field already owns uniqueness at the column builder level, adding a
   second plain index is just self-inflicted schema drift.
