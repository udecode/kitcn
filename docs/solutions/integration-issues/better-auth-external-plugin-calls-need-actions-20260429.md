---
title: Better Auth external plugin calls need Convex actions
date: 2026-04-29
category: integration-issues
module: auth-runtime
problem_type: runtime_error
component: authentication
symptoms:
  - `ctx.auth.api.updateOrganization()` fails inside a Convex mutation when the Stripe plugin is installed.
  - Convex throws `Can't use setTimeout in queries and mutations`.
root_cause: wrong_api
resolution_type: documentation_update
severity: high
tags: [auth, better-auth, stripe, convex, actions]
---

# Better Auth external plugin calls need Convex actions

## Problem

Better Auth API endpoints can run plugin hooks in addition to local database
writes. When an endpoint reaches Stripe, Polar, or direct email delivery from a
Convex mutation, the external SDK can call APIs such as `setTimeout` or `fetch`
that Convex mutations do not allow.

## Symptoms

- `auth.api.updateOrganization()` works until `@better-auth/stripe` is present.
- Convex throws `Can't use setTimeout in queries and mutations`.
- The stack points into `stripe/esm/RequestSender.js` or another external SDK.

## What Didn't Work

- Treating `ctx.auth.api.*` as a safe mutation helper for every organization
  write. Some endpoints are DB-only in one plugin set and side-effectful in
  another.
- Creating placeholder provider files or changing adapter write behavior. The
  failure happens before Convex can allow external SDK work in a mutation.

## Solution

Use mutations only for local Convex writes. Use actions for Better Auth
endpoints that may run external plugin work.

For simple organization profile updates, stay local:

```ts
await ctx.orm
  .update(organization)
  .set(data)
  .where(eq(organization.id, input.organizationId));
```

For operations that call Stripe, Polar, or direct email delivery, expose an
`authAction` and bridge back into queries or mutations through generated
callers when local reads or writes are needed.

## Why This Works

Convex mutations are deterministic database transactions. External SDKs are not
allowed there. Actions are the Convex function type designed for external I/O,
and generated callers keep the app code typed when action code needs local data.

## Prevention

- Do not document `ctx.auth.api.*` as universally mutation-safe.
- Prefer `ctx.orm` for simple reads and updates.
- Use `authAction` for user-facing billing, payment, portal, email, and other
  SDK-backed flows.
- When adding auth plugin docs, explicitly classify each example as DB-only
  mutation work or external-I/O action work.

## Related Issues

- `docs/solutions/integration-issues/auth-plugin-timestamp-writes-must-respect-table-schema-20260422.md`
- `docs/solutions/integration-issues/raw-convex-start-auth-adoption-must-patch-start-provider-and-react-client-20260410.md`
