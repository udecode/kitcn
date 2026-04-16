---
description: Audit newer npm package releases against kitcn. Use when checking whether a newer dependency version unlocks kitcn improvements, compatibility work, CLI/agent workflows, or cleanup of local package-specific hacks. Reads package changelogs, GitHub releases, upstream diffs, and local kitcn usage before delegating an implementation PR through `task`.
name: package-release-audit
metadata:
  skiller:
    source: .agents/rules/package-release-audit.mdc
---

# Package Release Audit

Handle $ARGUMENTS.

Goal: find newer releases for a named package, extract work kitcn can actually
use, then delegate one concrete implementation slice to
[$task](/Users/zbeyens/git/better-convex/.agents/skills/task/SKILL.md) so it
opens the PR.

## Rules

- Use evidence, not vibes. Read changelog/release sources and a diff.
- Prefer deleting kitcn glue over adding more glue when upstream fixed the real
  problem.
- Do not upgrade a package just because a newer version exists. Ship only a
  leverageable improvement.
- Keep the PR slice coherent. One release opportunity per PR unless multiple
  fixes share the same seam.
- If no actionable opportunity exists, stop with the evidence. Do not open a
  vanity PR.

## 1. Establish Package, Current, And Target Versions

Extract the package name from $ARGUMENTS. If the package name is ambiguous,
stop and ask for the exact npm package name.

Find the currently pinned package version:

```bash
rg -n '"<package-name>":' package.json packages/**/package.json example/package.json
```

Find the latest published version and package metadata:

```bash
npm view <package-name> version repository homepage dist-tags --json
```

If $ARGUMENTS names a target version, use it as the upper bound. Otherwise use
the latest npm version.

Record:

- package name
- current pinned version or range
- target version
- every version in the current-exclusive, target-inclusive range when discoverable
- exact package files that pin or constrain the package
- repository owner/name inferred from npm metadata

## 2. Read Changelogs And Release Notes

Prefer official sources in this order:

1. package repository changelog files
2. GitHub releases
3. package docs/blog release pages from npm metadata
4. npm package metadata only when no richer source exists

Read the repository changelog through `gh`, not browser scraping, when a GitHub
repo is available:

```bash
gh api \
  -H "Accept: application/vnd.github.raw" \
  repos/<owner>/<repo>/contents/CHANGELOG.md
```

If that path is missing, discover likely changelog paths:

```bash
gh api repos/<owner>/<repo>/git/trees/HEAD?recursive=1 \
  --jq '.tree[].path | select(test("(^|/)(CHANGELOG|RELEASES|HISTORY|UPGRADING|MIGRATION|MIGRATIONS)\\\\.(md|mdx|txt)$"; "i"))'
```

Read GitHub releases:

```bash
gh release list --repo <owner>/<repo> --limit 20
gh release view <tag-or-version> --repo <owner>/<repo>
```

Extract only the sections in range. Reconcile disagreements:

- Changelog files are package-facing signal.
- GitHub releases are release-manager signal.
- Docs/blog pages are product-facing signal.
- If they disagree, keep both facts and investigate in the diff.

## 3. Read The Upstream Diff With `gh`

Use a local upstream clone for navigation, creating it only if missing:

```bash
test -d ../<repo-name>/.git || gh repo clone <owner>/<repo> ../<repo-name>
git -C ../<repo-name> fetch origin main --tags
```

Find refs for the current and target versions. Prefer tags if they exist:

```bash
git -C ../<repo-name> tag -l "*<version>*" | sort
git -C ../<repo-name> log --all --oneline -- '*package.json' '*CHANGELOG*'
```

If tags are unclear, inspect version-bump commits in the package's
`package.json` or changelog and use the commit before/after each version bump.

Read the compare through `gh`:

