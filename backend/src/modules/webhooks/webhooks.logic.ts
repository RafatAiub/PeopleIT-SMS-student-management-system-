import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { isIP } from 'net';

// =============================================================================
// Webhooks — pure logic (no prisma, no env, no network). Unit-tested in
// tests/saas-partb-logic.test.ts.
// =============================================================================

export const WEBHOOK_EVENTS = ['student.created', 'payment.received', 'attendance.submitted', 'invoice.overdue'] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];
export const WEBHOOK_TEST_EVENT = 'webhook.test';

export const WEBHOOK_EVENT_LABELS: Record<WebhookEvent, string> = {
  'student.created': 'A student is admitted / created',
  'payment.received': 'A fee payment is recorded',
  'attendance.submitted': 'A class attendance register is submitted',
  'invoice.overdue': 'An invoice becomes overdue',
};

export const MAX_DELIVERY_ATTEMPTS = 5;
export const SIGNATURE_HEADER = 'X-PeopleNIT-Signature';

export function generateWebhookSecret(random: (size: number) => Buffer = randomBytes): string {
  return `whsec_${random(24).toString('base64url')}`;
}

/** Masks a secret for list views: "whsec_ab…yz". */
export function maskSecret(secret: string): string {
  if (secret.length <= 12) return '••••';
  return `${secret.slice(0, 8)}…${secret.slice(-4)}`;
}

// ── Signing ───────────────────────────────────────────────────────────────

/**
 * HMAC-SHA256 over `${timestamp}.${rawBody}` (Stripe-style), so a captured
 * payload cannot be replayed with a fresh timestamp. Header value:
 *   X-PeopleNIT-Signature: t=<unix seconds>,v1=<hex digest>
 */
export function signPayload(secret: string, rawBody: string, timestampSec: number): string {
  const digest = createHmac('sha256', secret).update(`${timestampSec}.${rawBody}`, 'utf8').digest('hex');
  return `t=${timestampSec},v1=${digest}`;
}

/**
 * Receiver-side verification (also documented for integrators). Rejects
 * signatures older than `toleranceSec`.
 */
