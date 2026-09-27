import { CampaignStatus, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { campaignTemplateKey } from './campaigns.runner';
import type { CampaignQueryDtoType, DeliveryQueryDtoType, GroupQueryDtoType } from './campaigns.dto';

// =============================================================================
// Campaign + Message Group repository — every query takes institutionId.
// =============================================================================

export const campaignSelect = {
  id: true,
  channel: true,
  subject: true,
  body: true,
  audience: true,
  status: true,
  scheduledAt: true,
  sentAt: true,
  recipientCount: true,
  successCount: true,
  failureCount: true,
  isDemo: true,
  createdByUserId: true,
  createdBy: { select: { id: true, firstName: true, lastName: true, role: true } },
  createdAt: true,
  updatedAt: true,
} as const;

export async function listCampaigns(
  institutionId: string,
  query: CampaignQueryDtoType,
  ownerUserId?: string,
) {
  const where: Prisma.MessageCampaignWhereInput = {
    institutionId,
    ...(ownerUserId ? { createdByUserId: ownerUserId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.channel ? { channel: query.channel } : {}),
    ...(query.search
      ? {
          OR: [
            { subject: { contains: query.search, mode: 'insensitive' } },
            { body: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.messageCampaign.findMany({
      where,
      select: campaignSelect,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.messageCampaign.count({ where }),
  ]);
  return { items, total };
}

export function findCampaign(institutionId: string, id: string) {
  return prisma.messageCampaign.findFirst({ where: { id, institutionId }, select: campaignSelect });
}

export function createCampaign(data: Prisma.MessageCampaignUncheckedCreateInput) {
  return prisma.messageCampaign.create({ data, select: campaignSelect });
}

export async function updateCampaign(
  institutionId: string,
  id: string,
  allowedStatuses: CampaignStatus[],
  data: Prisma.MessageCampaignUpdateManyMutationInput,
) {
  const result = await prisma.messageCampaign.updateMany({
    where: { id, institutionId, status: { in: allowedStatuses } },
    data,
  });
  return result.count;
}

export function deleteCampaign(institutionId: string, id: string) {
  return prisma.messageCampaign.deleteMany({ where: { id, institutionId } });
}

export async function deliveryStats(institutionId: string, campaignId: string) {
  const rows = await prisma.notificationDelivery.groupBy({
    by: ['status'],
    where: { institutionId, templateKey: campaignTemplateKey(campaignId) },
    _count: { _all: true },
  });
  const stats = { QUEUED: 0, SENT: 0, FAILED: 0, SKIPPED: 0 };
  for (const r of rows) stats[r.status] = r._count._all;
  return stats;
}

export async function listDeliveries(institutionId: string, campaignId: string, query: DeliveryQueryDtoType) {
  const where: Prisma.NotificationDeliveryWhereInput = {
    institutionId,
    templateKey: campaignTemplateKey(campaignId),
    ...(query.status ? { status: query.status } : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.notificationDelivery.findMany({
      where,
      select: {
        id: true,
        channel: true,
        recipient: true,
        status: true,
        error: true,
        attempts: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.notificationDelivery.count({ where }),
  ]);
  return { items, total };
}

export async function institutionName(institutionId: string): Promise<string> {
  const inst = await prisma.institution.findUnique({ where: { id: institutionId }, select: { name: true } });
  return inst?.name ?? '';
}

// ── Message groups ──────────────────────────────────────────────────────────

export const groupSelect = {
  id: true,
  name: true,
  description: true,
  createdByUserId: true,
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  createdAt: true,
  _count: { select: { members: true } },
} as const;

export async function listGroups(institutionId: string, query: GroupQueryDtoType, ownerUserId?: string) {
  const where: Prisma.MessageGroupWhereInput = {
    institutionId,
    ...(ownerUserId ? { createdByUserId: ownerUserId } : {}),
    ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.messageGroup.findMany({
      where,
      select: groupSelect,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.messageGroup.count({ where }),
  ]);
  return { items, total };
}

export function findGroup(institutionId: string, id: string) {
  return prisma.messageGroup.findFirst({
    where: { id, institutionId },
    select: {
      ...groupSelect,
      members: {
        select: {
          user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, role: true } },
        },
        take: 1000,
      },
    },
  });
}

export async function createGroup(
  institutionId: string,
  createdByUserId: string,
  data: { name: string; description?: string | null; memberUserIds: string[] },
) {
  return prisma.messageGroup.create({
    data: {
      institutionId,
      createdByUserId,
      name: data.name,
      description: data.description ?? null,
      members: data.memberUserIds.length
        ? { createMany: { data: [...new Set(data.memberUserIds)].map((userId) => ({ userId })), skipDuplicates: true } }
        : undefined,
    },
    select: groupSelect,
  });
}

export async function updateGroup(institutionId: string, id: string, data: { name?: string; description?: string | null }) {
  await prisma.messageGroup.updateMany({ where: { id, institutionId }, data });
  return prisma.messageGroup.findFirst({ where: { id, institutionId }, select: groupSelect });
}

export async function deleteGroup(institutionId: string, id: string) {
  await prisma.$transaction([
    prisma.messageGroupMember.deleteMany({ where: { groupId: id, group: { institutionId } } }),
    // Group messages keep their history — only the link to the group is cleared.
    prisma.message.updateMany({ where: { groupId: id, institutionId }, data: { groupId: null } }),
    prisma.messageGroup.deleteMany({ where: { id, institutionId } }),
  ]);
}

export function addMembers(groupId: string, userIds: string[]) {
  return prisma.messageGroupMember.createMany({
    data: [...new Set(userIds)].map((userId) => ({ groupId, userId })),
    skipDuplicates: true,
  });
}

export function removeMember(groupId: string, userId: string) {
  return prisma.messageGroupMember.deleteMany({ where: { groupId, userId } });
}

export async function listMemberCandidates(
  institutionId: string,
  params: {
    search?: string;
    role?: string;
    classId?: string;
    sectionId?: string;
    page: number;
    pageSize: number;
    restrictToUserIds?: Set<string>;
  },
) {
  const placement: Prisma.StudentWhereInput | undefined =
    params.classId || params.sectionId
      ? {
          institutionId,
          ...(params.classId ? { classId: params.classId } : {}),
          ...(params.sectionId ? { sectionId: params.sectionId } : {}),
        }
      : undefined;

  const where: Prisma.UserWhereInput = {
    institutionId,
    isActive: true,
    role: params.role ? (params.role as Prisma.EnumUserRoleFilter['equals']) : { not: 'SUPER_ADMIN' },
    ...(params.restrictToUserIds ? { id: { in: [...params.restrictToUserIds] } } : {}),
    ...(placement
      ? {
          OR: [
            { studentProfile: placement },
            { guardianProfile: { students: { some: { student: placement } } } },
          ],
        }
      : {}),
    ...(params.search
      ? {
          AND: [
            {
              OR: [
                { firstName: { contains: params.search, mode: 'insensitive' } },
                { lastName: { contains: params.search, mode: 'insensitive' } },
                { email: { contains: params.search, mode: 'insensitive' } },
                { phone: { contains: params.search } },
              ],
            },
          ],
        }
      : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      select: { id: true, firstName: true, lastName: true, email: true, phone: true, role: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.user.count({ where }),
  ]);
  return { items, total };
}
