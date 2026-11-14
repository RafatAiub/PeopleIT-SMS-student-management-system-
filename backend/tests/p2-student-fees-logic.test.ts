// P2 student fees — pure logic (no DB).
import {
  activeProfiles,
  addMonths,
  allocateOldestFirst,
  appliedAmountOf,
  buildMonthlyLines,
  dhakaDate,
  fineAmount,
  fineKeysDue,
  monthsBetween,
  periodLabel,
  periodOf,
  pickFineRule,
  profileAmountForPeriod,
  refundableAmount,
  resolveBaseFees,
  spreadDiscount,
  statusFor,
  yearlyShare,
  type FeeProfileLite,
  type FineRuleLite,
} from '../src/modules/fees/student-fees/studentFees.logic';

const profile = (p: Partial<FeeProfileLite>): FeeProfileLite => ({
  id: p.id ?? 'p1',
  feeCategoryId: p.feeCategoryId ?? null,
  kind: p.kind ?? 'MONTHLY',
  monthlyAmount: p.monthlyAmount ?? null,
  yearlyAmount: p.yearlyAmount ?? null,
  yearlyMode: p.yearlyMode ?? 'SPREAD',
  effectiveFrom: p.effectiveFrom ?? '2026-01',
  effectiveTo: p.effectiveTo ?? null,
  endedAt: p.endedAt ?? null,
  createdAt: p.createdAt ?? new Date('2026-01-01T00:00:00Z'),
});

describe('periods (Asia/Dhaka)', () => {
  it('periodOf uses the Dhaka calendar', () => {
    // 2026-10-31 19:00 UTC is already 1 Nov 01:00 in Dhaka.
    expect(periodOf(new Date('2026-10-31T19:00:00Z'))).toBe('2026-11');
    expect(periodOf(new Date('2026-10-31T17:00:00Z'))).toBe('2026-10');
  });
  it('month arithmetic crosses years', () => {
    expect(addMonths('2026-11', 3)).toBe('2027-02');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(monthsBetween('2026-11', '2027-02')).toBe(3);
  });
  it('dhakaDate is Dhaka midnight and clamps the day', () => {
    expect(dhakaDate('2026-10', 10).toISOString()).toBe('2026-10-09T18:00:00.000Z');
    expect(dhakaDate('2027-02', 31).toISOString()).toBe('2027-02-27T18:00:00.000Z');
  });
  it('labels', () => expect(periodLabel('2026-10')).toBe('October 2026'));
});

describe('student fee profile maths', () => {
  it('yearly spread: total/12 in whole taka, month 12 absorbs rounding', () => {
    const months = Array.from({ length: 12 }, (_, i) => yearlyShare(10000, 'SPREAD', i));
    expect(months.slice(0, 11).every((m) => m === 833)).toBe(true);
    expect(months[11]).toBe(837);
    expect(months.reduce((a, b) => a + b, 0)).toBe(10000);
    // even split stays even
    expect(new Set(Array.from({ length: 12 }, (_, i) => yearlyShare(6000, 'SPREAD', i)))).toEqual(new Set([500]));
    // cycle repeats in year two
    expect(yearlyShare(10000, 'SPREAD', 23)).toBe(837);
    expect(yearlyShare(10000, 'SPREAD', 12)).toBe(833);
  });
  it('yearly one-time bills the whole total in month 1 of each cycle', () => {
    expect(yearlyShare(12000, 'ONE_TIME', 0)).toBe(12000);
    expect(yearlyShare(12000, 'ONE_TIME', 5)).toBe(0);
    expect(yearlyShare(12000, 'ONE_TIME', 12)).toBe(12000);
  });
  it('a yearly profile counts months from effectiveFrom', () => {
    const p = profile({ kind: 'YEARLY', yearlyAmount: 10000, effectiveFrom: '2026-07' });
    expect(profileAmountForPeriod(p, '2026-06')).toBeNull();
    expect(profileAmountForPeriod(p, '2026-07')).toBe(833);
    expect(profileAmountForPeriod(p, '2027-06')).toBe(837);
  });
  it('effective-to, void and monthly amounts', () => {
    const p = profile({ monthlyAmount: 500, effectiveFrom: '2026-03', effectiveTo: '2026-05' });
    expect(profileAmountForPeriod(p, '2026-05')).toBe(500);
    expect(profileAmountForPeriod(p, '2026-06')).toBeNull();
    expect(profileAmountForPeriod({ ...p, endedAt: new Date() }, '2026-04')).toBeNull();
  });
  it('the latest effective-from wins per category', () => {
    const old = profile({ id: 'a', feeCategoryId: 'T', monthlyAmount: 700, effectiveFrom: '2026-01' });
    const neu = profile({ id: 'b', feeCategoryId: 'T', monthlyAmount: 400, effectiveFrom: '2026-06', createdAt: new Date('2025-01-01') });
    expect(activeProfiles([neu, old], '2026-05').get('T')?.amount).toBe(700);
    expect(activeProfiles([neu, old], '2026-06').get('T')?.amount).toBe(400);
  });
});

