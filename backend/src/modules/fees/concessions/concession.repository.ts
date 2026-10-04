import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/prisma';

const concessionInclude = {
  feeCategory: { select: { id: true, name: true } },
  _count: { select: { studentConcessions: true } },
} satisfies Prisma.ConcessionInclude;

export async function listConcessions(
  institutionId: string,
  q: { page: number; pageSize: number; search?: string; includeInactive?: boolean },
) {
  const where: Prisma.ConcessionWhereInput = {
    institutionId,
    ...(q.includeInactive ? {} : { isActive: true }),
    ...(q.search ? { name: { contains: q.search, mode: 'insensitive' } } : {}),
  };
  const [total, items] = await prisma.$transaction([
    prisma.concession.count({ where }),
    prisma.concession.findMany({
      where,
      include: concessionInclude,
      orderBy: { name: 'asc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
  ]);
  return { total, items };
}

export async function findConcession(institutionId: string, id: string) {
  return prisma.concession.findFirst({ where: { id, institutionId }, include: concessionInclude });
}

export async function createConcession(institutionId: string, data: Omit<Prisma.ConcessionUncheckedCreateInput, 'institutionId'>) {
  return prisma.concession.create({ data: { ...data, institutionId }, include: concessionInclude });
}

export async function updateConcession(id: string, data: Prisma.ConcessionUncheckedUpdateInput) {
  return prisma.concession.update({ where: { id }, data, include: concessionInclude });
}

export async function deleteConcession(id: string) {
  return prisma.concession.delete({ where: { id } });
}

const assignmentInclude = {
  concession: { select: { id: true, name: true, type: true, value: true, feeCategoryId: true, isActive: true, feeCategory: { select: { id: true, name: true } } } },
  student: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      studentId: true,
      class: { select: { name: true } },
      section: { select: { name: true } },
    },
  },
} satisfies Prisma.StudentConcessionInclude;

export async function listAssignments(
  institutionId: string,
  q: { page: number; pageSize: number; studentId?: string; concessionId?: string; search?: string },
) {
  const where: Prisma.StudentConcessionWhereInput = {
    institutionId,
    ...(q.studentId ? { studentId: q.studentId } : {}),
    ...(q.concessionId ? { concessionId: q.concessionId } : {}),
    ...(q.search
      ? {
          student: {
            OR: [
              { firstName: { contains: q.search, mode: 'insensitive' } },
              { lastName: { contains: q.search, mode: 'insensitive' } },
              { studentId: { contains: q.search, mode: 'insensitive' } },
            ],
          },
        }
      : {}),
  };
  const [total, items] = await prisma.$transaction([
    prisma.studentConcession.count({ where }),
    prisma.studentConcession.findMany({
      where,
      include: assignmentInclude,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
  ]);
  return { total, items };
}

export async function findAssignment(institutionId: string, id: string) {
  return prisma.studentConcession.findFirst({ where: { id, institutionId } });
}

export async function findAssignmentByPair(institutionId: string, studentId: string, concessionId: string) {
  return prisma.studentConcession.findFirst({ where: { institutionId, studentId, concessionId } });
}

export async function createAssignment(data: Prisma.StudentConcessionUncheckedCreateInput) {
  return prisma.studentConcession.create({ data, include: assignmentInclude });
}

export async function updateAssignment(id: string, data: Prisma.StudentConcessionUncheckedUpdateInput) {
  return prisma.studentConcession.update({ where: { id }, data, include: assignmentInclude });
}

export async function deleteAssignment(id: string) {
  return prisma.studentConcession.delete({ where: { id } });
}

/** Active (concession.isActive) assignments for a set of students — validity window is filtered by the caller. */
export async function findActiveAssignmentsForStudents(institutionId: string, studentIds: string[]) {
  if (studentIds.length === 0) return [];
  return prisma.studentConcession.findMany({
    where: { institutionId, studentId: { in: studentIds }, concession: { isActive: true, institutionId } },
    include: {
      concession: { select: { id: true, name: true, type: true, value: true, feeCategoryId: true } },
    },
  });
}
