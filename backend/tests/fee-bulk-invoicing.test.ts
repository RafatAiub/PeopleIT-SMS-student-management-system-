// DB-free unit tests for bulk invoicing idempotency planning (Wave C).
import {
  bulkIdempotencyKey,
  bulkItemDescription,
  bulkPeriodTag,
  chunk,
  existingKeysFromLines,
  lineMatchesPeriod,
  normalizePeriod,
  planBulkInvoices,
  type BulkItemInput,
} from '../src/modules/fees/bulk/bulk.keys';

const items: BulkItemInput[] = [
  { feeCategoryId: 'tuition', categoryName: 'Tuition Fee', amount: 1500 },
  { feeCategoryId: 'transport', categoryName: 'Transport Fee', amount: 800, description: 'Bus' },
];

describe('period tags and keys', () => {
  it('normalises whitespace in the period', () => {
    expect(normalizePeriod('  Oct   2026 ')).toBe('Oct 2026');
    expect(bulkPeriodTag(' 2026-10 ')).toBe('[2026-10]');
  });

  it('builds line descriptions from the category name or custom description', () => {
    expect(bulkItemDescription(items[0], '2026-10')).toBe('Tuition Fee [2026-10]');
    expect(bulkItemDescription(items[1], '2026-10')).toBe('Bus [2026-10]');
  });

  it('keys are case/whitespace-insensitive on the period', () => {
    expect(bulkIdempotencyKey('s1', 'tuition', 'Oct 2026')).toBe(bulkIdempotencyKey('s1', 'tuition', ' oct  2026'));
    expect(bulkIdempotencyKey('s1', 'tuition', '2026-10')).not.toBe(bulkIdempotencyKey('s1', 'tuition', '2026-11'));
    expect(bulkIdempotencyKey('s1', 'tuition', '2026-10')).not.toBe(bulkIdempotencyKey('s2', 'tuition', '2026-10'));
  });
});

describe('lineMatchesPeriod', () => {
  it('matches the trailing tag, including after a concession suffix', () => {
    expect(lineMatchesPeriod('Tuition Fee [2026-10]', '2026-10')).toBe(true);
    expect(lineMatchesPeriod('Tuition Fee [2026-10] (Concession: Sibling)', '2026-10')).toBe(true);
  });
  it('does not match other periods or free text', () => {
    expect(lineMatchesPeriod('Tuition Fee [2026-11]', '2026-10')).toBe(false);
    expect(lineMatchesPeriod('Tuition Fee 2026-10', '2026-10')).toBe(false);
    expect(lineMatchesPeriod('Tuition [2026-10] extra words', '2026-10')).toBe(false);
  });
});

describe('planBulkInvoices', () => {
  it('creates one invoice per student with all items when nothing exists', () => {
    const plan = planBulkInvoices(['s1', 's2'], items, new Set(), '2026-10');
    expect(plan.toCreate).toHaveLength(2);
    expect(plan.toCreate[0].items.map((i) => i.feeCategoryId)).toEqual(['tuition', 'transport']);
    expect(plan.skippedStudentIds).toEqual([]);
    expect(plan.skippedItemCount).toBe(0);
  });

  it('is idempotent: re-running with the created lines as existing skips everyone', () => {
    const first = planBulkInvoices(['s1', 's2'], items, new Set(), '2026-10');
    const existingLines = first.toCreate.flatMap((inv) =>
      inv.items.map((i) => ({ studentId: inv.studentId, feeCategoryId: i.feeCategoryId, description: i.description })),
    );
    const second = planBulkInvoices(['s1', 's2'], items, existingKeysFromLines(existingLines, '2026-10'), '2026-10');
    expect(second.toCreate).toEqual([]);
    expect(second.skippedStudentIds).toEqual(['s1', 's2']);
    expect(second.skippedItemCount).toBe(4);
  });

  it('only skips the categories already billed for that student', () => {
    const existing = new Set([bulkIdempotencyKey('s1', 'tuition', '2026-10')]);
    const plan = planBulkInvoices(['s1', 's2'], items, existing, '2026-10');
    expect(plan.toCreate.find((p) => p.studentId === 's1')!.items.map((i) => i.feeCategoryId)).toEqual(['transport']);
    expect(plan.toCreate.find((p) => p.studentId === 's2')!.items).toHaveLength(2);
    expect(plan.skippedItemCount).toBe(1);
  });

  it('a different period is not considered billed', () => {
    const existing = existingKeysFromLines([{ studentId: 's1', feeCategoryId: 'tuition', description: 'Tuition Fee [2026-09]' }], '2026-10');
    expect(existing.size).toBe(0);
  });

  it('de-duplicates students and repeated categories in the request', () => {
    const plan = planBulkInvoices(['s1', 's1'], [...items, { ...items[0], amount: 99 }], new Set(), '2026-10');
    expect(plan.toCreate).toHaveLength(1);
    expect(plan.toCreate[0].items).toHaveLength(2);
    expect(plan.toCreate[0].items[0].amount).toBe(1500);
  });
});

describe('chunk', () => {
  it('splits arrays into fixed-size chunks', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 50)).toEqual([]);
  });
});