describe('monthly lines', () => {
  const names = new Map([['T', 'Tuition'], ['B', 'Transport'], ['H', 'Hostel']]);
  const base = [
    { feeCategoryId: 'T', categoryName: 'Tuition', amount: 1000 },
    { feeCategoryId: 'B', categoryName: 'Transport', amount: 500 },
  ];
  it('no profile → class fees', () => {
    const lines = buildMonthlyLines(base, [], '2026-11', names, 'T');
    expect(lines.map((l) => [l.feeCategoryId, l.amount, l.custom])).toEqual([['T', 1000, false], ['B', 500, false]]);
  });
  it('category profile replaces one line and can add a new category; 0 drops a line', () => {
    const lines = buildMonthlyLines(
      base,
      [profile({ id: '1', feeCategoryId: 'T', monthlyAmount: 600 }), profile({ id: '2', feeCategoryId: 'H', monthlyAmount: 2000 }), profile({ id: '3', feeCategoryId: 'B', monthlyAmount: 0 })],
      '2026-11',
      names,
      'T',
    );
    expect(lines.map((l) => [l.feeCategoryId, l.amount])).toEqual([['T', 600], ['H', 2000]]);
  });
  it('overall profile spreads over the class lines in proportion (last absorbs rounding)', () => {
    const lines = buildMonthlyLines(base, [profile({ monthlyAmount: 1000 })], '2026-11', names, 'T');
    expect(lines.map((l) => l.amount)).toEqual([666.66, 333.34]);
    expect(lines.reduce((a, l) => a + Math.round(l.amount * 100), 0)).toBe(100000);
  });
  it('overall yearly profile with no class fees uses the fallback category', () => {
    const lines = buildMonthlyLines([], [profile({ kind: 'YEARLY', yearlyAmount: 12000, effectiveFrom: '2026-11' })], '2026-11', names, 'T');
    expect(lines).toEqual([{ feeCategoryId: 'T', categoryName: 'Tuition', amount: 1000, custom: true }]);
  });
  it('resolveBaseFees: global schedule < class fee < class schedule, monthly categories only', () => {
    const res = resolveBaseFees(['T', 'B'], names, {
      globalSchedule: new Map([['T', 900], ['B', 200], ['X', 50]]),
      classFees: new Map([['T', 1000]]),
      classSchedule: new Map([['B', 350]]),
    });
    expect(res.map((r) => [r.feeCategoryId, r.amount])).toEqual([['T', 1000], ['B', 350]]);
  });
});

describe('counter', () => {
  const inv = (id: string, due: number, dueDate: string, period?: string, status = 'UNPAID') => ({ id, dueAmount: due, dueDate, status, period });
  it('allocates oldest month first and caps each at its due', () => {
    const r = allocateOldestFirst(1500, [inv('c', 1000, '2026-11-10', '2026-11'), inv('a', 1000, '2026-09-10', '2026-09'), inv('b', 1000, '2026-10-10', '2026-10')]);
    expect(r).toEqual([{ invoiceId: 'a', amount: 1000 }, { invoiceId: 'b', amount: 500 }]);
  });
  it('skips paid/cancelled and refuses more than the total due', () => {
    expect(() => allocateOldestFirst(1001, [inv('a', 1000, '2026-09-10'), inv('x', 500, '2026-08-10', undefined, 'CANCELLED')])).toThrow(/more than the total due/);
    expect(() => allocateOldestFirst(0, [inv('a', 1000, '2026-09-10')])).toThrow();
  });
  it('spreads a discount over lines by remaining net', () => {
    expect(spreadDiscount([{ amount: 1000, discount: 0 }, { amount: 500, discount: 0 }], 150)).toEqual([100, 50]);
    expect(spreadDiscount([{ amount: 100, discount: 100 }, { amount: 300, discount: 0 }], 1000)).toEqual([0, 300]);
  });
});

