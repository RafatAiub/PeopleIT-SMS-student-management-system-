import { prisma } from '../../config/prisma';
import type {
  CreateStudentDtoType,
  UpdateStudentDtoType,
  StudentQueryDtoType,
  CreateStudentDocumentDtoType,
} from './student.dto';

// =============================================================================
// Student Repository — All Prisma queries with select projections
// RULE: Every query MUST include institutionId (passed as parameter)
// =============================================================================

// Shared select projection for list views (lean)
const studentListSelect = {
  id: true,
  studentId: true,
  firstName: true,
  lastName: true,
  gender: true,
  status: true,
  phone: true,
  email: true,
  admissionDate: true,
  rollNumber: true,
  dateOfBirth: true,
  bloodGroup: true,
  religion: true,
  nationality: true,
  department: true,
  address: true,
  avatarUrl: true,
  user: { select: { avatarUrl: true } },
  class: { select: { id: true, name: true } },
  section: { select: { id: true, name: true } },
  branch: { select: { id: true, name: true } },
} as const;

// Full projection for single student view — exported so student.service.ts
// can reuse it when creating a student inside a $transaction (bypassing this
// module's own `prisma` client to stay on the transaction's tx client).
export const studentDetailSelect = {
  id: true,
  studentId: true,
  firstName: true,
  lastName: true,
  dateOfBirth: true,
  gender: true,
  phone: true,
  email: true,
  address: true,
  bloodGroup: true,
  religion: true,
  nationality: true,
  department: true,
  avatarUrl: true,
  status: true,
  admissionDate: true,
  rollNumber: true,
  createdAt: true,
  updatedAt: true,
  class: { select: { id: true, name: true, level: true } },
  section: { select: { id: true, name: true } },
  branch: { select: { id: true, name: true } },
  academicYear: { select: { id: true, label: true } },
  guardians: {
    select: {
      isPrimary: true,
      relationship: true,
      guardian: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          email: true,
          relationship: true,
        },
      },
    },
  },
} as const;

export async function findAll(
  institutionId: string,
  query: StudentQueryDtoType,
) {
  const { page, pageSize, search, classId, sectionId, branchId, academicYearId, status } = query;
  const skip = (page - 1) * pageSize;

  const where = {
    institutionId,
    ...(classId ? { classId } : {}),
    ...(sectionId ? { sectionId } : {}),
    ...(branchId ? { branchId } : {}),
    ...(academicYearId ? { academicYearId } : {}),
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            { firstName: { contains: search, mode: 'insensitive' as const } },
            { lastName: { contains: search, mode: 'insensitive' as const } },
            { studentId: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
            { phone: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [students, total] = await prisma.$transaction([
    prisma.student.findMany({
      where,
      select: studentListSelect,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.student.count({ where }),
  ]);

  return { students, total };
}

export async function findById(institutionId: string, id: string) {
  return prisma.student.findFirst({
    where: { id, institutionId },
    select: studentDetailSelect,
  });
}

export async function findByStudentId(institutionId: string, studentId: string) {
  return prisma.student.findFirst({
    where: { institutionId, studentId },
    select: { id: true },
  });
}

// Resolves a STUDENT-role login's own studentId for self-service ownership
// checks (e.g. fee invoices) — never trust a client-supplied studentId instead.
export async function findByUserId(institutionId: string, userId: string) {
  return prisma.student.findFirst({
    where: { institutionId, userId },
    select: { id: true },
  });
}

export async function create(institutionId: string, data: CreateStudentDtoType) {
  return prisma.student.create({
    data: {
      ...data,
      institutionId,
    },
    select: studentDetailSelect,
  });
}

export async function update(
  institutionId: string,
  id: string,
  data: UpdateStudentDtoType,
) {
  // Scope the write itself to the tenant (defense in depth, not just the
  // service-layer existence check) — matches remove()'s pattern below.
  const result = await prisma.student.updateMany({
    where: { id, institutionId },
    data: {
      ...data,
      // Prevent tenant escape — institutionId cannot be changed
      institutionId,
    },
  });
  if (result.count === 0) {
    return null;
  }
  return prisma.student.findFirst({
    where: { id, institutionId },
    select: studentDetailSelect,
  });
}

export async function remove(institutionId: string, id: string) {
  // Verify ownership before delete
  return prisma.student.deleteMany({
    where: { id, institutionId },
  });
}

// ── Documents ─────────────────────────────────────────────────────────────────

export async function findDocuments(institutionId: string, studentId: string) {
  return prisma.studentDocument.findMany({
    where: { studentId, institutionId },
    select: {
      id: true,
      name: true,
      type: true,
      fileUrl: true,
      fileSize: true,
      mimeType: true,
      uploadedAt: true,
    },
    orderBy: { uploadedAt: 'desc' },
  });
}

export async function createDocument(
  institutionId: string,
  studentId: string,
  data: CreateStudentDocumentDtoType,
) {
  return prisma.studentDocument.create({
    data: {
      ...data,
      institutionId,
      studentId,
    },
    select: {
      id: true,
      name: true,
      type: true,
      fileUrl: true,
      fileSize: true,
      mimeType: true,
      uploadedAt: true,
    },
  });
}
