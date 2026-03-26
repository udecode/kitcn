---
title: Anonymous auth coverage probes must replay the signed Better Auth session cookie
category: integration-issues
tags:
  - auth
  - better-auth
  - example
  - coverage
  - anonymous
  - cookies
symptoms:
  - the anonymous auth coverage board shows link-account as supported but `onLinkAccount` migration and source-user deletion fail
  - email sign-up creates a non-anonymous user while leaving the anonymous source user behind
  - coverage probes pass for anonymous sign-in but fail for linked account cleanup
module: auth-demo
resolved: 2026-03-26
---

# Anonymous auth coverage probes must replay the signed Better Auth session cookie

## Problem

The example app's anonymous auth coverage board was claiming two live Better
Auth behaviors that were not actually being exercised:

- `onLinkAccount` data migration
- default deletion of the anonymous source user after linking

The board still showed email sign-up producing a non-anonymous user, which made
the failure look like a Better Auth bug.

## Root Cause

The board had two bad seams.

First, the original probe path used `ctx.auth.api.signUpEmail(...)`, which
never hit the real Better Auth HTTP `after` hook where the anonymous plugin
runs `onLinkAccount` and anonymous source deletion.

Second, the first attempt at switching to the real `/api/auth/sign-up/email`
route still replayed the wrong cookie. It reused the raw session token from the
JSON body:

```txt
token: session.session.token
```

But Better Auth stores the active session in a signed cookie:

```txt
better-auth.session_token=<token>.<signature>
```

If the follow-up sign-up request does not replay that signed cookie value,
Better Auth cannot see the anonymous session on the request. The sign-up still
creates a new non-anonymous user, so the shallow "linked user is
non-anonymous" check passes, but the anonymous plugin never runs its real link
cleanup path.

## Solution

Make the coverage board use the real surface and the real cookie.

1. Move the anonymous link probes onto `authAction` so they can call the real
   `/api/auth/sign-in/anonymous` and `/api/auth/sign-up/email` HTTP routes.
2. Add a tiny internal helper module for storage inspection and setup:
   `authDemoData.ts`
3. Capture the signed `better-auth.session_token=...` cookie from the sign-in
   response `set-cookie` header.
4. Replay that exact signed cookie on the follow-up sign-up request.
5. Keep the unsupported `delete anonymous endpoint` row out of the board
   entirely instead of pretending it belongs in current coverage.

After that, the board measures the actual anonymous plugin behavior rather than
an internal shortcut.

## Verification

- `cd example && bun run codegen`
- `cd example && bun run lint:fix`
- `cd example && bun convex run --identity "$identity" authDemo:runScenario '{"id":"on-link-account-bio-migration"}'`
- `cd example && bun convex run --identity "$identity" authDemo:runScenario '{"id":"linked-source-anonymous-deleted"}'`
- `cd example && bun convex run --identity "$identity" authDemo:runCoverage '{}'`

Live result after the fix:

- `on-link-account-bio-migration` passes
- `linked-source-anonymous-deleted` passes
- `runCoverage` returns `validated: 9`, `total: 9`

`cd example && bun run typecheck` is still red, but only on the unrelated Hono
version mismatch in `convex/functions/http.ts`.

## Prevention

1. If a coverage board says "full surface", do not measure plugin behavior
   through `ctx.auth.api.*` shortcuts when the real behavior lives in HTTP
   hooks.
2. When replaying Better Auth sessions, use the signed session cookie from
   `set-cookie`, not the raw token from the JSON body.
3. If a capability is not actually present in the Better Auth version under
   test, remove the row from the board instead of marking it as missing noise.

## Files Changed

- `example/convex/functions/authDemo.coverage.ts`
- `example/convex/functions/authDemo.ts`
- `example/convex/functions/authDemoData.ts`
