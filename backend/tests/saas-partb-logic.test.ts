// Pure-logic tests for SaaS layer part B: API keys, webhooks (signing, SSRF
// host policy, retry backoff), data-export CSV escaping, usage cost maths and
// support-ticket access rules. None of the modules under test import prisma
// or env, so nothing here can touch a database.

import { createHmac } from 'crypto';
import {
  extractApiKey,
  generateApiKey,
  hashApiKey,
  hasScope,
  looksLikeApiKey,
  normalizeScopes,
  shouldTouchLastUsed,
} from '../src/modules/api-keys/apiKeys.logic';
import {
  checkWebhookUrl,
  computeBackoffMs,
  generateWebhookSecret,
  isPrivateIp,
  maskSecret,
  MAX_DELIVERY_ATTEMPTS,
  shouldRetry,
  signPayload,
  verifySignature,
} from '../src/modules/webhooks/webhooks.logic';
import { csvCell, csvRow, exportFileName, expiryFrom, fileNameFromUrl, isExpired } from '../src/modules/data-export/dataExport.logic';
import { estimateCost, monthRange, parsePrice, totalCost, unitPricesFrom } from '../src/modules/usage/usage.logic';
import { canViewTenantTicket, statusAfterReply, tenantUpdateError } from '../src/modules/support/support.logic';

describe('API keys', () => {
  it('generates a key whose hash and prefix match, and never stores the secret', () => {
    const k = generateApiKey();
    expect(looksLikeApiKey(k.key)).toBe(true);
    expect(k.keyPrefix).toBe(k.key.slice(0, 12));
    expect(k.keyHash).toBe(hashApiKey(k.key));
    expect(k.keyHash).not.toContain(k.key);
    expect(k.keyHash).toHaveLength(64);
  });

  it('is deterministic for a fixed random source', () => {
    const fixed = (n: number) => Buffer.alloc(n, 7);
    expect(generateApiKey(fixed).key).toBe(generateApiKey(fixed).key);
  });

  it('rejects malformed keys cheaply', () => {
    expect(looksLikeApiKey('psk_short')).toBe(false);
    expect(looksLikeApiKey('Bearer abc')).toBe(false);
    expect(looksLikeApiKey(undefined)).toBe(false);
  });

  it('extracts from X-API-Key or a psk_ bearer, never from a JWT bearer', () => {
    expect(extractApiKey({ 'x-api-key': ' psk_x ' })).toBe('psk_x');
    expect(extractApiKey({ authorization: 'Bearer psk_abc' })).toBe('psk_abc');
    expect(extractApiKey({ authorization: 'Bearer eyJhbGciOi...' })).toBeNull();
    expect(extractApiKey({})).toBeNull();
  });

  it('matches scopes exactly or by resource wildcard only', () => {
    expect(hasScope(['students:read'], 'students:read')).toBe(true);
    expect(hasScope(['students:*'], 'students:read')).toBe(true);
    expect(hasScope(['students:read'], 'fees:read')).toBe(false);
    expect(hasScope(['*'], 'fees:read')).toBe(false);
    expect(hasScope(['*:*'], 'fees:read')).toBe(false);
    expect(hasScope(['students:read'], 'students')).toBe(false);
    expect(hasScope([], 'students:read')).toBe(false);
  });

  it('normalizes scopes to the known, de-duplicated, canonical list', () => {
    expect(normalizeScopes(['fees:read', 'students:read', 'fees:read', 'admin:write'])).toEqual(['students:read', 'fees:read']);
  });

  it('throttles lastUsedAt writes', () => {
    const now = new Date('2026-01-01T00:01:00Z');
    expect(shouldTouchLastUsed(null, now)).toBe(true);
    expect(shouldTouchLastUsed(new Date('2026-01-01T00:00:30Z'), now)).toBe(false);
    expect(shouldTouchLastUsed(new Date('2026-01-01T00:00:00Z'), now)).toBe(true);
  });
});

