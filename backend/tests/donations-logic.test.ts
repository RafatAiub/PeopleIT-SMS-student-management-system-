import {
  advanceDueDate,
  amountInWordsBn,
  amountInWordsEn,
  canDisburse,
  clampDayOfMonth,
  computeFundBalances,
  firstDueDate,
  formatDonationReceiptNo,
  generateDonationReference,
  isDueThisMonth,
  isValidDonationAmount,
  monthKey,
  nextDonationReceiptNo,
  nextDueAfterPayment,
  parseDonationReceiptCounter,
  pledgeDueState,
  progressPercent,
  remindedThisMonth,
  sumBalancesByType,
  toBanglaDigits,
  toCsv,
} from '../src/modules/donations/donations.logic';
import { decideVerification } from '../src/modules/fees/gateways/verify';

// T1 donations — pure logic (no DB).

const D = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe('receipt numbering', () => {
  it('formats DON-<year>-<6 digits>', () => {
    expect(formatDonationReceiptNo(2026, 1)).toBe('DON-2026-000001');
    expect(formatDonationReceiptNo(2026, 123456)).toBe('DON-2026-123456');
    expect(() => formatDonationReceiptNo(2026, 0)).toThrow();
  });
  it('continues from the current max, per year; bump skips past a collision', () => {
    expect(nextDonationReceiptNo(null, 2026)).toBe('DON-2026-000001');
    expect(nextDonationReceiptNo('DON-2026-000041', 2026)).toBe('DON-2026-000042');
    expect(nextDonationReceiptNo('DON-2025-000900', 2026)).toBe('DON-2026-000001');
    expect(nextDonationReceiptNo('DON-2026-000041', 2026, 2)).toBe('DON-2026-000044');
    expect(parseDonationReceiptCounter('garbage', 'DON-2026-')).toBe(0);
  });
});

describe('public reference', () => {
  it('is DN-YYMMDD-8 unambiguous chars and varies', () => {
    const a = generateDonationReference(D('2026-10-16'));
    expect(a).toMatch(/^DN-261016-[2-9A-HJKMNP-Z]{8}$/);
    const many = new Set(Array.from({ length: 200 }, () => generateDonationReference()));
    expect(many.size).toBe(200);
  });
});

describe('amounts', () => {
  it('validates positive amounts with at most 2 decimals', () => {
    expect(isValidDonationAmount(100)).toBe(true);
    expect(isValidDonationAmount(0.01)).toBe(true);
    expect(isValidDonationAmount(10.005)).toBe(false);
    expect(isValidDonationAmount(0)).toBe(false);
    expect(isValidDonationAmount(-5)).toBe(false);
    expect(isValidDonationAmount(20_000_000)).toBe(false);
  });

  it('spells amounts in English with lakh/crore', () => {
    expect(amountInWordsEn(0)).toBe('Zero Taka Only');
    expect(amountInWordsEn(5000)).toBe('Five Thousand Taka Only');
    expect(amountInWordsEn(125000.5)).toBe('One Lakh Twenty-Five Thousand Taka and Fifty Paisa Only');
    expect(amountInWordsEn(12_345_678.9)).toBe('One Crore Twenty-Three Lakh Forty-Five Thousand Six Hundred Seventy-Eight Taka and Ninety Paisa Only');
    expect(amountInWordsEn(101)).toBe('One Hundred One Taka Only');
  });

  it('spells amounts in Bangla', () => {
    expect(amountInWordsBn(5000)).toBe('পাঁচ হাজার টাকা মাত্র');
    expect(amountInWordsBn(125000.5)).toBe('এক লক্ষ পঁচিশ হাজার টাকা ও পঞ্চাশ পয়সা মাত্র');
    expect(amountInWordsBn(250)).toBe('দুই শত পঞ্চাশ টাকা মাত্র');
    expect(amountInWordsBn(99)).toBe('নিরানব্বই টাকা মাত্র');
    expect(amountInWordsBn(10_000_000)).toBe('এক কোটি টাকা মাত্র');
    expect(toBanglaDigits('DON-2026-000042')).toBe('DON-২০২৬-০০০০৪২');
  });
});

