import crypto from 'crypto';

// =============================================================================
// P5 SMS credits — pure helpers (no I/O). Unit tested in
// tests/p5-sms-credits-logic.test.ts.
// =============================================================================

const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000; // UTC+6, no DST

/** YYYY-MM in Asia/Dhaka — the free-allowance month. */
export function dhakaMonthKey(now: Date = new Date()): string {
  const d = new Date(now.getTime() + DHAKA_OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** YYYY-MM-DD in Asia/Dhaka. */
export function dhakaDayKey(now: Date = new Date()): string {
  const d = new Date(now.getTime() + DHAKA_OFFSET_MS);
  return `${dhakaMonthKey(now)}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** The UTC instant of 00:00 Asia/Dhaka on `now`'s Dhaka day. */
export function startOfDhakaDay(now: Date = new Date()): Date {
  const d = new Date(now.getTime() + DHAKA_OFFSET_MS);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - DHAKA_OFFSET_MS);
}

/** True when an alert was not yet sent today (Dhaka) — "max once a day". */
export function canAlertToday(lastAlertAt: Date | null | undefined, now: Date = new Date()): boolean {
  return !lastAlertAt || lastAlertAt.getTime() < startOfDhakaDay(now).getTime();
}

export interface WalletState {
  balance: number;
  freeMonth: string | null;
  freeUsed: number;
}

export interface DeductionPlan {
  ok: boolean;
  /** Units taken from this month's free allowance. */
  freeTake: number;
  /** Units taken from the paid balance. */
  paidTake: number;
  newBalance: number;
  newFreeUsed: number;
  month: string;
}

/**
 * Decides how `units` are paid: free monthly allowance first, then the paid
 * balance. Never lets the balance go negative — `ok:false` means "insufficient
 * credits" and nothing changes. The allowance counter resets when the month
 * (Asia/Dhaka) changes.
 */
export function planDeduction(wallet: WalletState, units: number, freeAllowance: number, month: string): DeductionPlan {
  const need = Math.max(0, Math.floor(units));
  const usedThisMonth = wallet.freeMonth === month ? Math.max(0, wallet.freeUsed) : 0;
  const freeLeft = Math.max(0, Math.floor(freeAllowance) - usedThisMonth);
  const freeTake = Math.min(need, freeLeft);
  const paidTake = need - freeTake;
  if (paidTake > wallet.balance) {
    return { ok: false, freeTake: 0, paidTake: 0, newBalance: wallet.balance, newFreeUsed: usedThisMonth, month };
  }
  return { ok: true, freeTake, paidTake, newBalance: wallet.balance - paidTake, newFreeUsed: usedThisMonth + freeTake, month };
}

/**
 * Free units returned by a refund: only if the refund happens in the same
 * allowance month as the deduction (a new month already reset the counter).
 */
export function freeUnitsToReturn(freeUnits: number, deductedMonth: string, walletMonth: string | null): number {
  return walletMonth === deductedMonth ? Math.max(0, freeUnits) : 0;
}

/** Remaining free units this month. */
export function freeRemaining(wallet: Pick<WalletState, 'freeMonth' | 'freeUsed'>, freeAllowance: number, month: string): number {
  const used = wallet.freeMonth === month ? wallet.freeUsed : 0;
  return Math.max(0, freeAllowance - used);
}

export function isLowBalance(balance: number, threshold: number): boolean {
  return threshold > 0 && balance < threshold;
}

// ── Sender ID (masking) ─────────────────────────────────────────────────────

export const SENDER_ID_MAX = 11;
export const SENDER_ID_MIN = 3;

/**
 * Bangladesh masking sender IDs: up to 11 characters (GSM alphanumeric
 * originator limit), letters/digits plus space, dot, hyphen and ampersand,
 * must contain at least one letter (an all-digit ID looks like a phone
 * number and operators refuse it).
 */
export function validateSenderId(raw: string | null | undefined): { ok: true; value: string } | { ok: false; error: string } {
  const value = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (value.length < SENDER_ID_MIN) return { ok: false, error: `Sender ID must be at least ${SENDER_ID_MIN} characters` };
  if (value.length > SENDER_ID_MAX) return { ok: false, error: `Sender ID can be at most ${SENDER_ID_MAX} characters` };
  if (!/^[A-Za-z0-9 .&-]+$/.test(value)) return { ok: false, error: 'Use only English letters, digits, space, dot, hyphen or &' };
  if (!/[A-Za-z]/.test(value)) return { ok: false, error: 'Sender ID must contain at least one letter' };
  return { ok: true, value };
}

// ── Purchases ───────────────────────────────────────────────────────────────

export function receiptNumberFor(month: string, seq: number): string {
  return `SCR-${month.replace('-', '')}-${String(seq).padStart(4, '0')}`;
}

export function nextSequence(lastReceipt: string | null | undefined): number {
  const m = lastReceipt?.match(/-(\d+)$/);
  return m ? parseInt(m[1], 10) + 1 : 1;
}

/** Our merchant transaction id: alphanumeric, ≤ 20 chars (fits every gateway). */
export function generateSmsTranId(now: number = Date.now()): string {
  return `SMSC${now.toString(36)}${crypto.randomBytes(5).toString('hex')}`.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20);
}

/** Provider client reference (SSL Wireless csms_id): ≤ 20 alphanumeric. */
export function generateClientRef(): string {
  return `P5${Date.now().toString(36)}${crypto.randomBytes(5).toString('hex')}`.toUpperCase().slice(0, 20);
}

/** BDT → paisa (integer) to avoid float drift. */
export function toPaisa(v: number | string | { toString(): string }): number {
  return Math.round(parseFloat(String(v)) * 100);
}

/** Price per SMS unit for display, e.g. 0.35. */
export function pricePerUnit(priceBdt: number, units: number): number {
  return units > 0 ? Math.round((priceBdt / units) * 10000) / 10000 : 0;
}

// ── Messages ────────────────────────────────────────────────────────────────

/** School-originated purposes are billed to the school wallet; these never are. */
export const PLATFORM_PURPOSES = new Set(['PLATFORM_BILLING', 'AUTH_OTP', 'PLATFORM', 'LEAD_SUBMITTED']);

/** Notification types that are PeopleNIT → school / platform messages (never billed to a school). */
export const PLATFORM_NOTIFICATION_TYPES = new Set([
  'LEAD_SUBMITTED',
  'SUBSCRIPTION_ACTIVATED',
  'SUBSCRIPTION_PAYMENT_FAILED',
  'SUBSCRIPTION_PAYMENT_REQUESTED',
  'SUBSCRIPTION_ADJUSTED',
  'SUBSCRIPTION_REFUND_INITIATED',
  'SUBSCRIPTION_REFUNDED',
  'SUBSCRIPTION_TRIAL_ENDING',
  'SUBSCRIPTION_TRIAL_EXPIRED',
  'SUBSCRIPTION_GRACE',
  'SUBSCRIPTION_SUSPENDED',
]);

export const INSUFFICIENT_CREDITS = 'INSUFFICIENT_CREDITS';

/** One CSV cell, RFC 4180 + formula-injection guard for spreadsheet apps. */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? '' : v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return [header.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\r\n');
}

/** Masks a phone for display to super-admins across schools: 8801*****5678. */
export function maskForDisplay(phone: string): string {
  const d = phone.replace(/\D/g, '');
  if (d.length < 8) return phone;
  return `${d.slice(0, 4)}${'*'.repeat(d.length - 8)}${d.slice(-4)}`;
}