export function verifySignature(
  secret: string,
  rawBody: string,
  header: string,
  nowSec: number,
  toleranceSec = 300,
): boolean {
  const parts = Object.fromEntries(
    header.split(',').map((kv) => {
      const i = kv.indexOf('=');
      return i === -1 ? [kv.trim(), ''] : [kv.slice(0, i).trim(), kv.slice(i + 1).trim()];
    }),
  );
  const ts = Number(parts.t);
  if (!Number.isFinite(ts) || !parts.v1) return false;
  if (Math.abs(nowSec - ts) > toleranceSec) return false;
  const expected = signPayload(secret, rawBody, ts).split('v1=')[1];
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(parts.v1, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

// ── Retry policy ──────────────────────────────────────────────────────────

/**
 * Delay before attempt `nextAttempt` (2..MAX). Exponential ×5 from 10 s:
 * 10 s, 50 s, ~4 min, ~21 min — capped at 30 min. `jitter` in [0,1) spreads
 * retries ±10% so a burst of failures does not retry in lockstep.
 */
export function computeBackoffMs(nextAttempt: number, jitter = 0.5): number {
  if (nextAttempt <= 1) return 0;
  const base = 10_000 * Math.pow(5, nextAttempt - 2);
  const capped = Math.min(base, 30 * 60_000);
  const spread = capped * 0.1 * (jitter * 2 - 1);
  return Math.round(capped + spread);
}

/**
 * Whether a failed attempt should be retried. Network errors (no status),
 * 408, 425, 429 and 5xx are transient. Other 4xx mean the receiver rejected
 * the request and a retry would fail identically — except 410 Gone, which is
 * also final. Never retries past MAX_DELIVERY_ATTEMPTS.
 */
export function shouldRetry(statusCode: number | null, attempt: number, maxAttempts = MAX_DELIVERY_ATTEMPTS): boolean {
  if (attempt >= maxAttempts) return false;
  if (statusCode === null) return true;
  if (statusCode >= 200 && statusCode < 300) return false;
  if (statusCode === 408 || statusCode === 425 || statusCode === 429) return true;
  return statusCode >= 500;
}

// ── SSRF protection ───────────────────────────────────────────────────────

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function inCidr4(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.split('/');
  const bits = Number(bitsStr);
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(range) & mask);
}

const BLOCKED_V4 = [
  '0.0.0.0/8', // "this" network
  '10.0.0.0/8', // private
  '100.64.0.0/10', // carrier-grade NAT
  '127.0.0.0/8', // loopback
  '169.254.0.0/16', // link-local incl. cloud metadata 169.254.169.254
  '172.16.0.0/12', // private
  '192.0.0.0/24', // IETF protocol assignments
  '192.0.2.0/24', // TEST-NET-1
  '192.88.99.0/24', // 6to4 relay
  '192.168.0.0/16', // private
  '198.18.0.0/15', // benchmarking
  '198.51.100.0/24', // TEST-NET-2
  '203.0.113.0/24', // TEST-NET-3
  '224.0.0.0/4', // multicast
  '240.0.0.0/4', // reserved + broadcast
];

/** True when `ip` (v4 or v6 literal) is not a public unicast address. */
export function isPrivateIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return BLOCKED_V4.some((cidr) => inCidr4(ip, cidr));
  if (family === 6) {
    const lower = ip.toLowerCase().replace(/^\[|\]$/g, '');
    // IPv4-mapped / -compatible (::ffff:10.0.0.1, ::10.0.0.1) → check the v4 part.
    const mapped = lower.match(/^(?:0*:)*(?:ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/);
    if (mapped) return isPrivateIp(mapped[1]);
    const mappedHex = lower.match(/^(?:0*:)*ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (mappedHex) {
      const hi = parseInt(mappedHex[1], 16);
      const lo = parseInt(mappedHex[2], 16);
      return isPrivateIp(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    if (lower === '::' || lower === '::1') return true; // unspecified, loopback
    const first = parseInt(lower.split(':')[0] || '0', 16);
    if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
    if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
    if ((first & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local (deprecated)
    if ((first & 0xff00) === 0xff00) return true; // ff00::/8 multicast
    if (lower.startsWith('64:ff9b:')) return true; // NAT64 — can reach v4 private space
    if (lower.startsWith('2001:db8:') || lower === '2001:db8::') return true; // documentation
    if (lower.startsWith('2002:')) return true; // 6to4 — embeds an arbitrary v4
    return false;
  }
  return true; // not an IP literal → caller must resolve first
}

const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home', '.intranet', '.corp'];

export type UrlCheck = { ok: true; hostname: string; port: number } | { ok: false; reason: string };

/**
 * Static URL policy for a webhook target (before any DNS lookup):
 *   - https only, no credentials in the URL, port 443 or ≥1024 (not 0-1023 other than 443)
 *   - hostname must not be localhost / an internal suffix / a single label
 *   - an IP-literal host must be public
 * The dispatcher re-checks every resolved address at connect time, which
 * also defeats DNS rebinding.
 */
export function checkWebhookUrl(raw: string): UrlCheck {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'URL is not valid' };
  }
  if (url.protocol !== 'https:') return { ok: false, reason: 'Webhook URLs must use https://' };
  if (url.username || url.password) return { ok: false, reason: 'Credentials in the URL are not allowed' };
  const port = url.port ? Number(url.port) : 443;
  if (port !== 443 && port < 1024) return { ok: false, reason: 'Port must be 443 or 1024 and above' };
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!hostname) return { ok: false, reason: 'URL has no host' };
  if (isIP(hostname)) {
    return isPrivateIp(hostname) ? { ok: false, reason: 'Private, loopback and link-local addresses are not allowed' } : { ok: true, hostname, port };
  }
  if (hostname === 'localhost' || BLOCKED_HOST_SUFFIXES.some((s) => hostname.endsWith(s))) {
    return { ok: false, reason: 'Internal host names are not allowed' };
  }
  if (!hostname.includes('.')) return { ok: false, reason: 'Use a fully-qualified public host name' };
  return { ok: true, hostname, port };
}

/** Delivery envelope — what the receiver gets as the JSON body. */
export function buildEnvelope(params: { id: string; event: string; institutionId: string; data: unknown; createdAt: Date }) {
  return {
    id: params.id,
    event: params.event,
    createdAt: params.createdAt.toISOString(),
    institutionId: params.institutionId,
    data: params.data,
  };
}
