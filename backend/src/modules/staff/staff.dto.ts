import { z } from 'zod';

export const StaffRoleDto = z.object({
  name: z.string().trim().min(1, 'Role name is required').max(100),
  permissions: z.array(z.string().min(1).max(100)).max(500).default([]),
});

export const IdParamDto = z.object({
  id: z.string().min(1, 'Invalid ID'),
});

export const ListQueryDto = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(10),
  search: z.string().optional(),
});

export const CreateStaffMemberDto = z.object({
  staffRoleId: z.string().min(1, 'Role is required'),
  firstName: z.string().trim().min(1, 'First name is required').max(100),
  lastName: z.string().trim().min(1, 'Last name is required').max(100),
  email: z.string().trim().toLowerCase().email('A valid email is required'),
  phone: z.string().trim().min(1, 'Mobile is required').max(20),
  gender: z.preprocess((v) => (typeof v === 'string' ? v.toUpperCase() : v), z.enum(['MALE', 'FEMALE', 'OTHER'])),
  dateOfBirth: z.coerce.date().optional().nullable(),
  avatarUrl: z.string().optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
});

export const UpdateStaffMemberDto = CreateStaffMemberDto.omit({ email: true }).partial();

export type StaffRoleDtoType = z.infer<typeof StaffRoleDto>;
export type ListQueryDtoType = z.infer<typeof ListQueryDto>;
export type CreateStaffMemberDtoType = z.infer<typeof CreateStaffMemberDto>;
export type UpdateStaffMemberDtoType = z.infer<typeof UpdateStaffMemberDto>;
