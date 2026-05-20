---
title: Resend scaffold optional env reads must be lazy and table names must match schema keys
date: 2026-05-20
last_updated: 2026-05-20
category: integration-issues
module: kitcn resend scaffold
problem_type: integration_issue
component: tooling
symptoms:
  - "`kitcn add resend` apps send `Bearer undefined` or an invalid Resend API key even when `RESEND_API_KEY` is configured."
  - "Convex dashboard shows Resend table-name drift between camelCase schema keys and snake_case ORM writes."
  - "A direct optional env read fix makes Convex codegen fail with `Environment variable RESEND_API_KEY is used in auth config file but its value was not set`."
root_cause: logic_error
resolution_type: code_fix
severity: high
tags: [resend, env, getenv, auth-config, schema-extension, scenarios]
---

# Resend scaffold optional env reads must be lazy and table names must match schema keys

## Problem

Resend looked configured, but queued emails never reached Resend because the
scaffolded plugin could resolve `RESEND_API_KEY` as missing. The same scaffold
also used snake_case `convexTable(...)` names while registering camelCase schema
extension keys, so generated Convex schema tables and ORM table targets could
drift apart.

## Symptoms

- Resend returns `{"statusCode":401,"name":"validation_error","message":"API key is invalid"}`.
- Direct `process.env.RESEND_API_KEY` reads work, but `getEnv().RESEND_API_KEY`
  can still be `undefined`.
- Changing only the Resend table literals to camelCase makes the table drift go
  away, but does not fix email sending.
- A naive generated-helper fix that direct-reads every optional schema key makes
  `convex-next-all` fail during `kitcn codegen`:

```text
Environment variable RESEND_API_KEY is used in auth config file but its value was not set.
```

## What Didn't Work

- Reading optional Resend keys directly while building the whole env object.
  That fixes hidden Convex env proxies for Resend, but it also makes
  `auth.config.ts` import `getEnv()` and touch `RESEND_API_KEY` during Convex's
  auth config scanner.
- Changing only the Resend table names. That fixes the schema/ORM table target
  mismatch, but leaves the API key path broken.
- Making Resend plugin scaffolds use `process.env` directly. That violates the
  plugin scaffold contract and spreads env ownership out of `getEnv()`.

## Solution

Add an explicit `createEnv({ readOptionalRuntimeEnv })` opt-in, but make those
reads lazy. The env helper can advertise which optional keys may need direct
runtime proxy access without reading those keys while unrelated callers ask for
other env values.

```ts
export const getEnv = createEnv({
  readOptionalRuntimeEnv: [
    "RESEND_API_KEY",
    "RESEND_WEBHOOK_SECRET",
    "RESEND_FROM_EMAIL",
  ],
  schema: envSchema,
});
```

`createEnv()` should only read a marked optional key immediately if normal
presence checks prove the key exists. Otherwise define a getter on the parsed env
result, so `getEnv().JWKS` does not read Resend keys, but
`getEnv().RESEND_API_KEY` still resolves through Convex's runtime env proxy.

Also keep extension keys and physical table names aligned:

```ts
export const resendEmailsTable = convexTable("resendEmails", {
  // ...
});

export function resendExtension() {
  return defineSchemaExtension("resend", {
    resendEmails: resendEmailsTable,
  });
}
```

## Why This Works

Convex can expose runtime env values through an object where direct property
access works but `hasOwn`, property descriptors, or `in` checks do not prove the
optional key exists. `createEnv()` avoids blind optional reads because Convex's
auth config scanner treats `process.env.X` access as an env requirement.

Lazy getters split those concerns:

1. auth config reads only the auth env value it needs
2. Resend reads Resend env only inside Resend plugin paths
3. hidden runtime env proxies still work when the optional key is actually used

The table fix works because `defineSchemaExtension()` injects tables by object
key, while ORM writes use the table object's `tableName`. Those names must agree
for generated schema, Convex data model, and ORM calls to hit the same table.

## Prevention

- When fixing optional env reads, verify the combined auth + plugin scenario,
  not just the isolated package tests.
- Add tests for hidden env proxies where direct property access works but
  `hasOwn`, descriptors, and `in` checks all fail.
- Add rerun tests for valid but noncanonical scaffold formatting. A string
  inserter that only matches freshly generated code can silently leave existing
  apps broken.
- Make source scanners comment-aware. Braces inside comments should not end the
  `createEnv({ ... })` object before existing options are inspected.
- Fail loudly when an existing helper uses a non-literal
  `readOptionalRuntimeEnv` value. Duplicating the option lets JavaScript keep
  the later property, and partially rewriting spread/asserted arrays can discard
  existing plugin keys.
- Include defaulted optional keys in proxy-read tests. Otherwise Zod defaults can
  hide a real runtime value behind Convex's env proxy.
- Add a test that `getEnv().JWKS` does not read `RESEND_API_KEY` when both auth
  and Resend env fields share the same helper.
- For plugin schema extensions, assert `convexTable("<name>")` literals match
  the extension keys that register those tables.
- Run `bun run scenario:check -- convex-next-all` for auth/ratelimit/resend
  scaffold changes.

## Related Issues

- [Combined plugin scenario strict function types](/Users/zbeyens/git/better-convex/docs/solutions/integration-issues/combined-plugin-scenario-strict-function-types-20260317.md)
- [Concave codegen must load root .env for parse-time module imports](/Users/zbeyens/git/better-convex/docs/solutions/integration-issues/concave-codegen-must-load-root-env-for-parse-time-modules-20260408.md)
- [Published @kitcn/resend packages must self-build before pack](/Users/zbeyens/git/better-convex/docs/solutions/integration-issues/published-resend-package-must-self-build-before-pack-20260401.md)
