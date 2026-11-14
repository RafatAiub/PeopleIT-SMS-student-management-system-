import { NotificationChannel } from '@prisma/client';
import { isSmsConfigured, sendSms, type SmsResult } from '../../../utils/sms.service';
import { RenderedMessage } from '../renderer';
import { INSUFFICIENT_CREDITS, PLATFORM_NOTIFICATION_TYPES } from '../../sms-credits/smsCredits.logic';
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
  // P5: no credits left is recorded with its own honest reason (not retried).
  if (result.status === 'SKIPPED' && result.reason === INSUFFICIENT_CREDITS) return { ok: true, skipped: result.message };
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
    ctx: SendContext,
  ): Promise<SendResult> {
    if (!to.phone) return { ok: true, skipped: 'recipient has no phone number' };
    // P5: school notifications (absence alerts, fee reminders, donations…)
    // are paid from the school's SMS credits; PeopleNIT → school/platform
    // types (subscription, lead) never are.
    const platform = PLATFORM_NOTIFICATION_TYPES.has(ctx.templateKey);
    return smsResultToSendResult(
      await sendSms(to.phone, message.body, {
        institutionId: ctx.institutionId,
        billing: platform ? 'PLATFORM' : 'SCHOOL',
        purpose: ctx.templateKey,
        sourceRef: ctx.dedupeKey?.slice(0, 190),
      }),
    );
  },
};
