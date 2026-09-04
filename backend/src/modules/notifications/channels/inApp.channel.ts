import { NotificationChannel } from '@prisma/client';
import { prisma } from '../../../config/prisma';
import { RenderedMessage } from '../renderer';
import {
  NotificationChannelAdapter,
  RecipientContact,
  SendContext,
  SendResult,
} from './channel.types';

/**
 * In-app delivery: writes the Notification row the bell reads. Always
 * available — it needs no external provider and no user contact details.
 */
export const inAppChannel: NotificationChannelAdapter = {
  channel: NotificationChannel.IN_APP,

  isConfigured() {
    return true;
  },

  addressFor(to: RecipientContact) {
    return to.userId;
  },

  async send(
    to: RecipientContact,
    message: RenderedMessage,
    ctx: SendContext,
  ): Promise<SendResult> {
    const created = await prisma.notification.create({
      data: {
        institutionId: ctx.institutionId,
        recipientUserId: to.userId,
        type: ctx.templateKey,
        title: message.subject ?? ctx.templateKey,
        body: message.body,
        data: (ctx.data ?? undefined) as never,
      },
      select: { id: true },
    });

    return { ok: true, providerRef: created.id };
  },
};
