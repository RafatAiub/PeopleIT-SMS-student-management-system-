// Pure helpers for subject-wise attendance (no prisma).
import { addStatus, attendancePercentage, emptyCounts, type StatusCounts } from '../attendance/attendance.logic';

export const WEEKDAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

/** Weekday name (MONDAY…) of a YYYY-MM-DD date. */
export function weekdayOf(day: string): string {
  return WEEKDAYS[new Date(`${day}T00:00:00.000Z`).getUTCDay()];
}

export function normalizeSubject(name: string): string {
  return name.trim().toLowerCase();
}

export interface TeacherSubjectScope {
  /** Class teacher of the section → may mark every subject. */
  isClassTeacher: boolean;
  /** Normalised subject names the teacher teaches for this class+section in the timetable. */
  taughtSubjects: Set<string>;
}

export function canTeacherMarkSubject(scope: TeacherSubjectScope, subjectName: string): boolean {
  return scope.isClassTeacher || scope.taughtSubjects.has(normalizeSubject(subjectName));
}

export interface SlotLike {
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  subject: string;
}

/**
 * Numbers each class+section's timetable slots per day by start time
 * (1 = first period). TimetableSlot has no period column, so this is the
 * period number used when marking subject attendance.
 */
export function numberPeriods<T extends SlotLike>(slots: T[]): (T & { period: number })[] {
  const byDay = new Map<string, T[]>();
  for (const s of slots) {
    const list = byDay.get(s.dayOfWeek) ?? [];
    list.push(s);
    byDay.set(s.dayOfWeek, list);
  }
  const out: (T & { period: number })[] = [];
  for (const list of byDay.values()) {
    list
      .slice()
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
      .forEach((s, i) => out.push({ ...s, period: i + 1 }));
  }
  return out;
}

export interface SubjectRecord {
  studentId: string;
  subjectName: string;
  status: string;
  date: Date;
  period: number | null;
}

/** Per-subject counts and % for a set of records (one student or many). */
export function summarizeBySubject(records: SubjectRecord[]) {
  const map = new Map<string, StatusCounts>();
  for (const r of records) {
    const c = map.get(r.subjectName) ?? emptyCounts();
    addStatus(c, r.status);
    map.set(r.subjectName, c);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([subjectName, c]) => ({ subjectName, ...c, percentage: attendancePercentage(c) }));
}

/** Number of distinct sessions (date + period) held per subject. */
export function sessionsBySubject(records: SubjectRecord[]): Map<string, number> {
  const sets = new Map<string, Set<string>>();
  for (const r of records) {
    const set = sets.get(r.subjectName) ?? new Set<string>();
    set.add(`${r.date.toISOString().slice(0, 10)}#${r.period ?? '-'}`);
    sets.set(r.subjectName, set);
  }
  return new Map([...sets.entries()].map(([k, v]) => [k, v.size]));
}
