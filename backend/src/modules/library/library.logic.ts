// =============================================================================
// Pure library logic (no I/O) — unit tested in
// backend/tests/inventory-library-transport-logic.test.ts.
//
// Calendar days are counted in Bangladesh time (UTC+6, no DST), matching
// the fee OVERDUE sweep (fees/overdue/overdue.service.ts).
// =============================================================================

const DAY_MS = 24 * 60 * 60 * 1000;
export const BD_OFFSET_MINUTES = 360;

/** Loans that are out (not yet returned). OVERDUE is a stored flavour of ISSUED. */
export const ACTIVE_LOAN_STATUSES = ['ISSUED', 'OVERDUE'] as const;

export function isActiveLoanStatus(status: string): boolean {
  return (ACTIVE_LOAN_STATUSES as readonly string[]).includes(status);
}

/** Days since the epoch for the calendar date `d` falls on, in the given offset. */
export function calendarDayIndex(d: Date, utcOffsetMinutes = BD_OFFSET_MINUTES): number {
  return Math.floor((d.getTime() + utcOffsetMinutes * 60_000) / DAY_MS);
}

/** Start of the current calendar day in a fixed-offset timezone, as a UTC Date. */
export function startOfDayAt(now: Date, utcOffsetMinutes = BD_OFFSET_MINUTES): Date {
  return new Date(calendarDayIndex(now, utcOffsetMinutes) * DAY_MS - utcOffsetMinutes * 60_000);
}

/** Whole calendar days a loan is late on `asOf` (0 when on time). */
export function overdueDays(dueDate: Date, asOf: Date): number {
  return Math.max(0, calendarDayIndex(asOf) - calendarDayIndex(dueDate));
}

export interface FineRuleLike {
  finePerDay: number;
  graceDays: number;
  maxFine: number | null;
}

export interface FineSuggestion {
  overdueDays: number;
  chargeableDays: number;
  suggestedFine: number;
  capped: boolean;
}

/**
 * Suggested late fine: (overdue days beyond the grace period) × finePerDay,
 * capped at maxFine when one is set. With no rule the suggestion is 0 —
 * staff can always type a different amount on return.
 */
export function calculateFine(dueDate: Date, returnedAt: Date, rule: FineRuleLike | null): FineSuggestion {
  const days = overdueDays(dueDate, returnedAt);
  if (!rule) return { overdueDays: days, chargeableDays: 0, suggestedFine: 0, capped: false };
  const grace = Math.max(0, Math.floor(rule.graceDays || 0));
  const chargeableDays = Math.max(0, days - grace);
  const perDayPaisa = Math.max(0, Math.round((rule.finePerDay || 0) * 100));
  let paisa = chargeableDays * perDayPaisa;
  let capped = false;
  if (rule.maxFine !== null && rule.maxFine !== undefined && rule.maxFine >= 0) {
    const capPaisa = Math.round(rule.maxFine * 100);
    if (paisa > capPaisa) {
      paisa = capPaisa;
      capped = true;
    }
  }
  return { overdueDays: days, chargeableDays, suggestedFine: paisa / 100, capped };
}

/** Should the daily sweep flip this loan to OVERDUE? */
export function shouldMarkOverdue(loan: { status: string; dueDate: Date }, now: Date): boolean {
  return loan.status === 'ISSUED' && loan.dueDate.getTime() < startOfDayAt(now).getTime();
}
