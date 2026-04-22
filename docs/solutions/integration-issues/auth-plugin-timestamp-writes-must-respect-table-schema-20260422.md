---
title: Auth plugin timestamp writes must respect table schema
date: 2026-04-22
category: integration-issues
module: auth-adapter
problem_type: integration_issue
component: authentication
symptoms:
  - Better Auth Stripe subscription upgrade fails with Convex schema validation
  - Convex reports extra `createdAt` or `updatedAt` on the `subscription` table
  - `@better-auth/stripe` writes `updatedAt` even though its subscription schema omits it
root_cause: wrong_api
resolution_type: code_fix
severity: high
tags: [auth, better-auth, stripe, subscriptions, timestamps, schema]
---

# Auth plugin timestamp writes must respect table schema

## Problem

Stripe subscription flows can write timestamp fields that the Stripe plugin's
own Better Auth schema does not define. Convex rejects those writes when the
generated `subscription` table omits `createdAt` and `updatedAt`.

## Symptoms

- `/api/auth/subscription/upgrade` fails during Better Auth Stripe upgrade.
- Convex throws an extra-field validator error for `createdAt` or `updatedAt`.
- The failure happens before subscription state can be patched.

## What Didn't Work

- Treating `createdAt` and `updatedAt` as universal auth fields. Core Better
  Auth tables use them, but plugin tables do not always opt in.
- Looking only at core Better Auth tables. `@better-auth/stripe` lives in a
  separate package and its `subscription` schema has no timestamp fields.

## Solution

Resolve the concrete write field set for the target model before auth writes.
Use the Convex table validator when available, then fall back to the Better Auth
schema. Only synthesize or preserve auth timestamp fields when that target table
defines them.

```ts
const stripUnsupportedAuthTimestamps = (
  data: Record<string, unknown>,
  schema: Schema,
  betterAuthSchema: any,
  model: string
) => {
  const writeFields = resolveWriteFields(schema, betterAuthSchema, model);
  if (!writeFields) {
    return data;
  }

  let result: Record<string, unknown> | undefined;
  for (const field of ["createdAt", "updatedAt"] as const) {
    if (field in data && !writeFields.has(field)) {
      result ??= { ...data };
      delete result[field];
    }
  }

  return result ?? data;
};
```

Cover both paths:

- creates should not inject timestamps into plugin tables without those fields
- updates should strip unsupported `updatedAt` before `ctx.db.patch()` or ORM
  `set()`

## Why This Works

The generated auth runtime is the last boundary before Convex validates the
document. Filtering there fixes db and ORM writes without hiding arbitrary schema
mistakes: only the known auth timestamp fields get special treatment.

## Prevention

- When adding auth plugin support, inspect the plugin package's schema, not only
  Better Auth core tables.
- Add regression tests for plugin tables that intentionally omit core auth
  fields.
- Do not assume `createdAt` and `updatedAt` are universal across auth plugin
  tables.

## Related Issues

- [Better Auth 1.6 support needs structural Convex auth wrappers](./better-auth-1-6-support-needs-structural-convex-auth-wrappers-20260416.md)
- [Convex Better Auth upstream sync must filter runtime fixes from repo churn](./convex-better-auth-upstream-sync-runtime-fixes-20260416.md)
- [Root auth schema sync should merge missing fragments into local tables](./root-auth-schema-sync-should-merge-missing-fragments-into-local-tables-20260328.md)
