// =============================================================================
// Sites — admin service: the site itself, pages, versions, templates, publish.
// =============================================================================

import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import * as repo from './sites.repository';
import {
  PageDataError,
  RESERVED_PAGE_SLUGS,
  RESERVED_SUBDOMAINS,
  defaultNavigation,
  defaultSettings,
  defaultTheme,
  emptyPuckData,
  normalizePuckData,
  sanitizeJson,
  subdomainFromSlug,
  uniqueSlug,
} from './sites.logic';
import { liveBaseUrl, pathPreviewUrl, platformSiteDomain } from './sites.config';
import { PREVIEW_TOKEN_TTL_SECONDS, signPreviewToken } from './sites.preview';
import { resolveDomainProvider } from './domains/provider';
import type {
  ApplyTemplateDtoType,
  CreatePageDtoType,
  PaginationDtoType,
  UpdatePageDtoType,
  UpdateSiteDtoType,
} from './sites.dto';

export interface SitesCtx {
  institutionId: string;
  userId: string;
  role: string;
}

const json = (v: unknown) => v as Prisma.InputJsonValue;

function puck(input: unknown) {
  try {
    return normalizePuckData(input);
  } catch (error) {
    if (error instanceof PageDataError) throw new ValidationError(error.message);
    throw error;
  }
}

function cleanJson(input: unknown) {
  try {
    return sanitizeJson(input);
  } catch (error) {
    if (error instanceof PageDataError) throw new ValidationError(error.message);
    throw error;
  }
}

function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Settings keys whose value is the site owner's own code, never run through sanitizeHtml (see sites.dto.ts). */
const RAW_CODE_SETTINGS_KEYS = ['customCss', 'headHtml', 'bodyEndHtml'] as const;

/**
 * Merges a settings patch over the stored settings the same way the rest of
 * this file does (cleanJson), except customCss/headHtml/bodyEndHtml — those
 * are validated (size-capped) by SettingsDto already, and sanitizeHtml would
 * strip the <script> tags a tracking snippet legitimately needs. The
 * boundary that keeps this safe is host-mode gating in the renderer, not
 * string scrubbing here (WEBSITE_V2_BRIEF.md §1).
 */
function mergeSettingsJson(current: Record<string, unknown>, patch: Record<string, unknown>) {
  const merged = { ...current, ...patch };
  const clean = cleanJson(merged) as Record<string, unknown>;
  for (const key of RAW_CODE_SETTINGS_KEYS) {
    if (key in merged) clean[key] = merged[key] ?? null;
  }
  return clean;
}

function withoutUndefined(o: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
}

function assertPageSlug(slug: string) {
  if (RESERVED_PAGE_SLUGS.has(slug)) throw new ValidationError(`"${slug}" is reserved; choose another slug`);
}

// ── Site ────────────────────────────────────────────────────────────────────

async function availableSubdomain(base: string): Promise<string> {
  const taken = (await repo.subdomainsStartingWith(base)).map((s) => s.subdomain);
  return uniqueSlug(base, taken);
}

/** Fields of the admission enquiry form every site starts with (maps onto AdmissionEnquiry). */
const DEFAULT_ENQUIRY_FIELDS = [
  { key: 'studentName', label: "Student's name", type: 'text', required: true },
  { key: 'guardianName', label: "Guardian's name", type: 'text', required: false },
  { key: 'phone', label: 'Phone', type: 'phone', required: true },
  { key: 'email', label: 'Email', type: 'email', required: false },
  { key: 'classInterested', label: 'Class interested in', type: 'text', required: false },
  { key: 'message', label: 'Message', type: 'textarea', required: false },
];

/**
 * Templates and the AI generator place EnquiryForm blocks without a form id;
 * they fall back to settings.defaultEnquiryFormId. Create that form once per
 * site (also backfills sites created before this existed).
 */