describe('webhook signing', () => {
  const secret = 'whsec_test';
  const body = JSON.stringify({ event: 'student.created', data: { id: 'x' } });

  it('produces t=…,v1=<hex sha256> and verifies', () => {
    const sig = signPayload(secret, body, 1_700_000_000);
    expect(sig).toMatch(/^t=1700000000,v1=[0-9a-f]{64}$/);
    expect(verifySignature(secret, body, sig, 1_700_000_100)).toBe(true);
  });

  it('matches a known HMAC-SHA256 vector', () => {
    // echo -n "1.{}" | openssl dgst -sha256 -hmac key
    expect(signPayload('key', '{}', 1)).toBe(`t=1,v1=${createHmac('sha256', 'key').update('1.{}').digest('hex')}`);
  });

  it('rejects a tampered body, wrong secret, or stale timestamp', () => {
    const sig = signPayload(secret, body, 1_700_000_000);
    expect(verifySignature(secret, body + ' ', sig, 1_700_000_000)).toBe(false);
    expect(verifySignature('other', body, sig, 1_700_000_000)).toBe(false);
    expect(verifySignature(secret, body, sig, 1_700_000_000 + 301)).toBe(false);
    expect(verifySignature(secret, body, 'garbage', 1_700_000_000)).toBe(false);
  });

  it('generates and masks secrets', () => {
    const s = generateWebhookSecret();
    expect(s.startsWith('whsec_')).toBe(true);
    expect(maskSecret(s)).not.toContain(s.slice(8, -4));
  });
});

describe('webhook retry policy', () => {
  it('backs off exponentially and caps at 30 minutes', () => {
    expect(computeBackoffMs(1)).toBe(0);
    expect(computeBackoffMs(2, 0.5)).toBe(10_000);
    expect(computeBackoffMs(3, 0.5)).toBe(50_000);
    expect(computeBackoffMs(4, 0.5)).toBe(250_000);
    expect(computeBackoffMs(5, 0.5)).toBe(1_250_000);
    expect(computeBackoffMs(9, 0.5)).toBe(1_800_000);
  });

  it('keeps jitter within ±10%', () => {
    expect(computeBackoffMs(2, 0)).toBe(9_000);
    expect(computeBackoffMs(2, 0.999999)).toBeLessThanOrEqual(11_000);
  });

  it('retries only transient failures, never past the max', () => {
    expect(shouldRetry(null, 1)).toBe(true);
    expect(shouldRetry(500, 1)).toBe(true);
    expect(shouldRetry(429, 2)).toBe(true);
    expect(shouldRetry(408, 2)).toBe(true);
    expect(shouldRetry(200, 1)).toBe(false);
    expect(shouldRetry(400, 1)).toBe(false);
    expect(shouldRetry(410, 1)).toBe(false);
    expect(shouldRetry(503, MAX_DELIVERY_ATTEMPTS)).toBe(false);
  });
});

describe('webhook SSRF policy', () => {
  it.each(['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fc00::1', 'fd12::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:a00:1', '64:ff9b::a00:1'])(
    'blocks %s',
    (ip) => expect(isPrivateIp(ip)).toBe(true),
  );

  it.each(['8.8.8.8', '1.1.1.1', '172.32.0.1', '203.0.114.1', '2606:4700:4700::1111'])('allows public %s', (ip) =>
    expect(isPrivateIp(ip)).toBe(false),
  );

  it('accepts a public https URL', () => {
    expect(checkWebhookUrl('https://hooks.example.com/peoplenit')).toEqual({ ok: true, hostname: 'hooks.example.com', port: 443 });
    expect(checkWebhookUrl('https://hooks.example.com:8443/x').ok).toBe(true);
  });

  it.each([
    'http://hooks.example.com/x',
    'https://localhost/x',
    'https://api.localhost/x',
    'https://printer.local/x',
    'https://metadata.google.internal/x',
    'https://127.0.0.1/x',
    'https://[::1]/x',
    'https://[::ffff:10.0.0.1]/x',
    'https://169.254.169.254/latest/meta-data',
    'https://intranet/x',
    'https://user:pass@hooks.example.com/x',
    'https://hooks.example.com:22/x',
    'ftp://hooks.example.com/x',
    'not a url',
  ])('rejects %s', (url) => expect(checkWebhookUrl(url).ok).toBe(false));
});

describe('CSV escaping', () => {
  it('handles empties, numbers, booleans, dates and decimals', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(42)).toBe('42');
    expect(csvCell(-3.5)).toBe('-3.5');
    expect(csvCell(true)).toBe('true');
    expect(csvCell(new Date('2026-01-02T03:04:05.000Z'))).toBe('2026-01-02T03:04:05.000Z');
    expect(csvCell({ toFixed: () => '', toString: () => '1200.50' })).toBe('1200.50');
  });

  it('quotes commas, quotes and newlines (RFC 4180)', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
  });

  it('neutralises spreadsheet formulas but keeps negative numbers', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+123abc')).toBe("'+123abc");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('-12.5')).toBe('-12.5');
    expect(csvCell('-cmd')).toBe("'-cmd");
  });

  it('keeps Bangla text untouched', () => {
    expect(csvCell('রহিম উদ্দিন')).toBe('রহিম উদ্দিন');
  });

  it('builds CRLF rows and serialises objects as JSON', () => {
    expect(csvRow(['a', 1, null])).toBe('a,1,\r\n');
    expect(csvCell({ a: 1 })).toBe('"{""a"":1}"');
  });
});

