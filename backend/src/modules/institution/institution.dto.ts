import { z } from 'zod';

export const UpdateWebsiteConfigDto = z.object({
  // Core institution profile fields (real columns on the Institution model —
  // see backend/prisma/schema.prisma). These were previously stripped by
  // Zod because the schema didn't list them, silently discarding saves from
  // System Settings > Institution Profile (Bug 5a).
  name: z.string().trim().min(2, 'Institution name is too short').max(200).optional(),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s()]{7,20}$/, 'Invalid phone number')
    .optional()
    .nullable()
    .or(z.literal('')),
  email: z.string().trim().toLowerCase().email('Invalid email format').or(z.literal('')).optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
  logoUrl: z.string().trim().optional().nullable(),

  // Public website / branding fields
  themeColor: z
    .string()
    .regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Invalid hex color code')
    .optional()
    .nullable(),
  heroTitle: z.string().min(1, 'Hero title cannot be empty').max(200).optional().nullable(),
  heroSubtitle: z.string().min(1, 'Hero subtitle cannot be empty').max(500).optional().nullable(),
  aboutText: z.string().optional().nullable(),
  contactEmail: z.string().email('Invalid email format').or(z.literal('')).optional().nullable(),
  contactPhone: z.string().optional().nullable(),
});

export type UpdateWebsiteConfigDtoType = z.infer<typeof UpdateWebsiteConfigDto>;

export const CreateInstitutionDto = z.object({
  name: z.string().min(2, 'Institution name is too short').max(200),
  slug: z.string().regex(/^\d+$/, 'Institution Code / EIIN must be a numeric value'),
  adminEmail: z.string().email('Invalid email address').toLowerCase(),
  adminPassword: z.string().min(6, 'Password must be at least 6 characters'),
  adminFirstName: z.string().min(1, 'First name is required'),
  adminLastName: z.string().min(1, 'Last name is required'),
});

export type CreateInstitutionDtoType = z.infer<typeof CreateInstitutionDto>;

export const UpdateInstitutionAdminDto = z.object({
  institutionName: z.string().trim().min(2, 'Institution name is too short').max(200).optional(),
  adminFirstName: z.string().trim().min(1, 'First name is required'),
  adminLastName: z.string().trim().min(1, 'Last name is required'),
  adminEmail: z.string().trim().toLowerCase().email('Invalid email address'),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s()]{7,20}$/, 'Invalid phone number')
    .optional()
    .or(z.literal('')),
  adminPassword: z
    .string()
    .min(6, 'Password must be at least 6 characters')
    .optional()
    .or(z.literal('')),
});

export type UpdateInstitutionAdminDtoType = z.infer<typeof UpdateInstitutionAdminDto>;

export const SetInstitutionStatusDto = z.object({
  isActive: z.boolean(),
});

export type SetInstitutionStatusDtoType = z.infer<typeof SetInstitutionStatusDto>;

export const StartSupportSessionDto = z.object({
  institutionId: z.string().min(1, 'Institution ID is required'),
  targetUserId: z.string().min(1, 'Target User ID is required'),
  reason: z.string().min(5, 'Reason must be at least 5 characters'),
  ticketId: z.string().optional().nullable(),
  isReadOnly: z.boolean().default(true),
});

export type StartSupportSessionDtoType = z.infer<typeof StartSupportSessionDto>;

export const AdminUserActionDto = z.object({
  userId: z.string().min(1, 'User ID is required'),
  action: z.enum(['SEND_PASSWORD_RESET', 'FORCE_PASSWORD_RESET', 'TOGGLE_STATUS', 'REVOKE_SESSIONS']),
  isActive: z.boolean().optional(),
});

export type AdminUserActionDtoType = z.infer<typeof AdminUserActionDto>;


