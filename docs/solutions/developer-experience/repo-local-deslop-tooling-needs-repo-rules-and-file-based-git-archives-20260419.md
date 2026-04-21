---
title: Repo-local deslop tooling needs repo rules and file-based git archives
date: 2026-04-19
category: developer-experience
module: slop-tooling
problem_type: developer_experience
component: tooling
severity: medium
applies_when:
  - Adding or changing repo-local Codex rules in better-convex
  - Building tooling that compares the current tree against a git baseline
  - Extending deslop or slop-delta checks without changing packaged skills
symptoms:
  - It looks like a new deslop skill should require packaged skill changes
  - spawnSync git archive fails with ENOBUFS on this repo
  - Slop delta checks choke when archive output is buffered in memory
root_cause: missing_tooling
resolution_type: tooling_addition
tags:
  - deslop
  - slop-scan
  - git-archive
  - enobufs
  - skiller
  - agent-rules
  - delta-lint
---

# Repo-local deslop tooling needs repo rules and file-based git archives

## Context

Deslop in `better-convex` is a repo-local workflow, not a packaged skill
concern. The useful lesson was twofold: repo-local Codex behavior lives in
`.agents/AGENTS.md` and `.agents/rules/*.mdc`, then gets regenerated through
`bun install` / Skiller; and branch-relative slop checks need a stable git
baseline, which means piping `git archive` through `spawnSync` is too brittle
for a medium-sized repo.

## Guidance

Treat repo-local skills and packaged skills as different surfaces with
different source-of-truth rules. If the goal is to change how Codex behaves in
this repo, edit `.agents/AGENTS.md` or `.agents/rules/*.mdc`, then regenerate.
Do not patch `packages/kitcn/skills/**` unless the packaged product skill is
what needs to ship.

For slop tooling, compare the current checkout against the merge-base with
`main` / `master`, not against the whole repo in isolation. Materialize that
base tree with `git archive --output <tmpfile> <treeish>` and unpack it from
disk before running `slop-scan delta`. That avoids `ENOBUFS` failures from
buffered `spawnSync` pipelines.

Keep the wrapper ergonomic:

- prefer the global `slop-scan` binary when present
- fall back to `bunx slop-scan` when it is not
- print added or worsened findings first so the cleanup pass stays bounded

## Why This Matters

This repo has two easy failure modes:

1. editing the wrong skill surface and leaving local agent behavior unchanged
2. getting fake-clean or flaky slop checks from brittle snapshot tooling

The first quietly drifts packaged docs instead of changing the repo-local
workflow. The second fails exactly when the repo is large enough for the check
to matter. A merge-base delta answers the real question: what this branch made
worse, not what the repo has always been bad at.

## When to Apply

- When adding or changing repo-specific agent rules, prompts, or cleanup
  workflows
- When a tool needs to compare the current tree against a git baseline
- When a repo-wide quality scan is too noisy and branch deltas are the honest
  signal
- When local tooling should work both with globally installed binaries and in
  fresh environments

## Examples

Before, the archive step tried to stream everything through `spawnSync`
buffers:

```ts
const archive = spawnSync("git", ["archive", mergeBase], {
  stdio: ["ignore", "pipe", "pipe"],
});

spawnSync("tar", ["-xf", "-", "-C", tempDir], {
  input: archive.stdout,
});
```

After, the wrapper writes the archive to disk first and unpacks from that file:

```ts
run(["git", "archive", "--output", archivePath, mergeBase], { cwd });
runBinary(["tar", "-xf", archivePath, "-C", tempDir], { cwd });
```

Use the wrapper through the repo scripts:

```sh
bun run lint:slop
bun run lint:slop:delta -- --top 3
```

## Related

- `docs/solutions/integration-issues/intent-stale-check-must-install-the-package-pinned-cli-20260328.md`
- `docs/solutions/workflow-issues/hard-cut-package-rebrands-must-hit-packed-scaffolds-and-generated-output-20260328.md`
- `.agents/AGENTS.md`
- `.agents/rules/deslop.mdc`
- `tooling/slop.ts`
