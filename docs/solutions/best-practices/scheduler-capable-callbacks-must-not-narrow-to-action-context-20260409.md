---
title: Scheduler-capable callbacks must not narrow generic ctx to ActionCtx
date: 2026-04-09
category: best-practices
module: auth callbacks
problem_type: best_practice
component: authentication
severity: medium
applies_when:
  - a callback receives `GenericCtx` or `MutationCtx | ActionCtx`
  - the real goal is scheduling follow-up work, not calling `caller.actions.*`
  - auth or plugin hooks can run from client-driven mutation flows
tags: [scheduler, actionctx, mutationctx, auth, caller, scheduling, context]
---

# Scheduler-capable callbacks must not narrow generic ctx to ActionCtx

## Context

Some auth and plugin callbacks look action-shaped because they enqueue side
effects, but they can still run from mutation-driven flows.

That makes `requireActionCtx(ctx)` a trap when the callback only needs
`ctx.scheduler` or `caller.schedule.*`.

## Guidance

Use `requireSchedulerCtx(ctx)` for schedule-capable flows.

- Use `requireActionCtx(ctx)` only when the code truly needs
  `caller.actions.*` or `ctx.runAction`.
- Use `requireSchedulerCtx(ctx)` when the callback can run from mutation or
  action context and only needs scheduling.
- For generated callers, prefer `caller.schedule.now|after|at.*` from
  mutation-or-action paths.
- For raw Convex refs, use `ctx.scheduler.runAfter(...)` after narrowing with
  `requireSchedulerCtx(ctx)`.

## Why This Matters

Client -> mutation chains do not magically become action context just because
they enqueue action work later.

If you narrow that path to `ActionCtx`, the runtime throws `Action context
required` even though scheduling was valid all along. The honest seam is
"scheduler-capable" rather than "action-only".

## When to Apply

- Better Auth plugin callbacks like `sendInvitationEmail`
- generic `defineAuth((ctx) => ...)` code paths
- shared helpers that accept `MutationCtx | ActionCtx`
- any code that wants to enqueue work but does not need an action return value

## Examples

Before, the callback lied about the required ctx:

```ts
const actionCtx = requireActionCtx(ctx);
await actionCtx.scheduler.runAfter(0, internal.jobs.reindex, { force: true });
```

After, the callback narrows to the real capability:

```ts
const schedulerCtx = requireSchedulerCtx(ctx);
await schedulerCtx.scheduler.runAfter(0, internal.jobs.reindex, {
  force: true,
});
```

For generated callers, schedule the action instead of forcing `caller.actions.*`
from a mutation-capable path:

```ts
const caller = createJobsCaller(requireSchedulerCtx(ctx));
await caller.schedule.now.reindex({ force: true });
```

## Related

- [Shared middleware must carry only context deltas across query and mutation chains](../logic-errors/shared-middleware-must-carry-only-context-delta-20260407.md)
- [/docs/server/server-side-calls](/docs/server/server-side-calls)
- [/docs/auth/plugins/organizations](/docs/auth/plugins/organizations)