async function ensureDefaultEnquiryForm<T extends { id: string; institutionId: string; settings: Prisma.JsonValue }>(site: T): Promise<T> {
  const settings = (site.settings && typeof site.settings === 'object' ? site.settings : {}) as Record<string, unknown>;
  if (typeof settings.defaultEnquiryFormId === 'string' && settings.defaultEnquiryFormId) return site;
  const form = await prisma.siteForm.create({
    data: {
      siteId: site.id,
      institutionId: site.institutionId,
      name: 'Admission enquiry',
      fields: json(DEFAULT_ENQUIRY_FIELDS),
      target: 'ENQUIRY',
      notifyEmails: [],
    },
  });
  const nextSettings = { ...settings, defaultEnquiryFormId: form.id };
  await prisma.site.update({ where: { id: site.id }, data: { settings: json(nextSettings) } });
  return { ...site, settings: nextSettings as Prisma.JsonValue };
}

/** The tenant's site, created on first use with a home page and a default enquiry form. */
export async function getOrCreateSite(institutionId: string) {
  const existing = await repo.findSiteByInstitution(institutionId);
  if (existing) return ensureDefaultEnquiryForm(existing);
  return ensureDefaultEnquiryForm(await createSite(institutionId));
}

async function createSite(institutionId: string) {

  const institution = await prisma.institution.findUnique({
    where: { id: institutionId },
    select: { name: true, slug: true, logoUrl: true, defaultLanguage: true },
  });
  if (!institution) throw new NotFoundError('Institution not found');

  const subdomain = await availableSubdomain(subdomainFromSlug(institution.slug));
  try {
    return await prisma.$transaction(async (tx) => {
      const site = await tx.site.create({
        data: {
          institutionId,
          subdomain,
          theme: json(defaultTheme()),
          navigation: json(defaultNavigation()),
          settings: json(defaultSettings(institution)),
        },
      });
      await tx.sitePage.create({
        data: {
          siteId: site.id,
          institutionId,
          slug: '',
          title: 'Home',
          titleBn: 'হোম',
          seo: json({ title: institution.name }),
          draft: json(emptyPuckData()),
          isSystem: true,
          sortOrder: 0,
        },
      });
      logger.info('Site created', { institutionId, siteId: site.id, subdomain });
      return site;
    });
  } catch (error) {
    // Two first requests raced: the other one created it.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const site = await repo.findSiteByInstitution(institutionId);
      if (site) return site;
    }
    throw error;
  }
}

export async function getMe(ctx: SitesCtx) {
  const site = await getOrCreateSite(ctx.institutionId);
  const [pages, domains, primaryHost] = await Promise.all([
    repo.listPagesLight(ctx.institutionId, site.id),
    repo.listDomains(ctx.institutionId, site.id),
    repo.primaryActiveHost(site.id),
  ]);
  const previewToken = signPreviewToken(site.id, ctx.userId);
  const provider = resolveDomainProvider();
  return {
    site,
    pages,
    domains,
    platformDomain: platformSiteDomain() || null,
    previewUrl: `${pathPreviewUrl(site.subdomain)}?preview=${encodeURIComponent(previewToken)}`,
    previewToken,
    previewTokenExpiresIn: PREVIEW_TOKEN_TTL_SECONDS,
    liveUrl: liveBaseUrl(site.subdomain, primaryHost),
    domainProvider: { name: provider.provider.name, demo: provider.provider.demo, fallbackReason: provider.fallbackReason ?? null },
  };
}

export async function issuePreviewToken(ctx: SitesCtx) {
  const site = await getOrCreateSite(ctx.institutionId);
  const token = signPreviewToken(site.id, ctx.userId);
  return {
    token,
    expiresIn: PREVIEW_TOKEN_TTL_SECONDS,
    previewUrl: `${pathPreviewUrl(site.subdomain)}?preview=${encodeURIComponent(token)}`,
  };
}

