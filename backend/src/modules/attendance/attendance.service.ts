import * as attendanceRepository from './attendance.repository';
import { prisma } from '../../config/prisma';
import { BadRequestError } from '../../utils/AppError';
import type { BulkSubmitAttendanceDtoType, AttendanceQueryDtoType, AssignTeacherDtoType, AttendanceSheetQueryDtoType } from './attendance.dto';
import { logger } from '../../utils/logger';

export async function submitBulkAttendance(
  institutionId: string,
  data: BulkSubmitAttendanceDtoType,
) {
  const { date, records } = data;
  const studentIds = records.map((r) => r.studentId);

  // Validate all students exist in this institution to prevent cross-tenant insertion
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

  const result = await attendanceRepository.upsertBulkAttendance(institutionId, date, records);
  logger.info('Bulk attendance submitted', { institutionId, date, count: records.length });
  return result;
}

export async function listAttendance(
  institutionId: string,
  query: AttendanceQueryDtoType,
) {
  return attendanceRepository.findAll(institutionId, query);
}

export async function assignTeacherToSection(
  institutionId: string,
  data: AssignTeacherDtoType,
) {
  return attendanceRepository.assignTeacherToSection(institutionId, data.teacherId, data.sectionId);
}

export async function listAssignments(institutionId: string) {
  return attendanceRepository.getAssignments(institutionId);
}

export async function listTeacherSections(userId: string, institutionId: string) {
  return attendanceRepository.getTeacherSections(userId, institutionId);
}

export async function getAttendanceSheet(
  institutionId: string,
  query: AttendanceSheetQueryDtoType,
) {
  return attendanceRepository.getAttendanceSheet(
    institutionId,
    query.className,
    query.sectionName,
    query.date,
  );
}

export async function getStudentAttendanceHistory(userId: string, institutionId: string) {
  return attendanceRepository.getStudentAttendanceHistory(userId, institutionId);
}
