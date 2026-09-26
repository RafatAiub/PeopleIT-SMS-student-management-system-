import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');

const SessionYearFields = z.object({
  label: z.string().trim().min(2, 'Name must be at least 2 characters').max(50),
  startDate: isoDate,
  endDate: isoDate,
});

export const CreateSessionYearDto = SessionYearFields.extend({
  isDefault: z.boolean().default(false),
}).refine((d) => d.endDate > d.startDate, {
  message: 'End date must be after the start date',
  path: ['endDate'],
});

export const UpdateSessionYearDto = SessionYearFields.partial();

export const SessionYearIdParamDto = z.object({
  id: z.string().min(1),
});

export type CreateSessionYearDtoType = z.infer<typeof CreateSessionYearDto>;
export type UpdateSessionYearDtoType = z.infer<typeof UpdateSessionYearDto>;