export async function updateMe(ctx: SitesCtx, data: UpdateSiteDtoType) {
  const site = await getOrCreateSite(ctx.institutionId);
  const patch: Prisma.SiteUpdateInput = {};
  if (data.theme) patch.theme = json(cleanJson({ ...asObject(site.theme), ...withoutUndefined(data.theme) }));
  if (data.settings) patch.settings = json(mergeSettingsJson(asObject(site.settings), withoutUndefined(data.settings)));
  if (data.navigation) patch.navigation = json(cleanJson(data.navigation));
  if (data.templateKey !== undefined) patch.templateKey = data.templateKey;
  if (data.subdomain && data.subdomain !== site.subdomain) {
    if (RESERVED_SUBDOMAINS.has(data.subdomain)) throw new ValidationError(`"${data.subdomain}" is reserved`);
    const clash = await prisma.site.findUnique({ where: { subdomain: data.subdomain }, select: { id: true } });
    if (clash) throw new ConflictError('That subdomain is already taken');
    patch.subdomain = data.subdomain;
  }
  return prisma.site.update({ where: { id: site.id }, data: patch });
}

export async function applyTemplate(ctx: SitesCtx, data: ApplyTemplateDtoType) {
  const site = await getOrCreateSite(ctx.institutionId);

  const slugs = data.pages.map((p) => p.slug);
  const dup = slugs.find((s, i) => slugs.indexOf(s) !== i);
  if (dup !== undefined) throw new ValidationError(`Template has two pages with slug "${dup || '(home)'}"`);
  slugs.filter(Boolean).forEach(assertPageSlug);

  const incoming = data.pages.map((p) => ({ ...p, data: puck(p.data), seo: cleanJson(p.seo ?? {}) }));

  const summary = await prisma.$transaction(
    async (tx) => {
      const existing = await tx.sitePage.findMany({ where: { siteId: site.id, institutionId: ctx.institutionId } });
      const bySlug = new Map(existing.map((p) => [p.slug, p]));
      let maxOrder = existing.reduce((m, p) => Math.max(m, p.sortOrder), 0);
      const result = { created: 0, updated: 0, skipped: 0, removed: 0 };

      for (const [index, p] of incoming.entries()) {
        const current = bySlug.get(p.slug);
        if (current) {
          if (data.mode === 'merge') {
            result.skipped++;
            continue;
          }
          await repo.snapshotVersion(tx, current.id, json(current.draft), ctx.userId, `Before template "${data.templateKey}"`);
          await tx.sitePage.update({
            where: { id: current.id },
            data: { title: p.title, titleBn: p.titleBn ?? null, seo: json(p.seo), draft: json(p.data), sortOrder: index },
          });
          result.updated++;
        } else {
          await tx.sitePage.create({
            data: {
              siteId: site.id,
              institutionId: ctx.institutionId,
              slug: p.slug,
              title: p.title,
              titleBn: p.titleBn ?? null,
              seo: json(p.seo),
              draft: json(p.data),
              isSystem: p.slug === '',
              sortOrder: data.mode === 'replace' ? index : ++maxOrder,
            },
          });
          result.created++;
        }
      }

      if (data.mode === 'replace') {
        const keep = new Set(slugs);
        const stale = existing.filter((p) => !p.isSystem && !keep.has(p.slug)).map((p) => p.id);
        if (stale.length) {
          await tx.sitePage.deleteMany({ where: { id: { in: stale }, siteId: site.id } });
          result.removed = stale.length;
        }
      }

      const sitePatch: Prisma.SiteUpdateInput = { templateKey: data.templateKey };
      if (data.mode === 'replace') {
        if (data.theme) sitePatch.theme = json(cleanJson(data.theme));
        if (data.navigation) sitePatch.navigation = json(cleanJson(data.navigation));
      }
      await tx.site.update({ where: { id: site.id }, data: sitePatch });
      return result;
    },
    { timeout: 30_000 },
  );

  logger.info('Site template applied', { institutionId: ctx.institutionId, templateKey: data.templateKey, mode: data.mode, ...summary });
  const [freshSite, pages] = await Promise.all([
    prisma.site.findUniqueOrThrow({ where: { id: site.id } }),
    repo.listPagesLight(ctx.institutionId, site.id),
  ]);
  return { site: freshSite, pages, ...summary };
}

