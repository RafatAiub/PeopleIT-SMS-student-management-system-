// =============================================================================
// P4 dues — pure logic (no database). Cell classification, months, restriction
// evaluation, defaulter thresholds, reminder templates, CSV export escaping.
// =============================================================================
import {
  classifyCell, collectionRate, DEFAULT_RESTRICTION_SETTINGS, evaluateRestriction, featureBlocked, isDefaulter,
  monthKeyOf, monthRange, renderReminder, toPaisa, daysOverdue, type RestrictionSettings,
} from '../src/modules/fee-dues/dues.logic';
import { toCsv, type ReportDoc } from '../src/modules/fee-dues/export';
import { countSmsSegments } from '../src/modules/campaigns/smsSegments';

const cell = (o: Partial<Parameters<typeof classifyCell>[0]>) =>
  classifyCell({ billed: 0, paid: 0, due: 0, invoiceCount: 0, cancelledCount: 0, ...o });

describe('P4 classifyCell', () => {
  it('no invoice', () => expect(cell({})).toBe('NO_INVOICE'));
  it('paid in full', () => expect(cell({ billed: 100000, paid: 100000, due: 0, invoiceCount: 1 })).toBe('PAID'));
  it('partial', () => expect(cell({ billed: 100000, paid: 40000, due: 60000, invoiceCount: 1 })).toBe('PARTIAL'));
  it('unpaid', () => expect(cell({ billed: 100000, paid: 0, due: 100000, invoiceCount: 1 })).toBe('UNPAID'));
  it('all cancelled = waived', () => expect(cell({ invoiceCount: 2, cancelledCount: 2 })).toBe('WAIVED'));
  it('cancelled + live invoice uses the live one', () => expect(cell({ billed: 50000, due: 50000, invoiceCount: 2, cancelledCount: 1 })).toBe('UNPAID'));
});

