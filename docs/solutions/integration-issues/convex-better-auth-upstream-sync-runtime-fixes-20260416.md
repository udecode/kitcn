---
title: Convex Better Auth upstream sync must filter runtime fixes from repo churn
date: 2026-04-16
category: integration-issues
module: auth-upstream-sync
problem_type: integration_issue
component: authentication
symptoms:
  - `zbeyens/convex-better-auth` can be behind upstream without GitHub reporting a fork parent
  - upstream runtime fixes can be mixed with release config, npmrc, renovate, and test-suite churn
  - kitcn auth routes can initialize Better Auth during `convex/http.ts` registration
  - adapter queries can miss composite indexes when upstream fixes index field matching
root_cause: missing_workflow_step
resolution_type: code_fix
severity: medium
tags: [auth, convex-better-auth, upstream-sync, register-routes, adapter]
---

# Convex Better Auth upstream sync must filter runtime fixes from repo churn

## Problem

Syncing `@convex-dev/better-auth` cannot be a blind package bump. The upstream
range can include runtime fixes, docs, release setup, test harness rewrites, and
repo maintenance in the same commit window.

For the `0.11.1` to `0.11.4` range, the relevant kitcn work was the auth
runtime slice: lazy route registration, composite index matching, narrower JWT
type imports, and the package dependency bump.

## Symptoms

- `gh repo view zbeyens/convex-better-auth` reported `parent: null`, even
  though npm metadata and the local clone proved the upstream repo was
  `get-convex/better-auth`.
- `git rev-list fork/main..origin/main` showed 17 upstream commits.
- the upstream diff mixed useful auth runtime changes with `.npmrc`, renovate,
  release script, generated component type, and optional test-suite changes.
- kitcn already had some upstream fixes, such as numeric date outputs and
  `BaseURLConfig` support, so applying the whole diff would duplicate work and
  import noise.

## What Didn't Work

- Treating GitHub fork metadata as authoritative was not enough. The repository
  is effectively a fork, but GitHub did not expose a parent.
- Treating every upstream file change as relevant was too blunt. The diff
  included useful fixes and repo-only maintenance in the same range.
- Pulling upstream test harness churn wholesale would have increased scope
  without proving a kitcn user-facing fix.

## Solution

Use npm metadata and local remotes to prove upstream when GitHub fork metadata
is missing:

```bash
npm view @convex-dev/better-auth repository homepage version --json
gh repo view get-convex/better-auth --json nameWithOwner,defaultBranchRef,url
git -C ../convex-better-auth remote add fork https://github.com/zbeyens/convex-better-auth.git
git -C ../convex-better-auth fetch origin main --tags
git -C ../convex-better-auth fetch fork main --tags
git -C ../convex-better-auth rev-list --count fork/main..origin/main
```

Then classify upstream commits by kitcn impact:

- pull runtime fixes that affect kitcn imports, exports, wrappers, auth routes,
  generated contracts, and adapter behavior
- skip release plumbing, renovate config, npmrc files, and upstream-only test
  policy rewrites unless they directly verify the selected fix
- compare each upstream fix with local code before applying it, because kitcn
  may already carry equivalent fixes

For the `0.11.4` sync, the selected kitcn slice was:

- bump `@convex-dev/better-auth` to `0.11.4`
- make `registerRoutes` lazy by default instead of adding a second public helper
- require explicit `basePath` only when the auth config uses a non-default path
- fix adapter composite index lookup to use real Convex field names, not
  underscore-prefixed field names
- import `JwtOptions` from `better-auth/plugins/jwt`
- document the lazy `registerRoutes` behavior in `www` and the packaged Convex skill

## Why This Works

The upstream range had three distinct classes of change:

1. already-applied fixes: numeric date output and `BaseURLConfig` typing
2. relevant runtime fixes: lazy route registration, subpath JWT typing, and
   composite index matching
3. irrelevant or optional churn: renovate, npmrc, release scripts, generated
   type freshness, and upstream test harness cleanup

Filtering by kitcn's auth surfaces kept the sync small and useful. The lazy
`registerRoutes` helper now avoids Better Auth initialization during
`convex/http.ts` registration. The adapter index fix
prevents full scans when Better Auth queries combine an equality predicate with
a `sortBy` field on a composite index.

## Prevention

1. When GitHub fork metadata is missing, prove upstream through npm repository
   metadata before asking the user.
2. For `convex-better-auth` syncs, inspect local kitcn equivalents before
   applying upstream patches. Some fixes may already exist locally.
3. Keep optional upstream test suites and repo maintenance out of the PR unless
   they are the direct proof path for the selected runtime fix.
4. Add focused regression tests for the pulled behavior:
   - lazy auth route registration must not call `getAuth({})` during
     registration when `basePath` and `trustedOrigins` are supplied
   - adapter pagination must select composite indexes using real field names

## Related Issues

- `docs/solutions/integration-issues/plain-codegen-must-not-import-managed-auth-convex-plugin-20260325.md`
- `docs/solutions/integration-issues/better-auth-1-5-generated-auth-runtime-typing.md`
- `docs/solutions/integration-issues/convex-auth-jwks-routes-should-not-trigger-better-auth-ip-warnings-20260325.md`
