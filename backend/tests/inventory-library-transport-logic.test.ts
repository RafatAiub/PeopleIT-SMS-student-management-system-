// DB-free unit tests for Wave C inventory / library / transport logic:
// stock quantity math and the never-negative guard, library fine
// calculation and the OVERDUE sweep predicate, transport stop reordering and
// the transport-fee idempotency key. Every module under test is pure (no
// prisma import), so nothing here can reach a database.
import {
  computeStockChange,
  csvCell,
  isLowStock,
  maintenanceCostByMonth,
  monthRange,
  movementDelta,
  normalizeAssetCode,
  purchaseTotal,
  stockValuation,
  weightedAverageCost,
} from '../src/modules/inventory/inventory.logic';
import {
  calculateFine,
  isActiveLoanStatus,
  overdueDays,
  shouldMarkOverdue,
  startOfDayAt,
} from '../src/modules/library/library.logic';
import {
  existingTransportKeys,
  isTransportLineForPeriod,
  moveItem,
  nextSequence,
  planTransportFees,
  resequence,
  transportFeeKey,
  transportLineDescription,
  utilisation,
  validateStopOrder,
} from '../src/modules/transport/transport.logic';

// ── Stock math ──────────────────────────────────────────────────────────────

describe('computeStockChange', () => {
  it('adds on IN', () => {
    expect(computeStockChange(5, { type: 'IN', quantity: 10 })).toEqual({ ok: true, delta: 10, newQuantity: 15, movementQuantity: 10 });
  });

  it('subtracts on OUT', () => {
    expect(computeStockChange(5, { type: 'OUT', quantity: 5 })).toEqual({ ok: true, delta: -5, newQuantity: 0, movementQuantity: 5 });
  });

  it('refuses an OUT larger than stock (never negative)', () => {
    const r = computeStockChange(3, { type: 'OUT', quantity: 4 });
    expect(r.ok).toBe(false);
  });

  it('refuses zero / negative / fractional IN and OUT quantities', () => {
    expect(computeStockChange(3, { type: 'IN', quantity: 0 }).ok).toBe(false);
    expect(computeStockChange(3, { type: 'IN', quantity: -2 }).ok).toBe(false);
    expect(computeStockChange(3, { type: 'OUT', quantity: 1.5 }).ok).toBe(false);
    expect(computeStockChange(3, { type: 'OUT' }).ok).toBe(false);
  });

  it('applies a signed ADJUST delta but never below zero', () => {
    expect(computeStockChange(10, { type: 'ADJUST', quantity: -3 })).toMatchObject({ ok: true, newQuantity: 7, movementQuantity: -3 });
    expect(computeStockChange(10, { type: 'ADJUST', quantity: 2 })).toMatchObject({ ok: true, newQuantity: 12 });
    expect(computeStockChange(2, { type: 'ADJUST', quantity: -3 }).ok).toBe(false);
    expect(computeStockChange(2, { type: 'ADJUST', quantity: 0 }).ok).toBe(false);
  });

  it('converts a stock-take count into a signed delta', () => {
    expect(computeStockChange(10, { type: 'ADJUST', countedQuantity: 7 })).toEqual({ ok: true, delta: -3, newQuantity: 7, movementQuantity: -3 });
    expect(computeStockChange(10, { type: 'ADJUST', countedQuantity: 0 })).toMatchObject({ ok: true, newQuantity: 0 });
    expect(computeStockChange(10, { type: 'ADJUST', countedQuantity: 10 }).ok).toBe(false);
    expect(computeStockChange(10, { type: 'ADJUST', countedQuantity: -1 }).ok).toBe(false);
  });

  it('rejects an invalid current quantity', () => {
    expect(computeStockChange(-1, { type: 'IN', quantity: 1 }).ok).toBe(false);
  });

  it('replaying movement deltas never drops below zero when each step was accepted', () => {
    let qty = 0;
    const steps = [
      { type: 'IN' as const, quantity: 5 },
      { type: 'OUT' as const, quantity: 3 },
      { type: 'OUT' as const, quantity: 3 }, // rejected
      { type: 'ADJUST' as const, quantity: -2 },
      { type: 'ADJUST' as const, quantity: -1 }, // rejected
    ];
    const accepted: number[] = [];
    for (const s of steps) {
      const r = computeStockChange(qty, s);
      if (r.ok) {
        qty = r.newQuantity;
        accepted.push(movementDelta(s.type, r.movementQuantity));
      }
      expect(qty).toBeGreaterThanOrEqual(0);
    }
    expect(qty).toBe(0);
    expect(accepted.reduce((a, b) => a + b, 0)).toBe(qty);
  });
});

