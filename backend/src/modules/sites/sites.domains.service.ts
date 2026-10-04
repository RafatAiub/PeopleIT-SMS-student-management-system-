// =============================================================================
// Sites — custom domains: add, verify, primary, remove, and the periodic
// re-check used by the in-process job.
// =============================================================================

import crypto from 'crypto';
import { SiteDomain } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import { getOrCreateSite, type SitesCtx } from './sites.service';
import { maxDomainsPerSite, reservedExactHosts, reservedHostRoots } from './sites.config';
import { HOSTNAME_PROBLEM_MESSAGE, hostnameProblem, isPlatformHostname, looksLikeApex, normalizeHostname } from './domains/hostname';
import { checkDns, dnsInstructions, type DnsRecordInstruction } from './domains/dns';
import { DomainProviderError, apexIps, providerFor, resolveDomainProvider } from './domains/provider';
import { decideDomainStatus } from './domains/decide';

const SSL_NOTICE_DEMO =
  'Manual/demo mode: DNS is verified here, but no hosting provider is connected, so SSL (https) for this domain must be set up by the platform operator.';

function recordsFor(domain: Pick<SiteDomain, 'hostname' | 'verificationToken' | 'provider'>): DnsRecordInstruction[] {
  const provider = providerFor(domain.provider);
  return dnsInstructions(domain.hostname, {
    cnameTarget: provider.cnameTarget(),
    token: domain.verificationToken,
    apexIps: apexIps(),
    apex: looksLikeApex(domain.hostname),
  });
}

function present(domain: SiteDomain, extra: DnsRecordInstruction[] = []) {
  return {
    ...domain,
    records: [...recordsFor(domain), ...extra],
    sslNotice: domain.isDemo ? SSL_NOTICE_DEMO : null,
  };
}

export async function listDomains(ctx: SitesCtx) {
  const site = await getOrCreateSite(ctx.institutionId);
  const items = await prisma.siteDomain.findMany({
    where: { siteId: site.id, institutionId: ctx.institutionId },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
  });
  const p = resolveDomainProvider();
  return {
    items: items.map((d) => present(d)),
    total: items.length,
    provider: { name: p.provider.name, demo: p.provider.demo, fallbackReason: p.fallbackReason ?? null },
  };
}

export async function addDomain(ctx: SitesCtx, rawHostname: string) {
  const site = await getOrCreateSite(ctx.institutionId);
  const hostname = normalizeHostname(rawHostname);
  const problem = hostnameProblem(hostname);
  if (problem) throw new ValidationError(HOSTNAME_PROBLEM_MESSAGE[problem]);
  if (isPlatformHostname(hostname, reservedHostRoots(), reservedExactHosts())) {
    throw new ValidationError('That is one of the platform’s own addresses. Your free subdomain is already connected; add a domain you own.');
  }
  const existing = await prisma.siteDomain.findUnique({ where: { hostname }, select: { id: true } });
  if (existing) throw new ConflictError('That domain is already connected to a website');
  const count = await prisma.siteDomain.count({ where: { siteId: site.id } });
  if (count >= maxDomainsPerSite()) throw new ValidationError(`A site can have at most ${maxDomainsPerSite()} custom domains`);

  const { provider, fallbackReason } = resolveDomainProvider();
  let added;
  try {
    added = await provider.add(hostname);
  } catch (error) {
    if (error instanceof DomainProviderError) throw new AppError(`Domain provider (${provider.name}): ${error.message}`, 502);
    throw error;
  }

  const domain = await prisma.siteDomain.create({
    data: {
      siteId: site.id,
      institutionId: ctx.institutionId,
      hostname,
      verificationToken: crypto.randomBytes(16).toString('hex'),
      provider: provider.name,
      providerRef: added.providerRef,
      isDemo: provider.demo,
      status: 'PENDING_DNS',
    },
  });
  logger.info('Site domain added', { institutionId: ctx.institutionId, hostname, provider: provider.name });
  return {
    domain: present(domain, added.records),
    demo: provider.demo,
    provider: { name: provider.name, demo: provider.demo, fallbackReason: fallbackReason ?? null },
  };
}

