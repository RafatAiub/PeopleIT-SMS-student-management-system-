import type { BadgeVariant } from '@/components/ui';

// =============================================================================
// Admission Enquiries (CRM) — shared types and pure helpers.
// Wire shapes mirror backend/src/modules/enquiries/enquiries.dto.ts and
// enquiries.repository.ts `enquirySelect` exactly — see also enquiries.logic.ts
// for the PIPELINE order and splitName/appendNote behaviour this mirrors.
// =============================================================================

export type EnquiryStatus = 'NEW' | 'CONTACTED' | 'VISITED' | 'APPLIED' | 'ENROLLED' | 'LOST';

/** Pipeline order for the board and the status <Select>. */
export const PIPELINE: EnquiryStatus[] = ['NEW', 'CONTACTED', 'VISITED', 'APPLIED', 'ENROLLED', 'LOST'];

export const CLOSED_STATUSES: EnquiryStatus[] = ['ENROLLED', 'LOST'];

export const STATUS_LABELS: Record<EnquiryStatus, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  VISITED: 'Visited',
  APPLIED: 'Applied',
  ENROLLED: 'Enrolled',
  LOST: 'Lost',
};

export const STATUS_BADGE_VARIANT: Record<EnquiryStatus, BadgeVariant> = {
  NEW: 'info',
  CONTACTED: 'primary',
  VISITED: 'warning',
  APPLIED: 'accent',
  ENROLLED: 'success',
  LOST: 'danger',
};

export const STATUS_OPTIONS = PIPELINE.map((s) => ({ value: s, label: STATUS_LABELS[s] }));

/** Preset sources from the brief. `source` is free text server-side, so a
 * custom value typed elsewhere (e.g. via the public form) still displays fine
 * via STATUS_LABELS-style fallback to the raw string. */
export const SOURCE_OPTIONS = [
  { value: 'WALK_IN', label: 'Walk-in' },
  { value: 'PHONE', label: 'Phone' },
  { value: 'WEBSITE', label: 'Website' },
  { value: 'REFERRAL', label: 'Referral' },
  { value: 'FACEBOOK', label: 'Facebook' },
  { value: 'OTHER', label: 'Other' },
];

export interface EnquiryAssignee {
  id: string;
  firstName: string;
  lastName: string;
  role?: string;
}

export interface ConvertedStudentRef {
  id: string;
  studentId: string;
  status: string;
}

export interface Enquiry {
  id: string;
  studentName: string;
  guardianName: string | null;
  phone: string;
  email: string | null;
  classInterested: string | null;
  source: string;
  status: EnquiryStatus;
  notes: string | null;
  assignedToUserId: string | null;
  assignedTo: EnquiryAssignee | null;
  followUpAt: string | null;
  convertedStudentId: string | null;
  convertedStudent: ConvertedStudentRef | null;
  createdAt: string;
  updatedAt: string;
}

export interface BoardColumn {
  status: EnquiryStatus;
  total: number;
  items: Enquiry[];
}

export interface EnquiryFunnel {
  range: { from: string | null; to: string | null };
  enquiries: number;
  byStatus: Record<EnquiryStatus, number>;
  open: number;
  lost: number;
  applications: {
    total: number;
    pending: number;
    fromEnquiries: number;
    approvedFromEnquiries: number;
  };
  enrolled: number;
  conversionRate: number;
  applicationRate: number;
}

export interface ClassOption {
  id: string;
  name: string;
}

// ── Create / edit form ──────────────────────────────────────────────────────

export interface EnquiryFormValues {
  studentName: string;
  guardianName: string;
  phone: string;
  email: string;
  classInterested: string;
  source: string;
  status: EnquiryStatus;
  notes: string;
  assignedToUserId: string;
  /** `datetime-local` input value ('' = no follow-up date). */
  followUpAt: string;
}

export const EMPTY_ENQUIRY_FORM: EnquiryFormValues = {
  studentName: '',
  guardianName: '',
  phone: '',
  email: '',
  classInterested: '',
  source: 'WALK_IN',
  status: 'NEW',
  notes: '',
  assignedToUserId: '',
  followUpAt: '',
};

/** Wire shape sent to POST/PUT /enquiries. */
export interface EnquiryPayload {
  studentName: string;
  guardianName: string | null;
  phone: string;
  email: string | null;
  classInterested: string | null;
  source: string;
  status: EnquiryStatus;
  notes: string | null;
  assignedToUserId: string | null;
  followUpAt: string | null;
}

