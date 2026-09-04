import { Queue, JobsOptions } from 'bullmq';
import { NotificationChannel } from '@prisma/client';
import { env } from '../config/env';
import { toJobId } from './jobId';

export interface NotificationJobData {
  institutionId: string;
  type: string;
  recipientUserId: string;
  channel: NotificationChannel;
  vars: Record<string, string | number | null | undefined>;
  data?: Record<string, unknown>;
  contextId?: string;
  dedupeKey: string;
}

/**
 * Unlike feeReminders/subscriptionBilling, this queue sets defaultJobOptions:
 * a notification that fails because a provider blipped must be retried, and
 * completed jobs must not accumulate in Redis forever.
 *
 * Connection mirrors billingQueue.ts — BullMQ requires maxRetriesPerRequest:
 * null on its blocking client, so it cannot reuse the ioredis singleton in
 * config/redis.ts (which sets 3).
 */
export const notificationQueue = new Queue('notifications', {
  connection: {
    url: env.REDIS_URL,
    maxRetriesPerRequest: null,
  } as any,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
});

export { toJobId };

/**
 * `jobId` makes BullMQ drop a duplicate while the original is still known to
 * Redis. That window is bounded by removeOnComplete, so it is only the first
 * line of defence — the durable guarantee is the unique
 * NotificationDelivery.dedupeKey column checked by the worker.
 */
const ENQUEUE_TIMEOUT_MS = 5000;

export async function enqueueNotification(
  payload: NotificationJobData,
  options: JobsOptions = {},
): Promise<void> {
  // BullMQ's blocking client requires maxRetriesPerRequest: null, which means
  // `.add()` against an unreachable Redis retries forever and NEVER settles.
  // Left unbounded, one Redis outage leaks a pending promise per notification
  // for the life of the process. Bound it so an outage surfaces as a logged
  // failure that notifySafe() can swallow.
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Notification enqueue timed out after ${ENQUEUE_TIMEOUT_MS}ms — is Redis reachable?`)),
      ENQUEUE_TIMEOUT_MS,
    );
    // Never hold the event loop (or a Jest run) open on this timer.
    timer.unref?.();
  });

  try {
    await Promise.race([
      notificationQueue.add('send-notification', payload, {
        jobId: toJobId(payload.dedupeKey),
        ...options,
      }),
      timeout,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
