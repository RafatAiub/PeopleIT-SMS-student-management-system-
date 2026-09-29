// =============================================================================
// Sites repository — Prisma access for the admin side. Every function takes
// the tenant's institutionId and filters by it.
// =============================================================================

import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { MAX_VERSIONS_PER_PAGE, versionsToPrune } from './sites.logic';

type Tx = Prisma.TransactionClient;

/** Page list columns (no Puck payloads). */
export const PAGE_LIST_SELECT = {
  id: true,
  slug: true,
  title: true,
  titleBn: true,
  seo: true,
  sortOrder: true,
  isSystem: true,
  publishedAt: true,
  scheduledPublishAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.SitePageSelect;

export function findSiteByInstitution(institutionId: string) {
  return prisma.site.findUnique({ where: { institutionId } });
}

export function subdomainsStartingWith(prefix: string) {
  return prisma.site.findMany({ where: { subdomain: { startsWith: prefix } }, select: { subdomain: true } });
}

export function listPagesLight(institutionId: string, siteId: string, skip = 0, take = 100) {
  return prisma.sitePage.findMany({
    where: { institutionId, siteId },
    select: PAGE_LIST_SELECT,
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    skip,
    take,
  });
}

export function countPages(institutionId: string, siteId: string) {
  return prisma.sitePage.count({ where: { institutionId, siteId } });
}

export function findPage(institutionId: string, id: string) {
  return prisma.sitePage.findFirst({ where: { id, institutionId } });
}

export function listDomains(institutionId: string, siteId: string) {
  return prisma.siteDomain.findMany({
    where: { institutionId, siteId },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
  });
}

export function findDomain(institutionId: string, id: string) {
  return prisma.siteDomain.findFirst({ where: { id, institutionId } });
}

export async function primaryActiveHost(siteId: string): Promise<string | null> {
  const d = await prisma.siteDomain.findFirst({
    where: { siteId, status: 'ACTIVE' },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    select: { hostname: true },
  });
  return d?.hostname ?? null;
}

/**
 * Stores a version snapshot and prunes the page back to the newest
 * MAX_VERSIONS_PER_PAGE. Runs inside the caller's transaction when given one.
 */
export async function snapshotVersion(
  db: Tx | typeof prisma,
  pageId: string,
  data: Prisma.InputJsonValue,
  userId: string,
  note: string | null,
) {
  const version = await db.sitePageVersion.create({
    data: { pageId, data, createdByUserId: userId, note },
    select: { id: true, createdAt: true },
  });
  await pruneVersions(db, pageId);
  return version;
}

export async function pruneVersions(db: Tx | typeof prisma, pageId: string, keep = MAX_VERSIONS_PER_PAGE) {
  const all = await db.sitePageVersion.findMany({ where: { pageId }, select: { id: true, createdAt: true } });
  const ids = versionsToPrune(all, keep);
  if (ids.length) await db.sitePageVersion.deleteMany({ where: { id: { in: ids }, pageId } });
  return ids.length;
}

/** Copies draft → published for one page and snapshots it. */
export async function publishPageTx(
  tx: Tx,
  page: { id: string; draft: Prisma.JsonValue },
  userId: string,
  note: string | null,
  now = new Date(),
) {
  const data = (page.draft ?? { root: { props: {} }, content: [] }) as Prisma.InputJsonValue;
  await tx.sitePage.update({
    where: { id: page.id },
    data: { published: data, publishedAt: now, scheduledPublishAt: null },
  });
  await snapshotVersion(tx, page.id, data, userId, note);
}
