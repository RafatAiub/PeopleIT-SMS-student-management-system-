import { z } from 'zod';

// =============================================================================
// Campaign + Message Group DTOs
// =============================================================================

export const CampaignChannelEnum = z.enum(['SMS', 'EMAIL', 'IN_APP']);
export const CampaignStatusEnum = z.enum(['DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'FAILED', 'CANCELLED']);

/** Roles a campaign can target. SUPER_ADMIN is platform staff, never a tenant audience. */
export const AudienceRoleEnum = z.enum([
  'ADMIN',
  'TEACHER',
  'ACCOUNTANT',
  'LIBRARIAN',
  'TRANSPORT_OFFICER',
  'MANAGEMENT',
  'STUDENT',
  'GUARDIAN',
]);

const idList = z.array(z.string().min(1)).max(500).optional().default([]);

/**
 * Who a campaign reaches. Stored verbatim in MessageCampaign.audience.
 * Semantics (see campaigns.audience.ts):
 *   - classIds/sectionIds scope the STUDENT and GUARDIAN roles (both, when
 *     neither is picked explicitly);
 *   - staff roles are always institution-wide;
 *   - userIds and groupIds add specific people on top;
 *   - everything is unioned and de-duplicated per delivery address.
 */
export const AudienceDto = z.object({
  roles: z.array(AudienceRoleEnum).max(10).optional().default([]),
  classIds: idList,
  sectionIds: idList,
  userIds: z.array(z.string().min(1)).max(2000).optional().default([]),
  groupIds: idList,
});

export type AudienceDtoType = z.infer<typeof AudienceDto>;

const bodyField = z.string().trim().min(1, 'Message body is required').max(5000);

export const CreateCampaignDto = z
  .object({
    channel: CampaignChannelEnum,
    subject: z.string().trim().max(200).optional().nullable(),
    body: bodyField,
    audience: AudienceDto.default({}),
  })
  .superRefine((v, ctx) => {
    if (v.channel === 'EMAIL' && !v.subject) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['subject'], message: 'Subject is required for email' });
    }
  });

export const UpdateCampaignDto = z.object({
  channel: CampaignChannelEnum.optional(),
  subject: z.string().trim().max(200).optional().nullable(),
  body: bodyField.optional(),
  audience: AudienceDto.optional(),
});

export const SendCampaignDto = z.object({
  /** Omit (or null) to send immediately; a future time schedules it. */
  scheduledAt: z.coerce.date().optional().nullable(),
});

export const CampaignQueryDto = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  status: CampaignStatusEnum.optional(),
  channel: CampaignChannelEnum.optional(),
  search: z.string().trim().max(100).optional(),
});

export const PreviewAudienceDto = z.object({
  channel: CampaignChannelEnum,
  audience: AudienceDto.default({}),
  body: z.string().max(5000).optional(),
});

export const DeliveryQueryDto = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(['QUEUED', 'SENT', 'FAILED', 'SKIPPED']).optional(),
});

export const IdParamDto = z.object({ id: z.string().min(1, 'Invalid ID') });

// ── Message groups ──────────────────────────────────────────────────────────

export const CreateGroupDto = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  description: z.string().trim().max(500).optional().nullable(),
  memberUserIds: z.array(z.string().min(1)).max(2000).optional().default([]),
});

export const UpdateGroupDto = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).optional().nullable(),
});

export const GroupMembersDto = z.object({
  userIds: z.array(z.string().min(1)).min(1, 'At least one user is required').max(2000),
});

export const GroupQueryDto = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(100).optional(),
});

export const MemberCandidateQueryDto = z.object({
  search: z.string().trim().max(100).optional(),
  role: AudienceRoleEnum.optional(),
  classId: z.string().min(1).optional(),
  sectionId: z.string().min(1).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const GroupMemberParamDto = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
});

export type CreateCampaignDtoType = z.infer<typeof CreateCampaignDto>;
export type UpdateCampaignDtoType = z.infer<typeof UpdateCampaignDto>;
export type CampaignQueryDtoType = z.infer<typeof CampaignQueryDto>;
export type PreviewAudienceDtoType = z.infer<typeof PreviewAudienceDto>;
export type DeliveryQueryDtoType = z.infer<typeof DeliveryQueryDto>;
export type CreateGroupDtoType = z.infer<typeof CreateGroupDto>;
export type UpdateGroupDtoType = z.infer<typeof UpdateGroupDto>;
export type GroupQueryDtoType = z.infer<typeof GroupQueryDto>;
export type MemberCandidateQueryDtoType = z.infer<typeof MemberCandidateQueryDto>;
