---
title: Next.js auth proxy must forward OPTIONS preflight
date: 2026-05-22
category: integration-issues
module: auth-nextjs
problem_type: integration_issue
component: authentication
symptoms:
  - cross-origin Better Auth clients need `OPTIONS /api/auth/*` preflight support
  - the generated Next.js auth route only exported `GET` and `POST`
  - users had to wrap `handler.GET` and `handler.POST` manually to add preflight
root_cause: wrong_api
resolution_type: code_fix
severity: medium
tags: [auth, nextjs, better-auth, cors, preflight, options, convex, proxy]
---

# Next.js auth proxy must forward OPTIONS preflight

## Problem

The `kitcn/auth/nextjs` proxy only exposed `GET` and `POST`. That forced
cross-origin clients, such as local WebViews, to add a custom Next.js
`OPTIONS` handler even though the Convex auth route already owned CORS policy.

## Symptoms

- `convex/functions/http.ts` had `registerRoutes(http, getAuth, { cors })`.
- Better Auth `trustedOrigins` included the cross-origin app origin.
- The Next.js route still needed manual preflight code because
  `export const { GET, POST } = handler` left `OPTIONS` unhandled.

## What Didn't Work

- Duplicating CORS decisions in the Next.js route is the wrong ownership. The
  Convex-side `registerRoutes` helper already combines Better Auth trusted
  origins with explicit allowed origins.
- Treating a deployment-wide generic Convex HTTP 500 as this proxy bug is also
  wrong. If a bare `/_debug-auth` HTTP action returns the same generic 500
  before handler logs, the failure is below KitCN's Better Auth handler.

## Solution

Expose `OPTIONS` from the Next.js proxy and forward it to the Convex site URL.
Do not attach an empty request body to preflight.

```ts
const requestCanHaveBody = (method: string) =>
  method !== "GET" && method !== "HEAD" && method !== "OPTIONS";

const nextJsHandler = (siteUrl: string) => ({
  GET: (request: Request) => handler(request, siteUrl),
  OPTIONS: (request: Request) => handler(request, siteUrl),
  POST: (request: Request) => handler(request, siteUrl),
});
```

Generated Next.js auth routes should export all three methods:

```ts
import { handler } from "@/lib/convex/server";

export const { GET, POST, OPTIONS } = handler;
```

## Why This Works

The Next.js route is only a proxy. Forwarding `OPTIONS` lets Convex's HTTP
router answer preflight with the same `registerRoutes` CORS configuration that
answers direct Convex auth requests.

Keeping preflight bodyless avoids subtle fetch/runtime behavior around methods
that do not need a body.

## Prevention

1. When adding a server-side auth proxy, expose every method needed by browser
   CORS, not just the methods Better Auth uses for real work.
2. Keep CORS allow-list decisions at one layer. For KitCN auth, that layer is
   Convex `registerRoutes`, not the Next.js proxy.
3. Test the public `convexBetterAuth(...).handler` surface for `OPTIONS`
   forwarding and generated route templates for `GET, POST, OPTIONS`.

## Related Issues

- [Next.js auth proxy must forward POST bodies explicitly](/Users/zbeyens/git/better-convex/docs/solutions/integration-issues/nextjs-auth-proxy-must-forward-post-bodies-explicitly-20260410.md)
- [Convex auth JWKS routes should not trigger Better Auth IP warnings](/Users/zbeyens/git/better-convex/docs/solutions/integration-issues/convex-auth-jwks-routes-should-not-trigger-better-auth-ip-warnings-20260325.md)
