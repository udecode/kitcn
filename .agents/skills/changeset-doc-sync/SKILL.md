---
description: Read every doc in www and packages/kitcn/skills/kitcn, sync to active changeset(s), and track with checkmarks.
name: changeset-doc-sync
metadata:
  skiller:
    source: .agents/rules/changeset-doc-sync.mdc
---

# Changeset Doc Sync

Use this workflow when release docs must match current changeset content.

## Mandatory sequence

1. Run preflight migration review from `/example` before docs sync:
   - `git diff --name-only -- example`
   - `git diff --stat -- example`
   - `git diff -- example`
   - Save migration conclusions in the active `docs/plans/<date>-changeset-doc-sync.md`.
   - **Mandatory:** build a `/example` change checklist in that plan with one checkbox per changed file.
   - For each changed `/example` file, record:
     - impacted doc file(s), or
     - explicit `no doc impact` justification.

2. Plan first through the Plan playbook (`.agents/playbooks/plan.md`) and the `plan-page` skill:
   - Create or continue one `docs/plans/<date>-changeset-doc-sync.md` plan, with its decision log beside it.
   - **Mandatory:** the plan must include an exhaustive per-file checklist (every target doc as its own `- [ ]` item).

3. Resolve active changeset target(s):
   - List `.changeset/*.md` excluding `.changeset/README.md`.
   - Use changed changeset file(s) in the branch.
   - Extract breaking/features/patches and migration snippets.

4. Build execution checklists in the plan:
   - Include every file in:
     - `www/**/*.md`
     - `www/**/*.mdx`
     - `packages/kitcn/skills/kitcn/**/*.md`
   - Keep `/example` crosswalk checklist in the plan in sync during the run.

5. Read every listed doc and sync:
   - Update docs where migration changes are required.
   - Mark every file checked once synced.
   - If unchanged, still check with note `no change needed`.
   - For each `/example` changed file, mark the corresponding crosswalk checkbox only after linked docs are verified.

6. Completion gates:
   - `/example` crosswalk in the plan has zero unchecked file items.
   - The plan has zero unchecked file items.
   - No unchecked items remain.
   - The plan logs scanned/updated/unchanged totals.
   - The plan maps key doc edits to concrete changeset bullets.
   - No script checks these gates, so reread the plan and confirm each one before closing.

## Non-negotiable checklist rules

1. Do not summarize file coverage in the plan (for example, "56 files scanned").  
   You must list each file explicitly with its own checkbox.
2. Every processed file must be marked:
   - `updated`, or
   - `no change needed`
3. A run is incomplete if even one file remains unchecked in either checklist.
4. Any changed `/example` file without a mapped doc check or `no doc impact` note is a hard failure.
5. Do not close the run until `/example` diff, changeset bullets, and updated docs are all cross-referenced.

## Plan checklist template (required)

```md
### Phase: Doc Sync Checklist (www)

- [ ] `www/content/docs/a.mdx` — pending
- [ ] `www/content/docs/b.mdx` — pending

### Phase: Doc Sync Checklist (packages/kitcn/skills/kitcn)

- [ ] `packages/kitcn/skills/kitcn/SKILL.md` — pending
- [ ] `packages/kitcn/skills/kitcn/references/setup/index.md` — pending

### Phase: /example-to-doc Crosswalk (required)

- [ ] `example/convex/shared/api.ts` -> `www/content/docs/cli/backend.mdx`, `www/content/docs/react/infer-types.mdx` — pending
- [ ] `example/src/lib/convex/crpc.tsx` -> `www/content/docs/react/index.mdx` — pending
- [ ] `example/src/lib/convex/rsc.tsx` -> `www/content/docs/nextjs/index.mdx`, `www/content/docs/server/server-side-calls.mdx` — pending
- [ ] `example/src/lib/convex/server.ts` -> `www/content/docs/nextjs/index.mdx` — pending
- [ ] `example/convex/functions/http.ts` -> `www/content/docs/server/http.mdx` — pending
- [ ] `example/convex/shared/types-typecheck.ts` -> `www/content/docs/react/infer-types.mdx` — pending
```

## Checklist template

```md
# Doc Sync Checklist

## Changesets

- [x] `.changeset/your-file.md`

## www docs

- [ ] `www/path/to/doc.mdx` — pending

## packages/kitcn/skills/kitcn docs

- [ ] `packages/kitcn/skills/kitcn/SKILL.md` — pending
- [ ] `packages/kitcn/skills/kitcn/references/setup/index.md` — pending

## Synced

- [x] `www/path/to/doc.mdx` — updated for `@convex/api` migration
- [x] `packages/kitcn/skills/kitcn/references/setup/index.md` — no change needed
```

## Suggested commands

```bash
git diff --name-only -- example
git diff --stat -- example
git diff -- example
find .changeset -maxdepth 1 -type f -name '*.md' ! -name 'README.md' | sort
find www -type f \( -name '*.md' -o -name '*.mdx' \) | sort
{ echo 'packages/kitcn/skills/kitcn/SKILL.md'; find packages/kitcn/skills/kitcn/references -type f -name '*.md' | sort; }
```
