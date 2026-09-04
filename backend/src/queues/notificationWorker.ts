import { Worker } from 'bullmq';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { NotificationJobData } from './notificationQueue';
import * as notificationRepository from '../modules/notifications/notifications.repository';
import { renderTemplate } from '../modules/notifications/renderer';
import { channelFor } from '../modules/notifications/channels';
import { NotificationType } from '../modules/notifications/notifications.dto';

/**
 * Delivers one (recipient x channel) notification.
 *
 * Exported separately from the Worker so tests can drive it directly without a
 * live Redis — the same split billingWorker.ts uses for
 * runSubscriptionLifecycleScan().
 *
 * Idempotency has two layers:
 *   1. BullMQ jobId == dedupeKey drops a duplicate still known to Redis.
 *   2. The unique NotificationDelivery.dedupeKey + a status-guarded claim makes
 *      the durable guarantee — a replay after the job left Redis still cannot
 *      double-send.
 */
export async function deliverNotification(data: NotificationJobData): Promise<void> {
  const adapter = channelFor(data.channel);

  const contact = await notificationRepository.findRecipientContact(
    data.institutionId,
    data.recipientUserId,
  );

  const skeleton = {
    institutionId: data.institutionId,
    channel: data.channel,
    recipient: data.recipientUserId,
    templateKey: data.type,
  };

  // A channel with no adapter, no config, or no address for this user is a
  // SKIP, not a failure — retrying cannot change any of those.
  if (!adapter || !adapter.isConfigured()) {
    await notificationRepository.recordSkippedDelivery(
      data.dedupeKey,
      skeleton,
      adapter ? `${data.channel} channel is not configured` : `no adapter for ${data.channel}`,
    );
    return;
  }

  if (!contact) {
    await notificationRepository.recordSkippedDelivery(
      data.dedupeKey,
      skeleton,
      'recipient user not found in this institution',
    );
    return;
  }

  const recipientContact = {
    userId: contact.id,
    name: `${contact.firstName} ${contact.lastName}`.trim(),
    email: contact.email,
    phone: contact.phone,
  };

  const address = adapter.addressFor(recipientContact);
  if (!address) {
    await notificationRepository.recordSkippedDelivery(
      data.dedupeKey,
      { ...skeleton, recipient: data.recipientUserId },
      `recipient has no ${data.channel} address on file`,
    );
    return;
  }

  const delivery = await notificationRepository.upsertQueuedDelivery(data.dedupeKey, {
    ...skeleton,
    recipient: address,
  });

  if (delivery.status === 'SENT') {
    logger.debug('Notification already delivered — replay ignored', { dedupeKey: data.dedupeKey });
    return;
  }

  const claimed = await notificationRepository.claimForSend(delivery.id);
  if (!claimed) {
    logger.debug('Lost race for notification delivery — another worker owns it', {
      dedupeKey: data.dedupeKey,
    });
    return;
  }

  // institutionName is available to every template without any caller having
  // to remember to pass it; an explicit var from the caller still wins.
  const institutionName = await notificationRepository.findInstitutionName(data.institutionId);

  const message = await renderTemplate(
    data.institutionId,
    data.type as NotificationType,
    data.channel,
    { institutionName, ...data.vars },
  );

  const result = await adapter.send(recipientContact, message, {
    institutionId: data.institutionId,
    templateKey: data.type,
    data: data.data,
  });

  if (!result.ok) {
    // Thrown so BullMQ applies the queue's retry/backoff policy. The final
    // failure is persisted by the 'failed' handler below.
    throw new Error(result.error || `${data.channel} delivery failed`);
  }

  await notificationRepository.markDeliverySent(
    delivery.id,
    result.providerRef,
    data.channel === 'IN_APP' ? result.providerRef : undefined,
  );

  logger.info('Notification delivered', {
    institutionId: data.institutionId,
    channel: data.channel,
    type: data.type,
    dedupeKey: data.dedupeKey,
  });
}

export const notificationWorker = new Worker<NotificationJobData>(
  'notifications',
  async (job) => deliverNotification(job.data),
  {
    connection: {
      url: env.REDIS_URL,
      maxRetriesPerRequest: null,
    } as any,
  },
);

notificationWorker.on('completed', (job) => {
  logger.debug('Notification job completed', { jobId: job.id });
});

notificationWorker.on('failed', async (job, err) => {
  logger.error('Notification job failed', {
    jobId: job?.id,
    attempts: job?.attemptsMade,
    error: err.message,
  });

  // Only persist FAILED once BullMQ has exhausted the retry budget — an
  // intermediate failure is still in flight and must not look terminal.
  const data = job?.data;
  if (!data || !job) return;
  if (job.attemptsMade < (job.opts.attempts ?? 1)) return;

  try {
    const delivery = await notificationRepository.findDeliveryByDedupeKey(data.dedupeKey);
    if (delivery && delivery.status !== 'SENT') {
      await notificationRepository.markDeliveryFailed(delivery.id, err.message);
    }
  } catch (persistError) {
    logger.error('Could not persist notification failure', {
      dedupeKey: data.dedupeKey,
      error: persistError instanceof Error ? persistError.message : String(persistError),
    });
  }
});