/** ISO -> value for <input type="datetime-local"> in the browser's local time. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function toEnquiryPayload(values: EnquiryFormValues): EnquiryPayload {
  return {
    studentName: values.studentName.trim(),
    guardianName: values.guardianName.trim() || null,
    phone: values.phone.trim(),
    email: values.email.trim() || null,
    classInterested: values.classInterested.trim() || null,
    source: values.source || 'WALK_IN',
    status: values.status,
    notes: values.notes.trim() || null,
    assignedToUserId: values.assignedToUserId || null,
    followUpAt: fromLocalInput(values.followUpAt),
  };
}

export function enquiryToFormValues(enquiry: Enquiry): EnquiryFormValues {
  return {
    studentName: enquiry.studentName,
    guardianName: enquiry.guardianName ?? '',
    phone: enquiry.phone,
    email: enquiry.email ?? '',
    classInterested: enquiry.classInterested ?? '',
    source: enquiry.source || 'WALK_IN',
    status: enquiry.status,
    notes: enquiry.notes ?? '',
    assignedToUserId: enquiry.assignedToUserId ?? '',
    followUpAt: toLocalInput(enquiry.followUpAt),
  };
}

export function isFollowUpOverdue(enquiry: Pick<Enquiry, 'followUpAt' | 'status'>, now = Date.now()): boolean {
  if (!enquiry.followUpAt) return false;
  if (CLOSED_STATUSES.includes(enquiry.status)) return false;
  return new Date(enquiry.followUpAt).getTime() < now;
}

/** Splits "Rahim Uddin Ahmed" into first "Rahim" / last "Uddin Ahmed" — mirrors
 * the backend's enquiries.logic.ts splitName, used to prefill the convert form. */
export function splitName(full: string | null | undefined): { firstName: string; lastName: string } {
  const parts = (full ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

// ── Convert to application ──────────────────────────────────────────────────

export interface ConvertFormValues {
  firstName: string;
  lastName: string;
  classId: string;
  dateOfBirth: string;
  gender: 'MALE' | 'FEMALE' | 'OTHER' | '';
  guardianFirstName: string;
  guardianLastName: string;
  guardianPhone: string;
  guardianEmail: string;
}

export const EMPTY_CONVERT_FORM: ConvertFormValues = {
  firstName: '',
  lastName: '',
  classId: '',
  dateOfBirth: '',
  gender: '',
  guardianFirstName: '',
  guardianLastName: '',
  guardianPhone: '',
  guardianEmail: '',
};

export function buildConvertDefaults(enquiry: Enquiry): ConvertFormValues {
  const student = splitName(enquiry.studentName);
  const guardian = splitName(enquiry.guardianName);
  return {
    firstName: student.firstName,
    lastName: student.lastName,
    classId: '',
    dateOfBirth: '',
    gender: '',
    guardianFirstName: guardian.firstName,
    guardianLastName: guardian.lastName,
    guardianPhone: enquiry.phone,
    guardianEmail: '',
  };
}

export interface ConvertPayload {
  firstName: string;
  lastName: string;
  classId?: string | null;
  dateOfBirth?: string | null;
  gender?: 'MALE' | 'FEMALE' | 'OTHER' | null;
  guardianFirstName: string;
  guardianLastName: string;
  guardianPhone: string;
  guardianEmail?: string | null;
}

export function toConvertPayload(values: ConvertFormValues): ConvertPayload {
  return {
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    classId: values.classId || null,
    dateOfBirth: values.dateOfBirth || null,
    gender: values.gender || null,
    guardianFirstName: values.guardianFirstName.trim(),
    guardianLastName: values.guardianLastName.trim(),
    guardianPhone: values.guardianPhone.trim(),
    guardianEmail: values.guardianEmail.trim() || null,
  };
}

export interface ConvertResult {
  enquiry: Enquiry;
  application: { id: string; reference: string; status: string };
}

// ── Public application status check ─────────────────────────────────────────

export type PublicApplicationState = 'UNDER_REVIEW' | 'APPROVED' | 'CLOSED';

export interface ApplicationStatusResult {
  institutionName: string;
  reference: string;
  state: PublicApplicationState;
  label: string;
  className: string | null;
  submittedAt: string;
  lastUpdatedAt: string;
}

export const APPLICATION_STATE_VARIANT: Record<PublicApplicationState, BadgeVariant> = {
  UNDER_REVIEW: 'warning',
  APPROVED: 'success',
  CLOSED: 'neutral',
};
