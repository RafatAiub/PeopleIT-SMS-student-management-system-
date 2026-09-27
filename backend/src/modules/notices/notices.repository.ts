import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { NotFoundError, ValidationError } from '../../utils/AppError';
import type { NoticeQueryDtoType } from './notices.dto';

// Class/section names ride along so the board can show "Class 6 · A" badges.
const noticeInclude = {
  class: { select: { id: true, name: true } },
  section: { select: { id: true, name: true } },
} as const;

export async function create(institutionId: string, data: Omit<Prisma.NoticeUncheckedCreateInput, 'institutionId'>) {
  return prisma.notice.create({
    data: {
      ...data,
      institutionId,
    },
    include: noticeInclude,
  });
}

export async function update(
  institutionId: string,
  id: string,
  data: Prisma.NoticeUncheckedUpdateInput,
) {
  return prisma.notice.update({
    where: { id },
    data,
    include: noticeInclude,
  });
}

export async function findById(institutionId: string, id: string, visibility?: Prisma.NoticeWhereInput) {
  return prisma.notice.findFirst({
    where: { id, institutionId, ...(visibility ? { AND: [visibility] } : {}) },
    include: noticeInclude,
  });
}

export async function findAll(
  institutionId: string,
  query: NoticeQueryDtoType,
  visibility?: Prisma.NoticeWhereInput,
) {
  const { page, pageSize, search, audience, isActive, classId, sectionId, visibility: staffVisibility } = query;
  const skip = (page - 1) * pageSize;
  const now = new Date();

  const and: Prisma.NoticeWhereInput[] = [];
  if (visibility) and.push(visibility);
  if (staffVisibility === 'scheduled') and.push({ scheduledAt: { gt: now } });
  if (staffVisibility === 'published') and.push({ OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }] });

  const where: Prisma.NoticeWhereInput = {
    institutionId,
    ...(audience ? { audience } : {}),
    ...(isActive !== undefined ? { isActive } : {}),
    ...(classId ? { classId } : {}),
    ...(sectionId ? { sectionId } : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: 'insensitive' as const } },
            { content: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
    ...(and.length ? { AND: and } : {}),
  };

  const [notices, total] = await prisma.$transaction([
    prisma.notice.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { publishedAt: 'desc' },
      include: noticeInclude,
    }),
    prisma.notice.count({ where }),
  ]);

  return { notices, total };
}

export async function remove(institutionId: string, id: string) {
  return prisma.notice.deleteMany({
    where: { id, institutionId },
  });
}

// ── Viewer placement (who is in which class/section) ────────────────────────

export interface Placement {
  classId: string | null;
  sectionId: string | null;
}

/** The class/section of a STUDENT login, or of every child linked to a GUARDIAN login. */
export async function findViewerPlacements(
  institutionId: string,
  userId: string,
  role: string,
): Promise<Placement[]> {
  if (role === 'STUDENT') {
    const student = await prisma.student.findFirst({
      where: { institutionId, userId },
      select: { classId: true, sectionId: true },
    });
    return student ? [student] : [];
  }
  if (role === 'GUARDIAN') {
    const guardian = await prisma.guardian.findFirst({
      where: { institutionId, userId },
      select: { students: { select: { student: { select: { classId: true, sectionId: true } } } } },
    });
    return guardian?.students.map((s) => s.student) ?? [];
  }
  return [];
}

export async function assertClassSection(
  institutionId: string,
  classId: string | null | undefined,
  sectionId: string | null | undefined,
): Promise<{ classId: string | null; sectionId: string | null }> {
  let resolvedClassId = classId ?? null;
  if (sectionId) {
    const section = await prisma.section.findFirst({
      where: { id: sectionId, class: { branch: { institutionId } } },
      select: { id: true, classId: true },
    });
    if (!section) throw new NotFoundError('Section not found');
    if (resolvedClassId && resolvedClassId !== section.classId) {
      throw new ValidationError('The section does not belong to the selected class');
    }
    resolvedClassId = section.classId;
  }
  if (resolvedClassId) {
    const cls = await prisma.class.findFirst({
      where: { id: resolvedClassId, branch: { institutionId } },
      select: { id: true },
    });
    if (!cls) throw new NotFoundError('Class not found');
  }
  return { classId: resolvedClassId, sectionId: sectionId ?? null };
}
