---
title: "docs: rewrite short-cameras-wave changeset and sync docs"
type: docs
date: 2026-03-09
---

# docs: rewrite short-cameras-wave changeset and sync docs

## Overview

Rewrite the final unreleased `.changeset/short-cameras-wave.md` so it absorbs
the deleted `.changeset/calm-cycles-count.md`, covers every changed and
untracked diff file in the branch, and keeps the public docs plus Convex skill
docs synced to the latest `better-convex init -t next` scaffold.

## Active Changeset Targets

- [x] `.changeset/short-cameras-wave.md` — rewritten final version from scratch
- [x] `.changeset/calm-cycles-count.md` — merged into `short-cameras-wave` and
      left deleted

## Diff Checklist

Source of truth: `git status --short --untracked-files=all`

- [x] `.changeset/calm-cycles-count.md` — deleted; merged into
      `short-cameras-wave`
- [x] `.changeset/short-cameras-wave.md` — rewritten final changeset
- [x] `convex/generated/auth.ts` — reviewed; local generated auth placeholder,
      no release/doc impact
- [x] `convex/generated/migrations.gen.ts` — reviewed; local generated
      migration helper, no release/doc impact
- [x] `convex/generated/server.ts` — reviewed; local generated server runtime,
      no release/doc impact
- [x] `convex/shared/api.ts` — reviewed; local generated API helper mirrors the
      codegen lookup-helper change
- [x] `docs/plans/2026-03-09-rewrite-short-cameras-wave-changeset-plan.md` —
      added file-granular planning log
- [x] `packages/better-convex/skills/convex/references/setup/index.md` —
      updated skill docs for scaffold ownership
- [x] `packages/better-convex/src/cli/codegen.test.ts` — reviewed; covered by
      changeset patch bullet
- [x] `packages/better-convex/src/cli/codegen.ts` — reviewed; covered by
      changeset patch bullet
- [x] `packages/better-convex/src/cli/commands/init.test.ts` — reviewed;
      covered by messages scaffold changes
- [x] `packages/better-convex/src/cli/core.ts` — reviewed; covered by messages
      scaffold changes
- [x] `packages/better-convex/src/cli/plugins/init/init-next-messages-page.template.ts`
      — reviewed; covered by messages scaffold changes
- [x] `packages/better-convex/src/cli/plugins/init/init-next-messages.template.ts`
      — reviewed; covered by messages scaffold changes
- [x] `packages/better-convex/src/cli/plugins/init/init-next-schema.template.ts`
      — reviewed; covered by messages scaffold changes
- [x] `fixtures/next/app/convex/page.tsx` — reviewed; documented as scaffolded
      demo route
- [x] `fixtures/next/convex/functions/_generated/api.d.ts` — reviewed;
      documented via generated messages API note
- [x] `fixtures/next/convex/functions/generated/messages.runtime.ts` —
      reviewed; documented via generated messages runtime note
- [x] `fixtures/next/convex/functions/messages.ts` — reviewed; documented as
      scaffolded procedure module
- [x] `fixtures/next/convex/functions/schema.ts` — reviewed; documented as
      messages starter schema
- [x] `fixtures/next/convex/shared/api.ts` — reviewed; documented via
      generated shared API note
- [x] `www/content/docs/cli.mdx` — updated for `init -t next` messages-owned
      scaffold files
- [x] `www/content/docs/templates.mdx` — updated for messages route, schema,
      procedures, and generated outputs

## /example Crosswalk

- [x] No changed files under `example/` — `git diff --name-only -- example` is
      empty, so there is no example-to-doc crosswalk for this run

## WWW Doc Sync Checklist

- [x] `www/README.md` — reviewed; no change needed for this changeset surface
- [x] `www/content/docs/auth/client.mdx` — reviewed; no change needed for this
      changeset surface
- [x] `www/content/docs/auth/index.mdx` — reviewed; no change needed for this
      changeset surface
- [x] `www/content/docs/auth/plugins/admin.mdx` — reviewed; no change needed
      for this changeset surface
