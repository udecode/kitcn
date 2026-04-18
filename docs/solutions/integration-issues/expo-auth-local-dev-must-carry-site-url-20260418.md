---
title: Expo auth local dev must carry EXPO_PUBLIC_SITE_URL through the Concave dev contract
date: 2026-04-18
category: integration-issues
module: expo auth local dev
problem_type: integration_issue
component: authentication
symptoms:
  - Expo auth POSTs return `INVALID_ORIGIN` on the local Concave site proxy
  - `kitcn dev` logs load `convex/.env` and `.env.local`, but Better Auth still trusts `http://localhost:3000`
  - prepared `expo-auth` scenarios can fail the auth smoke even when `convex/.env` and `convex/lib/get-env.ts` both say `http://localhost:3005`
root_cause: incomplete_setup
resolution_type: code_fix
severity: high
tags: [expo, auth, concave, site-url, local-dev, invalid-origin]
---

# Expo auth local dev must carry EXPO_PUBLIC_SITE_URL through the Concave dev contract

## Problem

Expo auth parity looked correct on paper, but local runtime still failed with
`INVALID_ORIGIN`. The backend auth config used the right `SITE_URL` in generated
files, yet `kitcn dev` quietly booted Concave with the wrong frontend origin.

## Symptoms

- `POST http://127.0.0.1:3211/api/auth/sign-up/email` returns:

  ```json
  {"message":"Invalid origin","code":"INVALID_ORIGIN"}
  ```

- inspecting the live request path showed Better Auth trusted:
  - `http://127.0.0.1:3211`
  - `http://localhost:3000`
- the prepared scenario app still had:
  - `convex/.env` `SITE_URL=http://localhost:3005`
  - `convex/lib/get-env.ts` default `http://localhost:3005`

## What Didn't Work

- Blaming Better Auth origin matching first.
  Direct `betterAuth(authDef({}))` requests with the same origin passed.
- Blaming forwarded host or proxy URL rewriting first.
  The real failure was not the proxy host alone; it was the frontend site URL
  contract drifting back to `3000`.
- Fixing only `convex/.env`.
  `kitcn dev` was still computing the Concave frontend origin from `.env.local`,
  and Expo had no `EXPO_PUBLIC_SITE_URL` key there.

## Solution

Make Expo own the same explicit site-url contract as the other app shells:

1. add `EXPO_PUBLIC_SITE_URL=http://localhost:3000` to the Expo init env
   template
2. teach `resolveConcaveLocalSiteUrl()` to read `EXPO_PUBLIC_SITE_URL`
3. teach `patchPreparedLocalDevPort()` to rewrite `EXPO_PUBLIC_SITE_URL` for
   prepared scenario apps

Key change shape:

```ts
const INIT_EXPO_ENV_DEFAULTS = {
  EXPO_PUBLIC_CONVEX_URL: "http://127.0.0.1:3210",
  EXPO_PUBLIC_CONVEX_SITE_URL: "http://127.0.0.1:3211",
  EXPO_PUBLIC_SITE_URL: "http://localhost:3000",
} as const;
```

```ts
return (
  parsed.NEXT_PUBLIC_SITE_URL ??
  parsed.EXPO_PUBLIC_SITE_URL ??
  parsed.VITE_SITE_URL ??
  "http://localhost:3000"
);
```

```ts
if (EXPO_PUBLIC_SITE_URL_ENV_RE.test(envLocalSource)) {
  envEntries.EXPO_PUBLIC_SITE_URL = localDevSiteUrl;
}
```

## Why This Works

The auth failure was not in the generated Better Auth definition. It was in the
local dev contract that feeds Concave:

- Expo scaffolds already had `EXPO_PUBLIC_CONVEX_URL`
- Expo scaffolds already had `EXPO_PUBLIC_CONVEX_SITE_URL`
- Expo scaffolds did **not** have `EXPO_PUBLIC_SITE_URL`
- `kitcn dev` only looked for `NEXT_PUBLIC_SITE_URL` and `VITE_SITE_URL`

So Concave fell back to `http://localhost:3000`, injected that into the live
auth runtime, and Better Auth correctly rejected requests coming from
`http://localhost:3005`.

Once Expo owned `EXPO_PUBLIC_SITE_URL`, the whole stack agreed on one local app
origin again:

- `.env.local`
- `convex/.env`
- `convex/lib/get-env.ts`
- `kitcn dev`
- the live Better Auth runtime

## Prevention

- Every scaffolded frontend must own an explicit client site-url env key, not
  just Convex transport URLs.
- When adding a new app shell, update all three places together:
  - init env template
  - `resolveConcaveLocalSiteUrl()`
  - `patchPreparedLocalDevPort()`
- For auth runtime bugs, inspect the live request contract before rewriting the
  auth layer. The bad value here lived in dev bootstrapping, not Better Auth.
- Keep one scenario proof that hits the live auth POST route through the site
  proxy, because generated files alone can lie.

## Related Issues

- [next-auth-scaffolds-must-pin-the-app-site-url-20260331](./next-auth-scaffolds-must-pin-the-app-site-url-20260331.md)
- [prepared-scenarios-must-recreate-env-local-baselines-20260329](../workflow-issues/prepared-scenarios-must-recreate-env-local-baselines-20260329.md)
