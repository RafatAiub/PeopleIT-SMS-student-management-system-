/**
 * Pure-logic tests for the P1 platform billing UI (pages/billing/platform/platformBilling.logic.ts).
 *
 * Self-running — no test runner. Type-checked with the app (`npx tsc --noEmit -p .`). Run:
 *
 *   npx esbuild src/pages/billing/platform/__tests__/platform-billing-logic.test.ts --bundle --platform=node \
 *     --alias:@=./src --outfile=<tmp>/p1-tests.cjs && node <tmp>/p1-tests.cjs
 *
 * Exits non-zero on the first failure.
 */
import type { PlatformStatus } from '@/api/platformBilling.api';
import {
  bannerKind,
  computationText,
  currentPeriod,
  dayKey,
  isDismissedToday,
  isDismissible,
  lineTotals,
  periodLabel,
  previewMonthly,
  shouldShowDisabledScreen,
  sumTaka,
} from '../platformBilling.logic';

let passed = 0;
const failures: string[] = [];
function test(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
  } catch (e) {
    failures.push(`✗ ${name}\n    ${(e as Error).message}`);
  }
}
function eq(a: unknown, b: unknown) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

const base: PlatformStatus = {
  hasProfile: true,
  accessLevel: 'ACTIVE',
  reason: null,
  source: 'NONE',
  isAdmin: true,
  summary: { unpaidCount: 1, totalDue: 3000, overdueCount: 0, maxDaysOverdue: null, current: null },
};

test('banner: none without a profile, due/overdue for admins, restricted for everyone', () => {
  eq(bannerKind({ ...base, hasProfile: false }), 'none');
  eq(bannerKind(base), 'due');
  eq(bannerKind({ ...base, summary: { ...base.summary!, overdueCount: 1 } }), 'overdue');
  eq(bannerKind({ ...base, isAdmin: false, summary: null }), 'none');
  eq(bannerKind({ ...base, isAdmin: false, summary: null, accessLevel: 'RESTRICTED', reason: 'PLATFORM_BILLING' }), 'restricted');
  eq(bannerKind({ ...base, accessLevel: 'DISABLED' }), 'none');
  eq(bannerKind({ ...base, summary: { ...base.summary!, unpaidCount: 0 } }), 'none');
});

test('only the soft banner is dismissible, per day', () => {
  eq(isDismissible('due'), true);
  eq(isDismissible('overdue'), false);
  const d = new Date(2026, 10, 3, 10);
  eq(dayKey(d), '2026-11-03');
  eq(isDismissedToday('2026-11-03', d), true);
  eq(isDismissedToday('2026-11-02', d), false);
});

test('disabled screen applies to every school role except on billing paths', () => {
  eq(shouldShowDisabledScreen('DISABLED', 'TEACHER', '/students'), true);
  eq(shouldShowDisabledScreen('DISABLED', 'ADMIN', '/billing'), false);
  eq(shouldShowDisabledScreen('DISABLED', 'ADMIN', '/billing/demo-checkout'), false);
  eq(shouldShowDisabledScreen('DISABLED', 'GUARDIAN', '/account-disabled'), false);
  eq(shouldShowDisabledScreen('DISABLED', 'SUPER_ADMIN', '/students'), false);
  eq(shouldShowDisabledScreen('RESTRICTED', 'ADMIN', '/students'), false);
});

test('money helpers are paisa-safe', () => {
  eq(sumTaka([0.1, 0.2]), 0.3);
  eq(lineTotals([{ quantity: 120, unitPrice: 30 }, { quantity: 1, unitPrice: -100.5 }]), { subtotal: 3600, discount: 100.5, total: 3499.5 });
  eq(previewMonthly({ pricingModel: 'PER_STUDENT', flatAmount: null, perStudentRate: 30, minimumCharge: 500, discountType: null, discountValue: null }, 10), 500);
  eq(previewMonthly({ pricingModel: 'FLAT', flatAmount: 3000, perStudentRate: null, minimumCharge: 0, discountType: 'PERCENT', discountValue: 10 }, 0), 2700);
});

test('labels', () => {
  eq(periodLabel('2026-11'), 'November 2026');
  eq(currentPeriod(new Date('2026-10-31T19:00:00Z')), '2026-11');
  eq(computationText({ pricingModel: 'PER_STUDENT', studentCount: 120, rate: 30, total: 3600 }, (n) => `৳${n}`), '120 × ৳30');
});

if (failures.length) {
  console.error(failures.join('\n'));
  console.error(`\n${failures.length} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`✓ ${passed} platform billing UI logic tests passed`);
