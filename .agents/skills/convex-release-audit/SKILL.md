---
description: Audit newer Convex npm releases against kitcn. Use when checking whether a newer `convex` version unlocks kitcn improvements, compatibility work, CLI/agent workflows, or cleanup of local Convex hacks. Reads `https://ship.convex.dev/`, the upstream Convex changelog, and GitHub diffs before delegating an implementation PR through `task`.
name: convex-release-audit
metadata:
  skiller:
    source: .agents/rules/convex-release-audit.mdc
---

# Convex Release Audit

Handle $ARGUMENTS.

Goal: find newer Convex releases, extract work kitcn can actually use, then
delegate one concrete implementation slice to
[$task](/Users/zbeyens/git/better-convex/.agents/skills/task/SKILL.md) so it
opens the PR.

## Rules

- Use evidence, not vibes. Read both changelog sources and a diff.
- Prefer deleting kitcn glue over adding more glue when upstream fixed the real
  problem.
- Do not upgrade Convex just because a newer version exists. Ship only a
  leverageable improvement.
- Keep the PR slice coherent. One release opportunity per PR unless multiple
  fixes share the same seam.
- If no actionable opportunity exists, stop with the evidence. Do not open a
  vanity PR.

## 1. Establish Current And Target Versions

Find the currently pinned Convex version:

```bash
rg -n '"convex":' package.json packages/**/package.json example/package.json
```

Find the latest published version:

```bash
npm view convex version --json
```

If $ARGUMENTS names a target version, use it as the upper bound. Otherwise use
the latest npm version.

Record:

- current pinned version
- target version
- every version in the current-exclusive, target-inclusive range
- exact package files that pin or constrain Convex

## 2. Read Both Changelogs

Read Ship:

```bash
curl -sL https://ship.convex.dev/
```

Read the upstream npm package changelog through `gh`, not browser scraping:

```bash
gh api \
  -H "Accept: application/vnd.github.raw" \
  repos/get-convex/convex-backend/contents/npm-packages/convex/CHANGELOG.md
```

Extract only the sections in range. Reconcile disagreements:

- Ship is product-facing signal.
- `npm-packages/convex/CHANGELOG.md` is package-facing signal.
- If they disagree, keep both facts and investigate in the diff.

## 3. Read The Upstream Diff With `gh`

Use a local upstream clone for navigation, creating it only if missing:

```bash
test -d ../convex-backend/.git || gh repo clone get-convex/convex-backend ../convex-backend
git -C ../convex-backend fetch origin main --tags
```

Find refs for the current and target versions. Prefer tags if they exist:

```bash
git -C ../convex-backend tag -l "*<version>*" | sort
git -C ../convex-backend log --all --oneline -- npm-packages/convex/package.json
```

If tags are unclear, inspect version-bump commits in
`npm-packages/convex/package.json` and use the commit before/after each version
bump.

Read the compare through `gh`:

```bash
gh api \
  repos/get-convex/convex-backend/compare/<base-ref>...<target-ref> \
  --jq '.files[] | select(.filename | test("npm-packages/convex|cli|agent|dev|auth|codegen|deployment|function|schema")) | {filename,status,patch}'
```

If the compare is too large, narrow locally after proving the refs:

```bash
git -C ../convex-backend diff <base-ref>..<target-ref> -- \
  npm-packages/convex
```

## 4. Search Kitcn For Leverage

Search for local Convex integration points and hacks:

```bash
rg -n "CONVEX_AGENT_MODE|local-force-upgrade|skip-push|typecheck disable|codegen disable|convex dev|convex init|convex run|CONVEX_|Convex" \
  packages www .agents docs test
```

Also search institutional notes before proposing work:

```bash
rg -i --files-with-matches "convex|upgrade|agent|cli|dev|bootstrap|verify" docs/solutions
```

Read relevant hits, especially notes about:

- local backend upgrade prompts
- anonymous or non-interactive Convex setup
- `kitcn dev`, `kitcn verify`, `kitcn init`
- hidden Convex flags or leaked upstream plumbing
- docs/skill sync for Convex setup guidance

## 5. Classify Opportunities

For each release item, classify it:

- `feature`: new Convex API, CLI command, runtime behavior, or platform feature
  kitcn can expose.
- `compatibility`: required work to keep kitcn working with the new version.
- `agentic`: upstream change that improves non-interactive, deterministic, or
  machine-readable flows.
- `cleanup`: upstream change that lets kitcn delete a workaround, hidden flag,
  fake prompt handling, fallback path, or doc warning.
- `no-op`: interesting upstream change with no kitcn action.

For every non-`no-op`, include:

- changelog evidence
- diff evidence
- kitcn file(s) affected
- expected implementation seam
- verification command(s)
- confidence

Bias toward `agentic` and `cleanup`; kitcn exists to make Convex sharper for
humans and agents, not to mirror every upstream bullet.

## 6. Choose One PR Slice

Pick the highest-leverage slice using this order:

1. compatibility breakage
2. delete dirty hack made obsolete upstream
3. agentic CLI unlock
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
Implement this Convex release opportunity.

Current Convex: <version>
Target Convex: <version>

Opportunity: <one-sentence selected slice>
Class: <feature | compatibility | agentic | cleanup>

Evidence:
- Ship changelog: <short citation or summary>
- Convex changelog: <short citation or summary>
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

Do not preserve obsolete Convex workarounds if the upstream release removes the
need for them. Hard cut the hack.
```

Then follow `task` until the PR exists or a real blocker is proven.

## Output

Before delegation, keep the audit terse:

```md
Current: <version>
Target: <version>

| Class | Opportunity | Evidence | Decision |
| --- | --- | --- | --- |
| cleanup | ... | ... | selected |

Delegating to task: <selected slice>
```

After `task` finishes, use its final handoff format.
