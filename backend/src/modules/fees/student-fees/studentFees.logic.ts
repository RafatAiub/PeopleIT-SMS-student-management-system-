// =============================================================================
// P2 student fees — pure logic (no DB, no Express). Unit tested in
// backend/tests/p2-student-fees-logic.test.ts.
//
// Money is always computed in paisa (integers). Dates are reasoned about in
// Asia/Dhaka (UTC+6, no DST), so a fixed offset is exact.
// =============================================================================

export const DHAKA_OFFSET_MIN = 360;
const DAY_MS = 24 * 60 * 60 * 1000;

export const toPaisa = (n: number) => Math.round(n * 100);
export const fromPaisa = (p: number) => Math.round(p) / 100;

// ── Periods (YYYY-MM) ────────────────────────────────────────────────────────

const PERIOD_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isValidPeriod(p: string | null | undefined): p is string {
  return typeof p === 'string' && PERIOD_RE.test(p);
}

function parsePeriod(p: string): { y: number; m: number } {
  const match = PERIOD_RE.exec(p);
  if (!match) throw new Error(`Invalid period '${p}' (expected YYYY-MM)`);
  return { y: Number(match[1]), m: Number(match[2]) };
}

export function formatPeriod(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, '0')}`;
}

/** Calendar parts of `now` in Asia/Dhaka. */
export function dhakaParts(now: Date): { year: number; month: number; day: number; hour: number } {
  const d = new Date(now.getTime() + DHAKA_OFFSET_MIN * 60_000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: d.getUTCHours() };
}

/** The Dhaka billing month containing `now`. */
export function periodOf(now: Date): string {
  const p = dhakaParts(now);
  return formatPeriod(p.year, p.month);
}

export function addMonths(period: string, n: number): string {
  const { y, m } = parsePeriod(period);
  const idx = y * 12 + (m - 1) + n;
  return formatPeriod(Math.floor(idx / 12), (idx % 12) + 1);
}

/** Whole months from a to b (b - a). */
export function monthsBetween(a: string, b: string): number {
  const pa = parsePeriod(a);
  const pb = parsePeriod(b);
  return pb.y * 12 + pb.m - (pa.y * 12 + pa.m);
}

export function daysInMonth(period: string): number {
  const { y, m } = parsePeriod(period);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Dhaka midnight of `day` in `period` (clamped to the month length), as a UTC Date. */
export function dhakaDate(period: string, day: number): Date {
  const { y, m } = parsePeriod(period);
  const d = Math.min(Math.max(1, Math.trunc(day)), daysInMonth(period));
  return new Date(Date.UTC(y, m - 1, d) - DHAKA_OFFSET_MIN * 60_000);
}

/** Dhaka day number (days since epoch, Dhaka calendar) — for day arithmetic. */
export function dhakaDayNumber(d: Date): number {
  return Math.floor((d.getTime() + DHAKA_OFFSET_MIN * 60_000) / DAY_MS);
}

const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "October 2026". */
export function periodLabel(period: string): string {
  const { y, m } = parsePeriod(period);
  return `${MONTHS_EN[m - 1]} ${y}`;
}

/** The bulk wizard's period tag — reused so both paths see each other's lines. */
export function periodTag(period: string): string {
  return `[${period}]`;
}

// ── Student fee profile ──────────────────────────────────────────────────────

export type ProfileKind = 'MONTHLY' | 'YEARLY';
export type YearlyMode = 'SPREAD' | 'ONE_TIME';

export interface FeeProfileLite {
  id: string;
  feeCategoryId: string | null;
  kind: ProfileKind | string;
  monthlyAmount: number | null;
  yearlyAmount: number | null;
  yearlyMode: YearlyMode | string;
  effectiveFrom: string;
  effectiveTo: string | null;
  endedAt: Date | null;
  createdAt: Date;
}

/** Is the profile in force for `period`? (voided profiles never are) */
export function profileCovers(p: Pick<FeeProfileLite, 'effectiveFrom' | 'effectiveTo' | 'endedAt'>, period: string): boolean {
  if (p.endedAt) return false;
  if (monthsBetween(p.effectiveFrom, period) < 0) return false;
  if (p.effectiveTo && monthsBetween(period, p.effectiveTo) < 0) return false;
  return true;
}

/**
 * The yearly total for one month. SPREAD: total/12 rounded DOWN to whole
 * taka for months 1–11 of each 12-month cycle (counted from effectiveFrom);
 * month 12 absorbs the rounding so the year adds up exactly. ONE_TIME: the
 * whole total in month 1 of each cycle, 0 otherwise.
 */
export function yearlyShare(totalAmount: number, mode: YearlyMode | string, monthIndex: number): number {
  const total = toPaisa(totalAmount);
  const idx = ((monthIndex % 12) + 12) % 12;
  if (mode === 'ONE_TIME') return fromPaisa(idx === 0 ? total : 0);
  const base = Math.floor(total / 12 / 100) * 100;
  return fromPaisa(idx === 11 ? total - base * 11 : base);
}

/** The profile's amount for `period`, or null when it does not apply. */
export function profileAmountForPeriod(p: FeeProfileLite, period: string): number | null {
  if (!profileCovers(p, period)) return null;
  if (p.kind === 'YEARLY') {
    if (p.yearlyAmount === null || p.yearlyAmount === undefined) return null;
    return yearlyShare(p.yearlyAmount, p.yearlyMode, monthsBetween(p.effectiveFrom, period));
  }
  if (p.monthlyAmount === null || p.monthlyAmount === undefined) return null;
  return fromPaisa(toPaisa(p.monthlyAmount));
}

export const OVERALL = '*';

/**
 * The winning profile per category ('*' = overall) for `period`: the latest
 * effectiveFrom wins, then the most recently created.
 */
export function activeProfiles(profiles: FeeProfileLite[], period: string): Map<string, { profile: FeeProfileLite; amount: number }> {
  const out = new Map<string, { profile: FeeProfileLite; amount: number }>();
  const sorted = [...profiles].sort(
    (a, b) => monthsBetween(b.effectiveFrom, a.effectiveFrom) || a.createdAt.getTime() - b.createdAt.getTime(),
  );
  for (const p of sorted) {
    const amount = profileAmountForPeriod(p, period);
    if (amount === null) continue;
    out.set(p.feeCategoryId ?? OVERALL, { profile: p, amount }); // later (newer) entries overwrite
  }
  return out;
}

export interface BaseFee {
  feeCategoryId: string;
  categoryName: string;
  amount: number;
}

export interface MonthlyLine {
  feeCategoryId: string;
  categoryName: string;
  amount: number;
  /** true when a student fee profile set this amount. */
  custom: boolean;
}

/**
 * Builds a student's monthly lines from the class fees, then applies the
 * student fee profile:
 *  - an OVERALL profile sets the whole monthly total, spread over the base
 *    lines in proportion (the last line absorbs rounding); with no base lines
 *    it goes on `fallbackCategoryId`. Category profiles are ignored then.
 *  - otherwise each category profile replaces (or adds) that category's line.
 * Lines that end up 0 (e.g. a full scholarship) are dropped.
 */
export function buildMonthlyLines(
  base: BaseFee[],
  profiles: FeeProfileLite[],
  period: string,
  categoryNames: Map<string, string>,
  fallbackCategoryId: string | null,
): MonthlyLine[] {
  const active = activeProfiles(profiles, period);
  const overall = active.get(OVERALL);
  let lines: MonthlyLine[];

  if (overall) {
    const target = toPaisa(overall.amount);
    const basePaisa = base.map((b) => Math.max(0, toPaisa(b.amount)));
    const pool = basePaisa.reduce((a, b) => a + b, 0);
    if (pool > 0) {
      const lastIdx = basePaisa.reduce((last, v, i) => (v > 0 ? i : last), -1);
      let given = 0;
      lines = base.map((b, i) => {
        if (basePaisa[i] <= 0) return { feeCategoryId: b.feeCategoryId, categoryName: b.categoryName, amount: 0, custom: true };
        const share = i === lastIdx ? target - given : Math.floor((target * basePaisa[i]) / pool);
        given += share;
        return { feeCategoryId: b.feeCategoryId, categoryName: b.categoryName, amount: fromPaisa(share), custom: true };
      });
    } else if (fallbackCategoryId) {
      lines = [
        {
          feeCategoryId: fallbackCategoryId,
          categoryName: categoryNames.get(fallbackCategoryId) ?? 'Monthly fee',
          amount: fromPaisa(target),
          custom: true,
        },
      ];
    } else {
      lines = [];
    }
  } else {
    lines = base.map((b) => ({ feeCategoryId: b.feeCategoryId, categoryName: b.categoryName, amount: fromPaisa(toPaisa(b.amount)), custom: false }));
    for (const [catId, { amount }] of active) {
      if (catId === OVERALL) continue;
      const existing = lines.find((l) => l.feeCategoryId === catId);
      if (existing) {
        existing.amount = amount;
        existing.custom = true;
      } else {
        lines.push({ feeCategoryId: catId, categoryName: categoryNames.get(catId) ?? 'Fee', amount, custom: true });
      }
    }
  }
  return lines.filter((l) => toPaisa(l.amount) > 0);
}

/** "Tuition Fee — October 2026 [2026-10]" (the tag keeps bulk invoicing idempotent too). */
export function monthlyLineDescription(categoryName: string, period: string, custom: boolean): string {
  return `${categoryName} — ${periodLabel(period)}${custom ? ' (custom rate)' : ''} ${periodTag(period)}`;
}

/**
 * Resolves class fees for one class: institution-wide monthly fee schedule →
 * class fee assignment → class-specific monthly fee schedule (last wins),
 * keeping only the school's monthly categories, in `monthlyCategoryIds` order.
 */
export function resolveBaseFees(
  monthlyCategoryIds: string[],
  categoryNames: Map<string, string>,
  sources: { globalSchedule: Map<string, number>; classFees: Map<string, number>; classSchedule: Map<string, number> },
): BaseFee[] {
  const out: BaseFee[] = [];
  for (const id of monthlyCategoryIds) {
    let amount: number | undefined;
    if (sources.globalSchedule.has(id)) amount = sources.globalSchedule.get(id);
    if (sources.classFees.has(id)) amount = sources.classFees.get(id);
    if (sources.classSchedule.has(id)) amount = sources.classSchedule.get(id);
    if (amount !== undefined && amount > 0) out.push({ feeCategoryId: id, categoryName: categoryNames.get(id) ?? 'Fee', amount });
  }
  return out;
}

// ── Counter ─────────────────────────────────────────────────────────────────

export interface PayableInvoice {
  id: string;
  dueAmount: number;
  dueDate: Date | string;
  status: string;
  period?: string | null;
}

export function isPayable(inv: Pick<PayableInvoice, 'dueAmount' | 'status'>): boolean {
  return toPaisa(inv.dueAmount) > 0 && inv.status !== 'PAID' && inv.status !== 'CANCELLED';
}

/** Oldest billing month first (invoices without a month by due date), then id. */
export function sortOldestFirst<T extends PayableInvoice>(invoices: T[]): T[] {
  const key = (i: PayableInvoice) => (i.period ? `${i.period}-00` : new Date(i.dueDate).toISOString().slice(0, 10));
  return [...invoices].sort(
    (a, b) => key(a).localeCompare(key(b)) || new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime() || a.id.localeCompare(b.id),
  );
}

/**
 * Splits `amount` over the payable invoices oldest first; each gets at most
 * its due. Throws when amount ≤ 0 or more than the total due.
 */
export function allocateOldestFirst(amount: number, invoices: PayableInvoice[]): Array<{ invoiceId: string; amount: number }> {
  let left = toPaisa(amount);
  if (left <= 0) throw new Error('Amount must be greater than zero');
  const payable = sortOldestFirst(invoices.filter(isPayable));
  const total = payable.reduce((s, i) => s + toPaisa(i.dueAmount), 0);
  if (left > total) throw new Error('Amount is more than the total due');
  const out: Array<{ invoiceId: string; amount: number }> = [];
  for (const inv of payable) {
    if (left <= 0) break;
    const take = Math.min(left, toPaisa(inv.dueAmount));
    out.push({ invoiceId: inv.id, amount: fromPaisa(take) });
    left -= take;
  }
  return out;
}

/**
 * Spreads a discount over invoice lines in proportion to each line's
 * remaining net (the last line absorbs rounding). Returns the extra discount
 * per line (same order). Never exceeds a line's net.
 */
export function spreadDiscount(lines: Array<{ amount: number; discount: number }>, discount: number): number[] {
  const nets = lines.map((l) => Math.max(0, toPaisa(l.amount) - toPaisa(l.discount)));
  const pool = nets.reduce((a, b) => a + b, 0);
  const target = Math.min(toPaisa(discount), pool);
  if (target <= 0 || pool <= 0) return lines.map(() => 0);
  const lastIdx = nets.reduce((last, v, i) => (v > 0 ? i : last), -1);
  let given = 0;
  return nets.map((n, i) => {
    if (n <= 0) return 0;
    const share = i === lastIdx ? target - given : Math.min(Math.floor((target * n) / pool), n);
    given += share;
    return fromPaisa(Math.min(share, n));
  });
}

// ── Invoice status after a money change ────────────────────────────────────

/**
 * Status for an invoice from its totals. CANCELLED stays CANCELLED. A due
 * invoice whose due date is before today (Dhaka) is OVERDUE.
 */
export function statusFor(
  inv: { status: string; totalAmount: number; paidAmount: number; dueDate: Date },
  now: Date = new Date(),
): { status: string; dueAmount: number } {
  const due = Math.max(0, toPaisa(inv.totalAmount) - toPaisa(inv.paidAmount));
  if (inv.status === 'CANCELLED') return { status: 'CANCELLED', dueAmount: fromPaisa(due) };
  if (due <= 0) return { status: 'PAID', dueAmount: 0 };
  if (dhakaDayNumber(inv.dueDate) < dhakaDayNumber(now)) return { status: 'OVERDUE', dueAmount: fromPaisa(due) };
  return { status: toPaisa(inv.paidAmount) > 0 ? 'PARTIAL' : 'UNPAID', dueAmount: fromPaisa(due) };
}

// ── Reversal & refund ─────────────────────────────────────────────────────

/** [OVERPAYMENT x] tag written by the online credit path (P0). */
export function overpaymentOf(notes: string | null | undefined): number {
  const m = /\[OVERPAYMENT (\d+(?:\.\d+)?)\]/.exec(notes ?? '');
  return m ? Number(m[1]) : 0;
}

/** What a payment actually credited to its invoice (amount minus any overpayment). */
export function appliedAmountOf(payment: { amount: number; notes?: string | null }, invoicePaid: number): number {
  const applied = toPaisa(payment.amount) - toPaisa(overpaymentOf(payment.notes));
  return fromPaisa(Math.max(0, Math.min(applied, toPaisa(invoicePaid))));
}

/**
 * Money still to hand back for a payment: the whole amount once it is
 * reversed, otherwise only the overpaid excess — minus refunds already made.
 */
export function refundableAmount(payment: { amount: number; status: string; notes?: string | null }, refundedSoFar: number): number {
  const base = payment.status === 'REVERSED' ? toPaisa(payment.amount) : toPaisa(overpaymentOf(payment.notes));
  return fromPaisa(Math.max(0, base - toPaisa(refundedSoFar)));
}

// ── Late fine ───────────────────────────────────────────────────────────────

export interface FineRuleLite {
  id: string;
  feeCategoryId: string | null;
  type: 'FLAT' | 'PERCENT' | string;
  value: number;
  graceDays: number;
  recurrence: 'ONCE' | 'MONTHLY' | string;
  maxAmount: number | null;
  isActive: boolean;
}

/**
 * The rule for an invoice: a category rule for the invoice's biggest
 * category that has one (lines in `categoryIdsByNetDesc` order), otherwise
 * the school-wide rule. Inactive rules never apply.
 */
export function pickFineRule(rules: FineRuleLite[], categoryIdsByNetDesc: string[]): FineRuleLite | null {
  const active = rules.filter((r) => r.isActive && r.value > 0);
  for (const cat of categoryIdsByNetDesc) {
    const r = active.find((x) => x.feeCategoryId === cat);
    if (r) return r;
  }
  return active.find((x) => x.feeCategoryId === null) ?? null;
}

/**
 * Fine keys due by `now`: none until the invoice is more than graceDays past
 * its due date; then "ONCE", or for MONTHLY "M1", "M2", … (one per month
 * since the first fine day).
 */
export function fineKeysDue(dueDate: Date, rule: Pick<FineRuleLite, 'graceDays' | 'recurrence'>, now: Date): string[] {
  const dueDay = dhakaDayNumber(dueDate);
  const today = dhakaDayNumber(now);
  if (today - dueDay <= Math.max(0, rule.graceDays)) return [];
  if (rule.recurrence !== 'MONTHLY') return ['ONCE'];
  const first = new Date((dueDay + Math.max(0, rule.graceDays) + 1) * DAY_MS);
  const cur = new Date(today * DAY_MS);
  let months = (cur.getUTCFullYear() - first.getUTCFullYear()) * 12 + (cur.getUTCMonth() - first.getUTCMonth());
  if (cur.getUTCDate() < first.getUTCDate()) months -= 1;
  const n = Math.max(0, months) + 1;
  return Array.from({ length: Math.min(n, 120) }, (_, i) => `M${i + 1}`);
}

/** One fine's amount: FLAT value, or PERCENT of the base due — capped by maxAmount minus fines already charged. */
export function fineAmount(rule: Pick<FineRuleLite, 'type' | 'value' | 'maxAmount'>, baseDue: number, alreadyCharged: number): number {
  let amt = rule.type === 'PERCENT' ? Math.round((toPaisa(baseDue) * rule.value) / 100) : toPaisa(rule.value);
  if (rule.maxAmount !== null && rule.maxAmount !== undefined) {
    amt = Math.min(amt, Math.max(0, toPaisa(rule.maxAmount) - toPaisa(alreadyCharged)));
  }
  return fromPaisa(Math.max(0, amt));
}
