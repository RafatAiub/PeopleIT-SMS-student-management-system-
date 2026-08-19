import * as idCardRepository from './idcard.repository';
import { prisma } from '../../config/prisma';
import { NotFoundError, BadRequestError, ForbiddenError, ConflictError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import { renderIdCardPdf, type IdCardPdfData } from './idcard.pdf';
import type {
  CreateIdCardTemplateDtoType,
  UpdateIdCardTemplateDtoType,
  GenerateIdCardsDtoType,
  IdCardQueryDtoType,
} from './idcard.dto';

// =============================================================================
// ID Card Service — Business logic layer
// institutionId ALWAYS comes from req.tenantId (never from body)
// =============================================================================

// ── Templates ────────────────────────────────────────────────────────────────

export async function listTemplates(institutionId: string) {
  return idCardRepository.findTemplates(institutionId);
}

export async function createTemplate(institutionId: string, data: CreateIdCardTemplateDtoType) {
  const template = await idCardRepository.createTemplate(institutionId, data);
  logger.info('ID card template created', { templateId: template.id, institutionId });
  return template;
}

export async function updateTemplate(
  institutionId: string,
  id: string,
  data: UpdateIdCardTemplateDtoType,
) {
  const existing = await idCardRepository.findTemplateById(institutionId, id);
  if (!existing) {
    throw new NotFoundError(`ID card template with ID '${id}' not found`);
  }

  const applicableTo = data.applicableTo ?? existing.applicableTo;
  const updated = await idCardRepository.updateTemplate(institutionId, id, data, applicableTo);
  logger.info('ID card template updated', { templateId: id, institutionId });
  return updated;
}

export async function deleteTemplate(institutionId: string, id: string) {
  const existing = await idCardRepository.findTemplateById(institutionId, id);
  if (!existing) {
    throw new NotFoundError(`ID card template with ID '${id}' not found`);
  }

  // The database's own FK constraint (IdCard.templateId -> IdCardTemplate,
  // ON DELETE RESTRICT) already refuses this at the SQL level — on purpose,
  // since a scanned/verified physical card must keep resolving even after
  // its template is retired. Checking here first turns that into a clear,
  // actionable error instead of a raw Postgres constraint-violation message
  // (which `prisma.deleteMany()` doesn't classify as cleanly as `delete()`
  // does, and was leaking straight through to the client as a 500).
  const issuedCount = await idCardRepository.countCardsForTemplate(institutionId, id);
  if (issuedCount > 0) {
    throw new ConflictError(
      `This template has already been used to generate ${issuedCount} ID card${issuedCount === 1 ? '' : 's'}, so deleting it would break verification for those cards. Switch it to inactive instead, or revoke those cards first if you really need to remove it.`,
    );
  }

  await idCardRepository.removeTemplate(institutionId, id);
  logger.info('ID card template deleted', { templateId: id, institutionId });
}

// ── Card generation ──────────────────────────────────────────────────────────

async function nextCardNumber(institutionId: string): Promise<string> {
  const institution = await prisma.institution.findUnique({
    where: { id: institutionId },
    select: { slug: true },
  });
  const count = await idCardRepository.countCardsForInstitution(institutionId);
  const year = new Date().getFullYear();
  const sequence = String(count + 1).padStart(6, '0');
  return `${(institution?.slug || 'SCH').toUpperCase()}-${year}-${sequence}`;
}

export async function generateCards(institutionId: string, dto: GenerateIdCardsDtoType) {
  const template = await idCardRepository.findTemplateById(institutionId, dto.templateId);
  if (!template) {
    throw new NotFoundError(`ID card template with ID '${dto.templateId}' not found`);
  }

  const results: unknown[] = [];

  if (dto.studentIds && dto.studentIds.length > 0) {
    if (template.applicableTo !== 'STUDENT') {
      throw new BadRequestError('This template is not applicable to students');
    }
    for (const studentId of dto.studentIds) {
      const student = await prisma.student.findFirst({
        where: { id: studentId, institutionId },
        select: { id: true, academicYear: { select: { endDate: true } } },
      });
      if (!student) {
        logger.warn('ID card generate: student not found, skipping', { studentId, institutionId });
        continue;
      }

      const cardNumber = await nextCardNumber(institutionId);
      const card = await prisma.$transaction(async (tx) => {
        const activeCard = await idCardRepository.findActiveCardForStudent(institutionId, studentId);
        if (activeCard) {
          await idCardRepository.revokeCardTx(tx, activeCard.id);
        }
        return idCardRepository.createCardTx(tx, {
          institutionId,
          templateId: template.id,
          userType: 'STUDENT',
          studentId,
          cardNumber,
          expiresAt: student.academicYear?.endDate ?? null,
        });
      });
      results.push(card);
    }
  }

  if (dto.staffIds && dto.staffIds.length > 0) {
    if (template.applicableTo !== 'STAFF') {
      throw new BadRequestError('This template is not applicable to staff');
    }
    for (const staffId of dto.staffIds) {
      const staff = await prisma.staffProfile.findFirst({
        where: { id: staffId, institutionId },
        select: { id: true },
      });
      if (!staff) {
        logger.warn('ID card generate: staff not found, skipping', { staffId, institutionId });
        continue;
      }

      const cardNumber = await nextCardNumber(institutionId);
      const card = await prisma.$transaction(async (tx) => {
        const activeCard = await idCardRepository.findActiveCardForStaff(institutionId, staffId);
        if (activeCard) {
          await idCardRepository.revokeCardTx(tx, activeCard.id);
        }
        return idCardRepository.createCardTx(tx, {
          institutionId,
          templateId: template.id,
          userType: 'STAFF',
          staffId,
          cardNumber,
          expiresAt: null,
        });
      });
      results.push(card);
    }
  }

  logger.info('ID cards generated', { institutionId, count: results.length, templateId: template.id });
  return results;
}

// ── Listing / retrieval ──────────────────────────────────────────────────────

export async function listCards(institutionId: string, query: IdCardQueryDtoType) {
  return idCardRepository.findCards(institutionId, query);
}

export async function getCardById(institutionId: string, id: string) {
  const card = await idCardRepository.findCardById(institutionId, id);
  if (!card) {
    throw new NotFoundError(`ID card with ID '${id}' not found`);
  }
  return card;
}

// Roles that map to a StaffProfile row (mirrors the roles the HR module
// treats as "staff" — everything with a login except STUDENT/GUARDIAN).
const STAFF_LIKE_ROLES = new Set([
  'ADMIN',
  'TEACHER',
  'ACCOUNTANT',
  'LIBRARIAN',
  'TRANSPORT_OFFICER',
  'MANAGEMENT',
]);

export async function getMyCard(institutionId: string, userId: string, role: string) {
  if (role === 'STUDENT') {
    const card = await idCardRepository.findLatestActiveCardByStudentUserId(institutionId, userId);
    if (!card) {
      throw new NotFoundError('No active ID card found for your account');
    }
    return card;
  }

  if (STAFF_LIKE_ROLES.has(role)) {
    const card = await idCardRepository.findLatestActiveCardByStaffUserId(institutionId, userId);
    if (!card) {
      throw new NotFoundError('No active ID card found for your account');
    }
    return card;
  }

  throw new ForbiddenError('ID cards are not issued for this account type');
}

// ── PDF generation ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toPdfData(card: any): IdCardPdfData {
  return {
    cardNumber: card.cardNumber,
    verifyToken: card.verifyToken,
    issuedAt: card.issuedAt,
    expiresAt: card.expiresAt,
    userType: card.userType,
    template: {
      layout: card.template.layout,
      widthMm: card.template.widthMm,
      heightMm: card.template.heightMm,
      backgroundImage: card.template.backgroundImage,
      logoImage: card.template.logoImage,
      signatureImage: card.template.signatureImage,
      photoStyle: card.template.photoStyle,
      photoWidthMm: card.template.photoWidthMm,
      photoHeightMm: card.template.photoHeightMm,
      primaryColor: card.template.primaryColor,
      secondaryColor: card.template.secondaryColor,
      showFields: (card.template.showFields as Record<string, boolean>) || {},
      layoutMode: card.template.layoutMode,
      canvasElements: (card.template.canvasElements as IdCardPdfData['template']['canvasElements']) || null,
    },
    student: card.student ?? null,
    staff: card.staff ?? null,
  };
}

