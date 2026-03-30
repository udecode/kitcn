# 2026-03-29 Check CI Fix

## Goal

Confirm whether PR CI is green after the AppleDouble scrubber fix. If not, fix
the remaining failure and verify it locally.

## Steps

1. Inspect the current PR checks and logs.
2. Identify any remaining failing lane.
3. Patch the real root cause.
4. Re-run the matching local verification.
