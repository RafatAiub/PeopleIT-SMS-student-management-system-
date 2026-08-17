import { prisma } from '../../config/prisma';
import type {
  CreateLectureMaterialInput,
  UpdateLectureMaterialInput,
  LectureMaterialQueryDtoType,
} from './lecture.dto';

const uploaderInclude = {
  uploadedBy: {
    select: { id: true, firstName: true, lastName: true, role: true },
  },
  branch: { select: { id: true, name: true } },
  _count: { select: { comments: true } },
};

export async function create(
  institutionId: string,
  uploadedByUserId: string,
  data: Omit<CreateLectureMaterialInput, 'branchId' | 'className' | 'sectionName'> & {
    branchId: string;
    className: string;
    sectionName: string;
  },
) {
  return prisma.lectureMaterial.create({
    data: {
      ...data,
      institutionId,
      uploadedByUserId,
    },
    include: uploaderInclude,
  });
}

export async function update(
  institutionId: string,
  id: string,
  data: Partial<UpdateLectureMaterialInput>,
) {
  return prisma.lectureMaterial.update({
    where: { id },
    data,
    include: uploaderInclude,
  });
}

export async function findById(institutionId: string, id: string) {
  return prisma.lectureMaterial.findFirst({
    where: { id, institutionId },
    include: uploaderInclude,
  });
}

export async function findAll(
  institutionId: string,
  query: LectureMaterialQueryDtoType & { studentUserId?: string },
) {
  const { page, pageSize, branchId, subject, uploadedByUserId, studentUserId, search } = query;
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
    ...(uploadedByUserId ? { uploadedByUserId } : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: 'insensitive' as const } },
            { subject: { contains: search, mode: 'insensitive' as const } },
            { description: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [materials, total] = await prisma.$transaction([
    prisma.lectureMaterial.findMany({
      where,
      include: uploaderInclude,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.lectureMaterial.count({ where }),
  ]);

  return { materials, total };
}

export async function remove(institutionId: string, id: string) {
  return prisma.lectureMaterial.deleteMany({
    where: { id, institutionId },
  });
}

const commentAuthorInclude = {
  author: { select: { id: true, firstName: true, lastName: true, role: true } },
};

export async function createComment(
  institutionId: string,
  lectureMaterialId: string,
  authorUserId: string,
  content: string,
) {
  return prisma.lectureMaterialComment.create({
    data: { institutionId, lectureMaterialId, authorUserId, content },
    include: commentAuthorInclude,
  });
}

export async function findComments(institutionId: string, lectureMaterialId: string) {
  return prisma.lectureMaterialComment.findMany({
    where: { institutionId, lectureMaterialId },
    include: commentAuthorInclude,
    orderBy: { createdAt: 'asc' },
  });
}

export async function findCommentById(institutionId: string, commentId: string) {
  return prisma.lectureMaterialComment.findFirst({
    where: { id: commentId, institutionId },
  });
}

export async function removeComment(institutionId: string, commentId: string) {
  return prisma.lectureMaterialComment.deleteMany({
    where: { id: commentId, institutionId },
  });
}