export async function publishSite(ctx: SitesCtx) {
  const site = await getOrCreateSite(ctx.institutionId);
  const now = new Date();
  const count = await prisma.$transaction(
    async (tx) => {
      const pages = await tx.sitePage.findMany({
        where: { siteId: site.id, institutionId: ctx.institutionId },
        select: { id: true, draft: true },
      });
      for (const page of pages) await repo.publishPageTx(tx, page, ctx.userId, 'Site published', now);
      await tx.site.update({ where: { id: site.id }, data: { status: 'PUBLISHED', publishedAt: now } });
      return pages.length;
    },
    { timeout: 60_000 },
  );
  logger.info('Site published', { institutionId: ctx.institutionId, siteId: site.id, pages: count });
  const primaryHost = await repo.primaryActiveHost(site.id);
  return {
    site: await prisma.site.findUniqueOrThrow({ where: { id: site.id } }),
    pagesPublished: count,
    liveUrl: liveBaseUrl(site.subdomain, primaryHost),
  };
}

export async function unpublishSite(ctx: SitesCtx) {
  const site = await getOrCreateSite(ctx.institutionId);
  return prisma.site.update({ where: { id: site.id }, data: { status: 'DRAFT' } });
}

// ── Pages ───────────────────────────────────────────────────────────────────

export async function listPages(ctx: SitesCtx, q: PaginationDtoType) {
  const site = await getOrCreateSite(ctx.institutionId);
  const [items, total] = await Promise.all([
    repo.listPagesLight(ctx.institutionId, site.id, (q.page - 1) * q.pageSize, q.pageSize),
    repo.countPages(ctx.institutionId, site.id),
  ]);
  return { items, total };
}

async function pageOrThrow(ctx: SitesCtx, id: string) {
  const page = await repo.findPage(ctx.institutionId, id);
  if (!page) throw new NotFoundError('Page not found');
  return page;
}

export function getPage(ctx: SitesCtx, id: string) {
  return pageOrThrow(ctx, id);
}

export async function createPage(ctx: SitesCtx, data: CreatePageDtoType) {
  const site = await getOrCreateSite(ctx.institutionId);
  assertPageSlug(data.slug);
  const clash = await prisma.sitePage.findUnique({ where: { siteId_slug: { siteId: site.id, slug: data.slug } }, select: { id: true } });
  if (clash) throw new ConflictError(`A page with slug "${data.slug}" already exists`);
  const last = await prisma.sitePage.aggregate({ where: { siteId: site.id }, _max: { sortOrder: true } });
  return prisma.sitePage.create({
    data: {
      siteId: site.id,
      institutionId: ctx.institutionId,
      slug: data.slug,
      title: data.title,
      titleBn: data.titleBn ?? null,
      seo: json(cleanJson(data.seo ?? {})),
      draft: json(puck(data.data)),
      sortOrder: (last._max.sortOrder ?? 0) + 1,
    },
  });
}

export async function updatePage(ctx: SitesCtx, id: string, data: UpdatePageDtoType) {
  const page = await pageOrThrow(ctx, id);
  const patch: Prisma.SitePageUpdateInput = {};

  if (data.slug !== undefined && data.slug !== page.slug) {
    if (page.isSystem) throw new ValidationError('The home page address cannot be changed');
    if (data.slug === '') throw new ValidationError('Only the home page can use the empty slug');
    assertPageSlug(data.slug);
    const clash = await prisma.sitePage.findUnique({ where: { siteId_slug: { siteId: page.siteId, slug: data.slug } }, select: { id: true } });
    if (clash) throw new ConflictError(`A page with slug "${data.slug}" already exists`);
    patch.slug = data.slug;
  }
  if (data.title !== undefined) patch.title = data.title;
  if (data.titleBn !== undefined) patch.titleBn = data.titleBn;
  if (data.seo !== undefined) patch.seo = json(cleanJson({ ...asObject(page.seo), ...withoutUndefined(data.seo) }));
  if (data.scheduledPublishAt !== undefined) {
    if (data.scheduledPublishAt && data.scheduledPublishAt.getTime() <= Date.now()) {
      throw new ValidationError('Scheduled publish time must be in the future');
    }
    patch.scheduledPublishAt = data.scheduledPublishAt;
  }
  const draft = data.draft !== undefined ? puck(data.draft) : undefined;
  if (draft) patch.draft = json(draft);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.sitePage.update({ where: { id: page.id }, data: patch });
    if (data.createVersion) {
      await repo.snapshotVersion(tx, page.id, json(updated.draft), ctx.userId, data.note ?? 'Checkpoint');
    }
    return updated;
  });
}

