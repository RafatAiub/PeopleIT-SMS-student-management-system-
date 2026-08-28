import { prisma } from '../../config/prisma';
import type {
  CreateAssignmentInput,
  UpdateAssignmentInput,
  AssignmentQueryDtoType,
} from './assignment.dto';

const creatorInclude = {
  createdBy: {
    select: { id: true, firstName: true, lastName: true, role: true },
  },
  branch: { select: { id: true, name: true } },
  _count: { select: { submissions: true } },
};

export async function create(
  institutionId: string,
  createdByUserId: string,
  data: Omit<CreateAssignmentInput, 'branchId' | 'className' | 'sectionName' | 'dueDate'> & {
    branchId: string;
    className: string;
    sectionName: string;
    dueDate: Date | null;
  },
) {
  return prisma.assignment.create({
    data: {
      ...data,
      institutionId,
      createdByUserId,
    },
    include: creatorInclude,
  });
}

export async function update(
  institutionId: string,
  id: string,
  data: Partial<Omit<UpdateAssignmentInput, 'dueDate'>> & { dueDate?: Date | null },
) {
  return prisma.assignment.update({
    where: { id },
    data,
    include: creatorInclude,
  });
}

export async function findById(institutionId: string, id: string) {
  return prisma.assignment.findFirst({
    where: { id, institutionId },
    include: creatorInclude,
  });
}

export async function findAll(
  institutionId: string,
  query: AssignmentQueryDtoType & { studentUserId?: string },
) {
  const { page, pageSize, branchId, subject, createdByUserId, parentAssignmentId, studentUserId, search } = query;
  const skip = (page - 1) * pageSize;

  let resolvedClassName = query.className;
  let resolvedSectionName = query.sectionName;

  if (studentUserId) {
    const student = await prisma.student.findUnique({
      where: { userId: studentUserId },
      include: { class: true, section: true },
    });
    if (student) {
      if (student.class?.name) resolvedClassName = student.class.name;
      if (student.section?.name) resolvedSectionName = student.section.name;
    }
  }

  const where: any = {
    institutionId,
    // No parentAssignmentId filter given -> top-level assignments only
    // (Postgres treats every NULL as distinct, which is exactly what we
    // want here — an explicit "IS NULL" match). Given one -> only that
    // assignment's submissions.
    parentAssignmentId: parentAssignmentId ?? null,
    ...(branchId ? { branchId } : {}),
    ...(resolvedClassName ? { className: { equals: resolvedClassName, mode: 'insensitive' as const } } : {}),
    ...(resolvedSectionName ? { sectionName: { equals: resolvedSectionName, mode: 'insensitive' as const } } : {}),
    ...(subject ? { subject: { contains: subject, mode: 'insensitive' as const } } : {}),
    ...(createdByUserId ? { createdByUserId } : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: 'insensitive' as const } },
            { subject: { contains: search, mode: 'insensitive' as const } },
            { instructions: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [assignments, total] = await prisma.$transaction([
    prisma.assignment.findMany({
      where,
      include: creatorInclude,
      skip,
      take: pageSize,
      // Teacher-assigned tasks (real dueDate) surface first, soonest due
      // first; Student submissions (no dueDate) sort after by newest first —
      // Postgres puts NULLs last on ASC by default, so this needs no extra
      // null-handling.
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    }),
    prisma.assignment.count({ where }),
  ]);

  return { assignments, total };
}

// One round trip to fetch a single caller's own submissions across a batch
// of assignments — used to attach "have I (or my child) already submitted
// this?" onto each top-level assignment in the Student/Guardian self-service
// view, without an N+1 query per assignment.
export async function findSubmissionsByAuthor(
  institutionId: string,
  parentAssignmentIds: string[],
  createdByUserId: string,
) {
  if (parentAssignmentIds.length === 0) return [];
  return prisma.assignment.findMany({
    where: { institutionId, createdByUserId, parentAssignmentId: { in: parentAssignmentIds } },
  });
}

export async function findSubmission(institutionId: string, parentAssignmentId: string, createdByUserId: string) {
  return prisma.assignment.findFirst({
    where: { institutionId, parentAssignmentId, createdByUserId },
  });
}

export async function remove(institutionId: string, id: string) {
  return prisma.assignment.deleteMany({
    where: { id, institutionId },
  });
}
