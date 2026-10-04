import { EmailPriority, NotificationChannel } from '@prisma/client';
import { sendEmail } from '../../email/sender';
import { buildEmailLayout } from '../../email/layout';
import { renderPlainBodyToHtml } from '../../email/components';
import { findInstitutionBranding } from '../notifications.repository';
import { RenderedMessage } from '../renderer';
import {
  NotificationChannelAdapter,
  RecipientContact,
  SendContext,
  SendResult,
} from './channel.types';

/**
 * Every notification `type` (== templateKey here) mapped to an EmailPriority
 * (owner decision §4.2). FEE_REMINDER is the one default-EMAIL type that is
 * genuinely bulk (every guardian, every term) — everything else is one
 * transactional event about one recipient.
 */
const PRIORITY_BY_TYPE: Record<string, EmailPriority> = {
  FEE_REMINDER: EmailPriority.P2_BULK,
  // Submitting one exam's results fans out to every affected student +
  // guardian at once — the same "bulk" shape as fee reminders/campaigns.
  RESULTS_PUBLISHED: EmailPriority.P2_BULK,
};

function priorityFor(templateKey: string): EmailPriority {
  return PRIORITY_BY_TYPE[templateKey] ?? EmailPriority.P1_TRANSACTIONAL;
}

export const emailChannel: NotificationChannelAdapter = {
  channel: NotificationChannel.EMAIL,

  // Always true: sender.sendEmail() itself records an honest SKIPPED
  // EmailLog row when no transport is configured (demo mode) — the adapter
  // does not need to pre-guess that here.
  isConfigured() {
    return true;
  },

  addressFor(to: RecipientContact) {
    return to.email ?? null;
  },

  async send(
    to: RecipientContact,
    message: RenderedMessage,
    ctx: SendContext,
  ): Promise<SendResult> {
    if (!to.email) return { ok: false, error: 'recipient has no email address' };

    const branding = await findInstitutionBranding(ctx.institutionId);
    const bodyHtml = renderPlainBodyToHtml(message.body);
    const html = buildEmailLayout({
      preheader: message.subject ?? ctx.templateKey,
      heading: message.subject ?? ctx.templateKey,
      bodyHtml,
      institution: { name: branding.name, logoUrl: branding.logoUrl, color: branding.color },
    });

    const result = await sendEmail({
      to: to.email,
      toName: to.name,
      subject: message.subject ?? ctx.templateKey,
      html,
      text: message.body,
      template: `notification.${ctx.templateKey}`,
      priority: priorityFor(ctx.templateKey),
      institutionId: ctx.institutionId,
      fromName: branding.name,
      replyTo: branding.contactEmail ?? undefined,
      // Keyed on the same dedupe unit the notification worker already claims
      // (delivery row) — one NotificationDelivery -> one EmailLog attempt.
      idempotencyKey: `notify:${ctx.institutionId}:${ctx.templateKey}:${to.userId}:${to.email}`,
    });

    if (result.status === 'SENT') return { ok: true, providerRef: result.logId };
    if (result.status === 'SKIPPED' || result.status === 'SUPPRESSED' || result.status === 'DEFERRED') {
      // Not retryable by the notification worker's backoff (demo mode /
      // suppressed address / budget exhausted are not transient provider
      // errors) — report success so the delivery is marked SENT rather than
      // endlessly retried; the EmailLog row is still the honest record.
      return { ok: true, providerRef: result.logId };
    }
    return { ok: false, error: result.error ?? 'email send failed' };
  },
};

/** Exposed for tests, which flip env between cases. Re-exported for callers that imported this name from here previously. */
export { resetTransport as resetEmailTransport } from '../../email/transport';
