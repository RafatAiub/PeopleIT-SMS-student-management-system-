import { NotificationChannel } from '@prisma/client';
import { isSmsConfigured, sendSms, type SmsResult } from '../../../utils/sms.service';
import { RenderedMessage } from '../renderer';
import {
  NotificationChannelAdapter,
  RecipientContact,
  SendContext,
  SendResult,
} from './channel.types';

/**
 * P0: maps an SmsResult to the worker contract.
 *   SENT    → ok (delivery SENT)
 *   SKIPPED → ok + skipped (delivery SKIPPED, not retried)
 *   FAILED with an invalid number → skipped (retrying can't fix the number)
 *   FAILED otherwise → not ok (BullMQ retries, then delivery FAILED)
 */
export function smsResultToSendResult(result: SmsResult): SendResult {
  if (result.status === 'SENT') return { ok: true, providerRef: result.message.slice(0, 190) };
  if (result.status === 'SKIPPED') return { ok: true, skipped: `SKIPPED: ${result.message}` };
  if (/invalid BD mobile number/i.test(result.message)) return { ok: true, skipped: `INVALID_NUMBER: ${result.message}` };
  return { ok: false, error: result.message };
}

export const smsChannel: NotificationChannelAdapter = {
  channel: NotificationChannel.SMS,

  // A disabled gateway records SKIPPED up front (worker), never a fake SENT.
  isConfigured() {
    return isSmsConfigured();
  },

  addressFor(to: RecipientContact) {
    return to.phone ?? null;
  },

  async send(
    to: RecipientContact,
    message: RenderedMessage,
    _ctx: SendContext,
  ): Promise<SendResult> {
    if (!to.phone) return { ok: true, skipped: 'recipient has no phone number' };
    return smsResultToSendResult(await sendSms(to.phone, message.body));
  },
};
