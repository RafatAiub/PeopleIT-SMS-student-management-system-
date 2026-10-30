import { randomUUID } from 'crypto';
import { EmailPriority, NotificationChannel } from '@prisma/client';
import { sendEmail, type SendEmailResult } from '../../email/sender';
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
  // EmailLog row when no transport is configured (demo mode), and
  // toSendResult() below turns that into a SKIPPED delivery row.
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
      idempotencyKey: emailIdempotencyKey(ctx, to.email),
    });

    return toSendResult(result);
  },
};

/**
 * P0: one EmailLog per notification EVENT. The key is the NotificationDelivery
 * dedupe key (which already carries institution, type, user, channel and the
 * event's contextId — invoice id, payment id, …) plus the address, so:
 *   - a retry of the SAME job lands on the same EmailLog row (no double send);
 *   - a second invoice / payment / reminder for the same user gets its own key.
 * The previous key had no event id, so each user only ever received the first
 * INVOICE_ISSUED / PAYMENT_RECEIVED / FEE_REMINDER email.
 */
export function emailIdempotencyKey(ctx: SendContext, email: string): string {
  if (ctx.dedupeKey) return `notify:${ctx.dedupeKey}:${email.trim().toLowerCase()}`;
  // No dedupe key (direct adapter use): never collapse distinct sends.
  return `notify:${ctx.institutionId}:${ctx.templateKey}:${randomUUID()}`;
}

/**
 * Maps the sender's outcome to the worker's contract. SKIPPED / SUPPRESSED /
 * DEFERRED are not transient provider errors, so they must not be retried —
 * but they are not "sent" either: the delivery is recorded SKIPPED with the
 * real reason (the EmailLog row keeps the detailed status).
 */
export function toSendResult(result: SendEmailResult): SendResult {
  switch (result.status) {
    case 'SENT':
      return { ok: true, providerRef: result.logId };
    case 'SKIPPED':
      return { ok: true, providerRef: result.logId, skipped: 'SKIPPED: email demo mode, nothing transmitted (no BREVO_API_KEY / SMTP configured)' };
    case 'SUPPRESSED':
      return { ok: true, providerRef: result.logId, skipped: `SUPPRESSED: ${result.error ?? 'address is on the suppression list'}` };
    case 'DEFERRED':
      return {
        ok: true,
        providerRef: result.logId,
        skipped: `DEFERRED: daily email budget spent; EmailLog ${result.logId} will be retried by the email scheduler`,
      };
    default:
      return { ok: false, error: result.error ?? 'email send failed' };
  }
}

/** Exposed for tests, which flip env between cases. Re-exported for callers that imported this name from here previously. */
export { resetTransport as resetEmailTransport } from '../../email/transport';
