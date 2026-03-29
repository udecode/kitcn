---
title: Concave alpha.14 still needs auth ref and run output guards
category: integration-issues
tags:
  - concave
  - auth
  - codegen
  - cli
  - scenarios
  - dev
symptoms:
  - `scenario:test -- next-auth` fails with `undefined is not an object (evaluating 'authFunctions.findOne')`
  - `kitcn dev --backend concave` warns that migration or aggregate kickoff failed because JSON parsing broke
  - Concave alpha.14 removes old parity gaps, but prepared auth scenarios still fail after the old shims are deleted
module: concave-dev
resolved: 2026-03-23
---

# Concave alpha.14 still needs auth ref and run output guards

## Problem

Concave alpha.14 fixed the big parity misses we were carrying local bandaids
for:

- `concave dev` now defaults to `3210`
- `concave run` now succeeds for `generated/server:migrationRun` and
  `generated/server:aggregateBackfill`
- `concave codegen --static` now emits the `api.d.ts` shape we wanted

After removing those shims, two smaller Concave-specific gaps still showed up.

### 1. Generated auth runtime could not find its internal refs

Prepared auth scenarios still generated:

```js
export const internal = {};
```

in `_generated/api.js`.

That made generated auth runtime accessors like `authFunctions.findOne`
undefined even though the real function paths were still known.

### 2. `concave run` output stopped being machine-clean JSON

alpha.14 started printing a human preamble before the JSON result:

- `Running ...`
- `Args: ...`
- `URL: ...`
- `Success`
- pretty JSON body

kitcn was still parsing stdout as if it were raw JSON, so startup
migration and aggregate calls warned even when the backend result itself was
fine.

## Root Cause

The old parity fixes were dead, but Concave still drifted from Convex in two
smaller places:

1. generated auth internals were omitted from `_generated/api.js`
2. `concave run` optimized for humans, not machine parsing

Neither issue needed another broad Concave abstraction layer. Both needed tight
patches at the exact seams that broke.

## Solution

### Synthesize generated auth refs when Concave leaves `internal` empty

Generated auth runtime now falls back to
`createGeneratedFunctionReference(...)` for its known internal function paths
instead of trusting Concave's empty `internal` export.

That keeps the fallback narrow:

- only generated auth runtime uses it
- only when Concave omits the refs
- Convex behavior stays untouched

### Parse a trailing JSON block from `concave run`

Backend run parsing now accepts both:

- raw JSON stdout
- a human preamble followed by a JSON block

That keeps Convex output unchanged while letting Concave alpha.14 stay verbose
without breaking kitcn startup hooks.

## Verification

- `bun test packages/kitcn/src/auth/generated-contract.test.ts packages/kitcn/src/cli/commands/migrate.test.ts`
- `bun run test:concave`
- `bun run scenario:test -- next-auth`
- `bun run scenario:test -- next`
- `bun check`

Observed live behavior after the fix:

- `scenario:test -- next-auth` passes again
- auth smoke and browser auth both pass on Concave
- startup migration and aggregate hooks no longer warn about JSON parsing
- the old `--port 3210`, `/api/execute`, and `api.d.ts` override shims stay
  deleted

## Prevention

1. When upstream parity improves, remove the old bandaid first, then rerun the
   real scenario gates. Dead shims can hide the next smaller mismatch.
2. Do not trust Concave `_generated/*` output to match Convex byte-for-byte
   just because one headline parity issue landed.
3. Do not add generic fallback sludge. Patch the narrow seam, write the delete
   condition, and move on.

## Files Changed

- `packages/kitcn/src/auth/generated-contract.ts`
- `packages/kitcn/src/auth/generated-contract.test.ts`
- `packages/kitcn/src/cli/backend-core.ts`
- `packages/kitcn/src/cli/commands/migrate.test.ts`
- `.claude/skills/concave-parity/concave-parity.mdc`

## Related

- `docs/solutions/integration-issues/concave-internal-runtime-calls-20260322.md`
- `docs/solutions/integration-issues/concave-local-dev-auth-cycle-20260319.md`
