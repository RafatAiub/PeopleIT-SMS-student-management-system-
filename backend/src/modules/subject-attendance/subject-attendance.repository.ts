import { prisma } from '../../config/prisma';

export async function findTeacherByUser(institutionId: string, userId: string) {
  return prisma.teacher.findFirst({ where: { userId, user: { institutionId } }, select: { id: true } });
}

export async function isClassTeacher(institutionId: string, teacherId: string, className: string, sectionName: string) {
  const count = await prisma.section.count({
    where: { classTeacherId: teacherId, name: sectionName, class: { name: className, branch: { institutionId } } },
  });
  return count > 0;
}

export async function findSlots(institutionId: string, className: string, sectionName: string, teacherId?: string) {
  return prisma.timetableSlot.findMany({
    where: { institutionId, className, sectionName, ...(teacherId ? { teacherId } : {}) },
    select: { dayOfWeek: true, startTime: true, endTime: true, subject: true, teacherId: true },
  });
}

export async function findCurriculumSubjects(institutionId: string, className: string) {
  return prisma.subjectOffering.findMany({
    where: { institutionId, className },
    select: { subject: { select: { id: true, name: true } }, displayOrder: true },
    orderBy: { displayOrder: 'asc' },
  });
}

export async function findSubjectByName(institutionId: string, name: string) {
  return prisma.subject.findFirst({
    where: { institutionId, name: { equals: name, mode: 'insensitive' } },
    select: { id: true, name: true },
  });
}

export async function findSectionStudents(institutionId: string, className: string, sectionName: string) {
  return prisma.student.findMany({
    where: { institutionId, status: 'ACTIVE', class: { name: className }, section: { name: sectionName } },
    select: { id: true, studentId: true, firstName: true, lastName: true, rollNumber: true },
    orderBy: { rollNumber: 'asc' },
  });
}

export async function findSessionRecords(
  institutionId: string,
  studentIds: string[],
  subjectName: string,
  date: Date,
  period: number | null,
) {
  return prisma.subjectAttendance.findMany({
    where: { institutionId, studentId: { in: studentIds }, subjectName, date, period },
    select: { id: true, studentId: true, status: true },
  });
}

/**
 * Saves one session. `period` is nullable and Postgres unique indexes treat
 * NULLs as distinct, so a compound-key upsert can't be used — existing rows
 * are updated by id and the rest are created, all in one transaction.
 */
export async function saveSession(params: {
  institutionId: string;
  subjectId: string | null;
  subjectName: string;
  date: Date;
  period: number | null;
  markedByUserId: string;
  records: { studentId: string; status: string }[];
}) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.subjectAttendance.findMany({
      where: {
        institutionId: params.institutionId,
        studentId: { in: params.records.map((r) => r.studentId) },
        subjectName: params.subjectName,
        date: params.date,
        period: params.period,
      },
      select: { id: true, studentId: true },
    });
    const byStudent = new Map(existing.map((e) => [e.studentId, e.id]));
    const toCreate = params.records.filter((r) => !byStudent.has(r.studentId));
    for (const r of params.records) {
      const id = byStudent.get(r.studentId);
      if (id) {
        await tx.subjectAttendance.update({
          where: { id },
          data: { status: r.status, markedByUserId: params.markedByUserId, subjectId: params.subjectId },
        });
      }
    }
    if (toCreate.length) {
      await tx.subjectAttendance.createMany({
        data: toCreate.map((r) => ({
          institutionId: params.institutionId,
          studentId: r.studentId,
          subjectId: params.subjectId,
          subjectName: params.subjectName,
          date: params.date,
          period: params.period,
          status: r.status,
          markedByUserId: params.markedByUserId,
        })),
      });
    }
    return params.records.length;
  });
}

export async function findRecordsInRange(institutionId: string, studentIds: string[], start?: Date, end?: Date) {
  return prisma.subjectAttendance.findMany({
    where: {
      institutionId,
      studentId: { in: studentIds },
      ...(start || end ? { date: { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) } } : {}),
    },
    select: { studentId: true, subjectName: true, status: true, date: true, period: true },
    orderBy: [{ date: 'desc' }, { period: 'asc' }],
  });
}

export async function findStudentByUser(institutionId: string, userId: string) {
  return prisma.student.findFirst({
    where: { institutionId, userId },
    select: { id: true, firstName: true, lastName: true },
  });
}

export async function findStudent(institutionId: string, id: string) {
  return prisma.student.findFirst({
    where: { institutionId, id },
    select: { id: true, firstName: true, lastName: true },
  });
}

export async function findTeacherClassSections(institutionId: string, teacherId: string) {
  const [sections, slots] = await Promise.all([
    prisma.section.findMany({
      where: { classTeacherId: teacherId, class: { branch: { institutionId } } },
      select: { name: true, class: { select: { name: true } } },
    }),
    prisma.timetableSlot.findMany({
      where: { institutionId, teacherId },
      select: { className: true, sectionName: true },
      distinct: ['className', 'sectionName'],
    }),
  ]);
  return { sections, slots };
}
