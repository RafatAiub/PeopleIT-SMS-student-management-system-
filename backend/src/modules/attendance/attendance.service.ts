import * as attendanceRepository from './attendance.repository';
import { prisma } from '../../config/prisma';
import { BadRequestError, NotFoundError } from '../../utils/AppError';
import * as guardianRepository from '../guardians/guardian.repository';
import type {
  BulkSubmitAttendanceDtoType,
  AttendanceQueryDtoType,
  AssignTeacherDtoType,
  AttendanceSheetQueryDtoType,
  WeeklyAttendanceSheetQueryDtoType,
  AttendanceSummaryQueryDtoType,
} from './attendance.dto';
import { logger } from '../../utils/logger';
import { assertTeacherCanMarkStudents, assertTeacherSection } from './attendance.scope';
import { sendAbsenceAlerts } from './attendance.alerts';
import {
  CHRONIC_ABSENTEE_THRESHOLD,
  addStatus,
  attendancePercentage,
  emptyCounts,
  isChronicAbsentee,
  monthRange,
  newlyAbsentStudentIds,
  normalizeAttendanceDate,
  sumCounts,
  type StatusCounts,
} from './attendance.logic';

export interface AttendanceActor {
  userId: string;
  role: string;
}

export async function submitBulkAttendance(
  institutionId: string | undefined,
  data: BulkSubmitAttendanceDtoType,
  actor?: AttendanceActor,
) {
  const { date, records } = data;
  const studentIds = records.map((r) => r.studentId);

  // If institutionId exists, validate student ownership
  if (institutionId) {
    const validStudents = await prisma.student.findMany({
      where: {
        institutionId,
        id: { in: studentIds },
      },
      select: { id: true },
    });

    if (validStudents.length !== new Set(studentIds).size) {
      throw new BadRequestError('Some student IDs are invalid or belong to another institution');
    }

    // TEACHER may only mark students in sections they are assigned to (class
    // teacher or timetable teacher). SUPER_ADMIN/ADMIN stay unrestricted.
    if (actor?.role === 'TEACHER') {
      await assertTeacherCanMarkStudents(institutionId, actor.userId, studentIds);
    }
  }

  // Snapshot previous statuses so re-submitting a sheet doesn't re-alert.
  const normalizedDate = normalizeAttendanceDate(date);
  const previousStatusById = new Map<string, string>();
  if (institutionId && records.some((r) => r.status === 'ABSENT')) {
    try {
      const previous = await prisma.attendance.findMany({
        where: { institutionId, date: normalizedDate, studentId: { in: studentIds } },
        select: { studentId: true, status: true },
      });
      previous.forEach((p) => previousStatusById.set(p.studentId, p.status));
    } catch (err) {
      logger.warn('Could not read previous attendance statuses', { error: (err as Error).message });
    }
  }

  const result = await attendanceRepository.upsertBulkAttendance(institutionId, date, records);
  logger.info('Bulk attendance submitted', { institutionId, date, count: records.length });

  if (institutionId) {
    const toAlert = newlyAbsentStudentIds(records, previousStatusById);
    void sendAbsenceAlerts(institutionId, normalizedDate, toAlert);
  }

  return result;
}

/**
 * Monthly attendance summary for one class/section: per-student counts and
 * %, plus class totals. TEACHER is limited to their own sections.
 */
export async function getMonthlySummary(
  institutionId: string | undefined,
  query: AttendanceSummaryQueryDtoType,
  actor?: AttendanceActor,
) {
  if (!institutionId) throw new BadRequestError('An institution context is required');
  const range = monthRange(query.month);
  if (!range) throw new BadRequestError('month must be in YYYY-MM format');

  if (actor?.role === 'TEACHER') {
    await assertTeacherSection(institutionId, actor.userId, query.className, query.sectionName);
  }

  const students = await prisma.student.findMany({
    where: {
      institutionId,
      status: 'ACTIVE',
      class: { name: query.className },
      section: { name: query.sectionName },
    },
    select: { id: true, studentId: true, firstName: true, lastName: true, rollNumber: true },
    orderBy: { rollNumber: 'asc' },
  });

  const records = students.length
    ? await prisma.attendance.findMany({
        where: {
          institutionId,
          studentId: { in: students.map((s) => s.id) },
          date: { gte: range.start, lte: range.end },
        },
        select: { studentId: true, status: true, date: true },
      })
    : [];

  const countsById = new Map<string, StatusCounts>();
  const markedDates = new Set<string>();
  for (const r of records) {
    const c = countsById.get(r.studentId) ?? emptyCounts();
    addStatus(c, r.status);
    countsById.set(r.studentId, c);
    markedDates.add(r.date.toISOString().slice(0, 10));
  }

  const rows = students.map((s) => {
    const c = countsById.get(s.id) ?? emptyCounts();
    const percentage = attendancePercentage(c);
    return {
      id: s.id,
      studentId: s.studentId,
      name: `${s.firstName} ${s.lastName}`.trim(),
      rollNumber: s.rollNumber,
      ...c,
      percentage,
      chronic: isChronicAbsentee(percentage),
    };
  });

  const totals = sumCounts(rows);
  return {
    month: query.month,
    className: query.className,
    sectionName: query.sectionName,
    threshold: CHRONIC_ABSENTEE_THRESHOLD,
    workingDays: markedDates.size,
    students: rows,
    totals: {
      ...totals,
      percentage: attendancePercentage(totals),
      studentCount: rows.length,
      chronicCount: rows.filter((r) => r.chronic).length,
    },
  };
}

export async function listAttendance(
  institutionId: string | undefined,
  query: AttendanceQueryDtoType,
) {
  return attendanceRepository.findAll(institutionId, query);
}

export async function assignTeacherToSection(
  institutionId: string | undefined,
  data: AssignTeacherDtoType,
) {
  return attendanceRepository.assignTeacherToSection(institutionId, data.teacherId, data.sectionId);
}

export async function listAssignments(institutionId: string | undefined) {
  return attendanceRepository.getAssignments(institutionId);
}

export async function listTeacherSections(userId: string, institutionId: string | undefined) {
  return attendanceRepository.getTeacherSections(userId, institutionId);
}

export async function getAttendanceSheet(
  institutionId: string | undefined,
  query: AttendanceSheetQueryDtoType,
) {
  return attendanceRepository.getAttendanceSheet(
    institutionId,
    query.className,
    query.sectionName,
    query.date,
  );
}

export async function getWeeklyAttendanceSheet(
  institutionId: string | undefined,
  query: WeeklyAttendanceSheetQueryDtoType,
) {
  return attendanceRepository.getWeeklyAttendanceSheet(
    institutionId,
    query.className,
    query.sectionName,
    query.startDate,
    query.endDate,
  );
}

export async function getStudentAttendanceHistory(userId: string, institutionId: string | undefined) {
  return attendanceRepository.getStudentAttendanceHistory(userId, institutionId);
}

export async function getChildAttendanceHistory(
  institutionId: string | undefined,
  studentId: string,
  guardianUserId: string,
) {
  if (institutionId) {
    const linked = await guardianRepository.findLinkedStudentIdsByUserId(institutionId, guardianUserId);
    if (!linked.includes(studentId)) {
      throw new NotFoundError('Student not found');
    }
  }
  return attendanceRepository.getAttendanceHistoryByStudentId(institutionId, studentId);
}
