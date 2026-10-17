// =============================================================================
// T5 Trash — pure UI helpers (tested in __tests__/trash-logic.test.ts).
// =============================================================================

export type TrashType =
  | 'STUDENT'
  | 'GUARDIAN'
  | 'USER'
  | 'INVOICE'
  | 'NOTICE'
  | 'EVENT'
  | 'ENQUIRY'
  | 'SITE_PAGE'
  | 'SITE_POST'
  | 'DONATION_FUND'
  | 'DONATION_CAMPAIGN'
  | 'FAMILY';

export const TRASH_TYPES: TrashType[] = ['STUDENT', 'GUARDIAN', 'USER', 'INVOICE', 'NOTICE', 'EVENT', 'ENQUIRY', 'SITE_PAGE', 'SITE_POST', 'DONATION_FUND', 'DONATION_CAMPAIGN', 'FAMILY'];

export const TYPE_LABELS: Record<TrashType, string> = {
  STUDENT: 'Students',
  GUARDIAN: 'Guardians',
  USER: 'Users',
  INVOICE: 'Invoices',
  NOTICE: 'Notices',
  EVENT: 'Events',
  ENQUIRY: 'Enquiries',
  SITE_PAGE: 'Website pages',
  SITE_POST: 'Website posts',
  DONATION_FUND: 'Donation funds',
  DONATION_CAMPAIGN: 'Donation campaigns',
  FAMILY: 'Families',
};

export const TYPE_SINGULAR: Record<TrashType, string> = {
  STUDENT: 'Student',
  GUARDIAN: 'Guardian',
  USER: 'User',
  INVOICE: 'Invoice',
  NOTICE: 'Notice',
  EVENT: 'Event',
  ENQUIRY: 'Enquiry',
  SITE_PAGE: 'Website page',
  SITE_POST: 'Website post',
  DONATION_FUND: 'Donation fund',
  DONATION_CAMPAIGN: 'Donation campaign',
  FAMILY: 'Family',
};

export type DaysTone = 'danger' | 'warning' | 'neutral' | 'info';

/** Badge tone for "days left": kept items (purge blocked) are info; ≤3 days red; ≤7 amber. */
export function daysLeftTone(daysLeft: number, purgeError?: string | null): DaysTone {
  if (purgeError) return 'info';
  if (daysLeft <= 3) return 'danger';
  if (daysLeft <= 7) return 'warning';
  return 'neutral';
}

/** Types with at least one item, in the fixed order, for the filter. */
export function typesWithItems(counts: Partial<Record<TrashType, number>>): TrashType[] {
  return TRASH_TYPES.filter((t) => (counts[t] ?? 0) > 0);
}

export interface BulkResult {
  id: string;
  ok: boolean;
  error?: string;
}

/** Splits bulk results into done / failed with the first few reasons. */
export function summarizeBulk(results: BulkResult[], maxReasons = 3): { done: number; failed: number; reasons: string[] } {
  const failed = results.filter((r) => !r.ok);
  return {
    done: results.length - failed.length,
    failed: failed.length,
    reasons: [...new Set(failed.map((r) => r.error ?? ''))].filter(Boolean).slice(0, maxReasons),
  };
}
