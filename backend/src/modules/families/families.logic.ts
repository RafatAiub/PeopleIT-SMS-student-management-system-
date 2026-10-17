// =============================================================================
// Family profile (T3) — pure logic. No DB, no Express.
// Unit-tested in tests/family-logic.test.ts.
// =============================================================================

export interface DueInvoice {
  id: string;
  dueAmount: number;
  dueDate: Date | string;
  status: string;
}

/** Work in paisa so sums never drift. */
export const toPaisa = (n: number) => Math.round(n * 100);
export const fromPaisa = (p: number) => p / 100;

/** Invoices that can still take money. */
export function isPayable(inv: Pick<DueInvoice, 'dueAmount' | 'status'>): boolean {
  return inv.dueAmount > 0.001 && inv.status !== 'PAID' && inv.status !== 'CANCELLED';
}

/** Oldest due date first (then id), so arrears are cleared before new fees. */
export function sortOldestFirst<T extends DueInvoice>(invoices: T[]): T[] {
  return [...invoices].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime() || a.id.localeCompare(b.id));
}

/**
 * Splits `amount` across payable invoices, oldest due first; each invoice gets
 * at most its due. Throws when the amount is ≤ 0 or more than the total due.
 */
export function allocateOldestFirst(amount: number, invoices: DueInvoice[]): Array<{ invoiceId: string; amount: number }> {
  let left = toPaisa(amount);
  if (left <= 0) throw new Error('Amount must be greater than zero');
  const payable = sortOldestFirst(invoices.filter(isPayable));
  const total = payable.reduce((s, i) => s + toPaisa(i.dueAmount), 0);
  if (left > total) throw new Error('Amount is more than the family owes');
  const out: Array<{ invoiceId: string; amount: number }> = [];
  for (const inv of payable) {
    if (left <= 0) break;
    const take = Math.min(left, toPaisa(inv.dueAmount));
    out.push({ invoiceId: inv.id, amount: fromPaisa(take) });
    left -= take;
  }
  return out;
}

/** Validates an explicit split (staff offline payment). Returns a problem or null. */
export function allocationProblem(
  amount: number,
  allocations: Array<{ invoiceId: string; amount: number }>,
  invoices: Map<string, DueInvoice>,
): string | null {
  if (allocations.length === 0) return 'Choose at least one invoice';
  const seen = new Set<string>();
  let sum = 0;
  for (const a of allocations) {
    if (seen.has(a.invoiceId)) return 'An invoice appears twice';
    seen.add(a.invoiceId);
    const inv = invoices.get(a.invoiceId);
    if (!inv) return 'Invoice not found in this family';
    if (!isPayable(inv)) return 'An invoice is already paid or cancelled';
    if (toPaisa(a.amount) <= 0) return 'Each amount must be greater than zero';
    if (toPaisa(a.amount) > toPaisa(inv.dueAmount)) return 'An amount is more than that invoice owes';
    sum += toPaisa(a.amount);
  }
  if (sum !== toPaisa(amount)) return 'The split must add up to the payment amount';
  return null;
}

/** Totals for the family fee panel. */
export function familyDues(invoices: DueInvoice[], now: Date = new Date()): { due: number; overdue: number; count: number } {
  let due = 0;
  let overdue = 0;
  let count = 0;
  for (const i of invoices.filter(isPayable)) {
    due += toPaisa(i.dueAmount);
    count += 1;
    if (new Date(i.dueDate).getTime() < now.getTime()) overdue += toPaisa(i.dueAmount);
  }
  return { due: fromPaisa(due), overdue: fromPaisa(overdue), count };
}

/**
 * A student's anchor guardian: the primary link, else the earliest-created
 * guardian, then lowest id. Mirrors the T3 migration backfill.
 */
export function pickAnchor<T extends { guardianId: string; isPrimary: boolean; guardianCreatedAt: Date }>(links: T[]): T | null {
  if (links.length === 0) return null;
  return [...links].sort(
    (a, b) =>
      Number(b.isPrimary) - Number(a.isPrimary) ||
      a.guardianCreatedAt.getTime() - b.guardianCreatedAt.getTime() ||
      a.guardianId.localeCompare(b.guardianId),
  )[0];
}

export function defaultFamilyName(g: { firstName: string; lastName: string } | null | undefined, fallback = 'Family'): string {
  const n = g ? `${g.firstName ?? ''} ${g.lastName ?? ''}`.trim() : '';
  return n ? `${n.slice(0, 100)} family` : fallback;
}

/** Attendance summary (same rate formula as report cards: late counts, half-day = ½). */
export function attendanceSummary(statuses: string[]): { total: number; present: number; absent: number; late: number; halfDay: number; rate: number | null } {
  const c = { total: 0, present: 0, absent: 0, late: 0, halfDay: 0 };
  for (const s of statuses) {
    c.total += 1;
    const u = String(s).toUpperCase();
    if (u === 'PRESENT') c.present += 1;
    else if (u === 'ABSENT') c.absent += 1;
    else if (u === 'LATE') c.late += 1;
    else if (u === 'HALF_DAY') c.halfDay += 1;
  }
  const rate = c.total > 0 ? Math.round(((c.present + c.late + c.halfDay * 0.5) / c.total) * 100) : null;
  return { ...c, rate };
}

/** RCP-TAG-YEAR-000041 → [..41, ..42, ..43] — consecutive receipts for one family payment. */
export function consecutiveReceipts(first: string, n: number): string[] {
  const m = /^(.*-)(\d+)$/.exec(first);
  if (!m) throw new Error(`Unexpected receipt number: ${first}`);
  const width = m[2].length;
  const start = Number(m[2]);
  return Array.from({ length: n }, (_, i) => `${m[1]}${String(start + i).padStart(width, '0')}`);
}
