import { CampaignChannel, Prisma } from '@prisma/client';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import * as repo from './campaigns.repository';
import {
  addressRecipients,
  assertAudienceBelongsToTenant,
  assertTeacherAudience,
  isAudienceEmpty,
  loadTeacherScope,
  normalizeAudience,
  resolveRecipients,
  TeacherScope,
} from './campaigns.audience';
import { channelConfig, isDemoChannel } from './campaigns.channels';
import { runCampaignInBackground } from './campaigns.runner';
import { countSmsSegments } from './smsSegments';
import type {
  AudienceDtoType,
  CampaignQueryDtoType,
  CreateCampaignDtoType,
  CreateGroupDtoType,
  DeliveryQueryDtoType,
  GroupQueryDtoType,
  MemberCandidateQueryDtoType,
  PreviewAudienceDtoType,
  UpdateCampaignDtoType,
  UpdateGroupDtoType,
} from './campaigns.dto';

// =============================================================================
// Campaign service
// =============================================================================

export interface Actor {
  userId: string;
  role: string;
}

const isTeacher = (actor: Actor) => actor.role === 'TEACHER';

async function scopeFor(institutionId: string, actor: Actor): Promise<TeacherScope | undefined> {
  return isTeacher(actor) ? loadTeacherScope(institutionId, actor.userId) : undefined;
}

async function validateAudience(institutionId: string, actor: Actor, audience: AudienceDtoType) {
  if (isAudienceEmpty(audience)) {
    throw new ValidationError('Choose at least one audience: a role, class, section, group or person');
  }
  await assertAudienceBelongsToTenant(institutionId, audience, {
    groupOwnerUserId: isTeacher(actor) ? actor.userId : undefined,
  });
  if (isTeacher(actor)) {
    assertTeacherAudience(audience, await loadTeacherScope(institutionId, actor.userId));
  }
}

async function getOwnedCampaign(institutionId: string, actor: Actor, id: string) {
  const campaign = await repo.findCampaign(institutionId, id);
  // A teacher never learns that someone else's campaign exists.
  if (!campaign || (isTeacher(actor) && campaign.createdByUserId !== actor.userId)) {
    throw new NotFoundError('Campaign not found');
  }
  return campaign;
}

export function getChannelConfig() {
  const config = channelConfig();
  return {
    channels: config,
    demo: { SMS: !config.SMS, EMAIL: !config.EMAIL, IN_APP: false },
    sms: { unicodePerSegment: 70, gsmPerSegment: 160 },
  };
}

export async function previewAudience(institutionId: string, actor: Actor, input: PreviewAudienceDtoType) {
  const audience = normalizeAudience(input.audience);
  const smsInfo = input.body !== undefined ? countSmsSegments(input.body) : undefined;
  const demo = isDemoChannel(input.channel);

  if (isAudienceEmpty(audience)) {
    return { channel: input.channel, total: 0, unreachable: 0, byRole: {}, sample: [], sms: smsInfo, demo };
  }

  await validateAudience(institutionId, actor, audience);
  const people = await resolveRecipients(institutionId, audience, await scopeFor(institutionId, actor));
  const { addressed, unreachable } = addressRecipients(input.channel, people);

  const byRole: Record<string, number> = {};
  for (const r of addressed) byRole[r.role] = (byRole[r.role] ?? 0) + 1;

  return {
    channel: input.channel,
    total: addressed.length,
    unreachable,
    byRole,
    // Names only — addresses stay out of the preview payload.
    sample: addressed.slice(0, 8).map((r) => ({ name: r.name, role: r.role })),
    sms: smsInfo ? { ...smsInfo, totalSegments: smsInfo.segments * addressed.length } : undefined,
    demo,
  };
}

export async function listCampaigns(institutionId: string, actor: Actor, query: CampaignQueryDtoType) {
  return repo.listCampaigns(institutionId, query, isTeacher(actor) ? actor.userId : undefined);
}

export async function getCampaign(institutionId: string, actor: Actor, id: string) {
  const campaign = await getOwnedCampaign(institutionId, actor, id);
  const deliveryStats = await repo.deliveryStats(institutionId, id);
  return {
    ...campaign,
    deliveryStats,
    sms: campaign.channel === 'SMS' ? countSmsSegments(campaign.body) : undefined,
    demo: campaign.isDemo || (['DRAFT', 'SCHEDULED'].includes(campaign.status) && isDemoChannel(campaign.channel)),
  };
}

