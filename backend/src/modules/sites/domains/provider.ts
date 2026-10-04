// =============================================================================
// Custom-domain provider adapters.
//
// One interface — add(hostname), status(hostname), remove(hostname) — with
// four implementations picked by SITES_DOMAIN_PROVIDER (default "manual"):
//
//   vercel     VERCEL_API_TOKEN, VERCEL_PROJECT_ID, optional VERCEL_TEAM_ID
//   cloudflare CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID (Cloudflare for SaaS
//              custom hostnames; optional CLOUDFLARE_CNAME_TARGET)
//   caddy      no key; Caddy's on-demand TLS asks
//              GET /api/v1/public/sites/caddy-ask?domain= before issuing a cert
//   manual     no key (demo): DNS is checked here, SSL is the operator's job
//
// A provider whose keys are missing falls back to manual, so the flow still
// works end to end and the domain is flagged isDemo.
// =============================================================================

import { logger } from '../../../utils/logger';
import type { DnsRecordInstruction } from './dns';

export type DomainProviderName = 'vercel' | 'cloudflare' | 'caddy' | 'manual';
export const DOMAIN_PROVIDERS: DomainProviderName[] = ['vercel', 'cloudflare', 'caddy', 'manual'];

export interface ProviderAddResult {
  providerRef: string | null;
  /** Extra records the provider needs (e.g. Cloudflare ownership TXT). */
  records: DnsRecordInstruction[];
}

export interface ProviderStatus {
  /** 'dns' = the provider has no opinion; decide from our own DNS check. */
  state: 'dns' | 'pending' | 'active' | 'failed';
  detail?: string;
  records?: DnsRecordInstruction[];
}

export interface DomainProvider {
  name: DomainProviderName;
  /** True when no real provider is doing SSL/routing (manual). */
  demo: boolean;
  /** Where the school's CNAME should point, or null when unknown. */
  cnameTarget(): string | null;
  add(hostname: string): Promise<ProviderAddResult>;
  status(hostname: string, providerRef: string | null): Promise<ProviderStatus>;
  remove(hostname: string, providerRef: string | null): Promise<void>;
}

export const PROVIDER_TIMEOUT_MS = 15_000;

export class DomainProviderError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'DomainProviderError';
  }
}

const env = (k: string) => process.env[k]?.trim() || '';

export function platformSiteDomain(): string {
  return env('PLATFORM_SITE_DOMAIN').toLowerCase().replace(/^\.+|\.+$/g, '');
}

/** Optional A-record IPs for apex domains (comma-separated SITES_APEX_IPS). */
export function apexIps(): string[] {
  return env('SITES_APEX_IPS')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function callJson(url: string, init: RequestInit, timeoutMs = PROVIDER_TIMEOUT_MS): Promise<{ status: number; body: any }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw new DomainProviderError('Domain provider timed out');
    throw new DomainProviderError('Could not reach the domain provider');
  } finally {
    clearTimeout(timer);
  }
}

// ── manual (demo) ───────────────────────────────────────────────────────────

export function manualProvider(): DomainProvider {
  return {
    name: 'manual',
    demo: true,
    cnameTarget: () => env('SITES_CNAME_TARGET') || platformSiteDomain() || null,
    add: async () => ({ providerRef: null, records: [] }),
    status: async () => ({ state: 'dns' }),
    remove: async () => undefined,
  };
}

// ── caddy (on-demand TLS) ───────────────────────────────────────────────────

export function caddyProvider(): DomainProvider {
  return {
    name: 'caddy',
    demo: false,
    cnameTarget: () => env('SITES_CNAME_TARGET') || platformSiteDomain() || null,
    // Caddy pulls: the caddy-ask endpoint answers 200 once the domain is ACTIVE.
    add: async () => ({ providerRef: null, records: [] }),
    status: async () => ({ state: 'dns' }),
    remove: async () => undefined,
  };
}

// ── vercel ──────────────────────────────────────────────────────────────────

