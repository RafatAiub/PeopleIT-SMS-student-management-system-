import { z } from 'zod';

// =============================================================================
// Guardian DTOs — Zod validation schemas
// =============================================================================

export const CreateGuardianDto = z.object({
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  relationship: z.string().min(1, 'Relationship is required').max(50),
  phone: z.string().min(1, 'Phone is required').max(20),
  email: z.string().email().optional(),
  address: z.string().max(500).optional(),
  occupation: z.string().max(100).optional(),
  nidNumber: z.string().max(30).optional(),
});

export const UpdateGuardianDto = CreateGuardianDto.partial();

export const GuardianQueryDto = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
});

export const GuardianIdParamDto = z.object({
  id: z.string().cuid('Invalid guardian ID'),
});

export const LinkGuardianDto = z.object({
  guardianId: z.string().cuid('Invalid guardian ID'),
  relationship: z.string().max(50).optional(),
  isPrimary: z.boolean().default(false),
});

export const LinkParamsDto = z.object({
  id: z.string().cuid('Invalid student ID'),
  guardianId: z.string().cuid('Invalid guardian ID'),
});

export type CreateGuardianDtoType = z.infer<typeof CreateGuardianDto>;
export type UpdateGuardianDtoType = z.infer<typeof UpdateGuardianDto>;
export type GuardianQueryDtoType = z.infer<typeof GuardianQueryDto>;
export type LinkGuardianDtoType = z.infer<typeof LinkGuardianDto>;
