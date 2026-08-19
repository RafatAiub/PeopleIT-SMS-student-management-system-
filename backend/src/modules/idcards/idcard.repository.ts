import { prisma } from '../../config/prisma';
import { Prisma } from '@prisma/client';
import type {
  CreateIdCardTemplateDtoType,
  UpdateIdCardTemplateDtoType,
  IdCardQueryDtoType,
} from './idcard.dto';

// =============================================================================
// ID Card Repository — All Prisma queries with select projections
// RULE: Every query MUST include institutionId (passed as parameter)
// =============================================================================

export const templateSelect = {
  id: true,
  institutionId: true,
  title: true,
  applicableTo: true,
  layout: true,
  widthMm: true,
  heightMm: true,
  backgroundImage: true,
  logoImage: true,
  signatureImage: true,
  photoStyle: true,
  photoWidthMm: true,
  photoHeightMm: true,
  primaryColor: true,
  secondaryColor: true,
  showFields: true,
  layoutMode: true,
  canvasElements: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const cardListSelect = {
  id: true,
  templateId: true,
  userType: true,
  studentId: true,
  staffId: true,
  cardNumber: true,
  verifyToken: true,
  issuedAt: true,
  expiresAt: true,
  status: true,
  createdAt: true,
  template: { select: { id: true, title: true } },
  student: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      studentId: true,
      avatarUrl: true,
      class: { select: { id: true, name: true } },
      section: { select: { id: true, name: true } },
    },
  },
  staff: {
    select: {
      id: true,
      employeeId: true,
      department: true,
      designation: true,
      user: { select: { firstName: true, lastName: true, avatarUrl: true, phone: true } },
    },
  },
} as const;

export const cardDetailSelect = {
  ...cardListSelect,
  template: { select: templateSelect },
  student: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      studentId: true,
      avatarUrl: true,
      dateOfBirth: true,
      bloodGroup: true,
      address: true,
      phone: true,
      class: { select: { id: true, name: true } },
      section: { select: { id: true, name: true } },
      guardians: {
        select: {
          relationship: true,
          guardian: { select: { firstName: true, lastName: true, relationship: true } },
        },
      },
    },
  },
  staff: {
    select: {
      id: true,
      employeeId: true,
      department: true,
      designation: true,
      user: { select: { firstName: true, lastName: true, avatarUrl: true, phone: true } },
    },
  },
} as const;

// ── Templates ────────────────────────────────────────────────────────────────

export async function findTemplates(institutionId: string) {
  return prisma.idCardTemplate.findMany({
    where: { institutionId },
    select: templateSelect,
    orderBy: { createdAt: 'desc' },
  });
}

export async function findTemplateById(institutionId: string, id: string) {
  return prisma.idCardTemplate.findFirst({
    where: { id, institutionId },
    select: templateSelect,
  });
}

