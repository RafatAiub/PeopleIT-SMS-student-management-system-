import { NotificationChannel } from '@prisma/client';
import { NotFoundError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import * as notificationRepository from './notifications.repository';
import { NotificationType, NotificationQueryDtoType } from './notifications.dto';
import { DEFAULT_TEMPLATES } from './templates.defaults';
import { TemplateVars, renderTemplate } from './renderer';
import { enqueueNotification } from '../../queues/notificationQueue';

export interface NotifyInput {
  institutionId: string;
  type: NotificationType;
  /** Already resolved by the caller — never derived from client input here. */
  recipientUserIds: string[];
  vars: TemplateVars;
  /** Deep-link payload stored on the notification, e.g. { link: '/fees' }. */
  data?: Record<string, unknown>;
  /**
   * Business-object id this notification is about (invoiceId, paymentId, ...).
   * Part of the idempotency key, so re-emitting for the same object is a no-op.
   */
  contextId?: string;
  /** Defaults to every channel registered for this type. */
  channels?: NotificationChannel[];
}

/**
 * Which channels each event goes out on by default. A channel listed here is
 * still subject to (a) the user's opt-out and (b) whether that channel is
 * configured in this deployment — both resolved at delivery time.
 */
const DEFAULT_CHANNELS: Record<NotificationType, NotificationChannel[]> = {
  INVOICE_ISSUED: ['IN_APP', 'EMAIL'],
  PAYMENT_RECEIVED: ['IN_APP', 'EMAIL'],
  FEE_REMINDER: ['IN_APP', 'EMAIL', 'SMS'],
  ABSENCE_ALERT: ['IN_APP', 'SMS'],
  // Platform subscription billing — in-app + email, never SMS (recipients are
  // institute admins / super admins, and there is no billing phone on file).
  SUBSCRIPTION_ACTIVATED: ['IN_APP', 'EMAIL'],
  SUBSCRIPTION_PAYMENT_FAILED: ['IN_APP', 'EMAIL'],
  SUBSCRIPTION_PAYMENT_REQUESTED: ['IN_APP', 'EMAIL'],
  SUBSCRIPTION_ADJUSTED: ['IN_APP', 'EMAIL'],
  SUBSCRIPTION_REFUND_INITIATED: ['IN_APP', 'EMAIL'],
  SUBSCRIPTION_REFUNDED: ['IN_APP', 'EMAIL'],
  SUBSCRIPTION_TRIAL_ENDING: ['IN_APP', 'EMAIL'],
  SUBSCRIPTION_GRACE: ['IN_APP', 'EMAIL'],
  SUBSCRIPTION_SUSPENDED: ['IN_APP', 'EMAIL'],
};

/**
 * Deterministic idempotency key. Same event + same person + same channel +
 * same business object == same key, forever. This is what makes a replayed
 * queue job, a retried request, or a double-submitted form safe.
 */
export function buildDedupeKey(
  institutionId: string,
  type: string,
  userId: string,
  channel: NotificationChannel,
  contextId?: string,
): string {
  return [institutionId, type, userId, channel, contextId ?? 'none'].join(':');
}

/**
 * Writes an IN_APP notification in the same call that triggered it, rather than
 * via the queue.
 *
 * IN_APP is one indexed insert with no external provider — the reasons the
 * other channels are queued (a slow SMTP server, a rate-limited SMS gateway)
 * simply do not apply. Routing it through BullMQ only coupled the bell to
 * Redis: a queue outage or a misconfigured REDIS_URL then silently emptied the
 * one channel every user actually watches. EMAIL/SMS still go through the queue.
 *
 * Idempotency is unchanged — the same dedupeKey claims the same
 * NotificationDelivery row under the same status guard the worker uses, so a
 * replay (or a stray queued IN_APP job from an older build) still cannot
 * double-write.
 */
async function deliverInAppNow(params: {
  institutionId: string;
  type: NotificationType;
  recipientUserId: string;
  vars: TemplateVars;
  data?: Record<string, unknown>;
  dedupeKey: string;
}): Promise<void> {
  const skeleton = {
    institutionId: params.institutionId,
    channel: 'IN_APP' as NotificationChannel,
    recipient: params.recipientUserId,
    templateKey: params.type,
  };

  const delivery = await notificationRepository.upsertQueuedDelivery(params.dedupeKey, skeleton);
  if (delivery.status === 'SENT') return;

  const claimed = await notificationRepository.claimForSend(delivery.id);
  if (!claimed) return;

  const institutionName = await notificationRepository.findInstitutionName(params.institutionId);
  const message = await renderTemplate(params.institutionId, params.type, 'IN_APP', {
    institutionName,
    ...params.vars,
  });

  const created = await notificationRepository.createInAppNotification({
    institutionId: params.institutionId,
    recipientUserId: params.recipientUserId,
    type: params.type,
    title: message.subject ?? params.type,
    body: message.body,
    data: params.data,
  });

  await notificationRepository.markDeliverySent(delivery.id, created.id, created.id);
}

/**
 * The single entry point for emitting a notification. Callers state WHAT
 * happened and WHO should hear about it; every decision about channels,
 * templates, preferences and delivery lives behind this function.
 *
 * IN_APP is written synchronously here; EMAIL/SMS each become one queued job,
 * so a slow SMTP server or a rate-limited SMS gateway can never block the
 * request that triggered it.
 */
export async function notify(input: NotifyInput): Promise<void> {
  const recipients = [...new Set(input.recipientUserIds)].filter(Boolean);
  if (recipients.length === 0) {
    logger.warn('notify() called with no recipients', {
      institutionId: input.institutionId,
      type: input.type,
      contextId: input.contextId,
    });
    return;
  }

  const channels = input.channels ?? DEFAULT_CHANNELS[input.type] ?? ['IN_APP'];

  // Fan out across every (recipient x channel) concurrently. Each unit is
  // independent (its own dedupeKey, its own delivery row), and the inline
  // IN_APP write is several DB round-trips — running them in series made a
  // multi-recipient notification as slow as the sum of its parts and delayed
  // the EMAIL/SMS enqueues behind it.
  await Promise.all(
    recipients.map(async (recipientUserId) => {
      const disabled = await notificationRepository.findDisabledChannels(
        input.institutionId,
        recipientUserId,
        input.type,
      );

      await Promise.all(
        channels.map(async (channel) => {
          const dedupeKey = buildDedupeKey(
            input.institutionId,
            input.type,
            recipientUserId,
            channel,
            input.contextId,
          );

          // An opted-out channel is recorded rather than dropped, so "why
          // didn't they get it?" is answerable from the delivery log alone.
          if (disabled.has(channel)) {
            await notificationRepository.recordSkippedDelivery(
              dedupeKey,
              {
                institutionId: input.institutionId,
                channel,
                recipient: recipientUserId,
                templateKey: input.type,
              },
              'recipient opted out of this channel',
            );
            return;
          }

          // Per-unit try/catch: one unreachable queue or one bad channel must
          // not stop the remaining recipients/channels from being scheduled.
          try {
            if (channel === 'IN_APP') {
              await deliverInAppNow({
                institutionId: input.institutionId,
                type: input.type,
                recipientUserId,
                vars: input.vars,
                data: input.data,
                dedupeKey,
              });
            } else {
              await enqueueNotification({
                institutionId: input.institutionId,
                type: input.type,
                recipientUserId,
                channel,
                vars: input.vars as Record<string, string | number | null | undefined>,
                data: input.data,
                contextId: input.contextId,
                dedupeKey,
              });
            }
          } catch (error) {
            logger.error('Failed to dispatch notification', {
              dedupeKey,
              channel,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }),
      );
    }),
  );

  logger.info('Notification dispatched', {
    institutionId: input.institutionId,
    type: input.type,
    recipients: recipients.length,
    channels,
    contextId: input.contextId,
  });
}

/**
 * Fire-and-forget wrapper. Notifications are a side effect: a slow or broken
 * notification path must never fail or delay the business operation that
 * triggered it (creating an invoice, recording a payment).
 */
export function notifySafe(input: NotifyInput): void {
  notify(input).catch((error) => {
    logger.error('Failed to emit notification', {
      institutionId: input.institutionId,
      type: input.type,
      contextId: input.contextId,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

export async function listMine(
  institutionId: string | undefined,
  recipientUserId: string,
  query: NotificationQueryDtoType,
) {
  return notificationRepository.findAllForRecipient(institutionId, recipientUserId, {
    unreadOnly: query.unreadOnly,
    page: query.page,
    pageSize: query.pageSize,
  });
}

export async function markRead(
  institutionId: string | undefined,
  recipientUserId: string,
  id: string,
) {
  const result = await notificationRepository.markRead(institutionId, recipientUserId, id);

  // Zero rows updated is either "already read" or "not yours / doesn't exist".
  // Only the latter is a 404, so disambiguate with an ownership-scoped lookup.
  if (result.count === 0) {
    const exists = await notificationRepository.existsForRecipient(
      institutionId,
      recipientUserId,
      id,
    );
    if (!exists) throw new NotFoundError('Notification not found');
  }

  return { updated: result.count };
}

export async function markAllRead(institutionId: string | undefined, recipientUserId: string) {
  const result = await notificationRepository.markAllRead(institutionId, recipientUserId);
  return { updated: result.count };
}

// ── Preferences ────────────────────────────────────────────────────────────

export async function listPreferences(institutionId: string, userId: string) {
  return notificationRepository.listPreferences(institutionId, userId);
}

export async function updatePreferences(
  institutionId: string,
  userId: string,
  prefs: { type: NotificationType; channel: NotificationChannel; enabled: boolean }[],
) {
  await notificationRepository.upsertPreferences(institutionId, userId, prefs);
  return notificationRepository.listPreferences(institutionId, userId);
}

// ── Templates ──────────────────────────────────────────────────────────────

/**
 * Returns every (type, channel) pair with its effective content: the tenant
 * override when one exists, otherwise the bundled default flagged as such.
 * An admin sees the full surface, not just the rows they happen to have edited.
 */
export async function listTemplates(institutionId: string) {
  const overrides = await notificationRepository.listTemplates(institutionId);
  const byKey = new Map(overrides.map((t) => [`${t.key}:${t.channel}`, t]));

  const rows: {
    key: string;
    channel: NotificationChannel;
    subject: string | null;
    body: string;
    isActive: boolean;
    source: 'tenant' | 'default';
  }[] = [];

  for (const [templateKey, template] of Object.entries(DEFAULT_TEMPLATES)) {
    const [key, channel] = templateKey.split(':') as [string, NotificationChannel];
    const override = byKey.get(templateKey);
    rows.push({
      key,
      channel,
      subject: override ? override.subject : (template.subject ?? null),
      body: override ? override.body : template.body,
      isActive: override ? override.isActive : true,
      source: override ? 'tenant' : 'default',
    });
  }

  return rows.sort((x, y) => x.key.localeCompare(y.key) || x.channel.localeCompare(y.channel));
}

export async function upsertTemplate(
  institutionId: string,
  key: NotificationType,
  channel: NotificationChannel,
  data: { subject?: string | null; body: string; isActive?: boolean },
) {
  const saved = await notificationRepository.upsertTemplate(institutionId, key, channel, data);
  logger.info('Notification template overridden', { institutionId, key, channel });
  return saved;
}

/**
 * Renders a template with sample values and delivers it to the caller only.
 * Lets an admin verify copy and provider configuration without inventing a
 * real invoice or marking a real student absent.
 */
export async function sendTest(
  institutionId: string,
  userId: string,
  type: NotificationType,
  channel: NotificationChannel,
) {
  const vars: TemplateVars = {
    invoiceNo: 'INV-TEST-0001',
    studentName: 'Test Student',
    amount: '1000.00',
    dueAmount: '0.00',
    dueDate: new Date().toDateString(),
    date: new Date().toDateString(),
    institutionName: 'Your Institution',
  };

  const preview = await renderTemplate(institutionId, type, channel, vars);

  await notify({
    institutionId,
    type,
    recipientUserIds: [userId],
    channels: [channel],
    // Timestamped so repeated tests are not swallowed by the dedupe key.
    contextId: `test-${Date.now()}`,
    vars,
  });

  return { queued: true, preview };
}
