---
title: Convex 1.36 release audits should ship one thin CLI slice
date: 2026-04-26
category: workflow-issues
module: kitcn cli
problem_type: workflow_issue
component: tooling
severity: medium
applies_when:
  - Auditing a newer Convex npm release for kitcn work
  - A Convex CLI feature can be exposed without wrapping its behavior
  - A Convex version bump changes scaffold pins or supported peer floors
tags: [convex, cli, release-audit, env-default, fixtures, changeset]
---

# Convex 1.36 release audits should ship one thin CLI slice

## Context

Convex 1.36 added several useful features: default environment variables,
inline CLI queries, deployment messages, and function metadata reflection.
That does not mean kitcn should mirror every feature.

The useful slice was `convex env default`: kitcn already owns `kitcn env`
delegation, and default env values improve new dev, preview, and production
deployment setup without adding a new abstraction.

## Guidance

Treat Convex release audits as selection work, not a shopping spree:

1. Read Ship, the package changelog, and the upstream diff.
2. Classify each item as `compatibility`, `cleanup`, `agentic`, `feature`, or
   `no-op`.
3. Ship one coherent slice.
4. Prefer passthrough when Convex already owns the behavior.

For Convex 1.36 default env values, the right shape is thin delegation:

```bash
kitcn env default list --type dev
kitcn env default set SITE_URL https://app.example.com --type prod
```

Do not add a kitcn-specific default-env store, parser, or lifecycle. Allow the
subcommand, forward it to `convex env default`, and document the Convex-owned
contract.

When the selected slice depends on a new Convex CLI feature:

- Pin scaffold/runtime installs to the exact supported version.
- Raise package peer floors to the release family, for example `>=1.36`.
- Update `www/` docs and packed Convex skill references in the same diff.
- Write a changeset because published package behavior changed.
- Run fixture sync/check when scaffold output package pins change.

## Why This Matters

kitcn gets worse when it shadows Convex. The package should sharpen agent and
developer workflows, not become a second Convex CLI with stale copies of every
new flag.

Thin passthrough keeps ownership clean: Convex owns deployment defaults; kitcn
owns discoverability, docs, scaffolds, and deterministic verification.

## When to Apply

- Convex ships a CLI subcommand that fits an existing kitcn command group.
- A release includes several attractive features but only one has a small,
  proven kitcn integration path.
- A Convex version bump affects scaffold pins, peer dependency warnings, or
  docs/skill setup guidance.

## Examples

Audit first:

```bash
npm view convex version --json
gh api -H "Accept: application/vnd.github.raw" \
  repos/get-convex/convex-backend/contents/npm-packages/convex/CHANGELOG.md
git -C ../convex-backend diff <current-ref>..<target-ref> -- \
  npm-packages/convex
```

Then keep the implementation boring:

```ts
const SUPPORTED_ENV_SUBCOMMANDS = new Set([
  "get",
  "set",
  "list",
  "default",
]);
```

For scaffold pin changes, verify both generated output and runtime:

```bash
bun run fixtures:sync
bun run fixtures:check
bun check
```

## Related

- [Convex 1.35 owns anonymous non-interactive setup](/Users/zbeyens/git/better-convex/docs/solutions/workflow-issues/convex-135-owns-anonymous-noninteractive-setup-20260415.md)
