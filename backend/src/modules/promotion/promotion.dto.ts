import { z } from 'zod';

export const PROMOTION_STATUSES = ['PROMOTED', 'RETAINED', 'GRADUATED', 'TRANSFERRED'] as const;

const booleanish = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((v) => v === true || v === 'true');

export const CandidatesQueryDto = z.object({
  fromAcademicYearId: z.string().min(1, 'Source session is required'),
  fromClassId: z.string().min(1, 'Source class is required'),
  fromSectionId: z.string().min(1).optional(),
  // Optional: attach each student's result summary for this exam.
  examId: z.string().min(1).optional(),
  // Optional: flag students already processed for this target session.
  toAcademicYearId: z.string().min(1).optional(),
  // Legacy students often have no academicYearId; include them by default.
  includeUnassignedYear: booleanish.optional().default(true),
});

export const PromotionDecisionDto = z.object({
  studentId: z.string().min(1),
  status: z.enum(PROMOTION_STATUSES),
  toClassId: z.string().min(1).optional().nullable(),
  toSectionId: z.string().min(1).optional().nullable(),
  note: z.string().trim().max(300).optional().nullable(),
});

export const PromotionRequestDto = z
  .object({
    fromAcademicYearId: z.string().min(1, 'Source session is required'),
    fromClassId: z.string().min(1, 'Source class is required'),
    fromSectionId: z.string().min(1).optional().nullable(),
    toAcademicYearId: z.string().min(1, 'Target session is required'),
    toClassId: z.string().min(1).optional().nullable(),
    toSectionId: z.string().min(1).optional().nullable(),
    includeUnassignedYear: z.boolean().optional().default(true),
    note: z.string().trim().max(300).optional().nullable(),
    decisions: z.array(PromotionDecisionDto).min(1, 'Select at least one student').max(1000),
  })
  .refine((d) => d.fromAcademicYearId !== d.toAcademicYearId, {
    message: 'Target session must be different from the source session',
    path: ['toAcademicYearId'],
  })
  .refine((d) => !d.toSectionId || Boolean(d.toClassId), {
    message: 'A target section needs a target class',
    path: ['toSectionId'],
  });

export const PromotionHistoryQueryDto = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  studentId: z.string().min(1).optional(),
  toAcademicYearId: z.string().min(1).optional(),
  fromClassId: z.string().min(1).optional(),
  status: z.enum(PROMOTION_STATUSES).optional(),
  batchId: z.string().min(1).max(100).optional(),
});

export const BatchQueryDto = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const BatchIdParamDto = z.object({
  batchId: z.string().min(3).max(100),
});

export type CandidatesQueryDtoType = z.infer<typeof CandidatesQueryDto>;
export type PromotionRequestDtoType = z.infer<typeof PromotionRequestDto>;
export type PromotionHistoryQueryDtoType = z.infer<typeof PromotionHistoryQueryDto>;
export type BatchQueryDtoType = z.infer<typeof BatchQueryDto>;