describe('P4 months + money', () => {
  it('monthRange spans years and is inclusive', () => {
    expect(monthRange('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(monthRange('2026-03', '2026-02')).toEqual([]);
    expect(monthRange('bad', '2026-02')).toEqual([]);
    expect(monthRange('2020-01', '2030-01')).toHaveLength(36);
  });
  it('monthKeyOf uses Dhaka time (UTC+6)', () => {
    expect(monthKeyOf(new Date('2026-01-31T18:30:00Z'))).toBe('2026-02');
    expect(monthKeyOf(new Date('2026-01-31T17:30:00Z'))).toBe('2026-01');
  });
  it('toPaisa / collectionRate', () => {
    expect(toPaisa('1234.56')).toBe(123456);
    expect(toPaisa(null)).toBe(0);
    expect(collectionRate(400000, 140000)).toBe(35);
    expect(collectionRate(0, 0)).toBeNull();
  });
});

describe('P4 evaluateRestriction', () => {
  const now = new Date('2026-10-31T00:00:00Z');
  const on: RestrictionSettings = { ...DEFAULT_RESTRICTION_SETTINGS, restrictionsEnabled: true, minMonthsDue: 2 };
  const st = (o: Partial<Parameters<typeof evaluateRestriction>[1]> = {}) => ({
    monthsDue: 0, amountDue: 0, oldestDueDate: null, manualState: null, exempt: false, ...o,
  });

  it('months threshold', () => {
    expect(evaluateRestriction(on, st({ monthsDue: 2, amountDue: 100 }), now)).toMatchObject({ restricted: true, source: 'AUTO', reasons: ['MONTHS'] });
    expect(evaluateRestriction(on, st({ monthsDue: 1, amountDue: 100 }), now).restricted).toBe(false);
  });
  it('amount threshold (paisa) and overdue days', () => {
    const s = { ...on, minMonthsDue: null, minAmountDue: 150000, overdueDays: 30 };
    expect(evaluateRestriction(s, st({ amountDue: 150000 }), now).reasons).toEqual(['AMOUNT']);
    expect(evaluateRestriction(s, st({ amountDue: 100, oldestDueDate: new Date('2026-09-20T00:00:00Z') }), now).reasons).toEqual(['OVERDUE_DAYS']);
    expect(evaluateRestriction(s, st({ amountDue: 100, oldestDueDate: new Date('2026-10-01T00:00:00Z') }), now).restricted).toBe(false);
    expect(daysOverdue(new Date('2026-10-01T00:00:00Z'), now)).toBe(30);
  });
  it('disabled or no threshold never restricts automatically', () => {
    expect(evaluateRestriction({ ...on, restrictionsEnabled: false }, st({ monthsDue: 9, amountDue: 9 }), now).restricted).toBe(false);
    expect(evaluateRestriction({ ...on, minMonthsDue: null }, st({ monthsDue: 9, amountDue: 9 }), now).restricted).toBe(false);
  });
  it('exempt beats manual block; manual block works with rules off; manual unblock beats thresholds', () => {
    expect(evaluateRestriction(on, st({ monthsDue: 5, amountDue: 9, exempt: true, manualState: 'BLOCKED' }), now)).toMatchObject({ restricted: false, source: 'EXEMPT' });
    expect(evaluateRestriction(DEFAULT_RESTRICTION_SETTINGS, st({ manualState: 'BLOCKED' }), now)).toMatchObject({ restricted: true, source: 'MANUAL_BLOCK' });
    expect(evaluateRestriction(on, st({ monthsDue: 5, amountDue: 9, manualState: 'UNBLOCKED' }), now)).toMatchObject({ restricted: false, source: 'MANUAL_UNBLOCK' });
  });
  it('feature switches', () => {
    expect(featureBlocked(DEFAULT_RESTRICTION_SETTINGS, 'RESULTS')).toBe(true);
    expect(featureBlocked(DEFAULT_RESTRICTION_SETTINGS, 'PORTAL_LOGIN')).toBe(false);
  });
});

describe('P4 defaulter thresholds', () => {
  it('≥ X months OR ≥ ৳Y', () => {
    expect(isDefaulter({ monthsDue: 2, amountDue: 100 }, { minMonths: 2 })).toBe(true);
    expect(isDefaulter({ monthsDue: 1, amountDue: 100 }, { minMonths: 2 })).toBe(false);
    expect(isDefaulter({ monthsDue: 1, amountDue: 200000 }, { minMonths: 2, minAmount: 150000 })).toBe(true);
    expect(isDefaulter({ monthsDue: 1, amountDue: 1 }, {})).toBe(true);
    expect(isDefaulter({ monthsDue: 0, amountDue: 0 }, {})).toBe(false);
  });
});

describe('P4 reminder template', () => {
  it('fills placeholders, keeps unknown ones, stays GSM in English', () => {
    const text = renderReminder('{student} owes Tk {amount} for {months} months ({month_names}) - {school} {unknown}', {
      student: 'Ayesha Karim', months: 2, amount: 160000, school: 'Al-Huda Madrasah', monthNames: ['2026-02', '2026-03'],
    });
    expect(text).toBe('Ayesha Karim owes Tk 1,600 for 2 months (Feb 2026, Mar 2026) - Al-Huda Madrasah {unknown}');
    expect(countSmsSegments(text).encoding).toBe('GSM');
    expect(countSmsSegments(renderReminder('{student}-এর বকেয়া {amount} টাকা', { student: 'A', months: 1, amount: 100, school: 'S' })).encoding).toBe('UNICODE');
  });
});

describe('P4 CSV export', () => {
  it('BOM, headers, totals, formula injection guarded', () => {
    const doc: ReportDoc = {
      key: 'cash-book', title: 'T', filters: [{ label: 'From', value: '2026-01-01' }], generatedAt: '2026-10-31T00:00:00Z',
      tables: [{ title: 'Payments', columns: [{ key: 'a', label: 'Student' }, { key: 'b', label: 'Amount', type: 'money' }], rows: [{ a: '=HYPERLINK("x")', b: 10 }, { a: 'Rahim, Jr', b: -5 }], totals: { a: 'Total', b: 5 } }],
    };
    const csv = toCsv(doc).toString('utf8');
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('Student,Amount');
    expect(csv).toContain(`"'=HYPERLINK(""x"")",10.00`);
    expect(csv).toContain('"Rahim, Jr",-5.00');
    expect(csv).toContain('Total,5.00');
  });
});
