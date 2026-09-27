import { z } from 'zod';

export const GradeBandDto = z.object({
  grade: z.string().trim().min(1, 'Grade label is required').max(10),
  minPercent: z.coerce.number().min(0).max(100),
  maxPercent: z.coerce.number().min(0).max(100),
  gradePoint: z.coerce.number().min(0).max(9.99),
  remark: z.string().trim().max(100).optional().nullable(),
});

export const CreateGradingScaleDto = z.object({
  name: z.string().trim().min(1, 'Scale name is required').max(100),
  isDefault: z.boolean().optional().default(false),
  bands: z.array(GradeBandDto).min(1, 'At least one grade band is required').max(30),
});

export const UpdateGradingScaleDto = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  bands: z.array(GradeBandDto).min(1).max(30).optional(),
});

export const SeedBangladeshDto = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  setDefault: z.boolean().optional().default(true),
});

export const GradingScaleQueryDto = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const GradingScaleIdParamDto = z.object({
  id: z.string().min(1, 'Invalid grading scale ID'),
});

export type GradeBandDtoType = z.infer<typeof GradeBandDto>;
export type CreateGradingScaleDtoType = z.infer<typeof CreateGradingScaleDto>;
export type UpdateGradingScaleDtoType = z.infer<typeof UpdateGradingScaleDto>;
export type SeedBangladeshDtoType = z.infer<typeof SeedBangladeshDto>;
export type GradingScaleQueryDtoType = z.infer<typeof GradingScaleQueryDto>;
