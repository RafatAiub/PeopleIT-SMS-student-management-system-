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
};

export async function create(
  institutionId: string,
  createdByUserId: string,
  data: Omit<CreateAssignmentInput, 'branchId' | 'className' | 'sectionName'> & {
    branchId: string;
    className: string;
    sectionName: string;
  },
) {
  return prisma.assignment.create({
    data: {
      ...data,
      dueDate: new Date(data.dueDate),
      institutionId,
      createdByUserId,
    },
    include: creatorInclude,
  });
}

export async function update(
  institutionId: string,
  id: string,
  data: Partial<UpdateAssignmentInput>,
) {
  const { dueDate, ...rest } = data;
  return prisma.assignment.update({
    where: { id },
    data: {
      ...rest,
      ...(dueDate ? { dueDate: new Date(dueDate) } : {}),
    },
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
  const { page, pageSize, branchId, subject, createdByUserId, studentUserId, search } = query;
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
      orderBy: { dueDate: 'asc' },
    }),
    prisma.assignment.count({ where }),
  ]);

  return { assignments, total };
}

export async function remove(institutionId: string, id: string) {
  return prisma.assignment.deleteMany({
    where: { id, institutionId },
  });
}
