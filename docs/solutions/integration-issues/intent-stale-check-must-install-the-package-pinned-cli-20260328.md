---
title: Intent stale checks must install the package-pinned CLI in the temp app
category: integration-issues
tags:
  - intent
  - packaging
  - cli
  - skills
  - npm
symptoms:
  - `bun run intent:stale` fails with `Cannot find module .../node_modules/@tanstack/intent/dist/cli.mjs`
  - `intent validate` warns that `tanstack-intent` is missing from package keywords
  - the repo passes local skill checks but the packed-install stale check dies
module: intent
resolved: 2026-03-28
---

# Intent stale checks must install the package-pinned CLI in the temp app

## Problem

The repo's TanStack Intent maintainer checks were half-upgraded.

`intent validate` from the latest CLI immediately warned that the package was
missing the `tanstack-intent` keyword, and `bun run intent:stale` failed
because the temp app tried to execute an Intent CLI path that did not exist.

That made the stale check fake. It was validating the repo layout, not the
actual packed-install story.

## Root Cause

Two assumptions were wrong:

1. the package metadata still matched an older registry contract and lacked the
   `tanstack-intent` keyword the latest validator expects
2. the stale harness assumed the packed temp app would already contain
   `@tanstack/intent`, then tried to execute
   `temp/node_modules/@tanstack/intent/dist/cli.mjs`

But the packed `better-convex` tarball does not install TanStack Intent as a
runtime dependency. The temp app needs the matching CLI installed explicitly
before `stale` can run there.

## Solution

Upgrade the repo to the latest Intent release and make the stale harness install
the package-pinned CLI into the temp app before executing it.

The fixed contract is:

1. keep `@tanstack/intent` pinned in `packages/better-convex/package.json`
2. add `tanstack-intent` to package keywords so the registry can discover the
   package cleanly
3. in `tooling/intent-stale.mjs`, read the package-pinned Intent version from
   `packages/better-convex/package.json`
4. install both the packed tarball and that exact Intent version into the temp
   app
5. run `stale` from the temp install, not from repo-root `node_modules`

## Verification

- `bun test ./tooling/intent-stale.test.ts`
- `bun test ./packages/better-convex/src/package-intent.test.ts`
- `bun run intent:validate`
- `bun run intent:stale`
- `cd packages/better-convex && node ./bin/intent.js list`
- `bun run intent:check`
- `bun typecheck`

## Prevention

1. If a maintainer check is meant to prove packed-install behavior, run it from
   the packed temp app, not the repo root.
2. Keep the Intent CLI version sourced from package metadata instead of
   hard-coding a second version string in tooling.
3. Treat validator warnings as contract drift, not decoration.
