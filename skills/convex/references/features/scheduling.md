# Scheduling

> Prerequisites: `setup/server.md`

Cron jobs and scheduled functions for background processing in Convex. Basics → SKILL.md Section 10. This file adds cron expressions, handler templates, job status API, error handling detail.

## Overview

| Type | Use For |
|------|---------|
| Cron jobs | Recurring tasks on a fixed schedule |
| Scheduled functions | One-time delayed execution |

View scheduled jobs in [Dashboard](https://dashboard.convex.dev) → **Schedules** tab.

### When to Use

| Scenario | Cron Jobs | Scheduled Functions |
|----------|-----------|---------------------|
| Daily cleanup | Fixed schedule | |
| Send email after signup | | `caller.schedule.now.*` |
| Subscription expiration | | `caller.schedule.at(timestamp).*` |
| Hourly analytics | Fixed schedule | |
| Reminder notifications | | User-defined time |
| Order processing delay | | `caller.schedule.after(5000).*` |

**Tip:** Use `caller.schedule.now.*` to trigger work immediately after a mutation commits.

## Cron Jobs

### Setup

```ts
// convex/functions/crons.ts
import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();

// Run every 2 hours
crons.interval('cleanup stale data', { hours: 2 }, internal.crons.cleanupStaleData, {});

// Run at specific times using cron syntax
crons.cron('daily report', '0 9 * * *', internal.crons.generateDailyReport, {});

export default crons;
```

**Note:** Always import `internal` from `./_generated/api`, even for functions in the same file.

### Cron Expressions

| Pattern | Description |
|---------|-------------|
| `* * * * *` | Every minute |
| `*/15 * * * *` | Every 15 minutes |
| `0 * * * *` | Every hour |
| `0 0 * * *` | Daily at midnight |
| `0 9 * * *` | Daily at 9 AM |
| `0 9 * * 1-5` | Weekdays at 9 AM |
| `0 0 1 * *` | First day of month |

Format: `minute hour day-of-month month day-of-week`. Runs in **UTC**. Minimum interval is 1 minute.

### Handler Implementation

```ts
// convex/functions/crons.ts
import { z } from 'zod';
import { privateMutation, privateAction } from '../lib/crpc';
import { createAnalyticsCaller } from './generated/analytics.runtime';
import { createReportsCaller } from './generated/reports.runtime';

export const cleanupStaleData = privateMutation
  .input(z.object({}))
  .output(z.object({ deletedCount: z.number() }))
  .mutation(async ({ ctx }) => {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const staleSessions = await ctx.orm.query.session.findMany({
      where: { lastActiveAt: { lt: thirtyDaysAgo } },
      limit: 1000,
    });
    for (const sessionRow of staleSessions) {
      await ctx.orm.delete(session).where(eq(session.id, sessionRow.id));
    }
    return { deletedCount: staleSessions.length };
  });

export const generateDailyReport = privateAction
  .input(z.object({}))
  
  .action(async ({ ctx }) => {
    const analyticsCaller = createAnalyticsCaller(ctx);
    const reportsCaller = createReportsCaller(ctx);
    const stats = await analyticsCaller.actions.getDailyStats({});
    await reportsCaller.schedule.now.create({ type: 'daily', data: stats });
    return null;
  });
```

## Scheduled Functions

### Key Concepts

| Concept | Description |
|---------|-------------|
| Atomicity | Scheduling from mutations is atomic — if mutation fails, nothing is scheduled |
| Non-atomic in actions | Scheduled functions from actions run even if the action fails |
| Limits | Single function can schedule up to 1000 functions with 8MB total argument size |
| Auth not propagated | Pass user info as arguments if needed |
| Results retention | Available for 7 days after completion |

**Warning:** Auth context is NOT available in scheduled functions. Pass `userId` or other auth data as arguments.

Use `caller.schedule.*` when scheduling cRPC procedures. Use `ctx.scheduler.*` only when you must schedule a raw `internal.*` Convex function.

### caller.schedule.after

Schedule after a delay (milliseconds):

```ts
export const processOrder = authMutation
  .input(z.object({ orderId: z.string() }))
  
  .mutation(async ({ ctx, input }) => {
    const caller = createOrdersCaller(ctx);
    await ctx.orm.update(orders).set({ status: 'processing' }).where(eq(orders.id, input.orderId));

    // Run after 5 seconds
    await caller.schedule.after(5000).charge({ orderId: input.orderId });
    return null;
  });
```

### Immediate Execution

`caller.schedule.now.*` triggers work immediately after mutation commits:

```ts
export const createItem = authMutation
  .input(z.object({ name: z.string() }))
  .output(z.string())
  .mutation(async ({ ctx, input }) => {
    const caller = createItemsCaller(ctx);
    const [row] = await ctx.orm.insert(items).values({ name: input.name }).returning({ id: items.id });

    // Action runs immediately after mutation commits
    await caller.schedule.now.sendNotification({ itemId: row.id });
    return row.id;
  });
```

### caller.schedule.at

Schedule at a specific Unix timestamp (ms):

```ts
export const scheduleReminder = authMutation
  .input(z.object({ message: z.string(), sendAt: z.number() }))
  
  .mutation(async ({ ctx, input }) => {
    const caller = createRemindersCaller(ctx);
    if (input.sendAt <= Date.now()) {
      throw new CRPCError({ code: 'BAD_REQUEST', message: 'Reminder time must be in the future' });
    }
    await caller.schedule.at(input.sendAt).send({ message: input.message });
    return null;
  });
```

### Canceling Scheduled Functions

Store the job ID to cancel later:

```ts
export const createSubscription = authMutation
  .input(z.object({ planId: z.string() }))
  .output(z.string())
  .mutation(async ({ ctx, input }) => {
    const caller = createSubscriptionsCaller(ctx);
    // Schedule expiration in 30 days
    const expirationJobId = await caller.schedule.after(30 * 24 * 60 * 60 * 1000).expire({ userId: ctx.userId });

    const [row] = await ctx.orm
      .insert(subscriptions)
      .values({ userId: ctx.userId, planId: input.planId, expirationJobId })
      .returning({ id: subscriptions.id });
    return row.id;
  });

export const cancelSubscription = authMutation
  .input(z.object({ subscriptionId: z.string() }))
  
  .mutation(async ({ ctx, input }) => {
    const caller = createSubscriptionsCaller(ctx);
    const subscription = await ctx.orm.query.subscriptions.findFirst({ where: { id: input.subscriptionId } });
    if (!subscription) throw new CRPCError({ code: 'NOT_FOUND', message: 'Subscription not found' });

    if (subscription.expirationJobId) {
      await caller.schedule.cancel(subscription.expirationJobId);
    }
    await ctx.orm.delete(subscriptions).where(eq(subscriptions.id, subscription.id));
    return null;
  });
```

## Checking Status

Query `_scheduled_functions` system table:

```ts
export const getJobStatus = publicQuery
  .input(z.object({ jobId: z.string() }))
  .output(z.object({
    name: z.string(),
    scheduledTime: z.number(),
    completedTime: z.number().optional(),
    state: z.object({ kind: z.enum(['pending', 'inProgress', 'success', 'failed', 'canceled']) }),
  }).nullable())
  .query(async ({ ctx, input }) => {
    return await ctx.orm.system.get(input.jobId);
  });

export const listPendingJobs = publicQuery
  .input(z.object({}))
  .output(z.array(z.object({ id: z.string(), name: z.string(), scheduledTime: z.number() })))
  .query(async ({ ctx }) => {
    const jobs = await ctx.orm.system
      .query('_scheduled_functions')
      .filter((q) => q.eq(q.field('state.kind'), 'pending'))
      .collect();
    return jobs.map(({ id, name, scheduledTime }) => ({ id, name, scheduledTime }));
  });
```

### Job States

| State | Description |
|-------|-------------|
| `pending` | Not started yet |
| `inProgress` | Currently running (actions only) |
| `success` | Completed successfully |
| `failed` | Hit an error |
| `canceled` | Canceled via dashboard or `caller.schedule.cancel()` |

## Error Handling

### Mutations

- **Automatic retry** for internal Convex errors
- **Guaranteed execution** — once scheduled, executes exactly once
- **Permanent failure** only on developer errors

### Actions

- **No automatic retry** — actions may have side effects
- **At most once** execution
- For critical actions, implement manual retry with exponential backoff

## Best Practices

1. **Use internal procedures/functions** — prevent external access to scheduled work
2. **Store job IDs** — when you need to cancel scheduled functions
3. **Check conditions** — target may be deleted before execution
4. **Consider idempotency** — scheduled functions might run multiple times
5. **Pass auth info** — auth not propagated, pass user data as arguments
6. **Use `caller.schedule.now.*`** — trigger work after mutation commits
