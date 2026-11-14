import type { SmsBillingKind } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../config/prisma';
import { logger } from './logger';
import { normalizeBdMobile } from './phone';
import {
  describeProviders,
  parseGreenwebResponse,
  providerChain,
  sendWithFailover,
  type SmsProviderName,
} from './sms.providers';
import { countSmsSegments } from '../modules/campaigns/smsSegments';
import { generateClientRef, INSUFFICIENT_CREDITS, PLATFORM_PURPOSES } from '../modules/sms-credits/smsCredits.logic';
import { getSender, refundMessage, reserveForMessage } from '../modules/sms-credits/smsWallet.service';

// Re-exported for backward compatibility (P0 tests and callers import it from here).
export { parseGreenwebResponse };

/**
 * P0: an honest result. `success` is true ONLY when a provider accepted the
 * message. Callers must record `status` as-is:
 *   - SENT    → a gateway accepted it
 *   - SKIPPED → nothing was transmitted on purpose (SMS disabled / no
 *               provider, or P5: the school has no SMS credits left —
 *               `reason: 'INSUFFICIENT_CREDITS'`)
 *   - FAILED  → invalid number, HTTP error, or the gateway(s) reported an error
 */
export type SmsStatus = 'SENT' | 'SKIPPED' | 'FAILED';

export interface SmsResult {
  success: boolean;
  status: SmsStatus;
  /** Provider reply (SENT), or the reason (SKIPPED / FAILED). */
  message: string;
  /** The normalised number actually used (8801XXXXXXXXX), when valid. */
  to?: string;
  /** P5: machine-readable reason, e.g. INSUFFICIENT_CREDITS, SMS_DISABLED, INVALID_NUMBER. */
  reason?: string;
  /** P5: the SmsMessage log row (when it could be written). */
  smsMessageId?: string;
  provider?: SmsProviderName;
  providerMessageId?: string;
  segments?: number;
}

/**
 * P5 options. Every existing two-argument call keeps working: without an
 * institutionId the message is a PLATFORM message (PeopleNIT's own balance,
 * never deducted from a school).
 */
export interface SendSmsOptions {
  /** The school this message is sent for. Required for school billing. */
  institutionId?: string | null;
  /** Default SCHOOL when institutionId is set; PLATFORM never deducts. */
  billing?: SmsBillingKind;
  /** FEE_REMINDER, ATTENDANCE, CAMPAIGN, DONATION_REMINDER, DEFAULTER, NOTICE, PLATFORM_BILLING, AUTH_OTP… */
  purpose?: string;
  /** Business reference (invoice id, campaign id…). */
  sourceRef?: string;
  /** Don't store the text (OTPs, passwords). */
  sensitive?: boolean;
}

/** Masks all but the last 3 digits — phone numbers are PII in logs. */
export function maskPhone(phone: string | null | undefined): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length <= 3) return '***';
  return `${'*'.repeat(digits.length - 3)}${digits.slice(-3)}`;
}

/** SMS is live when SMS_ENABLED and at least one provider (primary or fallback) has credentials. */
export function isSmsConfigured(): boolean {
  return env.SMS_ENABLED && providerChain().length > 0;
}

/** One line for the startup log, e.g. "LIVE (primary Greenweb, fallback BulkSMSBD)". */
export function describeSmsMode(): string {
  if (!env.SMS_ENABLED) return 'DISABLED (SKIPPED)';
  const chain = providerChain();
  if (chain.length === 0) return 'DISABLED (no provider credentials — SKIPPED)';
  const rows = describeProviders();
  const fallback = rows.find((r) => r.role === 'FALLBACK');
  const fb = fallback ? `, fallback ${fallback.label}${fallback.configured ? '' : ' (NOT CONFIGURED)'}` : ', no fallback';
  return `LIVE (${chain[0].label}${fb})`;
}

export function billingFor(opts: SendSmsOptions): SmsBillingKind {
  if (!opts.institutionId) return 'PLATFORM';
  if (opts.billing === 'PLATFORM') return 'PLATFORM';
  if (opts.purpose && PLATFORM_PURPOSES.has(opts.purpose)) return 'PLATFORM';
  return 'SCHOOL';
}

/** Best-effort log row (platform messages, invalid numbers, disabled SMS). Never throws. */
async function writeLog(data: Parameters<typeof prisma.smsMessage.create>[0]['data']): Promise<string | undefined> {
  try {
    const row = await prisma.smsMessage.create({ data, select: { id: true } });
    return row.id;
  } catch (error) {
    logger.warn('SMS log row not written', { error: (error as Error).message });
    return undefined;
  }
}

async function updateLog(id: string | undefined, data: Parameters<typeof prisma.smsMessage.update>[0]['data']) {
  if (!id) return;
  await prisma.smsMessage.update({ where: { id }, data }).catch((error) => {
    logger.warn('SMS log row not updated', { id, error: (error as Error).message });
  });
}

