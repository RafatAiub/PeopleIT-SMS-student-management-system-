// =============================================================================
// Sites — environment-derived settings and URL builders.
// =============================================================================

import { Prisma } from '@prisma/client';
import { env } from '../../config/env';
import { AppError } from '../../utils/AppError';
import { isMissingSchemaError } from '../../utils/schemaMissing';
import { hostOf } from './domains/hostname';
import { platformSiteDomain } from './domains/provider';

export { platformSiteDomain };

export const SITES_MIGRATION = '20260928000000_sites_builder';

/** Frontend origin that serves the path-based preview (/s/:subdomain). */
export function frontendBase(): string {
  return env.FRONTEND_URL.replace(/\/+$/, '');
}

export function pathPreviewUrl(subdomain: string): string {
  return `${frontendBase()}/s/${encodeURIComponent(subdomain)}`;
}

export function subdomainUrl(subdomain: string): string | null {
  const root = platformSiteDomain();
  return root ? `https://${subdomain}.${root}` : null;
}

/** Public URL of a site: primary active custom domain → platform subdomain → path preview. */
export function liveBaseUrl(subdomain: string, primaryActiveHost: string | null): string {
  if (primaryActiveHost) return `https://${primaryActiveHost}`;
  return subdomainUrl(subdomain) ?? pathPreviewUrl(subdomain);
}

/**
 * Hostnames a school may never claim: the platform root (and its
 * subdomains), the app's own hosts, and SITES_RESERVED_HOSTS.
 */
export function reservedHostRoots(): string[] {
  const roots = [platformSiteDomain(), 'trycloudflare.com'];
  for (const h of (process.env.SITES_RESERVED_HOSTS ?? '').split(',')) {
    const t = h.trim().toLowerCase();
    if (t) roots.push(t);
  }
  return roots.filter(Boolean);
}

export function reservedExactHosts(): string[] {
  return [hostOf(env.FRONTEND_URL), hostOf(env.APP_URL), 'peopleitsms.vercel.app', 'localhost', '127.0.0.1'].filter(
    (h): h is string => Boolean(h),
  );
}

export function maxDomainsPerSite(): number {
  const n = Number(process.env.SITES_MAX_DOMAINS);
  return Number.isInteger(n) && n > 0 ? Math.min(n, 50) : 5;
}

/** A missing Sites table (migration not applied) becomes a clear 503. */
export function mapSitesError(error: unknown): unknown {
  if (isMissingSchemaError(error)) {
    return new AppError(`The website builder needs the database migration ${SITES_MIGRATION}, which has not been applied yet`, 503);
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return new AppError('That value is already in use', 409);
  }
  return error;
}
