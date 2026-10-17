// =============================================================================
// T3 family — pure UI logic (no React, no network). Mirrors the server rules
// so the offline-payment form can preview the split before submitting.
// Tested by pages/families/__tests__/family-logic.test.ts (self-running).
// =============================================================================

export interface DueLine {
  id: string;
  dueAmount: number;
  dueDate: string;
}

const paisa = (n: number) => Math.round(n * 100);

/** Oldest due first; each invoice gets at most what it owes. */
export function previewOldestFirst(amount: number, lines: DueLine[]): { allocations: Array<{ invoiceId: string; amount: number }>; leftover: number } {
  let left = paisa(amount);
  const sorted = [...lines].filter((l) => l.dueAmount > 0).sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime() || a.id.localeCompare(b.id));
  const allocations: Array<{ invoiceId: string; amount: number }> = [];
  for (const l of sorted) {
    if (left <= 0) break;
    const take = Math.min(left, paisa(l.dueAmount));
    allocations.push({ invoiceId: l.id, amount: take / 100 });
    left -= take;
  }
  return { allocations, leftover: Math.max(left, 0) / 100 };
}

/** Sum in paisa → taka, avoiding float drift. */
export function sumAmounts(values: number[]): number {
  return values.reduce((s, v) => s + paisa(v), 0) / 100;
}

/** "3 children · 2 guardians" style counts (EN). */
export function familyHeadline(children: number, guardians: number): string {
  return `${children} ${children === 1 ? 'child' : 'children'} · ${guardians} ${guardians === 1 ? 'guardian' : 'guardians'}`;
}

/** Siblings of one child inside a family (everyone else). */
export function siblingsOf<T extends { id: string }>(children: T[], studentId: string): T[] {
  return children.filter((c) => c.id !== studentId);
}

/** Reads ?payment=success|failed|cancelled|pending from the return URL. */
export function paymentBanner(search: string): 'success' | 'failed' | 'cancelled' | 'pending' | null {
  const v = new URLSearchParams(search).get('payment');
  return v === 'success' || v === 'failed' || v === 'cancelled' || v === 'pending' ? v : null;
}
