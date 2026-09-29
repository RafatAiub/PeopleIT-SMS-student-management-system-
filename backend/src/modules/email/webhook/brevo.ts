import { EmailSuppressionReason } from '@prisma/client';
import { logger } from '../../../utils/logger';
import * as repo from '../repository';
import { suppress } from '../suppression';

// =============================================================================
// Brevo transactional webhook — https://developers.brevo.com/docs/transactional-webhooks
// Suppression-relevant events only; everything else (delivered, opened,
// clicked...) is acknowledged but not acted on.
//
// Idempotent on (messageId, event): re-delivery of the same event is a no-op
// because both actions it can trigger (EmailLog.lastEvent write, suppression
// upsert) are themselves idempotent — there is no separate "have we seen this
// exact event" ledger, by design (no new model to add for one).
// =============================================================================

const SUPPRESSING_EVENTS: Record<string, EmailSuppressionReason> = {
  hardBounce: 'HARD_BOUNCE',
  blocked: 'BLOCKED',
  invalid: 'INVALID',
  spam: 'SPAM',
  unsubscribed: 'UNSUBSCRIBED',
};

export interface BrevoWebhookEvent {
  event?: string;
  email?: string;
  // Brevo sends the provider message id under different keys depending on
  // event/version; a few field names to be tolerant of.
  'message-id'?: string;
  messageId?: string;
  id?: string | number;
  'X-Mailin-custom'?: string;
  date?: string;
  reason?: string;
}

export async function handleBrevoEvent(payload: BrevoWebhookEvent): Promise<{ handled: boolean }> {
  const event = payload.event;
  if (!event) return { handled: false };

  const messageId = payload['message-id'] ?? payload.messageId ?? (payload.id !== undefined ? String(payload.id) : undefined);
  const emailLogId = payload['X-Mailin-custom'];

  // Best-effort correlation back to our EmailLog row — via the custom header
  // we set at send time, falling back to the provider messageId.
  const log = emailLogId ? await repo.findById(emailLogId).catch(() => null) : messageId ? await repo.findByMessageId(messageId).catch(() => null) : null;

  if (log) {
    // Skip if we already recorded this exact event for this log — cheap
    // idempotency guard against Brevo's documented at-least-once redelivery.
    if (log.lastEvent === event) {
      return { handled: true };
    }
    await repo.updateLastEvent(log.id, event).catch((error) => {
      logger.warn('Brevo webhook: failed to record lastEvent on EmailLog', { logId: log.id, event, error: error instanceof Error ? error.message : String(error) });
    });
  } else {
    logger.warn('Brevo webhook: could not correlate event to an EmailLog row', { event, messageId, hasCustomHeader: Boolean(emailLogId) });
  }

  const reason = SUPPRESSING_EVENTS[event];
  if (!reason && event !== 'unsubscribed') {
    return { handled: true };
  }

  const email = payload.email;
  if (!email) {
    logger.warn('Brevo webhook: suppressing event with no email address', { event });
    return { handled: true };
  }

  // unsubscribed via Brevo's own tracked link -> BULK scope, same as our own
  // one-click unsubscribe. Everything else (bounce/spam/blocked/invalid) is a
  // deliverability signal -> ALL scope, never email that address again.
  const scope = event === 'unsubscribed' ? 'BULK' : 'ALL';

  await suppress({
    email,
    scope,
    reason: reason ?? 'UNSUBSCRIBED',
    source: 'brevo-webhook',
    institutionId: log?.institutionId ?? null,
    note: payload.reason ?? null,
  });

  logger.info('Email suppressed via Brevo webhook', { email: maskForLog(email), event, scope });
  return { handled: true };
}

function maskForLog(email: string): string {
  const at = email.indexOf('@');
  return at > 0 ? `${email.slice(0, 2)}***@${email.slice(at + 1)}` : '***';
}
