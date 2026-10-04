import { z } from 'zod';

const money = z.coerce.number().nonnegative().max(100_000_000);

export const CreateComponentDto = z
  .object({
    name: z.string().trim().min(1).max(100),
    type: z.enum(['ALLOWANCE', 'DEDUCTION']),
    calcType: z.enum(['FIXED', 'PERCENT_OF_BASE']),
    value: money,
    isActive: z.boolean().optional().default(true),
  })
  .refine((d) => d.calcType !== 'PERCENT_OF_BASE' || d.value <= 100, {
    message: 'A percentage cannot exceed 100',
    path: ['value'],
  });

export const UpdateComponentDto = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    type: z.enum(['ALLOWANCE', 'DEDUCTION']).optional(),
    calcType: z.enum(['FIXED', 'PERCENT_OF_BASE']).optional(),
    value: money.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Nothing to update' });

export const ComponentQueryDto = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(100),
  activeOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

export const IdParamDto = z.object({ id: z.string().min(1) });
export const StaffParamDto = z.object({ staffId: z.string().min(1) });

export const AssignComponentsDto = z.object({
  components: z
    .array(
      z.object({
        componentId: z.string().min(1),
        overrideValue: money.nullable().optional(),
      }),
    )
    .max(50),
});

export type CreateComponentDtoType = z.infer<typeof CreateComponentDto>;
export type UpdateComponentDtoType = z.infer<typeof UpdateComponentDto>;
export type ComponentQueryDtoType = z.infer<typeof ComponentQueryDto>;
export type AssignComponentsDtoType = z.infer<typeof AssignComponentsDto>;
