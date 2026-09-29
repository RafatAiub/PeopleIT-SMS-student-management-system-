// Turns the common analytics filters into a tenant-scoped Student filter and
// applies role scope: TEACHER sees only sections they are class teacher of or
// teach in the weekly timetable (same rule as attendance/exam-timetable).
import { Prisma, UserRole } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { ForbiddenError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import { localTodayKey, tzOffsetMinutes } from './analytics.logic';
import type { FilterFieldsType } from './analytics.dto';

export type Requester = { sub: string; role: string };

/** Section ids a TEACHER user may report on (empty set when not a teacher). */
export async function teacherSectionIds(institutionId: string, userId: string): Promise<Set<string>> {
  const teacher = await prisma.teacher.findFirst({
    where: { userId, user: { institutionId } },
    select: { id: true },
  });
  if (!teacher) return new Set();

  const [classTeacherSections, slots] = await Promise.all([
    prisma.section.findMany({
      where: { classTeacherId: teacher.id, class: { branch: { institutionId } } },
      select: { id: true },
    }),
    prisma.timetableSlot.findMany({
      where: { institutionId, teacherId: teacher.id },
      select: { className: true, sectionName: true, branchId: true },
      distinct: ['className', 'sectionName', 'branchId'],
    }),
  ]);

  const ids = new Set(classTeacherSections.map((s) => s.id));
  const pairs = slots.filter((s) => s.className && s.sectionName);
  if (pairs.length > 0) {
    const taught = await prisma.section.findMany({
      where: {
        class: { branch: { institutionId } },
        OR: pairs.map((p) => ({ name: p.sectionName, class: { name: p.className, branchId: p.branchId } })),
      },
      select: { id: true },
    });
    for (const s of taught) ids.add(s.id);
  }
  return ids;
}

/**
 * Student filter for a report request. Always carries `institutionId`; the
 * other filters narrow it. For TEACHER, a requested section outside their
 * scope is a 403 and everything is intersected with their sections.
 */
export async function resolveStudentWhere(
  institutionId: string,
  requester: Requester,
  filters: Pick<FilterFieldsType, 'branchId' | 'academicYearId' | 'classId' | 'sectionId'>,
): Promise<Prisma.StudentWhereInput> {
  const and: Prisma.StudentWhereInput[] = [];
  if (filters.branchId) {
    and.push({ OR: [{ branchId: filters.branchId }, { class: { branchId: filters.branchId } }] });
  }
  if (filters.academicYearId) and.push({ academicYearId: filters.academicYearId });
  if (filters.classId) and.push({ classId: filters.classId });
  if (filters.sectionId) and.push({ sectionId: filters.sectionId });

  if (requester.role === UserRole.TEACHER) {
    const allowed = await teacherSectionIds(institutionId, requester.sub);
    if (filters.sectionId && !allowed.has(filters.sectionId)) {
      throw new ForbiddenError('You can only view reports for sections you are assigned to');
    }
    and.push({ sectionId: { in: Array.from(allowed) } });
  }

  return { institutionId, ...(and.length > 0 ? { AND: and } : {}) };
}

/**
 * The institution's UTC offset (minutes) and today's local date. Degrades to
 * Asia/Dhaka if the timezone column is unavailable (pre-migration database).
 */
export async function institutionClock(institutionId: string, now = new Date()) {
  let timeZone = 'Asia/Dhaka';
  try {
    const inst = await prisma.institution.findUnique({ where: { id: institutionId }, select: { timezone: true } });
    if (inst?.timezone) timeZone = inst.timezone;
  } catch (err) {
    logger.warn('Institution timezone lookup failed — using Asia/Dhaka', { institutionId, error: (err as Error).message });
  }
  const offset = tzOffsetMinutes(timeZone, now);
  return { timeZone, offset, todayKey: localTodayKey(now, offset) };
}

/** Splits a list into chunks so `in` filters stay well under Postgres' parameter limit. */
export function chunk<T>(list: T[], size = 5000): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}
