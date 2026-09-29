// =============================================================================
// Sessions — pure helpers (no DB). Unit-tested in tests/saas-logic.test.ts.
// A "session" is one live RefreshToken row: not revoked, not expired.
// =============================================================================

export interface SessionContext {
  userAgent: string | null;
  ipAddress: string | null;
}

export interface DeviceInfo {
  browser: string;
  os: string;
  deviceType: 'desktop' | 'mobile' | 'tablet' | 'unknown';
  label: string;
}

const MAX_UA_LENGTH = 512;

export function sanitizeUserAgent(ua: unknown): string | null {
  if (typeof ua !== 'string') return null;
  const trimmed = ua.trim();
  return trimmed ? trimmed.slice(0, MAX_UA_LENGTH) : null;
}

/** First X-Forwarded-For hop (the app runs behind a proxy), else the socket address. */
export function clientIpFrom(forwarded: string | string[] | undefined, remoteAddress: string | undefined): string | null {
  const header = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const first = header?.split(',')[0]?.trim();
  const ip = first || remoteAddress || '';
  const cleaned = ip.replace(/^::ffff:/, '').slice(0, 64);
  return cleaned || null;
}

function detectBrowser(ua: string): string {
  // Order matters: Edge/Opera/Samsung UAs also contain "Chrome" and "Safari".
  if (/Edg(e|A|iOS)?\//.test(ua)) return 'Edge';
  if (/OPR\/|Opera/.test(ua)) return 'Opera';
  if (/SamsungBrowser\//.test(ua)) return 'Samsung Internet';
  if (/UCBrowser\//.test(ua)) return 'UC Browser';
  if (/Firefox\/|FxiOS\//.test(ua)) return 'Firefox';
  if (/CriOS\//.test(ua)) return 'Chrome';
  if (/Chrome\//.test(ua) && !/Chromium\//.test(ua)) return 'Chrome';
  if (/Chromium\//.test(ua)) return 'Chromium';
  if (/Safari\//.test(ua) && /Version\//.test(ua)) return 'Safari';
  if (/PostmanRuntime|curl\/|okhttp|axios\//i.test(ua)) return 'API client';
  return 'Unknown browser';
}

function detectOs(ua: string): string {
  if (/Windows NT/.test(ua)) return 'Windows';
  if (/iPhone|iPod/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/CrOS/.test(ua)) return 'ChromeOS';
  if (/Mac OS X|Macintosh/.test(ua)) return 'macOS';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Unknown OS';
}

function detectDeviceType(ua: string, os: string): DeviceInfo['deviceType'] {
  if (os === 'iPad' || /Tablet/i.test(ua) || (os === 'Android' && !/Mobile/.test(ua))) return 'tablet';
  if (os === 'iPhone' || /Mobile|Android/.test(ua)) return 'mobile';
  if (os === 'Unknown OS') return 'unknown';
  return 'desktop';
}

/** Friendly "Chrome on Windows" style description of a user agent. */
export function parseUserAgent(ua: string | null | undefined): DeviceInfo {
  if (!ua) return { browser: 'Unknown browser', os: 'Unknown OS', deviceType: 'unknown', label: 'Unknown device' };
  const browser = detectBrowser(ua);
  const os = detectOs(ua);
  const deviceType = detectDeviceType(ua, os);
  let label: string;
  if (browser === 'Unknown browser' && os === 'Unknown OS') label = 'Unknown device';
  else if (browser === 'Unknown browser') label = os;
  else if (os === 'Unknown OS') label = browser;
  else label = `${browser} on ${os}`;
  return { browser, os, deviceType, label };
}

