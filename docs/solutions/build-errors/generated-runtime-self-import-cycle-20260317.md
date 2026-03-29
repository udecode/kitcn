title: Generated runtime typing must not depend on _generated api namespace indexing
category: build-errors
tags:
  - codegen
  - generated-runtime
  - typescript
  - callers
  - api
  - self-imports
  - fixtures
symptoms:
  - bun typecheck fails in example, fixtures, or prepared scenario apps with generated runtime type errors
  - generated runtime files fail on `_generated/api` namespace indexing like `api["messages"]["list"]`
  - fresh apps can pass local source checks but fail once scaffolded output is typechecked after packaging
module: codegen-runtime
resolved: 2026-03-17
---

# Generated runtime typing must not depend on _generated api namespace indexing

## Problem

Generated `generated/*.runtime.ts` files were still brittle after the earlier
self-import fix.

Fresh scaffolded apps, committed fixtures, and prepared scenarios could fail
typecheck with errors shaped like:

```text
Property 'server' does not exist on type ...
Element implicitly has an 'any' type because expression of type ... can't be used to index type ...
```

The break showed up most often in committed fixtures and prepared scenario apps,
because they typecheck the generated output the way a real installed package is
used.

## Root Cause

Two brittle assumptions were still in the generated runtime:

1. Runtime entries still treated `_generated/api` namespace indexing as a
   stable type source, for example `api["messages"]["list"]`.
2. That namespace shape is not the contract that should own generated runtime
   typing. It drifts across packaging, fixture normalization, and declaration
   emit in ways that are easy to break.

The older self-import fix solved one loop, but the underlying type source was
still too fragile.

## Solution

Type generated runtime entries from the function name string plus the module
export type. Do not index `_generated/api` at all.

- Add a helper that builds a typed generated function ref directly:

```ts
createGeneratedFunctionReference<
  "query",
  "public",
  typeof import("../messages").list
>("messages:list")
```

- Emit runtime entries from that helper instead of `_generated/api` namespace
  indexing.
- Keep self-calling module typing anchored to the actual exported procedure
  type, not the generated API namespace.

That fixed both the packaging drift and the remaining self-reference seam.

There was one repo-level follow-up too:

- committed `fixtures/*` should not be root workspaces
- validate them through `bun run fixtures:check`, not root `turbo typecheck`
- keep fixture-only tsconfig path normalization in the fixture tooling, not the
  package source

That keeps root typecheck focused on real workspace packages while fixture
verification stays black-box.

## Verification

- `bun test packages/kitcn/src/cli/codegen.test.ts --test-name-pattern 'runtime refs without _generated api namespace indexing'`
- `bun test tooling/fixtures.test.ts`
- `bun --cwd packages/kitcn build`
- `bun install`
- `bun typecheck`
- `bun run fixtures:check`
- `bun lint:fix`
- `bun run scenario:test -- next`
- `bun run scenario:test -- next-auth`

## Prevention

1. Generated runtime typing should come from function names plus exported
   procedure types, not from `_generated/api` namespace shape.
2. Committed fixtures are snapshots, not workspace packages. Keep them out of
   root workspace typecheck and validate them through the fixture runner.
3. Verify codegen changes against a packaged install path and a real scenario
   runtime, not just source tests or string snapshots.
