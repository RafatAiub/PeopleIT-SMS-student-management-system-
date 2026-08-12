import { z } from 'zod';

export const SubmitApplicationDto = z.object({
  institutionName: z.string().trim().min(2, 'Institution name is too short').max(200),
  slug: z.string().trim().regex(/^\d+$/, 'Institution Code / EIIN must be a numeric value'),
  address: z.string().trim().max(500).optional().or(z.literal('')),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s()]{7,20}$/, 'Invalid phone number')
    .optional()
    .or(z.literal('')),
  applicantFirstName: z.string().trim().min(1, 'First name is required').max(100),
  applicantLastName: z.string().trim().min(1, 'Last name is required').max(100),
  applicantEmail: z.string().trim().toLowerCase().email('Invalid email address'),
  applicantPhone: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s()]{7,20}$/, 'Invalid phone number')
    .optional()
    .or(z.literal('')),
  message: z.string().trim().max(2000).optional().or(z.literal('')),
});

export type SubmitApplicationDtoType = z.infer<typeof SubmitApplicationDto>;

export const RejectApplicationDto = z.object({
  reason: z.string().trim().min(5, 'Reason must be at least 5 characters').max(1000),
});

export type RejectApplicationDtoType = z.infer<typeof RejectApplicationDto>;
