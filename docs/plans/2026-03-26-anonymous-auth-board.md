# Anonymous Auth Coverage Board Failures

## Goal

Fix the two failing Better Auth anonymous full-surface coverage probes in the
example app without papering over the actual package or demo-auth bug.

## Plan

1. Inspect existing learnings plus the auth coverage runner and example auth
   wiring.
2. Reproduce the two failing probes outside the UI.
3. Add or update tests at the real seam.
4. Apply the minimal fix.
5. Verify with targeted tests, package build/typecheck, and live runtime proof.

## Findings

- The failing rows were not hitting the real Better Auth anonymous link flow.
  `authDemo.ts` used `ctx.auth.api.signUpEmail(...)`, which skips the
  plugin's HTTP `after` hook path where `onLinkAccount` and default anonymous
  source deletion run.
- The unsupported `delete anonymous endpoint` row was noise. This repo's
  Better Auth version does not expose that API, so the board should not claim
  coverage for it.
