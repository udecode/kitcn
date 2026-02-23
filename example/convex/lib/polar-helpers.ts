import type { Subscription } from '@polar-sh/sdk/models/components/subscription.js';
import { CRPCError } from 'better-convex/server';
import { getPolarClient } from './polar-client';

/**
 * Convert a subscription object to the database format. This handles the
 * transformation of Polar SDK types to our database schema.
 *
 * Note: The subscription.customerId from Polar is actually the Polar customer
 * ID (string), not the internal database user ID. The userId must be provided
 * separately.
 */
export const convertToDatabaseSubscription = (subscription: Subscription) => {
  // Extract organizationId from subscription metadata (referenceId)
  const organizationId = subscription.metadata?.referenceId;

  if (typeof organizationId !== 'string' || organizationId.length === 0) {
    throw new CRPCError({
      code: 'BAD_REQUEST',
      message: 'Subscription missing organizationId in metadata.referenceId',
    });
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
    metadata: subscription.metadata,
    modifiedAt: subscription.modifiedAt?.toISOString() ?? null,
    organizationId,
    priceId: subscription.prices[0]?.id,
    productId: subscription.productId,
    recurringInterval: subscription.recurringInterval,
    startedAt: subscription.startedAt?.toISOString() ?? null,
    status: subscription.status,
    subscriptionId: subscription.id,
    userId: subscription.customer.externalId!,
  };
};

export type DatabaseSubscription = ReturnType<
  typeof convertToDatabaseSubscription
>;

/**
 * Delete all Polar customers (for reset/cleanup functionality)
 */
export const deleteCustomers = async () => {
  const polar = getPolarClient();

  try {
    const result = await polar.customers.list({
      limit: 100,
      page: 1,
    });

    let deletedCount = 0;

    for await (const page of result) {
      for (const customer of page.result.items) {
        try {
          await polar.customers.delete({ id: customer.id });
          console.info(`Deleted Polar customer: ${customer.id}`);
        } catch (error) {
          console.error(`Failed to delete customer ${customer.id}:`, error);
        }
      }

      deletedCount++;
    }

    console.info(
      `Completed deletion of Polar customers: ${deletedCount} deleted`
    );
  } catch (error) {
    console.error('Failed to delete Polar customers:', error);
  }

  return null;
};
