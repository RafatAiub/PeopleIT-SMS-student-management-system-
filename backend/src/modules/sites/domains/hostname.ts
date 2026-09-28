// =============================================================================
// Hostname validation for custom domains (pure; unit-tested).
// =============================================================================

const LABEL_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
const TLD_RE = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;
const IPV4_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/**
 * Lowercases and strips what people paste: scheme, path, query, port and a
 * trailing dot. "HTTPS://www.School.edu.bd:443/about" → "www.school.edu.bd".
 */
export function normalizeHostname(input: string): string {
  let h = (input ?? '').trim().toLowerCase();
  h = h.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  h = h.split(/[/?#]/)[0] ?? '';
  // user:pass@host
  if (h.includes('@')) h = h.slice(h.lastIndexOf('@') + 1);
  // host:port (IPv6 literals are rejected later anyway)
  h = h.replace(/:\d*$/, '');
  h = h.replace(/\.+$/, '');
  return h;
}

export type HostnameProblem = 'EMPTY' | 'TOO_LONG' | 'IP_ADDRESS' | 'NO_DOT' | 'BAD_LABEL' | 'BAD_TLD' | 'WILDCARD';

/** Returns null when `host` (already normalised) is a valid public DNS hostname. */
export function hostnameProblem(host: string): HostnameProblem | null {
  if (!host) return 'EMPTY';
  if (host.length > 253) return 'TOO_LONG';
  if (host.includes('*')) return 'WILDCARD';
  if (IPV4_RE.test(host) || host.includes(':') || host.startsWith('[')) return 'IP_ADDRESS';
  const labels = host.split('.');
  if (labels.length < 2) return 'NO_DOT';
  if (!labels.every((l) => LABEL_RE.test(l))) return 'BAD_LABEL';
  if (!TLD_RE.test(labels[labels.length - 1])) return 'BAD_TLD';
  return null;
}

export const HOSTNAME_PROBLEM_MESSAGE: Record<HostnameProblem, string> = {
  EMPTY: 'Enter a domain name, for example www.myschool.edu.bd',
  TOO_LONG: 'That domain name is too long',
  IP_ADDRESS: 'Use a domain name, not an IP address',
  NO_DOT: 'Enter a full domain name, for example www.myschool.edu.bd',
  BAD_LABEL: 'A domain may only contain letters, digits and hyphens between the dots',
  BAD_TLD: 'That domain does not end in a valid top-level domain',
  WILDCARD: 'Wildcard domains are not supported',
};

/**
 * True when `host` is (or is under) one of the platform's own hostnames —
 * those must never be claimed as a school's custom domain. `platformRoots`
 * are matched with their subdomains (e.g. "peoplenit.app" also blocks
 * "x.peoplenit.app"); `exactHosts` only match exactly.
 */
export function isPlatformHostname(host: string, platformRoots: string[], exactHosts: string[] = []): boolean {
  const h = host.toLowerCase();
  if (exactHosts.some((e) => e && e.toLowerCase() === h)) return true;
  return platformRoots.some((root) => {
    const r = root.toLowerCase().replace(/^\.+|\.+$/g, '');
    return Boolean(r) && (h === r || h.endsWith(`.${r}`));
  });
}

/** Hostname of a URL, or null (used to derive app hosts from APP_URL / FRONTEND_URL). */
export function hostOf(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** "www.x.com" ↔ "x.com" — resolve tries the alternate when the exact host is unknown. */
export function wwwAlternate(host: string): string {
  return host.startsWith('www.') ? host.slice(4) : `www.${host}`;
}

/** True for a bare registrable-looking domain ("school.edu.bd" has 3 labels but is still apex-ish). Heuristic: no "www." and ≤ 2 labels, or a known 2-part public suffix with 3 labels. */
export function looksLikeApex(host: string): boolean {
  const labels = host.split('.');
  if (labels[0] === 'www') return false;
  if (labels.length === 2) return true;
  const twoPartSuffix = /\.(?:com|edu|gov|org|net|ac|co|info)\.[a-z]{2}$/;
  return labels.length === 3 && twoPartSuffix.test(host);
}
