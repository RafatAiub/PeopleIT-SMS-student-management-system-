import { z } from 'zod';

export const AddAuthorizedEmailDto = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  note: z.string().trim().max(500).optional().or(z.literal('')),
});

export type AddAuthorizedEmailDtoType = z.infer<typeof AddAuthorizedEmailDto>;
