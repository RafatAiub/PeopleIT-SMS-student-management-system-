import { z } from 'zod';

const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD');
const STATUS = z.enum(['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY']);

export const SubjectOptionsQueryDto = z.object({
  className: z.string().min(1),
  sectionName: z.string().min(1),
});

export const SubjectSheetQueryDto = z.object({
  className: z.string().min(1),
  sectionName: z.string().min(1),
  subjectName: z.string().min(1),
  date: DAY,
  period: z.coerce.number().int().min(1).max(20).optional(),
});

export const SubjectBulkSubmitDto = z.object({
  className: z.string().min(1),
  sectionName: z.string().min(1),
  subjectName: z.string().trim().min(1).max(120),
  date: DAY,
  period: z.number().int().min(1).max(20).optional().nullable(),
  records: z
    .array(z.object({ studentId: z.string().min(1), status: STATUS }))
    .min(1)
    .max(500),
});

export const SubjectReportQueryDto = z.object({
  className: z.string().min(1),
  sectionName: z.string().min(1),
  from: DAY,
  to: DAY,
});

export const SubjectMyQueryDto = z.object({
  from: DAY.optional(),
  to: DAY.optional(),
});

export const StudentIdParamDto = z.object({ studentId: z.string().min(1) });

export type SubjectSheetQueryDtoType = z.infer<typeof SubjectSheetQueryDto>;
export type SubjectBulkSubmitDtoType = z.infer<typeof SubjectBulkSubmitDto>;
export type SubjectReportQueryDtoType = z.infer<typeof SubjectReportQueryDto>;
export type SubjectMyQueryDtoType = z.infer<typeof SubjectMyQueryDto>;