export async function listDeliveries(institutionId: string, actor: Actor, id: string, query: DeliveryQueryDtoType) {
  await getOwnedCampaign(institutionId, actor, id);
  return repo.listDeliveries(institutionId, id, query);
}

export async function createCampaign(institutionId: string, actor: Actor, data: CreateCampaignDtoType) {
  const audience = normalizeAudience(data.audience);
  if (!isAudienceEmpty(audience)) await validateAudience(institutionId, actor, audience);

  const campaign = await repo.createCampaign({
    institutionId,
    createdByUserId: actor.userId,
    channel: data.channel,
    subject: data.subject ?? null,
    body: data.body,
    audience: audience as unknown as Prisma.InputJsonValue,
    status: 'DRAFT',
  });
  logger.info('Campaign draft created', { campaignId: campaign.id, institutionId });
  return { ...campaign, demo: isDemoChannel(campaign.channel) };
}

export async function updateCampaign(institutionId: string, actor: Actor, id: string, data: UpdateCampaignDtoType) {
  const existing = await getOwnedCampaign(institutionId, actor, id);
  if (!['DRAFT', 'SCHEDULED'].includes(existing.status)) {
    throw new ConflictError(`A ${existing.status.toLowerCase()} campaign can no longer be edited`);
  }

  const channel = (data.channel ?? existing.channel) as CampaignChannel;
  const subject = data.subject !== undefined ? data.subject : existing.subject;
  if (channel === 'EMAIL' && !subject) throw new ValidationError('Subject is required for email');

  let audience: AudienceDtoType | undefined;
  if (data.audience) {
    audience = normalizeAudience(data.audience);
    if (!isAudienceEmpty(audience)) await validateAudience(institutionId, actor, audience);
  }

  const count = await repo.updateCampaign(institutionId, id, ['DRAFT', 'SCHEDULED'], {
    ...(data.channel ? { channel: data.channel } : {}),
    ...(data.subject !== undefined ? { subject: data.subject } : {}),
    ...(data.body !== undefined ? { body: data.body } : {}),
    ...(audience ? { audience: audience as unknown as Prisma.InputJsonValue } : {}),
  });
  if (count === 0) throw new ConflictError('Campaign changed status while you were editing it');
  return getCampaign(institutionId, actor, id);
}

export async function deleteCampaign(institutionId: string, actor: Actor, id: string) {
  const existing = await getOwnedCampaign(institutionId, actor, id);
  if (existing.status === 'SENDING' || existing.status === 'SCHEDULED') {
    throw new ConflictError('Cancel the campaign before deleting it');
  }
  await repo.deleteCampaign(institutionId, id);
}

/**
 * Send now, or schedule. Either way the recipient list must be non-empty
 * right now — an audience that resolves to nobody is a mistake to surface
 * before the send, not a silent "sent to 0".
 */
export async function sendCampaign(
  institutionId: string,
  actor: Actor,
  id: string,
  scheduledAt: Date | null | undefined,
) {
  const existing = await getOwnedCampaign(institutionId, actor, id);
  if (!['DRAFT', 'SCHEDULED'].includes(existing.status)) {
    throw new ConflictError(`A ${existing.status.toLowerCase()} campaign cannot be sent again`);
  }

  const audience = normalizeAudience(existing.audience);
  await validateAudience(institutionId, actor, audience);
  const people = await resolveRecipients(institutionId, audience, await scopeFor(institutionId, actor));
  const { addressed } = addressRecipients(existing.channel, people);
  if (addressed.length === 0) {
    throw new ValidationError(
      `Nobody in this audience can be reached by ${existing.channel === 'IN_APP' ? 'in-app notification' : existing.channel.toLowerCase()}`,
    );
  }

  const demo = isDemoChannel(existing.channel);
  const now = new Date();

  if (scheduledAt && scheduledAt.getTime() > now.getTime() + 30 * 1000) {
    const count = await repo.updateCampaign(institutionId, id, ['DRAFT', 'SCHEDULED'], {
      status: 'SCHEDULED',
      scheduledAt,
      recipientCount: addressed.length,
      isDemo: demo,
    });
    if (count === 0) throw new ConflictError('Campaign changed status — refresh and try again');
    logger.info('Campaign scheduled', { campaignId: id, institutionId, scheduledAt });
    return { campaign: await getCampaign(institutionId, actor, id), demo, scheduled: true };
  }

  const count = await repo.updateCampaign(institutionId, id, ['DRAFT', 'SCHEDULED'], {
    status: 'SENDING',
    scheduledAt: null,
    recipientCount: addressed.length,
    isDemo: demo,
  });
  if (count === 0) throw new ConflictError('Campaign is already being sent');

  runCampaignInBackground(id);
  logger.info('Campaign send started', { campaignId: id, institutionId, recipients: addressed.length, demo });
  return { campaign: await getCampaign(institutionId, actor, id), demo, scheduled: false };
}

