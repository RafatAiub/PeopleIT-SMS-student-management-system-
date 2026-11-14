// P1 platform billing — pure logic (no database, no network).
import {
  addMonths,
  computeInvoiceAmounts,
  computePlatformAccess,
  daysPastDue,
  dhakaDayKey,
  dhakaMidnight,
  dueDateFor,
  duePaisa,
  effectiveDueDate,
  formatTaka,
  invoiceNumberFor,
  monthsBetween,
  nextSequence,
  paisaToDecimalString,
  periodBounds,
  periodOf,
  receiptNumberFor,
  reminderKindFor,
  shouldLiftOverride,
  signPayToken,
  statusAfterPayment,
  toPaisa,
  totalsFromLines,
  verifyPayToken,
  type PricingProfile,
} from '../src/modules/platformBilling/platformBilling.logic';
import { renderSms } from '../src/modules/platformBilling/platformBilling.templates';
import { getAccessLevel, isRequestAllowedAt } from '../src/modules/billing/accessLevel';

const base: PricingProfile = {
  pricingModel: 'FLAT',
  flatAmount: '3000',
  perStudentRate: null,
  minimumCharge: '0',
  discountType: null,
  discountValue: null,
  billingStartMonth: '2026-01',
  serviceStartDate: null,
  firstMonthMode: 'FULL',
  freeMonths: 0,
};

describe('Asia/Dhaka calendar', () => {
  it('uses the Dhaka day, not UTC', () => {
    // 2026-10-31 19:00 UTC is already 1 November in Dhaka (UTC+6).
    const t = new Date('2026-10-31T19:00:00Z');
    expect(dhakaDayKey(t)).toBe('2026-11-01');
    expect(periodOf(t)).toBe('2026-11');
    expect(periodOf(new Date('2026-10-31T17:59:59Z'))).toBe('2026-10');
  });

  it('period maths', () => {
    expect(addMonths('2026-11', 2)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(monthsBetween('2026-10', '2027-02')).toBe(4);
    const { start, end } = periodBounds('2026-11');
    expect(start.toISOString()).toBe('2026-10-31T18:00:00.000Z');
    expect(end.toISOString()).toBe('2026-11-30T17:59:59.999Z');
  });

  it('due date is the start of the due day; days past due counts Dhaka days', () => {
    const due = dueDateFor('2026-11', 10);
    expect(due.toISOString()).toBe('2026-11-09T18:00:00.000Z');
    expect(daysPastDue(due, new Date('2026-11-09T17:00:00Z'))).toBe(-1); // 9 Nov 23:00 Dhaka
    expect(daysPastDue(due, new Date('2026-11-10T17:59:00Z'))).toBe(0); // 10 Nov 23:59 Dhaka
    expect(daysPastDue(due, new Date('2026-11-10T18:00:00Z'))).toBe(1); // 11 Nov 00:00 Dhaka
    expect(dueDateFor('2026-02', 31).toISOString()).toBe(dhakaMidnight(2026, 2, 28).toISOString()); // clamped to 28
  });

  it('a late or mid-month invoice gets 7 days to pay', () => {
    const early = new Date('2026-11-01T03:00:00Z');
    expect(effectiveDueDate('2026-11', 10, early).toISOString()).toBe(dueDateFor('2026-11', 10).toISOString());
    const late = new Date('2026-11-15T03:00:00Z'); // 15 Nov Dhaka
    expect(dhakaDayKey(effectiveDueDate('2026-11', 10, late))).toBe('2026-11-22');
  });
});

describe('invoice pricing', () => {
  it('flat price', () => {
    const r = computeInvoiceAmounts(base, '2026-11', 999);
    expect(r.totalPaisa).toBe(300000);
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0].code).toBe('BASE');
  });

  it('per student = rate × active students, never below the minimum', () => {
    const p: PricingProfile = { ...base, pricingModel: 'PER_STUDENT', perStudentRate: '30', minimumCharge: '500' };
    expect(computeInvoiceAmounts(p, '2026-11', 120).totalPaisa).toBe(360000);
    const small = computeInvoiceAmounts(p, '2026-11', 10); // 300 < 500
    expect(small.totalPaisa).toBe(50000);
    expect(small.lines.map((l) => l.code)).toEqual(['BASE', 'MINIMUM']);
    expect(small.subtotalPaisa).toBe(50000);
  });

  it('percent and fixed discounts, never negative', () => {
    expect(computeInvoiceAmounts({ ...base, discountType: 'PERCENT', discountValue: '10' }, '2026-11', 0).totalPaisa).toBe(270000);
    const fixed = computeInvoiceAmounts({ ...base, discountType: 'FIXED', discountValue: '5000', discountNote: 'launch' }, '2026-11', 0);
    expect(fixed.totalPaisa).toBe(0);
    expect(fixed.discountPaisa).toBe(300000);
    expect(fixed.lines[1].description).toContain('launch');
  });

  it('first month: prorate from the service start day, FREE, or FULL', () => {
    const pr = computeInvoiceAmounts(
      { ...base, billingStartMonth: '2026-11', firstMonthMode: 'PRORATE', serviceStartDate: new Date('2026-11-16T00:00:00Z') },
      '2026-11',
      0,
    );
    // 15 of 30 days billed
    expect(pr.totalPaisa).toBe(150000);
    expect(pr.lines.at(-1)?.code).toBe('PRORATION');
    // Second month is full again
    expect(
      computeInvoiceAmounts({ ...base, billingStartMonth: '2026-11', firstMonthMode: 'PRORATE', serviceStartDate: new Date('2026-11-16T00:00:00Z') }, '2026-12', 0)
        .totalPaisa,
    ).toBe(300000);
    const free = computeInvoiceAmounts({ ...base, billingStartMonth: '2026-11', firstMonthMode: 'FREE' }, '2026-11', 0);
    expect(free.free).toBe(true);
    expect(free.totalPaisa).toBe(0);
    expect(computeInvoiceAmounts({ ...base, billingStartMonth: '2026-11', firstMonthMode: 'FULL' }, '2026-11', 0).totalPaisa).toBe(300000);
  });

  it('free months count from the start month', () => {
    const p = { ...base, billingStartMonth: '2026-09', freeMonths: 2 };
    expect(computeInvoiceAmounts(p, '2026-09', 0).free).toBe(true);
    expect(computeInvoiceAmounts(p, '2026-10', 0).free).toBe(true);
    expect(computeInvoiceAmounts(p, '2026-11', 0).totalPaisa).toBe(300000);
    expect(() => computeInvoiceAmounts(p, '2026-08', 0)).toThrow(/before the billing start/);
  });

  it('owner-edited lines: negative lines are discounts', () => {
    expect(totalsFromLines([{ amount: 3000 }, { amount: -250.5 }])).toEqual({ subtotalPaisa: 300000, discountPaisa: 25050, totalPaisa: 274950 });
  });
});

