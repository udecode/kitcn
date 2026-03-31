---
title: Scenario resend pack helpers must always write package.json
date: 2026-03-31
category: integration-issues
module: scenario-tooling
problem_type: integration_issue
component: tooling
symptoms:
  - `bun run scenario:test -- next-auth` fails before the scenario is even prepared.
  - `npm pack` throws `ENOENT` for a temp resend package missing `package.json`.
  - The break appears after `@kitcn/resend` moves `kitcn` from `dependencies` to `peerDependencies`.
root_cause: logic_error
resolution_type: code_fix
severity: medium
tags: [scenarios, resend, packaging, peer-dependencies, npm-pack]
---

# Scenario resend pack helpers must always write package.json

## Problem

Prepared scenario apps started failing while building the local install tarball
for `@kitcn/resend`.

The temp pack helper only wrote `package.json` when it rewrote
`dependencies.kitcn`. Once `kitcn` moved to `peerDependencies`, that branch no
longer ran, so the temp package had `dist/` and nothing else.

## Symptoms

- `bun run scenario:test -- next-auth` or `bun run scenario:check -- convex-next-all`
  dies during local package packing.
- npm reports:

```txt
ENOENT: no such file or directory, open '.../kitcn-resend-pack-.../package/package.json'
```

- The failure shows up in scenario tooling, not when packing `packages/resend`
  directly.

## What Didn't Work

- Re-running the scenario. The temp package was malformed every time.
- Treating it as an npm or temp-directory flake. The missing file was fully
  deterministic.
- Fixing only the version range math for `@kitcn/resend`. The pack helper still
  assumed the old manifest shape.

## Solution

Always write the synthesized temp `package.json`, whether or not any dependency
rewrite happens.

```ts
const packageJson = readJson<WorkspacePackageJson>(
  path.join(LOCAL_RESEND_PACKAGE_DIR, "package.json")
);

if (packageJson.dependencies?.kitcn) {
  packageJson.dependencies.kitcn = getLocalInstallSpec();
}

writeJson(packageJsonPath, packageJson);
```

Then lock it with a test that unpacks the generated resend tarball and proves
`package/package.json` exists.

## Why This Works

The temp resend package only needs a valid published manifest plus `dist/`.
Whether `kitcn` is expressed as a dependency or a peer is irrelevant to the
existence of the manifest itself.

The old helper accidentally tied “write the manifest” to “rewrite one specific
field.” That coupling broke the moment the package contract changed.

## Prevention

- When synthesizing packable temp packages, always write the manifest
  unconditionally.
- After moving host packages between `dependencies` and `peerDependencies`,
  rerun packaged scenario lanes instead of trusting unit-level green checks.
- Add tests around the packed artifact, not just the in-memory manifest object.

## Related Issues

- `hard-cut-package-rebrands-must-hit-packed-scaffolds-and-generated-output-20260328.md`
- `changesets-linked-peer-ranges-can-manufacture-majors-20260331.md`
