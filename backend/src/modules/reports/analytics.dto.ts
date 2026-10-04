import { z } from 'zod';
import { isValidCron } from './analytics.logic';

// =============================================================================
// Analytics / saved views / scheduled reports — request validation
// =============================================================================

export const REPORT_KEYS = ['finance', 'attendance', 'academic', 'admissions'] as const;
export type ReportKey = (typeof REPORT_KEYS)[number];

export const RANGE_PRESETS = ['today', 'last7', 'last30', 'last90', 'thisMonth', 'lastMonth', 'thisYear', 'custom'] as const;

const dateOnly = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');
// Empty strings from query strings / cleared selects mean "no filter".
const optionalId = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.string().trim().min(1).max(64).optional(),
);
const optionalDate = z.preprocess((v) => (v === '' || v === null ? undefined : v), dateOnly.optional());

/** Filters shared by every analytics report (and stored in saved views). */
export const FilterFields = z.object({
  branchId: optionalId,
  academicYearId: optionalId,
  classId: optionalId,
  sectionId: optionalId,
  from: optionalDate,
  to: optionalDate,
  preset: z.preprocess((v) => (v === '' || v === null ? undefined : v), z.enum(RANGE_PRESETS).optional()),
});

const pagination = {
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
};

const extras = {
  granularity: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['day', 'month']).optional()),
  examId: optionalId,
  threshold: z.coerce.number().min(1).max(100).default(20),
  minDays: z.coerce.number().int().min(1).max(366).default(5),
};

const fromBeforeTo = (d: { from?: string; to?: string }) => !d.from || !d.to || d.from <= d.to;
const fromBeforeToMsg = { message: '"from" must be on or before "to"', path: ['from'] };

export const FinanceQueryDto = FilterFields.extend({ granularity: extras.granularity }).refine(fromBeforeTo, fromBeforeToMsg);
export const DefaultersQueryDto = FilterFields.extend(pagination).refine(fromBeforeTo, fromBeforeToMsg);
export const AttendanceQueryDto = FilterFields.extend({ threshold: extras.threshold, minDays: extras.minDays }).refine(
  fromBeforeTo,
  fromBeforeToMsg,
);
export const ChronicQueryDto = FilterFields.extend({
  threshold: extras.threshold,
  minDays: extras.minDays,
  ...pagination,
}).refine(fromBeforeTo, fromBeforeToMsg);
export const AcademicQueryDto = FilterFields.extend({ examId: extras.examId }).refine(fromBeforeTo, fromBeforeToMsg);

/** Everything a report can be parameterised by — the saved-view `filters` JSON. */
export const ReportFiltersDto = FilterFields.extend({
  granularity: extras.granularity,
  examId: extras.examId,
  threshold: z.coerce.number().min(1).max(100).optional(),
  minDays: z.coerce.number().int().min(1).max(366).optional(),
}).refine(fromBeforeTo, fromBeforeToMsg);

export const ExportParamsDto = z.object({ reportKey: z.enum(REPORT_KEYS) });
export const ExportQueryDto = ReportFiltersDto;

// ── Saved views ──────────────────────────────────────────────────────────────

export const SavedViewQueryDto = z.object({
  reportKey: z.preprocess((v) => (v === '' ? undefined : v), z.enum(REPORT_KEYS).optional()),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(100),
});

export const CreateSavedViewDto = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  reportKey: z.enum(REPORT_KEYS),
  filters: ReportFiltersDto.default({}),
  isShared: z.boolean().default(false),
});

export const UpdateSavedViewDto = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    filters: ReportFiltersDto.optional(),
    isShared: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Nothing to update' });

export const IdParamDto = z.object({ id: z.string().trim().min(1).max(64) });

// ── Schedules ────────────────────────────────────────────────────────────────

export const SCHEDULE_FORMATS = ['CSV'] as const;
export const MAX_RECIPIENTS = 20;

const cron = z
  .string()
  .trim()
  .max(100)
  .refine(isValidCron, 'Invalid schedule: use 5 fields "minute hour day-of-month month day-of-week"');

const recipients = z
  .array(z.string().trim().toLowerCase().email('Each recipient must be a valid email'))
  .min(1, 'Add at least one recipient')
  .max(MAX_RECIPIENTS, `At most ${MAX_RECIPIENTS} recipients`)
  .transform((list) => Array.from(new Set(list)));

export const ScheduleQueryDto = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const CreateScheduleDto = z.object({
  savedViewId: z.string().trim().min(1, 'Choose a saved view').max(64),
  cron,
  recipients,
  format: z.enum(SCHEDULE_FORMATS).default('CSV'),
  isActive: z.boolean().default(true),
});

export const UpdateScheduleDto = z
  .object({
    savedViewId: z.string().trim().min(1).max(64).optional(),
    cron: cron.optional(),
    recipients: recipients.optional(),
    format: z.enum(SCHEDULE_FORMATS).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Nothing to update' });

export const CronPreviewDto = z.object({
  cron,
  count: z.coerce.number().int().min(1).max(10).default(5),
});

export type FilterFieldsType = z.infer<typeof FilterFields>;
export type FinanceQueryDtoType = z.infer<typeof FinanceQueryDto>;
export type DefaultersQueryDtoType = z.infer<typeof DefaultersQueryDto>;
export type AttendanceQueryDtoType = z.infer<typeof AttendanceQueryDto>;
export type ChronicQueryDtoType = z.infer<typeof ChronicQueryDto>;
export type AcademicQueryDtoType = z.infer<typeof AcademicQueryDto>;
export type ReportFiltersDtoType = z.infer<typeof ReportFiltersDto>;
export type SavedViewQueryDtoType = z.infer<typeof SavedViewQueryDto>;
export type CreateSavedViewDtoType = z.infer<typeof CreateSavedViewDto>;
export type UpdateSavedViewDtoType = z.infer<typeof UpdateSavedViewDto>;
export type ScheduleQueryDtoType = z.infer<typeof ScheduleQueryDto>;
export type CreateScheduleDtoType = z.infer<typeof CreateScheduleDto>;
export type UpdateScheduleDtoType = z.infer<typeof UpdateScheduleDto>;
export type CronPreviewDtoType = z.infer<typeof CronPreviewDto>;