export async function getCardPdf(institutionId: string, id: string) {
  const card = await idCardRepository.findCardById(institutionId, id);
  if (!card) {
    throw new NotFoundError(`ID card with ID '${id}' not found`);
  }
  const pdf = await renderIdCardPdf(toPdfData(card));
  return { pdf, filename: `idcard-${card.cardNumber}.pdf` };
}

export async function getMyCardPdf(institutionId: string, userId: string, role: string) {
  const card = await getMyCard(institutionId, userId, role);
  const pdf = await renderIdCardPdf(toPdfData(card));
  return { pdf, filename: `idcard-${card.cardNumber}.pdf` };
}

export async function revokeCard(institutionId: string, id: string) {
  const updated = await idCardRepository.updateCardStatus(institutionId, id, 'REVOKED');
  if (!updated) {
    throw new NotFoundError(`ID card with ID '${id}' not found`);
  }
  logger.info('ID card revoked', { cardId: id, institutionId });
  return updated;
}

// ── Public verification (no tenant scoping) ─────────────────────────────────

export interface PublicVerifyInfo {
  institution: { name: string; logoUrl: string | null };
  holderName: string;
  holderPhoto: string | null;
  classOrDesignation: string;
  cardNumber: string;
  status: string;
  issuedAt: Date;
  expiresAt: Date | null;
}

export async function getVerifyInfo(token: string): Promise<PublicVerifyInfo> {
  const card = await idCardRepository.findByVerifyToken(token);
  if (!card) {
    throw new NotFoundError('ID card not found for this verification link');
  }

  let holderName = '';
  let holderPhoto: string | null = null;
  let classOrDesignation = '';

  if (card.userType === 'STUDENT' && card.student) {
    holderName = `${card.student.firstName} ${card.student.lastName}`;
    holderPhoto = card.student.avatarUrl;
    const cls = card.student.class?.name;
    const section = card.student.section?.name;
    classOrDesignation = [cls, section].filter(Boolean).join(' - ');
  } else if (card.userType === 'STAFF' && card.staff) {
    holderName = `${card.staff.user.firstName} ${card.staff.user.lastName}`;
    holderPhoto = card.staff.user.avatarUrl;
    classOrDesignation = [card.staff.designation, card.staff.department].filter(Boolean).join(' - ');
  }

  return {
    institution: { name: card.institution.name, logoUrl: card.institution.logoUrl },
    holderName,
    holderPhoto,
    classOrDesignation,
    cardNumber: card.cardNumber,
    status: card.status,
    issuedAt: card.issuedAt,
    expiresAt: card.expiresAt,
  };
}
