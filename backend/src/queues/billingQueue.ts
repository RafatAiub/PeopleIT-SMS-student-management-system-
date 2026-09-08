import { Queue } from 'bullmq';
import { getBullQueueConnection } from '../config/redis';

// BullMQ Queue for the daily subscription lifecycle scan (trial/grace/expiry
// transitions). Shares the one queue-producer connection (see config/redis.ts).
export const billingQueue = new Queue('subscriptionBilling', {
  connection: getBullQueueConnection(),
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