export async function deletePage(ctx: SitesCtx, id: string) {
  const page = await pageOrThrow(ctx, id);
  if (page.isSystem) throw new ForbiddenError('The home page cannot be deleted');
  await prisma.sitePage.delete({ where: { id: page.id } });
  return { id: page.id };
}

export async function publishPage(ctx: SitesCtx, id: string, note?: string | null) {
  const page = await pageOrThrow(ctx, id);
  await prisma.$transaction((tx) => repo.publishPageTx(tx, page, ctx.userId, note ?? 'Published'));
  return pageOrThrow(ctx, id);
}

export async function reorderPages(ctx: SitesCtx, ids: string[]) {
  const site = await getOrCreateSite(ctx.institutionId);
  if (new Set(ids).size !== ids.length) throw new ValidationError('Page ids must be unique');
  const owned = await prisma.sitePage.findMany({
    where: { id: { in: ids }, siteId: site.id, institutionId: ctx.institutionId },
    select: { id: true },
  });
  if (owned.length !== ids.length) throw new NotFoundError('One or more pages were not found');
  await prisma.$transaction(ids.map((pid, i) => prisma.sitePage.update({ where: { id: pid }, data: { sortOrder: i } })));
  return repo.listPagesLight(ctx.institutionId, site.id);
}

// ── Versions ────────────────────────────────────────────────────────────────

export async function listVersions(ctx: SitesCtx, pageId: string, q: PaginationDtoType) {
  const page = await pageOrThrow(ctx, pageId);
  const [rows, total] = await Promise.all([
    prisma.sitePageVersion.findMany({
      where: { pageId: page.id },
      select: { id: true, note: true, createdByUserId: true, createdAt: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.sitePageVersion.count({ where: { pageId: page.id } }),
  ]);
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.createdByUserId))] }, institutionId: ctx.institutionId },
    select: { id: true, firstName: true, lastName: true },
  });
  const names = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));
  return { items: rows.map((r) => ({ ...r, createdByName: names.get(r.createdByUserId) ?? null })), total };
}

export async function restoreVersion(ctx: SitesCtx, pageId: string, versionId: string) {
  const page = await pageOrThrow(ctx, pageId);
  const version = await prisma.sitePageVersion.findFirst({ where: { id: versionId, pageId: page.id } });
  if (!version) throw new NotFoundError('Version not found');
  return prisma.$transaction(async (tx) => {
    await repo.snapshotVersion(tx, page.id, json(page.draft), ctx.userId, 'Before restore');
    return tx.sitePage.update({ where: { id: page.id }, data: { draft: json(version.data) } });
  });
}

// ── Scheduled publish (in-process job) ──────────────────────────────────────

/** Publishes every page whose scheduledPublishAt has passed. Returns the count. */
export async function runScheduledPublishes(systemUserId: string, now = new Date()): Promise<number> {
  const due = await prisma.sitePage.findMany({
    where: { scheduledPublishAt: { lte: now } },
    select: { id: true, draft: true, institutionId: true },
    take: 100,
  });
  let done = 0;
  for (const page of due) {
    try {
      await prisma.$transaction((tx) => repo.publishPageTx(tx, page, systemUserId, 'Scheduled publish', now));
      done++;
    } catch (error) {
      logger.error('Sites: scheduled publish failed', { pageId: page.id, error: (error as Error).message });
      // Clear the schedule so a broken page is not retried every minute.
      await prisma.sitePage
        .update({ where: { id: page.id }, data: { scheduledPublishAt: null } })
        .catch(() => undefined);
    }
  }
  if (done) logger.info('Sites: scheduled pages published', { count: done });
  return done;
}

export function assertTenant(tenantId: string | undefined): string {
  if (!tenantId) throw new AppError('Select an institution first', 400);
  return tenantId;
}
