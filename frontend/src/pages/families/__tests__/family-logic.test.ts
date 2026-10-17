/**
 * Pure-logic tests for the T3 family UI (pages/families/family.logic.ts).
 *
 * Self-running — no test runner. Type-checked with the app (`npx tsc --noEmit -p .`). Run:
 *
 *   npx esbuild src/pages/families/__tests__/family-logic.test.ts --bundle --platform=node \
 *     --outfile=<tmp>/family-tests.cjs && node <tmp>/family-tests.cjs
 *
 * Exits non-zero on the first failure.
 */
import { familyHeadline, paymentBanner, previewOldestFirst, siblingsOf, sumAmounts } from '../family.logic';

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
  const x = JSON.stringify(a);
  const y = JSON.stringify(b);
  if (x !== y) throw new Error(`expected ${y}, got ${x}`);
}

const lines = [
  { id: 'new', dueAmount: 300, dueDate: '2026-03-01' },
  { id: 'old', dueAmount: 100.5, dueDate: '2026-01-01' },
  { id: 'mid', dueAmount: 200, dueDate: '2026-02-01' },
];

test('previewOldestFirst matches the server split', () => {
  eq(previewOldestFirst(250.5, lines), { allocations: [{ invoiceId: 'old', amount: 100.5 }, { invoiceId: 'mid', amount: 150 }], leftover: 0 });
  eq(previewOldestFirst(700, lines).leftover, 99.5);
  eq(previewOldestFirst(0, lines).allocations, []);
});

test('sumAmounts avoids float drift', () => {
  eq(sumAmounts([0.1, 0.2]), 0.3);
  eq(sumAmounts([]), 0);
});

test('headline, siblings, payment banner', () => {
  eq(familyHeadline(1, 2), '1 child · 2 guardians');
  eq(familyHeadline(3, 1), '3 children · 1 guardian');
  eq(siblingsOf([{ id: 'a' }, { id: 'b' }, { id: 'c' }], 'b').map((x) => x.id), ['a', 'c']);
  eq(paymentBanner('?payment=success&ref=x'), 'success');
  eq(paymentBanner('?payment=evil'), null);
  eq(paymentBanner(''), null);
});

if (failures.length) {
  console.error(failures.join('\n'));
  console.error(`\n${failures.length} failed, ${passed} passed`);
  (globalThis as { process?: { exit(code: number): void } }).process?.exit(1);
} else {
  console.log(`family-logic: ${passed} tests passed`);
}
