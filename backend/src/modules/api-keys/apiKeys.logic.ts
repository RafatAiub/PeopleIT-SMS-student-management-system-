import { createHash, randomBytes, timingSafeEqual } from 'crypto';

// =============================================================================
// API keys — pure logic (no prisma, no env). Unit-tested in
// tests/saas-partb-logic.test.ts.
//
// Key format:  psk_<8 hex prefix id>_<43 char base64url secret>
//   - `keyPrefix` (the first 12 chars, "psk_xxxxxxxx") is stored in clear so
//     admins can tell keys apart in the list.
//   - Only the SHA-256 of the full key is stored (`keyHash`, unique). API
//     keys are 256-bit random values, so a fast hash is appropriate: there is
//     nothing to brute-force, unlike a human password.
// =============================================================================

export const API_KEY_PREFIX = 'psk_';

/** Read-only scopes a key may be granted. The public API is read-only. */
export const API_KEY_SCOPES = ['students:read', 'attendance:read', 'fees:read'] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export const API_KEY_SCOPE_LABELS: Record<ApiKeyScope, string> = {
  'students:read': 'Read students (names, class, section, status)',
  'attendance:read': 'Read attendance summaries',
  'fees:read': 'Read invoices',
};

export interface GeneratedApiKey {
  /** Full secret — shown to the admin exactly once, never stored. */
  key: string;
  /** Display prefix, stored in clear. */
  keyPrefix: string;
  /** SHA-256 hex of the full key, stored. */
  keyHash: string;
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex');
}

export function generateApiKey(random: (size: number) => Buffer = randomBytes): GeneratedApiKey {
  const id = random(4).toString('hex');
  const secret = random(32).toString('base64url');
  const key = `${API_KEY_PREFIX}${id}_${secret}`;
  return { key, keyPrefix: key.slice(0, API_KEY_PREFIX.length + 8), keyHash: hashApiKey(key) };
}

/** Cheap syntactic check before touching the database. */
export function looksLikeApiKey(value: string | undefined | null): value is string {
  return typeof value === 'string' && /^psk_[0-9a-f]{8}_[A-Za-z0-9_-]{40,64}$/.test(value);
}

/** Constant-time hash comparison (defence in depth; lookup is by unique hash). */
export function hashesEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/**
 * Extracts the presented key from the request headers. Accepts
 * `X-API-Key: <key>` or `Authorization: Bearer <key>` (only when the bearer
 * value is shaped like an API key, so a user JWT is never mistaken for one).
 */
export function extractApiKey(headers: Record<string, string | string[] | undefined>): string | null {
  const direct = headers['x-api-key'];
  const directValue = Array.isArray(direct) ? direct[0] : direct;
  if (directValue && directValue.trim()) return directValue.trim();
  const auth = headers['authorization'];
  const authValue = Array.isArray(auth) ? auth[0] : auth;
  if (authValue && authValue.startsWith('Bearer ')) {
    const token = authValue.slice(7).trim();
    if (token.startsWith(API_KEY_PREFIX)) return token;
  }
  return null;
}

/**
 * Scope matching. A granted scope satisfies a required scope when it is an
 * exact match or a `<resource>:*` wildcard for the same resource. Unknown /
 * malformed scopes never match. There is deliberately no global `*` — the
 * public API is read-only and every grant should be explicit.
 */
export function hasScope(granted: readonly string[], required: string): boolean {
  const [reqResource, reqAction] = required.split(':');
  if (!reqResource || !reqAction) return false;
  return granted.some((scope) => {
    if (scope === required) return true;
    const [resource, action] = scope.split(':');
    return resource === reqResource && action === '*';
  });
}

/** De-duplicates and keeps only known scopes, in canonical order. */
export function normalizeScopes(scopes: readonly string[]): ApiKeyScope[] {
  const set = new Set(scopes);
  return API_KEY_SCOPES.filter((s) => set.has(s));
}

/** Throttle for `lastUsedAt` writes: at most one DB write per key per minute. */
export function shouldTouchLastUsed(lastUsedAt: Date | null, now: Date, minIntervalMs = 60_000): boolean {
  return !lastUsedAt || now.getTime() - lastUsedAt.getTime() >= minIntervalMs;
}
