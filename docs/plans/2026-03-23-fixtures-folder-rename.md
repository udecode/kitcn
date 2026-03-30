# 2026-03-23 fixtures folder rename

## Goal

Rename the committed scaffold snapshot directory from `templates/` to
`fixtures/` and align the internal tooling/docs surface to that naming.

## Plan

1. Rename the committed snapshot directory and fixture tooling files.
2. Update scripts, workspace globs, internal path references, and help text.
3. Verify fixture sync/check and scenario runtime still resolve from the new
   location.

## Progress

- 2026-03-23: audited current ownership. The real path seam is `fixtures/*`
  as committed snapshots, `tooling/fixtures.ts`, `tooling/fixtures.test.ts`,
  `tooling/normalize-fixture-api-types.ts`, workspace globs in
  `package.json`, and internal docs/skills that still hardcode `fixtures/*`.
