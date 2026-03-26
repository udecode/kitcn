## Goal

Correct `www/content/docs/migrations/auth.mdx` so the raw Convex migration path
matches the actual `better-convex add auth --preset convex --yes` contract.

## Plan

- [x] Inspect the migration guide against the current raw Convex auth scaffold
- [x] Rewrite raw Convex migration guidance, checklist, and troubleshooting
- [x] Sync any directly related core auth skill wording
- [x] Run `bun lint:fix`

## Findings

- The migration guide told raw Convex users to replace generated
  `auth.config.ts` with static `jwks`, but the preset intentionally keeps
  `getAuthConfigProvider()` scaffolded.
- The guide treated `createAuthMutations` as universal, but the raw Convex
  preset keeps a smaller auth client without it.
- The migration checklist blended Better Convex-path and raw Convex-path rules.
- The schema link `/docs/auth/server#4-update-schema` is dead after the auth
  server doc rewrite.

## Progress

- Verified the raw Convex preset contract from
  `packages/better-convex/src/cli/cli.commands.ts`.
- Rewrote the raw Convex CLI tab to keep generated `auth.config.ts` scaffolded.
- Split the migration checklist into shared, Better Convex path, and raw Convex
  preset sections.
- Fixed the dead auth schema link to the new auth server anchor.
- Synced related auth wording in `packages/better-convex/skills/convex/SKILL.md`
  and `references/features/auth.md`.
