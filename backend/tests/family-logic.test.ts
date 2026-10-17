import {
  allocateOldestFirst,
  allocationProblem,
  attendanceSummary,
  consecutiveReceipts,
  defaultFamilyName,
  familyDues,
  isPayable,
  pickAnchor,
} from '../src/modules/families/families.logic';

// T3 family profile — pure logic (no DB).

const inv = (id: string, dueAmount: number, dueDate: string, status = 'UNPAID') => ({ id, dueAmount, dueDate: new Date(dueDate), status });

describe('T3 family logic', () => {
  it('only unpaid/partial/overdue invoices with money due are payable', () => {
    expect(isPayable(inv('a', 10, '2026-01-01'))).toBe(true);
    expect(isPayable(inv('b', 10, '2026-01-01', 'PARTIAL'))).toBe(true);
    expect(isPayable(inv('c', 0, '2026-01-01', 'UNPAID'))).toBe(false);
    expect(isPayable(inv('d', 10, '2026-01-01', 'PAID'))).toBe(false);
    expect(isPayable(inv('e', 10, '2026-01-01', 'CANCELLED'))).toBe(false);
  });

  it('allocates oldest due first and never more than an invoice owes', () => {
    const list = [inv('new', 300, '2026-03-01'), inv('old', 100.5, '2026-01-01'), inv('mid', 200, '2026-02-01'), inv('paid', 50, '2025-01-01', 'PAID')];
    expect(allocateOldestFirst(250.5, list)).toEqual([
      { invoiceId: 'old', amount: 100.5 },
      { invoiceId: 'mid', amount: 150 },
    ]);
    expect(allocateOldestFirst(600.5, list).map((a) => a.amount)).toEqual([100.5, 200, 300]);
    expect(() => allocateOldestFirst(600.51, list)).toThrow(/more than the family owes/);
    expect(() => allocateOldestFirst(0, list)).toThrow();
  });

  it('validates an explicit offline split', () => {
    const m = new Map([inv('a', 100, '2026-01-01'), inv('b', 50, '2026-01-02'), inv('p', 10, '2026-01-01', 'PAID')].map((i) => [i.id, i]));
    expect(allocationProblem(150, [{ invoiceId: 'a', amount: 100 }, { invoiceId: 'b', amount: 50 }], m)).toBeNull();
    expect(allocationProblem(140, [{ invoiceId: 'a', amount: 100 }, { invoiceId: 'b', amount: 50 }], m)).toMatch(/add up/);
    expect(allocationProblem(120, [{ invoiceId: 'a', amount: 120 }], m)).toMatch(/more than/);
    expect(allocationProblem(10, [{ invoiceId: 'p', amount: 10 }], m)).toMatch(/already paid/);
    expect(allocationProblem(10, [{ invoiceId: 'zzz', amount: 10 }], m)).toMatch(/not found/);
    expect(allocationProblem(20, [{ invoiceId: 'a', amount: 10 }, { invoiceId: 'a', amount: 10 }], m)).toMatch(/twice/);
    expect(allocationProblem(0, [], m)).toMatch(/at least one/);
  });

  it('totals family dues and overdue', () => {
    const now = new Date('2026-02-15');
    expect(familyDues([inv('a', 100, '2026-01-01'), inv('b', 50.25, '2026-03-01'), inv('c', 70, '2026-01-01', 'PAID')], now)).toEqual({ due: 150.25, overdue: 100, count: 2 });
  });

  it('picks the anchor guardian like the migration backfill', () => {
    const d = (s: string) => new Date(s);
    const links = [
      { guardianId: 'g2', isPrimary: false, guardianCreatedAt: d('2020-01-01') },
      { guardianId: 'g1', isPrimary: true, guardianCreatedAt: d('2024-01-01') },
    ];
    expect(pickAnchor(links)?.guardianId).toBe('g1');
    expect(pickAnchor(links.map((l) => ({ ...l, isPrimary: false })))?.guardianId).toBe('g2');
    expect(pickAnchor([{ guardianId: 'b', isPrimary: false, guardianCreatedAt: d('2020-01-01') }, { guardianId: 'a', isPrimary: false, guardianCreatedAt: d('2020-01-01') }])?.guardianId).toBe('a');
    expect(pickAnchor([])).toBeNull();
    expect(defaultFamilyName({ firstName: 'Abdul', lastName: 'Karim' })).toBe('Abdul Karim family');
  });

  it('summarises attendance with the report-card rate', () => {
    expect(attendanceSummary(['PRESENT', 'PRESENT', 'LATE', 'ABSENT', 'HALF_DAY'])).toEqual({ total: 5, present: 2, absent: 1, late: 1, halfDay: 1, rate: 70 });
    expect(attendanceSummary([]).rate).toBeNull();
  });

  it('derives consecutive receipt numbers', () => {
    expect(consecutiveReceipts('RCP-AB12-2026-000041', 3)).toEqual(['RCP-AB12-2026-000041', 'RCP-AB12-2026-000042', 'RCP-AB12-2026-000043']);
  });
});