describe('movementDelta / isLowStock', () => {
  it('signs stored movements', () => {
    expect(movementDelta('IN', 4)).toBe(4);
    expect(movementDelta('OUT', 4)).toBe(-4);
    expect(movementDelta('ADJUST', -2)).toBe(-2);
  });

  it('flags quantity <= reorderLevel', () => {
    expect(isLowStock({ quantity: 5, reorderLevel: 5 })).toBe(true);
    expect(isLowStock({ quantity: 0, reorderLevel: 0 })).toBe(true);
    expect(isLowStock({ quantity: 6, reorderLevel: 5 })).toBe(false);
  });
});

describe('valuation and purchases', () => {
  it('computes a weighted average from costed IN movements only', () => {
    expect(
      weightedAverageCost([
        { type: 'IN', quantity: 10, unitCost: 10 },
        { type: 'IN', quantity: 30, unitCost: 20 },
        { type: 'OUT', quantity: 5, unitCost: 99 },
        { type: 'IN', quantity: 5, unitCost: null },
      ]),
    ).toBe(17.5);
    expect(weightedAverageCost([{ type: 'IN', quantity: 3, unitCost: null }])).toBeNull();
  });

  it('values stock and counts unvalued items', () => {
    const res = stockValuation(
      [
        { id: 'a', name: 'Chalk', unit: 'box', quantity: 4 },
        { id: 'b', name: 'Paper', unit: 'ream', quantity: 2 },
        { id: 'c', name: 'Empty', unit: 'pc', quantity: 0 },
      ],
      new Map([['a', [{ type: 'IN' as const, quantity: 10, unitCost: 12.5 }]]]),
    );
    expect(res.totalValue).toBe(50);
    expect(res.unvaluedItems).toBe(1);
    expect(res.rows.find((r) => r.stockItemId === 'b')?.value).toBeNull();
  });

  it('sums purchase lines without float drift', () => {
    expect(purchaseTotal([{ name: 'x', quantity: 3, unitCost: 0.1 }, { name: 'y', quantity: 1, unitCost: 0.2 }])).toBe(0.5);
  });
});

describe('assets helpers', () => {
  it('normalises asset codes', () => {
    expect(normalizeAssetCode('  lab pc 01 ')).toBe('LAB-PC-01');
  });

  it('buckets maintenance cost by BD month, skipping cancelled', () => {
    const from = new Date('2026-01-01T00:00:00Z');
    const to = new Date('2026-03-31T00:00:00Z');
    const res = maintenanceCostByMonth(
      [
        { date: new Date('2026-01-10T00:00:00Z'), cost: 100, status: 'COMPLETED' },
        { date: new Date('2026-01-31T20:00:00Z'), cost: 50, status: 'COMPLETED' }, // Feb 1 in BD time
        { date: new Date('2026-03-05T00:00:00Z'), cost: 999, status: 'CANCELLED' },
      ],
      from,
      to,
    );
    expect(res).toEqual([
      { period: '2026-01', cost: 100, count: 1 },
      { period: '2026-02', cost: 50, count: 1 },
      { period: '2026-03', cost: 0, count: 0 },
    ]);
    expect(monthRange(new Date('2025-11-15T00:00:00Z'), new Date('2026-02-01T00:00:00Z'))).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });

  it('escapes CSV cells and neutralises formula injection', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell(-3)).toBe('-3');
    expect(csvCell(null)).toBe('');
  });
});

