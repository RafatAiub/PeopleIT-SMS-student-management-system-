import { prisma } from '../../config/prisma';
import type { CreateGuardianDtoType, UpdateGuardianDtoType, GuardianQueryDtoType, LinkGuardianDtoType } from './guardian.dto';

// =============================================================================
// Guardian Repository — All queries scoped by institutionId
// =============================================================================

const guardianSelect = {
  id: true,
  firstName: true,
  lastName: true,
  relationship: true,
  phone: true,
  email: true,
  occupation: true,
  nidNumber: true,
  createdAt: true,
} as const;

export async function findAll(institutionId: string, query: GuardianQueryDtoType) {
  const { page, pageSize, search } = query;
  const skip = (page - 1) * pageSize;

  const where = {
    institutionId,
    ...(search
      ? {
          OR: [
            { firstName: { contains: search, mode: 'insensitive' as const } },
            { lastName: { contains: search, mode: 'insensitive' as const } },
            { phone: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [guardians, total] = await prisma.$transaction([
    prisma.guardian.findMany({
      where,
      select: guardianSelect,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.guardian.count({ where }),
  ]);

  return { guardians, total };
}

export async function findById(institutionId: string, id: string) {
  return prisma.guardian.findFirst({
    where: { id, institutionId },
    select: {
      ...guardianSelect,
      students: {
        select: {
          isPrimary: true,
          relationship: true,
          student: {
            select: {
              id: true,
              studentId: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      },
    },
  });
}

export async function create(institutionId: string, data: CreateGuardianDtoType) {
  return prisma.guardian.create({
    data: { ...data, institutionId },
    select: guardianSelect,
  });
}

export async function update(institutionId: string, id: string, data: UpdateGuardianDtoType) {
  return prisma.guardian.update({
    where: { id },
    data: { ...data, institutionId },
    select: guardianSelect,
  });
}

export async function remove(institutionId: string, id: string) {
  return prisma.guardian.deleteMany({ where: { id, institutionId } });
}

export async function linkToStudent(
  guardianId: string,
  studentId: string,
  data: LinkGuardianDtoType,
) {
  return prisma.guardianStudent.create({
    data: {
      guardianId,
      studentId,
      relationship: data.relationship,
      isPrimary: data.isPrimary,
    },
  });
}

export async function unlinkFromStudent(guardianId: string, studentId: string) {
  return prisma.guardianStudent.deleteMany({
    where: { guardianId, studentId },
  });
}

// Resolves the studentIds linked to a GUARDIAN's own login (req.user.sub),
// scoped to their institution. Used for self-service ownership checks
// (e.g. fee invoices) — never trust a client-supplied studentId instead.
export async function findLinkedStudentIdsByUserId(institutionId: string, userId: string): Promise<string[]> {
  const guardian = await prisma.guardian.findFirst({
    where: { userId, institutionId },
    select: {
      students: {
        select: { studentId: true },
      },
    },
  });
  return guardian?.students.map((s) => s.studentId) ?? [];
}

// Richer variant for the guardian's own "my children" UI — full student
// summaries, not just ids.
export async function findLinkedStudentSummariesByUserId(institutionId: string, userId: string) {
  const guardian = await prisma.guardian.findFirst({
    where: { userId, institutionId },
    select: {
      students: {
        select: {
          isPrimary: true,
          student: {
            select: {
              id: true,
              studentId: true,
              firstName: true,
              lastName: true,
              avatarUrl: true,
              class: { select: { name: true } },
              section: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  return (guardian?.students ?? []).map((s) => ({ ...s.student, isPrimary: s.isPrimary }));
}
