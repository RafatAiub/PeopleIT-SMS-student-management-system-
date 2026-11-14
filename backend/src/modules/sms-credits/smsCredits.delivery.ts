import crypto from 'crypto';
import { prisma } from '../../config/prisma';
import { logger } from '../../utils/logger';
import { mapDeliveryWord, parseProviderName, SMS_PROVIDERS, type DeliveryState, type SmsProviderName } from '../../utils/sms.providers';
import { refundMessage } from './smsWallet.service';

// =============================================================================
// P5 delivery status.
//   1. Webhook: POST/GET /api/v1/sms-credits/dlr/:provider?token=SMS_DLR_TOKEN
//      — point each provider's delivery-report (DLR) URL here. Disabled
//      (404) until SMS_DLR_TOKEN (≥ 16 chars) is set.
//   2. Poll: every 15 min (BACKGROUND_JOBS only) for providers with a status
//      API, messages sent 2 min–24 h ago. SMS_STATUS_POLL=false turns it off.
// A delivery failure reported AFTER the provider accepted the message is not
// refunded by default (operators still charge for it); set
// SMS_REFUND_ON_DLR_FAILURE=true to refund those too.
// =============================================================================

export function dlrToken(): string | null {
  const t = (process.env.SMS_DLR_TOKEN ?? '').trim();
  return t.length >= 16 ? t : null;
}

export function checkDlrToken(given: unknown): boolean {
  const expected = dlrToken();
  if (!expected || typeof given !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const ID_KEYS = ['message_id', 'messageId', 'messageid', 'msgid', 'msg_id', 'reference_id', 'referenceId', 'csms_id', 'smsid', 'sms_id', 'id'];
const STATUS_KEYS = ['dlr_status', 'delivery_status', 'deliveryStatus', 'status', 'sms_status', 'stat', 'dlr'];

export interface DlrItem {
  providerMessageId: string;
  state: DeliveryState;
  word: string;
}

/** Pulls (id, status) pairs out of any provider's DLR payload: an object, an array, or { data|smsinfo: [...] }. */
export function parseDlrPayload(payload: unknown): DlrItem[] {
  const out: DlrItem[] = [];
  const visit = (v: unknown) => {
    if (Array.isArray(v)) {
      v.forEach(visit);
      return;
    }
    if (!v || typeof v !== 'object') return;
    const r = v as Record<string, unknown>;
    for (const nested of ['data', 'smsinfo', 'reports', 'results']) if (Array.isArray(r[nested])) visit(r[nested]);
    const idKey = ID_KEYS.find((k) => r[k] !== undefined && r[k] !== null && r[k] !== '' && typeof r[k] !== 'object');
    const statusKey = STATUS_KEYS.find((k) => typeof r[k] === 'string' || typeof r[k] === 'number');
    if (idKey && statusKey) {
      const word = String(r[statusKey]);
      out.push({ providerMessageId: String(r[idKey]), state: mapDeliveryWord(word), word });
    }
  };
  visit(payload);
  return out;
}

/** Applies one delivery update. Returns true when a row changed. */
export async function applyDelivery(provider: SmsProviderName, providerMessageId: string, state: DeliveryState, detail: string, now: Date = new Date()): Promise<boolean> {
  if (state !== 'DELIVERED' && state !== 'FAILED') {
    await prisma.smsMessage.updateMany({ where: { provider, providerMessageId }, data: { statusCheckedAt: now } });
    return false;
  }
  const msgs = await prisma.smsMessage.findMany({
    where: { provider, providerMessageId, status: { in: ['SENT', 'QUEUED'] } },
    select: { id: true },
    take: 5,
  });
  let changed = false;
  for (const m of msgs) {
    const r = await prisma.smsMessage.updateMany({
      where: { id: m.id, status: { in: ['SENT', 'QUEUED'] } },
      data:
        state === 'DELIVERED'
          ? { status: 'DELIVERED', deliveredAt: now, statusCheckedAt: now }
          : { status: 'FAILED', error: `Delivery failed: ${detail}`.slice(0, 2000), statusCheckedAt: now },
    });
    if (r.count === 1) {
      changed = true;
      if (state === 'FAILED' && (process.env.SMS_REFUND_ON_DLR_FAILURE ?? '').toLowerCase() === 'true') {
        await refundMessage(m.id, `Refund: delivery failed (${detail.slice(0, 100)})`).catch(() => undefined);
      }
    }
  }
  return changed;
}

export async function handleDlrWebhook(providerSlug: string, payload: unknown): Promise<{ received: number; updated: number }> {
  const provider = parseProviderName(providerSlug);
  if (!provider) return { received: 0, updated: 0 };
  const items = parseDlrPayload(payload);
  let updated = 0;
  for (const it of items.slice(0, 500)) {
    if (await applyDelivery(provider, it.providerMessageId, it.state, it.word)) updated += 1;
  }
  logger.info('SMS DLR webhook', { provider, received: items.length, updated });
  return { received: items.length, updated };
}

/** One poll pass. Bounded: 100 messages per run. */
export async function pollDeliveryStatus(now: Date = new Date()): Promise<{ checked: number; updated: number }> {
  const pollable = (Object.keys(SMS_PROVIDERS) as SmsProviderName[]).filter((n) => SMS_PROVIDERS[n].getDeliveryStatus && SMS_PROVIDERS[n].isConfigured());
  if (pollable.length === 0) return { checked: 0, updated: 0 };
  const rows = await prisma.smsMessage.findMany({
    where: {
      status: 'SENT',
      provider: { in: pollable },
      providerMessageId: { not: null },
      sentAt: { gte: new Date(now.getTime() - 24 * 3600_000), lte: new Date(now.getTime() - 2 * 60_000) },
      OR: [{ statusCheckedAt: null }, { statusCheckedAt: { lt: new Date(now.getTime() - 30 * 60_000) } }],
    },
    select: { id: true, provider: true, providerMessageId: true },
    orderBy: { sentAt: 'asc' },
    take: 100,
  });
  let updated = 0;
  for (const r of rows) {
    const p = SMS_PROVIDERS[r.provider as SmsProviderName];
    try {
      const s = await p.getDeliveryStatus!(r.providerMessageId!);
      if (await applyDelivery(p.name, r.providerMessageId!, s.state, s.detail, now)) updated += 1;
    } catch (error) {
      await prisma.smsMessage.update({ where: { id: r.id }, data: { statusCheckedAt: now } }).catch(() => undefined);
      logger.warn('SMS status poll failed', { provider: r.provider, error: (error as Error).message });
    }
  }
  return { checked: rows.length, updated };
}
