## Goal

Rewrite `www/content/docs/auth/server.mdx` into a single CLI-first auth setup
guide that matches `docs/solutions/style.md`, then sync the mirrored Convex
skill refs and remove stale `dev --bootstrap` wording in the touched auth/setup
docs.

## Plan

- [x] Inspect the current auth server doc, style guide, and matching skill refs
- [x] Rewrite the public auth server doc around `init` + `add auth`
- [x] Sync compressed Convex skill refs to the new doc contract
- [x] Remove stale `dev --bootstrap` wording in the touched setup/auth docs
- [x] Run `bun lint:fix`

## Findings

- `www/content/docs/auth/server.mdx` is still manual-first and starts with
  package installation instead of the CLI path.
- The `CLI-managed` vs `Manual` schema tabs make the wrong thing look like an
  equal choice.
- The auth scaffold already owns more than the page claims: `auth.config.ts`,
  `auth.ts`, schema patches, HTTP route wiring, client wiring, and local auth
  bootstrap.
- Stale `dev --bootstrap` wording still exists in public docs and mirrored skill
  refs.

## Progress

- Loaded source docs, style guide, scaffold templates, and CLI scaffold tests.
- Confirmed the doc rewrite should use the real scaffold templates:
  `getEnv()`-based kitcn auth config/runtime, `add auth --yes`, and
  `add auth --only schema --yes`.
- Rewrote `www/content/docs/auth/server.mdx` into a single CLI-first flow.
- Synced `packages/kitcn/skills/convex/references/setup/auth.md` and
  `packages/kitcn/skills/convex/references/features/auth.md`.
- Removed the old schema tabs/manual-first framing and replaced it with a raw
  Convex section plus a manual escape hatch link.
- Ran `bun lint:fix` successfully.
