import crypto from 'crypto';

// =============================================================================
// Donations (T1) — pure logic. No DB, no Express. Unit-tested in
// tests/donations-logic.test.ts.
//
//   receipt numbers   DON-<YEAR>-<000001>, a counter per school per year
//   references        DN-<YYMMDD>-<8 random>, public and unguessable
//   amount in words   English (lakh/crore) and Bangla, for receipts
//   recurring pledges due dates and "due this month"
//   fund balances     collected − disbursed, in whole paisa (no float drift)
// =============================================================================

// ── Receipt numbers ──────────────────────────────────────────────────────────

export function donationReceiptPrefix(year: number): string {
  return `DON-${year}-`;
}

export function formatDonationReceiptNo(year: number, counter: number): string {
  if (!Number.isInteger(counter) || counter < 1) throw new Error(`Invalid receipt counter: ${counter}`);
  return `${donationReceiptPrefix(year)}${String(counter).padStart(6, '0')}`;
}

/** Trailing counter of a receipt number with this prefix, or 0. */
export function parseDonationReceiptCounter(receiptNo: string | null | undefined, prefix: string): number {
  if (!receiptNo || !receiptNo.startsWith(prefix)) return 0;
  const n = parseInt(receiptNo.slice(prefix.length), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** The next receipt number after the school's current highest for that year. */
export function nextDonationReceiptNo(currentMax: string | null | undefined, year: number, bump = 0): string {
  const prefix = donationReceiptPrefix(year);
  return formatDonationReceiptNo(year, parseDonationReceiptCounter(currentMax, prefix) + 1 + Math.max(0, bump));
}

// ── Public references ────────────────────────────────────────────────────────

// Crockford-ish alphabet: no 0/O/1/I/L confusion when read aloud or typed.
const REF_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function generateDonationReference(now: Date = new Date(), random: (n: number) => Buffer = crypto.randomBytes): string {
  const y = String(now.getUTCFullYear() % 100).padStart(2, '0');
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  const bytes = random(8);
  let tail = '';
  for (let i = 0; i < 8; i++) tail += REF_ALPHABET[bytes[i] % REF_ALPHABET.length];
  return `DN-${y}${m}${d}-${tail}`;
}

// ── Money ────────────────────────────────────────────────────────────────────

/** Taka (number/string/Decimal-like) → whole paisa. */
export function toPaisa(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(String(value ?? 0));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function fromPaisa(paisa: number): number {
  return Math.round(paisa) / 100;
}

/** Positive, at most 2 decimals, at most 1 crore per gift. */
export function isValidDonationAmount(n: number): boolean {
  return Number.isFinite(n) && n > 0 && n <= 10_000_000 && Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;
}

// ── Amount in words ──────────────────────────────────────────────────────────

const EN_ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen',
  'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
];
const EN_TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function enBelowHundred(n: number): string {
  if (n < 20) return EN_ONES[n];
  const t = EN_TENS[Math.floor(n / 10)];
  return n % 10 ? `${t}-${EN_ONES[n % 10]}` : t;
}

function enBelowThousand(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${EN_ONES[h]} Hundred` : '', r ? enBelowHundred(r) : ''].filter(Boolean).join(' ');
}

/** Indian/Bangladeshi grouping: crore, lakh, thousand, hundred. */
function enInteger(n: number): string {
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  let rest = n % 10_000_000;
  if (crore) parts.push(`${enInteger(crore)} Crore`);
  const lakh = Math.floor(rest / 100_000);
  rest %= 100_000;
  if (lakh) parts.push(`${enBelowHundred(lakh)} Lakh`);
  const thousand = Math.floor(rest / 1000);
  rest %= 1000;
  if (thousand) parts.push(`${enBelowHundred(thousand)} Thousand`);
  if (rest) parts.push(enBelowThousand(rest));
  return parts.join(' ');
}

const BN_0_99 = [
  'শূন্য', 'এক', 'দুই', 'তিন', 'চার', 'পাঁচ', 'ছয়', 'সাত', 'আট', 'নয়',
  'দশ', 'এগারো', 'বারো', 'তেরো', 'চৌদ্দ', 'পনেরো', 'ষোলো', 'সতেরো', 'আঠারো', 'উনিশ',
  'বিশ', 'একুশ', 'বাইশ', 'তেইশ', 'চব্বিশ', 'পঁচিশ', 'ছাব্বিশ', 'সাতাশ', 'আটাশ', 'ঊনত্রিশ',
  'ত্রিশ', 'একত্রিশ', 'বত্রিশ', 'তেত্রিশ', 'চৌত্রিশ', 'পঁয়ত্রিশ', 'ছত্রিশ', 'সাঁইত্রিশ', 'আটত্রিশ', 'ঊনচল্লিশ',
  'চল্লিশ', 'একচল্লিশ', 'বিয়াল্লিশ', 'তেতাল্লিশ', 'চুয়াল্লিশ', 'পঁয়তাল্লিশ', 'ছেচল্লিশ', 'সাতচল্লিশ', 'আটচল্লিশ', 'ঊনপঞ্চাশ',
  'পঞ্চাশ', 'একান্ন', 'বাহান্ন', 'তিপ্পান্ন', 'চুয়ান্ন', 'পঞ্চান্ন', 'ছাপ্পান্ন', 'সাতান্ন', 'আটান্ন', 'ঊনষাট',
  'ষাট', 'একষট্টি', 'বাষট্টি', 'তেষট্টি', 'চৌষট্টি', 'পঁয়ষট্টি', 'ছেষট্টি', 'সাতষট্টি', 'আটষট্টি', 'ঊনসত্তর',
  'সত্তর', 'একাত্তর', 'বাহাত্তর', 'তিয়াত্তর', 'চুয়াত্তর', 'পঁচাত্তর', 'ছিয়াত্তর', 'সাতাত্তর', 'আটাত্তর', 'ঊনআশি',
  'আশি', 'একাশি', 'বিরাশি', 'তিরাশি', 'চুরাশি', 'পঁচাশি', 'ছিয়াশি', 'সাতাশি', 'আটাশি', 'ঊননব্বই',
  'নব্বই', 'একানব্বই', 'বিরানব্বই', 'তিরানব্বই', 'চুরানব্বই', 'পঁচানব্বই', 'ছিয়ানব্বই', 'সাতানব্বই', 'আটানব্বই', 'নিরানব্বই',
];

function bnInteger(n: number): string {
  if (n === 0) return BN_0_99[0];
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  let rest = n % 10_000_000;
  if (crore) parts.push(`${bnInteger(crore)} কোটি`);
  const lakh = Math.floor(rest / 100_000);
  rest %= 100_000;
  if (lakh) parts.push(`${BN_0_99[lakh]} লক্ষ`);
  const thousand = Math.floor(rest / 1000);
  rest %= 1000;
  if (thousand) parts.push(`${BN_0_99[thousand]} হাজার`);
  const hundred = Math.floor(rest / 100);
  rest %= 100;
  if (hundred) parts.push(`${BN_0_99[hundred]} শত`);
  if (rest) parts.push(BN_0_99[rest]);
  return parts.join(' ');
}

/** e.g. 125000.5 → "One Lakh Twenty-Five Thousand Taka and Fifty Paisa Only" */
export function amountInWordsEn(amount: number): string {
  const paisa = Math.max(0, toPaisa(amount));
  const taka = Math.floor(paisa / 100);
  const p = paisa % 100;
  const takaWords = `${enInteger(taka)} Taka`;
  return p ? `${takaWords} and ${enBelowHundred(p)} Paisa Only` : `${takaWords} Only`;
}

/** e.g. 125000.5 → "এক লক্ষ পঁচিশ হাজার টাকা ও পঞ্চাশ পয়সা মাত্র" */
export function amountInWordsBn(amount: number): string {
  const paisa = Math.max(0, toPaisa(amount));
  const taka = Math.floor(paisa / 100);
  const p = paisa % 100;
  const takaWords = `${bnInteger(taka)} টাকা`;
  return p ? `${takaWords} ও ${BN_0_99[p]} পয়সা মাত্র` : `${takaWords} মাত্র`;
}

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
export function toBanglaDigits(value: string | number): string {
  return String(value).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);
}

// ── Recurring pledges ────────────────────────────────────────────────────────
// All date maths is on calendar days in UTC (a due *date*, not a time).

export function clampDayOfMonth(day: number): number {
  return Math.min(28, Math.max(1, Math.trunc(day) || 1));
}

function utcDate(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d));
}

export function startOfUtcDay(d: Date): Date {
  return utcDate(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function startOfUtcMonth(d: Date): Date {
  return utcDate(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

export function startOfNextUtcMonth(d: Date): Date {
  return utcDate(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
}

/** The first `dayOfMonth` on or after `from`. */
export function firstDueDate(from: Date, dayOfMonth: number): Date {
  const day = clampDayOfMonth(dayOfMonth);
  const start = startOfUtcDay(from);
  const thisMonth = utcDate(start.getUTCFullYear(), start.getUTCMonth(), day);
  return thisMonth >= start ? thisMonth : utcDate(start.getUTCFullYear(), start.getUTCMonth() + 1, day);
}

/** One period later: the same day next month. */
export function advanceDueDate(current: Date, dayOfMonth: number): Date {
  return utcDate(current.getUTCFullYear(), current.getUTCMonth() + 1, clampDayOfMonth(dayOfMonth));
}

export type PledgeDueState = 'inactive' | 'overdue' | 'due' | 'upcoming';

/**
 * - inactive: paused or cancelled
 * - overdue:  next due date is before today
 * - due:      falls due later this month (today included)
 * - upcoming: next due date is in a later month (this month already paid)
 */
export function pledgeDueState(p: { status: string; nextDueDate: Date }, now: Date = new Date()): PledgeDueState {
  if (p.status !== 'ACTIVE') return 'inactive';
  const due = startOfUtcDay(p.nextDueDate);
  if (due < startOfUtcDay(now)) return 'overdue';
  if (due < startOfNextUtcMonth(now)) return 'due';
  return 'upcoming';
}

/** "Due this month" = ACTIVE and next due before next month (overdue included). */
export function isDueThisMonth(p: { status: string; nextDueDate: Date }, now: Date = new Date()): boolean {
  const s = pledgeDueState(p, now);
  return s === 'due' || s === 'overdue';
}

/**
 * A payment against a pledge settles its current period: move the due date
 * one month on. Paying early (before the due date) still settles that
 * period, never two.
 */
export function nextDueAfterPayment(p: { nextDueDate: Date; dayOfMonth: number }): Date {
  return advanceDueDate(p.nextDueDate, p.dayOfMonth);
}

/** Calendar month key, e.g. "2026-10" — used to send at most one reminder per pledge per month. */
export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function remindedThisMonth(lastReminderAt: Date | null | undefined, now: Date = new Date()): boolean {
  return Boolean(lastReminderAt && monthKey(lastReminderAt) === monthKey(now));
}

// ── Fund balances ────────────────────────────────────────────────────────────

export interface FundRow {
  id: string;
  name: string;
  nameBn?: string | null;
  type: string;
  goalAmount?: number | null;
}

export interface FundBalance {
  fundId: string;
  name: string;
  nameBn: string | null;
  type: string;
  collected: number;
  disbursed: number;
  balance: number;
  goalAmount: number | null;
  /** 0–100 (capped); null without a goal. */
  progress: number | null;
}

/**
 * collected = PAID donations (refunds are status REFUNDED, so excluded);
 * balance = collected − disbursed. Inputs are taka amounts per fund id.
 */
export function computeFundBalances(
  funds: FundRow[],
  collectedByFund: Record<string, unknown>,
  disbursedByFund: Record<string, unknown>,
): FundBalance[] {
  return funds.map((f) => {
    const c = toPaisa(collectedByFund[f.id] ?? 0);
    const d = toPaisa(disbursedByFund[f.id] ?? 0);
    const goal = f.goalAmount == null ? null : Number(f.goalAmount);
    return {
      fundId: f.id,
      name: f.name,
      nameBn: f.nameBn ?? null,
      type: f.type,
      collected: fromPaisa(c),
      disbursed: fromPaisa(d),
      balance: fromPaisa(c - d),
      goalAmount: goal,
      progress: progressPercent(fromPaisa(c), goal),
    };
  });
}

/** Totals over every fund of one type (e.g. ZAKAT). */
export function sumBalancesByType(balances: FundBalance[], type: string): { collected: number; disbursed: number; balance: number } {
  let c = 0;
  let d = 0;
  for (const b of balances) {
    if (b.type !== type) continue;
    c += toPaisa(b.collected);
    d += toPaisa(b.disbursed);
  }
  return { collected: fromPaisa(c), disbursed: fromPaisa(d), balance: fromPaisa(c - d) };
}

/**
 * May `amount` be paid out of a fund? Never more than its balance — a fund
 * (especially Zakat, which has strict uses) must not go negative.
 */
export function canDisburse(balance: number, amount: number): boolean {
  return toPaisa(amount) > 0 && toPaisa(amount) <= toPaisa(balance);
}

export function progressPercent(raised: number, goal: number | null | undefined): number | null {
  if (goal == null || !(goal > 0)) return null;
  return Math.min(100, Math.round((raised / goal) * 100));
}

// ── CSV ──────────────────────────────────────────────────────────────────────

function csvCell(v: unknown): string {
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  const s = v == null ? '' : v instanceof Date ? v.toISOString() : String(v);
  // Neutralise spreadsheet formula injection in text cells, then quote.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
