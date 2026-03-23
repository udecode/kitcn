---
title: create-convex-bare scenario must stay a bare runtime smoke
category: integration-issues
tags:
  - scenarios
  - runtime
  - fixtures
  - concave
symptoms:
  - `bun run scenario:test -- create-convex-bare` fails during prepare
  - `bun check` dies inside `test:runtime`
  - the error says `Could not detect a supported app scaffold`
module: scenarios
resolved: 2026-03-23
---

# create-convex-bare scenario must stay a bare runtime smoke

## Problem

`test:runtime` started failing even though the generated runtime typing work was
already fixed.

The last blocker was `create-convex-bare`.

That scenario copied a raw Convex fixture, then tried to run:

```bash
better-convex init --yes
```

That no longer matches the product contract. `better-convex init --yes` now
adopts supported Next or Vite app scaffolds in place. A bare Convex fixture is
not one of those.

So the runtime gate was lying about what this scenario was proving.

## Root Cause

The scenario definition still had an old bootstrap step:

```txt
setup: [["init", "--yes"]]
```

That made sense when the old bootstrap surface was broader. After the hard cut
to `init`, it became invalid for bare Convex fixtures.

The other raw `create-convex-*` fixtures still have supported app shells, so
their adoption step remains valid. `create-convex-bare` is the outlier.

## Solution

Treat `create-convex-bare` as what it actually is: a bare runtime smoke.

The scenario now does three things only:

1. copy the committed fixture into `tmp/scenarios/create-convex-bare/project`
2. install the local `better-convex` package
3. boot local dev and wait for readiness

It no longer runs `better-convex init --yes`.

That keeps the runtime gate aligned with the current CLI contract instead of
forcing a fake adoption path onto an unsupported fixture.

## Verification

- `bun test tooling/scenarios.test.ts`
- `bun run scenario:test -- create-convex-bare`
- `bun typecheck`
- `bun check`

## Prevention

1. If a scenario copies a raw fixture, check that every bootstrap step still
   matches the current public CLI contract.
2. Do not make `scenario:test` prove adoption for fixtures that are only meant
   to prove runtime.
3. When `init` gets narrower, raw scenario setup must get narrower too.
