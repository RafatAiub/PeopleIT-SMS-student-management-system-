import { z } from 'zod';

export const SubmitLeadDto = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s()]{7,20}$/, 'Invalid phone number'),
  email: z.string().trim().toLowerCase().email('Invalid email address').optional().or(z.literal('')),
  institutionName: z.string().trim().max(200).optional().or(z.literal('')),
  institutionType: z.string().trim().max(100).optional().or(z.literal('')),
  message: z.string().trim().max(2000).optional().or(z.literal('')),
  source: z.string().trim().max(200).optional().or(z.literal('')),
  // Honeypot: hidden on the real form via CSS, so a human never fills it in.
  // A bot that autofills every field trips it. Kept loose (no format check —
  // any non-empty value is a tell) and never persisted.
  website: z.string().optional().or(z.literal('')),
});

export type SubmitLeadDtoType = z.infer<typeof SubmitLeadDto>;

// Covers both a plain status change (e.g. NEW -> CONTACTED) and the
// convert-to-authorized step, which additionally backfills email/
// authorizedEmailId in the same PATCH once the Super Admin has created the
// AuthorizedEmail row via the existing authorized-email endpoint.
export const UpdateLeadDto = z
  .object({
    status: z.enum(['NEW', 'CONTACTED', 'CONVERTED', 'DISMISSED']).optional(),
    email: z.string().trim().toLowerCase().email('Invalid email address').optional(),
    authorizedEmailId: z.string().trim().min(1).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field is required' });

export type UpdateLeadDtoType = z.infer<typeof UpdateLeadDto>;