- [x] `www/content/docs/auth/plugins/anonymous.mdx` — reviewed; no change
      needed for this changeset surface
- [x] `www/content/docs/auth/plugins/organizations.mdx` — reviewed; no change
      needed for this changeset surface
- [x] `www/content/docs/auth/plugins/polar.mdx` — reviewed; no change needed
      for this changeset surface
- [x] `www/content/docs/auth/server.mdx` — reviewed; no change needed for this
      changeset surface
- [x] `www/content/docs/cli.mdx` — updated for `init -t next` messages-owned
      scaffold files
- [x] `www/content/docs/comparison/convex.mdx` — reviewed; no change needed for
      this changeset surface
- [x] `www/content/docs/comparison/drizzle.mdx` — reviewed; no change needed
      for this changeset surface
- [x] `www/content/docs/concepts.mdx` — reviewed; no change needed for this
      changeset surface
- [x] `www/content/docs/index.mdx` — reviewed; no change needed for this
      changeset surface
- [x] `www/content/docs/migrations/aggregate.mdx` — reviewed; no change needed
      for this changeset surface
- [x] `www/content/docs/migrations/auth.mdx` — reviewed; no change needed for
      this changeset surface
- [x] `www/content/docs/migrations/convex.mdx` — reviewed; no change needed for
      this changeset surface
- [x] `www/content/docs/migrations/db.mdx` — reviewed; no change needed for
      this changeset surface
- [x] `www/content/docs/migrations/ents.mdx` — reviewed; no change needed for
      this changeset surface
- [x] `www/content/docs/nextjs/index.mdx` — reviewed; no change needed for this
      changeset surface
- [x] `www/content/docs/nextjs/rsc.mdx` — reviewed; no change needed for this
      changeset surface
- [x] `www/content/docs/orm/api-reference.mdx` — reviewed; no change needed for
      this changeset surface
- [x] `www/content/docs/orm/index.mdx` — reviewed; no change needed for this
      changeset surface
- [x] `www/content/docs/orm/llms-index.md` — reviewed; no change needed for
      this changeset surface
- [x] `www/content/docs/orm/migrations.mdx` — reviewed; no change needed for
      this changeset surface
- [x] `www/content/docs/orm/mutations/delete.mdx` — reviewed; no change needed
      for this changeset surface
- [x] `www/content/docs/orm/mutations/index.mdx` — reviewed; no change needed
      for this changeset surface
- [x] `www/content/docs/orm/mutations/insert.mdx` — reviewed; no change needed
      for this changeset surface
- [x] `www/content/docs/orm/mutations/update.mdx` — reviewed; no change needed
      for this changeset surface
- [x] `www/content/docs/orm/queries/aggregates.mdx` — reviewed; no change
      needed for this changeset surface
- [x] `www/content/docs/orm/queries/filters.mdx` — reviewed; no change needed
      for this changeset surface
- [x] `www/content/docs/orm/queries/index.mdx` — reviewed; no change needed for
      this changeset surface
- [x] `www/content/docs/orm/queries/operators.mdx` — reviewed; no change needed
      for this changeset surface
- [x] `www/content/docs/orm/queries/pagination.mdx` — reviewed; no change
      needed for this changeset surface
- [x] `www/content/docs/orm/rls.mdx` — reviewed; no change needed for this
      changeset surface
- [x] `www/content/docs/orm/schema/column-types.mdx` — reviewed; no change
      needed for this changeset surface
- [x] `www/content/docs/orm/schema/index.mdx` — reviewed; no change needed for
      this changeset surface
- [x] `www/content/docs/orm/schema/indexes-constraints.mdx` — reviewed; no
      change needed for this changeset surface
- [x] `www/content/docs/orm/schema/relations.mdx` — reviewed; no change needed
      for this changeset surface
- [x] `www/content/docs/orm/schema/triggers.mdx` — reviewed; no change needed
      for this changeset surface
