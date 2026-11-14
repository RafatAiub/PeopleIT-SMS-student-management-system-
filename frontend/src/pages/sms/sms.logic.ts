// =============================================================================
// P5 SMS credits — pure frontend helpers (no React, no I/O). Tested by
// pages/sms/__tests__/sms-logic.test.ts. The segment rules mirror
// backend/src/modules/campaigns/smsSegments.ts and the sender-ID rules mirror
// backend/src/modules/sms-credits/smsCredits.logic.ts — the server re-checks both.
// =============================================================================

export type SmsStatus = 'QUEUED' | 'SENT' | 'DELIVERED' | 'FAILED' | 'SKIPPED';
export type LedgerType = 'PURCHASE' | 'DEDUCT' | 'REFUND' | 'ADJUST' | 'BONUS';
export type ProviderName = 'GREENWEB' | 'BULKSMSBD' | 'SSLWIRELESS';

const GSM_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\u001bÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM_EXTENDED = '^{}\\[~]|€\f';
const BASIC = new Set(Array.from(GSM_BASIC));
const EXT = new Set(Array.from(GSM_EXTENDED));

/** SMS credits a message costs: 1 per segment (160/153 GSM, 70/67 Bangla/Unicode). */
export function smsUnits(text: string): { encoding: 'GSM' | 'UNICODE'; length: number; units: number } {
  if (!text) return { encoding: 'GSM', length: 0, units: 0 };
  const chars = Array.from(text);
  if (chars.every((c) => BASIC.has(c) || EXT.has(c))) {
    const length = chars.reduce((n, c) => n + (EXT.has(c) ? 2 : 1), 0);
    return { encoding: 'GSM', length, units: length <= 160 ? 1 : Math.ceil(length / 153) };
  }
  const length = text.length;
  return { encoding: 'UNICODE', length, units: length <= 70 ? 1 : Math.ceil(length / 67) };
}

export const SENDER_ID_MAX = 11;

/** null = valid; otherwise an English message key (translated by the caller). */
export function senderIdError(raw: string): string | null {
  const v = raw.trim().replace(/\s+/g, ' ');
  if (v.length < 3) return 'Sender ID must be at least 3 characters';
  if (v.length > SENDER_ID_MAX) return 'Sender ID can be at most 11 characters';
  if (!/^[A-Za-z0-9 .&-]+$/.test(v)) return 'Use only English letters, digits, space, dot, hyphen or &';
  if (!/[A-Za-z]/.test(v)) return 'Sender ID must contain at least one letter';
  return null;
}

export const STATUS_VARIANT: Record<SmsStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  QUEUED: 'info',
  SENT: 'success',
  DELIVERED: 'success',
  FAILED: 'danger',
  SKIPPED: 'warning',
};

export const STATUS_LABEL: Record<SmsStatus, string> = {
  QUEUED: 'Queued',
  SENT: 'Sent',
  DELIVERED: 'Delivered',
  FAILED: 'Failed',
  SKIPPED: 'Skipped',
};

export const LEDGER_LABEL: Record<LedgerType, string> = {
  PURCHASE: 'Purchase',
  DEDUCT: 'Used',
  REFUND: 'Refund',
  ADJUST: 'Adjustment',
  BONUS: 'Bonus',
};

export const PROVIDER_LABEL: Record<ProviderName, string> = {
  GREENWEB: 'Greenweb',
  BULKSMSBD: 'BulkSMSBD',
  SSLWIRELESS: 'SSL Wireless',
};

export const PURPOSE_LABEL: Record<string, string> = {
  FEE_REMINDER: 'Fee reminder',
  ABSENCE_ALERT: 'Absence alert',
  CAMPAIGN: 'Campaign',
  DONATION_REMINDER: 'Donation reminder',
  DEFAULTER: 'Dues reminder',
  NOTICE: 'Notice',
  PLATFORM_BILLING: 'PeopleNIT billing',
  AUTH_OTP: 'Login code',
};

export function purposeLabel(p: string | null | undefined): string {
  if (!p) return '—';
  return PURPOSE_LABEL[p] ?? p.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

/** True when the error says the school ran out of credits. */
export function isInsufficient(error: string | null | undefined): boolean {
  return !!error && /INSUFFICIENT_CREDITS/.test(error);
}

/** Signed units for the ledger column, e.g. "+500", "−2". */
export function signedUnits(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${Math.abs(n)}`;
  return '0';
}

/** Price per SMS, rounded to paisa precision for display. */
export function perSms(priceBdt: number, units: number): number {
  return units > 0 ? Math.round((priceBdt / units) * 100) / 100 : 0;
}

/** Balance level for the meter: ok / low / empty. */
export function balanceLevel(balance: number, threshold: number): 'ok' | 'low' | 'empty' {
  if (balance <= 0) return 'empty';
  if (threshold > 0 && balance < threshold) return 'low';
  return 'ok';
}

/** How many messages of `units` each the balance covers (+ free allowance). */
export function messagesLeft(balance: number, freeRemaining: number, unitsPerMessage = 1): number {
  const per = Math.max(1, unitsPerMessage);
  return Math.floor((Math.max(0, balance) + Math.max(0, freeRemaining)) / per);
}

/** Query string for the log/export endpoints (empty values dropped). */
export function logQuery(filters: Record<string, string | number | undefined | null>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  return qs.toString();
}

/** Reads ?purchase=success|failed|cancelled|pending&pid=… after a gateway redirect. */
export function purchaseResult(search: string): { status: 'success' | 'failed' | 'cancelled' | 'pending'; purchaseId: string | null } | null {
  const qs = new URLSearchParams(search);
  const s = qs.get('purchase');
  if (s !== 'success' && s !== 'failed' && s !== 'cancelled' && s !== 'pending') return null;
  return { status: s, purchaseId: qs.get('pid') };
}
