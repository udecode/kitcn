---
title: Changesets linked packages plus pre-1.0 peer ranges can manufacture majors
date: 2026-03-31
category: workflow-issues
module: release-tooling
problem_type: workflow_issue
component: tooling
severity: medium
applies_when:
  - a workspace uses Changesets linked packages
  - a plugin package peers on a host package below 1.0
  - a release plan shows a fake major cascade after a host minor
tags:
  - changesets
  - peer-dependencies
  - linked-packages
  - semver
  - releases
symptoms:
  - a plugin package jumps to 1.0.0 after only a host minor change
  - the linked host package gets promoted to the same fake major
  - `changeset status` shows a major release plan that the actual changeset did not ask for
root_cause: config_error
resolution_type: config_change
---

# Changesets linked packages plus pre-1.0 peer ranges can manufacture majors

## Context

We changed `@kitcn/resend` to peer on `kitcn` and immediately got a stupid
release plan: a `minor` changeset for `kitcn` turned into `kitcn@1.0.0` plus
`@kitcn/resend@1.0.0`.

The code change was not the problem. The release math was.

## Guidance

When a plugin package peers on a host package that is still below `1.0.0`,
Changesets needs three things to stay honest:

1. turn on `onlyUpdatePeerDependentsWhenOutOfRange`
2. use an honest bounded peer range that actually includes the next minor
3. use a `fixed` group for packages that should ship lockstep

In this repo, the fix was:

```json
{
  "fixed": [["kitcn", "@kitcn/*"]],
  "___experimentalUnsafeOptions_WILL_CHANGE_IN_PATCH": {
    "onlyUpdatePeerDependentsWhenOutOfRange": true
  }
}
```

and:

```json
{
  "peerDependencies": {
    "kitcn": ">=0.11.0 <1"
  }
}
```

Do not use `^0.11.0` if you mean to allow `0.12.0`. On `0.x`, caret is narrow.
Do not use naked `>=` either unless you actually mean "every future major too".
Do not paper over versioning drift with a custom auto-changeset script if the
packages are really one product family. Use Changesets' native `fixed` support
instead.

## Why This Matters

Two Changesets rules stack here:

- peer dependency bumps can major-bump dependents
- fixed groups release the whole family together
- linked packages do not auto-enter the release set on their own

That means one plugin peer mismatch can boomerang back into the host package
and manufacture a major release you never asked for. Even after fixing that,
`linked` still will not pull a dependent package into the version PR unless a
changeset already exists for it. If the family is supposed to stay aligned,
`fixed` is the cleaner tool.

The release plan looks authoritative, but it is just faithfully applying your
config. If the peer range is too narrow, Changesets is not wrong. Your config
is.

## When to Apply

- when a package under `packages/*` peers on another internal package
- when the host package is still on `0.x`
- when official plugin packages should stay version-aligned with the host
- when `changeset status` shows a major cascade after a host minor

## Examples

Bad:

```json
{
  "peerDependencies": {
    "kitcn": "^0.11.0"
  }
}
```

That excludes `0.12.0`, so a `kitcn` minor still leaves range and Changesets
can escalate the peer package to `major`.

Good for compatibility:

```json
{
  "peerDependencies": {
    "kitcn": ">=0.11.0 <1"
  }
}
```

With `onlyUpdatePeerDependentsWhenOutOfRange: true`, the plugin does not take a
fake major when the new host version still satisfies the peer range.

Good for lockstep family releases:

```json
{
  "fixed": [["kitcn", "@kitcn/*"]]
}
```

That keeps the official `kitcn` family on the same released version without
adding custom release-graph logic.

## Related

- [hard-cut-package-rebrands-must-hit-packed-scaffolds-and-generated-output-20260328.md](/Users/zbeyens/git/better-convex/docs/solutions/workflow-issues/hard-cut-package-rebrands-must-hit-packed-scaffolds-and-generated-output-20260328.md)
