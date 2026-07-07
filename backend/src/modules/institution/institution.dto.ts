import { z } from 'zod';

export const UpdateWebsiteConfigDto = z.object({
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

