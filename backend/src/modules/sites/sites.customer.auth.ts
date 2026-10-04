// =============================================================================
// Sites — customer (shop buyer / learner) auth. One JWT per site: signed with
// a key DERIVED from JWT_ACCESS_SECRET (HMAC(JWT_ACCESS_SECRET, 'site-customer')),
// never the secret itself, so:
//   - the staff `authenticate` middleware (which verifies with JWT_ACCESS_SECRET
//     directly) always rejects a customer token — the signature won't match.
//   - a customer token can never be handed to a staff-only endpoint.
// The token also carries `sid` (siteId) and `aud: 'site-customer'`, so a token
// issued for site X is refused when presented to site Y.
// =============================================================================

import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';

const AUDIENCE = 'site-customer';
export const CUSTOMER_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

/** HMAC(baseSecret, 'site-customer') — a key that is provably different from baseSecret. */
export function deriveCustomerSecret(baseSecret: string = env.JWT_ACCESS_SECRET): string {
  return crypto.createHmac('sha256', baseSecret).update(AUDIENCE).digest('hex');
}

export interface CustomerTokenPayload {
  sub: string; // SiteCustomer id
  sid: string; // Site id
  aud: typeof AUDIENCE;
  iat?: number;
  exp?: number;
}

export function signCustomerToken(customerId: string, siteId: string, secret: string = deriveCustomerSecret()): string {
  return jwt.sign({ sub: customerId, sid: siteId }, secret, {
    algorithm: 'HS256',
    audience: AUDIENCE,
    expiresIn: CUSTOMER_TOKEN_TTL_SECONDS,
  });
}

/** Verified customer id, or null (expired/invalid/wrong site/wrong audience). Never throws. */
export function verifyCustomerToken(token: string | undefined | null, siteId: string, secret: string = deriveCustomerSecret()): string | null {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, secret, { audience: AUDIENCE }) as CustomerTokenPayload;
    if (decoded.sid !== siteId || typeof decoded.sub !== 'string') return null;
    return decoded.sub;
  } catch {
    return null;
  }
}

export function bearerToken(header: string | undefined): string | null {
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

// ── Passwords ────────────────────────────────────────────────────────────────

/** Prefix for a placeholder hash set on a customer an admin granted access to before they registered. */
const UNCLAIMED_PREFIX = 'unclaimed:';

/** An unusable hash — bcrypt.compare against it always fails; register() recognises the prefix and claims the account. */
export function unclaimedPasswordHash(): string {
  return `${UNCLAIMED_PREFIX}${crypto.randomBytes(24).toString('hex')}`;
}

export function isUnclaimedPasswordHash(hash: string): boolean {
  return hash.startsWith(UNCLAIMED_PREFIX);
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, env.BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (isUnclaimedPasswordHash(hash)) return false;
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}
