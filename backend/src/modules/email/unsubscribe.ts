import crypto from 'crypto';
import { env } from '../../config/env';
import { normalizeEmail } from './mask';
import { suppress } from './suppression';

// =============================================================================
// Stateless, single-purpose unsubscribe token: HMAC-signed, no DB row needed.
// Domain-separated from every other use of JWT_ACCESS_SECRET via the 'email-
// unsubscribe' HMAC key label, same pattern as sites.customer.auth.ts's
// deriveCustomerSecret(). BULK scope only (see suppression.ts) — this never
// touches receipts, OTPs or invites.
// =============================================================================

const LABEL = 'email-unsubscribe';

function secret(): string {
  return crypto.createHmac('sha256', env.JWT_ACCESS_SECRET).update(LABEL).digest('hex');
}

export interface UnsubscribeTokenPayload {
  email: string;
  institutionId?: string | null;
}

/** No expiry: an unsubscribe link must keep working whenever the recipient gets around to it. */
export function signUnsubscribeToken(payload: UnsubscribeTokenPayload): string {
  const body = JSON.stringify({ e: normalizeEmail(payload.email), i: payload.institutionId ?? null });
  const b64 = Buffer.from(body, 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(b64).digest('base64url');
  return `${b64}.${sig}`;
}

export function verifyUnsubscribeToken(token: string): UnsubscribeTokenPayload | null {
  const [b64, sig] = token.split('.');
  if (!b64 || !sig) return null;
  const expected = crypto.createHmac('sha256', secret()).update(b64).digest('base64url');
  try {
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const parsed = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8')) as { e: string; i: string | null };
    if (!parsed.e) return null;
    return { email: parsed.e, institutionId: parsed.i };
  } catch {
    return null;
  }
}

export function unsubscribeUrl(payload: UnsubscribeTokenPayload): string {
  const token = signUnsubscribeToken(payload);
  return `${env.APP_URL}/api/v1/email/unsubscribe?token=${encodeURIComponent(token)}`;
}

/** Applies the BULK-scope suppression for a verified token. Idempotent. */
export async function applyUnsubscribe(token: string, source: string): Promise<{ ok: boolean; email?: string }> {
  const payload = verifyUnsubscribeToken(token);
  if (!payload) return { ok: false };
  await suppress({
    email: payload.email,
    scope: 'BULK',
    reason: 'UNSUBSCRIBED',
    source,
    institutionId: payload.institutionId,
  });
  return { ok: true, email: payload.email };
}
