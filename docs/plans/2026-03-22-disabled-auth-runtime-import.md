# 2026-03-22 disabled auth runtime import

## Goal

Fix plain non-auth scenario runtime so generated auth code does not pull the
full Better Auth runtime into apps that do not use auth.

## Plan

1. Reproduce the plain `next` runtime error and trace the generated import
   graph.
2. Add failing codegen tests for disabled auth output.
3. Split a cold disabled auth export path out of the package.
4. Regenerate fixtures and verify with live scenario runtime.

## Progress

- 2026-03-22: reproduced the plain `next` Concave runtime error from
  `convex/functions/generated/auth.ts` pulling `kitcn/auth`, which
  reached Better Auth runtime code even with auth disabled.
- 2026-03-22: added failing codegen and integration assertions for disabled
  auth output to import `kitcn/auth/generated` instead of the full auth
  surface.
- 2026-03-22: added a cold `auth/generated` export, moved disabled auth runtime
  helpers into a separate module, and pointed disabled codegen output at that
  path.
- 2026-03-22: verified targeted codegen tests, package build, fixture sync,
  and live `bun run scenario:test -- next`.
- 2026-03-22: `bun typecheck` and `bun tooling/fixtures.ts check next
  --backend concave` are still blocked by the standing generated runtime type
  errors in committed template output, plus Bun still warns about
  `@better-auth/core` wanting `@opentelemetry/api` when auth fixtures install.
