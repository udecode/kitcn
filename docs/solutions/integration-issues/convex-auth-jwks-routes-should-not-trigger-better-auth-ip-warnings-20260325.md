---
title: Convex auth JWKS routes should not trigger Better Auth IP warnings
category: integration-issues
tags:
  - auth
  - better-auth
  - convex
  - dev
  - jwks
  - logs
symptoms:
  - local `kitcn dev` logs repeated Better Auth warnings about missing client IP address
  - the warning comes from `GET /api/auth/convex/jwks`
  - local auth bootstrap works, but startup logs look broken and noisy
module: auth-runtime
resolved: 2026-03-25
---

# Convex auth JWKS routes should not trigger Better Auth IP warnings

## Problem

Local kitcn auth apps were logging this warning during normal startup
and token verification:

```txt
Rate limiting skipped: could not determine client IP address.
```

The noisy route was the Convex Better Auth JWKS endpoint:

```txt
GET /api/auth/convex/jwks
```

That made local auth look broken even when everything actually worked.

## Root Cause

This warning was not coming from kitcn ratelimit.

It came from Better Auth's built-in rate limiter. The Convex auth runtime asks
Better Auth to serve public JWKS and OIDC metadata routes, and local/runtime
fetches for those routes can legitimately arrive without a client IP.

There were two seams:

1. kitcn was not marking Convex-owned metadata routes as
   non-rate-limited by default.
2. Better Auth resolves the client IP before it evaluates
   `rateLimit.customRules`, so `"/convex/jwks": false` alone does not suppress
   the warning when the request arrives without `x-forwarded-for`.

## Solution

Fix both seams.

First, apply kitcn auth defaults when the generated auth runtime
assembles Better Auth options. Disable Better Auth rate limiting for
Convex-owned public/internal metadata routes:

- `/convex/.well-known/openid-configuration`
- `/convex/jwks`
- `/convex/latest-jwks`
- `/convex/rotate-keys`

Keep user overrides authoritative by merging defaults first, then user
`rateLimit.customRules` on top.

Second, patch `registerRoutes(...)` so local Convex auth metadata requests
under `/api/auth/convex/*` get a synthetic
`x-forwarded-for: 127.0.0.1` when they are served from local hosts and the
header is missing.

That prevents the false warning at the real HTTP bridge, where Better Auth
actually computes the client IP.

## Verification

- `bun test packages/kitcn/src/auth/generated-contract.test.ts`
- `bun test packages/kitcn/src/auth/registerRoutes.test.ts`
- `bun --cwd packages/kitcn typecheck`
- `bun --cwd packages/kitcn build`

Probe confirmation from the real auth runtime:

- `runtime.getAuth({}).$context.rateLimit.customRules["/convex/jwks"] === false`

Bridge confirmation from the route adapter:

- local `GET /api/auth/convex/jwks` requests with no `x-forwarded-for` reach
  Better Auth with `x-forwarded-for: 127.0.0.1`

## Prevention

1. If kitcn exposes auth routes that are public metadata or server-only
   maintenance endpoints, do not leave them on generic Better Auth rate-limit
   behavior by accident.
2. Put auth runtime defaults at the generated auth assembly seam so existing
   apps inherit the fix without editing their scaffolded `auth.ts`.
3. If Better Auth warnings still mention missing client IP after route-specific
   rate-limit overrides, check whether IP resolution happens before rule
   matching.
4. For local Convex bridge requests, patch the forwarded-IP header at the HTTP
   adapter instead of teaching every app to customize auth logging.

## Files Changed

- `packages/kitcn/src/auth/generated-contract.ts`
- `packages/kitcn/src/auth/generated-contract.test.ts`
- `packages/kitcn/src/auth/registerRoutes.ts`
- `packages/kitcn/src/auth/registerRoutes.test.ts`