export function vercelProvider(cfg: { token: string; projectId: string; teamId?: string }): DomainProvider {
  const base = 'https://api.vercel.com';
  const qs = cfg.teamId ? `?teamId=${encodeURIComponent(cfg.teamId)}` : '';
  const headers = { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' };
  const project = encodeURIComponent(cfg.projectId);

  const verificationRecords = (body: any): DnsRecordInstruction[] =>
    Array.isArray(body?.verification)
      ? body.verification
          .filter((v: any) => v && typeof v.domain === 'string' && typeof v.value === 'string')
          .map((v: any) => ({
            type: String(v.type).toUpperCase() === 'TXT' ? 'TXT' : 'CNAME',
            name: v.domain,
            value: v.value,
            purpose: 'provider' as const,
            note: 'Required by Vercel to prove ownership',
          }))
      : [];

  return {
    name: 'vercel',
    demo: false,
    cnameTarget: () => env('SITES_CNAME_TARGET') || 'cname.vercel-dns.com',
    async add(hostname) {
      const r = await callJson(`${base}/v10/projects/${project}/domains${qs}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: hostname }),
      });
      // 409 = already on this project: treat as added.
      if (r.status >= 400 && r.status !== 409) {
        throw new DomainProviderError(r.body?.error?.message ?? `Vercel rejected the domain (${r.status})`, r.status);
      }
      return { providerRef: hostname, records: verificationRecords(r.body) };
    },
    async status(hostname) {
      const d = encodeURIComponent(hostname);
      const info = await callJson(`${base}/v9/projects/${project}/domains/${d}${qs}`, { method: 'GET', headers });
      if (info.status === 404) return { state: 'failed', detail: 'Domain is not registered on the Vercel project' };
      if (info.status >= 400) throw new DomainProviderError(`Vercel status check failed (${info.status})`, info.status);
      if (!info.body?.verified) {
        // Ask Vercel to re-check ownership now.
        await callJson(`${base}/v9/projects/${project}/domains/${d}/verify${qs}`, { method: 'POST', headers }).catch(() => undefined);
        return { state: 'pending', detail: 'Waiting for Vercel to verify ownership', records: verificationRecords(info.body) };
      }
      const conf = await callJson(`${base}/v6/domains/${d}/config${qs}`, { method: 'GET', headers });
      if (conf.status < 400 && conf.body?.misconfigured) {
        return { state: 'pending', detail: 'Vercel reports the DNS records are not pointing at it yet' };
      }
      return { state: 'active' };
    },
    async remove(hostname) {
      const r = await callJson(`${base}/v9/projects/${project}/domains/${encodeURIComponent(hostname)}${qs}`, {
        method: 'DELETE',
        headers,
      });
      if (r.status >= 400 && r.status !== 404) {
        throw new DomainProviderError(`Vercel could not remove the domain (${r.status})`, r.status);
      }
    },
  };
}

// ── cloudflare (for SaaS custom hostnames) ──────────────────────────────────

export function cloudflareProvider(cfg: { token: string; zoneId: string }): DomainProvider {
  const base = `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(cfg.zoneId)}/custom_hostnames`;
  const headers = { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' };

  const records = (result: any): DnsRecordInstruction[] => {
    const out: DnsRecordInstruction[] = [];
    const ov = result?.ownership_verification;
    if (ov?.name && ov?.value) out.push({ type: 'TXT', name: ov.name, value: ov.value, purpose: 'provider', note: 'Cloudflare ownership check' });
    for (const v of result?.ssl?.validation_records ?? []) {
      if (v?.txt_name && v?.txt_value) out.push({ type: 'TXT', name: v.txt_name, value: v.txt_value, purpose: 'provider', note: 'Cloudflare SSL validation' });
    }
    return out;
  };

  const errMsg = (body: any, fallback: string) => body?.errors?.[0]?.message ?? fallback;

  return {
    name: 'cloudflare',
    demo: false,
    cnameTarget: () => env('CLOUDFLARE_CNAME_TARGET') || env('SITES_CNAME_TARGET') || platformSiteDomain() || null,
    async add(hostname) {
      const r = await callJson(base, {
        method: 'POST',
        headers,
        body: JSON.stringify({ hostname, ssl: { method: 'txt', type: 'dv', settings: { min_tls_version: '1.2' } } }),
      });
      if (r.status >= 400 || r.body?.success === false) {
        throw new DomainProviderError(errMsg(r.body, `Cloudflare rejected the hostname (${r.status})`), r.status);
      }
      return { providerRef: r.body?.result?.id ?? null, records: records(r.body?.result) };
    },
    async status(hostname, providerRef) {
      let result: any;
      if (providerRef) {
        const r = await callJson(`${base}/${encodeURIComponent(providerRef)}`, { method: 'GET', headers });
        if (r.status === 404) return { state: 'failed', detail: 'Custom hostname no longer exists on Cloudflare' };
        if (r.status >= 400) throw new DomainProviderError(errMsg(r.body, `Cloudflare status check failed (${r.status})`), r.status);
        result = r.body?.result;
      } else {
        const r = await callJson(`${base}?hostname=${encodeURIComponent(hostname)}`, { method: 'GET', headers });
        if (r.status >= 400) throw new DomainProviderError(errMsg(r.body, `Cloudflare status check failed (${r.status})`), r.status);
        result = r.body?.result?.[0];
        if (!result) return { state: 'failed', detail: 'Custom hostname not found on Cloudflare' };
      }
      const hostStatus = String(result?.status ?? '');
      const sslStatus = String(result?.ssl?.status ?? '');
      if (hostStatus === 'active' && sslStatus === 'active') return { state: 'active' };
      if (/blocked|moved|deleted/.test(hostStatus) || /failed|expired|deleted/.test(sslStatus)) {
        return { state: 'failed', detail: `Cloudflare status: ${hostStatus || 'unknown'} / SSL ${sslStatus || 'unknown'}` };
      }
      return {
        state: 'pending',
        detail: `Cloudflare status: ${hostStatus || 'pending'} / SSL ${sslStatus || 'pending'}`,
        records: records(result),
      };
    },
    async remove(_hostname, providerRef) {
      if (!providerRef) return;
      const r = await callJson(`${base}/${encodeURIComponent(providerRef)}`, { method: 'DELETE', headers });
      if (r.status >= 400 && r.status !== 404) {
        throw new DomainProviderError(errMsg(r.body, `Cloudflare could not remove the hostname (${r.status})`), r.status);
      }
    },
  };
}

// ── factory ─────────────────────────────────────────────────────────────────

export interface ResolvedProvider {
  provider: DomainProvider;
  /** What SITES_DOMAIN_PROVIDER asked for. */
  requested: DomainProviderName;
  /** Set when the requested provider's keys are missing and manual is used. */
  fallbackReason?: string;
}

let warnedFallback = false;

export function resolveDomainProvider(name?: string): ResolvedProvider {
  const raw = (name || env('SITES_DOMAIN_PROVIDER') || 'manual').toLowerCase();
  const requested = (DOMAIN_PROVIDERS as string[]).includes(raw) ? (raw as DomainProviderName) : 'manual';
  const fallback = (reason: string): ResolvedProvider => {
    if (!warnedFallback) {
      logger.warn(`Sites: ${reason} — custom domains run in manual/demo mode`);
      warnedFallback = true;
    }
    return { provider: manualProvider(), requested, fallbackReason: reason };
  };

  switch (requested) {
    case 'vercel': {
      const token = env('VERCEL_API_TOKEN');
      const projectId = env('VERCEL_PROJECT_ID');
      if (!token || !projectId) return fallback('VERCEL_API_TOKEN / VERCEL_PROJECT_ID not set');
      return { provider: vercelProvider({ token, projectId, teamId: env('VERCEL_TEAM_ID') || undefined }), requested };
    }
    case 'cloudflare': {
      const token = env('CLOUDFLARE_API_TOKEN');
      const zoneId = env('CLOUDFLARE_ZONE_ID');
      if (!token || !zoneId) return fallback('CLOUDFLARE_API_TOKEN / CLOUDFLARE_ZONE_ID not set');
      return { provider: cloudflareProvider({ token, zoneId }), requested };
    }
    case 'caddy':
      return { provider: caddyProvider(), requested };
    default:
      return { provider: manualProvider(), requested: 'manual' };
  }
}

/** The adapter a stored domain was created with (it may differ from today's setting). */
export function providerFor(stored: string): DomainProvider {
  const r = resolveDomainProvider(stored);
  return r.provider;
}
