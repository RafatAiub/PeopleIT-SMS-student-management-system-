// =============================================================================
// Pure transport logic (no I/O) — unit tested in
// backend/tests/inventory-library-transport-logic.test.ts.
// =============================================================================
import { lineMatchesPeriod, normalizePeriod } from '../fees/bulk/bulk.keys';

// ── Stop ordering ─────────────────────────────────────────────────────────

/**
 * A reorder request must be an exact permutation of the route's current
 * stops: same ids, no duplicates, nothing missing, nothing foreign.
 * Returns an error message, or null when valid.
 */
export function validateStopOrder(existingIds: string[], requestedIds: string[]): string | null {
  if (requestedIds.length !== existingIds.length) {
    return `Expected ${existingIds.length} stops but received ${requestedIds.length}`;
  }
  const existing = new Set(existingIds);
  const seen = new Set<string>();
  for (const id of requestedIds) {
    if (!existing.has(id)) return 'The order contains a stop that is not on this route';
    if (seen.has(id)) return 'The order contains the same stop twice';
    seen.add(id);
  }
  return null;
}

/** Moves one element from index `from` to index `to` (both clamped). Returns a new array. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (list.length === 0) return [];
  const f = Math.max(0, Math.min(list.length - 1, from));
  const t = Math.max(0, Math.min(list.length - 1, to));
  const next = list.slice();
  const [item] = next.splice(f, 1);
  next.splice(t, 0, item);
  return next;
}

/** 1-based contiguous sequence numbers in the given order. */
export function resequence(ids: string[]): { id: string; sequence: number }[] {
  return ids.map((id, i) => ({ id, sequence: i + 1 }));
}

/** Sequence for a stop appended to the end of a route. */
export function nextSequence(existing: { sequence: number }[]): number {
  return existing.reduce((max, s) => Math.max(max, s.sequence), 0) + 1;
}

// ── Transport fee billing ─────────────────────────────────────────────────
//
// Invoice has no `period` column, so — like fees/bulk — the period is carried
// as a trailing tag on the invoice LINE description:
//   "Transport fee — Route A [2026-10]"
// A student counts as already billed for a period when any of their
// non-cancelled invoices has a line whose description starts with
// "Transport fee" and ends with that period tag. Keyed per student + period
// (not per fee category), so switching the fee category between runs can
// never double-bill a student for the same month.

export const TRANSPORT_LINE_PREFIX = 'Transport fee';

export function transportFeeKey(studentId: string, period: string): string {
  return `${studentId}|transport|${normalizePeriod(period).toLowerCase()}`;
}

export function transportLineDescription(routeName: string, period: string): string {
  return `${TRANSPORT_LINE_PREFIX} — ${routeName.trim()} [${normalizePeriod(period)}]`;
}

export function isTransportLineForPeriod(description: string, period: string): boolean {
  return description.trim().toLowerCase().startsWith(TRANSPORT_LINE_PREFIX.toLowerCase()) && lineMatchesPeriod(description, period);
}

export function existingTransportKeys(lines: { studentId: string; description: string }[], period: string): Set<string> {
  const keys = new Set<string>();
  for (const l of lines) if (isTransportLineForPeriod(l.description, period)) keys.add(transportFeeKey(l.studentId, period));
  return keys;
}

export interface TransportFeeCandidate {
  studentId: string;
  studentActive: boolean;
  routeName: string;
  fare: number;
}

export type TransportFeeDecision = 'BILL' | 'ALREADY_BILLED' | 'ZERO_FARE' | 'INACTIVE_STUDENT';

export function decideTransportFee(c: TransportFeeCandidate, existingKeys: Set<string>, period: string): TransportFeeDecision {
  if (!c.studentActive) return 'INACTIVE_STUDENT';
  if (!(c.fare > 0)) return 'ZERO_FARE';
  if (existingKeys.has(transportFeeKey(c.studentId, period))) return 'ALREADY_BILLED';
  return 'BILL';
}

export function planTransportFees(candidates: TransportFeeCandidate[], existingKeys: Set<string>, period: string) {
  const rows = candidates.map((c) => ({
    ...c,
    amount: Math.round(c.fare * 100) / 100,
    description: transportLineDescription(c.routeName, period),
    decision: decideTransportFee(c, existingKeys, period),
  }));
  // A student has at most one assignment (unique constraint), but guard anyway.
  const seen = new Set<string>();
  for (const r of rows) {
    if (r.decision !== 'BILL') continue;
    if (seen.has(r.studentId)) r.decision = 'ALREADY_BILLED';
    seen.add(r.studentId);
  }
  const toBill = rows.filter((r) => r.decision === 'BILL');
  return {
    rows,
    toBill,
    totalAmount: toBill.reduce((s, r) => s + Math.round(r.amount * 100), 0) / 100,
    counts: {
      bill: toBill.length,
      alreadyBilled: rows.filter((r) => r.decision === 'ALREADY_BILLED').length,
      zeroFare: rows.filter((r) => r.decision === 'ZERO_FARE').length,
      inactive: rows.filter((r) => r.decision === 'INACTIVE_STUDENT').length,
    },
  };
}

// ── Route report ──────────────────────────────────────────────────────────

/** Percentage of seats used, 1 decimal; null when capacity is unknown/0. */
export function utilisation(assigned: number, capacity: number): number | null {
  if (!(capacity > 0)) return null;
  return Math.round((assigned / capacity) * 1000) / 10;
}
