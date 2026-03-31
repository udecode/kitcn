---
title: Next auth scaffolds must pin the app site URL
date: 2026-03-31
category: integration-issues
module: auth-scaffold
problem_type: integration_issue
component: authentication
symptoms:
  - Fresh Next auth apps assume the local app origin is `http://localhost:3000`.
  - Auth flows break when the app moves to another port and only one side of the site URL contract is updated.
  - Docs drift starts when examples imply "just use whatever port Next picked."
root_cause: config_error
resolution_type: code_fix
severity: high
tags: [auth, nextjs, better-auth, local-dev, site-url, docs]
---

# Next auth scaffolds must pin the app site URL

## Problem

The Next auth scaffold owns an explicit local app-origin contract:
`NEXT_PUBLIC_SITE_URL=http://localhost:3000` on the app side and
`SITE_URL=http://localhost:3000` on the Convex side.

That contract is fine. The break happens when the app moves to another port and
only one side gets updated, or when docs imply the user can ignore the mismatch.

## Symptoms

- `kitcn add auth --yes` generates a client like this:

```ts
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_SITE_URL!,
  plugins: [convexClient()],
});
```

- The app dev script, `.env.local`, and `convex/.env` can drift out of sync.
- Auth pages or callbacks fail once the browser origin and Better Auth origin no
  longer match.

## What Didn't Work

- Pretending the scaffold should silently support any fallback port.
- Updating only `.env.local` or only `convex/.env`.
- Teaching users to "just open the actual port" while leaving auth env pointed
  at `3000`.

## Solution

Keep the scaffold explicit:

- Next auth client uses `NEXT_PUBLIC_SITE_URL`
- Convex auth config uses `SITE_URL`
- Default local origin stays `http://localhost:3000`

If the app moves to another local port, update all three together:

1. `.env.local` `NEXT_PUBLIC_SITE_URL`
2. `convex/.env` `SITE_URL`
3. app dev script, for example `next dev --port 3001`

## Why This Works

Better Auth needs one app origin. The scaffold is simpler and more predictable
when it declares that origin directly instead of inferring it from whichever
port happened to win the local dev race.

The failure mode is not "baseURL exists." The failure mode is config drift.

## Prevention

- Treat `3000` as the default local app-origin contract for scaffolded Next
  apps.
- When documenting custom ports, always list the full set of files that must
  change together.
- Do not mix same-origin implicit clients with explicit `SITE_URL` server
  config in the same scaffold story.

## Related Issues

- `concave-local-dev-auth-cycle-20260319.md`
