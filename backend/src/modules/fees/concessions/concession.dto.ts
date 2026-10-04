import { z } from 'zod';

const dateString = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid date');

const ConcessionBase = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  type: z.enum(['PERCENT', 'FIXED']),
  value: z.number().positive('Value must be greater than zero'),
  feeCategoryId: z.string().min(1).nullable().optional(),
  isActive: z.boolean().optional(),
  description: z.string().max(500).nullable().optional(),
});

export const CreateConcessionDto = ConcessionBase.refine((d) => d.type !== 'PERCENT' || d.value <= 100, {
  message: 'A percentage concession cannot exceed 100%',
  path: ['value'],
});
export type CreateConcessionDtoType = z.infer<typeof CreateConcessionDto>;

export const UpdateConcessionDto = ConcessionBase.partial();
export type UpdateConcessionDtoType = z.infer<typeof UpdateConcessionDto>;

export const ListConcessionsQueryDto = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  includeInactive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

export const AssignConcessionDto = z
  .object({
    studentId: z.string().min(1, 'Student is required'),
    concessionId: z.string().min(1, 'Concession is required'),
    validFrom: dateString.nullable().optional(),
    validTo: dateString.nullable().optional(),
    note: z.string().max(500).nullable().optional(),
  })
  .refine((d) => !d.validFrom || !d.validTo || Date.parse(d.validFrom) <= Date.parse(d.validTo), {
    message: 'Valid-to must be on or after valid-from',
    path: ['validTo'],
  });
export type AssignConcessionDtoType = z.infer<typeof AssignConcessionDto>;

export const ListAssignmentsQueryDto = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  studentId: z.string().optional(),
  concessionId: z.string().optional(),
  search: z.string().optional(),
});

export const IdParamDto = z.object({ id: z.string().min(1) });
export const StudentIdParamDto = z.object({ studentId: z.string().min(1) });
