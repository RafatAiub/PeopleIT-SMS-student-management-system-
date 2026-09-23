import {
  normalizeBdMobile,
  isValidBdMobile,
  formatBdMobile,
  bdMobileSchema,
  optionalBdMobileSchema,
} from '../src/utils/phone';
import {
  hashToken,
  safeEqual,
  generateUrlToken,
  generateNumericCode,
  generateBackupCode,
  normalizeBackupCode,
  encryptSecret,
  decryptSecret,
  generateTotpSecret,
  buildTotpUri,
  verifyTotp,
} from '../src/modules/auth/auth.crypto';
import { authenticator } from 'otplib';

// Pure unit tests — no database, no network. These cover the primitives the
// rest of the auth upgrade is built on, so a regression here would surface as
// "users can't log in" rather than anything obviously phone- or crypto-shaped.

describe('BD mobile normalisation', () => {
  it('normalises every accepted input shape to 8801XXXXXXXXX', () => {
    const expected = '8801712345678';
    for (const input of [
      '01712345678',
      '+8801712345678',
      '8801712345678',
      '+880 1712-345678',
      '  01712 345 678  ',
      '(880) 1712 345678',
    ]) {
      expect(normalizeBdMobile(input)).toBe(expected);
    }
  });

  it('rejects numbers that are not valid BD mobiles', () => {
    for (const input of [
      '',
      '0171234567', // 10 digits — one short
      '017123456789', // 12 digits — one long
      '02712345678', // does not start 01
      '+1 555 123 4567', // wrong country
      'not-a-number',
      '88017123456789',
    ]) {
      expect(normalizeBdMobile(input)).toBeNull();
      expect(isValidBdMobile(input)).toBe(false);
    }
  });

  it('treats null and undefined as absent rather than throwing', () => {
    expect(normalizeBdMobile(null)).toBeNull();
    expect(normalizeBdMobile(undefined)).toBeNull();
  });

  it('accepts every operator prefix 013-019', () => {
    for (const d of ['3', '4', '5', '6', '7', '8', '9']) {
      expect(isValidBdMobile(`01${d}12345678`)).toBe(true);
    }
  });

  it('renders stored numbers back to local form for display', () => {
    expect(formatBdMobile('8801712345678')).toBe('01712345678');
    expect(formatBdMobile(null)).toBe('');
    // Unparseable legacy values pass through rather than being mangled.
    expect(formatBdMobile('ext. 402')).toBe('ext. 402');
  });
});

describe('bdMobileSchema', () => {
  it('outputs the normalised value, not the raw input', () => {
    expect(bdMobileSchema.parse('+880 1712-345678')).toBe('8801712345678');
  });

  it('reports length problems before shape problems', () => {
    const short = bdMobileSchema.safeParse('017123');
    expect(short.success).toBe(false);
    if (!short.success) {
      expect(short.error.issues[0].message).toMatch(/at least 11 digits/);
    }

    const long = bdMobileSchema.safeParse('01712345678901234');
    expect(long.success).toBe(false);
    if (!long.success) {
      expect(long.error.issues[0].message).toMatch(/cannot exceed 13 digits/);
    }
  });

  it('gives an actionable message on a well-sized but invalid number', () => {
    const result = bdMobileSchema.safeParse('02712345678');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/01XXXXXXXXX/);
    }
  });

  it('maps empty and omitted values to null when optional', () => {
    expect(optionalBdMobileSchema.parse('')).toBeNull();
    expect(optionalBdMobileSchema.parse(undefined)).toBeNull();
    expect(optionalBdMobileSchema.parse('01712345678')).toBe('8801712345678');
  });
});

describe('token hashing', () => {
  it('is deterministic and hides the input', () => {
    const raw = generateUrlToken();
    expect(hashToken(raw)).toBe(hashToken(raw));
    expect(hashToken(raw)).not.toContain(raw);
    expect(hashToken(raw)).toHaveLength(64);
  });

  it('compares equal digests safely and rejects mismatches', () => {
    const a = hashToken('one');
    expect(safeEqual(a, hashToken('one'))).toBe(true);
    expect(safeEqual(a, hashToken('two'))).toBe(false);
    // Different lengths must return false, not throw.
    expect(safeEqual(a, 'short')).toBe(false);
  });
});

