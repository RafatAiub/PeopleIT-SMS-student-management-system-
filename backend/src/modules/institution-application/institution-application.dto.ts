import { z } from 'zod';
// Single source of truth for BD phone rules — see utils/phone.ts. The mobile
// validator used to be duplicated here and in the frontend apply page; now
// that the same number is a login identifier, both sides must agree exactly.
import { optionalBdMobileSchema, institutionPhoneSchema } from '../../utils/phone';

export const SubmitApplicationDto = z.object({
  institutionName: z
    .string()
    .trim()
    .min(2, 'Institution name must be at least 2 characters')
    .max(200, 'Institution name must not exceed 200 characters')
    .refine(
      (val) => /^[a-zA-Z0-9\s\-&.,()]*$/.test(val),
      { message: 'Institution name contains invalid characters' },
    ),

  slug: z
    .string()
    .trim()
    .regex(/^\d+$/, 'Institution Code / EIIN must be a numeric value')
    .refine(
      (val) => val.length >= 4 && val.length <= 10,
      { message: 'Institution Code / EIIN must be between 4 and 10 digits' },
    ),

  address: z
    .string()
    .trim()
    .max(500, 'Address must not exceed 500 characters')
    .optional()
    .or(z.literal('')),

  phone: institutionPhoneSchema.optional().or(z.literal('')),

  applicantFirstName: z
    .string()
    .trim()
    .min(1, 'First name is required')
    .max(100, 'First name must not exceed 100 characters')
    .refine(
      (val) => /^[a-zA-Z\s\-']*$/.test(val),
      { message: 'First name should only contain letters, spaces, hyphens, and apostrophes' },
    ),

  applicantLastName: z
    .string()
    .trim()
    .min(1, 'Last name is required')
    .max(100, 'Last name must not exceed 100 characters')
    .refine(
      (val) => /^[a-zA-Z\s\-']*$/.test(val),
      { message: 'Last name should only contain letters, spaces, hyphens, and apostrophes' },
    ),

  applicantEmail: z
    .string()
    .trim()
    .toLowerCase()
    .email('Please enter a valid email address (e.g., name@example.com)')
    .refine(
      (val) => val.length <= 255,
      { message: 'Email address must not exceed 255 characters' },
    ),

  applicantPhone: optionalBdMobileSchema,

  message: z
    .string()
    .trim()
    .max(2000, 'Message must not exceed 2000 characters')
    .optional()
    .or(z.literal('')),
});

export type SubmitApplicationDtoType = z.infer<typeof SubmitApplicationDto>;

export const RejectApplicationDto = z.object({
  reason: z.string().trim().min(5, 'Reason must be at least 5 characters').max(1000),
});

export type RejectApplicationDtoType = z.infer<typeof RejectApplicationDto>;
