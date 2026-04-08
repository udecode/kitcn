---
title: Parse-time cRPC builder stubs must implement paginated query chains
date: 2026-04-08
category: integration-issues
module: cli-codegen
problem_type: integration_issue
component: tooling
symptoms:
  - `kitcn codegen` aborts when a query chains `.input(...).paginated(...)`
  - generated-server placeholder imports can expose `.input()` but still throw on `.paginated()`
  - pagination metadata like `limit` disappears from generated API output when parse-time stubs do not track builder state
root_cause: logic_error
resolution_type: code_fix
severity: high
tags:
  - codegen
  - crpc
  - paginated
  - generated-server
  - parser-shim
  - stubs
---

# Parse-time cRPC builder stubs must implement paginated query chains

## Problem

`kitcn codegen` parses user modules through fake cRPC builders in bootstrap and
parse-time flows.

Those stubs exposed `.input()` but did not implement `.paginated()`, so valid
query chains could die during module parsing even though the real runtime
builder supported them.

## Symptoms

- `kitcn codegen aborted because module parsing failed`
- errors like `.paginated is not a function` from query exports that follow the
  documented cRPC pattern
- generated API metadata missing `limit` for paginated queries when a stub path
  did not preserve builder state

## What Didn't Work

- blaming Windows; the failure lived in package-owned parse-time stubs
- fixing only the real runtime builder; runtime was already correct
- patching only one fake builder copy; codegen used multiple stubbed builder
  paths

## Solution

Replace the duplicated fake-builder snippets with one shared package-owned stub
source, and make that shared stub carry builder state plus the full
parse-time chain surface:

```ts
const createProcedureBuilder = (state: Record<string, unknown> = {}) => ({
  input() {
    return createProcedureBuilder(state);
  },
    paginated(options = undefined) {
      return createProcedureBuilder({
        ...state,
        meta:
        typeof options?.limit === "number"
          ? {
              ...toMetaObject(state.meta),
              limit: options.limit,
            }
          : state.meta,
    });
  },
    query(handler = undefined) {
      return {
        _crpcMeta: {
          type: "query",
        internal: (state.internal as boolean | undefined) ?? false,
        ...toMetaObject(state.meta),
      },
      _handler: handler,
    };
  },
});
```

Use that one shared stub source in every parse-time path:

- project parse shim in `project-jiti`
- generated/server placeholder emitted by `codegen`
- backend bootstrap generated-server stub

Lock it with a codegen regression that imports `../generated/server`, builds a
`publicQuery.input(...).paginated(...)` chain, and asserts generated API output
keeps `{ limit: 40, type: "query" }`.

## Why This Works

The bug lived in the fake builder contract, not the real builder contract.

Codegen does not always load the full runtime builder graph. In bootstrap and
parse-time flows it uses lightweight stubs so imports stay cheap and safe. Once
those stubs drift from the real chain surface, perfectly valid user code starts
failing during parsing.

Adding `.paginated()` alone would stop the throw, but it would still leave the
same drift trap in place. The real fix is one shared stub contract plus builder
state propagation, so metadata like `limit`, `internal`, and chained `meta()`
values survive until the exported procedure object is materialized.

## Prevention

- Treat parse-time builder stubs as a supported public surface, not throwaway
  scaffolding
- Keep one shared stub source for parse-time builder behavior; do not hand-copy
  the builder contract into multiple files again
- Keep codegen regressions focused on actual export chains, not only direct
  helper imports

## Related Issues

- `docs/solutions/integration-issues/bunx-kitcn-self-resolution-must-not-break-scaffold-codegen-20260407.md`
- `packages/kitcn/src/cli/codegen.test.ts`
- `packages/kitcn/src/cli/utils/project-jiti.ts`