export async function cancelCampaign(institutionId: string, actor: Actor, id: string) {
  const existing = await getOwnedCampaign(institutionId, actor, id);
  if (!['DRAFT', 'SCHEDULED', 'SENDING'].includes(existing.status)) {
    throw new ConflictError(`A ${existing.status.toLowerCase()} campaign cannot be cancelled`);
  }
  // SENDING -> CANCELLED stops the runner at its next batch boundary.
  const count = await repo.updateCampaign(institutionId, id, ['DRAFT', 'SCHEDULED', 'SENDING'], {
    status: 'CANCELLED',
  });
  if (count === 0) throw new ConflictError('Campaign already finished');
  return getCampaign(institutionId, actor, id);
}

// ── Message groups ──────────────────────────────────────────────────────────

async function getOwnedGroup(institutionId: string, actor: Actor, id: string) {
  const group = await repo.findGroup(institutionId, id);
  if (!group || (isTeacher(actor) && group.createdByUserId !== actor.userId)) {
    throw new NotFoundError('Message group not found');
  }
  return group;
}

/**
 * Members must belong to the tenant; a teacher may only add students and
 * guardians of their own class-teacher sections.
 */
async function assertMembersAllowed(institutionId: string, actor: Actor, userIds: string[]) {
  if (!userIds.length) return;
  await assertAudienceBelongsToTenant(institutionId, {
    roles: [],
    classIds: [],
    sectionIds: [],
    groupIds: [],
    userIds,
  });
  if (isTeacher(actor)) {
    const scope = await loadTeacherScope(institutionId, actor.userId);
    const foreign = userIds.find((uid) => !scope.userIds.has(uid));
    if (foreign) throw new ForbiddenError('You can only add students and guardians of your own sections');
  }
}

export async function listGroups(institutionId: string, actor: Actor, query: GroupQueryDtoType) {
  return repo.listGroups(institutionId, query, isTeacher(actor) ? actor.userId : undefined);
}

export async function getGroup(institutionId: string, actor: Actor, id: string) {
  const group = await getOwnedGroup(institutionId, actor, id);
  return { ...group, members: group.members.map((m) => m.user) };
}

export async function createGroup(institutionId: string, actor: Actor, data: CreateGroupDtoType) {
  await assertMembersAllowed(institutionId, actor, data.memberUserIds);
  return repo.createGroup(institutionId, actor.userId, data);
}

export async function updateGroup(institutionId: string, actor: Actor, id: string, data: UpdateGroupDtoType) {
  await getOwnedGroup(institutionId, actor, id);
  return repo.updateGroup(institutionId, id, data);
}

export async function deleteGroup(institutionId: string, actor: Actor, id: string) {
  await getOwnedGroup(institutionId, actor, id);
  await repo.deleteGroup(institutionId, id);
}

export async function addGroupMembers(institutionId: string, actor: Actor, id: string, userIds: string[]) {
  await getOwnedGroup(institutionId, actor, id);
  await assertMembersAllowed(institutionId, actor, userIds);
  const result = await repo.addMembers(id, userIds);
  return { added: result.count };
}

export async function removeGroupMember(institutionId: string, actor: Actor, id: string, userId: string) {
  await getOwnedGroup(institutionId, actor, id);
  const result = await repo.removeMember(id, userId);
  if (result.count === 0) throw new NotFoundError('Member not found in this group');
}

export async function listMemberCandidates(institutionId: string, actor: Actor, query: MemberCandidateQueryDtoType) {
  const restrictToUserIds = isTeacher(actor)
    ? (await loadTeacherScope(institutionId, actor.userId)).userIds
    : undefined;
  return repo.listMemberCandidates(institutionId, { ...query, restrictToUserIds });
}
