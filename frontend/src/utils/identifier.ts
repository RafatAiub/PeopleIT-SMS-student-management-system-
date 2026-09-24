// =============================================================================
// Sign-in identifier & BD mobile validation (client side)
// =============================================================================
// Mirrors backend/src/utils/phone.ts exactly. The rules are duplicated rather
// than shared because the two packages have no common build output — so if you
// change one, change the other, or users will be able to register a number
// they cannot sign in with.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOCAL_FORMAT = /^01[0-9]{9}$/; // 01712345678
const COUNTRY_FORMAT = /^8801[0-9]{9}$/; // 8801712345678

export const BD_MOBILE_HINT = '01XXXXXXXXX or +8801XXXXXXXXX';

export function digitsOf(value: string): string {
  return value.replace(/\D/g, '');
}

/** Canonical `8801XXXXXXXXX` storage form, or null when not a BD mobile. */
export function normalizeBdMobile(value: string): string | null {
  const digits = digitsOf(value);
  if (LOCAL_FORMAT.test(digits)) return `88${digits}`;
  if (COUNTRY_FORMAT.test(digits)) return digits;
  return null;
}

export function isValidBdMobile(value: string): boolean {
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

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

/**
 * Anything containing '@' is treated as an email attempt, so a typo'd address
 * reports an email problem rather than being misread as a bad phone number.
 */
export function isValidIdentifier(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return trimmed.includes('@') ? isValidEmail(trimmed) : isValidBdMobile(trimmed);
}

/** The specific reason an identifier was rejected, for inline field errors. */
export function describeIdentifier(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return 'Enter your email address or mobile number.';
  if (trimmed.includes('@')) return 'Please enter a valid email address.';

  const digits = digitsOf(trimmed);
  if (digits.length < 11) return 'Mobile number must have at least 11 digits (e.g., 01700000000).';
  if (digits.length > 13) return 'Mobile number cannot exceed 13 digits.';
  return `Enter a valid BD mobile number (${BD_MOBILE_HINT}).`;
}

/** Staged messages for a dedicated mobile-number field, matching the backend. */
export function describeBdMobile(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return 'Mobile number is required.';

  const digits = digitsOf(trimmed);
  if (digits.length < 11) return 'Mobile number must have at least 11 digits (e.g., 01700000000).';
  if (digits.length > 13) return 'Mobile number cannot exceed 13 digits.';
  if (!isValidBdMobile(trimmed)) return `Enter a valid BD mobile number (${BD_MOBILE_HINT}).`;
  return null;
}

// ── Password policy (mirrors passwordSchema in backend auth.dto.ts) ──────────

export interface PasswordCheck {
  label: string;
  met: boolean;
}

export function checkPassword(value: string): PasswordCheck[] {
  return [
    { label: 'At least 8 characters', met: value.length >= 8 },
    { label: 'A lowercase letter', met: /[a-z]/.test(value) },
    { label: 'An uppercase letter', met: /[A-Z]/.test(value) },
    { label: 'A number', met: /[0-9]/.test(value) },
  ];
}

export function isValidPassword(value: string): boolean {
  return checkPassword(value).every((c) => c.met) && value.length <= 128;
}
