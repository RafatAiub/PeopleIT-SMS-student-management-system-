import { Queue } from 'bullmq';
import { env } from '../config/env';

// BullMQ Queue for the daily subscription lifecycle scan (trial/grace/expiry
// transitions). Mirrors reminderQueue.ts's connection setup.
export const billingQueue = new Queue('subscriptionBilling', {
  connection: {
    url: env.REDIS_URL,
    maxRetriesPerRequest: null,
  } as any,
});

/**
 * Registers the single repeatable job. Uses a fixed jobId so re-registering
 * on every server restart doesn't create duplicate repeatable jobs in Redis.
 */
export async function registerSubscriptionLifecycleJob(): Promise<void> {
  await billingQueue.add(
    'subscription-lifecycle-scan',
    {},
    {
      repeat: { pattern: '0 2 * * *' }, // every day at 02:00
      jobId: 'subscription-lifecycle-scan',
    },
  );
}