- [x] `www/content/docs/plugins/index.mdx` — reviewed; no change needed for
      this changeset surface
- [x] `www/content/docs/plugins/ratelimit.mdx` — reviewed; no change needed for
      this changeset surface
- [x] `www/content/docs/plugins/resend.mdx` — reviewed; no change needed for
      this changeset surface
- [x] `www/content/docs/quickstart.mdx` — reviewed; no change needed for this
      changeset surface
- [x] `www/content/docs/react/error-handling.mdx` — reviewed; no change needed
      for this changeset surface
- [x] `www/content/docs/react/index.mdx` — reviewed; no change needed for this
      changeset surface
- [x] `www/content/docs/react/infer-types.mdx` — reviewed; no change needed for
      this changeset surface
- [x] `www/content/docs/react/infinite-queries.mdx` — reviewed; no change
      needed for this changeset surface
- [x] `www/content/docs/react/mutations.mdx` — reviewed; no change needed for
      this changeset surface
- [x] `www/content/docs/react/queries.mdx` — reviewed; no change needed for
      this changeset surface
- [x] `www/content/docs/server/context.mdx` — reviewed; no change needed for
      this changeset surface
- [x] `www/content/docs/server/error-handling.mdx` — reviewed; no change needed
      for this changeset surface
- [x] `www/content/docs/server/http.mdx` — reviewed; no change needed for this
      changeset surface
- [x] `www/content/docs/server/metadata.mdx` — reviewed; no change needed for
      this changeset surface
- [x] `www/content/docs/server/middlewares.mdx` — reviewed; no change needed
      for this changeset surface
- [x] `www/content/docs/server/procedures.mdx` — reviewed; no change needed for
      this changeset surface
- [x] `www/content/docs/server/scheduling.mdx` — reviewed; no change needed for
      this changeset surface
- [x] `www/content/docs/server/server-side-calls.mdx` — reviewed; no change
      needed for this changeset surface
- [x] `www/content/docs/server/setup.mdx` — reviewed; no change needed for this
      changeset surface
- [x] `www/content/docs/tanstack-start.mdx` — reviewed; no change needed for
      this changeset surface
- [x] `www/content/docs/templates.mdx` — updated for messages route, starter
      schema, messages procedures, and generated runtime/api outputs
- [x] `www/node_modules/lucide-react/README.md` — reviewed; no change needed
      for this changeset surface

## Convex Skill Doc Sync Checklist

- [x] `packages/better-convex/skills/convex/SKILL.md` — reviewed; no change
      needed for this changeset surface
- [x] `packages/better-convex/skills/convex/references/features/aggregates.md`
      — reviewed; no change needed for this changeset surface
- [x] `packages/better-convex/skills/convex/references/features/auth-admin.md`
      — reviewed; no change needed for this changeset surface
- [x] `packages/better-convex/skills/convex/references/features/auth-organizations.md`
      — reviewed; no change needed for this changeset surface
- [x] `packages/better-convex/skills/convex/references/features/auth-polar.md`
      — reviewed; no change needed for this changeset surface
- [x] `packages/better-convex/skills/convex/references/features/auth.md` —
      reviewed; no change needed for this changeset surface
- [x] `packages/better-convex/skills/convex/references/features/create-plugins.md`
      — reviewed; no change needed for this changeset surface
- [x] `packages/better-convex/skills/convex/references/features/http.md` —
      reviewed; no change needed for this changeset surface
- [x] `packages/better-convex/skills/convex/references/features/migrations.md`
      — reviewed; no change needed for this changeset surface
- [x] `packages/better-convex/skills/convex/references/features/orm.md` —
      reviewed; no change needed for this changeset surface
- [x] `packages/better-convex/skills/convex/references/features/react.md` —
      reviewed; no change needed for this changeset surface
- [x] `packages/better-convex/skills/convex/references/features/scheduling.md`
      — reviewed; no change needed for this changeset surface
- [x] `packages/better-convex/skills/convex/references/features/testing.md`
      — reviewed; no change needed for this changeset surface
