import { prisma } from '../../config/prisma';
import { ForbiddenError } from '../../utils/AppError';
import {
  findOutOfScopeStudents,
  sectionKey,
  isSectionInTeacherScope,
  type TeacherSectionScope,
} from './attendance.logic';

/**
 * Loads the sections a TEACHER user may mark: class-teacher sections (the
 * same relation /attendance/my-sections reads) plus every class+section they
 * teach in the timetable. Always tenant-scoped.
 */
export async function getTeacherSectionScope(institutionId: string, userId: string): Promise<TeacherSectionScope> {
  const scope: TeacherSectionScope = { sectionIds: new Set(), classSectionKeys: new Set() };

  const teacher = await prisma.teacher.findFirst({
    where: { userId, user: { institutionId } },
    select: { id: true },
  });
  if (!teacher) return scope;

  const [classTeacherSections, slots] = await Promise.all([
    prisma.section.findMany({
      where: { classTeacherId: teacher.id, class: { branch: { institutionId } } },
      select: { id: true, name: true, class: { select: { name: true } } },
    }),
    prisma.timetableSlot.findMany({
      where: { institutionId, teacherId: teacher.id },
      select: { className: true, sectionName: true },
      distinct: ['className', 'sectionName'],
    }),
  ]);

  for (const s of classTeacherSections) {
    scope.sectionIds.add(s.id);
    scope.classSectionKeys.add(sectionKey(s.class.name, s.name));
  }
  for (const slot of slots) {
    scope.classSectionKeys.add(sectionKey(slot.className, slot.sectionName));
  }
  return scope;
}

/** Throws 403 unless every student belongs to one of the teacher's sections. */
export async function assertTeacherCanMarkStudents(
  institutionId: string,
  userId: string,
  studentIds: string[],
): Promise<void> {
  if (studentIds.length === 0) return;
  const [scope, students] = await Promise.all([
    getTeacherSectionScope(institutionId, userId),
    prisma.student.findMany({
      where: { institutionId, id: { in: [...new Set(studentIds)] } },
      select: { id: true, sectionId: true, class: { select: { name: true } }, section: { select: { name: true } } },
    }),
  ]);

  const outOfScope = findOutOfScopeStudents(
    students.map((s) => ({
      id: s.id,
      sectionId: s.sectionId,
      className: s.class?.name ?? null,
      sectionName: s.section?.name ?? null,
    })),
    scope,
  );
  if (outOfScope.length > 0) {
    throw new ForbiddenError('You can only mark attendance for sections you are assigned to');
  }
}

/** Throws 403 unless the teacher is assigned to this class+section. */
export async function assertTeacherSection(
  institutionId: string,
  userId: string,
  className: string,
  sectionName: string,
): Promise<TeacherSectionScope> {
  const scope = await getTeacherSectionScope(institutionId, userId);
  if (!isSectionInTeacherScope(scope, className, sectionName)) {
    throw new ForbiddenError('You are not assigned to this class/section');
  }
  return scope;
}