describe('status, reversal and refunds', () => {
  const now = new Date('2026-11-20T06:00:00Z');
  it('statusFor recalculates due and status', () => {
    const due = new Date('2026-11-25T00:00:00Z');
    expect(statusFor({ status: 'PAID', totalAmount: 1000, paidAmount: 400, dueDate: due }, now)).toEqual({ status: 'PARTIAL', dueAmount: 600 });
    expect(statusFor({ status: 'PAID', totalAmount: 1000, paidAmount: 0, dueDate: due }, now)).toEqual({ status: 'UNPAID', dueAmount: 1000 });
    expect(statusFor({ status: 'UNPAID', totalAmount: 1000, paidAmount: 0, dueDate: new Date('2026-11-10T00:00:00Z') }, now).status).toBe('OVERDUE');
    expect(statusFor({ status: 'UNPAID', totalAmount: 1000, paidAmount: 1000, dueDate: due }, now)).toEqual({ status: 'PAID', dueAmount: 0 });
    expect(statusFor({ status: 'CANCELLED', totalAmount: 1000, paidAmount: 0, dueDate: due }, now).status).toBe('CANCELLED');
  });
  it('applied amount excludes an online overpayment', () => {
    expect(appliedAmountOf({ amount: 1000, notes: 'x [OVERPAYMENT 600]' }, 1000)).toBe(400);
    expect(appliedAmountOf({ amount: 500, notes: null }, 300)).toBe(300);
  });
  it('refundable: the overpayment, or the whole payment once reversed, minus refunds', () => {
    expect(refundableAmount({ amount: 1000, status: 'COMPLETED', notes: '[OVERPAYMENT 600]' }, 0)).toBe(600);
    expect(refundableAmount({ amount: 1000, status: 'COMPLETED', notes: null }, 0)).toBe(0);
    expect(refundableAmount({ amount: 1000, status: 'REVERSED', notes: '[OVERPAYMENT 600]' }, 250)).toBe(750);
    expect(refundableAmount({ amount: 1000, status: 'REVERSED', notes: null }, 1000)).toBe(0);
  });
});

describe('late fine', () => {
  const rule = (r: Partial<FineRuleLite>): FineRuleLite => ({
    id: r.id ?? 'r',
    feeCategoryId: r.feeCategoryId ?? null,
    type: r.type ?? 'FLAT',
    value: r.value ?? 50,
    graceDays: r.graceDays ?? 0,
    recurrence: r.recurrence ?? 'ONCE',
    maxAmount: r.maxAmount ?? null,
    isActive: r.isActive ?? true,
  });
  const due = dhakaDate('2026-10', 10);
  it('nothing until more than graceDays past the due date', () => {
    expect(fineKeysDue(due, rule({ graceDays: 5 }), dhakaDate('2026-10', 15))).toEqual([]);
    expect(fineKeysDue(due, rule({ graceDays: 5 }), dhakaDate('2026-10', 16))).toEqual(['ONCE']);
  });
  it('monthly keys, one per month since the first fine day', () => {
    const r = rule({ recurrence: 'MONTHLY', graceDays: 0 });
    expect(fineKeysDue(due, r, dhakaDate('2026-10', 11))).toEqual(['M1']);
    expect(fineKeysDue(due, r, dhakaDate('2026-11', 10))).toEqual(['M1']);
    expect(fineKeysDue(due, r, dhakaDate('2026-11', 11))).toEqual(['M1', 'M2']);
    expect(fineKeysDue(due, r, dhakaDate('2027-01', 11))).toEqual(['M1', 'M2', 'M3', 'M4']);
  });
  it('flat / percent amounts and the cap', () => {
    expect(fineAmount(rule({ type: 'FLAT', value: 50 }), 1000, 0)).toBe(50);
    expect(fineAmount(rule({ type: 'PERCENT', value: 5 }), 1234, 0)).toBe(61.7);
    expect(fineAmount(rule({ value: 50, maxAmount: 120 }), 1000, 100)).toBe(20);
    expect(fineAmount(rule({ value: 50, maxAmount: 120 }), 1000, 120)).toBe(0);
  });
  it('category rule beats the school-wide rule; inactive rules never apply', () => {
    const rules = [rule({ id: 'school' }), rule({ id: 'tuition', feeCategoryId: 'T' }), rule({ id: 'off', feeCategoryId: 'B', isActive: false })];
    expect(pickFineRule(rules, ['B', 'T'])?.id).toBe('tuition');
    expect(pickFineRule(rules, ['B'])?.id).toBe('school');
    expect(pickFineRule([rule({ isActive: false })], ['T'])).toBeNull();
  });
});
