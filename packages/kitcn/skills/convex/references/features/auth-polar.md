# Auth Polar Plugin

Polar payment/subscription integration via Better Auth plugin. Webhook-driven subscription truth, `ctx.orm` for billing state, feature gating by active subscription.

Prerequisites: `setup/auth.md`, `setup/server.md`.

See [Better Auth Polar Plugin](https://www.better-auth.com/docs/plugins/polar) for full API reference.

## Install

```bash
bun add @polar-sh/better-auth @polar-sh/sdk buffer
```

## Server Config

### Polyfills (Conditional)

Convex needs Buffer polyfill for Polar SDK:

```ts
// convex/lib/polar-polyfills.ts
import { Buffer as BufferPolyfill } from 'buffer';
globalThis.Buffer = BufferPolyfill;
```

### Polar Client

```ts
// convex/lib/polar-client.ts
import { Polar } from '@polar-sh/sdk';

export const getPolarClient = () =>
  new Polar({
    accessToken: process.env.POLAR_ACCESS_TOKEN!,
    server: process.env.POLAR_SERVER === 'production' ? 'production' : 'sandbox',
  });
```

### Better Auth with Polar Plugin

```ts
// convex/functions/auth.ts
// IMPORTANT: Import polyfills FIRST
import '../lib/polar-polyfills';

import { checkout, polar, portal, usage, webhooks } from '@polar-sh/better-auth';
import { Polar } from '@polar-sh/sdk';
import { createPolarCustomerCaller } from './generated/polarCustomer.runtime';
import { createPolarSubscriptionCaller } from './generated/polarSubscription.runtime';
import { defineAuth } from './generated/auth';

export default defineAuth((ctx) => ({
    // ... existing config
    plugins: [
      polar({
        client: new Polar({
          accessToken: process.env.POLAR_ACCESS_TOKEN!,
          server: process.env.POLAR_SERVER === 'production' ? 'production' : 'sandbox',
        }),
        // createCustomerOnSignUp: true, // Use trigger instead (recommended for Convex)
        use: [
          checkout({
            authenticatedUsersOnly: true,
            products: [
              { productId: process.env.POLAR_PRODUCT_PREMIUM!, slug: 'premium' },
            ],
            successUrl: `${process.env.SITE_URL}/success?checkout_id={CHECKOUT_ID}`,
            theme: 'light',
          }),
          portal(),
          usage(),
          webhooks({
            secret: process.env.POLAR_WEBHOOK_SECRET!,
            onCustomerCreated: async (payload) => {
              const userId = payload?.data.externalId;
              if (!userId) return;
              const caller = createPolarCustomerCaller(ctx);
              await caller.updateUserPolarCustomerId({
                customerId: payload.data.id, userId,
              });
            },
            onSubscriptionCreated: async (payload) => {
              if (!payload.data.customer.externalId) return;
              const caller = createPolarSubscriptionCaller(ctx);
              await caller.createSubscription({
                subscription: convertToDatabaseSubscription(payload.data),
              });
            },
            onSubscriptionUpdated: async (payload) => {
              if (!payload.data.customer.externalId) return;
              const caller = createPolarSubscriptionCaller(ctx);
              await caller.updateSubscription({
                subscription: convertToDatabaseSubscription(payload.data),
              });
            },
          }),
        ],
      }),
    ],
  }));
```

### Customer Creation via Trigger

Create Polar customer asynchronously on signup:

```ts
// convex/functions/auth.ts
import { defineAuth } from './generated/auth';

export default defineAuth((ctx) => ({
  triggers: {
    user: {
      create: {
        after: async (user, triggerCtx) => {
          const caller = createPolarCustomerCaller(ctx);
          await caller.schedule.now.createCustomer({
            email: user.email,
            name: user.name || user.username,
            userId: user.id,
          });
        },
      },
    },
  },
}));
```

### Customer Deletion Sync

```ts
// convex/functions/auth.ts
import { defineAuth } from './generated/auth';

export default defineAuth((ctx) => ({
    user: {
      deleteUser: {
        enabled: true,
        afterDelete: async (user) => {
          const polar = getPolarClient();
          await polar.customers.deleteExternal({ externalId: user.id });
        },
      },
    },
  }));
```

## Client Config

```ts
// src/lib/convex/auth-client.ts
import { polarClient } from '@polar-sh/better-auth';

export const authClient = createAuthClient({
  plugins: [polarClient()],
});
```

## Schema

```ts
// convex/functions/schema.ts
import { boolean, convexTable, defineSchema, id, index, integer, json, text } from 'kitcn/orm';

// User table — add Polar customer ID
export const user = convexTable('user', {
  // ... existing fields
  customerId: text(), // Polar customer ID
}, (t) => [index('customerId').on(t.customerId)]);

// Subscriptions table — organization-based
export const subscriptions = convexTable('subscriptions', {
  subscriptionId: text().notNull(),
  organizationId: text().notNull(),
  userId: id('user').notNull(),
  productId: text().notNull(),
  priceId: text(),
  status: text().notNull(), // 'active', 'canceled', 'trialing', 'past_due'
  amount: integer(),
  currency: text(),
  recurringInterval: text(),
  currentPeriodStart: text().notNull(),
  currentPeriodEnd: text(),
  cancelAtPeriodEnd: boolean().notNull(),
  startedAt: text(),
  endedAt: text(),
  createdAt: text().notNull(),
  modifiedAt: text(),
  checkoutId: text(),
  metadata: json<Record<string, unknown>>(),
  customerCancellationReason: text(),
  customerCancellationComment: text(),
}, (t) => [
  index('subscriptionId').on(t.subscriptionId),
  index('organizationId').on(t.organizationId),
  index('organizationId_status').on(t.organizationId, t.status),
  index('userId_status').on(t.userId, t.status),
]);
```

## Subscription Conversion Helper

```ts
// convex/lib/polar-helpers.ts
import type { Subscription } from '@polar-sh/sdk/models/components/subscription';
import type { WithoutSystemFields } from 'convex/server';
import type { Doc, Id } from '../functions/_generated/dataModel';

export const convertToDatabaseSubscription = (
  subscription: Subscription
): WithoutSystemFields<Doc<'subscriptions'>> => {
  const organizationId = subscription.metadata?.referenceId as Id<'organization'>;
  if (!organizationId) {
    throw new Error('Subscription missing organizationId in metadata.referenceId');
  }
  return {
    amount: subscription.amount,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    checkoutId: subscription.checkoutId,
    createdAt: subscription.createdAt.toISOString(),
    currency: subscription.currency,
    currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
    currentPeriodStart: subscription.currentPeriodStart.toISOString(),
    customerCancellationComment: subscription.customerCancellationComment,
    customerCancellationReason: subscription.customerCancellationReason,
    endedAt: subscription.endedAt?.toISOString() ?? null,
    metadata: subscription.metadata ?? {},
    modifiedAt: subscription.modifiedAt?.toISOString() ?? null,
    organizationId,
    productId: subscription.productId,
    recurringInterval: subscription.recurringInterval,
    startedAt: subscription.startedAt?.toISOString() ?? null,
    status: subscription.status,
    subscriptionId: subscription.id,
    // IMPORTANT: Use externalId, not metadata.userId
    userId: subscription.customer.externalId as Id<'user'>,
  };
};
```

## Shared Product Catalog (Example-Parity Optional)

If UI and backend both need plan metadata, keep a shared module:

```ts
// convex/shared/polar-shared.ts
export const SubscriptionPlan = {
  Free: 'free',
  Premium: 'premium',
} as const;

export type SubscriptionPlan =
  (typeof SubscriptionPlan)[keyof typeof SubscriptionPlan];

export const PLANS = {
  [SubscriptionPlan.Free]: { key: SubscriptionPlan.Free, price: 0, credits: 0 },
  [SubscriptionPlan.Premium]: {
    key: SubscriptionPlan.Premium,
    price: 20,
    credits: 2000,
    productId: process.env.POLAR_PRODUCT_PREMIUM ?? 'premium',
  },
} as const;
```

Use this for UI pricing cards and server-side entitlement mapping.

## Checkout Plugin

```ts
checkout({
  products: [
    { productId: 'uuid-from-polar', slug: 'pro' },
    { productId: 'uuid-from-polar', slug: 'enterprise' },
  ],
  successUrl: `${process.env.SITE_URL}/success?checkout_id={CHECKOUT_ID}`,
  returnUrl: `${process.env.SITE_URL}`, // Optional back button
  authenticatedUsersOnly: true,
  theme: 'light', // or 'dark'
}),
```

### Client Checkout

```ts
// Using slug
await authClient.checkout({ slug: 'pro', referenceId: organizationId });

// Using product ID
await authClient.checkout({
  products: ['e651f46d-ac20-4f26-b769-ad088b123df2'],
  referenceId: organizationId,
});
```

### Organization-Based Checkout

```tsx
const handleSubscribe = async () => {
  const activeOrganizationId = user.activeOrganization?.id;
  if (!activeOrganizationId) { toast.error('Please select an organization'); return; }

  try {
    if (currentUser.plan) {
      await authClient.customer.portal(); // Manage existing
    } else {
      await authClient.checkout({ slug: 'premium', referenceId: activeOrganizationId });
    }
  } catch (error) {
    console.error('Polar checkout error:', error);
    toast.error('Failed to open checkout');
  }
};
```

## Portal Plugin

```ts
await authClient.customer.portal();              // Open self-service portal
const { data } = await authClient.customer.state(); // Customer data + subscriptions + benefits + meters

// List APIs
const { data: benefits } = await authClient.customer.benefits.list({ query: { page: 1, limit: 10 } });
const { data: orders } = await authClient.customer.orders.list({
  query: { page: 1, limit: 10, productBillingType: 'one_time' }, // or 'recurring'
});
const { data: subs } = await authClient.customer.subscriptions.list({
  query: { page: 1, limit: 10, active: true },
});

// Organization subscriptions
const orgId = (await authClient.organization.list())?.data?.[0]?.id;
const { data: orgSubs } = await authClient.customer.orders.list({
  query: { page: 1, limit: 10, active: true, referenceId: orgId },
});
const userShouldHaveAccess = orgSubs.some(
  (sub) => sub.productId === process.env.NEXT_PUBLIC_POLAR_PRODUCT_PREMIUM
);
```

## Usage Plugin

```ts
// Event ingestion
const { data } = await authClient.usage.ingestion({
  event: 'file-uploads',
  metadata: { uploadedFiles: 12, totalSizeBytes: 1024000 },
});

// Customer meters (consumed units, credited units, balance)
const { data: meters } = await authClient.usage.meters.list({ query: { page: 1, limit: 10 } });
```

## Webhooks Plugin

All available handlers:

```ts
webhooks({
  secret: process.env.POLAR_WEBHOOK_SECRET!,
  // Checkout
  onCheckoutCreated, onCheckoutUpdated,
  // Orders
  onOrderCreated, onOrderPaid, onOrderRefunded,
  // Refunds
  onRefundCreated, onRefundUpdated,
  // Subscriptions
  onSubscriptionCreated, onSubscriptionUpdated, onSubscriptionActive,
  onSubscriptionCanceled, onSubscriptionRevoked, onSubscriptionUncanceled,
  // Products
  onProductCreated, onProductUpdated,
  // Benefits
  onBenefitCreated, onBenefitUpdated,
  onBenefitGrantCreated, onBenefitGrantUpdated, onBenefitGrantRevoked,
  // Customers
  onCustomerCreated, onCustomerUpdated, onCustomerDeleted, onCustomerStateChanged,
  // Catch-all
  onPayload,
}),
```

## Convex Functions

### Customer Management

```ts
// convex/functions/polarCustomer.ts
import '../lib/polar-polyfills';
import { CRPCError } from 'kitcn/server';
import { z } from 'zod';
import { privateAction, privateMutation } from '../lib/crpc';
import { getPolarClient } from '../lib/polar-client';

// Create Polar customer (called from user.onCreate trigger)
export const createCustomer = privateAction
  .input(z.object({ email: z.string().email(), name: z.string().optional(), userId: z.string() }))
  
  .action(async ({ input: args }) => {
    const polar = getPolarClient();
    try {
      await polar.customers.create({
        email: args.email,
        externalId: args.userId, // Links Polar customer to Convex user
        name: args.name,
      });
    } catch (error) {
      console.error('Failed to create Polar customer:', error);
    }
    return null;
  });

// Link Polar customer ID to user (called from webhook)
export const updateUserPolarCustomerId = privateMutation
  .input(z.object({ customerId: z.string(), userId: z.string() }))
  
  .mutation(async ({ ctx, input: args }) => {
    const targetUser = await ctx.orm.query.user.findFirst({ where: { id: args.userId } });
    if (!targetUser) throw new CRPCError({ code: 'NOT_FOUND', message: 'User not found' });

    const existingUser = await ctx.orm.query.user.findFirst({ where: { customerId: args.customerId } });
    if (existingUser && existingUser.id !== args.userId) {
      throw new CRPCError({ code: 'CONFLICT', message: `Another user already has Polar customer ID ${args.customerId}` });
    }

    await ctx.orm.update(user).set({ customerId: args.customerId }).where(eq(user.id, targetUser.id));
    return null;
  });
```

### Subscription Management

```ts
// convex/functions/polarSubscription.ts
import '../lib/polar-polyfills';
import { CRPCError } from 'kitcn/server';
import { z } from 'zod';
import { authAction, privateMutation, privateQuery } from '../lib/crpc';
import { getPolarClient } from '../lib/polar-client';
import { createPolarSubscriptionCaller } from './generated/polarSubscription.runtime';

// Create subscription (called from webhook)
export const createSubscription = privateMutation
  .input(z.object({ subscription: subscriptionSchema }))
  
  .mutation(async ({ ctx, input: args }) => {
    const existing = await ctx.orm.query.subscriptions.findFirst({
      where: { subscriptionId: args.subscription.subscriptionId },
    });
    if (existing) {
      throw new CRPCError({ code: 'CONFLICT', message: `Subscription ${args.subscription.subscriptionId} already exists` });
    }
    await ctx.orm.insert(subscriptions).values(args.subscription);
    return null;
  });

// Update subscription (called from webhook)
export const updateSubscription = privateMutation
  .input(z.object({ subscription: subscriptionSchema }))
  .output(z.object({ updated: z.boolean() }))
  .mutation(async ({ ctx, input: args }) => {
    const existing = await ctx.orm.query.subscriptions.findFirst({
      where: { subscriptionId: args.subscription.subscriptionId },
    });
    if (!existing) return { updated: false };
    await ctx.orm.update(subscriptions).set(args.subscription).where(eq(subscriptions.id, existing.id));
    return { updated: true };
  });

// Get active subscription for user
export const getActiveSubscription = privateQuery
  .input(z.object({ userId: z.string() }))
  .output(z.object({ subscriptionId: z.string() }).nullable())
  .query(async ({ ctx, input: args }) => {
    const subscription = await ctx.orm.query.subscriptions.findFirst({
      where: { userId: args.userId, status: 'active' },
      orderBy: { createdAt: 'desc' },
    });
    if (!subscription) return null;
    return { subscriptionId: subscription.subscriptionId };
  });

// Cancel subscription (user action)
export const cancelSubscription = authAction
  .output(z.object({ success: z.boolean() }))
  .action(async ({ ctx }) => {
    const polar = getPolarClient();

    const caller = createPolarSubscriptionCaller(ctx);
    const subscription = await caller.getActiveSubscription({ userId: ctx.userId! });

    if (!subscription) {
      throw new CRPCError({ code: 'PRECONDITION_FAILED', message: 'No active subscription found' });
    }
    await polar.subscriptions.update({
      id: subscription.subscriptionId,
      subscriptionUpdate: { cancelAtPeriodEnd: true },
    });
    return { success: true };
  });

// Resume subscription (user action)
export const resumeSubscription = authAction
  .output(z.object({ success: z.boolean() }))
  .action(async ({ ctx }) => {
    const polar = getPolarClient();

    const caller = createPolarSubscriptionCaller(ctx);
    const subscription = await caller.getActiveSubscription({ userId: ctx.userId! });

    if (!subscription) {
      throw new CRPCError({ code: 'PRECONDITION_FAILED', message: 'No active subscription found' });
    }
    await polar.subscriptions.update({
      id: subscription.subscriptionId,
      subscriptionUpdate: { cancelAtPeriodEnd: false },
    });
    return { success: true };
  });
```

## Environment Variables

```bash
# convex/.env
POLAR_SERVER="sandbox"                 # 'production' | 'sandbox'
POLAR_ACCESS_TOKEN="polar_at_..."      # Organization access token
POLAR_WEBHOOK_SECRET="whsec_..."       # Webhook signature secret
POLAR_PRODUCT_PREMIUM="uuid-here"      # Premium subscription product
```

## Local Development with Ngrok

Polar webhooks require a public URL.

1. Install ngrok, reserve a free static domain in [ngrok dashboard](https://dashboard.ngrok.com/domains)
2. Add to `package.json`:
```json
{ "scripts": { "dev": "concurrently 'next dev' 'bun ngrok'", "ngrok": "ngrok http --url=your-domain.ngrok-free.app 3000" } }
```
3. Configure webhook URL in Polar Dashboard: `https://your-domain.ngrok-free.app/api/auth/polar/webhooks`

## Common Patterns

```ts
// Check organization subscription
const subscription = await ctx.orm.query.subscriptions.findFirst({
  where: { organizationId, status: 'active' },
});
const isActive = subscription?.status === 'active';

// Check user subscription
const subscription = await ctx.orm.query.subscriptions.findFirst({
  where: { userId, status: 'active' },
});
const isPremium = !!subscription;
```

Example-parity helper module:
- `convex/lib/auth/premium-guard.ts` for a reusable `PAYMENT_REQUIRED` guard on premium-only procedures.

## API Reference

| Operation | Method | Type |
|-----------|--------|------|
| Checkout | `authClient.checkout` | Client |
| Customer portal | `authClient.customer.portal` | Client |
| Customer state | `authClient.customer.state` | Client |
| List benefits | `authClient.customer.benefits.list` | Client |
| List orders | `authClient.customer.orders.list` | Client |
| List subscriptions | `authClient.customer.subscriptions.list` | Client |
| Event ingestion | `authClient.usage.ingestion` | Client |
| List meters | `authClient.usage.meters.list` | Client |
| Create customer | `internal.polarCustomer.createCustomer` | Internal action |
| Link customer ID | `internal.polarCustomer.updateUserPolarCustomerId` | Internal mutation |
| Create subscription | `internal.polarSubscription.createSubscription` | Internal mutation |
| Update subscription | `internal.polarSubscription.updateSubscription` | Internal mutation |
| Cancel subscription | Convex action | User action |
| Resume subscription | Convex action | User action |
