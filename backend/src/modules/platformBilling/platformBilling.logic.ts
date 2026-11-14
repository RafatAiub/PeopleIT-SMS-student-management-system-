import crypto from 'crypto';

// =============================================================================
// P1 platform billing: pure logic (no I/O). Unit tested in
// backend/tests/p1-platform-billing-logic.test.ts.
//
//  - Asia/Dhaka calendar math (UTC+6, no DST): periods, due dates, day keys
//  - invoice pricing (FLAT / PER_STUDENT, minimum, discount, proration, free months)
//  - money in paisa (integers) only
//  - access level from override + auto-restrict rule
//  - reminder cadence (daily until due, final on due day, overdue every 3 days)
//  - signed, expiring pay-link tokens
// =============================================================================

// ── Asia/Dhaka calendar ─────────────────────────────────────────────────────

const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface DhakaParts {
  year: number;
  month: number; // 1..12
  day: number;
  hour: number;
}

export function dhakaParts(d: Date): DhakaParts {
  const x = new Date(d.getTime() + DHAKA_OFFSET_MS);
  return { year: x.getUTCFullYear(), month: x.getUTCMonth() + 1, day: x.getUTCDate(), hour: x.getUTCHours() };
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** YYYY-MM-DD of the Dhaka calendar day containing `d`. */
export function dhakaDayKey(d: Date): string {
  const p = dhakaParts(d);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** YYYY-MM of the Dhaka month containing `d`. */
export function periodOf(d: Date): string {
  const p = dhakaParts(d);
  return `${p.year}-${pad(p.month)}`;
}

export const PERIOD_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function parsePeriod(period: string): { year: number; month: number } {
  const m = PERIOD_RE.exec(period);
  if (!m) throw new Error(`Invalid billing period '${period}' (expected YYYY-MM)`);
  return { year: Number(m[1]), month: Number(m[2]) };
}

/** The instant a Dhaka calendar day starts. */
export function dhakaMidnight(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day) - DHAKA_OFFSET_MS);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addMonths(period: string, n: number): string {
  const { year, month } = parsePeriod(period);
  const idx = year * 12 + (month - 1) + n;
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`;
}

/** Whole months from `from` to `to` (to - from); negative when `to` is earlier. */
export function monthsBetween(from: string, to: string): number {
  const a = parsePeriod(from);
  const b = parsePeriod(to);
  return (b.year - a.year) * 12 + (b.month - a.month);
}

export function periodBounds(period: string): { start: Date; end: Date } {
  const { year, month } = parsePeriod(period);
  const start = dhakaMidnight(year, month, 1);
  const next = parsePeriod(addMonths(period, 1));
  const end = new Date(dhakaMidnight(next.year, next.month, 1).getTime() - 1);
  return { start, end };
}

export function clampDueDay(dueDay: number): number {
  if (!Number.isFinite(dueDay)) return 10;
  return Math.min(28, Math.max(1, Math.trunc(dueDay)));
}

/** Start of the due day (Dhaka) for a period. */
export function dueDateFor(period: string, dueDay: number): Date {
  const { year, month } = parsePeriod(period);
  return dhakaMidnight(year, month, clampDueDay(dueDay));
}

/** Dhaka day number (days since epoch, Dhaka calendar). */
export function dhakaDayIndex(d: Date): number {
  return Math.floor((d.getTime() + DHAKA_OFFSET_MS) / DAY_MS);
}

/** Calendar days past the due day: <0 before it, 0 on it, 1 the day after. */
export function daysPastDue(dueDate: Date, now: Date): number {
  return dhakaDayIndex(now) - dhakaDayIndex(dueDate);
}

/**
 * Due date for a freshly generated invoice: the period's due day, unless that
 * leaves the school less than 3 days to pay (a late "Generate now", or a
 * school that joined after the due day) — then 7 days from today.
 */
export function effectiveDueDate(period: string, dueDay: number, now: Date): Date {
  const regular = dueDateFor(period, dueDay);
  if (daysPastDue(regular, now) > -3) {
    const p = dhakaParts(now);
    return new Date(dhakaMidnight(p.year, p.month, p.day).getTime() + 7 * DAY_MS);
  }
  return regular;
}

const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_BN = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];

export function periodLabel(period: string, lang: 'en' | 'bn' = 'en'): string {
  const { year, month } = parsePeriod(period);
  return lang === 'bn' ? `${MONTHS_BN[month - 1]} ${toBnDigits(String(year))}` : `${MONTHS_EN[month - 1]} ${year}`;
}

/** e.g. "10 November 2026" (Dhaka calendar). */
export function dateLabel(d: Date, lang: 'en' | 'bn' = 'en'): string {
  const p = dhakaParts(d);
  return lang === 'bn'
    ? `${toBnDigits(String(p.day))} ${MONTHS_BN[p.month - 1]} ${toBnDigits(String(p.year))}`
    : `${p.day} ${MONTHS_EN[p.month - 1]} ${p.year}`;
}

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
export function toBnDigits(s: string): string {
  return s.replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);
}

// ── Money (paisa) ───────────────────────────────────────────────────────────

/** Decimal | number | string → integer paisa. */
export function toPaisa(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : Number(String(v));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** paisa → "1234.50" (what Prisma.Decimal accepts). */
export function paisaToDecimalString(p: number): string {
  const sign = p < 0 ? '-' : '';
  const abs = Math.abs(Math.round(p));
  return `${sign}${Math.floor(abs / 100)}.${pad(abs % 100)}`;
}

export function paisaToNumber(p: number): number {
  return Math.round(p) / 100;
}

/** "3,000" or "3,000.50" (no symbol). */
export function formatTaka(p: number): string {
  const n = Math.round(p) / 100;
  const hasPaisa = Math.round(p) % 100 !== 0;
  return n.toLocaleString('en-US', { minimumFractionDigits: hasPaisa ? 2 : 0, maximumFractionDigits: 2 });
}

// ── Pricing ─────────────────────────────────────────────────────────────────

export type PricingModel = 'FLAT' | 'PER_STUDENT';
export type DiscountType = 'PERCENT' | 'FIXED';
export type FirstMonthMode = 'PRORATE' | 'FREE' | 'FULL';

export interface PricingProfile {
  pricingModel: PricingModel;
  flatAmount?: unknown;
  perStudentRate?: unknown;
  minimumCharge?: unknown;
  discountType?: DiscountType | null;
  discountValue?: unknown;
  discountNote?: string | null;
  billingStartMonth: string;
  serviceStartDate?: Date | null;
  firstMonthMode: FirstMonthMode;
  freeMonths: number;
}

export type LineCode = 'BASE' | 'MINIMUM' | 'DISCOUNT' | 'PRORATION' | 'FREE' | 'CUSTOM';

/** Stored on PlatformInvoice.lines. Money in taka (2 decimals). */
export interface InvoiceLine {
  code: LineCode;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface ComputedInvoice {
  lines: InvoiceLine[];
  subtotalPaisa: number;
  discountPaisa: number;
  totalPaisa: number;
  ratePaisa: number;
  free: boolean;
  monthIndex: number;
}

function line(code: LineCode, description: string, quantity: number, unitPaisa: number, amountPaisa: number): InvoiceLine {
  return { code, description, quantity, unitPrice: paisaToNumber(unitPaisa), amount: paisaToNumber(amountPaisa) };
}

/**
 * Prices one month for one school.
 *   base   = FLAT amount, or rate × active students (PER_STUDENT)
 *   min    = PER_STUDENT only: never below the minimum charge
 *   disc   = % of the gross, or a fixed amount (never below zero)
 *   first  = month 0: PRORATE (remaining days of the start month, from
 *            serviceStartDate), FREE, or FULL
 *   free   = the first `freeMonths` billed months (month 0 included) are free
 * Throws when `period` is before the billing start month.
 */
export function computeInvoiceAmounts(profile: PricingProfile, period: string, studentCount: number): ComputedInvoice {
  const monthIndex = monthsBetween(profile.billingStartMonth, period);
  if (monthIndex < 0) throw new Error(`Period ${period} is before the billing start month ${profile.billingStartMonth}`);

  const lines: InvoiceLine[] = [];
  let ratePaisa = 0;
  let grossPaisa = 0;

  if (profile.pricingModel === 'FLAT') {
    ratePaisa = Math.max(0, toPaisa(profile.flatAmount));
    grossPaisa = ratePaisa;
    lines.push(line('BASE', `Monthly service fee (flat), ${periodLabel(period)}`, 1, ratePaisa, ratePaisa));
  } else {
    ratePaisa = Math.max(0, toPaisa(profile.perStudentRate));
    const count = Math.max(0, Math.trunc(studentCount));
    const base = count * ratePaisa;
    grossPaisa = base;
    lines.push(line('BASE', `Active students on the 1st × rate, ${periodLabel(period)}`, count, ratePaisa, base));
    const minimum = Math.max(0, toPaisa(profile.minimumCharge));
    if (minimum > base) {
      lines.push(line('MINIMUM', 'Minimum monthly charge adjustment', 1, minimum - base, minimum - base));
      grossPaisa = minimum;
    }
  }

  let net = grossPaisa;
  if (profile.discountType && toPaisa(profile.discountValue) > 0 && net > 0) {
    const raw =
      profile.discountType === 'PERCENT'
        ? Math.round((net * Math.min(100, Number(profile.discountValue))) / 100)
        : toPaisa(profile.discountValue);
    const d = Math.min(net, Math.max(0, raw));
    if (d > 0) {
      const label =
        profile.discountType === 'PERCENT' ? `Discount ${Number(profile.discountValue)}%` : 'Discount';
      lines.push(line('DISCOUNT', profile.discountNote ? `${label} (${profile.discountNote})` : label, 1, -d, -d));
      net -= d;
    }
  }

  const free = monthIndex < Math.max(0, profile.freeMonths) || (monthIndex === 0 && profile.firstMonthMode === 'FREE');
  if (free) {
    if (net > 0) lines.push(line('FREE', 'Free month', 1, -net, -net));
    net = 0;
  } else if (monthIndex === 0 && profile.firstMonthMode === 'PRORATE' && profile.serviceStartDate) {
    const start = dhakaParts(profile.serviceStartDate);
    const { year, month } = parsePeriod(period);
    if (start.year === year && start.month === month && start.day > 1) {
      const dim = daysInMonth(year, month);
      const billedDays = dim - start.day + 1;
      const prorated = Math.round((net * billedDays) / dim);
      const off = net - prorated;
      if (off > 0) {
        lines.push(line('PRORATION', `First month prorated: ${billedDays} of ${dim} days`, 1, -off, -off));
      }
      net = prorated;
    }
  }

  return {
    lines,
    subtotalPaisa: grossPaisa,
    discountPaisa: grossPaisa - net,
    totalPaisa: net,
    ratePaisa,
    free,
    monthIndex,
  };
}

/** Totals for owner-edited lines (negative lines are discounts). */
export function totalsFromLines(lines: Array<Pick<InvoiceLine, 'amount'>>): { subtotalPaisa: number; discountPaisa: number; totalPaisa: number } {
  let pos = 0;
  let neg = 0;
  for (const l of lines) {
    const p = toPaisa(l.amount);
    if (p >= 0) pos += p;
    else neg += -p;
  }
  return { subtotalPaisa: pos, discountPaisa: neg, totalPaisa: Math.max(0, pos - neg) };
}

// ── Invoice status ──────────────────────────────────────────────────────────

export type InvoiceStatus = 'DUE' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'WAIVED' | 'CANCELLED';
export const UNPAID_STATUSES: InvoiceStatus[] = ['DUE', 'PARTIAL', 'OVERDUE'];

export function duePaisa(inv: { total: unknown; paidAmount: unknown; waivedAmount?: unknown; status?: string }): number {
  if (inv.status === 'CANCELLED' || inv.status === 'WAIVED') return 0;
  return Math.max(0, toPaisa(inv.total) - toPaisa(inv.paidAmount) - toPaisa(inv.waivedAmount ?? 0));
}

/** Status after money moved (never for WAIVED/CANCELLED). */
export function statusAfterPayment(totalPaisa: number, paidPaisa: number, waivedPaisa: number, dueDate: Date, now: Date): InvoiceStatus {
  if (paidPaisa + waivedPaisa >= totalPaisa) return 'PAID';
  if (daysPastDue(dueDate, now) > 0) return 'OVERDUE';
  return paidPaisa > 0 ? 'PARTIAL' : 'DUE';
}

// ── Access level ────────────────────────────────────────────────────────────

export type PlatformAccessLevel = 'ACTIVE' | 'RESTRICTED' | 'DISABLED';
export type AccessSource = 'OVERRIDE' | 'AUTO' | 'NONE';

export interface PlatformAccessInputs {
  billingActive: boolean;
  override: PlatformAccessLevel | null;
  autoRestrictAfterDays: number | null;
  /** Days the oldest unpaid invoice is past its due day (null/<=0 = none overdue). */
  maxDaysOverdue: number | null;
}

/**
 * The owner's override always wins (it can also hold a school ACTIVE while
 * overdue). Otherwise the optional auto rule restricts once an invoice is N
 * days overdue. Nothing else restricts a profiled school.
 */
export function computePlatformAccess(i: PlatformAccessInputs): { level: PlatformAccessLevel; source: AccessSource } {
  if (i.override) return { level: i.override, source: 'OVERRIDE' };
  if (
    i.billingActive &&
    i.autoRestrictAfterDays !== null &&
    i.autoRestrictAfterDays >= 0 &&
    i.maxDaysOverdue !== null &&
    i.maxDaysOverdue > 0 &&
    i.maxDaysOverdue >= i.autoRestrictAfterDays
  ) {
    return { level: 'RESTRICTED', source: 'AUTO' };
  }
  return { level: 'ACTIVE', source: 'NONE' };
}

/**
 * After a payment: should a manual override be cleared? Only when no unpaid
 * invoice is past due any more, the override restricts (RESTRICTED/DISABLED),
 * and the owner did not tick "keep until I change it".
 */
export function shouldLiftOverride(override: PlatformAccessLevel | null, keep: boolean, overdueUnpaidCount: number): boolean {
  return !!override && override !== 'ACTIVE' && !keep && overdueUnpaidCount === 0;
}

// ── Reminder cadence ────────────────────────────────────────────────────────

export type ReminderKind = 'UPCOMING' | 'FINAL' | 'OVERDUE';

/**
 * Which reminder (if any) an unpaid invoice gets today:
 *   before the due day → UPCOMING (daily, from the 1st)
 *   on the due day     → FINAL
 *   1, 4, 7, … days after the due day → OVERDUE
 */
export function reminderKindFor(dueDate: Date, now: Date): ReminderKind | null {
  const d = daysPastDue(dueDate, now);
  if (d < 0) return 'UPCOMING';
  if (d === 0) return 'FINAL';
  return (d - 1) % 3 === 0 ? 'OVERDUE' : null;
}

// ── Numbers ─────────────────────────────────────────────────────────────────

export function invoiceNumberFor(period: string, seq: number): string {
  return `PNB-${period.replace('-', '')}-${pad(seq, 4)}`;
}

export function receiptNumberFor(period: string, seq: number): string {
  return `PNR-${period.replace('-', '')}-${pad(seq, 4)}`;
}

/** Next sequence after the highest existing number with this prefix. */
export function nextSequence(existing: string | null | undefined): number {
  if (!existing) return 1;
  const m = /-(\d+)$/.exec(existing);
  return m ? Number(m[1]) + 1 : 1;
}

// ── Merchant transaction id ─────────────────────────────────────────────────

/** Alphanumeric, <= 20 chars (fits SSLCommerz and bKash). */
export function generatePlatformTranId(now: number = Date.now()): string {
  return `PNB${now.toString(36)}${crypto.randomBytes(5).toString('hex')}`.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20);
}

// ── Pay-link tokens ─────────────────────────────────────────────────────────
//
// SMS/email pay links are `${FRONTEND_URL}/billing/pay/<token>`. The page
// needs a signed-in ADMIN of the school (it is NOT a public pay page): the
// token only says which invoice to open and is HMAC-bound to the school's id
// (taken from the session at verification time), so it cannot be forged,
// re-pointed at another invoice, or used by another school. Compact on
// purpose (about 45 characters) so the SMS stays short:
//   <invoiceId>.<expiry, base36 unix seconds>.<16-char HMAC>

export function signPayToken(institutionId: string, invoiceId: string, expiresAt: Date, secret: string): string {
  const e = Math.floor(expiresAt.getTime() / 1000).toString(36);
  return `${invoiceId}.${e}.${payTokenSig(institutionId, invoiceId, e, secret)}`;
}

function payTokenSig(institutionId: string, invoiceId: string, e: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(`${institutionId}.${invoiceId}.${e}`)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
    .slice(0, 16);
}

/** The invoice id, or null when malformed, signed for another school, tampered with, or expired. */
export function verifyPayToken(token: string, institutionId: string, secret: string, now: Date = new Date()): string | null {
  if (typeof token !== 'string' || token.length > 120) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [invoiceId, e, sig] = parts;
  if (!/^[a-z0-9]{8,40}$/i.test(invoiceId) || !/^[a-z0-9]{1,10}$/.test(e)) return null;
  const expected = payTokenSig(institutionId, invoiceId, e, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const expiresAt = parseInt(e, 36) * 1000;
  if (!Number.isFinite(expiresAt) || expiresAt < now.getTime()) return null;
  return invoiceId;
}