describe('data export files', () => {
  it('expires after 7 days', () => {
    const done = new Date('2026-01-01T00:00:00Z');
    const exp = expiryFrom(done);
    expect(exp.toISOString()).toBe('2026-01-08T00:00:00.000Z');
    expect(isExpired(exp, new Date('2026-01-07T23:59:59Z'))).toBe(false);
    expect(isExpired(exp, new Date('2026-01-08T00:00:00Z'))).toBe(true);
    expect(isExpired(null, new Date())).toBe(false);
  });

  it('only resolves safe local file names (no path traversal)', () => {
    expect(exportFileName('clx123abc')).toBe('export-clx123abc.zip');
    expect(() => exportFileName('../etc/passwd')).toThrow();
    expect(fileNameFromUrl('local:export-clx123abc.zip')).toBe('export-clx123abc.zip');
    expect(fileNameFromUrl('local:../../secret.zip')).toBeNull();
    expect(fileNameFromUrl('https://evil/export-a.zip')).toBeNull();
    expect(fileNameFromUrl(null)).toBeNull();
  });
});

describe('usage cost estimates', () => {
  it('parses prices; empty or invalid means not configured', () => {
    expect(parsePrice(undefined)).toBeNull();
    expect(parsePrice('')).toBeNull();
    expect(parsePrice('abc')).toBeNull();
    expect(parsePrice('-1')).toBeNull();
    expect(parsePrice('0.35')).toBe(0.35);
    expect(unitPricesFrom({ COST_PER_SMS_BDT: '0.3', COST_PER_AI_CALL_BDT: '2' })).toEqual({ SMS: 0.3, EMAIL: null, AI_CALL: 2, STORAGE_MB: null });
  });

  it('estimates to 2 dp and totals only priced lines', () => {
    expect(estimateCost(1234, 0.35)).toBe(431.9);
    expect(estimateCost(10, null)).toBeNull();
    expect(totalCost([431.9, null, 20])).toBe(451.9);
    expect(totalCost([null, null])).toBeNull();
  });

  it('computes month ranges in UTC', () => {
    const r = monthRange('2026-12');
    expect(r.start.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(r.end.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    expect(monthRange(undefined, new Date('2026-03-15T10:00:00Z')).month).toBe('2026-03');
    expect(() => monthRange('2026-13')).toThrow();
  });
});

describe('support ticket rules', () => {
  const admin = { userId: 'a', role: 'ADMIN' };
  const teacher = { userId: 't', role: 'TEACHER' };
  const other = { userId: 'o', role: 'GUARDIAN' };
  const ticket = { createdByUserId: 't', status: 'OPEN' as const };

  it('admins see all tickets; others only their own', () => {
    expect(canViewTenantTicket(admin, ticket)).toBe(true);
    expect(canViewTenantTicket(teacher, ticket)).toBe(true);
    expect(canViewTenantTicket(other, ticket)).toBe(false);
  });

  it('creators may only close/reopen; admins may change anything', () => {
    expect(tenantUpdateError(admin, ticket, { status: 'RESOLVED', priority: 'HIGH' })).toBeNull();
    expect(tenantUpdateError(teacher, ticket, { status: 'CLOSED' })).toBeNull();
    expect(tenantUpdateError(teacher, ticket, { status: 'RESOLVED' })).not.toBeNull();
    expect(tenantUpdateError(teacher, ticket, { priority: 'URGENT' })).not.toBeNull();
    expect(tenantUpdateError(other, ticket, { status: 'CLOSED' })).not.toBeNull();
  });

  it('reopens on requester reply and moves to in-progress on support reply', () => {
    expect(statusAfterReply('RESOLVED', 'requester')).toBe('OPEN');
    expect(statusAfterReply('CLOSED', 'requester')).toBe('OPEN');
    expect(statusAfterReply('OPEN', 'support')).toBe('IN_PROGRESS');
    expect(statusAfterReply('IN_PROGRESS', 'requester')).toBe('IN_PROGRESS');
  });
});
