---
title: Dev should suppress benign Better Auth missing-IP warnings
category: integration-issues
tags:
  - dev
  - logs
  - auth
  - better-auth
  - convex
symptoms:
  - `kitcn dev` shows repeated Better Auth warnings about missing client IP
  - the warning appears in otherwise healthy local auth flows
  - users cannot tell real backend issues from known benign noise
module: dev-logs
resolved: 2026-03-25
---

# Dev should suppress benign Better Auth missing-IP warnings

## Problem

Even after fixing the auth bridge and local Convex metadata routes, users could
still see this exact warning in raw `kitcn dev` output:

```txt
WARN [Better Auth]: Rate limiting skipped: could not determine client IP address.
```

That line is just noise in local kitcn dev. It reads like breakage and
buries real logs.

## Root Cause

Long-running `kitcn dev` intentionally preserves raw Convex output.

That means any known-benign backend warning still reaches the terminal unless
kitcn explicitly filters it. The previous fix handled the auth/runtime
seam, but the dev log bridge still passed this specific Better Auth line
through untouched.

## Solution

Keep raw Convex logs, but add one exact suppressor for the Better Auth
missing-IP warning in the dev output path.

Apply the same suppressor in:

- filtered startup output
- raw long-running dev output

Do not broaden it into generic Better Auth warning suppression.

## Verification

- `bun test packages/kitcn/src/cli/commands/dev.test.ts --test-name-pattern 'filterDevStartupLine suppresses Convex nags and rewrites ready lines|handleDevCommand\\(dev\\) preserves raw Convex dev output'`
- `bun --cwd packages/kitcn typecheck`
- `bun --cwd packages/kitcn build`

## Prevention

1. Raw dev logs should stay mostly raw, but known-benign spam is fair game for
   surgical suppression.
2. When users complain about log noise, fix the exact line, not the entire log
   stream.
3. Add regression tests on the actual terminal output path, not just helper
   functions.

## Files Changed

- `packages/kitcn/src/cli/commands/dev.ts`
- `packages/kitcn/src/cli/commands/dev.test.ts`
