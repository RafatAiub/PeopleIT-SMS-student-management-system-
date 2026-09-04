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
 * The single entry point for emitting a notification. Callers state WHAT
 * happened and WHO should hear about it; every decision about channels,
 * templates, preferences and delivery lives behind this function.
 *
 * Nothing is sent inline: each (recipient x channel) becomes one queued job, so
 * a slow SMTP server or a rate-limited SMS gateway can never block the request
 * that triggered it.
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

  for (const recipientUserId of recipients) {
    const disabled = await notificationRepository.findDisabledChannels(
      input.institutionId,
      recipientUserId,
      input.type,
    );

    for (const channel of channels) {
      const dedupeKey = buildDedupeKey(
        input.institutionId,
        input.type,
        recipientUserId,
        channel,
        input.contextId,
      );

      // An opted-out channel is recorded rather than dropped, so "why didn't
      // they get it?" is answerable from the delivery log alone.
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
        continue;
      }

      // Per-job try/catch: one unreachable queue or one bad channel must not
      // stop the remaining recipients/channels from being scheduled.
      try {
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
      } catch (error) {
        logger.error('Failed to enqueue notification', {
          dedupeKey,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  logger.info('Notification queued', {
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
  institutionId: string,
  recipientUserId: string,
  query: NotificationQueryDtoType,
) {
  return notificationRepository.findAllForRecipient(institutionId, recipientUserId, {
    unreadOnly: query.unreadOnly,
    page: query.page,
    pageSize: query.pageSize,
  });
}

export async function markRead(institutionId: string, recipientUserId: string, id: string) {
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

export async function markAllRead(institutionId: string, recipientUserId: string) {
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
