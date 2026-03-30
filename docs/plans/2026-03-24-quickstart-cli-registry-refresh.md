# Quickstart CLI Registry Refresh

## Goal

Rewrite `www/content/docs/quickstart.mdx` around the current CLI-first
bootstrap path instead of the stale manual setup flow.

## Phases

- [completed] Audit `quickstart.mdx`, the style guide, and the current CLI
  bootstrap contract.
- [completed] Rewrite the quickstart around `init -t next`, one-shot
  `dev --bootstrap`, long-running `dev`, and the scaffolded `/convex` demo.
- [completed] Sync the mirrored Convex setup runbook with the new quickstart
  path.
- [completed] Run doc verification with `lint:fix` and stale-string searches.

## Notes

- The old quickstart was documenting manual folder setup the CLI already owns.
- The new quickstart teaches the real scaffolded files and starter demo instead
  of a hand-built fantasy app.
