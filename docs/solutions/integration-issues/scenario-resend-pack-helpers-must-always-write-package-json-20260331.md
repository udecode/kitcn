---
title: Scenario resend pack helpers must synthesize a safe package manifest
last_updated: 2026-04-01
date: 2026-03-31
category: integration-issues
module: scenario-tooling
problem_type: integration_issue
component: tooling
symptoms:
  - `bun run scenario:test -- next-auth` fails before the scenario is even prepared.
  - `npm pack` throws `ENOENT` for a temp resend package missing `package.json`.
  - `fixtures:sync` or scenario prep can fail with `tsdown: command not found`.
  - The break appears after `@kitcn/resend` moves `kitcn` from `dependencies` to `peerDependencies`.
root_cause: logic_error
resolution_type: code_fix
severity: medium
tags: [scenarios, resend, packaging, peer-dependencies, npm-pack]
---

# Scenario resend pack helpers must always write package.json

## Problem

Prepared scenario apps and fixture sync started failing while building the local
install tarball for `@kitcn/resend`.

The temp pack helper treated the synthesized manifest as an incidental detail
instead of the actual contract.

First it only wrote `package.json` when it rewrote `dependencies.kitcn`. Once
`kitcn` moved to `peerDependencies`, that branch no longer ran, so the temp
package had `dist/` and nothing else.

Later, after `@kitcn/resend` learned to rebuild itself on `prepack`, the same
temp helper copied a manifest with lifecycle scripts into a directory that had
no dev dependencies. `npm pack` then tried to rerun `bun run build`, which
died because `tsdown` was not present in the synthesized package.

## Symptoms

- `bun run scenario:test -- next-auth`, `bun run fixtures:sync`, or
  `bun run scenario:check -- convex-next-all` dies during local package
  packing.
- npm reports:

```txt
ENOENT: no such file or directory, open '.../kitcn-resend-pack-.../package/package.json'
```

or:

```txt
/bin/bash: tsdown: command not found
error: script "build" exited with code 127
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
rewrite happens, and strip pack-time lifecycle scripts from the temp manifest.

```ts
const packageJson = readJson<WorkspacePackageJson>(
  path.join(LOCAL_RESEND_PACKAGE_DIR, "package.json")
);

const {
  prepack: _prepack,
  postpack: _postpack,
  prepare: _prepare,
  prepublishOnly: _prepublishOnly,
  ...scripts
} = packageJson.scripts ?? {};

if (packageJson.dependencies?.kitcn) {
  packageJson.dependencies.kitcn = getLocalInstallSpec();
}

writeJson(packageJsonPath, {
  ...packageJson,
  scripts,
});
```

Then lock it with a test that unpacks the generated resend tarball and proves
`package/package.json` exists.

## Why This Works

The temp resend package only needs a valid publishable manifest plus `dist/`.
Whether `kitcn` is expressed as a dependency or a peer is irrelevant to the
existence of the manifest, and pack-time lifecycle scripts are irrelevant once
the helper already copied built output into place.

The old helper accidentally tied “write the manifest” to “rewrite one specific
field.” That coupling broke the moment the package contract changed.

## Prevention

- When synthesizing packable temp packages, always write the manifest
  unconditionally.
- Strip pack-time lifecycle scripts from synthesized manifests when the helper
  already copied built artifacts.
- After moving host packages between `dependencies` and `peerDependencies`,
  rerun packaged scenario lanes instead of trusting unit-level green checks.
- Add tests around the packed artifact, not just the in-memory manifest object.

## Related Issues

- `hard-cut-package-rebrands-must-hit-packed-scaffolds-and-generated-output-20260328.md`
- `changesets-linked-peer-ranges-can-manufacture-majors-20260331.md`
