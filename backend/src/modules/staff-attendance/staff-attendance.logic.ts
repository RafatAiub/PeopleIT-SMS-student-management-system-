// Pure staff-attendance helpers (no prisma) — unit-testable.

export const STAFF_ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'LEAVE', 'HALF_DAY'] as const;
export type StaffAttendanceStatus = (typeof STAFF_ATTENDANCE_STATUSES)[number];

/** Roles counted as staff for the daily staff register. */
export const STAFF_ROLES = ['TEACHER', 'ACCOUNTANT', 'LIBRARIAN', 'TRANSPORT_OFFICER', 'MANAGEMENT'] as const;

export interface StaffCounts {
  present: number;
  absent: number;
  late: number;
  leave: number;
  halfDay: number;
  total: number;
}

export function emptyStaffCounts(): StaffCounts {
  return { present: 0, absent: 0, late: 0, leave: 0, halfDay: 0, total: 0 };
}

export function addStaffStatus(c: StaffCounts, status: string): StaffCounts {
  switch (status) {
    case 'PRESENT':
      c.present++;
      break;
    case 'ABSENT':
      c.absent++;
      break;
    case 'LATE':
      c.late++;
      break;
    case 'LEAVE':
      c.leave++;
      break;
    case 'HALF_DAY':
      c.halfDay++;
      break;
    default:
      return c;
  }
  c.total++;
  return c;
}

/**
 * Staff attendance % over working days: approved LEAVE days are excluded from
 * the denominator (they are neither attended nor absent). LATE = attended,
 * HALF_DAY = half. One decimal; null when there are no working days marked.
 */
export function staffAttendancePercentage(c: StaffCounts): number | null {
  const working = c.total - c.leave;
  if (working <= 0) return null;
  return Math.round(((c.present + c.late + c.halfDay * 0.5) / working) * 1000) / 10;
}

export interface LeaveWindow {
  applicantUserId: string;
  startDate: Date;
  endDate: Date;
  leaveTypeName?: string | null;
}

/** YYYY-MM-DD of a Date (UTC), matching @db.Date storage. */
export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Map userId → leave type name for every approved leave covering `day`
 * (YYYY-MM-DD, inclusive range). Used to auto-suggest LEAVE on the register.
 */
export function leaveSuggestions(leaves: LeaveWindow[], day: string): Map<string, string | null> {
  const out = new Map<string, string | null>();
  for (const l of leaves) {
    if (isoDay(l.startDate) <= day && day <= isoDay(l.endDate)) {
      out.set(l.applicantUserId, l.leaveTypeName ?? null);
    }
  }
  return out;
}

export function parseDay(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}
