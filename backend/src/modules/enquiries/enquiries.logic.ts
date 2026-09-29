// =============================================================================
// Admissions CRM — pure helpers (no I/O), unit-tested in
// tests/enquiries-logic.test.ts.
// =============================================================================

import { digitsOf } from '../../utils/phone';

export type EnquiryStatus = 'NEW' | 'CONTACTED' | 'VISITED' | 'APPLIED' | 'ENROLLED' | 'LOST';
export const PIPELINE: EnquiryStatus[] = ['NEW', 'CONTACTED', 'VISITED', 'APPLIED', 'ENROLLED', 'LOST'];
export const CLOSED_STATUSES: EnquiryStatus[] = ['ENROLLED', 'LOST'];

/**
 * Two phone numbers "match" when their last 10 digits agree — enough to
 * absorb +880 / 880 / 0 prefixes and formatting while still requiring the
 * whole subscriber number. Anything shorter than 6 digits never matches.
 */
export function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const da = digitsOf(a);
  const db = digitsOf(b);
  if (da.length < 6 || db.length < 6) return false;
  return da.slice(-10) === db.slice(-10);
}

export type PublicApplicationState = 'UNDER_REVIEW' | 'APPROVED' | 'CLOSED';

/** Maps Student.status to the only thing an applicant is told: where the application stands. */
export function publicApplicationState(studentStatus: string): { state: PublicApplicationState; label: string } {
  switch (studentStatus) {
    case 'PENDING':
      return { state: 'UNDER_REVIEW', label: 'Under review' };
    case 'ACTIVE':
      return { state: 'APPROVED', label: 'Approved — admission confirmed' };
    default:
      return { state: 'CLOSED', label: 'Closed — please contact the school office' };
  }
}

export interface FunnelInput {
  byStatus: Partial<Record<EnquiryStatus, number>>;
  /** Enquiries converted into an online application (convertedStudentId set). */
  convertedToApplication: number;
  /** Converted enquiries whose application was approved (student ACTIVE). */
  convertedApproved: number;
  /** Enquiries marked ENROLLED or whose converted student is ACTIVE (union, counted once). */
  enrolled: number;
  /** Students currently in PENDING (online applications awaiting review). */
  applicationsPending: number;
  /** Online applications received in the window (PENDING + already decided). */
  applicationsTotal: number;
}

export function computeFunnel(input: FunnelInput) {
  const byStatus = Object.fromEntries(PIPELINE.map((s) => [s, input.byStatus[s] ?? 0])) as Record<EnquiryStatus, number>;
  const enquiries = PIPELINE.reduce((sum, s) => sum + byStatus[s], 0);
  const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);

  return {
    enquiries,
    byStatus,
    open: enquiries - byStatus.ENROLLED - byStatus.LOST,
    lost: byStatus.LOST,
    applications: {
      total: input.applicationsTotal,
      pending: input.applicationsPending,
      fromEnquiries: input.convertedToApplication,
      approvedFromEnquiries: input.convertedApproved,
    },
    enrolled: input.enrolled,
    /** Percent of enquiries that became enrolled students. */
    conversionRate: pct(input.enrolled, enquiries),
    /** Percent of enquiries that reached the application stage. */
    applicationRate: pct(input.convertedToApplication, enquiries),
  };
}

/** Appends a timestamped line to free-text notes, capped to the column budget. */
export function appendNote(existing: string | null | undefined, note: string, at = new Date()): string {
  const line = `[${at.toISOString().slice(0, 16).replace('T', ' ')}] ${note.trim()}`;
  const next = existing ? `${existing}\n${line}` : line;
  return next.length > 5000 ? next.slice(next.length - 5000) : next;
}

/** Splits "Rahim Uddin Ahmed" into first "Rahim" / last "Uddin Ahmed" for the convert form. */
export function splitName(full: string | null | undefined): { firstName: string; lastName: string } {
  const parts = (full ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}