```bash
gh api \
  repos/<owner>/<repo>/compare/<base-ref>...<target-ref> \
  --jq '.files[] | select(.filename | test("package|src|cli|server|client|auth|plugin|adapter|schema|migration|agent|mcp|codegen|docs|CHANGELOG"; "i")) | {filename,status,patch}'
```

If the compare is too large, narrow locally after proving the refs:

```bash
git -C ../<repo-name> diff <base-ref>..<target-ref> -- \
  . ':!**/node_modules/**' ':!**/dist/**' ':!**/build/**'
```

## 4. Search Kitcn For Leverage

Search for local package integration points and hacks:

```bash
rg -n "<package-name>|<package-import>|<package-domain-term>|TODO|workaround|hack|temporary|shim|compat|adapter|plugin|peer|version" \
  packages www .agents docs test tooling
```

Also search institutional notes before proposing work:

```bash
rg -i --files-with-matches "<package-name>|<package-domain-term>|upgrade|compat|agent|cli|bootstrap|adapter|plugin|peer|version" docs/solutions
```

Read relevant hits, especially notes about:

- package-specific wrappers, adapters, plugins, or generated code
- peer dependency ranges and scaffold pins
- CLI or agent workflow workarounds
- non-interactive, deterministic, or machine-readable behavior
- docs/skill sync for package guidance
- dirty hacks that might be obsolete after the upstream release

## 5. Classify Opportunities

For each release item, classify it:

- `feature`: new package API, CLI command, runtime behavior, integration, or
  platform feature kitcn can expose.
- `compatibility`: required work to keep kitcn working with the new version.
- `agentic`: upstream change that improves non-interactive, deterministic,
  machine-readable, MCP, CLI, or automation flows.
- `cleanup`: upstream change that lets kitcn delete a workaround, shim, fallback,
  prompt handling, wrapper, patch, or doc warning.
- `docs`: upstream change that only affects user-facing docs, setup guidance, or
  skills.
- `no-op`: interesting upstream change with no kitcn action.

For every non-`no-op`, include:

- changelog or release evidence
- diff evidence
- kitcn file(s) affected
- expected implementation seam
- verification command(s)
- confidence

Bias toward `agentic` and `cleanup`; kitcn exists to make dependencies sharper
for humans and agents, not to mirror every upstream bullet.

## 6. Choose One PR Slice

Pick the highest-leverage slice using this order:

1. compatibility breakage
2. delete dirty hack made obsolete upstream
3. agentic CLI/tooling unlock
4. product feature kitcn can expose cleanly
5. docs or skill-only update

If the winning slice touches published package code, the delegated task must
update the active changeset and run `bun --cwd packages/kitcn build`.

If it touches scaffold templates, the delegated task must run
`bun run fixtures:sync` and `bun run fixtures:check`.

## 7. Delegate Through `task`

Load
[$task](/Users/zbeyens/git/better-convex/.agents/skills/task/SKILL.md) with a
prompt in this exact shape:

```md
Implement this package release opportunity.

Package: <package-name>
Current version/range: <version>
Target version: <version>

Opportunity: <one-sentence selected slice>
Class: <feature | compatibility | agentic | cleanup | docs>

Evidence:
- Changelog/release notes: <short citation or summary>
- Upstream diff: <refs and files>
- Kitcn evidence: <local files and docs/solutions notes>

Implementation:
- <specific files or seams to inspect first>
- <expected code/doc/test shape>

Acceptance:
- <tests/checks>
- <package build if packages/kitcn changes>
- <fixtures commands if scaffold output changes>
- open the PR after verification

Do not preserve obsolete package workarounds if the upstream release removes
the need for them. Hard cut the hack.
```

Then follow `task` until the PR exists or a real blocker is proven.

## Output

Before delegation, keep the audit terse:

```md
Package: <package-name>
Current: <version>
Target: <version>

| Class | Opportunity | Evidence | Decision |
| --- | --- | --- | --- |
| cleanup | ... | ... | selected |

Delegating to task: <selected slice>
```

After `task` finishes, use its final handoff format.