describe('recurring pledges', () => {
  it('clamps the day to 1–28', () => {
    expect(clampDayOfMonth(31)).toBe(28);
    expect(clampDayOfMonth(0)).toBe(1);
  });

  it('first due date is the next occurrence of the day (today counts)', () => {
    expect(firstDueDate(D('2026-10-05'), 10).toISOString().slice(0, 10)).toBe('2026-10-10');
    expect(firstDueDate(D('2026-10-10'), 10).toISOString().slice(0, 10)).toBe('2026-10-10');
    expect(firstDueDate(D('2026-10-16'), 10).toISOString().slice(0, 10)).toBe('2026-11-10');
    expect(firstDueDate(D('2026-12-20'), 5).toISOString().slice(0, 10)).toBe('2027-01-05');
  });

  it('a payment moves the due date exactly one month on', () => {
    expect(advanceDueDate(D('2026-12-28'), 28).toISOString().slice(0, 10)).toBe('2027-01-28');
    expect(nextDueAfterPayment({ nextDueDate: D('2026-01-28'), dayOfMonth: 28 }).toISOString().slice(0, 10)).toBe('2026-02-28');
  });

  it('classifies due state and "due this month"', () => {
    const now = D('2026-10-16');
    expect(pledgeDueState({ status: 'ACTIVE', nextDueDate: D('2026-10-05') }, now)).toBe('overdue');
    expect(pledgeDueState({ status: 'ACTIVE', nextDueDate: D('2026-10-16') }, now)).toBe('due');
    expect(pledgeDueState({ status: 'ACTIVE', nextDueDate: D('2026-10-28') }, now)).toBe('due');
    expect(pledgeDueState({ status: 'ACTIVE', nextDueDate: D('2026-11-05') }, now)).toBe('upcoming');
    expect(pledgeDueState({ status: 'PAUSED', nextDueDate: D('2026-10-05') }, now)).toBe('inactive');
    expect(isDueThisMonth({ status: 'ACTIVE', nextDueDate: D('2026-09-05') }, now)).toBe(true); // overdue counts
    expect(isDueThisMonth({ status: 'ACTIVE', nextDueDate: D('2026-11-01') }, now)).toBe(false);
    expect(isDueThisMonth({ status: 'CANCELLED', nextDueDate: D('2026-10-20') }, now)).toBe(false);
  });

  it('one reminder per pledge per calendar month', () => {
    expect(monthKey(D('2026-10-16'))).toBe('2026-10');
    expect(remindedThisMonth(D('2026-10-01'), D('2026-10-31'))).toBe(true);
    expect(remindedThisMonth(D('2026-09-30'), D('2026-10-01'))).toBe(false);
    expect(remindedThisMonth(null, D('2026-10-01'))).toBe(false);
  });
});

describe('fund balances (Zakat maths)', () => {
  const funds = [
    { id: 'z1', name: 'Zakat', type: 'ZAKAT', goalAmount: 50000 },
    { id: 'z2', name: 'Zakat (fitr)', type: 'ZAKAT', goalAmount: null },
    { id: 's1', name: 'Sadaqah', type: 'SADAQAH' },
  ];

  it('balance = collected − disbursed, exact to the paisa', () => {
    const b = computeFundBalances(funds, { z1: 10000.1, z2: 0.2, s1: 999.99 }, { z1: 3000.05, s1: '0.99' });
    expect(b.find((x) => x.fundId === 'z1')).toMatchObject({ collected: 10000.1, disbursed: 3000.05, balance: 7000.05, progress: 20 });
    expect(b.find((x) => x.fundId === 'z2')).toMatchObject({ collected: 0.2, disbursed: 0, balance: 0.2, progress: null });
    expect(b.find((x) => x.fundId === 's1')!.balance).toBe(999);
    // 0.1 + 0.2 style float drift must not appear in the type total.
    expect(sumBalancesByType(b, 'ZAKAT')).toEqual({ collected: 10000.3, disbursed: 3000.05, balance: 7000.25 });
    expect(sumBalancesByType(b, 'WAQF')).toEqual({ collected: 0, disbursed: 0, balance: 0 });
  });

  it('never pays out more than the balance', () => {
    expect(canDisburse(7000.05, 7000.05)).toBe(true);
    expect(canDisburse(7000.05, 7000.06)).toBe(false);
    expect(canDisburse(100, 0)).toBe(false);
  });

  it('progress is capped and needs a goal', () => {
    expect(progressPercent(150, 100)).toBe(100);
    expect(progressPercent(33, 100)).toBe(33);
    expect(progressPercent(10, null)).toBeNull();
    expect(progressPercent(10, 0)).toBeNull();
  });
});

describe('gateway verification (shared with fees/shop)', () => {
  const expected = { tranId: 'FEEABC', amount: 500, currency: 'BDT' };
  it('credits only an exact, verified match', () => {
    expect(decideVerification(expected, { reachable: true, success: true, tranId: 'FEEABC', amount: 500, currency: 'BDT', gatewayRef: 'V1', raw: {} }).action).toBe('credit');
    expect(decideVerification(expected, { reachable: true, success: true, tranId: 'FEEABC', amount: 50, currency: 'BDT', gatewayRef: 'V1', raw: {} }).action).toBe('fail');
    expect(decideVerification(expected, { reachable: true, success: true, tranId: 'OTHER', amount: 500, gatewayRef: 'V1', raw: {} }).action).toBe('ignore');
    expect(decideVerification(expected, { reachable: false, success: false, raw: {} }).action).toBe('ignore');
  });
});

describe('CSV', () => {
  it('quotes, keeps numbers and neutralises formulas', () => {
    const csv = toCsv(['a', 'b', 'c'], [['=SUM(A1)', 'x,"y"', -5]]);
    expect(csv).toBe(`a,b,c\r\n'=SUM(A1),"x,""y""",-5\r\n`);
  });
});
