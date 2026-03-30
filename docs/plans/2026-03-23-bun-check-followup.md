# Bun Check Follow-Up

## Goal

Get `bun check` green again after the auth peer + fixture sync fixes.

## Plan

- Add a failing server test for generated-path lookup accepting collapsed
  `generated/server` keys.
- Add a failing scenario test for auth template prepare ordering.
- Fix the lookup logic in `api-entry.ts`.
- Fix scenario prepare so auth template bootstrap installs local
  `kitcn` before rerunning `add auth`.
- Rerun targeted tests, then rerun `scenario:prepare next-auth`,
  `scenario:test -- next`, `scenario:test -- next-auth`, and `bun check`.

## Notes

- `bun check` currently fails in `test:runtime`.
- `next` fails on `Invalid generated path: generated.server`.
- `next-auth` prepare fails earlier on `Cannot find module 'kitcn/auth'`
  because bootstrap runs before the local package is installed.