// ── Library fines ───────────────────────────────────────────────────────────

describe('calculateFine', () => {
  const due = new Date('2026-09-20T00:00:00.000Z'); // due on 20 Sep (BD)
  const rule = { finePerDay: 5, graceDays: 2, maxFine: 50 };

  it('is zero when returned on or before the due date', () => {
    expect(calculateFine(due, new Date('2026-09-20T15:00:00Z'), rule).suggestedFine).toBe(0);
  });

  it('charges overdue days beyond the grace period', () => {
    // Returned 25 Sep → 5 days late, 2 grace → 3 × 5 = 15
    const r = calculateFine(due, new Date('2026-09-25T04:00:00Z'), rule);
    expect(r).toEqual({ overdueDays: 5, chargeableDays: 3, suggestedFine: 15, capped: false });
  });

  it('charges nothing inside the grace period', () => {
    expect(calculateFine(due, new Date('2026-09-22T04:00:00Z'), rule).suggestedFine).toBe(0);
  });

  it('caps at maxFine', () => {
    const r = calculateFine(due, new Date('2026-11-20T04:00:00Z'), rule);
    expect(r.suggestedFine).toBe(50);
    expect(r.capped).toBe(true);
  });

  it('has no cap when maxFine is null, and handles fractional rates', () => {
    const r = calculateFine(due, new Date('2026-09-30T04:00:00Z'), { finePerDay: 2.5, graceDays: 0, maxFine: null });
    expect(r.suggestedFine).toBe(25);
  });

  it('suggests 0 when no rule is configured', () => {
    expect(calculateFine(due, new Date('2026-10-30T04:00:00Z'), null)).toMatchObject({ suggestedFine: 0, overdueDays: 40 });
  });

  it('counts calendar days in Bangladesh time', () => {
    // 19:00Z on 20 Sep is 01:00 on 21 Sep in Dhaka → 1 day late.
    expect(overdueDays(due, new Date('2026-09-20T19:00:00Z'))).toBe(1);
    expect(overdueDays(due, new Date('2026-09-20T17:00:00Z'))).toBe(0);
  });
});

describe('OVERDUE sweep predicate', () => {
  const due = new Date('2026-09-20T00:00:00.000Z');

  it('marks ISSUED loans once their due day has passed (BD)', () => {
    expect(shouldMarkOverdue({ status: 'ISSUED', dueDate: due }, new Date('2026-09-20T12:00:00Z'))).toBe(false);
    expect(shouldMarkOverdue({ status: 'ISSUED', dueDate: due }, new Date('2026-09-20T18:30:00Z'))).toBe(true); // 00:30 on 21st in Dhaka
  });

  it('never touches RETURNED or already-OVERDUE loans', () => {
    const later = new Date('2026-10-20T00:00:00Z');
    expect(shouldMarkOverdue({ status: 'RETURNED', dueDate: due }, later)).toBe(false);
    expect(shouldMarkOverdue({ status: 'OVERDUE', dueDate: due }, later)).toBe(false);
  });

  it('treats OVERDUE as an active (returnable) loan', () => {
    expect(isActiveLoanStatus('ISSUED')).toBe(true);
    expect(isActiveLoanStatus('OVERDUE')).toBe(true);
    expect(isActiveLoanStatus('RETURNED')).toBe(false);
  });

  it('startOfDayAt returns BD midnight as UTC', () => {
    expect(startOfDayAt(new Date('2026-09-20T19:00:00Z')).toISOString()).toBe('2026-09-20T18:00:00.000Z');
  });
});

// ── Transport stops ─────────────────────────────────────────────────────────

