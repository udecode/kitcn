# Convex Docs Sync Contract (WWW -> Skill)

This file is the normative process spec for syncing better-convex docs into the Convex skill docs.

## 1. Purpose

Keep skill docs as a compressed mirror of `www` docs:

1. Lossless for better-convex/Convex-specific deltas.
2. Compressed for parity content AI already knows.
3. Strictly separated by setup vs core feature work vs advanced resources.

## 2. Canonical Source of Truth

Primary source:

- `/Users/zbeyens/GitHub/better-convex/www/content/docs/**`

Discovery source:

- All `meta.json` trees under `/Users/zbeyens/GitHub/better-convex/www/content/docs/**`

Contract:

1. Skill docs are a compressed mirror of `www`, not an independent spec.
2. `www` changes trigger skill sync review.
3. Missing parity in skill must be treated as a sync bug, not a style preference.

## 3. Compression Contract (Parity vs Delta)

Baseline assumption: AI already knows tRPC + Drizzle + Better Auth semantics where behavior is fully equivalent.

Keep (must keep):

1. better-convex-specific runtime behavior.
2. Convex constraints, limits, and operational caveats.
3. Integration gotchas and edge cases.
4. Non-obvious snippets that encode real behavioral differences.
5. Any behavior that differs from parity baseline; label as `Delta from parity`.

Drop or condense (must condense):

1. Pure parity explanations identical to vanilla tRPC/Drizzle/Better Auth.
2. Repeated introductory theory when no better-convex delta exists.

Snippet policy:

1. If snippet demonstrates a delta, keep full snippet.
2. If snippet is parity-only, keep minimal snippet plus pointer.

## 4. Destination Matrix (setup/core/resources)

Use non-overlapping placement.

| Destination | Role | Must Contain | Must Not Contain |
| --- | --- | --- | --- |
| `references/setup.md` | One-time bootstrap | install/bootstrap/env/config/initial wiring/framework setup | daily feature patterns and long advanced deep-dives |
| `SKILL.md` | Always-loaded core | generic everyday E2E feature implementation path; usable alone for standard feature delivery | setup/install workflows and advanced niche overload |
| `references/*.md` | Resources (on-demand) | advanced/special cases, plugin depth, long snippets, niche troubleshooting, long-form API detail | setup bootstrap and generic core flow duplication |

Definition:

- `resources` == `skills/convex/references/*.md`

## 5. WWW Sync Workflow (phase-by-phase)

Follow this exact sequence.

1. Enumerate docs via top-level and nested `meta.json`.
2. Process one source doc at a time, heading-by-heading.
3. Classify each heading block as one of: `setup | core | resource | parity-drop`.
4. Migrate content to destination file with DRY enforcement.
5. Record every parity drop with rationale (what was dropped and why).
6. Run separation checks:
   - no setup leakage into `SKILL.md`
   - no advanced overload in core
   - advanced sections live in resources and are linked from core when relevant

## 6. DRY and Cross-Linking Rules

1. One canonical home per topic.
2. Do not duplicate large blocks across setup/core/resources.
3. References should link back to core/setup when repeating context.
4. `SKILL.md` should point to resources for advanced branches, not embed full deep-dives.
5. `setup.md` should not be copied into feature references; link instead.

## 7. Required Coverage + Traceability Artifacts

Each sync update must include:

1. Source coverage matrix: source page -> destination file/section.
2. Parity-drop rationale list (inline checklist in PR/update notes is acceptable).
3. Explicit confirmation that resources were treated as `references/*.md`.

Minimum acceptance statement per sync:

1. All touched `www` pages mapped.
2. All dropped parity sections justified.
3. All retained deltas preserved.

## 8. Quality Gates / Verification Checklist

Run these checks before accepting a sync.

1. No stale setup command references in `.claude`:
```bash
rg -n "convex-setup\\.md|commands/convex-setup|\\bconvex-setup\\b" .claude -g '*.md' -g '*.mdc'
```

2. No legacy Ents/`ctx.table` snippets in active Convex skill docs:
```bash
rg -n "ctx\\.table\\(|ctx\\.table\\b|convex-ents|defineEnt\\(" skills/convex/SKILL.md skills/convex/references -g '*.md'
```

3. `SKILL.md` remains setup-free (manual + grep check):
```bash
rg -n "create-next-app|Installation|convex\\.json|\\.env|env sync|one-time setup" skills/convex/SKILL.md
```

4. Every advanced reference has a discoverable pointer from core when relevant (manual review required).

5. `SKILL.md` remains generic E2E-usable without opening references for standard feature work (manual scenario review).

## 9. Anti-Patterns (what to reject)

Reject updates that:

1. Mix setup/bootstrap instructions into `SKILL.md`.
2. Explain parity basics in depth with no better-convex delta.
3. Use hollow placeholders (`see docs`) without enough operational guidance.
4. Duplicate large snippets across setup/core/resources.
5. Move advanced niche depth into core and bloat always-loaded context.

## 10. Quick Operator Checklist

Before merging doc sync changes:

1. Synced from `www` + `meta.json` traversal.
2. Classified every moved section (`setup/core/resource/parity-drop`).
3. Preserved all better-convex/Convex deltas.
4. Removed or compressed parity-only explanation.
5. Enforced destination matrix with no overlap.
6. Updated coverage matrix and parity-drop rationale.
7. Passed quality gates in Section 8.