// Json? columns don't accept a plain `null` in Prisma's typed input (it's
// ambiguous with "field omitted") — Prisma.JsonNull is the explicit "set to
// SQL NULL" sentinel. undefined (field omitted from the DTO) passes through
// unchanged so partial updates don't touch canvasElements.
function jsonInput(value: unknown) {
  if (value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue | undefined;
}

export async function createTemplate(
  institutionId: string,
  data: CreateIdCardTemplateDtoType,
) {
  return prisma.$transaction(async (tx) => {
    if (data.isActive) {
      await tx.idCardTemplate.updateMany({
        where: { institutionId, applicableTo: data.applicableTo, isActive: true },
        data: { isActive: false },
      });
    }
    return tx.idCardTemplate.create({
      data: {
        ...data,
        institutionId,
        canvasElements: jsonInput(data.canvasElements),
      },
      select: templateSelect,
    });
  });
}

export async function updateTemplate(
  institutionId: string,
  id: string,
  data: UpdateIdCardTemplateDtoType,
  applicableTo: 'STUDENT' | 'STAFF',
) {
  return prisma.$transaction(async (tx) => {
    if (data.isActive) {
      await tx.idCardTemplate.updateMany({
        where: { institutionId, applicableTo, isActive: true, NOT: { id } },
        data: { isActive: false },
      });
    }
    const result = await tx.idCardTemplate.updateMany({
      where: { id, institutionId },
      data: { ...data, institutionId, canvasElements: jsonInput(data.canvasElements) },
    });
    if (result.count === 0) return null;
    return tx.idCardTemplate.findFirst({ where: { id, institutionId }, select: templateSelect });
  });
}

export async function removeTemplate(institutionId: string, id: string) {
  return prisma.idCardTemplate.deleteMany({ where: { id, institutionId } });
}

// ── Cards ────────────────────────────────────────────────────────────────────

export async function countCardsForInstitution(institutionId: string) {
  return prisma.idCard.count({ where: { institutionId } });
}

export async function countCardsForTemplate(institutionId: string, templateId: string) {
  return prisma.idCard.count({ where: { institutionId, templateId } });
}

export async function findActiveCardForStudent(institutionId: string, studentId: string) {
  return prisma.idCard.findFirst({
    where: { institutionId, studentId, status: 'ACTIVE' },
    select: { id: true },
  });
}

export async function findActiveCardForStaff(institutionId: string, staffId: string) {
  return prisma.idCard.findFirst({
    where: { institutionId, staffId, status: 'ACTIVE' },
    select: { id: true },
  });
}

export async function revokeCardTx(tx: Prisma.TransactionClient, id: string) {
  return tx.idCard.update({ where: { id }, data: { status: 'REVOKED' } });
}

export async function createCardTx(
  tx: Prisma.TransactionClient,
  data: {
    institutionId: string;
    templateId: string;
    userType: 'STUDENT' | 'STAFF';
    studentId?: string | null;
    staffId?: string | null;
    cardNumber: string;
    expiresAt?: Date | null;
  },
) {
  return tx.idCard.create({
    data,
    select: cardListSelect,
  });
}

export async function findCards(institutionId: string, query: IdCardQueryDtoType) {
  const { page, pageSize, classId, department, userType, status } = query;
  const skip = (page - 1) * pageSize;

  const where: Prisma.IdCardWhereInput = {
    institutionId,
    ...(userType ? { userType } : {}),
    ...(status ? { status } : {}),
    ...(classId ? { student: { classId } } : {}),
    ...(department ? { staff: { department } } : {}),
  };

  const [cards, total] = await prisma.$transaction([
    prisma.idCard.findMany({
      where,
      select: cardListSelect,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.idCard.count({ where }),
  ]);

  return { cards, total };
}

export async function findCardById(institutionId: string, id: string) {
  return prisma.idCard.findFirst({
    where: { id, institutionId },
    select: cardDetailSelect,
  });
}

export async function findLatestActiveCardByStudentUserId(institutionId: string, userId: string) {
  return prisma.idCard.findFirst({
    where: { institutionId, status: 'ACTIVE', student: { userId } },
    select: cardDetailSelect,
    orderBy: { issuedAt: 'desc' },
  });
}

export async function findLatestActiveCardByStaffUserId(institutionId: string, userId: string) {
  return prisma.idCard.findFirst({
    where: { institutionId, status: 'ACTIVE', staff: { userId } },
    select: cardDetailSelect,
    orderBy: { issuedAt: 'desc' },
  });
}

export async function updateCardStatus(institutionId: string, id: string, status: string) {
  const result = await prisma.idCard.updateMany({
    where: { id, institutionId },
    data: { status },
  });
  if (result.count === 0) return null;
  return prisma.idCard.findFirst({ where: { id, institutionId }, select: cardDetailSelect });
}

// Public — NOT tenant scoped (verification is deliberately cross-tenant by
// design: the QR code only carries the opaque verifyToken, which is globally
// unique, so an institutionId isn't available/needed to look it up).
export async function findByVerifyToken(token: string) {
  return prisma.idCard.findUnique({
    where: { verifyToken: token },
    select: {
      id: true,
      cardNumber: true,
      status: true,
      issuedAt: true,
      expiresAt: true,
      userType: true,
      institution: { select: { name: true, logoUrl: true } },
      student: {
        select: {
          firstName: true,
          lastName: true,
          avatarUrl: true,
          class: { select: { name: true } },
          section: { select: { name: true } },
        },
      },
      staff: {
        select: {
          designation: true,
          department: true,
          user: { select: { firstName: true, lastName: true, avatarUrl: true } },
        },
      },
    },
  });
}
