import '../lib/polar-polyfills';

import { eq } from 'better-convex/orm';
import { CRPCError } from 'better-convex/server';
import { z } from 'zod';
import {
  authAction,
  authQuery,
  privateMutation,
  privateQuery,
} from '../lib/crpc';
import { getPolarClient } from '../lib/polar-client';
import { createPolarSubscriptionCaller } from './generated/polarSubscription.runtime';
import { subscriptionsTable } from './schema';

const subscriptionSchema = z.object({
  amount: z.number().nullish(),
  cancelAtPeriodEnd: z.boolean(),
  checkoutId: z.string().nullish(),
  createdAt: z.string(),
  currency: z.string().nullish(),
  currentPeriodEnd: z.string().nullish(),
  currentPeriodStart: z.string(),
  customerCancellationComment: z.string().nullish(),
  customerCancellationReason: z.string().nullish(),
  endedAt: z.string().nullish(),
  metadata: z.record(z.string(), z.unknown()),
  modifiedAt: z.string().nullish(),
  organizationId: z.string(),
  priceId: z.optional(z.string()),
  productId: z.string(),
  recurringInterval: z.string().nullish(),
  startedAt: z.string().nullish(),
  status: z.string(),
  subscriptionId: z.string(),
  userId: z.string(),
});

// Create organization subscription (called from webhook)
export const createSubscription = privateMutation
  .input(z.object({ subscription: subscriptionSchema }))

  .mutation(async ({ ctx, input: args }) => {
    // Check if subscription already exists
    const existing = await ctx.orm.query.subscriptions.findFirst({
      where: { subscriptionId: args.subscription.subscriptionId },
    });

    if (existing) {
      throw new CRPCError({
        code: 'CONFLICT',
        message: `Subscription ${args.subscription.subscriptionId} already exists`,
      });
    }

    // Validate organizationId
    if (!args.subscription.organizationId) {
      throw new CRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'All subscriptions must be tied to an organization',
      });
    }

    // Check for existing active subscription
    const existingOrgSubscription = await ctx.orm.query.subscriptions.findFirst(
      {
        where: {
          organizationId: args.subscription.organizationId,
          status: 'active',
        },
      }
    );

    if (existingOrgSubscription) {
      throw new CRPCError({
        code: 'CONFLICT',
        message: 'Organization already has an active subscription',
      });
    }

    await ctx.orm.insert(subscriptionsTable).values(args.subscription);
  });

// Update subscription (called from webhook)
export const updateSubscription = privateMutation
  .input(z.object({ subscription: subscriptionSchema }))
  .output(
    z.object({
      periodChanged: z.boolean(),
      subscriptionEnded: z.boolean(),
      updated: z.boolean(),
    })
  )
  .mutation(async ({ ctx, input: args }) => {
    const existing = await ctx.orm.query.subscriptions.findFirst({
      where: { subscriptionId: args.subscription.subscriptionId },
    });

    if (!existing) {
      return { periodChanged: false, subscriptionEnded: false, updated: false };
    }

    const periodChanged =
      existing.currentPeriodEnd !== args.subscription.currentPeriodEnd;
    const subscriptionEnded = !!args.subscription.endedAt && !existing.endedAt;

    await ctx.orm
      .update(subscriptionsTable)
      .set(args.subscription)
      .where(eq(subscriptionsTable.id, existing.id));

    return { periodChanged, subscriptionEnded, updated: true };
  });

// Get active subscription for user
export const getActiveSubscription = privateQuery
  .input(z.object({ userId: z.string() }))
  .output(
    z
      .object({
        cancelAtPeriodEnd: z.boolean(),
        currentPeriodEnd: z.string().nullish(),
        subscriptionId: z.string(),
      })
      .nullable()
  )
  .query(async ({ ctx, input: args }) => {
    const subscription = await ctx.orm.query.subscriptions.findFirst({
      where: { userId: args.userId, status: 'active' },
    });

    if (!subscription) return null;

    return {
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      currentPeriodEnd: subscription.currentPeriodEnd,
      subscriptionId: subscription.subscriptionId,
    };
  });

// Get organization subscription (for UI)
export const getOrganizationSubscription = authQuery
  .input(z.object({ organizationId: z.string() }))
  .output(
    z
      .object({
        cancelAtPeriodEnd: z.boolean(),
        currentPeriodEnd: z.string().nullish(),
        status: z.string(),
        subscriptionId: z.string(),
      })
      .nullable()
  )
  .query(async ({ ctx, input: args }) => {
    const subscription = await ctx.orm.query.subscriptions.findFirst({
      where: { organizationId: args.organizationId, status: 'active' },
    });

    if (!subscription) return null;

    return {
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      currentPeriodEnd: subscription.currentPeriodEnd,
      status: subscription.status,
      subscriptionId: subscription.subscriptionId,
    };
  });

// Cancel subscription (user action)
export const cancelSubscription = authAction
  .output(z.object({ message: z.string(), success: z.boolean() }))
  .action(async ({ ctx }) => {
    const polar = getPolarClient();
    const caller = createPolarSubscriptionCaller(ctx);

    const subscription = await caller.getActiveSubscription({
      userId: ctx.userId!,
    });

    if (!subscription) {
      throw new CRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'No active subscription found',
      });
    }

    await polar.subscriptions.update({
      id: subscription.subscriptionId,
      subscriptionUpdate: { cancelAtPeriodEnd: true },
    });

    return { message: 'Subscription cancelled successfully', success: true };
  });

// Resume subscription (user action)
export const resumeSubscription = authAction
  .output(z.object({ message: z.string(), success: z.boolean() }))
  .action(async ({ ctx }) => {
    const polar = getPolarClient();
    const caller = createPolarSubscriptionCaller(ctx);

    const subscription = await caller.getActiveSubscription({
      userId: ctx.userId!,
    });

    if (!subscription) {
      throw new CRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'No active subscription found',
      });
    }

    if (!subscription.cancelAtPeriodEnd) {
      throw new CRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'Subscription is not set to cancel',
      });
    }

    await polar.subscriptions.update({
      id: subscription.subscriptionId,
      subscriptionUpdate: { cancelAtPeriodEnd: false },
    });

    return { message: 'Subscription resumed successfully', success: true };
  });
