import { z } from 'zod';
import { BADGE_ICONS, HEX_COLOR } from './character.logic';

// =============================================================================
// Character (T2) — request schemas. Every id is re-checked against
// req.tenantId in the service.
// =============================================================================

const id = z.string().trim().min(1).max(64);
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));
const date = z.coerce.date();

export const IdParamDto = z.object({ id });
export const StudentParamDto = z.object({ studentId: id });

// ── Settings ─────────────────────────────────────────────────────────────────

export const UpdateSettingsDto = z
  .object({
    leaderboardEnabled: z.boolean(),
    leaderboardPublic: z.boolean(),
    notifyGuardians: z.boolean(),
  })
  .partial();
export type UpdateSettingsDtoType = z.infer<typeof UpdateSettingsDto>;

// ── Traits ───────────────────────────────────────────────────────────────────

const traitBase = z.object({
  name: z.string().trim().min(1).max(80),
  nameBn: optText(80),
  description: optText(500),
  scaleMin: z.coerce.number().int().min(0).max(9).default(1),
  scaleMax: z.coerce.number().int().min(1).max(10).default(5),
  weight: z.coerce.number().min(0).max(100).default(1),
  active: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(10_000).default(0),
});
export const CreateTraitDto = traitBase.refine((v) => v.scaleMax > v.scaleMin, {
  message: 'The highest score must be above the lowest',
  path: ['scaleMax'],
});
export const UpdateTraitDto = traitBase.partial();
export type CreateTraitDtoType = z.infer<typeof CreateTraitDto>;
export type UpdateTraitDtoType = z.infer<typeof UpdateTraitDto>;

export const ReorderTraitsDto = z.object({ ids: z.array(id).min(1).max(100) });

// ── Periods ──────────────────────────────────────────────────────────────────

export const PERIOD_KINDS = ['WEEKLY', 'MONTHLY', 'TERM'] as const;

export const CreatePeriodDto = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(PERIOD_KINDS).default('MONTHLY'),
  startDate: date,
  endDate: date,
  academicYearId: id.optional().nullable(),
});
export const UpdatePeriodDto = CreatePeriodDto.partial().extend({ locked: z.boolean().optional() });
export type CreatePeriodDtoType = z.infer<typeof CreatePeriodDto>;
export type UpdatePeriodDtoType = z.infer<typeof UpdatePeriodDto>;

export const PeriodQueryDto = z.object({
  academicYearId: id.optional(),
  kind: z.enum(PERIOD_KINDS).optional(),
});

// ── Scores (grid) ────────────────────────────────────────────────────────────

export const GridQueryDto = z.object({ periodId: id, sectionId: id });
export type GridQueryDtoType = z.infer<typeof GridQueryDto>;

export const SaveGridDto = z.object({
  periodId: id,
  sectionId: id,
  // score: null clears the cell.
  scores: z
    .array(z.object({ studentId: id, traitId: id, score: z.number().int().min(0).max(10).nullable() }))
    .max(5000)
    .default([]),
  // comment: null/'' clears it.
  comments: z
    .array(z.object({ studentId: id, comment: z.string().trim().max(1000).nullable() }))
    .max(500)
    .default([]),
});
export type SaveGridDtoType = z.infer<typeof SaveGridDto>;

// ── Badges ───────────────────────────────────────────────────────────────────

export const BADGE_RULES = ['NONE', 'TRAIT_AVERAGE', 'OVERALL_AVERAGE', 'ATTENDANCE_STREAK'] as const;

const badgeBase = z.object({
  name: z.string().trim().min(1).max(80),
  nameBn: optText(80),
  description: optText(500),
  icon: z.enum(BADGE_ICONS).default('star'),
  color: z.string().trim().regex(HEX_COLOR, 'Use a colour like #c2550a').default('#c2550a'),
  points: z.coerce.number().int().min(0).max(1000).default(10),
  rule: z.enum(BADGE_RULES).default('NONE'),
  ruleTraitId: id.optional().nullable(),
  ruleThreshold: z.coerce.number().min(0).max(100).optional().nullable(),
  ruleStreakDays: z.coerce.number().int().min(0).max(365).optional().nullable(),
  active: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(10_000).default(0),
});
export const CreateBadgeDto = badgeBase;
export const UpdateBadgeDto = badgeBase.partial();
export type CreateBadgeDtoType = z.infer<typeof CreateBadgeDto>;
export type UpdateBadgeDtoType = z.infer<typeof UpdateBadgeDto>;

export const AwardBadgeDto = z.object({
  badgeId: id,
  studentIds: z.array(id).min(1).max(200),
  periodId: id.optional().nullable(),
  reason: z.string().trim().min(1, 'Give a reason').max(300),
});
export type AwardBadgeDtoType = z.infer<typeof AwardBadgeDto>;

export const RevokeAwardDto = z.object({ reason: z.string().trim().min(1, 'Give a reason').max(300) });

export const AutoAwardDto = z.object({ periodId: id, sectionId: id.optional() });

export const AwardQueryDto = z.object({
  studentId: id.optional(),
  sectionId: id.optional(),
  badgeId: id.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type AwardQueryDtoType = z.infer<typeof AwardQueryDto>;

export const AdjustPointsDto = z.object({
  studentId: id,
  points: z.coerce
    .number()
    .int()
    .min(-1000)
    .max(1000)
    .refine((v) => v !== 0, 'Points cannot be 0'),
  reason: z.string().trim().min(1, 'Give a reason').max(300),
});
export type AdjustPointsDtoType = z.infer<typeof AdjustPointsDto>;

export const LeaderboardQueryDto = z.object({
  classId: id.optional(),
  sectionId: id.optional(),
  periodId: id.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
export type LeaderboardQueryDtoType = z.infer<typeof LeaderboardQueryDto>;

export const SummaryQueryDto = z.object({ periodId: id.optional() });
