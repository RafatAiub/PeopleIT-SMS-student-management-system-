import { NotificationChannel } from '@prisma/client';
import { env } from '../../../config/env';
import { logger } from '../../../utils/logger';
import { getTransport as transport, resetTransport } from '../../../utils/mailer';
import { RenderedMessage } from '../renderer';
import {
  NotificationChannelAdapter,
  RecipientContact,
  SendContext,
  SendResult,
} from './channel.types';

/**
 * Exposed for tests, which flip env between cases. The transport itself now
 * lives in utils/mailer.ts so auth mail and notification mail share one
 * connection pool rather than opening two.
 */
export const resetEmailTransport = resetTransport;

export const emailChannel: NotificationChannelAdapter = {
  channel: NotificationChannel.EMAIL,

  // Deliberately always true: with EMAIL_ENABLED=false the adapter still runs,
  // through jsonTransport, so the delivery log reflects a real render. Flip
  // this to `env.EMAIL_ENABLED` if you would rather record SKIPPED instead.
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

    try {
      const info = await transport().sendMail({
        from: env.EMAIL_FROM,
        to: to.email,
        subject: message.subject ?? ctx.templateKey,
        text: message.body,
      });

      if (!env.EMAIL_ENABLED) {
        // Body is intentionally not logged — it can contain guardian PII.
        logger.info('[EMAIL disabled] rendered but not transmitted', {
          templateKey: ctx.templateKey,
          subject: message.subject,
        });
      }

      return { ok: true, providerRef: info.messageId };
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      logger.error('Email delivery failed', { templateKey: ctx.templateKey, error: messageText });
      // Structured failure, not a throw: the worker owns the retry decision.
      return { ok: false, error: messageText };
    }
  },
};
