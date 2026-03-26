# Jwks One-Pass Auth Scaffold

## Goal
Make managed `add auth` generate and own the `jwks` table on the first pass, not only after a rerun.

## Plan
- [completed] Find the exact bootstrap-order seam and write a failing test first.
- [completed] Fix managed auth fallback options so first-run schema generation matches scaffolded auth runtime.
- [completed] Verify with targeted tests, fixture check, and scenario runtime proof.

## Findings
- `buildAuthSchemaRegistrationPlanFile()` reads `<functionsDir>/auth.ts` when it exists.
- On first install, that file does not exist yet, so it falls back to default managed auth scaffold options.
- The old fallback duplicated a fake local `customJwt` provider with `http://localhost:3211`, which was enough to get `jwks` but was still the wrong source of truth.
- The actual scaffolded `next-auth` runtime does include `convex({ authConfig, jwks })`, so the first-pass fallback is lying.

## Progress
- Loaded relevant skills and traced the regression to auth fallback/bootstrap order.

- Fixed first-pass managed auth fallback so `jwks` is claimed immediately.
- Replaced the fake localhost runtime-shaped fallback with a schema-only provider from the auth-config helper, backed by a sentinel `https://convex.invalid` site URL.
- Fixed auth demo callback/session gating so `scenario:test -- next-auth` reaches the signed-in UI.
