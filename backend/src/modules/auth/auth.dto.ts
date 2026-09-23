import { z } from 'zod';
import { isValidBdMobile, bdMobileSchema } from '../../utils/phone';

// =============================================================================
// Auth DTOs — Zod validation schemas for auth endpoints
// =============================================================================

/**
 * Sign-in accepts an email address OR a BD mobile number in one field.
 *
 * `email` is still accepted so existing clients (and the frontend, until it
 * ships the new field) keep working; `identifier` wins when both are sent.
 * Validating only "non-empty" here is deliberate — deciding *which* kind of
 * identifier it is belongs in the service, and a strict union would leak which
 * of the two shapes failed, which is a soft enumeration signal.
 */
export const LoginDto = z
  .object({
    identifier: z.string().trim().min(1, 'Email or phone number is required').optional(),
    email: z.string().trim().toLowerCase().optional(),
    password: z.string().min(1, 'Password is required'),
    institutionCode: z.string().optional(),
  })
  .refine((data) => Boolean(data.identifier ?? data.email), {
    message: 'Email or phone number is required',
    path: ['identifier'],
  })
  .transform((data) => ({
    ...data,
    identifier: (data.identifier ?? data.email) as string,
  }));

/** How a submitted identifier should be looked up. */
export type IdentifierKind = 'email' | 'phone';

/**
 * Classify by shape, not by guessing. Anything containing '@' is treated as an
 * email attempt so a typo'd address reports an email error rather than being
 * misread as a malformed phone number.
 */
export function classifyIdentifier(raw: string): IdentifierKind {
  if (raw.includes('@')) return 'email';
  return isValidBdMobile(raw) ? 'phone' : 'email';
}

/**
 * Second login step. `code` is loose on purpose — it may be a 6-digit emailed
 * OTP, a 6-digit TOTP, or an 8-character backup code, and the service decides
 * which. A strict per-shape schema here would tell an attacker which factor
 * the account uses.
 */
export const VerifyTwoFactorDto = z.object({
  challengeToken: z.string().min(1, 'Sign-in session is required'),
  code: z.string().trim().min(4, 'Enter the code').max(20, 'Code is too long'),
});

/**
 * Password policy, shared by registration and reset so the two can never
 * disagree. Length does most of the real work; the character-class rules are
 * here because institutional policy generally expects them, not because they
 * add much entropy beyond the 8-character floor.
 */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must not exceed 128 characters')
  .refine((v) => /[a-z]/.test(v), 'Password must contain a lowercase letter')
  .refine((v) => /[A-Z]/.test(v), 'Password must contain an uppercase letter')
  .refine((v) => /[0-9]/.test(v), 'Password must contain a number');

const nameSchema = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(100, `${label} must not exceed 100 characters`)
    .refine(
      (v) => /^[a-zA-Z\s\-']*$/.test(v),
      `${label} should only contain letters, spaces, hyphens, and apostrophes`,
    );

/**
 * Self-service registration against an existing institution.
 *
 * `role` is restricted to roles an unapproved stranger may *ask* for — never
 * ADMIN, ACCOUNTANT or SUPER_ADMIN, which carry financial and tenant-wide
 * authority. Even within this subset the request is only a request: the
 * account is created PENDING_APPROVAL and an administrator confirms the role.
 */
export const RegisterDto = z.object({
  institutionCode: z.string().trim().min(1, 'Institution code is required'),
  firstName: nameSchema('First name'),
  lastName: nameSchema('Last name'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Please enter a valid email address (e.g., name@example.com)')
    .max(255, 'Email address must not exceed 255 characters'),
  phone: bdMobileSchema,
  password: passwordSchema,
  role: z.enum(['STUDENT', 'GUARDIAN', 'TEACHER']).default('STUDENT'),
});

export const VerifyEmailDto = z.object({
  token: z.string().min(1, 'Verification token is required'),
});

export const ResendVerificationDto = z.object({
  email: z.string().trim().toLowerCase().email('Please enter a valid email address'),
});

/** Accepts either identifier, same as sign-in. */
export const ForgotPasswordDto = z.object({
  identifier: z.string().trim().min(1, 'Email or phone number is required'),
});

export const ResetPasswordDto = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: passwordSchema,
});

export const RefreshDto = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export const LogoutDto = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export type LoginDtoType = z.infer<typeof LoginDto>;
export type VerifyTwoFactorDtoType = z.infer<typeof VerifyTwoFactorDto>;
export type RegisterDtoType = z.infer<typeof RegisterDto>;
export type VerifyEmailDtoType = z.infer<typeof VerifyEmailDto>;
export type ResendVerificationDtoType = z.infer<typeof ResendVerificationDto>;
export type ForgotPasswordDtoType = z.infer<typeof ForgotPasswordDto>;
export type ResetPasswordDtoType = z.infer<typeof ResetPasswordDto>;
export type RefreshDtoType = z.infer<typeof RefreshDto>;
export type LogoutDtoType = z.infer<typeof LogoutDto>;
