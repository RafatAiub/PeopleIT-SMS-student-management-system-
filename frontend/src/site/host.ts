/**
 * Host detection for host-based public sites. Pure functions; the env is
 * injected so tests can exercise every case.
 *
 * App hosts (the dashboard): localhost, 127.0.0.1, *.trycloudflare.com,
 * peopleitsms.vercel.app and everything in VITE_APP_HOSTS. Any other
 * hostname renders the public site for that host. A subdomain of
 * VITE_PLATFORM_SITE_DOMAIN resolves by subdomain.
 */

export interface HostEnv {
  /** Comma-separated extra app hosts (VITE_APP_HOSTS). `*.example.com` wildcards allowed. */
  appHosts?: string;
  /** Root domain for free subdomains (VITE_PLATFORM_SITE_DOMAIN), e.g. `peoplenit.app`. */
  platformDomain?: string;
}

const BUILTIN_APP_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]', '*.trycloudflare.com', 'peopleitsms.vercel.app'];

export function readHostEnv(): HostEnv {
  const env = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {}) as Record<string, string | undefined>;
  return { appHosts: env.VITE_APP_HOSTS, platformDomain: env.VITE_PLATFORM_SITE_DOMAIN };
}

export function normaliseHostname(hostname: string): string {
  return (hostname || '').trim().toLowerCase().replace(/\.$/, '').replace(/:\d+$/, '');
}

function matches(host: string, pattern: string): boolean {
  const p = normaliseHostname(pattern);
  if (!p) return false;
  if (p.startsWith('*.')) {
    const root = p.slice(2);
    return host.endsWith(`.${root}`);
  }
  return host === p;
}

function appHostPatterns(env: HostEnv): string[] {
  const extra = (env.appHosts ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return [...BUILTIN_APP_HOSTS, ...extra];
}

/** Private LAN addresses count as app hosts (dev on a phone over Wi-Fi). */
function isPrivateIp(host: string): boolean {
  return /^(10\.\d+|192\.168|172\.(1[6-9]|2\d|3[01]))\.\d+\.\d+$/.test(host) || /^127\.\d+\.\d+\.\d+$/.test(host);
}

export function isAppHost(hostname: string, env: HostEnv = readHostEnv()): boolean {
  const host = normaliseHostname(hostname);
  if (!host) return true;
  if (isPrivateIp(host)) return true;
  if (appHostPatterns(env).some((p) => matches(host, p))) return true;
  // The bare platform domain (and www.) is the marketing/app host, not a school.
  const platform = normaliseHostname(env.platformDomain ?? '');
  if (platform && (host === platform || host === `www.${platform}` || host === `app.${platform}`)) return true;
  return false;
}

/** True when this hostname should render a public school site. */
export function isSiteHost(hostname: string, env: HostEnv = readHostEnv()): boolean {
  return !isAppHost(hostname, env);
}

const SUBDOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * How to resolve this host: `{ slug }` for `<sub>.<platform domain>`,
 * `{ host }` for a custom domain, or null for an app host.
 */
export function resolveTarget(hostname: string, env: HostEnv = readHostEnv()): { slug: string } | { host: string } | null {
  const host = normaliseHostname(hostname);
  if (isAppHost(host, env)) return null;
  const platform = normaliseHostname(env.platformDomain ?? '');
  if (platform && host.endsWith(`.${platform}`)) {
    const sub = host.slice(0, -(platform.length + 1));
    if (SUBDOMAIN_RE.test(sub)) return { slug: sub };
    return { host };
  }
  return { host };
}
