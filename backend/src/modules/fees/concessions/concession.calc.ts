// =============================================================================
// Pure concession maths (no I/O) — unit tested in backend/tests/fee-concessions.test.ts.
//
// Rules:
//  - All maths is done in paisa (integer cents) to avoid float drift.
//  - A concession applies on top of any manual discount already on the line,
//    to what is left of the line (amount - existingDiscount).
//  - Category-specific concessions (feeCategoryId set) apply first, only to
//    lines of that category. Whole-invoice concessions (feeCategoryId null)
//    apply after, across every line.
//  - PERCENT: value% of each affected line's remaining net.
//  - FIXED, category-specific: the fixed amount off EACH matching line.
//  - FIXED, whole-invoice: one fixed amount for the whole invoice, spread
//    across lines proportionally to their remaining net (rounding remainder
//    on the last line).
//  - A line's total discount can never exceed its amount (net never < 0).
// =============================================================================

export interface ConcessionRule {
  id: string;
  name: string;
  type: 'PERCENT' | 'FIXED';
  value: number;
  feeCategoryId: string | null;
}

export interface InvoiceLineInput {
  feeCategoryId: string;
  description: string;
  amount: number;
  discount: number;
}

export interface InvoiceLineWithConcession extends InvoiceLineInput {
  /** Portion of `discount` that came from concessions. */
  concessionDiscount: number;
  appliedConcessionNames: string[];
}

export interface AppliedConcession {
  concessionId: string;
  name: string;
  amount: number;
}

export interface ConcessionResult {
  items: InvoiceLineWithConcession[];
  applied: AppliedConcession[];
  totalConcession: number;
}

export const toPaisa = (n: number) => Math.round(n * 100);
export const fromPaisa = (p: number) => Math.round(p) / 100;

export function applyConcessions(lines: InvoiceLineInput[], concessions: ConcessionRule[]): ConcessionResult {
  const work = lines.map((l) => {
    const amount = toPaisa(l.amount);
    const manual = Math.min(toPaisa(l.discount), amount);
    return {
      line: l,
      amount,
      manual,
      concession: 0,
      names: [] as string[],
    };
  });
  const remaining = (i: number) => work[i].amount - work[i].manual - work[i].concession;

  const appliedMap = new Map<string, AppliedConcession>();
  const record = (c: ConcessionRule, paisa: number, i: number) => {
    if (paisa <= 0) return;
    work[i].concession += paisa;
    if (!work[i].names.includes(c.name)) work[i].names.push(c.name);
    const prev = appliedMap.get(c.id) ?? { concessionId: c.id, name: c.name, amount: 0 };
    prev.amount += paisa;
    appliedMap.set(c.id, prev);
  };

  const valid = concessions.filter((c) => Number.isFinite(c.value) && c.value > 0);
  const categorySpecific = valid.filter((c) => c.feeCategoryId);
  const wholeInvoice = valid.filter((c) => !c.feeCategoryId);

  for (const c of categorySpecific) {
    work.forEach((w, i) => {
      if (w.line.feeCategoryId !== c.feeCategoryId) return;
      const rem = remaining(i);
      if (rem <= 0) return;
      const off = c.type === 'PERCENT' ? Math.round((rem * Math.min(c.value, 100)) / 100) : Math.min(toPaisa(c.value), rem);
      record(c, Math.min(off, rem), i);
    });
  }

  for (const c of wholeInvoice) {
    if (c.type === 'PERCENT') {
      work.forEach((_w, i) => {
        const rem = remaining(i);
        if (rem <= 0) return;
        record(c, Math.min(Math.round((rem * Math.min(c.value, 100)) / 100), rem), i);
      });
      continue;
    }
    // FIXED whole-invoice: spread proportionally.
    const rems = work.map((_w, i) => Math.max(remaining(i), 0));
    const pool = rems.reduce((a, b) => a + b, 0);
    if (pool <= 0) continue;
    const target = Math.min(toPaisa(c.value), pool);
    const lastIdx = rems.reduce((last, r, i) => (r > 0 ? i : last), -1);
    let allocated = 0;
    rems.forEach((r, i) => {
      if (r <= 0) return;
      const share = i === lastIdx ? target - allocated : Math.min(Math.floor((target * r) / pool), r);
      allocated += share;
      record(c, Math.min(share, r), i);
    });
  }

  const items: InvoiceLineWithConcession[] = work.map((w) => ({
    feeCategoryId: w.line.feeCategoryId,
    description:
      w.names.length > 0 ? `${w.line.description} (Concession: ${w.names.join(', ')})` : w.line.description,
    amount: fromPaisa(w.amount),
    discount: fromPaisa(w.manual + w.concession),
    concessionDiscount: fromPaisa(w.concession),
    appliedConcessionNames: w.names,
  }));

  const applied = [...appliedMap.values()].map((a) => ({ ...a, amount: fromPaisa(a.amount) }));
  return {
    items,
    applied,
    totalConcession: fromPaisa(work.reduce((s, w) => s + w.concession, 0)),
  };
}

/** Is a StudentConcession assignment active on `at`? validFrom/validTo are inclusive, null = open-ended. */
export function isAssignmentActive(
  assignment: { validFrom: Date | null; validTo: Date | null },
  at: Date = new Date(),
): boolean {
  if (assignment.validFrom && assignment.validFrom.getTime() > at.getTime()) return false;
  if (assignment.validTo && assignment.validTo.getTime() < at.getTime()) return false;
  return true;
}
