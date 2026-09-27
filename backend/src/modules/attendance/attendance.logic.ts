// Pure, DB-free attendance helpers: monthly summary math, month ranges and
// the teacher section-scope rule. Kept free of prisma imports so they can be
// unit-tested without a database.

export const CHRONIC_ABSENTEE_THRESHOLD = 75;

export type DailyStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'HALF_DAY';

export interface StatusCounts {
  present: number;
  absent: number;
  late: number;
  halfDay: number;
  /** Number of marked days (all four statuses). */
  total: number;
}

export function emptyCounts(): StatusCounts {
  return { present: 0, absent: 0, late: 0, halfDay: 0, total: 0 };
}

/** Adds one status to a counts object in place. Unknown statuses are ignored. */
export function addStatus(counts: StatusCounts, status: string): StatusCounts {
  switch (status) {
    case 'PRESENT':
      counts.present++;
      break;
    case 'ABSENT':
      counts.absent++;
      break;
    case 'LATE':
      counts.late++;
      break;
    case 'HALF_DAY':
      counts.halfDay++;
      break;
    default:
      return counts;
  }
  counts.total++;
  return counts;
}

export function countStatuses(statuses: string[]): StatusCounts {
  return statuses.reduce((acc, s) => addStatus(acc, s), emptyCounts());
}

/**
 * Attendance % — same formula as the existing student history endpoint
 * (attendance.repository.getAttendanceHistoryByStudentId): LATE counts as
 * attended, HALF_DAY as half a day. Rounded to one decimal. `null` when no
 * day has been marked, so "no data" is never shown as 0% or 100%.
 */
export function attendancePercentage(counts: Pick<StatusCounts, 'present' | 'late' | 'halfDay' | 'total'>): number | null {
  if (!counts.total) return null;
  const attended = counts.present + counts.late + counts.halfDay * 0.5;
  return Math.round((attended / counts.total) * 1000) / 10;
}

export function isChronicAbsentee(percentage: number | null, threshold = CHRONIC_ABSENTEE_THRESHOLD): boolean {
  return percentage !== null && percentage < threshold;
}

export function sumCounts(list: StatusCounts[]): StatusCounts {
  return list.reduce(
    (acc, c) => ({
      present: acc.present + c.present,
      absent: acc.absent + c.absent,
      late: acc.late + c.late,
      halfDay: acc.halfDay + c.halfDay,
      total: acc.total + c.total,
    }),
    emptyCounts(),
  );
}

/**
 * Parses "YYYY-MM" into a UTC [start, end] range covering the whole month
 * (end = last millisecond of the month). Returns null for malformed input.
 */
export function monthRange(month: string): { start: Date; end: Date; daysInMonth: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const year = Number(m[1]);
  const mon = Number(m[2]);
  if (mon < 1 || mon > 12) return null;
  const start = new Date(Date.UTC(year, mon - 1, 1));
  const next = new Date(Date.UTC(year, mon, 1));
  const end = new Date(next.getTime() - 1);
  const daysInMonth = Math.round((next.getTime() - start.getTime()) / 86400000);
  return { start, end, daysInMonth };
}

// ── Teacher section scope ────────────────────────────────────────────────

/**
 * The sections a TEACHER may mark attendance for. A teacher qualifies for a
 * section either as its class teacher (Section.classTeacherId — what
 * /attendance/my-sections returns) or by teaching at least one timetable slot
 * for that class+section (TimetableSlot stores free-text className/sectionName,
 * so those are matched by name).
 */
export interface TeacherSectionScope {
  sectionIds: Set<string>;
  classSectionKeys: Set<string>;
}

export function sectionKey(className: string | null | undefined, sectionName: string | null | undefined): string {
  return `${(className ?? '').trim().toLowerCase()}::${(sectionName ?? '').trim().toLowerCase()}`;
}

export interface ScopedStudent {
  id: string;
  sectionId: string | null;
  className: string | null;
  sectionName: string | null;
}

export function isStudentInTeacherScope(student: ScopedStudent, scope: TeacherSectionScope): boolean {
  if (student.sectionId && scope.sectionIds.has(student.sectionId)) return true;
  if (student.className && student.sectionName) {
    return scope.classSectionKeys.has(sectionKey(student.className, student.sectionName));
  }
  return false;
}

/** Ids of the students the teacher is NOT allowed to mark. Empty = all allowed. */
export function findOutOfScopeStudents(students: ScopedStudent[], scope: TeacherSectionScope): string[] {
  return students.filter((s) => !isStudentInTeacherScope(s, scope)).map((s) => s.id);
}

export function isSectionInTeacherScope(
  scope: TeacherSectionScope,
  className: string,
  sectionName: string,
  sectionId?: string | null,
): boolean {
  if (sectionId && scope.sectionIds.has(sectionId)) return true;
  return scope.classSectionKeys.has(sectionKey(className, sectionName));
}

// ── Absence alerts ───────────────────────────────────────────────────────

/**
 * Students who should get an absence alert for this submission: marked ABSENT
 * now and NOT already ABSENT on this date before the submission. Re-submitting
 * an unchanged sheet therefore alerts nobody (the notification dedupe key is
 * the second, durable guard).
 */
export function newlyAbsentStudentIds(
  records: { studentId: string; status: string }[],
  previousStatusById: Map<string, string>,
): string[] {
  const out = new Set<string>();
  for (const r of records) {
    if (r.status === 'ABSENT' && previousStatusById.get(r.studentId) !== 'ABSENT') out.add(r.studentId);
  }
  return [...out];
}

/** Deterministic notification contextId: one alert per student per day, ever. */
export function absenceAlertContextId(studentId: string, normalizedDate: Date): string {
  return `${studentId}:${normalizedDate.toISOString()}`;
}

/** YYYY-MM-DD → midnight-UTC Date, matching how Attendance.date is stored. */
export function normalizeAttendanceDate(date: Date): Date {
  const dateStr = isNaN(date.getTime()) ? new Date().toISOString().split('T')[0] : date.toISOString().split('T')[0];
  return new Date(dateStr + 'T00:00:00.000Z');
}
