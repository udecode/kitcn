## Issue

- Source: GitHub issue #197
- Title: Next.js auth proxy crashes with `expected non-null body source` on POST error responses
- Type: bug
- Scope: `packages/kitcn` package runtime

## Summary

The `auth/nextjs` handler rebuilds a `Request` and then calls `fetch()` with an
override `init`. For POST requests, that can detach the transferred body stream
and explode before Better Auth's error response is forwarded.

## Acceptance

- POST auth requests do not crash when upstream returns a non-2xx response
- The proxied response is returned as-is
- Existing URL/header rewrite behavior stays intact

## Chosen Seam

- Fix `packages/kitcn/src/auth-nextjs/index.ts`
- Add regression coverage in `packages/kitcn/src/auth-nextjs/index.test.ts`

## Verification

- Targeted bun test for `auth-nextjs`
- `bun run lint:fix`
- `bun run typecheck`
- `bun --cwd packages/kitcn build`

## Release Artifacts

- Update active unreleased changeset in `.changeset/few-planes-confess.md`