/** Runs DNS + provider checks and stores the outcome. Shared by verify and the job. */
export async function checkDomain(domain: SiteDomain, manualCheck: boolean) {
  const provider = providerFor(domain.provider);
  const dns = await checkDns(domain.hostname, {
    cnameTarget: provider.cnameTarget(),
    token: domain.verificationToken,
    apexIps: apexIps(),
  });
  let providerStatus = null;
  let providerError: string | null = null;
  try {
    providerStatus = await provider.status(domain.hostname, domain.providerRef);
  } catch (error) {
    providerError = error instanceof DomainProviderError ? `Domain provider: ${error.message}` : 'Domain provider check failed';
  }
  const decided = decideDomainStatus({
    dnsOk: dns.ok,
    dnsDetail: dns.detail,
    provider: providerStatus,
    providerError,
    createdAt: domain.createdAt,
    now: new Date(),
    manualCheck,
  });

  const updated = await prisma.$transaction(async (tx) => {
    let makePrimary = false;
    if (decided.status === 'ACTIVE' && !domain.isPrimary) {
      const hasPrimary = await tx.siteDomain.count({ where: { siteId: domain.siteId, isPrimary: true, status: 'ACTIVE' } });
      makePrimary = hasPrimary === 0;
      if (makePrimary) await tx.siteDomain.updateMany({ where: { siteId: domain.siteId }, data: { isPrimary: false } });
    }
    return tx.siteDomain.update({
      where: { id: domain.id },
      data: {
        status: decided.status,
        error: decided.error,
        lastCheckedAt: new Date(),
        isDemo: provider.demo,
        ...(makePrimary ? { isPrimary: true } : {}),
      },
    });
  });
  return { domain: updated, dns: { ok: dns.ok, method: dns.method, detail: dns.detail }, providerRecords: providerStatus?.records ?? [] };
}

async function domainOrThrow(ctx: SitesCtx, id: string) {
  const domain = await prisma.siteDomain.findFirst({ where: { id, institutionId: ctx.institutionId } });
  if (!domain) throw new NotFoundError('Domain not found');
  return domain;
}

export async function verifyDomain(ctx: SitesCtx, id: string) {
  const domain = await domainOrThrow(ctx, id);
  const result = await checkDomain(domain, true);
  return { domain: present(result.domain, result.providerRecords), dns: result.dns, demo: result.domain.isDemo };
}

export async function setPrimaryDomain(ctx: SitesCtx, id: string) {
  const domain = await domainOrThrow(ctx, id);
  if (domain.status !== 'ACTIVE') throw new ValidationError('Only an active (verified) domain can be the primary domain');
  await prisma.$transaction([
    prisma.siteDomain.updateMany({ where: { siteId: domain.siteId, institutionId: ctx.institutionId }, data: { isPrimary: false } }),
    prisma.siteDomain.update({ where: { id: domain.id }, data: { isPrimary: true } }),
  ]);
  return present(await prisma.siteDomain.findUniqueOrThrow({ where: { id: domain.id } }));
}

export async function removeDomain(ctx: SitesCtx, id: string) {
  const domain = await domainOrThrow(ctx, id);
  try {
    await providerFor(domain.provider).remove(domain.hostname, domain.providerRef);
  } catch (error) {
    // Still remove it here; the operator can clean up the provider side.
    logger.warn('Sites: provider could not remove domain', { hostname: domain.hostname, error: (error as Error).message });
  }
  await prisma.siteDomain.delete({ where: { id: domain.id } });
  return { id: domain.id };
}

/** Job: re-check every PENDING_DNS / VERIFYING domain. */
export async function recheckPendingDomains(): Promise<number> {
  const pending = await prisma.siteDomain.findMany({
    where: { status: { in: ['PENDING_DNS', 'VERIFYING'] } },
    orderBy: { lastCheckedAt: { sort: 'asc', nulls: 'first' } },
    take: 200,
  });
  for (const d of pending) {
    try {
      await checkDomain(d, false);
    } catch (error) {
      logger.warn('Sites: domain re-check failed', { hostname: d.hostname, error: (error as Error).message });
    }
  }
  return pending.length;
}
