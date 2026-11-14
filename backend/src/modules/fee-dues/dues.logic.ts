// =============================================================================
// P4 dues — pure logic (no I/O). Unit-tested in tests/p4-dues-logic.test.ts.
// Money is handled in paisa (integers) to avoid float drift.
// =============================================================================

export type CellStatus = 'PAID' | 'PARTIAL' | 'UNPAID' | 'NO_INVOICE' | 'WAIVED';

/** Converts a Decimal / numeric string / number to integer paisa. */
export function toPaisa(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : Number(String(v));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function fromPaisa(p: number): number {
  return Math.round(p) / 100;
}

export interface CellAggregate {
  /** Sum over non-cancelled invoices (paisa). */
  billed: number;
  paid: number;
  due: number;
  invoiceCount: number;
  cancelledCount: number;
  /** Some non-cancelled invoice in the cell is past its due date with money due. */
  overdue?: boolean;
}

/**
 * One month × student cell. Cancelled invoices count as WAIVED only when
 * every invoice in the month is cancelled; otherwise they are ignored.
 */
export function classifyCell(c: CellAggregate): CellStatus {
  if (c.invoiceCount === 0) return 'NO_INVOICE';
  if (c.cancelledCount >= c.invoiceCount) return 'WAIVED';
  if (c.billed > 0 && c.due <= 0) return 'PAID';
  if (c.billed <= 0) return 'PAID';
  if (c.paid > 0) return 'PARTIAL';
  return 'UNPAID';
}

/** Collected ÷ billed as a percentage with one decimal; null when nothing billed. */
export function collectionRate(billedPaisa: number, collectedPaisa: number): number | null {
  if (billedPaisa <= 0) return null;
  return Math.round((collectedPaisa / billedPaisa) * 1000) / 10;
}

// ── Months ───────────────────────────────────────────────────────────────

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Inclusive list of YYYY-MM keys from → to. Capped at 36 months. */
export function monthRange(from: string, to: string): string[] {
  if (!MONTH_RE.test(from) || !MONTH_RE.test(to)) return [];
  let [y, m] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  const out: string[] = [];
  while ((y < ty || (y === ty && m <= tm)) && out.length < 36) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/** YYYY-MM of an instant in a time zone (default Asia/Dhaka). */
export function monthKeyOf(d: Date, timeZone = 'Asia/Dhaka'): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit' }).formatToParts(d);
  const y = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  return `${y}-${m}`;
}

/** YYYY-MM-DD of an instant in a time zone. */
export function dateKeyOf(d: Date, timeZone = 'Asia/Dhaka'): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

const MONTH_NAMES_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAMES_BN = ['জানু', 'ফেব্রু', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টে', 'অক্টো', 'নভে', 'ডিসে'];

export function monthLabel(key: string, lang: 'en' | 'bn' = 'en'): string {
  if (!MONTH_RE.test(key)) return key;
  const [y, m] = key.split('-').map(Number);
  return `${(lang === 'bn' ? MONTH_NAMES_BN : MONTH_NAMES_EN)[m - 1]} ${y}`;
}

// ── Restrictions ─────────────────────────────────────────────────────────

export type RestrictedFeature = 'RESULTS' | 'ADMIT_CARD' | 'ID_CARD' | 'PORTAL_LOGIN' | 'ONLINE_EXAM';

export interface RestrictionSettings {
  restrictionsEnabled: boolean;
  minMonthsDue: number | null;
  /** Paisa. */
  minAmountDue: number | null;
  overdueDays: number | null;
  blockResults: boolean;
  blockAdmitCard: boolean;
  blockIdCard: boolean;
  blockPortalLogin: boolean;
  blockOnlineExam: boolean;
}

export const DEFAULT_RESTRICTION_SETTINGS: RestrictionSettings = {
  restrictionsEnabled: false,
  minMonthsDue: null,
  minAmountDue: null,
  overdueDays: null,
  blockResults: true,
  blockAdmitCard: true,
  blockIdCard: true,
  blockPortalLogin: false,
  blockOnlineExam: true,
};

export interface StudentDuesState {
  monthsDue: number;
  /** Paisa. */
  amountDue: number;
  oldestDueDate: Date | null;
  manualState: 'BLOCKED' | 'UNBLOCKED' | null;
  exempt: boolean;
}

export type RestrictionSource = 'EXEMPT' | 'MANUAL_BLOCK' | 'MANUAL_UNBLOCK' | 'AUTO' | 'NONE';

export interface RestrictionVerdict {
  restricted: boolean;
  source: RestrictionSource;
  /** Which thresholds were met (AUTO only). */
  reasons: Array<'MONTHS' | 'AMOUNT' | 'OVERDUE_DAYS'>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function daysOverdue(oldestDueDate: Date | null, now: Date): number {
  if (!oldestDueDate) return 0;
  return Math.max(0, Math.floor((now.getTime() - oldestDueDate.getTime()) / DAY_MS));
}

/**
 * Exempt beats everything; then a manual block/unblock; then the automatic
 * thresholds (any set threshold that is met restricts). With no threshold
 * set, automatic restriction never fires. A manual block works even while the
 * automatic rules are switched off — it is an explicit staff decision.
 */
export function evaluateRestriction(settings: RestrictionSettings, s: StudentDuesState, now = new Date()): RestrictionVerdict {
  if (s.exempt) return { restricted: false, source: 'EXEMPT', reasons: [] };
  if (s.manualState === 'BLOCKED') return { restricted: true, source: 'MANUAL_BLOCK', reasons: [] };
  if (s.manualState === 'UNBLOCKED') return { restricted: false, source: 'MANUAL_UNBLOCK', reasons: [] };
  if (!settings.restrictionsEnabled || s.amountDue <= 0) return { restricted: false, source: 'NONE', reasons: [] };
  const reasons: RestrictionVerdict['reasons'] = [];
  if (settings.minMonthsDue && settings.minMonthsDue > 0 && s.monthsDue >= settings.minMonthsDue) reasons.push('MONTHS');
  if (settings.minAmountDue && settings.minAmountDue > 0 && s.amountDue >= settings.minAmountDue) reasons.push('AMOUNT');
  if (settings.overdueDays && settings.overdueDays > 0 && daysOverdue(s.oldestDueDate, now) > settings.overdueDays) reasons.push('OVERDUE_DAYS');
  return reasons.length ? { restricted: true, source: 'AUTO', reasons } : { restricted: false, source: 'NONE', reasons: [] };
}

export function featureBlocked(settings: RestrictionSettings, feature: RestrictedFeature): boolean {
  switch (feature) {
    case 'RESULTS':
      return settings.blockResults;
    case 'ADMIT_CARD':
      return settings.blockAdmitCard;
    case 'ID_CARD':
      return settings.blockIdCard;
    case 'PORTAL_LOGIN':
      return settings.blockPortalLogin;
    case 'ONLINE_EXAM':
      return settings.blockOnlineExam;
    default:
      return false;
  }
}

/** Roles that can ever be restricted. Staff never are. */
export const RESTRICTABLE_ROLES = new Set(['STUDENT', 'GUARDIAN']);

// ── Defaulter thresholds ─────────────────────────────────────────────────

export interface DefaulterThreshold {
  minMonths?: number | null;
  /** Paisa. */
  minAmount?: number | null;
}

/**
 * A student is a defaulter when dues ≥ X months OR ≥ ৳Y. With neither set,
 * any past-due amount counts.
 */
export function isDefaulter(row: { monthsDue: number; amountDue: number }, th: DefaulterThreshold): boolean {
  if (row.amountDue <= 0) return false;
  const hasMonths = !!th.minMonths && th.minMonths > 0;
  const hasAmount = !!th.minAmount && th.minAmount > 0;
  if (!hasMonths && !hasAmount) return true;
  return (hasMonths && row.monthsDue >= (th.minMonths as number)) || (hasAmount && row.amountDue >= (th.minAmount as number));
}

// ── Reminder templates ───────────────────────────────────────────────────

export const DEFAULT_SMS_TEMPLATE =
  'Dear Guardian, fees of Tk {amount} for {student} ({months} month(s)) are due. Please pay at the school office. - {school}';
export const DEFAULT_SMS_TEMPLATE_BN = 'সম্মানিত অভিভাবক, {student}-এর {months} মাসের বকেয়া ফি {amount} টাকা। অনুগ্রহ করে দ্রুত পরিশোধ করুন। - {school}';
export const DEFAULT_EMAIL_SUBJECT = 'Fees due for {student} — {school}';
export const DEFAULT_EMAIL_TEMPLATE =
  'Dear {guardian},\n\nOur records show fees of Tk {amount} due for {student} ({months} month(s): {month_names}).\n\nPlease pay at the school office at your earliest convenience. If you have already paid, please ignore this message.\n\n{school}';

export interface ReminderVars {
  student: string;
  months: number;
  /** Paisa. */
  amount: number;
  school: string;
  guardian?: string | null;
  monthNames?: string[];
  className?: string | null;
}

/** Plain digits with South Asian grouping, no currency sign (keeps SMS in GSM). */
export function formatAmountPlain(paisa: number): string {
  const v = fromPaisa(paisa);
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 }).format(v);
}

/**
 * Replaces {student} {months} {amount} {school} {guardian} {month_names}
 * {class}. Unknown placeholders are left as typed.
 */
export function renderReminder(template: string, v: ReminderVars): string {
  const map: Record<string, string> = {
    student: v.student.trim(),
    months: String(v.months),
    amount: formatAmountPlain(v.amount),
    school: v.school.trim(),
    guardian: (v.guardian ?? '').trim() || 'Guardian',
    month_names: (v.monthNames ?? []).map((k) => monthLabel(k)).join(', '),
    class: (v.className ?? '').trim(),
  };
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in map ? map[key] : whole));
}

// ── Misc ─────────────────────────────────────────────────────────────────

export function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!domain) return '***';
  return `${user.slice(0, 2)}***@${domain}`;
}

/** Splits an array into chunks of n. */
export function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}