describe('stop reorder', () => {
  const ids = ['a', 'b', 'c', 'd'];

  it('accepts an exact permutation', () => {
    expect(validateStopOrder(ids, ['d', 'c', 'b', 'a'])).toBeNull();
  });

  it('rejects missing, duplicate and foreign ids', () => {
    expect(validateStopOrder(ids, ['a', 'b', 'c'])).not.toBeNull();
    expect(validateStopOrder(ids, ['a', 'a', 'b', 'c'])).not.toBeNull();
    expect(validateStopOrder(ids, ['a', 'b', 'c', 'x'])).not.toBeNull();
  });

  it('moves items up / down and clamps at the ends', () => {
    expect(moveItem(ids, 2, 1)).toEqual(['a', 'c', 'b', 'd']);
    expect(moveItem(ids, 0, 3)).toEqual(['b', 'c', 'd', 'a']);
    expect(moveItem(ids, 0, -1)).toEqual(ids);
    expect(moveItem(ids, 3, 9)).toEqual(ids);
    expect(moveItem([], 0, 1)).toEqual([]);
    expect(ids).toEqual(['a', 'b', 'c', 'd']); // not mutated
  });

  it('resequences 1-based and appends after the max', () => {
    expect(resequence(['c', 'a'])).toEqual([{ id: 'c', sequence: 1 }, { id: 'a', sequence: 2 }]);
    expect(nextSequence([{ sequence: 1 }, { sequence: 4 }])).toBe(5);
    expect(nextSequence([])).toBe(1);
  });
});

// ── Transport fees ──────────────────────────────────────────────────────────

describe('transport fee idempotency', () => {
  it('keys per student + normalised period', () => {
    expect(transportFeeKey('s1', ' 2026-10 ')).toBe(transportFeeKey('s1', '2026-10'));
    expect(transportFeeKey('s1', '2026-10')).not.toBe(transportFeeKey('s1', '2026-11'));
    expect(transportFeeKey('s1', '2026-10')).not.toBe(transportFeeKey('s2', '2026-10'));
  });

  it('recognises its own lines, including concession suffixes', () => {
    const d = transportLineDescription('Route A', '2026-10');
    expect(d).toBe('Transport fee — Route A [2026-10]');
    expect(isTransportLineForPeriod(d, '2026-10')).toBe(true);
    expect(isTransportLineForPeriod(`${d} (Concession: Sibling 10%)`, '2026-10')).toBe(true);
    expect(isTransportLineForPeriod(d, '2026-11')).toBe(false);
    expect(isTransportLineForPeriod('Tuition Fee [2026-10]', '2026-10')).toBe(false);
  });

  it('skips already-billed, zero-fare and inactive students; re-running bills nobody twice', () => {
    const period = '2026-10';
    const candidates = [
      { studentId: 's1', studentActive: true, routeName: 'Route A', fare: 1500 },
      { studentId: 's2', studentActive: true, routeName: 'Route A', fare: 1500 },
      { studentId: 's3', studentActive: true, routeName: 'Free', fare: 0 },
      { studentId: 's4', studentActive: false, routeName: 'Route B', fare: 800 },
    ];
    const existing = existingTransportKeys([{ studentId: 's2', description: transportLineDescription('Old Route', period) }], period);
    const first = planTransportFees(candidates, existing, period);
    expect(first.toBill.map((r) => r.studentId)).toEqual(['s1']);
    expect(first.counts).toEqual({ bill: 1, alreadyBilled: 1, zeroFare: 1, inactive: 1 });
    expect(first.totalAmount).toBe(1500);

    // Simulate the invoices from the first run existing, then run again.
    const afterFirst = existingTransportKeys(
      [...first.toBill.map((r) => ({ studentId: r.studentId, description: r.description })), { studentId: 's2', description: transportLineDescription('Old Route', period) }],
      period,
    );
    const second = planTransportFees(candidates, afterFirst, period);
    expect(second.toBill).toHaveLength(0);
  });

  it('computes utilisation', () => {
    expect(utilisation(30, 40)).toBe(75);
    expect(utilisation(1, 3)).toBe(33.3);
    expect(utilisation(5, 0)).toBeNull();
  });
});
