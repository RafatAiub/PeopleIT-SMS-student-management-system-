// =============================================================================
// Preview tokens — short-lived signed JWTs that let editors see draft pages
// (and live-data blocks of an unpublished site) through the public API.
// Signed with the existing JWT_ACCESS_SECRET, but with a dedicated audience
// and purpose claim so a preview token can never be used as an access token
// (authenticate() requires `role`, which these never carry) and an access
// token can never be used as a preview token.
// =============================================================================

import jwt from 'jsonwebtoken';
import { env } from '../../config/env';

export const PREVIEW_TOKEN_TTL_SECONDS = 2 * 60 * 60; // 2 hours
const AUDIENCE = 'site-preview';
const PURPOSE = 'SITE_PREVIEW';

interface PreviewPayload {
  purpose: typeof PURPOSE;
  siteId: string;
  sub: string;
}

export function signPreviewToken(siteId: string, userId: string, secret = env.JWT_ACCESS_SECRET): string {
  const payload: PreviewPayload = { purpose: PURPOSE, siteId, sub: userId };
  return jwt.sign(payload, secret, { expiresIn: PREVIEW_TOKEN_TTL_SECONDS, audience: AUDIENCE });
}

/** True only for an unexpired preview token issued for this exact site. */
export function verifyPreviewToken(token: string | undefined | null, siteId: string, secret = env.JWT_ACCESS_SECRET): boolean {
  if (!token) return false;
  try {
    const decoded = jwt.verify(token, secret, { audience: AUDIENCE }) as Partial<PreviewPayload>;
    return decoded.purpose === PURPOSE && decoded.siteId === siteId;
  } catch {
    return false;
  }
}