/**
 * Sends one SMS.
 *  1. Normalises the number to 8801XXXXXXXXX (invalid → FAILED, no provider call, no charge).
 *  2. SMS disabled / no provider → SKIPPED (no charge).
 *  3. School messages: deducts credits per segment BEFORE sending (free
 *     monthly allowance first). Insufficient → SKIPPED, reason
 *     INSUFFICIENT_CREDITS, ADMINs alerted (once a day).
 *  4. Sends via the primary provider, failing over once to the fallback on
 *     a provider/HTTP error.
 *  5. FAILED → the deducted credits are refunded automatically.
 * Every outcome is stored in SmsMessage (the SMS log).
 */
export async function sendSms(toPhone: string, message: string, opts: SendSmsOptions = {}): Promise<SmsResult> {
  const seg = countSmsSegments(message);
  const units = Math.max(1, seg.segments);
  const billing = billingFor(opts);
  const institutionId = opts.institutionId ?? null;
  const base = {
    institutionId,
    body: opts.sensitive ? '[hidden]' : message,
    segments: units,
    encoding: seg.encoding,
    billing,
    purpose: opts.purpose ?? null,
    sourceRef: opts.sourceRef ?? null,
  };

  const to = normalizeBdMobile(toPhone);
  if (!to) {
    logger.warn('SMS not sent: invalid BD mobile number', { to: maskPhone(toPhone) });
    const reason = `invalid BD mobile number (${maskPhone(toPhone)})`;
    const smsMessageId = institutionId ? await writeLog({ ...base, to: maskPhone(toPhone), status: 'FAILED', error: reason }) : undefined;
    return { success: false, status: 'FAILED', message: reason, reason: 'INVALID_NUMBER', smsMessageId, segments: units };
  }

  if (!isSmsConfigured()) {
    logger.info('[SMS disabled or not configured] SMS not transmitted', { to: maskPhone(to), length: message.length });
    const reason = 'SMS sending is disabled (SMS_ENABLED=false or no SMS provider credentials)';
    const smsMessageId = await writeLog({ ...base, to, status: 'SKIPPED', error: reason });
    return { success: false, status: 'SKIPPED', message: reason, reason: 'SMS_DISABLED', to, smsMessageId, segments: units };
  }

  // ── Charge the school first ──
  let smsMessageId: string | undefined;
  let charged = false;
  if (billing === 'SCHOOL' && institutionId) {
    try {
      const r = await reserveForMessage({ ...base, institutionId, to }, units);
      if (!r.ok) {
        logger.info('School SMS skipped: insufficient SMS credits', { institutionId, to: maskPhone(to), units });
        return {
          success: false,
          status: 'SKIPPED',
          message: `${INSUFFICIENT_CREDITS}: the school has no SMS credits left for this message (${units} needed)`,
          reason: INSUFFICIENT_CREDITS,
          to,
          smsMessageId: r.messageId ?? undefined,
          segments: units,
        };
      }
      smsMessageId = r.messageId;
      charged = r.costUnits > 0 || r.freeUnits > 0;
    } catch (error) {
      // Never send unbilled: a wallet error means the school message waits for a retry.
      logger.error('SMS wallet unavailable — school SMS not sent', { institutionId, error: (error as Error).message });
      return { success: false, status: 'FAILED', message: `SMS wallet unavailable: ${(error as Error).message}`, to, segments: units };
    }
  } else {
    smsMessageId = await writeLog({ ...base, to, status: 'QUEUED' });
  }

  const sender = billing === 'SCHOOL' && institutionId ? await getSender(institutionId).catch(() => null) : null;
  const outcome = await sendWithFailover(
    { to, message, unicode: seg.encoding === 'UNICODE', clientRef: generateClientRef() },
    sender,
  );
  const attempts = outcome.attempts.map((a) => ({ provider: a.provider, ok: a.ok, detail: a.detail }));

  if (outcome.ok) {
    await updateLog(smsMessageId, {
      status: 'SENT',
      provider: outcome.provider,
      providerMessageId: outcome.providerMessageId ?? null,
      senderId: sender?.senderId && (!sender.senderProvider || sender.senderProvider === outcome.provider) ? sender.senderId : null,
      attempts,
      sentAt: new Date(),
      error: null,
    });
    logger.info('SMS sent', { to: maskPhone(to), provider: outcome.provider, failover: outcome.attempts.length > 1 });
    return {
      success: true,
      status: 'SENT',
      message: outcome.detail,
      to,
      smsMessageId,
      provider: outcome.provider,
      providerMessageId: outcome.providerMessageId,
      segments: units,
    };
  }

  await updateLog(smsMessageId, { status: 'FAILED', provider: outcome.provider ?? null, attempts, error: outcome.detail.slice(0, 2000) });
  if (charged && smsMessageId) {
    await refundMessage(smsMessageId, `Refund: SMS failed (${outcome.detail.slice(0, 200)})`).catch((error) =>
      logger.error('SMS credit refund failed — fix by hand', { smsMessageId, error: (error as Error).message }),
    );
  }
  logger.error('SMS failed', { to: maskPhone(to), provider: outcome.provider, detail: outcome.detail.slice(0, 300) });
  return {
    success: false,
    status: 'FAILED',
    message: outcome.detail,
    reason: outcome.recipientError ? 'RECIPIENT_REJECTED' : 'PROVIDER_ERROR',
    to,
    smsMessageId,
    provider: outcome.provider,
    segments: units,
  };
}
