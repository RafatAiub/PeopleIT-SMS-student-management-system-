// Saved report views (SavedReportView): per-user named filter sets for an
// analytics tab, optionally shared with the institution. A user sees their
// own views plus shared ones — only for reports their role can open.
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { ForbiddenError, NotFoundError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import { allowedReportKeys, canAccessReport, isInstitutionWide } from './analytics.access';
import type { Requester } from './analytics.scope';
import type { CreateSavedViewDtoType, SavedViewQueryDtoType, UpdateSavedViewDtoType } from './analytics.dto';

const viewSelect = {
  id: true,
  name: true,
  reportKey: true,
  filters: true,
  isShared: true,
  userId: true,
  createdAt: true,
  user: { select: { firstName: true, lastName: true } },
  _count: { select: { schedules: true } },
} satisfies Prisma.SavedReportViewSelect;

type ViewRow = Prisma.SavedReportViewGetPayload<{ select: typeof viewSelect }>;

function serialize(v: ViewRow, requester: Requester) {
  const { user, _count, ...rest } = v;
  return {
    ...rest,
    ownerName: `${user.firstName} ${user.lastName}`.trim(),
    isOwner: v.userId === requester.sub,
    scheduleCount: _count.schedules,
  };
}

/** Where-clause for views the requester can see (own + shared, allowed reports). */
export function visibleViewsWhere(institutionId: string, requester: Requester): Prisma.SavedReportViewWhereInput {
  return {
    institutionId,
    reportKey: { in: allowedReportKeys(requester.role) },
    OR: [{ userId: requester.sub }, { isShared: true }],
  };
}

export async function listViews(institutionId: string, requester: Requester, q: SavedViewQueryDtoType) {
  if (q.reportKey && !canAccessReport(requester.role, q.reportKey)) {
    throw new ForbiddenError('You do not have access to this report');
  }
  const where: Prisma.SavedReportViewWhereInput = {
    ...visibleViewsWhere(institutionId, requester),
    ...(q.reportKey ? { AND: [{ reportKey: q.reportKey }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.savedReportView.findMany({
      where,
      select: viewSelect,
      orderBy: [{ reportKey: 'asc' }, { name: 'asc' }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.savedReportView.count({ where }),
  ]);
  return { items: items.map((v) => serialize(v, requester)), meta: { total, page: q.page, pageSize: q.pageSize } };
}

export async function findVisibleView(institutionId: string, requester: Requester, id: string) {
  const view = await prisma.savedReportView.findFirst({
    where: { id, ...visibleViewsWhere(institutionId, requester) },
    select: viewSelect,
  });
  if (!view) throw new NotFoundError('Saved view not found');
  return view;
}

export async function createView(institutionId: string, requester: Requester, data: CreateSavedViewDtoType) {
  if (!canAccessReport(requester.role, data.reportKey)) {
    throw new ForbiddenError('You do not have access to this report');
  }
  const view = await prisma.savedReportView.create({
    data: {
      institutionId,
      userId: requester.sub,
      name: data.name,
      reportKey: data.reportKey,
      filters: data.filters as Prisma.InputJsonValue,
      isShared: data.isShared,
    },
    select: viewSelect,
  });
  logger.info('Saved report view created', { institutionId, viewId: view.id, reportKey: data.reportKey });
  return serialize(view, requester);
}

async function ownedOrThrow(institutionId: string, requester: Requester, id: string, allowAdmin: boolean) {
  const view = await findVisibleView(institutionId, requester, id);
  if (view.userId !== requester.sub && !(allowAdmin && isInstitutionWide(requester.role))) {
    throw new ForbiddenError('Only the owner can change this saved view');
  }
  return view;
}

export async function updateView(institutionId: string, requester: Requester, id: string, data: UpdateSavedViewDtoType) {
  await ownedOrThrow(institutionId, requester, id, false);
  const updated = await prisma.savedReportView.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.filters !== undefined ? { filters: data.filters as Prisma.InputJsonValue } : {}),
      ...(data.isShared !== undefined ? { isShared: data.isShared } : {}),
    },
    select: viewSelect,
  });
  return serialize(updated, requester);
}

/** Owner, or SUPER_ADMIN/ADMIN for shared views. Removes the view's schedules too. */
export async function deleteView(institutionId: string, requester: Requester, id: string) {
  await ownedOrThrow(institutionId, requester, id, true);
  await prisma.$transaction([
    prisma.reportSchedule.deleteMany({ where: { institutionId, savedViewId: id } }),
    prisma.savedReportView.deleteMany({ where: { institutionId, id } }),
  ]);
  logger.info('Saved report view deleted', { institutionId, viewId: id });
}
