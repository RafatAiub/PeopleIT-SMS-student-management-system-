/**
 * Pure-logic tests for the P4 dues UI (pages/fees/dues/dues.logic.ts).
 *
 * Self-running — no test runner. Type-checked with the app (`npx tsc --noEmit -p .`). Run:
 *
 *   npx esbuild src/pages/fees/dues/__tests__/dues-logic.test.ts --bundle --platform=node \
 *     --outfile=<tmp>/dues-tests.cjs && node <tmp>/dues-tests.cjs
 *
 * Exits non-zero on the first failure.
 */
import {
  CELL_STYLE, REPORT_DEFS, currentMonth, defaultRange, fileNameFrom, monthRange, rateText, sampleRender, shortMonth, unknownPlaceholders, yearRange,
} from '../dues.logic';

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

test('monthRange is inclusive and crosses years', () => {
  eq(monthRange('2025-12', '2026-02'), ['2025-12', '2026-01', '2026-02']);
  eq(monthRange('2026-05', '2026-04'), []);
  eq(monthRange('x', '2026-04'), []);
});
test('yearRange / currentMonth (Dhaka)', () => {
  eq(yearRange(2026), { from: '2026-01', to: '2026-12' });
  eq(currentMonth('Asia/Dhaka', new Date('2026-01-31T18:30:00Z')), '2026-02');
});
test('shortMonth in both languages', () => {
  eq(shortMonth('2026-03'), 'Mar');
  eq(shortMonth('2026-03', 'bn'), 'মার্চ');
});
test('every cell status has a distinct symbol (not colour alone) and no white text', () => {
  const symbols = Object.values(CELL_STYLE).map((s) => s.symbol);
  eq(new Set(symbols).size, symbols.length);
  for (const s of Object.values(CELL_STYLE)) if (/text-white/.test(s.cls)) throw new Error(`white text in ${s.cls}`);
});
test('placeholders: unknown detected, sample render fills known', () => {
  eq(unknownPlaceholders('{student} owes {amout} - {school} {amout}'), ['{amout}']);
  eq(sampleRender('{student}: {amount} ({months})', 'X'), 'Ayesha Karim: 1,600 (2)');
});
test('rateText / fileNameFrom', () => {
  eq(rateText(null), '—');
  eq(rateText(35.5), '35.5%');
  eq(fileNameFrom('attachment; filename="cash-book-2026-10-31.xlsx"', 'x'), 'cash-book-2026-10-31.xlsx');
  eq(fileNameFrom(undefined, 'x.pdf'), 'x.pdf');
});
test('report defs + default ranges', () => {
  eq(REPORT_DEFS.length, 7);
  eq(defaultRange('dates', '2026-10-31'), { from: '2026-10-01', to: '2026-10-31' });
  eq(defaultRange('months', '2026-10-31'), { from: '2026-01', to: '2026-12' });
  eq(REPORT_DEFS.find((d) => d.key === 'student-statement')?.filters, ['student']);
});

if (failures.length) {
  console.error(failures.join('\n'));
  console.error(`\n${failures.length} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`✓ ${passed} P4 dues logic tests passed`);
