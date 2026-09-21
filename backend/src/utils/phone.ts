import { z } from 'zod';

// =============================================================================
// Bangladesh mobile numbers — canonical validation & normalisation
// =============================================================================
// Historically this logic lived inline in institution-application.dto.ts and
// was copy-pasted into the frontend apply page. Now that `User.phone` is a
// login identifier it has to be exactly one implementation: two validators
// that disagree by a single digit would let a user register a number they can
// never sign in with.
//
// Storage format is E.164 *without* the leading plus — `8801XXXXXXXXX` — so
// that "01712345678", "+8801712345678" and "880 1712-345678" all resolve to
// the same row on lookup.

/** Accepted input shapes, after stripping every non-digit. */
const LOCAL_FORMAT = /^01[0-9]{9}$/; // 01712345678
const COUNTRY_FORMAT = /^8801[0-9]{9}$/; // 8801712345678

export const BD_MOBILE_HINT = '01XXXXXXXXX or +8801XXXXXXXXX';

/** Strip formatting so "+880 171-234 5678" becomes "8801712345678". */
export function digitsOf(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * Normalise a BD mobile number to its canonical `8801XXXXXXXXX` storage form.
 * Returns null when the input is not a valid BD mobile number, so callers can
 * treat "unparseable" and "invalid" as one case.
 */
export function normalizeBdMobile(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = digitsOf(value);

  if (LOCAL_FORMAT.test(digits)) return `88${digits}`;
  if (COUNTRY_FORMAT.test(digits)) return digits;
  return null;
}

/** True when the value is a well-formed BD mobile number. */
export function isValidBdMobile(value: string | null | undefined): boolean {
  return normalizeBdMobile(value) !== null;
}

/**
 * Render a stored `8801XXXXXXXXX` back to the local `01XXXXXXXXX` form that
 * Bangladeshi users actually recognise. Anything unexpected passes through
 * untouched rather than throwing — this is display-only.
 */
export function formatBdMobile(stored: string | null | undefined): string {
  if (!stored) return '';
  const digits = digitsOf(stored);
  return COUNTRY_FORMAT.test(digits) ? `0${digits.slice(3)}` : stored;
}

// ── Zod schemas ──────────────────────────────────────────────────────────────

/**
 * A required BD mobile number. Emits the same staged messages the application
 * form has always used — length first, then shape — because a bare "invalid
 * number" on an 8-digit entry tells the user nothing actionable.
 *
 * The output is the *normalised* value, so anything parsed through this schema
 * is already in storage form and needs no further massaging.
 */
export const bdMobileSchema = z
  .string()
  .trim()
  .min(1, 'Mobile number is required')
  .superRefine((val, ctx) => {
    const digits = digitsOf(val);

    if (digits.length < 11) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Mobile number must have at least 11 digits (e.g., 01700000000)',
      });
      return;
    }
    if (digits.length > 13) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Mobile number cannot exceed 13 digits',
      });
      return;
    }
    if (!LOCAL_FORMAT.test(digits) && !COUNTRY_FORMAT.test(digits)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Enter a valid BD mobile number (${BD_MOBILE_HINT}). Valid operators: Grameenphone, Banglalink, Robi, Airtel, TeletalkBD`,
      });
    }
  })
  .transform((val) => normalizeBdMobile(val) as string);

/** Same rules, but the field may be omitted or submitted as an empty string. */
export const optionalBdMobileSchema = z
  .union([bdMobileSchema, z.literal('')])
  .optional()
  .transform((val) => (val ? val : null));

/**
 * Landline-tolerant validator for *institution* contact numbers — deliberately
 * looser than the mobile rules, and never used as a login identifier.
 */
export const institutionPhoneSchema = z
  .string()
  .trim()
  .refine((val) => !val || digitsOf(val).length >= 7, {
    message: 'Phone number must have at least 7 digits',
  })
  .refine((val) => !val || /^[+]?[0-9\s()\-]*$/.test(val), {
    message: 'Phone number can only contain digits, +, -, (), and spaces',
  })
  .refine((val) => val.length <= 25, { message: 'Phone number is too long' });
