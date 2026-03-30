---
title: Combined plugin scenario strict function types failure
category: integration-issues
tags:
  - convex
  - scenarios
  - typescript
  - variance
  - schema
  - plugins
symptoms:
  - combined auth, ratelimit, and resend scaffolds pass package tests but fail in generated scenario apps
  - convex/functions/tsconfig.json fails while the app root tsconfig still passes
  - resend relation extensions stop satisfying AnySchemaExtension under strict function variance
  - scaffolded http routes reject plugin middleware in generated apps
module: plugin-scenarios
resolved: 2026-03-17
---

# Combined plugin scenario strict function types failure

## Problem

The new combined Convex scenario for `ratelimit -> auth -> resend` looked fine
in package-local tests, but the generated app still failed once the Convex
functions project ran its own strict typecheck.

That made the branch look "mostly green" while the real generated consumer path
was still broken.

## Root Cause

The main break was variance, not resend itself.

`packages/kitcn/src/orm/extensions.ts` used a fake bivariant callback
type that stopped being assignable under `strictFunctionTypes`. Relation-bearing
schema extensions created through a wrapper function no longer satisfied
`AnySchemaExtension`, so the combined resend extension blew up inside
`convex/functions/tsconfig.json`.

That exposed two more integration cracks:

1. the schema planner could nest `.extend(...)` calls incorrectly when several
   plugins touched the same root schema line
2. generated ratelimit and resend scaffolds still carried stricter assumptions
   than the combined scenario actually guarantees

## Solution

Make the callback truly bivariant with method syntax:

```ts
type BivariantCallback<TCallback extends (...args: any[]) => unknown> = {
  bivarianceHack(...args: Parameters<TCallback>): ReturnType<TCallback>;
}["bivarianceHack"];
```

Then clean up the integration edges the new scenario exposed:

1. rewrite schema extension insertion so chained plugin installs produce one
   ordered `.extend(ratelimitExtension(), authExtension(), resendExtension())`
   call instead of malformed nesting
2. remove the ratelimit scaffold's `session` type dependency and use session
   network signals directly from `ctx`
3. export resend's relation-bearing schema extension through a named constant so
   generated apps keep a stable, typed extension value
4. widen `HttpProcedureBuilder.use()` to accept plugin middleware in the same
   way the query and action builders already do

## Verification

- `bun test packages/kitcn/src/cli/cli.commands.ts --test-name-pattern "resend|keeps schema extensions in one ordered extend call"`
- `bun test packages/kitcn/src/orm/schema-integration.test.ts`
- `bun --cwd packages/kitcn typecheck`
- `bun tooling/scenarios.ts check convex-next-all`

## Prevention

1. When a helper claims to accept "any callback", verify it under
   `strictFunctionTypes`, not just the package tsconfig.
2. Scenario coverage should exercise generated consumer tsconfigs, not only root
   app typecheck.
3. If a plugin stack only fails in `convex/functions/tsconfig.json`, suspect
   variance or generated contract drift before blaming the scaffolded app code.

## Files Changed

- `packages/kitcn/src/orm/extensions.ts`
- `packages/kitcn/src/cli/registry/planner.ts`
- `packages/kitcn/src/cli/registry/items/ratelimit/ratelimit-plugin.template.ts`
- `packages/kitcn/src/cli/registry/items/resend/resend-schema.template.ts`
- `packages/kitcn/src/server/http-builder.ts`
