import * as attendanceRepository from './attendance.repository';
import { prisma } from '../../config/prisma';
import { BadRequestError, NotFoundError } from '../../utils/AppError';
import * as guardianRepository from '../guardians/guardian.repository';
import { feeReminderQueue } from '../../queues/reminderQueue';
import type { BulkSubmitAttendanceDtoType, AttendanceQueryDtoType, AssignTeacherDtoType, AttendanceSheetQueryDtoType, WeeklyAttendanceSheetQueryDtoType } from './attendance.dto';
import { logger } from '../../utils/logger';

export async function submitBulkAttendance(
  institutionId: string | undefined,
  data: BulkSubmitAttendanceDtoType,
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
  }

  const result = await attendanceRepository.upsertBulkAttendance(institutionId, date, records);
  logger.info('Bulk attendance submitted', { institutionId, date, count: records.length });

  const absentees = records.filter((r) => r.status === 'ABSENT');
  try {
    for (const r of absentees) {
      feeReminderQueue
        .add('absence', { type: 'absence', institutionId: institutionId || '', studentId: r.studentId, date })
        .catch((err) => logger.error('Failed to enqueue absence reminder', { studentId: r.studentId, error: err.message }));
    }
  } catch (err: any) {
    logger.error('Failed to enqueue absence reminders', { error: err.message });
  }

  return result;
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
