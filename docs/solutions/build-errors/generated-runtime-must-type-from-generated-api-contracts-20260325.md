---
title: Generated runtime refs must type from Convex generated api contracts
category: build-errors
tags:
  - codegen
  - generated-runtime
  - typescript
  - self-imports
  - example
  - verify
symptoms:
  - example typecheck fails with TS7022, TS2456, and TS2577 in generated runtime files
  - self-calling modules like organization, ratelimitDemo, or todoInternal poison their own generated runtime types
  - bun run check fails before verify even runs because generated callers and handlers collapse into circular any
module: codegen-runtime
resolved: 2026-03-25
---

# Generated runtime refs must type from Convex generated api contracts

## Problem

Generated module runtime files regressed back into a self-import cycle.

They emitted refs like:

```ts
createGeneratedFunctionReference<
  "query",
  "public",
  typeof import("../organization").listOrganizations
>("organization:listOrganizations");
```

That looks clean until the source module also imports its own generated runtime
to do intra-module calls with `createOrganizationHandler(ctx)`.

Then TypeScript walks this loop:

1. `organization.ts` imports `generated/organization.runtime.ts`
2. `organization.runtime.ts` asks for `typeof import("../organization").listOrganizations`
3. `listOrganizations` infers its return type from code that calls
   `createOrganizationHandler(ctx)`
4. `createOrganizationHandler` depends on `typeof procedureRegistry`
5. `procedureRegistry` is still being inferred

Result: circular type aliases and implicit-`any` fallout across the module.

## Root Cause

The regression moved generated runtime typing back onto the source module's own
export types.

That is fine for modules that never import their generated runtime. It fails for
the exact pattern kitcn recommends for same-module server-side calls.

The stable type source is not the source module. It is Convex's generated API
contract under `_generated/api`.

## Solution

Type runtime refs from the app's generated Convex API surface instead of the
source module export:

```ts
import type {
  api as generatedApi,
  internal as generatedInternal,
} from "../_generated/api";

createGeneratedFunctionReference<
  "query",
  "public",
  typeof generatedApi["organization"]["listOrganizations"]
>("organization:listOrganizations");
```

Keep the lazy runtime resolver on `require("../organization")` so the module is
still loaded on demand, but stop asking TypeScript to infer that module's own
export type inside the generated runtime.

That breaks the self-cycle cleanly while preserving typed callers and handlers.

## Verification

- `bun test packages/kitcn/src/cli/codegen.test.ts`
- `bun --cwd packages/kitcn build`
- `bun --cwd packages/kitcn typecheck`
- `cd example && bun run codegen`
- `cd example && bun run typecheck`
- `cd example && bun run check`

## Prevention

1. Generated module runtimes must never type refs from `typeof import("../same-module").export`.
2. For runtime refs, prefer Convex's generated API contract over source-module export inference.
3. Any codegen change touching generated runtime typing needs proof against a self-calling module and a real app like `example`.
