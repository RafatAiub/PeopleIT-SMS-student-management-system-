// =============================================================================
// Pure bulk-invoicing planning logic (no I/O) — unit tested in
// backend/tests/fee-bulk-invoicing.test.ts.
//
// The Invoice model has no `period` column, so the billing period is carried
// as a trailing tag on the invoice LINE description: "Tuition Fee [2026-10]".
// A student counts as already billed for (period, category) when any of
// their non-cancelled invoices has a line with that fee category whose
// description ends with the period tag. That makes re-running the same bulk
// generation a no-op for students/categories already billed.
// =============================================================================

export interface BulkItemInput {
  feeCategoryId: string;
  categoryName: string;
  amount: number;
  description?: string;
}

export interface PlannedLine {
  feeCategoryId: string;
  description: string;
  amount: number;
  discount: number;
}

export interface BulkPlan {
  toCreate: { studentId: string; items: PlannedLine[] }[];
  /** Students for whom every requested item already exists for this period. */
  skippedStudentIds: string[];
  /** Individual (student, category) pairs skipped as already billed. */
  skippedItemCount: number;
}

/** Normalises a user-entered period label ("  Oct 2026 " → "Oct 2026"). */
export function normalizePeriod(period: string): string {
  return period.trim().replace(/\s+/g, ' ');
}

export function bulkPeriodTag(period: string): string {
  return `[${normalizePeriod(period)}]`;
}

export function bulkItemDescription(item: Pick<BulkItemInput, 'categoryName' | 'description'>, period: string): string {
  const base = (item.description ?? '').trim() || item.categoryName;
  return `${base} ${bulkPeriodTag(period)}`;
}

/** The idempotency key for one (student, fee category, period) charge. */
export function bulkIdempotencyKey(studentId: string, feeCategoryId: string, period: string): string {
  return `${studentId}|${feeCategoryId}|${normalizePeriod(period).toLowerCase()}`;
}

/**
 * Does an existing invoice line represent this period's charge? The
 * description may have been suffixed with " (Concession: …)", so we look for
 * the tag followed by either end-of-string or that suffix.
 */
export function lineMatchesPeriod(description: string, period: string): boolean {
  const tag = bulkPeriodTag(period).toLowerCase();
  const d = description.toLowerCase();
  const idx = d.lastIndexOf(tag);
  if (idx < 0) return false;
  const rest = d.slice(idx + tag.length).trim();
  return rest === '' || rest.startsWith('(concession:');
}

/** Builds the set of already-billed keys from existing invoice lines. */
export function existingKeysFromLines(
  lines: { studentId: string; feeCategoryId: string; description: string }[],
  period: string,
): Set<string> {
  const keys = new Set<string>();
  for (const l of lines) {
    if (lineMatchesPeriod(l.description, period)) keys.add(bulkIdempotencyKey(l.studentId, l.feeCategoryId, period));
  }
  return keys;
}

export function planBulkInvoices(
  studentIds: string[],
  items: BulkItemInput[],
  existingKeys: Set<string>,
  period: string,
): BulkPlan {
  const toCreate: BulkPlan['toCreate'] = [];
  const skippedStudentIds: string[] = [];
  let skippedItemCount = 0;

  // De-duplicate categories in the request itself (first wins).
  const seen = new Set<string>();
  const uniqueItems = items.filter((i) => (seen.has(i.feeCategoryId) ? false : (seen.add(i.feeCategoryId), true)));

  for (const studentId of [...new Set(studentIds)]) {
    const lines: PlannedLine[] = [];
    for (const item of uniqueItems) {
      if (existingKeys.has(bulkIdempotencyKey(studentId, item.feeCategoryId, period))) {
        skippedItemCount++;
        continue;
      }
      lines.push({
        feeCategoryId: item.feeCategoryId,
        description: bulkItemDescription(item, period),
        amount: Math.round(item.amount * 100) / 100,
        discount: 0,
      });
    }
    if (lines.length === 0) skippedStudentIds.push(studentId);
    else toCreate.push({ studentId, items: lines });
  }

  return { toCreate, skippedStudentIds, skippedItemCount };
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
