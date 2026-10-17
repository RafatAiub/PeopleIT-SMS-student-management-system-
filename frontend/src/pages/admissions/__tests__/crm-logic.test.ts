/**
 * Pure-logic tests for the T4 CRM UI (pages/admissions/crm.logic.ts).
 *
 * Self-running — no test runner. Type-checked with the app (`npx tsc --noEmit -p .`). Run:
 *
 *   npx esbuild src/pages/admissions/__tests__/crm-logic.test.ts --bundle --platform=node \
 *     --outfile=<tmp>/crm-tests.cjs && node <tmp>/crm-tests.cjs
 *
 * Exits non-zero on the first failure.
 */
import { barWidth, dueStateOf, moveCardToStage, moveItem, removedWithEnquiries, stageLabel, stageSetProblem, type BoardColumnData, type StageDraft } from '../crm.logic';
import type { Enquiry, StageRef } from '../enquiries.types';

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

const stage = (id: string, extra: Partial<StageRef> = {}): StageRef => ({ id, name: id, nameBn: null, color: '#000000', order: 1, isWon: false, isLost: false, ...extra });
const card = (id: string, stageId: string) => ({ id, studentName: id, stageId } as unknown as Enquiry);

test('moveCardToStage moves a card to the top of the target and fixes totals', () => {
  const cols: BoardColumnData[] = [
    { stage: stage('a'), total: 2, items: [card('1', 'a'), card('2', 'a')] },
    { stage: stage('b'), total: 1, items: [card('3', 'b')] },
  ];
  const next = moveCardToStage(cols, '2', 'b');
  eq(next.map((c) => [c.stage.id, c.total, c.items.map((i) => i.id)]), [
    ['a', 1, ['1']],
    ['b', 2, ['2', '3']],
  ]);
  eq(next[1].items[0].stageId, 'b');
  // Same column / unknown card / unknown target: unchanged.
  eq(moveCardToStage(cols, '1', 'a'), cols);
  eq(moveCardToStage(cols, 'x', 'b'), cols);
  eq(moveCardToStage(cols, '1', 'zz'), cols);
});

test('stageLabel prefers Bangla when set', () => {
  eq(stageLabel({ name: 'Lost', nameBn: 'হারানো' }, 'bn'), 'হারানো');
  eq(stageLabel({ name: 'Lost', nameBn: null }, 'bn'), 'Lost');
  eq(stageLabel({ name: 'Lost', nameBn: 'হারানো' }, 'en'), 'Lost');
  eq(stageLabel(null, 'en'), '—');
});

test('dueStateOf uses the local day', () => {
  const now = new Date(2026, 9, 17, 12, 0);
  eq(dueStateOf(new Date(2026, 9, 16, 23, 59).toISOString(), now), 'overdue');
  eq(dueStateOf(new Date(2026, 9, 17, 0, 0).toISOString(), now), 'today');
  eq(dueStateOf(new Date(2026, 9, 18, 0, 0).toISOString(), now), 'upcoming');
  eq(dueStateOf(null, now), 'none');
  eq(dueStateOf('garbage', now), 'none');
});

test('stage editor rules and removed stages with enquiries', () => {
  const d = (key: string, extra: Partial<StageDraft> = {}): StageDraft => ({ id: key, key, name: key, nameBn: '', color: '#000000', isWon: false, isLost: false, enquiryCount: 0, ...extra });
  const ok = [d('New'), d('Won', { isWon: true }), d('Lost', { isLost: true })];
  eq(stageSetProblem(ok), null);
  eq(stageSetProblem(ok.slice(0, 2)), 'Keep at least three stages');
  eq(stageSetProblem([d('New'), d('new', { isWon: true }), d('Lost', { isLost: true })]), 'Stage names must be unique');
  eq(stageSetProblem([d('New'), d('Other'), d('Lost', { isLost: true })]), 'Keep at least one "won" (admitted) stage');
  const original = [d('A', { enquiryCount: 3 }), d('B'), d('C', { enquiryCount: 1 })];
  eq(removedWithEnquiries(original, [original[1], original[2]]).map((s) => s.id), ['A']);
  eq(moveItem([1, 2, 3], 0, 2), [2, 3, 1]);
  eq(moveItem([1, 2, 3], 0, 5), [1, 2, 3]);
});

test('barWidth keeps small non-zero bars visible', () => {
  eq(barWidth(0, 10), 0);
  eq(barWidth(1, 1000), 2);
  eq(barWidth(5, 10), 50);
  eq(barWidth(3, 0), 0);
});

if (failures.length) {
  console.error(failures.join('\n'));
  console.error(`\n${failures.length} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`✓ crm-logic: ${passed} passed`);
