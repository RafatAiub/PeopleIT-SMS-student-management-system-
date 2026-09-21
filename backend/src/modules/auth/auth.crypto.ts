import crypto from 'crypto';
import { authenticator } from 'otplib';
import { env } from '../../config/env';

// =============================================================================
// Auth crypto — token hashing, OTP generation, TOTP secret encryption
// =============================================================================
// Everything persisted here is either hashed (tokens, OTPs, backup codes) or
// encrypted (TOTP secrets). Nothing in these tables is usable if the database
// leaks — that is the whole point of the module.

// ── Hashing ──────────────────────────────────────────────────────────────────

/**
 * SHA-256, matching the existing refresh-token scheme in auth.service.ts.
 * Plain SHA-256 rather than bcrypt is correct *only* because these values are
 * high-entropy random strings we generate — never user-chosen passwords, which
 * would need a slow KDF to resist offline cracking.
 */
export function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/** Timing-safe comparison of two hex digests. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// ── Random values ────────────────────────────────────────────────────────────

/** 256 bits of entropy, URL-safe — used for email-verify and reset links. */
export function generateUrlToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * A 6-digit numeric code. randomInt() is rejection-sampled, so unlike
 * `random() % 1000000` every value is equally likely. Zero-padded, because
 * "042913" and "42913" must not be the same code.
 */
export function generateNumericCode(digits = 6): string {
  const max = 10 ** digits;
  return String(crypto.randomInt(0, max)).padStart(digits, '0');
}

/**
 * Backup codes in `XXXX-XXXX` form. Crockford-ish alphabet with I/L/O/U and
 * 0/1 removed: these get written down and retyped, and the excluded
 * characters are exactly the ones people confuse.
 */
const BACKUP_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

export function generateBackupCode(): string {
  const pick = () =>
    Array.from(
      { length: 4 },
      () => BACKUP_ALPHABET[crypto.randomInt(0, BACKUP_ALPHABET.length)],
    ).join('');
  return `${pick()}-${pick()}`;
}

/** Strip formatting so "abcd efgh" and "ABCD-EFGH" hash identically. */
export function normalizeBackupCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// ── TOTP secret encryption (AES-256-GCM) ─────────────────────────────────────

const ALGO = 'aes-256-gcm';
let cachedKey: Buffer | null = null;

/**
 * 32-byte key from ENCRYPTION_KEY, or derived from JWT_ACCESS_SECRET when that
 * is unset. scrypt with a fixed salt is deterministic by design — the same
 * input must always yield the same key, or every stored secret becomes
 * undecryptable on restart.
 */
function key(): Buffer {
  if (cachedKey) return cachedKey;
  const material = env.ENCRYPTION_KEY ?? env.JWT_ACCESS_SECRET;
  cachedKey = crypto.scryptSync(material, 'peopleit-sms-totp-v1', 32);
  return cachedKey;
}

/** Stored as `iv:authTag:ciphertext`, all base64. */
export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), enc.toString('base64')].join(':');
}

export function decryptSecret(stored: string): string {
  const [ivB64, tagB64, dataB64] = stored.split(':');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Malformed encrypted secret');
  }
  const decipher = crypto.createDecipheriv(ALGO, key(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}

// ── TOTP (RFC 6238 — Google Authenticator, Authy, 1Password, …) ──────────────

// A one-step window either side: accepts the previous and next 30-second code.
// Without it, anyone whose phone clock drifts by a few seconds — or who types
// slowly — gets rejected on a correct code.
authenticator.options = { window: 1, step: 30 };

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

/**
 * The otpauth:// URI encoded into the setup QR. The label carries the account
 * identifier and the issuer is what the authenticator app lists it under, so
 * a user with several accounts can tell them apart.
 */
export function buildTotpUri(secret: string, accountLabel: string, issuer = 'PeopleNIT SMS'): string {
  return authenticator.keyuri(accountLabel, issuer, secret);
}

export function verifyTotp(secret: string, token: string): boolean {
  try {
    return authenticator.verify({ secret, token: token.replace(/\s/g, '') });
  } catch {
    // otplib throws on malformed input (non-numeric, wrong length); a bad code
    // is a failed check, not a server error.
    return false;
  }
}
