/**
 * Pure-logic tests for the T5 Trash UI (pages/settings/trash/trash.logic.ts)
 * and the Undo toast's entry-id lookup.
 *
 * Self-running — no test runner. Type-checked with the app (`npx tsc --noEmit -p .`). Run:
 *
 *   npx esbuild src/pages/settings/trash/__tests__/trash-logic.test.ts --bundle --platform=node \
 *     --outfile=<tmp>/trash-tests.cjs && node <tmp>/trash-tests.cjs
 *
 * Exits non-zero on the first failure.
 */
import { daysLeftTone, summarizeBulk, typesWithItems, TRASH_TYPES, TYPE_LABELS } from '../trash.logic';
import { trashEntryIdOf } from '../../../../components/common/undoToast.logic';

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

test('days-left tone: kept items are info, last 3 days red, last week amber', () => {
  eq(daysLeftTone(30), 'neutral');
  eq(daysLeftTone(7), 'warning');
  eq(daysLeftTone(3), 'danger');
  eq(daysLeftTone(0), 'danger');
  eq(daysLeftTone(0, 'Has fee records'), 'info');
});

test('type filter lists only non-empty types, in fixed order', () => {
  eq(typesWithItems({ NOTICE: 2, STUDENT: 1, INVOICE: 0 }), ['STUDENT', 'NOTICE']);
  eq(TRASH_TYPES.every((t) => !!TYPE_LABELS[t]), true);
});

test('bulk summary counts and de-duplicates reasons', () => {
  eq(
    summarizeBulk([
      { id: '1', ok: true },
      { id: '2', ok: false, error: 'conflict A' },
      { id: '3', ok: false, error: 'conflict A' },
      { id: '4', ok: false, error: 'conflict B' },
    ]),
    { done: 1, failed: 3, reasons: ['conflict A', 'conflict B'] },
  );
});

test('undo toast finds the trash entry in any response shape', () => {
  eq(trashEntryIdOf({ data: { success: true, data: { trash: { trashEntryId: 'e1' } } } }), 'e1'); // axios response
  eq(trashEntryIdOf({ success: true, data: { trash: { trashEntryId: 'e2' } } }), 'e2'); // envelope
  eq(trashEntryIdOf({ id: 'x', trash: { trashEntryId: 'e3' } }), 'e3'); // unwrapped data
  eq(trashEntryIdOf({ success: true, data: null }), null);
  eq(trashEntryIdOf(undefined), null);
});

if (failures.length) {
  console.error(failures.join('\n'));
  console.error(`\n${failures.length} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`✓ trash-logic: ${passed} passed`);