- [x] `packages/better-convex/skills/convex/references/setup/auth.md` —
      reviewed; no change needed for this changeset surface
- [x] `packages/better-convex/skills/convex/references/setup/biome.md` —
      reviewed; no change needed for this changeset surface
- [x] `packages/better-convex/skills/convex/references/setup/doc-guidelines.md`
      — reviewed; no change needed for this changeset surface
- [x] `packages/better-convex/skills/convex/references/setup/index.md` —
      updated for the messages demo route and starter scaffold ownership
- [x] `packages/better-convex/skills/convex/references/setup/next.md` —
      reviewed; no change needed for this changeset surface
- [x] `packages/better-convex/skills/convex/references/setup/react.md` —
      reviewed; no change needed for this changeset surface
- [x] `packages/better-convex/skills/convex/references/setup/server.md` —
      reviewed; no change needed for this changeset surface
- [x] `packages/better-convex/skills/convex/references/setup/start.md` —
      reviewed; no change needed for this changeset surface

## Findings

- `short-cameras-wave` is the active unreleased changeset and now absorbs the
  deleted `calm-cycles-count` feature bullet.
- The current branch adds generated placeholder ESLint-disable comments in
  `codegen.ts`, so the final changeset now includes an explicit patch bullet
  for generated runtime placeholders no longer tripping ESLint before real
  codegen output exists.
- The current branch extends `better-convex init -t next` with a live
  messages demo route plus starter schema/procedures. Public docs now reflect
  `app/convex/page.tsx`, `convex/functions/messages.ts`, the messages starter
  table in `convex/functions/schema.ts`, and the generated messages
  runtime/shared API outputs.
- The review standard for the final rewrite is
  `git diff $(git merge-base HEAD main)` plus the live worktree, not
  branch-internal history or stale draft snippets.
- A merge-base audit removed fabricated breaking migrations for
  `@better-convex/resend/schema`, `definePluginMiddleware`,
  `ctx.plugins.<plugin>.options`, `ResendResolvedOptions`, and
  `verifyResendWebhookEvent(...)`, and corrected the ratelimit "before" import
  path to `better-convex/plugins/ratelimit`.
- A second merge-base audit on `## Patches` showed `main` had no
  `better-convex init`, no `fixtures/next` scaffold, no `packages/resend`,
  no `defineSchemaExtension(...)`, and no plugin-plan preview/apply flow. Those
  bullets were reclassified into `## Features`, leaving only main-backed fixes
  in `## Patches`.
- Fresh verification now passes: `bun lint:fix` reports no further fixes and
  `bun typecheck` completes successfully across the workspace.

## Progress Log

- [x] Loaded `planning-with-files`, `changeset`, `changeset-doc-sync`, and
      `convex` skill guidance relevant to this task
- [x] Captured modified + untracked branch inventory with `git status --short`
- [x] Identified doc-impact hotspots: `www/content/docs/cli.mdx`,
      `www/content/docs/templates.mdx`, and
      `packages/better-convex/skills/convex/references/setup/index.md`
- [x] Rewrote `.changeset/short-cameras-wave.md`
- [x] Synced impacted docs
- [x] Marked every checklist item as `updated` or `no change needed`
- [x] Reviewed 61 www docs: 2 updated, 59 no change needed
- [x] Reviewed 21 Convex skill docs: 1 updated, 20 no change needed
- [x] Re-audited edited narrative files for fabricated or merged snippets and
      corrected the remaining fused release-note examples
- [x] Re-audited `.changeset/short-cameras-wave.md` against
      `git diff $(git merge-base HEAD main)` plus the live worktree, removed
      the remaining fake resend/plugin runtime migrations, and corrected the
      ratelimit "before" import path
- [x] Re-audited every `## Patches` bullet against `main` and reclassified
      init/template/resend/plugin-plan/schema-extension bullets into
      `## Features`
- [x] Ran `bun lint:fix`; no further changes
- [x] Ran `bun typecheck`; it completed successfully
