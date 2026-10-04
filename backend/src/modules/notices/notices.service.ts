import { Prisma } from '@prisma/client';
import * as noticesRepository from './notices.repository';
import { NotFoundError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import type {
  CreateNoticeDtoType,
  UpdateNoticeDtoType,
  NoticeQueryDtoType,
} from './notices.dto';

/** Roles that manage notices — they always see every notice, scheduled or targeted. */
const STAFF_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'TEACHER']);

export interface NoticeViewer {
  userId: string;
  role: string;
}

/**
 * What a viewer may see, as an extra where-clause (undefined = everything).
 *   - Non-staff never see a notice before its scheduledAt.
 *   - Students and guardians see class/section-targeted notices only for
 *     their own (or their children's) class/section; untargeted notices stay
 *     visible to everyone, exactly as before.
 */
export async function visibilityFor(
  institutionId: string,
  viewer: NoticeViewer | undefined,
  now = new Date(),
): Promise<Prisma.NoticeWhereInput | undefined> {
  if (!viewer || STAFF_ROLES.has(viewer.role)) return undefined;

  const published: Prisma.NoticeWhereInput = { OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }] };
  if (viewer.role !== 'STUDENT' && viewer.role !== 'GUARDIAN') return published;

  const placements = await noticesRepository.findViewerPlacements(institutionId, viewer.userId, viewer.role);
  return { AND: [published, { OR: targetingClauses(placements) }] };
}

/** Pure: which targeting combinations a set of placements can see. */
export function targetingClauses(placements: noticesRepository.Placement[]): Prisma.NoticeWhereInput[] {
  const clauses: Prisma.NoticeWhereInput[] = [{ classId: null }];
  const seen = new Set<string>();
  for (const p of placements) {
    if (!p.classId) continue;
    const classKey = `c:${p.classId}`;
    if (!seen.has(classKey)) {
      seen.add(classKey);
      clauses.push({ classId: p.classId, sectionId: null });
    }
    if (p.sectionId && !seen.has(`s:${p.sectionId}`)) {
      seen.add(`s:${p.sectionId}`);
      clauses.push({ classId: p.classId, sectionId: p.sectionId });
    }
  }
  return clauses;
}

export async function createNotice(institutionId: string, data: CreateNoticeDtoType) {
  const { classId, sectionId, scheduledAt, ...rest } = data;
  const target = await noticesRepository.assertClassSection(institutionId, classId, sectionId);

  const notice = await noticesRepository.create(institutionId, {
    ...rest,
    classId: target.classId,
    sectionId: target.sectionId,
    scheduledAt: scheduledAt ?? null,
    // A scheduled notice is "published" when it becomes visible, so the board
    // orders it by that moment rather than by when it was typed.
    ...(scheduledAt ? { publishedAt: scheduledAt } : {}),
  });
  logger.info('Notice created', { noticeId: notice.id, institutionId, scheduled: !!scheduledAt });
  return notice;
}

export async function updateNotice(
  institutionId: string,
  id: string,
  data: UpdateNoticeDtoType,
) {
  const existing = await noticesRepository.findById(institutionId, id);
  if (!existing) {
    throw new NotFoundError(`Notice with ID '${id}' not found`);
  }

  const { classId, sectionId, scheduledAt, ...rest } = data;
  const patch: Prisma.NoticeUncheckedUpdateInput = { ...rest };

  if (classId !== undefined || sectionId !== undefined) {
    const nextClassId = classId !== undefined ? classId : existing.classId;
    // Changing the class without naming a section clears the old section.
    const nextSectionId =
      sectionId !== undefined ? sectionId : classId !== undefined && classId !== existing.classId ? null : existing.sectionId;
    const target = await noticesRepository.assertClassSection(institutionId, nextClassId, nextSectionId);
    patch.classId = target.classId;
    patch.sectionId = target.sectionId;
  }

  if (scheduledAt !== undefined) {
    patch.scheduledAt = scheduledAt;
    if (scheduledAt) {
      patch.publishedAt = scheduledAt;
    } else if (existing.scheduledAt && existing.scheduledAt.getTime() > Date.now()) {
      // Un-scheduling a pending notice publishes it now.
      patch.publishedAt = new Date();
    }
  }

  const updated = await noticesRepository.update(institutionId, id, patch);
  logger.info('Notice updated', { noticeId: id, institutionId });
  return updated;
}

export async function getNotice(institutionId: string, id: string, viewer?: NoticeViewer) {
  const notice = await noticesRepository.findById(institutionId, id, await visibilityFor(institutionId, viewer));
  if (!notice) {
    throw new NotFoundError(`Notice with ID '${id}' not found`);
  }
  return notice;
}

export async function listNotices(institutionId: string, query: NoticeQueryDtoType, viewer?: NoticeViewer) {
  return noticesRepository.findAll(institutionId, query, await visibilityFor(institutionId, viewer));
}

export async function deleteNotice(institutionId: string, id: string) {
  const existing = await noticesRepository.findById(institutionId, id);
  if (!existing) {
    throw new NotFoundError(`Notice with ID '${id}' not found`);
  }
  await noticesRepository.remove(institutionId, id);
  logger.info('Notice deleted', { noticeId: id, institutionId });
}
