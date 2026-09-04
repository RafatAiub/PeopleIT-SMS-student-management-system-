import { NotificationChannel } from '@prisma/client';
import { env } from '../../../config/env';
import { sendSms } from '../../../utils/sms.service';
import { RenderedMessage } from '../renderer';
import {
  NotificationChannelAdapter,
  RecipientContact,
  SendContext,
  SendResult,
} from './channel.types';

export const smsChannel: NotificationChannelAdapter = {
  channel: NotificationChannel.SMS,

  // sendSms() reports success when SMS is disabled, which would write a
  // misleading SENT row. Gate here instead so a disabled gateway records
  // SKIPPED — an honest audit trail.
  isConfigured() {
    return env.SMS_ENABLED && !!env.GREENWEB_API_TOKEN;
  },

  addressFor(to: RecipientContact) {
    return to.phone ?? null;
  },

  async send(
    to: RecipientContact,
    message: RenderedMessage,
    _ctx: SendContext,
  ): Promise<SendResult> {
    if (!to.phone) return { ok: false, error: 'recipient has no phone number' };

    const result = await sendSms(to.phone, message.body);
    return result.success
      ? { ok: true, providerRef: result.message }
      : { ok: false, error: result.message };
  },
};
