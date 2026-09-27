import { z } from 'zod';

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable().or(z.literal(''));

export const CreateBranchDto = z.object({
  name: z.string().trim().min(2, 'Branch name is too short').max(150),
  address: optionalText(500),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s()]{7,20}$/, 'Invalid phone number')
    .optional()
    .nullable()
    .or(z.literal('')),
  email: z.string().trim().toLowerCase().email('Invalid email format').optional().nullable().or(z.literal('')),
});

export const UpdateBranchDto = CreateBranchDto.partial().extend({
  isActive: z.boolean().optional(),
});

export const BranchQueryDto = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(100).optional(),
  status: z.enum(['active', 'inactive', 'all']).default('all'),
});

export const BranchIdParamDto = z.object({
  id: z.string().min(1),
});

export type CreateBranchDtoType = z.infer<typeof CreateBranchDto>;
export type UpdateBranchDtoType = z.infer<typeof UpdateBranchDto>;
export type BranchQueryDtoType = z.infer<typeof BranchQueryDto>;