describe('money', () => {
  it('paisa conversions avoid float drift', () => {
    expect(toPaisa('0.1') + toPaisa('0.2')).toBe(30);
    expect(paisaToDecimalString(123456)).toBe('1234.56');
    expect(paisaToDecimalString(-5)).toBe('-0.05');
    expect(formatTaka(300000)).toBe('3,000');
    expect(formatTaka(300050)).toBe('3,000.50');
  });

  it('due and status after payment', () => {
    const inv = { total: '3000', paidAmount: '1000', waivedAmount: '0', status: 'PARTIAL' };
    expect(duePaisa(inv)).toBe(200000);
    expect(duePaisa({ ...inv, status: 'WAIVED' })).toBe(0);
    const due = dueDateFor('2026-11', 10);
    expect(statusAfterPayment(300000, 300000, 0, due, new Date('2026-11-20T06:00:00Z'))).toBe('PAID');
    expect(statusAfterPayment(300000, 100000, 0, due, new Date('2026-11-05T06:00:00Z'))).toBe('PARTIAL');
    expect(statusAfterPayment(300000, 100000, 0, due, new Date('2026-11-20T06:00:00Z'))).toBe('OVERDUE');
  });

  it('invoice and receipt numbers', () => {
    expect(invoiceNumberFor('2026-11', 7)).toBe('PNB-202611-0007');
    expect(receiptNumberFor('2026-11', 12)).toBe('PNR-202611-0012');
    expect(nextSequence(null)).toBe(1);
    expect(nextSequence('PNB-202611-0041')).toBe(42);
  });
});

