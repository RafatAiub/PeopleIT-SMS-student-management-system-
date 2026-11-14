/**
 * Pure-logic tests for the P2 student-fees UI (pages/fees/studentFees/studentFees.logic.ts).
 *
 * Self-running — no test runner. Type-checked with the app (`npx tsc --noEmit -p .`). Run:
 *
 *   npx esbuild src/pages/fees/studentFees/__tests__/studentFees-logic.test.ts --bundle --platform=node \
 *     --outfile=<tmp>/p2-fees-tests.cjs && node <tmp>/p2-fees-tests.cjs
 *
 * Exits non-zero on the first failure.
 */
import {
  addMonths,
  currentPeriod,
  invoiceActions,
  monthLabel,
  parseAmount,
  periodOptions,
  previewAllocation,
  referenceRequired,
  selectedDue,
  yearlySpreadPreview,
} from '../studentFees.logic';

let passed = 0;
const failures: string[] = [];
function test(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
  } catch (e) {
    failures.push(`${name}: ${(e as Error).message}`);
  }
}
function eq(a: unknown, b: unknown) {
  const sa = JSON.stringify(a);
  const sb = JSON.stringify(b);
  if (sa !== sb) throw new Error(`expected ${sb}, got ${sa}`);
}

test('currentPeriod uses Dhaka time', () => {
  eq(currentPeriod(new Date('2026-10-31T19:00:00Z')), '2026-11');
  eq(currentPeriod(new Date('2026-10-31T17:59:00Z')), '2026-10');
});
test('addMonths crosses years', () => {
  eq(addMonths('2026-12', 1), '2027-01');
  eq(addMonths('2026-01', -1), '2025-12');
});
test('month labels en + bn', () => {
  eq(monthLabel('2026-10'), 'October 2026');
  eq(monthLabel('2026-10', 'bn'), 'অক্টোবর ২০২৬');
  eq(monthLabel('bad'), '');
});
test('periodOptions spans back..ahead', () => {
  const o = periodOptions(new Date('2026-10-15T06:00:00Z'), 2, 1);
  eq(o.map((x) => x.value), ['2026-08', '2026-09', '2026-10', '2026-11']);
});
test('yearly spread preview matches the server rule', () => {
  eq(yearlySpreadPreview(10000), { monthly: 833, last: 837 });
  eq(yearlySpreadPreview(6000), { monthly: 500, last: 500 });
});
test('allocation preview: oldest month first, discounts reduce due, over-amount → null', () => {
  const rows = [
    { id: 'n', dueAmount: 1000, dueDate: '2026-11-10', status: 'UNPAID', period: '2026-11' },
    { id: 's', dueAmount: 1000, dueDate: '2026-09-10', status: 'OVERDUE', period: '2026-09' },
    { id: 'x', dueAmount: 500, dueDate: '2026-08-10', status: 'CANCELLED', period: '2026-08' },
  ];
  eq(previewAllocation(1500, rows), [{ invoiceId: 's', amount: 1000 }, { invoiceId: 'n', amount: 500 }]);
  eq(previewAllocation(1500, rows, { s: 200 }), [{ invoiceId: 's', amount: 800 }, { invoiceId: 'n', amount: 700 }]);
  eq(previewAllocation(2001, rows), null);
  eq(previewAllocation(0, rows), null);
});
test('selectedDue sums selected payable rows after discounts', () => {
  const rows = [
    { id: 'a', dueAmount: 300.5, dueDate: '2026-09-10', status: 'UNPAID' },
    { id: 'b', dueAmount: 200, dueDate: '2026-10-10', status: 'PAID' },
  ];
  eq(selectedDue(rows, new Set(['a', 'b']), { a: 0.5 }), 300);
});
test('parseAmount accepts commas, ৳ and Bangla digits', () => {
  eq(parseAmount('1,200.50'), 1200.5);
  eq(parseAmount('৳ ১২০০'), 1200);
  eq(Number.isNaN(parseAmount('12a')), true);
  eq(Number.isNaN(parseAmount('1.234')), true);
});
test('reference required for cheque/bank only', () => {
  eq([referenceRequired('CHEQUE'), referenceRequired('BANK'), referenceRequired('CASH')], [true, true, false]);
});
test('invoice actions follow role + state', () => {
  eq(invoiceActions('ACCOUNTANT', { status: 'UNPAID', paidAmount: 0 }), { cancel: true, reverse: false, refund: true, waive: false });
  eq(invoiceActions('ADMIN', { status: 'PARTIAL', paidAmount: '100' }).cancel, false);
  eq(invoiceActions('GUARDIAN', { status: 'UNPAID', paidAmount: 0 }), { cancel: false, reverse: false, refund: false, waive: false });
});

if (failures.length) {
  console.error(`FAILED ${failures.length}:\n${failures.join('\n')}`);
  process.exit(1);
}
console.log(`studentFees-logic: ${passed} passed`);
