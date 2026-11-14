// P2 student fees — pure UI logic (no React, no I/O). Tested in
// __tests__/studentFees-logic.test.ts. Money is reasoned about in paisa.

export const toPaisa = (n: number) => Math.round(n * 100);
export const fromPaisa = (p: number) => Math.round(p) / 100;

const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_BN = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
const BN_DIGITS = '০১২৩৪৫৬৭৮৯';

const toBnDigits = (s: string) => s.replace(/\d/g, (d) => BN_DIGITS[Number(d)]);

/** The Asia/Dhaka billing month (YYYY-MM) containing `now`. */
export function currentPeriod(now: Date = new Date()): string {
  const d = new Date(now.getTime() + 6 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function isPeriod(p: string | null | undefined): p is string {
  return typeof p === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(p);
}

export function addMonths(period: string, n: number): string {
  const [y, m] = period.split('-').map(Number);
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
}

/** "October 2026" / "অক্টোবর ২০২৬". */
export function monthLabel(period: string | null | undefined, lang: 'en' | 'bn' = 'en'): string {
  if (!isPeriod(period)) return '';
  const [y, m] = period.split('-').map(Number);
  return lang === 'bn' ? `${MONTHS_BN[m - 1]} ${toBnDigits(String(y))}` : `${MONTHS_EN[m - 1]} ${y}`;
}

/** Month options around now for pickers (newest last). */
export function periodOptions(now: Date = new Date(), back = 6, ahead = 3, lang: 'en' | 'bn' = 'en') {
  const cur = currentPeriod(now);
  const out: { value: string; label: string }[] = [];
  for (let i = -back; i <= ahead; i++) {
    const p = addMonths(cur, i);
    out.push({ value: p, label: monthLabel(p, lang) });
  }
  return out;
}

/** Yearly total spread like the server: whole taka for months 1–11, month 12 absorbs rounding. */
export function yearlySpreadPreview(total: number): { monthly: number; last: number } {
  const t = toPaisa(total);
  const base = Math.floor(t / 12 / 100) * 100;
  return { monthly: fromPaisa(base), last: fromPaisa(t - base * 11) };
}

// ── Counter ─────────────────────────────────────────────────────────────────

export interface DueRow {
  id: string;
  dueAmount: number;
  dueDate: string;
  status: string;
  period?: string | null;
}

const payable = (r: DueRow) => toPaisa(r.dueAmount) > 0 && r.status !== 'PAID' && r.status !== 'CANCELLED';

export function sortOldestFirst<T extends DueRow>(rows: T[]): T[] {
  const key = (r: DueRow) => (r.period ? `${r.period}-00` : String(r.dueDate).slice(0, 10));
  return [...rows].sort((a, b) => key(a).localeCompare(key(b)) || String(a.dueDate).localeCompare(String(b.dueDate)) || a.id.localeCompare(b.id));
}

/**
 * Preview of how the server will split `amount` over the selected invoices
 * (oldest first; each gets at most its due less any counter discount).
 * Returns null when the amount is invalid or more than what is due.
 */
export function previewAllocation(
  amount: number,
  rows: DueRow[],
  discounts: Record<string, number> = {},
): Array<{ invoiceId: string; amount: number }> | null {
  let left = toPaisa(amount);
  if (!Number.isFinite(amount) || left <= 0) return null;
  const list = sortOldestFirst(rows.filter(payable)).map((r) => ({ ...r, due: Math.max(0, toPaisa(r.dueAmount) - toPaisa(discounts[r.id] ?? 0)) }));
  const total = list.reduce((s, r) => s + r.due, 0);
  if (left > total) return null;
  const out: Array<{ invoiceId: string; amount: number }> = [];
  for (const r of list) {
    if (left <= 0) break;
    const take = Math.min(left, r.due);
    if (take > 0) out.push({ invoiceId: r.id, amount: fromPaisa(take) });
    left -= take;
  }
  return out;
}

/** Sum of dues of the selected invoices, after discounts. */
export function selectedDue(rows: DueRow[], selected: Set<string>, discounts: Record<string, number> = {}): number {
  return fromPaisa(
    rows.filter((r) => selected.has(r.id) && payable(r)).reduce((s, r) => s + Math.max(0, toPaisa(r.dueAmount) - toPaisa(discounts[r.id] ?? 0)), 0),
  );
}

/** Parses a typed amount ("1,200.50", "১২০০") → number, or NaN. */
export function parseAmount(raw: string): number {
  const ascii = raw.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d))).replace(/[,\s৳]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(ascii)) return NaN;
  return Number(ascii);
}

export const COUNTER_METHODS = ['CASH', 'BANK', 'BKASH_PERSONAL', 'NAGAD_PERSONAL', 'CHEQUE', 'OTHER'] as const;
export type CounterMethod = (typeof COUNTER_METHODS)[number];

/** English labels (translated with t() at render). Includes stored names. */
export const METHOD_LABELS: Record<string, string> = {
  CASH: 'Cash',
  BANK: 'Bank',
  BANK_TRANSFER: 'Bank',
  BKASH_PERSONAL: 'bKash (personal)',
  NAGAD_PERSONAL: 'Nagad (personal)',
  CHEQUE: 'Cheque',
  OTHER: 'Other',
  BKASH: 'bKash',
  NAGAD: 'Nagad',
  SSLCOMMERZ: 'SSLCommerz',
  GATEWAY: 'Online gateway',
};

/** Reference is required for cheque and bank. */
export function referenceRequired(method: string): boolean {
  return method === 'CHEQUE' || method === 'BANK';
}

/** Which invoice actions a role may take (mirrors the server's checks). */
export function invoiceActions(
  role: string | undefined,
  inv: { status: string; paidAmount: number | string },
): { cancel: boolean; reverse: boolean; refund: boolean; waive: boolean } {
  const staff = role === 'ADMIN' || role === 'ACCOUNTANT' || role === 'SUPER_ADMIN';
  const admin = role === 'ADMIN' || role === 'SUPER_ADMIN';
  return {
    cancel: staff && inv.status !== 'CANCELLED' && inv.status !== 'PAID' && Number(inv.paidAmount) === 0,
    reverse: admin,
    refund: staff,
    waive: admin,
  };
}
