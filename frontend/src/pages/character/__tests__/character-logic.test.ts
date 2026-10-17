/**
 * Pure-logic tests for the T2 character score grid (pages/character/character.logic.ts).
 *
 * Self-running — no test runner. Type-checked with the app (`npx tsc --noEmit -p .`). Run:
 *
 *   npx esbuild src/pages/character/__tests__/character-logic.test.ts --bundle --platform=node \
 *     --outfile=<tmp>/character-tests.cjs && node <tmp>/character-tests.cjs
 *
 * Exits non-zero on the first failure.
 */
import { bandFor, bulkFill, diffComments, diffScores, moveCell, overallPercent, parseCell, quickPeriod } from '../character.logic';

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

const traits = [
  { id: 'a', scaleMin: 1, scaleMax: 5, weight: 1 },
  { id: 'b', scaleMin: 1, scaleMax: 10, weight: 1 },
];

test('parseCell: empty clears, out-of-scale is invalid', () => {
  eq(parseCell('', traits[0]), null);
  eq(parseCell(' 4 ', traits[0]), 4);
  eq(parseCell('6', traits[0]), 'invalid');
  eq(parseCell('x', traits[0]), 'invalid');
  eq(parseCell('10', traits[1]), 10);
});

test('overallPercent matches the server formula', () => {
  eq(overallPercent({ a: 5, b: 10 }, traits), 100);
  eq(overallPercent({ a: 1 }, traits), 0);
  eq(overallPercent({ a: 3, b: null }, traits), 50);
  eq(overallPercent({}, traits), null);
});

test('moveCell: arrows and Enter stay inside the grid', () => {
  eq(moveCell({ row: 0, col: 0 }, 'ArrowDown', 3, 2), { row: 1, col: 0 });
  eq(moveCell({ row: 2, col: 0 }, 'Enter', 3, 2), null);
  eq(moveCell({ row: 1, col: 1 }, 'ArrowRight', 3, 2), null);
  eq(moveCell({ row: 1, col: 1 }, 'ArrowLeft', 3, 2), { row: 1, col: 0 });
  eq(moveCell({ row: 1, col: 1 }, 'x', 3, 2), null);
});

test('bulkFill: "all 4", only empty, skips traits whose scale cannot hold it', () => {
  const cur = { s1: { a: 2 } };
  eq(bulkFill(cur, ['s1', 's2'], traits, 4), { s1: { a: 4, b: 4 }, s2: { a: 4, b: 4 } });
  eq(bulkFill(cur, ['s1'], traits, 4, { onlyEmpty: true }), { s1: { a: 2, b: 4 } });
  eq(bulkFill({}, ['s1'], traits, 8), { s1: { b: 8 } });
});

test('diffScores sends only changed cells, including clears', () => {
  const orig = { s1: { a: 3, b: 5 } };
  eq(diffScores(orig, { s1: { a: 3, b: 6 } }), [{ studentId: 's1', traitId: 'b', score: 6 }]);
  eq(diffScores(orig, { s1: { a: null, b: 5 } }), [{ studentId: 's1', traitId: 'a', score: null }]);
  eq(diffScores({}, { s2: { a: null } }), []);
});

test('diffComments trims and clears', () => {
  eq(diffComments({ s1: 'Good' }, { s1: ' Good ', s2: '' }), []);
  eq(diffComments({ s1: 'Good' }, { s1: '' }), [{ studentId: 's1', comment: null }]);
  eq(diffComments({}, { s3: 'Kind' }), [{ studentId: 's3', comment: 'Kind' }]);
});

test('bands and quick periods', () => {
  eq(bandFor(92)?.bn, 'চমৎকার');
  eq(bandFor(null), null);
  const w = quickPeriod('WEEKLY', new Date(2026, 9, 14)); // Wed 14 Oct 2026
  eq([w.startDate, w.endDate], ['2026-10-10', '2026-10-16']);
  eq(quickPeriod('MONTHLY', new Date(2026, 1, 3)).endDate, '2026-02-28');
});

if (failures.length) {
  console.error(failures.join('\n'));
  console.error(`\n${failures.length} failed, ${passed} passed`);
  (globalThis as { process?: { exit(code: number): void } }).process?.exit(1);
} else {
  console.log(`character-logic: ${passed} tests passed`);
}
