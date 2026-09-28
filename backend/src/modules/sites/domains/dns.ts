// =============================================================================
// DNS verification for custom domains.
//
// A domain is verified when EITHER
//   - its CNAME points at the platform target (PLATFORM_SITE_DOMAIN or the
//     provider's target), OR
//   - its apex A record is one of the configured SITES_APEX_IPS, OR
//   - TXT _peoplenit-verify.<host> carries the domain's verification token.
//
// evaluateDns() is pure (unit-tested); checkDns() does the lookups through an
// injectable resolver (Node dns.promises by default) with a timeout.
// =============================================================================

import { promises as dnsPromises } from 'dns';

export const TXT_PREFIX = '_peoplenit-verify';
export const DNS_TIMEOUT_MS = 5000;

export function txtRecordName(host: string): string {
  return `${TXT_PREFIX}.${host}`;
}

export function txtRecordValue(token: string): string {
  return `peoplenit-verify=${token}`;
}

export interface DnsResolver {
  resolveCname(host: string): Promise<string[]>;
  resolveTxt(host: string): Promise<string[][]>;
  resolve4(host: string): Promise<string[]>;
}

export interface DnsObservation {
  cname: string[];
  txt: string[][];
  a: string[];
}

export interface DnsExpectation {
  cnameTarget: string | null;
  token: string;
  apexIps?: string[];
}

export interface DnsCheckResult {
  ok: boolean;
  method: 'CNAME' | 'A' | 'TXT' | null;
  /** Human-readable explanation for the UI when ok = false. */
  detail: string;
  observed: DnsObservation;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\.+$/, '');

export function evaluateDns(observed: DnsObservation, expected: DnsExpectation): DnsCheckResult {
  const target = expected.cnameTarget ? norm(expected.cnameTarget) : null;
  if (target && observed.cname.some((c) => norm(c) === target)) {
    return { ok: true, method: 'CNAME', detail: `CNAME points to ${target}`, observed };
  }
  const ips = (expected.apexIps ?? []).map((ip) => ip.trim()).filter(Boolean);
  if (ips.length && observed.a.length && observed.a.every((ip) => ips.includes(ip))) {
    return { ok: true, method: 'A', detail: 'A record points to the platform', observed };
  }
  const wanted = [expected.token, txtRecordValue(expected.token)];
  // A TXT record may be split into several character-strings; join them.
  if (observed.txt.some((chunks) => wanted.includes(chunks.join('').trim()))) {
    return { ok: true, method: 'TXT', detail: 'Verification TXT record found', observed };
  }

  const parts: string[] = [];
  if (observed.cname.length) parts.push(`CNAME currently points to ${observed.cname.map(norm).join(', ')}`);
  else if (target) parts.push(`no CNAME record pointing to ${target}`);
  if (observed.a.length && ips.length) parts.push(`A record is ${observed.a.join(', ')}`);
  parts.push(`no matching TXT record at ${TXT_PREFIX}.<your domain>`);
  return {
    ok: false,
    method: null,
    detail: `DNS not ready: ${parts.join('; ')}. DNS changes can take up to 24 hours to spread.`,
    observed,
  };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('DNS lookup timed out')), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** Missing records (ENODATA/ENOTFOUND/…) and timeouts read as "no records". */
async function safe<T>(fn: () => Promise<T[]>, timeoutMs: number): Promise<T[]> {
  try {
    return await withTimeout(fn(), timeoutMs);
  } catch {
    return [];
  }
}

export async function observeDns(host: string, resolver: DnsResolver = dnsPromises, timeoutMs = DNS_TIMEOUT_MS): Promise<DnsObservation> {
  const [cname, txt, a] = await Promise.all([
    safe(() => resolver.resolveCname(host), timeoutMs),
    safe(() => resolver.resolveTxt(txtRecordName(host)), timeoutMs),
    safe(() => resolver.resolve4(host), timeoutMs),
  ]);
  return { cname, txt, a };
}

export async function checkDns(
  host: string,
  expected: DnsExpectation,
  resolver: DnsResolver = dnsPromises,
  timeoutMs = DNS_TIMEOUT_MS,
): Promise<DnsCheckResult> {
  return evaluateDns(await observeDns(host, resolver, timeoutMs), expected);
}

export interface DnsRecordInstruction {
  type: 'CNAME' | 'A' | 'TXT';
  name: string;
  value: string;
  purpose: 'routing' | 'verification' | 'provider';
  note?: string;
}

/** The records the school must add at its DNS host. */
export function dnsInstructions(
  host: string,
  opts: { cnameTarget: string | null; token: string; apexIps?: string[]; apex: boolean },
): DnsRecordInstruction[] {
  const records: DnsRecordInstruction[] = [];
  if (opts.apex && opts.apexIps?.length) {
    for (const ip of opts.apexIps) {
      records.push({ type: 'A', name: host, value: ip, purpose: 'routing', note: 'Root domains cannot use CNAME; use this A record.' });
    }
  } else if (opts.cnameTarget) {
    records.push({
      type: 'CNAME',
      name: host,
      value: opts.cnameTarget,
      purpose: 'routing',
      ...(opts.apex ? { note: 'Root domain: use CNAME flattening/ALIAS if your DNS host supports it, or use www.' } : {}),
    });
  }
  records.push({ type: 'TXT', name: txtRecordName(host), value: txtRecordValue(opts.token), purpose: 'verification' });
  return records;
}