describe('random value generation', () => {
  it('produces distinct high-entropy URL tokens', () => {
    const tokens = new Set(Array.from({ length: 200 }, generateUrlToken));
    expect(tokens.size).toBe(200);
    // base64url only — safe to drop straight into a query string.
    for (const t of tokens) expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('zero-pads numeric codes so every code is the full width', () => {
    for (let i = 0; i < 500; i++) {
      expect(generateNumericCode(6)).toMatch(/^[0-9]{6}$/);
    }
  });

  it('builds backup codes from an unambiguous alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateBackupCode();
      expect(code).toMatch(/^[2-9A-HJ-NP-TV-Z]{4}-[2-9A-HJ-NP-TV-Z]{4}$/);
      // The characters people misread must never appear.
      expect(code).not.toMatch(/[ILOU01]/);
    }
  });

  it('normalises backup codes so formatting and case do not matter', () => {
    expect(normalizeBackupCode('abcd-efgh')).toBe('ABCDEFGH');
    expect(normalizeBackupCode('ABCD EFGH')).toBe('ABCDEFGH');
    expect(normalizeBackupCode('ABCDEFGH')).toBe('ABCDEFGH');
  });
});

describe('TOTP secret encryption', () => {
  it('round-trips a secret', () => {
    const secret = generateTotpSecret();
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });

  it('never stores the plaintext', () => {
    const secret = generateTotpSecret();
    expect(encryptSecret(secret)).not.toContain(secret);
  });

  it('uses a fresh IV each time, so identical secrets encrypt differently', () => {
    const secret = generateTotpSecret();
    expect(encryptSecret(secret)).not.toBe(encryptSecret(secret));
  });

  it('rejects a tampered ciphertext rather than returning garbage', () => {
    const stored = encryptSecret(generateTotpSecret());
    const [iv, tag, data] = stored.split(':');
    // Flip a byte in the payload — GCM's auth tag must catch it.
    const flipped = Buffer.from(data, 'base64');
    flipped[0] ^= 0xff;
    expect(() => decryptSecret(`${iv}:${tag}:${flipped.toString('base64')}`)).toThrow();
  });

  it('rejects a malformed stored value', () => {
    expect(() => decryptSecret('nonsense')).toThrow(/Malformed/);
  });
});

describe('TOTP verification', () => {
  it('accepts the current code from the matching secret', () => {
    const secret = generateTotpSecret();
    expect(verifyTotp(secret, authenticator.generate(secret))).toBe(true);
  });

  it('tolerates whitespace in user-typed codes', () => {
    const secret = generateTotpSecret();
    const code = authenticator.generate(secret);
    expect(verifyTotp(secret, `${code.slice(0, 3)} ${code.slice(3)}`)).toBe(true);
  });

  it('rejects a code from a different secret', () => {
    const code = authenticator.generate(generateTotpSecret());
    // 1-in-a-million chance of a genuine collision; retry once to avoid flake.
    const other = generateTotpSecret();
    const rejected = !verifyTotp(other, code) || !verifyTotp(generateTotpSecret(), code);
    expect(rejected).toBe(true);
  });

  it('returns false rather than throwing on malformed input', () => {
    const secret = generateTotpSecret();
    for (const bad of ['', 'abcdef', '12', '!!!!!!']) {
      expect(verifyTotp(secret, bad)).toBe(false);
    }
  });

  it('builds an otpauth URI the authenticator apps can parse', () => {
    const secret = generateTotpSecret();
    const uri = buildTotpUri(secret, 'teacher@school.edu.bd');
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(uri).toContain(`secret=${secret}`);
    expect(uri).toContain('issuer=PeopleNIT%20SMS');
    expect(uri).toContain('teacher%40school.edu.bd');
  });
});
