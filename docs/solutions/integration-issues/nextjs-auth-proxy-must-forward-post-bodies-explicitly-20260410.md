---
title: Next.js auth proxy must forward POST bodies explicitly
date: 2026-04-10
category: integration-issues
module: auth-nextjs
problem_type: integration_issue
component: authentication
symptoms:
  - POST auth requests fail with `TypeError: fetch failed`
  - the nested cause is `expected non-null body source`
  - Next.js route handlers return a generic 500 instead of the upstream Better Auth error response
root_cause: wrong_api
resolution_type: code_fix
severity: high
tags:
  - auth
  - nextjs
  - better-auth
  - undici
  - proxy
  - request-body
---

# Next.js auth proxy must forward POST bodies explicitly

## Problem

The `kitcn/auth/nextjs` proxy rebuilt a `Request` from the incoming Next.js
request and passed that forwarded `Request` into `fetch()`.

That looked fine for happy paths, but Node's undici runtime blows up on POST
error paths when the forwarded request body came from another `Request`.

## Symptoms

- `POST /api/auth/sign-in/email` returns 500 instead of the upstream 401 JSON
- server logs show `TypeError: fetch failed`
- the nested cause is `Error: expected non-null body source`

## What Didn't Work

- assuming `fetch(newRequest, { method, redirect: "manual" })` was safe because
  the new request already held the transferred body
- assuming dropping `init.method` was enough; `fetch(newRequest, { redirect:
  "manual" })` still fails in Node when `newRequest` was built from another
  POST request
- relying only on mocked fetch tests; the bug only showed itself in the real
  Node/undici path

## Solution

Stop passing a forwarded `Request` object to `fetch()` for non-GET auth proxy
requests.

Instead:

1. clone headers into a fresh `Headers`
2. rewrite `host` and `accept-encoding`
3. read the incoming body as an `ArrayBuffer` for non-`GET`/`HEAD`
4. call `fetch(nextUrl, { method, headers, body, redirect: "manual" })`

```ts
const handler = async (request: Request, siteUrl: string) => {
  const requestUrl = new URL(request.url);
  const nextUrl = `${siteUrl}${requestUrl.pathname}${requestUrl.search}`;
  const headers = new Headers(request.headers);

  headers.set("accept-encoding", "application/json");
  headers.set("host", new URL(siteUrl).host);

  const body =
    request.method !== "GET" && request.method !== "HEAD"
      ? await request.arrayBuffer()
      : undefined;

  return fetch(nextUrl, {
    body,
    headers,
    method: request.method,
    redirect: "manual",
  });
};
```

Lock it with two regressions:

- a unit test that asserts the proxy forwards URL, headers, method, and body
  through explicit fetch init
- a Node/Vitest integration test that exercises a POST auth error response and
  proves the 401 JSON survives

## Why This Works

The bug was not about Better Auth's error payload. It was about how undici
handles body ownership.

`new Request(nextUrl, request)` transfers the original body stream into the new
request. Passing that forwarded request back into undici fetch leaves it holding
an already-transferred stream shape that cannot be re-used safely on the real
POST path.

Reading the body into an `ArrayBuffer` before the outgoing fetch gives undici a
concrete body source instead of a transferred stream wrapper. Using the target
URL plus explicit init also avoids depending on subtle request-cloning behavior
inside the runtime.

## Prevention

- In Node/Next.js proxy code, do not assume `fetch(forwardedRequest)` is safe
  when `forwardedRequest` was built from another POST request
- Test auth proxies against non-2xx POST responses, not only successful auth
  flows
- Keep one real Node/undici regression around this seam; bun-only mocks will
  miss it

## Related Issues

- Issue: https://github.com/udecode/kitcn/issues/197
- `docs/solutions/integration-issues/better-auth-mutation-error-handling.md`