describe('access level', () => {
  const none = { billingActive: true, override: null, autoRestrictAfterDays: null, maxDaysOverdue: null };

  it('auto-restrict is off by default, even when overdue', () => {
    expect(computePlatformAccess({ ...none, maxDaysOverdue: 40 }).level).toBe('ACTIVE');
  });

  it('auto-restricts after N days overdue', () => {
    expect(computePlatformAccess({ ...none, autoRestrictAfterDays: 15, maxDaysOverdue: 14 }).level).toBe('ACTIVE');
    expect(computePlatformAccess({ ...none, autoRestrictAfterDays: 15, maxDaysOverdue: 15 })).toEqual({ level: 'RESTRICTED', source: 'AUTO' });
    expect(computePlatformAccess({ ...none, billingActive: false, autoRestrictAfterDays: 15, maxDaysOverdue: 30 }).level).toBe('ACTIVE');
  });

  it('the owner override always wins', () => {
    expect(computePlatformAccess({ ...none, override: 'DISABLED' })).toEqual({ level: 'DISABLED', source: 'OVERRIDE' });
    expect(computePlatformAccess({ ...none, override: 'ACTIVE', autoRestrictAfterDays: 1, maxDaysOverdue: 9 }).level).toBe('ACTIVE');
  });

  it('a manual restriction lifts after payment unless "keep" is set', () => {
    expect(shouldLiftOverride('RESTRICTED', false, 0)).toBe(true);
    expect(shouldLiftOverride('DISABLED', true, 0)).toBe(false);
    expect(shouldLiftOverride('RESTRICTED', false, 1)).toBe(false);
    expect(shouldLiftOverride('ACTIVE', false, 0)).toBe(false);
    expect(shouldLiftOverride(null, false, 0)).toBe(false);
  });

  it('precedence: switched-off school → DISABLED; profile → platform; else legacy', () => {
    const expired = { status: 'EXPIRED' as const, trialEndsAt: null, currentPeriodEnd: null, graceEndsAt: null };
    expect(getAccessLevel({ isActive: false }, null, new Date(), { hasProfile: true, level: 'ACTIVE' })).toBe('DISABLED');
    // A billing profile overrides a legacy EXPIRED subscription.
    expect(getAccessLevel({ isActive: true }, expired, new Date(), { hasProfile: true, level: 'ACTIVE' })).toBe('ACTIVE');
    expect(getAccessLevel({ isActive: true }, expired, new Date(), { hasProfile: false, level: 'ACTIVE' })).toBe('RESTRICTED');
    expect(getAccessLevel({ isActive: true }, null, new Date(), { hasProfile: true, level: 'RESTRICTED' })).toBe('RESTRICTED');
  });

  it('DISABLED allows only billing and auth; RESTRICTED allows reads', () => {
    expect(isRequestAllowedAt('DISABLED', 'GET', '/api/v1/students')).toBe(false);
    expect(isRequestAllowedAt('DISABLED', 'GET', '/api/v1/billing/platform/status')).toBe(true);
    expect(isRequestAllowedAt('DISABLED', 'POST', '/api/v1/billing/platform/checkout')).toBe(true);
    expect(isRequestAllowedAt('DISABLED', 'POST', '/api/v1/auth/logout')).toBe(true);
    expect(isRequestAllowedAt('RESTRICTED', 'GET', '/api/v1/students')).toBe(true);
    expect(isRequestAllowedAt('RESTRICTED', 'POST', '/api/v1/students')).toBe(false);
    expect(isRequestAllowedAt('ACTIVE', 'DELETE', '/api/v1/students/x')).toBe(true);
  });
});

describe('reminder cadence', () => {
  const due = dueDateFor('2026-11', 10);
  const at = (day: number) => new Date(Date.UTC(2026, 10, day, 3, 0, 0)); // 09:00 Dhaka
  it('daily before the due day, final on it, then day 1, 4, 7 … overdue', () => {
    expect(reminderKindFor(due, at(1))).toBe('UPCOMING');
    expect(reminderKindFor(due, at(9))).toBe('UPCOMING');
    expect(reminderKindFor(due, at(10))).toBe('FINAL');
    expect(reminderKindFor(due, at(11))).toBe('OVERDUE');
    expect(reminderKindFor(due, at(12))).toBeNull();
    expect(reminderKindFor(due, at(13))).toBeNull();
    expect(reminderKindFor(due, at(14))).toBe('OVERDUE');
    expect(reminderKindFor(due, at(17))).toBe('OVERDUE');
  });
});

describe('pay-link tokens', () => {
  const secret = 'test-secret-0123456789';
  const now = new Date('2026-11-01T00:00:00Z');
  const exp = new Date('2026-12-01T00:00:00Z');
  const token = signPayToken('inst_A', 'clinvoice0000000001', exp, secret);

  it('is short enough for an SMS', () => {
    expect(token.length).toBeLessThan(50);
  });
  it('verifies for the same school only', () => {
    expect(verifyPayToken(token, 'inst_A', secret, now)).toBe('clinvoice0000000001');
    expect(verifyPayToken(token, 'inst_B', secret, now)).toBeNull();
  });
  it('rejects tampering and expiry', () => {
    expect(verifyPayToken(token.replace('clinvoice0000000001', 'clinvoice0000000002'), 'inst_A', secret, now)).toBeNull();
    expect(verifyPayToken(token, 'inst_A', 'other-secret-0123456789', now)).toBeNull();
    expect(verifyPayToken(token, 'inst_A', secret, new Date('2026-12-02T00:00:00Z'))).toBeNull();
    expect(verifyPayToken('garbage', 'inst_A', secret, now)).toBeNull();
  });
});

describe('templates', () => {
  const v = {
    school: 'Al-Huda Madrasah',
    invoiceNo: 'PNB-202611-0001',
    period: 'November 2026',
    periodBn: 'নভেম্বর ২০২৬',
    amount: '3,000',
    dueDate: '10 November 2026',
    dueDateBn: '১০ নভেম্বর ২০২৬',
    daysOverdue: 4,
    payLink: 'https://app.example/billing/pay/x',
  };
  it('renders Bangla and English SMS with amount, due date and link', () => {
    const bn = renderSms('UPCOMING', 'bn', v);
    expect(bn).toContain('৳৩,০০০');
    expect(bn).toContain(v.payLink);
    const en = renderSms('OVERDUE', 'en', v);
    expect(en).toContain('Tk 3,000');
    expect(en).toContain('4 day');
    expect(en).toContain(v.payLink);
  });
});
