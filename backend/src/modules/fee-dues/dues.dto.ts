import { z } from 'zod';
import { REPORT_KEYS } from './reports.service';

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM');
const id = z.string().min(1).max(64);
const optId = id.optional();
const intQ = (min: number, max: number) => z.coerce.number().int().min(min).max(max);

const studentFilter = {
  classId: optId,
  sectionId: optId,
  search: z.string().trim().max(100).optional(),
  studentStatus: z.enum(['ACTIVE', 'ALL']).optional(),
};

export const GridQueryDto = z.object({
  ...studentFilter,
  from: month,
  to: month,
  feeCategoryId: optId,
  status: z.enum(['ALL', 'DUE', 'OVERDUE', 'PARTIAL', 'PAID', 'NO_INVOICE']).optional(),
  page: intQ(1, 100000).optional(),
  pageSize: intQ(1, 200).optional(),
});

export const LedgerQueryDto = z.object({ from: month, to: month });

export const DefaulterQueryDto = z.object({
  ...studentFilter,
  minMonths: intQ(0, 120).optional(),
  minAmount: z.coerce.number().min(0).max(100_000_000).optional(),
  page: intQ(1, 100000).optional(),
  pageSize: intQ(1, 500).optional(),
});

const template = z.string().trim().max(1000);

export const ReminderDto = z
  .object({
    studentIds: z.array(id).max(2000).optional(),
    filter: DefaulterQueryDto.omit({ page: true, pageSize: true }).optional(),
    channels: z.array(z.enum(['SMS', 'EMAIL'])).min(1).max(2),
    smsTemplate: template.optional(),
    emailSubject: z.string().trim().max(200).optional(),
    emailTemplate: z.string().trim().max(5000).optional(),
  })
  .refine((v) => (v.studentIds && v.studentIds.length > 0) || v.filter, { message: 'Pick students or a defaulter filter' });

export const BatchParamDto = z.object({ batchId: z.string().uuid() });
export const StudentParamDto = z.object({ studentId: id });

export const ReminderLogQueryDto = z.object({
  studentId: optId,
  page: intQ(1, 100000).optional(),
  pageSize: intQ(1, 200).optional(),
});

export const SettingsDto = z
  .object({
    restrictionsEnabled: z.boolean(),
    minMonthsDue: z.number().int().min(1).max(60).nullable(),
    minAmountDue: z.number().min(1).max(100_000_000).nullable(),
    overdueDays: z.number().int().min(1).max(3650).nullable(),
    blockResults: z.boolean(),
    blockAdmitCard: z.boolean(),
    blockIdCard: z.boolean(),
    blockPortalLogin: z.boolean(),
    blockOnlineExam: z.boolean(),
    restrictionMessage: z.string().trim().max(300).nullable(),
    smsTemplate: template.nullable(),
    emailSubject: z.string().trim().max(200).nullable(),
    emailTemplate: z.string().trim().max(5000).nullable(),
  })
  .partial();

export const ManualStateDto = z.object({
  state: z.enum(['BLOCKED', 'UNBLOCKED', 'AUTO']),
  reason: z.string().trim().min(3, 'Give a reason').max(300),
});

export const ExemptDto = z.object({
  exempt: z.boolean(),
  reason: z.string().trim().max(300).optional(),
}).refine((v) => !v.exempt || (v.reason && v.reason.length >= 3), { message: 'Give a reason for the exemption', path: ['reason'] });

export const RestrictedQueryDto = z.object({
  view: z.enum(['RESTRICTED', 'OVERRIDES']).optional(),
  classId: optId,
  sectionId: optId,
  search: z.string().trim().max(100).optional(),
  page: intQ(1, 100000).optional(),
  pageSize: intQ(1, 200).optional(),
});

export const ReportParamDto = z.object({ key: z.enum(REPORT_KEYS) });
export const ReportQueryDto = z.object({
  from: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/).optional(),
  classId: optId,
  sectionId: optId,
  collectorId: optId,
  method: z.string().trim().max(40).optional(),
  studentId: optId,
  format: z.enum(['json', 'xlsx', 'csv', 'pdf']).optional(),
});
