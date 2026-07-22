import { z } from 'zod';

// =============================================================================
// Auth DTOs — Zod validation schemas for auth endpoints
// =============================================================================

export const LoginDto = z.object({
  email: z.string().email('Invalid email address').toLowerCase(),
  password: z.string().min(1, 'Password is required'),
  institutionCode: z.string().optional(),
});

export const RefreshDto = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export const LogoutDto = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export type LoginDtoType = z.infer<typeof LoginDto>;
export type RefreshDtoType = z.infer<typeof RefreshDto>;
export type LogoutDtoType = z.infer<typeof LogoutDto>;
