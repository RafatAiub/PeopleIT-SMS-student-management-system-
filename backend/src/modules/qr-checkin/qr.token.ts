import crypto from 'crypto';

// =============================================================================
// QR check-in tokens — pure, DB-free.
//
// Format:  PQ1.<K>.<id>.<sig>
//   K   = S (student, id = Student.id) | T (staff, id = User.id)
//   sig = base64url(HMAC-SHA256(secret, "PQ1|K|institutionId|id")) truncated
//         to 22 chars (~128 bits).
//
// The institutionId is part of the signed message but NOT of the token, so a
// token printed for one school fails verification at another school's kiosk.
// Tokens don't expire (they are printed on cards); rotating QR_SECRET revokes
// every token at once.
// =============================================================================

export type QrKind = 'S' | 'T';
export const QR_TOKEN_PREFIX = 'PQ1';
export const DUPLICATE_SCAN_WINDOW_MS = 5 * 60 * 1000;
export const DEFAULT_CUTOFF_TIME = '09:00';
export const DEFAULT_TIMEZONE = 'Asia/Dhaka';

const SIG_LEN = 22;

/**
 * QR_SECRET from the environment. When it's unset, a key is derived from
 * JWT_ACCESS_SECRET with a purpose label (same pattern as ENCRYPTION_KEY), so
 * the feature works out of the box without hard-coding any secret.
 */
export function getQrSecret(env: NodeJS.ProcessEnv = process.env): string {
  if (env.QR_SECRET && env.QR_SECRET.length >= 16) return env.QR_SECRET;
  const base = env.JWT_ACCESS_SECRET;
  if (!base) throw new Error('QR_SECRET (or JWT_ACCESS_SECRET) must be configured');
  return crypto.createHmac('sha256', base).update('qr-checkin-v1').digest('hex');
}

function signature(kind: QrKind, id: string, institutionId: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(`${QR_TOKEN_PREFIX}|${kind}|${institutionId}|${id}`)
    .digest('base64url')
    .slice(0, SIG_LEN);
}

export function signQrToken(kind: QrKind, id: string, institutionId: string, secret: string): string {
  if (!id || id.includes('.')) throw new Error('Invalid QR subject id');
  return `${QR_TOKEN_PREFIX}.${kind}.${id}.${signature(kind, id, institutionId, secret)}`;
}

/** Returns the subject when the token is well-formed and signed for this institution, else null. */
export function verifyQrToken(
  token: string,
  institutionId: string,
  secret: string,
): { kind: QrKind; id: string } | null {
  const parts = token.trim().split('.');
  if (parts.length !== 4 || parts[0] !== QR_TOKEN_PREFIX) return null;
  const [, kind, id, sig] = parts;
  if ((kind !== 'S' && kind !== 'T') || !id || !sig) return null;
  const expected = signature(kind, id, institutionId, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return { kind, id };
}

/**
 * Pulls an ID-card verifyToken out of a scanned value — either the full
 * verify URL printed on ID cards (…/verify/<token>) or a bare token.
 */
export function extractIdCardToken(raw: string): string | null {
  const value = raw.trim();
  const m = /\/verify\/([A-Za-z0-9_-]{8,64})\/?(?:[?#].*)?$/.exec(value);
  if (m) return m[1];
  if (/^[a-z0-9]{20,40}$/.test(value)) return value; // cuid
  return null;
}

/** true when the previous scan of the same person is inside the duplicate window. */
export function isDuplicateScan(
  lastScannedAt: Date | null | undefined,
  now: Date,
  windowMs = DUPLICATE_SCAN_WINDOW_MS,
): boolean {
  if (!lastScannedAt) return false;
  const diff = now.getTime() - lastScannedAt.getTime();
  return diff >= 0 && diff < windowMs;
}

export function isValidHHMM(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** PRESENT at or before the cutoff (HH:MM, local), LATE after it. */
export function checkInStatus(localHHMM: string, cutoff = DEFAULT_CUTOFF_TIME): 'PRESENT' | 'LATE' {
  const c = isValidHHMM(cutoff) ? cutoff : DEFAULT_CUTOFF_TIME;
  return localHHMM <= c ? 'PRESENT' : 'LATE';
}

/** Local calendar day (YYYY-MM-DD) and HH:MM for `now` in the given IANA zone. */
export function localDayAndTime(now: Date, timeZone = DEFAULT_TIMEZONE): { day: string; hhmm: string } {
  let tz = timeZone;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
  } catch {
    tz = DEFAULT_TIMEZONE;
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return { day: `${get('year')}-${get('month')}-${get('day')}`, hhmm: `${get('hour')}:${get('minute')}` };
}
